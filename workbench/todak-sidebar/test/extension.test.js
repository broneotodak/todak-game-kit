const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function signal() {
  const callbacks = new Set();
  return { event: callback => { callbacks.add(callback); return { dispose: () => callbacks.delete(callback) }; }, fire: value => Promise.all([...callbacks].map(fn => fn(value))) };
}
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "todak-host's-"));
  const game = path.join(root, 'game');
  await fs.mkdir(game);
  const metadata = { name: 'Demo', student: 'demo', week: 3, template: 'pong', steps: { scaffold: true } };
  await fs.writeFile(path.join(game, '.tgk.json'), JSON.stringify(metadata));
  const commands = new Map(), terminals = [], errors = [], opened = [], watchers = [];
  const jobs = [], storage = new Map();
  const folderChanged = signal(), trustChanged = signal(), configurationChanged = signal();
  const Uri = { file: file => ({ scheme: 'file', fsPath: file, toString: () => `file://${file}` }), joinPath: (uri, ...parts) => Uri.file(path.join(uri.fsPath, ...parts)) };
  const vscode = {
    Uri,
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    commands: {
      registerCommand(name, fn) { commands.set(name, fn); return { dispose() { commands.delete(name); } }; },
      async executeCommand(name, ...args) { if (commands.has(name)) return commands.get(name)(...args); opened.push({ name, args }); },
    },
    workspace: {
      workspaceFolders: [{ uri: Uri.file(game) }], isTrusted: true,
      getConfiguration: () => ({ get: () => path.resolve(__dirname, '../../..') }),
      onDidChangeWorkspaceFolders: folderChanged.event, onDidGrantWorkspaceTrust: trustChanged.event, onDidChangeConfiguration: configurationChanged.event,
      openTextDocument: async uri => uri,
      createFileSystemWatcher(pattern) {
        const created = signal(), changed = signal(), deleted = signal();
        const watcher = { pattern, created, changed, deleted, disposed: false,
          onDidCreate: created.event, onDidChange: changed.event, onDidDelete: deleted.event, dispose() { this.disposed = true; } };
        watchers.push(watcher); return watcher;
      },
    },
    window: {
      registerWebviewViewProvider: (id, provider) => { vscode.provider = provider; return { dispose() {} }; },
      createTerminal: options => { terminals.push(options); return { show() {} }; },
      showErrorMessage: message => errors.push(message),
      showTextDocument: async document => opened.push(document),
      showInputBox: async () => 'my-pong', showOpenDialog: async () => [Uri.file(root)], showInformationMessage: async () => undefined,
    },
  };
  const extensionPath = path.resolve(__dirname, '../extension.js');
  const localRequire = createRequire(extensionPath);
  const mod = { exports: {} };
  const realDesk = localRequire('./desk');
  const mockedDesk = { ...realDesk, run: (cli, game, input) => realDesk.run(cli, game, input, (node, args, options, callback) => { jobs.push({ node, args, options, callback }); }) };
  vm.runInNewContext(await fs.readFile(extensionPath, 'utf8'), { require: name => name === 'vscode' ? vscode : name === './desk' ? mockedDesk : localRequire(name), module: mod, setInterval, clearInterval, setTimeout, clearTimeout }, { filename: extensionPath });
  const context = { subscriptions: [], extensionUri: Uri.file(path.resolve(__dirname, '..')), workspaceState: {
    get: (key, fallback) => storage.get(key) ?? fallback,
    update: async (key, value) => { storage.set(key, JSON.parse(JSON.stringify(value))); },
  } };
  mod.exports.activate(context);
  const states = [], received = signal(), visibility = signal(), disposed = signal();
  const view = { visible: true, onDidDispose: disposed.event, onDidChangeVisibility: visibility.event, webview: {
    cspSource: 'vscode-webview:', asWebviewUri: uri => ({ with: ({ query }) => ({ toString: () => uri.toString() + '?' + query }), toString: uri.toString }),
    onDidReceiveMessage: received.event, postMessage: async message => { if (message.type === 'state') states.push(JSON.parse(JSON.stringify(message.state))); return true; },
  } };
  vscode.provider.resolveWebviewView(view);
  await vscode.provider.refresh();
  t.after(async () => { await disposed.fire(); context.subscriptions.forEach(d => d.dispose()); await fs.rm(root, { recursive: true, force: true }); });
  return { root, game, metadata, vscode, commands, terminals, errors, opened, watchers, states, received, view, folderChanged, jobs, storage, context, Sidebar: mod.exports.TodakSidebar };
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for sidebar update'); await new Promise(resolve => setTimeout(resolve, 20)); }
}

test('all required commands activate and run real argv in an isolated Todak terminal', async t => {
  const s = await setup(t);
  assert.equal(s.commands.size, 7);
  for (const command of ['run', 'build', 'publish', 'review']) await s.commands.get(`todak.${command}`)();
  assert.equal(s.errors.length, 0);
  assert.deepEqual(s.terminals.map(terminal => Array.from(terminal.shellArgs).slice(1)), [['run'], ['build', 'web'], ['publish', 'web'], ['review']]);
  for (const terminal of s.terminals) {
    assert.equal(terminal.name, 'Todak'); assert.equal(terminal.cwd, s.game); assert.equal(terminal.shellPath, 'node');
    assert.ok(terminal.shellArgs[0].endsWith(path.join('bin', 'tgk.mjs')));
  }
  s.vscode.workspace.isTrusted = false;
  await s.commands.get('todak.run')(); await s.commands.get('todak.new')();
  assert.equal(s.terminals.length, 4); assert.match(s.errors[0], /Trust/);
});

test('watcher events refresh steps, gallery additions/removals, journey and review', async t => {
  const s = await setup(t);
  s.metadata.steps.paddle = true;
  await fs.writeFile(path.join(s.game, '.tgk.json'), JSON.stringify(s.metadata));
  await s.watchers.find(w => w.pattern.base === s.game && w.pattern.pattern === '.tgk.json').changed.fire();
  await until(() => s.states.at(-1).steps[1].done);
  for (const dir of ['design', 'journey', 'review']) await fs.mkdir(path.join(s.game, dir));
  await fs.writeFile(path.join(s.game, 'design/test.svg'), '<svg/>');
  await fs.writeFile(path.join(s.game, 'journey/prompts.jsonl'), JSON.stringify({ at: '2026-09-20T09:00:00Z', desk: 'codex', prompt: 'Hello' }) + '\n');
  await fs.writeFile(path.join(s.game, 'review/report.md'), '**7 of 7 checks passed.**');
  const design = s.watchers.find(w => w.pattern.pattern === 'design/**');
  await design.created.fire();
  await until(() => s.states.at(-1).images.length === 1);
  assert.equal(s.states.at(-1).journey.count, 1); assert.equal(s.states.at(-1).report.summary, '7 of 7 checks passed');
  await s.received.fire({ type: 'image', path: 'design/test.svg' });
  assert.equal(s.opened.at(-1).name, 'vscode.open');
  await s.received.fire({ type: 'image', path: '../../private.png' });
  assert.equal(s.opened.length, 1);
  await fs.unlink(path.join(s.game, 'design/test.svg')); await design.deleted.fire();
  await until(() => s.states.at(-1).images.length === 0);
  await s.commands.get('todak.openJourney')(); await s.commands.get('todak.openReport')();
  assert.equal(s.opened.length, 3);
  await fs.unlink(path.join(s.game, '.tgk.json'));
  await s.watchers.find(w => w.pattern.base === s.game && w.pattern.pattern === '.tgk.json').deleted.fire();
  await until(() => s.states.at(-1).root === null);
  assert.equal(design.disposed, true);
});

test('new game flow handles cancellation, folder collision and creation without shell interpolation', async t => {
  const s = await setup(t);
  s.vscode.window.showInputBox = async () => undefined;
  await s.commands.get('todak.new')(); assert.equal(s.terminals.length, 0);
  s.vscode.window.showInputBox = async () => 'game';
  await s.commands.get('todak.new')(); assert.match(s.errors.at(-1), /already exists/);
  s.vscode.window.showInputBox = async () => 'my-pong';
  await s.commands.get('todak.new')();
  assert.deepEqual(Array.from(s.terminals[0].shellArgs).slice(1), ['new', 'pong', 'my-pong']);
  assert.equal(s.terminals[0].cwd, s.root);
});

test('webview rejects arbitrary commands and only grants art resource roots', async t => {
  const s = await setup(t);
  await s.received.fire({ type: 'command', command: 'workbench.action.terminal.new' });
  await s.received.fire({ type: 'command', command: '__proto__' });
  assert.equal(s.opened.length, 0); assert.equal(s.terminals.length, 0);
  assert.deepEqual(Array.from(s.view.webview.options.localResourceRoots, uri => path.basename(uri.fsPath)), ['media', 'design', 'assets']);
  assert.match(s.view.webview.html, /connect-src 'none'/);
  assert.match(s.view.webview.html, /script-src 'nonce-/);
});

const fixtures = require('./desk-fixtures');
async function finish(s, value) {
  if ('awaiting_explain' in value || value.reason === 'awaiting_explain' || !value.route && value.ok) {
    s.metadata.awaiting_explain = value.awaiting_explain === true || value.reason === 'awaiting_explain';
    await fs.writeFile(path.join(s.game, '.tgk.json'), JSON.stringify(s.metadata));
  }
  s.jobs.at(-1).callback(null, JSON.stringify(value) + '\n');
}
const send = (s, text, extra = {}) => s.received.fire({ type: 'deskSend', root: s.game, kind: 'ask', text, ...extra });

test('desk serializes requests, runs in the game as a child process, persists replies and refreshes journey/steps', async t => {
  const s = await setup(t);
  const pending = send(s, 'Make a cyan paddle', { to: 'design' });
  await until(() => s.jobs.length === 1);
  assert.equal(s.terminals.length, 0); assert.equal(s.jobs[0].options.cwd, s.game);
  assert.equal(s.states.at(-1).desk.busy.to, 'design');
  assert.equal([...s.storage.values()][0][0].pending, true);
  await send(s, 'duplicate'); assert.equal(s.jobs.length, 1);
  await s.received.fire({ type: 'deskClear', root: s.game });
  assert.equal(s.vscode.provider.conversation(s.game).length, 1);
  await fs.mkdir(path.join(s.game, 'journey'));
  await fs.writeFile(path.join(s.game, 'journey/prompts.jsonl'), JSON.stringify({ desk: 'codex', prompt: 'Make a cyan paddle' }) + '\n');
  s.metadata.steps.paddle = true;
  await finish(s, fixtures.design); await pending;
  const state = s.states.at(-1);
  assert.equal(state.desk.busy, null); assert.equal(state.desk.entries[0].reply.route, 'design');
  assert.equal(state.journey.count, 1); assert.equal(state.steps[1].done, true);
  const restored = new s.Sidebar(s.context); t.after(() => restored.dispose());
  assert.equal(restored.conversation(s.game)[0].reply.results[0].text, fixtures.design.results[0].text);
});

test('every route and partial failure is stored; override resends the original prompt to an allowed other desk', async t => {
  const s = await setup(t);
  for (const [i, shape] of [fixtures.plan, fixtures.blocked, fixtures.design, fixtures.both, fixtures.failed].entries()) {
    const pending = send(s, `message ${i}`);
    await until(() => s.jobs.length === i + 1);
    await finish(s, shape); await pending;
    assert.equal(s.states.at(-1).desk.entries.at(-1).reply.route, shape.route);
    // Simulate a separate explain-back before the next sample.
    s.metadata.awaiting_explain = false;
    await fs.writeFile(path.join(s.game, '.tgk.json'), JSON.stringify(s.metadata));
  }
  const original = s.vscode.provider.conversation(s.game).at(-1);
  const pending = s.received.fire({ type: 'deskOverride', root: s.game, id: original.id, to: 'build', text: 'forged replacement' });
  await until(() => s.jobs.length === 6);
  assert.deepEqual(s.jobs[5].args.slice(1), ['ask', ' message 4', '--to', 'build', '--json']);
  await finish(s, { ...fixtures.build, awaiting_explain: false }); await pending;
  await s.received.fire({ type: 'deskOverride', root: s.game, id: original.id, to: 'design' });
  assert.equal(s.jobs.length, 6); assert.match(s.states.at(-1).desk.error, /other desk/);
});

test('explain-back gates all normal sends and overrides, survives clear/reload, and only unlocks after success', async t => {
  const s = await setup(t);
  let pending = send(s, 'Move the paddle'); await until(() => s.jobs.length === 1);
  // The contract's gate applies immediately, even before a fresh file snapshot.
  s.jobs.at(-1).callback(null, JSON.stringify(fixtures.build)); await pending;
  assert.equal(s.states.at(-1).desk.awaitingExplain, true);
  s.metadata.awaiting_explain = true;
  await fs.writeFile(path.join(s.game, '.tgk.json'), JSON.stringify(s.metadata));
  await s.vscode.provider.refresh();
  const original = s.vscode.provider.conversation(s.game)[0];
  await send(s, 'Draw a ball', { to: 'design' });
  await s.received.fire({ type: 'deskOverride', root: s.game, id: original.id, to: 'design' });
  assert.equal(s.jobs.length, 1); assert.match(s.states.at(-1).desk.error, /Explain/);
  await s.received.fire({ type: 'deskClear', root: s.game });
  assert.equal(s.states.at(-1).desk.entries.length, 0); assert.equal(s.states.at(-1).desk.awaitingExplain, true);
  const restored = new s.Sidebar(s.context); t.after(() => restored.dispose());
  assert.equal(restored.deskState(s.game, await require('../model').metadata(s.game)).awaitingExplain, true);
  pending = send(s, 'One sentence', { kind: 'explain' }); await until(() => s.jobs.length === 2);
  await finish(s, { ok: false, notice: 'Please explain that change.' }); await pending;
  assert.equal(s.states.at(-1).desk.awaitingExplain, true);
  pending = send(s, 'W and S now move the paddle.', { kind: 'explain' }); await until(() => s.jobs.length === 3);
  assert.deepEqual(s.jobs.at(-1).args.slice(1), ['ask', '--explain', ' W and S now move the paddle.', '--json']);
  await finish(s, fixtures.explain); await pending;
  assert.equal(s.states.at(-1).desk.awaitingExplain, false);
  assert.equal(s.states.at(-1).desk.entries.at(-1).reply.notice, 'Thanks. Next step unlocked.');
});

test('desk rejects untrusted, missing, stale-game and invalid inputs before starting any child', async t => {
  const s = await setup(t);
  s.vscode.workspace.isTrusted = false; await send(s, 'hello'); assert.match(s.errors.at(-1), /Trust/);
  s.vscode.workspace.isTrusted = true;
  await send(s, 'hello', { root: '/wrong/game' }); assert.match(s.errors.at(-1), /folder changed/);
  await send(s, 'hello', { to: 'delete' });
  await send(s, ''); await send(s, 'x'.repeat(12001));
  await send(s, 'not needed', { kind: 'explain' });
  await fs.unlink(path.join(s.game, '.tgk.json')); await send(s, 'hello');
  assert.equal(s.jobs.length, 0);
});

test('file chips are bound to a stored reply and game; moved/deleted files and symlinks cannot escape', async t => {
  const s = await setup(t);
  await fs.mkdir(path.join(s.game, 'assets')); await fs.writeFile(path.join(s.game, 'assets/paddle.png'), 'image');
  const pending = send(s, 'Draw the paddle'); await until(() => s.jobs.length === 1);
  await finish(s, { ...fixtures.design, files: ['assets/paddle.png', '../outside'] }); await pending;
  const id = s.vscode.provider.conversation(s.game)[0].id;
  await s.received.fire({ type: 'deskFile', root: s.game, id, path: 'assets/paddle.png' }); assert.equal(s.opened.length, 1);
  await s.received.fire({ type: 'deskFile', root: s.game, id, path: '.tgk.json' }); assert.equal(s.opened.length, 1);
  await s.received.fire({ type: 'deskFile', root: s.game, id, path: '../outside' }); assert.match(s.errors.at(-1), /outside/);
  await fs.unlink(path.join(s.game, 'assets/paddle.png'));
  await s.received.fire({ type: 'deskFile', root: s.game, id, path: 'assets/paddle.png' }); assert.match(s.errors.at(-1), /no longer available/);
});

test('an in-flight reply stays with its original game and an interrupted saved run is never replayed', async t => {
  const s = await setup(t);
  const pending = send(s, 'Draw a paddle'); await until(() => s.jobs.length === 1);
  const restored = new s.Sidebar(s.context); t.after(() => restored.dispose());
  assert.match(restored.conversation(s.game)[0].error, /reloaded/); assert.equal(s.jobs.length, 1);
  const other = path.join(s.root, 'other'); await fs.mkdir(other);
  await fs.writeFile(path.join(other, '.tgk.json'), JSON.stringify(s.metadata));
  s.vscode.workspace.workspaceFolders = [{ uri: s.vscode.Uri.file(other) }];
  await s.vscode.provider.refresh();
  assert.equal(s.states.at(-1).desk.entries.length, 0);
  await finish(s, fixtures.design); await pending;
  assert.equal(s.states.at(-1).root, other); assert.equal(s.states.at(-1).desk.entries.length, 0);
  assert.equal(s.vscode.provider.conversation(s.game)[0].reply.route, 'design');
});

test('malformed or failed child replies end busy state and keep the student message recoverable', async t => {
  const s = await setup(t);
  for (let i = 0; i < 2; i++) {
    const pending = send(s, `message ${i}`); await until(() => s.jobs.length === i + 1);
    s.jobs.at(-1).callback(i ? { code: 1 } : null, 'not JSON', 'private diagnostic'); await pending;
    assert.equal(s.states.at(-1).desk.busy, null); assert.ok(s.states.at(-1).desk.entries.at(-1).error);
    assert.ok(!s.states.at(-1).desk.entries.at(-1).error.includes('private diagnostic'));
  }
});
