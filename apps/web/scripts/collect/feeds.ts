import type { Advisory, FieldReport } from '../../src/lib/types.ts'
import { cvesIn, parseFeed } from './feed.ts'
import { getText } from './http.ts'

/** Feeds that publish advisories: they add a record to Threats the other Sources already found. */
export const ADVISORY_FEEDS: readonly { id: string; name: string; url: string; deep?: number }[] = [
  // CERT-FR and Jenkins list their CVE ids on the advisory page, not in the feed: `deep` is how many recent pages to open.
  { id: 'cert-fr', name: 'CERT-FR', url: 'https://www.cert.ssi.gouv.fr/avis/feed/', deep: 60 },
  { id: 'msrc', name: 'Microsoft MSRC', url: 'https://api.msrc.microsoft.com/update-guide/rss' },
  { id: 'spring', name: 'Spring', url: 'https://spring.io/security.atom' },
  {
    id: 'jenkins',
    name: 'Jenkins',
    url: 'https://www.jenkins.io/security/advisories/rss.xml',
    deep: 8,
  },
  { id: 'nodejs', name: 'Node.js', url: 'https://nodejs.org/en/feed/vulnerability.xml' },
]

/** Labs whose posts show up as Field reports. `key` is the chip id; `lab` is the card heading. */
export const REPORT_FEEDS = [
  { id: 'kaspersky', lab: 'Kaspersky Securelist', url: 'https://securelist.com/feed/' },
  { id: 'eset', lab: 'ESET WeLiveSecurity', url: 'https://www.welivesecurity.com/en/feed/' },
  {
    id: 'sophos',
    lab: 'Sophos',
    url: 'https://www.sophos.com/en-us/category/threat-research/feed',
  },
  { id: 'sonatype', lab: 'Sonatype', url: 'https://www.sonatype.com/blog/rss.xml' },
  {
    id: 'microsoft',
    lab: 'Microsoft Security Blog',
    url: 'https://www.microsoft.com/en-us/security/blog/feed/',
  },
  { id: 'pz', lab: 'Google Project Zero', url: 'https://projectzero.google/feed.xml' },
  {
    id: 'bleepingcomputer',
    lab: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
  },
  {
    id: 'thehackernews',
    lab: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
  },
  { id: 'securityweek', lab: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
] as const

const http = (u: string) => (/^https?:\/\//i.test(u) ? u : '')

/** CVE id → the advisories of this feed that mention it. */
export async function fetchAdvisories(feed: {
  id: string
  name: string
  url: string
  deep?: number
}): Promise<Map<string, Advisory[]>> {
  const out = new Map<string, Advisory[]>()
  const items = parseFeed(await getText(feed.url))
  const pages = new Map<string, string>()
  const deep = items.slice(0, feed.deep ?? 0).filter(i => http(i.link))
  for (let i = 0; i < deep.length; i += 4)
    await Promise.all(
      deep.slice(i, i + 4).map(async it => {
        try {
          pages.set(it.link, await getText(it.link, { retries: 1, timeoutMs: 20_000 }))
        } catch {
          /* a page that will not load only costs its own CVE links */
        }
      }),
    )
  for (const item of items) {
    const url = http(item.link)
    if (!url) continue
    for (const cve of cvesIn(`${item.title} ${item.text} ${pages.get(item.link) ?? ''}`)) {
      const list = out.get(cve) ?? []
      if (!list.some(a => a.url === url))
        list.push({ source: feed.id, title: item.title.slice(0, 160), url })
      out.set(cve, list)
    }
  }
  return out
}

export async function fetchReports(
  feed: { id: string; lab: string; url: string },
  since: string,
  perLab: number,
): Promise<FieldReport[]> {
  return parseFeed(await getText(feed.url))
    .filter(i => i.title && http(i.link) && i.date && i.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, perLab)
    .map(i => ({
      lab: feed.lab,
      key: feed.id,
      date: i.date,
      title: i.title.slice(0, 160),
      summary: i.text.slice(0, 240).replace(/\s+\S*$/, '…'),
      cves: cvesIn(`${i.title} ${i.text}`),
      url: i.link,
    }))
}
