const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Every value that comes from a feed or from the user goes through this before it reaches innerHTML. */
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ENTITIES[c] ?? c)

/** Only http(s) links from feeds are rendered as links. */
export const safeUrl = (u: string): string => (/^https?:\/\//i.test(u) ? u : '#')
