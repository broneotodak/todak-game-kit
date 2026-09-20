const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assets = path.resolve(__dirname, '../../../templates/pong/assets');

test('Pong PNGs have exact dimensions, hard 2× pixels and only Arcade colors; total stays under 300 KB', () => {
  const colors = new Set(['00000000', '14152aff', '1f2140ff', '4a4d8aff', 'f2f2ffff', 'ff6ba8ff', '5be7ffff', '7cff6bff']);
  let total = fs.statSync(path.join(assets, 'icon.svg')).size;
  for (const [file, width, height] of [['paddle.png', 16, 100], ['ball.png', 16, 16], ['title.png', 960, 540]]) {
    const png = fs.readFileSync(path.join(assets, file)); total += png.length;
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const pixels = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 4 + 1;
    assert.equal(pixels.length, stride * height);
    const pixel = (x, y) => pixels.subarray(y * stride + 1 + x * 4, y * stride + 5 + x * 4).toString('hex');
    let transparent = false;
    for (let y = 0; y < height; y++) {
      assert.equal(pixels[y * stride], 0, 'unfiltered RGBA scanline');
      for (let x = 0; x < width; x++) {
        assert.ok(colors.has(pixel(x, y)), file);
        assert.equal(pixel(x, y), pixel(x - x % 2, y - y % 2), 'nearest-neighbour 2× grid');
        if (pixel(x, y) === '00000000') transparent = true;
      }
    }
    assert.equal(transparent, file !== 'title.png');
    if (file === 'title.png') for (let y = 110; y < 340; y++) for (let x = 100; x < 860; x++) assert.equal(pixel(x, y), '14152aff', 'quiet space for live text');
  }
  assert.ok(total < 300 * 1024, `${total} bytes`);
  assert.equal(fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8'), fs.readFileSync(path.join(assets, '../icon.svg'), 'utf8'));
});
