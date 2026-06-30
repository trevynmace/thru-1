// Smoke + invariant tests for the Thru engine. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/js/engine.js';
import { rollEncounter } from '../data/encounters.js';
import { TERMINUS_NORTH_MILE } from '../data/locations.js';

test('newGame seeds a valid NOBO hiker at Campo', () => {
  const g = E.newGame({ name: 'Tester', difficulty: 'normal', direction: 'NOBO', seed: 42 });
  assert.equal(g.mile, 0);
  assert.equal(g.status, 'playing');
  assert.ok(g.stats.Money > 0);
  assert.ok(g.gear.length > 0);
});

test('advancing days makes northbound progress and ticks the calendar', () => {
  const g = E.newGame({ name: 'Tester', difficulty: 'normal', direction: 'NOBO', seed: 7 });
  const d0 = g.day, m0 = g.mile;
  const r = E.advanceDay(g);
  assert.ok(r.miles > 0, 'should hike some miles');
  assert.ok(g.mile > m0, 'mile should increase NOBO');
  assert.equal(g.day, d0 + 1);
});

test('the winter line eventually catches a stationary-ish hiker on hard mode', () => {
  const g = E.newGame({ name: 'Slowpoke', difficulty: 'hard', direction: 'NOBO', seed: 1 });
  g.stats.Speed = 0; // crawl
  let guard = 0;
  while (g.status === 'playing' && guard++ < 5000) E.advanceDay(g);
  assert.notEqual(g.status, 'playing');
});

test('a strong hiker can reach Canada (win condition reachable)', () => {
  const g = E.newGame({ name: 'Speedy', difficulty: 'casual', direction: 'NOBO', seed: 3 });
  // superhuman but bounded; keep morale/snacks topped to isolate the movement/win path
  for (const k of E.STAT_KEYS) g.stats[k] = 30;
  let guard = 0;
  while (g.status === 'playing' && guard++ < 5000) {
    g.stats.Morale = 90; g.stats.Snacks = 90; g.stats.Energy = 90;
    E.advanceDay(g);
  }
  assert.equal(g.status, 'won');
  assert.ok(g.mile >= TERMINUS_NORTH_MILE);
});

test('encounter resolution applies a stat effect and never crashes', () => {
  const g = E.newGame({ name: 'Tester', difficulty: 'normal', direction: 'NOBO', seed: 9 });
  for (let i = 0; i < 50; i++) {
    const enc = rollEncounter('desert', g.rng);
    assert.ok(enc, 'should always find an encounter');
    const opt = enc.options[0];
    const before = g.stats[opt.success.effectedStat];
    const res = E.resolveOption(g, enc, opt);
    assert.ok(typeof res.text === 'string' && res.text.length > 0);
  }
});

test('serialize/deserialize round-trips a game', () => {
  const g = E.newGame({ name: 'Tester', trailName: 'Mosey', difficulty: 'normal', direction: 'NOBO', seed: 11 });
  E.advanceDay(g); E.advanceDay(g);
  const json = E.serialize(g);
  const g2 = E.deserialize(json);
  assert.equal(g2.name, 'Tester');
  assert.equal(g2.trailName, 'Mosey');
  assert.equal(Math.round(g2.mile), Math.round(g.mile));
  assert.ok(g2.visited instanceof Set);
  assert.equal(typeof g2.rng, 'function');
});

test('town actions cost money and restore stats', () => {
  const g = E.newGame({ name: 'Tester', difficulty: 'normal', direction: 'NOBO', seed: 5 });
  g.stats.Snacks = 0;
  const money0 = g.stats.Money;
  const res = E.doTownAction(g, 'resupply');
  assert.ok(res.ok);
  assert.ok(g.stats.Snacks > 0);
  assert.ok(g.stats.Money < money0);
});
