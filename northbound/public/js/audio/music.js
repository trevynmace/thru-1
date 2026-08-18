/* =====================================================================
 * NORTHBOUND — music.js
 * ---------------------------------------------------------------------
 * Fourteen hand-written compositions, rendered by the synth in synth.js.
 * No samples, no files: chords, bass lines, melodies and percussion are
 * written out as note data and voiced through a shared patch library so
 * the whole soundtrack sounds like one score.
 *
 * ---------------------------------------------------------------------
 * THE MOTIFS  (written as SCALE DEGREES so they take on the colour of
 * whatever mode a cue is in — the same shape sounds hopeful in lydian
 * and bleak in phrygian, which is the whole trick of this score.)
 *
 *   NORTH  [0, 4, 5, 4, 2, 1, 0]   do–sol–la–sol–mi–re–do
 *       The game's identity: a rise to the sixth and a slow walk home.
 *       Stated plainly in `theme_title` (bars 1–2 and, an octave up,
 *       bar 6). Heard distant and halved in `night_camp`; grand and
 *       slow in `trail_sierra`; inverted and minor in `defeat`;
 *       harmonised in `victory`; as the top line of `funeral`'s
 *       descent (bars 5–8).
 *
 *   SNOW   [0, -1, -3, -4]         a cold four-note sag
 *       The snow line chasing you north. Owns `trail_rain` (delayed
 *       pluck), `defeat` (the whole tune is a chain of them),
 *       `funeral` (soprano, bars 5–8) and the `danger` stab.
 *
 *   MILE   [0, 3, 7]               a rising fourth then the octave
 *       Arrival / progress. Opens `victory` and `town`, is the hook of
 *       `forage`, punctuates `trail_desert`, and is the `arrive`,
 *       `pickup` and `level_up` SFX so the UI answers the score.
 *
 *   WHEEL  [0, 4]                  a rocking bare fifth
 *       The walk. Every travel cue rides on it: `trail_desert`
 *       (offbeat plucks), `trail_sierra` (drone), `trail_forest`
 *       (marimba), `ford` (16th tremolo), `danger` (ostinato).
 *
 * ---------------------------------------------------------------------
 * Event shape produced by buildTrack(id):
 *   { t: beats, dur: beats, params: {...synth params, dur in seconds} }
 * The sequencer in audio.js only has to add an absolute `time`.
 * ===================================================================== */

import { mtof, clamp, lcg } from './synth.js';

/* ------------------------------------------------------------------ */
/* pitch helpers                                                       */
/* ------------------------------------------------------------------ */

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** N('A3') -> 57, N('F#4') -> 66, N('Eb2') -> 39 */
export function N(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 60;
  return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

/** Scale degree -> midi. Negative and >7 degrees wrap octaves properly. */
export function deg(root, scale, d) {
  const n = scale.length;
  const oct = Math.floor(d / n);
  const i = ((d % n) + n) % n;
  return root + 12 * oct + scale[i];
}

export const MOTIF = {
  NORTH: [0, 4, 5, 4, 2, 1, 0],
  SNOW: [0, -1, -3, -4],
  MILE: [0, 3, 7],
  WHEEL: [0, 4],
};

/** Render a motif at a root, in a scale, as midi notes. */
export function motif(name, root, scale, transposeDeg) {
  const src = MOTIF[name] || MOTIF.NORTH;
  const off = transposeDeg || 0;
  return src.map((d) => deg(root, scale, d + off));
}

/* ------------------------------------------------------------------ */
/* patch library — the score's instruments                             */
/* ------------------------------------------------------------------ */

export const PATCHES = {
  /* --- sustained ------------------------------------------------- */
  pad: {
    wave: 'sawtooth', unison: 3, spread: 9, gain: 0.055,
    a: 0.9, d: 1.4, s: 0.62, r: 1.6,
    filter: { type: 'lowpass', freq: 460, q: 0.7, env: 780, a: 1.1, d: 1.8, s: 0.42, r: 1.4 },
    send: { reverb: 0.5, delay: 0.1 },
  },
  pad_dark: {
    wave: 'sawtooth', unison: 3, spread: 6, gain: 0.05,
    a: 1.4, d: 2.0, s: 0.6, r: 2.2,
    filter: { type: 'lowpass', freq: 300, q: 0.8, env: 320, a: 1.8, d: 2.4, s: 0.35, r: 2.0 },
    send: { reverb: 0.6, delay: 0.06 },
  },
  pad_glass: {
    wave: 'soft', unison: 2, spread: 5, gain: 0.045,
    a: 1.1, d: 1.6, s: 0.55, r: 2.4,
    filter: { type: 'lowpass', freq: 1500, q: 0.6, env: 900, a: 1.4, d: 2.0, s: 0.4, r: 1.8 },
    send: { reverb: 0.65, delay: 0.22 },
  },
  strings: {
    wave: 'sawtooth', unison: 4, spread: 12, gain: 0.05,
    a: 0.5, d: 1.0, s: 0.7, r: 1.1,
    vib: { rate: 4.6, depth: 5, delay: 0.5 },
    filter: { type: 'lowpass', freq: 900, q: 0.9, env: 700, a: 0.7, d: 1.4, s: 0.5, r: 1.0 },
    send: { reverb: 0.5, delay: 0.08 },
  },
  choir: {
    wave: 'soft', unison: 3, spread: 8, gain: 0.06,
    a: 0.7, d: 1.2, s: 0.68, r: 1.6,
    vib: { rate: 4.2, depth: 7, delay: 0.8 },
    filter: { type: 'bandpass', freq: 800, q: 1.1, env: 500, a: 0.9, d: 1.4, s: 0.5, r: 1.2 },
    send: { reverb: 0.68, delay: 0.05 },
  },
  brass: {
    wave: 'sawtooth', unison: 2, spread: 11, gain: 0.075,
    a: 0.045, d: 0.35, s: 0.62, r: 0.28,
    filter: { type: 'lowpass', freq: 620, q: 1.5, env: 2600, a: 0.09, d: 0.5, s: 0.35, r: 0.25 },
    send: { reverb: 0.28, delay: 0.1 },
  },
  flute: {
    wave: 'sine', gain: 0.07, a: 0.12, d: 0.3, s: 0.7, r: 0.35,
    vib: { rate: 5.2, depth: 11, delay: 0.25 },
    send: { reverb: 0.45, delay: 0.24 },
  },
  harmonica: {
    wave: 'pulse', pw: 0.32, unison: 2, spread: 14, gain: 0.052,
    a: 0.07, d: 0.35, s: 0.6, r: 0.22,
    vib: { rate: 6.1, depth: 16, delay: 0.18 },
    filter: { type: 'bandpass', freq: 1100, q: 1.4, env: 700, a: 0.1, d: 0.4, s: 0.5, r: 0.2 },
    send: { reverb: 0.3, delay: 0.2 },
  },
  wash: {
    wave: 'pink', gain: 0.05, a: 1.6, d: 1.2, s: 0.8, r: 2.0,
    filter: { type: 'bandpass', freq: 900, q: 0.7, env: 500, a: 2.0, d: 2.5, s: 0.5, r: 1.8 },
    send: { reverb: 0.4 },
  },
  drone: {
    wave: 'triangle', sub: 0.5, gain: 0.06, a: 1.6, d: 1.6, s: 0.7, r: 2.4,
    filter: { type: 'lowpass', freq: 220, q: 0.6 },
    send: { reverb: 0.3 },
  },

  /* --- struck / plucked ------------------------------------------ */
  glass: {
    wave: 'sine', gain: 0.1, a: 0.006, d: 1.1, s: 0.12, r: 0.7,
    fm: { ratio: 3.01, index: 1.1, decay: 0.35 },
    send: { reverb: 0.5, delay: 0.32 },
  },
  bell: {
    wave: 'sine', gain: 0.085, a: 0.004, d: 1.9, s: 0.05, r: 1.2,
    fm: { ratio: 1.41, index: 2.2, decay: 0.5 },
    send: { reverb: 0.55, delay: 0.2 },
  },
  marimba: {
    wave: 'sine', gain: 0.11, a: 0.004, d: 0.42, s: 0.0, r: 0.1,
    fm: { ratio: 4.0, index: 1.4, decay: 0.12 },
    send: { reverb: 0.25, delay: 0.14 },
  },
  pluck: {
    wave: 'triangle', gain: 0.085, a: 0.005, d: 0.5, s: 0.06, r: 0.22,
    filter: { type: 'lowpass', freq: 900, q: 1.2, env: 2200, a: 0.008, d: 0.28, s: 0.15, r: 0.2 },
    send: { reverb: 0.3, delay: 0.24 },
  },
  pluck_hi: {
    wave: 'pulse', pw: 0.28, gain: 0.06, a: 0.004, d: 0.34, s: 0.04, r: 0.16,
    filter: { type: 'lowpass', freq: 1500, q: 1.6, env: 3200, a: 0.006, d: 0.2, s: 0.1, r: 0.14 },
    send: { reverb: 0.22, delay: 0.38 },
  },
  pluck_soft: {
    wave: 'triangle', gain: 0.07, a: 0.02, d: 0.7, s: 0.08, r: 0.35,
    filter: { type: 'lowpass', freq: 620, q: 0.9, env: 700, a: 0.03, d: 0.4, s: 0.2, r: 0.3 },
    send: { reverb: 0.45, delay: 0.34 },
  },
  guitar: {
    wave: 'sawtooth', gain: 0.055, a: 0.005, d: 0.55, s: 0.1, r: 0.3,
    filter: { type: 'lowpass', freq: 800, q: 1.1, env: 1600, a: 0.01, d: 0.3, s: 0.2, r: 0.25 },
    send: { reverb: 0.24, delay: 0.12 },
  },

  /* --- bass ------------------------------------------------------- */
  bass_tri: {
    wave: 'triangle', sub: 0.35, gain: 0.13, a: 0.01, d: 0.5, s: 0.55, r: 0.2,
    filter: { type: 'lowpass', freq: 340, q: 0.8, env: 260, a: 0.03, d: 0.4, s: 0.4, r: 0.2 },
  },
  bass_saw: {
    wave: 'sawtooth', gain: 0.09, a: 0.008, d: 0.35, s: 0.45, r: 0.16,
    filter: { type: 'lowpass', freq: 260, q: 1.4, env: 900, a: 0.02, d: 0.28, s: 0.25, r: 0.15 },
  },
  bass_pulse: {
    wave: 'pulse', pw: 0.25, gain: 0.085, a: 0.006, d: 0.28, s: 0.3, r: 0.12,
    filter: { type: 'lowpass', freq: 420, q: 1.6, env: 700, a: 0.01, d: 0.2, s: 0.2, r: 0.12 },
  },
  bass_round: {
    wave: 'sine', sub: 0.25, gain: 0.16, a: 0.014, d: 0.6, s: 0.5, r: 0.25,
    filter: { type: 'lowpass', freq: 300, q: 0.6 },
  },
  sub: {
    wave: 'sine', gain: 0.17, a: 0.012, d: 0.5, s: 0.4, r: 0.3,
  },

  /* --- percussion -------------------------------------------------- */
  kick: {
    wave: 'sine', gain: 0.3, a: 0.002, d: 0.24, s: 0, freq: 110,
    freqAt: [[0.012, 62], [0.09, 42]],
  },
  kick_soft: {
    wave: 'sine', gain: 0.17, a: 0.004, d: 0.3, s: 0, freq: 90,
    freqAt: [[0.02, 55], [0.14, 40]],
    send: { reverb: 0.18 },
  },
  tom: {
    wave: 'triangle', gain: 0.16, a: 0.003, d: 0.3, s: 0, freq: 180,
    freqAt: [[0.02, 120], [0.16, 90]],
    filter: { type: 'lowpass', freq: 900, q: 1.0 },
    send: { reverb: 0.2 },
  },
  timp: {
    wave: 'sine', gain: 0.22, a: 0.004, d: 0.9, s: 0, freq: 98,
    freqAt: [[0.03, 74], [0.5, 60]],
    send: { reverb: 0.5 },
  },
  snare_brush: {
    wave: 'noise', gain: 0.055, a: 0.003, d: 0.16, s: 0, rate: 1,
    filter: { type: 'bandpass', freq: 2100, q: 0.9, env: 1200, a: 0.004, d: 0.1 },
    send: { reverb: 0.22 },
  },
  rim: {
    wave: 'noise', gain: 0.05, a: 0.001, d: 0.05, s: 0, rate: 1.6,
    filter: { type: 'bandpass', freq: 2600, q: 3.5 },
    send: { reverb: 0.18, delay: 0.1 },
  },
  shaker: {
    wave: 'noise', gain: 0.03, a: 0.002, d: 0.06, s: 0, rate: 1.9,
    hp: 5200,
  },
  hat: {
    wave: 'noise', gain: 0.028, a: 0.001, d: 0.035, s: 0, rate: 2.4,
    hp: 7000,
  },
  clave: {
    wave: 'sine', gain: 0.09, a: 0.001, d: 0.07, s: 0, freq: 1180,
    send: { reverb: 0.2, delay: 0.16 },
  },
  woodblock: {
    wave: 'triangle', gain: 0.08, a: 0.001, d: 0.1, s: 0, freq: 780,
    filter: { type: 'bandpass', freq: 1400, q: 4 },
    send: { reverb: 0.15 },
  },
  crackle: {
    wave: 'noise', gain: 0.035, a: 0.0008, d: 0.035, s: 0, rate: 1.3,
    filter: { type: 'bandpass', freq: 1800, q: 2.2 },
    send: { reverb: 0.3 },
  },
  drip: {
    wave: 'sine', gain: 0.045, a: 0.001, d: 0.09, s: 0, freq: 1500,
    freqAt: [[0.06, 700]],
    send: { reverb: 0.4, delay: 0.2 },
  },
  swellnoise: {
    wave: 'pink', gain: 0.05, a: 0.5, d: 0.6, s: 0, rate: 1,
    filter: { type: 'highpass', freq: 900, q: 0.7 },
    send: { reverb: 0.4 },
  },
};

/* ------------------------------------------------------------------ */
/* composing helpers                                                   */
/* ------------------------------------------------------------------ */

function E(out, patch, t, midi, dur, vel, extra) {
  out.push({ t, dur, patch, midi, vel: vel == null ? 1 : vel, extra: extra || null });
  return t + dur;
}

/** A block chord. `strum` staggers the notes by that many beats. */
function chord(out, patch, t, midis, dur, vel, extra, strum) {
  for (let i = 0; i < midis.length; i++) {
    E(out, patch, t + (strum || 0) * i, midis[i], dur - (strum || 0) * i, vel, extra);
  }
}

/** A sequential melody: seq = [[midi|null, durBeats, vel?], ...]. */
function line(out, patch, t, seq, vel, extra) {
  let at = t;
  for (const item of seq) {
    const [midi, dur, v] = item;
    if (midi != null) E(out, patch, at, midi, dur, (v == null ? 1 : v) * (vel == null ? 1 : vel), extra);
    at += dur;
  }
  return at;
}

/** Cycle a chord as an arpeggio of `count` notes of `step` beats. */
function arp(out, patch, t, midis, step, count, vel, extra, dir) {
  for (let i = 0; i < count; i++) {
    let idx = i % midis.length;
    if (dir === 'down') idx = midis.length - 1 - idx;
    else if (dir === 'updown') {
      const period = midis.length * 2 - 2;
      const k = i % period;
      idx = k < midis.length ? k : period - k;
    }
    E(out, patch, t + i * step, midis[idx], step * 0.95, vel, extra);
  }
}

/** Repeat a single note n times (ostinati, tremolo, hats). */
function rep(out, patch, t, midi, step, count, dur, vel, extra) {
  for (let i = 0; i < count; i++) E(out, patch, t + i * step, midi, dur == null ? step * 0.9 : dur, vel, extra);
}

/* ------------------------------------------------------------------ */
/* the fourteen tracks                                                 */
/* ------------------------------------------------------------------ */

const BUILDERS = {

  /* ================================================================
   * theme_title — A minor, 68 bpm, 8 bars.
   * Slow, wide, hopeful-lonely. States MOTIF.NORTH plainly in bars
   * 1-2, answers it in 3-4, and lifts it an octave in bars 5-6 over
   * the only major-V in the score.
   * ================================================================ */
  theme_title() {
    const ev = [];
    const S = SCALES.minor, ROOT = N('A4');
    const bar = 4;
    const B = (i) => i * bar;

    // pad — one chord per bar
    const chords = [
      [N('A3'), N('C4'), N('E4')],           // Am
      [N('F3'), N('A3'), N('C4')],           // F
      [N('C4'), N('E4'), N('G4')],           // C
      [N('G3'), N('B3'), N('D4')],           // G
      [N('A3'), N('C4'), N('E4')],           // Am
      [N('F3'), N('A3'), N('C4')],           // F
      [N('D4'), N('F4'), N('A4')],           // Dm
      [N('E3'), N('G#3'), N('B3')],          // E  (the lift)
    ];
    for (let i = 0; i < 8; i++) chord(ev, 'pad', B(i), chords[i], 3.9, i < 4 ? 0.9 : 1.05, null, 0.02);
    for (let i = 0; i < 8; i++) chord(ev, 'strings', B(i), [chords[i][0] + 12, chords[i][2] + 12], 3.8, 0.5);

    // bass — root, then fifth
    const bass = [
      [N('A2'), N('E3')], [N('F2'), N('C3')], [N('C3'), N('G3')], [N('G2'), N('D3')],
      [N('A2'), N('E3')], [N('F2'), N('C3')], [N('D3'), N('A3')], [N('E2'), N('B2')],
    ];
    for (let i = 0; i < 8; i++) {
      E(ev, 'bass_tri', B(i), bass[i][0], 2.0, 1);
      E(ev, 'bass_tri', B(i) + 2, bass[i][1], 1.8, 0.8);
    }

    // low drone under the whole thing
    E(ev, 'drone', 0, N('A1'), 16, 0.8);
    E(ev, 'drone', 16, N('A1'), 16, 0.8);

    // THE melody — MOTIF.NORTH stated, answered, then lifted
    const A4 = ROOT;
    const d = (x) => deg(A4, S, x);
    line(ev, 'glass', B(0) + 0.5, [
      [d(0), 1.5], [d(4), 2],                    // A4  E5      (NORTH 0,4)
      [d(5), 3], [d(4), 1],                      // F5  E5      (NORTH 5,4)
      [d(4), 1.5], [d(2), 0.5], [d(3), 2],       // E5  C5  D5  (NORTH 2 + neighbour)
      [d(1), 3], [null, 1],                      // B4          (NORTH 1)
    ], 1.0);
    line(ev, 'glass', B(4) + 0, [
      [d(0), 1.5], [d(4), 1.5], [d(6), 1],       // A4  E5  G5
      [d(7), 2], [d(5), 2],                      // A5  F5   — the peak
      [d(4), 1.5], [d(3), 1.5], [d(2), 1],       // E5  D5  C5
      [d(1), 3], [null, 1],                      // B4  -> resolves to A on the loop
    ], 1.1);

    // sparse counter-plucks in the second half
    for (let i = 4; i < 8; i++) {
      arp(ev, 'pluck_soft', B(i) + 1, [chords[i][0] + 12, chords[i][1] + 12, chords[i][2] + 12], 0.5, 5, 0.45);
    }

    // a very soft heartbeat every two bars, and a distant wash
    for (let i = 0; i < 8; i += 2) E(ev, 'kick_soft', B(i), null, 0.5, 0.55);
    E(ev, 'wash', 0, N('A4'), 15, 0.35);
    E(ev, 'wash', 16, N('E4'), 15, 0.3);

    return {
      key: 'A minor', bpm: 68, beats: 32, swing: 0,
      fx: { delayTime: 0.882, delayFeedback: 0.36, delayLevel: 0.5, revDur: 3.2, revDecay: 2.2, revLevel: 1.0 },
      ev,
    };
  },

  /* ================================================================
   * trail_desert — D mixolydian, 96 bpm, 8 bars.
   * Dry, sparse, high plucks with air between them; MOTIF.WHEEL as
   * the rocking figure and a MOTIF.MILE answer at the top of bar 5.
   * ================================================================ */
  trail_desert() {
    const ev = [];
    const S = SCALES.mixolydian, R = N('D5');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const roots = [N('D2'), N('C2'), N('G2'), N('D2'), N('D2'), N('C2'), N('G2'), N('D2')];
    const chords = [
      [N('D4'), N('A4')], [N('C4'), N('G4')], [N('G3'), N('D4')], [N('D4'), N('A4')],
      [N('D4'), N('A4')], [N('C4'), N('G4')], [N('G3'), N('D4')], [N('D4'), N('F#4')],
    ];

    for (let i = 0; i < 8; i++) {
      // dry, quiet fifths — the heat haze
      chord(ev, 'pad', B(i), chords[i], 3.6, 0.62);
      // sparse bass: downbeat, then a late offbeat push
      E(ev, 'bass_saw', B(i), roots[i], 1.4, 1);
      if (i % 2 === 1) E(ev, 'bass_saw', B(i) + 3.5, roots[i] + 7, 0.5, 0.7);
    }

    // high plucks — WHEEL (0,4) rocked and displaced
    const w = motif('WHEEL', R, S);
    line(ev, 'pluck_hi', B(0), [[w[1], 0.5], [null, 1], [d(2), 0.5], [null, 2]], 0.9);
    line(ev, 'pluck_hi', B(1) + 0.5, [[d(0), 0.5], [null, 1.5], [d(1), 0.5], [null, 0.5], [d(3), 0.5]], 0.85);
    line(ev, 'pluck_hi', B(2), [[d(5), 0.5], [null, 2], [d(4), 0.5], [null, 1]], 0.9);
    line(ev, 'pluck_hi', B(3) + 1, [[d(2), 0.5], [null, 1.5], [d(0), 0.5], [null, 0.5]], 0.8);
    // bar 5: the MILE answer, high and bright
    const mile = motif('MILE', R, S);
    line(ev, 'pluck_hi', B(4), [[mile[0], 0.5], [mile[1], 0.5], [null, 1], [mile[2], 1], [null, 1]], 1.0);
    line(ev, 'pluck_hi', B(5) + 0.5, [[d(6), 0.5], [null, 1], [d(5), 0.5], [null, 1], [d(4), 0.5]], 0.85);
    line(ev, 'pluck_hi', B(6), [[d(4), 0.5], [null, 1.5], [d(3), 0.5], [null, 1], [d(1), 0.5]], 0.9);
    line(ev, 'pluck_hi', B(7), [[d(0), 1], [null, 2], [d(-3), 0.5], [null, 0.5]], 0.95);

    // percussion: dry rim on 2 and 4, a whisper of shaker
    for (let i = 0; i < 8; i++) {
      E(ev, 'rim', B(i) + 1, null, 0.2, 0.8);
      E(ev, 'rim', B(i) + 3, null, 0.2, 0.65);
      for (let k = 0; k < 8; k++) E(ev, 'shaker', B(i) + k * 0.5, null, 0.1, k % 2 ? 0.5 : 0.75);
      if (i % 4 === 0) E(ev, 'kick_soft', B(i), null, 0.4, 0.7);
    }

    return {
      key: 'D mixolydian', bpm: 96, beats: 32, swing: 0,
      fx: { delayTime: 0.9375, delayFeedback: 0.42, delayLevel: 0.42, revDur: 1.8, revDecay: 3.4, revLevel: 0.55 },
      ev,
    };
  },

  /* ================================================================
   * trail_sierra — E dorian, 76 bpm, 8 bars.
   * Grand and slow: an open-fifth drone (MOTIF.WHEEL held still),
   * glass arpeggios climbing, and NORTH stated very slowly up top.
   * ================================================================ */
  trail_sierra() {
    const ev = [];
    const S = SCALES.dorian, R = N('E5');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('E3'), N('G3'), N('B3'), N('E4')],      // Em
      [N('C3'), N('E3'), N('G3'), N('B3')],      // Cmaj7
      [N('G2'), N('D3'), N('G3'), N('B3')],      // G
      [N('D3'), N('A3'), N('D4'), N('F#4')],     // D
      [N('E3'), N('G3'), N('B3'), N('E4')],      // Em
      [N('A2'), N('E3'), N('G3'), N('C#4')],     // A (dorian's bright IV)
      [N('C3'), N('E3'), N('G3'), N('B3')],      // Cmaj7
      [N('B2'), N('F#3'), N('B3'), N('D4')],     // Bm
    ];

    // the drone: bare fifths, two bars at a time
    for (let i = 0; i < 8; i += 2) {
      E(ev, 'drone', B(i), N('E1'), 8, 0.9);
      E(ev, 'pad_glass', B(i), N('E3'), 7.8, 0.8);
      E(ev, 'pad_glass', B(i), N('B3'), 7.8, 0.7);
    }
    for (let i = 0; i < 8; i++) {
      chord(ev, 'pad', B(i), voic[i], 3.9, 0.85, null, 0.03);
      E(ev, 'bass_round', B(i), voic[i][0] - 12, 3.2, 0.9);
    }

    // slow four-note arpeggios, one bar each, alternating direction
    for (let i = 0; i < 8; i++) {
      const up = voic[i].map((m) => m + 12);
      arp(ev, 'glass', B(i), up, 0.5, 8, 0.42, null, i % 2 ? 'updown' : null);
    }

    // NORTH, very slow and high, over bars 5-8
    const nm = motif('NORTH', R, S);
    line(ev, 'bell', B(4), [
      [nm[0], 3], [nm[1], 1],
      [nm[2], 2], [nm[3], 2],
      [nm[4], 3], [nm[5], 1],
      [nm[6], 4],
    ], 0.75);

    // one deep timpani per phrase
    E(ev, 'timp', B(0), null, 1, 0.9);
    E(ev, 'timp', B(4), null, 1, 0.8);
    E(ev, 'timp', B(6) + 2, null, 1, 0.5);

    return {
      key: 'E dorian', bpm: 76, beats: 32, swing: 0,
      fx: { delayTime: 0.789, delayFeedback: 0.4, delayLevel: 0.45, revDur: 3.6, revDecay: 2.0, revLevel: 1.05 },
      ev,
    };
  },

  /* ================================================================
   * trail_forest — F lydian, 88 bpm with a gentle swing, 8 bars.
   * Warm and mossy: marimba on MOTIF.WHEEL, a walking woody bass,
   * brushes, and MILE turned into a lazy hook.
   * ================================================================ */
  trail_forest() {
    const ev = [];
    const S = SCALES.lydian, R = N('F4');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('F3'), N('A3'), N('C4'), N('E4')],    // Fmaj7
      [N('G3'), N('B3'), N('D4')],             // G  (lydian #4 in the bass line)
      [N('A3'), N('C4'), N('E4'), N('G4')],    // Am7
      [N('C4'), N('E4'), N('G4')],             // C
      [N('F3'), N('A3'), N('C4'), N('E4')],    // Fmaj7
      [N('G3'), N('B3'), N('D4')],             // G
      [N('D4'), N('F4'), N('A4')],             // Dm
      [N('C4'), N('E4'), N('G4'), N('B4')],    // Cmaj7
    ];
    const roots = [N('F2'), N('G2'), N('A2'), N('C3'), N('F2'), N('G2'), N('D3'), N('C3')];

    for (let i = 0; i < 8; i++) {
      chord(ev, 'pad', B(i), voic[i], 3.7, 0.7, null, 0.04);
      // woody walking bass: root, fifth, octave, approach
      E(ev, 'bass_tri', B(i), roots[i], 0.9, 1);
      E(ev, 'bass_tri', B(i) + 1.5, roots[i] + 7, 0.5, 0.7);
      E(ev, 'bass_tri', B(i) + 2.5, roots[i] + 12, 0.5, 0.75);
      E(ev, 'bass_tri', B(i) + 3.5, roots[(i + 1) % 8] - 2, 0.4, 0.55);
    }

    // marimba: WHEEL rocking, with the lydian #4 leaning in
    for (let i = 0; i < 8; i++) {
      const base = voic[i][0] + 12;
      E(ev, 'marimba', B(i) + 0, base, 0.5, 0.9);
      E(ev, 'marimba', B(i) + 0.5, base + 7, 0.5, 0.6);
      E(ev, 'marimba', B(i) + 1.5, base + 4, 0.5, 0.7);
      E(ev, 'marimba', B(i) + 2.5, base + 7, 0.5, 0.65);
      if (i % 2 === 1) E(ev, 'marimba', B(i) + 3.5, base + 11, 0.5, 0.55);
    }

    // the tune: MILE (0,3,7) opened out, then a lydian curl
    const ml = motif('MILE', R, S);
    line(ev, 'flute', B(0) + 1, [[ml[0], 1], [ml[1], 1], [ml[2], 2], [null, 1]], 0.8);
    line(ev, 'flute', B(2) + 1, [[d(5), 1], [d(4), 1], [d(3), 1.5], [d(2), 1.5], [null, 2]], 0.75);
    line(ev, 'flute', B(4) + 1, [[ml[0], 1], [ml[1], 1], [ml[2], 1.5], [d(8), 1.5], [null, 2]], 0.85);
    line(ev, 'flute', B(6) + 0.5, [[d(6), 1], [d(5), 1], [d(4), 1], [d(2), 1.5], [d(0), 2], [null, 1]], 0.8);

    // brushes with the swing
    for (let i = 0; i < 8; i++) {
      E(ev, 'kick_soft', B(i), null, 0.4, 0.8);
      E(ev, 'kick_soft', B(i) + 2.5, null, 0.4, 0.5);
      E(ev, 'snare_brush', B(i) + 1, null, 0.3, 0.7);
      E(ev, 'snare_brush', B(i) + 3, null, 0.3, 0.75);
      for (let k = 0; k < 8; k++) E(ev, 'shaker', B(i) + k * 0.5, null, 0.1, k % 2 ? 0.55 : 0.8);
    }

    return {
      key: 'F lydian', bpm: 88, beats: 32, swing: 0.09,
      fx: { delayTime: 0.511, delayFeedback: 0.3, delayLevel: 0.34, revDur: 2.2, revDecay: 2.6, revLevel: 0.8 },
      ev,
    };
  },

  /* ================================================================
   * trail_rain — C minor, 72 bpm, 8 bars.
   * Everything is under a blanket: filtered pads, a noise wash, drips
   * on the offbeats, and MOTIF.SNOW falling through the delay.
   * ================================================================ */
  trail_rain() {
    const ev = [];
    const S = SCALES.minor, R = N('C5');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('C3'), N('Eb3'), N('G3')],            // Cm
      [N('Ab2'), N('C3'), N('Eb3')],           // Ab
      [N('Eb3'), N('G3'), N('Bb3')],           // Eb
      [N('Bb2'), N('D3'), N('F3')],            // Bb
      [N('C3'), N('Eb3'), N('G3')],            // Cm
      [N('Ab2'), N('C3'), N('Eb3')],           // Ab
      [N('F3'), N('Ab3'), N('C4')],            // Fm
      [N('G2'), N('C3'), N('D3')],             // Gsus — never quite resolves
    ];
    for (let i = 0; i < 8; i++) {
      chord(ev, 'pad_dark', B(i), voic[i], 3.9, 0.95, null, 0.05);
      E(ev, 'bass_round', B(i), voic[i][0] - 12, 3.5, 0.85);
    }

    // the wash: one long filtered noise note per two bars
    for (let i = 0; i < 8; i += 2) E(ev, 'wash', B(i), N('C4') + (i % 4 ? 5 : 0), 7.6, 1.0);
    E(ev, 'drone', 0, N('C1'), 32, 0.7);

    // SNOW motif, dropped in twice, drenched in delay
    const sm = motif('SNOW', R, S);
    line(ev, 'pluck_soft', B(1) + 1, [[sm[0], 1], [sm[1], 1], [sm[2], 1.5], [sm[3], 2.5]], 0.8);
    line(ev, 'pluck_soft', B(5) + 1, [[sm[0] - 12, 1], [sm[1] - 12, 1], [sm[2] - 12, 1.5], [sm[3] - 12, 2.5]], 0.7);
    line(ev, 'flute', B(3), [[d(2), 2], [d(1), 1], [d(0), 3], [null, 2]], 0.55);

    // drips — deterministic, but irregular enough to feel like weather
    const rnd = lcg(9021);
    for (let i = 0; i < 46; i++) {
      const t = rnd() * 32;
      const p = rnd();
      E(ev, 'drip', Math.round(t * 4) / 4, N('C6') + Math.floor(rnd() * 9) - 4, 0.25, 0.35 + p * 0.4,
        { pan: rnd() * 1.6 - 0.8 });
    }
    // a soft pulse so it still walks
    for (let i = 0; i < 8; i++) {
      E(ev, 'kick_soft', B(i), null, 0.5, 0.6);
      E(ev, 'shaker', B(i) + 2, null, 0.1, 0.4);
    }

    return {
      key: 'C minor', bpm: 72, beats: 32, swing: 0,
      fx: { delayTime: 0.833, delayFeedback: 0.44, delayLevel: 0.5, delayDamp: 1400, revDur: 2.8, revDecay: 2.4, revLevel: 0.95 },
      ev,
    };
  },

  /* ================================================================
   * town — G major, 118 bpm, 8 bars.
   * Almost a folk tune: quarter-note walking bass, a fiddle-ish lead
   * that opens on MOTIF.MILE, claps on the backbeat.
   * ================================================================ */
  town() {
    const ev = [];
    const S = SCALES.major, R = N('G4');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('G3'), N('B3'), N('D4')], [N('E3'), N('G3'), N('B3')],
      [N('C4'), N('E4'), N('G4')], [N('D4'), N('F#4'), N('A4')],
      [N('G3'), N('B3'), N('D4')], [N('E3'), N('G3'), N('B3')],
      [N('C4'), N('E4'), N('G4')], [N('D3'), N('G3'), N('B3')],
    ];
    // walking bass — one note per beat, real voice leading into the next chord
    const walks = [
      [N('G2'), N('B2'), N('D3'), N('E3')],
      [N('E2'), N('G2'), N('B2'), N('C3')],
      [N('C3'), N('E3'), N('G3'), N('A3')],
      [N('D3'), N('F#3'), N('A3'), N('B3')],
      [N('G2'), N('B2'), N('D3'), N('E3')],
      [N('E2'), N('G2'), N('B2'), N('D3')],
      [N('C3'), N('D3'), N('E3'), N('F#3')],
      [N('D3'), N('A2'), N('B2'), N('D3')],
    ];
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 4; k++) E(ev, 'bass_tri', B(i) + k, walks[i][k], 0.85, k === 0 ? 1 : 0.8);
      // offbeat guitar comp
      for (let k = 0; k < 4; k++) chord(ev, 'guitar', B(i) + k + 0.5, voic[i], 0.45, k % 2 ? 0.55 : 0.75, null, 0.015);
    }

    // the tune
    const ml = motif('MILE', R, S);
    line(ev, 'harmonica', B(0), [
      [ml[0], 1], [ml[1], 0.5], [ml[2], 1.5], [d(6), 1],
      [d(7), 1.5], [d(6), 0.5], [d(4), 2],
    ], 1.0);
    line(ev, 'harmonica', B(2), [
      [d(4), 1], [d(5), 0.5], [d(6), 0.5], [d(7), 1], [d(6), 1],
      [d(4), 1.5], [d(2), 0.5], [d(0), 2],
    ], 0.95);
    line(ev, 'harmonica', B(4), [
      [ml[0], 1], [ml[1], 0.5], [ml[2], 1.5], [d(9), 1],
      [d(7), 1], [d(6), 1], [d(4), 2],
    ], 1.05);
    line(ev, 'harmonica', B(6), [
      [d(3), 1], [d(2), 1], [d(1), 1], [d(2), 1],
      [d(0), 2.5], [null, 1.5],
    ], 1.0);

    for (let i = 0; i < 8; i++) {
      E(ev, 'kick', B(i), null, 0.3, 0.85);
      E(ev, 'kick', B(i) + 2, null, 0.3, 0.7);
      E(ev, 'snare_brush', B(i) + 1, null, 0.25, 0.95);
      E(ev, 'snare_brush', B(i) + 3, null, 0.25, 1.0);
      for (let k = 0; k < 8; k++) E(ev, 'hat', B(i) + k * 0.5, null, 0.08, k % 2 ? 0.6 : 0.9);
      if (i === 7) { E(ev, 'snare_brush', B(i) + 3.5, null, 0.2, 0.8); E(ev, 'snare_brush', B(i) + 3.75, null, 0.2, 0.9); }
    }

    return {
      key: 'G major', bpm: 118, beats: 32, swing: 0.04,
      fx: { delayTime: 0.381, delayFeedback: 0.26, delayLevel: 0.3, revDur: 1.6, revDecay: 2.8, revLevel: 0.62 },
      ev,
    };
  },

  /* ================================================================
   * store — C major, 104 bpm, 4 bars.
   * Small and cosy. One harmonica phrase over a I-vi-IV-V7 loop,
   * thumbed bass, brush on 2 and 4. Short on purpose: it's a menu.
   * ================================================================ */
  store() {
    const ev = [];
    const S = SCALES.major, R = N('C5');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('C4'), N('E4'), N('G4')],
      [N('A3'), N('C4'), N('E4')],
      [N('F3'), N('A3'), N('C4')],
      [N('G3'), N('B3'), N('D4'), N('F4')],
    ];
    const roots = [N('C3'), N('A2'), N('F2'), N('G2')];
    for (let i = 0; i < 4; i++) {
      E(ev, 'bass_tri', B(i), roots[i], 1.4, 1);
      E(ev, 'bass_tri', B(i) + 2, roots[i] + 7, 0.9, 0.7);
      E(ev, 'bass_tri', B(i) + 3, roots[i] + 12, 0.6, 0.55);
      chord(ev, 'guitar', B(i) + 0.5, voic[i], 0.5, 0.7, null, 0.02);
      chord(ev, 'guitar', B(i) + 1.5, voic[i], 0.5, 0.5, null, 0.02);
      chord(ev, 'guitar', B(i) + 2.5, voic[i], 0.5, 0.65, null, 0.02);
      chord(ev, 'guitar', B(i) + 3.5, voic[i], 0.5, 0.45, null, 0.02);
      E(ev, 'pad', B(i), voic[i][0] - 12, 3.8, 0.5);
    }
    line(ev, 'harmonica', B(0) + 0.5, [
      [d(4), 0.5], [d(2), 0.5], [d(0), 1], [d(2), 1.5],
      [d(1), 0.5], [d(0), 1], [null, 1],
      [d(-1), 1], [d(0), 1], [d(2), 1], [d(4), 1],
      [d(3), 1.5], [d(1), 0.5], [d(0), 1.5], [null, 0.5],
    ], 1.0);
    for (let i = 0; i < 4; i++) {
      E(ev, 'kick_soft', B(i), null, 0.3, 0.8);
      E(ev, 'snare_brush', B(i) + 1, null, 0.22, 0.8);
      E(ev, 'snare_brush', B(i) + 3, null, 0.22, 0.85);
      for (let k = 0; k < 4; k++) E(ev, 'shaker', B(i) + k + 0.5, null, 0.1, 0.7);
    }
    return {
      key: 'C major', bpm: 104, beats: 16, swing: 0.06,
      fx: { delayTime: 0.433, delayFeedback: 0.22, delayLevel: 0.26, revDur: 1.2, revDecay: 3.0, revLevel: 0.5 },
      ev,
    };
  },

  /* ================================================================
   * danger — F phrygian, 132 bpm, 4 bars.
   * A tense eighth-note ostinato on WHEEL soured by the flat second,
   * a low pulse on the downbeats, and a SNOW-shaped cluster stab.
   * ================================================================ */
  danger() {
    const ev = [];
    const S = SCALES.phrygian, R = N('F4');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;

    // ostinato: F F Gb F | F Ab Gb F  (WHEEL, poisoned)
    const ost = [
      [0, 0, 1, 0, 0, 2, 1, 0],
      [0, 0, 1, 0, 4, 3, 1, 0],
      [0, 0, 1, 0, 0, 2, 1, 0],
      [0, 1, 0, 1, -3, 0, 1, 0],
    ];
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 8; k++) {
        E(ev, 'bass_pulse', B(i) + k * 0.5, deg(N('F2'), S, ost[i][k]), 0.42, k % 2 ? 0.75 : 1.0);
      }
      // low pulse
      E(ev, 'sub', B(i), N('F1'), 1.2, 1);
      E(ev, 'sub', B(i) + 2.5, N('F1'), 0.7, 0.7);
    }

    // dissonant held cluster — minor second, no third
    chord(ev, 'pad_dark', B(0), [N('F3'), N('Gb3'), N('C4')], 7.8, 0.9);
    chord(ev, 'pad_dark', B(2), [N('F3'), N('Gb3'), N('Db4')], 7.8, 1.0);

    // the SNOW stab, high and thin
    const sm = motif('SNOW', N('F5'), S);
    line(ev, 'pluck_hi', B(1) + 2, [[sm[0], 0.5], [sm[1], 0.5], [sm[2], 1]], 0.9);
    line(ev, 'pluck_hi', B(3) + 2, [[sm[0], 0.5], [sm[1], 0.5], [sm[2], 0.5], [sm[3], 0.5]], 1.0);

    for (let i = 0; i < 4; i++) {
      E(ev, 'kick', B(i), null, 0.3, 1.0);
      E(ev, 'kick', B(i) + 1.5, null, 0.3, 0.7);
      E(ev, 'rim', B(i) + 1, null, 0.15, 0.9);
      E(ev, 'rim', B(i) + 3, null, 0.15, 0.9);
      E(ev, 'hat', B(i) + 2.75, null, 0.06, 0.7);
      E(ev, 'hat', B(i) + 3.75, null, 0.06, 0.9);
      if (i === 3) E(ev, 'tom', B(i) + 3.5, null, 0.3, 0.9);
    }
    return {
      key: 'F phrygian', bpm: 132, beats: 16, swing: 0,
      fx: { delayTime: 0.341, delayFeedback: 0.34, delayLevel: 0.3, delayDamp: 1800, revDur: 1.4, revDecay: 3.6, revLevel: 0.55 },
      ev,
    };
  },

  /* ================================================================
   * night_camp — A minor, 54 bpm, 8 bars.
   * Nearly nothing: one Am(add9) breathing into Fmaj9, fire crackle,
   * and the first four notes of NORTH from a long way off.
   * ================================================================ */
  night_camp() {
    const ev = [];
    const S = SCALES.minor, R = N('A5');
    const B = (i) => i * 4;

    chord(ev, 'pad_glass', B(0), [N('A3'), N('C4'), N('E4'), N('B4')], 15.6, 1.0, null, 0.25);
    chord(ev, 'pad_glass', B(4), [N('F3'), N('A3'), N('C4'), N('G4')], 15.6, 0.95, null, 0.25);
    E(ev, 'drone', 0, N('A1'), 16, 0.55);
    E(ev, 'drone', 16, N('F1'), 16, 0.5);

    // the distant motif — halved NORTH, twice, very quiet
    const nm = motif('NORTH', R, S);
    line(ev, 'glass', B(1) + 2, [[nm[0], 2], [nm[1], 2], [nm[2], 3], [null, 1]], 0.45);
    line(ev, 'glass', B(5) + 2, [[nm[3], 2], [nm[4], 2], [nm[6], 4]], 0.4);

    // fire crackle — deterministic scatter
    const rnd = lcg(4471);
    for (let i = 0; i < 64; i++) {
      const t = rnd() * 32;
      E(ev, 'crackle', Math.round(t * 8) / 8, N('C6') + Math.floor(rnd() * 14) - 7, 0.1,
        0.3 + rnd() * 0.7, { pan: rnd() * 1.4 - 0.7 });
    }
    // low fire body
    E(ev, 'wash', 0, N('E3'), 15.5, 0.5);
    E(ev, 'wash', 16, N('E3'), 15.5, 0.5);

    return {
      key: 'A minor', bpm: 54, beats: 32, swing: 0,
      fx: { delayTime: 1.111, delayFeedback: 0.46, delayLevel: 0.55, revDur: 3.8, revDecay: 1.9, revLevel: 1.1 },
      ev,
    };
  },

  /* ================================================================
   * funeral — D minor, 48 bpm, 8 bars, three voices, no percussion.
   * Strict SATB-minus-tenor writing. The soprano line spells SNOW
   * across bars 5-8 (D - C - Bb - A) over a plagal sag.
   * ================================================================ */
  funeral() {
    const ev = [];
    const B = (i) => i * 4;
    const S = [N('D5'), N('D5'), N('D5'), N('C#5'), N('D5'), N('C5'), N('Bb4'), N('A4')];
    const A = [N('F4'), N('F4'), N('G4'), N('E4'), N('F4'), N('A4'), N('G4'), N('E4')];
    const Bs = [N('D3'), N('Bb2'), N('G2'), N('A2'), N('D3'), N('F2'), N('G2'), N('A2')];
    for (let i = 0; i < 8; i++) {
      E(ev, 'choir', B(i), S[i], 3.8, 1.0);
      E(ev, 'choir', B(i), A[i], 3.8, 0.85);
      E(ev, 'choir', B(i), Bs[i], 3.8, 0.9);
      E(ev, 'bass_round', B(i), Bs[i] - 12, 3.6, 0.7);
      // a slow bell tolling every other bar
      if (i % 2 === 0) E(ev, 'bell', B(i), N('D3'), 3, 0.55);
    }
    E(ev, 'pad_dark', 0, N('D2'), 16, 0.8);
    E(ev, 'pad_dark', 16, N('D2'), 16, 0.8);
    return {
      key: 'D minor', bpm: 48, beats: 32, swing: 0,
      fx: { delayTime: 1.25, delayFeedback: 0.3, delayLevel: 0.3, revDur: 4.0, revDecay: 1.8, revLevel: 1.15 },
      ev,
    };
  },

  /* ================================================================
   * victory — C major, 100 bpm, 4 bars.
   * MILE up the front, NORTH harmonised in thirds behind it, and a
   * plagal-then-authentic landing so the loop point feels resolved.
   * ================================================================ */
  victory() {
    const ev = [];
    const Sc = SCALES.major, R = N('C5');
    const d = (x) => deg(R, Sc, x);
    const B = (i) => i * 4;
    const voic = [
      [N('C4'), N('E4'), N('G4')],
      [N('F3'), N('A3'), N('C4')],
      [N('G3'), N('B3'), N('D4')],
      [N('C4'), N('E4'), N('G4'), N('C5')],
    ];
    const roots = [N('C2'), N('F2'), N('G2'), N('C2')];
    for (let i = 0; i < 4; i++) {
      chord(ev, 'brass', B(i), voic[i], 3.7, 0.75, null, 0.02);
      chord(ev, 'strings', B(i), voic[i].map((m) => m + 12), 3.8, 0.6);
      E(ev, 'bass_round', B(i), roots[i], 1.9, 1);
      E(ev, 'bass_round', B(i) + 2, roots[i] + 12, 1.6, 0.8);
      E(ev, 'timp', B(i), null, 1, 1.0);
      if (i === 3) { E(ev, 'timp', B(i) + 2, null, 1, 0.7); E(ev, 'timp', B(i) + 3, null, 1, 0.9); }
    }
    // the fanfare: MILE, then NORTH resolved
    const ml = motif('MILE', N('C4'), Sc);
    line(ev, 'brass', B(0), [[ml[0], 0.75], [ml[1], 0.75], [ml[2], 1.5], [null, 1]], 1.1);
    const nm = motif('NORTH', R, Sc);
    line(ev, 'brass', B(1) + 1, [
      [nm[0], 1], [nm[1], 1], [nm[2], 1],
      [nm[3], 1], [nm[4], 1], [nm[5], 1], [nm[6], 3],
    ], 1.15);
    // shimmer on top
    arp(ev, 'bell', B(3), [N('C6'), N('E6'), N('G6'), N('C7')], 0.25, 8, 0.4);
    E(ev, 'swellnoise', B(2) + 2, N('C6'), 2, 0.8);
    return {
      key: 'C major', bpm: 100, beats: 16, swing: 0,
      fx: { delayTime: 0.45, delayFeedback: 0.3, delayLevel: 0.34, revDur: 2.4, revDecay: 2.2, revLevel: 0.9 },
      ev,
    };
  },

  /* ================================================================
   * defeat — A minor, 58 bpm, 8 bars.
   * A chain of SNOW motifs falling through Am - G - F - Esus, which
   * never resolves; the loop just starts sinking again.
   * ================================================================ */
  defeat() {
    const ev = [];
    const S = SCALES.minor, R = N('A5');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('A3'), N('C4'), N('E4')], [N('G3'), N('B3'), N('D4')],
      [N('F3'), N('A3'), N('C4')], [N('E3'), N('A3'), N('B3')],
      [N('A3'), N('C4'), N('E4')], [N('G3'), N('B3'), N('D4')],
      [N('F3'), N('A3'), N('C4')], [N('E3'), N('A3'), N('B3')],
    ];
    const roots = [N('A2'), N('G2'), N('F2'), N('E2'), N('A2'), N('G2'), N('F2'), N('E2')];
    for (let i = 0; i < 8; i++) {
      chord(ev, 'pad_dark', B(i), voic[i], 3.9, i < 4 ? 1.0 : 0.7, null, 0.08);
      E(ev, 'bass_round', B(i), roots[i] - 12, 3.6, i < 4 ? 0.9 : 0.6);
    }
    // three descending SNOW chains, each starting lower and thinner
    const sm0 = motif('SNOW', R, S);
    line(ev, 'glass', B(0) + 1, [[sm0[0], 1.5], [sm0[1], 1.5], [sm0[2], 2], [sm0[3], 2]], 0.75);
    const sm1 = motif('SNOW', deg(R, S, -2), S);
    line(ev, 'glass', B(2) + 1, [[sm1[0], 1.5], [sm1[1], 1.5], [sm1[2], 2], [sm1[3], 3]], 0.6);
    const sm2 = motif('SNOW', deg(R, S, -5), S);
    line(ev, 'glass', B(5) + 1, [[sm2[0], 2], [sm2[1], 2], [sm2[2], 3], [sm2[3], 4]], 0.45);
    // one cold, distant thud per phrase
    E(ev, 'timp', B(0), null, 1, 0.55);
    E(ev, 'timp', B(4), null, 1, 0.4);
    E(ev, 'wash', 16, N('A4'), 15, 0.4);
    return {
      key: 'A minor', bpm: 58, beats: 32, swing: 0,
      fx: { delayTime: 1.034, delayFeedback: 0.4, delayLevel: 0.42, delayDamp: 1200, revDur: 3.4, revDecay: 2.0, revLevel: 1.0 },
      ev,
    };
  },

  /* ================================================================
   * forage — D major, 126 bpm, 4 bars.
   * Light and playful: staccato marimba on MILE, a bouncing octave
   * bass, woodblocks. Nothing lasts longer than an eighth note.
   * ================================================================ */
  forage() {
    const ev = [];
    const S = SCALES.major, R = N('D5');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const voic = [
      [N('D4'), N('F#4'), N('A4')], [N('B3'), N('D4'), N('F#4')],
      [N('G3'), N('B3'), N('D4')], [N('A3'), N('C#4'), N('E4')],
    ];
    const roots = [N('D2'), N('B1'), N('G1'), N('A1')];
    for (let i = 0; i < 4; i++) {
      // bouncing bass: root, octave, root, fifth
      E(ev, 'bass_pulse', B(i) + 0, roots[i], 0.4, 1);
      E(ev, 'bass_pulse', B(i) + 1, roots[i] + 12, 0.35, 0.7);
      E(ev, 'bass_pulse', B(i) + 2, roots[i], 0.4, 0.9);
      E(ev, 'bass_pulse', B(i) + 2.5, roots[i] + 7, 0.3, 0.6);
      E(ev, 'bass_pulse', B(i) + 3.5, roots[i] + 12, 0.3, 0.65);
      chord(ev, 'pluck', B(i) + 0.5, voic[i], 0.4, 0.55, null, 0.02);
      chord(ev, 'pluck', B(i) + 2.5, voic[i], 0.4, 0.45, null, 0.02);
    }
    const ml = motif('MILE', R, S);
    line(ev, 'marimba', B(0), [
      [ml[0], 0.5], [ml[1], 0.5], [ml[2], 0.5], [null, 0.5],
      [d(4), 0.5], [d(2), 0.5], [d(0), 1],
    ], 1.0);
    line(ev, 'marimba', B(1), [
      [d(1), 0.5], [d(3), 0.5], [d(5), 0.5], [null, 0.5],
      [d(4), 0.5], [d(3), 0.5], [d(1), 1],
    ], 0.9);
    line(ev, 'marimba', B(2), [
      [d(-1), 0.5], [d(1), 0.5], [d(4), 0.5], [null, 0.5],
      [d(3), 0.5], [d(1), 0.5], [d(-1), 1],
    ], 0.95);
    line(ev, 'marimba', B(3), [
      [d(0), 0.5], [d(2), 0.5], [d(4), 0.5], [d(6), 0.5],
      [d(7), 1], [null, 1],
    ], 1.05);
    for (let i = 0; i < 4; i++) {
      E(ev, 'kick', B(i), null, 0.25, 0.8);
      E(ev, 'kick', B(i) + 2, null, 0.25, 0.65);
      E(ev, 'woodblock', B(i) + 1, null, 0.15, 0.85);
      E(ev, 'woodblock', B(i) + 3, null, 0.15, 0.85);
      for (let k = 0; k < 8; k++) E(ev, 'shaker', B(i) + k * 0.5, null, 0.08, k % 2 ? 0.55 : 0.85);
    }
    return {
      key: 'D major', bpm: 126, beats: 16, swing: 0,
      fx: { delayTime: 0.357, delayFeedback: 0.24, delayLevel: 0.28, revDur: 1.3, revDecay: 3.2, revLevel: 0.5 },
      ev,
    };
  },

  /* ================================================================
   * ford — A minor, 140 bpm, 4 bars.
   * Urgent and wet: a 16th-note tremolo line (WHEEL, hammered), a
   * tremolo'd pad standing in for the water, driving toms.
   * ================================================================ */
  ford() {
    const ev = [];
    const S = SCALES.minor, R = N('A4');
    const d = (x) => deg(R, S, x);
    const B = (i) => i * 4;
    const roots = [N('A1'), N('D2'), N('E2'), N('A1')];
    const voic = [
      [N('A3'), N('C4'), N('E4')], [N('D3'), N('F3'), N('A3')],
      [N('E3'), N('G3'), N('B3')], [N('A3'), N('C4'), N('E4')],
    ];
    for (let i = 0; i < 4; i++) {
      // the water: a tremolo'd chord
      chord(ev, 'pad', B(i), voic[i], 3.8, 0.8, { trem: { rate: 11 + i, depth: 0.5 } });
      // sub pulse
      E(ev, 'sub', B(i), roots[i], 1.4, 1);
      E(ev, 'sub', B(i) + 2, roots[i], 0.8, 0.75);
      E(ev, 'bass_saw', B(i) + 3, roots[i] + 12, 0.4, 0.7);
      // 16th tremolo on WHEEL
      const w = [deg(N('A4'), S, 0), deg(N('A4'), S, 4)];
      for (let k = 0; k < 16; k++) {
        const m = (k % 8 < 4 ? w[0] : w[1]) + (i === 2 ? 2 : 0);
        E(ev, 'pluck_hi', B(i) + k * 0.25, m, 0.2, k % 4 === 0 ? 0.85 : 0.5);
      }
    }
    // a rising alarm figure at the end of each 2 bars
    line(ev, 'brass', B(1) + 3, [[d(0), 0.5], [d(2), 0.5]], 0.7);
    line(ev, 'brass', B(3) + 2.5, [[d(0), 0.5], [d(2), 0.5], [d(4), 0.5]], 0.85);
    for (let i = 0; i < 4; i++) {
      E(ev, 'kick', B(i), null, 0.25, 1);
      E(ev, 'kick', B(i) + 1.5, null, 0.25, 0.8);
      E(ev, 'kick', B(i) + 2.5, null, 0.25, 0.7);
      E(ev, 'tom', B(i) + 1, null, 0.25, 0.8);
      E(ev, 'tom', B(i) + 3, null, 0.25, 0.85);
      for (let k = 0; k < 8; k++) E(ev, 'hat', B(i) + k * 0.5, null, 0.06, k % 2 ? 0.5 : 0.85);
      if (i === 3) { E(ev, 'tom', B(i) + 3.5, null, 0.2, 0.9); E(ev, 'tom', B(i) + 3.75, null, 0.2, 1.0); }
    }
    return {
      key: 'A minor', bpm: 140, beats: 16, swing: 0,
      fx: { delayTime: 0.321, delayFeedback: 0.3, delayLevel: 0.26, revDur: 1.6, revDecay: 3.0, revLevel: 0.6 },
      ev,
    };
  },
};

export const TRACK_IDS = [
  'theme_title', 'trail_desert', 'trail_sierra', 'trail_forest', 'trail_rain',
  'town', 'store', 'danger', 'night_camp', 'funeral', 'victory', 'defeat',
  'forage', 'ford',
];

/* ------------------------------------------------------------------ */
/* baking                                                              */
/* ------------------------------------------------------------------ */

const BAKED = new Map();

/**
 * buildTrack(id) -> { id, key, bpm, beats, beatDur, loopDur, fx, events }
 * `events` are sorted by beat and carry fully-resolved synth params
 * (everything but the absolute `time`). Cached.
 */
export function buildTrack(id) {
  if (BAKED.has(id)) return BAKED.get(id);
  const build = BUILDERS[id];
  if (!build) return null;

  const spec = build();
  const beatDur = 60 / spec.bpm;
  const events = [];

  for (const e of spec.ev) {
    const patch = PATCHES[e.patch];
    if (!patch) continue;
    let t = e.t;
    // swing: push the offbeat eighths late
    if (spec.swing) {
      const frac = t - Math.floor(t);
      if (Math.abs(frac - 0.5) < 0.01) t += spec.swing;
    }
    const p = Object.assign({}, patch);
    if (e.extra) Object.assign(p, e.extra);
    if (e.midi != null) p.freq = mtof(e.midi);
    else if (patch.freq) p.freq = patch.freq;
    else p.freq = 220;
    p.gain = (patch.gain == null ? 0.1 : patch.gain) * e.vel;
    p.dur = Math.max(0.02, e.dur * beatDur);
    // percussive patches keep their own decay length
    events.push({ t, params: p });
  }
  events.sort((a, b) => a.t - b.t);

  const track = {
    id,
    key: spec.key,
    bpm: spec.bpm,
    beats: spec.beats,
    beatDur,
    loopDur: spec.beats * beatDur,
    swing: spec.swing,
    fx: spec.fx || {},
    events,
  };
  BAKED.set(id, track);
  return track;
}

export function trackInfo(id) {
  const t = buildTrack(id);
  if (!t) return null;
  return { id: t.id, key: t.key, bpm: t.bpm, beats: t.beats, loopDur: t.loopDur, notes: t.events.length };
}
