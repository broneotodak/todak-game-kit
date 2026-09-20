const { randomBytes } = require('node:crypto');

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function html({ source, css, script }) {
  const nonce = randomBytes(18).toString('base64');
  const icon = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${body}</svg>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${escapeAttribute(source)}; style-src ${escapeAttribute(source)}; script-src 'nonce-${nonce}'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${escapeAttribute(css)}"><title>Todak</title></head>
<body><main>
  <header>
    <p class="eyebrow">${icon('<path d="M3 6h3v12H3zm15-2h3v12h-3zM10 10h4v4h-4z"/>')}<span id="week">Your game</span></p>
    <h1 id="game-name">Open a game folder</h1>
    <p id="student" class="meta">Your steps, artwork and journey, together.</p>
  </header>
  <div id="welcome"><p class="muted">Open your game in VS Code, or start with Pong.</p>
    <button id="new" class="primary wide" data-command="new">Create a Pong game</button>
  </div>
  <p id="error" class="notice error" role="status" hidden></p>
  <p id="trust" class="notice" hidden>Trust this workspace to run game commands.</p>
  <div id="game" hidden>
    <section aria-labelledby="steps-heading">
      <div class="section-heading"><h2 id="steps-heading">Today's steps</h2><span id="progress" class="count"></span></div>
      <ul id="steps" class="steps"></ul>
      <div class="actions">
        <button id="run" class="primary" data-command="run">${icon('<path d="m8 5 11 7-11 7z"/>')}Run</button>
        <button id="build" data-command="build">${icon('<path d="m12 3 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9"/>')}Build</button>
        <button id="publish" data-command="publish">${icon('<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>')}Publish</button>
        <button id="review" data-command="review">${icon('<path d="M8 4H5v17h14V4h-3M8 2h8v5H8zm0 12 3 3 5-6"/>')}Review</button>
      </div>
    </section>
    <p id="activity" class="notice" role="status" hidden></p>
    <section aria-labelledby="design-heading">
      <div class="section-heading"><h2 id="design-heading">Design board</h2><span id="art-count" class="count"></span></div>
      <div id="gallery" class="gallery"></div>
      <p id="no-art" class="empty">Your artwork will appear here. Add images to design/ or assets/.</p>
    </section>
    <section aria-labelledby="journey-heading">
      <div class="section-heading"><h2 id="journey-heading">Journey</h2><span id="prompt-count" class="count"></span></div>
      <p id="recording" class="recording missing" role="status">no record</p>
      <p id="journey-warning" class="notice error" hidden></p>
      <ol id="journey" class="journey" aria-label="Recent prompts, newest first"></ol>
      <p id="no-prompts" class="muted">Your recorded prompts will appear here.</p>
      <button id="openJourney" class="wide" data-command="openJourney">Open journey</button>
    </section>
    <section id="report-section" aria-labelledby="report-heading" hidden>
      <div class="section-heading"><h2 id="report-heading">Review</h2></div>
      <p id="report-summary" class="review-summary"></p>
      <button id="openReport" class="wide" data-command="openReport">Open review report</button>
    </section>
  </div>
</main><footer>Demonstrator, not the kit.</footer>
<script nonce="${nonce}" src="${escapeAttribute(script)}"></script></body></html>`;
}

module.exports = { html };
