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
  vm.runInNewContext(await fs.readFile(extensionPath, 'utf8'), { require: name => name === 'vscode' ? vscode : localRequire(name), module: mod, setInterval, clearInterval, setTimeout, clearTimeout }, { filename: extensionPath });
  const context = { subscriptions: [], extensionUri: Uri.file(path.resolve(__dirname, '..')) };
  mod.exports.activate(context);
  const states = [], received = signal(), visibility = signal(), disposed = signal();
  const view = { visible: true, onDidDispose: disposed.event, onDidChangeVisibility: visibility.event, webview: {
    cspSource: 'vscode-webview:', asWebviewUri: uri => ({ with: ({ query }) => ({ toString: () => uri.toString() + '?' + query }), toString: uri.toString }),
    onDidReceiveMessage: received.event, postMessage: async message => { if (message.type === 'state') states.push(message.state); return true; },
  } };
  vscode.provider.resolveWebviewView(view);
  await vscode.provider.refresh();
  t.after(async () => { await disposed.fire(); context.subscriptions.forEach(d => d.dispose()); await fs.rm(root, { recursive: true, force: true }); });
  return { root, game, metadata, vscode, commands, terminals, errors, opened, watchers, states, received, view, folderChanged };
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
