// NORTHBOUND — sprite atlas loader + draw API.
//
// Owns every pixel that comes off a PNG. Nothing else in the game touches an
// <img>. The atlas is described by /assets/atlas.json:
//
//   { "images": { "main": "sprites/main.png", "font": "sprites/font.png" },
//     "frames": { "hiker_walk_0": { "img": "main", "x":0, "y":0, "w":16, "h":24 } },
//     "anims":  { "hiker_walk": { "frames": ["hiker_walk_0", ...], "fps":10, "loop":true } },
//     "tintKeys": { "skin": "#ff00ff", "hair": "#00ff00", "shirt": "#00ffff" } }
//
// `tintKeys` are the reserved key colours the baker paints into the hiker/leader
// sprites. `recolorFrame(name, {skin,hair,shirt})` swaps them for a party member's
// portrait colours on an offscreen canvas and caches the result, so a five-person
// caravan costs five one-time recolours instead of per-frame pixel work.
//
// DEGRADATION CONTRACT: this module never throws and never writes to the console.
// If the atlas cannot be fetched, or a frame name is unknown, every accessor
// returns the PLACEHOLDER frame — an 8x8 magenta/black checkerboard on its own
// canvas — so the game keeps running and the gap is obvious on screen.
// `hasFrame(name)` is the way to ask politely before drawing.

export const BASE_W = 320;
export const BASE_H = 180;

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------

let images = Object.create(null);      // id -> ImageBitmap | HTMLImageElement | canvas
let frames = Object.create(null);      // name -> {img, x, y, w, h, id}
let anims = Object.create(null);       // name -> {frames:[names], fps, loop}
let tintKeys = null;                   // {slot: [r,g,b]} or null
let tintKeyPrefix = '';                // frames carrying the key colours are `<prefix><name>`
let loaded = false;
let loadPromise = null;

const tintCache = new Map();           // "name|#hex"        -> frame
const imageTintCache = new Map();      // image -> Map(hex -> canvas)
const recolorCache = new Map();        // "name|a|b|c"       -> frame
const shadowCache = new Map();         // "name"             -> frame (solid black)

// ---------------------------------------------------------------------------
// offscreen canvas helper (no DOM queries; OffscreenCanvas when available)
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch { /* fall through */ }
  }
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return null;
}

function ctx2d(cv) {
  if (!cv) return null;
  try { return cv.getContext('2d', { willReadFrequently: true }); } catch { return null; }
}

// ---------------------------------------------------------------------------
// the placeholder frame
// ---------------------------------------------------------------------------

const PLACEHOLDER = (() => {
  const cv = makeCanvas(8, 8);
  const c = ctx2d(cv);
  if (c) {
    c.fillStyle = '#ff00ff'; c.fillRect(0, 0, 8, 8);
    c.fillStyle = '#000000';
    for (let y = 0; y < 8; y += 2) for (let x = 0; x < 8; x += 2) c.fillRect(x + (y >> 1 & 1), y, 2, 2);
  }
  return { img: cv, x: 0, y: 0, w: 8, h: 8, id: '__placeholder', missing: true };
})();

/** The documented stand-in returned for any unknown frame. */
export function placeholderFrame() { return PLACEHOLDER; }

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

function loadImage(url) {
  return new Promise((resolve) => {
    if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
      fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then((b) => createImageBitmap(b))
        .then(resolve)
        .catch(() => fallback());
      return;
    }
    fallback();
    function fallback() {
      if (typeof Image === 'undefined') { resolve(null); return; }
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url;
    }
  });
}

/**
 * Fetch atlas.json plus every PNG it references.
 * Resolves (never rejects) to true on success, false if the atlas is unusable.
 */
export async function loadAtlas(url = '/assets/atlas.json') {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let json = null;
    try {
      const res = await fetch(url);
      if (res && res.ok) json = await res.json();
    } catch { json = null; }
    if (!json || typeof json !== 'object') { loaded = false; return false; }

    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const imgSrc = json.images || {};
    const ids = Object.keys(imgSrc);
    const got = await Promise.all(ids.map((id) => loadImage(resolveUrl(base, imgSrc[id]))));

    images = Object.create(null);
    for (let i = 0; i < ids.length; i++) if (got[i]) images[ids[i]] = got[i];

    frames = Object.create(null);
    const fsrc = json.frames || {};
    for (const name in fsrc) {
      const f = fsrc[name];
      if (!f) continue;
      const img = images[f.img] || images[ids[0]];
      if (!img) continue;
      frames[name] = { img, x: f.x | 0, y: f.y | 0, w: f.w | 0, h: f.h | 0, id: name };
    }

    anims = Object.create(null);
    const asrc = json.anims || {};
    for (const name in asrc) {
      const a = asrc[name];
      if (!a || !Array.isArray(a.frames) || !a.frames.length) continue;
      anims[name] = { frames: a.frames.slice(), fps: a.fps > 0 ? a.fps : 10, loop: a.loop !== false };
    }
    deriveImplicitAnims();

    tintKeys = parseTintKeys(json.tintKeys);
    tintKeyPrefix = (json.tintKeys && typeof json.tintKeys.keyPrefix === 'string') ? json.tintKeys.keyPrefix : '';

    tintCache.clear(); recolorCache.clear(); shadowCache.clear(); imageTintCache.clear();
    loaded = Object.keys(frames).length > 0;
    return loaded;
  })();
  return loadPromise;
}

function resolveUrl(base, rel) {
  if (!rel) return base;
  if (/^(https?:)?\/\//.test(rel) || rel.startsWith('/')) return rel;
  return base + rel;
}

// Any run of `prefix_0, prefix_1, ...` frames becomes an implicit animation, so
// drawAnim('hiker_walk', t, ...) works even when atlas.json omits `anims`.
function deriveImplicitAnims() {
  const groups = Object.create(null);
  for (const name in frames) {
    const m = /^(.*)_(\d+)$/.exec(name);
    if (!m) continue;
    (groups[m[1]] || (groups[m[1]] = [])).push([+m[2], name]);
  }
  for (const prefix in groups) {
    if (anims[prefix]) continue;
    const list = groups[prefix].sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    if (list.length < 2) continue;
    anims[prefix] = { frames: list, fps: 10, loop: true };
  }
}

function parseTintKeys(raw) {
  if (!raw) return null;
  const out = Object.create(null);
  let n = 0;
  if (Array.isArray(raw)) {
    const slots = ['skin', 'hair', 'shirt', 'pack'];
    for (let i = 0; i < raw.length && i < slots.length; i++) {
      const rgb = parseHex(raw[i]); if (rgb) { out[slots[i]] = rgb; n++; }
    }
  } else {
    for (const k in raw) { const rgb = parseHex(raw[k]); if (rgb) { out[k] = rgb; n++; } }
  }
  return n ? out : null;
}

export function isLoaded() { return loaded; }
export function tintKeySlots() { return tintKeys ? Object.keys(tintKeys) : []; }

// ---------------------------------------------------------------------------
// frame access
// ---------------------------------------------------------------------------

/** True if the atlas actually contains this frame. */
export function hasFrame(name) { return !!frames[name]; }

/** {img,x,y,w,h}. Unknown names return the magenta placeholder (silently). */
export function frame(name) {
  const f = frames[name];
  return f || PLACEHOLDER;
}

/** The animation record {frames, fps, loop} or null. */
export function anim(name) { return anims[name] || null; }

/** Resolve an animation to the frame name shown at time `t` (seconds). */
export function animFrameName(animName, t) {
  const a = anims[animName];
  if (!a) return animName;
  const n = a.frames.length;
  let i = Math.floor((t < 0 ? 0 : t) * a.fps);
  i = a.loop ? ((i % n) + n) % n : (i >= n ? n - 1 : i);
  return a.frames[i];
}

/** Every frame name in the atlas (fresh array; not for the hot path). */
export function frameNames() { return Object.keys(frames); }

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

function parseHex(c) {
  if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
  if (typeof c !== 'string') return null;
  let s = c.trim();
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length === 8) s = s.slice(0, 6);
  if (s.length !== 6 || /[^0-9a-fA-F]/.test(s)) {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { const p = m[1].split(',').map(Number); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
    return null;
  }
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// tinting: solid silhouette recolour of a single frame, cached
// ---------------------------------------------------------------------------

/**
 * A copy of `name` where every opaque pixel becomes `hex` (a flat silhouette).
 * Cached by frame+colour. Returns the placeholder for unknown frames.
 */
export function tintedFrame(name, hex) {
  const src = frames[name];
  if (!src) return PLACEHOLDER;
  const key = name + '|' + hex;
  const hit = tintCache.get(key);
  if (hit) return hit;

  const cv = makeCanvas(src.w, src.h);
  const c = ctx2d(cv);
  if (!c) return src;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, src.w, src.h);
  c.drawImage(src.img, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = hex;
  c.fillRect(0, 0, src.w, src.h);
  c.globalCompositeOperation = 'source-over';

  const out = { img: cv, x: 0, y: 0, w: src.w, h: src.h, id: key };
  tintCache.set(key, out);
  return out;
}

/** Solid-black copy of a frame — used for drop shadows and depth silhouettes. */
export function shadowFrame(name) {
  const hit = shadowCache.get(name);
  if (hit) return hit;
  const out = tintedFrame(name, '#000000');
  shadowCache.set(name, out);
  return out;
}

/**
 * A whole source image recoloured to `hex` (every opaque pixel). text.js uses
 * this to build one tinted font sheet per colour instead of tinting per glyph.
 */
export function tintedImage(img, hex) {
  if (!img) return null;
  let per = imageTintCache.get(img);
  if (!per) { per = new Map(); imageTintCache.set(img, per); }
  const hit = per.get(hex);
  if (hit) return hit;
  const w = img.width | 0, h = img.height | 0;
  const cv = makeCanvas(w, h);
  const c = ctx2d(cv);
  if (!c) return img;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = hex;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  per.set(hex, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// key-colour recolouring (portraits)
// ---------------------------------------------------------------------------

// A pixel belongs to a key colour if it points the same direction in RGB space
// (same hue/saturation) regardless of brightness, so the baker's shading ramps
// come along for the ride. The replacement keeps the pixel's brightness ratio.
const DIR_TOL = 0.985;

function unit(rgb, out) {
  const len = Math.sqrt(rgb[0] * rgb[0] + rgb[1] * rgb[1] + rgb[2] * rgb[2]) || 1;
  out[0] = rgb[0] / len; out[1] = rgb[1] / len; out[2] = rgb[2] / len;
  return len;
}

/**
 * Recolour a frame's tint-key pixels. `colors` maps tintKey slot names to hex,
 * e.g. {skin:'#e8b98c', hair:'#31221a', shirt:'#8fd0a4'}. Cached by frame+colours.
 * With no tintKeys in the atlas this is a no-op and returns the source frame.
 */
export function recolorFrame(name, colors) {
  const plain = frames[name];
  // Prefer the key-coloured twin (`key_<name>`): that is the copy with the shirt and
  // skin painted in the reserved key colours that this function replaces. Falling back
  // to the plain frame would make every recolour a silent no-op.
  const src = (tintKeyPrefix && frames[tintKeyPrefix + name]) || plain;
  if (!src) return PLACEHOLDER;
  if (!tintKeys || !colors) return plain || src;

  let key = name;
  for (const slot in tintKeys) key += '|' + (colors[slot] || '-');
  const hit = recolorCache.get(key);
  if (hit) return hit;

  const cv = makeCanvas(src.w, src.h);
  const c = ctx2d(cv);
  if (!c) return src;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, src.w, src.h);
  c.drawImage(src.img, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);

  let data;
  try { data = c.getImageData(0, 0, src.w, src.h); } catch { return src; }
  const px = data.data;

  // pre-resolve the slots we actually have replacements for
  const kd = [], kl = [], tg = [];
  const tmp = [0, 0, 0];
  for (const slot in tintKeys) {
    const to = parseHex(colors[slot]);
    if (!to) continue;
    const from = tintKeys[slot];
    const len = unit(from, tmp);
    kd.push(tmp[0], tmp[1], tmp[2]);
    kl.push(len);
    tg.push(to[0], to[1], to[2]);
  }
  const nk = kl.length;
  if (nk) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 8) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const len = Math.sqrt(r * r + g * g + b * b) || 1;
      const ur = r / len, ug = g / len, ub = b / len;
      for (let k = 0; k < nk; k++) {
        const d = ur * kd[k * 3] + ug * kd[k * 3 + 1] + ub * kd[k * 3 + 2];
        if (d < DIR_TOL) continue;
        const ratio = len / kl[k];
        px[i] = clamp255(tg[k * 3] * ratio);
        px[i + 1] = clamp255(tg[k * 3 + 1] * ratio);
        px[i + 2] = clamp255(tg[k * 3 + 2] * ratio);
        break;
      }
    }
    c.putImageData(data, 0, 0);
  }

  const out = { img: cv, x: 0, y: 0, w: src.w, h: src.h, id: key };
  recolorCache.set(key, out);
  return out;
}

function clamp255(v) { v = v + 0.5 | 0; return v < 0 ? 0 : v > 255 ? 255 : v; }

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

/**
 * draw(ctx, name, x, y, opts)
 *   flip    — mirror horizontally about the sprite's own box
 *   alpha   — 0..1
 *   tint    — hex; draws the flat silhouette instead of the art
 *   recolor — {skin,hair,shirt} tint-key replacement
 *   scale   — integer upscale (1 by default; kept integral to stay on the grid)
 *   w,h     — explicit destination size (overrides scale)
 * All destination coordinates are floored to whole pixels.
 */
export function draw(ctx, name, x, y, opts) {
  const f = opts && opts.recolor ? recolorFrame(name, opts.recolor)
    : opts && opts.tint ? tintedFrame(name, opts.tint)
      : frames[name] || PLACEHOLDER;
  drawFrame(ctx, f, x, y, opts);
  return f;
}

/** Same as draw() but with an already-resolved frame object. */
export function drawFrame(ctx, f, x, y, opts) {
  if (!f || !f.img) return;
  const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
  if (alpha <= 0.004) return;
  const s = opts && opts.scale ? opts.scale : 1;
  const dw = opts && opts.w ? opts.w | 0 : Math.max(1, (f.w * s) | 0);
  const dh = opts && opts.h ? opts.h | 0 : Math.max(1, (f.h * s) | 0);
  const dx = x | 0, dy = y | 0;

  const oldA = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = oldA * alpha;

  if (opts && opts.flip) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  }

  if (alpha !== 1) ctx.globalAlpha = oldA;
}

/** drawAnim(ctx, 'hiker_walk', tSeconds, x, y, opts) */
export function drawAnim(ctx, animName, t, x, y, opts) {
  return draw(ctx, animFrameName(animName, t), x, y, opts);
}

/**
 * Nine-slice panel from ui_frame_* (8x8 tiles). Silently no-ops if the frames
 * are missing, so callers can fall back to a plain rect.
 */
export function drawPanel(ctx, x, y, w, h, opts) {
  if (!frames.ui_frame_c) return false;
  const T = 8;
  x |= 0; y |= 0; w |= 0; h |= 0;
  const oldA = ctx.globalAlpha;
  if (opts && opts.alpha !== undefined) ctx.globalAlpha = oldA * opts.alpha;
  for (let yy = y + T; yy < y + h - T; yy += T)
    for (let xx = x + T; xx < x + w - T; xx += T) blit('ui_frame_c', xx, yy, Math.min(T, x + w - T - xx), Math.min(T, y + h - T - yy));
  for (let xx = x + T; xx < x + w - T; xx += T) {
    const cw = Math.min(T, x + w - T - xx);
    blit('ui_frame_t', xx, y, cw, T); blit('ui_frame_b', xx, y + h - T, cw, T);
  }
  for (let yy = y + T; yy < y + h - T; yy += T) {
    const ch = Math.min(T, y + h - T - yy);
    blit('ui_frame_l', x, yy, T, ch); blit('ui_frame_r', x + w - T, yy, T, ch);
  }
  blit('ui_frame_tl', x, y, T, T);
  blit('ui_frame_tr', x + w - T, y, T, T);
  blit('ui_frame_bl', x, y + h - T, T, T);
  blit('ui_frame_br', x + w - T, y + h - T, T, T);
  ctx.globalAlpha = oldA;
  return true;

  function blit(n, dx, dy, dw, dh) {
    const f = frames[n]; if (!f || dw <= 0 || dh <= 0) return;
    ctx.drawImage(f.img, f.x, f.y, dw, dh, dx | 0, dy | 0, dw, dh);
  }
}
