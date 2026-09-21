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
  let state = { root: null, trusted: false };
  let submitting = false;
  let submitted = null;
  let conversationRoot;
  const deskNames = { design: 'Design desk · Astra', build: 'Build desk · Claude Code', plan: 'Plan', blocked: 'Blocked' };
  const badge = route => node('span', `route-badge route-${route}`, deskNames[route]);
  function paragraphs(parent, value) {
    // Only paragraphs and fenced code. Generated HTML, Markdown links and script
    // tags stay literal text; there is no HTML or Markdown interpreter here.
    let prose = [], code = null;
    const flush = () => {
      const content = prose.join('\n');
      for (const paragraph of content.split(/\n\s*\n/)) if (paragraph.trim()) parent.append(node('p', 'reply-text', paragraph));
      prose = [];
    };
    const appendCode = () => {
      const pre = node('pre', 'reply-code'); pre.tabIndex = 0;
      pre.setAttribute('aria-label', 'Code from the desk');
      pre.append(node('code', '', code.join('\n'))); parent.append(pre); code = null;
    };
    for (const line of String(value || '').split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        if (code === null) { flush(); code = []; } else appendCode();
      } else if (code === null) prose.push(line); else code.push(line);
    }
    if (code !== null) appendCode();
    flush();
  }
  function otherDesks(entry) {
    if (entry.reply?.route === 'design') return ['build'];
    if (entry.reply?.route === 'build') return ['design'];
    if (entry.to === 'design') return ['build'];
    if (entry.to === 'build') return ['design'];
    return ['design', 'build'];
  }
  function exchange(entry) {
    const item = node('li', 'exchange');
    const student = node('div', 'student-message');
    student.append(node('span', 'speaker', entry.kind === 'explain' ? 'You explained' : 'You'), node('p', 'prompt', entry.text));
    item.append(student);
    if (entry.pending) return item;
    const reply = node('div', 'desk-reply');
    if (entry.error) reply.append(node('p', 'system-line error', entry.error));
    const r = entry.reply;
    if (entry.kind === 'explain') {
      if (r) reply.append(node('p', `system-line ${r.ok ? '' : 'error'}`, r.notice));
      item.append(reply); return item;
    }
    if (r) {
      const badges = node('div', 'route-badges');
      if (r.route === 'both') {
        badges.setAttribute('aria-label', 'Both desks'); badges.append(badge('design'), badge('build'));
      } else badges.append(badge(r.route));
      reply.append(badges, node('p', 'route-reason', r.reason));
      for (const result of r.results || []) {
        const body = node('div', 'result-body');
        if (r.route === 'both') body.append(node('p', 'speaker', result.desk === 'design' ? 'From the design desk' : 'From the build desk'));
        if (!result.ok) body.append(node('p', 'error', 'This desk could not finish.'));
        paragraphs(body, result.text); reply.append(body);
      }
      if (!(r.results || []).length) paragraphs(reply, r.notice);
      if (r.plan?.length) {
        const plan = node('ul', 'plan-steps');
        for (const step of r.plan) {
          const li = node('li', step.done ? 'done' : '');
          const mark = node('span', 'plan-mark', step.done ? '✓' : '○'); mark.setAttribute('aria-hidden', 'true');
          li.append(mark, node('span', '', step.label), node('span', 'sr-only', step.done ? 'Completed' : 'Not completed')); plan.append(li);
        }
        reply.append(plan);
      }
      if (r.suggestion) {
        const suggestion = node('button', 'suggestion-chip', r.suggestion);
        suggestion.type = 'button'; suggestion.dataset.suggestion = r.suggestion; suggestion.dataset.focus = `suggestion:${entry.id}`;
        suggestion.setAttribute('aria-label', `Use this prompt: ${r.suggestion}`); reply.append(suggestion);
      }
      if (r.files?.length) {
        const files = node('div', 'file-chips');
        files.setAttribute('aria-label', 'Changed files');
        for (const file of r.files) {
          const chip = node('button', 'file-chip', file); chip.type = 'button';
          chip.dataset.file = file; chip.dataset.entry = entry.id; chip.dataset.focus = `file:${entry.id}:${file}`;
          chip.setAttribute('aria-label', `Open changed file ${file}`); files.append(chip);
        }
        reply.append(files);
      }
    }
    const targets = otherDesks(entry);
    const override = node('button', 'text-button override', 'Send to the other desk instead');
    override.type = 'button'; override.dataset.entry = entry.id; override.dataset.focus = `override:${entry.id}`;
    if (targets.length === 1) {
      override.dataset.override = targets[0]; override.setAttribute('aria-label', `Send to the other desk instead: ${deskNames[targets[0]]}`);
    } else {
      override.dataset.chooseDesk = entry.id; override.setAttribute('aria-expanded', 'false');
      const choices = node('div', 'override-choices'); choices.id = `choices-${entry.id}`; choices.hidden = true;
      override.setAttribute('aria-controls', choices.id);
      for (const to of targets) {
        const choice = node('button', 'text-button', to === 'design' ? 'Design desk' : 'Build desk');
        choice.type = 'button'; choice.dataset.override = to; choice.dataset.entry = entry.id;
        choice.dataset.focus = `override:${entry.id}:${to}`; choices.append(choice);
      }
      reply.append(override, choices); item.append(reply); return item;
    }
    reply.append(override); item.append(reply); return item;
  }
  function controls() {
    const d = state.desk || {}, working = Boolean(d.busy) || submitting;
    const unavailable = !state.root ? 'Open a game folder to use the desk.' : !state.trusted ? 'Trust this workspace to use the desk.'
      : !state.meta ? 'The game details could not be read. Check the message above.' : '';
    const waiting = Boolean(d.awaitingExplain);
    const disabled = Boolean(unavailable) || working;
    show('desk-form', !waiting); show('explain-form', waiting);
    byId('desk-input').disabled = disabled || waiting;
    byId('desk-to').disabled = disabled || waiting;
    byId('desk-send').disabled = disabled || waiting || !byId('desk-input').value.trim();
    byId('explain-input').disabled = disabled || !waiting;
    byId('explain-send').disabled = disabled || !waiting || !byId('explain-input').value.trim();
    byId('desk-clear').disabled = working || !(d.entries || []).length;
    const notice = unavailable || (waiting ? 'Explain the last change to unlock your next request.' : '');
    text('desk-lock', notice); show('desk-lock', Boolean(notice));
    for (const button of byId('desk-messages').querySelectorAll('[data-override], [data-choose-desk], [data-suggestion]')) {
      button.disabled = disabled || waiting;
      button.title = notice || (working ? 'Wait for the current reply.' : '');
    }
    const busy = d.busy;
    const status = busy?.root && busy.root !== state.root ? 'A desk is working in your previous game. Wait for its reply.'
      : busy?.kind === 'explain' ? 'Saving your explanation…'
      : busy?.to === 'design' ? 'Design desk · Astra is working…'
      : busy?.to === 'build' ? 'Build desk · Claude Code is working…'
      : 'Todak desk is choosing Design or Build and working on your request…';
    text('desk-working', status); show('desk-working', working);
    byId('desk-section').setAttribute('aria-busy', String(working));
  }
  function renderDesk(s) {
    const d = s.desk || {}, entries = d.entries || [];
    if (conversationRoot !== s.root) {
      byId('desk-input').value = ''; byId('explain-input').value = ''; submitted = null;
      byId('desk-to').value = 'auto'; conversationRoot = s.root;
    }
    if (submitted && entries.some(entry => !submitted.ids.includes(entry.id) && entry.kind === submitted.kind && entry.text === submitted.text)) {
      byId(submitted.kind === 'explain' ? 'explain-input' : 'desk-input').value = ''; submitted = null;
    }
    const wasWorking = Boolean(state.desk?.busy) || submitting;
    const wasWaiting = Boolean(state.desk?.awaitingExplain);
    state = s; submitting = false;
    const log = byId('desk-messages');
    const atBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 32;
    const changed = previous.get('desk-messages') !== JSON.stringify(entries);
    const oldScroll = log.scrollTop;
    updateList('desk-messages', entries, exchange);
    show('desk-empty', !entries.length); show('desk-messages', Boolean(entries.length));
    if (changed) log.scrollTop = atBottom ? log.scrollHeight : oldScroll;
    text('desk-error', d.error || ''); show('desk-error', Boolean(d.error));
    controls();
    // Do not steal focus from a file, reply, chooser, or another part of the panel.
    if ((wasWorking && !d.busy || wasWaiting !== Boolean(d.awaitingExplain)) &&
        (document.activeElement === document.body || document.activeElement.closest('.composer'))) {
      const input = byId(d.awaitingExplain ? 'explain-input' : 'desk-input');
      if (!input.disabled) input.focus({ preventScroll: true });
    }
  }
  function submit(kind) {
    const input = byId(kind === 'explain' ? 'explain-input' : 'desk-input');
    if (input.disabled || !input.value.trim()) return;
    submitted = { kind, text: input.value.trim(), ids: (state.desk?.entries || []).map(e => e.id) };
    submitting = true; controls();
    vscode.postMessage({ type: 'deskSend', root: state.root, kind, text: submitted.text, to: byId('desk-to').value });
  }
  for (const [form, input, kind] of [['desk-form', 'desk-input', 'ask'], ['explain-form', 'explain-input', 'explain']]) {
    byId(form).addEventListener('submit', event => { event.preventDefault(); submit(kind); });
    byId(input).addEventListener('input', controls);
    byId(input).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(kind); }
    });
  }
  byId('desk-clear').addEventListener('click', () => vscode.postMessage({ type: 'deskClear', root: state.root }));
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.file) vscode.postMessage({ type: 'deskFile', root: state.root, id: button.dataset.entry, path: button.dataset.file });
    if (button.dataset.override) {
      submitting = true; controls();
      vscode.postMessage({ type: 'deskOverride', root: state.root, id: button.dataset.entry, to: button.dataset.override });
    }
    if (button.dataset.chooseDesk) {
      const choices = byId(`choices-${button.dataset.chooseDesk}`);
      choices.hidden = !choices.hidden; button.setAttribute('aria-expanded', String(!choices.hidden));
    }
    if (button.dataset.suggestion) {
      byId('desk-input').value = button.dataset.suggestion; controls(); byId('desk-input').focus();
    }
    if (button.dataset.command) vscode.postMessage({ type: 'command', command: button.dataset.command });
    if (button.dataset.image) vscode.postMessage({ type: 'image', path: button.dataset.image });
  });
  window.addEventListener('message', ({ data }) => {
    if (data.type === 'activity') {
      text('activity', data.text); show('activity', Boolean(data.text)); return;
    }
    if (data.type !== 'state') return;
    const s = data.state;
    renderDesk(s);
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
