// NORTHBOUND — Monte-Carlo balance harness.
//
// Plays thousands of runs headlessly against the real simulation using scripted
// player archetypes, and prints how each one fares. It is the only honest answer to
// "is the trail fair?": the unit tests pin rules, this pins outcomes.
//
//   node scripts/balance.mjs                 default sweep
//   node scripts/balance.mjs --runs=400      more samples per archetype
//   node scripts/balance.mjs --months        also sweep the start month
//   node scripts/balance.mjs --verbose       print a sample run's ledger

import * as Sim from '../public/js/engine/sim.js';
import { LANDMARKS, TOTAL_MILES, nextLandmark } from '../data/trail.js';
import { ITEMS_BY_ID } from '../data/items.js';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : dflt;
};
const RUNS = arg('runs', 200);
const MONTHS = process.argv.includes('--months');
const VERBOSE = process.argv.includes('--verbose');

const STORES = LANDMARKS.filter((l) => l.store).map((l) => l.mile);
/** Miles to the next store from here — how far the food in the bag has to stretch. */
function milesToStore(mile) {
  const next = STORES.find((m) => m > mile);
  return next === undefined ? TOTAL_MILES - mile : next - mile;
}

// --------------------------------------------------------------- policies ---
// Each archetype is a plain function of the game state. They are deliberately simple:
// a policy that needs to be clever to survive means the game is too punishing.

const ARCHETYPES = {
  // Plays it the way the manual tells you to: buy deep, walk steady, eat properly,
  // slow down when people get hurt, forage the long carries.
  good: {
    occupation: 'ranger',
    pace: (g) => (Sim.meanHealth(g) < 55 ? 'steady' : 'strenuous'),
    rations: (g) => (g.supplies.food > daysOfFood(g, 8) ? 'filling' : 'meager'),
    buyFuel: 8,
    forageBelowDays: 5,
    restBelowHealth: 42,
  },
  // Buys roughly enough, walks hard, notices trouble late.
  average: {
    occupation: 'teacher',
    pace: () => 'strenuous',
    rations: (g) => (g.supplies.food > daysOfFood(g, 5) ? 'filling' : 'meager'),
    buyFuel: 5,
    forageBelowDays: 3,
    restBelowHealth: 30,
  },
  // Sprints, under-buys, never rests. Should mostly die — that is the point of a
  // difficulty curve — but should not be able to win by accident either.
  reckless: {
    occupation: 'trail_angel',
    pace: () => 'grueling',
    rations: () => 'filling',
    buyFuel: 2,
    forageBelowDays: 1,
    restBelowHealth: 0,
  },
};

function daysOfFood(g, days) {
  return days * Sim.RATIONS[g.rations].lbPerDay * Math.max(1, Sim.livingCount(g));
}

/** Fill the pack: food first, up to what the crew can carry and afford. */
function shop(g, policy, mult = 1) {
  const need = Math.ceil(milesToStore(g.mile) / 16) * Sim.RATIONS.filling.lbPerDay
    * Math.max(1, Sim.livingCount(g));
  Sim.recomputeLoad(g);
  const headroom = Sim.packCapacity(g) - g.kit.load;
  const want = Math.max(0, Math.min(need - g.supplies.food, headroom - 8));
  if (want > 0) Sim.buy(g, 'food', Math.round(want), mult);

  const fuel = policy.buyFuel - (g.supplies.stove_fuel || 0);
  if (fuel > 0) Sim.buy(g, 'stove_fuel', fuel, mult);

  for (const part of ['soles', 'poles', 'filter']) {
    const id = `spare_${part}`;
    if ((g.supplies[id] || 0) < 1 && g.supplies.money > ITEMS_BY_ID[id].price * 2) Sim.buy(g, id, 1, mult);
  }
  if (g.kit.condition < 70) Sim.replaceGear(g, mult);
}

function playOne(policy, seed, startMonth) {
  const g = Sim.newGame({
    seed,
    occupation: policy.occupation,
    month: startMonth ?? 4,
    day: 15,
    difficulty: 'normal',
  });
  shop(g, policy, 1);

  const ledger = [];
  for (let day = 0; day < 400 && g.status === 'playing'; day++) {
    Sim.setPace(g, policy.pace(g));
    Sim.setRations(g, policy.rations(g));

    // Resting instead of walking is how crews die in the snowpack, so only rest
    // in country where standing still is survivable.
    if (Sim.meanHealth(g) < policy.restBelowHealth && !Sim.inSnowpack(g) && g.supplies.food > 20) {
      Sim.restDays(g, 2);
      if (g.status !== 'playing') break;
    }

    const rep = Sim.advanceDay(g);
    if (VERBOSE) ledger.push(`d${g.day} mi${Math.round(g.mile)} food=${Math.round(g.supplies.food)} hp=${Math.round(Sim.meanHealth(g))}`);
    if (g.status !== 'playing') break;

    if (rep.event && rep.event.choices && rep.event.choices.length) {
      Sim.resolveChoice(g, rep.event, 0);
      if (g.status !== 'playing') break;
    }

    if (g.pendingFord) {
      const risk = Sim.fordRisk(g, 'walk');
      const method = risk > 0.35 ? 'ford_upstream' : 'walk';
      Sim.resolveFord(g, method, { success: g.rng() > Sim.fordRisk(g, method), severity: 1, log: [] });
      if (g.status !== 'playing') break;
    }

    const lm = LANDMARKS.find((l) => l.id === g.atLandmark);
    if (lm && lm.store) shop(g, policy, (lm.store && lm.store.mult) || 1);

    // Forage when the bag will not reach the next store.
    if (g.supplies.food < daysOfFood(g, policy.forageBelowDays) && Sim.forageFuel(g).enough) {
      // A middling player at the minigame brings back roughly half to nine tenths of
      // what the country will give. Modelling a perfect forager flatters the balance.
      const cap = Sim.forageCap(g);
      Sim.applyForageResult(g, cap * (0.5 + g.rng() * 0.4));
    }
  }

  return {
    won: g.status === 'won',
    status: g.status,
    cause: g.cause,
    day: g.day,
    mile: Math.round(g.mile),
    alive: Sim.livingCount(g),
    ledger,
  };
}

function summarize(label, runs) {
  const won = runs.filter((r) => r.won);
  const causes = {};
  for (const r of runs) if (!r.won) causes[r.cause || r.status] = (causes[r.cause || r.status] || 0) + 1;
  const pct = ((won.length / runs.length) * 100).toFixed(0);
  const meanMile = Math.round(runs.reduce((s, r) => s + r.mile, 0) / runs.length);
  const meanAlive = (won.reduce((s, r) => s + r.alive, 0) / Math.max(1, won.length)).toFixed(1);
  const days = won.map((r) => r.day).sort((a, b) => a - b);
  const medDay = days.length ? days[days.length >> 1] : 0;
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([c, n]) => `${c} ${n}`).join(', ');
  console.log(
    `  ${label.padEnd(10)} ${String(pct).padStart(3)}% won   `
    + `avg mile ${String(meanMile).padStart(4)}   `
    + `survivors on a finish ${meanAlive}/5   `
    + `median finish day ${String(medDay).padStart(3)}   `
    + (top ? `losses: ${top}` : ''),
  );
  return Number(pct);
}

console.log(`\nNORTHBOUND balance — ${RUNS} runs per archetype\n`);
const results = {};
for (const [name, policy] of Object.entries(ARCHETYPES)) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(playOne(policy, 1000 + i, 4));
  results[name] = summarize(name, runs);
  if (VERBOSE && name === 'good') {
    console.log('\n  sample ledger (last 12 days):');
    for (const l of runs[0].ledger.slice(-12)) console.log('    ' + l);
    console.log('');
  }
}

// The departure date is the first real decision the game asks for, so the sweep is not
// optional colour — it is the check that the decision has teeth.
console.log('\n  start month sweep (the "good" policy):');
const byMonth = {};
for (const m of [3, 4, 5, 6]) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(playOne(ARCHETYPES.good, 5000 + i, m));
  byMonth[m] = summarize(Sim.monthName(m), runs);
}
const best = Math.max(...Object.values(byMonth));
const worst = Math.min(...Object.values(byMonth));

// A trail nobody competent can finish is broken; so is one a fool can stroll; so is one
// where it does not matter when you leave.
console.log('');
const problems = [];
if (best < 60) problems.push(`the best departure month only finishes ${best}% of the time — too punishing`);
if (best > 96) problems.push(`the best departure month finishes ${best}% of the time — no tension left`);
if (best - worst < 40) problems.push(`departure month swings the odds by only ${best - worst} points — the choice does not matter enough`);
if (results.reckless > 35) problems.push(`a reckless crew finishes ${results.reckless}% of the time — carelessness is not being punished`);
if (results.good - results.average < 2) problems.push('careful and careless play land in the same place');
if (problems.length) {
  console.log('OUT OF BAND:');
  for (const p of problems) console.log('  \u00b7 ' + p);
  process.exitCode = 1;
} else {
  console.log('In band.');
}
console.log('');
