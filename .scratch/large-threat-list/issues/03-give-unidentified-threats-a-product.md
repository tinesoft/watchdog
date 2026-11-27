# Give Threats with no product a product during the Sweep

Status: ready-for-agent

## Why

After the NVD fix, about 1,322 of ~2,534 Threats (52%) have no product ("Unidentified product", no CPE). `isMine` can then match only their title, for example "In the Linux kernel …", so Mine misses many of them. Since the Inbox rule (see `GLOSSARY.md`, Inbox) lets a Threat in when it is Exploited, Mine, or names a product, these Threats also rarely reach the Inbox.

This is a data-quality problem on the collection side, split out of `01-keep-the-list-fast-and-the-inbox-calm.md`. It is not a browser cost.

## To decide

- Where can a product come from: another Source's Advisory for the same Threat, the NVD description, a later NVD enrichment?
- Is a derived product shown the same way as a CPE-backed one, or marked as a guess?

## Acceptance criteria (draft)

- [x] The share of Threats with no product after a Sweep is measured and reported, before and after.
- [x] Merging (`apps/web/scripts/collect/merge.ts`) fills a product only from a stated rule, with tests.

## Comments

- 2026-11-27: Q1 decided: the product comes from the `affected` list (vendor, product, package) in the CVE record on CVE.org (`https://cveawg.mitre.org/api/cve/<id>`, 25,000 requests/min), written by the CVE's assigner. No patterns on the description: a wrong product would make Mine match the wrong Stack. Checked against three records: VulDB (Netis WF2409E), VulnCheck (openIMIS), and VulnCheck npm (build-git-clone, with `collectionURL` https://registry.npmjs.org).
- 2026-11-27: Decided:
  - **Source**: CVE.org becomes a listed, `collected` Source `cve-org` (next to NVD in `src/data/sources.json`). Its lookups produce a normal Candidate, so `sources` includes `cve-org` and a failed run shows on the Sources page.
  - **Lookups**: only Threats that would otherwise have no product. The previous Sweep's product is reused, and only new IDs are looked up, at most `CVE_ORG_LOOKUP_CAP` (3,000) per Sweep with 8 requests at a time.
  - **Format**: `<vendor> <product>` from the first usable `affected` entry, skipping `n/a` and `unknown`; the word is written once when vendor and product are the same.
  - **Ecosystem**: a known registry `collectionURL` (npm, PyPI, Maven, Go, crates.io, RubyGems, Packagist) also sets `eco`, and sets `pkg` from `packageName`, or from `product` when that is missing.
  - **Display**: not marked as a guess. It is the assigner's own statement.
  - **Ranking**: `cve-org` ranks after `nvd`, so NVD's CPE wins once NVD adds one.
  - **Measurement**: one real Sweep, run locally into the scratchpad. The no-product share before and after the CVE.org step is recorded here.
- 2026-11-27: Done.
  - **Code**: `scripts/collect/cveorg.ts` holds `productOf` (record to product, eco and pkg), `fetchCveOrg` (a 404 counts as "no record", not a failure) and `fetchCveOrgProducts` (8 requests in flight; the run fails only if every lookup fails). The Sweep step in `index.ts` comes after the NVD score lookups. The cap is `CVE_ORG_LOOKUP_CAP` in `config.ts`, and the new Source is in `src/data/sources.json`, making 30 Sources.
  - **Format change**: when an entry has no vendor or product, its `packageName` becomes the product. CPANSec records name only the package (for example `XML-Sig`).
  - **Tests**: unit tests in `tests/cveorg.test.ts`, covering format, registries, the fallback, 404, failures, and ranking against NVD. The e2e tests for the Sources count now expect 30.
  - **Measured**: one real Sweep on 2026-11-27, written to the scratchpad. 2,461 Threats; no product before the CVE.org step: 1,276 (51.8%); after: 30 (1.2%). CVE.org filled 1,246, of which 55 also got an ecosystem (40 Maven, 4 PyPI, 3 npm, 3 Packagist, 3 Go, 2 crates.io). threats.json stays at 388 KiB gzipped. The 30 left are mostly MITRE-assigned records whose `affected` list says only `n/a`.
  - **Reuse**: a product carried over from the previous Sweep is credited to `cve-org`, even if NVD supplied it at the time.
  - **Design**: the design artifact's sample Sources list (`WD_SOURCES` in `docs/design/Main.dc.html`) does not list CVE.org yet.
