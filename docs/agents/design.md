# Design source

`docs/design/` is a local copy of the design artifact: https://claude.ai/code/artifact/61134e4a-8032-4e54-9aa8-0467ea3b762b

- `Main.dc.html`: the app artboard, desktop and mobile. Mobile is its `@media (max-width: 760px)` block.
- `Mobile.dc.html`: a 390px frame that imports `Main`; it holds no markup of its own.

## Mapping to the codebase (`apps/web/src`)

| Design                  | Code                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `<helmet>` CSS          | `styles/design.css`                                          |
| Markup with `{{holes}}` | `scripts/templates.ts` (strings with `data-act` / `data-in`) |
| `setState` handlers     | `actions` in `scripts/main.ts`; state in `scripts/state.ts`  |

Grep the local copy; reading the artifact link costs a large instruction dump.

## Verifying a UI change

Screenshot the changed state at the target viewport (390px for mobile) and look at it before reporting done. `e2e/mobile.spec.ts` guards sideways overflow only.
