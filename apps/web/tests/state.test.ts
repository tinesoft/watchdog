import { describe, expect, it } from 'vitest'
import { NO_PRODUCT, type Threat } from '../src/lib/types'
import { clearedSeen, defaults, firstSeen, rowsCache, rowsOf } from '../src/scripts/state'

const threat = (id: string, over: Partial<Threat> = {}): Threat => ({
  id,
  title: `Threat ${id}`,
  summary: '',
  cvss: 9.8,
  severity: 'critical',
  published: '2026-11-26',
  product: NO_PRODUCT,
  exploited: false,
  category: 'os',
  threat: 'bug',
  eco: null,
  pkg: NO_PRODUCT,
  affected: null,
  fixed: null,
  kevAction: null,
  ...over,
})

describe('the Inbox rule', () => {
  const inbox = (t: Threat, stack: string[] = []) => rowsOf([t], { ...defaults(), stack })[0]!.isNew

  it('keeps out a new Threat that is not Exploited, not Mine and names no product', () =>
    expect(inbox(threat('a'))).toBe(false))
  it('lets in an Exploited one', () => expect(inbox(threat('a', { exploited: true }))).toBe(true))
  it('lets in a Mine one, even through its title only', () =>
    expect(inbox(threat('a', { title: 'In the Linux kernel, a flaw' }), ['linux'])).toBe(true))
  it('lets in one that names a product', () =>
    expect(inbox(threat('a', { product: 'OpenSSH', pkg: 'openssh' }))).toBe(true))
  it('keeps out a seen or triaged one', () => {
    const t = threat('a', { exploited: true })
    expect(rowsOf([t], { ...defaults(), seen: ['a'] })[0]!.isNew).toBe(false)
    expect(rowsOf([t], { ...defaults(), triage: { a: 'patched' } })[0]!.isNew).toBe(false)
  })
})

describe('rowsCache', () => {
  it('reuses the rows until the threats, Stack, triage or seen change', () => {
    const rows = rowsCache()
    const threats = [threat('a')]
    const p = defaults()
    const first = rows(threats, p)
    expect(rows(threats, { ...p, theme: 'light' })).toBe(first)
    expect(rows(threats, { ...p, stack: ['linux'] })).not.toBe(first)
    expect(rows([...threats], p)).not.toBe(first)
  })
})

describe('seen', () => {
  const threats = [threat('a', { exploited: true }), threat('b')]
  it('starts a first visit with only the Exploited Threats unseen', () =>
    expect(firstSeen(threats)).toEqual(['b']))
  it('clearing keeps only the IDs in the current data', () =>
    expect(clearedSeen(threats)).toEqual(['a', 'b']))
})
