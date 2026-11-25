/** The Sweep runs at these UTC hours (see .github/workflows/deploy.yml). */
export const SWEEP_HOURS_UTC = [7, 14] as const

export function nextSweep(now: Date): Date {
  for (let day = 0; day < 2; day++) {
    for (const h of SWEEP_HOURS_UTC) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, h),
      )
      if (d.getTime() > now.getTime()) return d
    }
  }
  throw new Error('unreachable')
}

export function ago(from: Date, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`
}

/** "22h00": time until the next Sweep. */
export function until(to: Date, now: Date): string {
  const min = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60000))
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}
