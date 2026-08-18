// engine/sim.js — the rules. Determinism, the food clock, the ailment lifecycle, death,
// the snow line, the cart, effects, and the promise that advanceDay never throws.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PACES, RATIONS, WEATHERS, BALANCE, DIFFICULTIES,
  newGame, startingKit, advanceDay, restDays, applyEffects, resolveChoice,
  resolveFord, applyForageResult, setPace, setRations, isOver, useItem,
  serialize, deserialize, livingParty, livingCount, meanHealth, recomputeLoad,
  cartCapacity, initialSnowMile, fordRisk, getQty, repairCart, snowpack,
} from '../public/js/engine/sim.js';
import { TOTAL_MILES, LANDMARKS, nextLandmark } from '../data/trail.js';
import { ITEMS, ITEMS_BY_ID, CART_PARTS } from '../data/items.js';
import { AILMENTS, AILMENTS_BY_ID } from '../data/ailments.js';
import { OCCUPATIONS } from '../data/party.js';

// ------------------------------------------------------------------ helpers

/** A game with a known, fully-stocked pack — the baseline for isolating one rule. */
function stocked(opts = {}) {
  const g = newGame({ seed: 1, leaderName: 'Wren', memberNames: ['Ada', 'Bo', 'Cass', 'Dov'], month: 4, ...opts });
  g.supplies.food = 1200;
  g.supplies.mules = 5;
  g.supplies.money = 400;
  for (const p of CART_PARTS) g.supplies[`spare_${p}`] = 2;
  recomputeLoad(g);
  return g;
}

/** A compact per-day fingerprint; two runs of the same seed must produce identical ones. */
function fingerprint(g) {
  return [
    g.day, g.mile, g.status, g.cause, Math.round(g.snowMile),
    g.weather.kind, g.weather.severity, g.weather.daysLeft,
    Math.round(g.supplies.food), g.supplies.money, g.supplies.mules,
    Math.round(g.cart.condition), g.cart.load, g.rng.calls, g.log.length,
    g.party.map((m) => `${m.alive ? 1 : 0}:${m.health}:${m.spirit}:${(m.ailments || []).map((a) => a.id + a.daysLeft).join('+')}`).join('/'),
  ].join('|');
}

function trace(g, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const rep = advanceDay(g);
    out.push(fingerprint(g) + '#' + rep.miles + ',' + rep.lines.length + ',' + rep.deaths.join('&'));
    if (rep.ended) break;
  }
  return out;
}

// ------------------------------------------------------------------ setup

test('newGame produces the exact state shape the save file and UI read', () => {
  const g = newGame({ seed: 7, leaderName: 'Wren', memberNames: ['Ada', 'Bo', 'Cass', 'Dov'], occupation: 'ranger', month: 4 });
  assert.equal(g.version, 1);
  assert.equal(g.seed, 7);
  assert.equal(typeof g.rngCalls, 'number');
  assert.equal(g.leader.name, 'Wren');
  assert.equal(g.leader.occupation, 'ranger');
  assert.equal(g.party.length, 5);
  assert.deepEqual(g.party.map((m) => m.name), ['Wren', 'Ada', 'Bo', 'Cass', 'Dov']);
  for (const m of g.party) {
    assert.equal(m.alive, true);
    assert.equal(m.health, 100);
    assert.deepEqual(m.ailments, []);
    assert.ok(m.spirit > 0 && m.spirit <= 100);
    assert.equal(typeof m.trailName, 'string');
    assert.ok(m.trailName.length > 0);
    for (const k of ['skin', 'hair', 'shirt']) assert.match(m.portrait[k], /^#[0-9a-fA-F]{6}$/);
    assert.equal(m.causeOfDeath, null);
  }
  assert.equal(g.day, 1);
  assert.equal(g.date.month, 4);
  assert.equal(g.mile, 0);
  assert.equal(g.pace, 'steady');
  assert.equal(g.rations, 'filling');
  assert.equal(g.status, 'playing');
  assert.equal(g.cause, null);
  assert.ok(WEATHERS.includes(g.weather.kind));
  assert.ok(g.snowMile > TOTAL_MILES, 'the snow line starts north of Canada');
  assert.equal(g.landmarkIndex, 0);
  assert.equal(g.pendingFord, null);
  assert.ok(Array.isArray(g.log));
  for (const k of ['milesHiked', 'daysOnTrail', 'eventsSurvived', 'fordsCrossed', 'lbsForaged', 'moneySpent']) {
    assert.equal(g.stats[k], 0, `stats.${k}`);
  }
  // Every item id has a supplies slot so the UI never renders undefined.
  for (const it of ITEMS) {
    const key = it.id === 'mule' ? 'mules' : it.id;
    assert.equal(typeof g.supplies[key], 'number', `supplies.${key}`);
  }
});

test('newGame fills missing member names and never leaves an empty crew name', () => {
  const g = newGame({ seed: 3, memberNames: ['Solo'] });
  assert.equal(g.party.length, 5);
  for (const m of g.party) assert.ok(m.name.trim().length > 0);
});

test('startingKit gives the occupation its money and an outfitting-ready empty pack', () => {
  for (const occ of OCCUPATIONS) {
    const kit = startingKit(occ.id);
    assert.equal(kit.money, occ.money);
    assert.equal(kit.supplies.food, 0, 'you must buy your own food');
    assert.equal(kit.supplies.mules, 0);
    assert.equal(kit.scoreMult, occ.scoreMult);
  }
  assert.ok(startingKit('not-a-real-occupation'), 'must not throw on a bad id');
});

test('difficulty scales starting money', () => {
  const easy = newGame({ seed: 1, occupation: 'ranger', difficulty: 'easy' });
  const hard = newGame({ seed: 1, occupation: 'ranger', difficulty: 'hard' });
  assert.ok(easy.supplies.money > hard.supplies.money);
});

// ------------------------------------------------------------------ determinism

test('the same seed produces an identical 200-day trace', () => {
  const a = stocked({ seed: 987654 });
  const b = stocked({ seed: 987654 });
  setPace(a, 'strenuous'); setPace(b, 'strenuous');
  const ta = trace(a, 200);
  const tb = trace(b, 200);
  assert.equal(ta.length, tb.length);
  for (let i = 0; i < ta.length; i++) assert.equal(ta[i], tb[i], `diverged on day ${i + 1}`);
  assert.ok(ta.length > 40, 'the trace should actually cover ground');
});

test('different seeds diverge', () => {
  const a = stocked({ seed: 11 });
  const b = stocked({ seed: 12 });
  assert.notDeepEqual(trace(a, 120), trace(b, 120));
});

test('a 200-day trace stays well-formed the whole way', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = stocked({ seed });
    setPace(g, 'strenuous');
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const rep = advanceDay(g);
      assert.ok(Array.isArray(rep.lines) && Array.isArray(rep.deaths) && Array.isArray(rep.onsets));
      assert.equal(typeof rep.miles, 'number');
      assert.ok(rep.miles >= 0 && rep.miles <= 40, `absurd day: ${rep.miles} miles`);
      assert.ok(g.mile >= last, 'the trail never runs backwards on a normal day');
      assert.ok(g.mile <= TOTAL_MILES);
      for (const m of g.party) {
        assert.ok(m.health >= 0 && m.health <= 100, `health ${m.health}`);
        assert.ok(m.spirit >= 0 && m.spirit <= 100, `spirit ${m.spirit}`);
      }
      assert.ok(g.cart.condition >= 0 && g.cart.condition <= 100);
      assert.ok(g.supplies.food >= 0 && g.supplies.money >= 0 && g.supplies.mules >= 0);
      assert.ok(['playing', 'won', 'lost'].includes(g.status));
      last = g.mile;
      if (rep.ended) break;
    }
  }
});

// ------------------------------------------------------------------ travel

test('travel clamps exactly at the next landmark and never skips one', () => {
  const g = stocked({ seed: 42 });
  setPace(g, 'grueling');
  const reached = [];
  for (let i = 0; i < 400 && g.status === 'playing'; i++) {
    const before = g.mile;
    const next = nextLandmark(before);
    const rep = advanceDay(g);
    if (next) assert.ok(g.mile <= next.mile, `overshot ${next.id}: ${before} -> ${g.mile}`);
    if (rep.arrived) {
      assert.equal(g.mile, rep.arrived.mile, 'arrival must land exactly on the landmark');
      assert.equal(g.atLandmark, rep.arrived.id);
      reached.push(rep.arrived.id);
    } else {
      assert.equal(g.atLandmark, null);
    }
  }
  const expected = LANDMARKS.slice(1, reached.length + 1).map((l) => l.id);
  assert.deepEqual(reached, expected, 'landmarks must be reached in order with none skipped');
});

test('faster paces cover more ground on the day, all else equal', () => {
  // Same seed, same starting state, one day each: the only difference is the pace.
  const oneDay = (pace) => {
    const g = stocked({ seed: 2024 });
    setPace(g, pace);
    advanceDay(g);
    return g.mile;
  };
  const s = oneDay('steady');
  const t = oneDay('strenuous');
  const u = oneDay('grueling');
  assert.ok(t > s, `strenuous ${t} !> steady ${s}`);
  assert.ok(u > t, `grueling ${u} !> strenuous ${t}`);
});

test('but grueling is a bad long-run trade: it burns the crew down', () => {
  // This is a designed property, not an accident. Over a long stretch the health cost
  // of grueling outweighs the extra miles, so a thinking player picks strenuous. If
  // this test starts failing, the balance table in sim.js needs re-measuring.
  const run = (pace) => {
    const g = stocked({ seed: 4242 });
    g.supplies.food = 4000;          // remove starvation as a confound
    recomputeLoad(g);
    setPace(g, pace);
    // Stop well short of the terminus so both runs are still in progress at the
    // comparison point — a finished run freezes its health and skews the result.
    for (let i = 0; i < 60 && g.status === 'playing'; i++) advanceDay(g);
    return { mile: g.mile, health: meanHealth(g), status: g.status };
  };
  const strenuous = run('strenuous');
  const grueling = run('grueling');
  assert.equal(strenuous.status, 'playing', 'the comparison run should still be going');
  assert.equal(grueling.status, 'playing', 'the comparison run should still be going');
  assert.ok(grueling.health < strenuous.health,
    `grueling health ${grueling.health} !< strenuous ${strenuous.health}`);
});

test('mules matter: no mules is markedly slower than a full string', () => {
  const dist = (mules) => {
    const g = stocked({ seed: 606 });
    g.supplies.mules = mules;
    setPace(g, 'steady');
    for (let i = 0; i < 30; i++) advanceDay(g);
    return g.mile;
  };
  assert.ok(dist(5) > dist(0) * 1.4, 'a mule string should be worth ~1.8x the bare haul');
});

test('a day never covers zero miles while anyone is walking', () => {
  const g = stocked({ seed: 5150 });
  g.supplies.mules = 0;
  g.cart.condition = 1;
  for (const m of g.party) m.health = 3;
  g.weather = { kind: 'snow', severity: 1, tempF: 10, daysLeft: 9 };
  const rep = advanceDay(g);
  assert.ok(rep.miles >= 1, 'miles are clamped to at least 1');
});

// ------------------------------------------------------------------ food & starvation

test('rations consume exactly livingCount x lbPerDay', () => {
  for (const [id, r] of Object.entries(RATIONS)) {
    const g = stocked({ seed: 5 });
    setRations(g, id);
    const before = g.supplies.food;
    advanceDay(g);
    assert.equal(before - g.supplies.food, livingCount(g) * r.lbPerDay, `rations ${id}`);
  }
});

test('a dead crew member stops eating', () => {
  const g = stocked({ seed: 6 });
  g.party[1].alive = false;
  g.party[2].alive = false;
  const before = g.supplies.food;
  advanceDay(g);
  assert.equal(before - g.supplies.food, 3 * RATIONS.filling.lbPerDay);
});

test('running out of food eats the remainder, then starves the crew hard', () => {
  const g = stocked({ seed: 7 });
  g.supplies.food = 4;               // less than 5 x 3 lb
  const rep = advanceDay(g);
  assert.equal(g.supplies.food, 0);
  assert.equal(g.starving, true);
  assert.ok(rep.lines.some((l) => /food bags are empty/i.test(l)));
  const h = meanHealth(g);
  assert.ok(h < 96, `starvation should bite immediately, health is ${h}`);
});

test('starvation kills the whole party and ends the run', () => {
  const g = stocked({ seed: 8 });
  g.supplies.food = 0;
  let ended = false;
  for (let i = 0; i < 90 && !ended; i++) ended = advanceDay(g).ended;
  assert.equal(g.status, 'lost');
  assert.equal(g.cause, 'party-wipe');
  assert.equal(livingCount(g), 0);
  for (const m of g.party) {
    assert.equal(m.alive, false);
    assert.equal(m.health, 0);
    assert.ok(m.causeOfDeath, 'every death records a cause');
    assert.ok(Number.isFinite(m.diedMile));
    assert.ok(m.diedDate && m.diedDate.month);
  }
  assert.ok(g.log.some((l) => l.kind === 'death'));
});

test('feeding the crew again clears the starving flag', () => {
  const g = stocked({ seed: 9 });
  g.supplies.food = 0;
  advanceDay(g);
  assert.equal(g.starving, true);
  g.supplies.food = 500;
  advanceDay(g);
  assert.equal(g.starving, false);
});

// ------------------------------------------------------------------ health & ailments

test('health settles at an equilibrium set by pace and rations, not a death slide', () => {
  const g = stocked({ seed: 1212 });
  setPace(g, 'steady');
  setRations(g, 'filling');
  for (const m of g.party) m.health = 40;
  for (let i = 0; i < 25; i++) advanceDay(g);
  assert.ok(meanHealth(g) > 60, `an easy regime should heal the crew, got ${meanHealth(g)}`);
});

test('grueling pace on bare rations grinds health down', () => {
  const g = stocked({ seed: 1313 });
  setPace(g, 'grueling');
  setRations(g, 'bare');
  const before = meanHealth(g);
  for (let i = 0; i < 20; i++) advanceDay(g);
  assert.ok(meanHealth(g) < before - 25, `expected a real decline, ${before} -> ${meanHealth(g)}`);
});

test('ailments tick down day by day and recover exactly on schedule', () => {
  const g = stocked({ seed: 21 });
  // Freeze the world so only the ailment clock moves.
  BALANCE_FREEZE(g);
  const def = AILMENTS_BY_ID.blisters;
  g.party[1].ailments = [{ id: def.id, daysLeft: 4 }];
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const rep = advanceDay(g);
    seen.push(g.party[1].ailments.map((a) => a.daysLeft).join(','));
    if (i < 3) assert.equal(rep.recoveries.includes(g.party[1].name), false, `recovered early on day ${i + 1}`);
    else assert.ok(rep.recoveries.includes(g.party[1].name), 'must recover on the last day');
  }
  assert.deepEqual(seen, ['3', '2', '1', '']);
  assert.deepEqual(g.party[1].ailments, []);
});

test('an ailment drains that member and only that member', () => {
  const g = stocked({ seed: 22 });
  BALANCE_FREEZE(g);
  for (const m of g.party) m.health = 60;
  const def = AILMENTS.find((a) => a.healthDrainPerDay >= 6);
  g.party[0].ailments = [{ id: def.id, daysLeft: 5 }];
  advanceDay(g);
  assert.ok(g.party[0].health < g.party[1].health - def.healthDrainPerDay / 2,
    `the sick member should be worse off: ${g.party[0].health} vs ${g.party[1].health}`);
});

test('ailments slow the whole party', () => {
  const g1 = stocked({ seed: 23 });
  const g2 = stocked({ seed: 23 });
  BALANCE_FREEZE(g1); BALANCE_FREEZE(g2);
  const slow = AILMENTS.slice().sort((a, b) => a.paceMult - b.paceMult)[0];
  g2.party[3].ailments = [{ id: slow.id, daysLeft: 20 }];
  advanceDay(g1); advanceDay(g2);
  assert.ok(g2.mile < g1.mile, `${slow.id} (paceMult ${slow.paceMult}) did not slow the crew`);
});

test('the same ailment is never stacked twice on one member', () => {
  const g = stocked({ seed: 24 });
  for (const m of g.party) m.health = 5;      // maximum onset pressure
  for (let i = 0; i < 60 && g.status === 'playing'; i++) {
    advanceDay(g);
    for (const m of g.party) {
      const ids = m.ailments.map((a) => a.id);
      assert.equal(new Set(ids).size, ids.length, `${m.name} has duplicate ailments: ${ids}`);
      for (const a of m.ailments) assert.ok(a.daysLeft > 0, 'expired ailments must be removed');
    }
  }
});

test('healthy crews get sick far less often than broken ones', () => {
  const count = (health) => {
    let onsets = 0;
    for (let seed = 0; seed < 12; seed++) {
      const g = stocked({ seed: 300 + seed });
      BALANCE_FREEZE(g);
      for (let i = 0; i < 40; i++) {
        for (const m of g.party) { m.health = health; m.ailments = []; }
        onsets += advanceDay(g).onsets.length;
      }
    }
    return onsets;
  };
  const healthy = count(100);
  const broken = count(10);
  assert.ok(broken > healthy * 2, `onset pressure is not health-driven: ${healthy} vs ${broken}`);
});

test('first aid consumes a kit, heals, and halves what it cures', () => {
  const g = stocked({ seed: 25 });
  g.supplies.first_aid = 2;
  const curable = AILMENTS.find((a) => a.curedBy.includes('first_aid'));
  g.party[2].health = 50;
  g.party[2].ailments = [{ id: curable.id, daysLeft: 8 }];
  const res = useItem(g, 'first_aid', 2);
  assert.equal(res.ok, true);
  assert.equal(g.supplies.first_aid, 1);
  assert.equal(g.party[2].ailments[0].daysLeft, 4);
  assert.ok(g.party[2].health > 50);

  assert.equal(useItem(g, 'first_aid', 99).ok, false, 'no such member');
  g.supplies.first_aid = 0;
  assert.equal(useItem(g, 'first_aid', 2).ok, false, 'none left');
  assert.equal(useItem(g, 'ice_axe', 2).ok, false, 'not a consumable');
  assert.equal(useItem(g, 'nonsense', 0).ok, false, 'not an item');
});

// ------------------------------------------------------------------ death

test('a member dying leaves a body, an epitaph and a morale hit', () => {
  const g = stocked({ seed: 26 });
  BALANCE_FREEZE(g);
  // Recovery is proportional to the health deficit, so a single bad day never kills
  // anyone. What kills people is an illness on top of empty food bags.
  g.supplies.food = 0;
  g.party[3].health = 1;
  g.party[3].ailments = [{ id: AILMENTS.find((a) => a.healthDrainPerDay > 8).id, daysLeft: 5 }];
  const spiritBefore = g.party[0].spirit;
  let rep = null;
  for (let i = 0; i < 5 && g.party[3].alive; i++) rep = advanceDay(g);
  assert.equal(g.party[3].alive, false);
  assert.ok(rep.deaths.includes(g.party[3].name));
  assert.equal(livingCount(g), 4);
  assert.ok(g.party[0].spirit < spiritBefore, 'the crew should take it hard');
  assert.ok(g.log.some((l) => l.kind === 'death' && /Cairn/i.test(l.text)), 'an epitaph is logged');
  assert.equal(g.status, 'playing', 'one death is not the end of the run');
});

test('a total party wipe ends the run and every later tick is a no-op', () => {
  const g = stocked({ seed: 27 });
  for (const m of g.party) m.health = 0.4;
  g.supplies.food = 0;
  for (let i = 0; i < 30 && g.status === 'playing'; i++) advanceDay(g);
  assert.equal(g.status, 'lost');
  assert.equal(g.cause, 'party-wipe');
  assert.equal(isOver(g), true);

  const snapshot = serialize(g);
  const rep = advanceDay(g);
  assert.equal(rep.ended, true);
  assert.equal(rep.miles, 0);
  assert.equal(serialize(g), snapshot, 'a finished game must not drift');
  assert.deepEqual(restDays(g, 5), { days: 0, lines: [], deaths: [], recoveries: [], ended: true });
});

// ------------------------------------------------------------------ snow line

test('the snow line is a calendar: later departures start with less slack', () => {
  const march = newGame({ seed: 1, month: 3 });
  const june = newGame({ seed: 1, month: 6 });
  assert.ok(march.snowMile > june.snowMile, 'March must buy a bigger head start');
  assert.ok(june.snowMile > TOTAL_MILES, 'even a June start begins with the line north of Canada');
  // Integrating from any date lands on the terminus on the same close date.
  const close = initialSnowMile({ year: 2026, month: BALANCE.snowCloseMonth, day: BALANCE.snowCloseDay - 1 });
  assert.ok(Math.abs(close - TOTAL_MILES - BALANCE.snowRateByMonth[BALANCE.snowCloseMonth]) < 1.5);
});

test('the snow line advances every day and catches a stalled crew', () => {
  const g = stocked({ seed: 28 });
  const before = g.snowMile;
  advanceDay(g);
  assert.ok(g.snowMile < before, 'the line must move south daily');

  g.snowMile = g.mile + 3;
  const rep = advanceDay(g);
  assert.equal(g.status, 'lost');
  assert.equal(g.cause, 'snowed-off');
  assert.equal(rep.ended, true);
  assert.ok(g.log.some((l) => l.kind === 'weather' && /passes close|snow line/i.test(l.text)));
});

test('resting also lets the snow line close in', () => {
  const g = stocked({ seed: 29 });
  const before = g.snowMile;
  restDays(g, 5);
  assert.ok(g.snowMile < before - 10, 'zeroes are not free');
  assert.equal(g.mile, 0);
  assert.equal(g.day, 6);
});

test('the snow line can end a run during a rest', () => {
  const g = stocked({ seed: 30 });
  g.snowMile = g.mile + 2;
  const out = restDays(g, 4);
  assert.equal(g.status, 'lost');
  assert.equal(g.cause, 'snowed-off');
  assert.equal(out.ended, true);
  assert.ok(out.days < 4, 'the rest is cut short by the loss');
});

// ------------------------------------------------------------------ resting

test('resting recovers health and morale but burns food and days', () => {
  const g = stocked({ seed: 31 });
  for (const m of g.party) { m.health = 45; m.spirit = 40; }
  const food = g.supplies.food;
  const out = restDays(g, 4);
  assert.equal(out.days, 4);
  assert.equal(g.day, 5);
  assert.equal(g.mile, 0, 'resting covers no ground');
  assert.equal(food - g.supplies.food, 4 * 5 * RATIONS.filling.lbPerDay);
  assert.ok(meanHealth(g) > 60, `rest should heal, got ${meanHealth(g)}`);
  assert.ok(g.party[0].spirit > 40);
  assert.equal(g.stats.restDays, 4);
});

test('restDays rejects nonsense without throwing', () => {
  const g = stocked({ seed: 32 });
  assert.equal(restDays(g, 0).days, 0);
  assert.equal(restDays(g, -5).days, 0);
  assert.equal(restDays(g, NaN).days, 0);
  assert.ok(restDays(g, 999).days <= 30, 'capped, not infinite');
  assert.equal(g.status, 'playing');
});

// ------------------------------------------------------------------ cart

test('the cart wears faster at a harder pace', () => {
  const wear = (pace) => {
    const g = stocked({ seed: 33 });
    setPace(g, pace);
    for (let i = 0; i < 10; i++) advanceDay(g);
    return 100 - g.cart.condition;
  };
  assert.ok(wear('grueling') > wear('steady') * 1.5);
});

test('a breakdown consumes a matching spare and costs no days', () => {
  const g = stocked({ seed: 34 });
  for (const p of CART_PARTS) g.supplies[`spare_${p}`] = 1;
  const spares = CART_PARTS.reduce((s, p) => s + g.supplies[`spare_${p}`], 0);
  const day = g.day;
  const lines = applyEffects(g, { partHealth: -200 });   // guaranteed to destroy a part
  const after = CART_PARTS.reduce((s, p) => s + g.supplies[`spare_${p}`], 0);
  assert.equal(after, spares - 1, 'exactly one spare is consumed');
  assert.equal(g.day, day, 'a spare means no lost days');
  assert.ok(lines.some((l) => /spare/i.test(l)));
  assert.ok(g.cart.condition > 0);
});

test('a breakdown with no spare costs 1-3 days and damages the cart', () => {
  const g = stocked({ seed: 35 });
  for (const p of CART_PARTS) g.supplies[`spare_${p}`] = 0;
  const day = g.day;
  const cond = g.cart.condition;
  const food = g.supplies.food;
  applyEffects(g, { partHealth: -200 });
  const lost = g.day - day;
  assert.ok(lost >= 1 && lost <= 3, `lost ${lost} days`);
  assert.ok(g.cart.condition < cond, 'the cart takes damage');
  assert.equal(food - g.supplies.food, lost * 5 * RATIONS.filling.lbPerDay, 'the crew still eats while repairing');
  assert.equal(g.mile, 0, 'no miles are made during a repair');
});

test('breakdowns actually happen over a long run, and spares get consumed', () => {
  let withSpare = 0;
  let withoutSpare = 0;
  for (let seed = 0; seed < 25; seed++) {
    const g = stocked({ seed: 700 + seed });
    setPace(g, 'grueling');
    for (const p of CART_PARTS) g.supplies[`spare_${p}`] = 1;
    let used = 0;
    for (let i = 0; i < 120 && g.status === 'playing'; i++) {
      const before = CART_PARTS.reduce((s, p) => s + g.supplies[`spare_${p}`], 0);
      const rep = advanceDay(g);
      const after = CART_PARTS.reduce((s, p) => s + g.supplies[`spare_${p}`], 0);
      if (rep.breakdown) {
        if (after < before) used++;
        else withoutSpare++;
      }
    }
    withSpare += used;
  }
  assert.ok(withSpare > 5, `spares are never consumed (${withSpare}) — breakdowns are too rare`);
  assert.ok(withoutSpare > 0, 'running out of spares should eventually hurt');
});

test('the cart carries more with more mules, and overloading slows you down', () => {
  const g = stocked({ seed: 36 });
  g.supplies.mules = 0;
  const capNoMules = cartCapacity(g);
  g.supplies.mules = 5;
  assert.ok(cartCapacity(g) > capNoMules * 2);

  const dist = (food) => {
    const h = stocked({ seed: 3600 });
    h.supplies.mules = 1;
    h.supplies.food = food;
    recomputeLoad(h);
    for (let i = 0; i < 10; i++) advanceDay(h);
    return h.mile;
  };
  assert.ok(dist(2000) < dist(120), 'a wildly overloaded cart must be slower');
});

// ------------------------------------------------------------------ effects

test('applyEffects handles every legal effect key', () => {
  const g = stocked({ seed: 37 });
  g.supplies.food = 500; g.supplies.money = 300; g.supplies.mules = 4;
  g.mile = 500;

  applyEffects(g, { food: -50 });
  assert.equal(g.supplies.food, 450);
  applyEffects(g, { food: 25 });
  assert.equal(g.supplies.food, 475);

  applyEffects(g, { money: -120 });
  assert.equal(g.supplies.money, 180);
  assert.equal(g.stats.moneySpent, 120);

  applyEffects(g, { mules: -2 });
  assert.equal(g.supplies.mules, 2);

  applyEffects(g, { miles: 30 });
  assert.equal(g.mile, 530);
  applyEffects(g, { miles: -30 });
  assert.equal(g.mile, 500);

  const spirit = g.party[0].spirit;
  applyEffects(g, { spirit: -10 });
  assert.equal(g.party[0].spirit, Math.max(0, spirit - 10));

  for (const m of g.party) m.health = 80;
  applyEffects(g, { health: -15 });
  assert.equal(g.party[0].health, 65);

  applyEffects(g, { cartCondition: -30 });
  assert.equal(g.cart.condition, 70);

  applyEffects(g, { partHealth: -10 });
  assert.ok(Object.values(g.cart.parts).some((v) => v < 100));

  applyEffects(g, { weather: 'snow' });
  assert.equal(g.weather.kind, 'snow');

  applyEffects(g, { ailment: 'giardia' });
  assert.ok(g.party.some((m) => m.ailments.some((a) => a.id === 'giardia')));

  g.supplies.spare_wheel = 2;
  applyEffects(g, { spare_wheel: -1 });
  assert.equal(g.supplies.spare_wheel, 1);
  applyEffects(g, { paperback: 1 });
  assert.equal(g.supplies.paperback, 1);

  const day = g.day;
  applyEffects(g, { days: 2 });
  assert.equal(g.day, day + 2);

  const living = livingCount(g);
  applyEffects(g, { kill: true });
  assert.equal(livingCount(g), living - 1);
});

test('applyEffects clamps at zero and never produces negative supplies', () => {
  const g = stocked({ seed: 38 });
  g.supplies.food = 10; g.supplies.money = 5; g.supplies.mules = 1; g.supplies.spare_axle = 0;
  applyEffects(g, { food: -9999, money: -9999, mules: -9, spare_axle: -3 });
  assert.equal(g.supplies.food, 0);
  assert.equal(g.supplies.money, 0);
  assert.equal(g.supplies.mules, 0);
  assert.equal(g.supplies.spare_axle, 0);
});

test('applyEffects ignores unknown keys and malformed input without throwing', () => {
  const g = stocked({ seed: 39 });
  const before = serialize(g);
  assert.deepEqual(applyEffects(g, null), []);
  assert.deepEqual(applyEffects(g, undefined), []);
  assert.deepEqual(applyEffects(g, 'nonsense'), []);
  applyEffects(g, { notAThing: -5, alsoFake: 'x' });
  assert.equal(serialize(g), before, 'unknown keys must be inert');
});

test('effects can end the run, and miles clamp at the termini', () => {
  const g = stocked({ seed: 40 });
  applyEffects(g, { miles: -500 });
  assert.equal(g.mile, 0, 'you cannot be pushed south of Mexico');

  const h = stocked({ seed: 41 });
  h.mile = TOTAL_MILES - 5;
  applyEffects(h, { miles: 500 });
  assert.equal(h.mile, TOTAL_MILES);
  assert.equal(h.status, 'won');

  const k = stocked({ seed: 42 });
  for (let i = 0; i < 5; i++) applyEffects(k, { kill: true });
  assert.equal(k.status, 'lost');
  assert.equal(k.cause, 'party-wipe');
});

test('a choice card resolves through its success and failure branches', () => {
  const g = stocked({ seed: 43 });
  const ev = {
    id: 'test-card',
    choices: [
      { label: 'Always works', effects: { food: 10 }, resultText: 'Good.' },
      { label: 'Never works', chance: 0, effects: { food: 100 }, failEffects: { food: -10 }, failText: 'Bad.' },
    ],
  };
  const food = g.supplies.food;
  const a = resolveChoice(g, ev, 0);
  assert.equal(a.ok, true);
  assert.equal(a.success, true);
  assert.equal(g.supplies.food, food + 10);

  const b = resolveChoice(g, ev, 1);
  assert.equal(b.success, false);
  assert.equal(g.supplies.food, food);
  assert.ok(b.lines.some((l) => /Bad/.test(l)));

  const c = resolveChoice(g, ev, 99);
  assert.equal(c.ok, false);
});

// ------------------------------------------------------------------ fords

test('a ford landmark queues a crossing and the methods resolve it', () => {
  const fordLm = LANDMARKS.find((l) => l.ford && !l.ford.bridge);
  const g = stocked({ seed: 44 });
  g.mile = fordLm.mile - 3;
  g.landmarkIndex = LANDMARKS.indexOf(fordLm) - 1;
  let rep = null;
  for (let i = 0; i < 5 && !g.pendingFord; i++) rep = advanceDay(g);
  assert.ok(g.pendingFord, 'arriving at a ford must queue it');
  assert.equal(rep.arrived.id, fordLm.id);

  const day = g.day;
  const out = resolveFord(g, 'wait');
  assert.equal(g.day, day + 1, 'waiting costs a day');
  assert.ok(g.pendingFord, 'the river is still there after waiting');
  assert.ok(out.lines.length > 0);

  resolveFord(g, 'ford', { success: true, severity: 0.1 });
  assert.equal(g.pendingFord, null);
  assert.equal(g.stats.fordsCrossed, 1);
});

test('a failed ford costs food, health and sometimes more', () => {
  const g = stocked({ seed: 45 });
  g.pendingFord = { name: 'Kern River', widthFt: 60, depthFt: 4, flow: 'raging', bridge: false };
  g.supplies.food = 400;
  const out = resolveFord(g, 'ford', { success: false, severity: 0.9 });
  assert.equal(out.success, false);
  assert.ok(g.supplies.food < 400, 'a swim costs food');
  assert.ok(meanHealth(g) < 100, 'a swim costs health');
  assert.equal(g.pendingFord, null);
});

test('a shuttle costs money and never risks the crew', () => {
  const g = stocked({ seed: 46 });
  g.pendingFord = { name: 'Suiattle River', widthFt: 80, depthFt: 5, flow: 'raging', bridge: false };
  g.supplies.money = 500;
  const health = meanHealth(g);
  const out = resolveFord(g, 'shuttle');
  assert.ok(g.supplies.money < 500, 'the driver does not work for free');
  assert.equal(out.success, true);
  assert.ok(meanHealth(g) <= health, 'nobody drowns in a truck');
  assert.equal(g.pendingFord, null);
});

test('a broke crew can still take the shuttle without going into debt', () => {
  const g = stocked({ seed: 47 });
  g.pendingFord = { name: 'Rock Creek', widthFt: 30, depthFt: 2, flow: 'brisk', bridge: false };
  g.supplies.money = 3;
  resolveFord(g, 'shuttle');
  assert.equal(g.supplies.money, 0);
  assert.ok(g.supplies.money >= 0);
});

test('ford risk responds to flow, depth, method, waiting and the ranger perk', () => {
  const mk = (occ) => stocked({ seed: 48, occupation: occ });
  const g = mk('cook');
  g.pendingFord = { name: 'A', widthFt: 20, depthFt: 1, flow: 'calm', bridge: false };
  const calm = fordRisk(g, 'ford');
  g.pendingFord = { name: 'B', widthFt: 90, depthFt: 6, flow: 'raging', bridge: false };
  const raging = fordRisk(g, 'ford');
  assert.ok(raging > calm * 2, `flow/depth should matter: ${calm} vs ${raging}`);
  assert.ok(fordRisk(g, 'rock-hop') < raging, 'rock hopping is safer');
  assert.equal(fordRisk(g, 'shuttle'), 0);
  g.pendingFord.waited = 1;
  assert.ok(fordRisk(g, 'ford') < raging, 'waiting for the morning helps');

  const ranger = OCCUPATIONS.find((o) => o.effects.fordBonus);
  if (ranger) {
    const r = mk(ranger.id);
    r.pendingFord = { name: 'B', widthFt: 90, depthFt: 6, flow: 'raging', bridge: false };
    assert.ok(fordRisk(r, 'ford') < raging, 'the ford perk must reduce risk');
  }
});

// ------------------------------------------------------------------ foraging

test('foraging adds food, costs a day, and is capped', () => {
  const g = stocked({ seed: 49 });
  g.supplies.food = 100;
  const day = g.day;
  const out = applyForageResult(g, 40);
  assert.equal(out.ok, true);
  assert.ok(g.supplies.food > 100);
  assert.equal(g.day, day + 1, 'foraging costs exactly one day');
  assert.equal(g.stats.lbsForaged, out.lbs);

  const h = stocked({ seed: 50 });
  applyForageResult(h, 99999);
  assert.ok(h.stats.lbsForaged <= BALANCE.forageCapLb, 'the crew can only carry so much back');
  applyForageResult(h, -50);
  assert.ok(h.supplies.food >= 0);
});

// ------------------------------------------------------------------ pace / rations

test('setPace and setRations validate their input', () => {
  const g = stocked({ seed: 51 });
  assert.equal(setPace(g, 'grueling').ok, true);
  assert.equal(g.pace, 'grueling');
  assert.equal(setPace(g, 'sprint').ok, false);
  assert.equal(g.pace, 'grueling');
  assert.equal(setRations(g, 'bare').ok, true);
  assert.equal(g.rations, 'bare');
  assert.equal(setRations(g, 'lavish').ok, false);
  assert.equal(g.rations, 'bare');
  assert.ok(Object.keys(PACES).length === 3 && Object.keys(RATIONS).length === 3);
});

// ------------------------------------------------------------------ winning

test('reaching the terminus wins the run', () => {
  const g = stocked({ seed: 52 });
  g.mile = TOTAL_MILES - 4;
  g.landmarkIndex = LANDMARKS.length - 2;
  for (let i = 0; i < 3 && g.status === 'playing'; i++) advanceDay(g);
  assert.equal(g.status, 'won');
  assert.equal(g.cause, 'finished');
  assert.equal(g.mile, TOTAL_MILES);
  assert.ok(g.log.some((l) => /Monument 78/.test(l.text)));
  assert.equal(advanceDay(g).ended, true);
});

test('a competent crew can actually finish: win reachability across seeds', () => {
  let wins = 0;
  const days = [];
  for (let seed = 0; seed < 12; seed++) {
    const g = play(seed);
    if (g.status === 'won') { wins++; days.push(g.day); }
  }
  assert.ok(wins >= 6, `only ${wins}/12 competent runs finished — the game is unwinnable`);
  const median = days.sort((a, b) => a - b)[Math.floor(days.length / 2)];
  assert.ok(median >= 130 && median <= 200, `median finish day ${median} is out of the design window`);
});

test('a careless crew loses', () => {
  let wins = 0;
  for (let seed = 0; seed < 12; seed++) {
    const g = stocked({ seed: 900 + seed, month: 5 });
    g.supplies.food = 900;
    setPace(g, 'grueling');
    setRations(g, 'bare');
    for (let i = 0; i < 400 && g.status === 'playing'; i++) advanceDay(g);
    if (g.status === 'won') wins++;
  }
  assert.ok(wins <= 4, `${wins}/12 careless runs finished — the game is too soft`);
});

test('losses are not all decided in the first 400 miles', () => {
  let early = 0;
  let total = 0;
  for (let seed = 0; seed < 30; seed++) {
    const g = play(seed + 200, { sloppy: true });
    if (g.status === 'lost') { total++; if (g.mile < 400) early++; }
  }
  if (total > 0) assert.ok(early / total < 0.3, `${early}/${total} losses happened before mile 400`);
});

// ------------------------------------------------------------------ robustness

test('advanceDay never throws, whatever it is handed', () => {
  const wrecks = [
    null, undefined, {}, { status: 'playing' },
    { status: 'playing', party: null, supplies: null },
    (() => { const g = stocked({ seed: 60 }); g.party = []; return g; })(),
    (() => { const g = stocked({ seed: 61 }); g.supplies = {}; return g; })(),
    (() => { const g = stocked({ seed: 62 }); g.weather = { kind: 'meteors', severity: 9, daysLeft: -3 }; return g; })(),
    (() => { const g = stocked({ seed: 63 }); g.pace = 'teleport'; g.rations = 'banquet'; return g; })(),
    (() => { const g = stocked({ seed: 64 }); g.mile = 99999; return g; })(),
    (() => { const g = stocked({ seed: 65 }); g.mile = -500; return g; })(),
    (() => { const g = stocked({ seed: 66 }); g.cart = null; return g; })(),
    (() => { const g = stocked({ seed: 67 }); g.supplies.food = NaN; g.supplies.mules = -3; return g; })(),
  ];
  for (const [i, w] of wrecks.entries()) {
    const rep = advanceDay(w);
    assert.equal(typeof rep, 'object', `wreck ${i} returned ${typeof rep}`);
    assert.equal(typeof rep.miles, 'number', `wreck ${i} report is malformed`);
    assert.ok(Array.isArray(rep.lines) && Array.isArray(rep.deaths) && Array.isArray(rep.onsets));
    assert.equal(typeof rep.ended, 'boolean');
  }
});

test('the log stays bounded over a very long run', () => {
  const g = stocked({ seed: 68 });
  for (let i = 0; i < 400 && g.status === 'playing'; i++) advanceDay(g);
  assert.ok(g.log.length <= 600, `log grew to ${g.log.length}`);
  for (const l of g.log) {
    assert.ok(['travel', 'event', 'health', 'store', 'landmark', 'death', 'weather'].includes(l.kind), `bad log kind ${l.kind}`);
    assert.equal(typeof l.text, 'string');
    assert.equal(typeof l.day, 'number');
  }
});

test('the calendar rolls over month and year boundaries correctly', () => {
  const g = stocked({ seed: 69, month: 12, day: 28 });
  const seen = [];
  for (let i = 0; i < 10; i++) { advanceDay(g); seen.push(`${g.date.year}-${g.date.month}-${g.date.day}`); }
  assert.deepEqual(seen.slice(0, 5), ['2026-12-29', '2026-12-30', '2026-12-31', '2027-1-1', '2027-1-2']);
});

// ------------------------------------------------------------------ serialization

test('serialize/deserialize round-trips the state and the RNG position', () => {
  const g = stocked({ seed: 424242 });
  setPace(g, 'strenuous');
  for (let i = 0; i < 60; i++) advanceDay(g);

  const json = serialize(g);
  assert.equal(typeof json, 'string');
  const parsed = JSON.parse(json);
  assert.equal(parsed.rng, undefined, 'the rng function must not be serialized');
  assert.equal(parsed.rngCalls, g.rng.calls, 'the stream position must be recorded');

  const h = deserialize(json);
  assert.equal(h.rng.calls, g.rng.calls);
  assert.equal(h.seed, g.seed);
  assert.equal(serialize(h), json, 'round-trip must be lossless');

  // And the restored game must continue along the identical timeline.
  const ta = trace(g, 60);
  const tb = trace(h, 60);
  assert.deepEqual(tb, ta, 'a reloaded save diverged from the original run');
});

test('deserialize repairs partial and hostile saves instead of throwing', () => {
  assert.equal(deserialize('{}')?.party.length, 0);
  assert.equal(deserialize(null), null);
  assert.equal(deserialize('not json at all'), null);

  const g = stocked({ seed: 70 });
  const o = JSON.parse(serialize(g));
  delete o.supplies;
  delete o.cart;
  delete o.log;
  delete o.stats;
  o.status = 'transcendent';
  o.pace = 'warp';
  o.rations = 'feast';
  o.rngCalls = -12;
  const h = deserialize(o);
  assert.equal(h.status, 'playing');
  assert.equal(h.pace, 'steady');
  assert.equal(h.rations, 'filling');
  assert.equal(h.rng.calls, 0);
  assert.ok(h.supplies && typeof h.supplies.food === 'number');
  assert.ok(h.cart && typeof h.cart.condition === 'number');
  assert.ok(Array.isArray(h.log) && Array.isArray(h.stats && []) !== null);
  assert.doesNotThrow(() => advanceDay(h));
});

test('deserialize accepts an already-parsed object as well as a string', () => {
  const g = stocked({ seed: 71 });
  advanceDay(g);
  const obj = JSON.parse(serialize(g));
  const a = deserialize(obj);
  const b = deserialize(serialize(g));
  assert.equal(serialize(a), serialize(b));
});

// ------------------------------------------------------------------ shared helpers

/** Neutralise the weather and the calendar so a test can isolate one mechanic. */
function BALANCE_FREEZE(g) {
  g.weather = { kind: 'clear', severity: 0, tempF: 65, daysLeft: 9999 };
  g.supplies.food = 5000;
  g.supplies.mules = 5;
  recomputeLoad(g);
}

/**
 * A deliberately competent player, used by the reachability tests: strenuous by default,
 * eases off when the crew is hurting, resupplies at stores, forages when the bags run low.
 */
export function play(seed, { sloppy = false } = {}) {
  const g = newGame({ seed, month: sloppy ? 5 : 4, occupation: 'ranger', difficulty: 'normal' });
  buyStart(g, sloppy);
  for (let i = 0; i < 400 && g.status === 'playing'; i++) {
    const h = meanHealth(g);
    if (!sloppy) {
      setPace(g, h > 65 ? 'strenuous' : h > 40 ? 'steady' : 'steady');
      setRations(g, g.supplies.food > 260 ? 'filling' : g.supplies.food > 90 ? 'meager' : 'bare');
      if (h < 42 && g.snowMile - g.mile > 500) { restDays(g, 2); continue; }
    } else {
      setPace(g, 'grueling');
      setRations(g, 'meager');
    }
    const lm = LANDMARKS[g.landmarkIndex];
    if (g.atLandmark && lm?.store) restock(g, lm);
    if (g.pendingFord) { resolveFord(g, 'rock-hop'); continue; }
    if (!sloppy && g.supplies.food < 40) { applyForageResult(g, 30); continue; }
    advanceDay(g);
  }
  return g;
}

function buyStart(g, sloppy) {
  const { buy } = require_sim();
  buy(g, 'mule', 5, 1);
  buy(g, 'food', sloppy ? 380 : 460, 1);
  if (!sloppy) buy(g, 'ice_axe', 1, 1);
  if (!sloppy) {
    for (const p of CART_PARTS) buy(g, `spare_${p}`, 1, 1);
    buy(g, 'first_aid', 2, 1);
    buy(g, 'clothing', 2, 1);
  }
}

function restock(g, lm) {
  const { buy } = require_sim();
  const mult = lm.store?.mult ?? 1;
  // A competent player notices the cart dragging and pays to have it trued.
  if (g.cart.condition < 72) repairCart(g, mult);
  const want = Math.max(0, 320 - g.supplies.food);
  if (want > 20) buy(g, 'food', want, mult);
  for (const p of CART_PARTS) if (getQty(g, `spare_${p}`) < 1) buy(g, `spare_${p}`, 1, mult);
  if (getQty(g, 'first_aid') < 2) buy(g, 'first_aid', 1, mult);
}

// `buy` is imported lazily to keep the policy helper at the bottom of the file readable.
let _sim = null;
function require_sim() {
  if (!_sim) _sim = { buy: simBuy };
  return _sim;
}
import { buy as simBuy } from '../public/js/engine/sim.js';
