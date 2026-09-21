#!/usr/bin/env node
// demo-desk — the web demo's backend for the one box. Wraps the kit (tgk) per session. Demonstrator, not the kit.
// Runs on a demo machine with Claude Code + Codex signed in. Every call needs the team PIN. Node 20+, no dependencies.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const PORT = Number(process.env.DEMO_PORT || 3860);
const OPEN = process.env.DEMO_OPEN === '1';
const TRAINER_PIN = process.env.DEMO_TRAINER_PIN || process.env.DEMO_PIN || ''; // the trainer's page is always gated, even when the student demo is open // open demo: no PIN, only the daily cap and the session limit protect it
const PIN = process.env.DEMO_PIN || ''; if (!OPEN && !PIN) { console.error('DEMO_PIN missing (or set DEMO_OPEN=1)'); process.exit(1); }
const ROOT = process.env.DEMO_ROOT || path.join(os.homedir(), 'demo-desk'); const SESS = path.join(ROOT, 'sessions'); fs.mkdirSync(SESS, { recursive: true });
const KIT = process.env.TGK_KIT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); const TGK = path.join(KIT, 'bin/tgk.mjs');
const CAP = Number(process.env.DEMO_DAILY_CAP || 80); const MAXS = Number(process.env.DEMO_MAX_SESSIONS || 30); const TTL = 24 * 3600 * 1000;
const ORIGINS = (process.env.DEMO_ORIGINS || 'https://course.neotodak.com,http://localhost:8080').split(',');
const busy = new Map(); const building = new Map();
function buildInBackground(id) { if (building.get(id)) return; building.set(id, true); run('node', [TGK, 'build', 'web'], sdir(id), 300000).then(r => { building.delete(id); log({ ev: 'autobuild', id, ok: fs.existsSync(path.join(sdir(id), 'build/web/index.html')) }); }).catch(() => building.delete(id)); } const log = (o) => fs.appendFileSync(path.join(ROOT, 'log.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const today = () => new Date().toISOString().slice(0, 10); let asks = { day: today(), n: 0 };
const countAsk = () => { if (asks.day !== today()) asks = { day: today(), n: 0 }; asks.n++; };

const json = (res, code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 200000) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error('bad json')); } }); });
const sid = (s) => /^[a-f0-9]{8}$/.test(String(s || '')) ? String(s) : null;
const sdir = (id) => path.join(SESS, id);
const run = (cmd, argv, cwd, timeout = 600000) => new Promise((ok) => { const ch = spawn(cmd, argv, { cwd, env: process.env, timeout }); let out = '', err = ''; ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d); ch.on('close', code => ok({ code, out, err })); ch.on('error', e => ok({ code: -1, out, err: String(e) })); });
const lastJson = (out) => { const lines = out.trim().split('\n').reverse(); for (const l of lines) { try { return JSON.parse(l); } catch {} } return null; };
function state(id) {
  const dir = sdir(id); let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, '.tgk.json'), 'utf8')); } catch {}
  const jf = path.join(dir, 'journey/prompts.jsonl'); const journey = fs.existsSync(jf) ? fs.readFileSync(jf, 'utf8').trim().split('\n').filter(Boolean).slice(-60).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const imgs = []; for (const d of ['design', 'assets']) { const p = path.join(dir, d); if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (/\.(png|jpe?g|svg|webp)$/i.test(f)) imgs.push({ name: f, url: `/files/${id}/${d}/${f}`, folder: d, mtime: fs.statSync(path.join(p, f)).mtimeMs }); }
  imgs.sort((a, b) => b.mtime - a.mtime);
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }); const changed = st.status === 0 ? st.stdout.split('\n').filter(Boolean).map(l => l.slice(3).trim()) : [];
  const built = fs.existsSync(path.join(dir, 'build/web/index.html'));
  let report = null; try { report = fs.readFileSync(path.join(dir, 'review/report.md'), 'utf8'); } catch {}
  const builtAt = built ? fs.statSync(path.join(dir, 'build/web/index.html')).mtimeMs : 0;
  return { session: id, name: meta.name, student: meta.student, week: meta.week, steps: meta.steps || {}, awaiting_explain: !!meta.awaiting_explain, journey, images: imgs, changed, built, builtAt, building: !!building.get(id), gameUrl: built ? `/games/${id}/` : null, report, busy: !!busy.get(id), asksToday: asks.n, cap: CAP };
}
function diffOf(id) { const dir = sdir(id); const r = spawnSync('git', ['diff', '--', 'scripts', 'scenes', 'project.godot'], { cwd: dir, encoding: 'utf8', maxBuffer: 1e7 }); return (r.stdout || '').slice(0, 30000); }
function commit(id, msg) { const dir = sdir(id); spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['-c', 'user.name=demo-desk', '-c', 'user.email=demo@todak.com', 'commit', '-q', '-m', msg.slice(0, 120)], { cwd: dir }); }
function cleanup() { for (const id of fs.readdirSync(SESS)) { try { const st = fs.statSync(sdir(id)); if (Date.now() - st.mtimeMs > TTL) fs.rmSync(sdir(id), { recursive: true, force: true }); } catch {} } }
setInterval(cleanup, 3600000);


// ---- trainer's side: the class board and the trainer's box ----
const SESSION_OBJECTIVE = { id: 'first-lab', title: 'First lab: play, then ask', goal: 'Get your paddle moving, and explain the change in one sentence.', checks: ['played', 'paddle', 'explained', 'ball'] };
function reportScore(rep) { const m = (rep || '').match(/\*\*(\d+) of (\d+) checks passed/); return m ? { passed: +m[1], total: +m[2] } : null; }
function classBoard() {
  const rows = [];
  for (const id of fs.readdirSync(SESS)) { if (!sid(id)) continue; try { const st = state(id); const j = st.journey || []; const last = j[j.length - 1] || null;
    const asked = j.some(r => ['claude', 'codex', 'both', 'plan', 'blocked'].includes(r.desk)); const explained = j.some(r => r.desk === 'explain');
    const lastAt = last ? Date.parse(last.at) : fs.statSync(sdir(id)).mtimeMs; const idleMin = Math.round((Date.now() - lastAt) / 60000);
    let status = 'idle'; if (busy.get(id)) status = 'working'; else if (st.awaiting_explain) status = 'must explain'; else if (building.get(id)) status = 'rebuilding'; else if (!asked) status = st.built ? 'playing' : 'starting'; else if (idleMin < 10) status = 'active';
    rows.push({ session: id, name: (st.student || '').replace(/^demo-/, ''), game: st.name, status, idleMin, built: st.built, steps: st.steps, awaiting_explain: st.awaiting_explain, checks: { played: !!(st.built && asked) || asked, paddle: !!st.steps.paddle, explained, ball: !!st.steps.ball }, prompts: j.filter(r => ['claude', 'codex', 'both', 'plan', 'blocked'].includes(r.desk)).length, explains: j.filter(r => r.desk === 'explain').length, routes: { claude: j.filter(r => r.desk === 'claude').length, codex: j.filter(r => r.desk === 'codex').length, plan: j.filter(r => r.desk === 'plan').length, blocked: j.filter(r => r.desk === 'blocked').length }, last: last ? { at: last.at, desk: last.desk, text: (last.prompt || '').slice(0, 120) } : null, review: reportScore(st.report), recent: j.slice(-5).map(r => ({ at: r.at, desk: r.desk, text: (r.prompt || '').slice(0, 140), reason: r.reason || null })) });
  } catch {} }
  rows.sort((a, b) => (b.last ? Date.parse(b.last.at) : 0) - (a.last ? Date.parse(a.last.at) : 0));
  return { objective: SESSION_OBJECTIVE, students: rows, asksToday: asks.n, cap: CAP, at: new Date().toISOString() };
}
function findStudent(board, q) { q = String(q || '').trim().toLowerCase().replace(/^demo-/, ''); if (!q) return null;
  const byId = board.students.find(r => r.session === q); if (byId) return byId;
  const exact = board.students.filter(r => r.name.toLowerCase() === q); if (exact.length === 1) return exact[0]; if (exact.length > 1) return { ambiguous: exact };
  const pre = board.students.filter(r => r.name.toLowerCase().startsWith(q)); if (pre.length === 1) return pre[0]; if (pre.length > 1) return { ambiguous: pre }; return null; }
function ambiguous(r, q) { return { kind: 'answer', text: `${r.ambiguous.length} students match "${q}": ` + r.ambiguous.map(x => `${x.name} (${x.session}, ${x.status}, ${x.prompts} requests)`).join(' · ') + '. Use the session id, e.g. "show ' + r.ambiguous[0].session + '".' }; }
async function trainerAsk(text) {
  const board = classBoard(); const t = String(text || '').trim(); const low = t.toLowerCase(); const names = (rs) => rs.length ? rs.map(r => r.name).join(', ') : 'nobody';
  const stepOf = (w) => /paddle/.test(w) ? 'paddle' : /ball|bounce/.test(w) ? 'ball' : /explain/.test(w) ? 'explained' : /play/.test(w) ? 'played' : /publish/.test(w) ? 'publish' : null;
  let m;
  if (!board.students.length) return { kind: 'answer', text: 'No students in the room yet. They appear here the moment they start a game at /demo.' };
  if ((m = low.match(/who (has not|hasn'?t|did not|didn'?t|is not|isn'?t) (finished|done|completed|made|got|reached|explained)?\s*(.*)$/))) { const st = stepOf(m[3] || m[2]) || 'paddle'; const rs = board.students.filter(r => !r.checks[st] && !(st === 'publish' && r.steps.publish)); return { kind: 'answer', text: `${st === 'explained' ? 'Not yet explained a change' : 'Not yet done "' + st + '"'}: ${names(rs)}. (${rs.length} of ${board.students.length})`, students: rs.map(r => r.session) }; }
  if ((m = low.match(/who (has|is|have|are) (finished|done|completed|made|got|reached|explained|built|playing)\s*(.*)$/))) { const st = stepOf(m[3] || m[2]) || (/built/.test(m[2]) ? 'played' : 'paddle'); const rs = board.students.filter(r => r.checks[st]); return { kind: 'answer', text: `Done "${st}": ${names(rs)}. (${rs.length} of ${board.students.length})`, students: rs.map(r => r.session) }; }
  if (/who (is|are) (stuck|waiting|behind|idle|blocked)|stuck/.test(low)) { const rs = board.students.filter(r => r.status === 'must explain' || r.status === 'idle' || r.routes.blocked > 0); return { kind: 'answer', text: rs.length ? rs.map(r => `${r.name}: ${r.status}${r.routes.blocked ? ', asked before explaining ' + r.routes.blocked + 'x' : ''}${r.idleMin >= 10 ? ', quiet for ' + r.idleMin + ' min' : ''}`).join(' · ') : 'Nobody looks stuck right now.' }; }
  if (/design desk|always.*astra|overrid/.test(low)) { const rs = board.students.filter(r => r.routes.codex > r.routes.claude); return { kind: 'answer', text: rs.length ? `Sending more to the design desk than the build desk: ${names(rs)}.` : 'Nobody is leaning on the design desk.' }; }
  if (/^(summary|how is the class|class summary|status)/.test(low)) { const c = board.students; const done = c.filter(r => r.checks.paddle).length, ex = c.filter(r => r.checks.explained).length, need = c.filter(r => r.status === 'must explain').length; return { kind: 'answer', text: `${c.length} in the room · ${done} have the paddle moving · ${ex} have explained a change · ${need} must explain before their next change · ${c.reduce((a, r) => a + r.prompts, 0)} requests so far (${board.asksToday} of ${board.cap} today).` }; }
  if ((m = low.match(/^(show|open|what about|how is)\s+(.+?)\??$/))) { const r = findStudent(board, m[2]); if (!r) return { kind: 'answer', text: `No student called "${m[2]}". In the room: ${names(board.students)}.` }; if (r.ambiguous) return ambiguous(r, m[2]); return { kind: 'student', text: `${r.name} · ${r.status} · paddle ${r.checks.paddle ? 'done' : 'not yet'} · explained ${r.explains}x · ${r.prompts} requests (${r.routes.claude} build, ${r.routes.codex} design, ${r.routes.plan} plan, ${r.routes.blocked} blocked)${r.review ? ' · review ' + r.review.passed + '/' + r.review.total : ''}.`, student: r }; }
  if ((m = t.match(/^review\s+(.+)$/i))) { const r = findStudent(board, m[1]); if (!r) return { kind: 'answer', text: `No student called "${m[1]}".` }; if (r.ambiguous) return ambiguous(r, m[1]); if (busy.get(r.session)) return { kind: 'answer', text: `${r.name}'s desk is busy; try again in a minute.` }; busy.set(r.session, true); const rr = await run('node', [TGK, 'review', '--quick'], sdir(r.session), 180000); busy.delete(r.session); const st = state(r.session); const sc = reportScore(st.report); return { kind: 'review', text: `Reviewed ${r.name}: ${sc ? sc.passed + ' of ' + sc.total + ' checks passed' : rr.out.trim().slice(-120)}.`, report: st.report, student: r.session }; }
  if ((m = t.match(/^(note|tell|message)\s+([^:]+):\s*(.+)$/i))) { const r = findStudent(board, m[2]); if (!r) return { kind: 'answer', text: `No student called "${m[2]}".` }; if (r.ambiguous) return ambiguous(r, m[2]); const note = m[3].trim().slice(0, 500); fs.appendFileSync(path.join(sdir(r.session), 'journey/prompts.jsonl'), JSON.stringify({ at: new Date().toISOString(), desk: 'trainer', student: 'demo-' + r.name, game: r.game, week: 3, prompt: note }) + '\n'); log({ ev: 'note', id: r.session }); return { kind: 'note', text: `Sent to ${r.name}'s box: "${note}"`, student: r.session }; }
  if ((m = low.match(/^(draft|write)\s+(feedback|a note)\s+(for|to)\s+(.+)$/))) { const r = findStudent(board, m[4]); if (!r) return { kind: 'answer', text: `No student called "${m[4]}".` }; if (r.ambiguous) return ambiguous(r, m[4]); if (asks.n >= CAP) return { kind: 'answer', text: 'The daily allowance is used up; drafting needs an AI call.' }; countAsk(); const prompt = `You are a game-programming lecturer writing a short, warm, specific note (max 80 words, plain English, no jargon) to a beginner after their first lab. Their record (JSON): ${JSON.stringify({ name: r.name, checks: r.checks, prompts: r.recent, explains: r.explains, review: r.review })}. Praise one concrete thing, suggest one next thing. Output only the note.`; const rr = await run('claude', ['-p', prompt, '--output-format', 'json'], ROOT, 120000); let out = rr.stdout || rr.out || ''; try { const j = JSON.parse(rr.out); out = j.result || out; } catch { out = rr.out; } return { kind: 'draft', text: String(out).trim().slice(0, 600) || 'The AI did not answer.', student: r.session, hint: `To send it: note ${r.name}: <your edited version>` }; }
  return { kind: 'help', text: 'I can answer: "who hasn\'t finished the paddle", "who has explained", "who is stuck", "summary", "show Ali", "review Ali", "note Ali: read the clamp line before you go on", "draft feedback for Ali".' };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin; const cors = ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } : {};
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (p === '/health' || p === '/api/health') return json(res, 200, { ok: true, open: OPEN, sessions: fs.readdirSync(SESS).length, asksToday: asks.n, cap: CAP }, cors);
    // static: games and design files (no PIN: builds are public on the showcase anyway; ids are unguessable)
    let m;
    if ((m = p.match(/^\/games\/([a-f0-9]{8})\/(.*)$/))) { const f = path.join(sdir(m[1]), 'build/web', m[2] || 'index.html'); if (!f.startsWith(sdir(m[1])) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { const idx = path.join(sdir(m[1]), 'build/web/index.html'); if (!m[2] && fs.existsSync(idx)) return sendFile(res, idx, cors); res.writeHead(404, cors); return res.end('not built'); } return sendFile(res, f, cors); }
    if ((m = p.match(/^\/files\/([a-f0-9]{8})\/(design|assets)\/([A-Za-z0-9._-]+)$/))) { const f = path.join(sdir(m[1]), m[2], m[3]); if (!fs.existsSync(f) || !/\.(png|jpe?g|svg|webp)$/i.test(f)) { res.writeHead(404, cors); return res.end(); } return sendFile(res, f, cors); }
    if (!p.startsWith('/api/')) { res.writeHead(404, cors); return res.end('demo-desk'); }
    const body = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
    if (p.startsWith('/api/trainer/') || p === '/api/class') {
      if (!TRAINER_PIN || String(body.pin || '') !== TRAINER_PIN) return json(res, 403, { error: 'wrong PIN' }, cors);
      if (p === '/api/class') return json(res, 200, classBoard(), cors);
      if (p === '/api/trainer/ask' && req.method === 'POST') { const r = await trainerAsk(body.text); log({ ev: 'trainer', kind: r.kind }); return json(res, 200, { ...r, board: classBoard() }, cors); }
      return json(res, 404, { error: 'unknown trainer call' }, cors);
    }
    if (!OPEN && String(body.pin || '') !== PIN) return json(res, 403, { error: 'wrong PIN' }, cors);
    if (p === '/api/session' && req.method === 'POST') {
      if (fs.readdirSync(SESS).length >= MAXS) cleanup();
      if (fs.readdirSync(SESS).length >= MAXS) return json(res, 429, { error: 'the demo server is full for now; try later' }, cors);
      const id = crypto.randomBytes(4).toString('hex'); const name = String(body.name || '').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || id;
      const shown = (String(body.name || '').replace(/[^A-Za-z0-9 '-]/g, '').trim().slice(0, 20) || 'Demo') + "'s Pong";
      const r = await run('node', [TGK, 'new', 'pong', id, '--student', 'demo-' + name, '--week', '3', '--title', shown], SESS, 60000);
      if (r.code !== 0) return json(res, 500, { error: 'could not create the game: ' + (r.err || r.out).slice(-300) }, cors);
      log({ ev: 'session', id, name }); buildInBackground(id); return json(res, 200, { session: id, state: state(id) }, cors);
    }
    const id = sid(body.session); if (!id || !fs.existsSync(sdir(id))) return json(res, 404, { error: 'no such session (start a new one)' }, cors);
    if (p === '/api/state') return json(res, 200, state(id), cors);
    if (p === '/api/route' && req.method === 'POST') { const r = await run('node', [TGK, 'ask', ' ' + String(body.text || '').slice(0, 2000), '--to', ['design', 'build'].includes(body.to) ? body.to : 'auto', '--route-only', '--json'], sdir(id), 30000); return json(res, 200, lastJson(r.out) || { error: 'no route' }, cors); }
    if (busy.get(id)) return json(res, 409, { error: 'this session is still working; wait for the reply' }, cors);
    if (p === '/api/ask' && req.method === 'POST') {
      if (asks.day === today() && asks.n >= CAP) return json(res, 429, { error: `the demo's daily allowance (${CAP} requests) is used up; back tomorrow` }, cors);
      const text = String(body.text || '').slice(0, 2000); const explain = body.explain ? String(body.explain).slice(0, 500) : null;
      if (!text && !explain) return json(res, 400, { error: 'say something' }, cors);
      busy.set(id, true); countAsk(); const argv = [TGK, 'ask']; if (text) argv.push(' ' + text); if (explain) argv.push('--explain', ' ' + explain); argv.push('--to', ['design', 'build'].includes(body.to) ? body.to : 'auto', '--json');
      const t0 = Date.now(); const r = await run('node', argv, sdir(id), 600000); busy.delete(id);
      const out = lastJson(r.out) || { ok: false, route: 'error', notice: 'the desk did not answer: ' + (r.err || r.out).slice(-300) };
      const diff = diffOf(id); if (out.ok && (out.route === 'build' || out.route === 'both')) commit(id, text || 'change');
      log({ ev: 'ask', id, route: out.route, ms: Date.now() - t0, ok: out.ok }); fs.utimesSync(sdir(id), new Date(), new Date());
      if (out.ok && (out.route === 'build' || out.route === 'both')) buildInBackground(id);
      return json(res, 200, { ...out, diff, state: state(id), ms: Date.now() - t0 }, cors);
    }
    if (p === '/api/build' && req.method === 'POST') { if (building.get(id)) return json(res, 200, { ok: true, building: true, state: state(id) }, cors); busy.set(id, true); const r = await run('node', [TGK, 'build', 'web'], sdir(id), 300000); busy.delete(id); const ok = fs.existsSync(path.join(sdir(id), 'build/web/index.html')); log({ ev: 'build', id, ok }); return json(res, ok ? 200 : 500, { ok, gameUrl: ok ? `/games/${id}/` : null, out: (r.out + r.err).slice(-400), state: state(id) }, cors); }
    if (p === '/api/review' && req.method === 'POST') { busy.set(id, true); const r = await run('node', [TGK, 'review', '--quick'], sdir(id), 180000); busy.delete(id); log({ ev: 'review', id }); return json(res, 200, { ok: r.code === 0, out: r.out.trim().slice(-200), state: state(id) }, cors); }
    if (p === '/api/reset' && req.method === 'POST') { fs.rmSync(sdir(id), { recursive: true, force: true }); return json(res, 200, { ok: true }, cors); }
    return json(res, 404, { error: 'unknown call' }, cors);
  } catch (e) { return json(res, 500, { error: String(e.message || e).slice(0, 200) }, cors); }
});
function sendFile(res, f, cors) { const ext = path.extname(f).toLowerCase(); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.css': 'text/css' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...cors }); fs.createReadStream(f).pipe(res); }
server.listen(PORT, '0.0.0.0', () => console.log(`demo-desk on :${PORT} kit=${KIT} root=${ROOT}`));
