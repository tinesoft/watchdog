import { isMine } from '../lib/match'
import { risk } from '../lib/risk'
import type { Dep, Finding } from '../lib/scan'
import type { OsvHit } from '../lib/osv'
import type { Category, Dataset, FieldReport, Severity, Threat, TriageStatus } from '../lib/types'

export type View =
  'inbox' | 'all' | 'stack-feed' | 'triage' | 'scan' | 'stack' | 'reports' | 'sources'
export type AlertLevel = 'exploited' | 'critical' | 'stack'
export type Theme = 'dark' | 'light'

/** Everything the user owns. Lives in localStorage, exportable as JSON. */
export interface Persisted {
  theme: Theme | null
  sideCollapsed: boolean
  stack: string[]
  triage: Record<string, TriageStatus>
  notes: Record<string, string>
  seen: string[]
  repo: string
  labels: string
  alertsOn: boolean
  alertLevel: AlertLevel
  /** Threat IDs already shown as a browser notification. */
  notified: string[]
}

export interface ScanOutcome {
  deps: Dep[]
  findings: Finding[]
  osv: OsvHit[] | null
  note: string
}

export interface Ephemeral {
  view: View
  sel: string | null
  cat: 'all' | Category
  exp: boolean
  q: string
  lab: string
  acQuery: string
  acIndex: number
  alertsOpen: boolean
  settingsOpen: boolean
  offline: boolean
  scanText: string
  scanFile: string
  scanOsv: boolean
  scanBusy: boolean
  scan: ScanOutcome | null
}

export const KEY = 'watchdog:v1'

export const defaults = (): Persisted => ({
  theme: null,
  sideCollapsed: false,
  stack: [],
  triage: {},
  notes: {},
  seen: [],
  repo: '',
  labels: 'security',
  alertsOn: false,
  alertLevel: 'stack',
  notified: [],
})

export function load(storage: Storage): Persisted {
  try {
    const raw = storage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : defaults()
  } catch {
    return defaults()
  }
}

export function save(storage: Storage, p: Persisted): void {
  try {
    storage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage full or blocked: the session still works, nothing persists */
  }
}

const STATUSES: readonly string[] = ['investigating', 'patched', 'not_affected', 'ignored']
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string')

/** Imported or stored JSON is untrusted: keep only well-typed fields. */
export function sanitize(input: unknown): Persisted {
  const d = defaults()
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  const str = (v: unknown, f: string) => (typeof v === 'string' ? v : f)
  const record = (v: unknown, ok: (x: string) => boolean) =>
    Object.fromEntries(
      Object.entries(v && typeof v === 'object' ? v : {}).filter(
        ([, x]) => typeof x === 'string' && ok(x),
      ),
    ) as Record<string, never>
  return {
    theme: o.theme === 'dark' || o.theme === 'light' ? o.theme : null,
    sideCollapsed: o.sideCollapsed === true,
    stack: isStrings(o.stack)
      ? [...new Set(o.stack.map(s => s.trim().toLowerCase()).filter(Boolean))]
      : [],
    triage: record(o.triage, x => STATUSES.includes(x)),
    notes: record(o.notes, () => true),
    seen: isStrings(o.seen) ? o.seen : [],
    repo: str(o.repo, d.repo),
    labels: str(o.labels, d.labels),
    alertsOn: o.alertsOn === true,
    alertLevel:
      o.alertLevel === 'exploited' || o.alertLevel === 'critical' ? o.alertLevel : 'stack',
    notified: isStrings(o.notified) ? o.notified : [],
  }
}

export interface Row extends Threat {
  mine: boolean
  status: TriageStatus | ''
  isNew: boolean
}

export interface Data {
  threats: Dataset<Threat> | null
  reports: Dataset<FieldReport> | null
}

export function rowsOf(threats: Threat[], p: Persisted): Row[] {
  const seen = new Set(p.seen)
  return threats.map(t => {
    const status = p.triage[t.id] ?? ''
    return { ...t, mine: isMine(t, p.stack), status, isNew: !status && !seen.has(t.id) }
  })
}

export const byRisk = (a: Row, b: Row) => risk(b, b.mine) - risk(a, a.mine)

export function inView(all: Row[], view: View): Row[] {
  switch (view) {
    case 'inbox':
      return all.filter(v => v.isNew)
    case 'stack-feed':
      return all.filter(v => v.mine)
    case 'triage':
      return all.filter(v => v.status)
    default:
      return all
  }
}

export function filtered(base: Row[], e: Pick<Ephemeral, 'cat' | 'exp' | 'q'>): Row[] {
  const q = e.q.toLowerCase()
  return base
    .filter(v => {
      if (e.cat !== 'all' && v.category !== e.cat) return false
      if (e.exp && !v.exploited) return false
      return !q || `${v.id} ${v.title} ${v.product}`.toLowerCase().includes(q)
    })
    .sort(byRisk)
}

/** New Mine Threats the user asked to hear about. */
export function alertList(inbox: Row[], level: AlertLevel): Row[] {
  return inbox
    .filter(v => {
      if (!v.mine) return false
      if (level === 'exploited') return v.exploited
      if (level === 'critical') return v.exploited || v.severity === ('critical' as Severity)
      return true
    })
    .sort(byRisk)
}
