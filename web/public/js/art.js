// Procedural pixel-art scene renderer — Superbrothers: Sword & Sworcery EP styling.
// Everything is drawn from primitives onto a small internal buffer (BASE_W x BASE_H)
// then scaled up with nearest-neighbour, so the whole game is playable with zero
// external assets. Real spritesheets (see todo.html) can later replace drawHiker().
//
// Style rules: tiny limited palette per biome, flat silhouettes for parallax depth,
// a glowing gradient sky, dithered horizon haze, and a tiny humanoid in silhouette.

export const BASE_W = 256;
export const BASE_H = 144;

// Biome palettes: [skyTop, skyBottom, sun, farRidge, midRidge, nearRidge, ground, accent]
const PALETTES = {
  desert:   ['#3b2b54','#c96f5a','#ffd9a0','#7a4a63','#9a5560','#b5615c','#caa06a','#f0c987'],
  forest:   ['#16323a','#3f7e6e','#cdeccf','#1f3b3e','#2c5750','#3a7163','#264a3a','#8fd9a8'],
  mountain: ['#2a2f55','#6f86b8','#fff1d0','#39406b','#4a5685','#6b7aa3','#566089','#cdd9f0'],
  alpine:   ['#20284f','#8fb4d6','#fff7ea','#3a4a70','#5b76a0','#92aecb','#cdd9ec','#ffffff'],
};

// A simple value-noise ridge generator (deterministic per layer + scroll offset).
function ridgeHeight(x, scroll, amp, base, freq, seed) {
  const t = (x + scroll) * freq;
  const n = Math.sin(t + seed) * 0.5 + Math.sin(t * 0.37 + seed * 1.7) * 0.3 + Math.sin(t * 0.11 + seed * 3.1) * 0.2;
  return base - n * amp;
}

export function makeScene(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function resize() {
    const ratio = BASE_W / BASE_H;
    let w = canvas.clientWidth, h = canvas.clientHeight;
    if (w / h > ratio) w = h * ratio; else h = w / ratio;
    canvas.width = BASE_W; canvas.height = BASE_H;
  }
  resize();
  window.addEventListener('resize', resize);

  // Pre-baked star field for night/alpine.
  const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * BASE_W, y: Math.random() * BASE_H * 0.5, b: Math.random() }));

  function render(state) {
    const { biome = 'desert', scroll = 0, walking = true, time = 0, dayPhase = 0.5, hiker, tramilyCount = 0 } = state;
    const pal = PALETTES[biome] || PALETTES.desert;

    // --- Sky gradient (vertical), tinted by day phase (0=dawn .. 0.5=noon .. 1=dusk) ---
    const dusk = Math.abs(dayPhase - 0.5) * 2; // 0 at noon, 1 at dawn/dusk
    const grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
    grad.addColorStop(0, mix(pal[0], '#0a0a1a', dusk * 0.5));
    grad.addColorStop(0.6, pal[1]);
    grad.addColorStop(1, mix(pal[1], pal[6], 0.4));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    // Stars at dusk/alpine.
    if (dusk > 0.4 || biome === 'alpine') {
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.x);
        ctx.fillStyle = `rgba(255,255,240,${(dusk - 0.3) * s.b * tw})`;
        ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
      }
    }

    // --- Sun / moon glow ---
    const sunX = BASE_W * (0.2 + dayPhase * 0.6);
    const sunY = 30 + dusk * 50;
    radial(ctx, sunX, sunY, 26, pal[2], dusk);

    // --- Parallax ridge silhouettes (far -> near) ---
    drawRidge(ctx, scroll * 0.15, 14, BASE_H * 0.55, 0.06, pal[3], 1.0);
    drawRidge(ctx, scroll * 0.3,  20, BASE_H * 0.66, 0.05, pal[4], 12.0);
    drawRidge(ctx, scroll * 0.55, 26, BASE_H * 0.78, 0.045, pal[5], 30.0);

    // Horizon haze dither band.
    ditherBand(ctx, BASE_H * 0.62, 10, pal[1]);

    // --- Foreground ground ---
    const groundY = BASE_H * 0.84;
    ctx.fillStyle = pal[6];
    ctx.fillRect(0, groundY, BASE_W, BASE_H - groundY);
    // ground texture speckle (scrolls with the trail)
    ctx.fillStyle = mix(pal[6], '#000', 0.18);
    for (let i = 0; i < 50; i++) {
      const gx = ((i * 53 - scroll * 1.0) % BASE_W + BASE_W) % BASE_W;
      const gy = groundY + 3 + ((i * 7) % Math.max(1, (BASE_H - groundY - 4)));
      ctx.fillRect(gx | 0, gy | 0, 1, 1);
    }
    // the trail tread
    ctx.fillStyle = mix(pal[6], '#fff', 0.12);
    ctx.fillRect(0, groundY + 4, BASE_W, 2);

    // --- Foreground biome props (scroll fastest) ---
    drawProps(ctx, biome, scroll, groundY, pal);

    // --- The hiker (and tramily trailing behind) ---
    const hx = 96, hy = groundY;
    for (let i = tramilyCount; i >= 1; i--) {
      drawHiker(ctx, hx - 16 - i * 13, hy, time + i * 0.7, walking, pal, 0.55);
    }
    drawHiker(ctx, hx, hy, time, walking, pal, 1.0, hiker);

    return canvas;
  }

  function drawRidge(ctx, scroll, amp, base, freq, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, BASE_H);
    for (let x = 0; x <= BASE_W; x++) {
      ctx.lineTo(x, ridgeHeight(x, scroll, amp, base, freq, seed));
    }
    ctx.lineTo(BASE_W, BASE_H);
    ctx.closePath();
    ctx.fill();
  }

  return { ctx, render, resize };
}

function drawProps(ctx, biome, scroll, groundY, pal) {
  const spacing = 64;
  for (let i = -1; i < BASE_W / spacing + 2; i++) {
    const seed = Math.floor((scroll * 1.0) / spacing) + i;
    const x = (i * spacing - (scroll * 1.0) % spacing);
    const r = pseudo(seed);
    if (r < 0.12) continue; // gaps
    ctx.fillStyle = mix(pal[5], '#000', 0.25);
    if (biome === 'desert') {
      // saguaro cactus
      const h = 14 + (r * 10 | 0);
      ctx.fillRect(x | 0, groundY - h, 3, h);
      ctx.fillRect((x - 3) | 0, groundY - h + 4, 3, 2);
      ctx.fillRect((x - 3) | 0, groundY - h + 4, 2, 6);
      ctx.fillRect((x + 3) | 0, groundY - h + 7, 3, 2);
      ctx.fillRect((x + 4) | 0, groundY - h + 3, 2, 6);
    } else if (biome === 'forest' || biome === 'mountain') {
      // conifer
      const h = 20 + (r * 16 | 0);
      ctx.fillRect((x + 1) | 0, groundY - 4, 2, 4);
      for (let t = 0; t < 5; t++) {
        const tw = 10 - t * 2;
        ctx.fillRect((x + 2 - tw / 2) | 0, (groundY - 6 - t * (h / 6)) | 0, tw | 0, (h / 5) | 0);
      }
    } else {
      // alpine: rocks / snow patches
      ctx.fillStyle = mix(pal[7], pal[5], 0.5);
      ctx.fillRect(x | 0, groundY - 3, 8, 3);
      ctx.fillRect((x + 2) | 0, groundY - 5, 4, 2);
    }
  }
}

// A small humanoid in silhouette with a backpack, in a 2-frame walk cycle.
// `hiker` may carry { skin, shirt, pack } colors for a touch of customization.
function drawHiker(ctx, x, baseY, time, walking, pal, scale = 1, hiker) {
  const f = walking ? (Math.sin(time * 8) > 0 ? 1 : 0) : 0;
  const bob = walking ? (Math.abs(Math.sin(time * 8)) * 2) | 0 : 0;
  const px = (n) => ctx.fillRect((x + n[0] * scale) | 0, (baseY - (n[1] + bob) * scale) | 0, Math.max(1, scale), Math.max(1, scale));

  const skin = hiker?.skin || '#e8b98c';
  const shirt = hiker?.shirt || pal[7];
  const pack = hiker?.pack || mix(pal[5], '#000', 0.3);
  const dark = '#1c1726';

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect((x - 3 * scale) | 0, (baseY + 1) | 0, 8 * scale, 1);

  // legs (walk cycle)
  ctx.fillStyle = dark;
  if (f === 0) { px([-1, 0]); px([-1, 1]); px([0, 2]); px([2, 0]); px([2, 1]); px([1, 2]); }
  else { px([0, 0]); px([0, 1]); px([0, 2]); px([1, 0]); px([1, 1]); px([1, 2]); }

  // torso / shirt
  ctx.fillStyle = shirt;
  for (let yy = 3; yy <= 6; yy++) { px([0, yy]); px([1, yy]); }
  // backpack
  ctx.fillStyle = pack;
  for (let yy = 3; yy <= 7; yy++) { px([-1, yy]); }
  px([-1, 8]);
  // arm + trekking pole
  ctx.fillStyle = skin; px([2, 5]); px([2, 4]);
  ctx.fillStyle = mix(pal[2], '#888', 0.4);
  px([3, 4]); px([3, 3]); px([3, 2]); px([3, 1]);
  // head
  ctx.fillStyle = skin; px([0, 7]); px([1, 7]); px([0, 8]); px([1, 8]);
  // hat brim
  ctx.fillStyle = dark; px([-1, 9]); px([0, 9]); px([1, 9]); px([2, 9]);
}

// --- low level pixel helpers ---
function radial(ctx, cx, cy, r, color, alpha) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.85 - alpha * 0.3;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
function ditherBand(ctx, y, h, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < BASE_W; i++) {
    for (let j = 0; j < h; j++) {
      if (((i + j) % 2) === 0 && Math.random() > 0.5 - (j / h) * 0.5) ctx.fillRect(i, (y + j) | 0, 1, 1);
    }
  }
}
function pseudo(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function mix(a, b, t) {
  const ca = hex(a), cb = hex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hex(c) {
  if (c.startsWith('rgb')) { const m = c.match(/\d+/g).map(Number); return [m[0], m[1], m[2]]; }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
