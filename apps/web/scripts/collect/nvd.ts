import type { Candidate } from './candidate.ts'
import { getJson } from './http.ts'

const API = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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

const score = (m: Raw['cve']['metrics']): number | undefined => {
  for (const k of ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30']) {
    const s = m?.[k]?.[0]?.cvssData.baseScore
    if (typeof s === 'number') return s
  }
  return undefined
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

/** Critical CVEs published since `from`. */
export async function fetchNvdCritical(
  key: string | undefined,
  from: Date,
  to: Date,
  cap: number,
): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (let start = 0; out.length < cap;) {
    const q = new URLSearchParams({
      pubStartDate: from.toISOString(),
      pubEndDate: to.toISOString(),
      cvssV3Severity: 'CRITICAL',
      resultsPerPage: '500',
      startIndex: String(start),
    })
    const page = await getJson<{ totalResults: number; vulnerabilities: Raw[] }>(`${API}?${q}`, {
      headers: headers(key),
      retries: 3,
    })
    out.push(...page.vulnerabilities.map(toCandidate))
    start += page.vulnerabilities.length
    if (!page.vulnerabilities.length || start >= page.totalResults) break
    await sleep(gap(key))
  }
  return out.slice(0, cap)
}

/** One CVE by id, for a score the other Sources did not carry. */
export async function fetchNvdById(key: string | undefined, id: string): Promise<Candidate | null> {
  await sleep(gap(key))
  const r = await getJson<{ vulnerabilities: Raw[] }>(`${API}?cveId=${encodeURIComponent(id)}`, {
    headers: headers(key),
    retries: 3,
  })
  return r.vulnerabilities[0] ? toCandidate(r.vulnerabilities[0]) : null
}
