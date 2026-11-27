# Fit Threat rows on a phone

Status: ready-for-agent

## Why

At 390px the Threat rows are cramped: the CVE ID wraps over three lines ("CVE-" / "2021-" / "44228") with the NEW tag squeezed beside it, and the title is cut to a few letters ("Log…"). It happens with the seed data too. Found while screenshotting `.scratch/large-threat-list/issues/01-keep-the-list-fast-and-the-inbox-calm.md`.

The cause is the row grid. `.trow` in `apps/web/src/styles/design.css` (and in the design, `docs/design/Main.dc.html`) is `grid-template-columns: 40px minmax(0, 1fr) 92px 112px` with `gap: 14px` and `padding: 12px 16px`. That is 318px of fixed width, which leaves about 72px for the ID and title on a 390px screen. The `@media (max-width: 760px)` block doesn't change it, in the code or in the design.

## To decide (needs the maintainer)

- On a phone, where do the severity chip and the tag column (exploited, ◆ my stack, Triage status) go: a second line under the title, or a narrower column?
- Can the icon tile shrink or go away on a phone?
- Does the title get one line (ellipsis) or two?

## Acceptance criteria (draft)

- [x] The design artifact's 760px block sets the phone row layout first, then it is synced to `docs/design/` (see `docs/agents/design.md`).
- [x] At 390px a CVE ID stays on one line and the title shows at least about 25 characters.
- [x] A row with all three tags (exploited, my stack, a Triage status) still fits, checked with a screenshot.
- [x] `e2e/mobile.spec.ts` still passes (no sideways scroll).

## Comments

- 2026-11-27: Decided (only inside the 760px block; desktop unchanged; design first, then sync and code):
  - **Layout**: the grid becomes icon | main | severity chip. The tags (exploited, ◆ my stack, Triage status) wrap on one line under the title and span the main and chip columns.
  - **Icon**: the tile shrinks to 32px and stays.
  - **Title**: up to two lines, then an ellipsis.
- 2026-11-27: Done.
  - **Design**: version 49 of the design artifact, synced to `docs/design/Main.dc.html`. The row's parts now have classes (`trow-ic`, `trow-main`, `trow-title`, `trow-tags`), with phone rules in the 760px block. The same classes and rules are in `templates.ts` (`row()`) and `styles/design.css`.
  - **Title width**: at 390px the title gets about 196px, not the 270px estimated while deciding, because the severity chip keeps its column for the whole row. That is about 25 characters a line on two lines, which meets the criterion. To give the title the full width, the chip would have to move into the ID line, which changes the markup.
  - **Test**: `e2e/mobile.spec.ts` covers a row with all three tags (Log4Shell: exploited, my stack, Investigating). It checks the ID height (one line), the title width (more than 180px), that the tags stay inside the row, and that nothing scrolls sideways.
  - **Screenshots**: 390px and desktop, checked. Desktop is unchanged.
