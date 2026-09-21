const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const INPUT_LIMIT = 12000;
const ROUTES = ['plan', 'design', 'build', 'both', 'blocked'];
const string = value => typeof value === 'string' ? value : '';

function request(value) {
  const kind = value.kind === 'explain' ? 'explain' : 'ask';
  const text = string(value.text).trim();
  const to = value.to === undefined ? 'auto' : value.to;
  if (!['auto', 'design', 'build'].includes(to)) throw new Error('Choose Auto, Design or Build.');
  if (!text) throw new Error(kind === 'explain' ? 'Tell the desk what changed in one sentence.' : 'Tell the desk what you want to do.');
  if (text.length > INPUT_LIMIT) throw new Error('Keep your message under 12,000 characters.');
  if (text.includes('\0')) throw new Error('Your message contains a character the desk cannot read.');
  return { kind, text, to };
}

function parseReply(stdout, kind) {
  let value;
  try { value = JSON.parse(stdout.trim()); } catch { throw new Error('The desk returned an unreadable reply. Check your files and journey before trying again.'); }
  if (!value || typeof value.ok !== 'boolean' || (kind !== 'explain' && !ROUTES.includes(value.route)) ||
      (kind === 'explain' && typeof value.notice !== 'string')) {
    throw new Error('The desk reply was incomplete. Check your files and journey before trying again.');
  }
  if (['design', 'build', 'both'].includes(value.route) && (!Array.isArray(value.results) || !value.results.length ||
      value.results.some(r => !r || !['design', 'build'].includes(r.desk) || typeof r.ok !== 'boolean' || typeof r.text !== 'string'))) {
    throw new Error('The desk reply was incomplete. Check your files and journey before trying again.');
  }
  const notice = string(value.notice);
  const plan = [], lines = [];
  for (const line of notice.split(/\r?\n/)) {
    const match = value.route === 'plan' && line.match(/^\s*\[([xX ])\]\s+(.+)$/);
    if (match) plan.push({ done: match[1].toLowerCase() === 'x', label: match[2] });
    else lines.push(line);
  }
  return {
    ok: value.ok, route: value.route || null, reason: value.reason === 'awaiting_explain'
      ? 'Explain the last change before asking for another one.' : string(value.reason),
    step: string(value.step), notice: lines.join('\n'), next: string(value.next), plan,
    suggestion: value.route === 'plan' ? string(value.next).replace(/^Try:\s*/i, '') : '',
    results: Array.isArray(value.results) ? value.results.map(r => ({ desk: r.desk, tool: string(r.tool), ok: r.ok, text: r.text })) : [],
    files: Array.isArray(value.files) ? [...new Set(value.files.filter(f => typeof f === 'string' && f))] : [],
    awaiting_explain: value.awaiting_explain === true || value.reason === 'awaiting_explain',
  };
}

function run(cli, root, input, execute = execFile) {
  // The leading space keeps a message such as "--to" from being treated as a flag
  // by the kit's current parser. tgk trims it back off. No shell interprets text.
  const args = [cli, 'ask', ...(input.kind === 'explain' ? ['--explain', ` ${input.text}`] : [` ${input.text}`, '--to', input.to]), '--json'];
  return new Promise((resolve, reject) => {
    execute('node', args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(error.code === 'ENOENT' ? 'Node could not start. Install Node and reopen VS Code.'
          : 'The desk stopped before its reply arrived. Check your files and journey before trying again.'));
        return;
      }
      try { resolve(parseReply(stdout, input.kind)); } catch (failure) { reject(failure); }
    });
  });
}

function otherDesks(entry) {
  const route = entry.reply?.route;
  if (route === 'design') return ['build'];
  if (route === 'build') return ['design'];
  if (entry.to === 'design') return ['build'];
  if (entry.to === 'build') return ['design'];
  return ['design', 'build'];
}

async function changedFile(root, relative) {
  // Check both lexical paths and symlinks. Never let a reply open a different game
  // or a command/URL supplied in generated text.
  if (typeof relative !== 'string' || !relative || relative.includes('\0') ||
      path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || /(^|[\\/])\.\.([\\/]|$)/.test(relative) || relative.includes(':')) {
    throw new Error('That file is outside this game folder.');
  }
  const base = await fs.realpath(root);
  let file;
  try { file = await fs.realpath(path.resolve(root, relative)); }
  catch { throw new Error('That file is no longer available. It may have been moved or deleted.'); }
  const rel = path.relative(base, file);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('That file is outside this game folder.');
  if (!(await fs.stat(file)).isFile()) throw new Error('That path is not a file.');
  return file;
}

module.exports = { INPUT_LIMIT, request, parseReply, run, otherDesks, changedFile };
