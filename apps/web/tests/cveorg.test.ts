import { describe, expect, it } from 'vitest'
import { fetchCveOrg, fetchCveOrgProducts, productOf } from '../scripts/collect/cveorg.ts'
import { mergeThreat } from '../scripts/collect/merge.ts'
import { NO_PRODUCT } from '../src/lib/types'

const rec = (...affected: object[]) => ({ containers: { cna: { affected } } })

describe('productOf', () => {
  it('writes vendor and product', () =>
    expect(productOf(rec({ vendor: 'Netis', product: 'WF2409E' }))).toEqual({
      product: 'Netis WF2409E',
    }))
  it('writes the word once when vendor and product are the same', () =>
    expect(productOf(rec({ vendor: 'openIMIS', product: 'openIMIS' }))).toEqual({
      product: 'openIMIS',
    }))
  it('skips n/a and unknown entries', () =>
    expect(
      productOf(rec({ vendor: 'n/a', product: 'n/a' }, { vendor: 'Tenda', product: 'RX3' })),
    ).toEqual({ product: 'Tenda RX3' }))
  it('gives a known registry its ecosystem and package', () => {
    expect(
      productOf(
        rec({
          vendor: 'emanuelmoraes-dev',
          product: 'build-git-clone',
          collectionURL: 'https://registry.npmjs.org',
        }),
      ),
    ).toEqual({ eco: 'npm', pkg: 'build-git-clone' })
    expect(
      productOf(
        rec({ vendor: 'x', product: 'Y', packageName: 'y-lib', collectionURL: 'https://pypi.org' }),
      ),
    ).toEqual({ eco: 'PyPI', pkg: 'y-lib' })
  })
  it('falls back to the package name when there is no vendor or product', () =>
    expect(
      productOf(rec({ packageName: 'XML-Sig', collectionURL: 'https://cpan.org/modules' })),
    ).toEqual({ product: 'XML-Sig' }))
  it('is null when no entry is usable', () => {
    expect(productOf(rec({ vendor: 'unknown', product: 'n/a' }))).toBeNull()
    expect(productOf({})).toBeNull()
  })
})

const answer = (status: number, body: unknown = {}) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('fetchCveOrg', () => {
  it('makes a cve-org Candidate', async () =>
    expect(
      await fetchCveOrg('CVE-1', answer(200, rec({ vendor: 'Netis', product: 'WF2409E' }))),
    ).toEqual({ id: 'CVE-1', source: 'cve-org', product: 'Netis WF2409E' }))
  it('is null for a CVE that CVE.org does not know', async () =>
    expect(await fetchCveOrg('CVE-1', answer(404))).toBeNull())
})

describe('fetchCveOrgProducts', () => {
  it('skips a failed lookup, but fails when every lookup failed', async () => {
    let n = 0
    const flaky = (async () =>
      ++n === 1
        ? new Response('', { status: 400 })
        : new Response(JSON.stringify(rec({ product: 'P' })))) as unknown as typeof fetch
    expect(
      await fetchCveOrgProducts(['a', 'b'], { fetchImpl: flaky, concurrency: 1 }),
    ).toHaveLength(1)
    await expect(fetchCveOrgProducts(['a'], { fetchImpl: answer(400) })).rejects.toThrow(
      'all 1 lookups failed',
    )
  })
})

describe('merging a cve-org product', () => {
  const nvd = { id: 'CVE-1', source: 'nvd', cvss: 9.8, title: 'A flaw', published: '2026-11-20' }
  it('fills a Threat that would have no product', () =>
    expect(
      mergeThreat(
        'CVE-1',
        [nvd, { id: 'CVE-1', source: 'cve-org', product: 'Netis WF2409E' }],
        undefined,
        undefined,
      )?.product,
    ).toBe('Netis WF2409E'))
  it("loses to NVD's CPE once NVD has one", () =>
    expect(
      mergeThreat(
        'CVE-1',
        [
          { id: 'CVE-1', source: 'cve-org', product: 'Netis WF2409E' },
          { ...nvd, product: 'netis wf2409e firmware' },
        ],
        undefined,
        undefined,
      )?.product,
    ).toBe('netis wf2409e firmware'))
  it('still says no product without one', () =>
    expect(mergeThreat('CVE-1', [nvd], undefined, undefined)?.product).toBe(NO_PRODUCT))
})
