import type { Candidate } from './candidate.ts'
import { getJson } from './http.ts'

const API = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** CVSS 9.0 and up is critical in every CVSS version. */
const CRITICAL = 9

interface Cpe {
  criteria: string
  vulnerable: boolean
  versionStartIncluding?: string
  versionEndExcluding?: string
  versionEndIncluding?: string
}
interface Raw {
  cve: {
    id: string
    published: string
    descriptions: { lang: string; value: string }[]
    metrics?: Record<string, { cvssData: { baseScore: number } }[]>
    weaknesses?: { description: { value: string }[] }[]
    configurations?: { nodes: { cpeMatch?: Cpe[] }[] }[]
  }
}

/**
 * The highest score of any CVSS version and any scorer. NVD's own (Primary) score often comes long
 * after the assigner's (Secondary) one, and it is not always listed first.
 */
const score = (m: Raw['cve']['metrics']): number | undefined => {
  const all = ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30']
    .flatMap(k => m?.[k] ?? [])
    .map(x => x.cvssData.baseScore)
    .filter((s): s is number => typeof s === 'number')
  return all.length ? Math.max(...all) : undefined
}

const range = (c: Cpe): string => {
  const { versionStartIncluding: a, versionEndExcluding: b, versionEndIncluding: z } = c
  if (a && b) return `${a} < ${b}`
  if (a && z) return `${a} – ${z}`
  if (b) return `< ${b}`
  if (z) return `≤ ${z}`
  if (a) return `≥ ${a}`
  const v = c.criteria.split(':')[5]
  return v && v !== '*' && v !== '-' ? v : ''
}

export function toCandidate(r: Raw): Candidate {
  const c = r.cve
  const desc = c.descriptions.find(d => d.lang === 'en')?.value.replace(/\s+/g, ' ') ?? ''
  const cpes = (c.configurations ?? [])
    .flatMap(cf => cf.nodes.flatMap(n => n.cpeMatch ?? []))
    .filter(m => m.vulnerable)
  const first = cpes[0]?.criteria.split(':')
  const ranges = [...new Set(cpes.map(range).filter(Boolean))]
  return {
    id: c.id,
    source: 'nvd',
    title: desc.split(/(?<=\.)\s/)[0]?.slice(0, 140),
    summary: desc.slice(0, 400),
    cvss: score(c.metrics),
    published: c.published.slice(0, 10),
    product: first ? `${first[3]} ${first[4]}`.replace(/_/g, ' ') : undefined,
    affected: ranges.slice(0, 6).join(', ') || undefined,
    cwes: (c.weaknesses ?? []).flatMap(w => w.description.map(d => d.value)),
  }
}

const headers = (key?: string): Record<string, string> => (key ? { apikey: key } : {})
/** NVD allows 5 requests per 30 s without a key, 50 with one. */
const gap = (key?: string) => (key ? 700 : 6500)
/**
 * NVD answers 403 as well as 429 when it rate-limits. Its window is 30 s, so back off from 10 s
 * (10, 20, 40, then the 60 s ceiling).
 */
const retry = { retries: 4, retryOn: [403], backoffMs: 10_000 }

interface Page {
  totalResults: number
  vulnerabilities: Raw[]
}
interface Deps {
  getPage?: (url: string) => Promise<Page>
  gapMs?: number
}

/**
 * Critical CVEs published between `from` and `to`, by any scorer, highest score then newest first.
 * NVD's `cvssV3Severity` filter only reads NVD's own score, so it misses every CVE that only its
 * assigner has scored yet (CVE-2026-99362 was one). So read the whole window and filter here.
 */
export async function fetchNvdCritical(
  key: string | undefined,
  from: Date,
  to: Date,
  cap: number,
  {
    getPage = url => getJson<Page>(url, { headers: headers(key), ...retry }),
    gapMs = gap(key),
  }: Deps = {},
): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (let start = 0; ;) {
    const q = new URLSearchParams({
      pubStartDate: from.toISOString(),
      pubEndDate: to.toISOString(),
      resultsPerPage: '2000',
      startIndex: String(start),
    })
    const page = await getPage(`${API}?${q}`)
    for (const r of page.vulnerabilities) {
      const c = toCandidate(r)
      if ((c.cvss ?? 0) >= CRITICAL) out.push(c)
    }
    start += page.vulnerabilities.length
    if (!page.vulnerabilities.length || start >= page.totalResults) break
    await sleep(gapMs)
  }
  const byRank = (a: Candidate, b: Candidate) =>
    (b.cvss ?? 0) - (a.cvss ?? 0) ||
    (b.published ?? '').localeCompare(a.published ?? '') ||
    a.id.localeCompare(b.id)
  return out.sort(byRank).slice(0, cap)
}

/** One CVE by id, for a score the other Sources did not carry. */
export async function fetchNvdById(key: string | undefined, id: string): Promise<Candidate | null> {
  await sleep(gap(key))
  const r = await getJson<{ vulnerabilities: Raw[] }>(`${API}?cveId=${encodeURIComponent(id)}`, {
    headers: headers(key),
    ...retry,
  })
  return r.vulnerabilities[0] ? toCandidate(r.vulnerabilities[0]) : null
}
