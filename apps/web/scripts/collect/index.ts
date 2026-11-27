/**
 * The Sweep: collects every Source, merges the result into Threats and Field reports, and writes
 * public/data/*.json and public/feed.xml. One Source failing never empties the data: what the
 * previous Sweep knew about that Source is carried over, and the failure shows on the Sources page.
 *
 * Env: GITHUB_TOKEN and NVD_API_KEY (both optional, they raise rate limits), PREVIOUS_BASE (where the
 * last published data lives, default the deployed site), SWEEP_OUT (output directory).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import type {
  Advisory,
  Dataset,
  FieldReport,
  SourceStatus,
  SweepStatus,
  Threat,
} from '../../src/lib/types.ts'
import { NO_PRODUCT } from '../../src/lib/types.ts'
import type { Candidate } from './candidate.ts'
import { fetchCveOrgProducts } from './cveorg.ts'
import * as C from './config.ts'
import { ADVISORY_FEEDS, REPORT_FEEDS, fetchAdvisories, fetchReports } from './feeds.ts'
import { getJson } from './http.ts'
import { fetchGhsa } from './ghsa.ts'
import { fetchKev, type KevEntry } from './kev.ts'
import { mergeThreat, type Override } from './merge.ts'
import { fetchNvdById, fetchNvdCritical } from './nvd.ts'
import { buildFeed } from './rss.ts'
import overrides from '../../data/overrides.json' with { type: 'json' }

const day = 86_400_000
const now = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)
const cutoff = iso(new Date(now.getTime() - C.WINDOW_DAYS * day))
const out = new URL(process.env.SWEEP_OUT ?? '../../public/', import.meta.url)
const status: SourceStatus[] = []
const log = (m: string) => console.log(`[sweep] ${m}`)

async function run<T>(
  id: string,
  fn: () => Promise<T>,
  count: (r: T) => number,
): Promise<T | null> {
  try {
    const r = await fn()
    status.push({ id, ok: true, count: count(r) })
    log(`${id}: ok (${count(r)})`)
    return r
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    status.push({ id, ok: false, count: 0, error })
    log(`${id}: FAILED ${error}`)
    return null
  }
}

async function previous<T>(name: string): Promise<Dataset<T> | null> {
  try {
    const d = await getJson<Dataset<T>>(
      `${process.env.PREVIOUS_BASE ?? C.SITE}/data/${name}.json`,
      { retries: 0, timeoutMs: 15_000 },
    )
    return d.sample ? null : d
  } catch {
    return null
  }
}

const prevThreats = (await previous<Threat>('threats'))?.items ?? []
const prevReports = (await previous<FieldReport>('reports'))?.items ?? []
const prevById = new Map(prevThreats.map(t => [t.id, t]))
log(`previous Sweep: ${prevThreats.length} threats, ${prevReports.length} reports`)

// ---- Threat sources -------------------------------------------------------
const kev = await run('cisa-kev', fetchKev, r => r.length)
const kevById = new Map<string, KevEntry>()
if (kev) kev.forEach(k => kevById.set(k.id, k))
else
  for (const t of prevThreats.filter(t => t.exploited))
    kevById.set(t.id, {
      id: t.id,
      name: t.title,
      vendor: '',
      product: t.pkg,
      summary: t.summary,
      action: t.kevAction ?? '',
      dateAdded: t.published,
    })

const ghsa = await run(
  'ghsa',
  () => fetchGhsa(process.env.GITHUB_TOKEN, cutoff),
  r => r.length,
)
const nvd = await run(
  'nvd',
  () =>
    fetchNvdCritical(
      process.env.NVD_API_KEY,
      new Date(now.getTime() - C.NVD_CRITICAL_DAYS * day),
      now,
      C.NVD_CAP,
    ),
  r => r.length,
)

const cands = new Map<string, Candidate[]>()
const add = (c: Candidate) => cands.set(c.id, [...(cands.get(c.id) ?? []), c])
ghsa?.forEach(add)
nvd?.forEach(add)
for (const k of kev ?? [])
  if (k.dateAdded >= cutoff || prevById.has(k.id))
    add({
      id: k.id,
      source: 'cisa-kev',
      title: k.name,
      summary: k.summary,
      product: `${k.vendor} ${k.product}`.trim(),
      published: k.dateAdded,
    })

// Scores: reuse the last Sweep's, then ask NVD for a limited number of the rest.
let lookups = 0
for (const [id, list] of cands) {
  if (list.some(c => typeof c.cvss === 'number')) continue
  const before = prevById.get(id)
  if (before) add({ id, source: 'previous', cvss: before.cvss })
  else if (lookups < C.NVD_LOOKUP_CAP && id.startsWith('CVE-')) {
    lookups++
    try {
      const c = await fetchNvdById(process.env.NVD_API_KEY, id)
      if (c) add(c)
    } catch (err) {
      log(`nvd lookup ${id}: ${err instanceof Error ? err.message : err}`)
    }
  }
}
log(`nvd lookups: ${lookups}`)

// Products: when no Source names one, reuse the last Sweep's, then ask CVE.org (the assigner's record).
const named = (id: string, list: Candidate[]) => {
  const o = (overrides as Record<string, Override>)[id]
  return !!(o?.pkg || o?.product || kevById.has(id) || list.some(c => c.pkg || c.product))
}
const unnamed: string[] = []
for (const [id, list] of cands) {
  if (named(id, list)) continue
  const before = prevById.get(id)
  if (before && before.pkg !== NO_PRODUCT)
    add({
      id,
      source: 'cve-org',
      eco: before.eco ?? undefined,
      pkg: before.pkg,
      product: before.eco ? undefined : before.product,
    })
  else if (id.startsWith('CVE-')) unnamed.push(id)
}
log(
  `cve-org: ${unnamed.length} to look up, ${unnamed.length > C.CVE_ORG_LOOKUP_CAP ? `capped at ${C.CVE_ORG_LOOKUP_CAP}` : 'no cap hit'}`,
)
const cveOrg = await run(
  'cve-org',
  () => fetchCveOrgProducts(unnamed.slice(0, C.CVE_ORG_LOOKUP_CAP), { log }),
  r => r.length,
)
cveOrg?.forEach(add)

// ---- Advisory feeds -------------------------------------------------------
const advisories = new Map<string, Advisory[]>()
for (const feed of ADVISORY_FEEDS) {
  const found = await run(
    feed.id,
    () => fetchAdvisories(feed),
    r => r.size,
  )
  if (found)
    for (const [cve, list] of found) advisories.set(cve, [...(advisories.get(cve) ?? []), ...list])
  else
    for (const t of prevThreats)
      for (const a of t.advisories ?? [])
        if (a.source === feed.id) advisories.set(t.id, [...(advisories.get(t.id) ?? []), a])
}

// ---- Merge ----------------------------------------------------------------
const failed = new Set(status.filter(s => !s.ok).map(s => s.id))
const threats: Threat[] = []
for (const [id, list] of cands) {
  const t = mergeThreat(
    id,
    list,
    kevById.get(id),
    (overrides as Record<string, Override>)[id],
    advisories.get(id),
  )
  if (t && (t.exploited || t.published >= cutoff)) threats.push(t)
}
const have = new Set(threats.map(t => t.id))
for (const t of prevThreats)
  if (!have.has(t.id) && (t.sources ?? []).some(s => failed.has(s))) threats.push(t)
threats.sort((a, b) => b.published.localeCompare(a.published) || b.cvss - a.cvss)

// ---- Field reports --------------------------------------------------------
const since = iso(new Date(now.getTime() - C.REPORT_DAYS * day))
const reports: FieldReport[] = []
for (const feed of REPORT_FEEDS) {
  const r = await run(
    feed.id,
    () => fetchReports(feed, since, C.REPORTS_PER_LAB),
    r => r.length,
  )
  reports.push(...(r ?? prevReports.filter(p => p.key === feed.id)))
}
reports.sort((a, b) => b.date.localeCompare(a.date))

// ---- Write ----------------------------------------------------------------
const collectedAt = now.toISOString()
const body = JSON.stringify({
  sample: false,
  collectedAt,
  items: threats,
} satisfies Dataset<Threat>)
const gz = gzipSync(body).length
log(
  `${threats.length} threats, ${reports.length} reports, threats.json ${(gz / 1024).toFixed(0)} KiB gzipped`,
)
if (gz > C.SIZE_BUDGET_GZ)
  throw new Error(
    `threats.json is ${gz} bytes gzipped, over the ${C.SIZE_BUDGET_GZ} budget: narrow the window in config.ts`,
  )
if (!threats.length)
  throw new Error('A Sweep with no threats at all means something is wrong: not publishing it')

mkdirSync(new URL('data/', out), { recursive: true })
writeFileSync(new URL('data/threats.json', out), body)
writeFileSync(
  new URL('data/reports.json', out),
  JSON.stringify({ sample: false, collectedAt, items: reports } satisfies Dataset<FieldReport>),
)
writeFileSync(
  new URL('data/status.json', out),
  JSON.stringify({ collectedAt, sources: status } satisfies SweepStatus),
)
writeFileSync(new URL('feed.xml', out), buildFeed(threats, C.SITE, now))
