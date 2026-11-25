# watchdog: original plan

Status: agreed after a design review with the owner, 2026-11-25. Written before any code. Terms follow `GLOSSARY.md`; the architecture decision is in `docs/adr/0001-static-site-with-browser-held-state.md`.

Source design: https://claude.ai/code/artifact/61134e4a-8032-4e54-9aa8-0467ea3b762b (file `project/Main.dc.html`, a single interactive artboard, dark and light themes).

## 1. What it is

A static web app that tells a developer which public vulnerabilities (Threats) affect the software they run. A scheduled GitHub Action runs a Sweep of authoritative sources and bakes the result into the site. Everything personal (Stack, Triage statuses, settings) stays in the browser. The mascot is the Dog.

Everything visible in the design is part of the MVP.

## 2. Scope: features taken from the design

| Area                            | Behaviour                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell                           | Collapsible sidebar with eight nav items and counts (Inbox, All threats, My stack, Triage, Scan dependencies, Edit my stack, Field reports, Sources). Dark/light toggle. Search box. Bell with alert dropdown. Settings dialog. Dog status card.                              |
| Inbox                           | Threats new since the last Clear that have no Triage status. A Clear button empties it. Riskiest first.                                                                                                                                                                       |
| All threats / My stack / Triage | The same list with different filters. Category chips (All, Packages, Languages, OS, AI, Tools) with counts, an "Exploited only" toggle, text search over ID, title and product.                                                                                               |
| Risk order                      | `exploited ? 100 : 0` + `mine ? 30 : 0` + `cvss * 5`, descending.                                                                                                                                                                                                             |
| Detail panel                    | Title, ID, CVSS bar, severity, published date, product, affected and fixed versions, summary, threat-type icon (bug, worm, virus, trojan, hacker), KEV required action when Exploited, a fix command (`npm`, Maven, Go, and PyPI added), and four Triage buttons that toggle. |
| Stack                           | Autocomplete over a catalog (about 70 entries by ecosystem), keyboard navigation (arrows, Enter, Escape), "add as typed", 14 one-click presets, removable tags.                                                                                                               |
| Mine matching                   | Word-boundary match of Stack terms against title, product and package.                                                                                                                                                                                                        |
| Scan dependencies               | Paste `package.json`, `requirements.txt`, `pom.xml` or `go.mod`. Runs in the browser. Lists matches with current version, fixed version and install command. Nothing is uploaded.                                                                                             |
| Field reports                   | Card grid, one filter chip per lab with counts, lab initials and colour, date, title, summary, "Covers" CVE chips (open the Threat when it is in the data, inert otherwise), "Read on site" link. Labs are generated from the collected data.                                 |
| Sources                         | Five groups (Government/CERT, Vendor, Advisory database, Security vendor, Security news) with descriptions, counts and links. Each Source shows whether it is collected or link-only, with its last Sweep result.                                                             |
| Alerts                          | Bell dropdown listing new Mine Threats filtered by level (Exploited only, Critical or exploited, Anything in my stack). A switch turns browser notifications on. Fires when the app opens or the data refreshes.                                                              |
| Settings                        | Theme, GitHub repo and labels (used for the prefilled new-issue link from the detail panel), alerts, JSON export and import of all user state.                                                                                                                                |
| Dog                             | Barks (alarm colour, count, "woof!") when a Mine Threat in the Inbox is Exploited. Patrols otherwise. Shown in the sidebar and the status card.                                                                                                                               |

### Differences from the design

- Google Fonts (`JetBrains Mono`, `Space Grotesk`) are self-hosted, so the app works offline and makes no third-party request.
- The "sample reports" banner shows only while the data is seed fixtures (`sample: true`). The first Sweep removes it.
- Sources count is 29, not 27: Microsoft Security Blog and Google Project Zero are added so every lab on the Field reports page is a listed Source.
- The design's 14 hand-written Threats become the seed fixtures and the test data.

## 3. Architecture

- **App**: Astro, static output, vanilla TypeScript, no UI framework. The design's markup is split into Astro components in `apps/web/src/components`, with one `global.css` carrying the design tokens (`--bg`, `--lime`, `--crit` and the rest, dark and light). Interactivity is small TS modules under `src/scripts`, with state in one store that renders to the DOM.
- **Monorepo**: Nx with pnpm. Project `web` at `apps/web`. Node 24, as in the devcontainer.
- **Data**: collectors in `apps/web/scripts/collect/*.ts` write `src/data/threats.json` and `src/data/reports.json`, plus a per-Source status file. The build reads them. Each collector is isolated: if one fails, the previous result for that Source is kept and its failure shows on the Sources page.
- **Data window**: all CISA KEV entries, plus NVD, GHSA and OSV Threats from the last 90 days with CVSS 7.0 or higher, plus anything the user may have triaged that is still in the file. Field reports cover the last three weeks per lab. A build gate fails if the data exceeds about 1 MB gzipped.
- **Enrichment**: Exploited from KEV only. Category from ecosystem and product. Threat type from CWE and keyword rules. A small overrides file holds hand-curated entries for notable CVEs. No LLM.
- **User state**: `localStorage`, with JSON export and import.
- **GitHub issue hand-off**: a prefilled `github.com/<repo>/issues/new?labels=…&title=…&body=…` link. No token, no API call.

### Sources

| Group                    | Sources                                                                                                                          | Collected through                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Government / CERT        | CISA KEV, NVD, CIRCL, CERT-EU, CERT-FR (ANSSI)                                                                                   | JSON and API, or RSS             |
| Government / CERT        | CSSF (Luxembourg)                                                                                                                | Link-only unless a feed is found |
| Vendor                   | Microsoft MSRC, Spring, Jenkins, Node.js                                                                                         | API, RSS or JSON                 |
| Vendor                   | Oracle CPU, OpenJDK, NGINX, Palo Alto, Sonar community                                                                           | Link-only unless a feed is found |
| Advisory database        | GitHub Advisory Database, OSV.dev, GitLab Advisory DB                                                                            | API or dataset                   |
| Advisory database        | Snyk, Docker Scout                                                                                                               | Link-only (no public feed)       |
| Security vendor and news | Sophos, Kaspersky, ESET, Sonatype, Microsoft Security Blog, Google Project Zero, BleepingComputer, The Hacker News, SecurityWeek | RSS, shown as Field reports      |

"Link-only" Sources are listed honestly on the Sources page and not collected. Promoting one to collected is an incremental change.

## 4. Offline and PWA

- Web app manifest with `start_url` and `scope` under the Pages base path, icons, theme colour and standalone display.
- Service worker: precache the app shell (HTML, JS, CSS, fonts, icons, manifest) under a build-hashed cache name. Fetch the data files network-first with a cache fallback. Show "last collected at …" and an offline badge when serving from cache. Show an "update available, reload" toast when a new worker is waiting. No auto-reload.
- At runtime the app makes no request to any other origin.

## 5. Repository and workflow

- **Branches**: `develop` is the default and integration branch. `main` is the release and deploy branch. History is linear (`merge.ff only`, `pull.ff only`, checked in CI).
- **Tooling**: husky `commit-msg` (commitlint with conventional commits and Nx scopes), `pre-commit` (lint-staged running Prettier and ESLint), `pre-merge-commit` (linear-history guard). TypeScript strict, ESLint flat config.
- **Tests**: Vitest for collectors against recorded fixtures, scoring, Mine matching, dependency-file parsing and fix commands. Playwright for a browser smoke test, theme, Triage persistence and an offline reload.
- **CI** (`ci.yml`): pull requests and pushes to `develop`. Install, `nx affected -t lint typecheck test build`, collect dry-run, linear-history check, PR title lint.
- **Deploy** (`deploy.yml`): on push to `main`, on cron `0 7,14 * * *` (UTC), and on manual dispatch. Collect, build, upload and deploy to GitHub Pages. The 7AM and 2PM times are UTC because GitHub cron has no time zone.
- **Release** (`release.yml`): on push to `main`, as in `tinesoft/claude-mods`. `nx release` with conventional commits, a `v<version>` tag, `CHANGELOG.md` and a GitHub Release. The first release is run by hand with a version specifier. A back-merge job brings `main` back into `develop`. The app shows its version in Settings.
- **Hosting**: `https://tinesoft.github.io/watchdog/`, no custom domain. A single `base` constant feeds Astro, the manifest and the service worker.

## 6. Delivery order

1. Workspace: Nx, pnpm, Astro app, TypeScript, ESLint, Prettier, husky, commitlint, lint-staged, devcontainer fit, CI.
2. Design shell: tokens, fonts, light and dark, sidebar, header, seed data, the Threat list and detail panel.
3. User state: store, Stack editor and Mine matching, Triage, Inbox and Clear, search, filters, Settings, export and import.
4. Scan, alerts and the Dog.
5. Collectors, enrichment and the Sources page, then Field reports.
6. PWA: manifest, service worker, offline behaviour, update toast.
7. Deploy and release workflows. Manual first release.

Each step is tested and committed in conventional-commit style on `develop`.

## 7. Out of scope for the MVP

- Real push notifications and background sync.
- A backend, accounts or cross-device sync beyond JSON export and import.
- Creating GitHub issues through the API.
- Scraping Sources that block bots (Snyk, Docker Scout).
- Live queries to OSV or NVD from the browser.
- A custom domain.

## 8. Risks

- Source feeds change or block without notice. Mitigated by isolated collectors, the keep-last-result rule and visible per-Source status.
- NVD rate limits. An API key is optional and read from a repository secret.
- Heuristic threat type and category are approximate. Overrides cover notable CVEs.
- Data size grows. The size gate catches it before deploy.

## 9. Addendum: found while porting the design (2026-11-25)

Items in the design that section 2 did not list. All are in the MVP.

- **Header:** a "swept 2 h ago · next in 22h00" pill (from the dataset's `collectedAt` and the cron hours), and a `/` shortcut that focuses search.
- **Threat list:** "Export CSV" of the current filtered list (spreadsheet-formula-safe), and the "Key" legend explaining the threat-type icons and severity bands.
- **Detail panel:** per-Threat notes, Copy command, "Copy as Markdown", "Copy link" (deep link `#CVE-…`) and "Add to my stack".
- **Alerts panel:** "Mark all as read" and an RSS feed link. The MVP therefore publishes `feed.xml`, an RSS 2.0 feed of the newest Mine-agnostic Threats (Exploited and critical first), written by the Sweep.
- **Scan dependencies:** the design accepts `package.json`, `package-lock.json`, `requirements.txt`, `go.mod`, `Cargo.lock`, `Gemfile.lock`, `composer.lock` and `pom.xml`, and has a "Check with OSV.dev" option that sends only package names and versions to `api.osv.dev`. This is the one runtime call to another origin. It is opt-in and off by default, and a Scan without it matches only the collected Threats. ADR 0001 is amended accordingly.
- **Settings:** "Reset everything", and the version shown at the bottom.
- **Copy mismatch:** the design says the dog patrols "every morning at 06:00". The app says 07:00 and 14:00 UTC, which is what runs.
