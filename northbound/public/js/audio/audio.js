/* =====================================================================
 * NORTHBOUND — audio.js
 * ---------------------------------------------------------------------
 * The whole soundtrack and sound bank, synthesized at runtime. No asset
 * files, no dependencies, no network.
 *
 *   audio.js    the public `Audio` API (SPEC §8), the lookahead
 *               sequencer, crossfades, ducking, volume persistence
 *   synth.js    oscillator/noise voices, ADSR, filter + filter env,
 *               ping-pong delay, procedural convolution reverb, and a
 *               master bus with a soft limiter
 *   music.js    the fourteen compositions and the shared patch library
 *   sfx.js      every sound effect, individually designed
 *
 * SCHEDULING
 *   Notes are placed on the WebAudio clock, never on a timer. A 25 ms
 *   `setInterval` only asks "what falls inside the next 100 ms?" and
 *   schedules those notes at exact context times, so loops stay sample
 *   accurate and seamless regardless of timer jitter.
 *
 * FAILURE
 *   If there is no AudioContext, or `init()` was never called, or it
 *   failed, every method here is a silent no-op. Nothing throws,
 *   nothing logs, no promise is left unhandled.
 *
 * The motif relationships that tie the fourteen tracks together are
 * documented at the top of music.js.
 * ===================================================================== */

import { createEngine, clamp } from './synth.js';
import { buildTrack, TRACK_IDS, trackInfo } from './music.js';
import { SFX, SFX_IDS, DUCK } from './sfx.js';

const KEY_MUSIC = 'nb.musicVol';
const KEY_SFX = 'nb.sfxVol';
const KEY_MUTED = 'nb.muted';

const LOOKAHEAD_MS = 25;      // how often the scheduler wakes up
const SCHEDULE_AHEAD = 0.1;   // how far ahead of the clock it places notes
const MASTER_TRIM = 0.9;
const DEFAULT_FADE = 1.2;

const S = {
  ctx: null,
  eng: null,
  ready: false,
  failed: false,
  initPromise: null,
  players: [],
  current: null,
  currentId: null,
  musicVol: 0.7,
  sfxVol: 0.85,
  muted: false,
  timer: null,
  pending: null,
  gestureBound: false,
  disposals: [],
};

/* ------------------------------------------------------------------ */
/* preferences                                                         */
/* ------------------------------------------------------------------ */

function store() {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage : null;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch (e) { return null; }
}

function readPrefs() {
  const ls = store();
  if (!ls) return;
  try {
    const m = parseFloat(ls.getItem(KEY_MUSIC));
    if (!Number.isNaN(m)) S.musicVol = clamp(m, 0, 1);
    const s = parseFloat(ls.getItem(KEY_SFX));
    if (!Number.isNaN(s)) S.sfxVol = clamp(s, 0, 1);
    const mu = ls.getItem(KEY_MUTED);
    if (mu != null) S.muted = mu === 'true' || mu === '1';
  } catch (e) { /* ignore */ }
}

function writePref(key, value) {
  const ls = store();
  if (!ls) return;
  try { ls.setItem(key, String(value)); } catch (e) { /* quota / private mode */ }
}

function applyVolumes() {
  if (!S.eng) return;
  try {
    S.eng.setMusicVolume(S.musicVol);
    S.eng.setSfxVolume(S.sfxVol);
    const t = S.ctx.currentTime;
    S.eng.master.gain.cancelScheduledValues(t);
    S.eng.master.gain.setTargetAtTime(S.muted ? 0 : MASTER_TRIM, t, 0.02);
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* the sequencer                                                       */
/* ------------------------------------------------------------------ */

function makePlayer(track, startTime) {
  const ctx = S.ctx;
  const fader = ctx.createGain();
  fader.gain.value = 0;
  fader.connect(S.eng.musicVol);
  const bus = S.eng.makeBus(fader, track.fx);
  return {
    id: track.id,
    track,
    fader,
    bus,
    start: startTime,
    cursor: 0,
    loop: 0,
    stopAt: Infinity,   // scheduler stops placing notes past this time
    dead: false,
  };
}

function disposePlayer(p) {
  if (p.dead) return;
  p.dead = true;
  try { p.bus.dispose(); } catch (e) { /* ignore */ }
  try { p.fader.disconnect(); } catch (e) { /* ignore */ }
  const i = S.players.indexOf(p);
  if (i >= 0) S.players.splice(i, 1);
  if (S.current === p) { S.current = null; S.currentId = null; }
}

/** Place every note that starts before `until` (a context time). */
function schedulePlayer(p, until) {
  const track = p.track;
  const evs = track.events;
  if (!evs.length || !(track.loopDur > 0)) return;
  const now = S.ctx.currentTime;
  const limit = Math.min(until, p.stopAt);
  let guard = 0;
  while (guard++ < 4096) {
    const ev = evs[p.cursor];
    const at = p.start + (p.loop * track.beats + ev.t) * track.beatDur;
    if (at >= limit) break;
    if (at >= now - 0.05) S.eng.play(Object.assign({}, ev.params, { time: at }), p.bus);
    p.cursor++;
    if (p.cursor >= evs.length) { p.cursor = 0; p.loop++; }
  }
}

function tick() {
  if (!S.ready || !S.ctx) return;
  const until = S.ctx.currentTime + SCHEDULE_AHEAD;
  for (let i = S.players.length - 1; i >= 0; i--) {
    const p = S.players[i];
    if (p.dead) { S.players.splice(i, 1); continue; }
    schedulePlayer(p, until);
  }
}

function startClock() {
  if (S.timer != null) return;
  try {
    S.timer = setInterval(() => { try { tick(); } catch (e) { /* never surface */ } }, LOOKAHEAD_MS);
  } catch (e) { S.timer = null; }
}

function laterDispose(p, delaySec) {
  try {
    const h = setTimeout(() => { disposePlayer(p); }, Math.max(0, delaySec * 1000));
    S.disposals.push(h);
    if (S.disposals.length > 64) S.disposals.splice(0, 32);
  } catch (e) { disposePlayer(p); }
}

function fadeOut(p, fade) {
  const t = S.ctx.currentTime;
  const f = Math.max(0.01, fade);
  try {
    const g = p.fader.gain;
    const cur = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(0, t + f);
  } catch (e) { /* ignore */ }
  p.stopAt = t + f;              // stop scheduling new notes past the fade
  if (S.current === p) { S.current = null; S.currentId = null; }
  laterDispose(p, f + 0.4);
}

/* ------------------------------------------------------------------ */
/* gesture / suspension handling                                       */
/* ------------------------------------------------------------------ */

function resumeCtx() {
  if (!S.ctx || typeof S.ctx.resume !== 'function') return;
  if (S.ctx.state !== 'suspended') return;
  try {
    const p = S.ctx.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* ignore */ }
}

function bindGesture() {
  if (S.gestureBound) return;
  const g = typeof window !== 'undefined' ? window : null;
  if (!g || typeof g.addEventListener !== 'function') return;
  S.gestureBound = true;
  const events = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
  const handler = () => { resumeCtx(); };
  for (const type of events) {
    try { g.addEventListener(type, handler, { passive: true, capture: true }); } catch (e) { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/* the public API (SPEC §8)                                            */
/* ------------------------------------------------------------------ */

export const Audio = {

  /**
   * Create the AudioContext and build the mix. Safe to call any number
   * of times; the same promise is returned. Resolves `true` when audio
   * is live, `false` when the platform has no WebAudio (in which case
   * every other method quietly does nothing).
   */
  async init() {
    if (S.initPromise) return S.initPromise;
    S.initPromise = (async () => {
      try {
        const g = typeof globalThis !== 'undefined' ? globalThis : {};
        const AC = g.AudioContext || g.webkitAudioContext;
        if (typeof AC !== 'function') { S.failed = true; return false; }
        readPrefs();
        let ctx;
        try { ctx = new AC({ latencyHint: 'interactive' }); }
        catch (e) { ctx = new AC(); }
        S.ctx = ctx;
        S.eng = createEngine(ctx, { master: S.muted ? 0 : MASTER_TRIM, maxVoices: 128 });
        applyVolumes();
        bindGesture();
        startClock();
        S.ready = true;
        resumeCtx();
        if (S.pending) {
          const q = S.pending;
          S.pending = null;
          Audio.playMusic(q.id, q.opts);
        }
        return true;
      } catch (e) {
        S.failed = true;
        S.ready = false;
        S.ctx = null;
        S.eng = null;
        return false;
      }
    })();
    return S.initPromise;
  },

  /**
   * Crossfade to a music track. Unknown ids are ignored; asking for the
   * track that is already playing is a no-op (pass `{restart:true}` to
   * force it). Calling before init() queues the request.
   */
  playMusic(id, opts) {
    const o = opts || {};
    try {
      if (!TRACK_IDS.includes(id)) return;
      if (!S.ready || !S.eng) { S.pending = { id, opts: o }; return; }
      if (S.currentId === id && S.current && !S.current.dead && !o.restart) return;
      resumeCtx();

      const fade = Math.max(0, o.fade == null ? DEFAULT_FADE : o.fade);
      const track = buildTrack(id);
      if (!track) return;

      for (const p of S.players.slice()) if (!p.dead) fadeOut(p, fade);

      const now = S.ctx.currentTime;
      const player = makePlayer(track, now + 0.06);
      const g = player.fader.gain;
      g.setValueAtTime(0, now);
      if (fade > 0.01) g.linearRampToValueAtTime(1, now + fade);
      else g.setValueAtTime(1, now + 0.01);

      S.players.push(player);
      S.current = player;
      S.currentId = id;
      schedulePlayer(player, now + SCHEDULE_AHEAD);
    } catch (e) { /* never throw */ }
  },

  /** Fade the current track out and let it go. */
  stopMusic(opts) {
    const o = opts || {};
    try {
      S.pending = null;
      if (!S.ready) return;
      const fade = Math.max(0, o.fade == null ? DEFAULT_FADE : o.fade);
      for (const p of S.players.slice()) if (!p.dead) fadeOut(p, fade);
      S.current = null;
      S.currentId = null;
    } catch (e) { /* never throw */ }
  },

  /** Fire a one-shot sound effect. Unknown ids are ignored. */
  sfx(id, opts) {
    const o = opts || {};
    try {
      if (!S.ready || !S.eng) return;
      const design = SFX[id];
      if (typeof design !== 'function') return;
      if (S.muted) return;
      resumeCtx();
      const eng = S.eng;
      const t = S.ctx.currentTime + 0.004;
      const bus = eng.sfxBus;
      const args = {
        t,
        v: clamp(o.vol == null ? 1 : o.vol, 0, 4),
        rate: clamp(o.rate == null ? 1 : o.rate, 0.25, 4),
        bus,
      };
      // voices default to the effect's start time and the sfx bus
      const proxy = {
        play(params, b) {
          try { return eng.play(Object.assign({ time: t }, params), b || bus); }
          catch (e) { return null; }
        },
      };
      design(proxy, args);
      const duck = DUCK[id];
      if (duck && S.current) eng.duck(duck[0] * args.v, duck[1], duck[2]);
    } catch (e) { /* never throw */ }
  },

  /** 0..1, persisted to localStorage under `nb.musicVol`. */
  setMusicVolume(v) {
    try {
      S.musicVol = clamp(typeof v === 'number' && !Number.isNaN(v) ? v : 0, 0, 1);
      writePref(KEY_MUSIC, S.musicVol);
      if (S.eng) S.eng.setMusicVolume(S.musicVol);
    } catch (e) { /* never throw */ }
  },

  /** 0..1, persisted to localStorage under `nb.sfxVol`. */
  setSfxVolume(v) {
    try {
      S.sfxVol = clamp(typeof v === 'number' && !Number.isNaN(v) ? v : 0, 0, 1);
      writePref(KEY_SFX, S.sfxVol);
      if (S.eng) S.eng.setSfxVolume(S.sfxVol);
    } catch (e) { /* never throw */ }
  },

  get muted() { return S.muted; },
  set muted(v) {
    const next = !!v;
    if (next === S.muted) return;
    Audio.toggleMute();
  },

  /** Flip mute (persisted under `nb.muted`) and return the new state. */
  toggleMute() {
    try {
      S.muted = !S.muted;
      writePref(KEY_MUTED, S.muted);
      applyVolumes();
      return S.muted;
    } catch (e) { return S.muted; }
  },

  get musicVolume() { return S.musicVol; },
  get sfxVolume() { return S.sfxVol; },
  get currentMusic() { return S.currentId; },
  get ready() { return S.ready; },

  /** Ids, for menus and tests. */
  tracks: TRACK_IDS.slice(),
  sounds: SFX_IDS.slice(),

  /** Diagnostics for the playtest harness — never used by the game. */
  _debug() {
    return {
      ready: S.ready,
      failed: S.failed,
      state: S.ctx ? S.ctx.state : 'none',
      voices: S.eng ? S.eng.voices : 0,
      players: S.players.filter((p) => !p.dead).length,
      current: S.currentId,
      musicVol: S.musicVol,
      sfxVol: S.sfxVol,
      muted: S.muted,
    };
  },

  /** Tear everything down (used by tests / hot reload). */
  async dispose() {
    try {
      if (S.timer != null) { clearInterval(S.timer); S.timer = null; }
      for (const h of S.disposals) { try { clearTimeout(h); } catch (e) { /* ignore */ } }
      S.disposals.length = 0;
      for (const p of S.players.slice()) disposePlayer(p);
      S.players.length = 0;
      if (S.eng) S.eng.dispose();
      if (S.ctx && typeof S.ctx.close === 'function') {
        const c = S.ctx.close();
        if (c && typeof c.catch === 'function') c.catch(() => {});
      }
    } catch (e) { /* ignore */ }
    S.ctx = null; S.eng = null; S.ready = false; S.initPromise = null;
    S.current = null; S.currentId = null;
  },
};

export default Audio;

/* ------------------------------------------------------------------ */
/* offline rendering — used by the test harness as the quality gate    */
/* ------------------------------------------------------------------ */

function offlineCtx(seconds, sampleRate) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const OAC = g.OfflineAudioContext || g.webkitOfflineAudioContext;
  if (typeof OAC !== 'function') return null;
  const sr = sampleRate || 44100;
  return new OAC(2, Math.max(1, Math.ceil(seconds * sr)), sr);
}

/**
 * Render `seconds` of a music track to an AudioBuffer, through the very
 * same voices, buses and master limiter used live. Returns null when
 * OfflineAudioContext is unavailable.
 */
export async function renderTrackOffline(id, seconds, sampleRate) {
  const track = buildTrack(id);
  const ctx = offlineCtx(seconds, sampleRate);
  if (!track || !ctx) return null;
  const eng = createEngine(ctx, { master: MASTER_TRIM, maxVoices: 1e6 });
  eng.musicVol.gain.value = S.musicVol;
  eng.sfxVol.gain.value = S.sfxVol;
  const fader = ctx.createGain();
  fader.gain.value = 1;
  fader.connect(eng.musicVol);
  const bus = eng.makeBus(fader, track.fx);
  let cursor = 0, loop = 0, guard = 0;
  const evs = track.events;
  while (evs.length && guard++ < 200000) {
    const ev = evs[cursor];
    const at = (loop * track.beats + ev.t) * track.beatDur;
    if (at >= seconds) break;
    eng.play(Object.assign({}, ev.params, { time: at }), bus);
    cursor++;
    if (cursor >= evs.length) { cursor = 0; loop++; }
  }
  return ctx.startRendering();
}

/** Render a single SFX to an AudioBuffer, on the sfx bus. */
export async function renderSfxOffline(id, seconds, sampleRate) {
  const design = SFX[id];
  const ctx = offlineCtx(seconds || 3, sampleRate);
  if (typeof design !== 'function' || !ctx) return null;
  const eng = createEngine(ctx, { master: MASTER_TRIM, maxVoices: 1e6 });
  eng.sfxVol.gain.value = S.sfxVol;
  const proxy = {
    play(params, b) { return eng.play(Object.assign({ time: 0.02 }, params), b || eng.sfxBus); },
  };
  design(proxy, { t: 0.02, v: 1, rate: 1, bus: eng.sfxBus });
  return ctx.startRendering();
}

export { TRACK_IDS, SFX_IDS, trackInfo };
