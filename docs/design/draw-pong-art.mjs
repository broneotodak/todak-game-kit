// Original pixel art, drawn locally. Run: node docs/design/draw-pong-art.mjs
// No packages, fonts, model calls or antialiasing; all pixels use the Arcade palette.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'templates/pong/assets');
fs.mkdirSync(output, { recursive: true });
const palette = ['00000000', '14152aff', '1f2140ff', '4a4d8aff', 'f2f2ffff', 'ff6ba8ff', '5be7ffff', '7cff6bff']
  .map(hex => Buffer.from(hex, 'hex'));
const [clear, bg, panel, line, ink, pink, cyan, green] = palette.map((_, i) => i);

function canvas(width, height, fill = clear) {
  const pixels = new Uint8Array(width * height).fill(fill);
  return {
    width, height, pixels,
    rect(x, y, w, h, color) {
      for (let row = Math.max(0, y); row < Math.min(height, y + h); row++) {
        for (let col = Math.max(0, x); col < Math.min(width, x + w); col++) pixels[row * width + col] = color;
      }
    },
  };
}
function paddle(c, x, y, color = cyan) {
  c.rect(x + 2, y, 4, 50, line);
  c.rect(x + 1, y + 1, 6, 48, line);
  c.rect(x, y + 2, 8, 46, line);
  c.rect(x + 1, y + 2, 5, 45, color);
  c.rect(x + 2, y + 1, 3, 47, color);
  c.rect(x + 2, y + 2, 2, 44, ink);
  c.rect(x + 4, y + 4, 1, 40, color);
  c.rect(x + 2, y + 45, 4, 2, panel);
  c.rect(x + 2, y + 24, 3, 1, color);
}
function ball(c, x, y) {
  c.rect(x + 2, y, 4, 8, pink);
  c.rect(x + 1, y + 1, 6, 6, pink);
  c.rect(x, y + 2, 8, 4, pink);
  c.rect(x + 2, y + 1, 3, 5, ink);
  c.rect(x + 1, y + 2, 5, 3, ink);
  c.rect(x + 5, y + 5, 2, 1, line);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function writePng(name, c, scale = 2) {
  const width = c.width * scale, height = c.height * scale;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    palette[c.pixels[Math.floor(y / scale) * c.width + Math.floor(x / scale)]]
      .copy(raw, y * (width * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  fs.writeFileSync(path.join(output, name), Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const sprite = canvas(8, 50); paddle(sprite, 0, 0); writePng('paddle.png', sprite);
const orb = canvas(8, 8); ball(orb, 0, 0); writePng('ball.png', orb);

const title = canvas(480, 270, bg);
// A quiet court: the entire central title / instructions area stays unmarked.
title.rect(12, 12, 456, 246, panel);
title.rect(14, 14, 452, 242, bg);
for (const [x, y, sx, sy] of [[20, 20, 1, 1], [460, 20, -1, 1], [20, 250, 1, -1], [460, 250, -1, -1]]) {
  title.rect(sx > 0 ? x : x - 18, y, 18, 1, line);
  title.rect(x, sy > 0 ? y : y - 18, 1, 18, line);
}
// Net appears only at the edges, leaving space for live text.
for (const y of [20, 28, 36, 222, 230, 238, 246]) title.rect(239, y, 2, 4, line);
for (let i = 0; i < 5; i++) {
  title.rect(37 + i * 5, 24, 3, 2, i === 0 ? cyan : panel);
  title.rect(420 + i * 5, 245, 3, 2, i === 4 ? pink : panel);
}
paddle(title, 32, 171, cyan);
paddle(title, 440, 48, pink);
// A stepped rally path beneath the title, with restrained solid-color echoes.
for (let i = 0; i < 7; i++) title.rect(278 + i * 10, 231 - i * 4, 4, 2, i < 4 ? panel : line);
ball(title, 350, 199);
for (const [x, y, color] of [[59, 48, line], [407, 214, line], [399, 41, green]]) {
  title.rect(x, y + 1, 3, 1, color); title.rect(x + 1, y, 1, 3, color);
}
writePng('title.png', title);

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" shape-rendering="crispEdges">
  <title>Pong: two paddles and a ball</title>
  <path fill="#14152a" d="M8 0h112v8h8v112h-8v8H8v-8H0V8h8z"/>
  <path fill="#1f2140" d="M12 12h104v104H12z"/>
  <path fill="#14152a" d="M16 16h96v96H16z"/>
  <path fill="#4a4d8a" d="M62 20h4v8h-4zm0 16h4v8h-4zm0 48h4v8h-4zm0 16h4v8h-4zM22 42h12v54H22zm72-14h12v54H94z"/>
  <path fill="#5be7ff" d="M20 40h12v52H20z"/>
  <path fill="#ff6ba8" d="M92 26h12v52H92zM60 56h12v4h4v12h-4v4H60v-4h-4V60h4z"/>
  <path fill="#f2f2ff" d="M22 42h4v46h-4zm72-14h4v46h-4zM60 60h8v8h-8z"/>
  <path fill="#4a4d8a" d="M42 76h4v4h-4zm8-6h4v4h-4z"/>
  <path fill="#7cff6b" d="M20 20h4v4h-4z"/>
</svg>
`;
fs.writeFileSync(path.join(output, 'icon.svg'), icon);
// project.godot already points here; replace that placeholder without editing the project.
fs.writeFileSync(path.join(root, 'templates/pong/icon.svg'), icon);
for (const name of ['paddle.png', 'ball.png', 'title.png', 'icon.svg']) {
  console.log(`${name}: ${fs.statSync(path.join(output, name)).size} bytes`);
}
