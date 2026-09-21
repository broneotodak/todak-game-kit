// Contract samples from tgk ask. No AI, login or network is used by these tests.
const plan = { ok: true, route: 'plan', reason: 'that is the whole game in one go; the course does it step by step', step: 'paddle',
  notice: "Not in one go. This week's steps:\n[x] Scaffold\n[ ] Paddle moves\n[ ] Ball bounces\n[ ] Publish to web\nYou are on: Paddle moves. Ask for that.",
  next: 'Try: make the left paddle move with W and S' };
const design = { ok: true, route: 'design', reason: 'it asks for artwork or design', step: 'paddle',
  results: [{ desk: 'design', tool: 'codex', ok: true, text: 'I made a cyan paddle.\n\nYou can find it in assets/paddle.png.' }],
  files: ['assets/paddle.png'], awaiting_explain: false, notice: '→ design desk (Codex): it asks for artwork or design.', result: '', next: '' };
const build = { ok: true, route: 'build', reason: 'it asks for code or the game to behave differently', step: 'paddle',
  results: [{ desk: 'build', tool: 'claude', ok: true, text: 'The left paddle now moves up with W and down with S.\n\n```gdscript\nvelocity.y = direction * speed\n```\nTry both keys while the game is running.' }],
  files: ['scripts/paddle.gd'], awaiting_explain: true, notice: '→ build desk (Claude Code): it asks for code or the game to behave differently.',
  result: '', next: 'Before the next change, tell the desk what changed: tgk ask --explain "<one sentence>"' };
const both = { ...build, route: 'both', reason: 'it asks for artwork and for code', results: [...design.results, ...build.results], files: [...design.files, ...build.files] };
const blocked = { ok: false, route: 'blocked', reason: 'awaiting_explain', notice: 'Before the next change: tell the desk in one sentence what the last change did.', next: 'tgk ask --explain "the paddle now moves up with W and down with S"' };
const explain = { ok: true, notice: 'Thanks. Next step unlocked.', step: 'ball' };
const failed = { ...design, ok: false, results: [{ desk: 'design', tool: 'codex', ok: false, text: 'Please sign in to the design desk and try again.' }], files: [] };
module.exports = { plan, design, build, both, blocked, explain, failed };
