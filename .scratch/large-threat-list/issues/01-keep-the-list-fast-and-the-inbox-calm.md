# Keep the list fast and the Inbox calm with ~2,500 Threats

Status: ready-for-agent

## Why

The NVD fix for CVE-2026-99362 (`fix(web): collect NVD CVEs that only their assigner scored`) makes the NVD Source keep every critical CVE, whoever scored it. A Sweep now publishes about 2,500 Threats instead of about 1,045. That is 389 KB gzipped, which is well inside the 1 MB budget, so size is not the problem. The cost is in the browser and in the Inbox.

Measured on the Nov 26, 2026 data (desktop node, not a real phone):

|                                              | before               | after                |
| -------------------------------------------- | -------------------- | -------------------- |
| Threats                                      | 1,045                | ~2,534               |
| `JSON.parse` of threats.json                 | 0.75 ms              | 2.1 ms               |
| `rowsOf` + `listView`                        | 3.4 ms, 1.35 MB HTML | 7.9 ms, 3.36 MB HTML |
| Threats with "Unidentified product" (no CPE) | —                    | 1,322 (52%)          |
| New Threats per day                          | —                    | ~53 more             |

## Problems

1. **The list renders everything on each keystroke.** `listView` (`apps/web/src/scripts/templates.ts:279`) builds every row as HTML, and `main.ts` writes it with `root.innerHTML`. `rowsOf` runs `isMine` (one regex per Stack term per Threat) on every render. This is estimated at 50–200 ms per search keystroke on a mid-range phone.
2. **The Inbox fills up.** About 53 more Threats a day arrive. Most of them only NVD carries and most have no product, so they are rarely Mine. They push the Threats the user cares about down the Risk order.
3. **Mine is weak for Threats with no product.** `isMine` can only match their title, for example "In the Linux kernel ...".

## Decided

- **List**: render the first 100 rows by Risk. A "Show more" button adds 100 each time, with a muted "Showing 100 of 2,534" line under it. N resets when the query, category, Exploited filter or view changes. Export CSV keeps exporting every filtered row. The control goes into the design first, then into the code.
- **Rows cache**: `Row[]` is recomputed only when the threat data, Stack, triage or seen changes. Renders that change only ephemeral state skip `isMine`.
- **Search**: debounced, see `02-debounce-the-threat-search.md`.
- **Inbox rule**: a new Threat with no Triage status goes in only if it is Exploited, Mine, or names a product. There is no setting. See `GLOSSARY.md` (Inbox).
- **Mark all as read**: still marks every Threat in the data as seen, not only the Inbox's, so adding a Stack term doesn't flood the Inbox. It trims `seen` to the IDs in the current data.
- **First visit**: everything is marked seen except the Threats that are Exploited right now. An empty Inbox shows a line pointing to All Threats.
- **Exploited after seen**: split out to `04-bring-back-threats-that-become-exploited.md`.
- **Mine for Threats with no product**: split out to `03-give-unidentified-threats-a-product.md`.

## Acceptance criteria

- [x] With 2,500 Threats, the search `input` handler stays under 16 ms, and the render after the debounce stays under 50 ms (Playwright trace, CPU throttled 4×).
- [x] The Inbox rule is written down in `GLOSSARY.md` (Inbox entry) if it changes.
- [x] The e2e tests cover a data file of 2,500 Threats, not only the seed. It comes from a deterministic generator that grows the seed while keeping the real shape (about 52% with no product, a realistic Exploited share), and is served with `page.route('**/data/threats.json')`.
- [x] The list draws at most 100 rows until "Show more" is pressed, and N resets on a query, category, Exploited or view change.
- [x] A new Threat that is not Exploited, not Mine and names no product stays out of the Inbox but is listed in All Threats.
- [x] On a first visit, the Inbox holds only the Threats that are Exploited right now.
- [x] "Mark all as read" leaves `seen` holding only IDs in the current data.
- [x] Screenshots at 390px and desktop of the list with "Show more", compared with the design.

## Comments

- 2026-11-27: Search debounce decided and split out to `02-debounce-the-threat-search.md`. It cuts the number of renders, not their cost, so the list and Inbox decisions above are still open. The first criterion is split into handler time and post-debounce render time, so the debounce can't pass it on its own.
- 2026-11-27: Decided:
  - List: render the first 100 rows by Risk, with a "Show more" that adds 100 each time. N resets when the query, category, Exploited filter or view changes.
  - Rows are cached and recomputed only when the threat data, Stack, triage or seen changes, so `isMine` doesn't run on renders that change only ephemeral state.
  - Inbox: a new Threat with no Triage status goes in only if it is Exploited, Mine, or names a product. There is no setting for now. Recorded in `GLOSSARY.md` (Inbox).
  - Mine for Threats with no product is split out to `03-give-unidentified-threats-a-product.md`.
  - "Mark all as read" trims `seen` to the IDs in the current data.
- 2026-11-27: Grilling finished. Decisions are under **Decided**. Q14 (Exploited after seen) split out to 04. Status: `ready-for-agent`, once the design has the "Show more" control.
- 2026-11-27: The design now has "Show more" (button, then a muted "Showing N of M" line) and a "See all threats" button in the empty Inbox. Synced to `docs/design/Main.dc.html`. The design's page size is 8 so the control shows with its 13 sample Threats; the app uses 100. No longer blocked.
- 2026-11-27: Done.
  - **Inbox rule**: `rowsOf` puts a Threat in the Inbox (`isNew`) only if it is Exploited, Mine, or its product is not `NO_PRODUCT` (now a shared constant in `src/lib/types.ts`, also used by the merge step). The NEW tag follows the Inbox.
  - **Rows cache**: `rowsCache` recomputes rows only when the threats, Stack, triage or seen change. Each row also stores its lowercased search text (`hay`).
  - **Show more**: `e.limit` resets to `PAGE` (100) in `render()` whenever the view, category, Exploited filter or query changes. "Show more" keeps keyboard focus after it adds rows.
  - **Seen**: `firstSeen` runs on a first visit (no saved state) and again after "Erase", once data arrives. `clearedSeen` sets `seen` to exactly the current IDs.
  - **Tests**: unit tests in `tests/state.test.ts`. The e2e file `e2e/large.spec.ts` uses the generator in `e2e/large.ts`: 2,534 Threats, about 52% with no product, about 5% Exploited.
  - **Timing**: measured on a desktop with Chromium and the CPU throttled 4×. The input handler takes about 0.1 ms. The render after the pause, with style and layout forced, takes about 19 ms alone and up to about 39 ms with the full suite running in parallel. Before the `hay` change it was about 45 ms.
  - **Existing tests**: three tests now start as a returning user (`e2e/returning.ts`), because a first visit no longer puts every seed Threat in the Inbox.
  - **Edge case**: if a first visit saves something before the data loads and the data never loads, the next visit is not counted as a first visit, so its Inbox fills.
  - **Seen elsewhere**: at 390px the rows are cramped. The CVE ID wraps over three lines and the title is cut to a few letters, with the seed data too. The row markup didn't change here, so this needs its own ticket.
