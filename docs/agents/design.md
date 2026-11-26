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

Grep the local copy when it is current. When the design changed in the artifact, sync it first.

## Syncing from the artifact

1. Read only the project files: Artifact `read` with `paths: ["project/Main.dc.html", "project/Mobile.dc.html", "project/canvas.json"]` and `out_dir` in the scratchpad.
2. `diff` each against `docs/design/`. The diff of `Main.dc.html` is the spec for the code change.
3. Copy the new `Main.dc.html` over, keeping the local copy's three `./_runtime/{react,react-dom,support}.js` script tags in place of the artifact's single `./support.js`. Leave `canvas.json` and `Mobile.dc.html` as they are when they differ only in that export format.

## Verifying a UI change

Screenshot the changed state at the target viewport (390px for mobile) and look at it before reporting done. `e2e/mobile.spec.ts` guards sideways overflow only.

From `apps/web`, `node scripts/shot.ts --width 390 --click "All threats" out.png` builds, serves, shoots and stops the server; its header lists the options (`--wheel`, `--wait`, `--no-build`, ...). Write shots to the scratchpad.

For a before/after, shoot the old commit from a worktree; the working tree stays untouched:

```sh
git worktree add --detach "$W" HEAD
ln -s "$PWD/node_modules" "$W/node_modules"
ln -s "$PWD/apps/web/node_modules" "$W/apps/web/node_modules"
(cd apps/web && node scripts/shot.ts --root "$W/apps/web" --width 390 before.png)
git worktree remove --force "$W"
```
