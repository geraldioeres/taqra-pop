// Renders the app icon (crescent + star on a green rounded square) to
// src/assets/icon.png with no external dependencies.  Run: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const SS = 4; // supersampling per axis for anti-aliasing

const TOP = [0x24, 0x80, 0x6a];
const BOTTOM = [0x12, 0x45, 0x3a];
const GOLD = [0xf2, 0xd7, 0x8a];

function inRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function inCrescent(x, y) {
  return Math.hypot(x - 0.45, y - 0.5) <= 0.31 && Math.hypot(x - 0.565, y - 0.425) > 0.265;
}

const STAR = (() => {
  const cx = 0.69, cy = 0.37, outer = 0.085, inner = 0.036, pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
})();
function inStar(x, y) {
  let inside = false;
  for (let i = 0, j = STAR.length - 1; i < STAR.length; j = i++) {
    const [xi, yi] = STAR[i], [xj, yj] = STAR[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0; // PNG filter: none
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SIZE;
        const y = (py + (sy + 0.5) / SS) / SIZE;
        if (!inRoundedSquare(x, y, 0.22)) continue;
        const c = inCrescent(x, y) || inStar(x, y)
          ? GOLD
          : TOP.map((t, i) => t + (BOTTOM[i] - t) * y);
        r += c[0]; g += c[1]; b += c[2]; a += 1;
      }
    }
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    if (a) { raw[o] = r / a; raw[o + 1] = g / a; raw[o + 2] = b / a; }
    raw[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'src', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
