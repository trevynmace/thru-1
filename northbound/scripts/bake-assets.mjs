#!/usr/bin/env node
// =============================================================================
// NORTHBOUND — asset baker
// -----------------------------------------------------------------------------
// Generates every sprite in SPEC.md §6.2 procedurally and writes:
//
//   public/assets/sprites/main.png    all game sprites, shelf-packed
//   public/assets/sprites/font.png    the 5x7 bitmap font
//   public/assets/atlas.json          { images, frames, anims, tintKeys, meta }
//
// Zero dependencies. PNGs are encoded by hand (IHDR/IDAT/IEND, 8-bit RGBA,
// filter type 0) with node:zlib. Fully deterministic: running twice produces
// byte-identical output.
//
//   node scripts/bake-assets.mjs
// =============================================================================

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_ASSETS = path.join(ROOT, 'public', 'assets');
const OUT_SPRITES = path.join(OUT_ASSETS, 'sprites');

const TAU = Math.PI * 2;

// =============================================================================
// 1. PNG ENCODER  (8-bit RGBA, no interlace, one IDAT)
// =============================================================================

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// =============================================================================
// 2. COLOUR
// =============================================================================

const colorCache = new Map();
function rgba(col) {
  if (col == null || col === false) return null;
  if (Array.isArray(col)) return col;
  let v = colorCache.get(col);
  if (v) return v;
  let s = col.trim();
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length === 6) s += 'ff';
  v = [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
    parseInt(s.slice(6, 8), 16),
  ];
  colorCache.set(col, v);
  return v;
}

function hex(c) {
  const [r, g, b] = rgba(c);
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** linear blend a -> b by t (0..1), returns hex string */
function mix(a, b, t) {
  const A = rgba(a), B = rgba(b);
  return hex([
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
    255,
  ]);
}

// =============================================================================
// 3. PALETTE — SPEC §2 core ramp plus the desaturated working tones derived
//    from it. No fully saturated primaries anywhere except the tint keys.
// =============================================================================

const P = {
  // --- SPEC §2 core ramp (exact) ---
  ink: '#f4ecdd',
  inkDim: '#a99e8c',
  night: '#0e0b17',
  panel: '#1a1526',
  panel2: '#251d36',
  edge: '#4b3f66',
  gold: '#f2c98a',
  goldDim: '#c39d63',
  rust: '#d1785c',
  sage: '#8fd0a4',
  skyIce: '#bfe3ff',
  violet: '#6b5a94',
};

// derived working tones (all anchored on the ramp above)
Object.assign(P, {
  outline: '#140f1e',
  dark: '#1c1729',
  dark2: '#2b2340',
  shade: mix(P.violet, P.night, 0.45),

  skin: '#d9a276',
  skinDark: '#a06f4d',
  shirt: '#6b8fa8',
  shirtDark: '#4b6b83',
  pants: '#332c4a',

  pack: '#7a6046',
  packDark: '#4e3c2c',
  bedroll: '#9c8f77',
  strap: '#3a2f28',

  pole: '#9a9186',
  poleDark: '#635c53',

  wood: '#7a5b3d',
  woodDark: '#4e3a27',
  woodLite: '#a1784f',
  canvasCol: '#cdb894',
  canvasDark: '#9c8663',

  stone: '#6e6a78',
  stoneDark: '#443f52',
  stoneLite: '#98939f',

  metal: '#9aa0ac',
  metalDark: '#5c6270',
  metalLite: '#c7ccd6',

  leaf: '#4f7a5e',
  leafDark: '#2e4d3d',
  leafLite: '#78a17c',
  sage2: mix(P.sage, P.night, 0.35),

  water: '#4a6f96',
  waterDark: '#2c4666',
  waterLite: '#87aecd',
  foam: '#dcecf7',

  mule: '#6f5b48',
  muleDark: '#48392d',
  muleLite: '#93795f',
  muleGrey: '#a9a094',

  snow: '#e9f3fc',
  fire: '#f2c98a',
  fireHot: '#f7e0b0',
  ember: '#d1785c',

  glass: '#8fb6c9',
  bandage: '#e6dcc6',
});

// The tint keys. Frames prefixed `key_` use these instead of the default
// shirt/skin so the renderer can `replaceColor` them per party member.
// They are never drawn to screen as-is.
const SHIRT_KEY = '#ff00ff';
const SKIN_KEY = '#00ff00';

// =============================================================================
// 4. PIXEL CANVAS TOOLKIT
// =============================================================================

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const PATTERNS = {
  check: (x, y) => ((x + y) & 1) === 0,
  checkOdd: (x, y) => ((x + y) & 1) === 1,
  b12: (x, y) => BAYER4[y & 3][x & 3] < 2,
  b25: (x, y) => BAYER4[y & 3][x & 3] < 4,
  b50: (x, y) => BAYER4[y & 3][x & 3] < 8,
  b75: (x, y) => BAYER4[y & 3][x & 3] < 12,
  b88: (x, y) => BAYER4[y & 3][x & 3] < 14,
  hline: (x, y) => (y & 1) === 0,
  vline: (x, y) => (x & 1) === 0,
};

class Canvas {
  constructor(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }

  /** set one pixel (hard replace; null colour is a no-op) */
  px(x, y, col) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const c = rgba(col);
    if (!c) return this;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    if (c[3] === 255) {
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    } else if (c[3] > 0) {
      // straight-alpha source-over onto (possibly transparent) dst
      const sa = c[3] / 255;
      const da = d[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) return this;
      d[i] = (c[0] * sa + d[i] * da * (1 - sa)) / oa;
      d[i + 1] = (c[1] * sa + d[i + 1] * da * (1 - sa)) / oa;
      d[i + 2] = (c[2] * sa + d[i + 2] * da * (1 - sa)) / oa;
      d[i + 3] = Math.round(oa * 255);
    }
    return this;
  }

  /** knock a pixel back to fully transparent */
  erase(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = (y * this.w + x) * 4;
    this.data[i] = this.data[i + 1] = this.data[i + 2] = this.data[i + 3] = 0;
    return this;
  }

  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  solid(x, y) { return this.get(x, y)[3] > 0; }

  clear(x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = (j * this.w + i) * 4;
        this.data[k] = this.data[k + 1] = this.data[k + 2] = this.data[k + 3] = 0;
      }
    }
    return this;
  }

  fillRect(x, y, w, h, col) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, col);
    return this;
  }

  /** 1px outlined rectangle */
  rect(x, y, w, h, col) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    if (w <= 0 || h <= 0) return this;
    for (let i = x; i < x + w; i++) { this.px(i, y, col); this.px(i, y + h - 1, col); }
    for (let j = y; j < y + h; j++) { this.px(x, j, col); this.px(x + w - 1, j, col); }
    return this;
  }

  line(x0, y0, x1, y1, col, bw = 1, bh = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (bw === 1 && bh === 1) this.px(x0, y0, col);
      else this.fillRect(x0, y0, bw, bh, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  hline(x0, x1, y, col) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, col); return this; }
  vline(x, y0, y1, col) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, col); return this; }

  /** filled or outlined ellipse; cx/cy may be half-integers for even sizes */
  ellipse(cx, cy, rx, ry, col, fill = true) {
    if (rx <= 0 || ry <= 0) return this;
    const y0 = Math.ceil(cy - ry), y1 = Math.floor(cy + ry);
    let prev = null;
    for (let y = y0; y <= y1; y++) {
      const t = (y - cy) / ry;
      const q = 1 - t * t;
      if (q < 0) continue;
      const hw = rx * Math.sqrt(q);
      const xa = Math.round(cx - hw), xb = Math.round(cx + hw - 0.0001);
      if (fill) this.hline(xa, xb, y, col);
      else {
        if (prev == null) this.hline(xa, xb, y, col);
        else {
          this.hline(xa, prev[0], y, col);
          this.hline(prev[1], xb, y, col);
        }
        if (y === y1) this.hline(xa, xb, y, col);
        prev = [xa, xb];
      }
    }
    return this;
  }

  circle(cx, cy, r, col, fill = true) { return this.ellipse(cx, cy, r, r, col, fill); }

  /** filled convex/concave polygon, even-odd scanline */
  poly(pts, col) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const ay = a[1], by = b[1];
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(a[0] + (y - ay) / (by - ay) * (b[0] - a[0]));
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        this.hline(Math.round(xs[i]), Math.round(xs[i + 1] - 0.0001), y, col);
      }
    }
    return this;
  }

  tri(x0, y0, x1, y1, x2, y2, col) { return this.poly([[x0, y0], [x1, y1], [x2, y2]], col); }

  /**
   * Fill a region with a two-tone dither. `colB` may be null to leave the
   * off-pixels untouched (useful for hazing over existing art).
   */
  dither(x, y, w, h, colA, colB, pattern = 'check') {
    const fn = typeof pattern === 'function' ? pattern : (PATTERNS[pattern] || PATTERNS.check);
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (fn(i, j)) this.px(i, j, colA);
        else if (colB != null) this.px(i, j, colB);
      }
    }
    return this;
  }

  /** dither only where pixels are already opaque (shading pass) */
  ditherOver(x, y, w, h, col, pattern = 'check') {
    const fn = typeof pattern === 'function' ? pattern : (PATTERNS[pattern] || PATTERNS.check);
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) if (fn(i, j) && this.solid(i, j)) this.px(i, j, col);
    }
    return this;
  }

  blit(src, dx, dy, opts = {}) {
    const { flipX = false, flipY = false, tint = null, tintAmt = 0 } = opts;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const sx = flipX ? src.w - 1 - x : x;
        const sy = flipY ? src.h - 1 - y : y;
        const c = src.get(sx, sy);
        if (c[3] === 0) continue;
        let col = c;
        if (tint) {
          const T = rgba(tint);
          col = [
            Math.round(c[0] + (T[0] - c[0]) * tintAmt),
            Math.round(c[1] + (T[1] - c[1]) * tintAmt),
            Math.round(c[2] + (T[2] - c[2]) * tintAmt),
            c[3],
          ];
        }
        this.px(dx + x, dy + y, col);
      }
    }
    return this;
  }

  /** 1px outline around every opaque pixel */
  outline(col, opts = {}) {
    const { diag = false } = opts;
    const mask = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) mask[y * this.w + x] = this.solid(x, y) ? 1 : 0;
    const N = diag
      ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
      : [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (mask[y * this.w + x]) continue;
        let touch = false;
        for (const [ox, oy] of N) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          if (mask[ny * this.w + nx]) { touch = true; break; }
        }
        if (touch) this.px(x, y, col);
      }
    }
    return this;
  }

  replaceColor(from, to) {
    const F = rgba(from), T = rgba(to);
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === F[0] && d[i + 1] === F[1] && d[i + 2] === F[2] && d[i + 3] > 0) {
        d[i] = T[0]; d[i + 1] = T[1]; d[i + 2] = T[2];
      }
    }
    return this;
  }

  clone() {
    const c = new Canvas(this.w, this.h);
    c.data.set(this.data);
    return c;
  }

  /** returns [x, y, w, h] of the opaque bounding box, or null */
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.solid(x, y)) {
        if (x < x0) x0 = x; if (y < y0) y0 = y;
        if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }
}

/** deterministic tiny PRNG so speckle is stable across runs */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// 5. FRAME REGISTRY
// =============================================================================

/** @type {{name:string, canvas:Canvas, img:string}[]} */
const FRAMES = [];
const FRAME_INDEX = new Map();
const ALIASES = []; // {name, target}

function sprite(name, w, h, drawFn, img = 'main') {
  if (FRAME_INDEX.has(name)) throw new Error(`duplicate frame: ${name}`);
  const c = new Canvas(w, h);
  drawFn(c);
  const rec = { name, canvas: c, img };
  FRAMES.push(rec);
  FRAME_INDEX.set(name, rec);
  return rec;
}

function alias(name, target) { ALIASES.push({ name, target }); }

// two-bone IK: returns the joint position between (hx,hy) and (fx,fy)
function ik2(hx, hy, fx, fy, l1, l2, bend) {
  let dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < 0.01) { d = 0.01; dx = 0; dy = 0.01; }
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  return [hx + ux * a + uy * bend * hh, hy + uy * a - ux * bend * hh];
}

// =============================================================================
// 6. THE HUMANOID RIG
// -----------------------------------------------------------------------------
// Every walking figure (hiker, leader, forager) comes out of one parametric
// routine so the walk cycles share weight, timing and silhouette language.
// Figures face RIGHT with their feet on `groundY`.
//
// Cycle (near leg phase th):
//   th = 0     heel strike, forward foot planted, hips low
//   th = PI/2  mid-stance, foot under hips, hips HIGH  (1px bob)
//   th = PI    toe-off, foot behind, hips low
//   th = 3PI/2 mid-swing, foot lifted and swinging through
// The far leg runs at th + PI; the near arm swings with the FAR leg.
// =============================================================================

function rigFor(kind) {
  if (kind === 'leader') {
    // 18 x 26
    return {
      w: 18, h: 26, cx: 8, groundY: 25,
      hipY: 16, shoulderY: 10,
      thigh: 5, shin: 5, upperArm: 4, foreArm: 4,
      headX: 6, headY: 4, headW: 5, headH: 5,
      torsoX: 5, torsoY: 10, torsoW: 6, torsoH: 7,
      packX: 1, packY: 8, packW: 5, packH: 9,
      stride: 4, lift: 3, legW: 2, bootW: 4,
      hat: 'brim', pole: true, poleLen: 12,
    };
  }
  if (kind === 'forager') {
    // 14 x 20
    return {
      w: 14, h: 20, cx: 6, groundY: 19,
      hipY: 12, shoulderY: 7,
      thigh: 4, shin: 4, upperArm: 3, foreArm: 3,
      headX: 4, headY: 2, headW: 4, headH: 4,
      torsoX: 4, torsoY: 7, torsoW: 5, torsoH: 5,
      packX: 1, packY: 6, packW: 3, packH: 6,
      stride: 3, lift: 2, legW: 2, bootW: 3,
      hat: 'cap', pole: false, poleLen: 0,
    };
  }
  // hiker: 16 x 24
  return {
    w: 16, h: 24, cx: 7, groundY: 23,
    hipY: 15, shoulderY: 10,
    thigh: 4, shin: 4, upperArm: 3, foreArm: 3,
    headX: 6, headY: 4, headW: 4, headH: 5,
    torsoX: 5, torsoY: 10, torsoW: 5, torsoH: 6,
    packX: 1, packY: 8, packW: 4, packH: 8,
    stride: 3, lift: 3, legW: 2, bootW: 3,
    hat: 'cap', pole: true, poleLen: 11,
  };
}

function figureColors(keyed) {
  return {
    shirt: keyed ? SHIRT_KEY : P.shirt,
    skin: keyed ? SKIN_KEY : P.skin,
    dark: P.dark,
    darker: P.outline,
    pants: P.pants,
    pack: P.pack,
    packDark: P.packDark,
    bedroll: P.bedroll,
    hair: '#2f2740',
    hat: P.goldDim,
    pole: P.pole,
    poleDark: P.poleDark,
  };
}

/** the pack, drawn behind the torso */
function drawPack(c, r, K, ox, oy) {
  const x = r.packX + ox, y = r.packY + oy;
  c.fillRect(x, y, r.packW, r.packH, K.pack);
  // shadowed left edge + base
  c.vline(x, y + 1, y + r.packH - 1, K.packDark);
  c.hline(x, x + r.packW - 1, y + r.packH - 1, K.packDark);
  // lid seam
  c.hline(x + 1, x + r.packW - 1, y + 2, K.packDark);
  // bedroll lashed on top
  c.fillRect(x, y - 1, r.packW, 1, K.bedroll);
  // a dangling strap
  c.px(x + 1, y + r.packH, K.packDark);
}

/** shoulder->elbow in shirt, elbow->hand in skin */
function drawArm(c, sx, sy, hx, hy, r, K, near) {
  const bend = near ? -1 : -1;
  const [ex, ey] = ik2(sx, sy, hx, hy, r.upperArm, r.foreArm, bend);
  if (near) {
    c.line(sx, sy, ex, ey, K.shirt);
    c.line(ex, ey, hx, hy, K.skin);
  } else {
    c.line(sx, sy, ex, ey, K.darker);
    c.line(ex, ey, hx, hy, K.darker);
  }
}

function drawLeg(c, hx, hy, fx, fy, r, K, near) {
  const [kx, ky] = ik2(hx, hy, fx, fy, r.thigh, r.shin, 1);
  const col = near ? K.pants : K.darker;
  const bw = near ? r.legW : r.legW - 1;
  c.line(hx, hy, kx, ky, col, Math.max(1, bw), 1);
  c.line(kx, ky, fx, fy, col, Math.max(1, bw), 1);
  // boot
  c.fillRect(fx - 1, fy - 1, r.bootW, 2, near ? K.dark : K.darker);
}

function drawHead(c, r, K, ox, oy) {
  const x = r.headX + ox, y = r.headY + oy;
  // skin
  c.fillRect(x, y + 1, r.headW, r.headH - 1, K.skin);
  // jaw shave: knock the back-bottom corner off so it reads as a head
  c.erase(x, y + r.headH - 1);
  // hair / cap crown
  c.fillRect(x, y, r.headW, 2, K.hair);
  c.px(x, y, K.hair);
  // eye
  c.px(x + r.headW - 2, y + 2, K.darker);
  if (r.hat === 'cap') {
    // ball-cap bill jutting forward
    c.hline(x + r.headW, x + r.headW + 1, y + 1, K.hair);
  } else if (r.hat === 'brim') {
    // wide brim: the leader's whole silhouette signature
    c.hline(x - 4, x + r.headW + 3, y + 1, K.hat);
    c.hline(x - 3, x + r.headW + 2, y + 2, mix(K.hat, P.night, 0.35));
    c.fillRect(x, y - 2, r.headW, 3, K.hat);
    c.hline(x, x + r.headW - 1, y - 2, mix(K.hat, P.ink, 0.25));
    c.px(x - 4, y + 1, mix(K.hat, P.night, 0.2));
    c.px(x + r.headW + 3, y + 1, mix(K.hat, P.night, 0.2));
  }
}

function drawTorso(c, r, K, ox, oy) {
  const x = r.torsoX + ox, y = r.torsoY + oy;
  c.fillRect(x, y, r.torsoW, r.torsoH, K.shirt);
  // hip / short line at the bottom in dark so legs read as separate
  c.fillRect(x, y + r.torsoH - 1, r.torsoW, 1, K.pants);
  // sternum shadow keeps it from being a flat slab (still one shirt colour,
  // so the tint key stays pure — the shadow is the pack strap)
  c.vline(x + r.torsoW - 2, y + 1, y + r.torsoH - 2, K.strap ?? P.strap);
}

/**
 * The whole figure.
 * mode: 'walk' | 'idle'
 */
function drawWalker(c, r, K, th, mode = 'walk') {
  const swing = mode === 'idle' ? 0 : 1;
  const bob = -Math.round(Math.abs(Math.sin(th)) * swing);
  const hipY = r.hipY + bob;
  const shY = r.shoulderY + bob;

  // ---- feet ----
  const thN = th, thF = th + Math.PI;
  const footN = swing
    ? [Math.round(r.cx + r.stride * Math.cos(thN)), Math.round(r.groundY - Math.max(0, -Math.sin(thN)) * r.lift)]
    : [r.cx + 2, r.groundY];
  const footF = swing
    ? [Math.round(r.cx + r.stride * Math.cos(thF)), Math.round(r.groundY - Math.max(0, -Math.sin(thF)) * r.lift)]
    : [r.cx - 2, r.groundY];

  const hipXN = r.cx + 1, hipXF = r.cx;

  // ---- far side first ----
  drawLeg(c, hipXF, hipY, footF[0], footF[1], r, K, false);

  const shXF = r.cx, shXN = r.cx + r.torsoW - 2;
  const reach = r.upperArm + r.foreArm;
  const handF = [
    Math.round(r.cx - 1 + (r.stride - 1) * Math.cos(thN) * swing),
    Math.round(shY + reach - 1 - Math.abs(Math.sin(thN)) * swing),
  ];
  drawArm(c, shXF, shY + 1, handF[0], handF[1], r, K, false);

  // ---- pack, torso, head ----
  const sway = swing ? Math.round(Math.sin(th) * 0.5) : 0;
  drawPack(c, r, K, sway, bob);
  drawTorso(c, r, K, 0, bob);
  drawHead(c, r, K, 0, bob);

  // ---- near side ----
  drawLeg(c, hipXN, hipY, footN[0], footN[1], r, K, true);

  const handN = [
    Math.round(r.cx + 1 + (r.stride - 1) * Math.cos(thF) * swing),
    Math.round(shY + reach - 1 - Math.abs(Math.sin(thF)) * swing),
  ];
  drawArm(c, shXN, shY + 1, handN[0], handN[1], r, K, true);

  // ---- trekking pole in the near hand ----
  if (r.pole) {
    const plant = (Math.cos(thF) * swing + 1) / 2; // 1 = planted forward
    const tipX = Math.round(handN[0] + 1 + plant * 2);
    const tipY = Math.round(r.groundY - (1 - plant) * 3);
    c.line(handN[0], handN[1] - 2, tipX, tipY, K.pole);
    c.px(handN[0], handN[1] - 3, K.poleDark); // grip top
    if (tipY >= r.groundY) c.px(tipX, tipY, K.poleDark); // basket bite
  }
  return c;
}

/** seated at camp, pack off, knees up */
function drawResting(c, r, K, frame) {
  const gy = r.groundY;
  const lean = frame; // 0 or 1: a slow breathing lean
  const hipX = r.cx - 1, hipY = gy - 3;
  // pack set down behind
  c.fillRect(r.packX, gy - 6, r.packW + 1, 6, K.pack);
  c.hline(r.packX, r.packX + r.packW, gy - 6, K.bedroll);
  c.vline(r.packX, gy - 5, gy - 1, K.packDark);
  // legs: thigh forward, shin down to the ground
  const kneeX = hipX + 4, kneeY = gy - 6 + lean;
  c.line(hipX, hipY, kneeX, kneeY, K.pants, 2, 1);
  c.line(kneeX, kneeY, kneeX + 1, gy - 1, K.pants, 2, 1);
  c.fillRect(kneeX, gy - 1, r.bootW, 1, K.dark);
  c.line(hipX, hipY + 1, kneeX - 1, kneeY + 2, K.darker, 2, 1);
  c.fillRect(kneeX - 1, gy, r.bootW, 1, K.darker);
  // torso, leaning back
  const ty = gy - 9 - lean;
  c.fillRect(r.torsoX, ty, r.torsoW, 5, K.shirt);
  c.vline(r.torsoX + r.torsoW - 2, ty + 1, ty + 3, P.strap);
  // arm draped on the knee
  c.line(r.torsoX + r.torsoW - 2, ty + 1, kneeX, kneeY - 1, K.shirt);
  c.px(kneeX, kneeY, K.skin);
  // head
  const hy = ty - 5;
  c.fillRect(r.headX, hy + 1, r.headW, 4, K.skin);
  c.fillRect(r.headX, hy, r.headW, 2, K.hair);
  c.px(r.headX + r.headW - 2, hy + 2, K.darker);
  if (r.hat === 'cap') c.hline(r.headX + r.headW, r.headX + r.headW + 1, hy + 1, K.hair);
  // ground shadow
  c.hline(r.packX, kneeX + r.bootW, gy, mix(P.night, P.violet, 0.25));
  return c;
}

/** hunched over, hands on knees */
function drawSick(c, r, K, frame) {
  const gy = r.groundY;
  const droop = frame; // 0/1 heave
  const hipY = r.hipY + 1;
  // legs planted, slightly bent
  drawLeg(c, r.cx, hipY, r.cx - 2, gy, r, K, false);
  drawLeg(c, r.cx + 1, hipY, r.cx + 2, gy, r, K, true);
  // pack still on, sagging
  drawPack(c, r, K, -1, 2);
  // torso pitched forward
  const ty = r.torsoY + 2 + droop;
  for (let i = 0; i < r.torsoH - 1; i++) {
    const off = Math.round((i / (r.torsoH - 1)) * 2);
    c.fillRect(r.torsoX + 1 + off, ty + i, r.torsoW - 1, 1, K.shirt);
  }
  // head hanging low and forward
  const hx = r.headX + 2, hy = ty - 3;
  c.fillRect(hx, hy + 1, r.headW, r.headH - 2, K.skin);
  c.fillRect(hx, hy, r.headW, 2, K.hair);
  c.px(hx + r.headW - 2, hy + 2, K.darker);
  // arm braced on the knee
  c.line(r.torsoX + r.torsoW, ty + 1, r.cx + 3, hipY + 3, K.shirt);
  c.px(r.cx + 3, hipY + 4, K.skin);
  // a queasy little sweat bead
  c.px(hx + r.headW + 1, hy + 1 + droop, P.skyIce);
  return c;
}

/** the cairn a fallen crew member gets: stones, hat, crossed poles */
function drawDeadMarker(c, r, K) {
  const gy = r.groundY, cx = r.cx;
  // crossed trekking poles behind
  c.line(cx - 4, gy - 1, cx + 4, gy - 13, P.poleDark);
  c.line(cx + 4, gy - 1, cx - 4, gy - 13, P.poleDark);
  // cairn: five stacked stones, widest at the base
  const rows = [
    [cx - 5, gy - 3, 11, 3],
    [cx - 4, gy - 6, 9, 3],
    [cx - 3, gy - 8, 7, 2],
    [cx - 2, gy - 10, 5, 2],
    [cx - 1, gy - 12, 3, 2],
  ];
  rows.forEach((rr, i) => {
    c.fillRect(rr[0], rr[1], rr[2], rr[3], i % 2 ? P.stone : P.stoneDark);
    c.hline(rr[0], rr[0] + rr[2] - 1, rr[1], i % 2 ? P.stoneLite : P.stone);
  });
  // a hat left on top
  c.hline(cx - 3, cx + 3, gy - 13, P.goldDim);
  c.fillRect(cx - 1, gy - 15, 3, 2, mix(P.goldDim, P.night, 0.25));
  // ground line
  c.hline(cx - 6, cx + 6, gy, mix(P.night, P.violet, 0.3));
  return c;
}

function bakeFigures(kind, prefix, keyed) {
  const r = rigFor(kind);
  const K = figureColors(keyed);
  const nWalk = kind === 'forager' ? 4 : 6;
  for (let i = 0; i < nWalk; i++) {
    sprite(`${prefix}walk_${i}`, r.w, r.h, (c) => drawWalker(c, r, K, (i / nWalk) * TAU, 'walk'));
  }
  if (kind === 'forager') {
    // grab: crouch down and pluck
    for (let i = 0; i < 2; i++) {
      sprite(`${prefix}grab_${i}`, r.w, r.h, (c) => {
        const gy = r.groundY;
        const dip = i; // 0 = reaching, 1 = plucked
        drawLeg(c, r.cx, r.hipY + 2, r.cx - 3, gy, r, K, false);
        drawPack(c, r, K, -1, 3);
        drawLeg(c, r.cx + 1, r.hipY + 2, r.cx + 3, gy, r, K, true);
        // torso folded forward
        for (let j = 0; j < r.torsoH - 1; j++) {
          c.fillRect(r.torsoX + 1 + j, r.torsoY + 3 + j, r.torsoW - 1, 1, K.shirt);
        }
        const hx = r.headX + 3, hy = r.torsoY + 1;
        c.fillRect(hx, hy + 1, r.headW, 3, K.skin);
        c.fillRect(hx, hy, r.headW, 2, K.hair);
        // reaching arm
        const handY = gy - 2 - dip * 3;
        c.line(r.torsoX + 3, r.torsoY + 5, r.cx + 4, handY, K.shirt);
        c.px(r.cx + 4, handY + 1, K.skin);
        if (dip) c.px(r.cx + 5, handY, P.sage); // the berry, gathered
        else { c.px(r.cx + 5, gy - 1, P.rust); c.px(r.cx + 6, gy - 1, P.rust); }
      });
    }
    return;
  }
  if (kind === 'hiker') {
    sprite(`${prefix}idle_0`, r.w, r.h, (c) => drawWalker(c, r, K, 0, 'idle'));
    sprite(`${prefix}idle_1`, r.w, r.h, (c) => {
      drawWalker(c, r, K, 0, 'idle');
      // breathe: nudge the head+shoulders 1px on the off frame
      const cp = c.clone();
      c.clear();
      c.blit(cp, 0, 0);
    });
    // frame 1 gets a real 1px lift of everything above the hips
    const idle1 = FRAME_INDEX.get(`${prefix}idle_1`).canvas;
    (() => {
      const src = idle1.clone();
      idle1.clear();
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          const col = src.get(x, y);
          if (col[3] === 0) continue;
          idle1.px(x, y < r.hipY ? y - 1 : y, col);
        }
      }
    })();
    for (let i = 0; i < 2; i++) sprite(`${prefix}rest_${i}`, r.w, r.h, (c) => drawResting(c, r, K, i));
    for (let i = 0; i < 2; i++) sprite(`${prefix}sick_${i}`, r.w, r.h, (c) => drawSick(c, r, K, i));
    if (!keyed) sprite(`${prefix}dead_0`, r.w, r.h, (c) => drawDeadMarker(c, r, K));
  }
}

// =============================================================================
// 7. MULE (24x20) and CART (34x24)
// =============================================================================

/**
 * Pack mule, facing right, feet at y=19.
 * th drives a 4-beat gait (LF, RH, RF, LH) plus head bob and tail flick.
 */
function drawMule(c, th, opts = {}) {
  const { sick = false, idle = false } = opts;
  const gy = 19;
  const swing = idle ? 0 : 1;
  const body = sick ? mix(P.mule, P.violet, 0.3) : P.mule;
  const bodyDark = sick ? mix(P.muleDark, P.violet, 0.3) : P.muleDark;
  const bob = -Math.round(Math.abs(Math.sin(th * 2)) * swing);
  const headBob = Math.round(Math.sin(th) * swing) + (sick ? 3 : 0);

  // ---- far legs first (darker) ----
  const legs = [
    { x: 15, ph: 0.0, near: false },   // fore far
    { x: 7, ph: 0.5, near: false },    // hind far
    { x: 16, ph: 0.25, near: true },   // fore near
    { x: 8, ph: 0.75, near: true },    // hind near
  ];
  const drawMuleLeg = (L) => {
    const t = th + L.ph * TAU;
    const fx = Math.round(L.x + 2 * Math.cos(t) * swing);
    const fy = Math.round(gy - Math.max(0, -Math.sin(t)) * 2 * swing);
    const hipY = 11 + bob;
    const [kx, ky] = ik2(L.x, hipY, fx, fy, 4, 4, L.x > 12 ? -1 : 1);
    const col = L.near ? bodyDark : mix(bodyDark, P.night, 0.4);
    c.line(L.x, hipY, kx, ky, col, 2, 1);
    c.line(kx, ky, fx, fy, col, 1, 1);
    c.fillRect(fx, fy - 1, 2, 2, P.outline); // hoof
  };
  legs.filter((l) => !l.near).forEach(drawMuleLeg);

  // ---- tail ----
  const flick = Math.round(Math.sin(th * 1.5) * 1.5 * swing);
  c.line(5, 7 + bob, 3 + flick, 13 + bob, bodyDark);
  c.px(3 + flick, 13 + bob, P.outline);
  c.px(3 + flick, 14 + bob, P.outline);

  // ---- barrel ----
  c.ellipse(11, 9 + bob, 6.5, 3.5, body);
  c.fillRect(5, 7 + bob, 12, 5, body);
  // belly shadow
  c.hline(6, 16, 12 + bob, bodyDark);
  c.hline(7, 15, 11 + bob, mix(body, P.night, 0.18));
  // chest
  c.fillRect(15, 7 + bob, 3, 5, body);

  // ---- neck + head ----
  const hy = 3 + headBob + bob;
  c.poly([[15, 8 + bob], [18, 8 + bob], [21, hy + 3], [18, hy + 3]], body);
  c.fillRect(18, hy + 1, 4, 4, body);          // skull
  c.fillRect(21, hy + 2, 3, 3, P.muleGrey);    // long pale muzzle
  c.px(23, hy + 4, P.outline);                 // nostril
  c.px(20, hy + 2, P.outline);                 // eye
  // ears
  c.vline(18, hy - 2, hy, bodyDark);
  c.vline(20, hy - 2, hy, bodyDark);
  c.px(18, hy - 2, mix(bodyDark, P.night, 0.4));
  c.px(20, hy - 2, mix(bodyDark, P.night, 0.4));
  // mane down the neck
  c.line(17, hy + 1, 15, 7 + bob, mix(bodyDark, P.night, 0.35));

  // ---- the load: panniers + lashed bedroll ----
  const py = 4 + bob;
  c.fillRect(7, py + 1, 9, 3, P.canvasCol);          // top load
  c.hline(7, 15, py + 1, mix(P.canvasCol, P.ink, 0.3));
  c.fillRect(6, py + 4, 4, 6, P.pack);               // side pannier
  c.rect(6, py + 4, 4, 6, P.packDark);
  c.fillRect(12, py + 4, 4, 5, P.pack);
  c.rect(12, py + 4, 4, 5, P.packDark);
  // lashing
  c.vline(9, py + 1, py + 4, P.strap);
  c.vline(14, py + 1, py + 4, P.strap);
  c.hline(6, 16, py + 4, P.strap);
  // a pot hanging off the back of the load
  c.fillRect(5, py + 5, 2, 3, P.metalDark);

  // ---- near legs ----
  legs.filter((l) => l.near).forEach(drawMuleLeg);

  if (sick) {
    // drooped head already applied; add a shivery breath mark
    c.px(24, hy + 1, P.skyIce);
    c.px(24, hy + 3, mix(P.skyIce, P.night, 0.4));
  }
  return c;
}

/** a spoked wheel rotated by `ang` */
function drawWheel(c, cx, cy, r, ang, spokes = 6) {
  c.circle(cx, cy, r, P.woodDark);
  c.circle(cx, cy, r - 1, P.wood);
  c.circle(cx, cy, r - 2, null, true);
  // hollow the middle back out
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= (r - 2) * (r - 2)) c.erase(cx + x, cy + y);
  }
  for (let s = 0; s < spokes; s++) {
    const a = ang + (s * TAU) / spokes;
    c.line(cx + Math.cos(a) * 1.6, cy + Math.sin(a) * 1.6,
      cx + Math.cos(a) * (r - 1.6), cy + Math.sin(a) * (r - 1.6), P.woodLite);
  }
  c.fillRect(cx - 1, cy - 1, 2, 2, P.metalDark);
  c.px(cx - 1, cy - 1, P.metal);
  return c;
}

/** the gear cart, 34x24, hauled to the right */
function drawCart(c, frame) {
  const gy = 23;
  const ang = (frame / 4) * (TAU / 6); // one spoke-step over 4 frames

  // --- axle + bed frame ---
  c.fillRect(3, 14, 28, 2, P.woodDark);
  c.fillRect(2, 11, 30, 3, P.wood);
  c.hline(2, 31, 11, P.woodLite);
  // plank seams
  for (let x = 5; x < 31; x += 5) c.vline(x, 12, 13, P.woodDark);

  // --- canvas cover on hoops ---
  c.ellipse(16, 11, 12, 9, P.canvasCol);
  c.fillRect(4, 4, 25, 8, P.canvasCol);
  // trim the top to a proper arch
  for (let y = 0; y < 12; y++) for (let x = 0; x < 34; x++) {
    const dx = (x - 16) / 12.5, dy = (y - 11) / 9.5;
    if (y < 11 && dx * dx + dy * dy > 1) c.erase(x, y);
  }
  // hoop ribs + top highlight
  c.hline(6, 27, 2, mix(P.canvasCol, P.ink, 0.35));
  for (const x of [9, 15, 21, 27]) {
    for (let y = 2; y < 11; y++) {
      const dx = (x - 16) / 12.5, dy = (y - 11) / 9.5;
      if (dx * dx + dy * dy <= 1) c.px(x, y, P.canvasDark);
    }
  }
  // shadowed underside of the canvas
  c.dither(4, 9, 25, 2, P.canvasDark, null, 'check');

  // --- shaded opening at the rear ---
  // Keep it inside the canvas arch and only as dark as deep shade. A true-black ellipse
  // here reads as a hole punched through the sprite rather than the inside of a wagon.
  c.ellipse(7, 8, 3, 4, mix(P.canvasDark, P.panel, 0.5));
  c.ellipse(7, 8, 2, 3, mix(P.panel, P.violet, 0.35));
  // clip anything that escaped above the canvas line
  for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) {
    const dx = (x - 16) / 12.5, dy = (y - 11) / 9.5;
    if (dx * dx + dy * dy > 1) c.erase(x, y);
  }

  // --- lashed gear on the tail: a bucket, a crate, a coil of rope ---
  c.fillRect(0, 9, 4, 5, P.pack);
  c.rect(0, 9, 4, 5, P.packDark);
  c.hline(0, 3, 11, P.strap);
  c.fillRect(29, 7, 5, 5, P.wood);
  c.rect(29, 7, 5, 5, P.woodDark);
  c.line(29, 7, 33, 11, P.woodLite);
  c.circle(31, 13, 2, P.bedroll, false);

  // --- hitch pole reaching forward ---
  c.line(31, 15, 33, 18, P.wood);
  c.px(33, 19, P.metal);

  // --- wheels ---
  drawWheel(c, 9, 17, 6, ang);
  drawWheel(c, 25, 17, 6, ang + 0.4);

  // --- ground contact shadow ---
  c.dither(3, gy, 28, 1, mix(P.night, P.violet, 0.35), null, 'check');
  return c;
}

// =============================================================================
// 8. PROPS
// =============================================================================

function conifer(c, cx, baseY, h, w, dark, lite, trunkCol) {
  const tiers = Math.max(4, Math.round(h / 6));
  c.fillRect(cx - 1, baseY - Math.round(h * 0.14), 2, Math.round(h * 0.14) + 1, trunkCol);
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);              // 0 = bottom tier
    const tw = Math.round(w * (1 - f * 0.82));
    const ty = Math.round(baseY - h * 0.12 - f * h * 0.8);
    const th = Math.max(3, Math.round(h * 0.22));
    c.tri(cx - tw, ty, cx + tw, ty, cx, ty - th, dark);
    // a lit left face
    c.tri(cx - tw + 1, ty - 1, cx, ty - 1, cx, ty - th + 1, lite);
  }
  c.px(cx, Math.round(baseY - h), lite);
}

function bakeProps() {
  sprite('prop_saguaro', 18, 34, (c) => {
    const g = '#4a6b4f', gd = '#2f4a38', gl = '#6d8f6a';
    c.fillRect(8, 2, 4, 32, g);
    c.vline(8, 3, 33, gd); c.vline(11, 3, 33, gl);
    c.px(9, 2, gl); c.px(10, 2, gl);
    // left arm
    c.fillRect(4, 14, 3, 10, g); c.vline(4, 15, 23, gd); c.vline(6, 15, 22, gl);
    c.fillRect(5, 22, 4, 3, g);
    c.px(5, 14, gl);
    // right arm, higher
    c.fillRect(13, 9, 3, 13, g); c.vline(13, 10, 21, gd); c.vline(15, 10, 20, gl);
    c.fillRect(11, 19, 4, 3, g);
    c.px(14, 9, gl);
    // ribs
    for (let y = 4; y < 33; y += 3) c.px(10, y, gd);
    // base shade
    c.hline(7, 12, 33, gd);
  });

  sprite('prop_yucca', 16, 20, (c) => {
    const g = '#6c7a55', gd = '#3f4b33', gl = '#9aa774';
    const cx = 7, by = 19;
    const blades = [[-7, 4], [-6, -3], [-4, -8], [-1, -11], [2, -10], [5, -6], [7, -1], [7, 5], [-3, 2], [4, 1]];
    for (const [dx, dy] of blades) {
      c.line(cx, by - 1, cx + dx, by - 8 + dy, dy < -6 ? gl : g);
      c.px(cx + dx, by - 8 + dy, gl);
    }
    c.fillRect(cx - 2, by - 4, 5, 4, gd);
    // flower stalk
    c.vline(cx + 1, by - 20, by - 12, '#c9c2a6');
    c.px(cx, by - 19, P.ink); c.px(cx + 2, by - 17, P.ink); c.px(cx, by - 15, P.ink);
    c.px(cx + 2, by - 13, P.ink); c.px(cx + 1, by - 20, P.ink);
  });

  sprite('prop_juniper', 22, 20, (c) => {
    const g = '#4b6350', gd = '#2c4034', gl = '#728a6a';
    c.fillRect(10, 12, 3, 8, '#5d4636');
    c.line(11, 13, 7, 9, '#5d4636'); c.line(12, 13, 16, 8, '#5d4636');
    // gnarled canopy: overlapping blobs
    const blobs = [[6, 8, 5, 4], [15, 7, 5, 4], [11, 5, 6, 4], [8, 11, 4, 3], [16, 11, 4, 3]];
    for (const [x, y, rx, ry] of blobs) c.ellipse(x, y, rx, ry, g);
    for (const [x, y, rx, ry] of blobs) c.ellipse(x - 1, y - 1, rx - 2, ry - 2, gl);
    c.ditherOver(4, 9, 18, 5, gd, 'b25');
    c.hline(9, 13, 19, gd);
  });

  const pines = [[16, 30, 26, 6], [20, 36, 32, 8], [14, 24, 20, 5]];
  pines.forEach(([w, h, ph, pw], i) => {
    sprite(`prop_pine_${i}`, w, h, (c) => {
      conifer(c, (w >> 1) - 1, h - 1, ph, pw,
        i === 2 ? mix(P.leafDark, P.violet, 0.2) : P.leafDark,
        i === 2 ? mix(P.leaf, P.violet, 0.15) : P.leaf, '#4a382a');
    });
  });

  sprite('prop_boulder_0', 16, 11, (c) => {
    c.poly([[0, 10], [2, 4], [6, 1], [11, 2], [15, 7], [15, 10]], P.stone);
    c.poly([[2, 5], [6, 2], [10, 3], [7, 6]], P.stoneLite);
    c.dither(0, 7, 16, 4, P.stoneDark, null, 'b25');
    c.hline(0, 15, 10, P.stoneDark);
  });
  sprite('prop_boulder_1', 22, 14, (c) => {
    c.poly([[0, 13], [1, 6], [5, 1], [13, 0], [19, 5], [21, 13]], P.stone);
    c.poly([[3, 6], [7, 2], [13, 2], [10, 7], [5, 8]], P.stoneLite);
    c.line(12, 3, 16, 12, P.stoneDark);
    c.dither(0, 9, 22, 5, P.stoneDark, null, 'b25');
    c.hline(0, 21, 13, P.stoneDark);
  });

  sprite('prop_snowpatch', 24, 8, (c) => {
    c.poly([[1, 7], [3, 3], [9, 1], [16, 2], [21, 5], [23, 7]], P.snow);
    c.dither(0, 5, 24, 3, mix(P.snow, P.skyIce, 0.5), null, 'b50');
    c.hline(2, 21, 7, mix(P.skyIce, P.violet, 0.35));
    c.px(6, 2, P.ink); c.px(14, 2, P.ink);
  });

  sprite('prop_sign', 14, 22, (c) => {
    c.fillRect(6, 6, 2, 16, P.woodDark);
    c.px(6, 6, P.wood);
    c.fillRect(1, 4, 12, 6, P.wood);
    c.rect(1, 4, 12, 6, P.woodDark);
    c.hline(2, 11, 5, P.woodLite);
    // routed lettering, abstracted
    c.hline(3, 8, 7, P.night);
    c.hline(3, 6, 8, P.night);
    // a PCT blaze
    c.px(10, 7, P.gold); c.px(10, 8, P.gold);
    c.dither(4, 21, 7, 1, mix(P.night, P.violet, 0.3), null, 'check');
  });

  sprite('prop_cairn', 12, 16, (c) => {
    const rows = [[1, 12, 10, 3], [2, 9, 8, 3], [3, 7, 6, 2], [3, 5, 5, 2], [4, 3, 3, 2], [5, 1, 2, 2]];
    rows.forEach((r, i) => {
      c.fillRect(r[0], r[1], r[2], r[3], i % 2 ? P.stone : P.stoneDark);
      c.hline(r[0], r[0] + r[2] - 1, r[1], i % 2 ? P.stoneLite : P.stone);
    });
    c.hline(0, 11, 15, mix(P.night, P.violet, 0.3));
  });

  sprite('prop_tent', 26, 16, (c) => {
    // a-frame tarp tent
    c.poly([[1, 15], [12, 2], [23, 15]], mix(P.sage, P.night, 0.55));
    c.poly([[12, 2], [23, 15], [17, 15]], mix(P.sage, P.night, 0.4));
    // the door slit
    c.poly([[12, 5], [15, 15], [9, 15]], P.night);
    c.line(12, 2, 12, 15, mix(P.sage, P.ink, 0.15));
    // guy lines + stakes
    c.line(12, 2, 24, 8, P.inkDim);
    c.line(12, 2, 1, 7, P.inkDim);
    c.px(24, 9, P.metalDark); c.px(0, 8, P.metalDark);
    c.hline(1, 23, 15, mix(P.night, P.violet, 0.4));
  });

  for (let i = 0; i < 4; i++) {
    sprite(`prop_campfire_${i}`, 16, 16, (c) => {
      const R = rng(101 + i);
      // logs
      c.line(2, 14, 10, 11, P.woodDark, 2, 1);
      c.line(13, 14, 5, 11, P.wood, 2, 1);
      c.line(3, 13, 12, 13, P.woodDark);
      // ring of stones
      for (const x of [0, 4, 11, 14]) { c.fillRect(x, 13, 2, 2, P.stoneDark); c.px(x, 13, P.stone); }
      // flame: three lobes whose heights cycle
      const ph = (i / 4) * TAU;
      for (let k = 0; k < 3; k++) {
        const bx = 5 + k * 2;
        const hgt = 4 + Math.round(2.5 * (0.5 + 0.5 * Math.sin(ph + k * 2.1)));
        for (let y = 0; y < hgt; y++) {
          const wdt = Math.max(1, Math.round((1 - y / hgt) * 2));
          c.fillRect(bx - wdt + 1, 12 - y, wdt * 2 - 1, 1, y < hgt - 2 ? P.ember : P.fire);
        }
      }
      c.fillRect(6, 10, 4, 2, P.fireHot);
      c.px(7, 9, P.ink);
      // sparks
      for (let s = 0; s < 3; s++) {
        const sx = 4 + Math.floor(R() * 8);
        const sy = 1 + ((Math.floor(R() * 6) + i * 2) % 7);
        c.px(sx, sy, s % 2 ? P.gold : P.ember);
      }
    });
  }

  sprite('prop_wildflower', 7, 9, (c) => {
    c.vline(3, 4, 8, P.leafDark);
    c.px(2, 6, P.leaf); c.px(4, 5, P.leaf);
    c.fillRect(2, 2, 3, 2, P.gold);
    c.px(3, 1, P.ink); c.px(1, 3, P.goldDim); c.px(5, 3, P.goldDim);
    c.px(3, 3, P.rust);
  });

  sprite('prop_stump', 12, 10, (c) => {
    c.fillRect(1, 3, 10, 7, P.woodDark);
    c.ellipse(5.5, 3, 5, 2, P.wood);
    c.ellipse(5.5, 3, 3, 1, P.woodLite);
    c.px(5, 3, P.woodDark);
    c.vline(3, 5, 9, mix(P.woodDark, P.night, 0.4));
    c.vline(8, 5, 9, mix(P.woodDark, P.night, 0.4));
    c.hline(1, 10, 9, mix(P.night, P.violet, 0.3));
  });

  sprite('prop_fern', 14, 12, (c) => {
    const fronds = [[-6, -3], [-5, -6], [-2, -9], [2, -9], [5, -6], [6, -2], [-4, 0], [4, 0]];
    for (const [dx, dy] of fronds) {
      const ex = 7 + dx, ey = 11 + dy;
      c.line(7, 11, ex, ey, P.leafDark);
      // pinnae
      c.px(ex, ey - 1, P.leaf);
      c.px(ex + (dx < 0 ? 1 : -1), ey, P.leaf);
      c.px(Math.round(7 + dx * 0.6), Math.round(11 + dy * 0.6) - 1, P.leafLite);
    }
    c.px(7, 11, P.leafDark);
  });

  sprite('prop_lupine', 9, 16, (c) => {
    c.vline(4, 6, 15, P.leafDark);
    c.line(4, 11, 1, 9, P.leaf); c.line(4, 12, 7, 10, P.leaf);
    // the flower spike, tapering upward
    for (let y = 0; y < 8; y++) {
      const w = Math.max(1, 3 - Math.round(y / 3));
      const col = y < 3 ? mix(P.violet, P.ink, 0.35) : P.violet;
      c.fillRect(4 - w + 1, 1 + y, w * 2 - 1, 1, col);
    }
    c.px(4, 0, mix(P.violet, P.ink, 0.55));
    c.px(3, 4, mix(P.violet, P.ink, 0.5));
    c.px(5, 6, mix(P.violet, P.night, 0.25));
  });
}

// =============================================================================
// 9. LANDMARK HEROES (48x40)
// =============================================================================

/** flat ridgeline silhouette helper */
function ridge(c, y0, amp, col, seed, x0 = 0, x1 = 48, floorY = 40) {
  const R = rng(seed);
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    pts.push([x0 + ((x1 - x0) * i) / n, y0 - Math.round(R() * amp)]);
  }
  const poly = [[x0, floorY], ...pts, [x1, floorY]];
  c.poly(poly, col);
}

function bakeLandmarks() {
  const G = 40; // sprite height; ground band sits at 33..39

  const groundBand = (c, col = P.panel2, top = 33) => {
    c.fillRect(0, top, 48, 40 - top, col);
    c.dither(0, top, 48, 2, mix(col, P.violet, 0.35), null, 'b25');
  };

  sprite('lm_monument', 48, 40, (c) => {
    ridge(c, 30, 5, mix(P.violet, P.night, 0.45), 7);
    ridge(c, 33, 3, mix(P.violet, P.night, 0.62), 13);
    groundBand(c, '#3a2f45', 34);
    // the five-post terminus monument
    const posts = [[14, 12], [19, 17], [24, 23], [29, 17], [34, 12]];
    for (const [x, h] of posts) {
      c.fillRect(x, 34 - h, 4, h, P.wood);
      c.vline(x, 34 - h, 33, P.woodDark);
      c.vline(x + 3, 34 - h, 33, P.woodDark);
      c.hline(x, x + 3, 34 - h, P.woodLite);
      c.hline(x + 1, x + 2, 34 - h + 1, mix(P.wood, P.ink, 0.15));
    }
    // plinth
    c.fillRect(11, 33, 27, 3, P.stoneDark);
    c.hline(11, 37, 33, P.stone);
    // bronze plaque on the tall centre post
    c.fillRect(25, 15, 3, 4, P.goldDim);
    c.px(25, 15, P.gold); c.px(27, 18, mix(P.goldDim, P.night, 0.4));
    // a register box and a small cairn beside it
    c.fillRect(40, 30, 4, 4, P.woodDark); c.hline(40, 43, 30, P.wood);
    c.fillRect(5, 31, 4, 3, P.stone); c.fillRect(6, 29, 2, 2, P.stoneLite);
    // desert scrub
    c.px(2, 33, P.leafDark); c.px(46, 32, P.leafDark); c.px(45, 33, P.leafDark);
  });

  sprite('lm_town', 48, 40, (c) => {
    ridge(c, 22, 6, mix(P.violet, P.night, 0.4), 3);
    ridge(c, 27, 4, mix(P.violet, P.night, 0.6), 11);
    groundBand(c, '#2b2340', 34);
    const bldg = (x, y, w, h, roof) => {
      c.fillRect(x, y, w, h, P.panel2);
      c.rect(x, y, w, h, P.night);
      if (roof === 'gable') {
        c.tri(x - 1, y, x + w, y, x + (w >> 1), y - 4, P.woodDark);
        c.line(x - 1, y, x + (w >> 1), y - 4, P.wood);
      } else {
        c.fillRect(x - 1, y - 2, w + 2, 2, P.woodDark);
        c.hline(x - 1, x + w, y - 2, P.wood);
      }
      // lit windows
      for (let wx = x + 1; wx < x + w - 1; wx += 3) {
        for (let wy = y + 2; wy < y + h - 2; wy += 3) c.fillRect(wx, wy, 2, 2, P.gold);
      }
    };
    bldg(3, 24, 8, 10, 'gable');
    bldg(13, 20, 10, 14, 'gable');
    bldg(25, 26, 7, 8, 'flat');
    bldg(34, 22, 9, 12, 'gable');
    // a bell tower on the tall one
    c.fillRect(17, 12, 3, 8, P.woodDark);
    c.tri(15, 12, 21, 12, 18, 8, P.wood);
    c.px(18, 15, P.gold);
    // water tower on stilts
    c.fillRect(43, 14, 5, 5, P.wood);
    c.tri(42, 14, 48, 14, 45, 11, P.woodDark);
    c.vline(44, 19, 24, P.woodDark); c.vline(47, 19, 24, P.woodDark);
    c.line(44, 24, 47, 19, P.woodDark);
    // chimney smoke, dithered
    c.dither(6, 14, 4, 9, mix(P.violet, P.ink, 0.25), null, 'b25');
    c.fillRect(6, 21, 2, 3, P.stoneDark);
    // street
    c.hline(0, 47, 36, mix('#2b2340', P.ink, 0.16));
  });

  sprite('lm_pass', 48, 40, (c) => {
    // the two shoulders of the pass with a notch between them
    c.poly([[0, 40], [0, 22], [10, 6], [20, 18], [24, 22], [24, 40]], mix(P.edge, P.night, 0.25));
    c.poly([[24, 40], [24, 22], [30, 16], [40, 4], [48, 20], [48, 40]], P.edge);
    // snow caps + dithered snow line
    c.poly([[10, 6], [15, 13], [5, 13]], P.snow);
    c.poly([[40, 4], [46, 14], [34, 14]], P.snow);
    c.dither(3, 12, 16, 5, mix(P.snow, P.skyIce, 0.5), null, 'b50');
    c.dither(32, 13, 16, 5, mix(P.snow, P.skyIce, 0.5), null, 'b50');
    // cornice hanging over the notch
    c.hline(20, 30, 21, P.snow);
    c.hline(21, 29, 22, mix(P.skyIce, P.violet, 0.25));
    // the trail: switchbacks climbing to the notch
    const sw = [[4, 38], [18, 34], [6, 31], [19, 28], [10, 26], [22, 23]];
    for (let i = 0; i + 1 < sw.length; i++) c.line(sw[i][0], sw[i][1], sw[i + 1][0], sw[i + 1][1], P.inkDim);
    c.line(22, 23, 25, 22, P.ink);
    // snow field in the basin
    c.dither(0, 34, 24, 6, mix(P.skyIce, P.violet, 0.4), null, 'b25');
    // sign at the top
    c.vline(27, 16, 21, P.woodDark);
    c.fillRect(25, 14, 6, 3, P.wood);
    c.hline(25, 30, 14, P.woodLite);
    // wind-bent krummholz
    conifer(c, 42, 34, 8, 3, mix(P.leafDark, P.night, 0.3), P.leafDark, '#3a2c22');
  });

  sprite('lm_ford', 48, 40, (c) => {
    // far bank + trees
    ridge(c, 16, 4, mix(P.violet, P.night, 0.5), 21, 0, 48, 24);
    c.fillRect(0, 20, 48, 5, mix(P.leafDark, P.night, 0.45));
    conifer(c, 6, 21, 12, 4, mix(P.leafDark, P.night, 0.25), P.leafDark, '#3a2c22');
    conifer(c, 14, 21, 16, 5, mix(P.leafDark, P.night, 0.25), P.leafDark, '#3a2c22');
    conifer(c, 38, 21, 10, 4, mix(P.leafDark, P.night, 0.25), P.leafDark, '#3a2c22');
    c.fillRect(0, 22, 48, 3, '#33422f');
    // the river
    c.fillRect(0, 25, 48, 10, P.water);
    c.dither(0, 25, 48, 3, P.waterLite, null, 'b25');
    c.dither(0, 28, 48, 4, mix(P.water, P.waterLite, 0.4), null, 'check');
    c.dither(0, 32, 48, 3, P.waterDark, null, 'b75');
    // rocks breaking the surface
    const rocks = [[8, 28, 4, 2], [18, 30, 5, 3], [30, 27, 4, 2], [38, 31, 6, 3], [25, 33, 4, 2]];
    for (const [x, y, w, h] of rocks) {
      c.fillRect(x, y, w, h, P.stoneDark);
      c.hline(x, x + w - 1, y, P.stone);
      c.hline(x - 1, x + w, y + h, P.foam);
    }
    // a fallen log crossing
    c.line(2, 27, 44, 24, '#5a4432', 1, 2);
    c.hline(2, 44, 26, '#7a5b3d');
    c.px(45, 24, '#3f3024');
    // near bank
    c.fillRect(0, 35, 48, 5, '#3b3049');
    c.dither(0, 35, 48, 2, mix('#3b3049', P.foam, 0.3), null, 'b25');
  });

  sprite('lm_lake', 48, 40, (c) => {
    // peaks
    c.poly([[0, 24], [8, 10], [16, 20], [24, 6], [34, 18], [40, 12], [48, 24], [48, 26], [0, 26]], P.edge);
    c.poly([[24, 6], [29, 13], [19, 13]], P.snow);
    c.poly([[8, 10], [12, 15], [4, 15]], P.snow);
    c.poly([[40, 12], [44, 17], [36, 17]], mix(P.snow, P.skyIce, 0.4));
    c.dither(0, 13, 48, 4, mix(P.snow, P.violet, 0.35), null, 'b25');
    // shoreline
    c.fillRect(0, 25, 48, 2, mix(P.leafDark, P.night, 0.35));
    // the lake, holding a dithered reflection of the peaks
    c.fillRect(0, 27, 48, 13, P.waterDark);
    for (let y = 0; y < 11; y++) {
      const srcY = 25 - y;
      for (let x = 0; x < 48; x++) {
        const s = c.get(x, srcY);
        if (s[3] === 0) continue;
        if (!PATTERNS.b50(x, y)) continue;
        const dark = [Math.round(s[0] * 0.42 + 20), Math.round(s[1] * 0.42 + 24), Math.round(s[2] * 0.45 + 38), 255];
        c.px(x, 28 + y, dark);
      }
    }
    // wind lanes
    c.dither(0, 27, 48, 2, mix(P.waterLite, P.waterDark, 0.35), null, 'hline');
    c.hline(6, 20, 31, mix(P.water, P.skyIce, 0.3));
    c.hline(26, 40, 34, mix(P.water, P.skyIce, 0.22));
    // near shore rocks + a lone pine
    c.fillRect(0, 37, 48, 3, '#332a44');
    c.fillRect(3, 35, 6, 3, P.stoneDark); c.hline(3, 8, 35, P.stone);
    c.fillRect(38, 36, 7, 2, P.stoneDark);
    conifer(c, 44, 37, 13, 4, mix(P.leafDark, P.night, 0.2), P.leafDark, '#3a2c22');
  });

  sprite('lm_falls', 48, 40, (c) => {
    // basalt cliff walls
    c.fillRect(0, 0, 17, 33, mix(P.edge, P.night, 0.35));
    c.fillRect(31, 0, 17, 33, mix(P.edge, P.night, 0.45));
    // columnar jointing
    for (let x = 1; x < 16; x += 3) c.vline(x, 2, 32, mix(P.edge, P.night, 0.6));
    for (let x = 33; x < 48; x += 3) c.vline(x, 2, 32, mix(P.edge, P.night, 0.62));
    for (let y = 6; y < 32; y += 7) { c.hline(0, 16, y, mix(P.edge, P.night, 0.6)); c.hline(31, 47, y, mix(P.edge, P.night, 0.62)); }
    // moss on the lip
    c.hline(0, 16, 1, P.leafDark); c.hline(31, 47, 1, P.leafDark);
    c.dither(0, 2, 17, 2, P.leafDark, null, 'b25');
    c.dither(31, 2, 17, 2, P.leafDark, null, 'b25');
    // the main curtain of water
    c.fillRect(17, 2, 14, 29, P.foam);
    c.dither(17, 2, 14, 29, mix(P.foam, P.waterLite, 0.55), null, 'vline');
    c.vline(18, 3, 30, P.ink); c.vline(24, 3, 30, P.ink); c.vline(29, 3, 30, P.ink);
    // side seeps
    c.dither(13, 8, 4, 22, mix(P.foam, P.water, 0.35), null, 'b25');
    c.dither(31, 6, 4, 24, mix(P.foam, P.water, 0.35), null, 'b25');
    // the lip
    c.fillRect(15, 0, 18, 2, mix(P.edge, P.night, 0.2));
    c.hline(16, 32, 2, P.foam);
    // plunge pool + mist
    c.fillRect(0, 31, 48, 9, P.waterDark);
    c.dither(0, 31, 48, 4, P.water, null, 'b50');
    c.dither(10, 28, 28, 8, P.foam, null, 'b25');
    c.dither(6, 33, 36, 4, mix(P.foam, P.water, 0.5), null, 'b12');
    c.ellipse(24, 33, 8, 3, P.foam);
    c.hline(0, 47, 39, mix(P.waterDark, P.night, 0.5));
  });

  sprite('lm_lodge', 48, 40, (c) => {
    ridge(c, 18, 5, mix(P.violet, P.night, 0.5), 31);
    c.dither(0, 14, 48, 6, mix(P.snow, P.violet, 0.45), null, 'b25');
    // snow ground
    c.fillRect(0, 32, 48, 8, mix(P.skyIce, P.violet, 0.45));
    c.dither(0, 32, 48, 3, P.snow, null, 'b50');
    // lodge body
    c.fillRect(9, 22, 30, 11, '#4a3a2c');
    c.rect(9, 22, 30, 11, '#2e2419');
    // steep timber roof
    c.poly([[6, 23], [24, 8], [42, 23]], '#3a2d22');
    c.poly([[24, 8], [42, 23], [37, 23]], '#2b211a');
    // snow load on the roof
    c.line(6, 23, 24, 8, P.snow); c.line(24, 8, 42, 23, P.snow);
    c.line(7, 23, 24, 9, P.snow); c.line(24, 9, 41, 23, mix(P.snow, P.skyIce, 0.4));
    // stone chimney with smoke
    c.fillRect(31, 6, 5, 18, P.stoneDark);
    c.hline(31, 35, 6, P.stone);
    for (let y = 8; y < 24; y += 3) c.hline(31, 35, y, mix(P.stoneDark, P.night, 0.4));
    c.dither(30, 0, 7, 7, mix(P.violet, P.ink, 0.3), null, 'b25');
    // warm windows + the door
    for (const [x, y] of [[12, 25], [17, 25], [27, 25], [32, 25], [12, 29], [32, 29]]) {
      c.fillRect(x, y, 3, 3, P.gold);
      c.rect(x - 1, y - 1, 5, 5, '#2e2419');
    }
    c.fillRect(22, 26, 4, 7, '#2b211a');
    c.fillRect(22, 26, 4, 1, P.goldDim);
    c.px(25, 29, P.gold);
    // dormer
    c.poly([[18, 18], [22, 13], [26, 18]], '#3a2d22');
    c.fillRect(20, 16, 2, 2, P.gold);
    // flanking firs, snow-laden
    conifer(c, 3, 33, 15, 5, mix(P.leafDark, P.night, 0.3), P.leafDark, '#3a2c22');
    conifer(c, 45, 33, 13, 4, mix(P.leafDark, P.night, 0.3), P.leafDark, '#3a2c22');
    c.px(3, 19, P.snow); c.px(45, 21, P.snow);
    c.dither(0, 24, 7, 9, P.snow, null, 'b12');
    c.dither(42, 26, 6, 7, P.snow, null, 'b12');
  });

  sprite('lm_firetower', 48, 40, (c) => {
    ridge(c, 30, 4, mix(P.violet, P.night, 0.5), 41);
    // the rock knob it stands on
    c.poly([[6, 40], [10, 33], [20, 29], [30, 30], [40, 36], [44, 40]], P.stoneDark);
    c.poly([[12, 33], [20, 30], [27, 31], [22, 34]], P.stone);
    c.dither(8, 34, 34, 6, mix(P.stoneDark, P.night, 0.4), null, 'b25');
    // stilts + cross bracing
    const legs = [[15, 31], [21, 30], [27, 30], [33, 32]];
    for (const [x, y] of legs) c.vline(x, 16, y, P.woodDark);
    for (let i = 0; i + 1 < legs.length; i++) {
      c.line(legs[i][0], 20, legs[i + 1][0], 27, mix(P.woodDark, P.night, 0.25));
      c.line(legs[i][0], 27, legs[i + 1][0], 20, mix(P.woodDark, P.night, 0.25));
    }
    c.hline(15, 33, 23, P.woodDark);
    // catwalk + railing
    c.fillRect(11, 16, 27, 2, P.wood);
    c.hline(11, 37, 16, P.woodLite);
    for (let x = 12; x < 38; x += 3) c.vline(x, 12, 15, P.woodDark);
    c.hline(11, 37, 12, P.woodDark);
    // the cab, all glass
    c.fillRect(16, 6, 17, 10, '#3a2d22');
    c.fillRect(17, 7, 15, 7, P.glass);
    for (let x = 20; x < 32; x += 4) c.vline(x, 7, 13, '#3a2d22');
    c.hline(17, 31, 10, '#3a2d22');
    c.fillRect(23, 8, 3, 3, P.gold); // someone is home
    // hipped roof with an overhang
    c.poly([[13, 6], [24, 0], [36, 6]], '#2b211a');
    c.hline(12, 36, 6, P.woodDark);
    c.line(13, 6, 24, 0, P.wood);
    // ladder up the near stilt
    for (let y = 18; y < 30; y += 2) c.hline(20, 23, y, mix(P.wood, P.night, 0.25));
    c.vline(20, 17, 30, P.woodDark); c.vline(23, 17, 30, P.woodDark);
    // antenna + guy wire
    c.vline(24, -4 + 4, 0, P.metal);
    c.vline(24, 0, 1, P.metal);
    c.px(24, 0, P.metalLite);
    c.line(24, 1, 40, 8, mix(P.metalDark, P.night, 0.3));
  });
}

// =============================================================================
// 10. ITEM ICONS (16x16)
// -----------------------------------------------------------------------------
// One per id in data/items.js when that file exists; otherwise the required id
// list from SPEC §3.2, verbatim and in spec order.
// =============================================================================

const SPEC_ITEM_IDS = [
  'food',
  'spare_soles', 'spare_poles', 'spare_filter', 'spare_pack', 'spare_shelter',
  'clothing', 'puffy',
  'first_aid', 'electrolytes', 'blister_kit',
  'bear_can', 'ice_axe', 'stove_fuel', 'water_carry',
  'camp_chair', 'paperback', 'harmonica',
];

async function resolveItemIds() {
  const p = path.join(ROOT, 'data', 'items.js');
  if (!fs.existsSync(p)) return { ids: SPEC_ITEM_IDS.slice(), source: 'SPEC.md §3.2' };
  try {
    const mod = await import(new URL(`file://${p}`).href);
    const ids = (mod.ITEMS || []).map((it) => it.id).filter(Boolean);
    if (!ids.length) return { ids: SPEC_ITEM_IDS.slice(), source: 'SPEC.md §3.2 (items.js empty)' };
    // keep any spec-required id the data file forgot, so the atlas never
    // under-delivers on the contract
    for (const id of SPEC_ITEM_IDS) if (!ids.includes(id)) ids.push(id);
    return { ids, source: 'data/items.js' };
  } catch (err) {
    return { ids: SPEC_ITEM_IDS.slice(), source: `SPEC.md §3.2 (items.js unreadable: ${err.message})` };
  }
}

const ITEM_DRAWERS = {
  // --- food: a cinched stuff sack, bulging ---
  food: (c) => {
    c.poly([[3, 14], [2, 9], [4, 6], [11, 6], [13, 9], [12, 14]], P.canvasCol);
    c.poly([[3, 13], [3, 9], [5, 7], [7, 7], [6, 13]], mix(P.canvasCol, P.ink, 0.25));
    c.ditherOver(2, 11, 12, 4, P.canvasDark, 'b25');
    // cinch collar + drawstring
    c.fillRect(4, 4, 7, 3, P.leafDark);
    c.hline(4, 10, 4, mix(P.leafDark, P.ink, 0.3));
    c.px(4, 3, P.pack); c.px(6, 2, P.pack); c.px(8, 2, P.pack); c.px(10, 3, P.pack);
    c.hline(3, 11, 8, P.strap);
    // a little label tag
    c.fillRect(11, 10, 3, 3, P.gold);
    c.px(12, 11, P.woodDark);
  },

  // --- spare pack: a loaded sixty-litre bag, lid, straps and a foam pad ---
  spare_pack: (c) => {
    // body
    c.fillRect(4, 4, 8, 10, P.pack);
    c.rect(4, 4, 8, 10, P.packDark);
    // lid
    c.fillRect(4, 2, 8, 3, mix(P.pack, P.inkDim ?? '#a99e8c', 0.18));
    c.rect(4, 2, 8, 3, P.packDark);
    c.px(8, 3, P.strap);
    // shoulder straps
    c.fillRect(2, 5, 2, 7, P.strap);
    c.fillRect(12, 5, 2, 7, P.strap);
    c.px(2, 12, P.packDark); c.px(13, 12, P.packDark);
    // compression straps across the body
    c.hline(4, 11, 8, P.strap);
    c.hline(4, 11, 11, P.strap);
    // a foam pad rolled under the lid
    c.fillRect(3, 14, 10, 2, mix(P.bedroll ?? '#8fd0a4', P.night, 0.2));
    c.hline(3, 12, 14, P.inkDim ?? '#a99e8c');
  },

  // --- tent repair kit: a splint sleeve, a coil of guyline and tape ---
  spare_shelter: (c) => {
    // pole section with the splint sleeve over it
    c.fillRect(1, 6, 14, 2, P.metal);
    c.hline(1, 14, 6, P.metalLite);
    c.fillRect(5, 5, 6, 4, P.metalDark);
    c.rect(5, 5, 6, 4, P.metal);
    // a break line under the sleeve
    c.px(8, 7, P.rust ?? '#d1785c');
    // coil of guyline
    c.circle(4, 12, 3, mix('#e8dcc0', P.night, 0.1), false);
    c.circle(4, 12, 2, mix('#e8dcc0', P.night, 0.35), false);
    // roll of tape
    c.fillRect(10, 10, 5, 5, mix(P.violet ?? '#6b5a94', P.night, 0.25));
    c.rect(10, 10, 5, 5, P.night);
    c.fillRect(12, 12, 1, 1, P.inkDim ?? '#a99e8c');
  },

  // --- boot soles: a pair, tread down ---
  spare_soles: (c) => {
    const sole = (x, y, col, tread) => {
      c.poly([[x, y + 9], [x, y + 3], [x + 1, y], [x + 4, y], [x + 5, y + 3], [x + 5, y + 9], [x + 3, y + 11], [x + 1, y + 11]], col);
      for (let j = 1; j < 10; j += 2) c.hline(x + 1, x + 4, y + j, tread);
      c.hline(x, x + 5, y + 8, tread);
    };
    sole(2, 2, P.leather ?? '#8a6244', mix('#8a6244', P.night, 0.4));
    sole(9, 3, '#6f4f36', mix('#6f4f36', P.night, 0.4));
    c.px(4, 2, '#a67c58'); c.px(11, 3, '#8a6244');
  },

  // --- trekking poles: crossed, with grips, straps and baskets ---
  spare_poles: (c) => {
    c.line(2, 14, 12, 1, P.pole);
    c.line(13, 14, 3, 1, mix(P.pole, P.night, 0.22));
    // grips
    c.line(11, 3, 12, 1, P.dark2); c.line(12, 2, 13, 0, P.dark2);
    c.line(4, 3, 3, 1, P.dark2);
    c.px(12, 1, P.rust); c.px(3, 1, P.rust);
    // wrist strap
    c.px(11, 4, P.strap); c.px(10, 5, P.strap); c.px(10, 4, P.strap);
    // baskets near the tips
    c.hline(1, 4, 12, P.metalDark); c.hline(12, 15, 12, P.metalDark);
    c.px(2, 15, P.metalLite); c.px(13, 15, P.metalLite);
  },

  // --- water filter: cartridge body, ports, hose ---
  spare_filter: (c) => {
    c.fillRect(5, 3, 6, 10, P.skyIce);
    c.rect(5, 3, 6, 10, mix(P.edge, P.night, 0.2));
    c.vline(6, 4, 11, P.ink);
    c.dither(7, 4, 3, 8, mix(P.skyIce, P.violet, 0.35), null, 'hline');
    // caps
    c.fillRect(4, 1, 8, 2, P.metalDark); c.hline(4, 11, 1, P.metal);
    c.fillRect(4, 13, 8, 2, P.metalDark); c.hline(4, 11, 15, P.metalDark);
    // inlet + outlet hose
    c.fillRect(11, 4, 2, 2, P.metalDark);
    c.line(12, 5, 15, 8, P.sage2);
    c.line(15, 8, 13, 12, P.sage2);
    c.fillRect(2, 5, 2, 2, P.metalDark);
    c.line(2, 6, 0, 9, P.sage2);
  },

  // --- clothing: a folded stack of layers ---
  clothing: (c) => {
    const layer = (y, col, hi) => {
      c.fillRect(2, y, 12, 3, col);
      c.hline(2, 13, y, hi);
      c.hline(2, 13, y + 2, mix(col, P.night, 0.35));
      c.px(7, y + 1, mix(col, P.night, 0.25));
    };
    layer(11, '#5d6b8a', '#8697b5');
    layer(7, '#8a6a55', '#b08b70');
    layer(3, '#6d7a5c', '#95a37e');
    // a folded sleeve edge on the top layer
    c.fillRect(3, 2, 4, 2, '#95a37e');
    c.hline(3, 6, 2, '#b3c095');
  },

  // --- puffy: baffled down jacket ---
  puffy: (c) => {
    const body = P.rust, dark = mix(P.rust, P.night, 0.35), lite = mix(P.rust, P.ink, 0.25);
    // torso
    c.poly([[4, 14], [3, 6], [5, 4], [10, 4], [12, 6], [11, 14]], body);
    // sleeves
    c.poly([[3, 6], [0, 8], [1, 13], [4, 13], [4, 7]], body);
    c.poly([[12, 6], [15, 8], [14, 13], [11, 13], [11, 7]], body);
    // baffles
    for (let y = 6; y < 14; y += 2) { c.hline(1, 14, y, dark); }
    c.hline(4, 11, 5, lite);
    // collar
    c.fillRect(5, 2, 6, 3, dark);
    c.hline(5, 10, 2, lite);
    // zip
    c.vline(7, 5, 13, mix(P.ink, P.night, 0.2));
    c.px(7, 5, P.metalLite);
  },

  // --- first aid: a kit box with a cross and a latch ---
  first_aid: (c) => {
    c.fillRect(1, 5, 14, 9, P.canvasCol);
    c.rect(1, 5, 14, 9, P.woodDark);
    c.hline(2, 13, 6, mix(P.canvasCol, P.ink, 0.35));
    c.ditherOver(1, 11, 14, 3, P.canvasDark, 'b25');
    // handle
    c.hline(6, 9, 3, P.strap); c.px(5, 4, P.strap); c.px(10, 4, P.strap);
    // cross
    c.fillRect(7, 7, 2, 6, P.rust);
    c.fillRect(5, 9, 6, 2, P.rust);
    c.px(7, 7, mix(P.rust, P.ink, 0.35));
    // latch
    c.fillRect(0, 8, 2, 3, P.metalDark);
    c.px(0, 8, P.metal);
  },

  // --- electrolytes: a tube of tabs, two spilled ---
  electrolytes: (c) => {
    c.fillRect(4, 3, 6, 11, mix(P.sage, P.night, 0.15));
    c.vline(5, 4, 13, mix(P.sage, P.ink, 0.45));
    c.vline(9, 4, 13, mix(P.sage, P.night, 0.42));
    c.hline(4, 9, 13, mix(P.sage, P.night, 0.5));
    // cap
    c.fillRect(3, 0, 8, 3, P.gold);
    c.hline(3, 10, 0, mix(P.gold, P.ink, 0.4));
    c.hline(3, 10, 2, P.goldDim);
    // label band
    c.fillRect(4, 7, 6, 3, P.ink);
    c.px(6, 8, P.rust); c.px(7, 8, P.rust);
    // loose tablets
    c.circle(13, 11, 2, P.ink); c.px(13, 10, P.inkDim);
    c.circle(12, 14, 1, P.inkDim);
  },

  // --- blister kit: a plaster over a sheet of moleskin ---
  blister_kit: (c) => {
    // moleskin sheet behind
    c.fillRect(1, 2, 11, 9, mix(P.inkDim, P.night, 0.35));
    c.rect(1, 2, 11, 9, mix(P.inkDim, P.night, 0.6));
    c.circle(6, 6, 2, P.night, false);
    c.dither(2, 3, 9, 7, mix(P.inkDim, P.night, 0.2), null, 'b25');
    // the plaster, at a jaunty angle
    c.poly([[3, 13], [5, 8], [15, 10], [13, 15]], P.bandage);
    c.poly([[7, 10], [11, 11], [10, 14], [6, 13]], mix(P.bandage, P.night, 0.22));
    c.px(8, 11, P.bandage); c.px(9, 12, P.bandage);
    c.px(4, 10, mix(P.bandage, P.ink, 0.3)); c.px(14, 12, mix(P.bandage, P.night, 0.3));
  },


  // --- bear canister ---
  bear_can: (c) => {
    c.fillRect(2, 3, 12, 11, P.dark2);
    c.ellipse(7.5, 3, 6, 2, mix(P.dark2, P.violet, 0.35));
    c.ellipse(7.5, 14, 6, 2, mix(P.dark2, P.night, 0.4));
    c.vline(3, 4, 13, mix(P.dark2, P.ink, 0.22));
    c.vline(13, 4, 13, mix(P.dark2, P.night, 0.45));
    // lid seam + the two coin slots you turn with a spoon
    c.ellipse(7.5, 5, 6, 2, mix(P.dark2, P.night, 0.5), false);
    c.fillRect(5, 2, 2, 1, P.inkDim);
    c.fillRect(9, 3, 2, 1, P.inkDim);
    // ribbed body
    for (let y = 8; y < 14; y += 2) c.hline(3, 12, y, mix(P.dark2, P.night, 0.35));
    c.px(5, 3, mix(P.dark2, P.ink, 0.4));
  },

  // --- ice axe ---
  ice_axe: (c) => {
    // shaft
    c.line(11, 2, 5, 13, P.metalDark, 2, 1);
    c.line(11, 2, 5, 13, P.metal);
    // pick + adze head
    c.poly([[8, 1], [14, 4], [15, 6], [12, 4], [10, 3]], P.metalLite);
    c.poly([[9, 1], [10, 0], [6, 1], [5, 3], [8, 3]], P.metalLite);
    c.px(15, 6, P.ink); c.px(5, 3, P.ink);
    c.fillRect(9, 1, 3, 3, P.metalDark);
    // grip
    c.line(8, 8, 6, 11, P.rust, 2, 1);
    // spike
    c.px(4, 14, P.metalLite); c.px(4, 15, P.ink);
  },

  // --- stove fuel canister ---
  stove_fuel: (c) => {
    c.fillRect(2, 5, 12, 9, mix(P.edge, P.night, 0.1));
    c.ellipse(7.5, 5, 6, 2, P.edge);
    c.ellipse(7.5, 14, 6, 2, mix(P.edge, P.night, 0.45));
    c.vline(3, 6, 13, mix(P.edge, P.ink, 0.3));
    c.vline(12, 6, 13, mix(P.edge, P.night, 0.4));
    // label band
    c.fillRect(2, 8, 12, 3, P.gold);
    c.px(5, 9, P.woodDark); c.px(7, 9, P.woodDark); c.px(9, 9, P.woodDark);
    // valve + collar
    c.fillRect(6, 1, 4, 4, P.metalDark);
    c.hline(5, 10, 3, P.metal);
    c.fillRect(7, 0, 2, 1, P.metalLite);
  },

  // --- water bottle ---
  water_carry: (c) => {
    c.fillRect(4, 4, 8, 11, P.glass);
    c.ellipse(7.5, 15, 4, 1, mix(P.glass, P.night, 0.35));
    c.rect(4, 4, 8, 11, mix(P.edge, P.night, 0.15));
    // the water inside
    c.fillRect(5, 8, 6, 6, P.water);
    c.hline(5, 10, 8, P.waterLite);
    c.dither(5, 9, 6, 5, mix(P.water, P.waterDark, 0.4), null, 'b25');
    // highlight
    c.vline(5, 5, 7, mix(P.glass, P.ink, 0.55));
    // neck + cap
    c.fillRect(6, 2, 4, 2, P.glass);
    c.fillRect(5, 0, 6, 2, P.rust);
    c.hline(5, 10, 0, mix(P.rust, P.ink, 0.3));
    // graduations
    c.px(10, 6, P.ink); c.px(10, 10, P.ink); c.px(10, 12, P.ink);
  },

  // --- camp chair, in profile ---
  camp_chair: (c) => {
    // back
    c.poly([[3, 9], [4, 2], [8, 1], [8, 8]], P.sage2);
    c.hline(4, 7, 3, mix(P.sage2, P.ink, 0.3));
    // seat
    c.poly([[3, 9], [12, 8], [12, 10], [4, 11]], P.sage2);
    c.hline(4, 11, 9, mix(P.sage2, P.ink, 0.25));
    // X frame
    c.line(3, 2, 9, 15, P.metalDark);
    c.line(13, 6, 3, 15, P.metalDark);
    c.line(12, 8, 13, 15, P.metalDark);
    c.px(6, 9, P.metal);
    // feet
    c.px(9, 15, P.dark); c.px(3, 15, P.dark); c.px(13, 15, P.dark);
    // armrest
    c.line(8, 6, 12, 7, P.metal);
  },

  // --- paperback ---
  paperback: (c) => {
    c.poly([[2, 13], [3, 2], [13, 3], [12, 14]], P.rust);
    // page block
    c.poly([[12, 14], [13, 3], [14, 4], [13, 15]], P.ink);
    for (let y = 5; y < 14; y += 2) c.px(13, y, P.inkDim);
    // spine
    c.vline(3, 3, 13, mix(P.rust, P.night, 0.4));
    c.vline(4, 3, 13, mix(P.rust, P.night, 0.2));
    // cover art + title bar
    c.fillRect(6, 5, 5, 3, P.gold);
    c.hline(6, 10, 10, P.canvasCol);
    c.hline(6, 9, 12, P.canvasCol);
    c.px(8, 6, P.woodDark);
    // dog-eared corner
    c.px(12, 3, P.canvasCol); c.px(11, 3, P.canvasCol);
  },

  // --- harmonica ---
  harmonica: (c) => {
    c.fillRect(1, 5, 14, 6, P.metal);
    c.hline(1, 14, 5, P.metalLite);
    c.hline(1, 14, 10, P.metalDark);
    // comb slot band
    c.fillRect(1, 7, 14, 2, P.dark2);
    for (let x = 2; x < 15; x += 2) c.vline(x, 7, 8, P.metalDark);
    // cover plate rivets
    c.px(2, 6, P.metalLite); c.px(13, 6, P.metalLite);
    c.px(2, 9, P.metalDark); c.px(13, 9, P.metalDark);
    // end caps
    c.fillRect(0, 4, 2, 8, P.metalDark);
    c.fillRect(14, 4, 2, 8, P.metalDark);
    c.px(0, 4, P.metal); c.px(15, 4, P.metal);
    // a couple of notes drifting off
    c.px(13, 2, P.gold); c.px(14, 1, P.gold); c.px(14, 2, P.gold);
    c.px(10, 1, P.goldDim);
  },
};

function bakeItems(ids) {
  for (const id of ids) {
    const drawer = ITEM_DRAWERS[id];
    sprite(`item_${id}`, 16, 16, (c) => {
      if (drawer) drawer(c);
      else {
        // generic crate, so a data file that adds items still gets an icon
        c.fillRect(2, 4, 12, 10, P.wood);
        c.rect(2, 4, 12, 10, P.woodDark);
        c.line(2, 4, 13, 13, P.woodDark);
        c.line(13, 4, 2, 13, P.woodDark);
        c.hline(3, 12, 5, P.woodLite);
      }
      c.outline(P.outline);
    });
  }
}

// =============================================================================
// 11. UI
// =============================================================================

function bakeUI() {
  // --- 8x8 nine-slice: dark panel, violet edge, 1px inner highlight ---
  const nine = (name, fn) => sprite(name, 8, 8, fn);
  const fillPanel = (c) => c.fillRect(0, 0, 8, 8, P.panel);
  const E = P.edge, EL = mix(P.edge, P.ink, 0.25), ED = mix(P.edge, P.night, 0.45);

  nine('ui_frame_tl', (c) => {
    fillPanel(c);
    c.fillRect(0, 0, 8, 2, E); c.fillRect(0, 0, 2, 8, E);
    c.hline(2, 7, 0, EL); c.vline(0, 2, 7, EL);
    c.px(0, 0, EL); c.px(1, 1, ED);
    c.px(2, 2, ED); c.hline(2, 7, 2, ED); c.vline(2, 2, 7, ED);
  });
  nine('ui_frame_t', (c) => {
    fillPanel(c);
    c.fillRect(0, 0, 8, 2, E);
    c.hline(0, 7, 0, EL); c.hline(0, 7, 2, ED);
  });
  nine('ui_frame_tr', (c) => {
    fillPanel(c);
    c.fillRect(0, 0, 8, 2, E); c.fillRect(6, 0, 2, 8, E);
    c.hline(0, 7, 0, EL); c.vline(7, 0, 7, ED);
    c.px(7, 0, EL);
    c.hline(0, 5, 2, ED); c.vline(5, 2, 7, ED);
  });
  nine('ui_frame_l', (c) => {
    fillPanel(c);
    c.fillRect(0, 0, 2, 8, E);
    c.vline(0, 0, 7, EL); c.vline(2, 0, 7, ED);
  });
  nine('ui_frame_c', (c) => { fillPanel(c); c.dither(0, 0, 8, 8, mix(P.panel, P.panel2, 0.5), null, 'b12'); });
  nine('ui_frame_r', (c) => {
    fillPanel(c);
    c.fillRect(6, 0, 2, 8, E);
    c.vline(7, 0, 7, ED); c.vline(5, 0, 7, ED);
  });
  nine('ui_frame_bl', (c) => {
    fillPanel(c);
    c.fillRect(0, 6, 8, 2, E); c.fillRect(0, 0, 2, 8, E);
    c.vline(0, 0, 7, EL); c.hline(0, 7, 7, ED);
    c.hline(2, 7, 5, ED); c.vline(2, 0, 5, ED);
  });
  nine('ui_frame_b', (c) => {
    fillPanel(c);
    c.fillRect(0, 6, 8, 2, E);
    c.hline(0, 7, 7, ED); c.hline(0, 7, 5, ED);
  });
  nine('ui_frame_br', (c) => {
    fillPanel(c);
    c.fillRect(0, 6, 8, 2, E); c.fillRect(6, 0, 2, 8, E);
    c.hline(0, 7, 7, ED); c.vline(7, 0, 7, ED);
    c.hline(0, 5, 5, ED); c.vline(5, 0, 5, ED);
  });

  // --- pointer ---
  sprite('ui_cursor', 8, 10, (c) => {
    const pts = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8],
    [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
    [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [2, 8],
    [3, 3], [3, 4], [3, 5], [3, 6], [3, 9],
    [4, 4], [4, 5], [4, 6], [4, 9],
    [5, 5], [5, 6], [5, 7], [5, 8]];
    for (const [x, y] of pts) c.px(x, y, P.ink);
    c.px(0, 0, P.gold); c.px(1, 1, P.gold); c.px(2, 2, P.gold);
    c.outline(P.night);
  });

  // --- arrow (points right; renderer flips/rotates) ---
  sprite('ui_arrow', 8, 8, (c) => {
    c.tri(1, 0, 1, 7, 6, 3.5, P.gold);
    c.tri(2, 2, 2, 5, 4, 3.5, mix(P.gold, P.ink, 0.5));
    c.outline(P.night);
  });

  // --- hearts ---
  const heartShape = (c, fill, hi) => {
    c.poly([[0, 2], [1, 1], [3, 1], [4, 2], [5, 1], [7, 1], [8, 2], [8, 4], [4, 7], [0, 4]], fill);
    if (hi) { c.px(1, 2, hi); c.px(2, 2, hi); c.px(1, 3, hi); }
  };
  sprite('ui_heart_full', 9, 8, (c) => { heartShape(c, P.rust, mix(P.rust, P.ink, 0.5)); c.outline(P.night); });
  sprite('ui_heart_half', 9, 8, (c) => {
    heartShape(c, P.rust, mix(P.rust, P.ink, 0.5));
    for (let y = 0; y < 8; y++) for (let x = 4; x < 9; x++) if (c.solid(x, y)) c.px(x, y, P.shade);
    c.outline(P.night);
  });
  sprite('ui_heart_empty', 9, 8, (c) => { heartShape(c, P.shade, null); c.outline(P.night); });

  // --- star ---
  const starShape = (c, cx, cy, rOut, rIn, col, pts = 5) => {
    const p = [];
    for (let i = 0; i < pts * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / pts;
      const r = i % 2 ? rIn : rOut;
      p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    c.poly(p, col);
  };
  sprite('ui_star', 9, 9, (c) => {
    starShape(c, 4, 4.2, 4.4, 1.9, P.gold);
    c.px(3, 3, mix(P.gold, P.ink, 0.6)); c.px(4, 3, mix(P.gold, P.ink, 0.6));
    c.px(4, 6, P.goldDim); c.px(2, 6, P.goldDim); c.px(6, 6, P.goldDim);
    c.outline(P.night);
  });

  // --- snowflake (UI chrome version) ---
  const flake = (c, cx, cy, r, col, tip) => {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r;
      c.line(cx, cy, ex, ey, col);
      c.px(Math.round(ex), Math.round(ey), tip);
      // barbs
      const mx = cx + Math.cos(a) * (r - 1.5), my = cy + Math.sin(a) * (r - 1.5);
      c.px(Math.round(mx + Math.cos(a + 1.05)), Math.round(my + Math.sin(a + 1.05)), col);
      c.px(Math.round(mx + Math.cos(a - 1.05)), Math.round(my + Math.sin(a - 1.05)), col);
    }
    c.px(cx, cy, tip);
  };
  sprite('ui_snowflake', 9, 9, (c) => { flake(c, 4, 4, 4, P.skyIce, P.ink); });

  // --- compass rose ---
  sprite('ui_compass', 14, 14, (c) => {
    c.circle(6.5, 6.5, 6.5, P.edge);
    c.circle(6.5, 6.5, 5.5, P.panel);
    c.circle(6.5, 6.5, 6.5, mix(P.edge, P.ink, 0.3), false);
    // tick marks
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.px(Math.round(6.5 + Math.cos(a) * 5), Math.round(6.5 + Math.sin(a) * 5), P.inkDim);
    }
    // needle: north half in gold (it points up the trail), south dim
    c.tri(6.5, 1.5, 4.5, 7, 8.5, 7, P.gold);
    c.tri(6.5, 11.5, 4.5, 6, 8.5, 6, P.shade);
    c.tri(6.5, 2.5, 5.5, 6.5, 6.5, 6.5, mix(P.gold, P.ink, 0.55));
    c.px(6, 6, P.ink); c.px(7, 6, P.ink);
    c.px(6, 0, P.gold);
  });
}

// =============================================================================
// 12. FORAGE MINIGAME SPRITES
// =============================================================================

function bakeForage() {
  // --- berries: three clusters, increasing ripeness ---
  const berryCols = [
    [mix(P.rust, P.night, 0.25), P.rust],
    [P.violet, mix(P.violet, P.ink, 0.35)],
    [mix(P.edge, P.night, 0.15), P.edge],
  ];
  for (let i = 0; i < 3; i++) {
    sprite(`berry_${i}`, 9, 9, (c) => {
      const [d, l] = berryCols[i];
      const spots = [[2, 4], [5, 3], [4, 6], [6, 6], [3, 2]];
      for (const [x, y] of spots) { c.fillRect(x, y, 2, 2, d); c.px(x, y, l); }
      c.line(4, 3, 5, 0, P.leafDark);
      c.px(3, 1, P.leaf); c.px(6, 1, P.leaf); c.px(2, 0, P.leaf);
      c.outline(P.outline);
    });
  }
  // --- mushrooms ---
  const capCols = [
    [P.rust, mix(P.rust, P.ink, 0.35)],
    [P.goldDim, P.gold],
    [mix(P.violet, P.ink, 0.2), P.skyIce],
  ];
  for (let i = 0; i < 3; i++) {
    sprite(`mushroom_${i}`, 10, 10, (c) => {
      const [cap, hi] = capCols[i];
      c.fillRect(3, 5, 3, 4, P.bandage);
      c.vline(5, 5, 8, mix(P.bandage, P.night, 0.3));
      c.hline(2, 6, 9, mix(P.bandage, P.night, 0.4));
      c.ellipse(4.5, 4, 4.5, 3, cap);
      c.hline(0, 8, 5, mix(cap, P.night, 0.4));
      c.px(2, 2, hi); c.px(3, 2, hi);
      if (i === 0) { c.px(6, 3, P.ink); c.px(1, 4, P.ink); c.px(4, 1, P.ink); }
      if (i === 2) c.dither(0, 3, 9, 2, hi, null, 'b25');
      // a second smaller cap
      c.ellipse(8, 7, 2, 1.5, cap);
      c.vline(8, 7, 9, P.bandage);
      c.outline(P.outline);
    });
  }
  // --- trout, three swim frames ---
  for (let i = 0; i < 3; i++) {
    sprite(`fish_${i}`, 13, 8, (c) => {
      const bend = [0, 1, -1][i];
      c.ellipse(6, 4, 5, 2.5, mix(P.edge, P.violet, 0.4));
      c.ellipse(6, 3, 4, 1.5, mix(P.skyIce, P.violet, 0.5));
      // tail flicks
      c.poly([[1, 4], [0, 2 + bend], [0, 6 + bend]], P.violet);
      // fins
      c.poly([[5, 2], [8, 2], [6, 0]], mix(P.violet, P.ink, 0.2));
      c.poly([[5, 6], [8, 6], [6, 7]], mix(P.violet, P.night, 0.2));
      // spots + eye
      c.px(6, 3, P.rust); c.px(8, 4, P.rust); c.px(4, 4, P.rust);
      c.px(10, 3, P.ink); c.px(10, 4, P.outline);
      c.px(12, 4, mix(P.edge, P.night, 0.2));
      c.outline(P.outline);
    });
  }
  // --- bear, 4-frame lumbering walk ---
  for (let i = 0; i < 4; i++) {
    sprite(`bear_walk_${i}`, 28, 18, (c) => {
      const th = (i / 4) * TAU;
      const bob = -Math.round(Math.abs(Math.sin(th * 2)));
      const B = '#4a3a33', BD = '#2c221e', BL = '#635044';
      const gy = 17;
      const leg = (x, ph, near) => {
        const t = th + ph * TAU;
        const fx = Math.round(x + 2.5 * Math.cos(t));
        const fy = Math.round(gy - Math.max(0, -Math.sin(t)) * 2);
        c.line(x, 11 + bob, fx, fy, near ? BD : mix(BD, P.night, 0.4), 3, 1);
        c.fillRect(fx, fy - 1, 4, 2, P.outline);
      };
      leg(18, 0, false); leg(6, 0.5, false);
      // hump-shouldered body
      c.ellipse(13, 9 + bob, 9, 5, B);
      c.fillRect(5, 5 + bob, 14, 7, B);
      c.ellipse(16, 6 + bob, 5, 3, BL); // shoulder hump
      c.ditherOver(4, 11 + bob, 18, 3, BD, 'b25');
      // head
      const hx = 21, hy = 5 + bob;
      c.ellipse(hx + 2, hy + 2, 4, 3.5, B);
      c.fillRect(hx + 4, hy + 2, 4, 3, mix(BL, P.canvasCol, 0.25)); // muzzle
      c.px(hx + 7, hy + 3, P.outline);
      c.px(hx + 3, hy + 1, P.outline); // eye
      c.circle(hx, hy - 1, 1.5, BD);   // ear
      c.circle(hx + 3, hy - 2, 1.5, BD);
      // stub tail
      c.px(4, 8 + bob, BD); c.px(3, 8 + bob, BD);
      leg(20, 0.25, true); leg(8, 0.75, true);
    });
  }
  // --- rattlesnake: coiled, then striking ---
  for (let i = 0; i < 2; i++) {
    sprite(`snake_${i}`, 16, 10, (c) => {
      const S = '#8a7a54', SD = '#54492f', SL = '#b3a173';
      if (i === 0) {
        // coiled
        c.ellipse(7, 7, 6.5, 2.5, S);
        c.ellipse(7, 5, 4.5, 2, S);
        c.hline(1, 13, 8, SD);
        for (let x = 2; x < 13; x += 3) { c.px(x, 6, SD); c.px(x + 1, 7, SD); }
        c.ellipse(11, 3, 2.5, 1.5, S);   // head raised
        c.px(13, 3, P.rust); c.px(12, 2, P.outline);
        c.vline(3, 2, 4, SL);            // rattle up
        c.px(3, 1, P.inkDim);
      } else {
        // striking
        c.ellipse(5, 7, 4.5, 2.5, S);
        c.line(6, 6, 12, 3, S, 2, 2);
        c.ellipse(13, 2, 2.5, 1.5, S);
        c.px(15, 2, P.rust); c.px(14, 1, P.outline);
        c.hline(1, 8, 8, SD);
        for (let x = 7; x < 13; x += 2) c.px(x, 5, SD);
        c.vline(1, 3, 5, SL); c.px(1, 2, P.inkDim); c.px(0, 3, P.inkDim);
      }
      c.px(2, 9, SL);
      c.outline(P.outline);
    });
  }
  // --- the forager (player sprite) ---
  bakeFigures('forager', 'forager_', false);
}

// =============================================================================
// 13. FORD MINIGAME SPRITES
// =============================================================================

function bakeFord() {
  // --- 32x16 tiling water, 4 scroll frames ---
  for (let i = 0; i < 4; i++) {
    sprite(`water_${i}`, 32, 16, (c) => {
      const off = i * 2;
      c.fillRect(0, 0, 32, 16, P.water);
      // depth bands, dithered (the only gradient tool we get)
      c.dither(0, 0, 32, 4, P.waterLite, null, 'b25');
      c.dither(0, 3, 32, 4, mix(P.water, P.waterLite, 0.45), null, 'b50');
      c.dither(0, 10, 32, 6, P.waterDark, null, 'b50');
      c.dither(0, 13, 32, 3, mix(P.waterDark, P.night, 0.35), null, 'b75');
      // travelling chop: three sine crests that wrap horizontally
      for (let x = 0; x < 32; x++) {
        const y1 = 3 + Math.round(1.5 + 1.5 * Math.sin((x + off) * 0.5));
        const y2 = 8 + Math.round(1.5 + 1.5 * Math.sin((x + off) * 0.32 + 2));
        const y3 = 12 + Math.round(1 + Math.sin((x - off) * 0.7 + 1));
        c.px(x, y1, P.waterLite);
        c.px(x, y2, mix(P.waterLite, P.foam, 0.4));
        c.px(x, y3, mix(P.water, P.waterLite, 0.5));
      }
      // whitecaps riding the top crest
      for (let x = (off % 8); x < 32; x += 8) {
        c.px(x, 3 + Math.round(1.5 + 1.5 * Math.sin((x + off) * 0.5)) - 1, P.foam);
        c.px(x + 1, 3 + Math.round(1.5 + 1.5 * Math.sin((x + 1 + off) * 0.5)) - 1, P.foam);
      }
    });
  }
  // --- packraft, 2 bob frames ---
  for (let i = 0; i < 2; i++) {
    sprite(`raft_${i}`, 26, 12, (c) => {
      const b = i;
      c.poly([[1, 8 + b], [4, 5 + b], [21, 5 + b], [24, 8 + b], [21, 10 + b], [4, 10 + b]], P.goldDim);
      c.poly([[5, 6 + b], [20, 6 + b], [20, 7 + b], [5, 7 + b]], P.gold);
      c.hline(2, 23, 9 + b, mix(P.goldDim, P.night, 0.4));
      // tube segments
      for (let x = 6; x < 21; x += 4) c.vline(x, 5 + b, 10 + b, mix(P.goldDim, P.night, 0.25));
      // dark interior + a lashed dry bag
      c.fillRect(7, 7 + b, 12, 2, P.dark2);
      c.fillRect(9, 5 + b, 4, 3, P.pack);
      c.px(9, 5 + b, P.bedroll);
      // paddle
      c.line(14, 3 + b, 22, 9 + b, P.pole);
      c.fillRect(22, 8 + b, 3, 3, P.metal);
      c.fillRect(12, 2 + b, 3, 2, P.metal);
      // splash at the bow
      c.px(25, 7 + b, P.foam); c.px(24, 6 + b, P.foam); c.px(0, 9 + b, P.foam);
      c.outline(P.outline);
    });
  }
  // --- stepping stones ---
  sprite('rock_0', 12, 8, (c) => {
    c.poly([[0, 7], [1, 3], [5, 1], [9, 2], [11, 6], [11, 7]], P.stone);
    c.poly([[2, 3], [5, 2], [8, 3], [5, 5]], P.stoneLite);
    c.dither(0, 5, 12, 3, P.stoneDark, null, 'b25');
    c.hline(0, 11, 7, P.foam);
  });
  sprite('rock_1', 16, 10, (c) => {
    c.poly([[0, 9], [2, 4], [6, 1], [12, 2], [15, 7], [15, 9]], P.stone);
    c.poly([[3, 4], [7, 2], [11, 3], [7, 6]], P.stoneLite);
    c.line(11, 3, 13, 8, P.stoneDark);
    c.dither(0, 6, 16, 4, P.stoneDark, null, 'b25');
    c.hline(0, 15, 9, P.foam);
  });
  sprite('rock_2', 9, 6, (c) => {
    c.poly([[0, 5], [1, 2], [4, 0], [8, 3], [8, 5]], P.stone);
    c.px(2, 2, P.stoneLite); c.px(3, 1, P.stoneLite);
    c.dither(0, 3, 9, 3, P.stoneDark, null, 'b25');
    c.hline(0, 8, 5, P.foam);
  });
}

// =============================================================================
// 14. WEATHER & SKY
// =============================================================================

function bakeWeather() {
  // --- rain streaks ---
  for (let i = 0; i < 2; i++) {
    sprite(`rain_${i}`, 3, 9, (c) => {
      const col = i ? mix(P.skyIce, P.violet, 0.35) : P.skyIce;
      c.line(2, 0, 0, 8, col);
      c.px(1, 4, mix(col, P.ink, 0.4));
      if (i) c.px(0, 8, P.foam);
    });
  }
  // --- falling snow, three sizes ---
  sprite('snowflake_0', 3, 3, (c) => { c.px(1, 1, P.snow); c.px(0, 1, mix(P.snow, P.skyIce, 0.6)); c.px(1, 0, mix(P.snow, P.skyIce, 0.6)); });
  sprite('snowflake_1', 5, 5, (c) => {
    c.hline(0, 4, 2, P.snow); c.vline(2, 0, 4, P.snow);
    c.px(0, 0, P.skyIce); c.px(4, 4, P.skyIce); c.px(0, 4, P.skyIce); c.px(4, 0, P.skyIce);
    c.px(2, 2, P.ink);
  });
  sprite('snowflake_2', 7, 7, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      c.line(3, 3, 3 + Math.cos(a) * 3, 3 + Math.sin(a) * 3, P.snow);
      c.px(Math.round(3 + Math.cos(a) * 2 + Math.cos(a + 1.05)), Math.round(3 + Math.sin(a) * 2 + Math.sin(a + 1.05)), P.skyIce);
    }
    c.px(3, 3, P.ink);
  });
  // --- clouds: flat silhouettes, four sizes ---
  const clouds = [[26, 9, 3], [34, 11, 5], [20, 7, 2], [42, 13, 7]];
  clouds.forEach(([w, h, seed], i) => {
    sprite(`cloud_${i}`, w, h, (c) => {
      const R = rng(500 + seed);
      const base = h - 2;
      const lobes = 3 + i;
      c.fillRect(2, base - 1, w - 4, 2, P.ink);
      for (let k = 0; k < lobes; k++) {
        const cx = 3 + Math.round(((w - 7) * k) / Math.max(1, lobes - 1));
        const rx = 3 + Math.round(R() * 3);
        const ry = 2 + Math.round(R() * (h - 5));
        c.ellipse(cx + rx / 2, base - ry + 1, rx, ry, P.ink);
      }
      // dithered underside so it reads as volume without a gradient
      c.ditherOver(0, base - 1, w, 3, mix(P.ink, P.violet, 0.4), 'b50');
      c.ditherOver(0, base, w, 2, mix(P.violet, P.ink, 0.25), 'b75');
      c.hline(0, w - 1, h - 1, null);
    });
  });
  // --- sun ---
  sprite('sun', 18, 18, (c) => {
    c.circle(8.5, 8.5, 6, P.gold);
    c.circle(8.5, 8.5, 4, mix(P.gold, P.ink, 0.55));
    c.ditherOver(0, 9, 18, 8, P.goldDim, 'b25');
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.px(Math.round(8.5 + Math.cos(a) * 8), Math.round(8.5 + Math.sin(a) * 8), P.gold);
      c.px(Math.round(8.5 + Math.cos(a) * 7), Math.round(8.5 + Math.sin(a) * 7), P.goldDim);
    }
  });
  // --- moon: waning gibbous with maria ---
  sprite('moon', 16, 16, (c) => {
    c.circle(7.5, 7.5, 7, P.ink);
    c.circle(7.5, 7.5, 6, mix(P.ink, P.skyIce, 0.35));
    // bite out the top-right for the phase
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 11, dy = y - 4;
      if (dx * dx + dy * dy < 42) c.erase(x, y);
    }
    c.px(5, 9, mix(P.violet, P.ink, 0.35));
    c.px(6, 10, mix(P.violet, P.ink, 0.35));
    c.px(4, 6, mix(P.violet, P.ink, 0.4));
    c.px(8, 12, mix(P.violet, P.ink, 0.4));
    c.px(3, 11, mix(P.violet, P.ink, 0.45));
  });
  // --- stars, two twinkle phases ---
  sprite('star_0', 3, 3, (c) => { c.px(1, 1, P.ink); });
  sprite('star_1', 3, 3, (c) => {
    c.px(1, 1, P.ink);
    c.px(0, 1, mix(P.ink, P.violet, 0.45));
    c.px(2, 1, mix(P.ink, P.violet, 0.45));
    c.px(1, 0, mix(P.ink, P.violet, 0.45));
    c.px(1, 2, mix(P.ink, P.violet, 0.45));
  });
}

// =============================================================================
// 15. BITMAP FONT — 5x7
// -----------------------------------------------------------------------------
// Grid rows 0..6. Cap height is rows 0..5, the BASELINE IS ROW 5, and row 6 is
// reserved for descenders (comma, semicolon, $ tail). Stroke weight is 1px
// everywhere; no glyph touches the cell edge on both sides at once except the
// full-width bars (E, T, Z, digits), which keeps 1px letter-spacing legible.
//
// Lowercase is deliberately NOT drawn: a 4-row x-height at this size turns
// a/e/s/o into mush. `font_a`..`font_z` are emitted as ALIASES onto the
// uppercase rects, so drawText() can be handed mixed-case strings safely.
// atlas.json records this under meta.font.lowercase.
// =============================================================================

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '.....'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '####.', '.....'],
  C: ['.###.', '#...#', '#....', '#....', '#...#', '.###.', '.....'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '####.', '.....'],
  E: ['#####', '#....', '####.', '#....', '#....', '#####', '.....'],
  F: ['#####', '#....', '####.', '#....', '#....', '#....', '.....'],
  G: ['.###.', '#...#', '#....', '#..##', '#...#', '.####', '.....'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '.....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '#####', '.....'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '.##..', '.....'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#', '.....'],
  L: ['#....', '#....', '#....', '#....', '#....', '#####', '.....'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '.....'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '.....'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '.###.', '.....'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '.....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#..#.', '.##.#', '.....'],
  R: ['####.', '#...#', '#...#', '####.', '#..#.', '#...#', '.....'],
  S: ['.###.', '#....', '.###.', '....#', '#...#', '.###.', '.....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '.....'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..', '.....'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#', '.....'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '.....'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#####', '.....'],

  0: ['.###.', '#..##', '#.#.#', '##..#', '#...#', '.###.', '.....'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '.###.', '.....'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#####', '.....'],
  3: ['####.', '....#', '.###.', '....#', '....#', '####.', '.....'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '.....'],
  5: ['#####', '#....', '####.', '....#', '#...#', '.###.', '.....'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '.###.', '.....'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '.....'],
  8: ['.###.', '#...#', '.###.', '#...#', '#...#', '.###.', '.....'],
  9: ['.###.', '#...#', '#...#', '.####', '...#.', '.##..', '.....'],

  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '.....'],
  ',': ['.....', '.....', '.....', '.....', '..#..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '.....', '..#..', '.....'],
  '?': ['.###.', '#...#', '...#.', '..#..', '.....', '..#..', '.....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  ':': ['.....', '..#..', '.....', '.....', '..#..', '.....', '.....'],
  ';': ['.....', '..#..', '.....', '.....', '..#..', '..#..', '.#...'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '%': ['.....', '##..#', '##.#.', '..#..', '.#.##', '#..##', '.....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '/': ['....#', '...#.', '..#..', '..#..', '.#...', '#....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '..#..', '...#.', '.....'],
  ')': ['.#...', '..#..', '...#.', '...#.', '..#..', '.#...', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],

  // additive extras, so a stray character in a data string never renders as
  // the missing-frame placeholder. The renderer is not required to use them.
  '&': ['.##..', '#..#.', '.##..', '#..#.', '#...#', '.###.', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '<': ['...#.', '..#..', '.#...', '.#...', '..#..', '...#.', '.....'],
  '>': ['.#...', '..#..', '...#.', '...#.', '..#..', '.#...', '.....'],
};

const FONT_SPEC_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\'":;-+%$/() ';

/** friendly aliases so `frame('font_space')` etc. also resolve */
const FONT_ALIAS_NAMES = {
  ' ': 'space', '.': 'period', ',': 'comma', '!': 'bang', '?': 'question',
  "'": 'apos', '"': 'quote', ':': 'colon', ';': 'semi', '-': 'dash',
  '+': 'plus', '%': 'percent', $: 'dollar', '/': 'slash', '(': 'lparen',
  ')': 'rparen', '&': 'amp', '*': 'star', '=': 'eq', '#': 'hash',
  _: 'underscore', '<': 'lt', '>': 'gt',
};

function bakeFont() {
  for (const [ch, rows] of Object.entries(FONT)) {
    if (rows.length !== 7 || rows.some((r) => r.length !== 5)) {
      throw new Error(`font glyph "${ch}" is not 5x7`);
    }
    sprite(`font_${ch}`, 5, 7, (c) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        if (rows[y][x] === '#') c.px(x, y, P.ink);
      }
    }, 'font');
    const nice = FONT_ALIAS_NAMES[ch];
    if (nice) alias(`font_${nice}`, `font_${ch}`);
  }
  // lowercase -> uppercase aliases (see the header note)
  for (let i = 0; i < 26; i++) {
    const up = String.fromCharCode(65 + i);
    alias(`font_${up.toLowerCase()}`, `font_${up}`);
  }
  // every character the SPEC demands must have a glyph
  for (const ch of FONT_SPEC_CHARS) {
    if (!FRAME_INDEX.has(`font_${ch}`)) throw new Error(`font is missing required char "${ch}"`);
  }
}

// =============================================================================
// 16. SHELF PACKER
// =============================================================================

function packShelves(recs, maxW, pad = 1) {
  // tallest first, then widest, then by name — fully deterministic
  const order = recs.slice().sort((a, b) =>
    (b.canvas.h - a.canvas.h) || (b.canvas.w - a.canvas.w) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let x = pad, y = pad, shelfH = 0, usedW = 0;
  const placed = [];
  for (const r of order) {
    const w = r.canvas.w, h = r.canvas.h;
    if (w + pad * 2 > maxW) throw new Error(`frame ${r.name} (${w}px) is wider than the atlas (${maxW}px)`);
    if (x + w + pad > maxW) { x = pad; y += shelfH + pad; shelfH = 0; }
    placed.push({ rec: r, x, y, w, h });
    x += w + pad;
    shelfH = Math.max(shelfH, h);
    usedW = Math.max(usedW, x);
  }
  const height = y + shelfH + pad;
  return { placed, width: Math.min(maxW, Math.max(8, usedW + pad - pad)), height };
}

function compose(recs, maxW) {
  const { placed, height } = packShelves(recs, maxW);
  // round the sheet to a tidy multiple of 8 in both axes
  const W = maxW;
  const H = Math.ceil(height / 8) * 8;
  const sheet = new Canvas(W, H);
  for (const p of placed) sheet.blit(p.rec.canvas, p.x, p.y);
  return { sheet, placed, W, H };
}

// =============================================================================
// 17. ANIMATIONS (SPEC §6.2 atlas.json `anims`)
// =============================================================================

const ANIM_DEFS = [
  ['hiker_walk', 'hiker_walk_', 6, 10, true],
  ['hiker_idle', 'hiker_idle_', 2, 2, true],
  ['hiker_rest', 'hiker_rest_', 2, 1.5, true],
  ['hiker_sick', 'hiker_sick_', 2, 3, true],
  ['leader_walk', 'leader_walk_', 6, 10, true],
  ['mule_walk', 'mule_walk_', 6, 10, true],
  ['mule_idle', 'mule_idle_', 2, 2, true],
  ['cart_roll', 'cart_', 4, 12, true],
  ['campfire', 'prop_campfire_', 4, 8, true],
  ['bear_walk', 'bear_walk_', 4, 8, true],
  ['forager_walk', 'forager_walk_', 4, 10, true],
  ['forager_grab', 'forager_grab_', 2, 8, false],
  ['snake_rattle', 'snake_', 2, 5, true],
  ['fish_swim', 'fish_', 3, 6, true],
  ['water_flow', 'water_', 4, 8, true],
  ['raft_bob', 'raft_', 2, 3, true],
  ['rain_fall', 'rain_', 2, 14, true],
  ['star_twinkle', 'star_', 2, 2, true],
  ['key_hiker_walk', 'key_hiker_walk_', 6, 10, true],
  ['key_hiker_idle', 'key_hiker_idle_', 2, 2, true],
  ['key_hiker_rest', 'key_hiker_rest_', 2, 1.5, true],
  ['key_hiker_sick', 'key_hiker_sick_', 2, 3, true],
  ['key_leader_walk', 'key_leader_walk_', 6, 10, true],
  ['key_forager_walk', 'key_forager_walk_', 4, 10, true],
  ['key_forager_grab', 'key_forager_grab_', 2, 8, false],
];

// =============================================================================
// 18. MAIN
// =============================================================================

async function main() {
  const { ids: itemIds, source: itemSource } = await resolveItemIds();

  // ---- bake everything ----
  bakeFigures('hiker', 'hiker_', false);
  bakeFigures('leader', 'leader_', false);
  for (let i = 0; i < 6; i++) sprite(`mule_walk_${i}`, 24, 20, (c) => drawMule(c, (i / 6) * TAU));
  sprite('mule_idle_0', 24, 20, (c) => drawMule(c, 0, { idle: true }));
  sprite('mule_idle_1', 24, 20, (c) => drawMule(c, Math.PI * 0.5, { idle: true }));
  sprite('mule_sick_0', 24, 20, (c) => drawMule(c, 0, { idle: true, sick: true }));
  for (let i = 0; i < 4; i++) sprite(`cart_${i}`, 34, 24, (c) => drawCart(c, i));
  bakeProps();
  bakeLandmarks();
  bakeItems(itemIds);
  bakeUI();
  bakeForage();
  bakeFord();
  bakeWeather();
  // tint-key variants (never drawn as-is; source art for tintedFrame())
  bakeFigures('hiker', 'key_hiker_', true);
  bakeFigures('leader', 'key_leader_', true);
  bakeFigures('forager', 'key_forager_', true);
  bakeFont();

  // ---- pack ----
  const mainRecs = FRAMES.filter((f) => f.img === 'main');
  const fontRecs = FRAMES.filter((f) => f.img === 'font');
  const mainSheet = compose(mainRecs, 320);
  const fontSheet = compose(fontRecs, 128);

  // ---- atlas.json ----
  const frames = {};
  for (const p of mainSheet.placed) frames[p.rec.name] = { img: 'main', x: p.x, y: p.y, w: p.w, h: p.h };
  for (const p of fontSheet.placed) frames[p.rec.name] = { img: 'font', x: p.x, y: p.y, w: p.w, h: p.h };
  // aliases share rects with their target
  for (const a of ALIASES) {
    if (!frames[a.target]) throw new Error(`alias ${a.name} -> missing ${a.target}`);
    if (frames[a.name]) throw new Error(`alias ${a.name} collides with a real frame`);
    frames[a.name] = { ...frames[a.target] };
  }
  // stable key order: frames come out sorted so the JSON diff stays readable
  const sortedFrames = {};
  for (const k of Object.keys(frames).sort()) sortedFrames[k] = frames[k];

  const anims = {};
  for (const [name, prefix, count, fps, loop] of ANIM_DEFS) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const fn = `${prefix}${i}`;
      if (!sortedFrames[fn]) throw new Error(`anim ${name} references missing frame ${fn}`);
      list.push(fn);
    }
    anims[name] = { frames: list, fps, loop };
  }

  const atlas = {
    images: { main: 'sprites/main.png', font: 'sprites/font.png' },
    frames: sortedFrames,
    anims,
    tintKeys: {
      shirt: SHIRT_KEY,
      skin: SKIN_KEY,
      keyPrefix: 'key_',
      defaults: { shirt: P.shirt, skin: P.skin },
      note:
        'Frames named key_<frame> are identical to <frame> but with the shirt drawn in ' +
        `${SHIRT_KEY} and the skin in ${SKIN_KEY}. Feed those to tintedFrame(name, hex) ` +
        'and replace the two key colours per party member. They are source art only and ' +
        'must never be blitted to the screen unrecoloured. The plain frames already ship ' +
        `with sensible defaults (shirt ${P.shirt}, skin ${P.skin}).`,
    },
    meta: {
      generator: 'scripts/bake-assets.mjs',
      grid: 1,
      baseW: 320,
      baseH: 180,
      itemIdSource: itemSource,
      palette: {
        ink: P.ink, inkDim: P.inkDim, night: P.night, panel: P.panel, panel2: P.panel2,
        edge: P.edge, gold: P.gold, goldDim: P.goldDim, rust: P.rust, sage: P.sage,
        skyIce: P.skyIce, violet: P.violet,
      },
      font: {
        cell: [5, 7],
        baselineRow: 5,
        descenderRow: 6,
        advance: 6,
        lineHeight: 9,
        lowercase: 'aliased-to-uppercase (a 4-row x-height is not legible at 5x7)',
        aliases: 'font_space, font_period, font_comma, ... resolve to the same rects as the literal-character names',
      },
      sheets: {
        main: { w: mainSheet.W, h: mainSheet.H, frames: mainSheet.placed.length },
        font: { w: fontSheet.W, h: fontSheet.H, frames: fontSheet.placed.length },
      },
    },
  };

  // ---- write ----
  fs.mkdirSync(OUT_SPRITES, { recursive: true });
  const mainPng = encodePNG(mainSheet.W, mainSheet.H, mainSheet.sheet.data);
  const fontPng = encodePNG(fontSheet.W, fontSheet.H, fontSheet.sheet.data);
  fs.writeFileSync(path.join(OUT_SPRITES, 'main.png'), mainPng);
  fs.writeFileSync(path.join(OUT_SPRITES, 'font.png'), fontPng);
  fs.writeFileSync(path.join(OUT_ASSETS, 'atlas.json'), JSON.stringify(atlas, null, 2) + '\n');

  // ---- self-check ----
  let worst = 0;
  for (const [name, f] of Object.entries(sortedFrames)) {
    const sheet = f.img === 'main' ? mainSheet : fontSheet;
    if (f.w <= 0 || f.h <= 0) throw new Error(`frame ${name} has zero size`);
    if (f.x < 0 || f.y < 0 || f.x + f.w > sheet.W || f.y + f.h > sheet.H) {
      throw new Error(`frame ${name} is out of bounds of ${f.img}.png`);
    }
    worst = Math.max(worst, f.y + f.h);
  }

  const nFrames = Object.keys(sortedFrames).length;
  console.log(`main.png  ${mainSheet.W}x${mainSheet.H}  ${(mainPng.length / 1024).toFixed(1)} KB  (${mainSheet.placed.length} frames)`);
  console.log(`font.png  ${fontSheet.W}x${fontSheet.H}  ${(fontPng.length / 1024).toFixed(1)} KB  (${fontSheet.placed.length} glyphs)`);
  console.log(`atlas.json  ${nFrames} frame names (${ALIASES.length} aliases), ${Object.keys(anims).length} anims`);
  console.log(`item icons from: ${itemSource}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
