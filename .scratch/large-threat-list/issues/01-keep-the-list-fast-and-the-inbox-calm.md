# Keep the list fast and the Inbox calm with ~2,500 Threats

Status: needs-triage

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

## To decide (needs the maintainer)

- List: render only the visible rows (virtual list), paginate, or show the first N with a "show more"?
- Inbox: keep every new Threat, or only the ones that are Exploited, Mine, or carry a product? Should the rule be a setting?
- Should `rowsOf` cache the Mine result per Threat until the Stack changes?

## Acceptance criteria (draft)

- [ ] Typing in the search bar with 2,500 Threats stays under 50 ms per keystroke (measure with a Playwright trace, CPU throttled 4×).
- [ ] The Inbox rule is written down in `GLOSSARY.md` (Inbox entry) if it changes.
- [ ] The e2e tests cover a data file of 2,500 Threats, not only the seed.

## Comments
