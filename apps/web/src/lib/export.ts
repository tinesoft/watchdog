import type { Threat } from './types'

/** Cells that start with = + - @ would run as formulas in a spreadsheet: neutralise them. */
export const csvCell = (v: unknown): string => {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(rows: readonly (Threat & { mine: boolean; status: string })[]): string {
  const head = [
    'id',
    'title',
    'severity',
    'cvss',
    'exploited',
    'mine',
    'status',
    'product',
    'affected',
    'fixed',
    'published',
  ]
  const lines = rows.map(v =>
    [
      v.id,
      v.title,
      v.severity,
      v.cvss,
      v.exploited,
      v.mine,
      v.status,
      v.product,
      v.affected,
      v.fixed,
      v.published,
    ]
      .map(csvCell)
      .join(','),
  )
  return [head.join(','), ...lines].join('\n')
}

export function toMarkdown(v: Threat, link: string): string {
  const lines = [
    `### ${v.id}: ${v.title}`,
    '',
    `- **Severity:** ${v.severity} (CVSS ${v.cvss.toFixed(1)})`,
    `- **Exploited:** ${v.exploited ? 'yes, listed in CISA KEV' : 'no known exploitation'}`,
    `- **Product:** ${v.product}`,
  ]
  if (v.affected) lines.push(`- **Affected:** ${v.affected}`)
  if (v.fixed) lines.push(`- **Fixed in:** ${v.fixed}`)
  lines.push('', v.summary, '', link)
  return lines.join('\n')
}

/** A prefilled github.com new-issue link, or null when the repository setting is not owner/repo. */
export function issueUrl(repo: string, labels: string, v: Threat, link: string): string | null {
  const r = repo.trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return null
  const q = new URLSearchParams({
    title: `${v.id}: ${v.title}`,
    body: toMarkdown(v, link),
    labels: labels
      .split(',')
      .map(l => l.trim())
      .filter(Boolean)
      .join(','),
  })
  return `https://github.com/${r}/issues/new?${q}`
}
