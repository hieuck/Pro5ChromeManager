/**
 * Generate placeholder icons for Electron packaging.
 * Creates a valid 256x256 PNG and multi-size ICO using raw binary.
 * Run: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG helpers ──────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

/**
 * Build a PNG from RGBA pixel data (Uint8Array, width*height*4 bytes).
 */
function buildPNG(width, height, rgba) {
  // Filter type 0 (None) for each scanline
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  const deflated = zlib.deflateSync(Buffer.from(raw), { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draw the Pro5 icon: dark background + "P5" text approximated with rectangles.
 */
function drawIcon(size) {
  const rgba = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = size / 2, cy = size / 2;
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx*dx + dy*dy);
      const radius = size * 0.48;

      if (r > radius) {
        // transparent outside circle
        rgba[i] = rgba[i+1] = rgba[i+2] = rgba[i+3] = 0;
        continue;
      }

      // Background gradient: deep blue → indigo
      const t = r / radius;
      rgba[i]   = Math.round(20  + t * 30);   // R
      rgba[i+1] = Math.round(60  + t * 20);   // G
      rgba[i+2] = Math.round(160 + t * 40);   // B
      rgba[i+3] = 255;
    }
  }

  // Draw "P5" using filled rectangles scaled to icon size
  const s = size / 64; // scale factor (base design at 64px)

  function rect(x1, y1, w, h, rr, gg, bb) {
    const x1s = Math.round(x1 * s), y1s = Math.round(y1 * s);
    const ws  = Math.round(w  * s), hs  = Math.round(h  * s);
    for (let py = y1s; py < y1s + hs && py < size; py++) {
      for (let px = x1s; px < x1s + ws && px < size; px++) {
        const i = (py * size + px) * 4;
        rgba[i] = rr; rgba[i+1] = gg; rgba[i+2] = bb; rgba[i+3] = 255;
      }
    }
  }

  // "P" letter (left side, x: 10-30)
  rect(10, 14, 5, 36, 0, 255, 255, 255); // vertical bar
  rect(15, 14, 10, 5, 0, 255, 255, 255); // top horizontal
  rect(15, 26, 10, 5, 0, 255, 255, 255); // mid horizontal
  rect(25, 14, 5, 17, 0, 255, 255, 255); // right bar top half

  // "5" letter (right side, x: 33-54)
  rect(33, 14, 16, 5, 0, 255, 255, 255); // top
  rect(33, 19, 5, 12, 0, 255, 255, 255); // upper-left bar
  rect(33, 31, 16, 5, 0, 255, 255, 255); // mid
  rect(44, 36, 5, 10, 0, 255, 255, 255); // lower-right bar
  rect(33, 46, 16, 4, 0, 255, 255, 255); // bottom

  return rgba;
}

// ── ICO builder ──────────────────────────────────────────────────────────────

/**
 * Build a multi-size ICO file from an array of PNG buffers.
 * Each PNG must be a valid PNG file (ICO stores them as PNG when size >= 256).
 */
function buildICO(pngMap) {
  // pngMap: array of { size, png: Buffer }
  const count = pngMap.length;
  const headerSize = 6 + count * 16;

  // Calculate offsets
  let offset = headerSize;
  const entries = pngMap.map(({ size, png }) => {
    const entry = { size, png, offset };
    offset += png.length;
    return entry;
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = entries.map(({ size, png, offset }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // width (0 = 256)
    e[1] = size >= 256 ? 0 : size; // height
    e[2] = 0; // color count
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    return e;
  });

  return Buffer.concat([header, ...dirEntries, ...entries.map(e => e.png)]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const resourcesDir = path.join(__dirname, '..', 'resources');
fs.mkdirSync(resourcesDir, { recursive: true });

// Generate PNG 256x256
console.log('Generating 256x256 PNG...');
const rgba256 = drawIcon(256);
const png256 = buildPNG(256, 256, rgba256);
fs.writeFileSync(path.join(resourcesDir, 'icon.png'), png256);
console.log(`  → resources/icon.png (${png256.length} bytes)`);

// Generate ICO with sizes: 16, 32, 48, 64, 128, 256
const icoSizes = [16, 32, 48, 64, 128, 256];
console.log(`Generating ICO with sizes: ${icoSizes.join(', ')}...`);
const pngMap = icoSizes.map(size => ({
  size,
  png: buildPNG(size, size, drawIcon(size)),
}));
const ico = buildICO(pngMap);
fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), ico);
console.log(`  → resources/icon.ico (${ico.length} bytes)`);

console.log('Done.');
