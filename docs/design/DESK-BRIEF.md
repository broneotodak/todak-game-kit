# Brief for Codex — the Todak desk: one box in the sidebar, two AIs behind it

Written 21 September 2026 by Claude Code for Neo. Codex owns the UI; Claude Code owns the router (`tgk ask`) and integrates. Read `docs/design/SIDEBAR-NOTES.md`, `workbench/todak-sidebar/*`, `bin/tgk.mjs` (the `ask` command and its `--json` output) and, in the course repo, `documentation/classroom/v2/index.html` section 03 ("One box, two AIs behind it").

## Why

Neo and Lan: a beginner with little AI knowledge will not know which of two chat panels to type into. So the student gets **one box** in the Todak sidebar. Behind it the kit's router (`tgk ask`) sends the request to the design desk (Astra, through Codex) or the build desk (Claude Code) or both, and the box shows which and why. Course rules live in the box: a whole-game guard, step gating, and explain-back.

## The contract (already built and tested in `bin/tgk.mjs`)

`node <kit>/bin/tgk.mjs ask "<text>" [--to auto|design|build] [--explain "<sentence>"] --json` run in the game folder prints ONE JSON line:

- `{ ok, route: "plan"|"design"|"build"|"both"|"blocked", reason, step, notice, next }` for plan/blocked (no AI ran);
- `{ ok, route, reason, step, results: [{ desk: "design"|"build", tool: "codex"|"claude", ok, text }], files: [changed paths], awaiting_explain, notice, result, next }` after an AI ran.
- `tgk ask --explain "<sentence>" --json` → `{ ok, notice, step }` and unlocks the next change.
- A run takes 10 s to 3 min. The command is synchronous; run it as a child process (not a terminal) and stream nothing: show a "working" state with the desk name, then render the result.

## Deliverable · `workbench/todak-sidebar/` gains a **Desk** section at the top of the panel

1. **Input:** a multi-line text box (Enter sends, Shift+Enter newline), a Send button (≥44 px), and a small "to" chooser: Auto · Design · Build (Auto default). Disabled with a reason when no game folder or workspace not trusted.
2. **Messages:** a scrolling list of exchanges. Each student message shows the text. Each reply shows a **route badge** ("Design desk · Astra" in cyan, "Build desk · Claude Code" in green, "Both" with two badges, "Plan" in amber, "Blocked" in amber) with the `reason` under it in plain words, then the AI's text (rendered as plain paragraphs; code fences as `<pre>`), then the changed files as chips that open the file on click.
3. **Override:** on every reply, a link "Send to the other desk instead" that re-sends the same text with `--to design` or `--to build`.
4. **Explain-back:** when `awaiting_explain` is true, the input area changes into "What did that change do? One sentence." with its own Send that calls `--explain`. Until then the normal input is locked with that notice. The unlock reply ("Thanks. Next step unlocked.") shows as a small system line.
5. **Plan replies** (whole-game guard) render the step list with ticks and the suggested next prompt as a clickable chip that fills the input.
6. **Journey and steps** sections already exist below; keep them, and refresh them after every reply (the router writes to `journey/prompts.jsonl` and may tick steps).
7. **Copy:** plain English, no jargon; the permanent footer stays. Optional Bahasa Malaysia is not required in this pass.
8. **Persistence:** keep the conversation in workspace state so it survives a reload; a "Clear" link.
9. **Tests:** extend the existing node tests with the router JSON shapes (mock the child process) and a browser smoke of the desk at 260, 320 and 400 px. No network, no telemetry, no new dependencies.

## Rules

- Do not change `bin/tgk.mjs` or any file outside `workbench/todak-sidebar/` and `docs/design/`. If you need something from the router, write it in your notes.
- Commit on the current branch as `Todak desk: one box in the sidebar — Codex pass`, write `docs/design/DESK-NOTES.md` (what you built, how to try it, what to check by eye, what you need from tgk), package a new `.vsix` (bump to 0.2.0) with `npx @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license` if the tool is available offline, otherwise say so. Do not push. Then stop.
