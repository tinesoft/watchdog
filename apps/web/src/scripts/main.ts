import pkg from '../../package.json'
import { issueUrl, toCsv, toMarkdown } from '../lib/export'
import { debounce } from '../lib/debounce'
import { ALARM_COLOR, faviconDataUri } from '../lib/favicon'
import { queryOsv } from '../lib/osv'
import { registerServiceWorker } from './pwa'
import { matchDeps, parseDeps, pendingAlerts } from '../lib/scan'
import type { Dataset, FieldReport, SweepStatus, Threat, TriageStatus } from '../lib/types'
import {
  acMatches,
  inboxOf as inbox,
  isListView,
  shell,
  stackHot,
  sweepText,
  type Ctx,
} from './templates'
import {
  defaults,
  filtered,
  inView,
  KEY,
  labelList,
  load,
  clearedSeen,
  firstSeen,
  migrateSeen,
  PAGE,
  rowsCache,
  sanitize,
  save,
  alertList,
  type AlertLevel,
  type Data,
  type Ephemeral,
  type Persisted,
  type Theme,
  type View,
} from './state'

const root = document.getElementById('app')!
const toastEl = document.getElementById('wd-toast')!
const base = import.meta.env.BASE_URL

/** No saved state: the first Threats to arrive start the Inbox (see `firstSeen`). */
let firstVisit = !localStorage.getItem(KEY)
let p: Persisted = load(localStorage)
const e: Ephemeral = {
  view: 'inbox',
  sel: null,
  cat: 'all',
  exp: false,
  q: '',
  lab: 'all',
  acQuery: '',
  acIndex: 0,
  labelDraft: '',
  alertsOpen: false,
  settingsOpen: false,
  mobileNav: false,
  offline: false,
  scanText: '',
  scanFile: '',
  scanOsv: false,
  scanBusy: false,
  scan: null,
  limit: PAGE,
}
const data: Data = { threats: null, reports: null, status: null }

const systemTheme = (): Theme =>
  matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
const theme = (): Theme => p.theme ?? systemTheme()

const rows = rowsCache()
const noThreats: Threat[] = []

function ctx(): Ctx {
  return {
    p,
    e,
    data,
    rows: rows(data.threats?.items ?? noThreats, p),
    now: new Date(),
    theme: theme(),
    version: pkg.version,
  }
}

const faviconEl = document.getElementById('wd-favicon') as HTMLLinkElement | null
const calmFavicon = faviconEl?.getAttribute('href') ?? ''

/** The tab icon takes the dog's alarm colour, and a dot, while a new exploited threat matches the stack. */
function setFavicon(count: number, theme: Theme): void {
  if (!faviconEl) return
  const href = count > 0 ? faviconDataUri(ALARM_COLOR[theme], true) : calmFavicon
  if (faviconEl.getAttribute('href') !== href) faviconEl.setAttribute('href', href)
}

/** Keeps the "next in" countdown moving without re-rendering the page. */
setInterval(() => {
  const el = document.getElementById('wd-sweep')
  if (el) el.innerHTML = sweepText(ctx())
  const drawer = document.querySelector('.wd-sweep-text')
  if (drawer) drawer.innerHTML = sweepText(ctx())
}, 30_000)

/** Search keystrokes render once typing pauses; any other render supersedes the pending one. */
const searchRender = debounce(() => render(), 150)

/** A Threat list draws PAGE rows again whenever what it lists changes. */
let listKey = ''

function render(): void {
  searchRender.cancel()
  const key = [e.view, e.cat, e.exp, e.q].join('\0')
  if (key !== listKey) {
    listKey = key
    e.limit = PAGE
  }
  const active = document.activeElement as HTMLInputElement | null
  const id = active?.id
  const caret =
    id && 'selectionStart' in active! ? [active!.selectionStart, active!.selectionEnd] : null
  // Inner scrollers (large screens) are rebuilt on every render; keep each one where it was.
  const scrolls = new Map(
    [...root.querySelectorAll<HTMLElement>('[data-scroll]')].map(el => [
      el.dataset.scroll,
      el.scrollTop,
    ]),
  )
  const c = ctx()
  root.innerHTML = shell(c)
  for (const el of root.querySelectorAll<HTMLElement>('[data-scroll]')) {
    const top = scrolls.get(el.dataset.scroll)
    if (top) el.scrollTop = top
  }
  setFavicon(stackHot(c.rows), c.theme)
  document.documentElement.style.colorScheme = theme()
  if (id) {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el) {
      el.focus()
      if (caret && caret[0] != null) el.setSelectionRange(caret[0], caret[1] ?? caret[0])
    }
  }
}

const persist = () => save(localStorage, p)
const commit = () => {
  persist()
  render()
}

function setLabels(labels: string[]): void {
  p = { ...p, labels: labelList(labels.join(',')).join(',') }
  commit()
}

let toastTimer = 0
function toast(msg: string): void {
  toastEl.textContent = msg
  toastEl.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 2200)
}

async function copy(text: string, what = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(what)
  } catch {
    toast('Copy is blocked in this browser')
  }
}

function download(name: string, mime: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const linkFor = (id: string) => `${location.origin}${base}#${id}`
const selected = () => ctx().rows.find(r => r.id === e.sel)

function addToStack(name: string): void {
  const n = name.trim().toLowerCase()
  if (!n) return
  if (!p.stack.includes(n)) p = { ...p, stack: [...p.stack, n] }
  e.acQuery = ''
  e.acIndex = 0
  commit()
}

function go(view: View): void {
  e.view = view
  e.cat = 'all'
  e.alertsOpen = false
  e.mobileNav = false
  render()
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
}

function setTriage(status: TriageStatus): void {
  const v = selected()
  if (!v) return
  const triage = { ...p.triage }
  if (triage[v.id] === status) delete triage[v.id]
  else triage[v.id] = status
  p = { ...p, triage }
  commit()
}

function importJson(): void {
  const input = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: 'application/json,.json',
  })
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      p = sanitize(JSON.parse(await file.text()))
      settleSeen()
      commit()
      toast('Imported')
    } catch {
      toast('That file is not a watchdog export')
    }
  }
  input.click()
}

async function runScan(): Promise<void> {
  if (!e.scanText.trim()) {
    toast('Drop a file or paste its contents first')
    return
  }
  const deps = parseDeps(e.scanText, e.scanFile)
  if (!deps.length) {
    e.scan = {
      deps: [],
      findings: [],
      osv: null,
      note: 'No dependencies found. Is this one of the supported files?',
    }
    render()
    return
  }
  const local = matchDeps(deps, data.threats?.items ?? [])
  e.scan = {
    deps,
    findings: local,
    osv: null,
    note: `Checked against ${data.threats?.items.length ?? 0} threats in today’s feed.`,
  }
  if (e.scanOsv) {
    e.scanBusy = true
    render()
    try {
      const covered = new Set(local.map(f => `${f.dep.eco}:${f.dep.name}@${f.dep.version}`))
      const hits = await queryOsv(deps)
      e.scan = {
        ...e.scan,
        osv: hits.filter(h => !covered.has(`${h.dep.eco}:${h.dep.name}@${h.dep.version}`)),
        note: `Checked against ${data.threats?.items.length ?? 0} threats in today’s feed and OSV.dev.`,
      }
    } catch {
      e.scan = { ...e.scan, note: 'OSV.dev could not be reached, so this is today’s feed only.' }
    }
    e.scanBusy = false
  }
  render()
}

async function readScanFile(file: File): Promise<void> {
  if (file.size > 5_000_000) {
    toast('That file is too large to scan')
    return
  }
  e.scanText = await file.text()
  e.scanFile = file.name
  e.scan = null
  render()
}

/** One notification per new Mine Threat at the user's alert level, never repeated. */
function notifyNew(): void {
  if (!p.alertsOn || !('Notification' in window) || Notification.permission !== 'granted') return
  const c = ctx()
  const fresh = pendingAlerts(alertList(inbox(c.rows), p.alertLevel), p.notified)
  if (!fresh.length) return
  const top = fresh
    .slice(0, 3)
    .map(v => `${v.id}: ${v.title}`)
    .join('\n')
  const n = new Notification(
    `watchdog: ${fresh.length} new ${fresh.length === 1 ? 'threat' : 'threats'} in your stack`,
    { body: top, icon: `${base}favicon.svg`, tag: 'watchdog-alerts' },
  )
  n.onclick = () => {
    focus()
    e.view = 'stack-feed'
    render()
  }
  p = { ...p, notified: [...new Set([...p.notified, ...fresh.map(v => v.id)])] }
  persist()
}

async function toggleAlertsOn(): Promise<void> {
  if (p.alertsOn) {
    p = { ...p, alertsOn: false }
    commit()
    return
  }
  if (!('Notification' in window)) {
    toast('This browser has no notifications')
    return
  }
  const perm =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission
  if (perm !== 'granted') {
    toast('Notifications are blocked for this site')
    return
  }
  p = { ...p, alertsOn: true }
  commit()
  notifyNew()
}

const actions: Record<string, (arg: string, el: HTMLElement) => void> = {
  go: a => go(a as View),
  pick: a => {
    e.sel = a
    render()
    // On a phone the details stack below the list, so bring them into view.
    if (matchMedia('(max-width: 760px)').matches) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      document
        .querySelector('aside[aria-label="Threat details"]')
        ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    }
  },
  'close-detail': () => {
    e.sel = null
    render()
  },
  cat: a => {
    e.cat = a as Ephemeral['cat']
    render()
  },
  'show-more': () => {
    e.limit += PAGE
    render()
  },
  exploited: () => {
    e.exp = !e.exp
    render()
  },
  'clear-inbox': () => {
    p = { ...p, ...clearedSeen(data.threats?.items ?? []) }
    e.alertsOpen = false
    commit()
  },
  triage: a => setTriage(a as TriageStatus),
  copy: a => void copy(a, 'Command copied'),
  'copy-md': () => {
    const v = selected()
    if (v) void copy(toMarkdown(v, linkFor(v.id)), 'Markdown copied')
  },
  'copy-link': () => {
    const v = selected()
    if (v) void copy(linkFor(v.id), 'Link copied')
  },
  'add-stack': () => {
    const v = selected()
    if (!v) return
    addToStack(v.pkg === 'stdlib' ? v.product : v.pkg)
    toast('Added to your stack')
  },
  issue: () => {
    const v = selected()
    if (!v) return
    const url = issueUrl(p.repo, p.labels, v, linkFor(v.id))
    if (!url) {
      toast('Set a repository (owner/repo) in Settings first')
      e.settingsOpen = true
      render()
      return
    }
    window.open(url, '_blank', 'noopener')
  },
  'export-csv': () => {
    const c = ctx()
    download('watchdog-threats.csv', 'text/csv', toCsv(filtered(inView(c.rows, e.view), e)))
  },
  'export-json': () =>
    download('watchdog-state.json', 'application/json', JSON.stringify(p, null, 2)),
  'import-json': importJson,
  reset: () => {
    if (!confirm('Erase your stack, triage statuses, notes and settings from this browser?')) return
    p = defaults()
    localStorage.removeItem(KEY)
    firstVisit = true
    settleSeen()
    render()
  },
  theme: () => {
    p = { ...p, theme: theme() === 'dark' ? 'light' : 'dark' }
    commit()
  },
  'set-theme': a => {
    p = { ...p, theme: a as Theme }
    commit()
  },
  'toggle-nav': () => {
    e.mobileNav = !e.mobileNav
    e.alertsOpen = false
    render()
  },
  side: () => {
    p = { ...p, sideCollapsed: !p.sideCollapsed }
    commit()
  },
  preset: a => {
    p = { ...p, stack: p.stack.includes(a) ? p.stack.filter(x => x !== a) : [...p.stack, a] }
    commit()
  },
  'ac-pick': a => addToStack(a),
  'ac-add': () => {
    const m = acMatches(ctx())
    addToStack(m.length ? m[Math.min(e.acIndex, m.length - 1)]!.label : e.acQuery)
  },
  'label-remove': a => {
    setLabels(labelList(p.labels).filter(x => x !== a))
    document.getElementById('wd-labels')?.focus()
  },
  'stack-remove': a => {
    p = { ...p, stack: p.stack.filter(x => x !== a) }
    commit()
  },
  lab: a => {
    e.lab = a
    render()
  },
  'open-cve': a => {
    e.sel = a
    e.view = 'all'
    e.cat = 'all'
    render()
  },
  'open-alert': a => {
    e.sel = a
    e.view = 'all'
    e.alertsOpen = false
    render()
  },
  'toggle-alerts': () => {
    e.alertsOpen = !e.alertsOpen
    e.settingsOpen = false
    render()
  },
  'alerts-on': () => void toggleAlertsOn(),
  'scan-run': () => void runScan(),
  'alert-level': a => {
    p = { ...p, alertLevel: a as AlertLevel }
    commit()
    notifyNew()
  },
  'open-settings': () => {
    e.settingsOpen = true
    e.alertsOpen = false
    e.mobileNav = false
    render()
  },
  'close-settings': () => {
    e.settingsOpen = false
    render()
  },
  scrim: (_a, el) => {
    if (el === lastClickTarget) {
      e.settingsOpen = false
      render()
    }
  },
}

let lastClickTarget: EventTarget | null = null

root.addEventListener('click', ev => {
  lastClickTarget = ev.target
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!el) return
  const act = actions[el.dataset.act ?? '']
  if (!act) return
  if (el.tagName === 'A' && el.dataset.act !== 'copy') ev.preventDefault()
  act(el.dataset.arg ?? '', el)
})

root.addEventListener('input', ev => {
  const el = ev.target as HTMLInputElement
  switch (el.dataset.in) {
    case 'q':
      e.q = el.value
      if (!isListView(e.view)) {
        e.view = 'all'
        render()
      } else if (!e.q) render()
      else searchRender()
      break
    case 'ac':
      e.acQuery = el.value
      e.acIndex = 0
      render()
      break
    case 'note': {
      const v = selected()
      if (v) {
        const notes = { ...p.notes }
        if (el.value) notes[v.id] = el.value
        else delete notes[v.id]
        p = { ...p, notes }
        persist()
      }
      break
    }
    case 'scan-text':
      e.scanText = el.value
      e.scanFile = ''
      break
    case 'repo':
      p = { ...p, repo: el.value }
      persist()
      break
    case 'label-draft': {
      // A comma ends a label, so pasting "a, b, c" makes three chips.
      const parts = el.value.split(',')
      e.labelDraft = parts.pop()!
      if (parts.length) setLabels([...labelList(p.labels), ...parts])
      break
    }
  }
})

root.addEventListener('keydown', ev => {
  const el = ev.target as HTMLElement
  if (el.dataset.in === 'q') {
    if (ev.key === 'Enter') searchRender.flush()
    return
  }
  if (el.dataset.in === 'label-draft') {
    const labels = labelList(p.labels)
    if (ev.key === 'Enter') {
      ev.preventDefault()
      e.labelDraft = ''
      setLabels([...labels, (el as HTMLInputElement).value])
    } else if (ev.key === 'Backspace' && !e.labelDraft && labels.length) {
      setLabels(labels.slice(0, -1))
    }
    return
  }
  if (el.dataset.in !== 'ac') return
  const m = acMatches(ctx())
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault()
    if (!m.length) return
    e.acIndex =
      (Math.min(e.acIndex, m.length - 1) + (ev.key === 'ArrowDown' ? 1 : m.length - 1)) % m.length
    render()
  } else if (ev.key === 'Enter') {
    ev.preventDefault()
    addToStack(m.length ? m[Math.min(e.acIndex, m.length - 1)]!.label : e.acQuery)
  } else if (ev.key === 'Escape') {
    e.acQuery = ''
    e.acIndex = 0
    render()
  }
})

root.addEventListener('change', ev => {
  const el = ev.target as HTMLInputElement
  if (el.dataset.in === 'scan-file' && el.files?.[0]) void readScanFile(el.files[0])
  if (el.dataset.in === 'scan-osv') {
    e.scanOsv = el.checked
    render()
  }
})

root.addEventListener('dragover', ev => {
  if ((ev.target as HTMLElement).closest('[data-drop]')) ev.preventDefault()
})
root.addEventListener('drop', ev => {
  if (!(ev.target as HTMLElement).closest('[data-drop]')) return
  ev.preventDefault()
  const f = ev.dataTransfer?.files[0]
  if (f) void readScanFile(f)
})

document.addEventListener('keydown', ev => {
  const t = ev.target as HTMLElement
  const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
  if (ev.key === '/' && !typing && !ev.metaKey && !ev.ctrlKey) {
    ev.preventDefault()
    document.getElementById('wd-q')?.focus()
  } else if (ev.key === 'Escape' && !(typing && t.dataset.in === 'ac')) {
    if (e.settingsOpen || e.alertsOpen || e.mobileNav) {
      e.settingsOpen = false
      e.alertsOpen = false
      e.mobileNav = false
      render()
    }
  }
})

function applyHash(): void {
  const id = decodeURIComponent(location.hash.slice(1))
  if (/^[\w-]+$/.test(id) && data.threats?.items.some(t => t.id === id)) {
    e.sel = id
    e.view = 'all'
  }
}
addEventListener('hashchange', () => {
  applyHash()
  render()
})

async function fetchDataset<T>(name: string): Promise<Dataset<T> | null> {
  try {
    const res = await fetch(`${base}data/${name}.json`)
    // The service worker answers from its cache when the network is gone, and says so.
    if (res.headers.get('x-wd-cache') === 'hit') e.offline = true
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as Dataset<T>
  } catch {
    e.offline = true
    return null
  }
}

/** The Sweep's per-source results. Absent on seed builds, which is not an offline signal. */
async function fetchStatus(): Promise<SweepStatus | null> {
  try {
    const res = await fetch(`${base}data/status.json`)
    return res.ok ? ((await res.json()) as SweepStatus) : null
  } catch {
    return null
  }
}

let lastFetch = 0
async function refresh(): Promise<void> {
  e.offline = false
  const [threats, reports] = await Promise.all([
    fetchDataset<Threat>('threats'),
    fetchDataset<FieldReport>('reports'),
  ])
  // Offline: keep what is already on screen rather than replacing it with nothing.
  data.threats = threats ?? data.threats ?? { sample: false, collectedAt: null, items: [] }
  data.reports = reports ?? data.reports ?? { sample: false, collectedAt: null, items: [] }
  data.status = (await fetchStatus()) ?? data.status
  lastFetch = Date.now()
  settleSeen()
  render()
  notifyNew()
}

/** Once Threats are here: start the Inbox on a first visit, or migrate seen saved by an older version. */
function settleSeen(): void {
  const items = data.threats?.items
  if (!items?.length) return
  const before = p
  if (firstVisit) {
    firstVisit = false
    p = { ...p, ...firstSeen(items) }
  } else p = migrateSeen(p, items)
  if (p !== before) persist()
}

async function boot(): Promise<void> {
  render()
  await refresh()
  applyHash()
  render()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastFetch > 10 * 60_000) void refresh()
})

registerServiceWorker(apply => {
  const bar = document.getElementById('wd-update')!
  bar.hidden = false
  document.getElementById('wd-update-go')!.onclick = apply
})

void boot()
