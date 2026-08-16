/* =====================================================================
 * NORTHBOUND — synth.js
 * ---------------------------------------------------------------------
 * A tiny, dependency-free WebAudio synthesizer. Zero asset files:
 * every waveform, noise bed and reverb impulse response is generated
 * in code at runtime.
 *
 * Contents
 *   - note/frequency helpers
 *   - band-limited pulse waves (PeriodicWave, cached per context)
 *   - deterministic white / pink noise buffers (cached per context)
 *   - a procedurally generated stereo reverb impulse response
 *   - createEngine(ctx, opts) -> master bus (compressor + soft clip),
 *     music/sfx buses, per-bus stereo ping-pong delay + convolution
 *     reverb sends, and a general purpose `play(params, bus)` voice.
 *
 * Nothing in here touches the DOM or a global AudioContext, so the same
 * code renders identically in an OfflineAudioContext (used by the test
 * harness to measure peak/RMS per track).
 * ===================================================================== */

export const EPS = 0.0001;

export function mtof(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function dbToGain(db) { return Math.pow(10, db / 20); }

/** Deterministic 32-bit LCG — keeps generated buffers identical run to run. */
export function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* per-context caches                                                  */
/* ------------------------------------------------------------------ */

const CACHE = new WeakMap();
function cacheFor(ctx) {
  let c = CACHE.get(ctx);
  if (!c) { c = { waves: new Map(), noise: new Map(), ir: new Map(), curves: new Map() }; CACHE.set(ctx, c); }
  return c;
}

/**
 * Band-limited pulse wave of a given duty cycle via its Fourier series.
 * duty 0.5 === square; 0.25 / 0.125 give the thinner, reedier voices.
 */
export function pulseWave(ctx, duty) {
  const d = clamp(duty, 0.02, 0.98);
  const key = d.toFixed(3);
  const c = cacheFor(ctx);
  if (c.waves.has(key)) return c.waves.get(key);
  const N = 48;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let k = 1; k < N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * d);
  let w = null;
  try { w = ctx.createPeriodicWave(real, imag, { disableNormalization: false }); } catch (e) { w = null; }
  c.waves.set(key, w);
  return w;
}

/** A soft, slightly warm "organ-ish" wave used by pads (odd harmonics, rolled off). */
export function softWave(ctx) {
  const c = cacheFor(ctx);
  if (c.waves.has('soft')) return c.waves.get('soft');
  const N = 20;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let k = 1; k < N; k++) imag[k] = (1 / Math.pow(k, 1.7)) * (k % 2 ? 1 : 0.45);
  let w = null;
  try { w = ctx.createPeriodicWave(real, imag, { disableNormalization: false }); } catch (e) { w = null; }
  c.waves.set('soft', w);
  return w;
}

/** Deterministic noise beds. kind: 'noise' (white) | 'pink'. */
export function noiseBuffer(ctx, kind) {
  const c = cacheFor(ctx);
  const key = kind === 'pink' ? 'pink' : 'white';
  if (c.noise.has(key)) return c.noise.get(key);
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * 3));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = lcg(0x5eed + ch * 7919);
    if (key === 'white') {
      for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
    } else {
      // Paul Kellett's pink filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
  }
  c.noise.set(key, buf);
  return buf;
}

/**
 * Procedural stereo impulse response: sparse early reflections over an
 * exponentially decaying, progressively damped noise tail. No files.
 */
export function makeIR(ctx, opts = {}) {
  const dur = opts.dur || 2.4;
  const decay = opts.decay || 2.6;
  const damp = opts.damp == null ? 0.34 : opts.damp;
  const predelay = opts.predelay == null ? 0.014 : opts.predelay;
  const seed = opts.seed || 12345;
  const key = [dur, decay, damp, predelay, seed].join('|');
  const c = cacheFor(ctx);
  if (c.ir.has(key)) return c.ir.get(key);

  const sr = ctx.sampleRate;
  const len = Math.max(64, Math.floor(sr * dur));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * predelay);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = lcg(seed + ch * 31337);
    const skew = ch === 0 ? 0.94 : 1.06;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < pre) { data[i] = 0; continue; }
      const t = (i - pre) / (len - pre);
      // build-in over ~8ms so the tail blooms instead of snapping on
      const bloom = 1 - Math.exp(-(i - pre) / (sr * 0.008));
      const env = Math.pow(1 - t, decay) * bloom;
      const s = (rnd() * 2 - 1) * env;
      lp += (s - lp) * (damp * (1 - 0.55 * t) + 0.04);
      data[i] = lp;
    }
    // early reflections
    const taps = [0.009, 0.017, 0.026, 0.037, 0.051, 0.068, 0.089];
    for (let k = 0; k < taps.length; k++) {
      const i = Math.floor((taps[k] * skew + predelay) * sr);
      if (i < len) data[i] += (k % 2 ? -1 : 1) * 0.42 * Math.pow(0.72, k);
    }
  }
  c.ir.set(key, buf);
  return buf;
}

/* ------------------------------------------------------------------ */
/* shaping curves                                                      */
/* ------------------------------------------------------------------ */

/**
 * Master soft clipper. Unity below the knee, asymptotic above it, and
 * because a WaveShaper clamps inputs outside [-1,1] to the curve's end
 * points, the absolute output ceiling is ~0.872 — nothing can ever clip.
 */
function softClipCurve(ctx) {
  const c = cacheFor(ctx);
  if (c.curves.has('limit')) return c.curves.get('limit');
  const n = 2048;
  const curve = new Float32Array(n);
  const knee = 0.7, span = 0.29;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - Math.exp(-(a - knee) * 3)) * span;
    curve[i] = Math.sign(x) * y;
  }
  c.curves.set('limit', curve);
  return curve;
}

/** Per-voice drive curve (tanh), used by growls and gritty leads. */
function driveCurve(ctx, amount) {
  const k = clamp(amount, 1, 40);
  const key = 'drive' + k.toFixed(2);
  const c = cacheFor(ctx);
  if (c.curves.has(key)) return c.curves.get(key);
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  c.curves.set(key, curve);
  return curve;
}

/* ------------------------------------------------------------------ */
/* buses                                                               */
/* ------------------------------------------------------------------ */

function panNode(ctx, value) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(value, -1, 1);
    return p;
  }
  // very old implementations: fall back to a plain gain (mono, no throw)
  return ctx.createGain();
}

/**
 * A mixing bus with two aux sends: a stereo ping-pong delay and a
 * convolution reverb. `in`, `delayIn` and `revIn` are the entry points;
 * everything lands on `out`.
 */
export function makeBus(ctx, out, cfg = {}) {
  const input = ctx.createGain();
  input.gain.value = 1;
  input.connect(out);

  // --- ping-pong delay -------------------------------------------------
  const delayIn = ctx.createGain();
  delayIn.gain.value = 1;
  const tL = clamp(cfg.delayTime || 0.34, 0.01, 1.4);
  const tR = clamp(tL * (cfg.delayRatio || 1.5), 0.01, 1.4);
  const dL = ctx.createDelay(2.0); dL.delayTime.value = tL;
  const dR = ctx.createDelay(2.0); dR.delayTime.value = tR;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = cfg.delayDamp || 2400;
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 220;
  const fb = ctx.createGain();
  fb.gain.value = clamp(cfg.delayFeedback == null ? 0.34 : cfg.delayFeedback, 0, 0.75);
  const pL = panNode(ctx, -0.75);
  const pR = panNode(ctx, 0.75);
  const delayOut = ctx.createGain();
  delayOut.gain.value = cfg.delayLevel == null ? 0.55 : cfg.delayLevel;

  delayIn.connect(dL);
  dL.connect(damp);
  damp.connect(hpf);
  hpf.connect(pL); pL.connect(delayOut);
  hpf.connect(dR);
  dR.connect(pR); pR.connect(delayOut);
  dR.connect(fb); fb.connect(dL);
  delayOut.connect(out);

  // --- convolution reverb ---------------------------------------------
  const revIn = ctx.createGain();
  revIn.gain.value = 1;
  const preRev = ctx.createBiquadFilter();
  preRev.type = 'highpass';
  preRev.frequency.value = cfg.revHp || 180;
  const conv = ctx.createConvolver();
  conv.normalize = true;
  try {
    conv.buffer = makeIR(ctx, {
      dur: cfg.revDur || 2.4,
      decay: cfg.revDecay || 2.6,
      damp: cfg.revDamp,
      seed: cfg.revSeed || 12345,
    });
  } catch (e) { /* convolver unavailable: reverb send simply goes quiet */ }
  const revOut = ctx.createGain();
  revOut.gain.value = cfg.revLevel == null ? 0.9 : cfg.revLevel;
  revIn.connect(preRev); preRev.connect(conv); conv.connect(revOut); revOut.connect(out);

  return {
    ctx, out,
    in: input, delayIn, revIn,
    delayOut, revOut,
    nodes: [input, delayIn, dL, dR, damp, hpf, fb, pL, pR, delayOut, revIn, preRev, conv, revOut],
    dispose() {
      for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    },
  };
}

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * createEngine(ctx, opts)
 *   opts.destination  node to feed (default ctx.destination)
 *   opts.master       master trim (default 0.9)
 * Returns an object with music/sfx buses, volume + duck controls, and
 * the `play(params, bus)` voice allocator.
 */
export function createEngine(ctx, opts = {}) {
  const dest = opts.destination || ctx.destination;

  const master = ctx.createGain();
  master.gain.value = opts.master == null ? 0.9 : opts.master;

  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(ctx);
  try { shaper.oversample = '4x'; } catch (e) { /* ignore */ }

  const comp = ctx.createDynamicsCompressor();
  try {
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
  } catch (e) { /* ignore */ }

  const preGain = ctx.createGain();
  preGain.gain.value = 0.9;

  preGain.connect(comp);
  comp.connect(shaper);
  shaper.connect(master);
  master.connect(dest);

  // music path: volume -> duck -> master chain
  const musicVol = ctx.createGain();
  const musicDuck = ctx.createGain();
  musicVol.gain.value = 0.7;
  musicDuck.gain.value = 1;
  musicVol.connect(musicDuck);
  musicDuck.connect(preGain);

  const sfxVol = ctx.createGain();
  sfxVol.gain.value = 0.85;
  sfxVol.connect(preGain);

  const sfxBus = makeBus(ctx, sfxVol, {
    delayTime: 0.19, delayRatio: 1.5, delayFeedback: 0.22, delayLevel: 0.4,
    revDur: 1.6, revDecay: 3.0, revLevel: 0.75, revSeed: 777,
  });

  let voices = 0;
  let noiseSeed = 0;
  const maxVoices = opts.maxVoices || 96;

  function noteOff(nodes, extra) {
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    if (extra) for (const n of extra) { try { n.disconnect(); } catch (e) { /* ignore */ } }
  }

  /**
   * Schedule a single voice.
   *
   * params (all optional except freq/time):
   *   wave      'sine'|'triangle'|'square'|'sawtooth'|'pulse'|'soft'|'noise'|'pink'
   *   pw        duty cycle for 'pulse'
   *   freq      Hz (or midi via `midi`)
   *   time      absolute context time
   *   dur       sustain length in seconds
   *   gain      peak linear gain
   *   a,d,s,r   amplitude ADSR (s is a 0..1 level; s===0 => percussive, length = d)
   *   unison    detuned voice count, spread in cents
   *   detune    static detune in cents
   *   sub       add a sine one octave down at this relative level
   *   fm        {ratio, index, decay} simple 2-op FM
   *   vib       {rate, depth, delay} pitch vibrato (depth in cents)
   *   trem      {rate, depth} amplitude LFO
   *   freqAt    [[dt, hz], ...] absolute pitch envelope (exponential ramps)
   *   filter    {type, freq, q, env, a, d, s, r} biquad with its own envelope
   *   hp        highpass frequency
   *   drive     tanh drive amount
   *   pan       -1..1
   *   rate      playbackRate for noise sources
   *   send      {delay, reverb} aux send levels
   */
  function play(params, bus) {
    if (!params) return null;
    const b = bus || sfxBus;
    if (voices >= maxVoices) return null;

    const t0 = Math.max(params.time == null ? ctx.currentTime : params.time, 0);
    const freq = clamp(params.freq != null ? params.freq : (params.midi != null ? mtof(params.midi) : 440), 8, 20000);
    const peak = Math.max(EPS * 2, params.gain == null ? 0.2 : params.gain);
    const a = Math.max(0.0005, params.a == null ? 0.005 : params.a);
    const d = Math.max(0.005, params.d == null ? 0.12 : params.d);
    const s = params.s == null ? 0 : clamp(params.s, 0, 1);
    const r = Math.max(0.005, params.r == null ? 0.08 : params.r);
    const dur = Math.max(0.01, params.dur == null ? 0.2 : params.dur);

    const nodes = [];
    const timed = [];

    const amp = ctx.createGain();
    nodes.push(amp);

    // ---- amplitude envelope -----------------------------------------
    const g = amp.gain;
    let stopAt;
    g.setValueAtTime(EPS, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    if (s > 0) {
      const sv = Math.max(peak * s, EPS * 2);
      g.exponentialRampToValueAtTime(sv, t0 + a + d);
      const rt = Math.max(t0 + dur, t0 + a + d + 0.001);
      g.setValueAtTime(sv, rt);
      g.exponentialRampToValueAtTime(EPS, rt + r);
      stopAt = rt + r + 0.02;
    } else {
      g.exponentialRampToValueAtTime(EPS, t0 + a + d);
      stopAt = t0 + a + d + 0.02;
    }

    // ---- filter -------------------------------------------------------
    let head = amp; // node that sources feed into (walking backwards)
    if (params.filter) {
      const f = params.filter;
      const biq = ctx.createBiquadFilter();
      biq.type = f.type || 'lowpass';
      const base = clamp(f.freq || 1200, 20, 18000);
      biq.frequency.setValueAtTime(base, t0);
      biq.Q.value = f.q == null ? 0.8 : f.q;
      if (f.env) {
        const fa = Math.max(0.001, f.a == null ? a : f.a);
        const fd = Math.max(0.005, f.d == null ? d : f.d);
        const fs = f.s == null ? s : f.s;
        const fr = Math.max(0.005, f.r == null ? r : f.r);
        const topF = clamp(base + f.env, 20, 18000);
        const susF = clamp(base + f.env * fs, 20, 18000);
        biq.frequency.linearRampToValueAtTime(topF, t0 + fa);
        biq.frequency.exponentialRampToValueAtTime(susF, t0 + fa + fd);
        if (s > 0) {
          const rt = Math.max(t0 + dur, t0 + fa + fd + 0.001);
          biq.frequency.setValueAtTime(susF, rt);
          biq.frequency.exponentialRampToValueAtTime(clamp(base, 20, 18000), rt + fr);
        }
      }
      nodes.push(biq);
      biq.connect(head);
      head = biq;
    }
    if (params.hp) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = clamp(params.hp, 20, 18000);
      hp.Q.value = params.hpQ == null ? 0.7 : params.hpQ;
      nodes.push(hp);
      hp.connect(head);
      head = hp;
    }
    if (params.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(ctx, params.drive);
      const trim = ctx.createGain();
      trim.gain.value = 0.7;
      nodes.push(ws, trim);
      ws.connect(trim); trim.connect(head);
      head = ws;
    }

    // ---- sources ------------------------------------------------------
    const wave = params.wave || 'triangle';
    const isNoise = wave === 'noise' || wave === 'pink';
    const carriers = [];

    if (isNoise) {
      const src = ctx.createBufferSource();
      const buf = noiseBuffer(ctx, wave);
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = clamp(params.rate || 1, 0.05, 8);
      // deterministic-but-varied start offset so repeated hits differ
      noiseSeed = (noiseSeed + 1) % 997;
      const off = (noiseSeed * 0.0071 + (params.offset || 0)) % Math.max(0.5, buf.duration - 0.5);
      src.connect(head);
      nodes.push(src);
      timed.push(src);
      try { src.start(t0, off); } catch (e) { try { src.start(t0); } catch (e2) { /* ignore */ } }
    } else {
      const n = clamp(params.unison || 1, 1, 5) | 0;
      const spread = params.spread == null ? 7 : params.spread;
      const mix = ctx.createGain();
      mix.gain.value = 1 / Math.sqrt(n);
      mix.connect(head);
      nodes.push(mix);
      for (let i = 0; i < n; i++) {
        const osc = ctx.createOscillator();
        if (wave === 'pulse') {
          const w = pulseWave(ctx, params.pw == null ? 0.5 : params.pw);
          if (w) osc.setPeriodicWave(w); else osc.type = 'square';
        } else if (wave === 'soft') {
          const w = softWave(ctx);
          if (w) osc.setPeriodicWave(w); else osc.type = 'triangle';
        } else {
          osc.type = wave;
        }
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
        osc.detune.value = (params.detune || 0) + off;
        osc.frequency.setValueAtTime(freq, t0);
        if (params.freqAt) {
          for (const [dt, hz] of params.freqAt) {
            const target = clamp(hz, 8, 20000);
            try { osc.frequency.exponentialRampToValueAtTime(target, t0 + Math.max(0.001, dt)); }
            catch (e) { osc.frequency.linearRampToValueAtTime(target, t0 + Math.max(0.001, dt)); }
          }
        }
        osc.connect(mix);
        nodes.push(osc);
        timed.push(osc);
        carriers.push(osc);
        osc.start(t0);
      }
      if (params.sub) {
        const so = ctx.createOscillator();
        so.type = 'sine';
        so.frequency.setValueAtTime(freq / 2, t0);
        const sg = ctx.createGain();
        sg.gain.value = params.sub;
        so.connect(sg); sg.connect(head);
        nodes.push(so, sg);
        timed.push(so);
        carriers.push(so);
        so.start(t0);
      }
    }

    // ---- modulation ---------------------------------------------------
    if (params.fm && carriers.length) {
      const m = ctx.createOscillator();
      m.type = params.fm.wave || 'sine';
      m.frequency.setValueAtTime(freq * (params.fm.ratio || 1), t0);
      const mg = ctx.createGain();
      const idx = (params.fm.index == null ? 2 : params.fm.index) * freq;
      mg.gain.setValueAtTime(idx, t0);
      if (params.fm.decay) mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.02), t0 + params.fm.decay);
      m.connect(mg);
      for (const c of carriers) mg.connect(c.frequency);
      nodes.push(m, mg);
      timed.push(m);
      m.start(t0);
    }
    if (params.vib && carriers.length) {
      const v = ctx.createOscillator();
      v.type = 'sine';
      v.frequency.value = params.vib.rate || 5;
      const vg = ctx.createGain();
      const depth = params.vib.depth == null ? 12 : params.vib.depth;
      const vd = params.vib.delay || 0;
      vg.gain.setValueAtTime(vd > 0 ? 0.001 : depth, t0);
      if (vd > 0) vg.gain.linearRampToValueAtTime(depth, t0 + vd);
      v.connect(vg);
      for (const c of carriers) if (c.detune) vg.connect(c.detune);
      nodes.push(v, vg);
      timed.push(v);
      v.start(t0);
    }
    if (params.trem) {
      const l = ctx.createOscillator();
      l.type = params.trem.wave || 'sine';
      l.frequency.value = params.trem.rate || 6;
      const lg = ctx.createGain();
      lg.gain.value = peak * clamp(params.trem.depth == null ? 0.4 : params.trem.depth, 0, 1);
      l.connect(lg);
      lg.connect(amp.gain);
      nodes.push(l, lg);
      timed.push(l);
      l.start(t0);
    }

    // ---- output & sends ------------------------------------------------
    let tail = amp;
    if (params.pan) {
      const p = panNode(ctx, params.pan);
      amp.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(b.in);
    if (params.send) {
      if (params.send.delay > 0) {
        const sd = ctx.createGain();
        sd.gain.value = params.send.delay;
        tail.connect(sd); sd.connect(b.delayIn);
        nodes.push(sd);
      }
      if (params.send.reverb > 0) {
        const sr = ctx.createGain();
        sr.gain.value = params.send.reverb;
        tail.connect(sr); sr.connect(b.revIn);
        nodes.push(sr);
      }
    }

    // ---- lifetime ------------------------------------------------------
    voices++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      voices--;
      noteOff(nodes);
    };
    let last = null;
    for (const t of timed) {
      try { t.stop(stopAt); } catch (e) { /* ignore */ }
      last = t;
    }
    if (last) last.onended = finish;
    else finish();

    return { stopAt, nodes };
  }

  return {
    ctx,
    master, preGain,
    musicVol, musicDuck, sfxVol,
    sfxBus,
    play,
    makeBus: (out, cfg) => makeBus(ctx, out, cfg),
    get voices() { return voices; },
    setMusicVolume(v, when) {
      const t = when == null ? ctx.currentTime : when;
      try {
        musicVol.gain.cancelScheduledValues(t);
        musicVol.gain.setTargetAtTime(clamp(v, 0, 1), t, 0.02);
      } catch (e) { musicVol.gain.value = clamp(v, 0, 1); }
    },
    setSfxVolume(v) {
      try {
        sfxVol.gain.cancelScheduledValues(ctx.currentTime);
        sfxVol.gain.setTargetAtTime(clamp(v, 0, 1), ctx.currentTime, 0.02);
      } catch (e) { sfxVol.gain.value = clamp(v, 0, 1); }
    },
    /** Duck the music bus (used under important SFX). */
    duck(amount, hold, release) {
      const t = ctx.currentTime;
      const lo = clamp(1 - (amount == null ? 0.45 : amount), 0.05, 1);
      const g = musicDuck.gain;
      try {
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.min(g.value, 1), t);
        g.linearRampToValueAtTime(lo, t + 0.05);
        g.setValueAtTime(lo, t + 0.05 + (hold == null ? 0.25 : hold));
        g.linearRampToValueAtTime(1, t + 0.05 + (hold == null ? 0.25 : hold) + (release == null ? 0.6 : release));
      } catch (e) { /* ignore */ }
    },
    dispose() {
      sfxBus.dispose();
      for (const n of [master, shaper, comp, preGain, musicVol, musicDuck, sfxVol]) {
        try { n.disconnect(); } catch (e) { /* ignore */ }
      }
    },
  };
}
