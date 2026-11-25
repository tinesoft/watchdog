# Contributing

This repository is one Nx workspace with one app, `web`: an Astro static site written in vanilla TypeScript. A scheduled GitHub Action collects public vulnerability data and publishes the site to GitHub Pages.

## Set up

Requires Node 24 and pnpm.

```sh
pnpm install
```

`pnpm install` also installs the Git hooks (Husky) and sets `merge.ff` and `pull.ff` to `only`.

The repository includes a dev container (`.devcontainer/`) with Node, pnpm, the GitHub CLI and Claude Code installed. Open the folder in VS Code and choose **Reopen in Container**; its setup script installs Chromium and its system libraries for the browser tests. Outside the dev container, install them yourself:

```sh
pnpm --filter web exec playwright install --with-deps chromium
```

## Repository layout

| Path                             | What it holds                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `apps/web/src/scripts`           | State, rendering (template modules) and event handling                          |
| `apps/web/src/lib`               | Pure logic with no DOM: ranking, matching, versions, scan parsers, fix commands |
| `apps/web/src/data`              | Static data bundled into the app: the catalogue and the Sources list            |
| `apps/web/scripts/collect`       | The Sweep: one module per source, the merge, the RSS writer and the size gate   |
| `apps/web/scripts/build-sw.ts`   | Writes `dist/sw.js` from `sw.template.js` with this build's file list           |
| `apps/web/data`                  | Seed fixtures (`seed/`) and the curated overrides (`overrides.json`)            |
| `apps/web/public`                | Manifest, icons, and `data/` and `feed.xml`, which a Sweep or the seed writes   |
| `apps/web/tests`, `apps/web/e2e` | Vitest unit tests and Playwright browser tests                                  |
| `tools/`                         | Repository scripts, such as the linear-history check                            |
| `docs/design/plan.md`            | The original plan and what changed since                                        |
| `docs/adr/`                      | Decisions that were hard to reverse                                             |
| `GLOSSARY.md`                    | The project's vocabulary                                                        |

## Development

```sh
pnpm dev                       # http://localhost:4321/watchdog/, on seed data
pnpm check                     # nx affected -t lint typecheck test build
pnpm format                    # prettier --write .
pnpm nx collect web            # run a real Sweep into apps/web/public
pnpm nx e2e web                # browser tests
```

Targets for `web`: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `e2e`, `seed` and `collect`. `dev`, `build` and `e2e` run `seed` first, which copies the fixtures into `apps/web/public/data` only when no data is there yet. A real Sweep overwrites them, and neither is committed.

Use the target-first form, for example `pnpm nx test web`.

## Writing code

- Use the words in `GLOSSARY.md`: a **Threat** is one vulnerability merged from every source, an **Advisory** is one source's record of it, a **Sweep** is one collection run. Do not drift to "vulnerability", "finding" or "sync".
- Everything that comes from a feed or from the user goes through `esc()` before it reaches `innerHTML`, and only `http` and `https` links become links (`safeUrl()`). Both live in `src/scripts/dom.ts`.
- Pure logic goes in `src/lib` and takes plain data, so a unit test needs no DOM.
- User state is one `Persisted` object in `localStorage`. Anything that reads stored or imported JSON goes through `sanitize()`.
- The page makes no request to another origin, except the opt-in OSV.dev check in `src/lib/osv.ts`. Do not add another without an ADR. See `docs/adr/0001-static-site-with-browser-held-state.md`.
- Affected versions are strings in one grammar, defined in `src/lib/version.ts` (`< X`, `≤ X`, `≥ X`, `A – B`, `A < B`, `X`, joined by `,`). Collectors write it and the Scan reads it. Extend both together.
- Do not import `.ts` files without the extension in `scripts/`: Node runs them directly.
- Keep TypeScript on 6.x until `typescript-eslint` and `astro check` support 7.

## Adding a source

1. Add the source to `apps/web/src/data/sources.json` with a stable `id`, and `mode: "collected"` or `"link-only"`. The Sources count and page follow from that file.
2. A source that creates Threats gets a module in `scripts/collect` that returns `Candidate`s (`candidate.ts`). A source that only adds records to Threats others found goes in `ADVISORY_FEEDS` (`feeds.ts`). A lab or news feed goes in `REPORT_FEEDS`.
3. Wire it in `scripts/collect/index.ts` through `run()`, so a failure is recorded and the previous result is kept.
4. Add a test against an inline fixture: collectors are tested without the network.
5. Check the real endpoint first (`curl -sL`). Many feeds redirect, and some block bots.

## Testing

Unit tests live in `apps/web/tests` and run with Vitest. Browser tests live in `apps/web/e2e` and run with Playwright against a production build, so the service worker is exercised.

- Collectors, parsers and ranking are tested with inline fixtures, never the network.
- A browser test that needs another origin mocks it with `page.route`.
- The suite runs in a dark colour scheme (`playwright.config.ts`), so theme labels do not depend on the machine.

Nx caches `lint`, `typecheck`, `test` and `build`. Add `--skip-nx-cache` to rerun them.

## Branches and commits

- Branch from `develop` as `feat/...`, `fix/...` or `chore/...`, and open a PR to `develop`. `main` is release-only.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/). The scope is the project name (`web`) or one of `repo`, `ci`, `deps`, `release`, `docs`. CI also checks the PR title against the same rules.
- Do not edit versions or `CHANGELOG.md` by hand. `nx release` owns them.
- History is linear. Merge commits are refused locally and checked in CI. Fast-forward `main` to `develop` with `git push origin develop:main`, never a merge commit, so `main` keeps the same commits `nx release` reads.

The Git hooks run on every commit:

- `pre-commit` runs Prettier and `eslint --fix` on staged files.
- `commit-msg` runs commitlint.
- `pre-merge-commit` refuses merge commits.

## Before you push

```sh
pnpm check
pnpm nx e2e web
```

CI runs the same, plus the linear-history check, on Node 24.

## How it ships

| Workflow      | When                                              | What                                                                                                                     |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`      | pull requests, pushes to `develop`                | linear-history check, lint, typecheck, unit and browser tests, build, PR title lint                                      |
| `deploy.yml`  | push to `main`, 07:00 and 14:00 UTC daily, manual | runs the Sweep, builds, deploys to GitHub Pages                                                                          |
| `release.yml` | push to `main`, manual                            | `nx release`: version from conventional commits, `CHANGELOG.md`, `vX.Y.Z` tag, GitHub Release, back-merge into `develop` |

GitHub cron has no time zone, so 7AM and 2PM are 07:00 and 14:00 UTC.

One-time setup on GitHub: Settings → Pages → Source: **GitHub Actions**. Optionally add an `NVD_API_KEY` repository secret to speed the Sweep up. Without it a Sweep takes a few minutes longer, because NVD allows five requests per 30 seconds.

## Releases

The app is versioned from `apps/web/package.json` and tagged `v<version>`.

- Push to `main`: `release.yml` runs `nx release --skip-publish`, which bumps the version when there are releasable commits, updates `CHANGELOG.md`, commits, tags and creates a GitHub Release. It then starts a deploy, because pushes made with `GITHUB_TOKEN` do not trigger workflows, and back-merges `main` into `develop`.
- The first release of the repository is run by hand: run the `Release` workflow with a `specifier` such as `1.0.0`. Until a release tag exists, the automatic run only prints a notice, because `nx release` would bump even a first release.
- Later by hand: run the `Release` workflow with `patch`, `minor`, `major` or an exact version.
- Preview locally: `pnpm nx release --dry-run`.
