// Generates the PWA icons (PNG + SVG) from the floppy sprite, with no image dependencies.
import fs from 'node:fs';
import zlib from 'node:zlib';

const PAL = { k: '#3a332d', w: '#fbf7ef', g: '#cfc6b8', G: '#8a7f73', b: '#7f9fc6', B: '#4d6b96', p: '#e2a3b4' };
const FLOPPY = [
  'kkkkkkkkkkkkkk..', 'kbbkggggggkbbbk.', 'kbbkggggkgkbbbbk', 'kbbkggggkgkbbbbk',
  'kbbkggggggkbbbbk', 'kbbbkkkkkkbbbbbk', 'kbbbbbbbbbbbbbbk', 'kbbwwwwwwwwwwbbk',
  'kbbwppppppppwbbk', 'kbbwwwwwwwwwwbbk', 'kbbwGGGGGGGwwbbk', 'kbbwwwwwwwwwwbbk',
  'kbbwGGGGGwwwwbbk', 'kbbwwwwwwwwwwbbk', 'kBbwwwwwwwwwwbBk', 'kkkkkkkkkkkkkkkk',
];
const BG = '#d9d0c3';
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const scale = Math.floor((size * 0.62) / 16);
  const off = Math.floor((size - 16 * scale) / 2);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const bg = hex(BG);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x - off) / scale);
      const sy = Math.floor((y - off) / scale);
      const ch = FLOPPY[sy]?.[sx];
      const c = ch && PAL[ch] ? hex(PAL[ch]) : bg;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = c[0];
      raw[i + 1] = c[1];
      raw[i + 2] = c[2];
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  let rects = '';
  FLOPPY.forEach((row, y) => [...row].forEach((ch, x) => {
    if (PAL[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[ch]}"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`;
}

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/icon-192.png', png(192));
fs.writeFileSync('public/icon-512.png', png(512));
fs.writeFileSync('public/icon.svg', svg());
console.log('icons written to public/');
