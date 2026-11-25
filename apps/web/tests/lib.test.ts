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
import seed from '../data/seed/threats.json'

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

import { mergeThreat } from '../scripts/collect/merge.ts'
import { rangeOf } from '../scripts/collect/ghsa.ts'
import { parseFeed, cvesIn } from '../scripts/collect/feed.ts'
import { buildFeed } from '../scripts/collect/rss.ts'
import { threatTypeOf, categoryOf, severityOf } from '../scripts/collect/enrich.ts'

describe('collector: merge', () => {
  const kev = {
    id: 'CVE-1',
    name: 'Foo RCE',
    vendor: 'Foo',
    product: 'Bar',
    summary: 's',
    action: 'Patch',
    dateAdded: '2026-11-01',
  }
  it('combines sources: GHSA package data, NVD score, KEV exploited flag', () => {
    const t = mergeThreat(
      'CVE-1',
      [
        { id: 'CVE-1', source: 'nvd', cvss: 9.8, published: '2026-10-30', summary: 'nvd text' },
        {
          id: 'CVE-1',
          source: 'ghsa',
          title: 'Remote code execution in bar',
          eco: 'npm',
          pkg: 'bar',
          affected: '< 2.0.0',
          fixed: '2.0.0',
          published: '2026-11-02',
        },
      ],
      kev,
      undefined,
    )!
    expect(t).toMatchObject({
      id: 'CVE-1',
      cvss: 9.8,
      severity: 'critical',
      exploited: true,
      eco: 'npm',
      pkg: 'bar',
      affected: '< 2.0.0',
      published: '2026-10-30',
      threat: 'virus',
      category: 'packages',
      kevAction: 'Patch',
    })
    expect(t.sources).toEqual(['ghsa', 'nvd', 'cisa-kev'])
  })
  it('waits for a score rather than publishing a threat it cannot rank', () =>
    expect(
      mergeThreat('CVE-2', [{ id: 'CVE-2', source: 'cisa-kev' }], undefined, undefined),
    ).toBeNull())
  it('lets a curated override win for text and type but not for the score', () => {
    const t = mergeThreat(
      'CVE-3',
      [{ id: 'CVE-3', source: 'nvd', cvss: 7.5, title: 'auto' }],
      undefined,
      { title: 'Curated', threat: 'trojan' },
    )!
    expect(t.title).toBe('Curated')
    expect(t.threat).toBe('trojan')
    expect(t.cvss).toBe(7.5)
  })
})

describe('collector: GHSA ranges', () => {
  it('maps GitHub ranges to the shared grammar', () => {
    expect(rangeOf('< 1.2.3')).toBe('< 1.2.3')
    expect(rangeOf('>= 1.0.0, < 1.2.3')).toBe('1.0.0 < 1.2.3')
    expect(rangeOf('>= 1.0.0, <= 1.2.3')).toBe('1.0.0 – 1.2.3')
    expect(rangeOf('<= 2.0')).toBe('≤ 2.0')
    expect(rangeOf('= 1.5.0')).toBe('1.5.0')
    expect(rangeOf('>= 3.0')).toBe('≥ 3.0')
    expect(rangeOf(null)).toBe('')
  })
  it('round-trips through the matcher', () => {
    expect(isAffected('1.1.0', rangeOf('>= 1.0.0, < 1.2.3'))).toBe(true)
    expect(isAffected('1.2.3', rangeOf('>= 1.0.0, < 1.2.3'))).toBe(false)
    expect(isAffected('9.0.0', rangeOf('>= 3.0'))).toBe(true)
  })
})

describe('collector: feeds', () => {
  it('reads RSS and Atom, strips markup, and drops nothing silently', () => {
    const rss =
      '<rss version="2.0"><channel><item><title>A &amp; B</title><link>https://x/1</link><pubDate>Tue, 24 Nov 2026 14:15:18 +0000</pubDate><description><![CDATA[<p>See CVE-2026-1234 and cve-2026-1234.</p>]]></description></item></channel></rss>'
    const atom =
      '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><link href="https://x/2" rel="alternate"/><updated>2026-11-01T00:00:00Z</updated><summary>s</summary></entry></feed>'
    expect(parseFeed(rss)).toEqual([
      {
        title: 'A & B',
        link: 'https://x/1',
        date: '2026-11-24',
        text: 'See CVE-2026-1234 and cve-2026-1234.',
      },
    ])
    expect(parseFeed(atom)[0]).toMatchObject({ link: 'https://x/2', date: '2026-11-01' })
    expect(cvesIn('See CVE-2026-1234 and cve-2026-1234.')).toEqual(['CVE-2026-1234'])
    expect(parseFeed('<html>nope</html>')).toEqual([])
  })
  it('escapes everything in the published RSS', () => {
    const t = {
      ...(seed.items[0] as never as Record<string, unknown>),
      title: '<script>"x"</script>',
      exploited: true,
      severity: 'critical',
      published: '2026-11-01',
    } as never
    const xml = buildFeed([t], 'https://s', new Date('2026-11-02T00:00:00Z'))
    expect(xml).not.toContain('<script>')
    expect(xml).toContain('&lt;script&gt;')
    expect(xml).toContain('[EXPLOITED]')
  })
})

describe('collector: enrichment', () => {
  it('classifies by keywords, then CWE', () => {
    expect(threatTypeOf('Remote code execution in x', [])).toBe('virus')
    expect(threatTypeOf('Denial of service', [])).toBe('worm')
    expect(threatTypeOf('Authentication bypass', [])).toBe('hacker')
    expect(threatTypeOf('Backdoor in release', [])).toBe('trojan')
    expect(threatTypeOf('something odd', ['CWE-79'])).toBe('hacker')
    expect(threatTypeOf('something odd', [])).toBe('bug')
  })
  it('classifies the category and severity bands', () => {
    expect(categoryOf('MCP server flaw', 'npm', 'x')).toBe('ai')
    expect(categoryOf('x', undefined, 'stdlib')).toBe('languages')
    expect(categoryOf('Windows kernel flaw', undefined, 'Windows')).toBe('os')
    expect(categoryOf('Foo appliance', undefined, 'Foo')).toBe('tools')
    expect(categoryOf('x', 'PyPI', 'django')).toBe('packages')
    expect([severityOf(9), severityOf(7), severityOf(5)]).toEqual(['critical', 'high', 'medium'])
  })
})

import { plainText } from '../scripts/collect/feed.ts'
describe('collector: markdown', () => {
  it('keeps the words and drops the syntax', () =>
    expect(plainText('### Impact\nIn `foo` before [v2](https://x), **bad**.\n```\ncode\n```')).toBe(
      'Impact In foo before v2, bad.',
    ))
})

import { ALARM_COLOR, faviconDataUri } from '../src/lib/favicon'
describe('favicon', () => {
  const svg = (dot: boolean) => decodeURIComponent(faviconDataUri(ALARM_COLOR.dark, dot))
  it('draws the tab icon in the alarm colour', () => {
    expect(svg(false).startsWith('data:image/svg+xml,<svg')).toBe(true)
    expect(svg(false)).toContain('#FF5A4E')
    expect(svg(false)).not.toContain('#C6FF3D')
  })
  it('adds an alert dot without moving or shrinking the dog', () => {
    const calm = svg(false)
    const alarm = svg(true)
    expect(alarm).toContain(calm.replace('</svg>', ''))
    expect(alarm).not.toContain('<text')
    expect(alarm).not.toContain('scale(')
  })
})
