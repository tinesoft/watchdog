# Debounce the Threat search

Status: ready-for-agent

## Why

Each keystroke in the search bar (`#wd-q`, `data-in="q"`) runs a full `render()`, which costs 50–200 ms on a mid-range phone with ~2,500 Threats (see `01-keep-the-list-fast-and-the-inbox-calm.md`). A debounce merges a typing burst into one render. It does not make a render cheaper: that is still issue 01's job.

## What to build

- `e.q` updates on every `input` event. Only the `render()` call is delayed: trailing edge, 150 ms, no leading edge.
- Render immediately (and cancel the pending timer) when:
  - the field is cleared (the ✕ of `type="search"`, or deleting the last character);
  - the user presses Enter in the field;
  - typing starts on a non-list view: the jump to `all` renders at once, then later keystrokes are debounced.
- Any other `render()` while a debounce is pending (a triage click, a view change…) cancels the pending timer and renders with the current `e.q`, so the screen always matches the field and no render runs twice.
- Only the Threat search is debounced. The Stack autocomplete (`data-in="ac"`) stays instant.
- The debounce lives in a small helper with `flush` and `cancel`, kept outside `main.ts` so it can be unit-tested.

## Acceptance criteria

- [x] Unit tests in `apps/web/tests/` with Vitest fake timers: a burst of calls merges into one; `flush` runs the pending call now; `cancel` drops it.
- [x] Clearing the field, pressing Enter, and typing from a non-list view render without waiting.
- [x] A render triggered by something else while a debounce is pending leaves no second render behind.
- [x] The existing e2e search test (`e2e/app.spec.ts`, `fill('php')`) still passes.

## Comments

- 2026-11-27: Done. `src/lib/debounce.ts` (unit-tested in `tests/debounce.test.ts`) drives `searchRender` in `main.ts`. `render()` cancels any pending search render. The e2e test "search waits for a pause in typing…" in `e2e/app.spec.ts` pauses the Playwright clock to check the delay, Enter, clearing, and a click during the wait. Not covered by a test: the jump to `all` from a non-list view (it renders at once, as before).
