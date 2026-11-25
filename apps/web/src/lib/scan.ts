import { fixCommand } from './fixcmd'
import type { Threat } from './types'
import { compareVersions, isAffected } from './version'

export type Ecosystem = 'npm' | 'PyPI' | 'Maven' | 'Go' | 'crates.io' | 'RubyGems' | 'Packagist'
export interface Dep {
  name: string
  version: string
  eco: Ecosystem
}

export const SCAN_FORMATS = [
  'package.json',
  'package-lock.json',
  'requirements.txt',
  'go.mod',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'pom.xml',
] as const

const clean = (v: string) =>
  v
    .trim()
    .replace(/^[\^~>=<v\s]+/, '')
    .split(/[\s,|]/)[0] ?? ''
const unique = (deps: Dep[]) => [
  ...new Map(deps.map(d => [`${d.eco}:${d.name}@${d.version}`, d])).values(),
]

/** Pick a parser from the file name, falling back to sniffing the content. */
export function detectFormat(text: string, fileName = ''): (typeof SCAN_FORMATS)[number] | null {
  const f = fileName.toLowerCase().split('/').pop() ?? ''
  const hit = SCAN_FORMATS.find(x => x.toLowerCase() === f)
  if (hit) return hit
  const t = text.trimStart()
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>
      if ('lockfileVersion' in j) return 'package-lock.json'
      if ('content-hash' in j || (Array.isArray(j.packages) && !('lockfileVersion' in j)))
        return 'composer.lock'
      return 'package.json'
    } catch {
      return null
    }
  }
  if (/^\s*<project[\s>]/m.test(t) || t.includes('<dependencies>')) return 'pom.xml'
  if (/^module\s+\S+/m.test(t) || /^require\s/m.test(t)) return 'go.mod'
  if (/^\[\[package\]\]/m.test(t)) return 'Cargo.lock'
  if (/^\s+specs:/m.test(t) || /^GEM$/m.test(t)) return 'Gemfile.lock'
  if (/^[A-Za-z0-9_.[\]-]+\s*==\s*\S+/m.test(t)) return 'requirements.txt'
  return null
}

/** Never throws: a file that cannot be read gives no dependencies. */
export function parseDeps(text: string, fileName = ''): Dep[] {
  try {
    return parseFormat(text, detectFormat(text, fileName))
  } catch {
    return []
  }
}

function parseFormat(text: string, fmt: ReturnType<typeof detectFormat>): Dep[] {
  switch (fmt) {
    case 'package.json':
      return unique(packageJson(text))
    case 'package-lock.json':
      return unique(packageLock(text))
    case 'requirements.txt':
      return unique(requirements(text))
    case 'go.mod':
      return unique(goMod(text))
    case 'Cargo.lock':
      return unique(cargoLock(text))
    case 'Gemfile.lock':
      return unique(gemfileLock(text))
    case 'composer.lock':
      return unique(composerLock(text))
    case 'pom.xml':
      return unique(pomXml(text))
    default:
      return []
  }
}

function packageJson(text: string): Dep[] {
  const j = JSON.parse(text) as Record<string, Record<string, string> | undefined>
  const out: Dep[] = []
  for (const key of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, range] of Object.entries(j[key] ?? {})) {
      const version = clean(String(range))
      if (/^\d/.test(version)) out.push({ name, version, eco: 'npm' })
    }
  }
  return out
}

function packageLock(text: string): Dep[] {
  const j = JSON.parse(text) as {
    packages?: Record<string, { version?: string }>
    dependencies?: Record<string, { version?: string; dependencies?: unknown }>
  }
  const out: Dep[] = []
  for (const [path, info] of Object.entries(j.packages ?? {})) {
    const name = path.split('node_modules/').pop()
    if (path && name && info.version) out.push({ name, version: info.version, eco: 'npm' })
  }
  const walk = (deps: Record<string, { version?: string; dependencies?: unknown }> | undefined) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      if (info.version) out.push({ name, version: info.version, eco: 'npm' })
      walk(info.dependencies as typeof deps)
    }
  }
  if (!j.packages) walk(j.dependencies)
  return out
}

function requirements(text: string): Dep[] {
  const out: Dep[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*===?\s*([^\s;#]+)/.exec(line)
    if (m) out.push({ name: m[1]!.toLowerCase().replace(/_/g, '-'), version: m[2]!, eco: 'PyPI' })
  }
  return out
}

function goMod(text: string): Dep[] {
  const out: Dep[] = []
  const go = /^go\s+(\d+\.\d+(?:\.\d+)?)/m.exec(text)
  const tc = /^toolchain\s+go(\d+\.\d+(?:\.\d+)?)/m.exec(text)
  const std = tc?.[1] ?? go?.[1]
  if (std)
    out.push({ name: 'stdlib', version: std.split('.').length === 2 ? `${std}.0` : std, eco: 'Go' })
  for (const m of text.matchAll(/^\s*(?:require\s+)?([\w.~-]+\.[\w./~-]+)\s+v(\d[\w.+-]*)/gm)) {
    out.push({ name: m[1]!, version: m[2]!, eco: 'Go' })
  }
  return out
}

function cargoLock(text: string): Dep[] {
  return text
    .split(/^\[\[package\]\]/m)
    .slice(1)
    .flatMap(block => {
      const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1]
      const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1]
      return name && version ? [{ name, version, eco: 'crates.io' as const }] : []
    })
}

function gemfileLock(text: string): Dep[] {
  const out: Dep[] = []
  for (const m of text.matchAll(/^ {4}([\w.-]+) \((\d[^)\s,]*)\)/gm))
    out.push({ name: m[1]!, version: m[2]!, eco: 'RubyGems' })
  return out
}

function composerLock(text: string): Dep[] {
  const j = JSON.parse(text) as Record<string, { name?: string; version?: string }[] | undefined>
  return [...(j.packages ?? []), ...(j['packages-dev'] ?? [])].flatMap(p =>
    p.name && p.version
      ? [{ name: p.name, version: p.version.replace(/^v/, ''), eco: 'Packagist' as const }]
      : [],
  )
}

function pomXml(text: string): Dep[] {
  const out: Dep[] = []
  const props: Record<string, string> = {}
  for (const m of text.matchAll(/<([\w.-]+)>([^<$]+)<\/\1>/g)) props[m[1]!] = m[2]!.trim()
  for (const m of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const body = m[1]!
    const g = /<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(body)?.[1]
    const a = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(body)?.[1]
    let v = /<version>\s*([^<\s]+)\s*<\/version>/.exec(body)?.[1]
    const ref = v && /^\$\{(.+)\}$/.exec(v)
    if (ref) v = props[ref[1]!]
    if (g && a && v && /^\d/.test(v)) out.push({ name: `${g}:${a}`, version: v, eco: 'Maven' })
  }
  return out
}

// ---- matching -----------------------------------------------------------

export interface Finding {
  dep: Dep
  threats: Threat[]
  /** Highest fixed version across the threats, when known. */
  target: string
  cmd: string
}

/** The highest version number mentioned in a free-text "fixed" field. */
export function highestFixed(threats: Pick<Threat, 'fixed'>[]): string {
  const all = threats.flatMap(t => String(t.fixed ?? '').match(/\d+(\.\d+)+/g) ?? [])
  return all.sort(compareVersions).at(-1) ?? ''
}

export function matchDeps(deps: Dep[], threats: Threat[]): Finding[] {
  const out: Finding[] = []
  for (const dep of deps) {
    const hits = threats.filter(
      t =>
        t.eco === dep.eco &&
        t.pkg.toLowerCase() === dep.name.toLowerCase() &&
        isAffected(dep.version, t.affected),
    )
    if (!hits.length) continue
    const target = highestFixed(hits)
    const top = hits.find(t => String(t.fixed ?? '').includes(target)) ?? hits[0]!
    out.push({
      dep,
      threats: hits,
      target,
      cmd: fixCommand({ eco: dep.eco, pkg: dep.name, fixed: top.fixed }),
    })
  }
  return out.sort(
    (a, b) => Math.max(...b.threats.map(t => t.cvss)) - Math.max(...a.threats.map(t => t.cvss)),
  )
}

// ---- alerts ---------------------------------------------------------------

/** Alerts not yet shown as a browser notification. */
export const pendingAlerts = <T extends { id: string }>(
  alerts: T[],
  notified: readonly string[],
): T[] => alerts.filter(a => !notified.includes(a.id))
