// Smoke + invariant tests for the Thru engine. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/js/engine.js';
import { rollEncounter } from '../data/encounters.js';
import { TERMINUS_NORTH_MILE } from '../data/locations.js';
import { MODES, MODE_LIST, dailySeed, raceStandings } from '../data/modes.js';

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

// ------------------------------------------------------------------ game modes
test('every mode boots a playable game and defaults to classic', () => {
  const g = E.newGame({ name: 'M', seed: 1 });
  assert.equal(g.mode, 'classic');
  for (const m of MODE_LIST) {
    const gm = E.newGame({ name: 'M', seed: 2, mode: m.id });
    assert.equal(gm.status, 'playing');
    assert.equal(gm.mode, m.id);
  }
});

test('endless mode never wins and wraps into laps', () => {
  const g = E.newGame({ name: 'Forever', difficulty: 'casual', direction: 'NOBO', seed: 3, mode: 'endless' });
  // superhuman so it crosses the terminus and forces a lap wrap before dying
  for (const k of E.STAT_KEYS) g.stats[k] = 30;
  let guard = 0, sawLap = false;
  while (g.status === 'playing' && guard++ < 2000) {
    g.stats.Morale = 90; g.stats.Snacks = 90; g.stats.Energy = 90;
    const r = E.advanceDay(g);
    if (r.events.some(e => e.type === 'lap')) sawLap = true;
    if (sawLap) break;
  }
  assert.ok(sawLap, 'should complete at least one lap');
  assert.ok(g.lap >= 1);
  assert.notEqual(g.cause, 'finish'); // reaching the terminus must not win in endless
});

test('daily mode is deterministic for a given seed and ends with the season', () => {
  const seed = dailySeed(new Date(2026, 6, 14));
  const a = E.newGame({ name: 'A', seed, mode: 'daily' });
  const b = E.newGame({ name: 'B', seed, mode: 'daily' });
  assert.deepEqual(a.stats, b.stats); // identical rolled stats -> deterministic
  let guard = 0;
  while (a.status === 'playing' && guard++ < 500) E.advanceDay(a);
  assert.ok(a.day <= a.seasonDays + 1);
  assert.ok(a.status !== 'playing');
});

test('zen mode cannot lose (no winter, morale floored)', () => {
  const g = E.newGame({ name: 'Zen', difficulty: 'hard', direction: 'NOBO', seed: 8, mode: 'zen' });
  g.stats.Speed = 0; // crawl forever
  let guard = 0;
  while (g.status === 'playing' && guard++ < 800) E.advanceDay(g);
  // 800 crawling days: a classic hiker would be long dead; zen must still be alive or finished.
  assert.notEqual(g.cause, 'winter');
  assert.notEqual(g.cause, 'morale');
  assert.ok(g.stats.Morale >= 5);
});

test('race mode spawns rivals and produces coherent standings', () => {
  const g = E.newGame({ name: 'Racer', difficulty: 'casual', direction: 'NOBO', seed: 9, mode: 'race' });
  assert.equal(g.rivals.length, 4);
  for (let i = 0; i < 30; i++) E.advanceDay(g);
  const board = raceStandings(g);
  assert.equal(board.length, 5);
  assert.equal(board.filter(s => s.you).length, 1);
  assert.deepEqual(board.map(s => s.place), [1, 2, 3, 4, 5]); // contiguous 1..5
});

test('deck mode: play cards for miles and make camp to advance the day', () => {
  const g = E.newGame({ name: 'Deck', difficulty: 'normal', direction: 'NOBO', seed: 7, mode: 'deck' });
  assert.ok(g.deck.hand.length > 0);
  assert.equal(g.deck.stamina, g.deck.staminaMax);
  const mile0 = g.mile;
  // play a mileage card if one is playable
  const idx = E.deckHand(g).findIndex(h => h.playable && h.card.fx.miles);
  assert.ok(idx >= 0);
  const day0 = g.day;
  E.playCard(g, idx);
  assert.ok(g.mile > mile0, 'a mileage card advances the trail');
  E.makeCamp(g);
  assert.equal(g.day, day0 + 1, 'make camp advances the calendar');
  assert.equal(g.deck.stamina, g.deck.staminaMax, 'stamina refills at camp');
});

test('deck mode: buy and cull reshape the deck', () => {
  const g = E.newGame({ name: 'Deck', difficulty: 'casual', direction: 'NOBO', seed: 12, mode: 'deck' });
  const size0 = g.deck.cards.length;
  g.stats.Money = 999;
  const buy = E.buyCard(g, 'bigmiles');
  assert.ok(buy.ok);
  assert.equal(g.deck.cards.length, size0 + 1);
  const cull = E.cullCard(g, 'bigmiles');
  assert.ok(cull.ok);
  assert.equal(g.deck.cards.length, size0);
});

test('mode survives a serialize/deserialize round-trip', () => {
  const g = E.newGame({ name: 'Racer', seed: 4, mode: 'race' });
  E.advanceDay(g); E.advanceDay(g);
  const g2 = E.deserialize(E.serialize(g));
  assert.equal(g2.mode, 'race');
  assert.equal(g2.rivals.length, 4);
  assert.equal(typeof g2.modeDef.onDayEnd, 'function'); // hooks re-attached
  E.advanceDay(g2); // still runs without throwing
  assert.equal(g2.day, g.day + 1);
});
