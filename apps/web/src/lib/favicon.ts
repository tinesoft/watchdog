/** The dog's colour in alarm mode: the same values as `--crit` in the design tokens. */
export const ALARM_COLOR = { dark: '#FF5A4E', light: '#D92D20' } as const

/** The count as the badge shows it: one digit fits the circle, anything larger reads "9+". */
export const badgeLabel = (count: number): string => (count > 9 ? '9+' : String(count))

/**
 * The favicon drawn in one colour, as a data URI, so the tab can change colour with no extra file.
 * With a count it also carries the sidebar's badge: a filled circle in the same colour with the number in it.
 */
export function faviconDataUri(color: string, count = 0): string {
  const label = badgeLabel(count)
  const badge =
    count > 0
      ? `<circle cx="21" cy="11" r="11" fill="${color}" stroke="#0E1318" stroke-width="1.5"/><text x="21" y="${label.length > 1 ? 15.6 : 16.6}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${label.length > 1 ? 13 : 16}" fill="#07090C">${label}</text>`
      : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="8" fill="#0E1318" stroke="${color}" stroke-width="1.5"/><path d="M7 24 L9 14 L10 6 L14 12 L17 7 L19 13 L26 16 Q27.5 17 26.5 18.5 L21 20 L15 23 Z" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17.5" cy="15" r="1.7" fill="${color}"/>${badge}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
