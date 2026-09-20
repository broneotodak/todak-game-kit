const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const model = require('../model');
const kit = path.resolve(__dirname, '../../..');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'todak-model-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function write(root, relative, value) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value);
  return file;
}

test('reads a real tgk scaffold, discovers its nearest parent, and matches CLI steps', async t => {
  const parent = await fixture(t);
  const cli = path.join(kit, 'bin/tgk.mjs');
  const result = spawnSync(process.execPath, [cli, 'new', 'pong', 'demo-pong', '--student', 'demo', '--week', '3'], { cwd: parent, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const root = path.join(parent, 'demo-pong');
  const nested = path.join(root, 'scripts');
  assert.equal(await model.findGame([nested]), root);
  const state = await model.snapshot(root);
  assert.equal(state.meta.name, 'Demo Pong');
  assert.equal(state.meta.student, 'demo');
  assert.equal(state.meta.week, '3');
  assert.deepEqual(state.steps.map(s => s.done), [true, false, false, false]);
  const status = spawnSync(process.execPath, [cli, 'status'], { cwd: root, encoding: 'utf8' });
  for (const step of state.steps) assert.ok(status.stdout.includes(step.label));
  assert.equal(state.images.length, 4, 'all template art should scaffold into assets/');
  const step = spawnSync(process.execPath, [cli, 'step', 'done', 'paddle'], { cwd: root });
  assert.equal(step.status, 0);
  assert.equal((await model.snapshot(root)).steps[1].done, true);
  await write(root, 'scripts/.tgk.json', JSON.stringify({ name: 'Inner', template: 'pong' }));
  assert.equal(await model.findGame([nested]), nested, 'nearest metadata wins');
});

test('handles missing metadata, partial JSON saves, and unknown templates without crashing', async t => {
  const root = await fixture(t);
  assert.equal(await model.findGame([root]), null);
  assert.equal((await model.snapshot(null)).root, null);
  await write(root, '.tgk.json', '{');
  let state = await model.snapshot(root);
  assert.equal(state.meta, null); assert.match(state.error, /\.tgk\.json/);
  await write(root, '.tgk.json', JSON.stringify({ name: '<script>alert(1)</script>', template: 'future' }));
  state = await model.snapshot(root);
  assert.equal(state.error, ''); assert.equal(state.steps.length, 0);
  await write(root, '.tgk.json', JSON.stringify({ name: 'Future game', template: 'constructor' }));
  assert.deepEqual((await model.snapshot(root)).steps, []);
});

test('gallery recurses, sorts newest first, handles deletion, and skips symlinks', async t => {
  const root = await fixture(t);
  const old = await write(root, 'assets/old.PNG', 'old');
  await fs.utimes(old, new Date(0), new Date(0));
  const newest = await write(root, 'design/nested/new.webp', 'new');
  await write(root, 'design/readme.txt', 'not an image');
  await write(root, 'design/vector.svg', '<svg/>');
  await fs.utimes(newest, new Date(2000000000000), new Date(2000000000000));
  // Windows needs developer mode/admin rights for symbolic links. The extension skips them on all OSes.
  if (process.platform !== 'win32') {
    await fs.symlink(root, path.join(root, 'design/cycle'));
    await fs.symlink(old, path.join(root, 'design/link.png'));
  }
  let art = await model.images(root);
  assert.deepEqual(art.map(a => a.relative), ['design/nested/new.webp', 'design/vector.svg', 'assets/old.PNG']);
  await fs.unlink(newest);
  art = await model.images(root);
  assert.equal(art.length, 2);
});

test('journey counts valid prompts, keeps the latest eight, tolerates an interrupted append, and ages to idle', async t => {
  const root = await fixture(t);
  assert.equal((await model.journey(root)).status, 'missing');
  const rows = Array.from({ length: 11 }, (_, i) => JSON.stringify({ at: `2026-09-20T09:${String(i).padStart(2, '0')}:00Z`, desk: i % 2 ? 'codex' : 'claude', prompt: `${i} ` + 'x'.repeat(100) }));
  const file = await write(root, 'journey/prompts.jsonl', rows.join('\r\n') + '\n\n{"prompt":');
  const now = Date.now(); await fs.utimes(file, new Date(now), new Date(now));
  const saved = await model.journey(root, now + 599999);
  assert.equal(saved.status, 'saved'); assert.equal(saved.count, 11); assert.equal(saved.recent.length, 8);
  assert.ok(saved.recent[0].prompt.startsWith('10 ')); assert.ok(saved.recent[7].prompt.startsWith('3 '));
  assert.equal(saved.recent[0].prompt.length, 81); assert.match(saved.warning, /1 incomplete/);
  assert.equal((await model.journey(root, now + 600001)).status, 'idle');
  await fs.writeFile(file, '');
  assert.equal((await model.journey(root)).count, 0);
});

test('review reads the bold CLI summary and distinguishes missing and unrecognised reports', async t => {
  const root = await fixture(t);
  assert.deepEqual(await model.report(root), { exists: false });
  await write(root, 'review/report.md', '# Review\n\n**5 of 7 checks passed.** Fix the remaining items.');
  assert.equal((await model.report(root)).summary, '5 of 7 checks passed');
  await write(root, 'review/report.md', '# New format');
  assert.equal((await model.report(root)).exists, true);
  assert.match((await model.report(root)).summary, /summary not found/);
});

test('kit path uses explicit setting, then sibling, then environment without falling back from a typo', async t => {
  const root = await fixture(t);
  const game = path.join(root, "game's folder $(literal)");
  const envKit = await write(root, 'env-kit/bin/tgk.mjs', '');
  const env = { TGK_KIT: path.dirname(path.dirname(envKit)) };
  assert.equal(await model.resolveKit(game, '', env), envKit);
  const sibling = await write(root, 'todak-game-kit/bin/tgk.mjs', '');
  assert.equal(await model.resolveKit(game, '', env), sibling);
  assert.equal(await model.resolveKit(game, '../env-kit', env), envKit);
  await assert.rejects(model.resolveKit(game, '../typo', env), /todak.kitPath/);
});

test('new game names cannot escape the selected folder or use Windows reserved names', () => {
  for (const name of ['../other', '-bad', 'two words', 'x;echo', '$(touch pwn)', 'CON', 'lpt1', '']) assert.ok(model.validateName(name), name);
  assert.equal(model.validateName('my-pong_2'), undefined);
});
