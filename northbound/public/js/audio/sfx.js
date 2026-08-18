/* =====================================================================
 * NORTHBOUND — sfx.js
 * ---------------------------------------------------------------------
 * Every sound effect in the spec, individually designed. Nothing is a
 * recycled click: each one is its own little patch sheet.
 *
 * A design is `(eng, o) => void` where
 *   eng  is the synth engine from synth.js
 *   o    is { t: absolute start time, v: volume scale, rate: pitch scale,
 *             bus: the bus to play into }
 *
 * Rules of the house:
 *   - The ones that fire constantly (click, tick, footstep, select,
 *     shaker-ish UI) are under 90 ms, quiet, and rolled off up top so
 *     they never fatigue.
 *   - The rare, loud ones (thunder, fanfares, death_knell) get reverb
 *     and duck the music (see DUCK below).
 *   - The UI answers the score: `pickup`, `arrive` and `level_up` are
 *     MOTIF.MILE, `death_knell` and `sick` lean on MOTIF.SNOW.
 * ===================================================================== */

import { mtof } from './synth.js';
import { N, SCALES, motif } from './music.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export const SFX = {

  /* ---------------- UI ------------------------------------------- */

  // A 14 ms wooden tap. Deliberately dull — it fires hundreds of times.
  click(e, o) {
    e.play({ wave: 'triangle', freq: 1180 * o.rate, gain: 0.13 * o.v, a: 0.001, d: 0.035, s: 0,
      filter: { type: 'bandpass', freq: 1600, q: 3 } }, o.bus);
    e.play({ wave: 'noise', gain: 0.035 * o.v, a: 0.0008, d: 0.012, s: 0, hp: 3000, rate: 2 }, o.bus);
  },

  // Two-tone fall — the sound of stepping back out of a menu.
  back(e, o) {
    e.play({ wave: 'pulse', pw: 0.4, freq: 660 * o.rate, gain: 0.075 * o.v, a: 0.002, d: 0.07, s: 0,
      filter: { type: 'lowpass', freq: 2200, q: 1 } }, o.bus);
    e.play({ time: o.t + 0.055, wave: 'pulse', pw: 0.4, freq: 494 * o.rate, gain: 0.07 * o.v,
      a: 0.002, d: 0.11, s: 0, filter: { type: 'lowpass', freq: 1800, q: 1 },
      send: { reverb: 0.12 } }, o.bus);
  },

  // Two-tone rise, a fourth apart — confirmation.
  select(e, o) {
    e.play({ wave: 'triangle', freq: 660 * o.rate, gain: 0.09 * o.v, a: 0.002, d: 0.06, s: 0 }, o.bus);
    e.play({ time: o.t + 0.05, wave: 'triangle', freq: 880 * o.rate, gain: 0.085 * o.v,
      a: 0.002, d: 0.12, s: 0, send: { reverb: 0.15, delay: 0.1 } }, o.bus);
  },

  // Warm major third + a paper-shuffle of noise: money changing hands.
  buy(e, o) {
    const b = mtof(N('C5')) * o.rate;
    e.play({ wave: 'soft', freq: b, gain: 0.075 * o.v, a: 0.004, d: 0.2, s: 0.1, r: 0.15, dur: 0.1 }, o.bus);
    e.play({ time: o.t + 0.07, wave: 'soft', freq: b * 1.5, gain: 0.07 * o.v, a: 0.004, d: 0.3, s: 0.08,
      r: 0.2, dur: 0.12, send: { reverb: 0.2 } }, o.bus);
    e.play({ time: o.t + 0.02, wave: 'noise', gain: 0.03 * o.v, a: 0.01, d: 0.13, s: 0, hp: 2400, rate: 0.8 }, o.bus);
  },

  // Bright inharmonic ding-ding, with delay so it glitters.
  coin(e, o) {
    e.play({ wave: 'sine', freq: 1320 * o.rate, gain: 0.075 * o.v, a: 0.001, d: 0.14, s: 0,
      fm: { ratio: 2.76, index: 1.4, decay: 0.06 }, send: { delay: 0.25, reverb: 0.2 } }, o.bus);
    e.play({ time: o.t + 0.06, wave: 'sine', freq: 1976 * o.rate, gain: 0.06 * o.v, a: 0.001, d: 0.3, s: 0,
      fm: { ratio: 2.76, index: 1.1, decay: 0.1 }, send: { delay: 0.3, reverb: 0.25 } }, o.bus);
  },

  // A flat minor second, buzzed and pulled down. Unpleasant on purpose.
  error(e, o) {
    for (const f of [196, 208]) {
      e.play({ wave: 'pulse', pw: 0.5, freq: f * o.rate, gain: 0.06 * o.v, a: 0.003, d: 0.26, s: 0,
        freqAt: [[0.22, f * 0.86 * o.rate]],
        filter: { type: 'lowpass', freq: 1600, q: 2, env: -700, a: 0.02, d: 0.2 } }, o.bus);
    }
  },

  // Paper turning: two short filtered noise sweeps.
  page(e, o) {
    e.play({ wave: 'noise', gain: 0.045 * o.v, a: 0.006, d: 0.09, s: 0, rate: 1.4,
      filter: { type: 'bandpass', freq: 1400, q: 1.1, env: 2600, a: 0.03, d: 0.07 } }, o.bus);
    e.play({ time: o.t + 0.085, wave: 'noise', gain: 0.035 * o.v, a: 0.004, d: 0.07, s: 0, rate: 1.1,
      filter: { type: 'bandpass', freq: 2400, q: 1.4, env: -1200, a: 0.02, d: 0.06 } }, o.bus);
  },

  // Whoosh + an open fifth swelling: the map unfolds.
  map_open(e, o) {
    e.play({ wave: 'pink', gain: 0.07 * o.v, a: 0.14, d: 0.3, s: 0, rate: 1,
      filter: { type: 'bandpass', freq: 600, q: 0.9, env: 3200, a: 0.18, d: 0.25 },
      send: { reverb: 0.35 } }, o.bus);
    e.play({ time: o.t + 0.05, wave: 'soft', freq: mtof(N('C4')), gain: 0.05 * o.v, a: 0.18, d: 0.5,
      s: 0.25, r: 0.4, dur: 0.35, send: { reverb: 0.4 } }, o.bus);
    e.play({ time: o.t + 0.05, wave: 'soft', freq: mtof(N('G4')), gain: 0.045 * o.v, a: 0.22, d: 0.5,
      s: 0.22, r: 0.45, dur: 0.35, send: { reverb: 0.45 } }, o.bus);
  },

  // The quietest thing in the game. A clock, one pixel wide.
  tick(e, o) {
    e.play({ wave: 'sine', freq: 2400 * o.rate, gain: 0.035 * o.v, a: 0.0006, d: 0.016, s: 0 }, o.bus);
  },

  /* ---------------- the trail ------------------------------------ */

  // Boot on grit: a short lowpassed noise thud with a soft body.
  footstep(e, o) {
    const r = rnd(0.85, 1.2) * o.rate;
    e.play({ wave: 'noise', gain: 0.055 * o.v, a: 0.002, d: 0.055, s: 0, rate: r,
      filter: { type: 'lowpass', freq: 780 * r, q: 1.2, env: 600, a: 0.004, d: 0.05 } }, o.bus);
    e.play({ wave: 'sine', freq: 92 * r, gain: 0.05 * o.v, a: 0.002, d: 0.05, s: 0,
      freqAt: [[0.04, 62 * r]] }, o.bus);
  },

  // Dry timber under load: a detuned saw pair bent slowly through a
  // narrow bandpass. Quiet, so it can sit under everything.
  cart_creak(e, o) {
    const f = rnd(105, 145) * o.rate;
    e.play({ wave: 'sawtooth', freq: f, gain: 0.045 * o.v, a: 0.06, d: 0.5, s: 0.35, r: 0.25, dur: 0.4,
      freqAt: [[0.5, f * 1.22]],
      vib: { rate: 7.5, depth: 40 },
      filter: { type: 'bandpass', freq: 900, q: 6, env: 500, a: 0.2, d: 0.4, s: 0.4, r: 0.3 },
      send: { reverb: 0.2 } }, o.bus);
    e.play({ time: o.t + 0.3, wave: 'noise', gain: 0.02 * o.v, a: 0.04, d: 0.2, s: 0, rate: 0.6,
      filter: { type: 'bandpass', freq: 1600, q: 5 } }, o.bus);
  },

  // Hee-haw: a hard-driven saw with a formant sweep and a real contour.
  mule_bray(e, o) {
    const f = 150 * o.rate;
    e.play({ wave: 'sawtooth', freq: f, gain: 0.1 * o.v, a: 0.03, d: 0.55, s: 0.55, r: 0.2, dur: 0.5,
      freqAt: [[0.09, f * 1.55], [0.22, f * 1.42], [0.45, f * 0.72], [0.62, f * 0.6]],
      drive: 6, vib: { rate: 22, depth: 45, delay: 0.15 },
      filter: { type: 'bandpass', freq: 700, q: 2.6, env: 900, a: 0.08, d: 0.4, s: 0.4, r: 0.2 },
      send: { reverb: 0.35, delay: 0.1 } }, o.bus);
    e.play({ time: o.t + 0.03, wave: 'noise', gain: 0.03 * o.v, a: 0.03, d: 0.45, s: 0.3, r: 0.2, dur: 0.4,
      filter: { type: 'bandpass', freq: 2200, q: 1.6 } }, o.bus);
  },

  // Crack, then a long rolling rumble that sweeps darker as it goes.
  thunder(e, o) {
    e.play({ wave: 'noise', gain: 0.11 * o.v, a: 0.003, d: 0.22, s: 0, rate: 1.6,
      filter: { type: 'highpass', freq: 1200, q: 0.8 }, send: { reverb: 0.6 } }, o.bus);
    e.play({ wave: 'pink', gain: 0.16 * o.v, a: 0.12, d: 2.6, s: 0.5, r: 1.4, dur: 1.2, rate: 0.55,
      filter: { type: 'lowpass', freq: 380, q: 1.1, env: 900, a: 0.2, d: 1.8, s: 0.2, r: 1.2 },
      trem: { rate: 3.1, depth: 0.25 }, send: { reverb: 0.7 } }, o.bus);
    e.play({ time: o.t + 0.35, wave: 'sine', freq: 44, gain: 0.13 * o.v, a: 0.25, d: 1.6, s: 0.3,
      r: 1.0, dur: 0.9, freqAt: [[2.0, 32]] }, o.bus);
  },

  // The hiss arrives: a noise bed that swells and settles.
  rain_start(e, o) {
    e.play({ wave: 'pink', gain: 0.085 * o.v, a: 0.8, d: 0.9, s: 0.6, r: 1.1, dur: 1.4, rate: 1.3,
      filter: { type: 'bandpass', freq: 1800, q: 0.5, env: 2600, a: 1.0, d: 1.2, s: 0.5, r: 0.9 },
      send: { reverb: 0.3 } }, o.bus);
    e.play({ time: o.t + 0.2, wave: 'noise', gain: 0.035 * o.v, a: 0.6, d: 1.2, s: 0.5, r: 1.0, dur: 1.2,
      hp: 4200, rate: 1.1, pan: 0.4 }, o.bus);
  },

  // Ridge wind: bandpassed pink noise with the filter drifting.
  wind(e, o) {
    e.play({ wave: 'pink', gain: 0.09 * o.v, a: 1.1, d: 1.4, s: 0.65, r: 1.6, dur: 2.2, rate: 0.75,
      filter: { type: 'bandpass', freq: 520, q: 2.2, env: 1400, a: 1.4, d: 1.8, s: 0.35, r: 1.4 },
      trem: { rate: 0.33, depth: 0.35 }, pan: -0.3, send: { reverb: 0.4 } }, o.bus);
    e.play({ time: o.t + 0.4, wave: 'pink', gain: 0.05 * o.v, a: 1.3, d: 1.2, s: 0.5, r: 1.4, dur: 1.8,
      rate: 1.2, filter: { type: 'bandpass', freq: 1500, q: 1.4, env: -700, a: 1.0, d: 1.4, s: 0.4, r: 1.2 },
      trem: { rate: 0.21, depth: 0.4 }, pan: 0.35 }, o.bus);
  },

  // A boot going in: bright crack, then a pitched-down gulp.
  splash(e, o) {
    e.play({ wave: 'noise', gain: 0.09 * o.v, a: 0.002, d: 0.16, s: 0, rate: 1.5,
      filter: { type: 'highpass', freq: 900, q: 0.8, env: 4000, a: 0.01, d: 0.14 },
      send: { reverb: 0.3 } }, o.bus);
    e.play({ wave: 'sine', freq: 900 * o.rate, gain: 0.05 * o.v, a: 0.004, d: 0.18, s: 0,
      freqAt: [[0.12, 260 * o.rate]] }, o.bus);
    e.play({ time: o.t + 0.09, wave: 'pink', gain: 0.045 * o.v, a: 0.02, d: 0.35, s: 0, rate: 1.1,
      filter: { type: 'bandpass', freq: 1400, q: 0.9, env: -600, a: 0.05, d: 0.3 } }, o.bus);
  },

  // Standing at the bank: broadband water, gently breathing, stereo.
  river(e, o) {
    e.play({ wave: 'pink', gain: 0.075 * o.v, a: 0.7, d: 1.0, s: 0.75, r: 1.2, dur: 2.4, rate: 1.5,
      filter: { type: 'bandpass', freq: 1300, q: 0.6, env: 900, a: 1.2, d: 1.6, s: 0.5, r: 1.0 },
      trem: { rate: 1.7, depth: 0.18 }, pan: -0.25, send: { reverb: 0.25 } }, o.bus);
    e.play({ time: o.t + 0.15, wave: 'pink', gain: 0.055 * o.v, a: 0.9, d: 1.1, s: 0.7, r: 1.1, dur: 2.2,
      rate: 2.1, hp: 2600, trem: { rate: 2.6, depth: 0.22 }, pan: 0.3 }, o.bus);
  },

  // Three chirps up a small ladder, with delay so it sounds far off.
  bird(e, o) {
    const base = rnd(2100, 2700) * o.rate;
    for (let i = 0; i < 3; i++) {
      const f = base * (1 + i * 0.16);
      e.play({ time: o.t + i * 0.11, wave: 'sine', freq: f * 0.8, gain: 0.05 * o.v, a: 0.006, d: 0.07, s: 0,
        freqAt: [[0.03, f * 1.25], [0.07, f]],
        send: { reverb: 0.35, delay: 0.28 } }, o.bus);
    }
  },

  // Dry, fast, gated noise — a rattle, not a shaker.
  snake_rattle(e, o) {
    e.play({ wave: 'noise', gain: 0.075 * o.v, a: 0.03, d: 0.7, s: 0.65, r: 0.2, dur: 0.55, rate: 2.2,
      filter: { type: 'bandpass', freq: 4200, q: 2.2, env: 1800, a: 0.1, d: 0.5, s: 0.5, r: 0.2 },
      trem: { rate: 62, depth: 0.95, wave: 'square' } }, o.bus);
  },

  // Sub-heavy, distorted, slow. Ducks the music hard.
  bear_growl(e, o) {
    e.play({ wave: 'sawtooth', freq: 62 * o.rate, gain: 0.13 * o.v, a: 0.09, d: 0.9, s: 0.6, r: 0.4, dur: 0.8,
      freqAt: [[0.4, 74 * o.rate], [1.0, 52 * o.rate]],
      drive: 9, vib: { rate: 11, depth: 30 },
      filter: { type: 'lowpass', freq: 320, q: 3, env: 500, a: 0.2, d: 0.7, s: 0.4, r: 0.4 },
      send: { reverb: 0.35 } }, o.bus);
    e.play({ time: o.t + 0.05, wave: 'pink', gain: 0.05 * o.v, a: 0.12, d: 0.8, s: 0.45, r: 0.4, dur: 0.7,
      rate: 0.6, filter: { type: 'bandpass', freq: 700, q: 1.2 } }, o.bus);
  },

  /* ---------------- gameplay feedback ---------------------------- */

  // MOTIF.MILE, three quick bells. You picked something up.
  pickup(e, o) {
    const m = motif('MILE', N('C6'), SCALES.major);
    m.forEach((midi, i) => {
      e.play({ time: o.t + i * 0.055, wave: 'sine', freq: mtof(midi) * o.rate, gain: 0.06 * o.v,
        a: 0.002, d: 0.16 + i * 0.05, s: 0, fm: { ratio: 3.0, index: 0.7, decay: 0.05 },
        send: { reverb: 0.25, delay: 0.15 } }, o.bus);
    });
  },

  // Two soft bites, the second lower.
  chomp(e, o) {
    for (let i = 0; i < 2; i++) {
      const f = (420 - i * 90) * o.rate;
      e.play({ time: o.t + i * 0.1, wave: 'pulse', pw: 0.35, freq: f, gain: 0.055 * o.v,
        a: 0.003, d: 0.07, s: 0, freqAt: [[0.06, f * 0.55]],
        filter: { type: 'lowpass', freq: 1100, q: 2 } }, o.bus);
      e.play({ time: o.t + i * 0.1, wave: 'noise', gain: 0.03 * o.v, a: 0.002, d: 0.05, s: 0,
        rate: 1.2, filter: { type: 'bandpass', freq: 1800, q: 1.5 } }, o.bus);
    }
  },

  // Lub-dub. Pure sub with a fast pitch drop; nothing above 200 Hz.
  heartbeat(e, o) {
    for (const [dt, g] of [[0, 1], [0.19, 0.72]]) {
      e.play({ time: o.t + dt, wave: 'sine', freq: 92 * o.rate, gain: 0.17 * o.v * g,
        a: 0.006, d: 0.19, s: 0, freqAt: [[0.03, 58 * o.rate], [0.14, 42 * o.rate]],
        filter: { type: 'lowpass', freq: 220, q: 0.7 } }, o.bus);
    }
  },

  // A queasy, detuned sag — SNOW's first two steps, wobbled.
  sick(e, o) {
    const f = mtof(N('G3')) * o.rate;
    e.play({ wave: 'pulse', pw: 0.44, unison: 2, spread: 28, freq: f, gain: 0.06 * o.v,
      a: 0.03, d: 0.5, s: 0.3, r: 0.3, dur: 0.35,
      freqAt: [[0.25, f * 0.94], [0.55, f * 0.78]],
      vib: { rate: 6.5, depth: 60 },
      filter: { type: 'lowpass', freq: 900, q: 2.4, env: -400, a: 0.1, d: 0.45, s: 0.3, r: 0.3 },
      send: { reverb: 0.25 } }, o.bus);
    e.play({ time: o.t + 0.12, wave: 'noise', gain: 0.022 * o.v, a: 0.06, d: 0.4, s: 0, rate: 0.7,
      filter: { type: 'bandpass', freq: 500, q: 1.2 } }, o.bus);
  },

  // A low, inharmonic bell struck once and left to ring.
  death_knell(e, o) {
    const f = mtof(N('D2')) * o.rate;
    e.play({ wave: 'sine', freq: f, gain: 0.14 * o.v, a: 0.004, d: 3.2, s: 0.04, r: 2.0, dur: 0.4,
      fm: { ratio: 1.41, index: 3.2, decay: 0.9 }, send: { reverb: 0.75, delay: 0.15 } }, o.bus);
    e.play({ time: o.t + 0.01, wave: 'sine', freq: f * 2.76, gain: 0.05 * o.v, a: 0.003, d: 2.2, s: 0,
      send: { reverb: 0.6 } }, o.bus);
    e.play({ time: o.t + 1.4, wave: 'sine', freq: f * 0.5, gain: 0.09 * o.v, a: 0.02, d: 2.6, s: 0,
      send: { reverb: 0.5 } }, o.bus);
  },

  // Something breaks: a bright crack with a woody thud under it.
  snap(e, o) {
    e.play({ wave: 'noise', gain: 0.1 * o.v, a: 0.0008, d: 0.045, s: 0, rate: 2.4,
      filter: { type: 'highpass', freq: 2600, q: 1.2 }, send: { reverb: 0.2 } }, o.bus);
    e.play({ wave: 'triangle', freq: 520 * o.rate, gain: 0.07 * o.v, a: 0.001, d: 0.09, s: 0,
      freqAt: [[0.06, 190 * o.rate]], filter: { type: 'lowpass', freq: 1400, q: 1.6 } }, o.bus);
  },

  // Two strikes on a tent stake: attack noise + a resonant body.
  hammer(e, o) {
    for (let i = 0; i < 2; i++) {
      const t = o.t + i * 0.17;
      e.play({ time: t, wave: 'noise', gain: 0.07 * o.v * (1 - i * 0.2), a: 0.0008, d: 0.03, s: 0,
        rate: 1.8, filter: { type: 'highpass', freq: 1800 } }, o.bus);
      e.play({ time: t, wave: 'triangle', freq: 320 * o.rate, gain: 0.08 * o.v * (1 - i * 0.2),
        a: 0.001, d: 0.13, s: 0, freqAt: [[0.09, 240 * o.rate]],
        filter: { type: 'bandpass', freq: 620, q: 4 }, send: { reverb: 0.25 } }, o.bus);
    }
  },

  /* ---------------- stingers ------------------------------------- */

  // MILE, then NORTH's tail, in C major brass. The score's happy ending.
  win_fanfare(e, o) {
    const seq = [
      [N('C5'), 0.00, 0.16], [N('F5'), 0.16, 0.16], [N('C6'), 0.32, 0.34],
      [N('C6'), 0.72, 0.18], [N('G6'), 0.90, 0.18], [N('A6'), 1.08, 0.18],
      [N('G6'), 1.26, 0.18], [N('E6'), 1.44, 0.24], [N('D6'), 1.68, 0.18],
      [N('C6'), 1.86, 1.1],
    ];
    for (const [midi, dt, dur] of seq) {
      e.play({ time: o.t + dt, wave: 'sawtooth', unison: 2, spread: 12, freq: mtof(midi) * o.rate,
        gain: 0.075 * o.v, a: 0.02, d: 0.2, s: 0.6, r: 0.3, dur,
        filter: { type: 'lowpass', freq: 700, q: 1.4, env: 3000, a: 0.05, d: 0.3, s: 0.4, r: 0.25 },
        send: { reverb: 0.35, delay: 0.12 } }, o.bus);
    }
    for (const [midi, dt] of [[N('C3'), 0], [N('F3'), 0.72], [N('G3'), 1.44], [N('C3'), 1.86]]) {
      e.play({ time: o.t + dt, wave: 'sine', freq: mtof(midi), gain: 0.14 * o.v, a: 0.01, d: 0.5,
        s: 0.4, r: 0.3, dur: 0.5, sub: 0.4 }, o.bus);
      e.play({ time: o.t + dt, wave: 'sine', freq: 98, gain: 0.16 * o.v, a: 0.004, d: 0.6, s: 0,
        freqAt: [[0.04, 70], [0.4, 56]], send: { reverb: 0.4 } }, o.bus);
    }
    e.play({ time: o.t + 1.7, wave: 'noise', gain: 0.05 * o.v, a: 0.16, d: 1.2, s: 0, rate: 1,
      hp: 3000, send: { reverb: 0.6 } }, o.bus);
    for (let i = 0; i < 4; i++) {
      e.play({ time: o.t + 1.9 + i * 0.09, wave: 'sine', freq: mtof(N('C7') + i * 4), gain: 0.035 * o.v,
        a: 0.002, d: 0.7, s: 0, fm: { ratio: 1.41, index: 1.2, decay: 0.2 },
        send: { reverb: 0.5, delay: 0.3 } }, o.bus);
    }
  },

  // The same shape, minor, descending, and it stops mid-thought.
  lose_fanfare(e, o) {
    const seq = [
      [N('A4'), 0.0, 0.3], [N('G4'), 0.32, 0.3], [N('F4'), 0.64, 0.36],
      [N('E4'), 1.0, 0.9],
    ];
    for (const [midi, dt, dur] of seq) {
      e.play({ time: o.t + dt, wave: 'sawtooth', unison: 2, spread: 9, freq: mtof(midi) * o.rate,
        gain: 0.06 * o.v, a: 0.06, d: 0.4, s: 0.5, r: 0.5, dur,
        filter: { type: 'lowpass', freq: 500, q: 1.2, env: 900, a: 0.12, d: 0.5, s: 0.3, r: 0.4 },
        send: { reverb: 0.5, delay: 0.1 } }, o.bus);
      e.play({ time: o.t + dt, wave: 'soft', freq: mtof(midi - 12), gain: 0.05 * o.v, a: 0.1, d: 0.5,
        s: 0.45, r: 0.6, dur, send: { reverb: 0.55 } }, o.bus);
    }
    e.play({ time: o.t, wave: 'sine', freq: mtof(N('A1')), gain: 0.13 * o.v, a: 0.05, d: 1.6,
      s: 0.35, r: 1.0, dur: 1.4, send: { reverb: 0.4 } }, o.bus);
    e.play({ time: o.t + 1.0, wave: 'sine', freq: mtof(N('E2')), gain: 0.1 * o.v, a: 0.08, d: 1.8,
      s: 0.3, r: 1.2, dur: 1.0, send: { reverb: 0.5 } }, o.bus);
  },

  // MILE again, but arpeggiated up two octaves with a bell on top.
  level_up(e, o) {
    const notes = [N('C5'), N('E5'), N('G5'), N('C6'), N('E6'), N('G6')];
    notes.forEach((midi, i) => {
      e.play({ time: o.t + i * 0.06, wave: 'triangle', freq: mtof(midi) * o.rate, gain: 0.06 * o.v,
        a: 0.003, d: 0.22, s: 0.08, r: 0.2, dur: 0.06,
        filter: { type: 'lowpass', freq: 1800, q: 1.4, env: 2400, a: 0.006, d: 0.16, s: 0.2, r: 0.15 },
        send: { reverb: 0.3, delay: 0.2 } }, o.bus);
    });
    e.play({ time: o.t + 0.36, wave: 'sine', freq: mtof(N('C7')) * o.rate, gain: 0.05 * o.v,
      a: 0.003, d: 1.1, s: 0, fm: { ratio: 2.0, index: 1.0, decay: 0.25 },
      send: { reverb: 0.55, delay: 0.25 } }, o.bus);
  },

  // Warm MILE on a soft pad + bell: you reached a landmark.
  arrive(e, o) {
    const m = motif('MILE', N('F4'), SCALES.major);
    m.forEach((midi, i) => {
      e.play({ time: o.t + i * 0.13, wave: 'soft', freq: mtof(midi) * o.rate, gain: 0.06 * o.v,
        a: 0.04, d: 0.5, s: 0.35, r: 0.6, dur: 0.4,
        filter: { type: 'lowpass', freq: 1200, q: 0.9, env: 900, a: 0.08, d: 0.5, s: 0.35, r: 0.5 },
        send: { reverb: 0.5, delay: 0.15 } }, o.bus);
    });
    e.play({ time: o.t + 0.26, wave: 'sine', freq: mtof(N('F5')), gain: 0.055 * o.v, a: 0.004,
      d: 1.4, s: 0, fm: { ratio: 3.01, index: 0.9, decay: 0.3 }, send: { reverb: 0.6, delay: 0.25 } }, o.bus);
    e.play({ time: o.t, wave: 'sine', freq: mtof(N('F2')), gain: 0.09 * o.v, a: 0.03, d: 1.0,
      s: 0.2, r: 0.6, dur: 0.5 }, o.bus);
  },

  /* ---------------- ambience ------------------------------------- */

  // A fistful of tiny pops over a low hiss.
  campfire(e, o) {
    e.play({ wave: 'pink', gain: 0.045 * o.v, a: 0.5, d: 1.0, s: 0.6, r: 0.9, dur: 1.6, rate: 0.5,
      filter: { type: 'lowpass', freq: 900, q: 0.8 }, send: { reverb: 0.25 } }, o.bus);
    for (let i = 0; i < 14; i++) {
      e.play({ time: o.t + rnd(0.02, 2.0), wave: 'noise', gain: rnd(0.02, 0.06) * o.v,
        a: 0.0008, d: rnd(0.02, 0.06), s: 0, rate: rnd(0.8, 1.8),
        filter: { type: 'bandpass', freq: rnd(900, 3200), q: 2.4 },
        pan: rnd(-0.7, 0.7), send: { reverb: 0.3 } }, o.bus);
    }
  },

  // Snow doesn't make noise. This is the hush it makes instead.
  snowfall(e, o) {
    e.play({ wave: 'pink', gain: 0.05 * o.v, a: 1.2, d: 1.4, s: 0.5, r: 1.6, dur: 1.8, rate: 1.8,
      filter: { type: 'highpass', freq: 3000, q: 0.6 },
      trem: { rate: 0.4, depth: 0.3 }, send: { reverb: 0.5 } }, o.bus);
    e.play({ time: o.t + 0.4, wave: 'sine', freq: mtof(N('E6')), gain: 0.025 * o.v, a: 0.9, d: 1.4,
      s: 0.3, r: 1.2, dur: 1.0, send: { reverb: 0.6, delay: 0.3 } }, o.bus);
    e.play({ time: o.t + 0.9, wave: 'sine', freq: mtof(N('B6')), gain: 0.018 * o.v, a: 0.7, d: 1.2,
      s: 0.25, r: 1.0, dur: 0.8, send: { reverb: 0.6, delay: 0.35 } }, o.bus);
  },

  // Two fingers and a lot of air: up, then a fall.
  whistle(e, o) {
    const f = 1250 * o.rate;
    e.play({ wave: 'sine', freq: f * 0.75, gain: 0.055 * o.v, a: 0.05, d: 0.3, s: 0.55, r: 0.18, dur: 0.4,
      freqAt: [[0.09, f * 1.02], [0.3, f], [0.55, f * 0.72]],
      vib: { rate: 5.4, depth: 22, delay: 0.12 },
      send: { reverb: 0.4, delay: 0.22 } }, o.bus);
    e.play({ wave: 'noise', gain: 0.012 * o.v, a: 0.06, d: 0.4, s: 0.3, r: 0.2, dur: 0.35,
      rate: 1.6, filter: { type: 'bandpass', freq: f, q: 8 } }, o.bus);
  },
};

/**
 * How hard each SFX ducks the music, and for how long.
 * [amount 0..1, hold seconds, release seconds]
 */
export const DUCK = {
  thunder: [0.5, 0.9, 1.4],
  bear_growl: [0.45, 0.7, 0.9],
  death_knell: [0.55, 1.6, 1.8],
  win_fanfare: [0.6, 2.2, 1.2],
  lose_fanfare: [0.6, 1.8, 1.2],
  level_up: [0.3, 0.5, 0.7],
  arrive: [0.28, 0.6, 0.8],
  error: [0.22, 0.15, 0.35],
  mule_bray: [0.25, 0.5, 0.6],
  snake_rattle: [0.35, 0.6, 0.7],
  sick: [0.2, 0.4, 0.6],
};

export const SFX_IDS = Object.keys(SFX);
