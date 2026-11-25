# watchdog

A static web app that tells you which public vulnerabilities affect the software you run. A scheduled GitHub Action collects them from authoritative sources; your Stack and Triage decisions stay in your browser.

- Plan: [`docs/design/plan.md`](docs/design/plan.md)
- Vocabulary: [`GLOSSARY.md`](GLOSSARY.md)
- Decisions: [`docs/adr/`](docs/adr/)

## Develop

```sh
pnpm install
pnpm dev     # http://localhost:4321/watchdog/
pnpm check   # lint, typecheck, test, build
```

Branches: `develop` is the default; `main` is the release and deploy branch. History is linear. Commits follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint on commit and on PR titles. Scopes: `web`, `repo`, `ci`, `deps`, `release`, `docs`.

## How it ships

| Workflow      | When                                                  | What                                                                                                                                  |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`      | pull requests, pushes to `develop`                    | linear-history check, lint, typecheck, unit and end-to-end tests, build, PR title lint                                                |
| `deploy.yml`  | push to `main`, **07:00 and 14:00 UTC daily**, manual | runs the Sweep (`pnpm nx collect web`), builds, deploys to GitHub Pages                                                               |
| `release.yml` | push to `main`, manual                                | `nx release`: version from conventional commits, `CHANGELOG.md`, `vX.Y.Z` tag, GitHub Release, then back-merges `main` into `develop` |

One-time setup on GitHub: Settings → Pages → Source: **GitHub Actions**. Optionally add an `NVD_API_KEY` repository secret to speed up the Sweep. The first release is run by hand: Actions → Release → Run workflow with the first version (for example `1.0.0`) as the specifier. After that every push to `main` releases whatever its commits call for.

## The Sweep

`pnpm nx collect web` fetches the sources (CISA KEV, GitHub Advisories, NVD, advisory feeds, lab and news feeds), merges them and writes `apps/web/public/data/*.json` and `feed.xml`. A source that fails keeps the last published result and shows as failed on the Sources page. Sources with no usable public feed are listed as link-only. `pnpm nx seed web` puts the seed fixtures in place so `pnpm dev` works without a Sweep.
