const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const model = require('./model');
const { html } = require('./view');

class TodakSidebar {
  constructor(context) {
    this.context = context;
    this.root = null;
    this.images = new Map();
    this.discoveryWatchers = [];
    this.gameWatchers = [];
    this.revision = 0;
    this.disposed = false;
    this.resetDiscovery();
    this.timer = setInterval(() => this.refresh(), 30000); // Saved becomes idle without a file edit.
  }
  folders() {
    return (vscode.workspace.workspaceFolders || []).filter(f => f.uri.scheme === 'file').map(f => f.uri.fsPath);
  }
  watch(base, pattern, group) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, pattern));
    group.push(watcher, watcher.onDidCreate(() => this.schedule()), watcher.onDidChange(() => this.schedule()), watcher.onDidDelete(() => this.schedule()));
  }
  resetDiscovery() {
    this.discoveryWatchers.splice(0).forEach(d => d.dispose());
    const dirs = new Set(this.folders().flatMap(model.ancestors));
    for (const dir of dirs) this.watch(dir, '.tgk.json', this.discoveryWatchers);
    this.schedule();
  }
  setRoot(root) {
    if (root === this.root) return;
    this.gameWatchers.splice(0).forEach(d => d.dispose());
    this.root = root;
    if (root) for (const pattern of ['design/**', 'assets/**', 'journey/**', 'review/**']) this.watch(root, pattern, this.gameWatchers);
    this.setResources();
  }
  setResources() {
    if (!this.view) return;
    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ...(this.root ? ['design', 'assets'].map(dir => vscode.Uri.file(path.join(this.root, dir))) : [])],
    };
  }
  schedule() {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.refresh(), 120);
  }
  async refresh() {
    if (this.disposed) return;
    const revision = ++this.revision;
    try {
      const root = await model.findGame(this.folders());
      const state = await model.snapshot(root);
      if (this.disposed || revision !== this.revision) return;
      this.setRoot(root);
      this.images = new Map(state.images.map(art => [art.relative, art.file]));
      state.trusted = vscode.workspace.isTrusted;
      if (this.view) {
        state.images = state.images.map(art => ({ name: art.name, relative: art.relative,
          url: this.view.webview.asWebviewUri(vscode.Uri.file(art.file)).with({ query: `v=${art.mtime}` }).toString() }));
        await this.view.webview.postMessage({ type: 'state', state });
      }
    } catch {
      if (this.disposed || revision !== this.revision) return;
      this.setRoot(null);
      await this.view?.webview.postMessage({ type: 'state', state: { ...await model.snapshot(null), trusted: vscode.workspace.isTrusted,
        error: 'Could not read the game folder. Check its file permissions and reopen it.' } });
    }
  }
  resolveWebviewView(view) {
    this.view = view;
    this.setResources();
    const media = name => view.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name)).toString();
    view.webview.html = html({ source: view.webview.cspSource, css: media('sidebar.css'), script: media('sidebar.js') });
    const receiver = view.webview.onDidReceiveMessage(message => this.handleMessage(message));
    const visibility = view.onDidChangeVisibility(() => { if (view.visible) this.refresh(); });
    view.onDidDispose(() => {
      receiver.dispose(); visibility.dispose();
      if (this.view === view) this.view = undefined;
    });
    this.refresh();
  }
  async handleMessage(message) {
    try {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ready') await this.refresh();
      else if (message.type === 'command' && ['run', 'build', 'publish', 'review', 'new', 'openJourney', 'openReport'].includes(message.command)) {
        await vscode.commands.executeCommand(`todak.${message.command}`);
      } else if (message.type === 'image' && typeof message.path === 'string' && this.images.has(message.path)) {
        // Re-list before opening: reject deleted / replaced / symlinked gallery entries.
        const art = (await model.images(this.root)).find(item => item.relative === message.path);
        if (art) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(art.file));
      }
    } catch (error) { this.error(error); }
  }
  error(error) { vscode.window.showErrorMessage(`Todak: ${error.message || 'The action could not finish.'}`); }
  requireTrust() {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before running kit commands.');
  }
  async game() {
    const root = await model.findGame(this.folders());
    if (!root) throw new Error('Open a game folder first, or use Todak: New Pong Game.');
    return root;
  }
  async kit(root) {
    // A workspace opened below the game still owns its resource-scoped setting.
    const scope = this.folders().find(folder => model.ancestors(folder).includes(root)) || root;
    const setting = vscode.workspace.getConfiguration('todak', vscode.Uri.file(scope)).get('kitPath', '');
    return model.resolveKit(root, setting);
  }
  terminal(root, cli, args) {
    // Node is the terminal process. Arguments never pass through a shell, including on Windows.
    // Each invocation owns its terminal so a command cannot be typed into a running game.
    const terminal = vscode.window.createTerminal({ name: 'Todak', cwd: root, shellPath: 'node', shellArgs: [cli, ...args] });
    terminal.show();
    this.view?.webview.postMessage({ type: 'activity', text: `${args[0][0].toUpperCase() + args[0].slice(1)} started in the Todak terminal.` });
    return terminal;
  }
  async run(command) {
    this.requireTrust();
    const root = await this.game();
    await model.metadata(root);
    const cli = await this.kit(root);
    this.terminal(root, cli, model.COMMANDS[command]);
  }
  async newGame() {
    this.requireTrust();
    const name = await vscode.window.showInputBox({ title: 'Create a Pong game', prompt: 'Name the new game folder', value: 'my-pong', validateInput: model.validateName });
    if (name === undefined) return;
    const invalid = model.validateName(name); if (invalid) throw new Error(invalid);
    const selected = await vscode.window.showOpenDialog({ title: 'Choose where to create the game folder', canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Create game here',
      defaultUri: this.folders()[0] ? vscode.Uri.file(this.folders()[0]) : undefined });
    if (!selected?.length) return;
    const parent = selected[0].fsPath, destination = path.join(parent, name);
    try { await fs.access(destination); throw new Error('That folder already exists. Choose a different game name.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const cli = await this.kit(destination);
    this.terminal(parent, cli, ['new', 'pong', name]);
    const action = await vscode.window.showInformationMessage('The new game is being created in the Todak terminal.', 'Open game folder');
    if (action === 'Open game folder') {
      try { await fs.access(path.join(destination, '.tgk.json')); }
      catch { throw new Error('The game is not ready yet. Check the Todak terminal, then open the created folder.'); }
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(destination));
    }
  }
  async openFile(relative) {
    const root = await this.game(), file = path.join(root, relative);
    try { await fs.access(file); }
    catch { throw new Error(relative === 'journey/prompts.jsonl' ? 'No prompts recorded yet.' : 'Run Review to create a report.'); }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(file)), { preview: false });
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer); clearTimeout(this.debounce);
    [...this.discoveryWatchers, ...this.gameWatchers].forEach(d => d.dispose());
  }
}

function activate(context) {
  const sidebar = new TodakSidebar(context);
  context.subscriptions.push(sidebar, vscode.window.registerWebviewViewProvider('todak.sidebar', sidebar),
    vscode.workspace.onDidChangeWorkspaceFolders(() => sidebar.resetDiscovery()),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('todak')) sidebar.schedule(); }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => sidebar.schedule()));
  const commands = {
    ...Object.fromEntries(Object.keys(model.COMMANDS).map(cmd => [cmd, () => sidebar.run(cmd)])),
    new: () => sidebar.newGame(), openJourney: () => sidebar.openFile('journey/prompts.jsonl'), openReport: () => sidebar.openFile('review/report.md'),
  };
  for (const [name, action] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(`todak.${name}`, async () => {
    try { await action(); } catch (error) { sidebar.error(error); }
  }));
}

module.exports = { activate, TodakSidebar };
