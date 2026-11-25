import { XMLParser } from 'fast-xml-parser'

export interface FeedItem {
  title: string
  link: string
  /** ISO date (YYYY-MM-DD) or '' when the feed gave none. */
  date: string
  text: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
})

type Node = string | number | { '#text'?: string | number; [k: string]: unknown } | undefined | null
const text = (v: Node): string =>
  v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v)
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

export const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const isoDate = (s: string): string => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** RSS 2.0 and Atom, whichever the source serves. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } }
    feed?: { entry?: unknown }
  }
  const rss = doc.rss?.channel
  if (rss) {
    return arr(rss.item as Record<string, Node> | Record<string, Node>[]).map(i => ({
      title: stripHtml(text(i.title)),
      link: text(i.link).trim(),
      date: isoDate(text(i.pubDate) || text(i['dc:date'])),
      text: stripHtml(`${text(i.description)} ${text(i['content:encoded'])}`),
    }))
  }
  const atom = doc.feed
  if (atom) {
    return arr(atom.entry as Record<string, Node> | Record<string, Node>[]).map(e => {
      const links = arr(e.link) as { '@_href'?: string; '@_rel'?: string }[]
      const alt = links.find(l => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0]
      return {
        title: stripHtml(text(e.title)),
        link: String(alt?.['@_href'] ?? '').trim(),
        date: isoDate(text(e.published) || text(e.updated)),
        text: stripHtml(`${text(e.summary)} ${text(e.content)}`),
      }
    })
  }
  return []
}

export const CVE_RE = /CVE-\d{4}-\d{4,}/gi
export const cvesIn = (s: string): string[] => [
  ...new Set((s.match(CVE_RE) ?? []).map(c => c.toUpperCase())),
]

/** Advisory bodies are Markdown: keep the words, drop the syntax. */
export const plainText = (s: string): string =>
  s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[`*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
