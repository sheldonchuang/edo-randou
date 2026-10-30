// 產生 App 圖示（點陣頭巾武士），只用 Node 內建 zlib 寫 PNG：node tools/make-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const PAL = { '.': null, K: [20, 12, 8], H: [44, 32, 24], h: [92, 76, 68], S: [252, 200, 156], s: [216, 148, 100], R: [232, 40, 0], r: [150, 20, 0], W: [252, 252, 252], B: [40, 88, 216] };
// 24×24 頭像（半側面、頭巾、單眼）
const ART = [
  '........................',
  '.......KKKKKKKK.........',
  '.....KKHHHHHHHHKK.......',
  '....KHHHhhHHHHHHHK......',
  '...KHHHhhHHHHHHHHHK.....',
  '...KHHhHHHHHHHHHHHHK....',
  '..KRRRRRRRRRRRRRRRRK....',
  'KRRrrrrrrrrrrrrrrrrK....',
  'KRrKHHHSSHSSHSSSSSSK....',
  '.KKKHHHSSSSSSSSSSSSSK...',
  '...KHHsSSSSKKKKSSSSSK...',
  '...KHsSsSSSSSWKSSSSSK...',
  '...KHsSsSSSSSWKSSSSSSK..',
  '...KHHsSSSSSSWKSSSSSK...',
  '....KHHSSSSSSSSSSSSsK...',
  '....KHHsSSSSSSSSKKSK....',
  '.....KHssSSSSSSSSssK....',
  '......KKsssssssssKK.....',
  '.......KKKSSSSKKK.......',
  '.....KKWWWKSSKWWWKK.....',
  '....KBBBWWWKKWWWBBBK....',
  '...KBBBBBWWWWWWBBBBBK...',
  '...KBBBBBBWWWWBBBBBBK...',
  '........................',
];
function crc32(buf) { let c, t = crc32.t || (crc32.t = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; })); let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(size, pad) {
  const cell = Math.floor((size * (1 - pad * 2)) / 24), off = Math.floor((size - cell * 24) / 2), rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); row[0] = 0;
    for (let x = 0; x < size; x++) {
      // 背景：深藍夜空漸層＋下方朱紅
      let col = y < size * 0.72 ? [16, 20 + (y / size) * 40 | 0, 72 + (y / size) * 60 | 0] : [184, 40, 16];
      const ax = Math.floor((x - off) / cell), ay = Math.floor((y - off) / cell);
      if (ax >= 0 && ay >= 0 && ax < 24 && ay < 24) { const p = PAL[ART[ay][ax]]; if (p) col = p; }
      row.set(col, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const [name, size, pad] of [['icon-192.png', 192, 0.06], ['icon-512.png', 512, 0.06], ['maskable-512.png', 512, 0.16], ['apple-touch-icon.png', 180, 0.08]]) fs.writeFileSync(path.join(out, name), png(size, pad));
console.log('icons written to', out);
