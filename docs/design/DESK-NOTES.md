# Todak desk — Codex pass

21 September 2026. Version **0.2.0** in `todak-game-kit`, branch `wt/0051ff5a/todak-game-kit`. Local source and package delivery for Claude Code to integrate. No push or installation into Neo’s normal VS Code profile.

## Built

A **Desk** above the existing steps, design board, journey and review. The permanent “Demonstrator, not the kit.” footer remains. One multiline composer supports Enter to send, Shift+Enter for a newline, and Auto / Design / Build. All buttons and the chooser have a minimum 44 px target. Missing games, unreadable metadata and untrusted workspaces explain why the composer is unavailable.

Replies show cyan **Design desk · Astra**, green **Build desk · Claude Code**, both badges when applicable, or amber **Plan** / **Blocked**, followed by the router’s reason in plain text. The internal `awaiting_explain` reason is translated into an ordinary sentence. Text stays literal; only paragraphs and fenced code blocks receive structure. Changed-file chips are bound to a stored reply and checked against the game’s real filesystem path before opening, including symlink boundaries.

Every normal reply has **Send to the other desk instead**. Design goes to Build and Build to Design. Both / Plan / Auto-blocked replies offer explicit Design and Build choices under that link, because there is no single opposite. Overrides use the original saved student text, never regenerated text. They remain disabled during explain-back and while a request runs.

The kit’s plan notice is parsed into a ticked checklist. Its `Try:` prompt fills the composer without sending it. When the kit requests explain-back, the normal composer is disabled and replaced with **What did that change do? One sentence.** Success appears as the small system line **Thanks. Next step unlocked.** Clear does not bypass this gate.

Conversations are stored in VS Code `workspaceState`, keyed by the game root. Reload restores replies; games in the same workspace keep separate conversations. A request is saved before the child starts, and an interrupted request is labelled for checking rather than replayed. A response arriving after the selected game changes stays with its original game. Clear removes the conversation only, not `journey/prompts.jsonl` or metadata. Drafts and keyboard focus survive routine refreshes; unfinished drafts are not persisted across a full reload.

## Router connection

`desk.js` validates input and the JSON response and runs Node with `execFile`, a real argument array, `shell: false`, and the game root as `cwd`. No terminal, output streaming, new dependencies, network client or telemetry. The kit’s existing AI calls and journey sync remain its responsibility. No actual AI or network requests were made by the tests.

One request runs at a time. Explicit routes name the working desk. Auto says it is choosing Design or Build and working on the request; the synchronous contract provides no route until completion, so the UI does not pretend it knows which AI is running. Explain-back says it is saving the explanation. No separate timeout or cancel button is added: the kit already gives each AI a 600-second timeout and Both may run sequentially. Responses are buffered up to 16 MiB; process / buffer / malformed-JSON failures retain the student’s request with a plain recovery message. Raw stderr is not displayed.

The kit treats an argument beginning with `--` as a flag. The extension prefixes student text and explanation values with one space in argv; the kit trims it, preserving the intended text even for a message such as `--to`. No text passes through a shell.

Every completed or failed request refreshes metadata, steps, artwork, journey and review. Metadata is the durable explain-back state; a just-returned reply also gates the composer immediately if a file snapshot lags behind it. The extension never ticks steps or records journey entries itself.

## Try it

```sh
cd workbench/todak-sidebar
npm test
npx --offline @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license
code --install-extension ./todak-sidebar-0.2.0.vsix
```

Open a scaffolded game and set `todak.kitPath` to this checkout if it is not the game’s sibling `todak-game-kit`. Open Todak in the activity bar. Alternatively, open the extension folder and use F5 for an isolated development host. Installation is for the integrator to perform; this pass does not change the normal profile.

**Packaged offline:** `todak-sidebar-0.2.0.vsix`, 25,150 bytes. The requested `npx --offline` command found no cached registry metadata (`ENOTCACHED`), but an installed `@vscode/vsce` CLI was already present in the local npx directory. Invoking that installed CLI directly with the same package flags succeeded without downloading anything. The archive was checked for version 0.2.0 and exact runtime-source/README matches; tests and nested VSIX files are excluded. SHA-256: `02812a0788aa5282a0cac105654d871a5ae8a0553329905f98514f9d58b6d989`.

1. Send “Build me the whole game” on Auto. Check the plan ticks and click its suggested prompt.
2. Send “Make the left paddle move with W and S.” Check Build, its reason, paragraphs/code, files, and explain-back. Submit one sentence and check the unlock line.
3. Ask for artwork. Check Design, then use the other-desk link. Try a request for artwork and code to see both replies.
4. Refresh/reload after a completed reply, then Clear. Confirm journey and step progress remain, including a pending explain-back gate.

## Verification

- **24 Node tests passed**, including existing scaffold/step and art tests. New coverage includes every router JSON shape, per-desk failure, unsuccessful explain-back, literal argv, invalid output, duplicate requests, workspace trust, stale-game messages, per-game persistence, reload recovery, overrides, file allowlisting, symlink/path traversal boundaries, and post-reply journey/step refresh.
- **Offline Chromium smoke passed at 260, 320 and 400 px**, using the actual webview HTML/CSS/JS and a mocked VS Code bridge. It covers all routes, Enter and Shift+Enter, busy states, explain-back locking/unlocking, ambiguous override choices, file clicks, plan chips/ticks, Clear/reload, draft/focus retention, hostile text/code, no-game/trust/error states, 44 px targets, bounded conversation scrolling, footer clearance, light/dark/high contrast, and no page errors.
- Screenshots were inspected by eye. They use illustrative `demo` data, not actual student conversations. [Layout study](desk-layout.png), [260 px dark](desk-dark-260.png), [320 px dark](desk-dark-320.png), [light plan](desk-light-plan.png), [light both desks](desk-light-both.png).
- JavaScript syntax and `git diff --check` passed. Changes are confined to `workbench/todak-sidebar/` and `docs/design/`; the router and all other kit files are unchanged.

The local browser harness is reproducible with already-installed tools:

```sh
node workbench/todak-sidebar/test/browser-smoke.cjs /path/to/playwright /path/to/chrome /tmp/todak-desk-preview
```

## Claude Code’s integration / eye checks

Load **0.2.0** in the native extension host. Check actual VS Code colors, keyboard and IME input, narrow widths, screen-reader announcements, message-list scrolling, file opening and footer clearance. Browser screenshots do not verify VS Code’s iframe or native file commands. Try a multi-root workspace and an open `scripts/` subfolder, then a completed conversation reload. Change `awaiting_explain` with the CLI and verify the sidebar follows it.

Run real Design, Build and Both requests using the student’s installed/signed-in tools. Verify the desktop VS Code process can find Node, Codex and Claude on PATH, especially on Windows. Keep the window open until a reply arrives; a full extension-host reload during a run cannot guarantee delivery or cancellation of the router’s child AI processes. An interrupted entry explicitly says to check files and journey before another request. Native host, live AI, Windows and Godot checks remain **pending**.

## Notes for tgk

No router changes were made. Current contract details to consider during integration:

- **Whole-game guard:** currently runs only for `--to auto`. An explicit Design/Build choice or a required override can bypass the plan response. If the course guard must apply to every route, enforce it in `tgk ask`; the sidebar does not duplicate the router’s keyword rules.
- **Working desk:** naming the actual Auto route before completion needs a preflight/route event from the router. The current one-line final JSON contract cannot provide it.
- **File paths:** `gitChanged()` currently returns porcelain strings. Quoted names, Unicode escapes and rename descriptions are not always ordinary relative paths, and the list includes pre-existing working-tree changes. Return normalized relative paths (rename destination separately) if these should open reliably and represent only this request. Missing/deleted/unsupported paths currently show a plain error instead of opening a guessed target.
- The course page mentions single-login fallback and prompt scoring; these remain router/course responsibilities and were not invented in the UI.
- The plan checklist is parsed from `[x]` / `[ ]` lines in `notice`, as emitted now. Structured steps and a `suggested_prompt` would remove that text-format dependency in a future contract.

## KB maintainer proposal — not applied

For a future Game Kit KB entry: the local sidebar **0.2.0** implements one Desk over `tgk ask --json`, persisted per-game conversations and explain-back. Automated Node/browser checks passed. Describe it as local source/package awaiting Claude Code integration; native host, Windows and live AI are still unverified. This pass does not edit or publish neo-kb.
