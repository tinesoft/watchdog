import catalog from '../data/catalog.json'
import sources from '../data/sources.json'
import { icons } from '../lib/icons'
import { fixCommand } from '../lib/fixcmd'
import { ago, nextSweep, until } from '../lib/sweep'
import type { CatalogEntry, SourceGroup, TriageStatus } from '../lib/types'
import { esc, safeUrl } from './dom'
import {
  alertList,
  byRisk,
  filtered,
  inView,
  labelList,
  type AlertLevel,
  type Data,
  type Ephemeral,
  type Persisted,
  type Row,
  type View,
} from './state'

export interface Ctx {
  p: Persisted
  e: Ephemeral
  data: Data
  rows: Row[]
  now: Date
  theme: 'dark' | 'light'
  version: string
}

const REPO_URL = 'https://github.com/tinesoft/watchdog'
const sevShort = { critical: 'CRIT', high: 'HIGH', medium: 'MED' } as const
const statusLabel: Record<TriageStatus, string> = {
  investigating: 'Investigating',
  patched: 'Patched',
  not_affected: 'Not affected',
  ignored: 'Ignored',
}
const catLabel = {
  all: 'All',
  packages: 'Packages',
  languages: 'Languages',
  os: 'OS',
  ai: 'AI',
  tools: 'Tools',
  supply: 'Supply chain attack',
} as const
const presets: [string, string][] = [
  ['Next.js', 'next'],
  ['React', 'react'],
  ['Django', 'django'],
  ['Log4j', 'log4j'],
  ['Go stdlib', 'go standard library'],
  ['Windows', 'windows'],
  ['Linux kernel', 'linux kernel'],
  ['OpenSSH', 'openssh'],
  ['Docker', 'docker'],
  ['Kubernetes', 'kubernetes'],
  ['MCP', 'mcp'],
  ['Copilot', 'copilot'],
  ['PHP', 'php'],
  ['runc', 'runc'],
]
const titles: Partial<Record<View, [string, string]>> = {
  inbox: ['Inbox', 'New since you last cleared it, not triaged yet. Riskiest first.'],
  all: ['All threats', 'Everything the dog caught in the window.'],
  'stack-feed': ['My stack', 'Threats matching what you told the dog you run.'],
  triage: ['Triage', 'Threats you have acted on.'],
}
export const isListView = (v: View) => v in titles

const closeIcon = (s = 20) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>`

export function inboxOf(rows: Row[]): Row[] {
  return rows.filter(v => v.isNew)
}

export function stackHot(rows: Row[]): number {
  return inboxOf(rows).filter(v => v.mine && v.exploited).length
}

// ---- header -------------------------------------------------------------

function dogMark(cls: string, color: string): string {
  return `<svg class="${cls}" width="36" height="36" viewBox="0 0 32 32" aria-hidden="true" style="color: ${color}"><rect x="1" y="1" width="30" height="30" rx="8" style="fill: var(--surface)" stroke="currentColor" stroke-width="1.5"></rect><path d="M7 24 L9 14 L10 6 L14 12 L17 7 L19 13 L26 16 Q27.5 17 26.5 18.5 L21 20 L15 23 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><circle class="eye" cx="17.5" cy="15" r="1.7" fill="currentColor"></circle></svg>`
}

/** The pill's text. Also called on a timer, so the countdown moves without a re-render. */
export function sweepText(c: Pick<Ctx, 'data' | 'e' | 'now'>): string {
  const t = c.data.threats
  let text = 'loading…'
  if (t?.sample) text = 'sample data · first sweep pending'
  else if (t?.collectedAt)
    text = `swept ${esc(ago(new Date(t.collectedAt), c.now))} ago · next in ${esc(until(nextSweep(c.now), c.now))}`
  return text + (c.e.offline ? ' · offline' : '')
}

function sweepPill(c: Ctx): string {
  return `<span class="mono hide-mobile" style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 7px 12px"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${c.e.offline ? 'var(--high)' : 'var(--lime)'}; box-shadow: 0 0 10px ${c.e.offline ? 'var(--high)' : 'var(--lime)'}"></span><span id="wd-sweep">${sweepText(c)}</span></span>`
}

function alertsPanel(c: Ctx, items: Row[]): string {
  const levels: [AlertLevel, string][] = [
    ['exploited', 'Exploited only'],
    ['critical', 'Critical or exploited'],
    ['stack', 'Anything in my stack'],
  ]
  const hint = c.p.alertsOn
    ? 'On. You hear about new threats in your stack when you open watchdog.'
    : 'Off. Turn on to get a browser notification for new threats in your stack.'
  return `<div role="dialog" aria-label="Alerts" class="pop-in" style="position: absolute; top: calc(100% + 10px); right: 0; width: 380px; max-width: calc(100vw - 24px); background: var(--bg2); border: 1px solid var(--line2); border-radius: 14px; box-shadow: 0 24px 60px -20px rgba(0,0,0,.55); display: flex; flex-direction: column; overflow: hidden; z-index: 40">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line)"><b style="font-size: 16px">Alerts</b><button type="button" class="btn" data-act="toggle-alerts" aria-label="Close alerts" style="width: 36px; min-height: 36px; padding: 0; color: var(--text2)">${closeIcon(18)}</button></div>
<div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--line)">
<button type="button" role="switch" aria-checked="${c.p.alertsOn}" data-act="alerts-on" style="all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px; cursor: pointer; min-height: 44px">
<span style="flex: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 14px; font-weight: 600; color: var(--text)">Browser alerts</span><span style="font-size: 12.5px; line-height: 1.45; color: var(--muted)">${hint}</span></span>
<span class="sw ${c.p.alertsOn ? 'sw-on' : ''}"><span class="sw-knob"></span></span></button>
<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 12px; color: var(--dim)">Alert me about</span>
<div style="display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg)">${levels
    .map(
      ([k, l]) =>
        `<button type="button" class="seg ${c.p.alertLevel === k ? 'seg-on' : ''}" data-act="alert-level" data-arg="${k}">${l}</button>`,
    )
    .join('')}</div></div></div>
<div style="display: flex; flex-direction: column; max-height: 300px; overflow-y: auto"><span class="mono" style="padding: 12px 16px 6px; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim)">New in your stack</span>
${items.length === 0 ? '<span style="padding: 10px 16px 18px; font-size: 13px; color: var(--muted)">All quiet. Nothing new matches your stack and alert level.</span>' : ''}
${items
  .map(
    v =>
      `<button type="button" class="alrow" data-act="open-alert" data-arg="${esc(v.id)}"><span class="sev sev-${v.severity}" style="flex: none">${sevShort[v.severity]} ${v.cvss.toFixed(1)}</span><span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px"><span class="mono" style="font-size: 12.5px; font-weight: 600; color: var(--text)">${esc(v.id)}</span><span style="font-size: 13px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${esc(v.title)}</span></span>${v.exploited ? '<span class="kev" style="flex: none">exploited</span>' : ''}</button>`,
  )
  .join('')}</div>
<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line)"><button type="button" class="btn btn-g" data-act="clear-inbox" style="min-height: 38px; font-size: 13px">Mark all as read</button><a href="feed.xml" class="mono" style="font-size: 12.5px">RSS feed ↗</a></div>
<span style="padding: 0 16px 14px; font-size: 12px; line-height: 1.45; color: var(--dim)">Alerts appear when watchdog is open. For alerts while it’s closed, subscribe to the RSS feed.</span></div>`
}

export function header(c: Ctx): string {
  const hot = stackHot(c.rows)
  const items = alertList(inboxOf(c.rows), c.p.alertLevel)
  const count = c.p.alertsOn && items.length ? items.length : 0
  const icon = (n: 'sun' | 'moon') => icons[n]
  const nav = c.e.mobileNav
  return `<header class="topbar" style="position: relative; z-index: 30; min-height: 64px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--glass)">
<button type="button" class="btn only-mobile" data-act="toggle-nav" aria-label="${nav ? 'Close navigation' : 'Open navigation'}" aria-expanded="${nav}" aria-controls="wd-side" style="width: 44px; padding: 0; color: var(--text2)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="${nav ? 'M18 6L6 18M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}"></path></svg></button>
<a href="./" class="brand" data-act="go" data-arg="inbox" style="flex: 0 0 216px; display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text)">${dogMark(hot ? 'mascot-alarm' : '', hot ? 'var(--crit)' : 'var(--lime)')}<span class="mono brand-text" style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em">watchdog</span></a>
<div class="topsearch" style="position: relative; flex: 1 1 280px; max-width: 560px"><label for="wd-q" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Search CVE, package or product</label>
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="stroke: var(--dim); position: absolute; left: 13px; top: 13px"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
<input id="wd-q" type="search" data-in="q" value="${esc(c.e.q)}" placeholder="Search CVE, package, product…  ( / )" style="min-height: 44px; width: 100%; padding: 0 14px 0 40px; border-radius: 10px; border: 1px solid var(--line2); background: var(--surface); color: var(--text); font: 400 14px 'JetBrains Mono', monospace; outline: none"></div>
<div class="topactions" style="display: flex; align-items: center; gap: 8px; margin-left: auto">${sweepPill(c)}
<button type="button" class="btn hide-mobile" data-act="theme" aria-label="${c.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}" title="${c.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}" style="width: 44px; padding: 0; color: var(--text2)">${c.theme === 'dark' ? icon('sun') : icon('moon')}</button>
<span style="position: relative; display: inline-flex"><button type="button" class="btn ${c.e.alertsOpen ? 'bell-on' : ''}" data-act="toggle-alerts" aria-label="Alerts" aria-expanded="${c.e.alertsOpen}" title="Alerts" style="width: 44px; padding: 0; color: var(--text2)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg></button>
${count ? `<span class="mono" aria-hidden="true" style="position: absolute; top: 4px; right: 4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--crit); color: var(--on-accent); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; pointer-events: none">${count}</span>` : ''}
${c.e.alertsOpen ? alertsPanel(c, items) : ''}</span>
<button type="button" class="btn hide-mobile ${c.e.settingsOpen ? 'bell-on' : ''}" data-act="open-settings" aria-label="Settings" aria-haspopup="dialog" title="Settings" style="width: 44px; padding: 0; color: var(--text2)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button></div></header>`
}

// ---- sidebar ------------------------------------------------------------

export function sidebar(c: Ctx): string {
  const hot = stackHot(c.rows)
  const inbox = inboxOf(c.rows)
  const exploitedNew = inbox.filter(v => v.exploited).length
  const nav: {
    key: View
    label: string
    count: number | ''
    ncls: string
    section?: string
    icon: keyof typeof icons
  }[] = [
    {
      key: 'inbox',
      label: 'Inbox',
      count: inbox.length,
      ncls: exploitedNew ? 'n-hot' : 'n-new',
      icon: 'inbox',
    },
    { key: 'all', label: 'All threats', count: c.rows.length, ncls: '', icon: 'all' },
    {
      key: 'stack-feed',
      label: 'My stack',
      count: c.rows.filter(v => v.mine).length,
      ncls: hot ? 'n-hot' : '',
      icon: 'stackfeed',
    },
    {
      key: 'triage',
      label: 'Triage',
      count: c.rows.filter(v => v.status).length,
      ncls: '',
      icon: 'triage',
    },
    {
      key: 'scan',
      label: 'Scan dependencies',
      count: '',
      ncls: '',
      section: 'Tools',
      icon: 'scan',
    },
    { key: 'stack', label: 'Edit my stack', count: c.p.stack.length, ncls: '', icon: 'stack' },
    {
      key: 'reports',
      label: 'Field reports',
      count: '',
      ncls: '',
      section: 'Intel',
      icon: 'reports',
    },
    { key: 'sources', label: 'Sources', count: sourceTotal(), ncls: '', icon: 'sources' },
  ]
  const collapsed = c.p.sideCollapsed
  const dogColor = hot ? 'var(--crit)' : 'var(--lime)'
  const barkTitle = hot
    ? `Woof! ${hot} new exploited ${hot === 1 ? 'threat' : 'threats'} in your stack`
    : 'Patrolling. Nothing new in your stack is being exploited'
  return `${c.e.mobileNav ? '<button type="button" class="nav-backdrop" data-act="toggle-nav" aria-label="Close navigation"></button>' : ''}<nav id="wd-side" data-scroll="side" aria-label="Views" class="side ${collapsed ? 'side-collapsed' : ''} ${c.e.mobileNav ? 'side-open' : ''}" style="border-right: 1px solid var(--line); padding: 12px 12px 16px; display: flex; flex-direction: column; gap: 2px; background: var(--glass2)">
<div style="display: flex; justify-content: flex-end; padding-bottom: 6px" class="side-top"><button type="button" class="nav side-toggle" data-act="side" aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" aria-expanded="${!collapsed}" title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" style="width: 40px; min-height: 40px; padding: 0; justify-content: center">${collapsed ? icons.sideExpand : icons.sideCollapse}</button></div>
${nav
  .map(
    n =>
      `${n.section ? `<div class="mono sec-label" style="font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); padding: 14px 12px 6px">${n.section}</div><div class="sec-div" aria-hidden="true"></div>` : ''}<button type="button" class="nav ${c.e.view === n.key ? 'nav-on' : ''}" data-act="go" data-arg="${n.key}" title="${n.label}" aria-label="${n.label}${n.count !== '' ? ', ' + n.count : ''}"${c.e.view === n.key ? ' aria-current="page"' : ''}><span class="nav-ic">${icons[n.icon]}<span class="nav-dot"></span></span><span class="nav-text">${n.label}</span><span class="n ${n.count ? n.ncls : ''}">${n.count}</span></button>`,
  )
  .join('')}
<button type="button" class="side-mini ${hot ? 'barking' : 'calm'}" data-act="go" data-arg="stack-feed" title="${barkTitle}" aria-label="${barkTitle}" style="color: ${dogColor}">${dogFace(30)}${hot ? `<span class="mono bark-count">${hot}</span><span class="mono bark-word">woof!</span>` : ''}</button>
<div class="side-card" style="margin-top: 16px; border: 1px solid ${hot ? 'var(--crit)' : 'var(--line)'}; border-radius: 12px; padding: 14px; background: var(--surface); display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--text2)"><b class="mono" style="font-size: 13px; color: ${hot ? 'var(--crit-t)' : 'var(--lime)'}">${hot ? `// woof! ${hot} exploited` : '// patrolling'}</b><span>${hot ? 'New threats in your stack are being exploited in the wild.' : 'Nothing new in your stack is being exploited.'}</span></div>
<div class="drawer-extra" style="flex-direction: column; gap: 2px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line)"><button type="button" class="nav" data-act="theme"><span class="nav-ic">${c.theme === 'dark' ? icons.sun : icons.moon}</span><span>${c.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}</span></button><button type="button" class="nav" data-act="open-settings"><span class="nav-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg></span><span>Settings</span></button><span class="mono wd-sweep-text" style="padding: 10px 12px 0; font-size: 11.5px; color: var(--dim)">${sweepText(c)}</span></div></nav>`
}

function dogFace(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" style="overflow: visible"><g class="bark-head"><path d="M4 24 L6 14 L7 6 L11 12 L14 7 L16 13 L23 16 Q24.5 17 23.5 18.5 L18 20 L12 23 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><circle class="bark-eye" cx="14.5" cy="15" r="1.6" fill="currentColor"></circle><path class="bark-jaw" d="M18 20 L23 21.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></g><path class="bark-wave w1" d="M26 14 Q28 17 26 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path class="bark-wave w2" d="M28.5 11.5 Q31.5 17 28.5 22.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>`
}

// ---- threat list --------------------------------------------------------

const keyTips: [string, string, string][] = [
  [
    'virus',
    'Virus',
    'Runs code where it shouldn’t: remote code execution, command injection, unsafe deserialization, memory corruption.',
  ],
  ['worm', 'Worm', 'Spreads or floods on its own: wormable flaws and denial-of-service attacks.'],
  [
    'trojan',
    'Trojan',
    'Trojan horse. Arrives in disguise: backdoors, malicious packages, compromised releases.',
  ],
  [
    'hacker',
    'Hacker',
    'Gets past the door checks: auth bypass, privilege escalation, prompt injection, data leaks, SQLi, XSS, SSRF.',
  ],
  ['bug', 'Bug', 'Any other flaw that doesn’t fit the types above.'],
]
const sevTips: [string, string, string][] = [
  ['critical', 'Critical', 'CVSS 9.0–10. Patch now.'],
  ['high', 'High', 'CVSS 7.0–8.9. Patch soon.'],
  ['medium', 'Medium', 'CVSS 4.0–6.9. Patch in your normal cycle.'],
]

function legend(): string {
  return `<section aria-label="What the icons mean" class="legend-pin" style="display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); container-type: inline-size">
<span class="mono lg-key" style="flex: none; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); margin-right: 2px">Key</span>
${keyTips.map(([k, l, tip]) => `<span class="lg" tabindex="0" aria-describedby="lg-${k}"><span class="lg-ic">${icons[k as 'bug']}</span><span class="lg-label">${l}</span><span class="lg-tip" role="tooltip" id="lg-${k}">${tip}</span></span>`).join('')}
<span aria-hidden="true" style="flex: none; width: 1px; height: 24px; background: var(--line2)"></span>
${sevTips.map(([k, l, tip]) => `<span class="lg lg-r" tabindex="0" aria-describedby="lg-${k}"><span class="ic-${k}" style="flex: none; width: 10px; height: 10px; border-radius: 3px; background: currentColor"></span><span class="lg-label">${l}</span><span class="lg-tip" role="tooltip" id="lg-${k}">${tip}</span></span>`).join('')}</section>`
}

function row(v: Row, selected: boolean): string {
  const done = v.status === 'patched' || v.status === 'ignored' || v.status === 'not_affected'
  return `<button type="button" class="trow ${selected ? 'trow-sel' : ''} ${done ? 'trow-done' : ''}" data-act="pick" data-arg="${esc(v.id)}" aria-label="${esc(v.id)}: ${esc(v.title)}">
<span class="ic-${v.severity}" style="display: inline-flex; width: 36px; height: 36px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); align-items: center; justify-content: center">${icons[v.threat]}</span>
<span style="display: flex; flex-direction: column; gap: 2px; min-width: 0"><span class="mono" style="font-size: 13px; font-weight: 600; display: flex; gap: 8px; align-items: center">${esc(v.id)}${v.isNew ? '<span class="newtag">NEW</span>' : ''}</span><span style="font-size: 15px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${esc(v.title)}</span></span>
<span class="sev sev-${v.severity}">${sevShort[v.severity]} ${v.cvss.toFixed(1)}</span>
<span style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px">${v.exploited ? '<span class="kev">exploited</span>' : ''}${v.mine ? '<span class="mono" style="font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--lime)">◆ my stack</span>' : ''}${v.status ? `<span class="st st-${v.status}">${statusLabel[v.status]}</span>` : ''}</span></button>`
}

export function listView(c: Ctx): string {
  const [title, sub] = titles[c.e.view] ?? titles.all!
  const base = inView(c.rows, c.e.view)
  const shown = filtered(base, c.e)
  const cats = (['all', 'packages', 'languages', 'os', 'ai', 'tools', 'supply'] as const).map(
    k => ({
      k,
      n: k === 'all' ? base.length : base.filter(v => v.category === k).length,
    }),
  )
  return `<div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px"><div><h1 style="margin: 0; font-size: 30px; letter-spacing: -0.03em; line-height: 1.1">${title}</h1><p style="margin: 4px 0 0; color: var(--muted); font-size: 14px">${sub}</p></div>
<div style="display: flex; gap: 8px">${c.e.view === 'inbox' ? '<button type="button" class="btn btn-g" data-act="clear-inbox">Mark all as read</button>' : ''}<button type="button" class="btn btn-g" data-act="export-csv">Export CSV</button></div></div>
<div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center"><div style="display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg2)">${cats
    .map(
      ({ k, n }) =>
        `<button type="button" class="seg ${c.e.cat === k ? 'seg-on' : ''}" data-act="cat" data-arg="${k}">${catLabel[k]}<span class="mono" style="font-size: 11px; color: var(--dim)">${n}</span></button>`,
    )
    .join('')}</div>
<button type="button" class="pick ${c.e.exp ? 'pick-on' : ''}" data-act="exploited" aria-pressed="${c.e.exp}" style="gap: 8px"><span style="width: 8px; height: 8px; border-radius: 50%; background: var(--crit)"></span>Exploited only</button><span class="mono" style="margin-left: auto; font-size: 12px; color: var(--dim)">Riskiest first</span></div>
${paneScroll(c)}${shown.length === 0 ? emptyState(c) : ''}
<div style="display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface)">${shown.map(v => row(v, v.id === c.e.sel)).join('')}</div></div>
${legend()}`
}

/** The part of a page below its header. On large screens it scrolls by itself while the header stays put. */
const paneScroll = (c: Ctx) => `<div class="pane-scroll" data-scroll="main-${c.e.view}">`

function emptyState(c: Ctx): string {
  const msg =
    c.e.view === 'inbox'
      ? '<b style="color: var(--text)">Inbox zero.</b> Nothing new since you last cleared it. The dog keeps patrolling.'
      : c.e.view === 'stack-feed' && c.p.stack.length === 0
        ? '<b style="color: var(--text)">Your stack is empty.</b> Tell the dog what you run in <b>Edit my stack</b>.'
        : '<b style="color: var(--text)">Nothing here.</b> No threats match these filters.'
  return `<div style="border: 1px dashed var(--line2); border-radius: 14px; padding: 40px 20px; text-align: center; color: var(--muted)">${msg}</div>`
}

// ---- detail panel -------------------------------------------------------

function advisoriesBox(v: Row): string {
  if (!v.advisories?.length) return ''
  return `<div style="border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--surface); display: flex; flex-direction: column; gap: 8px"><span class="mono" style="font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim)">Advisories</span>${v.advisories
    .slice(0, 6)
    .map(
      a =>
        `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener" style="font-size: 13px; line-height: 1.4"><span class="mono" style="color: var(--dim)">${esc(a.source)}</span> ${esc(a.title)} ↗</a>`,
    )
    .join('')}</div>`
}

/** Holds the details column on large screens while nothing is picked; hidden below that. */
const detailEmpty = `<aside aria-label="Threat details" class="detail-pane detail-empty" style="flex: 1 1 380px; max-width: 460px; min-width: 0; border-left: 1px solid var(--line); background: var(--bg2); padding: 20px 22px 40px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center">
<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" style="color: var(--dim)"><circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5L21 21"></path></svg>
<span class="mono" style="font-size: 12px; color: var(--lime); letter-spacing: .12em; text-transform: uppercase">under the magnifier</span>
<span style="font-size: 14px; color: var(--muted); max-width: 260px">Pick a threat from the list to see its details, fix and triage here.</span></aside>`

export function detail(c: Ctx): string {
  const v = c.rows.find(r => r.id === c.e.sel)
  if (!v) return ''
  const cmd = fixCommand(v)
  const product = (v.eco ? v.eco + ' · ' : '') + v.pkg
  const picks = (Object.keys(statusLabel) as TriageStatus[])
    .map(
      k =>
        `<button type="button" class="pick ${v.status === k ? 'pick-on' : ''}" data-act="triage" data-arg="${k}" aria-pressed="${v.status === k}">${statusLabel[k]}</button>`,
    )
    .join('')
  const cmdBox = (text: string) =>
    `<div class="cmd"><code>${esc(text)}</code><button type="button" data-act="copy" data-arg="${esc(text)}" class="mono" style="all: unset; cursor: pointer; border-left: 1px solid var(--line2); background: var(--surface); color: var(--text2); padding: 10px 12px; font: 600 12px 'JetBrains Mono', monospace">Copy</button></div>`
  return `<aside aria-label="Threat details" class="panel-in detail-pane" data-scroll="detail-${esc(v.id)}" style="flex: 1 1 380px; max-width: 460px; min-width: 0; border-left: 1px solid var(--line); background: var(--bg2); padding: 20px 22px 40px; display: flex; flex-direction: column; gap: 18px">
<div style="display: flex; justify-content: space-between; align-items: center"><span class="mono" style="font-size: 12px; color: var(--lime); letter-spacing: .12em; text-transform: uppercase">under the magnifier</span><button type="button" class="btn" data-act="close-detail" aria-label="Close details" style="width: 44px; padding: 0; color: var(--text2)">${closeIcon()}</button></div>
<div style="display: flex; flex-direction: column; gap: 6px"><span class="mono" style="font-size: 21px; font-weight: 700">${esc(v.id)}</span><h2 style="margin: 0; font-size: 19px; line-height: 1.3">${esc(v.title)}</h2></div>
<div style="display: flex; flex-direction: column; gap: 8px" class="ic-${v.severity}"><div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--muted)"><span>CVSS base score · ${esc(v.published)}</span><b class="mono ic-${v.severity}" style="font-size: 26px">${v.cvss.toFixed(1)}</b></div><div style="height: 8px; border-radius: 4px; background: var(--line); overflow: hidden"><div style="height: 100%; width: ${Math.round(v.cvss * 10)}%; background: currentColor; border-radius: 4px"></div></div></div>
${v.exploited ? `<div style="border: 1px solid var(--crit); background: var(--crit-bg); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px"><span class="kev">exploited in the wild</span><span style="font-size: 14px; color: var(--crit-soft)">Listed in CISA’s KEV catalog. Required action: ${esc(v.kevAction ?? 'See the KEV entry.')}</span></div>` : ''}
<p style="margin: 0; color: var(--text2); line-height: 1.6">${esc(v.summary)}</p>
<div style="border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--surface); display: flex; flex-direction: column; gap: 10px"><span class="mono" style="font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim)">How to fix</span>
<dl style="margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 13px"><dt style="color: var(--dim)">Package</dt><dd class="mono" style="margin: 0">${esc(product)}</dd><dt style="color: var(--dim)">Affected</dt><dd class="mono" style="margin: 0; color: var(--high-t)">${esc(v.affected ?? 'See advisory')}</dd><dt style="color: var(--dim)">Fixed in</dt><dd class="mono" style="margin: 0; color: var(--lime)">${esc(v.fixed ?? 'See advisory')}</dd></dl>${cmd ? cmdBox(cmd) : ''}</div>
${advisoriesBox(v)}<div style="border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--surface); display: flex; flex-direction: column; gap: 10px"><span class="mono" style="font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim)">Your triage</span><div style="display: flex; flex-wrap: wrap; gap: 6px">${picks}</div>
<label for="wd-note" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Notes</label><textarea id="wd-note" data-in="note" rows="2" placeholder="Notes: where it runs, owner, ticket…" style="width: 100%; border-radius: 10px; border: 1px solid var(--line2); background: var(--bg); color: var(--text); padding: 10px 12px; font: 400 13px 'JetBrains Mono', monospace; resize: vertical">${esc(c.p.notes[v.id] ?? '')}</textarea></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px"><button type="button" class="btn btn-p" data-act="issue">Open GitHub issue</button><button type="button" class="btn btn-g" data-act="copy-md">Copy as Markdown</button><button type="button" class="btn btn-g" data-act="copy-link">Copy link</button><button type="button" class="btn btn-g" data-act="add-stack">Add to my stack</button></div></aside>`
}

// ---- stack --------------------------------------------------------------

export function acMatches(c: Pick<Ctx, 'p' | 'e'>): CatalogEntry[] {
  const q = c.e.acQuery.trim().toLowerCase()
  if (!q) return []
  const all: CatalogEntry[] = [
    ...(catalog as CatalogEntry[]),
    ...presets.map(([, l]) => ({ label: l, kind: 'Quick add' })),
  ]
  const out = all
    .filter(
      (x, i, arr) =>
        x.label.includes(q) &&
        !c.p.stack.includes(x.label) &&
        arr.findIndex(d => d.label === x.label) === i,
    )
    .sort((a, b) => a.label.indexOf(q) - b.label.indexOf(q) || a.label.length - b.label.length)
    .slice(0, 6)
  if (!c.p.stack.includes(q) && !out.some(x => x.label === q))
    out.push({ label: q, kind: 'Add as typed' })
  return out
}

export function stackView(c: Ctx): string {
  const m = acMatches(c)
  const idx = Math.min(c.e.acIndex, Math.max(m.length - 1, 0))
  return `<div><h1 style="margin: 0; font-size: 30px; letter-spacing: -0.03em">My stack</h1><p style="margin: 4px 0 0; color: var(--muted); font-size: 14px">Tell the dog what you run. Matching threats land in your inbox and raise the alarm.</p></div>
${paneScroll(c)}<div style="border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 18px; display: flex; flex-direction: column; gap: 14px"><h2 style="margin: 0; font-size: 18px">Quick add</h2>
<div style="display: flex; flex-wrap: wrap; gap: 8px">${presets
    .map(([label, term]) => {
      const on = c.p.stack.includes(term)
      return `<button type="button" class="preset ${on ? 'preset-on' : ''}" data-act="preset" data-arg="${esc(term)}" aria-pressed="${on}">${on ? '✓' : '+'} ${label}</button>`
    })
    .join('')}</div>
<div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 16px"><label for="wd-stack-add" style="font-size: 14px; font-weight: 600; color: var(--text)">Not in the list? Add anything you run</label>
<div style="position: relative; display: flex; gap: 8px; align-items: flex-start"><div style="position: relative; flex: 1; min-width: 0">
<input id="wd-stack-add" data-in="ac" type="text" role="combobox" aria-autocomplete="list" aria-expanded="${m.length > 0}" aria-controls="wd-ac-list" autocomplete="off" value="${esc(c.e.acQuery)}" placeholder="Package, product, OS or tool, e.g. django, kafka, vmware esxi" style="min-height: 44px; width: 100%; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line2); background: var(--bg); color: var(--text); font: 400 14px 'JetBrains Mono', monospace; outline: none">
${
  m.length
    ? `<div id="wd-ac-list" role="listbox" aria-label="Suggestions" class="pop-in" style="position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 25; background: var(--bg2); border: 1px solid var(--line2); border-radius: 12px; box-shadow: 0 20px 50px -20px rgba(0,0,0,.55); padding: 6px; display: flex; flex-direction: column">${m
        .map(
          (x, i) =>
            `<button type="button" role="option" aria-selected="${i === idx}" class="acopt ${i === idx ? 'acopt-on' : ''}" data-act="ac-pick" data-arg="${esc(x.label)}"><span style="flex: 1; min-width: 0; font: 500 14px 'JetBrains Mono', monospace; color: var(--text)">${esc(x.label)}</span><span class="mono" style="flex: none; font-size: 11px; color: var(--dim); border: 1px solid var(--line2); border-radius: 6px; padding: 2px 7px">${esc(x.kind)}</span></button>`,
        )
        .join('')}</div>`
    : ''
}</div><button type="button" class="btn btn-p" data-act="ac-add">Add</button></div>
<span style="font-size: 12px; color: var(--dim)">Press Enter or Add. ↑ and ↓ pick a suggestion. Anything you type is matched as a whole word in threat titles, products and packages.</span></div>
<div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 16px"><span style="font-size: 14px; font-weight: 600; color: var(--text)">In your stack <span class="mono" style="font-weight: 400; color: var(--dim)">${c.p.stack.length}</span></span>
<div style="display: flex; flex-wrap: wrap; gap: 8px">${c.p.stack
    .map(
      n =>
        `<span style="display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 4px 0 12px; border-radius: 999px; border: 1px solid var(--lime); color: var(--text); font: 500 13px 'JetBrains Mono', monospace">${esc(n)}<button type="button" data-act="stack-remove" data-arg="${esc(n)}" aria-label="Remove ${esc(n)}" style="all: unset; box-sizing: border-box; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: var(--dim); cursor: pointer">${closeIcon(16)}</button></span>`,
    )
    .join('')}</div></div></div></div>`
}

// ---- sources ------------------------------------------------------------

export const sourceGroups = sources as SourceGroup[]
export const sourceTotal = () => sourceGroups.reduce((n, g) => n + g.items.length, 0)

export function sourcesView(c: Ctx): string {
  const st = new Map((c.data.status?.sources ?? []).map(x => [x.id, x]))
  const badge = (id: string, mode: string): string => {
    const r = st.get(id)
    if (mode === 'link-only')
      return '<span class="mono" style="font-size: 11px; color: var(--dim)">link only</span>'
    if (!r) return '<span class="mono" style="font-size: 11px; color: var(--dim)">collected</span>'
    return r.ok
      ? `<span class="mono" style="font-size: 11px; color: var(--lime)">✓ ${r.count}</span>`
      : `<span class="mono" style="font-size: 11px; color: var(--crit-t)" title="${esc(r.error ?? '')}">✗ failed, kept last result</span>`
  }
  return `<div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px"><div><h1 style="margin: 0; font-size: 30px; letter-spacing: -0.03em">Sources</h1><p style="margin: 4px 0 0; color: var(--muted); font-size: 14px">${sourceTotal()} trusted sources the dog patrols twice a day, at 07:00 and 14:00 UTC, in ${sourceGroups.length} groups.${c.data.status ? ` Last sweep ${esc(c.data.status.collectedAt.slice(0, 16).replace('T', ' '))} UTC.` : ''}</p></div></div>
${paneScroll(c)}<div style="display: flex; flex-direction: column; gap: 16px">${sourceGroups
    .map(
      g => `<section class="srcgroup" aria-label="${esc(g.name)}"><div style="display: flex; align-items: center; gap: 12px"><span class="srcgroup-ic" style="color: ${g.color}">${icons[g.icon]}</span><span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px"><span style="display: flex; align-items: baseline; gap: 8px"><h2 style="margin: 0; font-size: 17px">${esc(g.name)}</h2><span class="mono" style="font-size: 12px; color: var(--dim)">${g.items.length}</span></span><span style="font-size: 12.5px; line-height: 1.45; color: var(--muted)">${esc(g.desc)}</span></span></div>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; margin-top: 2px">${g.items
        .map(
          it =>
            `<a class="srcitem" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener"><span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 14px; font-weight: 600; color: var(--text)">${esc(it.name)}</span><span class="mono" style="font-size: 12px; color: var(--lime); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${esc(it.url)}</span></span>${badge(it.id, it.mode)}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: none; color: var(--dim)"><path d="M7 17L17 7M8 7h9v9"></path></svg></a>`,
        )
        .join('')}</div></section>`,
    )
    .join('')}</div></div>`
}

// ---- field reports ------------------------------------------------------

const LAB_COLORS: Record<string, string> = {
  kaspersky: 'var(--lime)',
  eset: 'var(--blue)',
  sophos: 'var(--high)',
  microsoft: 'var(--med)',
  pz: 'var(--crit)',
}
const SHORT: Record<string, string> = {
  kaspersky: 'Kaspersky',
  eset: 'ESET',
  sophos: 'Sophos',
  microsoft: 'Microsoft',
  pz: 'Project Zero',
}
const FALLBACK = ['var(--blue)', 'var(--high)', 'var(--lime)', 'var(--med)', 'var(--crit)']

export function reportsView(c: Ctx): string {
  const d = c.data.reports
  const items = d?.items ?? []
  const labs = [...new Map(items.map(r => [r.key, r.lab])).entries()]
  const color = (key: string) =>
    LAB_COLORS[key] ??
    FALLBACK[[...key].reduce((n, ch) => n + ch.charCodeAt(0), 0) % FALLBACK.length]!
  const shown = items.filter(r => c.e.lab === 'all' || r.key === c.e.lab)
  const known = new Set(c.rows.map(r => r.id))
  const chip = (k: string, label: string, n: number) =>
    `<button type="button" class="seg ${c.e.lab === k ? 'seg-on' : ''}" data-act="lab" data-arg="${esc(k)}">${esc(label)}<span class="mono" style="font-size: 11px; color: var(--dim)">${n}</span></button>`
  return `<div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px"><div><h1 style="margin: 0; font-size: 30px; letter-spacing: -0.03em">Field reports</h1><p style="margin: 4px 0 0; color: var(--muted); font-size: 14px">Research from antivirus vendors and security labs, linked to the threats it covers.</p></div><a href="#" data-act="go" data-arg="sources" class="mono" style="font-size: 13px">Lab feeds in Sources →</a></div>
${d?.sample ? '<div style="border: 1px solid var(--lime); background: var(--sel-bg); border-radius: 12px; padding: 12px 14px; font-size: 14px; color: var(--text2)">These are <b style="color: var(--text)">sample reports</b>. The daily sweep fills this page with the last three weeks of posts from each lab’s feed.</div>' : ''}
<div style="display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg2); align-self: flex-start">${chip('all', 'All labs', items.length)}${labs.map(([k, l]) => chip(k, SHORT[k] ?? l, items.filter(r => r.key === k).length)).join('')}</div>
${paneScroll(c)}<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 14px">${shown
    .map(r => {
      const col = color(r.key)
      const site = (() => {
        try {
          return new URL(r.url).hostname.replace(/^www\./, '')
        } catch {
          return r.url
        }
      })()
      return `<article class="repcard"><div style="display: flex; align-items: center; gap: 10px"><span class="mono replab" style="color: ${col}; border-color: ${col}">${esc(
        r.lab
          .split(/\s+/)
          .slice(0, 2)
          .map(w => w[0] ?? '')
          .join('')
          .toUpperCase(),
      )}</span><span style="flex: 1; min-width: 0; display: flex; flex-direction: column"><span style="font-size: 13px; font-weight: 600; color: var(--text2)">${esc(r.lab)}</span><span class="mono" style="font-size: 12px; color: var(--dim)">${esc(r.date)}</span></span></div>
<h2 style="margin: 0; font-size: 17px; line-height: 1.35">${esc(r.title)}</h2><p style="margin: 0; font-size: 14px; line-height: 1.55; color: var(--muted)">${esc(r.summary)}</p>
${r.cves.length ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center"><span style="font-size: 12px; color: var(--dim)">Covers</span>${r.cves.map(id => (known.has(id) ? `<button type="button" class="cvechip cvechip-feed" data-act="open-cve" data-arg="${esc(id)}" title="Open in watchdog">${esc(id)}</button>` : `<span class="cvechip" title="Not in the current feed">${esc(id)}</span>`)).join('')}</div>` : ''}
<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener" class="mono" style="margin-top: auto; font-size: 13px; align-self: flex-start; padding: 8px 0">Read on ${esc(site)} ↗</a></article>`
    })
    .join('')}</div></div>`
}

// ---- scan ---------------------------------------------------------------

const SAMPLE_SCAN =
  '{\n  "dependencies": {\n    "next": "14.1.0",\n    "follow-redirects": "1.15.5",\n    "@modelcontextprotocol/inspector": "0.13.0"\n  }\n}'

export function scanView(c: Ctx): string {
  const s = c.e.scan
  const critical = s
    ? s.findings.filter(f => f.threats.some(t => t.severity === 'critical')).length
    : 0
  const osvOnly = s?.osv ?? []
  const vulnerable = (s?.findings.length ?? 0) + osvOnly.length
  const cmdBox = (text: string) =>
    `<div class="cmd"><code>${esc(text)}</code><button type="button" data-act="copy" data-arg="${esc(text)}" class="mono" style="all: unset; cursor: pointer; border-left: 1px solid var(--line2); background: var(--surface); color: var(--text2); padding: 10px 12px; font: 600 12px 'JetBrains Mono', monospace">Copy</button></div>`
  const results = !s
    ? '<span style="color: var(--muted); font-size: 14px">Results show up here. Drop a file or paste its contents, then press <b>Sniff it</b>.</span>'
    : `<div class="mono" style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 14px; font-weight: 600"><span>${s.deps.length} deps scanned</span><span class="${vulnerable ? 'ic-high' : ''}">${vulnerable} vulnerable</span><span class="${critical ? 'ic-critical' : ''}">${critical} critical</span></div>
${s.note ? `<span style="font-size: 13px; color: var(--muted)">${esc(s.note)}</span>` : ''}
${s.findings
  .map(
    f => `<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--line)"><div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: center"><span class="mono" style="font-weight: 600; font-size: 14px">${esc(f.dep.name)} <span style="color: var(--dim)">${esc(f.dep.version)}</span></span>${f.target ? `<span class="mono" style="font-size: 12px">${esc(f.dep.eco)} → <span style="color: var(--lime)">${esc(f.target)}</span></span>` : ''}</div>
<div style="display: flex; flex-wrap: wrap; gap: 6px">${f.threats.map(t => `<button type="button" class="sev sev-${t.severity}" data-act="open-cve" data-arg="${esc(t.id)}" style="all: unset; cursor: pointer; box-sizing: border-box" title="${esc(t.title)}"><span class="sev sev-${t.severity}">${esc(t.id)}</span></button>`).join('')}</div>${f.cmd ? cmdBox(f.cmd) : ''}</div>`,
  )
  .join('')}
${osvOnly
  .map(
    h =>
      `<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--line)"><span class="mono" style="font-weight: 600; font-size: 14px">${esc(h.dep.name)} <span style="color: var(--dim)">${esc(h.dep.version)}</span> <span style="font-size: 11px; color: var(--dim)">via OSV.dev</span></span><div style="display: flex; flex-wrap: wrap; gap: 6px">${h.ids
        .slice(0, 12)
        .map(
          id =>
            `<a class="cvechip cvechip-feed" href="https://osv.dev/vulnerability/${encodeURIComponent(id)}" target="_blank" rel="noopener">${esc(id)}</a>`,
        )
        .join('')}</div></div>`,
  )
  .join('')}
${vulnerable === 0 ? `<div style="border: 1px dashed var(--line2); border-radius: 12px; padding: 20px; text-align: center; color: var(--muted)"><b style="color: var(--text)">Clean.</b> Nothing known in these ${s.deps.length} dependencies.</div>` : ''}`
  return `<div><h1 style="margin: 0; font-size: 30px; letter-spacing: -0.03em">Scan dependencies</h1><p style="margin: 4px 0 0; color: var(--muted); font-size: 14px">Drop a manifest or lockfile. watchdog checks every dependency against today’s feed, then tells you what to upgrade.</p></div>
${paneScroll(c)}<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 18px; align-items: start">
<div style="border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 18px; display: flex; flex-direction: column; gap: 14px">
<label for="wd-scan-file" data-drop style="display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 26px 16px; border: 1.5px dashed var(--line2); border-radius: 12px; color: var(--muted); cursor: pointer"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"></path></svg><b style="color: var(--text)">${c.e.scanFile ? esc(c.e.scanFile) : 'package.json'}</b><span class="mono" style="font-size: 11px; line-height: 1.6">package-lock.json · requirements.txt · go.mod · Cargo.lock · Gemfile.lock · composer.lock · pom.xml</span></label>
<input id="wd-scan-file" data-in="scan-file" type="file" style="position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none">
<label for="wd-scan-text" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Dependency file contents</label>
<textarea id="wd-scan-text" data-in="scan-text" rows="8" spellcheck="false" placeholder="${esc(SAMPLE_SCAN)}" style="width: 100%; border-radius: 10px; border: 1px solid var(--line2); background: var(--bg); color: var(--text2); padding: 12px; font: 400 13px 'JetBrains Mono', monospace; resize: vertical">${esc(c.e.scanText)}</textarea>
<div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center"><label style="display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text2); min-height: 44px; cursor: pointer"><input type="checkbox" data-in="scan-osv" ${c.e.scanOsv ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--lime)">Check with OSV.dev</label><button type="button" class="btn btn-p" data-act="scan-run" style="margin-left: auto" ${c.e.scanBusy ? 'disabled' : ''}>${c.e.scanBusy ? 'Sniffing…' : 'Sniff it'}</button></div>
<span style="font-size: 12px; color: var(--dim)">Files are read in your browser. Without the OSV box ticked nothing leaves it. With it, only package names, ecosystems and versions go to api.osv.dev.</span></div>
<div style="border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 18px; display: flex; flex-direction: column; gap: 12px" aria-live="polite">${results}</div></div></div>`
}

// ---- settings -----------------------------------------------------------

const removeIcon =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>'

function labelField(c: Ctx): string {
  const labels = labelList(c.p.labels)
  return `<div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted)"><label for="wd-labels">Labels added to new issues</label>
<div class="chipbox">${labels.map(l => `<span class="lchip">${esc(l)}<button type="button" data-act="label-remove" data-arg="${esc(l)}" aria-label="Remove label ${esc(l)}">${removeIcon}</button></span>`).join('')}<input id="wd-labels" data-in="label-draft" value="${esc(c.e.labelDraft)}" placeholder="${labels.length ? 'Add another label' : 'e.g. security'}" autocomplete="off" style="flex: 1 1 120px; min-width: 120px; min-height: 32px; border: 0; padding: 0 4px; background: transparent; color: var(--text); font: 400 14px 'JetBrains Mono', monospace; outline: none"></div>
<span style="font-size: 12px; color: var(--dim)">Press Enter or comma to add a label. Backspace in the empty field removes the last one.</span></div>`
}

export function settings(c: Ctx): string {
  if (!c.e.settingsOpen) return ''
  const input = (id: string, key: string, label: string, val: string, ph: string) =>
    `<label for="${id}" style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted)">${label}<input id="${id}" data-in="${key}" value="${esc(val)}" placeholder="${ph}" style="min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line2); background: var(--surface); color: var(--text); font: 400 14px 'JetBrains Mono', monospace; outline: none"></label>`
  const h = (t: string) =>
    `<span class="mono" style="font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim)">${t}</span>`
  return `<div data-act="scrim" style="position: fixed; inset: 0; z-index: 50; background: rgba(4,6,8,.6); display: flex; align-items: flex-start; justify-content: center; padding: 72px 16px 24px; overflow-y: auto">
<div role="dialog" aria-modal="true" aria-labelledby="wd-set-title" class="pop-in" style="width: 520px; max-width: 100%; background: var(--bg2); border: 1px solid var(--line2); border-radius: 16px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.6); display: flex; flex-direction: column">
<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 18px 22px; border-bottom: 1px solid var(--line)"><h2 id="wd-set-title" style="margin: 0; font-size: 20px; letter-spacing: -0.02em">Settings</h2><button type="button" class="btn" data-act="close-settings" aria-label="Close settings" style="width: 40px; min-height: 40px; padding: 0; color: var(--text2)">${closeIcon()}</button></div>
<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 22px">
<div style="display: flex; flex-direction: column; gap: 8px">${h('Appearance')}<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px"><span style="font-size: 14px; color: var(--text)">Theme</span><div style="display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg)">${(['dark', 'light'] as const).map(t => `<button type="button" class="seg ${c.theme === t ? 'seg-on' : ''}" data-act="set-theme" data-arg="${t}">${t === 'dark' ? 'Dark' : 'Light'}</button>`).join('')}</div></div></div>
<div style="display: flex; flex-direction: column; gap: 10px">${h('GitHub issues')}${input('wd-repo', 'repo', 'Repository for “Open GitHub issue”', c.p.repo, 'owner/repo')}${labelField(c)}<span style="font-size: 12px; color: var(--dim)">Issues open pre-filled on github.com. Nothing is posted without you.</span></div>
<div style="display: flex; flex-direction: column; gap: 10px">${h('Your data')}<span style="font-size: 13px; line-height: 1.5; color: var(--muted)">Your stack (${c.p.stack.length} entries), triage statuses (${Object.keys(c.p.triage).length}) and notes live in this browser only. Export them to move machines or share with your team.</span>
<div style="display: flex; flex-wrap: wrap; gap: 8px"><button type="button" class="btn btn-g" data-act="export-json" style="min-height: 40px; font-size: 13px">Export JSON</button><button type="button" class="btn btn-g" data-act="import-json" style="min-height: 40px; font-size: 13px">Import JSON</button><button type="button" class="btn" data-act="reset" style="min-height: 40px; font-size: 13px; border: 1px solid var(--crit); color: var(--crit-t)">Reset everything</button></div></div>
</div>
<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--line)"><span class="mono" style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dim)"><a href="${REPO_URL}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--text2)">watchdog on ${icons.github}</a> at <a href="${REPO_URL}/releases/tag/v${esc(c.version)}" target="_blank" rel="noopener" title="Release notes for v${esc(c.version)}">v${esc(c.version)}</a></span><button type="button" class="btn btn-p" data-act="close-settings">Done</button></div></div></div>`
}

export function main(c: Ctx): string {
  if (!c.data.threats) return '<p class="mono" style="color: var(--muted)">Loading the feed…</p>'
  switch (c.e.view) {
    case 'scan':
      return scanView(c)
    case 'stack':
      return stackView(c)
    case 'reports':
      return reportsView(c)
    case 'sources':
      return sourcesView(c)
    default:
      return listView(c)
  }
}

export function shell(c: Ctx): string {
  const showDetail = isListView(c.e.view) && c.e.sel && c.rows.some(r => r.id === c.e.sel)
  return `<div class="wd-${c.theme}" style="position: relative; min-height: 100vh; background-color: var(--bg); background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 40px 40px; color: var(--text); font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 15px">
${header(c)}<div class="layout" style="display: flex; flex-wrap: wrap; align-items: stretch; min-height: calc(100vh - 64px)">${sidebar(c)}<main id="wd-main" class="mainpane" tabindex="-1" style="flex: 999 1 520px; min-width: 0; padding: 24px 28px 48px; display: flex; flex-direction: column; gap: 18px; outline: none">${main(c)}</main>${showDetail ? detail(c) : isListView(c.e.view) ? detailEmpty : ''}</div>${settings(c)}</div>`
}

export { byRisk }
