/** Compare dotted versions numerically; "1.0.0-beta1" sorts before "1.0.0". */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.\-+_]/)
  const pb = b.replace(/^v/i, '').split(/[.\-+_]/)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = parsePart(pa[i])
    const y = parsePart(pb[i])
    if (x.num !== y.num) return x.num < y.num ? -1 : 1
    if (x.tag !== y.tag) {
      if (!x.tag) return 1
      if (!y.tag) return -1
      return x.tag < y.tag ? -1 : 1
    }
  }
  return 0
}

function parsePart(s: string | undefined): { num: number; tag: string } {
  if (s === undefined) return { num: 0, tag: '' }
  const m = /^(\d*)(.*)$/.exec(s)
  const digits = m?.[1] ?? ''
  const rest = m?.[2] ?? ''
  // A part like "beta9" has no number: it is a pre-release tag of the previous part, so sorts below a plain release.
  return { num: digits ? Number(digits) : 0, tag: rest || (digits ? '' : s) }
}

/**
 * Whether `version` falls in an `affected` string. The grammar, shared with the collectors:
 * clauses separated by "," or "·"; each clause is "< X", "<= X" or "≤ X", "A – B" (inclusive),
 * "A < B" (from A up to, excluding, B), ">= X", "> X", or an exact version "X".
 */
export function isAffected(version: string, affected: string | null): boolean {
  if (!affected) return false
  const clauses = affected
    .split(/\s*[,·]\s*/)
    .map(c => c.trim())
    .filter(Boolean)
  return clauses.some(c => {
    let m = /^(?:<=|≤)\s*(\S+)$/.exec(c)
    if (m) return compareVersions(version, m[1]!) <= 0
    m = /^(?:>=|≥)\s*(\S+)$/.exec(c)
    if (m) return compareVersions(version, m[1]!) >= 0
    m = /^>\s*(\S+)$/.exec(c)
    if (m) return compareVersions(version, m[1]!) > 0
    m = /^<\s*(\S+)$/.exec(c)
    if (m) return compareVersions(version, m[1]!) < 0
    m = /^(\S+)\s*[–-]\s*(\S+)$/.exec(c)
    if (m && /^\d/.test(m[1]!))
      return compareVersions(version, m[1]!) >= 0 && compareVersions(version, m[2]!) <= 0
    m = /^(\S+)\s*<\s*(\S+)$/.exec(c)
    if (m) return compareVersions(version, m[1]!) >= 0 && compareVersions(version, m[2]!) < 0
    return /^\d/.test(c) && compareVersions(version, c) === 0
  })
}
