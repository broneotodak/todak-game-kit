#!/usr/bin/env node
// tgk — the Todak Game Kit command. Demonstrator build, September 2026.
// No dependencies. Node 18+. Works on Mac, Linux, Windows.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args[0];

const say = (m) => process.stdout.write(m + '\n');
const die = (m, code = 1) => { process.stderr.write('tgk: ' + m + '\n'); process.exit(code); };
const flag = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] ?? true) : def; };

function findGame(start = process.cwd()) {
  let d = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, '.tgk.json'))) return d;
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return null;
}
function loadGame() {
  const dir = findGame(); if (!dir) die('not inside a game folder (no .tgk.json). Run `tgk new` first.');
  return { dir, meta: JSON.parse(fs.readFileSync(path.join(dir, '.tgk.json'), 'utf8')) };
}
function saveMeta(dir, meta) { fs.writeFileSync(path.join(dir, '.tgk.json'), JSON.stringify(meta, null, 2) + '\n'); }

function godotBin() {
  if (process.env.GODOT_BIN && fs.existsSync(process.env.GODOT_BIN)) return process.env.GODOT_BIN;
  const candidates = [];
  const home = os.homedir();
  if (process.platform === 'darwin') candidates.push(
    '/Applications/Godot.app/Contents/MacOS/Godot',
    path.join(home, 'Applications/Godot.app/Contents/MacOS/Godot'),
    path.join(home, 'Projects/police-sentri-3d/internal/toolchain/godot/Godot.app/Contents/MacOS/Godot'));
  if (process.platform === 'win32') candidates.push(
    path.join(process.env.LOCALAPPDATA || '', 'Programs/Godot/godot.exe'),
    'C:/Godot/godot.exe', 'C:/Program Files/Godot/godot.exe');
  candidates.push(path.join(home, 'godot/godot'), '/usr/local/bin/godot', '/usr/bin/godot', path.join(home, '.local/bin/godot'));
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['godot'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  die('Godot 4.7 not found. Set GODOT_BIN to the executable.');
}
function runGodot(dir, extra, opts = {}) {
  const bin = godotBin();
  const r = spawnSync(bin, ['--path', dir, ...extra], { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', timeout: opts.timeout || 0 });
  return r;
}
function copyDir(src, dst, replace) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, replace);
    else {
      let buf = fs.readFileSync(s);
      if (/\.(gd|tscn|godot|cfg|md|txt|json|svg)$/.test(e.name)) {
        let t = buf.toString('utf8'); for (const [k, v] of Object.entries(replace)) t = t.split(k).join(v); buf = Buffer.from(t, 'utf8');
      }
      fs.writeFileSync(d, buf);
    }
  }
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game'; }
function nowIso() { return new Date().toISOString(); }
function appendJsonl(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(obj) + '\n'); }

const STEPS = {
  pong: [
    { id: 'scaffold', label: 'Scaffold' },
    { id: 'paddle', label: 'Paddle moves' },
    { id: 'ball', label: 'Ball bounces' },
    { id: 'publish', label: 'Publish to web' },
  ],
};

const commands = {
  help() {
    say(`tgk — Todak Game Kit (demonstrator)

  tgk new <template> <name> [--student <id>] [--week <n>] [--title "<shown name>"]   scaffold a game from a template (pong)
  tgk ask "<what you want>" [--to auto|design|build]        ONE BOX: routes to the design desk (Codex) or build desk (Claude Code)
  tgk ask --explain "<what changed>"                        explain-back: unlocks the next change
  tgk ask "<text>" --route-only --json                     just the routing decision, nothing runs
  tgk run                                                   run the game window
  tgk build web                                             export to build/web (Godot web export)
  tgk publish web                                           put the web build on the showcase, print the link
  tgk review [--quick]                                      headless checks + one-page report
  tgk remember "<note>"   |  tgk recall [words]             the project brain (memory/brain.md)
  tgk journey [--collect-codex]                             the recorded prompts (journey/prompts.jsonl)
  tgk status  |  tgk step done <id>                         steps and progress
  tgk sync                                                  send new journey events to the course site
  tgk log-prompt --desk claude|codex                        (hook) record a prompt from stdin JSON`);
  },
  new() {
    const [_, template, name] = args; if (!template || !name) die('usage: tgk new <template> <name> [--student id] [--week n]');
    const src = path.join(KIT, 'templates', template); if (!fs.existsSync(src)) die('no template named ' + template);
    const dst = path.resolve(name); if (fs.existsSync(dst)) die(dst + ' already exists');
    const student = String(flag('student', os.userInfo().username)); const week = Number(flag('week', 3));
    const titleFlag = flag('title', null); const gameName = (titleFlag && titleFlag !== true) ? String(titleFlag).slice(0, 40) : name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    copyDir(src, dst, { '{{GAME_NAME}}': gameName, '{{GAME_SLUG}}': slug(name), '{{STUDENT}}': student, '{{WEEK}}': String(week) });
    const meta = { kit: 'tgk-demonstrator', template, name: gameName, slug: slug(name), student, week, created: nowIso(), steps: { scaffold: nowIso() } };
    saveMeta(dst, meta);
    for (const d of ['design', 'assets', 'journey', 'memory', 'review']) fs.mkdirSync(path.join(dst, d), { recursive: true });
    fs.writeFileSync(path.join(dst, 'memory/brain.md'), `# Project brain — ${gameName}\n\nStudent: ${student} · Week ${week} · Template: ${template}\n\n## Decisions\n- ${nowIso().slice(0,10)} Scaffolded from the ${template} template.\n`);
    // shared instructions for both desks
    const instr = fs.readFileSync(path.join(KIT, 'kit/instructions/INSTRUCTIONS.md'), 'utf8')
      .split('{{GAME_NAME}}').join(gameName).split('{{STUDENT}}').join(student).split('{{WEEK}}').join(String(week)).split('{{TEMPLATE}}').join(template);
    fs.writeFileSync(path.join(dst, 'CLAUDE.md'), instr); fs.writeFileSync(path.join(dst, 'AGENTS.md'), instr);
    // Claude Code hooks: record every prompt
    const tgkRel = path.relative(dst, path.join(KIT, 'bin/tgk.mjs')).split(path.sep).join('/');
    const hooks = { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: `node "${tgkRel}" log-prompt --desk claude` }] }] } };
    fs.mkdirSync(path.join(dst, '.claude'), { recursive: true }); fs.writeFileSync(path.join(dst, '.claude/settings.json'), JSON.stringify(hooks, null, 2) + '\n');
    fs.writeFileSync(path.join(dst, '.gitignore'), '.godot/\nbuild/\n*.import\n.DS_Store\n');
    const g = spawnSync('git', ['init', '-q'], { cwd: dst }); if (g.status === 0) { spawnSync('git', ['add', '-A'], { cwd: dst }); spawnSync('git', ['-c', 'user.name=tgk', '-c', 'user.email=tgk@todak.com', 'commit', '-q', '-m', 'Scaffold from the ' + template + ' template'], { cwd: dst }); }
    say(`Created ${dst}\n  game: ${gameName}  student: ${student}  week: ${week}\n  next: cd ${name} && tgk run`);
  },
  run() { const { dir } = loadGame(); say('Running the game (close the window to return)…'); const r = runGodot(dir, []); process.exit(r.status ?? 0); },
  build() {
    const target = args[1] || 'web'; if (target !== 'web') die('demonstrator builds web only');
    const { dir, meta } = loadGame(); const out = path.join(dir, 'build/web'); fs.mkdirSync(out, { recursive: true });
    say('Exporting for the web…');
    const r = runGodot(dir, ['--headless', '--export-release', 'Web', path.join(out, 'index.html')], { quiet: true, timeout: 300000 });
    const ok = fs.existsSync(path.join(out, 'index.html')) && fs.existsSync(path.join(out, 'index.wasm'));
    if (!ok) { process.stderr.write((r.stdout || '') + (r.stderr || '')); die('web export failed (is the Web export template installed for Godot 4.7.2?)'); }
    meta.lastBuild = { target: 'web', at: nowIso() }; saveMeta(dir, meta);
    say(`Built ${out}`);
  },
  publish() {
    const target = args[1] || 'web'; if (target !== 'web') die('demonstrator publishes web only');
    const { dir, meta } = loadGame(); const build = path.join(dir, 'build/web');
    if (!fs.existsSync(path.join(build, 'index.html'))) { commands.build(); }
    let repo = process.env.TGK_SHOWCASE_REPO; let team = false;
    if (!repo || !fs.existsSync(path.join(repo, '.git'))) {
      // Team mode: publish to the shared showcase repository with the demo deploy key.
      const key = process.env.TGK_PUBLISH_KEY || path.join(os.homedir(), '.todak', 'showcase-deploy-key');
      if (!fs.existsSync(key)) die('no showcase to publish to: set TGK_SHOWCASE_REPO (site checkout) or put the team deploy key at ' + key);
      team = true; repo = path.join(os.homedir(), '.todak', 'showcase');
      const sshCmd = `ssh -i "${key}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
      const env = { ...process.env, GIT_SSH_COMMAND: sshCmd };
      const remote = process.env.TGK_SHOWCASE_GIT || 'git@github.com:broneotodak/todak-showcase.git';
      if (!fs.existsSync(path.join(repo, '.git'))) { fs.mkdirSync(path.dirname(repo), { recursive: true }); const c = spawnSync('git', ['clone', '-q', '--depth', '1', remote, repo], { env, encoding: 'utf8' }); if (c.status !== 0) die('could not reach the team showcase: ' + c.stderr.slice(0, 200)); }
      else { spawnSync('git', ['-C', repo, 'fetch', '-q', '--depth', '1', 'origin', 'main'], { env, encoding: 'utf8' }); spawnSync('git', ['-C', repo, 'reset', '-q', '--hard', 'origin/main'], { encoding: 'utf8' }); }
      process.env.GIT_SSH_COMMAND = sshCmd;
    }
    const rel = team ? path.posix.join(slug(meta.student), meta.slug) : path.posix.join('play', slug(meta.student), meta.slug); const dst = path.join(repo, rel);
    fs.rmSync(dst, { recursive: true, force: true }); copyDir(build, dst, {});
    fs.writeFileSync(path.join(dst, 'game.json'), JSON.stringify({ name: meta.name, student: meta.student, week: meta.week, published: nowIso(), kit: meta.kit }, null, 2));
    const listFile = team ? path.join(repo, 'games.json') : path.join(repo, 'play/games.json'); let list = []; try { list = JSON.parse(fs.readFileSync(listFile, 'utf8')); } catch {}
    const listPath = team ? rel + '/' : '/' + rel + '/';
    list = list.filter(g => g.path !== listPath); list.push({ name: meta.name, student: meta.student, week: meta.week, published: nowIso(), path: listPath });
    fs.mkdirSync(path.dirname(listFile), { recursive: true }); fs.writeFileSync(listFile, JSON.stringify(list, null, 2) + '\n');
    const git = (a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8', env: process.env });
    git(['add', rel, team ? 'games.json' : 'play/games.json']); git(['-c', 'user.name=tgk', '-c', 'user.email=tgk@todak.com', 'commit', '-q', '-m', `Showcase: ${meta.name} by ${meta.student} (week ${meta.week})`]);
    const p = git(['push', '-q', 'origin', 'HEAD']); if (p.status !== 0) die('push failed: ' + p.stderr);
    const url = team ? (process.env.TGK_SHOWCASE_URL || 'https://broneotodak.github.io/todak-showcase') + '/' + rel + '/' : (process.env.TGK_SHOWCASE_URL || 'https://course.neotodak.com') + '/' + rel + '/';
    meta.steps.publish = nowIso(); meta.published = { url, at: nowIso() }; saveMeta(dir, meta);
    appendJsonl(path.join(dir, 'journey/events.jsonl'), { at: nowIso(), type: 'publish', url });
    syncJourney(dir, meta, false);
    say(`Published: ${url}\n(the ${team ? 'team showcase' : 'site'} updates in about a minute)`);
  },
  review() {
    const { dir, meta } = loadGame(); const quick = args.includes('--quick');
    say('Reviewing…');
    const r = runGodot(dir, ['--headless', '-s', 'res://tests/smoke.gd'], { quiet: true, timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const checks = []; for (const line of out.split(/\r?\n/)) { const m = line.match(/^CHECK\s+(PASS|FAIL)\s+(\S+)\s*(.*)$/); if (m) checks.push({ id: m[2], pass: m[1] === 'PASS', note: m[3] }); }
    if (!checks.length) checks.push({ id: 'smoke', pass: false, note: 'no checks reported; Godot output: ' + out.slice(-400) });
    const ship = [
      { id: 'title', label: 'Title screen', pass: fs.existsSync(path.join(dir, 'scenes/title.tscn')) },
      { id: 'sound', label: 'Sound', pass: /beep|AudioStream/.test(fs.readFileSync(path.join(dir, 'scripts/main.gd'), 'utf8')) },
      { id: 'saved', label: 'Saved high score', pass: /ConfigFile|user:\/\//.test(fs.readFileSync(path.join(dir, 'scripts/title.gd'), 'utf8') + fs.readFileSync(path.join(dir, 'scripts/main.gd'), 'utf8')) },
    ];
    const all = [...checks, ...ship]; const passed = all.filter(c => c.pass).length;
    for (const c of checks) if (c.pass && meta.steps && STEPS[meta.template]?.some(s => s.id === c.id)) meta.steps[c.id] = meta.steps[c.id] || nowIso();
    saveMeta(dir, meta);
    const md = `# Review — ${meta.name}\n\n${nowIso()} · student ${meta.student} · week ${meta.week}\n\n**${passed} of ${all.length} checks passed.** ${passed === all.length ? 'Ready to publish.' : 'Fix the items marked ✗ and run the review again.'}\n\n| Check | Result | Note |\n|---|---|---|\n` + all.map(c => `| ${c.label || c.id} | ${c.pass ? '✓' : '✗'} | ${c.note || ''} |`).join('\n') + '\n\nDemonstrator review: headless smoke run plus the "ships complete" list. Not a store review.\n';
    fs.mkdirSync(path.join(dir, 'review'), { recursive: true }); fs.writeFileSync(path.join(dir, 'review/report.md'), md);
    appendJsonl(path.join(dir, 'journey/events.jsonl'), { at: nowIso(), type: 'review', passed, total: all.length });
    syncJourney(dir, meta, false);
    if (!quick) say(md); else say(`${passed}/${all.length} checks passed → review/report.md`);
  },

  ask() {
    // One box, two AIs behind it. Routes a student's request to the design desk (Codex/Astra) or the build desk (Claude Code),
    // with the course rules inside: step gating, explain-back, and a record of every request with the route and the reason.
    const { dir, meta } = loadGame();
    const json = args.includes('--json'); const to = String(flag('to', 'auto')); const explain = flag('explain', null);
    const text = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && ['--to', '--explain'].includes(arr[i - 1]))).join(' ').trim();
    // --route-only: decide the desk without running anything (the web demo shows the badge first)
    const steps = STEPS[meta.template] || []; const current = steps.find(st => !(meta.steps || {})[st.id]) || null;
    const out = (o) => { if (json) say(JSON.stringify(o)); else { if (o.notice) say(o.notice); if (o.result) say(o.result); if (o.next) say('\n' + o.next); } };
    if (explain !== null) {
      const sentence = String(explain === true ? '' : explain).trim();
      if (!sentence) { out({ ok: false, notice: 'Tell the desk in one sentence what changed: tgk ask --explain "<sentence>"' }); return; }
      appendJsonl(path.join(dir, 'journey/prompts.jsonl'), { at: nowIso(), desk: 'explain', student: meta.student, game: meta.slug, week: meta.week, prompt: sentence });
      meta.awaiting_explain = false; saveMeta(dir, meta);
      if (!text) { out({ ok: true, notice: 'Thanks. Next step unlocked.', step: current?.id || null }); syncJourneyBg(dir); return; }
    }
    if (!text) die('tgk ask "<what you want>" [--to auto|design|build] [--explain "<what changed>"] [--json]');
    if (meta.awaiting_explain && to !== 'design') {
      appendJsonl(path.join(dir, 'journey/prompts.jsonl'), { at: nowIso(), desk: 'blocked', student: meta.student, game: meta.slug, week: meta.week, prompt: text, reason: 'awaiting_explain' });
      out({ ok: false, route: 'blocked', reason: 'awaiting_explain', notice: 'Before the next change: tell the desk in one sentence what the last change did.', next: 'tgk ask --explain "the paddle now moves up with W and down with S"' }); syncJourneyBg(dir); return;
    }
    const wholeGame = /\b(whole|entire|complete|everything|full)\b.*\b(game|pong)\b|\bbuild me (a|the|my)\b.*\bgame\b|\bmake (a|the|me a) (whole|full|complete) game\b|\bdo (all|everything)\b/i.test(text);
    const designWords = /\b(art|artwork|sprite|sprites|draw|drawing|paint|colou?r|colou?rs|palette|moodboard|mood board|character|characters|title screen|logo|icon|design doc|design document|storyboard|sound|music|sfx|font|style|look|theme|background image|texture)\b/i;
    // strong build verbs decide; game nouns (paddle, ball, score) alone do not, so 'draw me a pink ball' stays a design request
    const buildWords = /\b(code|script|function|move|moves|moving|bounce|bounces|input|keys?|w and s|bug|error|fix|crash|build|publish|review|run|save|scores?|win|lose|speed|faster|slower|physics|gdscript|godot|scene|collision|timer|level|make it|change the)\b/i;
    let route = to, reason = 'you chose the ' + to + ' desk';
    if (to === 'auto') {
      if (wholeGame) { route = 'plan'; reason = 'that is the whole game in one go; the course does it step by step'; }
      else { const d = designWords.test(text), b = buildWords.test(text);
        if (d && b) { route = 'both'; reason = 'it asks for artwork and for code'; }
        else if (d) { route = 'design'; reason = 'it asks for artwork or design'; }
        else { route = 'build'; reason = b ? 'it asks for code or the game to behave differently' : 'no design words, so the build desk'; } }
    }
    if (args.includes('--route-only')) { out({ ok: true, route, reason, step: current?.id || null, awaiting_explain: !!meta.awaiting_explain }); return; }
    appendJsonl(path.join(dir, 'journey/prompts.jsonl'), { at: nowIso(), desk: route === 'both' ? 'both' : route === 'design' ? 'codex' : route === 'build' ? 'claude' : route, student: meta.student, game: meta.slug, week: meta.week, prompt: text, reason, step: current?.id || null });
    if (route === 'plan') {
      const plan = steps.map(st => `${(meta.steps || {})[st.id] ? '[x]' : '[ ]'} ${st.label}`).join('\n');
      out({ ok: true, route, reason, step: current?.id || null, notice: `Not in one go. This week's steps:\n${plan}\nYou are on: ${current ? current.label : 'publish'}. Ask for that.`, next: current?.id === 'paddle' ? 'Try: make the left paddle move with W and S' : current?.id === 'ball' ? 'Try: make the ball launch and bounce off the top, the bottom and the paddles' : '' });
      syncJourneyBg(dir); return;
    }
    const before = gitFiles(dir);
    const results = [];
    const stepLine = current ? `The student is on step "${current.label}" (${current.id}) of week ${meta.week}. Keep to that step unless the request is clearly about it; if it is beyond the step, say so in one line and do only what fits.` : `All steps are done; the student is polishing or publishing.`;
    if (route === 'design' || route === 'both') {
      const prompt = `You are the DESIGN desk of the Todak Workbench for a beginner. Read AGENTS.md first. ${stepLine} Deliver files into design/ or assets/ (pictures, the design document); do not edit scripts or scenes. Then tell the student in two plain sentences what you made and where it is.\n\nStudent request: ${text}`;
      const r = runCodex(dir, prompt); results.push({ desk: 'design', tool: 'codex', ok: r.ok, text: r.text });
    }
    if (route === 'build' || route === 'both') {
      const prompt = `${stepLine}\n\nStudent request: ${text}`;
      const r = runClaude(dir, prompt); results.push({ desk: 'build', tool: 'claude', ok: r.ok, text: r.text });
      if (r.ok && !/\b(review|publish|run|status)\b/i.test(text)) { meta.awaiting_explain = true; saveMeta(dir, meta); }
    }
    const after = gitFiles(dir); const changed = after.filter(f => !before.includes(f)).concat(after.filter(f => before.includes(f)));
    const summary = results.map(r => `[${r.desk} desk · ${r.tool}] ${r.ok ? '' : '(failed) '}${r.text.trim()}`).join('\n\n');
    out({ ok: results.every(r => r.ok), route, reason, step: current?.id || null, results, files: gitChanged(dir), awaiting_explain: !!meta.awaiting_explain,
      notice: `→ ${route === 'both' ? 'design desk (Codex) then build desk (Claude Code)' : route === 'design' ? 'design desk (Codex)' : 'build desk (Claude Code)'}: ${reason}.`, result: summary,
      next: meta.awaiting_explain ? 'Before the next change, tell the desk what changed: tgk ask --explain "<one sentence>"' : '' });
    syncJourneyBg(dir);
  },
  remember() { const { dir } = loadGame(); const note = args.slice(1).join(' ').trim(); if (!note) die('tgk remember "<note>"'); fs.appendFileSync(path.join(dir, 'memory/brain.md'), `- ${nowIso().slice(0, 16).replace('T', ' ')} ${note}\n`); say('Remembered.'); },
  recall() { const { dir } = loadGame(); const t = fs.readFileSync(path.join(dir, 'memory/brain.md'), 'utf8'); const q = args.slice(1).join(' ').toLowerCase(); say(q ? t.split('\n').filter(l => l.toLowerCase().includes(q)).join('\n') || '(nothing matches)' : t); },
  journey() {
    const { dir, meta } = loadGame(); const file = path.join(dir, 'journey/prompts.jsonl');
    if (args.includes('--collect-codex')) collectCodex(dir, file);
    if (!fs.existsSync(file)) { say('No prompts recorded yet.'); return; }
    const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    say(`Journey — ${meta.name} · ${rows.length} prompts`); for (const r of rows) say(`${r.at.slice(0, 16).replace('T', ' ')}  [${r.desk}]  ${String(r.prompt).replace(/\s+/g, ' ').slice(0, 120)}`);
  },
  status() {
    const { dir, meta } = loadGame(); const steps = STEPS[meta.template] || [];
    say(`${meta.name} · student ${meta.student} · week ${meta.week} · template ${meta.template}`);
    for (const s of steps) say(`  [${meta.steps?.[s.id] ? 'x' : ' '}] ${s.label}`);
    if (meta.published) say(`  published: ${meta.published.url}`);
    const pj = path.join(dir, 'journey/prompts.jsonl'); say(`  prompts recorded: ${fs.existsSync(pj) ? fs.readFileSync(pj, 'utf8').trim().split('\n').filter(Boolean).length : 0}`);
  },
  step() { const { dir, meta } = loadGame(); const [_, what, id] = args; if (what !== 'done' || !id) die('tgk step done <id>'); meta.steps = meta.steps || {}; meta.steps[id] = nowIso(); saveMeta(dir, meta); say('Step done: ' + id); },
  sync() { const { dir, meta } = loadGame(); const n = syncJourney(dir, meta, true); say(n < 0 ? 'Sync skipped (no TGK_INGEST_TOKEN or offline).' : `Synced ${n} new events.`); },
  'log-prompt'() {
    if (process.env.TGK_NO_HOOK) return;
    const desk = String(flag('desk', 'claude')); const dir = findGame(); if (!dir) return;
    let raw = ''; try { raw = fs.readFileSync(0, 'utf8'); } catch {}
    let prompt = raw; try { const j = JSON.parse(raw); prompt = j.prompt ?? j.user_prompt ?? j.message ?? raw; } catch {}
    if (!String(prompt).trim()) return;
    const meta = JSON.parse(fs.readFileSync(path.join(dir, '.tgk.json'), 'utf8'));
    appendJsonl(path.join(dir, 'journey/prompts.jsonl'), { at: nowIso(), desk, student: meta.student, game: meta.slug, week: meta.week, prompt: String(prompt).slice(0, 4000) });
    // sync in the background so the desk is never slowed down
    try { const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'sync'], { cwd: dir, detached: true, stdio: 'ignore' }); child.unref(); } catch {}
  },
};


function syncJourney(dir, meta, verbose) {
  const token = process.env.TGK_INGEST_TOKEN; const base = process.env.TGK_JOURNEY_URL || 'https://course.neotodak.com';
  if (!token) return -1;
  const stateFile = path.join(dir, 'journey/.synced.json'); let state = { prompts: 0, events: 0 }; try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  const read = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
  const prompts = read(path.join(dir, 'journey/prompts.jsonl')); const events = read(path.join(dir, 'journey/events.jsonl'));
  const batch = [];
  prompts.slice(state.prompts).forEach((l, i) => { try { const j = JSON.parse(l); batch.push({ id: `${meta.student}/${meta.slug}/p/${state.prompts + i}/${j.at}`, kind: 'prompt', at: j.at, student: meta.student, game: meta.slug, week: meta.week, desk: j.desk, prompt: j.prompt }); } catch {} });
  events.slice(state.events).forEach((l, i) => { try { const j = JSON.parse(l); batch.push({ id: `${meta.student}/${meta.slug}/e/${state.events + i}/${j.at}`, kind: j.type, at: j.at, student: meta.student, game: meta.slug, week: meta.week, data: j }); } catch {} });
  if (!batch.length) return 0;
  const r = spawnSync(process.execPath, ['-e', `
    const [url, token, body] = process.argv.slice(1);
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kit-token': token }, body }).then(r => { process.exitCode = r.ok ? 0 : 2; return r.text(); }).then(t => process.stdout.write(t)).catch(() => { process.exitCode = 3; });
  `, base + '/api/journey/ingest', token, JSON.stringify(batch)], { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) { if (verbose) process.stderr.write('sync failed: ' + (r.stdout || r.stderr || '') + '\n'); return -1; }
  fs.writeFileSync(stateFile, JSON.stringify({ prompts: prompts.length, events: events.length }));
  return batch.length;
}


function gitFiles(dir) { const r = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }); return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : []; }
function gitChanged(dir) { return gitFiles(dir).map(l => l.slice(3).trim()); }
function syncJourneyBg(dir) { try { const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'sync'], { cwd: dir, detached: true, stdio: 'ignore' }); child.unref(); } catch {} }
function runCodex(dir, prompt) {
  const model = process.env.TGK_CODEX_MODEL || 'gpt-6-astra';
  const r = spawnSync('codex', ['exec', '-m', model, '--skip-git-repo-check', '-C', dir, prompt], { encoding: 'utf8', timeout: 600000, env: { ...process.env, TGK_NO_HOOK: '1' } });
  if (r.error) return { ok: false, text: 'Codex is not installed or not signed in (' + r.error.message + ')' };
  const outText = (r.stdout || '').split('\n').filter(l => !/^(tokens used|\d[\d,]*$|codex$|hook:)/.test(l.trim())).join('\n').trim();
  return { ok: r.status === 0, text: outText || (r.stderr || '').slice(-600) };
}
function runClaude(dir, prompt) {
  const r = spawnSync('claude', ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Edit,Write,Grep,Glob,Bash(node *),Bash(tgk *),Bash(git status*),Bash(git diff*)', '--output-format', 'json'], { cwd: dir, encoding: 'utf8', timeout: 600000, env: { ...process.env, TGK_NO_HOOK: '1' } });
  if (r.error) return { ok: false, text: 'Claude Code is not installed or not signed in (' + r.error.message + ')' };
  let text = r.stdout || ''; try { const j = JSON.parse(text); text = j.result || j.content || text; if (j.is_error) return { ok: false, text: String(text) }; } catch {}
  return { ok: r.status === 0, text: String(text).trim() || (r.stderr || '').slice(-600) };
}

function collectCodex(dir, file) {
  // Codex keeps session transcripts under ~/.codex/sessions; pick up user messages whose session ran in this folder.
  const root = path.join(os.homedir(), '.codex', 'sessions'); if (!fs.existsSync(root)) return;
  const seen = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).codexId; } catch { return null; } }) : []);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, '.tgk.json'), 'utf8'));
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.jsonl$/.test(e.name)) scan(p); } };
  const scan = (p) => {
    let cwdOk = false;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) { if (!line) continue; let j; try { j = JSON.parse(line); } catch { continue; }
      const s = JSON.stringify(j); if (!cwdOk && s.includes(dir)) cwdOk = true;
      const role = j.role || j.payload?.role || j.message?.role; const content = j.content || j.payload?.content || j.message?.content;
      if (cwdOk && role === 'user' && content) { const text = Array.isArray(content) ? content.map(c => c.text || '').join(' ') : String(content); const id = p + ':' + (j.id || j.timestamp || text.slice(0, 40)); if (seen.has(id) || !text.trim() || /^\s*</.test(text) || /recommended_plugins|<environment_context>|<user_instructions>/i.test(text)) continue; seen.add(id);
        appendJsonl(file, { at: j.timestamp || nowIso(), desk: 'codex', student: meta.student, game: meta.slug, week: meta.week, prompt: text.slice(0, 4000), codexId: id }); }
    }
  };
  try { walk(root); } catch {}
}

(commands[cmd] || commands.help)();
