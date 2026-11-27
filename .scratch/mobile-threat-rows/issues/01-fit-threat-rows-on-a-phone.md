# Fit Threat rows on a phone

Status: needs-triage

## Why

At 390px the Threat rows are cramped: the CVE ID wraps over three lines ("CVE-" / "2021-" / "44228") with the NEW tag squeezed beside it, and the title is cut to a few letters ("Log…"). It happens with the seed data too. Found while screenshotting `.scratch/large-threat-list/issues/01-keep-the-list-fast-and-the-inbox-calm.md`.

The cause is the row grid. `.trow` in `apps/web/src/styles/design.css` (and in the design, `docs/design/Main.dc.html`) is `grid-template-columns: 40px minmax(0, 1fr) 92px 112px` with `gap: 14px` and `padding: 12px 16px`. That is 318px of fixed width, which leaves about 72px for the ID and title on a 390px screen. The `@media (max-width: 760px)` block doesn't change it, in the code or in the design.

## To decide (needs the maintainer)

- On a phone, where do the severity chip and the tag column (exploited, ◆ my stack, Triage status) go: a second line under the title, or a narrower column?
- Can the icon tile shrink or go away on a phone?
- Does the title get one line (ellipsis) or two?

## Acceptance criteria (draft)

- [ ] The design artifact's 760px block sets the phone row layout first, then it is synced to `docs/design/` (see `docs/agents/design.md`).
- [ ] At 390px a CVE ID stays on one line and the title shows at least about 25 characters.
- [ ] A row with all three tags (exploited, my stack, a Triage status) still fits, checked with a screenshot.
- [ ] `e2e/mobile.spec.ts` still passes (no sideways scroll).

## Comments
