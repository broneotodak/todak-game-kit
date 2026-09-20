// Optional visual check using an already-installed Playwright + Chromium. No downloads.
// node test/browser-smoke.cjs /path/to/playwright /path/to/chrome /tmp/todak-preview
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { html } = require('../view');

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
    assert.deepEqual(errors, []);
    console.log(`Browser smoke passed: 260/320/400 px, light/dark/high contrast, keyboard, focus, empty/trust states, safe text. Screenshots: ${output}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
