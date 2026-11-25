import type { Threat } from './types'

/** Ranking used everywhere a list is sorted: Exploited first, then Mine, then CVSS. */
export function risk(t: Pick<Threat, 'exploited' | 'cvss'>, mine: boolean): number {
  return (t.exploited ? 100 : 0) + (mine ? 30 : 0) + t.cvss * 5
}
