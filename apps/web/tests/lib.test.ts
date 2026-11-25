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
