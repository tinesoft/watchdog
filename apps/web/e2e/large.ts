import seed from '../data/seed/threats.json' with { type: 'json' }
import { NO_PRODUCT, type Threat } from '../src/lib/types'

/** Deterministic PRNG, so every run builds the same data file. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The seed grown to the size of a real Sweep after the NVD fix (~2,534 Threats), keeping its
 * shape: about 52% name no product, and about 5% are Exploited.
 */
export function largeThreats(n = 2534): Threat[] {
  const rnd = mulberry32(2026)
  const base = seed.items as Threat[]
  return Array.from({ length: n }, (_, i) => {
    const b = base[i % base.length]!
    const noProduct = rnd() < 0.52
    const exploited = rnd() < 0.05
    const cvss = Math.min(10, 9 + Math.round(rnd() * 10) / 10)
    return {
      ...b,
      id: `CVE-2026-${String(10000 + i)}`,
      title: noProduct ? `In the Linux kernel, a flaw in subsystem ${i}` : `${b.title} (${i})`,
      cvss,
      severity: 'critical',
      exploited,
      ...(noProduct
        ? { product: NO_PRODUCT, pkg: NO_PRODUCT, eco: null, category: 'os' as const }
        : {}),
    }
  })
}

export const largeDataset = (items = largeThreats()) => ({
  sample: false,
  collectedAt: '2026-11-26T07:05:00Z',
  items,
})
