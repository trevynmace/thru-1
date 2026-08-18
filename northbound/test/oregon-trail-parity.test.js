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

test('parity: the outfitting store carries food, stock, spares and clothing', () => {
  const campo = LANDMARKS.find((l) => l.id === 'campo');
  const stock = stockFor(campo);
  for (const id of ['food', 'mule', 'spare_wheel', 'spare_axle', 'spare_hitch', 'clothing', 'stove_fuel']) {
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
  g.supplies.mules = 4;
  g.supplies.food = 120;
  g.supplies.clothing = 3;
  g.supplies.stove_fuel = 2;
  g.supplies.spare_wheel = 1;
  g.supplies.money = 300;

  const score = scoreGame(g);
  const labels = score.rows.map((r) => r.label.toLowerCase()).join(' | ');
  for (const want of ['crew', 'mules', 'food', 'spare parts', 'clothing', 'stove fuel', 'cash']) {
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
