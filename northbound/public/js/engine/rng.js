// NORTHBOUND — seeded random number generation.
//
// Every stochastic decision in the simulation draws from one of these helpers so a run
// is fully reproducible from `{ seed, rngCalls }`. The generator counts its own calls,
// which is what lets `serialize`/`deserialize` restore not just the seed but the exact
// position in the stream (see engine/sim.js).
//
// Pure logic: no DOM, no imports.

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * @param {number} seed         any integer; coerced to uint32
 * @param {number} [calls=0]    optional stream position to fast-forward to (additive
 *                              extra, the spec'd arity of 1 still works)
 * @returns {function(): number} rng() -> [0, 1), with `.calls`, `.seed`, `.clone()`,
 *                               `.skip(n)` attached.
 */
export function makeRng(seed, calls = 0) {
  let a = (seed >>> 0);
  const start = a;

  const rng = function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    rng.calls++;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  rng.calls = 0;
  rng.seed = start;
  /** Advance the stream by n draws without using the values. */
  rng.skip = (n) => { for (let i = 0; i < n; i++) rng(); return rng; };
  /** A second generator at the same position; drawing from it never affects this one. */
  rng.clone = () => makeRng(start, rng.calls);

  const fastForward = Math.max(0, Math.floor(Number(calls) || 0));
  if (fastForward > 0) rng.skip(fastForward);
  return rng;
}

/** Inclusive integer in [lo, hi]. Order-tolerant; returns lo when the range is empty. */
export function randInt(rng, lo, hi) {
  let a = Math.ceil(Number(lo));
  let b = Math.floor(Number(hi));
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = a;
  if (b < a) { const t = a; a = b; b = t; }
  return a + Math.floor(rng() * (b - a + 1));
}

/** Uniform element of `arr`. Returns undefined for an empty/invalid array. */
export function pick(rng, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Weighted pick. `weightFn(item, index)` should return a non-negative number;
 * negative/NaN weights are treated as 0. Returns undefined if every weight is 0.
 */
export function weighted(rng, arr, weightFn) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const w = new Array(arr.length);
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Number(weightFn ? weightFn(arr[i], i) : 1);
    w[i] = Number.isFinite(v) && v > 0 ? v : 0;
    total += w[i];
  }
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= w[i];
    if (r < 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/** True with probability p. p <= 0 never fires, p >= 1 always fires — and both still
 *  consume exactly one draw, so branching on difficulty never desyncs the stream. */
export function chance(rng, p) {
  const r = rng();
  const q = Number(p);
  if (!Number.isFinite(q)) return false;
  return r < q;
}

/** Fisher-Yates. Returns a NEW array; the input is not modified. */
export function shuffle(rng, arr) {
  const out = Array.isArray(arr) ? arr.slice() : [];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}
