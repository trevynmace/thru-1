// Thru — core simulation engine (pure logic, no DOM).
// Implements the mechanics described on the Steam page:
//  - No health, only Morale. Morale < 0 => the hiker leaves trail and you lose.
//  - A "winter line" chases you up (NOBO) or down (SOBO) the trail. Get caught => you lose.
//  - Finite money by difficulty; spend money in towns for Morale / Snacks / gear / zeros.
//  - Stats: Speed, Fitness, Charisma, Cleverness, Chillness, Energy, Luck, Outdoorsyness.
//  - Recruit hikers to your "tramily" for passive bonuses.
//  - Gear gives bonuses but wears and breaks with miles.
import { LOCATIONS, TERMINUS_NORTH_MILE, lastPassed, nextLocation, biomeAt } from '../../data/locations.js';
import { GEAR_BY_ID, STARTER_GEAR } from '../../data/gear.js';
import { generateTrailName, randomName, TRAMILY_PERKS } from '../../data/names.js';
import { MODES } from '../../data/modes.js';
import { CARDS, STARTER_DECK, HAND_SIZE, STAMINA_MAX, CULL_COST } from '../../data/deck.js';

export const STAT_KEYS = ['Speed','Fitness','Charisma','Cleverness','Chillness','Energy','Luck','Outdoorsyness'];

export const DIFFICULTY = {
  casual: { label: 'Day Hiker',  money: 4500, winterPerDay: 9,  startMonth: 3, startDay: 20, moraleStart: 80 },
  normal: { label: 'Thru-Hiker', money: 3000, winterPerDay: 12, startMonth: 4, startDay: 15, moraleStart: 70 },
  hard:   { label: 'Triple Crown', money: 1800, winterPerDay: 15, startMonth: 5, startDay: 1,  moraleStart: 60 },
};

// Seedable RNG (mulberry32) so runs can be reproduced for testing.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
function addDays(month, day, n) {
  // month is 1-12. Returns {month, day, year-offset ignored}.
  day += n;
  while (day > MONTH_DAYS[month - 1]) { day -= MONTH_DAYS[month - 1]; month++; if (month > 12) month = 1; }
  return { month, day };
}
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function dateLabel(d) { return `${MONTH_NAMES[d.month - 1]} ${d.day}`; }

export function newGame({ name, trailName, gender, difficulty = 'normal', direction = 'NOBO', stats, seed, mode = 'classic' }) {
  const diff = DIFFICULTY[difficulty];
  const usedSeed = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const rng = makeRng(usedSeed);
  const base = stats || rollStats(rng);
  const startMile = direction === 'NOBO' ? 0 : TERMINUS_NORTH_MILE;
  const g = {
    name, trailName: trailName || '', gender: gender || 'female',
    difficulty, direction, seed: seed ?? usedSeed, rng,
    mode,
    stats: { ...base, Morale: diff.moraleStart, Money: diff.money, Snacks: 70, Miles: 0 },
    mile: startMile,
    day: 1,
    date: { month: diff.startMonth, day: diff.startDay },
    // Winter line starts at the far terminus from the hiker and advances toward them.
    winterMile: direction === 'NOBO' ? -220 : TERMINUS_NORTH_MILE + 220,
    winterPerDay: diff.winterPerDay,
    gear: STARTER_GEAR.map(id => ({ id, wear: GEAR_BY_ID[id].durability })),
    tramily: [],
    flags: { zeroPending: false },
    log: [],
    status: 'playing', // playing | won | lost
    cause: null,
    visited: new Set(),
  };
  attachMode(g);
  g.modeDef?.init?.(g);
  if (g.modeDef?.deck) initDeck(g);
  return g;
}

// Tiny helpers exposed to mode hooks so they can mutate state without importing engine.
function attachMode(g) {
  g.modeDef = MODES[g.mode] || MODES.classic;
  g.helpers = { clamp, applyStat: (key, delta) => applyStat(g, key, delta) };
}
export function modeFlag(g, key, dflt) {
  const v = g.modeDef?.[key];
  return v === undefined ? dflt : v;
}

export function rollStats(rng = Math.random) {
  const s = {};
  for (const k of STAT_KEYS) s[k] = 6 + Math.floor(rng() * 9); // 6..14
  s.Energy = 60 + Math.floor(rng() * 25);
  return s;
}

// Aggregate gear + tramily modifiers onto an effective stat value.
export function effectiveStat(g, key) {
  let v = g.stats[key] || 0;
  for (const item of g.gear) {
    const def = GEAR_BY_ID[item.id];
    if (item.wear > 0 && def.bonus[key]) v += def.bonus[key];
  }
  if (key === 'Cleverness') for (const t of g.tramily) if (t.perk.effect.clevernessBonus) v += t.perk.effect.clevernessBonus;
  return v;
}

export function packWeightOz(g) {
  return g.gear.reduce((s, it) => s + GEAR_BY_ID[it.id].weightOz, 0);
}

function tramilyMul(g, key, dflt = 1) {
  let m = dflt;
  for (const t of g.tramily) { const e = t.perk.effect[key]; if (e != null) m *= e; }
  return m;
}
function tramilyAdd(g, key) {
  let a = 0;
  for (const t of g.tramily) { const e = t.perk.effect[key]; if (e != null) a += e; }
  return a;
}

// Advance one trail day. Returns an object describing what happened (for the renderer/log).
export function advanceDay(g) {
  if (g.status !== 'playing') return { ended: true };
  const biome = biomeAt(g.mile);
  const terrain = { desert: 0.95, forest: 1.05, mountain: 0.85, alpine: 0.72 }[biome] || 1;

  // Daily mileage from Speed, Energy, Morale, terrain, pack weight.
  const speed = effectiveStat(g, 'Speed');
  const moraleFactor = clamp(g.stats.Morale / 70, 0.35, 1.25);
  const energyFactor = clamp(g.stats.Energy / 70, 0.4, 1.2);
  const packPenalty = clamp(1 - (packWeightOz(g) - 90) / 600, 0.7, 1.05);
  let miles = (8 + speed * 0.9) * terrain * moraleFactor * energyFactor * packPenalty;
  miles += tramilyAdd(g, 'mileBonus');
  miles = Math.max(3, Math.round(miles));

  // Move along the trail in the hiking direction, clamped to the termini.
  const dir = g.direction === 'NOBO' ? 1 : -1;
  let newMile = g.mile + dir * miles;
  newMile = clamp(newMile, 0, TERMINUS_NORTH_MILE);
  const actuallyMoved = Math.abs(newMile - g.mile);
  g.mile = newMile;
  g.stats.Miles += actuallyMoved;

  // Wear gear by the miles hiked.
  const broken = [];
  for (const item of g.gear) {
    if (item.wear > 0) { item.wear -= actuallyMoved; if (item.wear <= 0) { item.wear = 0; broken.push(GEAR_BY_ID[item.id].name); } }
  }

  // Consume food. Out of food => morale tanks (hiker hunger).
  const snackRate = tramilyMul(g, 'snackRate', 1);
  g.stats.Snacks -= Math.round((3 + actuallyMoved * 0.06) * snackRate);
  let starving = false;
  if (g.stats.Snacks <= 0) { g.stats.Snacks = 0; starving = true; }

  // Energy: spent hiking, restored by sleep (quilt/tent help). Clamp 0..100.
  const restore = 18 + (effectiveStat(g, 'Fitness') * 0.6);
  g.stats.Energy = Math.round(clamp(g.stats.Energy - actuallyMoved * 0.5 + restore, 0, 100));

  // Morale drift: a hard day on trail slowly wears you down; scenery & tramily soften it.
  let moraleDelta = -2 - (terrain < 0.85 ? 2 : 0);
  if (starving) moraleDelta -= 8;
  moraleDelta *= tramilyMul(g, 'moraleRate', 1);
  g.stats.Morale = Math.round(clamp(g.stats.Morale + moraleDelta, -20, 100));

  // Advance the calendar and the winter line (winter is inert in no-winter modes).
  g.day += 1;
  g.date = addDays(g.date.month, g.date.day, 1);
  if (modeFlag(g, 'winter', true)) g.winterMile += (g.direction === 'NOBO' ? 1 : -1) * g.winterPerDay;

  const events = [];
  if (broken.length) events.push({ type: 'gear-break', text: `Your ${broken.join(' and ')} finally gave out.` });
  if (starving) events.push({ type: 'starving', text: 'Your food bag is empty. Hiker hunger gnaws at your morale.' });

  // Reaching / passing a milestone.
  const here = lastPassed(g.mile);
  if (!g.visited.has(here.id)) {
    g.visited.add(here.id);
    events.push({ type: 'arrive', location: here });
  }

  // Per-mode day hook (endless lap-wrap, race rivals, zen floor…) runs before the
  // end-condition check so a wrapped/repositioned hiker is judged in its new place.
  g._lapEvent = false;
  g.modeDef?.onDayEnd?.(g, { miles: actuallyMoved, biome, events });
  if (g._lapEvent) events.push({ type: 'lap', lap: g.lap });

  checkEndConditions(g);
  return { miles: actuallyMoved, biome, events, ended: g.status !== 'playing' };
}

function checkEndConditions(g) {
  const min = g.modeDef?.zen ? 5 : 0;
  if (g.stats.Morale < min && !g.modeDef?.zen) { g.status = 'lost'; g.cause = 'morale'; return; }
  if (modeFlag(g, 'winter', true)) {
    const caught = g.direction === 'NOBO' ? g.winterMile >= g.mile : g.winterMile <= g.mile;
    if (caught) { g.status = 'lost'; g.cause = 'winter'; return; }
  }
  if (modeFlag(g, 'terminus', true)) {
    const atEnd = g.direction === 'NOBO' ? g.mile >= TERMINUS_NORTH_MILE : g.mile <= 0;
    if (atEnd) { g.status = 'won'; g.cause = 'finish'; }
  }
  // Custom per-mode end conditions (daily season window, etc.).
  g.modeDef?.checkEnd?.(g);
}

// --- Encounter resolution (stat + d20 >= DC), mirrors original Encounter.rollEncounter ---
export function resolveOption(g, encounter, option) {
  const rng = g.rng;
  let statVal = effectiveStat(g, option.checkStat) || 0;
  if (option.checkStat === 'Cleverness') statVal += tramilyAdd(g, 'clevernessBonus');
  const roll = 1 + Math.floor(rng() * 20);
  const success = option.diceCheck === 0 ? true : (statVal + roll >= option.diceCheck);
  const res = success ? option.success : option.failure;

  // Apply the stat effect (hazard energy losses are softened by a Medic in the tramily).
  let effect = res.effect;
  if (res.effectedStat === 'Energy' && effect < 0) effect = Math.round(effect * (1 - tramilyAdd(g, 'hazardResist')));
  applyStat(g, res.effectedStat, effect);

  // Specials.
  const extra = {};
  if (res.recruit) extra.recruit = recruitTramily(g);
  if (res.trailname && !g.trailName) { g.trailName = generateTrailName(rng); extra.trailName = g.trailName; }
  else if (res.trailname) { g.trailName = generateTrailName(rng); extra.trailName = g.trailName; }
  if (res.gear) extra.gear = grantRandomGear(g);
  if (res.zeroDay) { takeZero(g); extra.zeroDay = true; }

  checkEndConditions(g);
  return { success, roll, statVal, dc: option.diceCheck, text: res.text, effectedStat: res.effectedStat, effect, extra };
}

export function applyStat(g, key, delta) {
  if (key === 'Miles') {
    const dir = g.direction === 'NOBO' ? 1 : -1;
    g.mile = clamp(g.mile + dir * delta, 0, TERMINUS_NORTH_MILE);
    g.stats.Miles += Math.abs(delta);
    return;
  }
  const cur = g.stats[key] ?? 0;
  let max = key === 'Money' ? Infinity : (key === 'Morale' || key === 'Energy' || key === 'Snacks' ? 100 : 999);
  let min = key === 'Morale' ? -20 : 0;
  g.stats[key] = Math.round(clamp(cur + delta, min, max));
}

export function recruitTramily(g) {
  if (g.tramily.length >= 4) return null;
  const taken = new Set(g.tramily.map(t => t.perk.id));
  const avail = TRAMILY_PERKS.filter(p => !taken.has(p.id));
  if (!avail.length) return null;
  const perk = avail[Math.floor(g.rng() * avail.length)];
  const gender = g.rng() < 0.5 ? 'female' : 'male';
  const member = { name: randomName(gender, g.rng), trailName: generateTrailName(g.rng), gender, perk };
  g.tramily.push(member);
  return member;
}

export function grantRandomGear(g) {
  const owned = new Set(g.gear.map(i => i.id));
  const pool = Object.values(GEAR_BY_ID).filter(d => !owned.has(d.id));
  if (!pool.length) { applyStat(g, 'Money', 30); return null; }
  const def = pool[Math.floor(g.rng() * pool.length)];
  g.gear.push({ id: def.id, wear: def.durability });
  return def;
}

// --- Town actions ---
export function townDiscount(g) { return 1 - tramilyAdd(g, 'townDiscount'); }

export const TOWN_ACTIONS = {
  resupply: { label: 'Resupply food', cost: 60, apply: (g) => { applyStat(g, 'Snacks', 70); } },
  feast:    { label: 'Town feast', cost: 35, apply: (g) => { applyStat(g, 'Morale', 16); applyStat(g, 'Energy', 12); } },
  motel:    { label: 'Motel & shower', cost: 90, apply: (g) => { applyStat(g, 'Morale', 22); applyStat(g, 'Energy', 25); } },
  zero:     { label: 'Take a zero day', cost: 110, apply: (g) => { applyStat(g, 'Morale', 28); applyStat(g, 'Energy', 35); takeZero(g); } },
};

export function doTownAction(g, key) {
  const a = TOWN_ACTIONS[key];
  const cost = Math.round(a.cost * townDiscount(g));
  if (g.stats.Money < cost) return { ok: false, reason: 'Not enough money.' };
  g.stats.Money -= cost;
  a.apply(g);
  checkEndConditions(g);
  return { ok: true, cost };
}

export function buyGear(g, gearId) {
  const def = GEAR_BY_ID[gearId];
  if (!def) return { ok: false, reason: 'No such gear.' };
  if (g.gear.find(i => i.id === gearId && i.wear > 0)) return { ok: false, reason: 'You already carry that.' };
  const cost = Math.round(def.price * townDiscount(g));
  if (g.stats.Money < cost) return { ok: false, reason: 'Not enough money.' };
  g.stats.Money -= cost;
  const existing = g.gear.find(i => i.id === gearId);
  if (existing) existing.wear = def.durability; else g.gear.push({ id: gearId, wear: def.durability });
  return { ok: true, cost };
}

// A zero day: no miles, but the winter line keeps advancing and the calendar ticks.
export function takeZero(g) {
  g.day += 1;
  g.date = addDays(g.date.month, g.date.day, 1);
  g.winterMile += (g.direction === 'NOBO' ? 1 : -1) * g.winterPerDay;
  checkEndConditions(g);
}

export function milesToWinter(g) {
  return g.direction === 'NOBO' ? Math.round(g.mile - g.winterMile) : Math.round(g.winterMile - g.mile);
}
export function progressPct(g) { return clamp(g.stats.Miles / TERMINUS_NORTH_MILE, 0, 1); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ============================================================================
//  Trailcraft — the deckbuilder mode runtime.
//  A completely different loop: draw a hand, spend Stamina to play cards for
//  miles/morale/rest, then "make camp" to end the day and let winter advance.
// ============================================================================
export function initDeck(g) {
  g.deck = {
    cards: [...STARTER_DECK],   // the master deck (for the deckbuilding view)
    draw: [], hand: [], discard: [],
    stamina: STAMINA_MAX, staminaMax: STAMINA_MAX,
    campsMade: 0,
  };
  g.deck.draw = shuffle(g, [...g.deck.cards]);
  drawHand(g);
}

function shuffle(g, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawOne(g) {
  const d = g.deck;
  if (d.draw.length === 0) {
    if (d.discard.length === 0) return null; // deck exhausted this day
    d.draw = shuffle(g, d.discard);
    d.discard = [];
  }
  const id = d.draw.pop();
  d.hand.push(id);
  return id;
}

// Start-of-day: discard the old hand, refill Stamina, draw a fresh hand.
function drawHand(g) {
  const d = g.deck;
  d.discard.push(...d.hand);
  d.hand = [];
  d.stamina = d.staminaMax;
  for (let i = 0; i < HAND_SIZE; i++) drawOne(g);
}

export function deckHand(g) {
  return g.deck.hand.map((id, i) => {
    const card = CARDS[id];
    return { index: i, id, card, playable: g.deck.stamina >= card.cost };
  });
}

// Play the card at hand index. Returns { ok, card, applied, camped }.
export function playCard(g, index) {
  if (g.status !== 'playing') return { ok: false, reason: 'Run over.' };
  const d = g.deck;
  const id = d.hand[index];
  if (id == null) return { ok: false, reason: 'No such card.' };
  const card = CARDS[id];
  if (d.stamina < card.cost) return { ok: false, reason: 'Not enough Stamina.' };

  d.stamina -= card.cost;
  d.hand.splice(index, 1);
  d.discard.push(id);

  const fx = card.fx;
  const applied = {};
  if (fx.miles) { applyStat(g, 'Miles', fx.miles); applied.miles = fx.miles; }
  if (fx.morale) { applyStat(g, 'Morale', fx.morale); applied.morale = fx.morale; }
  if (fx.energy) { applyStat(g, 'Energy', fx.energy); applied.energy = fx.energy; }
  if (fx.snacks) { applyStat(g, 'Snacks', fx.snacks); applied.snacks = fx.snacks; }
  if (fx.money)  { applyStat(g, 'Money', fx.money);  applied.money  = fx.money; }
  if (fx.stamina) { d.stamina = Math.min(d.staminaMax + 3, d.stamina + fx.stamina); applied.stamina = fx.stamina; }
  if (fx.draw) { for (let i = 0; i < fx.draw; i++) drawOne(g); applied.draw = fx.draw; }

  checkEndConditions(g);
  let camped = false;
  if (fx.camp && g.status === 'playing') { makeCamp(g); camped = true; }
  return { ok: true, card, applied, camped };
}

// Make camp: end the day. Winter creeps, food/morale drift, a new hand is dealt.
export function makeCamp(g) {
  const d = g.deck;
  d.campsMade++;
  // Wear gear a nominal amount per day so kit still matters in this mode.
  const dayMiles = 14;
  for (const item of g.gear) if (item.wear > 0) item.wear = Math.max(0, item.wear - dayMiles);

  // Food & morale drift.
  const snackRate = tramilyMul(g, 'snackRate', 1);
  applyStat(g, 'Snacks', -Math.round(6 * snackRate));
  let moraleDelta = -2;
  if (g.stats.Snacks <= 0) moraleDelta -= 8;
  moraleDelta *= tramilyMul(g, 'moraleRate', 1);
  applyStat(g, 'Morale', moraleDelta);
  // A quilt/tent-aided night restores a little energy.
  applyStat(g, 'Energy', Math.round(8 + effectiveStat(g, 'Fitness') * 0.4));

  // Calendar + winter.
  g.day += 1;
  g.date = addDays(g.date.month, g.date.day, 1);
  if (modeFlag(g, 'winter', true)) g.winterMile += (g.direction === 'NOBO' ? 1 : -1) * g.winterPerDay;

  const events = [];
  const here = lastPassed(g.mile);
  if (!g.visited.has(here.id)) { g.visited.add(here.id); events.push({ type: 'arrive', location: here }); }

  g.modeDef?.onDayEnd?.(g, { miles: dayMiles, biome: biomeAt(g.mile), events });
  checkEndConditions(g);
  if (g.status === 'playing') drawHand(g);
  return { events, biome: biomeAt(g.mile), ended: g.status !== 'playing' };
}

// Town deckbuilding: buy a card into the deck, or pay to cull one out of it.
export function buyCard(g, id) {
  const def = CARDS[id];
  if (!def || def.kind !== 'shop') return { ok: false, reason: 'Not for sale.' };
  const cost = Math.round(def.price * townDiscount(g));
  if (g.stats.Money < cost) return { ok: false, reason: 'Not enough money.' };
  g.stats.Money -= cost;
  g.deck.cards.push(id);
  g.deck.discard.push(id); // new card enters the discard, in play next reshuffle
  return { ok: true, cost };
}

export function cullCard(g, id) {
  const cost = CULL_COST;
  if (g.stats.Money < cost) return { ok: false, reason: 'Not enough money.' };
  const d = g.deck;
  const removeFrom = (arr) => { const i = arr.indexOf(id); if (i >= 0) { arr.splice(i, 1); return true; } return false; };
  // Remove one instance from the master list, and from wherever it currently sits.
  if (!removeFrom(d.cards)) return { ok: false, reason: 'Not in your deck.' };
  removeFrom(d.hand) || removeFrom(d.discard) || removeFrom(d.draw);
  g.stats.Money -= cost;
  return { ok: true, cost };
}

export function deckCounts(g) {
  const tally = {};
  for (const id of g.deck.cards) tally[id] = (tally[id] || 0) + 1;
  return tally;
}

// Plain-data snapshot for saving (drops functions: rng, mode hooks, helpers).
export function serialize(g) {
  return JSON.stringify({ ...g, rng: undefined, modeDef: undefined, helpers: undefined, visited: [...g.visited] });
}
export function deserialize(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  o.visited = new Set(o.visited || []);
  o.mode = o.mode || 'classic';
  o.rng = makeRng((o.seed ?? Math.floor(Math.random() * 1e9)) >>> 0);
  attachMode(o); // re-link the mode ruleset (functions can't be serialized)
  return o;
}
