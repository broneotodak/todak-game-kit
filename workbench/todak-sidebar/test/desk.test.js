const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const desk = require('../desk');
const fixtures = require('./desk-fixtures');

test('all router JSON shapes, including failed AI results and explain rejection, pass through a mocked child process', async () => {
  for (const [name, value] of Object.entries(fixtures)) {
    const input = desk.request({ text: 'A message', kind: name === 'explain' ? 'explain' : 'ask' });
    const reply = await desk.run('/kit/bin/tgk.mjs', '/game', input, (_node, _args, _options, callback) => callback(null, JSON.stringify(value) + '\n'));
    assert.equal(reply.ok, value.ok);
    assert.equal(reply.route, value.route || null);
    if (name === 'plan') {
      assert.deepEqual(reply.plan.map(s => s.done), [true, false, false, false]);
      assert.equal(reply.suggestion, 'make the left paddle move with W and S');
      assert.ok(!reply.notice.includes('[x]'));
    }
    if (name === 'blocked') { assert.match(reply.reason, /Explain the last change/); assert.equal(reply.awaiting_explain, true); }
    if (name === 'both') assert.deepEqual(reply.results.map(r => r.desk), ['design', 'build']);
  }
  assert.equal(desk.parseReply('{"ok":false,"notice":"Try one sentence."}', 'explain').ok, false);
});

test('text, newlines, shell characters and leading flag words travel only as literal argv', async () => {
  for (const text of ['--json', '--to', '--explain', 'two lines\n"quoted" $(touch /tmp/no) `echo no` & %PATH%']) {
    for (const kind of ['ask', 'explain']) {
      const input = desk.request({ text, kind, to: 'design' });
      await desk.run('/kit with spaces/bin/tgk.mjs', '/game with spaces', input, (node, args, options, callback) => {
        assert.equal(node, 'node'); assert.equal(options.shell, false); assert.equal(options.cwd, '/game with spaces');
        assert.equal(options.encoding, 'utf8'); assert.ok(options.maxBuffer >= 1024 * 1024);
        assert.deepEqual(args, ['/kit with spaces/bin/tgk.mjs', 'ask', ...(kind === 'ask' ? [` ${text}`, '--to', 'design'] : ['--explain', ` ${text}`]), '--json']);
        callback(null, JSON.stringify(kind === 'ask' ? fixtures.design : fixtures.explain));
      });
    }
  }
  for (const value of [{ text: '' }, { text: 'a\0b' }, { text: 'a'.repeat(12001) }, { text: 'ok', to: 'delete' }]) assert.throws(() => desk.request(value));
});

test('malformed JSON, missing results, launch failures and oversized replies fail without exposing stderr', async () => {
  for (const stdout of ['', 'not json', '{"ok":true}', '{"ok":true,"route":"build"}', JSON.stringify(fixtures.design) + '\nextra output']) {
    await assert.rejects(desk.run('/kit', '/game', desk.request({ text: 'hello' }), (_n, _a, _o, cb) => cb(null, stdout)), /reply/);
  }
  for (const code of ['ENOENT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 1]) {
    await assert.rejects(desk.run('/kit', '/game', desk.request({ text: 'hello' }), (_n, _a, _o, cb) => cb({ code }, '', 'private diagnostic')), error => !error.message.includes('private diagnostic'));
  }
});

test('other-desk choices handle single, both, plan and blocked routes deterministically', () => {
  assert.deepEqual(desk.otherDesks({ reply: fixtures.design, to: 'auto' }), ['build']);
  assert.deepEqual(desk.otherDesks({ reply: fixtures.build, to: 'auto' }), ['design']);
  assert.deepEqual(desk.otherDesks({ reply: fixtures.both, to: 'auto' }), ['design', 'build']);
  assert.deepEqual(desk.otherDesks({ reply: fixtures.plan, to: 'auto' }), ['design', 'build']);
  assert.deepEqual(desk.otherDesks({ reply: fixtures.blocked, to: 'build' }), ['design']);
});

test('changed-file opening supports nested files and spaces, rejects escapes, symlinks, directories and removed files', async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'todak-desk-paths-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'game'); await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  const file = path.join(root, 'scripts/paddle moves.gd'); await fs.writeFile(file, '');
  const outside = path.join(parent, 'outside'); await fs.writeFile(outside, '');
  assert.equal(await desk.changedFile(root, 'scripts/paddle moves.gd'), await fs.realpath(file));
  for (const relative of ['../outside', '..\\outside', outside, 'C:\\private.txt', 'https://example.com', 'scripts', 'scripts/missing.gd']) await assert.rejects(desk.changedFile(root, relative));
  if (process.platform !== 'win32') {
    await fs.symlink(outside, path.join(root, 'scripts/link')); await assert.rejects(desk.changedFile(root, 'scripts/link'), /outside/);
    await fs.symlink(parent, path.join(root, 'shortcut')); await assert.rejects(desk.changedFile(root, 'shortcut/outside'), /outside/);
  }
});
