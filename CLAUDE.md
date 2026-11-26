## Agent skills

### Issue tracker

Issues and specs are markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Design source

The UI follows the design in `docs/design/`. `Main.dc.html` maps to `src/styles/design.css` (its `<helmet>` CSS), `src/scripts/templates.ts` (markup) and `src/scripts/main.ts` (state). See `docs/agents/design.md`.
