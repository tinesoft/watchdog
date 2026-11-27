import {
  NO_PRODUCT,
  type Advisory,
  type Category,
  type Threat,
  type ThreatType,
} from '../../src/lib/types.ts'
import type { Candidate } from './candidate.ts'
import { categoryOf, severityOf, threatTypeOf } from './enrich.ts'
import type { KevEntry } from './kev.ts'

export type Override = Partial<
  Pick<Threat, 'title' | 'summary' | 'eco' | 'pkg' | 'affected' | 'fixed' | 'product'>
> & {
  category?: Category
  threat?: ThreatType
}

const first = <T>(...v: (T | undefined | null | '')[]): T | undefined =>
  v.find(x => x !== undefined && x !== null && x !== '') as T | undefined
const SOURCE_RANK = ['ghsa', 'nvd']
const byRank = (a: Candidate, b: Candidate) =>
  SOURCE_RANK.indexOf(a.source) - SOURCE_RANK.indexOf(b.source)

/**
 * Merges every Source's candidate for a CVE into one Threat. Returns null when no Source gave a score:
 * a Threat with no CVSS cannot be ranked, so it waits for a later Sweep.
 */
export function mergeThreat(
  id: string,
  cands: Candidate[],
  kev: KevEntry | undefined,
  override: Override | undefined,
  advisories: Advisory[] = [],
): Threat | null {
  const cs = [...cands].sort((a, b) => {
    const ra = SOURCE_RANK.indexOf(a.source) < 0 ? 99 : SOURCE_RANK.indexOf(a.source)
    const rb = SOURCE_RANK.indexOf(b.source) < 0 ? 99 : SOURCE_RANK.indexOf(b.source)
    return ra - rb || byRank(a, b)
  })
  const pick = <K extends keyof Candidate>(k: K) => first(...cs.map(c => c[k]))
  const scores = cs.map(c => c.cvss).filter((n): n is number => typeof n === 'number')
  if (!scores.length) return null
  const cvss = Math.max(...scores)
  const eco = override?.eco ?? pick('eco')
  const pkg =
    override?.pkg ??
    pick('pkg') ??
    (kev ? `${kev.vendor} ${kev.product}`.trim() : undefined) ??
    pick('product') ??
    NO_PRODUCT
  const title = override?.title ?? first(pick('title'), kev?.name) ?? id
  const summary = override?.summary ?? first(pick('summary'), kev?.summary) ?? ''
  const product =
    override?.product ??
    (eco
      ? `${eco} · ${pkg}`
      : (first(pick('product'), kev ? `${kev.vendor} ${kev.product}` : undefined) ?? pkg))
  const text = `${title} ${summary} ${product}`
  const cwes = cs.flatMap(c => c.cwes ?? [])
  const published =
    cs
      .map(c => c.published)
      .filter(Boolean)
      .sort()[0] ??
    kev?.dateAdded ??
    ''
  return {
    id,
    title,
    summary,
    cvss,
    severity: severityOf(cvss),
    published,
    product,
    exploited: !!kev,
    category: override?.category ?? categoryOf(text, eco, pkg),
    threat: override?.threat ?? threatTypeOf(text, cwes),
    eco: eco ?? null,
    pkg,
    affected: override?.affected ?? pick('affected') ?? null,
    fixed: override?.fixed ?? pick('fixed') ?? null,
    kevAction: kev?.action ?? null,
    sources: [...new Set([...cs.map(c => c.source), ...(kev ? ['cisa-kev'] : [])])],
    ...(advisories.length ? { advisories } : {}),
  }
}
