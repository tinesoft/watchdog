import type { Candidate } from './candidate.ts'
import { plainText } from './feed.ts'
import { get } from './http.ts'

const ECO: Record<string, string> = {
  npm: 'npm',
  pip: 'PyPI',
  maven: 'Maven',
  go: 'Go',
  rubygems: 'RubyGems',
  composer: 'Packagist',
  rust: 'crates.io',
  nuget: 'NuGet',
  pub: 'Pub',
  swift: 'Swift',
  erlang: 'Hex',
  actions: 'GitHub Actions',
}

/** GitHub's "range" syntax into the shared affected grammar (see lib/version.ts). */
export function rangeOf(r: string | null | undefined): string {
  if (!r) return ''
  return r
    .split('||')
    .map(part => {
      const bits = part
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      const lo = bits.find(b => /^>=?\s*/.test(b))
      const hi = bits.find(b => /^<=?\s*/.test(b))
      const eq = bits.find(b => /^=\s*/.test(b))
      if (eq) return eq.replace(/^=\s*/, '')
      const loV = lo?.replace(/^>=?\s*/, '')
      const hiV = hi?.replace(/^<=?\s*/, '')
      if (lo && hi && lo.startsWith('>='))
        return hi.startsWith('<=') ? `${loV} – ${hiV}` : `${loV} < ${hiV}`
      if (hi) return hi.startsWith('<=') ? `≤ ${hiV}` : `< ${hiV}`
      if (lo) return lo.startsWith('>=') ? `≥ ${loV}` : `> ${loV}`
      return ''
    })
    .filter(Boolean)
    .join(', ')
}

interface Raw {
  ghsa_id: string
  cve_id: string | null
  summary: string
  description: string | null
  published_at: string
  cvss: { score: number | null } | null
  cwes: { cwe_id: string }[] | null
  vulnerabilities:
    | {
        package: { ecosystem: string; name: string } | null
        vulnerable_version_range: string | null
        first_patched_version: string | null
      }[]
    | null
}

export function toCandidate(a: Raw): Candidate {
  const v = a.vulnerabilities?.[0]
  const eco = v?.package ? (ECO[v.package.ecosystem] ?? v.package.ecosystem) : undefined
  return {
    id: a.cve_id ?? a.ghsa_id,
    source: 'ghsa',
    title: a.summary,
    summary: plainText(a.description ?? '').slice(0, 400),
    cvss: a.cvss?.score ?? undefined,
    published: a.published_at.slice(0, 10),
    eco,
    pkg: v?.package?.name,
    affected: rangeOf(v?.vulnerable_version_range) || undefined,
    fixed: v?.first_patched_version ?? undefined,
    cwes: (a.cwes ?? []).map(c => c.cwe_id),
  }
}

/** Reviewed critical and high advisories published since `from` (YYYY-MM-DD). */
export async function fetchGhsa(
  token: string | undefined,
  from: string,
  maxPages = 10,
): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (const severity of ['critical', 'high']) {
    let url: string | null =
      `https://api.github.com/advisories?type=reviewed&severity=${severity}&published=%3E%3D${from}&per_page=100&sort=published&direction=desc`
    for (let page = 0; url && page < maxPages; page++) {
      const res = await get(url, {
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      })
      for (const a of (await res.json()) as Raw[]) out.push(toCandidate(a))
      url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null
    }
  }
  return out
}
