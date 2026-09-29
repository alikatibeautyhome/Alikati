/**
 * Generates `public/media/og-image.png` — a 1200×630 rose-gold gradient used as the
 * social sharing banner. Dependency-free: PNG is assembled by hand over Node's zlib.
 *
 *   node scripts/generate-og-image.mjs
 *
 * Replace the generated file with real brand artwork before launch; keep the 1200×630 size.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/media/og-image.png');

/* ---------------------------------------------------------------- palette */
// Sampled from the Alikati Beauty Home logo.
const BLUSH = [254, 247, 249];
const ROSE = [213, 65, 103];
const GOLD = [194, 138, 76];
const CHARCOAL = [42, 27, 21];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function pixel(x, y) {
  // Diagonal blush → rose-gold sweep.
  const t = Math.min(1, (x / WIDTH) * 0.65 + (y / HEIGHT) * 0.35);
  let [r, g, b] = [lerp(BLUSH[0], ROSE[0], t), lerp(BLUSH[1], ROSE[1], t), lerp(BLUSH[2], ROSE[2], t)];

  // Soft concentric mark centred slightly left of frame.
  const cx = WIDTH * 0.28;
  const cy = HEIGHT * 0.5;
  const dist = Math.hypot(x - cx, y - cy);
  if (dist < 210) {
    const k = 1 - dist / 210;
    r = lerp(r, 255, k * 0.35);
    g = lerp(g, 255, k * 0.35);
    b = lerp(b, 255, k * 0.32);
  }

  // Gold hairline just above the charcoal band.
  if (y > HEIGHT - 96 && y <= HEIGHT - 90) {
    r = GOLD[0];
    g = GOLD[1];
    b = GOLD[2];
  }

  // Charcoal band along the bottom edge.
  if (y > HEIGHT - 90) {
    const k = (y - (HEIGHT - 90)) / 90;
    r = lerp(r, CHARCOAL[0], k * 0.85);
    g = lerp(g, CHARCOAL[1], k * 0.85);
    b = lerp(b, CHARCOAL[2], k * 0.85);
  }

  return [r, g, b, 255];
}

/* ------------------------------------------------------------- PNG writer */
const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
let offset = 0;
for (let y = 0; y < HEIGHT; y += 1) {
  raw[offset] = 0; // filter type: none
  offset += 1;
  for (let x = 0; x < WIDTH; x += 1) {
    const [r, g, b, a] = pixel(x, y);
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
    raw[offset + 3] = a;
    offset += 4;
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${WIDTH}×${HEIGHT}, ${(png.length / 1024).toFixed(1)} KB)`);
