// engine/rng.js — determinism, stream position, and the edge cases the sim relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, randInt, pick, weighted, chance, shuffle } from '../public/js/engine/rng.js';

test('makeRng is deterministic for a seed', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  const av = Array.from({ length: 500 }, () => a());
  const bv = Array.from({ length: 500 }, () => b());
  assert.deepEqual(av, bv);
});

test('different seeds produce different streams', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const av = Array.from({ length: 50 }, () => a());
  const bv = Array.from({ length: 50 }, () => b());
  assert.notDeepEqual(av, bv);
});

test('values stay in [0,1)', () => {
  const r = makeRng(777);
  for (let i = 0; i < 20000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('call counter tracks the stream position exactly', () => {
  const r = makeRng(99);
  assert.equal(r.calls, 0);
  r(); r(); r();
  assert.equal(r.calls, 3);
  randInt(r, 1, 6);
  assert.equal(r.calls, 4);
  pick(r, [1, 2, 3]);
  assert.equal(r.calls, 5);
  chance(r, 0.5);
  assert.equal(r.calls, 6);
  shuffle(r, [1, 2, 3, 4]);            // n-1 draws
  assert.equal(r.calls, 9);
  weighted(r, [1, 2], () => 1);
  assert.equal(r.calls, 10);
});

test('fast-forwarding by call count lands on the same stream position', () => {
  const a = makeRng(4242);
  for (let i = 0; i < 137; i++) a();
  const b = makeRng(4242, 137);
  assert.equal(b.calls, 137);
  assert.equal(a(), b());
  assert.equal(a(), b());
  assert.equal(a.calls, b.calls);
});

test('clone resumes from the current position without disturbing the original', () => {
  const a = makeRng(5);
  a.skip(20);
  const c = a.clone();
  const next = c();
  assert.equal(a(), next);
});

test('randInt is inclusive and covers both endpoints', () => {
  const r = makeRng(3);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = randInt(r, 1, 6);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 6, `bad ${v}`);
    seen.add(v);
  }
  assert.equal(seen.size, 6);
});

test('randInt tolerates reversed, equal, and non-integer bounds', () => {
  const r = makeRng(11);
  assert.equal(randInt(r, 5, 5), 5);
  for (let i = 0; i < 200; i++) {
    const v = randInt(r, 9, 2);
    assert.ok(v >= 2 && v <= 9);
  }
  for (let i = 0; i < 200; i++) {
    const v = randInt(r, 1.4, 3.9);
    assert.ok(Number.isInteger(v) && v >= 2 && v <= 3, `bad ${v}`);
  }
});

test('pick returns undefined for empty and non-array input', () => {
  const r = makeRng(1);
  assert.equal(pick(r, []), undefined);
  assert.equal(pick(r, null), undefined);
  assert.equal(pick(r, undefined), undefined);
});

test('pick reaches every element', () => {
  const r = makeRng(8);
  const arr = ['a', 'b', 'c', 'd'];
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pick(r, arr));
  assert.equal(seen.size, 4);
});

test('weighted respects weights and never returns a zero-weight item', () => {
  const r = makeRng(19);
  const arr = [{ id: 'never', w: 0 }, { id: 'rare', w: 1 }, { id: 'common', w: 99 }];
  const tally = { never: 0, rare: 0, common: 0 };
  for (let i = 0; i < 20000; i++) tally[weighted(r, arr, (x) => x.w).id]++;
  assert.equal(tally.never, 0);
  assert.ok(tally.common > tally.rare * 10, JSON.stringify(tally));
  assert.ok(tally.rare > 50, 'the rare option should still show up');
});

test('weighted handles all-zero, negative and NaN weights', () => {
  const r = makeRng(21);
  assert.equal(weighted(r, [1, 2, 3], () => 0), undefined);
  assert.equal(weighted(r, [1, 2, 3], () => -5), undefined);
  assert.equal(weighted(r, [1, 2, 3], () => NaN), undefined);
  assert.equal(weighted(r, [], () => 1), undefined);
  // one live option among dead ones
  assert.equal(weighted(r, ['x', 'y'], (v) => (v === 'y' ? 3 : 0)), 'y');
});

test('chance is calibrated and always consumes exactly one draw', () => {
  const r = makeRng(31);
  let hits = 0;
  for (let i = 0; i < 20000; i++) if (chance(r, 0.25)) hits++;
  assert.equal(r.calls, 20000);
  assert.ok(Math.abs(hits / 20000 - 0.25) < 0.02, `p=${hits / 20000}`);

  const r2 = makeRng(32);
  for (let i = 0; i < 100; i++) assert.equal(chance(r2, 0), false);
  for (let i = 0; i < 100; i++) assert.equal(chance(r2, 1), true);
  assert.equal(chance(r2, NaN), false);
  assert.equal(r2.calls, 201);
});

test('shuffle returns a new array, preserves multiset, and actually permutes', () => {
  const r = makeRng(41);
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(r, src);
  assert.notEqual(out, src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...out].sort((a, b) => a - b), src);

  let permuted = 0;
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(shuffle(r, src)) !== JSON.stringify(src)) permuted++;
  }
  assert.ok(permuted > 90, `shuffle looks stuck: ${permuted}/100`);
  assert.deepEqual(shuffle(r, []), []);
  assert.deepEqual(shuffle(r, null), []);
});
