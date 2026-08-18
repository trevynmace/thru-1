// ============================================================================
// NORTHBOUND — minigames/forage.js
//
// The "hunting" minigame, reskinned: a 45-second side-on foraging field at
// 320x180. You walk a shallow 3/4 depth band picking berries, mushrooms and
// trout out of a creek, while a bear works the treeline and a rattler sits in
// the sun. You can only carry 100 lb back to camp.
//
//   export function runForage(canvas, opts) -> Promise<{ lbs, log }>
//   opts: { quality, biome, rng, bonus, audio, duration, timeScale, autoplay }
//
// Contract notes (SPEC §7.1):
//  - resolves EXACTLY once, always; Esc bails out with the haul so far
//  - every listener removed and the rAF cancelled before resolving
//  - pauses on `visibilitychange`, honours `prefers-reduced-motion`
//  - all render/audio deps are optional: loaded dynamically, degraded to
//    primitive silhouette drawing if unavailable. Never throws, never logs.
// ============================================================================

const BASE_W = 320;
const BASE_H = 180;
const WORLD_W = 640;           // the field is two screens wide; the camera pans
const CAP_LB = 100;            // Oregon Trail's "you could only carry 100 pounds"

// ---------------------------------------------------------------------------
// Optional dependencies. Imported dynamically so a missing/broken module can
// never take the page down with it.
// ---------------------------------------------------------------------------
let DEPS_P = null;
function loadDeps() {
  if (DEPS_P) return DEPS_P;
  DEPS_P = (async () => {
    const d = { atlas: null, text: null, fx: null, audio: null };
    d.atlas = await imp('../render/atlas.js');
    d.text = await imp('../render/text.js');
    d.fx = await imp('../render/fx.js');
    d.audio = await imp('../audio/audio.js');
    if (d.atlas && typeof d.atlas.loadAtlas === 'function') {
      try { await raceTimeout(d.atlas.loadAtlas(), 2500); } catch { /* degrade */ }
    }
    return d;
  })().catch(() => ({ atlas: null, text: null, fx: null, audio: null }));
  return DEPS_P;
}
async function imp(path) { try { return await import(path); } catch { return null; } }
function raceTimeout(p, ms) {
  return Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise((r) => setTimeout(r, ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Palette (SPEC §2 core ramp + per-biome 8-colour sets)
// ---------------------------------------------------------------------------
const INK = '#f4ecdd', INK_DIM = '#a99e8c', NIGHT = '#0e0b17', PANEL = '#1a1526';
const EDGE = '#4b3f66', GOLD = '#f2c98a', GOLD_DIM = '#c39d63', RUST = '#d1785c';
const SAGE = '#8fd0a4', SKY_ICE = '#bfe3ff', VIOLET = '#6b5a94';

// [skyTop, skyBottom, sun, ridgeFar, ridgeMid, ridgeNear, ground, accent]
const BIOME_PAL = {
  desert:     ['#3a2c46', '#c08a70', '#f2c98a', '#5a4560', '#42324e', '#2e2440', '#7a5a4e', '#d1785c'],
  chaparral:  ['#2f2b46', '#a08e76', '#f2c98a', '#514a63', '#3c3750', '#2b2740', '#6e6a4c', '#c8b06a'],
  sierra:     ['#26304a', '#8fa8c0', '#e8f0ff', '#4a5670', '#36405a', '#262e44', '#4e5c52', '#bfe3ff'],
  alpine:     ['#1e2740', '#a8c4e0', '#ffffff', '#48577a', '#33415e', '#232c42', '#5a6472', '#bfe3ff'],
  forest:     ['#1d2a33', '#6e8a72', '#dfeccd', '#334a44', '#26382f', '#1b2822', '#37483a', '#8fd0a4'],
  volcanic:   ['#2a1c28', '#8a5a52', '#f2c98a', '#4a3340', '#38262f', '#251a22', '#3a2f33', '#d1785c'],
  rainforest: ['#1b2a2e', '#5f8a80', '#cfe8dd', '#2e4a48', '#213834', '#172723', '#2c4034', '#8fd0a4'],
};
// [deep, mid, shallow, foam]
const BIOME_WATER = {
  desert:     ['#33445e', '#4a6a80', '#7fa0ac', '#d8e8e4'],
  chaparral:  ['#2f4458', '#456478', '#77a0a4', '#dcece8'],
  sierra:     ['#2b3a5a', '#3f5a7e', '#6f93b0', '#bfe3ff'],
  alpine:     ['#28375c', '#3b5b86', '#7098bd', '#e6f4ff'],
  forest:     ['#22384a', '#345670', '#5e8c98', '#cfe8e4'],
  volcanic:   ['#2c2c42', '#43485f', '#6c7488', '#cdd2e2'],
  rainforest: ['#1e3a3c', '#2f5a58', '#568a80', '#cfe8dd'],
};
const BIOME_PROPS = {
  desert:     ['saguaro', 'yucca', 'boulder', 'boulder'],
  chaparral:  ['juniper', 'yucca', 'boulder', 'stump'],
  sierra:     ['pine', 'boulder', 'pine', 'stump'],
  alpine:     ['boulder', 'snowpatch', 'pine', 'boulder'],
  forest:     ['pine', 'pine', 'fern', 'stump'],
  volcanic:   ['boulder', 'stump', 'pine', 'boulder'],
  rainforest: ['fern', 'pine', 'fern', 'stump'],
};

const QUALITY = {
  poor: { nodes: 4, value: 0.60, respawn: [3.2, 5.0], fish: 0.18 },
  fair: { nodes: 6, value: 0.85, respawn: [2.4, 3.8], fish: 0.24 },
  good: { nodes: 9, value: 1.05, respawn: [1.7, 2.9], fish: 0.30 },
  rich: { nodes: 12, value: 1.35, respawn: [1.1, 2.1], fish: 0.34 },
};

// ---------------------------------------------------------------------------
// A 3x5 pixel font used only when render/text.js is unavailable.
// ---------------------------------------------------------------------------
const F3 = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '101111101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101010', V: '101101101010010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010',
  8: '010101010101010', 9: '011101011001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  "'": '010010000000000', '"': '101101000000000', ':': '000010000010000', ';': '000010000010100',
  '-': '000000111000000', '+': '000010111010000', '%': '101001010100101', '$': '011110011110010',
  '/': '001001010100100', '(': '001010010010001', ')': '100010010010100', ' ': '000000000000000',
};
function fbMeasure(str, scale) {
  const s = scale || 1;
  return Math.max(0, String(str).length * 4 * s - s);
}
function fbText(ctx, str, x, y, o) {
  const opts = o || {};
  const s = Math.max(1, opts.scale || 1);
  const str2 = String(str).toUpperCase();
  let px = x | 0;
  if (opts.align === 'center') px = (x - fbMeasure(str2, s) / 2) | 0;
  else if (opts.align === 'right') px = (x - fbMeasure(str2, s)) | 0;
  const py = y | 0;
  if (opts.shadow !== false) {
    ctx.fillStyle = 'rgba(14,11,23,0.75)';
    paintFb(ctx, str2, px + s, py + s, s);
  }
  ctx.fillStyle = opts.color || INK;
  paintFb(ctx, str2, px, py, s);
}
function paintFb(ctx, str, px, py, s) {
  for (let i = 0; i < str.length; i++) {
    const g = F3[str[i]] || F3['?'];
    const gx = px + i * 4 * s;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r * 3 + c] === '1') ctx.fillRect(gx + c * s, py + r * s, s, s);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function hexToRgb(h) {
  const s = String(h).replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ditherRect(ctx, x, y, w, h, color, level) {
  // level 0..1 — fraction of pixels painted, ordered 4x4 Bayer
  const th = level * 16;
  ctx.fillStyle = color;
  const x0 = x | 0, y0 = y | 0, x1 = (x + w) | 0, y1 = (y + h) | 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (BAYER[(py & 3) * 4 + (px & 3)] < th) ctx.fillRect(px, py, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Run the foraging minigame.
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts { quality, biome, rng, bonus, audio, duration, timeScale, autoplay }
 * @returns {Promise<{lbs:number, log:string[]}>}
 */
export function runForage(canvas, opts) {
  const o = opts || {};
  const quality = QUALITY[o.quality] ? o.quality : 'fair';
  const biome = BIOME_PAL[o.biome] ? o.biome : 'sierra';
  const rng = typeof o.rng === 'function' ? o.rng : mulberry32((Math.random() * 0xffffffff) | 0);
  const bonus = Number.isFinite(o.bonus) ? o.bonus : 1;
  const duration = Number.isFinite(o.duration) ? Math.max(2, o.duration) : 45;
  const timeScale = Number.isFinite(o.timeScale) ? clamp(o.timeScale, 0.1, 20) : 1;

  return new Promise((resolve) => {
    // ---- guaranteed single settle -------------------------------------
    let settled = false;
    const S = createState(quality, biome, rng, bonus, duration, timeScale, o);
    let stop = null;

    const finish = (reason) => {
      if (settled) return;
      settled = true;
      try { if (stop) stop(); } catch { /* nothing may throw on the way out */ }
      let lbs = Math.round(S.lbs);
      const log = [];
      if (S.mauled) {
        lbs = Math.floor(lbs * 0.6);
        log.push('A black bear ran the crew off the slope. Forty percent of the haul is scattered in the duff.');
      }
      lbs = Math.round(clamp(lbs * S.bonus, 0, CAP_LB));
      if (S.bitten) log.push('A rattlesnake caught someone on the ankle. It will stiffen up by morning.');
      if (reason === 'esc' && !S.mauled) log.push('You called it early and hiked back to camp.');
      if (S.full) log.push('Packs full at a hundred pounds — the rest stays on the hill.');
      log.push(summaryLine(S, lbs));
      resolve({
        lbs, log,
        // additive extras — the sim only reads lbs, but the UI can use these
        health: S.bitten ? -6 * S.bitten : 0,
        bitten: S.bitten, mauled: S.mauled, picks: S.picks, quality, biome,
      });
    };

    // ---- boot ----------------------------------------------------------
    try {
      stop = boot(canvas, S, finish);
    } catch {
      // If anything at all goes wrong constructing the game, resolve with a
      // plausible average rather than leaving the caller hanging.
      settled = true;
      resolve({ lbs: averageHaul(quality, bonus), log: ['You forage for the afternoon.'] });
    }
  });
}

function averageHaul(quality, bonus) {
  const base = { poor: 14, fair: 24, good: 36, rich: 50 }[quality] || 24;
  return Math.round(clamp(base * (bonus || 1), 0, CAP_LB));
}

function summaryLine(S, lbs) {
  const bits = [];
  if (S.picks.berry) bits.push(`${S.picks.berry} handful${S.picks.berry === 1 ? '' : 's'} of berries`);
  if (S.picks.mushroom) bits.push(`${S.picks.mushroom} mushroom${S.picks.mushroom === 1 ? '' : 's'}`);
  if (S.picks.fish) bits.push(`${S.picks.fish} trout`);
  if (!bits.length) return `You come back with ${lbs} lb and a lot of walking in your legs.`;
  const list = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
  return `You bring back ${list} — ${lbs} lb of food.`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function createState(quality, biome, rng, bonus, duration, timeScale, o) {
  const q = QUALITY[quality];
  const pal = BIOME_PAL[biome];
  return {
    quality, biome, rng, bonus, duration, timeScale, q, pal,
    water: BIOME_WATER[biome] || BIOME_WATER.sierra,
    props: BIOME_PROPS[biome] || BIOME_PROPS.sierra,
    audio: o.audio || null,
    autoplay: !!o.autoplay,
    aim: null, aimAge: 0, flee: null,
    t: 0, left: duration,
    lbs: 0, full: false, bitten: 0, mauled: false,
    picks: { berry: 0, mushroom: 0, fish: 0 },
    hero: { x: 120, y: 140, dir: 1, phase: 0, moving: false, grab: 0, stun: 0 },
    nodes: [], bear: null, snake: null, parts: [], banners: [],
    shake: 0, flash: 0, flashCol: RUST,
    camX: 0, hint: 3.0, reduced: false, paused: false,
    fishing: null,        // { node, prog }
    keys: Object.create(null), gathering: false,
    touch: false, dpad: { x: 0, y: 0 }, pointer: null,
  };
}

// ---------------------------------------------------------------------------
// Boot: buffers, listeners, loop. Returns a `stop()` that undoes all of it.
// ---------------------------------------------------------------------------
function boot(canvas, S, finish) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) { setTimeout(() => finish('nocanvas'), 0); return () => {}; }

  // Offscreen 320x180 buffer, blitted up with nearest-neighbour.
  const buf = document.createElement('canvas');
  buf.width = BASE_W; buf.height = BASE_H;
  const g = buf.getContext('2d');
  if (!g) { setTimeout(() => finish('nocanvas'), 0); return () => {}; }
  g.imageSmoothingEnabled = false;

  // If the host canvas is too small to hold the buffer, size it ourselves and
  // restore whatever it was on the way out.
  let sizedByUs = false, oldW = canvas.width, oldH = canvas.height;
  if (canvas.width < BASE_W || canvas.height < BASE_H) {
    canvas.width = BASE_W * 3; canvas.height = BASE_H * 3; sizedByUs = true;
  }

  try {
    S.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { S.reduced = false; }
  try {
    S.touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 ||
      Math.min(window.innerWidth || 999, window.innerHeight || 999) < 640;
  } catch { S.touch = false; }

  seedWorld(S);
  const layers = buildLayers(S);

  // ---- deps (async, optional) ----------------------------------------
  const D = { atlas: null, text: null, fx: null, audio: S.audio, fxi: null };
  let disposed = false;
  loadDeps().then((d) => {
    if (disposed) return;
    D.atlas = d.atlas; D.text = d.text;
    if (!D.audio) D.audio = d.audio && d.audio.Audio ? d.audio.Audio : null;
    if (d.fx && typeof d.fx.createFx === 'function') {
      try { D.fxi = d.fx.createFx(); } catch { D.fxi = null; }
    }
    try { if (D.audio && D.audio.playMusic) D.audio.playMusic('forage'); } catch { /* mute */ }
  });

  // ---- input ----------------------------------------------------------
  const onKeyDown = (e) => {
    const k = normKey(e);
    if (!k) return;
    if (k === 'esc') { e.preventDefault(); finish('esc'); return; }
    if (MOVE_KEYS[k] || k === 'space') e.preventDefault();
    if (k === 'space') S.gathering = true;
    S.keys[k] = true;
  };
  const onKeyUp = (e) => {
    const k = normKey(e);
    if (!k) return;
    if (k === 'space') S.gathering = false;
    S.keys[k] = false;
  };
  const onBlur = () => { S.keys = Object.create(null); S.gathering = false; S.dpad.x = 0; S.dpad.y = 0; };
  const onVis = () => {
    S.paused = !!document.hidden;
    if (S.paused) onBlur();
    last = 0;
  };
  const onPointerDown = (e) => {
    const p = toBuffer(canvas, e);
    if (!p) return;
    S.pointer = p;
    if (S.touch && hitTouch(S, p)) { e.preventDefault(); return; }
    S.gathering = true;
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    const p = toBuffer(canvas, e);
    if (!p) return;
    S.pointer = p;
    if (S.touch && (S.dpad.x || S.dpad.y || S.gathering)) hitTouch(S, p);
  };
  const onPointerUp = () => {
    S.gathering = false; S.dpad.x = 0; S.dpad.y = 0; S.pointer = null;
  };

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // ---- loop -----------------------------------------------------------
  let raf = 0, last = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 1 / 20) * S.timeScale;
    if (S.paused || document.hidden) dt = 0;

    try {
      // Fixed-size steps, however much time the frame covers. A compressed clock (or a
      // dropped frame) must not change how the physics behave, and a bang-bang input
      // sampled once per 130 ms is not the same game as one sampled every 16 ms.
      for (let left = dt; left > 0 && !settled;) {
        const step = Math.min(left, 1 / 60);
        update(S, step, D, finish);
        left -= step;
      }
      render(g, S, D, layers);
    } catch {
      // A render/update fault must never wedge the game — bail out cleanly.
      finish('error');
      return;
    }
    blit(ctx, canvas, buf);
  };
  raf = requestAnimationFrame(frame);

  return function stop() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    try { if (D.fxi && D.fxi.clear) D.fxi.clear(); } catch { /* ignore */ }
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
    } catch { /* ignore */ }
    if (sizedByUs) { try { canvas.width = oldW; canvas.height = oldH; } catch { /* ignore */ } }
  };
}

const MOVE_KEYS = {
  left: 'x-', right: 'x+', up: 'y-', down: 'y+',
};
function normKey(e) {
  const k = e.key;
  if (!k) return null;
  switch (k) {
    case 'ArrowLeft': case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
    case 'ArrowUp': case 'w': case 'W': return 'up';
    case 'ArrowDown': case 's': case 'S': return 'down';
    case ' ': case 'Spacebar': case 'Enter': return 'space';
    case 'Escape': case 'Esc': return 'esc';
    default: return null;
  }
}

function toBuffer(canvas, e) {
  try {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const dx = (e.clientX - r.left) * (canvas.width / r.width);
    const dy = (e.clientY - r.top) * (canvas.height / r.height);
    const s = Math.max(1, Math.min(Math.floor(canvas.width / BASE_W), Math.floor(canvas.height / BASE_H)));
    const ox = ((canvas.width - BASE_W * s) / 2) | 0;
    const oy = ((canvas.height - BASE_H * s) / 2) | 0;
    return { x: (dx - ox) / s, y: (dy - oy) / s };
  } catch { return null; }
}

function blit(ctx, canvas, buf) {
  try {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const s = Math.max(1, Math.min(Math.floor(canvas.width / BASE_W), Math.floor(canvas.height / BASE_H)));
    const ox = ((canvas.width - BASE_W * s) / 2) | 0;
    const oy = ((canvas.height - BASE_H * s) / 2) | 0;
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, BASE_W, BASE_H, ox, oy, BASE_W * s, BASE_H * s);
    ctx.restore();
  } catch { /* a dead context must not throw out of the loop */ }
}

// ---------------------------------------------------------------------------
// Field geometry
// ---------------------------------------------------------------------------
const SKY_H = 40;         // 0..40   sky
const BANK_Y = 62;        // 62..70  far bank
const WATER_Y0 = 70;      // 70..94  creek
const WATER_Y1 = 94;
const FIELD_Y0 = 96;      // walkable band (feet position)
const FIELD_Y1 = 172;

function seedWorld(S) {
  const r = S.rng;
  // scenery props, world coords
  S.scenery = [];
  for (let i = 0; i < 26; i++) {
    S.scenery.push({
      kind: S.props[(r() * S.props.length) | 0],
      x: 6 + r() * (WORLD_W - 12),
      y: FIELD_Y0 + 2 + r() * (FIELD_Y1 - FIELD_Y0 - 2),
      f: r() < 0.5 ? -1 : 1,
    });
  }
  S.farProps = [];
  for (let i = 0; i < 22; i++) {
    S.farProps.push({ x: r() * (WORLD_W * 0.7 + BASE_W), y: BANK_Y + 6, h: 5 + r() * 7 });
  }
  for (let i = 0; i < S.q.nodes; i++) S.nodes.push(makeNode(S, true));
  S.bear = {
    x: S.hero.x + 220 + r() * 160, y: FIELD_Y0 + 10 + r() * 50,
    dir: -1, state: 'wander', timer: 2 + r() * 3, alert: 0, phase: 0, growl: 0,
  };
  if (S.bear.x > WORLD_W - 20) S.bear.x -= WORLD_W - 40;
  S.snake = makeSnake(S);
}

function makeSnake(S) {
  const r = S.rng;
  let x = 0, y = 0, tries = 0;
  do {
    x = 20 + r() * (WORLD_W - 40);
    y = FIELD_Y0 + 6 + r() * (FIELD_Y1 - FIELD_Y0 - 8);
    tries++;
  } while (tries < 20 && Math.abs(x - S.hero.x) < 90);
  return { x, y, rattle: 0, phase: 0, life: 14 + r() * 10 };
}

function makeNode(S, initial) {
  const r = S.rng;
  const isFish = r() < S.q.fish;
  let x = 14 + r() * (WORLD_W - 28);
  let y;
  if (isFish) {
    y = WATER_Y0 + 10 + r() * (WATER_Y1 - WATER_Y0 - 14);
  } else {
    y = FIELD_Y0 + 4 + r() * (FIELD_Y1 - FIELD_Y0 - 6);
  }
  // don't spawn on top of the player
  if (!initial && Math.abs(x - S.hero.x) < 60) x = (x + 200 + r() * 200) % (WORLD_W - 28) + 14;
  const type = isFish ? 'fish' : (r() < 0.58 ? 'berry' : 'mushroom');
  const baseVal = type === 'fish' ? 6 + r() * 4 : type === 'berry' ? 2.4 + r() * 1.8 : 1.8 + r() * 1.4;
  return {
    type, x, y,
    v: Math.max(1, Math.round(baseVal * S.q.value)),
    t: r() * 6, born: 0, variant: (r() * 3) | 0,
    swim: r() * 6.28, alive: true, pop: 0, respawn: 0,
  };
}

// ---------------------------------------------------------------------------
// Static parallax layers, pre-rendered once
// ---------------------------------------------------------------------------
function buildLayers(S) {
  const pal = S.pal;
  const sky = document.createElement('canvas');
  sky.width = BASE_W; sky.height = BANK_Y + 10;
  const sc = sky.getContext('2d');
  if (sc) {
    sc.fillStyle = pal[0];
    sc.fillRect(0, 0, BASE_W, SKY_H);
    // dithered bands top -> bottom
    for (let b = 0; b < 5; b++) {
      const y = 6 + b * 6;
      ditherRect(sc, 0, y, BASE_W, 8, mix(pal[0], pal[1], (b + 1) / 5), 0.22 + b * 0.19);
    }
    ditherRect(sc, 0, 30, BASE_W, 10, pal[1], 0.85);
    sc.fillStyle = pal[1];
    sc.fillRect(0, 38, BASE_W, 2);
    // sun/haze disc
    sc.globalAlpha = 0.5;
    sc.fillStyle = pal[2];
    const sx = 232, sy = 20;
    for (let i = 0; i < 4; i++) sc.fillRect(sx - 4 + i, sy - 5 + (i === 0 || i === 3 ? 1 : 0), 1, i === 0 || i === 3 ? 8 : 10);
    sc.globalAlpha = 0.16;
    ditherRect(sc, sx - 9, sy - 9, 18, 18, pal[2], 0.5);
    sc.globalAlpha = 1;
  }
  const far = ridgeLayer(S, 0.14, 40, pal[3], 16, 3);
  const mid = ridgeLayer(S, 0.30, 52, pal[4], 12, 5);
  const near = treeLayer(S, 0.52, BANK_Y, pal[5]);
  const ground = groundLayer(S);
  return { sky, far, mid, near, ground };
}

function ridgeLayer(S, p, baseY, color, amp, oct) {
  const w = Math.ceil(BASE_W + (WORLD_W - BASE_W) * p) + 8;
  const c = document.createElement('canvas');
  c.width = w; c.height = baseY + 6;
  const x = c.getContext('2d');
  if (!x) return { canvas: c, p };
  x.fillStyle = color;
  const seed = S.rng() * 1000;
  for (let i = 0; i < w; i++) {
    let h = 0;
    for (let o = 1; o <= oct; o++) {
      h += Math.sin((i / (26 * o)) + seed * o) * (amp / o);
    }
    const top = (baseY - 6 - h) | 0;
    x.fillRect(i, top, 1, c.height - top);
  }
  return { canvas: c, p };
}

function treeLayer(S, p, baseY, color) {
  const w = Math.ceil(BASE_W + (WORLD_W - BASE_W) * p) + 8;
  const c = document.createElement('canvas');
  c.width = w; c.height = baseY + 10;
  const x = c.getContext('2d');
  if (!x) return { canvas: c, p };
  x.fillStyle = color;
  x.fillRect(0, baseY - 2, w, 12);
  const r = S.rng;
  const treeish = S.biome !== 'desert' && S.biome !== 'alpine';
  for (let i = 0; i < w; i += 3) {
    if (treeish && r() < 0.5) {
      const h = 6 + r() * 12;
      for (let j = 0; j < h; j++) {
        const wdt = Math.max(1, Math.round((1 - j / h) * 5));
        x.fillRect(i - (wdt >> 1), baseY - 2 - j, wdt, 1);
      }
    } else if (r() < 0.35) {
      const h = 2 + r() * 4;
      x.fillRect(i - 1, baseY - 2 - h, 3, h);
    }
  }
  return { canvas: c, p };
}

function groundLayer(S) {
  const pal = S.pal;
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = BASE_H - WATER_Y1;
  const x = c.getContext('2d');
  if (!x) return { canvas: c, p: 1 };
  const back = mix(pal[6], pal[1], 0.30);
  const midC = pal[6];
  const front = mix(pal[6], NIGHT, 0.28);
  x.fillStyle = back; x.fillRect(0, 0, WORLD_W, 18);
  x.fillStyle = midC; x.fillRect(0, 18, WORLD_W, 30);
  x.fillStyle = front; x.fillRect(0, 48, WORLD_W, c.height - 48);
  ditherRect(x, 0, 14, WORLD_W, 6, midC, 0.5);
  ditherRect(x, 0, 44, WORLD_W, 6, front, 0.5);
  // bank line at the water's edge
  x.fillStyle = mix(pal[6], INK, 0.22);
  x.fillRect(0, 0, WORLD_W, 1);
  // scatter: pebbles and tufts
  const r = S.rng;
  for (let i = 0; i < 460; i++) {
    const px = (r() * WORLD_W) | 0;
    const py = (r() * c.height) | 0;
    const shade = py < 18 ? back : py < 48 ? midC : front;
    x.fillStyle = r() < 0.5 ? mix(shade, NIGHT, 0.35) : mix(shade, INK, 0.18);
    if (r() < 0.35) { x.fillRect(px, py, 2, 1); }
    else { x.fillRect(px, py, 1, 1); if (r() < 0.4) x.fillRect(px + 1, py - 1, 1, 1); }
  }
  return { canvas: c, p: 1 };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(S, dt, D, finish) {
  S.t += dt;
  S.left -= dt;
  if (S.hint > 0) S.hint -= dt;
  S.shake = Math.max(0, S.shake - dt * 26);
  S.flash = Math.max(0, S.flash - dt * 3.4);

  if (S.left <= 0) { S.left = 0; finish('time'); return; }

  if (S.autoplay) autopilot(S, dt);

  // ---- movement ------------------------------------------------------
  const h = S.hero;
  h.stun = Math.max(0, h.stun - dt);
  let mx = 0, my = 0;
  if (!h.stun) {
    if (S.keys.left) mx -= 1;
    if (S.keys.right) mx += 1;
    if (S.keys.up) my -= 1;
    if (S.keys.down) my += 1;
    mx += S.dpad.x; my += S.dpad.y;
    mx = clamp(mx, -1, 1); my = clamp(my, -1, 1);
  }
  const len = Math.hypot(mx, my) || 1;
  const spd = 54;
  h.moving = (mx !== 0 || my !== 0) && !S.fishing;
  if (h.moving) {
    h.x = clamp(h.x + (mx / len) * spd * dt, 8, WORLD_W - 8);
    h.y = clamp(h.y + (my / len) * spd * 0.62 * dt, FIELD_Y0, FIELD_Y1);
    if (mx) h.dir = mx > 0 ? 1 : -1;
    h.phase += dt * 8.5;
    // footstep dust
    if (Math.floor(h.phase) !== Math.floor(h.phase - dt * 8.5)) {
      spawn(S, 'dust', h.x - h.dir * 3, h.y, { n: 2 });
      emitFx(D, 'dust', { x: h.x - S.camX, y: h.y, count: 2 });
      sfx(D, 'footstep', 0.35);
    }
  } else {
    h.phase += dt * 2;
  }
  h.grab = Math.max(0, h.grab - dt);

  // camera
  const want = clamp(h.x - BASE_W / 2, 0, WORLD_W - BASE_W);
  S.camX += (want - S.camX) * Math.min(1, dt * 7);

  // ---- gathering -----------------------------------------------------
  updateGather(S, dt, D);

  // ---- nodes ---------------------------------------------------------
  for (let i = 0; i < S.nodes.length; i++) {
    const n = S.nodes[i];
    n.t += dt;
    n.born = Math.min(1, n.born + dt * 3.2);
    if (n.pop > 0) n.pop = Math.max(0, n.pop - dt * 3);
    if (!n.alive) {
      n.respawn -= dt;
      if (n.respawn <= 0) S.nodes[i] = makeNode(S, false);
    } else if (n.type === 'fish') {
      n.swim += dt * 1.6;
      n.x += Math.cos(n.swim) * 9 * dt;
      n.y += Math.sin(n.swim * 0.7) * 4 * dt;
      n.x = clamp(n.x, 10, WORLD_W - 10);
      n.y = clamp(n.y, WATER_Y0 + 8, WATER_Y1 - 3);
    }
  }

  updateBear(S, dt, D, finish);
  updateSnake(S, dt, D);
  updateParticles(S, dt);
  for (let i = S.banners.length - 1; i >= 0; i--) {
    S.banners[i].life -= dt;
    if (S.banners[i].life <= 0) S.banners.splice(i, 1);
  }
  if (D.fxi && D.fxi.update) { try { D.fxi.update(dt); } catch { D.fxi = null; } }
}

function updateGather(S, dt, D) {
  const h = S.hero;
  if (S.fullWarn > 0) S.fullWarn -= dt;
  if (S.lbs >= CAP_LB) {
    S.fishing = null;
    if (S.gathering && !(S.fullWarn > 0)) {
      banner(S, 'PACK FULL', GOLD, 1.4); S.fullWarn = 1.6; sfx(D, 'error', 0.5);
    }
    return;   // leave the remaining nodes on the hill
  }

  if (!S.gathering || h.stun > 0) {
    if (S.fishing) { S.fishing = null; }
    return;
  }

  // fish need a hold; everything else is instant
  if (S.fishing) {
    const n = S.fishing.node;
    if (!n.alive || !nearNode(h, n)) { S.fishing = null; return; }
    S.fishing.prog += dt / 0.95;
    h.grab = 0.12;
    if (S.t % 0.25 < dt) spawn(S, 'splash', n.x, WATER_Y1 - 4, { n: 2 });
    if (S.fishing.prog >= 1) { collect(S, n, D); S.fishing = null; }
    return;
  }
  const n = nearest(S, h);
  if (!n) return;
  h.grab = 0.22;
  if (n.type === 'fish') { S.fishing = { node: n, prog: 0 }; sfx(D, 'splash', 0.5); }
  else collect(S, n, D);
}

function nearNode(h, n) {
  const dx = (n.x - h.x) / 17, dy = (n.y - (n.type === 'fish' ? h.y - 8 : h.y)) / 11;
  return dx * dx + dy * dy <= 1;
}
function nearest(S, h) {
  let best = null, bd = 2;
  for (const n of S.nodes) {
    if (!n.alive) continue;
    const dx = (n.x - h.x) / 17, dy = (n.y - (n.type === 'fish' ? h.y - 8 : h.y)) / 11;
    const d = dx * dx + dy * dy;
    if (d <= 1 && d < bd) { bd = d; best = n; }
  }
  return best;
}

function collect(S, n, D) {
  const room = CAP_LB - S.lbs;
  const got = Math.max(0, Math.min(n.v, room));
  S.lbs += got;
  if (got > 0) S.picks[n.type]++;
  if (S.lbs >= CAP_LB) { S.lbs = CAP_LB; if (!S.full) { S.full = true; banner(S, 'PACK FULL', GOLD, 2); } }
  n.alive = false;
  n.pop = 1;
  n.respawn = S.q.respawn[0] + S.rng() * (S.q.respawn[1] - S.q.respawn[0]);
  // punch: sparkle burst, ring, floating number, tiny shake
  spawn(S, 'sparkle', n.x, n.y - 4, { n: 10, col: n.type === 'fish' ? SKY_ICE : GOLD });
  spawn(S, 'ring', n.x, n.y - 4, { col: n.type === 'fish' ? SKY_ICE : GOLD });
  spawn(S, 'num', n.x, n.y - 10, { text: (got > 0 ? '+' + got + ' LB' : 'FULL'), col: got > 0 ? GOLD : RUST });
  if (n.type === 'fish') spawn(S, 'splash', n.x, WATER_Y1 - 4, { n: 12 });
  emitFx(D, 'sparkle', { x: n.x - S.camX, y: n.y - 4, count: 6, color: GOLD });
  S.shake = Math.max(S.shake, S.reduced ? 0.4 : 1.6);
  S.hero.grab = 0.3;
  sfx(D, n.type === 'fish' ? 'splash' : 'pickup', 0.85);
  if (got > 0) sfx(D, 'pickup', 0.6);
}

function updateBear(S, dt, D, finish) {
  const b = S.bear, h = S.hero;
  b.phase += dt * (b.state === 'chase' ? 9 : 4);
  const dx = h.x - b.x, dy = (h.y - b.y) * 1.7;
  const dist = Math.hypot(dx, dy);

  if (b.state === 'wander') {
    b.timer -= dt;
    if (b.timer <= 0) { b.timer = 2 + S.rng() * 3.5; b.dir = S.rng() < 0.5 ? -1 : 1; b.vy = (S.rng() - 0.5) * 12; }
    b.x = clamp(b.x + b.dir * 15 * dt, 6, WORLD_W - 6);
    b.y = clamp(b.y + (b.vy || 0) * dt, FIELD_Y0 + 2, FIELD_Y1 - 2);
    if (b.x <= 6 || b.x >= WORLD_W - 6) b.dir *= -1;
    if (dist < 74) {
      b.state = 'alert'; b.alert = 1.0;
      banner(S, 'BEAR!', RUST, 1.6);
      sfx(D, 'bear_growl', 0.9);
      S.flash = S.reduced ? 0.3 : 0.8; S.flashCol = RUST;
    }
  } else if (b.state === 'alert') {
    b.alert -= dt;
    b.dir = dx > 0 ? 1 : -1;
    if (b.alert <= 0) { b.state = 'chase'; b.chase = 6.5; }
  } else if (b.state === 'chase') {
    b.chase -= dt;
    const l = dist || 1;
    const spd = 47;
    b.x = clamp(b.x + (dx / l) * spd * dt, 4, WORLD_W - 4);
    b.y = clamp(b.y + (dy / (l * 1.7)) * spd * 0.6 * dt, FIELD_Y0 + 1, FIELD_Y1);
    b.dir = dx > 0 ? 1 : -1;
    if (S.t % 0.18 < dt) spawn(S, 'dust', b.x - b.dir * 6, b.y, { n: 1 });
    if (dist < 12) {
      S.mauled = true;
      S.flash = S.reduced ? 0.5 : 1; S.flashCol = RUST;
      S.shake = S.reduced ? 2 : 7;
      sfx(D, 'bear_growl', 1);
      finish('bear');
      return;
    }
    if (b.chase <= 0 || dist > 150) { b.state = 'wander'; b.timer = 2; }
  }
}

function updateSnake(S, dt, D) {
  const s = S.snake, h = S.hero;
  s.phase += dt * 6;
  s.life -= dt;
  const dx = h.x - s.x, dy = (h.y - s.y) * 1.8;
  const dist = Math.hypot(dx, dy);
  const wasRattle = s.rattle;
  s.rattle = dist < 34 ? clamp(s.rattle + dt * 3, 0, 1) : Math.max(0, s.rattle - dt * 2);
  if (s.rattle > 0.25 && wasRattle <= 0.25) sfx(D, 'snake_rattle', 0.8);
  if (dist < 9 && h.stun <= 0) {
    S.bitten++;
    h.stun = 0.9;
    S.lbs = Math.max(0, S.lbs - 5);
    S.full = S.lbs >= CAP_LB;
    banner(S, 'SNAKEBITE', RUST, 1.6);
    spawn(S, 'num', h.x, h.y - 18, { text: '-5 LB', col: RUST });
    spawn(S, 'sparkle', h.x, h.y - 8, { n: 8, col: RUST });
    S.flash = S.reduced ? 0.4 : 1; S.flashCol = RUST;
    S.shake = S.reduced ? 1.5 : 5;
    sfx(D, 'sick', 0.9);
    S.snake = makeSnake(S);
    return;
  }
  if (s.life <= 0 && dist > 70) S.snake = makeSnake(S);
}

// ---------------------------------------------------------------------------
// Particles (internal — always available; fx.js is used additively)
// ---------------------------------------------------------------------------
function spawn(S, kind, x, y, o) {
  const opt = o || {};
  const r = S.rng;
  const n = opt.n || 1;
  for (let i = 0; i < n; i++) {
    if (S.parts.length > 220) break;
    let p;
    if (kind === 'dust') {
      p = { kind, x: x + (r() - 0.5) * 3, y, vx: (r() - 0.5) * 8, vy: -6 - r() * 8, life: 0.5, max: 0.5, col: INK_DIM };
    } else if (kind === 'sparkle') {
      const a = r() * 6.283, sp = 20 + r() * 44;
      p = { kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 12, life: 0.5 + r() * 0.3, max: 0.8, col: opt.col || GOLD };
    } else if (kind === 'splash') {
      const a = -0.4 - r() * 2.3, sp = 20 + r() * 40;
      p = { kind, x: x + (r() - 0.5) * 6, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.55, max: 0.55, col: S.water[3] };
    } else if (kind === 'ring') {
      p = { kind, x, y, r0: 2, life: 0.42, max: 0.42, col: opt.col || GOLD };
    } else if (kind === 'num') {
      p = { kind, x, y, vy: -17, life: 1.05, max: 1.05, col: opt.col || GOLD, text: opt.text || '' };
    } else return;
    S.parts.push(p);
  }
}
function updateParticles(S, dt) {
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.life -= dt;
    if (p.life <= 0) { S.parts.splice(i, 1); continue; }
    if (p.kind === 'ring') { p.r0 += dt * 34; continue; }
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
    if (p.kind === 'splash') p.vy += 150 * dt;
    else if (p.kind === 'sparkle') { p.vy += 60 * dt; p.vx *= 0.94; }
    else if (p.kind === 'dust') { p.vy += 14 * dt; p.vx *= 0.93; }
    else if (p.kind === 'num') p.vy *= 0.94;
  }
}
function banner(S, text, col, life) {
  S.banners.push({ text, col, life, max: life });
}
function sfx(D, id, vol) {
  try { if (D.audio && D.audio.sfx) D.audio.sfx(id, { vol: vol == null ? 1 : vol }); } catch { D.audio = null; }
}
function emitFx(D, kind, o) {
  if (!D.fxi || !D.fxi.emit) return;
  try { D.fxi.emit(kind, o); } catch { D.fxi = null; }
}

// ---------------------------------------------------------------------------
// Autopilot — used by the headless playtest and for balance runs.
// ---------------------------------------------------------------------------
/**
 * The crew working the slope on its own.
 *
 * The one rule that matters here is *commitment*. Re-choosing the best node every frame
 * looks smart and behaves like a dog in a field of rabbits: two nodes of similar value
 * on either side of you cancel out, and a fish — which needs a second of standing still
 * — never lands, because the moment you step onto it something else scores higher.
 * So: pick a target, walk to it, hold until it is picked, and only give it up when it
 * dies, gets dangerous, or the clock on it runs out.
 */
function autopilot(S, dt) {
  const h = S.hero;
  S.keys = Object.create(null);
  S.gathering = false;

  // The bear ends the day, so it outranks everything. Back off as soon as it notices
  // you, not once it is already running — by then there is no ground left to give.
  const b = S.bear;
  const bdist = b ? Math.hypot(b.x - h.x, (b.y - h.y) * 1.7) : 999;
  // Best of all is never to be noticed. A wandering bear notices you at seventy-odd
  // feet, and a chase you never start costs nothing, so give it a wide berth long
  // before it looks up — this is most of what keeps the crew's haul on the hill.
  const spooked = b && (b.state === 'chase' || b.state === 'alert');
  if (spooked ? bdist < (b.state === 'chase' ? 160 : 105) : bdist < 96) {
    S.aim = null;
    // A hiker does 54 and a bear does 47, so this is winnable — but only in a straight
    // line. Running diagonally splits the 54 between two axes and leaves barely 38 in
    // the direction that matters, which is how you get caught while running away. So
    // pick one axis, commit to it, and only change when it runs out of ground.
    const f = S.flee || (S.flee = { axis: 'x', dir: 1 });
    const roomFor = (axis, dir) => (axis === 'x'
      ? (dir > 0 ? WORLD_W - 8 - h.x : h.x - 8)
      : (dir > 0 ? FIELD_Y1 - h.y : h.y - FIELD_Y0));

    if (roomFor(f.axis, f.dir) < 40) {
      // Cornered on this axis. Take the other one, toward whichever end is further off.
      const other = f.axis === 'x' ? 'y' : 'x';
      const dir = roomFor(other, 1) >= roomFor(other, -1) ? 1 : -1;
      if (roomFor(other, dir) > 24) { f.axis = other; f.dir = dir; }
      else { f.dir = -f.dir; }                       // nowhere left: cut back past it
    } else if (b.state !== 'chase') {
      // Choose afresh only while it is still deciding, never mid-sprint.
      const ax = h.x >= b.x ? 1 : -1;
      f.axis = roomFor('x', ax) > 90 ? 'x' : 'y';
      f.dir = f.axis === 'x' ? ax : (roomFor('y', 1) >= roomFor('y', -1) ? 1 : -1);
    }

    if (f.axis === 'x') S.keys[f.dir > 0 ? 'right' : 'left'] = true;
    else S.keys[f.dir > 0 ? 'down' : 'up'] = true;
    return;
  }
  S.flee = null;

  const danger = (n) => {
    const sn = S.snake ? Math.hypot(n.x - S.snake.x, n.y - S.snake.y) : 999;
    const be = b ? Math.hypot(n.x - b.x, (n.y - b.y) * 1.7) : 999;
    return (sn < 24 ? 45 : 0) + (be < 120 ? 90 : 0);
  };

  // Hold the current target until it is picked or it stops existing. Dropping a target
  // because something wandered near it re-opens the oscillation this function exists to
  // avoid: danger belongs in the choice, not in the second-guessing.
  let aim = S.aim;
  if (aim) {
    S.aimAge += dt;
    if (!aim.alive || S.aimAge > 6) aim = null;
  }

  if (!aim) {
    let bd = 1e9;
    for (const n of S.nodes) {
      if (!n.alive) continue;
      // Value per second of walking, which is the only currency in a timed field.
      const d = Math.hypot(n.x - h.x, (n.y - h.y) * 1.4) / Math.max(0.5, n.v) + danger(n);
      if (d < bd) { bd = d; aim = n; }
    }
    S.aimAge = 0;
  }
  S.aim = aim;

  // Thin country picks out faster than it grows back. Rather than stand in an empty
  // patch waiting, drift down the creek so the next thing to come up is already close.
  if (!aim) {
    S.patrol = S.patrol || (h.x < WORLD_W / 2 ? 1 : -1);
    if (h.x < 24) S.patrol = 1;
    if (h.x > WORLD_W - 24) S.patrol = -1;
    S.keys[S.patrol > 0 ? 'right' : 'left'] = true;
    return;
  }

  // Fish are in the creek and the crew is on the bank, so stand at the water's edge and
  // reach: walking "to" a fish means walking to the top of the walkable band.
  const ty = aim.type === 'fish' ? FIELD_Y0 + 2 : aim.y;
  if (Math.abs(aim.x - h.x) > 1.5) S.keys[aim.x > h.x ? 'right' : 'left'] = true;
  if (Math.abs(ty - h.y) > 1.5) S.keys[ty > h.y ? 'down' : 'up'] = true;

  // Gather whenever anything at all is in reach — standing on a berry on the way to a
  // trout is free food, and holding the button is what lands the trout.
  if (nearest(S, h)) S.gathering = true;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(g, S, D, L) {
  const pal = S.pal;
  g.save();
  g.globalAlpha = 1;
  g.fillStyle = pal[0];
  g.fillRect(0, 0, BASE_W, BASE_H);

  const sh = S.shake > 0.05 ? (S.reduced ? S.shake * 0.25 : S.shake) : 0;
  const ox = sh ? Math.round((S.rng() - 0.5) * sh) : 0;
  const oy = sh ? Math.round((S.rng() - 0.5) * sh * 0.6) : 0;
  g.translate(ox, oy);

  // --- backdrop -------------------------------------------------------
  if (L.sky) g.drawImage(L.sky, 0, 0);
  drawLayer(g, L.far, S.camX);
  drawLayer(g, L.mid, S.camX);
  drawLayer(g, L.near, S.camX);

  // far bank + distant scrub
  g.fillStyle = mix(pal[6], pal[1], 0.45);
  g.fillRect(0, BANK_Y, BASE_W, WATER_Y0 - BANK_Y);
  const fp = 0.52;
  for (const p of S.farProps) {
    const x = (p.x - S.camX * fp) | 0;
    if (x < -6 || x > BASE_W + 6) continue;
    g.fillStyle = mix(pal[5], pal[1], 0.15);
    g.fillRect(x, BANK_Y + 6 - p.h, 2, p.h);
    g.fillRect(x - 1, BANK_Y + 3 - p.h, 4, 2);
  }

  drawWater(g, S);

  if (L.ground) {
    const gx = -S.camX | 0;
    g.drawImage(L.ground.canvas, gx, WATER_Y1);
    if (gx + WORLD_W < BASE_W) g.drawImage(L.ground.canvas, gx + WORLD_W, WATER_Y1);
  }

  // --- y-sorted world -------------------------------------------------
  const ents = [];
  for (const p of S.scenery) ents.push({ y: p.y, kind: 'prop', o: p });
  for (const n of S.nodes) if (n.alive || n.pop > 0) ents.push({ y: n.type === 'fish' ? n.y - 40 : n.y, kind: 'node', o: n });
  if (S.snake) ents.push({ y: S.snake.y, kind: 'snake', o: S.snake });
  ents.push({ y: S.hero.y, kind: 'hero', o: S.hero });
  if (S.bear) ents.push({ y: S.bear.y, kind: 'bear', o: S.bear });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    const sx = Math.round(e.o.x - S.camX);
    if (sx < -40 || sx > BASE_W + 40) continue;
    if (e.kind === 'prop') drawProp(g, S, e.o, sx);
    else if (e.kind === 'node') drawNode(g, S, D, e.o, sx);
    else if (e.kind === 'snake') drawSnake(g, S, D, e.o, sx);
    else if (e.kind === 'hero') drawHero(g, S, D, sx);
    else if (e.kind === 'bear') drawBear(g, S, D, e.o, sx);
  }

  drawParticles(g, S, D);
  if (D.fxi && D.fxi.draw) { try { D.fxi.draw(g); } catch { D.fxi = null; } }

  g.translate(-ox, -oy);

  // --- overlays -------------------------------------------------------
  if (S.flash > 0.02) {
    g.globalAlpha = clamp(S.flash * (S.reduced ? 0.16 : 0.34), 0, 0.45);
    g.fillStyle = S.flashCol;
    g.fillRect(0, 0, BASE_W, BASE_H);
    g.globalAlpha = 1;
  }
  vignette(g);
  drawHud(g, S, D);
  if (S.touch) drawTouch(g, S, D);
  if (S.hint > 0) drawHint(g, S, D);
  if (S.paused) drawPaused(g, S, D);
  g.restore();
}

function drawLayer(g, L, camX) {
  if (!L || !L.canvas) return;
  g.drawImage(L.canvas, -Math.round(camX * L.p), 0);
}

function drawWater(g, S) {
  const w = S.water;
  const t = S.t;
  g.fillStyle = w[0];
  g.fillRect(0, WATER_Y0, BASE_W, WATER_Y1 - WATER_Y0);
  // depth banding: far edge shallow, middle deep, near edge shallow
  g.fillStyle = w[2];
  g.fillRect(0, WATER_Y0, BASE_W, 3);
  ditherRect(g, 0, WATER_Y0 + 3, BASE_W, 3, w[2], 0.5);
  g.fillStyle = w[1];
  g.fillRect(0, WATER_Y1 - 6, BASE_W, 4);
  ditherRect(g, 0, WATER_Y1 - 8, BASE_W, 2, w[1], 0.5);
  g.fillStyle = w[2];
  g.fillRect(0, WATER_Y1 - 2, BASE_W, 2);
  // ripple dashes scrolling downstream
  for (let i = 0; i < 26; i++) {
    const seedX = (i * 61) % 340;
    const y = WATER_Y0 + 5 + ((i * 37) % (WATER_Y1 - WATER_Y0 - 9));
    const speed = 14 + (i % 4) * 5;
    let x = (seedX - S.camX * 0.9 + t * speed) % (BASE_W + 24);
    if (x < -12) x += BASE_W + 24;
    const len = 3 + (i % 3);
    g.fillStyle = i % 3 === 0 ? w[3] : w[2];
    g.globalAlpha = i % 3 === 0 ? 0.55 : 0.8;
    g.fillRect(x | 0, y | 0, len, 1);
  }
  g.globalAlpha = 1;
  // foam at the near bank
  for (let x = 0; x < BASE_W; x += 2) {
    if (((x + Math.floor(t * 12)) % 6) === 0) {
      g.fillStyle = rgba(w[3], 0.5);
      g.fillRect(x, WATER_Y1 - 1, 1, 1);
    }
  }
}

// --- sprite helper: try the atlas, otherwise return false --------------
function spr(g, D, name, x, y, opts, minW) {
  const a = D.atlas;
  if (!a || typeof a.draw !== 'function') return false;
  try {
    let w = 0, h = 0;
    if (typeof a.frame === 'function') {
      const f = a.frame(name);
      if (!f) return false;
      w = f.w | 0; h = f.h | 0;
      if (minW && w <= 8 && h <= 8 && minW > 8) return false;   // magenta placeholder
    }
    a.draw(g, name, Math.round(x - (w ? w / 2 : 0)), Math.round(y - h), opts || {});
    return true;
  } catch { D.atlas = null; return false; }
}

function drawHero(g, S, D, sx) {
  const h = S.hero;
  const y = Math.round(h.y);
  shadow(g, sx, y, 9);
  const walking = h.moving;
  const fi = walking ? (Math.floor(h.phase) % 4) : 0;
  const name = h.grab > 0 ? `forager_grab_${Math.floor(S.t * 10) % 2}` : `forager_walk_${fi}`;
  if (spr(g, D, name, sx, y, { flip: h.dir < 0 }, 10)) { heroAura(g, S, sx, y); return; }

  // primitive silhouette forager (9x17, feet at y)
  const dark = '#191428', skin = '#c9a184', pack = GOLD_DIM, shirt = S.pal[7];
  const swing = walking ? Math.sin(h.phase * 1.6) : 0;
  const lean = h.grab > 0 ? 1 : 0;
  const d = h.dir;
  // legs
  g.fillStyle = dark;
  g.fillRect(sx - 2 + Math.round(swing * 2), y - 6, 2, 6);
  g.fillRect(sx + 1 - Math.round(swing * 2), y - 6, 2, 6);
  // torso
  g.fillRect(sx - 3 + lean * d, y - 13, 6, 8);
  g.fillStyle = shirt;
  g.fillRect(sx - 3 + lean * d, y - 12, 6, 3);
  // pack
  g.fillStyle = pack;
  g.fillRect(sx - 3 - d * 2 + lean * d, y - 13, 3, 6);
  g.fillStyle = mix(pack, NIGHT, 0.35);
  g.fillRect(sx - 3 - d * 2 + lean * d, y - 11, 3, 1);
  // head + hat
  g.fillStyle = skin;
  g.fillRect(sx - 2 + lean * d * 2, y - 17, 4, 4);
  g.fillStyle = dark;
  g.fillRect(sx - 3 + lean * d * 2, y - 18, 6, 1);
  g.fillRect(sx - 2 + lean * d * 2, y - 19, 4, 1);
  // arm reaching when gathering
  if (h.grab > 0) {
    g.fillStyle = skin;
    g.fillRect(sx + d * 3, y - 12, 3, 2);
  }
  heroAura(g, S, sx, y);
}

function heroAura(g, S, sx, y) {
  // hold-to-catch progress arc while fishing
  if (S.fishing) {
    const p = clamp(S.fishing.prog, 0, 1);
    g.fillStyle = rgba(NIGHT, 0.7);
    g.fillRect(sx - 9, y - 26, 18, 4);
    g.fillStyle = EDGE;
    g.fillRect(sx - 8, y - 25, 16, 2);
    g.fillStyle = SKY_ICE;
    g.fillRect(sx - 8, y - 25, Math.round(16 * p), 2);
  }
  if (S.hero.stun > 0) {
    const n = Math.floor(S.t * 14) % 2;
    g.fillStyle = RUST;
    g.fillRect(sx - 4 + n * 6, y - 24, 1, 1);
    g.fillRect(sx + 2 - n * 5, y - 27, 1, 1);
  }
}

function shadow(g, sx, y, w) {
  g.fillStyle = 'rgba(14,11,23,0.30)';
  g.fillRect(sx - (w >> 1), y - 1, w, 2);
  g.fillRect(sx - (w >> 1) + 1, y + 1, w - 2, 1);
}

function drawNode(g, S, D, n, sx) {
  const y = Math.round(n.y);
  if (!n.alive) {
    if (n.pop > 0) {
      g.globalAlpha = n.pop * 0.6;
      g.fillStyle = INK;
      g.fillRect(sx - 2, y - 3, 4, 1);
      g.globalAlpha = 1;
    }
    return;
  }
  const pulse = 0.5 + 0.5 * Math.sin(S.t * 3.4 + n.t);
  const grow = n.born;
  // subtle glow: dithered halo + orbiting sparkle
  const gc = n.type === 'fish' ? SKY_ICE : GOLD;
  g.globalAlpha = 0.10 + pulse * 0.14;
  ditherRect(g, sx - 7, y - 12, 14, 13, gc, 0.5);
  g.globalAlpha = 1;
  const oa = S.t * 2 + n.t;
  g.fillStyle = rgba(gc, 0.55 + pulse * 0.45);
  g.fillRect(Math.round(sx + Math.cos(oa) * 7), Math.round(y - 5 + Math.sin(oa) * 4), 1, 1);

  if (n.type === 'berry') {
    if (!spr(g, D, `berry_${n.variant}`, sx, y, {}, 10)) {
      const bush = mix(S.pal[6], '#1d3324', 0.72);
      g.fillStyle = bush;
      g.fillRect(sx - 5, y - 6 * grow, 10, 6 * grow);
      g.fillRect(sx - 6, y - 4 * grow, 12, 4 * grow);
      g.fillRect(sx - 3, y - 8 * grow, 6, 3 * grow);
      g.fillStyle = mix(bush, INK, 0.16);
      g.fillRect(sx - 4, y - 7 * grow, 2, 1);
      g.fillStyle = '#b04a63';
      const dots = [[-3, -5], [1, -6], [3, -3], [-1, -2]];
      for (const dd of dots) g.fillRect(sx + dd[0], y + dd[1], 2, 2);
      g.fillStyle = rgba('#e08aa0', 0.8);
      for (const dd of dots) g.fillRect(sx + dd[0], y + dd[1], 1, 1);
    }
  } else if (n.type === 'mushroom') {
    if (!spr(g, D, `mushroom_${n.variant}`, sx, y, {}, 6)) {
      g.fillStyle = '#e8dcc0';
      g.fillRect(sx - 1, y - 3, 2, 3);
      g.fillStyle = '#b0684e';
      g.fillRect(sx - 4, y - 6, 8, 2);
      g.fillRect(sx - 3, y - 7, 6, 1);
      g.fillStyle = rgba(INK, 0.55);
      g.fillRect(sx - 2, y - 7, 1, 1);
      g.fillRect(sx + 1, y - 6, 1, 1);
    }
  } else {
    // fish — under the surface, with a wake
    const bob = Math.sin(S.t * 4 + n.swim) * 1;
    const fy = Math.round(y + bob);
    g.globalAlpha = 0.9;
    if (!spr(g, D, `fish_${n.variant}`, sx, fy + 3, {}, 6)) {
      g.fillStyle = mix(S.water[0], INK, 0.42);
      g.fillRect(sx - 3, fy, 6, 2);
      g.fillRect(sx - 2, fy - 1, 4, 1);
      g.fillStyle = mix(S.water[3], NIGHT, 0.15);
      g.fillRect(sx - 1, fy, 3, 1);
      g.fillStyle = mix(S.water[0], INK, 0.42);
      g.fillRect(sx + 3, fy - 1, 2, 3);
    }
    g.globalAlpha = 1;
    g.fillStyle = rgba(S.water[3], 0.45);
    g.fillRect(sx - 4, fy - 2, 2, 1);
    g.fillRect(sx + 2, fy + 2, 2, 1);
  }
}

function drawSnake(g, S, D, s, sx) {
  const y = Math.round(s.y);
  const shake = s.rattle > 0.2 ? Math.round(Math.sin(S.t * 40) * s.rattle) : 0;
  if (s.rattle > 0.2) {
    // telegraph: a rust warning ring on the ground + rattle blur
    g.globalAlpha = 0.18 + 0.2 * (0.5 + 0.5 * Math.sin(S.t * 8));
    ditherRect(g, sx - 12, y - 8, 24, 12, RUST, 0.5);
    g.globalAlpha = 1;
    g.fillStyle = RUST;
    g.fillRect(sx - 1, y - 15, 1, 3);
    g.fillRect(sx - 1, y - 11, 1, 1);
  }
  if (!spr(g, D, `snake_${Math.floor(S.t * 6) % 2}`, sx, y, {}, 8)) {
    const body = mix('#6b6238', NIGHT, 0.15), band = '#2b2618';
    g.fillStyle = body;
    g.fillRect(sx - 5, y - 3, 10, 2);
    g.fillRect(sx - 6, y - 5, 4, 2);
    g.fillRect(sx + 3, y - 5, 3, 2);
    g.fillRect(sx - 3, y - 6, 6, 1);
    g.fillStyle = band;
    g.fillRect(sx - 3, y - 3, 2, 2);
    g.fillRect(sx + 1, y - 3, 2, 2);
    // head + tongue
    g.fillStyle = body;
    g.fillRect(sx - 8, y - 6, 3, 2);
    g.fillStyle = RUST;
    g.fillRect(sx - 9, y - 5, 1, 1);
    // rattle
    g.fillStyle = '#d9cbb0';
    g.fillRect(sx + 6 + shake, y - 7, 1, 2);
  }
}

function drawBear(g, S, D, b, sx) {
  const y = Math.round(b.y);
  shadow(g, sx, y, 18);
  const chasing = b.state === 'chase';
  const alert = b.state === 'alert';
  const fi = Math.floor(b.phase) % 4;
  if (alert || chasing) {
    // telegraph: pulsing rust ground ring, then a bang above the head
    const p = 0.5 + 0.5 * Math.sin(S.t * (chasing ? 14 : 8));
    g.globalAlpha = 0.16 + p * 0.22;
    ditherRect(g, sx - 16, y - 8, 32, 12, RUST, 0.5);
    g.globalAlpha = 1;
    g.fillStyle = RUST;
    const by = y - 22 - Math.round(p * 2);
    g.fillRect(sx - 1, by, 2, 6);
    g.fillRect(sx - 1, by + 7, 2, 2);
  }
  if (!spr(g, D, `bear_walk_${fi}`, sx, y, { flip: b.dir < 0 }, 12)) {
    const c = chasing ? mix('#150f1e', RUST, 0.16) : '#150f1e';
    const d = b.dir;
    const gait = Math.sin(b.phase * 1.5);
    g.fillStyle = c;
    // legs
    g.fillRect(sx - 7 + Math.round(gait * 1.5), y - 5, 3, 5);
    g.fillRect(sx + 4 - Math.round(gait * 1.5), y - 5, 3, 5);
    g.fillRect(sx - 3 - Math.round(gait), y - 4, 2, 4);
    g.fillRect(sx + 1 + Math.round(gait), y - 4, 2, 4);
    // body
    g.fillRect(sx - 9, y - 11, 18, 7);
    g.fillRect(sx - 7, y - 13, 13, 3);
    // head
    g.fillRect(sx + d * 8 - 3, y - 14, 6, 5);
    g.fillRect(sx + d * 11 - 2, y - 12, 4, 3);
    g.fillRect(sx + d * 7 - 1, y - 16, 2, 2);      // ear
    // snout + eye
    g.fillStyle = mix(c, INK, 0.22);
    g.fillRect(sx + d * 12 - 1, y - 11, 2, 1);
    g.fillStyle = chasing ? RUST : GOLD_DIM;
    g.fillRect(sx + d * 9, y - 13, 1, 1);
  }
}

function drawProp(g, S, p, sx) {
  const y = Math.round(p.y);
  const pal = S.pal;
  const dark = mix(pal[6], NIGHT, 0.55);
  const darker = mix(pal[6], NIGHT, 0.72);
  switch (p.kind) {
    case 'pine': {
      g.fillStyle = darker;
      g.fillRect(sx - 1, y - 4, 2, 4);
      for (let i = 0; i < 5; i++) {
        const w = 9 - i * 2;
        g.fillRect(sx - (w >> 1), y - 6 - i * 3, w, 3);
      }
      g.fillStyle = mix(darker, INK, 0.10);
      g.fillRect(sx - 3, y - 9, 2, 1);
      break;
    }
    case 'juniper':
      g.fillStyle = darker;
      g.fillRect(sx - 5, y - 8, 10, 6);
      g.fillRect(sx - 3, y - 11, 7, 4);
      g.fillRect(sx - 1, y - 3, 2, 3);
      break;
    case 'saguaro':
      g.fillStyle = darker;
      g.fillRect(sx - 2, y - 20, 4, 20);
      g.fillRect(sx - 6, y - 14, 2, 7);
      g.fillRect(sx - 6, y - 15, 4, 2);
      g.fillRect(sx + 4, y - 11, 2, 5);
      g.fillRect(sx + 3, y - 12, 3, 2);
      break;
    case 'yucca':
      g.fillStyle = darker;
      for (let i = -3; i <= 3; i++) {
        g.fillRect(sx + i, y - 5 - Math.abs(3 - Math.abs(i)) * 2, 1, 6 + Math.abs(i));
      }
      break;
    case 'boulder':
      g.fillStyle = dark;
      g.fillRect(sx - 5, y - 4, 10, 4);
      g.fillRect(sx - 3, y - 6, 7, 3);
      g.fillStyle = mix(dark, INK, 0.14);
      g.fillRect(sx - 2, y - 6, 3, 1);
      break;
    case 'snowpatch':
      g.fillStyle = rgba(SKY_ICE, 0.8);
      g.fillRect(sx - 7, y - 2, 14, 2);
      ditherRect(g, sx - 9, y - 3, 18, 3, SKY_ICE, 0.5);
      break;
    case 'fern':
      g.fillStyle = darker;
      for (let i = -4; i <= 4; i += 2) {
        g.fillRect(sx + i, y - 4 - (4 - Math.abs(i)), 1, 4 + (4 - Math.abs(i)));
      }
      break;
    default: // stump
      g.fillStyle = dark;
      g.fillRect(sx - 3, y - 4, 6, 4);
      g.fillStyle = mix(dark, INK, 0.2);
      g.fillRect(sx - 3, y - 5, 6, 1);
      break;
  }
}

function drawParticles(g, S, D) {
  for (const p of S.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    const x = Math.round(p.x - S.camX), y = Math.round(p.y);
    if (p.kind === 'num') {
      txt(g, D, p.text, x, y, { color: p.col, align: 'center', scale: 1 });
      continue;
    }
    if (p.kind === 'ring') {
      g.strokeStyle = rgba(p.col, a * 0.8);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x + 0.5, y + 0.5, p.r0, 0, 6.2832);
      g.stroke();
      continue;
    }
    g.globalAlpha = a;
    g.fillStyle = p.col;
    g.fillRect(x, y, 1, 1);
    if (p.kind === 'sparkle' && a > 0.6) g.fillRect(x + 1, y, 1, 1);
    g.globalAlpha = 1;
  }
}

function vignette(g) {
  g.globalAlpha = 0.25;
  g.fillStyle = NIGHT;
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.05 + i * 0.012;
    g.fillRect(0, 0, BASE_W, 1 + i);
    g.fillRect(0, BASE_H - 1 - i, BASE_W, 1 + i);
    g.fillRect(0, 0, 1 + i, BASE_H);
    g.fillRect(BASE_W - 1 - i, 0, 1 + i, BASE_H);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function txt(g, D, str, x, y, o) {
  const T = D.text;
  if (T && typeof T.drawText === 'function') {
    try { T.drawText(g, String(str), x | 0, y | 0, o || {}); return; }
    catch { D.text = null; }
  }
  fbText(g, str, x, y, o);
}

/** Width of a string in the 5x7 bitmap font, including the 1px advance. */
const CHAR_ADV = 6;
function txtW(D, str, scale = 1) {
  const T = D && D.text;
  if (T && typeof T.measureText === 'function') {
    try { return T.measureText(String(str), scale); } catch { /* fall through */ }
  }
  return String(str).length * CHAR_ADV * scale;
}

function drawHud(g, S, D) {
  // top bar
  g.fillStyle = rgba(PANEL, 0.88);
  g.fillRect(0, 0, BASE_W, 13);
  g.fillStyle = EDGE;
  g.fillRect(0, 13, BASE_W, 1);

  const packLabel = 'PACK';
  txt(g, D, packLabel, 4, 4, { color: INK_DIM, scale: 1 });
  // 100px bar = 1px per pound, starting clear of the label
  const bx = 4 + txtW(D, packLabel) + 4, bw = 100;
  g.fillStyle = rgba(NIGHT, 0.8);
  g.fillRect(bx - 1, 3, bw + 2, 7);
  g.fillStyle = mix(NIGHT, EDGE, 0.5);
  g.fillRect(bx, 4, bw, 5);
  const fill = Math.round(clamp(S.lbs, 0, CAP_LB));
  const nearFull = S.lbs > 88;
  g.fillStyle = nearFull ? GOLD : GOLD_DIM;
  g.fillRect(bx, 4, fill, 5);
  g.fillStyle = rgba(INK, 0.35);
  g.fillRect(bx, 4, fill, 1);
  for (let i = 25; i < 100; i += 25) {
    g.fillStyle = rgba(NIGHT, 0.55);
    g.fillRect(bx + i, 4, 1, 5);
  }
  if (S.full && Math.floor(S.t * 4) % 2 === 0) {
    g.fillStyle = rgba(GOLD, 0.35);
    g.fillRect(bx - 1, 3, bw + 2, 7);
  }
  txt(g, D, `${Math.round(S.lbs)}/100 LB`, bx + bw + 5, 4, { color: nearFull ? GOLD : INK, scale: 1 });

  // timer
  const left = Math.max(0, S.left);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  const low = left <= 10;
  const tc = low ? (Math.floor(S.t * 6) % 2 ? RUST : GOLD) : INK;
  const clock = `${m}:${s < 10 ? '0' : ''}${s}`;
  // Draw from a measured left edge: not every text backend honours align.
  const clockX = BASE_W - 4 - txtW(D, clock);
  txt(g, D, clock, clockX, 4, { color: tc, scale: 1 });
  g.fillStyle = low ? RUST : INK_DIM;
  g.fillRect(clockX - 5, 5, 1, 3);
  g.fillRect(BASE_W - 34, 8, 3, 1);

  // banners
  let by = 26;
  for (const b of S.banners) {
    const a = clamp(b.life / 0.4, 0, 1);
    const w = fbMeasure(b.text, 2) + 10;
    g.globalAlpha = a;
    g.fillStyle = rgba(NIGHT, 0.75);
    g.fillRect((BASE_W - w) / 2 | 0, by - 3, w, 15);
    g.fillStyle = b.col;
    g.fillRect((BASE_W - w) / 2 | 0, by - 3, w, 1);
    g.fillRect((BASE_W - w) / 2 | 0, by + 11, w, 1);
    txt(g, D, b.text, BASE_W / 2, by, { color: b.col, align: 'center', scale: 2 });
    g.globalAlpha = 1;
    by += 18;
  }

  // off-screen bear arrow
  const b = S.bear;
  if (b && (b.state === 'chase' || b.state === 'alert')) {
    const sx = b.x - S.camX;
    if (sx < 4 || sx > BASE_W - 4) {
      const right = sx > BASE_W - 4;
      const ax = right ? BASE_W - 7 : 3;
      const ay = 96 + Math.round(Math.sin(S.t * 8) * 2);
      g.fillStyle = RUST;
      for (let i = 0; i < 5; i++) g.fillRect(ax + (right ? i : 4 - i), ay - 4 + i, 1, 9 - i * 2);
      txt(g, D, 'BEAR', right ? BASE_W - 10 : 10, ay + 8, { color: RUST, align: right ? 'right' : 'left' });
    }
  }
}

function drawHint(g, S, D) {
  const a = clamp(S.hint, 0, 1);
  g.globalAlpha = a;
  const w = 214, x = (BASE_W - w) / 2 | 0, y = BASE_H - 26;
  g.fillStyle = rgba(NIGHT, 0.8);
  g.fillRect(x, y, w, 18);
  g.fillStyle = EDGE;
  g.fillRect(x, y, w, 1); g.fillRect(x, y + 17, w, 1);
  // Flow the three hints left to right off their measured widths so they cannot
  // overlap each other however the labels are worded.
  let hx = x + 6;
  for (const [label, colour] of [['ARROWS MOVE', INK], ['SPACE GATHER', GOLD], ['ESC BACK', INK_DIM]]) {
    txt(g, D, label, hx, y + 3, { color: colour, scale: 1 });
    hx += txtW(D, label) + 7;
  }
  txt(g, D, 'BERRIES, MUSHROOMS, TROUT. WATCH THE BEAR.', x + 6, y + 11, { color: INK_DIM, scale: 1 });
  g.globalAlpha = 1;
}

function drawPaused(g, S, D) {
  g.globalAlpha = 0.6;
  g.fillStyle = NIGHT;
  g.fillRect(0, 0, BASE_W, BASE_H);
  g.globalAlpha = 1;
  txt(g, D, 'PAUSED', BASE_W / 2, BASE_H / 2 - 5, { color: GOLD, align: 'center', scale: 2 });
}

// --- touch controls ----------------------------------------------------
const DPAD = { cx: 34, cy: 146, r: 12 };
const GATHER_BTN = { cx: BASE_W - 32, cy: 146, r: 15 };
function drawTouch(g, S, D) {
  g.globalAlpha = 0.42;
  // d-pad
  const p = DPAD;
  g.fillStyle = PANEL;
  g.fillRect(p.cx - p.r, p.cy - 5, p.r * 2, 10);
  g.fillRect(p.cx - 5, p.cy - p.r, 10, p.r * 2);
  g.fillStyle = EDGE;
  g.fillRect(p.cx - p.r, p.cy - 5, p.r * 2, 1);
  g.fillRect(p.cx - p.r, p.cy + 4, p.r * 2, 1);
  g.fillRect(p.cx - 5, p.cy - p.r, 1, p.r * 2);
  g.fillRect(p.cx + 4, p.cy - p.r, 1, p.r * 2);
  g.fillStyle = INK;
  g.fillRect(p.cx - p.r + 2, p.cy - 1, 3, 3);
  g.fillRect(p.cx + p.r - 4, p.cy - 1, 3, 3);
  g.fillRect(p.cx - 1, p.cy - p.r + 2, 3, 3);
  g.fillRect(p.cx - 1, p.cy + p.r - 4, 3, 3);
  // gather button
  const b = GATHER_BTN;
  g.fillStyle = S.gathering ? GOLD_DIM : PANEL;
  circle(g, b.cx, b.cy, b.r);
  g.fillStyle = GOLD;
  ring(g, b.cx, b.cy, b.r);
  g.globalAlpha = 0.85;
  txt(g, D, 'GET', b.cx, b.cy - 2, { color: S.gathering ? NIGHT : GOLD, align: 'center' });
  g.globalAlpha = 1;
}
function circle(g, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}
function ring(g, cx, cy, r) {
  for (let a = 0; a < 44; a++) {
    const t = (a / 44) * 6.2832;
    g.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 1, 1);
  }
}
function hitTouch(S, p) {
  const d = DPAD;
  if (p.x > d.cx - d.r - 4 && p.x < d.cx + d.r + 4 && p.y > d.cy - d.r - 4 && p.y < d.cy + d.r + 4) {
    const dx = p.x - d.cx, dy = p.y - d.cy;
    S.dpad.x = Math.abs(dx) > 4 ? Math.sign(dx) : 0;
    S.dpad.y = Math.abs(dy) > 4 ? Math.sign(dy) : 0;
    return true;
  }
  const b = GATHER_BTN;
  if (Math.hypot(p.x - b.cx, p.y - b.cy) < b.r + 4) { S.gathering = true; return true; }
  return false;
}

export default { runForage };
