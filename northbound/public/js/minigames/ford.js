// ============================================================================
// NORTHBOUND — minigames/ford.js
//
// River crossings (SPEC §5.4 / §7.2). One entry point, five methods:
//
//   export function runFord(canvas, opts) -> Promise<{ success, severity, log }>
//   opts: { ford, method, g, rng, audio, bonus, biome, timeScale, autoplay }
//
//   'ford'      steer the crew across a scrolling river, holding the pale
//               shallow channel that snakes away from you. Footing drains in
//               deep water. Graded 0..3.
//   'rock-hop'  three timed hops; a marker sweeps a bar, the green window
//               shrinks each beat.
//   'raft' / 'shuttle' / 'wait'   short animated beats, no input.
//
// severity: 0 clean, 1 wet, 2 swamped, 3 disaster. success = severity <= 1.
// Esc skips with an average result. Resolves exactly once, always cleans up.
// ============================================================================

const BASE_W = 320;
const BASE_H = 180;

// ---------------------------------------------------------------------------
// Optional dependencies (dynamic + defensive — never take the page down)
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
  return Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(r, ms))]);
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const INK = '#f4ecdd', INK_DIM = '#a99e8c', NIGHT = '#0e0b17', PANEL = '#1a1526';
const EDGE = '#4b3f66', GOLD = '#f2c98a', GOLD_DIM = '#c39d63', RUST = '#d1785c';
const SAGE = '#8fd0a4', SKY_ICE = '#bfe3ff', VIOLET = '#6b5a94';

// [skyTop, skyBottom, ridgeFar, ridgeMid, ridgeNear, bank]
const SKY_PAL = {
  desert:     ['#3a2c46', '#c08a70', '#5a4560', '#42324e', '#2e2440', '#6b5040'],
  chaparral:  ['#2f2b46', '#a08e76', '#514a63', '#3c3750', '#2b2740', '#5f5a42'],
  sierra:     ['#26304a', '#8fa8c0', '#4a5670', '#36405a', '#262e44', '#46523f'],
  alpine:     ['#1e2740', '#a8c4e0', '#48577a', '#33415e', '#232c42', '#4e5666'],
  forest:     ['#1d2a33', '#6e8a72', '#334a44', '#26382f', '#1b2822', '#30402f'],
  volcanic:   ['#2a1c28', '#8a5a52', '#4a3340', '#38262f', '#251a22', '#332a2c'],
  rainforest: ['#1b2a2e', '#5f8a80', '#2e4a48', '#213834', '#172723', '#26382c'],
};
// [deep, mid, shallow, foam]
const WATER = ['#1b2440', '#2f4b6b', '#6f9ab8', '#dff0ff'];

const FLOW = {
  calm:   { push: 11, wobble: 0.30, risk: 0.0, label: 'CALM' },
  brisk:  { push: 20, wobble: 0.55, risk: 0.6, label: 'BRISK' },
  raging: { push: 33, wobble: 0.85, risk: 1.4, label: 'RAGING' },
};

// ---------------------------------------------------------------------------
// Fallback 3x5 font (used only when render/text.js is unavailable)
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
    const gl = F3[str[i]] || F3['?'];
    const gx = px + i * 4 * s;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (gl[r * 3 + c] === '1') ctx.fillRect(gx + c * s, py + r * s, s, s);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
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
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
function rgba(hex, a) { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ditherRect(ctx, x, y, w, h, color, level) {
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
 * Run a river crossing.
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts { ford, method, g, rng, audio, bonus, biome, timeScale, autoplay }
 * @returns {Promise<{success:boolean, severity:number, log:string[]}>}
 */
export function runFord(canvas, opts) {
  const o = opts || {};
  const ford = o.ford && typeof o.ford === 'object' ? o.ford : {};
  const method = ['ford', 'rock-hop', 'raft', 'shuttle', 'wait'].indexOf(o.method) >= 0 ? o.method : 'ford';
  const rng = typeof o.rng === 'function' ? o.rng : mulberry32((Math.random() * 0xffffffff) | 0);

  return new Promise((resolve) => {
    let settled = false;
    const S = createState(ford, method, rng, o);
    let stop = null;

    const finish = (reason) => {
      if (settled) return;
      settled = true;
      try { if (stop) stop(); } catch { /* never throw on the way out */ }
      let severity;
      if (reason === 'esc') severity = averageSeverity(S);
      else severity = clamp(Math.round(S.severity), 0, 3);
      severity = clamp(severity, 0, 3);
      resolve({
        success: severity <= 1,
        severity,
        log: logFor(S, severity, reason),
        // additive extras
        method: S.method, skipped: reason === 'esc',
        cleanTime: Math.round((S.cleanTime || 0) * 10) / 10,
      });
    };

    try {
      stop = boot(canvas, S, finish);
    } catch {
      settled = true;
      const severity = averageSeverity(S);
      resolve({ success: severity <= 1, severity, log: logFor(S, severity, 'error') });
    }
  });
}

function averageSeverity(S) {
  const base = { ford: 1, 'rock-hop': 1, raft: 1, shuttle: 0, wait: 0 }[S.method];
  const r = S.rng();
  const risk = S.flow.risk;
  if (S.method === 'shuttle') return 0;
  if (S.method === 'wait') return r < 0.85 ? 0 : 1;
  if (risk >= 1.2) return r < 0.35 ? base : base + 1;
  if (risk >= 0.5) return r < 0.7 ? base : base - (r < 0.85 ? 1 : 0);
  return r < 0.5 ? Math.max(0, base - 1) : base;
}

function logFor(S, severity, reason) {
  const name = S.ford.name || 'the river';
  const out = [];
  if (reason === 'esc') out.push(`You take the crossing at ${name} the plain way, without ceremony.`);
  if (S.method === 'shuttle') {
    out.push(`A trail angel's pickup rattles up and hauls the crew around ${name}.`);
  } else if (S.method === 'wait') {
    out.push(`You camp and let the cold night pull ${name} down. By dawn the water is a hand lower.`);
  } else if (S.method === 'raft') {
    out.push(`You inflate the pack raft and ferry the crew across ${name} in two trips.`);
  } else if (S.method === 'rock-hop') {
    out.push(S.hops != null
      ? `Rock-hopping upstream: ${S.hops} of 3 hops landed clean.`
      : `You pick your way upstream and rock-hop ${name}.`);
  } else {
    out.push(`You rope up and wade into ${name}.`);
  }
  out.push([
    'Clean crossing. Wet to the knee, nothing lost.',
    'Cold water to the hips — a pack goes under and some food is ruined.',
    'The crew is swamped mid-channel. Gear breaks loose and rolls downstream.',
    'The river takes the crossing away from you. It is a bad hour, and someone pays for it.',
  ][clamp(severity, 0, 3)]);
  return out;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function createState(ford, method, rng, o) {
  const flow = FLOW[ford.flow] || FLOW.brisk;
  const depthFt = Number.isFinite(ford.depthFt) ? clamp(ford.depthFt, 0.5, 9) : 3;
  const widthFt = Number.isFinite(ford.widthFt) ? clamp(ford.widthFt, 8, 400) : 70;
  const biome = SKY_PAL[o.biome] ? o.biome : (o.g && SKY_PAL[o.g.biome] ? o.g.biome : 'sierra');
  let bonus = 0;
  if (Number.isFinite(o.bonus)) bonus = o.bonus;
  else if (o.g && o.g.perks && Number.isFinite(o.g.perks.fordBonus)) bonus = o.g.perks.fordBonus;
  let crew = 5, mules = 3;
  try {
    if (o.g && Array.isArray(o.g.party)) crew = clamp(o.g.party.filter((p) => p && p.alive !== false).length, 1, 6);
    if (o.g && o.g.supplies && Number.isFinite(o.g.supplies.mules)) mules = clamp(o.g.supplies.mules | 0, 0, 5);
  } catch { /* defaults */ }

  // channel width and crossing time scale with the ford's numbers
  const half = clamp(46 - depthFt * 3.2 - flow.risk * 5, 15, 44);
  const duration = clamp(6 + widthFt / 12, 7, 15);

  return {
    ford, method, rng, flow, depthFt, widthFt, biome, bonus, crew, mules,
    pal: SKY_PAL[biome] || SKY_PAL.sierra,
    audio: o.audio || null,
    autoplay: !!o.autoplay,
    skill: Number.isFinite(o.autoplaySkill) ? clamp(o.autoplaySkill, 0, 1) : 0.75,
    timeScale: Number.isFinite(o.timeScale) ? clamp(o.timeScale, 0.1, 20) : 1,
    t: 0, done: false, outT: 0,
    // steering
    scroll: 0, speed: 0, duration, total: 0, half,
    crewX: 160, crewV: 0, footing: 1, deepTime: 0, midTime: 0, cleanTime: 0,
    swamps: 0, severity: 0, progress: 0, phase: rng() * 6.283, phase2: rng() * 6.283,
    stumble: 0, splashT: 0,
    // rock-hop
    hops: null, beat: 0, marker: 0, mDir: 1, winCenter: 160, beatT: 0, hopAnim: 0, hopFrom: 0, hopTo: 1, missFlash: 0,
    // shared
    keys: Object.create(null), pressed: false, hint: 3,
    parts: [], banners: [], shake: 0, flash: 0, flashCol: RUST,
    reduced: false, paused: false, touch: false, night: 0,
  };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot(canvas, S, finish) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) { setTimeout(() => finish('nocanvas'), 0); return () => {}; }
  const buf = document.createElement('canvas');
  buf.width = BASE_W; buf.height = BASE_H;
  const g = buf.getContext('2d');
  if (!g) { setTimeout(() => finish('nocanvas'), 0); return () => {}; }
  g.imageSmoothingEnabled = false;

  let sizedByUs = false; const oldW = canvas.width, oldH = canvas.height;
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

  setupMethod(S);
  const layers = buildLayers(S);

  const D = { atlas: null, text: null, fx: null, audio: S.audio, fxi: null };
  let disposed = false;
  loadDeps().then((d) => {
    if (disposed) return;
    D.atlas = d.atlas; D.text = d.text;
    if (!D.audio) D.audio = d.audio && d.audio.Audio ? d.audio.Audio : null;
    if (d.fx && typeof d.fx.createFx === 'function') { try { D.fxi = d.fx.createFx(); } catch { D.fxi = null; } }
    try { if (D.audio && D.audio.playMusic) D.audio.playMusic('ford'); } catch { /* mute */ }
    sfx(D, 'river', 0.7);
  });

  // ---- input ---------------------------------------------------------
  const onKeyDown = (e) => {
    const k = normKey(e);
    if (!k) return;
    if (k === 'esc') { e.preventDefault(); finish('esc'); return; }
    e.preventDefault();
    if (k === 'space' && !S.keys.space) S.pressed = true;
    S.keys[k] = true;
  };
  const onKeyUp = (e) => {
    const k = normKey(e);
    if (!k) return;
    S.keys[k] = false;
  };
  const onBlur = () => { S.keys = Object.create(null); S.touchDir = 0; };
  const onVis = () => { S.paused = !!document.hidden; if (S.paused) onBlur(); last = 0; };
  const onPointerDown = (e) => {
    const p = toBuffer(canvas, e);
    if (!p) return;
    e.preventDefault();
    if (S.method === 'ford') S.touchDir = p.x < BASE_W / 2 ? -1 : 1;
    else S.pressed = true;
  };
  const onPointerUp = () => { S.touchDir = 0; };

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // ---- loop ----------------------------------------------------------
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
      if (dt > 0) update(S, dt, D, finish);
      render(g, S, D, layers);
    } catch {
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

function normKey(e) {
  const k = e.key;
  if (!k) return null;
  switch (k) {
    case 'ArrowLeft': case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
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
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Method setup
// ---------------------------------------------------------------------------
const CREW_Y = 132;       // waterline the crew stands at (screen y)
const RIVER_TOP = 15;

function setupMethod(S) {
  if (S.method === 'ford') {
    S.speed = 30;
    S.total = S.speed * S.duration;
    S.crewX = chanCenter(S, S.scroll + (BASE_H - CREW_Y));
  } else if (S.method === 'rock-hop') {
    S.hops = 0;
    S.beat = 0;
    S.beatT = 0;
    newBeat(S);
  } else {
    S.duration = S.method === 'wait' ? 3.0 : S.method === 'raft' ? 2.8 : 2.4;
  }
}

function chanCenter(S, wy) {
  const c = 160
    + Math.sin(wy * 0.0165 + S.phase) * 62
    + Math.sin(wy * 0.0071 + S.phase2) * 34;
  return clamp(c, 34 + S.half, BASE_W - 34 - S.half);
}

function newBeat(S) {
  const r = S.rng;
  S.winCenter = 70 + r() * 180;
  S.marker = S.beat % 2 === 0 ? 42 : 278;
  S.mDir = S.beat % 2 === 0 ? 1 : -1;
  S.mSpeed = 150 + S.beat * 46 + S.flow.risk * 22;
  S.winHalf = [23, 16, 11][S.beat] || 11;
  S.beatT = 0;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(S, dt, D, finish) {
  S.t += dt;
  if (S.hint > 0) S.hint -= dt;
  S.shake = Math.max(0, S.shake - dt * 24);
  S.flash = Math.max(0, S.flash - dt * 3.2);
  S.missFlash = Math.max(0, S.missFlash - dt * 3);
  updateParticles(S, dt);
  for (let i = S.banners.length - 1; i >= 0; i--) {
    S.banners[i].life -= dt;
    if (S.banners[i].life <= 0) S.banners.splice(i, 1);
  }
  if (D.fxi && D.fxi.update) { try { D.fxi.update(dt); } catch { D.fxi = null; } }

  if (S.done) {
    S.outT += dt;
    if (S.outT > (S.reduced ? 0.6 : 1.15)) finish('done');
    return;
  }

  if (S.method === 'ford') updateWade(S, dt, D);
  else if (S.method === 'rock-hop') updateHop(S, dt, D);
  else updateBeat(S, dt, D);
  S.pressed = false;
}

function endRun(S, severity, D) {
  if (S.done) return;
  S.done = true;
  S.outT = 0;
  S.severity = clamp(Math.round(severity), 0, 3);
  const words = ['CLEAN CROSSING', 'WET CROSSING', 'SWAMPED', 'DISASTER'][S.severity];
  const col = [SAGE, GOLD, RUST, RUST][S.severity];
  banner(S, words, col, 4);
  if (S.severity >= 2) {
    S.shake = S.reduced ? 2 : 7;
    S.flash = S.reduced ? 0.4 : 1;
    S.flashCol = RUST;
  }
  sfx(D, S.severity <= 1 ? 'level_up' : S.severity === 2 ? 'splash' : 'death_knell', 0.9);
}

// --- wade ---------------------------------------------------------------
function updateWade(S, dt, D) {
  const wyCrew = S.scroll + (BASE_H - CREW_Y);
  const cx = chanCenter(S, wyCrew);

  // steering
  let input = 0;
  if (S.keys.left) input -= 1;
  if (S.keys.right) input += 1;
  if (S.touchDir) input += S.touchDir;
  if (S.autoplay) {
    const err = (S.rng() - 0.5) * (1 - S.skill) * 90;
    const look = chanCenter(S, wyCrew + 26);
    const target = look + err;
    input = Math.abs(target - S.crewX) < 3 ? 0 : (target > S.crewX ? 1 : -1);
    if (S.rng() < (1 - S.skill) * 0.05) input = -input;
  }
  input = clamp(input, -1, 1);

  const push = S.flow.push * (0.72 + 0.28 * Math.sin(S.t * 1.15 + S.phase));
  const dir = Math.sin(S.t * 0.42 + S.phase2) > -0.25 ? 1 : -1;   // current mostly one way
  const stumbling = S.stumble > 0;
  if (stumbling) S.stumble -= dt;
  const control = stumbling ? 0.15 : 1;
  S.crewV += (input * 78 * control + push * dir) * dt;
  S.crewV *= Math.pow(0.02, dt);       // heavy damping — wading, not driving
  S.crewX = clamp(S.crewX + S.crewV * dt, 12, BASE_W - 12);

  // depth at the crew: 0 = dead centre of the channel
  const off = Math.abs(S.crewX - cx) / S.half;
  S.off = off;
  if (off < 0.5) {
    S.cleanTime += dt;
    S.footing = clamp(S.footing + dt * 0.22, 0, 1);
  } else if (off < 1) {
    S.midTime += dt;
    S.footing = clamp(S.footing - dt * 0.16 * (1 + S.flow.risk), 0, 1);
    if (S.t % 0.3 < dt) spawnSplash(S, D, 1);
  } else {
    S.deepTime += dt;
    S.footing = clamp(S.footing - dt * (0.42 + 0.2 * S.flow.risk) * Math.min(2.2, off), 0, 1);
    if (S.t % 0.14 < dt) spawnSplash(S, D, 3);
    if (!S.deepWarn || S.t - S.deepWarn > 2.2) {
      S.deepWarn = S.t;
      banner(S, 'DEEP WATER', RUST, 1.1);
      sfx(D, 'splash', 0.7);
    }
  }

  // footing failure
  if (S.footing <= 0) {
    S.swamps++;
    S.footing = 0.45;
    S.stumble = 0.85;
    S.crewV += (S.rng() - 0.5) * 40;
    banner(S, 'SWEPT OFF YOUR FEET', RUST, 1.4);
    S.shake = S.reduced ? 1.6 : 6;
    S.flash = S.reduced ? 0.4 : 0.9; S.flashCol = RUST;
    spawnSplash(S, D, 14);
    sfx(D, 'splash', 1);
  }

  // advance — you cross slower when you are fighting the current
  const adv = S.speed * (off < 1 ? 1 : 0.72);
  S.scroll += adv * dt;
  S.progress = clamp((S.scroll) / S.total, 0, 1);
  if (S.progress >= 1) {
    const risk = S.deepTime * 1.25 + S.midTime * 0.3 + S.swamps * 1.5
      + (1 - S.footing) * 1.1 + S.flow.risk * 0.5 + (S.depthFt - 3) * 0.18
      - S.bonus * 2.2;
    let sev = risk < 0.85 ? 0 : risk < 2.3 ? 1 : risk < 4.1 ? 2 : 3;
    if (sev === 3 && S.rng() < 0.35) sev = 2;      // disasters stay rare
    endRun(S, sev, D);
  }
}

// --- rock-hop -----------------------------------------------------------
function updateHop(S, dt, D) {
  if (S.hopAnim > 0) {
    S.hopAnim = Math.max(0, S.hopAnim - dt * 2.2);
    if (S.hopAnim === 0 && S.beat >= 3) {
      let sev = [S.flow.risk >= 1.2 ? 3 : 2, 2, 1, 0][clamp(S.hops, 0, 3)];
      if (S.bonus > 0 && sev > 0 && S.rng() < S.bonus * 2) sev--;
      endRun(S, sev, D);
    }
    return;
  }
  if (S.beat >= 3) return;

  S.beatT += dt;
  S.marker += S.mDir * S.mSpeed * dt;
  if (S.marker > 278) { S.marker = 278; S.mDir = -1; }
  if (S.marker < 42) { S.marker = 42; S.mDir = 1; }

  let press = S.pressed;
  if (S.autoplay) {
    const tol = S.winHalf * (0.5 + S.skill * 0.7);
    press = Math.abs(S.marker - S.winCenter) < tol && S.rng() < 0.75;
  }
  // never let a beat stall the game
  if (S.beatT > 5) press = true;

  if (press) {
    const d = Math.abs(S.marker - S.winCenter);
    const hit = d <= S.winHalf;
    if (hit) {
      S.hops++;
      banner(S, d < S.winHalf * 0.35 ? 'PERFECT' : 'GOOD', d < S.winHalf * 0.35 ? SAGE : GOLD, 0.8);
      sfx(D, 'select', 0.8);
      spawnSplash(S, D, 3);
    } else {
      banner(S, 'SLIP', RUST, 0.9);
      sfx(D, 'splash', 0.9);
      spawnSplash(S, D, 12);
      S.missFlash = 1;
      S.shake = S.reduced ? 1 : 4;
    }
    S.hopFrom = S.beat;
    S.hopTo = S.beat + 1;
    S.hopHit = hit;
    S.hopAnim = 1;
    S.beat++;
    if (S.beat < 3) newBeat(S);
  }
}

// --- raft / shuttle / wait ---------------------------------------------
function updateBeat(S, dt, D) {
  S.progress = clamp(S.progress + dt / S.duration, 0, 1);
  if (S.method === 'wait') S.night = S.progress;
  if (S.method === 'raft' && S.t % 0.3 < dt) spawnSplash(S, D, 2);
  if (S.progress >= 1) {
    const r = S.rng();
    let sev;
    if (S.method === 'shuttle') sev = r < 0.96 ? 0 : 1;
    else if (S.method === 'wait') sev = r < 0.8 ? 0 : 1;
    else {
      const risk = S.flow.risk;
      if (risk >= 1.2) sev = r < 0.34 ? 0 : r < 0.69 ? 1 : r < 0.92 ? 2 : 3;
      else if (risk >= 0.5) sev = r < 0.6 ? 0 : r < 0.9 ? 1 : r < 0.99 ? 2 : 3;
      else sev = r < 0.85 ? 0 : r < 0.98 ? 1 : 2;
      if (S.bonus > 0 && sev > 0 && S.rng() < S.bonus * 2) sev--;
    }
    endRun(S, sev, D);
  }
}

// ---------------------------------------------------------------------------
// Particles / banners / audio
// ---------------------------------------------------------------------------
function spawnSplash(S, D, n) {
  const x = S.method === 'ford' ? S.crewX : 160;
  const y = S.method === 'ford' ? CREW_Y : 118;
  for (let i = 0; i < n; i++) {
    if (S.parts.length > 200) break;
    const a = -0.5 - S.rng() * 2.2, sp = 16 + S.rng() * 46;
    S.parts.push({
      x: x + (S.rng() - 0.5) * 22, y: y + (S.rng() - 0.5) * 4,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + S.rng() * 0.25, max: 0.75, col: S.rng() < 0.5 ? WATER[3] : WATER[2],
    });
  }
  emitFx(D, 'splash', { x, y, count: Math.min(6, n) });
}
function updateParticles(S, dt) {
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.life -= dt;
    if (p.life <= 0) { S.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 170 * dt;
  }
}
function banner(S, text, col, life) { S.banners.push({ text, col, life, max: life }); }
function sfx(D, id, vol) {
  try { if (D.audio && D.audio.sfx) D.audio.sfx(id, { vol: vol == null ? 1 : vol }); } catch { D.audio = null; }
}
function emitFx(D, kind, o) {
  if (!D.fxi || !D.fxi.emit) return;
  try { D.fxi.emit(kind, o); } catch { D.fxi = null; }
}

// ---------------------------------------------------------------------------
// Static layers
// ---------------------------------------------------------------------------
function buildLayers(S) {
  const pal = S.pal;
  const sky = document.createElement('canvas');
  sky.width = BASE_W; sky.height = 64;
  const c = sky.getContext('2d');
  if (c) {
    c.fillStyle = pal[0];
    c.fillRect(0, 0, BASE_W, 64);
    for (let b = 0; b < 5; b++) {
      ditherRect(c, 0, 4 + b * 5, BASE_W, 7, mix(pal[0], pal[1], (b + 1) / 5), 0.2 + b * 0.2);
    }
    ditherRect(c, 0, 28, BASE_W, 8, pal[1], 0.85);
    c.fillStyle = pal[1];
    c.fillRect(0, 34, BASE_W, 6);
    // ridgelines
    const r = S.rng;
    const seed = r() * 100;
    c.fillStyle = pal[2];
    for (let i = 0; i < BASE_W; i++) {
      const h = Math.sin(i / 34 + seed) * 9 + Math.sin(i / 11 + seed * 2) * 4;
      const top = (30 - h) | 0;
      c.fillRect(i, top, 1, 64 - top);
    }
    c.fillStyle = pal[3];
    for (let i = 0; i < BASE_W; i++) {
      const h = Math.sin(i / 21 + seed * 3) * 6 + Math.sin(i / 7 + seed) * 3;
      const top = (39 - h) | 0;
      c.fillRect(i, top, 1, 64 - top);
    }
    // far bank treeline
    c.fillStyle = pal[4];
    c.fillRect(0, 46, BASE_W, 18);
    const treeish = S.biome !== 'desert' && S.biome !== 'alpine';
    for (let i = 0; i < BASE_W; i += 3) {
      if (treeish && r() < 0.5) {
        const h = 5 + r() * 11;
        for (let j = 0; j < h; j++) {
          const w = Math.max(1, Math.round((1 - j / h) * 5));
          c.fillRect(i - (w >> 1), 46 - j, w, 1);
        }
      } else if (r() < 0.3) {
        c.fillRect(i - 1, 43 - (r() * 3 | 0), 3, 4);
      }
    }
    c.fillStyle = pal[5];
    c.fillRect(0, 56, BASE_W, 8);
    ditherRect(c, 0, 54, BASE_W, 3, pal[5], 0.5);
  }
  return { sky };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(g, S, D, L) {
  g.save();
  g.globalAlpha = 1;
  g.fillStyle = NIGHT;
  g.fillRect(0, 0, BASE_W, BASE_H);
  const sh = S.shake > 0.05 ? (S.reduced ? S.shake * 0.25 : S.shake) : 0;
  const ox = sh ? Math.round((S.rng() - 0.5) * sh) : 0;
  const oy = sh ? Math.round((S.rng() - 0.5) * sh * 0.6) : 0;
  g.translate(ox, oy);

  if (S.method === 'ford') renderWade(g, S, D, L);
  else if (S.method === 'rock-hop') renderHop(g, S, D, L);
  else renderBeat(g, S, D, L);

  drawParticles(g, S);
  if (D.fxi && D.fxi.draw) { try { D.fxi.draw(g); } catch { D.fxi = null; } }
  g.translate(-ox, -oy);

  if (S.flash > 0.02) {
    g.globalAlpha = clamp(S.flash * (S.reduced ? 0.16 : 0.32), 0, 0.42);
    g.fillStyle = S.flashCol;
    g.fillRect(0, 0, BASE_W, BASE_H);
    g.globalAlpha = 1;
  }
  vignette(g);
  drawHud(g, S, D);
  drawBanners(g, S, D);
  if (S.hint > 0 && !S.done) drawHint(g, S, D);
  if (S.paused) {
    g.globalAlpha = 0.6; g.fillStyle = NIGHT; g.fillRect(0, 0, BASE_W, BASE_H); g.globalAlpha = 1;
    txt(g, D, 'PAUSED', BASE_W / 2, BASE_H / 2 - 5, { color: GOLD, align: 'center', scale: 2 });
  }
  g.restore();
}

// --- the wade ----------------------------------------------------------
function renderWade(g, S, D, L) {
  // far bank slides in as you approach it
  const bankY = Math.round(BASE_H - (S.total - S.scroll));
  if (L.sky) {
    if (bankY > RIVER_TOP - 64) g.drawImage(L.sky, 0, Math.min(bankY - 64, RIVER_TOP - 6));
    else g.drawImage(L.sky, 0, RIVER_TOP - 64);
  }
  const waterTop = clamp(bankY, RIVER_TOP, BASE_H);

  // water rows, 2px steps
  g.fillStyle = WATER[0];
  g.fillRect(0, waterTop, BASE_W, BASE_H - waterTop);
  const t = S.t;
  for (let y = waterTop; y < BASE_H; y += 2) {
    const wy = S.scroll + (BASE_H - y);
    const cx = chanCenter(S, wy);
    const hw = S.half;
    const shal = hw * 0.5;
    // mid band
    g.fillStyle = WATER[1];
    g.fillRect(Math.round(cx - hw), y, Math.round(hw * 2), 2);
    // shallow channel
    g.fillStyle = WATER[2];
    g.fillRect(Math.round(cx - shal), y, Math.round(shal * 2), 2);
    // dithered lip between shallow and mid so the edge reads as a gradient
    ditherRect(g, Math.round(cx - shal - 4), y, 4, 2, WATER[2], 0.5);
    ditherRect(g, Math.round(cx + shal), y, 4, 2, WATER[2], 0.5);
    // foam line marking the channel edge, animated
    const ph = Math.floor(wy * 0.5 + t * 9) % 4;
    if (ph < 2) {
      g.fillStyle = rgba(WATER[3], 0.65);
      g.fillRect(Math.round(cx - hw) - 1, y, 2, 1);
      g.fillRect(Math.round(cx + hw) - 1, y, 2, 1);
    }
    // current streaks out in the deep
    if (((Math.floor(wy) + Math.floor(t * 26)) % 17) === 0) {
      g.fillStyle = rgba(WATER[2], 0.5);
      g.fillRect(Math.round(cx - hw - 22), y, 6, 1);
      g.fillRect(Math.round(cx + hw + 16), y, 6, 1);
    }
  }

  // rocks pinning the channel edge (readability anchors)
  for (let i = 0; i < 22; i++) {
    const wy = (Math.floor(S.scroll / 26) + i) * 26 + ((i * 53) % 21);
    const y = Math.round(BASE_H - (wy - S.scroll));
    if (y < waterTop - 4 || y > BASE_H) continue;
    const cx = chanCenter(S, wy);
    const side = i % 2 ? 1 : -1;
    const x = Math.round(cx + side * (S.half + 3 + (i % 3)));
    drawRock(g, D, x, y, i % 3);
  }

  if (bankY > RIVER_TOP) {
    // the far shore itself
    g.fillStyle = S.pal[5];
    g.fillRect(0, Math.max(RIVER_TOP, bankY - 4), BASE_W, 5);
    ditherRect(g, 0, Math.max(RIVER_TOP, bankY - 6), BASE_W, 3, S.pal[5], 0.5);
  }

  // crew — clipped at the waterline so deep water swallows them
  const off = S.off || 0;
  const sink = Math.round(clamp((off - 0.45) / 1.1, 0, 1) * 11);
  const wob = S.stumble > 0 ? Math.round(Math.sin(S.t * 30) * 2) : 0;
  g.save();
  g.beginPath();
  g.rect(0, 0, BASE_W, CREW_Y + 1);
  g.clip();
  const n = S.crew + (S.mules > 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const isMule = S.mules > 0 && i === n - 1;
    const x = Math.round(S.crewX + (i - (n - 1) / 2) * 9 + wob);
    const bob = Math.sin(S.t * 4 + i) * 0.8;
    if (isMule) drawMule(g, D, x, CREW_Y + sink + bob, S.t);
    else drawWader(g, D, x, CREW_Y + sink + bob, i, S.t, S);
  }
  g.restore();
  // waterline ripples around each figure
  for (let i = 0; i < n; i++) {
    const x = Math.round(S.crewX + (i - (n - 1) / 2) * 9 + wob);
    g.fillStyle = rgba(WATER[3], 0.55);
    const w = 4 + Math.round(Math.sin(S.t * 6 + i) * 1);
    g.fillRect(x - w, CREW_Y - 1, w * 2, 1);
    g.fillStyle = rgba(WATER[3], 0.25);
    g.fillRect(x - w - 2, CREW_Y, w * 2 + 4, 1);
  }

  // the safe-line pointer: where the channel goes next
  const look = chanCenter(S, S.scroll + (BASE_H - CREW_Y) + 30);
  const ay = CREW_Y - 34;
  const pulse = 0.55 + 0.45 * Math.sin(S.t * 5);
  g.globalAlpha = 0.35 + pulse * 0.35;
  g.fillStyle = SKY_ICE;
  for (let i = 0; i < 3; i++) {
    g.fillRect(Math.round(look) - 3 + i, ay - i, 1, 1);
    g.fillRect(Math.round(look) + 3 - i, ay - i, 1, 1);
  }
  g.fillRect(Math.round(look), ay - 3, 1, 6);
  g.globalAlpha = 1;
}

function drawRock(g, D, x, y, v) {
  if (spr(g, D, `rock_${v}`, x, y, {}, 6)) return;
  g.fillStyle = '#2c2839';
  g.fillRect(x - 4, y - 3, 8, 4);
  g.fillRect(x - 2, y - 5, 5, 3);
  g.fillStyle = mix('#2c2839', INK, 0.22);
  g.fillRect(x - 1, y - 5, 3, 1);
  g.fillStyle = rgba(WATER[3], 0.4);
  g.fillRect(x - 5, y + 1, 10, 1);
}

function drawWader(g, D, x, yFeet, i, t, S) {
  const y = Math.round(yFeet);
  const fi = Math.floor(t * 6 + i) % 6;
  if (spr(g, D, `hiker_walk_${fi}`, x, y, {}, 12)) return;
  const dark = '#191428';
  const shirt = [S.pal[5], RUST, SAGE, GOLD_DIM, VIOLET][i % 5];
  const sway = Math.sin(t * 5 + i * 1.3) * 1;
  g.fillStyle = dark;
  g.fillRect(x - 2, y - 7, 2, 7);
  g.fillRect(x + 1, y - 7, 2, 7);
  g.fillRect(x - 3, y - 14, 6, 8);
  g.fillStyle = shirt;
  g.fillRect(x - 3, y - 13, 6, 3);
  g.fillStyle = GOLD_DIM;
  g.fillRect(x - 5, y - 14, 2, 6);            // pack held high
  g.fillStyle = '#c9a184';
  g.fillRect(x - 2, y - 18, 4, 4);
  g.fillStyle = dark;
  g.fillRect(x - 3, y - 19, 6, 1);
  // trekking pole braced against the current
  g.fillStyle = INK_DIM;
  const px = x + 4 + Math.round(sway);
  g.fillRect(px, y - 13, 1, 14);
}

function drawMule(g, D, x, yFeet, t) {
  const y = Math.round(yFeet);
  if (spr(g, D, `mule_walk_${Math.floor(t * 6) % 6}`, x, y, {}, 12)) return;
  const c = '#241c2c';
  g.fillStyle = c;
  g.fillRect(x - 7, y - 9, 14, 5);
  g.fillRect(x - 6, y - 4, 2, 4);
  g.fillRect(x + 4, y - 4, 2, 4);
  g.fillRect(x + 5, y - 13, 4, 5);
  g.fillRect(x + 8, y - 11, 3, 2);
  g.fillRect(x + 5, y - 15, 1, 2);
  g.fillRect(x + 7, y - 15, 1, 2);
  g.fillStyle = GOLD_DIM;
  g.fillRect(x - 5, y - 12, 8, 3);            // panniers
}

// --- rock hop ----------------------------------------------------------
function renderHop(g, S, D, L) {
  if (L.sky) g.drawImage(L.sky, 0, 0);
  // creek, side on
  const wy = 96;
  g.fillStyle = WATER[1];
  g.fillRect(0, wy, BASE_W, BASE_H - wy);
  g.fillStyle = WATER[0];
  g.fillRect(0, wy + 14, BASE_W, BASE_H - wy - 14);
  ditherRect(g, 0, wy + 10, BASE_W, 6, WATER[0], 0.5);
  g.fillStyle = WATER[2];
  g.fillRect(0, wy, BASE_W, 2);
  for (let i = 0; i < 30; i++) {
    const x = ((i * 47) + S.t * (30 + (i % 3) * 14)) % (BASE_W + 20) - 10;
    const y = wy + 3 + ((i * 29) % 22);
    g.fillStyle = i % 4 === 0 ? rgba(WATER[3], 0.6) : rgba(WATER[2], 0.55);
    g.fillRect(x | 0, y | 0, 3 + (i % 3), 1);
  }
  // banks
  g.fillStyle = S.pal[5];
  g.fillRect(0, wy - 6, 46, 6 + BASE_H);
  g.fillRect(BASE_W - 46, wy - 6, 46, 6 + BASE_H);
  ditherRect(g, 40, wy - 4, 8, 4, S.pal[5], 0.5);
  ditherRect(g, BASE_W - 48, wy - 4, 8, 4, S.pal[5], 0.5);

  // four stepping stones
  const stones = [46, 124, 196, 274];
  for (let i = 0; i < stones.length; i++) {
    drawRock(g, D, stones[i], wy + 6 + (i % 2), i % 3);
  }
  // the hiker, hopping between them
  let hx, hy = wy - 1;
  if (S.hopAnim > 0) {
    const p = 1 - S.hopAnim;
    hx = stones[S.hopFrom] + (stones[S.hopTo] - stones[S.hopFrom]) * p;
    hy = wy - 1 - Math.sin(p * Math.PI) * (S.hopHit ? 20 : 7);
    if (!S.hopHit && p > 0.5) hy = wy + 5;
  } else {
    hx = stones[clamp(S.beat, 0, 3)];
    hy = wy - 1 + Math.sin(S.t * 4) * 0.6;
  }
  drawWader(g, D, Math.round(hx), Math.round(hy), 0, S.t, S);

  // the timing bar
  const bx = 40, bw = 240, by = 152;
  g.fillStyle = rgba(NIGHT, 0.85);
  g.fillRect(bx - 4, by - 8, bw + 8, 22);
  g.fillStyle = EDGE;
  g.fillRect(bx - 4, by - 8, bw + 8, 1);
  g.fillRect(bx - 4, by + 13, bw + 8, 1);
  g.fillStyle = mix(NIGHT, EDGE, 0.6);
  g.fillRect(bx, by, bw, 8);
  if (S.beat < 3 && S.hopAnim === 0) {
    // green window
    const w = S.winHalf * 2;
    g.fillStyle = rgba(SAGE, 0.35);
    g.fillRect(Math.round(S.winCenter - S.winHalf), by, w, 8);
    g.fillStyle = SAGE;
    g.fillRect(Math.round(S.winCenter - S.winHalf), by, 1, 8);
    g.fillRect(Math.round(S.winCenter + S.winHalf) - 1, by, 1, 8);
    g.fillRect(Math.round(S.winCenter - S.winHalf), by, w, 1);
    g.fillRect(Math.round(S.winCenter - S.winHalf), by + 7, w, 1);
    // marker
    const mx = Math.round(S.marker);
    g.fillStyle = S.missFlash > 0 ? RUST : GOLD;
    g.fillRect(mx - 1, by - 4, 3, 16);
    g.fillStyle = INK;
    g.fillRect(mx, by - 4, 1, 16);
  }
  // beat pips
  for (let i = 0; i < 3; i++) {
    const px = bx + bw - 26 + i * 9;
    const done = i < S.beat;
    const hit = done && i < S.hops;
    g.fillStyle = done ? (hit ? SAGE : RUST) : mix(NIGHT, INK, 0.3);
    g.fillRect(px, by - 15, 6, 6);
    g.fillStyle = rgba(NIGHT, 0.6);
    g.fillRect(px + 1, by - 14, 4, 1);
  }
  txt(g, D, S.beat < 3 ? 'SPACE ON THE GREEN' : '', bx, by - 16, { color: INK_DIM });
}

// --- raft / shuttle / wait ---------------------------------------------
function renderBeat(g, S, D, L) {
  const p = S.progress;
  if (L.sky) g.drawImage(L.sky, 0, 0);
  const wy = 96;
  if (S.method === 'wait') {
    // night falls, then lifts; the river drops with the cold
    const night = Math.sin(p * Math.PI);
    g.globalAlpha = clamp(night * 0.82, 0, 0.82);
    g.fillStyle = '#0b0a18';
    g.fillRect(0, 0, BASE_W, BASE_H);
    g.globalAlpha = 1;
    if (night > 0.15) {
      for (let i = 0; i < 40; i++) {
        const sx = (i * 71) % BASE_W, sy = (i * 37) % 60;
        g.globalAlpha = clamp((night - 0.15) * (0.4 + ((i * 13) % 10) / 14), 0, 1);
        g.fillStyle = i % 7 === 0 ? SKY_ICE : INK;
        g.fillRect(sx, sy, 1, 1);
      }
      g.globalAlpha = clamp((night - 0.15) * 1.2, 0, 1);
      const mx = 40 + p * 240, my = 40 - Math.sin(p * Math.PI) * 22;
      g.fillStyle = INK;
      for (let yy = -4; yy <= 4; yy++) {
        const w = Math.floor(Math.sqrt(16 - yy * yy));
        g.fillRect(Math.round(mx) - w, Math.round(my) + yy, w * 2, 1);
      }
      g.fillStyle = rgba(NIGHT, 0.75);
      for (let yy = -4; yy <= 3; yy++) {
        const w = Math.floor(Math.sqrt(16 - yy * yy));
        g.fillRect(Math.round(mx) - w + 3, Math.round(my) + yy - 1, w * 2, 1);
      }
      g.globalAlpha = 1;
    }
  }
  // the river
  const drop = S.method === 'wait' ? Math.round(p * 6) : 0;
  g.fillStyle = WATER[1];
  g.fillRect(0, wy + drop, BASE_W, BASE_H - wy);
  g.fillStyle = WATER[0];
  g.fillRect(0, wy + 14 + drop, BASE_W, BASE_H);
  ditherRect(g, 0, wy + 10 + drop, BASE_W, 6, WATER[0], 0.5);
  g.fillStyle = WATER[2];
  g.fillRect(0, wy + drop, BASE_W, 2);
  for (let i = 0; i < 26; i++) {
    const x = ((i * 53) + S.t * (26 + (i % 3) * 12)) % (BASE_W + 20) - 10;
    const y = wy + drop + 3 + ((i * 31) % 20);
    g.fillStyle = i % 4 === 0 ? rgba(WATER[3], 0.55) : rgba(WATER[2], 0.5);
    g.fillRect(x | 0, y | 0, 3 + (i % 3), 1);
  }
  g.fillStyle = S.pal[5];
  g.fillRect(0, wy - 8, BASE_W, 8 - 0);
  g.fillRect(0, BASE_H - 22, BASE_W, 22);
  ditherRect(g, 0, BASE_H - 26, BASE_W, 4, S.pal[5], 0.5);

  if (S.method === 'raft') {
    const rx = 24 + p * 250;
    const ry = wy + 8 + Math.sin(S.t * 5) * 1.5;
    if (!spr(g, D, `raft_${Math.floor(S.t * 5) % 2}`, rx, ry + 6, {}, 10)) {
      g.fillStyle = '#3b2f26';
      g.fillRect(Math.round(rx) - 12, Math.round(ry), 24, 4);
      g.fillStyle = mix('#3b2f26', INK, 0.2);
      g.fillRect(Math.round(rx) - 12, Math.round(ry), 24, 1);
    }
    for (let i = 0; i < Math.min(3, S.crew); i++) {
      drawWader(g, D, Math.round(rx) - 7 + i * 7, Math.round(ry), i, S.t, S);
    }
    // paddle
    g.fillStyle = INK_DIM;
    const pa = Math.sin(S.t * 7) * 4;
    g.fillRect(Math.round(rx) + 8, Math.round(ry) - 10 + pa, 1, 12);
    g.fillStyle = rgba(WATER[3], 0.5);
    g.fillRect(Math.round(rx) - 14, Math.round(ry) + 4, 28, 1);
  } else if (S.method === 'shuttle') {
    const tx = -60 + p * 440;
    // dust behind
    for (let i = 0; i < 14; i++) {
      const dx = tx - 30 - i * 4 - (S.t * 20 % 8);
      g.globalAlpha = clamp(0.35 - i * 0.02, 0, 1);
      g.fillStyle = mix(S.pal[5], INK, 0.4);
      g.fillRect(dx | 0, BASE_H - 24 - ((i * 7) % 5), 3, 2);
    }
    g.globalAlpha = 1;
    const ty = BASE_H - 24;
    g.fillStyle = '#2a2233';
    g.fillRect(Math.round(tx) - 22, ty - 10, 44, 8);
    g.fillRect(Math.round(tx) - 8, ty - 17, 18, 8);
    g.fillStyle = SKY_ICE;
    g.fillRect(Math.round(tx) - 5, ty - 15, 6, 4);
    g.fillStyle = GOLD_DIM;
    g.fillRect(Math.round(tx) - 24, ty - 8, 2, 3);
    g.fillStyle = NIGHT;
    const wheel = Math.floor(S.t * 12) % 2;
    for (const wx of [-14, 12]) {
      g.fillRect(Math.round(tx) + wx - 4, ty - 3, 8, 5);
      g.fillStyle = mix(NIGHT, INK, 0.35);
      g.fillRect(Math.round(tx) + wx - 1 + wheel, ty - 1, 2, 2);
      g.fillStyle = NIGHT;
    }
    // crew waving from the bed
    for (let i = 0; i < Math.min(3, S.crew); i++) {
      drawWader(g, D, Math.round(tx) + 4 + i * 7, ty - 10, i, S.t, S);
    }
  } else {
    // wait: the crew camped on the bank
    for (let i = 0; i < Math.min(4, S.crew); i++) {
      drawWader(g, D, 118 + i * 12, BASE_H - 22, i, S.t * 0.3, S);
    }
    const fx = 100, fy = BASE_H - 22;
    const fl = Math.floor(S.t * 8) % 3;
    g.fillStyle = RUST;
    g.fillRect(fx - 1, fy - 5 - fl, 3, 5 + fl);
    g.fillStyle = GOLD;
    g.fillRect(fx, fy - 4 - fl, 1, 3);
    g.fillStyle = '#3b2f26';
    g.fillRect(fx - 4, fy - 1, 9, 2);
  }
}

// ---------------------------------------------------------------------------
// Shared drawing
// ---------------------------------------------------------------------------
function spr(g, D, name, x, y, opts, minW) {
  const a = D.atlas;
  if (!a || typeof a.draw !== 'function') return false;
  try {
    let w = 0, h = 0;
    if (typeof a.frame === 'function') {
      const f = a.frame(name);
      if (!f) return false;
      w = f.w | 0; h = f.h | 0;
      if (minW && w <= 8 && h <= 8 && minW > 8) return false;
    }
    a.draw(g, name, Math.round(x - (w ? w / 2 : 0)), Math.round(y - h), opts || {});
    return true;
  } catch { D.atlas = null; return false; }
}

function txt(g, D, str, x, y, o) {
  const T = D.text;
  if (T && typeof T.drawText === 'function') {
    try { T.drawText(g, String(str), x | 0, y | 0, o || {}); return; }
    catch { D.text = null; }
  }
  fbText(g, str, x, y, o);
}

function drawParticles(g, S) {
  for (const p of S.parts) {
    g.globalAlpha = clamp(p.life / p.max, 0, 1);
    g.fillStyle = p.col;
    g.fillRect(p.x | 0, p.y | 0, 1, 1);
  }
  g.globalAlpha = 1;
}

function vignette(g) {
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.05 + i * 0.012;
    g.fillStyle = NIGHT;
    g.fillRect(0, 0, BASE_W, 1 + i);
    g.fillRect(0, BASE_H - 1 - i, BASE_W, 1 + i);
    g.fillRect(0, 0, 1 + i, BASE_H);
    g.fillRect(BASE_W - 1 - i, 0, 1 + i, BASE_H);
  }
  g.globalAlpha = 1;
}

function drawHud(g, S, D) {
  g.fillStyle = rgba(PANEL, 0.88);
  g.fillRect(0, 0, BASE_W, 14);
  g.fillStyle = EDGE;
  g.fillRect(0, 14, BASE_W, 1);

  const name = String(S.ford.name || 'RIVER CROSSING').slice(0, 22);
  txt(g, D, name, 4, 5, { color: GOLD, scale: 1 });

  if (S.method === 'ford' || S.method === 'rock-hop') {
    // depth + flow readout
    txt(g, D, `${S.depthFt.toFixed(1)} FT ${S.flow.label}`, 150, 5,
      { color: S.flow.risk >= 1.2 ? RUST : S.flow.risk >= 0.5 ? GOLD : SAGE, scale: 1 });
  }

  if (S.method === 'ford') {
    // crossing progress
    const bx = 224, bw = 56;
    g.fillStyle = rgba(NIGHT, 0.8);
    g.fillRect(bx - 1, 3, bw + 2, 8);
    g.fillStyle = mix(NIGHT, EDGE, 0.55);
    g.fillRect(bx, 4, bw, 6);
    g.fillStyle = SKY_ICE;
    g.fillRect(bx, 4, Math.round(bw * S.progress), 6);
    txt(g, D, 'ACROSS', bx - 30, 5, { color: INK_DIM });
    // footing
    const fx = 224, fw = 56;
    g.fillStyle = rgba(NIGHT, 0.8);
    g.fillRect(fx - 1, BASE_H - 12, fw + 2, 8);
    g.fillStyle = mix(NIGHT, EDGE, 0.55);
    g.fillRect(fx, BASE_H - 11, fw, 6);
    const fcol = S.footing > 0.6 ? SAGE : S.footing > 0.3 ? GOLD : RUST;
    g.fillStyle = fcol;
    g.fillRect(fx, BASE_H - 11, Math.round(fw * S.footing), 6);
    if (S.footing < 0.3 && Math.floor(S.t * 6) % 2 === 0) {
      g.fillStyle = rgba(RUST, 0.4);
      g.fillRect(fx - 1, BASE_H - 12, fw + 2, 8);
    }
    txt(g, D, 'FOOTING', fx - 34, BASE_H - 10, { color: INK_DIM });
    // left/right prompt
    if (!S.done) {
      const a = 0.45 + 0.3 * Math.sin(S.t * 4);
      g.globalAlpha = S.keys.left ? 1 : a;
      arrow(g, 10, BASE_H - 8, -1, S.keys.left ? GOLD : INK_DIM);
      g.globalAlpha = S.keys.right ? 1 : a;
      arrow(g, BASE_W - 10 - 60, BASE_H - 8, 1, S.keys.right ? GOLD : INK_DIM);
      g.globalAlpha = 1;
    }
  } else if (S.method !== 'rock-hop') {
    const label = { raft: 'PACK-RAFTING ACROSS', shuttle: 'HITCHING AROUND', wait: 'WAITING OUT THE NIGHT' }[S.method] || '';
    txt(g, D, label, BASE_W - 4, 5, { color: INK_DIM, align: 'right' });
  }
}

function arrow(g, x, y, dir, col) {
  g.fillStyle = col;
  for (let i = 0; i < 4; i++) {
    g.fillRect(x + (dir > 0 ? i : 3 - i), y - 3 + i, 1, 7 - i * 2);
  }
}

function drawBanners(g, S, D) {
  let by = 40;
  for (const b of S.banners) {
    const a = clamp(b.life / 0.4, 0, 1);
    const scale = b.text.length > 12 ? 1 : 2;
    const w = fbMeasure(b.text, scale) + 12;
    g.globalAlpha = a;
    g.fillStyle = rgba(NIGHT, 0.78);
    g.fillRect(((BASE_W - w) / 2) | 0, by - 4, w, scale === 2 ? 17 : 12);
    g.fillStyle = b.col;
    g.fillRect(((BASE_W - w) / 2) | 0, by - 4, w, 1);
    g.fillRect(((BASE_W - w) / 2) | 0, by + (scale === 2 ? 12 : 7), w, 1);
    txt(g, D, b.text, BASE_W / 2, by, { color: b.col, align: 'center', scale });
    g.globalAlpha = 1;
    by += scale === 2 ? 20 : 15;
  }
}

function drawHint(g, S, D) {
  const a = clamp(S.hint, 0, 1);
  const lines = {
    ford: ['HOLD LEFT / RIGHT TO HOLD YOUR LINE', 'STAY IN THE PALE SHALLOW WATER'],
    'rock-hop': ['PRESS SPACE INSIDE THE GREEN WINDOW', 'THREE HOPS, EACH ONE TIGHTER'],
    raft: ['THE CREW FERRIES ACROSS', ''],
    shuttle: ['A RIDE AROUND THE CROSSING', ''],
    wait: ['THE WATER DROPS OVERNIGHT', ''],
  }[S.method] || ['', ''];
  const w = 208, x = ((BASE_W - w) / 2) | 0, y = BASE_H - 34;
  g.globalAlpha = a;
  g.fillStyle = rgba(NIGHT, 0.8);
  g.fillRect(x, y, w, lines[1] ? 19 : 12);
  g.fillStyle = EDGE;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + (lines[1] ? 18 : 11), w, 1);
  txt(g, D, lines[0], BASE_W / 2, y + 3, { color: INK, align: 'center' });
  if (lines[1]) txt(g, D, lines[1], BASE_W / 2, y + 11, { color: INK_DIM, align: 'center' });
  g.globalAlpha = 1;
  txt(g, D, 'ESC SKIP', BASE_W - 4, BASE_H - 10, { color: rgba(INK_DIM, 0.9), align: 'right' });
}

export default { runFord };
