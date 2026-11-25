/** The dog's colour in alarm mode: the same values as `--crit` in the design tokens. */
export const ALARM_COLOR = { dark: '#FF5A4E', light: '#D92D20' } as const

/**
 * The favicon drawn in one colour, as a data URI, so the tab can change colour with no extra file.
 * With `dot` it also carries an alert dot in the top right corner. The dog keeps its full size: the dot
 * sits in the empty corner, and a digit would be unreadable at 16 px anyway.
 */
export function faviconDataUri(color: string, dot = false): string {
  const tile = `<rect x="1" y="1" width="30" height="30" rx="8" fill="#0E1318" stroke="${color}" stroke-width="1.5"/><path d="M7 24 L9 14 L10 6 L14 12 L17 7 L19 13 L26 16 Q27.5 17 26.5 18.5 L21 20 L15 23 Z" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17.5" cy="15" r="1.7" fill="${color}"/>`
  const badge = dot
    ? `<circle cx="25.5" cy="6.5" r="6.5" fill="${color}" stroke="#0E1318" stroke-width="1.5"/>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${tile}${badge}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
