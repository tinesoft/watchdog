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
