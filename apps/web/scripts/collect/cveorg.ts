import type { Candidate } from './candidate.ts'
import { get } from './http.ts'

const API = 'https://cveawg.mitre.org/api/cve/'

interface Affected {
  vendor?: string
  product?: string
  packageName?: string
  collectionURL?: string
}
export interface CveRecord {
  cveMetadata?: { cveId?: string }
  containers?: { cna?: { affected?: Affected[] } }
}

/** Package registries whose `collectionURL` gives a Threat an ecosystem that Scan and fix commands know. */
const REGISTRIES: [RegExp, string][] = [
  [/registry\.npmjs\.org|npmjs\.com/, 'npm'],
  [/pypi\.org/, 'PyPI'],
  [/repo\.maven\.apache\.org|repo1\.maven\.org|central\.sonatype/, 'Maven'],
  [/proxy\.golang\.org|pkg\.go\.dev/, 'Go'],
  [/crates\.io/, 'crates.io'],
  [/rubygems\.org/, 'RubyGems'],
  [/packagist\.org/, 'Packagist'],
]

const usable = (s?: string) => {
  const v = s?.trim()
  return v && !/^(n\/?a|unknown|unspecified|-)$/i.test(v) ? v : undefined
}

/** The assigner's own product for a CVE: the first usable `affected` entry of its record. */
export function productOf(r: CveRecord): Pick<Candidate, 'product' | 'eco' | 'pkg'> | null {
  for (const a of r.containers?.cna?.affected ?? []) {
    const vendor = usable(a.vendor)
    // Some assigners (CPANSec) name only the package.
    const product = usable(a.product) ?? usable(a.packageName)
    const name = usable(a.packageName) ?? product
    const eco = a.collectionURL
      ? REGISTRIES.find(([re]) => re.test(a.collectionURL!))?.[1]
      : undefined
    if (eco && name) return { eco, pkg: name }
    if (!product && !vendor) continue
    const words =
      vendor && product && vendor.toLowerCase() !== product.toLowerCase()
        ? `${vendor} ${product}`
        : (product ?? vendor)!
    return { product: words }
  }
  return null
}

/** One CVE record from CVE.org, as a Candidate that carries only a product. Null when it has none. */
export async function fetchCveOrg(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Candidate | null> {
  let res: Response
  try {
    res = await get(`${API}${encodeURIComponent(id)}`, {
      fetchImpl,
      timeoutMs: 20_000,
      headers: { accept: 'application/json' },
    })
  } catch (err) {
    // A CVE that CVE.org does not know (rejected, reserved) is not a failure of the Source.
    if (err instanceof Error && / answered 404$/.test(err.message)) return null
    throw err
  }
  const p = productOf((await res.json()) as CveRecord)
  return p ? { id, source: 'cve-org', ...p } : null
}

/**
 * Looks up `ids` with at most `concurrency` requests in flight. A lookup that fails is logged and
 * skipped; the run fails only when every lookup failed.
 */
export async function fetchCveOrgProducts(
  ids: string[],
  { concurrency = 8, log = (() => {}) as (m: string) => void, fetchImpl = fetch } = {},
): Promise<Candidate[]> {
  const out: Candidate[] = []
  let next = 0
  let failed = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]!
      try {
        const c = await fetchCveOrg(id, fetchImpl)
        if (c) out.push(c)
      } catch (err) {
        failed++
        log(`cve-org ${id}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  if (ids.length && failed === ids.length) throw new Error(`all ${failed} lookups failed`)
  return out
}
