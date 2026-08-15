/* =========================================================================
   图标生成脚本（开发者工具，只需要运行一次；应用运行本身不需要它）
   用法：node tools/gen-icons.js
   生成：icon-192.png / icon-512.png / icon-512-maskable.png
   实现：纯 Node 标准库（zlib 压缩 + 手写 PNG 编码），无任何第三方依赖。
   想改图标颜色/图形：改下面 makeIcon 里的 cTop / cBot 颜色与 bars 布局即可。
   ========================================================================= */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- PNG 编码 ---------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function pngEncode(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // 位深 8
  ihdr[9] = 6;   // 颜色类型 6 = RGBA
  ihdr[10] = 0;  // 压缩方法
  ihdr[11] = 0;  // 过滤方法
  ihdr[12] = 0;  // 非隔行
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;               // 每行前置过滤字节 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 绘制 ---------- */
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function distToRoundRect(x, y, rect) {
  const cx = Math.max(rect.x + rect.r, Math.min(x, rect.x + rect.w - rect.r));
  const cy = Math.max(rect.y + rect.r, Math.min(y, rect.y + rect.h - rect.r));
  return Math.hypot(x - cx, y - cy) - rect.r;
}
/* 场景采样：返回 {r,g,b} 或 null（透明） */
function sampleAt(x, y, size, fullBleed, cTop, cBot, bars) {
  const t = y / size;
  const r = Math.round(cTop[0] + (cBot[0] - cTop[0]) * t);
  const g = Math.round(cTop[1] + (cBot[1] - cTop[1]) * t);
  const b = Math.round(cTop[2] + (cBot[2] - cTop[2]) * t);
  const bgRect = { x: 0, y: 0, w: size, h: size, r: size * 0.22 };
  const inside = fullBleed || distToRoundRect(x, y, bgRect) <= 0;
  if (!inside) return null;
  for (const bar of bars) {
    if (distToRoundRect(x, y, bar) <= 0) return { r: 255, g: 255, b: 255 };  // 白色三条杠（清单图标）
  }
  return { r, g, b };
}
function makeIcon(size, opts) {
  const fullBleed = !!opts.fullBleed;                 // maskable 用满幅背景
  const contentScale = opts.contentScale || 1;
  const cTop = [95, 125, 250];                        // 渐变上：#5f7dfa
  const cBot = [58, 84, 215];                         // 渐变下：#3a54d7
  const s = size * contentScale;
  const barW = s * 0.46, barH = s * 0.09, gap = s * 0.075;
  const total = barH * 3 + gap * 2;
  const startX = (size - barW) / 2, startY = (size - total) / 2;
  const bars = [0, 1, 2].map(i => ({ x: startX, y: startY + i * (barH + gap), w: barW, h: barH, r: barH / 2 }));
  const px = Buffer.alloc(size * size * 4);
  const sub = [0.25, 0.75];                           // 2x2 超采样抗锯齿
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (const sy of sub) for (const sx of sub) {
        const c = sampleAt(x + sx, y + sy, size, fullBleed, cTop, cBot, bars);
        if (c) { ar += c.r; ag += c.g; ab += c.b; aa += 1; }
      }
      const i = (y * size + x) * 4;
      px[i] = Math.round(ar / 4);
      px[i + 1] = Math.round(ag / 4);
      px[i + 2] = Math.round(ab / 4);
      px[i + 3] = Math.round((aa / 4) * 255);
    }
  }
  return pngEncode(size, size, px);
}

/* ---------- 输出 + 自检 ---------- */
const outDir = path.resolve(__dirname, '..');
const targets = [
  ['icon-192.png', makeIcon(192, {})],
  ['icon-512.png', makeIcon(512, {})],
  ['icon-512-maskable.png', makeIcon(512, { fullBleed: true, contentScale: 0.62 })]
];
for (const [name, buf] of targets) {
  /* 自检：PNG 签名 + IHDR 尺寸 + IDAT 可解压且长度正确 */
  const sigOk = buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71;
  if (!sigOk) throw new Error(name + ': PNG 签名错误');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== h) throw new Error(name + ': 宽高不一致');
  let off = 8, idat = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') { idat = buf.slice(off + 8, off + 8 + len); break; }
    off += 12 + len;
  }
  if (!idat) throw new Error(name + ': 缺少 IDAT');
  const raw = zlib.inflateSync(idat);
  if (raw.length !== h * (w * 4 + 1)) throw new Error(name + ': IDAT 数据长度不符');
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('已生成 ' + name + ' (' + w + 'x' + h + ', ' + buf.length + ' bytes)');
}
console.log('图标生成完成。');
