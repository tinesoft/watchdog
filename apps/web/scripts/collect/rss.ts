import type { Threat } from '../../src/lib/types.ts'

const x = (s: string) =>
  s.replace(
    /[<>&"']/g,
    c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  )

/** RSS 2.0 of the newest Exploited and critical Threats, for people who want alerts while watchdog is closed. */
export function buildFeed(threats: Threat[], site: string, builtAt: Date): string {
  const items = threats
    .filter(t => t.exploited || t.severity === 'critical')
    .sort((a, b) => b.published.localeCompare(a.published) || b.cvss - a.cvss)
    .slice(0, 50)
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>watchdog: exploited and critical threats</title>
<link>${x(site)}/</link>
<description>Newest Exploited and critical threats from the latest watchdog Sweep.</description>
<lastBuildDate>${builtAt.toUTCString()}</lastBuildDate>
${items
  .map(
    t =>
      `<item><title>${x(`${t.exploited ? '[EXPLOITED] ' : ''}${t.id}: ${t.title}`)}</title><link>${x(`${site}/#${t.id}`)}</link><guid isPermaLink="false">${x(t.id)}</guid><pubDate>${new Date(t.published || builtAt).toUTCString()}</pubDate><description>${x(`CVSS ${t.cvss.toFixed(1)}. ${t.summary}`)}</description></item>`,
  )
  .join('\n')}
</channel></rss>
`
}
