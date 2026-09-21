# Todak sidebar

A local VS Code sidebar for the Todak Game Kit demonstrator. Plain JavaScript, no bundler, runtime dependencies, added network client or telemetry. The Desk delegates AI requests to the kit and the student’s existing tools. Requires desktop VS Code 1.85+ and Node 18+ on PATH for kit commands.

## Install from this folder

Package locally, then install the file. This does not publish to the Marketplace.

```sh
cd workbench/todak-sidebar
npm test
npx @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license
code --install-extension ./todak-sidebar-0.2.0.vsix
```

The packaging command needs the `@vscode/vsce` tool. On an offline machine where it is already cached, use `npx --offline @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license`. No `npm install` is needed to run or test the extension itself. The VSIX is ignored by Git. Reload VS Code if prompted, open a game folder and select **Todak** in the activity bar.

## Development host

Open **this extension folder** (`workbench/todak-sidebar`) in VS Code and press **F5**, using the included launch configuration. In the Extension Development Host, open a scaffolded game and select Todak. No compilation step is needed.

Alternatively, from the kit repository root:

```sh
code --new-window --extensionDevelopmentPath="$PWD/workbench/todak-sidebar" /absolute/path/to/my-pong
```

## Find the kit

The game is the first workspace folder with `.tgk.json`, or its nearest ancestor with that file. In a multi-folder workspace, folder order decides which game appears. Metadata, artwork, journey and review are read from that game's root, including when VS Code was opened in its `scripts/` folder.

`todak.kitPath` points to the **kit folder**, not the CLI file. Resolution order:

1. The explicit `todak.kitPath` setting. Relative paths resolve from the game root. An invalid explicit path produces an error so a typo is visible.
2. A sibling `../todak-game-kit` folder containing `bin/tgk.mjs`.
3. The `TGK_KIT` environment variable inherited by VS Code.

For example, in VS Code settings:

```json
{ "todak.kitPath": "/absolute/path/to/todak-game-kit" }
```

On Windows, forward slashes work in JSON, for example `C:/course/todak-game-kit`. Relaunch VS Code after changing its environment. Godot and publishing configuration remain the kit's responsibility (`GODOT_BIN`, `TGK_SHOWCASE_REPO`, and optionally `TGK_SHOWCASE_URL`).

## The Desk

The **Desk** sits above your steps. Type one small request, leave **To: Auto** selected, and press **Enter** or **Send**. **Shift+Enter** adds a line. Choose **Design** or **Build** to send directly to that desk. Replies show who handled the request, why, their text, and files you can open.

- A whole-game request in Auto gets the kit’s step plan. Click its suggested prompt to fill the input.
- **Send to the other desk instead** resends the same request. For a reply from both desks, a plan, or a blocked Auto request, the link offers Design and Build explicitly.
- After a change that needs explain-back, the composer asks **What did that change do? One sentence.** Send that explanation to unlock the next request. The normal composer and overrides stay disabled until then.
- The conversation is saved in this workspace, separately for each game folder. **Clear** removes the displayed conversation; it does not clear the game’s journey or unlock explain-back.
- A working message stays visible until the synchronous kit command finishes. With Auto, the actual route is only known after the reply. Do not reload during a run; if a reload interrupts the reply, the saved request is marked for checking and is never sent again automatically.

The Desk runs `node <kit>/bin/tgk.mjs ask ... --json` as a child process, using literal arguments and the game as its working directory. It does not open a terminal or stream output. Only one request runs at a time. AI tools and journey syncing remain the kit’s responsibility. No AI calls run in this extension’s tests.

Open files only through chips from saved replies; files outside the game (including symlinks out of it) cannot be opened through a chip. Missing or renamed files show a plain error. The kit must provide ordinary relative paths; quoted Git porcelain paths and rename descriptions need normalization in the router.

## What it does

- Shows game, student, week and completed template steps. Progress is read-only; the kit updates it.
- **Run**, **Build**, **Publish**, and **Review** launch `node <kit>/bin/tgk.mjs run`, `build web`, `publish web`, or `review`, with the game as working directory.
- Each invocation opens a terminal named **Todak**, with Node as its process and a real argument array. Paths never become shell commands. Read the command result there; the sidebar's “started” notice is not a success or busy indicator. Close completed terminals normally.
- With no game, **Create a Pong game** asks for a folder name and parent location, then runs `new pong <name>`. Choose **Open game folder** after the terminal reports creation, or open it through VS Code.
- Recursively lists PNG, JPG/JPEG, SVG and WebP images in `design/` and `assets/`, newest modification first. Click or press Enter to open an image. Symbolic links are skipped.
- Watches metadata, artwork, journey and review for additions, edits and deletions. Recording age is also checked every 30 seconds: saved for less than 10 minutes since the log's last write, idle afterwards, no record if absent.
- Counts valid prompt rows and shows the last eight in reverse file order, with local date/time, desk and an 80-character excerpt. Malformed/partial JSONL rows are skipped with a visible note. This extension displays the log; it does not record or collect prompts itself.
- Reads the bold “N of M checks passed” line from `review/report.md`. Unrecognised summaries still provide an open-report button.

All seven actions are also available under **Todak** in the Command Palette. In an untrusted workspace, command execution is disabled; local data remains readable. The webview uses a restrictive content policy, local image roots, text-only insertion of file content and an explicit command allowlist. Publish delegates to the existing kit command, including its configured showcase workflow; the extension adds no service or network client.

## Checks

```sh
npm test
```

Twenty-four Node tests cover router reply shapes and mocked child processes, conversation persistence and explain-back, other-desk overrides, file boundaries, failure recovery, plus an actual scaffold, parent discovery, kit path precedence, prompt parsing, report parsing, gallery changes, mocked VS Code command/watcher behavior, trust checks, and PNG dimensions/palette/transparency. These tests run from the kit checkout; tests are excluded from the VSIX.

An optional browser smoke check uses an **already installed** Playwright and Chromium; it downloads nothing:

```sh
node test/browser-smoke.cjs /path/to/playwright /path/to/chrome /tmp/todak-preview
```

It checks all Desk routes, keyboard submission, Shift+Enter, busy states, explain-back, overrides, file chips, Clear/reload, drafts and focus, safe rendering, empty/trust states, button sizes, widths 260/320/400, light/dark/high contrast, and saves previews. It uses sample game data and a mocked VS Code message bridge, not a running extension host. Native VS Code and Windows checks remain part of the integration handoff in `docs/design/DESK-NOTES.md`.

Demonstrator, not the kit.
