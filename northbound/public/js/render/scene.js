// NORTHBOUND — the travel scene.
//
// Everything you look at while walking north. Back to front:
//
//   dithered sky bands -> sun/moon + halo -> stars -> cloud layers ->
//   far/mid/near ridgelines (value noise, seeded by mile) -> valley haze ->
//   distant water -> midground prop scatter -> ground band + trail tread ->
//   landmark silhouette -> the crew (leader + party, on foot) ->
//   foreground props + bank -> weather -> night grade + campfire ->
//   vignette -> grain/scanlines
//
// House rules, all of them load-bearing:
//   * gradients are DITHERED, never smooth — a 4x4 Bayer tile is the only ramp
//     tool in the buffer (see `ditherPattern`)
//   * every sprite lands on an integer pixel
//   * ridge shape is a pure function of world position, so mile 812 always looks
//     like mile 812
//   * biome changes crossfade over a mile window; nothing snaps
//   * no allocation in the frame: heights, colour strings, dither patterns and
//     the sky bitmap are all cached and reused
//
//   const scene = createScene(canvas);
//   scene.render(state, dt);
//
// state: { biome, mile, scroll, walking, dayPhase, weather, party,
//          kitCondition, landmark, elevation, night, camped, wind }

import { BASE_W, BASE_H, draw, drawFrame, frame, hasFrame, tintedFrame, recolorFrame, animFrameName } from './atlas.js';
import { createFx } from './fx.js';
import { drawText } from './text.js';

const W = BASE_W, H = BASE_H;

// --- vertical layout ------------------------------------------------------
const HORIZON = 112;     // where the sky ramp bottoms out
const FEET_Y = 150;      // the caravan's ground line
const BANK_Y = 172;      // top of the foreground bank

const PX_PER_MILE = 14;  // world pixels advanced per trail mile

const PARALLAX = [0.10, 0.23, 0.44, 0.80];   // far, mid, near, ground
const RIDGE_BASE = [96, 108, 121, 133];

// ---------------------------------------------------------------------------
// palettes: [skyTop, skyBottom, sun, ridgeFar, ridgeMid, ridgeNear, ground, accent]
// ---------------------------------------------------------------------------

const PALETTES = {
  desert: ['#42305c', '#d1795a', '#ffd9a0', '#6d4a6b', '#8d5561', '#a5624e', '#b0855a', '#f2c98a'],
  chaparral: ['#3a3663', '#d99e6c', '#ffe3ad', '#544d72', '#716c62', '#877f58', '#93884f', '#e0cf8a'],
  sierra: ['#26325f', '#84a9cf', '#fff1d0', '#41497a', '#586492', '#727aa0', '#7f8298', '#cdd9f0'],
  alpine: ['#1e2c58', '#a3c5e2', '#fff7ea', '#3d4d78', '#6480ab', '#9ab5d2', '#c8d8e8', '#ffffff'],
  forest: ['#1f3553', '#74a096', '#e6f3d8', '#2c4756', '#325e54', '#376a51', '#2e4c39', '#8fd0a4'],
  volcanic: ['#2f2645', '#a8735f', '#ffd0a0', '#4d3c56', '#614653', '#54434b', '#463a41', '#d1785c'],
  rainforest: ['#27394d', '#93b2a1', '#e8f4e0', '#314d55', '#365b52', '#2f5847', '#264430', '#a8d8b0'],
};

// ridge character: silhouette amplitude, frequency, and how jagged (ridged noise)
const TERRAIN = {
  desert: { amp: [14, 12, 8], freq: [0.0090, 0.0150, 0.0230], jag: 0.15 },
  chaparral: { amp: [12, 13, 9], freq: [0.0105, 0.0170, 0.0250], jag: 0.22 },
  sierra: { amp: [25, 18, 11], freq: [0.0072, 0.0125, 0.0210], jag: 0.72 },
  alpine: { amp: [29, 21, 12], freq: [0.0064, 0.0115, 0.0195], jag: 0.90 },
  forest: { amp: [13, 13, 10], freq: [0.0086, 0.0145, 0.0245], jag: 0.26 },
  volcanic: { amp: [21, 15, 9], freq: [0.0058, 0.0118, 0.0225], jag: 0.48 },
  rainforest: { amp: [11, 12, 11], freq: [0.0098, 0.0165, 0.0270], jag: 0.14 },
};

const MID_PROPS = {
  desert: ['prop_saguaro', 'prop_yucca', 'prop_boulder_0', 'prop_boulder_1', 'prop_saguaro'],
  chaparral: ['prop_juniper', 'prop_yucca', 'prop_boulder_0', 'prop_stump', 'prop_juniper'],
  sierra: ['prop_pine_0', 'prop_pine_1', 'prop_pine_2', 'prop_boulder_1', 'prop_snowpatch'],
  alpine: ['prop_boulder_0', 'prop_boulder_1', 'prop_snowpatch', 'prop_pine_2', 'prop_cairn'],
  forest: ['prop_pine_0', 'prop_pine_1', 'prop_pine_2', 'prop_pine_0', 'prop_stump'],
  volcanic: ['prop_boulder_0', 'prop_boulder_1', 'prop_stump', 'prop_pine_2', 'prop_snowpatch'],
  rainforest: ['prop_pine_1', 'prop_pine_0', 'prop_pine_2', 'prop_fern', 'prop_stump'],
};

const NEAR_PROPS = {
  desert: ['prop_yucca', 'prop_boulder_0', 'prop_wildflower', 'prop_saguaro', 'prop_cairn'],
  chaparral: ['prop_yucca', 'prop_wildflower', 'prop_boulder_0', 'prop_juniper', 'prop_lupine'],
  sierra: ['prop_boulder_1', 'prop_lupine', 'prop_pine_2', 'prop_snowpatch', 'prop_cairn'],
  alpine: ['prop_boulder_0', 'prop_snowpatch', 'prop_lupine', 'prop_cairn', 'prop_boulder_1'],
  forest: ['prop_fern', 'prop_stump', 'prop_wildflower', 'prop_pine_2', 'prop_fern'],
  volcanic: ['prop_boulder_0', 'prop_stump', 'prop_cairn', 'prop_boulder_1', 'prop_snowpatch'],
  rainforest: ['prop_fern', 'prop_fern', 'prop_stump', 'prop_wildflower', 'prop_lupine'],
};

const LM_FRAME = {
  terminus: 'lm_monument', town: 'lm_town', pass: 'lm_pass', ford: 'lm_ford',
  lake: 'lm_lake', falls: 'lm_falls', lodge: 'lm_lodge', firetower: 'lm_firetower',
};
const LM_ALT = ['lm_lake', 'lm_falls', 'lm_firetower', 'lm_lodge'];

// weather: [overlay colour, strength, hazeBoost, windBias]
const WEATHER_GRADE = {
  clear: null,
  hot: ['#f2c98a', 0.09, 0.35, 0.05],
  rain: ['#4a5b78', 0.20, 0.55, -0.45],
  storm: ['#232a45', 0.34, 0.75, -0.75],
  hail: ['#8fa9c8', 0.20, 0.55, -0.55],
  snow: ['#bfd6ea', 0.18, 0.85, -0.30],
  smoke: ['#a5673f', 0.30, 1.10, 0.20],
  fog: ['#b8c2cc', 0.30, 1.30, 0.05],
  wind: ['#c7b48a', 0.08, 0.30, -0.85],
};

// ---------------------------------------------------------------------------
// sky keyframes — absolute colours by time of day, later tinted toward the biome
// ---------------------------------------------------------------------------

const SKY_KEYS = [
  { p: 0.00, zen: '#0a0916', mid: '#12112a', hor: '#1b1834', night: 1.00, light: '#3a3560' },
  { p: 0.09, zen: '#141634', mid: '#2b2853', hor: '#4d3760', night: 0.82, light: '#5b4a78' },
  { p: 0.16, zen: '#293160', mid: '#6b5183', hor: '#d0805f', night: 0.38, light: '#f0a06a' },
  { p: 0.24, zen: '#3c5c8c', mid: '#8aa2bf', hor: '#f0c79c', night: 0.10, light: '#ffe0b0' },
  { p: 0.40, zen: '#4a7cb2', mid: '#93bad8', hor: '#d7e5ec', night: 0.00, light: '#fff6e2' },
  { p: 0.55, zen: '#4d80b6', mid: '#96bcd9', hor: '#d9e6ec', night: 0.00, light: '#fff6e2' },
  { p: 0.70, zen: '#4a71a6', mid: '#9aacc6', hor: '#eed3a6', night: 0.02, light: '#ffe6ae' },
  { p: 0.80, zen: '#3e4f88', mid: '#9c6d8a', hor: '#f2a566', night: 0.14, light: '#ffb673' },
  { p: 0.88, zen: '#2a2d5e', mid: '#5b4074', hor: '#c26a57', night: 0.48, light: '#e08a63' },
  { p: 0.95, zen: '#161538', mid: '#26214c', hor: '#452c54', night: 0.84, light: '#4c3f6e' },
  { p: 1.00, zen: '#0a0916', mid: '#12112a', hor: '#1b1834', night: 1.00, light: '#3a3560' },
];

// ---------------------------------------------------------------------------
// colour utilities (cached — mixing runs every frame)
// ---------------------------------------------------------------------------

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  let s = hex[0] === '#' ? hex.slice(1) : hex;
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16) || 0;
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}

const HEXD = '0123456789abcdef';
const strCache = new Map();
function css(r, g, b) {
  const k = (r << 16 | g << 8 | b);
  let s = strCache.get(k);
  if (s === undefined) {
    s = '#' + HEXD[r >> 4] + HEXD[r & 15] + HEXD[g >> 4] + HEXD[g & 15] + HEXD[b >> 4] + HEXD[b & 15];
    if (strCache.size > 6000) strCache.clear();
    strCache.set(k, s);
  }
  return s;
}

/** mix(a,b,t) with t quantised to 1/64 so results land in the string cache. */
function mix(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  t = ((t * 64) | 0) / 64;
  const A = rgb(a), B = rgb(b);
  return css(
    (A[0] + (B[0] - A[0]) * t + 0.5) | 0,
    (A[1] + (B[1] - A[1]) * t + 0.5) | 0,
    (A[2] + (B[2] - A[2]) * t + 0.5) | 0);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(t) { return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------------------
// deterministic value noise (world-space, so mile N is always mile N)
// ---------------------------------------------------------------------------

// The classic integer hash. It depends on 32-bit multiply *overflow*, which plain `*`
// does not give you in JS: n*n*15731 runs past 2^53 and silently loses its low bits,
// which is exactly the part being hashed. The result is a constant, and constant noise
// means perfectly flat ridgelines. Math.imul is the 32-bit multiply this needs.
function hashi(n) {
  n = ((n << 13) ^ n) | 0;
  const t = (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) | 0;
  return (t & 0x7fffffff) / 1073741823 - 1;
}
function hashu(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3); n |= 0;
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hashi((i + seed * 7919) | 0);
  const b = hashi((i + 1 + seed * 7919) | 0);
  return a + (b - a) * smooth(f);
}
function fbm(x, seed) {
  return (vnoise(x, seed) * 0.57 + vnoise(x * 2.03, seed + 31) * 0.28 + vnoise(x * 4.11, seed + 67) * 0.15);
}

// ---------------------------------------------------------------------------
// Bayer dither patterns (the only gradient tool inside the buffer)
// ---------------------------------------------------------------------------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function createScene(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  canvas.width = W; canvas.height = H;

  const fx = createFx();

  // ---- caches ------------------------------------------------------------
  const patCache = new Map();                 // "lvl|color" -> CanvasPattern
  function ditherPattern(level, color) {
    const key = level + color;
    let p = patCache.get(key);
    if (p) return p;
    const cv = mkCanvas(4, 4);
    const c = cv.getContext('2d');
    c.fillStyle = color;
    for (let i = 0; i < 16; i++) if (BAYER[i] < level) c.fillRect(i & 3, i >> 2, 1, 1);
    p = ctx.createPattern(cv, 'repeat');
    if (patCache.size > 900) patCache.clear();
    patCache.set(key, p);
    return p;
  }

  function mkCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch { /* noop */ } }
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  // sky bitmap, regenerated only when the key changes
  const skyImg = ctx.createImageData(W, H);
  const sky32 = new Uint32Array(skyImg.data.buffer);
  let skyKey = '';

  // ridge height buffers (reused every frame)
  const hs = [new Int16Array(W + 1), new Int16Array(W + 1), new Int16Array(W + 1), new Int16Array(W + 1)];
  const runX = new Int16Array(W + 2);
  const runY = new Int16Array(W + 2);

  // stars
  const STAR_N = 130;
  const starX = new Int16Array(STAR_N), starY = new Int16Array(STAR_N);
  const starB = new Float32Array(STAR_N), starP = new Float32Array(STAR_N);
  for (let i = 0; i < STAR_N; i++) {
    starX[i] = (hashu(i * 3 + 1) * W) | 0;
    starY[i] = (hashu(i * 3 + 2) * (HORIZON - 14)) | 0;
    starB[i] = 0.25 + hashu(i * 3 + 3) * 0.75;
    starP[i] = hashu(i * 5 + 11) * 6.283;
  }

  // clouds
  const CLOUD_N = 16;
  const cloud = [];
  for (let i = 0; i < CLOUD_N; i++) {
    const layer = i % 3;
    cloud.push({
      f: 'cloud_' + (i % 4),
      x: hashu(i * 7 + 5) * (W + 80) - 40,
      y: 8 + layer * 13 + hashu(i * 7 + 6) * 12,
      layer,
      spd: 1.6 + layer * 2.1 + hashu(i * 7 + 7) * 1.4,
      a: 0.20 + layer * 0.11 + hashu(i * 7 + 8) * 0.10,
    });
  }

  // birds: a flock that wanders through every so often
  const BIRD_N = 6;
  const birds = [];
  for (let i = 0; i < BIRD_N; i++) birds.push({ x: 0, y: 0, ph: hashu(i * 13 + 3) * 6.283, off: hashu(i * 13 + 4) });
  let birdT = -6, birdActive = false, birdY = 40, birdDir = 1;

  // vignette + grain, built once
  const vignette = buildVignette(mkCanvas);
  const grain = buildGrain(mkCanvas);

  // ---- persistent scene state -------------------------------------------
  let time = 0;
  let curBiome = null, prevBiome = null, blend = 1, blendMile = 0;
  const palA = new Array(8);   // the blended working palette, reused every frame
  let lastMile = 0;
  let world = 0;
  let dustAcc = 0, lightningT = 3.5, boltT = 0, boltSeed = 1;
  let lmFade = 0;

  const st = {                      // resolved per-frame state, reused
    pal: PALETTES.desert, terrain: TERRAIN.desert, midProps: MID_PROPS.desert,
    nearProps: NEAR_PROPS.desert, night: 0, light: '#fff', hor: '#888',
    haze: '#888', wind: 0, sev: 0, weather: 'clear', snowY: -99,
  };

  // Scratch objects reused every frame so the hot path allocates nothing.
  // These MUST be declared before the return below: function declarations hoist, but
  // `const` in dead code after a return never initializes, and resolveState() reads them.
  const TMP_A = [0, 0, 0], TMP_F = [0, 0, 0];
  const TMP_TERRAIN = { amp: TMP_A, freq: TMP_F, jag: 0 };


  function resize() {
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d', { alpha: false });
    c.imageSmoothingEnabled = false;
    skyKey = '';
  }

  function flash(color, strength) { fx.flash(color || '#ffffff', strength === undefined ? 0.5 : strength); }
  function shake(power) { fx.shake(power === undefined ? 3 : power); }

  // -------------------------------------------------------------------------
  function render(state, dt) {
    state = state || EMPTY;
    dt = dt > 0 ? (dt > 0.1 ? 0.1 : dt) : 0.016;
    time += dt;

    resolveState(state, dt);

    const sx = fx.shakeX, sy = fx.shakeY;

    // ---- sky (drawn unshaken: the horizon does not wobble) ----------------
    paintSky(state);
    ctx.putImageData(skyImg, 0, 0);

    ctx.save();
    if (sx || sy) ctx.translate(sx, sy);

    drawCelestial(state);
    drawStars();
    drawClouds(dt);
    drawBirds(dt);

    // ---- ridgelines -------------------------------------------------------
    computeRidges();
    drawRidgeLayer(0);
    drawValleyWater();
    drawRidgeLayer(1);
    drawRidgeLayer(2);

    // ---- the landmark rides the horizon ----------------------------------
    drawLandmark(state, dt);

    // ---- ground -----------------------------------------------------------
    drawGround();
    drawProps(0);   // midground, behind the crew
    drawPackString();   // a packer's string, occasionally, coming the other way
    drawTread();

    fx.setGround(FEET_Y + 2);
    fx.draw(ctx, 0);

    // ---- the caravan ------------------------------------------------------
    drawCaravan(state, dt);

    // ---- foreground -------------------------------------------------------
    drawProps(1);
    drawBank();

    // ---- weather + night --------------------------------------------------
    fx.setWind(st.wind);
    runWeather(state, dt);
    fx.update(dt);
    fx.draw(ctx, 1);
    drawWeatherGrade();
    drawLightning(dt);
    drawNightGrade();
    drawCamp(state, dt);

    ctx.restore();

    // ---- final pass -------------------------------------------------------
    fx.drawFlash(ctx);
    ctx.drawImage(vignette, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(grain, -((time * 47) % 3 | 0), -((time * 31) % 3 | 0));
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // state resolution: biome crossfade, weather, wind, night
  // -------------------------------------------------------------------------
  function resolveState(state, dt) {
    const biome = PALETTES[state.biome] ? state.biome : 'desert';
    const mile = state.mile || 0;

    if (curBiome === null) { curBiome = prevBiome = biome; blend = 1; }
    if (biome !== curBiome) { prevBiome = curBiome; curBiome = biome; blend = 0; blendMile = mile; }
    if (blend < 1) {
      // crossfade over a 10-mile window, or 2.5s if the party is standing still
      const byMile = Math.abs(mile - blendMile) / 10;
      blend = Math.min(1, Math.max(blend + dt * 0.4, byMile));
    }

    const A = PALETTES[prevBiome], B = PALETTES[curBiome];
    for (let i = 0; i < 8; i++) palA[i] = blend >= 1 ? B[i] : mix(A[i], B[i], blend);
    st.pal = palA;

    const tA = TERRAIN[prevBiome], tB = TERRAIN[curBiome];
    TMP_TERRAIN.jag = lerp(tA.jag, tB.jag, blend);
    st.terrain = TMP_TERRAIN;
    for (let i = 0; i < 3; i++) {
      TMP_A[i] = lerp(tA.amp[i], tB.amp[i], blend);
      TMP_F[i] = lerp(tA.freq[i], tB.freq[i], blend);
    }
    st.midProps = MID_PROPS[blend > 0.5 ? curBiome : prevBiome];
    st.nearProps = NEAR_PROPS[blend > 0.5 ? curBiome : prevBiome];

    // world position: stable per mile, with the caller's sub-mile scroll on top
    world = mile * PX_PER_MILE + (state.scroll || 0);
    lastMile = mile;

    // sky sample
    const dp = ((state.dayPhase === undefined ? 0.5 : state.dayPhase) % 1 + 1) % 1;
    const k = sampleSky(dp);
    st.night = state.night === true ? Math.max(0.55, k.night) : k.night;
    st.light = k.light;
    st.hor = mix(k.hor, st.pal[1], 0.42);
    st.zen = mix(k.zen, st.pal[0], 0.34);
    st.mid = mix(k.mid, st.pal[0], 0.22);
    st.dayPhase = dp;

    // weather
    const w = state.weather;
    st.weather = (typeof w === 'string' ? w : (w && w.kind)) || 'clear';
    st.sev = (w && typeof w === 'object' && w.severity !== undefined) ? clamp(w.severity, 0, 1) : 0.6;
    const grade = WEATHER_GRADE[st.weather];
    st.grade = grade;
    st.wind = state.wind !== undefined ? state.wind
      : (grade ? grade[3] * (0.5 + st.sev * 0.5) : Math.sin(time * 0.21) * 0.12);
    st.haze = mix(st.hor, '#ffffff', 0.10 * (1 - st.night));
    // Enough haze to sell distance, not so much that the ranges dissolve into the sky.
    st.hazeAmt = 0.36 + (grade ? grade[2] * st.sev : 0);

    // snow line on the peaks
    const elev = state.elevation || 3000;
    const snowy = curBiome === 'alpine' || curBiome === 'sierra' || curBiome === 'volcanic' || elev > 7200;
    // Snow belongs on the peaks. Sitting it near the ridge *base* caps almost the whole
    // silhouette white, which reads as one flat band instead of a range.
    st.snowY = snowy ? lerp(52, RIDGE_BASE[0] - 9, clamp((elev - 4200) / 7000, 0, 1)) : -99;
    if (st.weather === 'snow') st.snowY = Math.max(st.snowY, RIDGE_BASE[1] - 4);
  }

  function sampleSky(p) {
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].p <= p) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    const t = clamp((p - a.p) / (b.p - a.p || 1), 0, 1);
    SKY_TMP.zen = mix(a.zen, b.zen, t);
    SKY_TMP.mid = mix(a.mid, b.mid, t);
    SKY_TMP.hor = mix(a.hor, b.hor, t);
    SKY_TMP.light = mix(a.light, b.light, t);
    SKY_TMP.night = lerp(a.night, b.night, t);
    return SKY_TMP;
  }
  const SKY_TMP = { zen: '', mid: '', hor: '', light: '', night: 0 };

  // -------------------------------------------------------------------------
  // sky: 9 dithered bands from zenith to horizon
  // -------------------------------------------------------------------------
  const SKY_STEPS = 9;
  const skyRamp = new Uint32Array(SKY_STEPS);

  function paintSky(state) {
    const key = st.zen + st.mid + st.hor + ((st.night * 20) | 0);
    if (key === skyKey) return;
    skyKey = key;

    for (let i = 0; i < SKY_STEPS; i++) {
      const t = i / (SKY_STEPS - 1);
      const c = t < 0.5 ? mix(st.zen, st.mid, t * 2) : mix(st.mid, st.hor, (t - 0.5) * 2);
      skyRamp[i] = abgr(c);
    }
    const below = abgr(mix(st.hor, st.pal[3], 0.55));

    for (let y = 0; y < H; y++) {
      const row = y * W;
      if (y >= HORIZON) {
        for (let x = 0; x < W; x++) sky32[row + x] = below;
        continue;
      }
      const t = Math.pow(y / HORIZON, 0.88) * (SKY_STEPS - 1);
      const i0 = t | 0;
      const f = t - i0;
      const c0 = skyRamp[i0];
      const c1 = skyRamp[i0 + 1 < SKY_STEPS ? i0 + 1 : i0];
      const brow = (y & 3) << 2;
      for (let x = 0; x < W; x++) {
        sky32[row + x] = (BAYER[brow + (x & 3)] / 16) < f ? c1 : c0;
      }
    }
  }

  function abgr(hex) { const c = rgb(hex); return (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; }

  // -------------------------------------------------------------------------
  function drawStars() {
    const n = st.night;
    if (n < 0.08) return;
    const a = (n - 0.08) / 0.92;
    ctx.fillStyle = '#f4ecdd';
    for (let i = 0; i < STAR_N; i++) {
      const tw = 0.55 + 0.45 * Math.sin(time * 1.7 + starP[i]);
      const al = a * starB[i] * tw;
      if (al < 0.09) continue;
      ctx.globalAlpha = al > 1 ? 1 : al;
      ctx.fillRect(starX[i], starY[i], 1, 1);
      if (starB[i] > 0.975 && al > 0.8) {
        ctx.globalAlpha = al * 0.22;
        ctx.fillRect(starX[i] - 1, starY[i], 1, 1);
        ctx.fillRect(starX[i] + 1, starY[i], 1, 1);
        ctx.fillRect(starX[i], starY[i] - 1, 1, 1);
        ctx.fillRect(starX[i], starY[i] + 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  function drawCelestial(state) {
    const dp = st.dayPhase;
    // sun arc
    const sunT = (dp - 0.11) / 0.78;
    if (sunT > -0.06 && sunT < 1.06) {
      const x = (-24 + sunT * 368) | 0;
      const y = (HORIZON - 4 - Math.sin(clamp(sunT, 0, 1) * Math.PI) * 82) | 0;
      const low = 1 - Math.sin(clamp(sunT, 0, 1) * Math.PI);
      const col = mix(st.pal[2], '#ff9a5c', low * 0.75);
      const dim = st.weather === 'smoke' ? 0.5 : st.weather === 'storm' || st.weather === 'fog' ? 0.35 : 1;
      halo(x, y, 30, col, 0.9 * dim);
      if (hasFrame('sun')) drawFrame(ctx, tintedFrame('sun', col), x - frame('sun').w / 2, y - frame('sun').h / 2, DISC_OPTS(dim));
      else { ctx.fillStyle = col; ctx.globalAlpha = dim; disc(x, y, 5); ctx.globalAlpha = 1; }
    }
    // moon on the opposite arc
    const mp = (dp + 0.5) % 1;
    const moonT = (mp - 0.11) / 0.78;
    if (moonT > -0.06 && moonT < 1.06 && st.night > 0.12) {
      const x = (-24 + moonT * 368) | 0;
      const y = (HORIZON - 10 - Math.sin(clamp(moonT, 0, 1) * Math.PI) * 76) | 0;
      const a = clamp((st.night - 0.12) / 0.5, 0, 1);
      halo(x, y, 18, '#cdd9f0', a * 0.55);
      if (hasFrame('moon')) drawFrame(ctx, tintedFrame('moon', '#e8eefc'), x - frame('moon').w / 2, y - frame('moon').h / 2, DISC_OPTS(a));
      else { ctx.fillStyle = '#e8eefc'; ctx.globalAlpha = a; disc(x, y, 4); ctx.globalAlpha = 1; }
    }
  }

  const DISC_TMP = { alpha: 1 };
  function DISC_OPTS(a) { DISC_TMP.alpha = a; return DISC_TMP; }

  /** A dithered halo — three nested discs at descending Bayer levels. */
  function halo(cx, cy, r, color, strength) {
    if (strength <= 0.02) return;
    const levels = [11, 7, 4, 2];
    for (let i = 0; i < levels.length; i++) {
      const rr = (r * (0.34 + i * 0.24)) | 0;
      ctx.fillStyle = ditherPattern(levels[i], color);
      ctx.globalAlpha = strength * (0.85 - i * 0.13);
      disc(cx, cy, rr);
    }
    ctx.globalAlpha = 1;
  }

  function disc(cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      const hw = Math.sqrt(r * r - y * y) | 0;
      if (hw <= 0) continue;
      ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
    }
  }

  // -------------------------------------------------------------------------
  function drawClouds(dt) {
    const cover = st.weather === 'storm' ? 1 : st.weather === 'rain' || st.weather === 'snow' || st.weather === 'hail' ? 0.85
      : st.weather === 'fog' || st.weather === 'smoke' ? 0.55 : 0.42;
    const base = mix(st.mid, st.hor, 0.45);
    const lit = mix(base, st.light, 0.35 * (1 - st.night));
    const col = quantise(mix(lit, '#0e0b17', st.night * 0.45));
    const stormCol = quantise(mix(col, '#2a2b40', 0.5));

    for (let i = 0; i < CLOUD_N; i++) {
      const c = cloud[i];
      c.x -= (c.spd * (0.35 + Math.abs(st.wind) * 1.6) + st.wind * -6) * dt;
      const f = hasFrame(c.f) ? c.f : null;
      const wF = f ? frame(f).w : 24;
      if (c.x < -wF - 8) c.x += W + wF + 16;
      if (c.x > W + wF + 8) c.x -= W + wF + 16;
      if (i / CLOUD_N > cover) continue;
      if (!f) continue;
      const a = c.a * (0.55 + cover * 0.7);
      TINT_OPTS.alpha = clamp(a, 0, 0.85);
      drawFrame(ctx, tintedFrame(f, st.weather === 'storm' ? stormCol : col), c.x, c.y, TINT_OPTS);
    }
    TINT_OPTS.alpha = 1;
  }
  const TINT_OPTS = { alpha: 1 };

  function quantise(hex) {
    const c = rgb(hex);
    return css((c[0] >> 4) << 4 | 8, (c[1] >> 4) << 4 | 8, (c[2] >> 4) << 4 | 8);
  }

  // -------------------------------------------------------------------------
  function drawBirds(dt) {
    birdT -= dt;
    if (birdT <= 0) {
      birdActive = !birdActive;
      birdT = birdActive ? 9 + hashu((time * 13) | 0) * 6 : 16 + hashu((time * 7) | 0) * 22;
      if (birdActive) {
        birdDir = hashu((time * 101) | 0) > 0.5 ? 1 : -1;
        birdY = 26 + hashu((time * 57) | 0) * 34;
        for (let i = 0; i < BIRD_N; i++) birds[i].x = (birdDir > 0 ? -30 : W + 30) - birdDir * i * (7 + birds[i].off * 5);
      }
    }
    if (!birdActive || st.night > 0.6) return;
    const col = mix(st.pal[3], '#0e0b17', 0.45);
    ctx.fillStyle = col;
    for (let i = 0; i < BIRD_N; i++) {
      const b = birds[i];
      b.x += birdDir * 17 * dt;
      const y = (birdY + Math.sin(time * 0.7 + b.ph) * 3 + i * 1.6) | 0;
      const x = b.x | 0;
      if (x < -4 || x > W + 4) continue;
      const flap = Math.sin(time * 7 + b.ph) > 0;
      ctx.globalAlpha = 0.55;
      if (flap) { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
      else { ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x, y, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // ridgelines
  // -------------------------------------------------------------------------
  function computeRidges() {
    const t = st.terrain;
    for (let L = 0; L < 4; L++) {
      const buf = hs[L];
      const off = world * PARALLAX[L];
      const base = RIDGE_BASE[L];
      const amp = L < 3 ? t.amp[L] : 4.5;
      const freq = L < 3 ? t.freq[L] : 0.055;
      const jag = L < 3 ? t.jag : 0;
      const seed = L * 137 + 3;
      for (let x = 0; x <= W; x++) {
        const wx = (x + off) * freq;
        let n = fbm(wx, seed);
        if (jag > 0) {
          const r = 1 - Math.abs(n) * 2;      // ridged noise gives sharp peaks
          n = lerp(n, r * 0.9, jag);
        }
        buf[x] = (base - n * amp) | 0;
      }
    }
  }

  function runs(buf) {
    let n = 0, x0 = 0, cur = buf[0];
    for (let x = 1; x <= W; x++) {
      if (buf[x] !== cur || x === W) {
        runX[n] = x0; runY[n] = cur; n++;
        if (x === W && buf[x] === cur) break;
        x0 = x; cur = buf[x];
      }
    }
    runX[n] = W;
    return n;
  }

  function drawRidgeLayer(L) {
    const buf = hs[L];
    const depth = L / 2;                                    // 0 far .. 1 near
    let col = st.pal[3 + L];
    col = mix(col, st.haze, (1 - depth) * 0.30 * st.hazeAmt);
    col = mix(col, '#100d1c', st.night * (0.30 + depth * 0.22));
    // rim of dawn/dusk light on the sunward side of the far ridges
    const bottom = L < 3 ? RIDGE_BASE[L + 1] + 14 : H;

    const n = runs(buf);
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) ctx.fillRect(runX[i], runY[i], runX[i + 1] - runX[i], bottom - runY[i]);

    // snow caps
    if (st.snowY > 0 && L < 3) {
      const snowCol = mix('#e8f2ff', st.hor, 0.28 + st.night * 0.35);
      ctx.fillStyle = snowCol;
      for (let i = 0; i < n; i++) {
        const y = runY[i];
        if (y >= st.snowY) continue;
        const d = clamp((st.snowY - y) / 16, 0, 1);
        const capH = 1 + (d * 4 | 0);
        ctx.globalAlpha = 0.55 + d * 0.45;
        ctx.fillRect(runX[i], y, runX[i + 1] - runX[i], capH);
      }
      ctx.globalAlpha = 1;
    }

    // rim light: 1px warm line along the top when the sun is low
    const low = 1 - Math.abs(st.dayPhase - 0.5) * 2;
    const rim = clamp(1 - low, 0, 1) * (1 - st.night) * (L < 2 ? 0.7 : 0.35);
    if (rim > 0.12 && st.weather !== 'fog') {
      ctx.fillStyle = mix(st.light, col, 0.35);
      ctx.globalAlpha = rim * 0.55;
      for (let i = 0; i < n; i++) ctx.fillRect(runX[i], runY[i], runX[i + 1] - runX[i], 1);
      ctx.globalAlpha = 1;
    }

    // dithered haze fading the feet of the range into the valley
    if (L < 3) {
      const hz = st.haze;
      const bandTop = RIDGE_BASE[L] - (L === 0 ? 2 : 4);
      const bandH = (L === 0 ? 20 : 16);
      const levels = L === 0 ? HAZE_FAR : HAZE_NEAR;
      const strength = clamp((1 - depth) * 0.9 * st.hazeAmt, 0, 1);
      if (strength > 0.05) {
        for (let b = 0; b < levels.length; b++) {
          const y0 = (bandTop + (bandH * b / levels.length)) | 0;
          const y1 = (bandTop + (bandH * (b + 1) / levels.length)) | 0;
          if (y1 <= y0) continue;
          ctx.fillStyle = ditherPattern(Math.max(1, (levels[b] * strength) | 0), hz);
          for (let i = 0; i < n; i++) {
            const top = runY[i] > y0 ? runY[i] : y0;
            if (top >= y1) continue;
            ctx.fillRect(runX[i], top, runX[i + 1] - runX[i], y1 - top);
          }
        }
      }
    }
  }
  const HAZE_FAR = [4, 7, 10, 13, 16];
  const HAZE_NEAR = [2, 4, 7, 10];

  /** A lake or river sitting in the valley behind the near ridge. */
  function drawValleyWater() {
    const b = blend > 0.5 ? curBiome : prevBiome;
    if (b !== 'sierra' && b !== 'alpine' && b !== 'forest' && b !== 'rainforest') return;
    const seg = Math.floor(world * PARALLAX[1] / 260);
    if (hashu(seg * 31 + 7) > 0.45) return;
    const localX = (seg * 260 - world * PARALLAX[1]) | 0;
    const w = 70 + (hashu(seg * 31 + 8) * 90) | 0;
    const x0 = localX + 40, x1 = x0 + w;
    if (x1 < -4 || x0 > W + 4) return;
    const y = RIDGE_BASE[1] + 3;
    const water = mix(mix(st.hor, '#5f86a8', 0.55), '#0e0b17', st.night * 0.55);
    ctx.fillStyle = water;
    ctx.fillRect(Math.max(0, x0), y, Math.min(W, x1) - Math.max(0, x0), 5);
    ctx.fillStyle = mix(water, '#ffffff', 0.35 * (1 - st.night));
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) {
      const rx = x0 + 6 + ((hashu(seg * 61 + i) * (w - 12)) | 0);
      const ry = y + 1 + ((i + ((time * 2) | 0)) % 4);
      if (rx < 0 || rx > W - 3) continue;
      ctx.fillRect(rx, ry, 2 + (i & 1), 1);
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // ground
  // -------------------------------------------------------------------------
  function drawGround() {
    const buf = hs[3];
    let g = mix(st.pal[6], st.haze, 0.10 * st.hazeAmt);
    g = mix(g, '#0e0b17', st.night * 0.42);
    const n = runs(buf);
    ctx.fillStyle = g;
    for (let i = 0; i < n; i++) ctx.fillRect(runX[i], runY[i], runX[i + 1] - runX[i], H - runY[i]);

    // sunlit lip along the ground edge
    ctx.fillStyle = mix(g, st.light, 0.20 * (1 - st.night * 0.7));
    for (let i = 0; i < n; i++) ctx.fillRect(runX[i], runY[i], runX[i + 1] - runX[i], 1);

    // dithered darkening toward the bottom of the frame
    const dark = mix(g, '#0e0b17', 0.55);
    const bands = [3, 6, 10];
    for (let b = 0; b < bands.length; b++) {
      const y0 = (BANK_Y - 22 + b * 8) | 0;
      ctx.fillStyle = ditherPattern(bands[b], dark);
      ctx.fillRect(0, y0, W, 8);
    }

    // speckle: grit that scrolls with the trail
    ctx.fillStyle = mix(g, '#0e0b17', 0.35);
    const off = world * PARALLAX[3];
    for (let i = 0; i < 70; i++) {
      const wx = i * 37.7;
      const x = (((wx - off) % (W + 40)) + W + 40) % (W + 40) - 20;
      if (x < 0 || x >= W) continue;
      const y = (RIDGE_BASE[3] + 3 + (hashu(i * 9 + 1) * (H - RIDGE_BASE[3] - 6))) | 0;
      ctx.fillRect(x | 0, y, 1, 1);
    }
  }

  function drawTread() {
    const buf = hs[3];
    const g = mix(st.pal[6], '#0e0b17', st.night * 0.42);
    const tread = mix(g, st.light, 0.24 * (1 - st.night * 0.55));
    const edge = mix(g, '#0e0b17', 0.30);
    const n = runs(buf);
    for (let i = 0; i < n; i++) {
      const x = runX[i], w = runX[i + 1] - runX[i];
      const y = FEET_Y - 1;
      ctx.fillStyle = edge; ctx.fillRect(x, y + 3, w, 1);
      ctx.fillStyle = tread; ctx.fillRect(x, y, w, 3);
    }
    // scuffs along the tread
    ctx.fillStyle = mix(tread, '#0e0b17', 0.45);
    const off = world * PARALLAX[3] * 1.3;
    for (let i = 0; i < 26; i++) {
      const x = ((((i * 23.3 - off) % (W + 30)) + W + 30) % (W + 30)) - 15;
      if (x < 0 || x >= W - 2) continue;
      ctx.fillRect(x | 0, FEET_Y + (i & 1), 2, 1);
    }
  }

  function drawBank() {
    const off = world * 1.35;
    const col = mix(mix(st.pal[6], '#0e0b17', 0.62), st.pal[7], 0.05);
    ctx.fillStyle = mix(col, '#0e0b17', st.night * 0.5);
    let prev = -1, x0 = 0;
    for (let x = 0; x <= W; x++) {
      const y = (BANK_Y - fbm((x + off) * 0.03, 91) * 5) | 0;
      if (y !== prev || x === W) {
        if (prev >= 0) ctx.fillRect(x0, prev, x - x0, H - prev);
        x0 = x; prev = y;
      }
    }
  }

  // -------------------------------------------------------------------------
  // props
  // -------------------------------------------------------------------------
  const PROP_OPTS = { alpha: 1, tint: null, flip: false };

  function drawProps(layer) {
    const table = layer === 0 ? st.midProps : st.nearProps;
    if (!table) return;
    const par = layer === 0 ? 0.62 : 1.35;
    const spacing = layer === 0 ? 21 : 47;
    const off = world * par;
    const baseline = layer === 0 ? RIDGE_BASE[3] + 6 : BANK_Y + 2;
    const seedBase = layer === 0 ? 401 : 907;

    const k0 = Math.floor((off - 40) / spacing);
    const k1 = Math.ceil((off + W + 40) / spacing);
    for (let k = k0; k <= k1; k++) {
      const h = hashu(k * 2654435761 + seedBase);
      if (h < (layer === 0 ? 0.24 : 0.62)) continue;
      const x = (k * spacing - off + hashu(k * 31 + seedBase) * 12) | 0;
      if (x < -34 || x > W + 34) continue;
      const name = table[(hashu(k * 17 + seedBase + 5) * table.length) | 0];
      if (!hasFrame(name)) continue;
      const f = frame(name);
      const y = (baseline - f.h + hashu(k * 13 + seedBase + 9) * 3) | 0;

      if (layer === 0) {
        // midground: hazed toward the ridge behind it
        const tint = mix(mix(st.pal[5], st.haze, 0.30 * st.hazeAmt), '#0e0b17', 0.22 + st.night * 0.35);
        PROP_OPTS.tint = tint; PROP_OPTS.alpha = 0.95;
        PROP_OPTS.flip = (h > 0.6);
        draw(ctx, name, x, y, PROP_OPTS);
      } else {
        const tint = mix(mix(st.pal[6], '#0e0b17', 0.72), st.pal[7], 0.06);
        PROP_OPTS.tint = mix(tint, '#0e0b17', st.night * 0.35);
        PROP_OPTS.alpha = 1;
        PROP_OPTS.flip = (h > 0.8);
        draw(ctx, name, x, y, PROP_OPTS);
      }
    }
    PROP_OPTS.tint = null; PROP_OPTS.flip = false; PROP_OPTS.alpha = 1;
  }

  // -------------------------------------------------------------------------
  // landmark
  // -------------------------------------------------------------------------
  function drawLandmark(state, dt) {
    const lm = state.landmark;
    if (!lm) { lmFade = Math.max(0, lmFade - dt * 1.5); if (lmFade <= 0) return; }
    else lmFade = Math.min(1, lmFade + dt * 1.5);

    const away = lm ? (lm.milesAway !== undefined ? lm.milesAway
      : (lm.mile !== undefined ? lm.mile - (state.mile || 0) : 0)) : 0;
    if (away > 6) return;

    const kind = lm ? (lm.kind || 'landmark') : 'landmark';
    let name = LM_FRAME[kind];
    if (!name) {
      const id = (lm && (lm.id || lm.name)) || 'x';
      let s = 0; for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) | 0;
      name = LM_ALT[Math.abs(s) % LM_ALT.length];
    }
    if (!hasFrame(name)) return;
    const f = frame(name);

    // scroll in from the right; 6 miles out is off-screen, 0 is centred-right
    const t = clamp(away / 6, 0, 1);
    const x = (168 + t * 210) | 0;
    if (x > W + f.w) return;

    const near = 1 - t;
    const y = (RIDGE_BASE[3] + 4 - f.h) | 0;
    const tint = mix(mix(st.pal[4], st.haze, 0.34 * st.hazeAmt), '#0e0b17', 0.16 + st.night * 0.4);

    // a soft ground shadow so it sits in the world
    ctx.fillStyle = ditherPattern(6, mix(st.pal[6], '#0e0b17', 0.5));
    ctx.fillRect(x - 2, RIDGE_BASE[3] + 3, f.w + 4, 3);

    PROP_OPTS.tint = tint; PROP_OPTS.alpha = clamp(0.35 + near * 0.65, 0, 1) * lmFade; PROP_OPTS.flip = false;
    draw(ctx, name, x, y, PROP_OPTS);
    PROP_OPTS.tint = null; PROP_OPTS.alpha = 1;

    if (lm && lm.name && near > 0.45) {
      drawText(ctx, String(lm.name).toUpperCase(), (x + f.w / 2) | 0, RIDGE_BASE[3] + 9, {
        color: '#f2c98a', align: 'center', shadow: '#0e0b17', alpha: clamp((near - 0.45) / 0.3, 0, 1) * lmFade,
      });
    }
  }

  // -------------------------------------------------------------------------
  // the caravan
  // -------------------------------------------------------------------------
  const CARAVAN_OPTS = { alpha: 1, recolor: null, tint: null, flip: false };
  const RECOLOR = { skin: '#e8b98c', hair: '#2c2028', shirt: '#8fd0a4' };

  /**
   * A packer's mule string coming the other way.
   *
   * Stock is legal on the Pacific Crest Trail and it is how the back-country lodges get
   * their freight, so every so often a string of mules passes the crew going south.
   * Deterministic per mile segment, so the same string is in the same place every time
   * you walk that stretch.
   */
  function drawPackString() {
    const seg = Math.floor(world * PARALLAX[3] / 900);
    if (hashu(seg * 71 + 13) > 0.22) return;                 // rare
    const b = blend > 0.5 ? curBiome : prevBiome;
    if (b !== 'sierra' && b !== 'alpine' && b !== 'forest') return;

    const localX = (seg * 900 - world * PARALLAX[3]) | 0;
    const x0 = localX + 120;
    if (x0 < -90 || x0 > W + 60) return;

    const n = 2 + ((hashu(seg * 71 + 17) * 3) | 0);
    const rimCol = mix(st.light, '#ffffff', 0.2);
    const rimAmt = clamp(1 - Math.abs(st.dayPhase - 0.5) * 2.4, 0, 1) * 0.4;
    // They pass on the far side of the tread, three pixels uphill of the crew's line,
    // so the two groups read as passing each other rather than merging into one blob.
    const farY = FEET_Y - 3;
    // The packer walks at the head of the string, facing the way they are going.
    figure('leader_walk_0', x0 + n * 20 + 14, farY, 0, null, rimCol, rimAmt, true, 0.5, false, true);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 20;
      if (x < -30 || x > W + 30) continue;
      figure(animFrameName('mule_walk', time * 1.1 + i * 0.4), x, farY, 0, null, rimCol, rimAmt, true, 0.42, false, true);
    }
  }

  function drawCaravan(state, dt) {
    const walking = state.walking !== false;
    const party = Array.isArray(state.party) ? state.party : DEFAULT_PARTY;
    const camped = !!state.camped;
    const anim = walking ? world / PX_PER_MILE : time;      // gait tracks distance, not clock
    const gait = walking ? world * 0.10 : time * 3.2;

    // warm light source (campfire at night, sun otherwise)
    const fireX = 92, fireOn = camped || (st.night > 0.5 && !walking);
    const rimCol = fireOn ? '#f2c98a' : mix(st.light, '#ffffff', 0.2);
    const rimAmt = fireOn ? 0.75 : clamp(1 - Math.abs(st.dayPhase - 0.5) * 2.4, 0, 1) * 0.5;
    const rimFromLeft = fireOn ? true : st.dayPhase < 0.5;

    // Worn-out gear kicks up a bit more dust and drags a bit more.
    const kit = state.kitCondition === undefined ? 100 : state.kitCondition;
    if (walking && kit < 55) {
      dustAcc += dt * (60 - kit) * 0.04;
      while (dustAcc >= 1) {
        dustAcc -= 1;
        fx.emit('dust', { x: 96 + hashu((time * 91) | 0) * 28, y: FEET_Y - 1, count: 1,
          vx: -12 - hashu((time * 13) | 0) * 10, vy: -5, alpha: 0.45 });
      }
    }

    // ---- leader -----------------------------------------------------------
    const leadName = walking
      ? (hasFrame('leader_walk_0') ? animFrameName('leader_walk', anim * 2.0) : animFrameName('hiker_walk', anim * 2.0))
      : (hasFrame('hiker_idle_0') ? animFrameName('hiker_idle', time * 0.7) : 'hiker_walk_0');
    const leadRe = portraitOf(party[0]);
    figure(leadName, 168, FEET_Y, walking ? bobOf(gait, 1.2) : bobIdle(time), leadRe, rimCol, rimAmt, rimFromLeft, 0.55);

    // ---- crew -------------------------------------------------------------
    let slot = 0;
    for (let i = 1; i < party.length; i++) {
      const m = party[i];
      if (m && m.alive === false) continue;                  // the dead are simply not there
      const x = 148 - slot * 18;
      slot++;
      if (x < -18) break;
      const ph = 0.31 + slot * 0.44;
      const sick = isSick(m);
      let nm;
      if (camped && hasFrame('hiker_rest_0')) nm = animFrameName('hiker_rest', time * 0.6 + ph);
      else if (sick && hasFrame('hiker_sick_0')) nm = animFrameName('hiker_sick', (walking ? anim * 1.1 : time * 0.8) + ph);
      else if (walking) nm = animFrameName('hiker_walk', anim * 2.0 + ph);
      else nm = hasFrame('hiker_idle_0') ? animFrameName('hiker_idle', time * 0.7 + ph) : 'hiker_walk_0';

      // a sick hiker limps: an extra dip on one side of the cycle
      let bob = walking ? bobOf(gait + ph * 4, 1.2) : bobIdle(time + ph);
      if (sick && walking) bob += Math.sin(gait + ph * 4) > 0.2 ? 1 : 0;
      figure(nm, x, FEET_Y, bob, portraitOf(m), rimCol, rimAmt, rimFromLeft, 0.55, sick);
    }

    // ---- dust in the crew's wake -----------------------------------------
    if (walking) {
      dustAcc += dt * (st.weather === 'rain' || st.weather === 'snow' || st.weather === 'storm' ? 1.2 : 5.5);
      while (dustAcc >= 1) {
        dustAcc -= 1;
        const dx = 60 + hashu((time * 397 + dustAcc * 10) | 0) * 180;
        fx.emit('dust', {
          x: dx, y: FEET_Y + 1, count: 1,
          vx: -10 - hashu((time * 71) | 0) * 16, vy: -4 - hashu((time * 53) | 0) * 8,
          alpha: 0.30 + hashu((time * 29) | 0) * 0.25, size: 1,
          color: mix(st.pal[6], '#f4ecdd', 0.35),
        });
      }
    }
  }

  function bobOf(g, amt) { return (Math.abs(Math.sin(g)) * amt) | 0; }
  function bobIdle(t) { return (Math.sin(t * 1.6) > 0.7) ? 1 : 0; }

  function isSick(m) {
    if (!m) return false;
    if (m.sick) return true;
    if (m.health !== undefined && m.health < 40) return true;
    return Array.isArray(m.ailments) && m.ailments.length > 0;
  }

  function portraitOf(m) {
    const p = m && m.portrait;
    if (!p) return null;
    RECOLOR.skin = p.skin || '#e8b98c';
    RECOLOR.hair = p.hair || '#2c2028';
    RECOLOR.shirt = p.shirt || '#8fd0a4';
    return RECOLOR;
  }

  /** One caravan sprite: shadow, rim light, body — all on integer pixels. */
  function figure(name, x, feetY, bob, recolor, rimCol, rimAmt, rimLeft, shadowW, sick, flip) {
    if (!hasFrame(name)) return;
    const f = frame(name);
    const px = (x - (f.w >> 1)) | 0;
    const py = (feetY - f.h - bob) | 0;

    // contact shadow
    const sw = Math.max(4, (f.w * shadowW) | 0);
    ctx.fillStyle = ditherPattern(bob > 0 ? 6 : 9, '#0e0b17');
    ctx.fillRect((x - (sw >> 1)) | 0, feetY, sw, 1);
    ctx.fillStyle = ditherPattern(4, '#0e0b17');
    ctx.fillRect((x - (sw >> 1)) - 1 | 0, feetY - 1, sw + 2, 1);

    // rim light: a tinted silhouette offset one pixel toward the light
    if (rimAmt > 0.08) {
      CARAVAN_OPTS.tint = rimCol; CARAVAN_OPTS.recolor = null;
      CARAVAN_OPTS.alpha = clamp(rimAmt, 0, 0.9);
      draw(ctx, name, px + (rimLeft ? -1 : 1), py, CARAVAN_OPTS);
      CARAVAN_OPTS.tint = null;
    }

    // body
    CARAVAN_OPTS.recolor = recolor; CARAVAN_OPTS.alpha = 1; CARAVAN_OPTS.tint = null;
    CARAVAN_OPTS.flip = !!flip;
    draw(ctx, name, px, py, CARAVAN_OPTS);

    // night grade on the figure so it sits in the dark
    if (st.night > 0.15) {
      CARAVAN_OPTS.recolor = null;
      CARAVAN_OPTS.tint = '#141026';
      CARAVAN_OPTS.alpha = st.night * 0.42;
      draw(ctx, name, px, py, CARAVAN_OPTS);
      CARAVAN_OPTS.tint = null; CARAVAN_OPTS.alpha = 1;
    }

    CARAVAN_OPTS.flip = false;

    if (sick) {
      // a green-grey pallor pass
      CARAVAN_OPTS.tint = '#6f8a72'; CARAVAN_OPTS.alpha = 0.20; CARAVAN_OPTS.recolor = null;
      draw(ctx, name, px, py, CARAVAN_OPTS);
      CARAVAN_OPTS.tint = null; CARAVAN_OPTS.alpha = 1;
    }
    CARAVAN_OPTS.recolor = null;
  }

  // -------------------------------------------------------------------------
  // weather
  // -------------------------------------------------------------------------
  function runWeather(state, dt) {
    const k = st.weather;
    const sev = st.sev;
    if (k === 'rain' || k === 'storm') fx.weather(k, sev, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (k === 'snow') fx.weather('snow', sev, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (k === 'hail') fx.weather('hail', sev, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (k === 'smoke') fx.weather('smoke', sev, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (k === 'wind') fx.weather('wind', sev, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (k === 'hot') fx.weather('dust', sev * 0.35, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (curBiome === 'forest' || curBiome === 'rainforest') fx.weather('leaf', 0.4, dt, { wind: st.wind, ground: FEET_Y + 2 });
    else if (curBiome === 'desert' || curBiome === 'chaparral') fx.weather('dust', 0.22, dt, { wind: st.wind, ground: FEET_Y + 2 });
  }

  function drawWeatherGrade() {
    const g = st.grade;
    if (!g) return;
    const a = g[1] * (0.45 + st.sev * 0.55);
    ctx.globalAlpha = a;
    ctx.fillStyle = g[0];
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    if (st.weather === 'fog' || st.weather === 'smoke') {
      // drifting dithered banks
      const col = st.weather === 'fog' ? '#c8d2dc' : '#b07a4a';
      for (let b = 0; b < 5; b++) {
        const y = (58 + b * 22 + Math.sin(time * 0.25 + b) * 5) | 0;
        const lvl = 3 + ((b * 2 + (Math.sin(time * 0.4 + b * 2) + 1) * 2) | 0);
        ctx.fillStyle = ditherPattern(lvl, col);
        ctx.globalAlpha = 0.22 + st.sev * 0.2;
        ctx.fillRect(0, y, W, 12 + b * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawLightning(dt) {
    if (st.weather !== 'storm') { boltT = 0; lightningT = 2 + hashu((time * 7) | 0) * 4; return; }
    lightningT -= dt;
    if (lightningT <= 0) {
      lightningT = 2.2 + hashu((time * 331) | 0) * 6.5 * (1.2 - st.sev);
      boltT = 0.16;
      boltSeed = ((time * 1000) | 0) % 9973;
      fx.flash('#dfe6ff', 0.55 + st.sev * 0.35, 7);
      fx.shake(1.5 + st.sev * 2.5);
    }
    if (boltT > 0) {
      boltT -= dt;
      const x0 = 40 + hashu(boltSeed) * 240;
      let x = x0, y = 4;
      ctx.fillStyle = '#eef2ff';
      ctx.globalAlpha = clamp(boltT / 0.16, 0, 1);
      const endY = RIDGE_BASE[0] + 6;
      let i = 0;
      while (y < endY) {
        const step = 3 + hashu(boltSeed + i * 13) * 5;
        const dx = (hashu(boltSeed + i * 29) - 0.5) * 9;
        for (let s = 0; s < step; s++) {
          ctx.fillRect((x + dx * s / step) | 0, (y + s) | 0, i < 3 ? 2 : 1, 1);
        }
        x += dx; y += step; i++;
        if (i > 40) break;
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawNightGrade() {
    if (st.night <= 0.02) return;
    ctx.globalAlpha = st.night * 0.30;
    ctx.fillStyle = '#151029';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = st.night * 0.18;
    ctx.fillStyle = ditherPattern(8, '#0e0b17');
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  function drawCamp(state, dt) {
    if (!state.camped) return;
    const x = 92, y = FEET_Y;
    const flick = 0.82 + Math.sin(time * 11.3) * 0.08 + Math.sin(time * 6.1) * 0.10;

    // ground glow
    ctx.globalAlpha = 0.5 * flick;
    halo(x, y - 3, 34, '#f2c98a', 0.55 * flick);
    ctx.globalAlpha = 1;

    if (hasFrame('prop_tent')) {
      const f = frame('prop_tent');
      PROP_OPTS.tint = mix(st.pal[7], '#0e0b17', 0.35); PROP_OPTS.alpha = 1;
      draw(ctx, 'prop_tent', 44, y - f.h, PROP_OPTS);
      PROP_OPTS.tint = null;
    }
    if (hasFrame('prop_campfire_0')) {
      const nm = animFrameName('prop_campfire', time * 1.2);
      const f = frame(nm);
      draw(ctx, nm, x - (f.w >> 1), y - f.h, null);
    } else {
      ctx.fillStyle = '#f2c98a';
      ctx.fillRect(x - 2, y - 5, 4, 5);
    }

    fx.weather('ember', 0.7, dt, { x, y: y - 5, wind: st.wind, ground: FEET_Y + 2 });
  }

  // -------------------------------------------------------------------------
  function buildVignette(mk) {
    const cv = mk(W, H);
    const c = cv.getContext('2d');
    const img = c.createImageData(W, H);
    const d = img.data;
    const cx = W / 2, cy = H / 2 + 8;
    const maxd = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / maxd, dy = (y - cy) / maxd;
        let t = Math.sqrt(dx * dx + dy * dy) * 1.42;
        // Start the falloff well out toward the corners and keep the maximum gentle —
        // a vignette should sit under the picture, not read as a spotlight on it.
        t = clamp((t - 0.72) / 0.28, 0, 1);
        const a = Math.pow(t, 2.0) * 74;
        const i = (y * W + x) * 4;
        d[i] = 12; d[i + 1] = 9; d[i + 2] = 24; d[i + 3] = a | 0;
      }
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  function buildGrain(mk) {
    const cv = mk(W + 4, H + 4);
    const c = cv.getContext('2d');
    const img = c.createImageData(W + 4, H + 4);
    const d = img.data;
    for (let y = 0; y < H + 4; y++) {
      for (let x = 0; x < W + 4; x++) {
        const i = (y * (W + 4) + x) * 4;
        const n = hashu(x * 7919 + y * 104729);
        let a = 0, r = 244, g = 236, b = 221;
        if (y % 2 === 1) { a = 16; r = 14; g = 11; b = 26; }
        if (n > 0.965) { a = 20; }
        else if (n < 0.03) { a = 18; r = 14; g = 11; b = 26; }
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      }
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  // =========================================================================
  // Every helper above is a hoisted function declaration, so the public handle is
  // returned last - which is also what lets the `const` scratch buffers above
  // actually initialize.
  return { render, resize, flash, shake, fx, get time() { return time; } };
  // =========================================================================
}

const EMPTY = {};
const DEFAULT_PARTY = [
  { alive: true, health: 90, portrait: { skin: '#e8b98c', hair: '#3a2a20', shirt: '#8fd0a4' } },
  { alive: true, health: 85, portrait: { skin: '#c98d5e', hair: '#1f1a20', shirt: '#d1785c' } },
  { alive: true, health: 80, portrait: { skin: '#f0cba0', hair: '#6b4a2a', shirt: '#6b8fd0' } },
  { alive: true, health: 75, portrait: { skin: '#8a5c3a', hair: '#241c1c', shirt: '#c39d63' } },
  { alive: true, health: 70, portrait: { skin: '#e0a878', hair: '#4a3a2a', shirt: '#a48fd0' } },
];
