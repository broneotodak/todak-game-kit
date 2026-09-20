# Sidebar + Pong art — Codex pass

20 September 2026. Built in `todak-game-kit`, branch `wt/0051ff5a/todak-game-kit`. Local delivery for Claude Code to integrate and verify. Nothing published, installed into the user's normal VS Code profile, or pushed.

## Built

`workbench/todak-sidebar/` is a plain JavaScript extension with no runtime dependencies or bundler. The Todak activity bar container has one webview: game/student/week, four exact Pong step labels, 44 px command buttons, recursive artwork gallery, recording freshness and prompt count, eight recent prompts, report summary, and a permanent demonstrator footer.

The panel uses VS Code theme variables. It has keyboard buttons, visible focus, text labels in addition to status colors, and an inline SVG icon set. Watchers refresh on create/change/delete; a 30-second timer ages recording status. Metadata discovery also watches ancestor `.tgk.json` files. A partially written metadata file shows a recoverable error; incomplete JSONL rows are counted separately and skipped.

Commands run with Node as the terminal process, real arguments, game-root working directory, and terminal name `Todak`. Each invocation gets its own terminal, so a command cannot be entered into a running game's input. The notice says “started”; it does not imply command success. The kit setting overrides the sibling-folder default, then `TGK_KIT` is the fallback. Workspace trust gates command execution, including Command Palette actions.

The sidebar reads existing files and delegates actions to `tgk`. It does not record prompts, invent review results, modify step state, add a service, or collect telemetry. Webview content and images cannot make network requests. No CLI, shared instructions, scenes, scripts, or Godot project settings were changed.

## Pong art

Original pixel art drawn locally with `draw-pong-art.mjs`. No model, downloaded assets, external fonts, or image packages. All pixels use the supplied seven-color Arcade palette, plus transparency. PNGs use a strict 2× nearest-neighbour pixel grid.

| File under `templates/pong/assets/` | Dimensions | Bytes | Use |
| --- | --- | ---: | --- |
| `paddle.png` | 16 × 100 | 173 | Cyan edge, ink face, transparent corners |
| `ball.png` | 16 × 16 | 122 | Pink edge, ink face, transparent corners |
| `title.png` | 960 × 540 | 4,153 | Quiet court; clear middle for live title/instructions; no baked text |
| `icon.svg` | 128 × 128 viewBox | 744 | Two paddles, one ball, matching court motif |

Total: **5,192 bytes**, well below 300 KB. The existing `templates/pong/icon.svg` placeholder is replaced with the identical icon because `project.godot` already points there; including that copy gives 5,936 bytes. All scene art remains unwired. Keep nearest texture filtering when Claude Code adds the sprites; the existing ColorRects remain unchanged.

Regenerate the exact files from the kit root with `node docs/design/draw-pong-art.mjs`.

## Install / try

From the kit root:

```sh
cd workbench/todak-sidebar
npm test
npx @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license
code --install-extension ./todak-sidebar-0.1.0.vsix
```

For offline packaging, the packaging tool must already be installed/cached; use `npx --offline`. This pass did not download it, create a VSIX, or publish to the Marketplace. Set `todak.kitPath` to this checkout when the game does not have a sibling named `todak-game-kit`.

For development, open `workbench/todak-sidebar` in VS Code, press F5, then open a game in the new host. Full setup and path rules: [extension README](../../workbench/todak-sidebar/README.md).

## Verified here

- `npm test --prefix workbench/todak-sidebar`: **12 passing tests**. Includes real CLI scaffold and step completion, metadata ancestry, malformed JSON recovery, gallery traversal, interrupted JSONL append, ten-minute recording boundary, summary parsing, kit resolution, safe new-game names, commands and watchers through a mocked VS Code API, restricted webview messages, and exact PNG pixels.
- Offline Chromium smoke with the real HTML/CSS/JS and a mocked VS Code message bridge: **passed** at 260, 320, and 400 px. Checked light/dark/high contrast, buttons at least 44 px, Enter activation, focus retention after gallery refresh, hostile text rendered literally, missing game/log, trust-disabled actions, and footer clearance.
- Inspected dark/light screenshots and title art by eye. [Dark preview](sidebar-dark.png), [light preview](sidebar-light.png). Preview images contain illustrative `demo` data, not real student records.
- JavaScript syntax checks and `git diff --check` passed. Changes to prohibited CLI/instruction/scene/script paths: none.

## Claude Code's integration / eye checks

1. Package and load in the actual VS Code extension host. Check the activity-bar icon, 260–400 px layout, long names, focus ring, actual theme colors and scrolling with eight prompts/many images. Browser previews do not verify VS Code's iframe or native terminal process.
2. Open a scaffolded game, then open only its `scripts/` folder. Confirm the same root and setting are used. Change a step with `tgk step done paddle`; save, add and delete art; rename folders; append a prompt and run Review. Confirm native watcher updates and image opening. Try an empty folder and Create a Pong game.
3. Run, Build and Review using the configured Godot installation. Confirm terminal output stays readable after exit. Check Windows Node-on-PATH behavior and paths with spaces. Native host, Godot execution and Windows remain **unverified** here.
4. In the designated showcase checkout, verify Publish through the normal integration process. Publish was **not run** during this pass.
5. Wire the art during the student's art step. Keep title text live, inspect nearest filtering at 1× and 2×, and check paddle/ball visuals against their existing 16×100 and 16×16 gameplay bounds.

## What is needed from tgk

**No blocking CLI change.** The current `.tgk.json`, JSONL prompt rows (`at`, `desk`, `prompt`), and bold report line provide everything required. No `--json` flag is needed for this pass.

The extension mirrors `STEPS.pong`. When adding a template, update both lists or expose a shared declarative template manifest. The English bold report line is a small format contract; if it changes, update the parser or add a structured report alongside Markdown. These are integration notes, not changes made to the CLI.

Recording freshness means the local log was recently written. It does not prove both AI desk hooks are active. Keep the existing kit recording setup and verification with Claude Code.

## KB maintainer proposal — not applied

If maintaining a Game Kit entry in neo-kb, record this only as a **local Codex implementation awaiting Claude Code integration**: the sidebar source is under `workbench/todak-sidebar/`; the art is in `templates/pong/assets/`; Node and browser checks passed; native-host/Windows/showcase checks remain pending. Do not label the demonstrator deployed or the art integrated. This pass does not edit or publish neo-kb.
