# Todak Game Kit — demonstrator

The kit behind the Todak AI Creator Program Game Track. **Demonstrator, not the kit**: built in two weeks so a beginner can make and publish Pong in a ten-minute live demo. Plan: https://course.neotodak.com/documentation/demo/v1/

## What is here

- `bin/tgk.mjs` — the one command both AI desks call: `new`, `run`, `build`, `publish`, `review`, `remember`, `recall`, `journey`, `status`, `step`, `log-prompt`.
- `templates/pong/` — a Godot 4.7 project with the parts a student assembles: paddles, ball, score, title screen, win state, sound, saved high score. Two parts are left for the student and the Build desk to finish: the left paddle's movement and the ball's launch.
- `kit/instructions/` — the shared instruction file both desks read (`CLAUDE.md` for Claude Code, `AGENTS.md` for Codex; same text).
- `kit/hooks/` — Claude Code hooks that record every prompt into the student's journey.

## Quick start (Mac, Linux, Windows)

```
node bin/tgk.mjs new pong my-pong --student demo --week 3
cd my-pong
node ../bin/tgk.mjs run          # the game window
node ../bin/tgk.mjs build web    # build/web/index.html
```

Godot: set `GODOT_BIN` to the Godot 4.7 executable, or let `tgk` find it (PATH, `/Applications/Godot.app`, the RUSH toolchain copy on Neo's Mac, `godot.exe` on Windows).

Code and lanes follow the plan on course.neotodak.com. Publishing goes through Todak Studios accounts; the demonstrator publishes to the web showcase only.
