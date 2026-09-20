/* global acquireVsCodeApi */
(() => {
  const vscode = acquireVsCodeApi();
  const byId = id => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const show = (id, visible) => { byId(id).hidden = !visible; };
  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const previous = new Map();
  function updateList(id, values, create) {
    const signature = JSON.stringify(values);
    if (previous.get(id) === signature) return;
    previous.set(id, signature);
    const focused = document.activeElement?.dataset.focus;
    byId(id).replaceChildren(...values.map(create));
    if (focused) {
      const target = [...byId(id).querySelectorAll('[data-focus]')].find(el => el.dataset.focus === focused);
      if (target) target.focus({ preventScroll: true });
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.command) vscode.postMessage({ type: 'command', command: button.dataset.command });
    if (button.dataset.image) vscode.postMessage({ type: 'image', path: button.dataset.image });
  });
  window.addEventListener('message', ({ data }) => {
    if (data.type === 'activity') {
      text('activity', data.text); show('activity', Boolean(data.text)); return;
    }
    if (data.type !== 'state') return;
    const s = data.state;
    show('welcome', !s.root); show('game', Boolean(s.root));
    show('error', Boolean(s.error)); text('error', s.error || '');
    show('trust', !s.trusted);
    text('game-name', s.meta?.name || (s.root ? 'Game details unavailable' : 'Open a game folder'));
    text('week', s.meta ? `Week ${s.meta.week ?? '—'} · ${s.meta.template || 'Game'}` : 'Your game');
    text('student', s.meta ? `Student · ${s.meta.student || 'Not set'}` : 'Your steps, artwork and journey, together.');
    for (const cmd of ['run', 'build', 'publish', 'review']) byId(cmd).disabled = !s.trusted || !s.meta;
    byId('new').disabled = !s.trusted;
    if (!s.root) return;
    text('progress', `${s.steps.filter(step => step.done).length} / ${s.steps.length}`);
    updateList('steps', s.steps, step => {
      const item = node('li', step.done ? 'done' : '');
      const mark = node('span', 'step-mark'); mark.setAttribute('aria-hidden', 'true');
      if (step.done) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'm3 8 3 3 7-7'); path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '2');
        svg.append(path); mark.append(svg);
      }
      item.append(mark, node('span', '', step.label), node('span', 'sr-only', step.done ? 'Completed' : 'Not completed'));
      return item;
    });
    if (!s.steps.length) byId('steps').replaceChildren(node('li', 'muted', 'No steps listed for this template.'));
    text('art-count', `${s.images.length} ${s.images.length === 1 ? 'image' : 'images'}`);
    show('no-art', !s.images.length);
    updateList('gallery', s.images, art => {
      const button = node('button', 'art'); button.type = 'button';
      button.dataset.image = art.relative; button.dataset.focus = art.relative;
      button.title = art.relative; button.setAttribute('aria-label', `Open ${art.relative}`);
      const frame = node('span', 'art-image'); const img = node('img');
      img.src = art.url; img.alt = ''; img.loading = 'lazy';
      frame.append(img); button.append(frame, node('span', 'art-name', art.name)); return button;
    });
    const j = s.journey;
    text('prompt-count', `${j.count} ${j.count === 1 ? 'prompt' : 'prompts'}`);
    text('recording', { saved: 'recording · saved', idle: 'recording · idle', missing: 'no record' }[j.status]);
    byId('recording').className = `recording ${j.status}`;
    text('journey-warning', j.warning || ''); show('journey-warning', Boolean(j.warning));
    show('no-prompts', !j.recent.length); byId('openJourney').disabled = !j.exists;
    updateList('journey', j.recent, row => {
      const item = node('li'); const meta = node('div', 'prompt-meta');
      const time = node('time'); const date = new Date(row.at);
      time.textContent = Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      if (!Number.isNaN(date.getTime())) { time.dateTime = date.toISOString(); time.title = date.toLocaleString(); }
      meta.append(node('span', 'desk', row.desk), time);
      item.append(meta, node('p', 'prompt', row.prompt)); return item;
    });
    show('report-section', s.report.exists);
    text('report-summary', s.report.summary || 'Report available');
  });
  vscode.postMessage({ type: 'ready' });
})();
