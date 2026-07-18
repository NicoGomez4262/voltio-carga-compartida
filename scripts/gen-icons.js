/**
 * Generador de iconos PNG para Voltio — sin dependencias externas.
 * Rasteriza el logo (fondo degradado + rayo) con supersampling y
 * codifica PNG usando el módulo zlib nativo de Node.
 *
 * Uso: node scripts/gen-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- Utilidades de color ---------- */
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

const CYAN = hex('#22e6ff');
const GREEN = hex('#39ff9d');
const VIOLET = hex('#7c5cff');
const BG_DARK = hex('#070b16');

/* degradado diagonal cian -> verde -> violeta */
function gradient(t) {
  if (t < 0.5) return mix(CYAN, GREEN, t / 0.5);
  return mix(GREEN, VIOLET, (t - 0.5) / 0.5);
}

/* ---------- Geometría ---------- */
function inRoundRect(x, y, w, h, r) {
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return dx * dx + dy * dy <= r * r;
}
function distRoundRect(x, y, w, h, r) {
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return Math.sqrt(dx * dx + dy * dy) - r;
}
// Rayo en coordenadas 0..100
const BOLT = [[57, 15], [29, 56], [48, 56], [43, 87], [73, 42], [52, 42]];
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function scalePoly(poly, cx, cy, scale, ox, oy) {
  return poly.map(([x, y]) => [(x - 50) * scale + cx + ox, (y - 50) * scale + cy + oy]);
}

/* ---------- Render ---------- */
function render(size, { maskable = false } = {}) {
  const SS = Math.max(2, Math.min(4, Math.floor(1536 / size)));
  const W = size * SS;
  const hi = new Float32Array(W * W * 4);

  const radius = maskable ? 0 : W * 0.22;           // maskable = cuadrado a sangre
  const boltScale = (maskable ? 0.46 : 0.60) * W / 100;
  const cx = W / 2, cy = W / 2;
  const bolt = scalePoly(BOLT, cx, cy, boltScale, 0, 0);
  const boltGlow = scalePoly(BOLT, cx, cy, boltScale * 1.16, 0, 0);

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = maskable ? true : inRoundRect(x, y, W, W, radius);
      if (!inside) { hi[i + 3] = 0; continue; }

      // fondo degradado
      const t = (x + y) / (2 * W);
      let col = gradient(t);

      // oscurecer levemente hacia el centro para dar profundidad al rayo
      // luz superior-izquierda
      const lightT = 1 - ((x + y) / (2 * W));
      col = mix(col, [255, 255, 255], lightT * 0.10);

      // borde interior sutil
      if (!maskable) {
        const d = distRoundRect(x, y, W, W, radius);
        if (d > -W * 0.02) col = mix(col, [255, 255, 255], 0.18);
      }

      let a = 255;

      // halo del rayo
      if (inPoly(x, y, boltGlow)) col = mix(col, BG_DARK, 0.16);
      // rayo (oscuro sobre degradado, look premium)
      if (inPoly(x, y, bolt)) col = mix(BG_DARK, CYAN, 0.06);

      hi[i] = col[0]; hi[i + 1] = col[1]; hi[i + 2] = col[2]; hi[i + 3] = a;
    }
  }

  // downscale por promedio
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          const al = hi[i + 3];
          r += hi[i] * al; g += hi[i + 1] * al; b += hi[i + 2] * al; a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(a / (SS * SS));
    }
  }
  return out;
}

/* ---------- Codificador PNG ---------- */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // filtro 0 por fila
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- Generar ---------- */
const jobs = [
  { name: 'icon-192.png', size: 192, opts: {} },
  { name: 'icon-512.png', size: 512, opts: {} },
  { name: 'icon-maskable-512.png', size: 512, opts: { maskable: true } },
  { name: 'apple-touch-icon.png', size: 180, opts: {} }
];
for (const j of jobs) {
  const rgba = render(j.size, j.opts);
  const png = encodePNG(rgba, j.size);
  fs.writeFileSync(path.join(OUT, j.name), png);
  console.log('  ✓ ' + j.name + '  (' + j.size + 'px, ' + (png.length / 1024).toFixed(1) + ' KB)');
}
console.log('Iconos generados en public/icons/');
