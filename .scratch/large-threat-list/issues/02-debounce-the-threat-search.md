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

- [ ] Unit tests in `apps/web/tests/` with Vitest fake timers: a burst of calls merges into one; `flush` runs the pending call now; `cancel` drops it.
- [ ] Clearing the field, pressing Enter, and typing from a non-list view render without waiting.
- [ ] A render triggered by something else while a debounce is pending leaves no second render behind.
- [ ] The existing e2e search test (`e2e/app.spec.ts`, `fill('php')`) still passes.

## Comments
