const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');

// Keep these labels aligned with bin/tgk.mjs STEPS. No CLI execution needed to read progress.
const STEPS = {
  pong: [
    { id: 'scaffold', label: 'Scaffold' }, { id: 'paddle', label: 'Paddle moves' },
    { id: 'ball', label: 'Ball bounces' }, { id: 'publish', label: 'Publish to web' },
  ],
};
const COMMANDS = { run: ['run'], build: ['build', 'web'], publish: ['publish', 'web'], review: ['review'] };
const missing = error => error.code === 'ENOENT' || error.code === 'ENOTDIR';
function ancestors(start) {
  const dirs = [];
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    dirs.push(dir); if (path.dirname(dir) === dir) return dirs;
  }
}
async function findGame(folders) {
  for (const folder of folders) for (const dir of ancestors(folder)) {
    try { await fs.access(path.join(dir, '.tgk.json')); return dir; }
    catch (error) { if (!missing(error)) throw error; }
  }
  return null;
}
async function metadata(root) {
  const meta = JSON.parse(await fs.readFile(path.join(root, '.tgk.json'), 'utf8'));
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || typeof meta.name !== 'string' || typeof meta.template !== 'string') {
    throw new Error('.tgk.json needs a game name and template.');
  }
  return { name: meta.name, template: meta.template, student: String(meta.student ?? ''), week: String(meta.week ?? ''), steps: meta.steps || {}, awaiting_explain: meta.awaiting_explain === true };
}
async function images(root) {
  const result = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { if (missing(error)) return; throw error; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      // Do not follow symlinks outside the game or into recursive directories.
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /\.(png|jpe?g|svg|webp)$/i.test(entry.name)) {
        try {
          const stat = await fs.stat(file);
          result.push({ file, name: entry.name, relative: path.relative(root, file).split(path.sep).join('/'), mtime: stat.mtimeMs });
        } catch (error) { if (!missing(error)) throw error; }
      }
    }
  }
  for (const folder of ['design', 'assets']) {
    const dir = path.join(root, folder);
    try { if ((await fs.lstat(dir)).isDirectory()) await walk(dir); }
    catch (error) { if (!missing(error)) throw error; }
  }
  return result.sort((a, b) => b.mtime - a.mtime || a.relative.localeCompare(b.relative));
}
async function journey(root, now = Date.now()) {
  const file = path.join(root, 'journey/prompts.jsonl');
  let stat;
  try { stat = await fs.stat(file); }
  catch (error) { if (missing(error)) return { exists: false, status: 'missing', count: 0, recent: [] }; throw error; }
  const recent = []; let count = 0, skipped = 0;
  const input = createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { skipped++; continue; }
      if (!row || typeof row.prompt !== 'string') { skipped++; continue; }
      count++;
      const characters = Array.from(row.prompt.replace(/\s+/g, ' ').trim());
      recent.push({ at: String(row.at || ''), desk: String(row.desk || 'Unknown desk'), prompt: characters.slice(0, 80).join('') + (characters.length > 80 ? '…' : '') });
      if (recent.length > 8) recent.shift();
    }
  } finally { lines.close(); input.destroy(); }
  return { exists: true, status: now - stat.mtimeMs < 10 * 60 * 1000 ? 'saved' : 'idle', count, recent: recent.reverse(),
    warning: skipped ? `${skipped} incomplete or unreadable ${skipped === 1 ? 'line' : 'lines'} skipped.` : '' };
}
async function report(root) {
  try {
    const text = await fs.readFile(path.join(root, 'review/report.md'), 'utf8');
    const match = text.match(/\*\*\s*(\d+)\s+of\s+(\d+)\s+checks passed\.?\s*\*\*/i);
    return { exists: true, summary: match ? `${match[1]} of ${match[2]} checks passed` : 'Report available · summary not found' };
  } catch (error) { if (missing(error)) return { exists: false }; throw error; }
}
async function snapshot(root, now) {
  const state = { root, meta: null, steps: [], images: [], journey: { exists: false, status: 'missing', count: 0, recent: [] }, report: { exists: false }, error: '' };
  if (!root) return state;
  const results = await Promise.allSettled([metadata(root), images(root), journey(root, now), report(root)]);
  ['meta', 'images', 'journey', 'report'].forEach((key, i) => {
    if (results[i].status === 'fulfilled') state[key] = results[i].value;
    else state.error += `Could not read ${['.tgk.json', 'the design board', 'the prompt journey', 'the review report'][i]}. ${i === 0 ? 'Check the JSON and save it again. ' : ''}`;
  });
  const steps = Object.hasOwn(STEPS, state.meta?.template) ? STEPS[state.meta.template] : [];
  state.steps = steps.map(step => ({ ...step, done: Boolean(state.meta.steps[step.id]) }));
  return state;
}
async function resolveKit(gameRoot, configured = '', env = process.env) {
  const candidates = configured.trim() ? [path.resolve(gameRoot, configured.trim())]
    : [path.resolve(gameRoot, '../todak-game-kit'), ...(env.TGK_KIT ? [path.resolve(gameRoot, env.TGK_KIT)] : [])];
  for (const dir of candidates) {
    const cli = path.join(dir, 'bin/tgk.mjs');
    try { if ((await fs.stat(cli)).isFile()) return cli; }
    catch (error) { if (!missing(error)) throw error; }
  }
  throw new Error('Todak Game Kit not found. Set todak.kitPath to the folder containing bin/tgk.mjs.');
}
function validateName(name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) return 'Use 1–64 letters, numbers, hyphens or underscores; start with a letter or number.';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) return 'Choose a folder name that also works on Windows.';
  return undefined;
}

module.exports = { STEPS, COMMANDS, ancestors, findGame, metadata, images, journey, report, snapshot, resolveKit, validateName };
