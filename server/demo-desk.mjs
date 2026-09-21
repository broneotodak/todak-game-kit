#!/usr/bin/env node
// demo-desk — the web demo's backend for the one box. Wraps the kit (tgk) per session. Demonstrator, not the kit.
// Runs on a demo machine with Claude Code + Codex signed in. Every call needs the team PIN. Node 20+, no dependencies.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const PORT = Number(process.env.DEMO_PORT || 3860);
const PIN = process.env.DEMO_PIN || ''; if (!PIN) { console.error('DEMO_PIN missing'); process.exit(1); }
const ROOT = process.env.DEMO_ROOT || path.join(os.homedir(), 'demo-desk'); const SESS = path.join(ROOT, 'sessions'); fs.mkdirSync(SESS, { recursive: true });
const KIT = process.env.TGK_KIT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); const TGK = path.join(KIT, 'bin/tgk.mjs');
const CAP = Number(process.env.DEMO_DAILY_CAP || 80); const MAXS = Number(process.env.DEMO_MAX_SESSIONS || 30); const TTL = 24 * 3600 * 1000;
const ORIGINS = (process.env.DEMO_ORIGINS || 'https://course.neotodak.com,http://localhost:8080').split(',');
const busy = new Map(); const log = (o) => fs.appendFileSync(path.join(ROOT, 'log.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
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
  return { session: id, name: meta.name, student: meta.student, week: meta.week, steps: meta.steps || {}, awaiting_explain: !!meta.awaiting_explain, journey, images: imgs, changed, built, gameUrl: built ? `/games/${id}/` : null, report, busy: !!busy.get(id), asksToday: asks.n, cap: CAP };
}
function diffOf(id) { const dir = sdir(id); const r = spawnSync('git', ['diff', '--', 'scripts', 'scenes', 'project.godot'], { cwd: dir, encoding: 'utf8', maxBuffer: 1e7 }); return (r.stdout || '').slice(0, 30000); }
function commit(id, msg) { const dir = sdir(id); spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['-c', 'user.name=demo-desk', '-c', 'user.email=demo@todak.com', 'commit', '-q', '-m', msg.slice(0, 120)], { cwd: dir }); }
function cleanup() { for (const id of fs.readdirSync(SESS)) { try { const st = fs.statSync(sdir(id)); if (Date.now() - st.mtimeMs > TTL) fs.rmSync(sdir(id), { recursive: true, force: true }); } catch {} } }
setInterval(cleanup, 3600000);

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin; const cors = ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } : {};
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (p === '/health' || p === '/api/health') return json(res, 200, { ok: true, sessions: fs.readdirSync(SESS).length, asksToday: asks.n, cap: CAP }, cors);
    // static: games and design files (no PIN: builds are public on the showcase anyway; ids are unguessable)
    let m;
    if ((m = p.match(/^\/games\/([a-f0-9]{8})\/(.*)$/))) { const f = path.join(sdir(m[1]), 'build/web', m[2] || 'index.html'); if (!f.startsWith(sdir(m[1])) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { const idx = path.join(sdir(m[1]), 'build/web/index.html'); if (!m[2] && fs.existsSync(idx)) return sendFile(res, idx, cors); res.writeHead(404, cors); return res.end('not built'); } return sendFile(res, f, cors); }
    if ((m = p.match(/^\/files\/([a-f0-9]{8})\/(design|assets)\/([A-Za-z0-9._-]+)$/))) { const f = path.join(sdir(m[1]), m[2], m[3]); if (!fs.existsSync(f) || !/\.(png|jpe?g|svg|webp)$/i.test(f)) { res.writeHead(404, cors); return res.end(); } return sendFile(res, f, cors); }
    if (!p.startsWith('/api/')) { res.writeHead(404, cors); return res.end('demo-desk'); }
    const body = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
    if (String(body.pin || '') !== PIN) return json(res, 403, { error: 'wrong PIN' }, cors);
    if (p === '/api/session' && req.method === 'POST') {
      if (fs.readdirSync(SESS).length >= MAXS) cleanup();
      if (fs.readdirSync(SESS).length >= MAXS) return json(res, 429, { error: 'the demo server is full for now; try later' }, cors);
      const id = crypto.randomBytes(4).toString('hex'); const name = String(body.name || '').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || id;
      const shown = (String(body.name || '').replace(/[^A-Za-z0-9 '-]/g, '').trim().slice(0, 20) || 'Demo') + "'s Pong";
      const r = await run('node', [TGK, 'new', 'pong', id, '--student', 'demo-' + name, '--week', '3', '--title', shown], SESS, 60000);
      if (r.code !== 0) return json(res, 500, { error: 'could not create the game: ' + (r.err || r.out).slice(-300) }, cors);
      log({ ev: 'session', id, name }); return json(res, 200, { session: id, state: state(id) }, cors);
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
      return json(res, 200, { ...out, diff, state: state(id), ms: Date.now() - t0 }, cors);
    }
    if (p === '/api/build' && req.method === 'POST') { busy.set(id, true); const r = await run('node', [TGK, 'build', 'web'], sdir(id), 300000); busy.delete(id); const ok = fs.existsSync(path.join(sdir(id), 'build/web/index.html')); log({ ev: 'build', id, ok }); return json(res, ok ? 200 : 500, { ok, gameUrl: ok ? `/games/${id}/` : null, out: (r.out + r.err).slice(-400), state: state(id) }, cors); }
    if (p === '/api/review' && req.method === 'POST') { busy.set(id, true); const r = await run('node', [TGK, 'review', '--quick'], sdir(id), 180000); busy.delete(id); log({ ev: 'review', id }); return json(res, 200, { ok: r.code === 0, out: r.out.trim().slice(-200), state: state(id) }, cors); }
    if (p === '/api/reset' && req.method === 'POST') { fs.rmSync(sdir(id), { recursive: true, force: true }); return json(res, 200, { ok: true }, cors); }
    return json(res, 404, { error: 'unknown call' }, cors);
  } catch (e) { return json(res, 500, { error: String(e.message || e).slice(0, 200) }, cors); }
});
function sendFile(res, f, cors) { const ext = path.extname(f).toLowerCase(); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.css': 'text/css' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...cors }); fs.createReadStream(f).pipe(res); }
server.listen(PORT, '0.0.0.0', () => console.log(`demo-desk on :${PORT} kit=${KIT} root=${ROOT}`));
