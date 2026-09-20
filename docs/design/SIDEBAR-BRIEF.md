# Brief for Codex — the Todak sidebar and the Pong art (demonstrator)

Written 20 September 2026 by Claude Code. Codex owns UI/UX and the art; Claude Code integrates and verifies. Plan: https://course.neotodak.com/documentation/demo/v1/ · The student's screen: https://course.neotodak.com/documentation/classroom/v2/ (the Arcade animation shows the sidebar as designed). Read `README.md`, `bin/tgk.mjs`, `kit/instructions/INSTRUCTIONS.md` and `templates/pong/` first.

## Deliverable A · VS Code extension `workbench/todak-sidebar/`

A small VS Code extension (TypeScript or plain JavaScript, no bundler required, no network, no telemetry) that adds a **Todak** view container in the activity bar with one webview:

1. **Header:** game name, student, week, from `.tgk.json` in the workspace root (or the nearest parent). If none, show "Open a game folder" with a button that runs `tgk new pong <name>` after asking for the name.
2. **Today's steps:** the steps for the template (`scaffold`, `paddle`, `ball`, `publish` for pong; labels as in `bin/tgk.mjs` `STEPS`), ticked from `.tgk.json.steps`. Live-updates when `.tgk.json` changes (file watcher).
3. **Buttons** (real buttons, ≥44 px): Run · Build · Publish · Review. Each runs the matching `tgk` command in a VS Code terminal named "Todak" (`node <kit>/bin/tgk.mjs <cmd>`; the kit path comes from the setting `todak.kitPath`, default: sibling folder `../todak-game-kit` of the game, then `TGK_KIT` env). Show a spinner state on the button while the terminal is busy is optional; a simple "running…" text is fine.
4. **Design board:** a gallery of every image in `design/` and `assets/` (png, jpg, svg, webp), newest first, with the file name; click opens it in VS Code. Watches the folders.
5. **Recording status:** "recording · saved" in green when `journey/prompts.jsonl` was written in the last 10 minutes, "recording · idle" in grey otherwise, "no record" in amber if the file does not exist. Plus the count of prompts.
6. **Journey:** the last 8 prompts from `journey/prompts.jsonl` (desk, time, first 80 characters) and a button "Open journey" that opens the file.
7. **Review:** if `review/report.md` exists, show "N of M checks passed" from its bold line and a button to open it.
8. **Demonstrator label:** a permanent, small line at the bottom: "Demonstrator, not the kit."

Look: the site's tokens (see `documentation/v2/index.html` head in the course repo, or use VS Code's theme variables `--vscode-*` so it fits light and dark), plain and calm, no emoji, icons as inline SVG. Phone-width is irrelevant; the panel is 260–400 px wide. Keyboard reachable.

Provide `package.json` with `contributes.viewsContainers`, `contributes.views`, `contributes.commands` (`todak.run`, `todak.build`, `todak.publish`, `todak.review`, `todak.new`, `todak.openJourney`, `todak.openReport`) and a `README.md` with "install from folder" steps (`code --install-extension` of a packaged `.vsix` via `npx @vscode/vsce package`, plus the dev-host way). Do not publish to the marketplace.

## Deliverable B · Pong art in `templates/pong/assets/`

Pixel-art sprites in the Arcade palette of `docs/design/arcade-direction.dc.html` (in the course repo: background #14152a, panel #1f2140, line #4a4d8a, ink #f2f2ff, pink #ff6ba8, cyan #5be7ff, green #7cff6b):
- `paddle.png` 16×100, `ball.png` 16×16, `title.png` 960×540 (a title backdrop with room for the game's name in the middle; no text baked in), `icon.svg` (replace the placeholder, same motif: two paddles, a ball).
- Draw them as files (PNG with transparency where sensible). If you generate images with a model, downscale to exact sizes with nearest-neighbour and check the pixels. Keep the total under 300 KB.
- Do NOT wire them into the scenes; Claude Code will do that (the student's game scaffolds from the template, and the scenes use ColorRects on purpose until the art step).

## Rules

- Do not change `bin/tgk.mjs`, `kit/instructions/`, the `.tscn` or `.gd` files. If the extension needs something from `tgk` (for example a `--json` flag on `status`), write the request in your notes and Claude Code adds it.
- No secrets, no network calls, no analytics.
- When done: `npm test` or a smoke run of the extension host if you can; otherwise a careful read. Commit on the current branch with the message `Todak sidebar extension + Pong art — Codex pass`, write `docs/design/SIDEBAR-NOTES.md` (what you built, how to install, what to check by eye, what you need from tgk). Do not push. Then stop.
