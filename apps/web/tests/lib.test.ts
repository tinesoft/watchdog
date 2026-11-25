import { describe, expect, it } from 'vitest'
import { fixCommand } from '../src/lib/fixcmd'
import { isMine } from '../src/lib/match'
import { risk } from '../src/lib/risk'

describe('risk', () => {
  it('ranks Exploited above Mine above a higher CVSS', () => {
    const exploited = risk({ exploited: true, cvss: 7.5 }, false)
    const mine = risk({ exploited: false, cvss: 9.8 }, true)
    const plain = risk({ exploited: false, cvss: 10 }, false)
    expect(exploited).toBeGreaterThan(mine)
    expect(mine).toBeGreaterThan(plain)
  })
})

describe('isMine', () => {
  const next = {
    title: 'Next.js middleware authorization bypass',
    product: 'npm · next',
    pkg: 'next',
  }
  it('matches a whole word', () => expect(isMine(next, ['next'])).toBe(true))
  it('does not match inside another word', () => expect(isMine(next, ['nex'])).toBe(false))
  it('is case-insensitive and tolerates regex characters', () => {
    expect(
      isMine({ title: 'Go net/netip', product: 'Go standard library', pkg: 'stdlib' }, [
        'GO STANDARD LIBRARY',
      ]),
    ).toBe(true)
    expect(() => isMine(next, ['c++', '(', '[x'])).not.toThrow()
  })
  it('is false for an empty Stack', () => expect(isMine(next, [])).toBe(false))
})

describe('fixCommand', () => {
  it('picks the highest fixed version', () =>
    expect(
      fixCommand({ eco: 'npm', pkg: 'next', fixed: '12.3.5 · 13.5.9 · 14.2.25 · 15.2.3' }),
    ).toBe('npm install next@15.2.3'))
  it('sorts numerically, not lexically', () =>
    expect(fixCommand({ eco: 'npm', pkg: 'x', fixed: '1.9.0 · 1.10.0' })).toBe(
      'npm install x@1.10.0',
    ))
  it('covers Maven, Go and PyPI', () => {
    expect(fixCommand({ eco: 'Maven', pkg: 'g:a', fixed: '2.17.1' })).toBe(
      'implementation("g:a:2.17.1")',
    )
    expect(fixCommand({ eco: 'Go', pkg: 'stdlib', fixed: '1.22.4' })).toBe(
      'go mod edit -toolchain=go1.22.4',
    )
    expect(fixCommand({ eco: 'PyPI', pkg: 'django', fixed: '5.0.2' })).toBe(
      'pip install django==5.0.2',
    )
  })
  it('is empty without an ecosystem or a version', () => {
    expect(fixCommand({ eco: null, pkg: 'x', fixed: '1.0.0' })).toBe('')
    expect(fixCommand({ eco: 'npm', pkg: 'x', fixed: 'See advisory' })).toBe('')
  })
})

import { ago, nextSweep, until } from '../src/lib/sweep'

describe('sweep schedule', () => {
  it('finds the next Sweep today or tomorrow', () => {
    expect(nextSweep(new Date('2026-11-25T06:00:00Z')).toISOString()).toBe(
      '2026-11-25T07:00:00.000Z',
    )
    expect(nextSweep(new Date('2026-11-25T07:00:00Z')).toISOString()).toBe(
      '2026-11-25T14:00:00.000Z',
    )
    expect(nextSweep(new Date('2026-11-25T15:00:00Z')).toISOString()).toBe(
      '2026-11-26T07:00:00.000Z',
    )
  })
  it('formats elapsed and remaining time', () => {
    expect(ago(new Date('2026-11-25T05:00:00Z'), new Date('2026-11-25T07:00:00Z'))).toBe('2 h')
    expect(until(new Date('2026-11-26T07:00:00Z'), new Date('2026-11-25T09:00:00Z'))).toBe('22h00')
  })
})

import { csvCell, issueUrl, toCsv } from '../src/lib/export'
import { sanitize } from '../src/scripts/state'

const t = {
  id: 'CVE-1',
  title: '=cmd|x',
  summary: 's',
  cvss: 9.1,
  severity: 'critical',
  published: '2025',
  product: 'p',
  exploited: true,
  category: 'tools',
  threat: 'bug',
  eco: null,
  pkg: 'p',
  affected: null,
  fixed: null,
  kevAction: null,
} as const

describe('export', () => {
  it('neutralises spreadsheet formulas and quotes', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`)
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(toCsv([{ ...t, mine: false, status: '' }]).split('\n')[1]).toContain(`"'=cmd|x"`)
  })
  it('builds a prefilled issue link only for owner/repo', () => {
    expect(issueUrl('nope', 'security', t, 'x')).toBeNull()
    const u = new URL(issueUrl('acme/api', 'security, vuln', t, 'https://x')!)
    expect(u.pathname).toBe('/acme/api/issues/new')
    expect(u.searchParams.get('labels')).toBe('security,vuln')
  })
})

describe('sanitize', () => {
  it('keeps well-typed state and drops the rest', () => {
    const p = sanitize({
      stack: ['Next', 'next', 3],
      triage: { a: 'patched', b: 'bogus' },
      theme: 'neon',
      alertLevel: 'critical',
    })
    expect(p.theme).toBeNull()
    expect(p.triage).toEqual({ a: 'patched' })
    expect(p.alertLevel).toBe('critical')
    expect(p.stack).toEqual([])
  })
  it('survives garbage', () => expect(sanitize(null).stack).toEqual([]))
})

import { compareVersions, isAffected } from '../src/lib/version'
import { detectFormat, matchDeps, parseDeps, pendingAlerts } from '../src/lib/scan'
import seed from '../public/data/threats.json'

describe('versions', () => {
  it('compares numerically with pre-releases below releases', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('2.0-beta9', '2.0')).toBe(-1)
    expect(compareVersions('v1.2', '1.2.0')).toBe(0)
  })
  it('evaluates the affected grammar used by the seed data', () => {
    expect(isAffected('0.13.0', '< 0.14.1')).toBe(true)
    expect(isAffected('0.14.1', '< 0.14.1')).toBe(false)
    expect(isAffected('14.1.0', '11.1.4 – 15.2.2')).toBe(true)
    expect(isAffected('15.2.3', '11.1.4 – 15.2.2')).toBe(false)
    expect(isAffected('1.22.3', '< 1.21.11, 1.22.0 – 1.22.3')).toBe(true)
    expect(isAffected('8.2.19', '8.1 < 8.1.29 · 8.2 < 8.2.20 · 8.3 < 8.3.8')).toBe(true)
    expect(isAffected('8.2.20', '8.1 < 8.1.29 · 8.2 < 8.2.20 · 8.3 < 8.3.8')).toBe(false)
    expect(isAffected('5.6.0', '5.6.0, 5.6.1')).toBe(true)
    expect(isAffected('1.0.0', 'Cloud service')).toBe(false)
    expect(isAffected('1.0.0', null)).toBe(false)
  })
})

describe('dependency files', () => {
  it('parses package.json and ignores non-version ranges', () => {
    const deps = parseDeps(
      '{"dependencies":{"next":"^14.1.0","x":"workspace:*"},"devDependencies":{"a":"~1.2.3"}}',
      'package.json',
    )
    expect(deps).toEqual([
      { name: 'next', version: '14.1.0', eco: 'npm' },
      { name: 'a', version: '1.2.3', eco: 'npm' },
    ])
  })
  it('parses package-lock.json v3 including scoped and nested packages', () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@s/p': { version: '1.0.0' },
        'node_modules/a/node_modules/b': { version: '2.0.0' },
      },
    })
    expect(parseDeps(lock).map(d => d.name)).toEqual(['@s/p', 'b'])
  })
  it('parses requirements.txt, go.mod, Cargo.lock, Gemfile.lock, composer.lock and pom.xml', () => {
    expect(
      parseDeps(
        'Django==5.0.2\nrequests[socks]==2.31.0 ; python_version>"3"\n# c\n',
        'requirements.txt',
      ),
    ).toHaveLength(2)
    const go = parseDeps(
      'module x\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n',
      'go.mod',
    )
    expect(go).toContainEqual({ name: 'stdlib', version: '1.22.0', eco: 'Go' })
    expect(go).toContainEqual({ name: 'github.com/gin-gonic/gin', version: '1.9.1', eco: 'Go' })
    expect(parseDeps('[[package]]\nname = "tokio"\nversion = "1.37.0"\n', 'Cargo.lock')).toEqual([
      { name: 'tokio', version: '1.37.0', eco: 'crates.io' },
    ])
    expect(
      parseDeps('GEM\n  specs:\n    rails (7.1.3)\n      actionpack (= 7.1.3)\n', 'Gemfile.lock'),
    ).toEqual([{ name: 'rails', version: '7.1.3', eco: 'RubyGems' }])
    expect(
      parseDeps(
        '{"packages":[{"name":"laravel/framework","version":"v10.1.0"}],"packages-dev":[]}',
        'composer.lock',
      )[0],
    ).toMatchObject({ version: '10.1.0' })
    const pom =
      '<project><properties><log4j.v>2.14.1</log4j.v></properties><dependencies><dependency><groupId>org.apache.logging.log4j</groupId><artifactId>log4j-core</artifactId><version>${log4j.v}</version></dependency></dependencies></project>'
    expect(parseDeps(pom, 'pom.xml')).toEqual([
      { name: 'org.apache.logging.log4j:log4j-core', version: '2.14.1', eco: 'Maven' },
    ])
  })
  it('sniffs the format from content and rejects garbage', () => {
    expect(detectFormat('{"lockfileVersion":3}')).toBe('package-lock.json')
    expect(detectFormat('hello')).toBeNull()
    expect(parseDeps('{ not json', 'package.json')).toEqual([])
  })
})

describe('scan matching', () => {
  const threats = seed.items as never[]
  it('reproduces the design example: three vulnerable dependencies, worst first', () => {
    const deps = parseDeps(
      '{"dependencies":{"next":"14.1.0","follow-redirects":"1.15.5","@modelcontextprotocol/inspector":"0.13.0","left-pad":"1.3.0"}}',
      'package.json',
    )
    const found = matchDeps(deps, threats)
    expect(found.map(f => f.dep.name)).toEqual([
      '@modelcontextprotocol/inspector',
      'next',
      'follow-redirects',
    ])
    expect(found[0]!.cmd).toBe('npm install @modelcontextprotocol/inspector@0.14.1')
    expect(found[1]!.cmd).toBe('npm install next@15.2.3')
  })
  it('does not flag a fixed version', () =>
    expect(
      matchDeps(parseDeps('{"dependencies":{"next":"15.2.3"}}', 'package.json'), threats),
    ).toEqual([]))
})

describe('alerts', () => {
  it('never notifies twice for the same threat', () =>
    expect(pendingAlerts([{ id: 'a' }, { id: 'b' }], ['a'])).toEqual([{ id: 'b' }]))
})

import { queryOsv } from '../src/lib/osv'

describe('queryOsv', () => {
  it('sends only name, ecosystem and version, and maps results back to dependencies', async () => {
    let sent = ''
    const fake = (async (_u: string, init: RequestInit) => {
      sent = String(init.body)
      return new Response(JSON.stringify({ results: [{}, { vulns: [{ id: 'GHSA-1' }] }] }))
    }) as unknown as typeof fetch
    const deps = [
      { name: 'a', version: '1.0.0', eco: 'npm' as const },
      { name: 'b', version: '2.0.0', eco: 'PyPI' as const },
    ]
    const hits = await queryOsv(deps, fake)
    expect(hits).toEqual([{ dep: deps[1], ids: ['GHSA-1'] }])
    expect(Object.keys(JSON.parse(sent).queries[0]).sort()).toEqual(['package', 'version'])
  })
  it('throws on an HTTP error so the UI can fall back to the local result', async () => {
    const fake = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    await expect(queryOsv([{ name: 'a', version: '1', eco: 'npm' }], fake)).rejects.toThrow('503')
  })
})
