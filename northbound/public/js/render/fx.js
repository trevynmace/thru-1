// NORTHBOUND — particles, screen shake and flash.
//
// One pooled array of MAX_PARTICLES plain objects, allocated once at creation.
// `update` integrates in place and swap-removes the dead, so a full storm costs
// zero garbage. Every particle carries a depth (0 = far, 1 = right in your face)
// which drives its speed, size, brightness and which of the two draw layers it
// lands in — that is what makes a rainstorm read as volume instead of wallpaper.
//
//   const fx = createFx();
//   fx.weather('rain', 0.8, dt, { wind: -0.4 });   // continuous, self-budgeting
//   fx.emit('dust', { x, y, count: 4 });           // one-shot burst
//   fx.update(dt); fx.draw(ctx, 0); ...world...; fx.draw(ctx, 1);
//   fx.drawFlash(ctx);
//
// Kinds: dust rain snow hail ember leaf splash sparkle smoke blood heart coin sweat.

import { frame, hasFrame } from './atlas.js';

const W = 320, H = 180;
const MAX_PARTICLES = 600;

// shapes
const S_DOT = 0, S_STREAK = 1, S_PUFF = 2, S_SPARK = 3, S_FRAME = 4, S_FLAKE = 5, S_COIN = 6;

// Per-kind defaults. `col` arrays are fixed strings — picking one never allocates.
const KINDS = {
  dust: {
    shape: S_PUFF, grav: -6, drag: 2.6, life: [0.5, 1.1], size: [1, 2], wind: 0.8,
    col: ['#caa06a', '#b08a5d', '#8d7050', '#e0bd8a'], layer: 1,
  },
  rain: {
    shape: S_STREAK, grav: 260, drag: 0.05, life: [0.5, 0.9], size: [3, 6], wind: 1,
    col: ['#8fa9c8', '#6d87a8', '#a9c4de', '#5b7290'], layer: 1,
  },
  snow: {
    shape: S_FLAKE, grav: 9, drag: 0.9, life: [3.0, 6.0], size: [1, 2], wind: 1,
    col: ['#ffffff', '#e8f2ff', '#cddfef', '#bfe3ff'], layer: 1,
  },
  hail: {
    shape: S_DOT, grav: 320, drag: 0.03, life: [1.2, 2.0], size: [1, 2], wind: 0.5,
    col: ['#ffffff', '#dceaf5', '#bfe3ff'], layer: 1,
  },
  ember: {
    shape: S_DOT, grav: -22, drag: 1.1, life: [0.9, 2.2], size: [1, 1], wind: 0.6,
    col: ['#f2c98a', '#d1785c', '#ffe6b0', '#b8503c'], layer: 1,
  },
  leaf: {
    shape: S_DOT, grav: 14, drag: 1.4, life: [2.0, 4.0], size: [1, 2], wind: 1,
    col: ['#8fd0a4', '#c39d63', '#d1785c', '#6f9e6a'], layer: 1,
  },
  splash: {
    shape: S_DOT, grav: 190, drag: 0.4, life: [0.18, 0.4], size: [1, 1], wind: 0.2,
    col: ['#bfe3ff', '#8fa9c8', '#ffffff'], layer: 1,
  },
  sparkle: {
    shape: S_SPARK, grav: -4, drag: 1.8, life: [0.4, 0.9], size: [1, 1], wind: 0.2,
    col: ['#f2c98a', '#ffffff', '#bfe3ff'], layer: 1,
  },
  smoke: {
    shape: S_PUFF, grav: -14, drag: 0.7, life: [1.6, 3.4], size: [2, 4], wind: 1,
    col: ['#4b3f66', '#6b5a94', '#3a3050', '#7a6a92'], layer: 1,
  },
  blood: {
    shape: S_DOT, grav: 200, drag: 0.5, life: [0.4, 0.9], size: [1, 1], wind: 0.1,
    col: ['#8a3a2e', '#6b2b22', '#d1785c'], layer: 1,
  },
  heart: {
    shape: S_FRAME, grav: -16, drag: 1.0, life: [0.9, 1.5], size: [1, 1], wind: 0.2,
    col: ['#d1785c', '#f2c98a'], layer: 1, framePool: ['ui_heart_full'],
  },
  coin: {
    shape: S_COIN, grav: 130, drag: 0.4, life: [0.7, 1.2], size: [1, 1], wind: 0.1,
    col: ['#f2c98a', '#c39d63', '#ffe6b0'], layer: 1,
  },
  sweat: {
    shape: S_DOT, grav: 150, drag: 0.6, life: [0.35, 0.7], size: [1, 1], wind: 0.3,
    col: ['#bfe3ff', '#8fa9c8'], layer: 1,
  },
};

const FLAKE_FRAMES = ['snowflake_0', 'snowflake_1', 'snowflake_2'];

function makeParticle() {
  return {
    kind: 'dust', cfg: KINDS.dust,
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, ttl: 1, size: 1, col: '#fff',
    grav: 0, drag: 0, windAmt: 1,
    swayA: 0, swayF: 0, phase: 0,
    depth: 1, layer: 1, shape: S_DOT,
    frameName: null, spin: 0, rot: 0,
    bounces: 0, settle: 0, fadeIn: 0,
    ground: 1e9, alphaMul: 1,
  };
}

export function createFx() {
  const pool = new Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pool[i] = makeParticle();
  let live = 0;
  let recycle = 0;

  // continuous-emitter accumulators, one slot per weather kind
  const acc = { rain: 0, snow: 0, hail: 0, ember: 0, smoke: 0, dust: 0, leaf: 0, sparkle: 0 };

  let wind = 0;              // -1..1, scene-supplied
  let groundY = 152;
  let shakeAmp = 0, shakeT = 0;
  let flashA = 0, flashCol = '#ffffff', flashDecay = 3.2;
  let rngState = 0x9e3779b9;

  const api = {
    shakeX: 0, shakeY: 0,
    get count() { return live; },
    emit, burst: emit, update, draw, drawFlash, clear, shake, flash,
    weather, setWind, setGround, get wind() { return wind; },
  };
  return api;

  // -- deterministic-ish cheap rng (no Math.random allocation concerns) ------
  function rnd() {
    rngState ^= rngState << 13; rngState |= 0;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5; rngState |= 0;
    return ((rngState >>> 0) % 100000) / 100000;
  }
  function rr(a, b) { return a + (b - a) * rnd(); }

  function setWind(w) { wind = w < -1 ? -1 : w > 1 ? 1 : w; }
  function setGround(y) { groundY = y; }

  function alloc() {
    if (live < MAX_PARTICLES) return pool[live++];
    // budget exhausted: steal the particle nearest the end of its life
    let idx = recycle % live, best = 1e9;
    for (let i = 0; i < 6; i++) {
      const j = (recycle + i * 97) % live;
      const rem = pool[j].life;
      if (rem < best) { best = rem; idx = j; }
    }
    recycle = (recycle + 1) % MAX_PARTICLES;
    return pool[idx];
  }

  // ------------------------------------------------------------------ emit --
  /**
   * emit(kind, opts)
   *   x, y        origin (required for bursts)
   *   count       particles (default 1), clamped to the remaining budget
   *   spread      radians of cone around `dir` (default full circle)
   *   dir         direction in radians
   *   speed       px/s, or [min,max]
   *   vx, vy      explicit velocity (overrides speed/dir)
   *   spawnW/H    box to scatter the origin over
   *   depth       0 far .. 1 near (default 1)
   *   color       override
   *   life, size, gravity, drag, alpha, layer, wind
   */
  function emit(kind, opts) {
    const cfg = KINDS[kind] || KINDS.dust;
    const o = opts || EMPTY;
    let n = o.count === undefined ? 1 : o.count | 0;
    if (n <= 0) return;
    if (n > 64) n = 64;
    for (let i = 0; i < n; i++) spawn(kind, cfg, o);
  }

  function spawn(kind, cfg, o) {
    const p = alloc();
    const depth = o.depth === undefined ? 1 : o.depth;

    p.kind = kind; p.cfg = cfg;
    p.x = (o.x || 0) + (o.spawnW ? rr(-o.spawnW / 2, o.spawnW / 2) : 0);
    p.y = (o.y || 0) + (o.spawnH ? rr(-o.spawnH / 2, o.spawnH / 2) : 0);

    if (o.vx !== undefined || o.vy !== undefined) {
      p.vx = o.vx || 0; p.vy = o.vy || 0;
    } else {
      const sp = o.speed === undefined ? 18 : (Array.isArray(o.speed) ? rr(o.speed[0], o.speed[1]) : o.speed);
      const dir = (o.dir === undefined ? rr(-Math.PI, Math.PI) : o.dir) + (o.spread ? rr(-o.spread / 2, o.spread / 2) : 0);
      p.vx = Math.cos(dir) * sp; p.vy = Math.sin(dir) * sp;
    }

    const lf = o.life !== undefined ? (Array.isArray(o.life) ? rr(o.life[0], o.life[1]) : o.life) : rr(cfg.life[0], cfg.life[1]);
    p.ttl = lf; p.life = lf;
    p.size = Math.max(1, Math.round(o.size !== undefined ? o.size : rr(cfg.size[0], cfg.size[1] + 0.99)));
    p.col = o.color || cfg.col[(rnd() * cfg.col.length) | 0];
    p.grav = o.gravity === undefined ? cfg.grav : o.gravity;
    p.drag = o.drag === undefined ? cfg.drag : o.drag;
    p.windAmt = o.wind === undefined ? cfg.wind : o.wind;
    p.depth = depth;
    p.layer = o.layer === undefined ? (depth < 0.45 ? 0 : 1) : o.layer;
    p.shape = o.shape === undefined ? cfg.shape : o.shape;
    p.swayA = o.sway === undefined ? 0 : o.sway;
    p.swayF = o.swayFreq === undefined ? rr(1.4, 3.2) : o.swayFreq;
    p.phase = rnd() * 6.283;
    p.spin = o.spin === undefined ? rr(-6, 6) : o.spin;
    p.rot = 0;
    p.bounces = 0;
    p.settle = 0;
    p.fadeIn = o.fadeIn || 0;
    p.ground = o.ground === undefined ? 1e9 : o.ground;
    p.alphaMul = o.alpha === undefined ? 1 : o.alpha;
    p.frameName = null;
    if (p.shape === S_FLAKE) {
      const n = FLAKE_FRAMES[(rnd() * FLAKE_FRAMES.length) | 0];
      p.frameName = hasFrame(n) ? n : null;
      if (!p.frameName) p.shape = S_DOT;
    } else if (p.shape === S_FRAME) {
      const pool2 = o.frames || cfg.framePool;
      const n = pool2 && pool2.length ? pool2[(rnd() * pool2.length) | 0] : null;
      p.frameName = n && hasFrame(n) ? n : null;
      if (!p.frameName) p.shape = S_SPARK;
    }
    return p;
  }

  // ---------------------------------------------------------------- weather --
  /**
   * Continuous weather emission. Call once per frame with the frame's dt.
   *   kind: 'rain'|'storm'|'snow'|'hail'|'smoke'|'ember'|'dust'|'leaf'|'fog'
   *   sev:  0..1 severity
   *   opts: { wind, ground, count } — `wind` is -1..1
   */
  function weather(kind, sev, dt, opts) {
    if (!kind || sev <= 0 || dt <= 0) return;
    if (dt > 0.1) dt = 0.1;
    const o = opts || EMPTY;
    if (o.wind !== undefined) setWind(o.wind);
    if (o.ground !== undefined) groundY = o.ground;
    const s = sev < 0 ? 0 : sev > 1 ? 1 : sev;
    const headroom = 1 - live / MAX_PARTICLES;
    if (headroom <= 0.02) return;

    switch (kind) {
      case 'storm':
      case 'rain': {
        const rate = (kind === 'storm' ? 210 : 120) * (0.35 + s * 0.9) * headroom;
        acc.rain += rate * dt;
        while (acc.rain >= 1) { acc.rain -= 1; rainDrop(s, kind === 'storm'); }
        break;
      }
      case 'snow': {
        const rate = 55 * (0.35 + s * 0.9) * headroom;
        acc.snow += rate * dt;
        while (acc.snow >= 1) { acc.snow -= 1; snowFlake(s); }
        break;
      }
      case 'hail': {
        const rate = 70 * (0.35 + s) * headroom;
        acc.hail += rate * dt;
        while (acc.hail >= 1) { acc.hail -= 1; hailStone(s); }
        break;
      }
      case 'smoke': {
        const rate = 16 * (0.4 + s) * headroom;
        acc.smoke += rate * dt;
        while (acc.smoke >= 1) { acc.smoke -= 1; smokeBillow(s); }
        break;
      }
      case 'dust':
      case 'wind': {
        const rate = 20 * (0.3 + s) * headroom;
        acc.dust += rate * dt;
        while (acc.dust >= 1) {
          acc.dust -= 1;
          const d = rr(0.25, 1);
          emit('dust', {
            x: wind < 0 ? W + 6 : -6, y: rr(groundY - 34, groundY + 12),
            vx: (wind < 0 ? -1 : 1) * rr(30, 90) * (0.5 + d), vy: rr(-8, 6),
            depth: d, life: [1.0, 2.2], size: d > 0.7 ? 2 : 1, alpha: 0.55 * d + 0.2,
          });
        }
        break;
      }
      case 'leaf': {
        const rate = 5 * (0.4 + s) * headroom;
        acc.leaf += rate * dt;
        while (acc.leaf >= 1) {
          acc.leaf -= 1;
          const d = rr(0.3, 1);
          emit('leaf', {
            x: rr(-8, W + 8), y: rr(-10, 40), vx: wind * 22 + rr(-6, 6), vy: rr(8, 20) * d,
            depth: d, sway: rr(3, 9), alpha: 0.5 + d * 0.5, spin: rr(-3, 3),
          });
        }
        break;
      }
      case 'ember': {
        const rate = 12 * (0.4 + s) * headroom;
        acc.ember += rate * dt;
        while (acc.ember >= 1) {
          acc.ember -= 1;
          emit('ember', {
            x: o.x === undefined ? rr(0, W) : o.x + rr(-3, 3),
            y: o.y === undefined ? groundY : o.y,
            vx: wind * 14 + rr(-7, 7), vy: rr(-26, -10), sway: rr(2, 6),
            depth: rr(0.6, 1),
          });
        }
        break;
      }
      default: break;
    }
  }

  function rainDrop(s, hard) {
    const d = rr(0.18, 1);
    const speed = (150 + s * 130) * (0.45 + d * 0.75) * (hard ? 1.25 : 1);
    emit('rain', {
      x: rr(-40, W + 40), y: rr(-24, -2),
      vx: wind * (70 + s * 90) * (0.5 + d), vy: speed,
      depth: d,
      size: 2 + Math.round(d * (hard ? 5 : 3.5)),
      alpha: 0.16 + d * (hard ? 0.6 : 0.5),
      ground: groundY + rr(-2, 16),
      life: [0.7, 1.4],
    });
  }

  function snowFlake(s) {
    const d = rr(0.15, 1);
    emit('snow', {
      x: rr(-16, W + 16), y: rr(-20, -2),
      vx: wind * 16 * (0.4 + d), vy: (7 + s * 14) * (0.35 + d * 0.9),
      depth: d, sway: rr(3, 11), swayFreq: rr(0.7, 2.0),
      size: d > 0.72 ? 2 : 1,
      alpha: 0.3 + d * 0.7,
      ground: groundY + rr(-3, 18),
      life: [4, 9],
      shape: d > 0.72 ? S_FLAKE : S_DOT,
    });
  }

  function hailStone(s) {
    const d = rr(0.3, 1);
    emit('hail', {
      x: rr(-20, W + 20), y: rr(-16, -2),
      vx: wind * 45 * (0.4 + d), vy: (170 + s * 110) * (0.5 + d * 0.7),
      depth: d, size: d > 0.7 ? 2 : 1, alpha: 0.45 + d * 0.55,
      ground: groundY + rr(0, 16), life: [1.4, 2.6],
    });
  }

  function smokeBillow(s) {
    const d = rr(0.2, 1);
    emit('smoke', {
      x: rr(-20, W + 20), y: rr(groundY - 60, groundY + 10),
      vx: wind * 20 + rr(-5, 5), vy: rr(-13, -3),
      depth: d, size: 2 + Math.round(d * 3), alpha: 0.1 + s * 0.22,
      life: [3, 6.5], sway: rr(2, 7),
    });
  }

  // ---------------------------------------------------------------- update --
  function update(dt) {
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 0.0001;

    for (let i = 0; i < live; i++) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) { kill(i); i--; continue; }

      if (p.settle > 0) { p.settle -= dt; continue; }

      // integrate
      p.vy += p.grav * dt;
      const dr = 1 - p.drag * dt;
      p.vx *= dr > 0 ? dr : 0; p.vy *= dr > 0 ? dr : 0;
      p.vx += wind * 26 * p.windAmt * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.swayA) {
        p.phase += p.swayF * dt;
        p.x += Math.sin(p.phase) * p.swayA * dt;
      }
      p.rot += p.spin * dt;

      // ground interaction
      if (p.y >= p.ground) {
        if (p.kind === 'hail') {
          if (p.bounces < 2) {
            p.y = p.ground; p.vy = -Math.abs(p.vy) * 0.34; p.vx *= 0.55; p.bounces++;
          } else { kill(i); i--; continue; }
        } else if (p.kind === 'rain') {
          if (live < MAX_PARTICLES - 6 && rnd() < 0.35) {
            emit('splash', {
              x: p.x, y: p.ground, count: 1, depth: p.depth,
              vx: rr(-16, 16), vy: rr(-38, -16), alpha: 0.35 + p.depth * 0.4,
              ground: p.ground + 3,
            });
          }
          kill(i); i--; continue;
        } else if (p.kind === 'snow') {
          p.y = p.ground; p.vx = 0; p.vy = 0;
          p.settle = Math.min(p.life, 1.4 + rnd() * 1.6);
        } else if (p.kind === 'splash' || p.kind === 'blood' || p.kind === 'sweat') {
          kill(i); i--; continue;
        }
      }

      // off-screen cull (generous margins so wind-blown particles can re-enter)
      if (p.x < -64 || p.x > W + 64 || p.y > H + 40) { kill(i); i--; continue; }
    }

    // shake
    if (shakeAmp > 0.05) {
      shakeT += dt * 46;
      shakeAmp *= Math.exp(-dt * 7.5);
      api.shakeX = Math.round(Math.sin(shakeT * 1.7) * shakeAmp);
      api.shakeY = Math.round(Math.cos(shakeT * 2.3) * shakeAmp * 0.6);
    } else if (shakeAmp !== 0) {
      shakeAmp = 0; api.shakeX = 0; api.shakeY = 0;
    }

    // flash
    if (flashA > 0) {
      flashA -= dt * flashDecay;
      if (flashA < 0) flashA = 0;
    }
  }

  function kill(i) {
    const last = --live;
    if (i !== last) { const t = pool[i]; pool[i] = pool[last]; pool[last] = t; }
  }

  // ------------------------------------------------------------------ draw --
  /** draw(ctx, layer) — layer 0 draws the far half, 1 the near half, undefined draws all. */
  function draw(ctx, layer) {
    if (!live) return;
    const baseAlpha = ctx.globalAlpha;
    let curFill = null, curAlpha = -1;

    for (let i = 0; i < live; i++) {
      const p = pool[i];
      if (layer !== undefined && p.layer !== layer) continue;

      // fade in the first 12% of life, out over the last 35%
      const t = p.life / p.ttl;
      let a = p.alphaMul;
      if (t < 0.35) a *= t / 0.35;
      if (t > 0.92) a *= (1 - t) / 0.08;
      if (p.settle > 0) a *= Math.min(1, p.settle / 0.8);
      if (a <= 0.03) continue;

      const qa = Math.round(a * 12) / 12;
      if (qa !== curAlpha) { curAlpha = qa; ctx.globalAlpha = baseAlpha * qa; }

      const x = p.x | 0, y = p.y | 0;

      switch (p.shape) {
        case S_STREAK: {
          if (curFill !== p.col) { curFill = p.col; ctx.fillStyle = p.col; }
          const len = p.size;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / sp, uy = p.vy / sp;
          // vertical fast path: one rect
          if (ux > -0.18 && ux < 0.18) {
            ctx.fillRect(x, y, 1, len);
          } else {
            for (let s = 0; s < len; s++) ctx.fillRect((p.x + ux * s) | 0, (p.y + uy * s) | 0, 1, 1);
          }
          break;
        }
        case S_PUFF: {
          if (curFill !== p.col) { curFill = p.col; ctx.fillStyle = p.col; }
          const g = 1 - t;                                  // puffs grow as they age
          const s = Math.max(1, Math.round(p.size * (0.55 + g * 0.9)));
          ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
          if (s > 2) {
            // dithered soft edge
            ctx.globalAlpha = baseAlpha * qa * 0.45;
            ctx.fillRect(x - (s >> 1) - 1, y - (s >> 1) + 1, 1, s - 2);
            ctx.fillRect(x + (s >> 1), y - (s >> 1) + 1, 1, s - 2);
            ctx.fillRect(x - (s >> 1) + 1, y - (s >> 1) - 1, s - 2, 1);
            ctx.fillRect(x - (s >> 1) + 1, y + (s >> 1), s - 2, 1);
            ctx.globalAlpha = baseAlpha * qa;
          }
          break;
        }
        case S_SPARK: {
          if (curFill !== p.col) { curFill = p.col; ctx.fillStyle = p.col; }
          const tw = (Math.sin(p.phase + p.life * 9) > 0) ? 1 : 0;
          ctx.fillRect(x, y, 1, 1);
          if (tw) { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
          break;
        }
        case S_COIN: {
          if (curFill !== p.col) { curFill = p.col; ctx.fillStyle = p.col; }
          const w = 1 + (Math.abs(Math.cos(p.rot)) > 0.5 ? 1 : 0);
          ctx.fillRect(x, y, w, 2);
          break;
        }
        case S_FLAKE:
        case S_FRAME: {
          if (p.frameName) {
            const f = frame(p.frameName);
            ctx.drawImage(f.img, f.x, f.y, f.w, f.h, x - (f.w >> 1), y - (f.h >> 1), f.w, f.h);
            curFill = null;
          } else {
            if (curFill !== p.col) { curFill = p.col; ctx.fillStyle = p.col; }
            ctx.fillRect(x, y, p.size, p.size);
          }
          break;
        }
        default: {
          if (curFill !== p.col) { curFill = p.col; ctx.fillStyle = p.col; }
          ctx.fillRect(x, y, p.size, p.size);
        }
      }
    }
    ctx.globalAlpha = baseAlpha;
  }

  /** Full-frame flash. Draw last, over everything. */
  function drawFlash(ctx) {
    if (flashA <= 0.004) return;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * Math.min(1, flashA);
    ctx.fillStyle = flashCol;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
  }

  function shake(power) {
    const p = Math.abs(power || 0);
    if (p > shakeAmp) shakeAmp = Math.min(12, p);
  }

  function flash(color, strength, decay) {
    flashCol = color || '#ffffff';
    const s = strength === undefined ? 0.5 : strength;
    if (s > flashA) flashA = Math.min(1, s);
    flashDecay = decay || 3.2;
  }

  function clear() {
    live = 0; shakeAmp = 0; flashA = 0;
    api.shakeX = 0; api.shakeY = 0;
    for (const k in acc) acc[k] = 0;
  }
}

const EMPTY = {};
