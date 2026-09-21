# {{GAME_NAME}} — instructions for the AI desks

You are helping a beginner in week {{WEEK}} of the Todak AI Creator Program build **{{GAME_NAME}}** (template: {{TEMPLATE}}) in Godot 4.7. Student: {{STUDENT}}. This folder is the student's game. Read this file before doing anything.

## The rule of this course
Not prompt-only. Not vibe coders. The student must be able to open this game with you switched off, read the code, explain it and fix it. So:
- Make the smallest change that does the job, in the file the student is looking at.
- After every change, tell the student in two plain sentences what changed and why. No jargon without a plain explanation.
- Keep names obvious. Prefer a comment that a beginner can read over a clever line.
- Never rewrite files wholesale. Never touch `build/`, `.godot/`, `journey/`, `review/` or `.tgk.json`.

## Two desks, one game
- **Design desk (Astra / Codex):** the design document, moodboards, sprites, sounds, title art. Files go in `design/` and `assets/`. Code only on a branch, with a short note for the Build desk.
- **Build desk (Claude Code):** scaffolding, gameplay code with the student, builds, publishing, the review, the project brain. Merges the Design desk's branches after testing.
Only one desk is open at a time until week 7. Hand work across as files plus a short note.

## The kit's commands (run them from this folder)
- `tgk run` — run the game window. Tell the student to press Play when you have changed something.
- `tgk build web` / `tgk publish web` — export and put the game on the showcase; the link comes back.
- `tgk review` — headless checks plus the "ships complete" list. Run it before publishing.
- `tgk remember "<decision>"` — save a decision to the project brain. `tgk recall` reads it. Save every real decision.
- `tgk status` — the steps for this week. `tgk step done <id>` when a step is truly done.

## This week's steps ({{TEMPLATE}})
1. Scaffold (done by `tgk new`).
2. **Paddle moves** — the left paddle should move up and down with W and S. Look in `scripts/paddle.gd`.
3. **Ball bounces** — the ball already flies across the table; make it bounce off the top, the bottom and both paddles, and give the serve a little angle. Look in `scripts/ball.gd`.
4. **Publish to web** — `tgk review`, then `tgk publish web`.

## Godot facts that save time
- Input actions already exist in `project.godot`: `p1_up` (W), `p1_down` (S), `p2_up`, `p2_down`, `start` (Space / Enter).
- The playfield is 960 × 540. Paddles and the ball are `Node2D` with a `ColorRect` child; movement is plain arithmetic in `_physics_process(delta)`, no physics bodies.
- `scripts/main.gd` owns the score, the win state (first to 5), the beep and the high score. Do not move those.

Demonstrator, not the kit. Everything here is a two-week build for a live demo.
