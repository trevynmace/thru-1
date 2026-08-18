// NORTHBOUND — Oregon Trail parity.
//
// Northbound is a deliberate clone: the shape of the 1990 game's systems is a
// requirement, not a coincidence. These tests pin the parts that are easy to drift
// away from — the three-by-three pace/ration grid, the money-versus-score tradeoff on
// the occupation, hunting gated behind a consumable you buy at the store, the river
// crossing options, and what the final tally counts.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PACES, RATIONS, BALANCE, newGame, buy, getQty, setPace, setRations,
  applyForageResult, forageFuel, resolveFord, advanceDay,
} from '../public/js/engine/sim.js';
import { scoreGame, POINTS } from '../public/js/engine/score.js';
import { OCCUPATIONS } from '../data/party.js';
import { LANDMARKS } from '../data/trail.js';
import { stockFor } from '../data/store.js';
import { ITEMS_BY_ID } from '../data/items.js';

const fresh = (opts = {}) => newGame({ seed: 4242, occupation: 'ranger', month: 4, ...opts });

// --------------------------------------------------------------- setup ----

test('parity: an occupation trades starting money against the score multiplier', () => {
  assert.ok(OCCUPATIONS.length >= 3, 'Oregon Trail offers three; we offer at least that');
  const sorted = [...OCCUPATIONS].sort((a, b) => b.money - a.money);
  // The richest start must not also be the best-scoring one, or there is no choice.
  assert.ok(sorted[0].scoreMult <= sorted[sorted.length - 1].scoreMult,
    'the richest occupation should not also carry the best multiplier');
  assert.ok(sorted[sorted.length - 1].scoreMult > sorted[0].scoreMult,
    'the poorest occupation should be worth the most per point');
  for (const o of OCCUPATIONS) {
    assert.ok(o.money > 0 && Number.isFinite(o.money), `${o.id} money`);
    assert.ok(o.scoreMult > 0, `${o.id} scoreMult`);
  }
});

// ------------------------------------------------------- pace & rations ----

test('parity: three paces and three ration levels, at 3 / 2 / 1 lb a head', () => {
  assert.deepEqual(Object.keys(PACES), ['steady', 'strenuous', 'grueling']);
  assert.deepEqual(Object.keys(RATIONS), ['filling', 'meager', 'bare']);
  assert.equal(RATIONS.filling.lbPerDay, 3);
  assert.equal(RATIONS.meager.lbPerDay, 2);
  assert.equal(RATIONS.bare.lbPerDay, 1);
  // Faster paces are nominally faster and cost more health.
  assert.ok(PACES.strenuous.base > PACES.steady.base);
  assert.ok(PACES.grueling.base > PACES.strenuous.base);
  assert.ok(PACES.grueling.healthCost > PACES.strenuous.healthCost);
  assert.ok(PACES.strenuous.healthCost > PACES.steady.healthCost);
  // And thinner rations cost health, as they do in the original.
  assert.ok(RATIONS.bare.healthCost > RATIONS.meager.healthCost);
  assert.ok(RATIONS.meager.healthCost > RATIONS.filling.healthCost);
});

test('parity: rations set the daily food burn for the whole party', () => {
  for (const [id, def] of Object.entries(RATIONS)) {
    const g = fresh();
    g.supplies.food = 500;
    setPace(g, 'steady');
    setRations(g, id);
    const living = g.party.filter((m) => m.alive).length;
    const before = g.supplies.food;
    advanceDay(g);
    const eaten = before - g.supplies.food;
    assert.equal(Math.round(eaten), living * def.lbPerDay, `${id} burn rate`);
  }
});

// ------------------------------------------------------------- hunting ----

test('parity: foraging is gated behind a consumable, the way hunting needs bullets', () => {
  const g = fresh();
  g.supplies.stove_fuel = 2;

  const before = forageFuel(g);
  assert.equal(before.have, 2);
  assert.equal(before.enough, true);

  const withFuel = applyForageResult(g, 60);
  assert.equal(withFuel.usedFuel, true, 'a trip out spends fuel');
  assert.equal(getQty(g, 'stove_fuel'), 1, 'exactly one canister per trip');
  assert.ok(withFuel.lbs > 0);

  g.supplies.stove_fuel = 0;
  const without = applyForageResult(g, 60);
  assert.equal(without.rawOnly, true, 'no fuel is a real penalty, not a no-op');
  assert.ok(without.lbs < withFuel.lbs, `${without.lbs} should be less than ${withFuel.lbs}`);
  assert.ok(without.lbs > 0, 'but never a hard zero — you can still eat some of it raw');
});

test('parity: a forage haul is capped, the way you could only carry 100 lb back', () => {
  const g = fresh();
  g.supplies.stove_fuel = 5;
  const huge = applyForageResult(g, 5000);
  assert.ok(huge.lbs <= BALANCE.forageCapLb, `${huge.lbs} exceeds the ${BALANCE.forageCapLb} lb carry limit`);
});

test('parity: every store sells the hunting consumable', () => {
  const stores = LANDMARKS.filter((l) => l.store);
  assert.ok(stores.length >= 9);
  for (const lm of stores) {
    assert.ok(stockFor(lm).includes('stove_fuel'), `${lm.id} does not stock stove fuel`);
  }
});

test('parity: the outfitting store carries food, spares and clothing', () => {
  const campo = LANDMARKS.find((l) => l.id === 'campo');
  const stock = stockFor(campo);
  for (const id of ['food', 'spare_soles', 'spare_poles', 'spare_filter', 'spare_pack', 'clothing', 'stove_fuel']) {
    assert.ok(stock.includes(id), `the terminus outfitter should stock ${id}`);
    assert.ok(ITEMS_BY_ID[id], `${id} should be a real item`);
  }
});

// --------------------------------------------------------------- rivers ----

test('parity: a river offers ford / safer route / paid crossing / wait', () => {
  const fords = LANDMARKS.filter((l) => l.ford);
  assert.ok(fords.length >= 6, 'the trail needs real river crossings');

  for (const method of ['ford', 'rock-hop', 'raft', 'shuttle', 'wait']) {
    const g = fresh();
    g.supplies.money = 400;
    g.pendingFord = { ...fords[0].ford, landmarkId: fords[0].id, waited: 0 };
    const res = resolveFord(g, method, { success: true, severity: 0 });
    assert.equal(res.ok, true, `${method} should resolve`);
    assert.ok(Array.isArray(res.lines), `${method} should report what happened`);
  }
});

test('parity: waiting a day leaves you on the near bank with the water lower', () => {
  const fords = LANDMARKS.filter((l) => l.ford);
  const g = fresh();
  g.supplies.food = 400;
  g.pendingFord = { ...fords[0].ford, landmarkId: fords[0].id, waited: 0 };
  const day = g.day;
  resolveFord(g, 'wait', { success: true, severity: 0 });
  assert.ok(g.day > day, 'waiting costs a day');
  assert.ok(g.pendingFord, 'and the crossing is still ahead of you');
  assert.equal(g.pendingFord.waited, 1);
});

test('parity: paying for a crossing costs money and nothing else', () => {
  const fords = LANDMARKS.filter((l) => l.ford);
  const g = fresh();
  g.supplies.money = 400;
  g.pendingFord = { ...fords[0].ford, landmarkId: fords[0].id, waited: 0 };
  const before = g.supplies.money;
  const res = resolveFord(g, 'shuttle', { success: true, severity: 0 });
  assert.ok(g.supplies.money < before, 'a shuttle is not free');
  assert.equal(res.success, true);
  assert.equal(g.party.filter((m) => m.alive).length, 5, 'and nobody drowns paying for it');
});

// ---------------------------------------------------------------- score ----

test('parity: the tally counts crew by health, stock, supplies and cash', () => {
  const g = fresh();
  g.mile = 2650;
  g.status = 'won';
  g.supplies.food = 120;
  g.supplies.clothing = 3;
  g.supplies.stove_fuel = 2;
  g.supplies.spare_soles = 1;
  g.supplies.money = 300;

  const score = scoreGame(g);
  const labels = score.rows.map((r) => r.label.toLowerCase()).join(' | ');
  for (const want of ['crew', 'food', 'spare parts', 'clothing', 'stove fuel', 'gear condition', 'cash']) {
    assert.ok(labels.includes(want), `the tally should mention ${want} — got: ${labels}`);
  }
  assert.ok(score.total > 0);
  assert.ok(typeof score.rank === 'string' && score.rank.length > 0, 'and it ends in a rank');
  assert.ok(POINTS.perFuel > 0, 'leftover fuel is worth points, like leftover bullets');
});

test('parity: a healthier crew at the finish scores better', () => {
  const build = (health) => {
    const g = fresh();
    g.mile = 2650;
    g.status = 'won';
    for (const m of g.party) { m.alive = true; m.health = health; }
    return scoreGame(g).total;
  };
  assert.ok(build(95) > build(35), 'finishing in good health should beat limping in');
});

test('parity: the occupation multiplier is applied to the total', () => {
  const totals = OCCUPATIONS.map((o) => {
    const g = newGame({ seed: 7, occupation: o.id, month: 4 });
    g.mile = 2650;
    g.status = 'won';
    g.supplies.money = 0;          // remove the differing purse from the comparison
    return { id: o.id, mult: o.scoreMult, total: scoreGame(g).total };
  });
  const low = totals.reduce((a, b) => (a.mult < b.mult ? a : b));
  const high = totals.reduce((a, b) => (a.mult > b.mult ? a : b));
  assert.ok(high.total > low.total,
    `the higher multiplier (${high.id}) should out-score the lower (${low.id})`);
});

// The 1990 game does not hand you a card every other day. It gives you a stretch of
// road, then something happens. Without a floor under the gap, a per-day roll bunches
// into walk-two-days-read-a-card, and neither half gets room to land.
test('parity: the trail gives you a quiet stretch between interruptions', () => {
  const quiet = BALANCE.eventQuietDays;
  assert.ok(quiet >= 3, 'the quiet stretch should be at least three days');

  let events = 0;
  let violations = 0;
  const stopGaps = [];        // every interruption, of any kind — what a player feels

  for (let seed = 0; seed < 25; seed++) {
    const g = newGame({ seed: 900 + seed, occupation: 'ranger', month: 4 });
    buy(g, 'food', 300, 1);
    buy(g, 'stove_fuel', 8, 1);
    let lastStop = 0;
    let lastEvent = null;

    for (let d = 0; d < 90 && g.status === 'playing'; d++) {
      const rep = advanceDay(g);
      if (g.supplies.food < 90) buy(g, 'food', 120, 1);
      if (g.pendingFord) resolveFord(g, 'shuttle', { success: true, severity: 0, log: [] });
      if (!rep.event && !rep.arrived) continue;

      stopGaps.push(g.day - lastStop);
      lastStop = g.day;

      if (rep.event) {
        events++;
        // An event must never land inside the stretch owed by the last interruption,
        // whatever that interruption was — a town counts, and so does a river.
        if (lastEvent !== null && g.day - lastEvent < quiet) violations++;
        lastEvent = g.day;
      }
    }
  }

  assert.ok(events > 40, `expected a decent sample of events, got ${events}`);
  assert.equal(violations, 0, `${violations} events fired inside the ${quiet}-day quiet stretch`);

  // Arrivals interleave with events, so the number that matters is how often the game
  // stops you at all. Too tight and it is a ticker tape; too loose and it is a walk.
  const mean = stopGaps.reduce((a, b) => a + b, 0) / stopGaps.length;
  assert.ok(mean >= 2.5 && mean <= 7,
    `the trail interrupts every ${mean.toFixed(1)} days — outside the 2.5-7 day band`);
});

// An arrival is an interruption too, so a town must not be immediately followed by a
// card: walking into Idyllwild and being handed an event on the same breath is exactly
// the pile-up the quiet stretch exists to prevent.
test('parity: a landmark buys you the same quiet stretch an event does', () => {
  for (let seed = 0; seed < 25; seed++) {
    const g = newGame({ seed: 1300 + seed, occupation: 'ranger', month: 4 });
    buy(g, 'food', 300, 1);
    let arrivedDay = null;

    for (let d = 0; d < 90 && g.status === 'playing'; d++) {
      const rep = advanceDay(g);
      if (g.supplies.food < 90) buy(g, 'food', 120, 1);
      if (g.pendingFord) resolveFord(g, 'shuttle', { success: true, severity: 0, log: [] });
      if (rep.arrived) { arrivedDay = g.day; continue; }
      if (rep.event && arrivedDay !== null) {
        assert.ok(g.day - arrivedDay >= BALANCE.eventQuietDays,
          `an event fired ${g.day - arrivedDay} days after a landmark (seed ${1300 + seed})`);
      }
    }
  }
});
