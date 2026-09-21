// Optional visual check using an already-installed Playwright + Chromium. No downloads.
// node test/browser-smoke.cjs /path/to/playwright /path/to/chrome /tmp/todak-preview
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { html } = require('../view');
const { parseReply } = require('../desk');
const fixtures = require('./desk-fixtures');

async function main() {
  const { chromium } = require(process.argv[2] || 'playwright');
  const output = process.argv[4] || await fs.mkdtemp(path.join(os.tmpdir(), 'todak-preview-'));
  await fs.mkdir(output, { recursive: true });
  const kit = path.resolve(__dirname, '../../..');
  const state = {
    root: '/example/my-pong', trusted: true, meta: { name: 'My Pong', student: 'demo', week: 3, template: 'pong' },
    steps: [{ label: 'Scaffold', done: true }, { label: 'Paddle moves', done: true }, { label: 'Ball bounces', done: false }, { label: 'Publish to web', done: false }],
    images: ['title.png', 'paddle.png', 'ball.png', 'icon.svg'].map(name => ({ name, relative: `assets/${name}`, url: pathToFileURL(path.join(kit, 'templates/pong/assets', name)).href })),
    journey: { exists: true, status: 'saved', count: 12, recent: [
      { at: '2026-09-20T09:42:00Z', desk: 'codex', prompt: 'Give the court a pixel-art feel. Keep room for the title.' },
      { at: '2026-09-20T09:39:00Z', desk: 'claude', prompt: 'Make my paddle move with W and S. Explain the speed setting.' },
    ] },
    report: { exists: true, summary: '5 of 7 checks passed' },
  };
  const mock = `window.sent=[]; window.acquireVsCodeApi=()=>({postMessage:message=>{window.sent.push(message); if(message.type==='ready') setTimeout(()=>window.postMessage(${JSON.stringify({ type: 'state', state })}, '*'),0);}});\n`;
  const js = path.join(output, 'preview.js');
  await fs.writeFile(js, mock + await fs.readFile(path.join(__dirname, '../media/sidebar.js'), 'utf8'));
  const pageFile = path.join(output, 'index.html');
  await fs.writeFile(pageFile, html({ source: 'file:', css: pathToFileURL(path.join(__dirname, '../media/sidebar.css')).href, script: pathToFileURL(js).href }));
  const browser = await chromium.launch({ executablePath: process.argv[3] || undefined, headless: true,
    args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 1280 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(pageFile).href);
    await page.waitForFunction(() => document.querySelector('#game-name').textContent === 'My Pong');
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth));
    assert.equal(await page.locator('.art').count(), 4);
    for (const button of await page.locator('button:visible').all()) assert.ok((await button.boundingBox()).height >= 44);
    await page.locator('#run').focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.sent.at(-1)), { type: 'command', command: 'run' });
    await page.locator('.art').first().focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.sent.at(-1)), { type: 'image', path: 'assets/title.png' });
    // Refreshing a changed gallery preserves keyboard focus.
    await page.evaluate(s => window.postMessage({ type: 'state', state: s }, '*'), { ...state, images: state.images.map(art => ({ ...art, url: art.url + '?v=2' })) });
    await page.waitForFunction(() => document.images[0].src.includes('v=2'));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.image), 'assets/title.png');
    await page.locator('#game-name').click();
    await page.screenshot({ path: path.join(output, 'sidebar-dark.png'), fullPage: true });
    // Theme variables as supplied by VS Code; same DOM and CSS in each theme.
    await page.evaluate(() => {
      document.body.classList.add('vscode-light');
      for (const [name, value] of Object.entries({ 'sideBar-background': '#f3f3f3', foreground: '#333333', descriptionForeground: '#616161', 'widget-border': '#cecece', 'editor-background': '#ffffff', 'textLink-foreground': '#005fb8', 'testing-iconPassed': '#267f32', 'editorWarning-foreground': '#895503', 'button-background': '#005fb8', 'button-hoverBackground': '#005a9e', 'button-foreground': '#ffffff', 'button-secondaryBackground': '#e5e5e5', 'button-secondaryHoverBackground': '#cccccc', 'button-secondaryForeground': '#333333', focusBorder: '#0090f1' })) document.documentElement.style.setProperty(`--vscode-${name}`, value);
    });
    await page.setViewportSize({ width: 260, height: 1280 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 260);
    await page.screenshot({ path: path.join(output, 'sidebar-light.png'), fullPage: true });
    // Missing game, untrusted mode and hostile file text.
    const hostile = '<img src=x onerror="window.compromised=true">';
    await page.evaluate(s => window.postMessage({ type: 'state', state: s }, '*'), { ...state, meta: { ...state.meta, name: hostile }, trusted: false, journey: { exists: false, status: 'missing', count: 0, recent: [] }, report: { exists: false } });
    await page.waitForFunction(() => document.querySelector('#run').disabled);
    assert.equal(await page.locator('#game-name').innerText(), hostile);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    assert.equal(await page.locator('#openJourney').isDisabled(), true);
    await page.evaluate(() => window.postMessage({ type: 'state', state: { root: null, trusted: true } }, '*'));
    await page.waitForFunction(() => !document.querySelector('#welcome').hidden);
    await page.locator('#new').focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.sent.at(-1)), { type: 'command', command: 'new' });
    await page.screenshot({ path: path.join(output, 'sidebar-empty.png'), fullPage: true });
    await page.setViewportSize({ width: 400, height: 800 });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.evaluate(s => window.postMessage({ type: 'state', state: s }, '*'), state);
    await page.waitForFunction(() => !document.querySelector('#game').hidden);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 400);
    await page.locator('#openReport').focus();
    const reportButton = await page.locator('#openReport').boundingBox();
    const footer = await page.locator('footer').boundingBox();
    assert.ok(reportButton.y + reportButton.height <= footer.y, 'last button scrolls clear of permanent footer');
    await page.screenshot({ path: path.join(output, 'sidebar-contrast.png'), fullPage: true });
    // Desk: exercise the real DOM at all supported widths, with the bridge and
    // synchronous router responses mocked. No CLI or AI process runs here.
    await page.emulateMedia({ forcedColors: 'none' });
    let serial = 0;
    const entry = (shape, text = 'Make the left paddle move with W and S.', kind = 'ask', to = 'auto') => ({
      id: `sample-${++serial}`, kind, to, text, pending: false, reply: parseReply(JSON.stringify(shape), kind),
    });
    const pushDesk = async (entries = [], awaitingExplain = false, extras = {}) => {
      await page.evaluate(s => new Promise(resolve => {
        window.postMessage({ type: 'state', state: s }, '*'); setTimeout(resolve, 0);
      }), { ...state, ...extras, desk: { entries, awaitingExplain, busy: null, ...extras.desk } });
    };
    const latest = () => page.evaluate(() => window.sent.at(-1));
    await pushDesk();
    assert.equal(await page.locator('#desk-to').inputValue(), 'auto');
    assert.equal(await page.locator('#desk-send').isDisabled(), true);
    await page.locator('#desk-input').fill('Draw a paddle');
    await page.locator('#desk-input').press('Shift+Enter');
    await page.locator('#desk-input').press('A');
    assert.equal(await page.locator('#desk-input').inputValue(), 'Draw a paddle\nA');
    await page.locator('#desk-to').selectOption('design');
    await page.locator('#desk-input').press('Enter');
    assert.deepEqual(await latest(), { type: 'deskSend', root: state.root, kind: 'ask', text: 'Draw a paddle\nA', to: 'design' });
    assert.equal(await page.locator('#desk-input').isDisabled(), true);
    const design = entry(fixtures.design, 'Draw a paddle\nA', 'ask', 'design');
    await pushDesk([{ ...design, reply: undefined, pending: true }], false, { desk: { busy: { root: state.root, to: 'design', kind: 'ask' } } });
    assert.match(await page.locator('#desk-working').innerText(), /Design desk · Astra/);
    assert.equal(await page.locator('#desk-input').inputValue(), '');
    assert.equal(await page.locator('#desk-clear').isDisabled(), true);
    await pushDesk([design]);
    assert.match(await page.locator('.route-badge').innerText(), /Design desk · Astra/);
    await page.locator('.file-chip').click();
    assert.deepEqual(await latest(), { type: 'deskFile', root: state.root, id: design.id, path: 'assets/paddle.png' });
    await page.locator('.override').click();
    assert.deepEqual(await latest(), { type: 'deskOverride', root: state.root, id: design.id, to: 'build' });
    const build = entry(fixtures.build);
    await pushDesk([design, build], true);
    assert.equal(await page.locator('#desk-input').isDisabled(), true);
    assert.equal(await page.locator('#desk-form').isHidden(), true);
    assert.equal(await page.locator('#explain-form').isVisible(), true);
    assert.equal(await page.locator('.override').last().isDisabled(), true);
    assert.equal(await page.locator('pre code').innerText(), 'velocity.y = direction * speed');
    await page.locator('#explain-input').fill('W and S now move the paddle.');
    await page.locator('#explain-input').press('Enter');
    assert.equal((await latest()).kind, 'explain');
    const explained = entry(fixtures.explain, 'W and S now move the paddle.', 'explain');
    await pushDesk([design, build, explained]);
    assert.equal(await page.locator('#desk-input').isDisabled(), false);
    assert.equal(await page.locator('.system-line').last().innerText(), 'Thanks. Next step unlocked.');
    assert.equal(await page.locator('#explain-input').inputValue(), '');
    // Refreshing journey data must preserve a draft, routing choice and focus.
    await page.locator('#desk-input').fill('Keep this draft'); await page.locator('#desk-input').focus();
    await pushDesk([design, build, explained]);
    assert.equal(await page.locator('#desk-input').inputValue(), 'Keep this draft');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'desk-input');
    const plan = entry(fixtures.plan, 'Build me the whole game.');
    await pushDesk([plan]);
    assert.equal(await page.locator('.plan-steps li').count(), 4);
    assert.equal(await page.locator('.plan-steps .done').count(), 1);
    await page.locator('.suggestion-chip').click();
    assert.equal(await page.locator('#desk-input').inputValue(), 'make the left paddle move with W and S');
    // Plan/both/blocked replies have no single opposite; the same link offers
    // explicit Design and Build choices instead of inventing a router decision.
    await page.locator('.override').click();
    assert.equal(await page.locator('.override-choices').isVisible(), true);
    await page.locator('[data-override="design"]').click();
    assert.deepEqual(await latest(), { type: 'deskOverride', root: state.root, id: plan.id, to: 'design' });
    await pushDesk([entry(fixtures.blocked)], true);
    assert.equal(await page.locator('.route-badge').innerText(), 'Blocked');
    assert.ok(!(await page.locator('.route-reason').innerText()).includes('awaiting_explain'));
    const both = entry(fixtures.both, 'Draw a paddle and make it move.');
    await pushDesk([both], true);
    assert.equal(await page.locator('.route-badge').count(), 2);
    assert.equal(await page.locator('.result-body').count(), 2);
    const failed = entry(fixtures.failed, 'Make a title screen.');
    await pushDesk([failed]);
    assert.match(await page.locator('.result-body .error').innerText(), /could not finish/);
    // Auto route cannot be known until the synchronous router completes.
    await pushDesk([design], false, { desk: { busy: { root: state.root, to: 'auto', kind: 'ask' } } });
    assert.match(await page.locator('#desk-working').innerText(), /choosing Design or Build/);
    const hostileReply = entry({ ...fixtures.design, reason: hostile, results: [{ ...fixtures.design.results[0], text: hostile + '\n\n```html\n' + hostile + '\n```' }], files: ['<script>alert(1)</script>.gd'] }, hostile);
    await pushDesk([hostileReply]);
    assert.equal(await page.locator('.student-message .prompt').innerText(), hostile);
    assert.equal(await page.locator('.reply-code code').innerText(), hostile);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    assert.equal(await page.locator('#desk-messages img, #desk-messages script').count(), 0);
    // Persisted conversation is restored by the host after a webview reload.
    await page.reload(); await page.waitForFunction(() => document.querySelector('#game-name').textContent === 'My Pong');
    await pushDesk([design, build, explained]);
    assert.equal(await page.locator('.exchange').count(), 3);
    await page.locator('#desk-clear').click();
    assert.deepEqual(await latest(), { type: 'deskClear', root: state.root });
    await pushDesk([], true);
    assert.equal(await page.locator('.exchange').count(), 0);
    assert.equal(await page.locator('#explain-form').isVisible(), true, 'Clear does not unlock explain-back');
    await pushDesk([], false, { trusted: false });
    assert.equal(await page.locator('#desk-input').isDisabled(), true);
    assert.match(await page.locator('#desk-lock').innerText(), /Trust this workspace/);
    await pushDesk([], false, { root: null, meta: null });
    assert.equal(await page.locator('#desk-input').isDisabled(), true);
    assert.match(await page.locator('#desk-lock').innerText(), /Open a game folder/);
    await pushDesk([], false, { meta: null });
    assert.equal(await page.locator('#desk-input').isDisabled(), true);
    // Keep the permanent footer clear and all touch targets >=44 px at each width.
    for (const width of [260, 320, 400]) {
      await page.setViewportSize({ width, height: 1100 });
      await pushDesk([build], true);
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#desk-messages').scrollTop = 0; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      for (const control of await page.locator('button:visible, select:visible').all()) {
        assert.ok((await control.boundingBox()).height >= 44, `${width}px: every control has a 44px target`);
      }
      await page.screenshot({ path: path.join(output, `desk-dark-${width}.png`), fullPage: false });
      // Both desks, a plan and long file/code lines fit in the bounded message list.
      await pushDesk([plan, both, explained, hostileReply]);
      const bounds = await page.locator('#desk-messages').boundingBox(); assert.ok(bounds.height <= 421);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.locator('#game-name').click();
      await page.locator('#openReport').focus();
      const last = await page.locator('#openReport').boundingBox(), bottom = await page.locator('footer').boundingBox();
      assert.ok(last.y + last.height <= bottom.y);
    }
    await page.setViewportSize({ width: 320, height: 1100 });
    await page.evaluate(() => {
      document.body.classList.add('vscode-light');
      for (const [name, value] of Object.entries({ 'sideBar-background': '#f3f3f3', foreground: '#333333', descriptionForeground: '#616161', 'widget-border': '#cecece', 'editor-background': '#ffffff', 'textLink-foreground': '#005fb8', 'testing-iconPassed': '#267f32', 'editorWarning-foreground': '#895503', 'button-background': '#005fb8', 'button-hoverBackground': '#005a9e', 'button-foreground': '#ffffff', 'button-secondaryBackground': '#e5e5e5', 'button-secondaryForeground': '#333333' })) document.documentElement.style.setProperty(`--vscode-${name}`, value);
    });
    await pushDesk([plan]);
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#desk-messages').scrollTop = 0; });
    await page.screenshot({ path: path.join(output, 'desk-light-plan.png'), fullPage: false });
    await pushDesk([both], true);
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#desk-messages').scrollTop = 0; });
    await page.screenshot({ path: path.join(output, 'desk-light-both.png'), fullPage: false });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.locator('#explain-input').focus();
    assert.notEqual(await page.locator('#explain-input').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.screenshot({ path: path.join(output, 'desk-contrast.png'), fullPage: false });
    assert.deepEqual(errors, []);
    console.log(`Browser smoke passed: 260/320/400 px, light/dark/high contrast, keyboard, focus, empty/trust states, safe text, all Desk routes, explain-back, overrides, files, Clear/reload, draft retention and busy states. Screenshots: ${output}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
