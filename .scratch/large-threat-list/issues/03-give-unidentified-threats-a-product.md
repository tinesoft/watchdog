# Give Threats with no product a product during the Sweep

Status: needs-triage

## Why

After the NVD fix, about 1,322 of ~2,534 Threats (52%) have no product ("Unidentified product", no CPE). `isMine` can then match only their title, for example "In the Linux kernel …", so Mine misses many of them. Since the Inbox rule (see `GLOSSARY.md`, Inbox) lets a Threat in when it is Exploited, Mine, or names a product, these Threats also rarely reach the Inbox.

This is a data-quality problem on the collection side, split out of `01-keep-the-list-fast-and-the-inbox-calm.md`. It is not a browser cost.

## To decide

- Where can a product come from: another Source's Advisory for the same Threat, the NVD description, a later NVD enrichment?
- Is a derived product shown the same way as a CPE-backed one, or marked as a guess?

## Acceptance criteria (draft)

- [ ] The share of Threats with no product after a Sweep is measured and reported, before and after.
- [ ] Merging (`apps/web/scripts/collect/merge.ts`) fills a product only from a stated rule, with tests.

## Comments
