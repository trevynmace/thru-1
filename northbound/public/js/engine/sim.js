// NORTHBOUND — the simulation.
//
// Pure logic. No DOM, no imports from render/ui/audio, no I/O. Every stochastic decision
// runs through `g.rng` (engine/rng.js) so `{ seed, rngCalls }` fully determines a run.
//
// The whole game is here: the daily tick (§5.2), health and ailments, the snow line,
// the cart, fords, foraging, the store, and save serialization. `advanceDay` is the only
// thing the trail screen ever needs to call, and it must never throw — the UI drives it
// once per frame-ish and a crash there would break the page.
import {
  TOTAL_MILES, LANDMARKS, landmarkAtMile, nextLandmark, lastLandmark,
  biomeAtMile, elevAtMile, terrainFactor,
  ITEMS, ITEMS_BY_ID, CART_PARTS, priceOf,
  AILMENTS, AILMENTS_BY_ID,
  rollEvent,
  OCCUPATIONS, NAME_POOL, generateTrailName, EPITAPHS, PORTRAIT_PARTS,
} from './data.js';
import { makeRng, randInt, pick, weighted, chance } from './rng.js';

// ---------------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------------

export const PACES = {
  steady:    { id: 'steady',    label: 'Steady',    base: 19, healthCost: 0, cartWear: 0.85, spirit:  0.10, blurb: 'Dawn to mid-afternoon. You finish the day with legs left.' },
  strenuous: { id: 'strenuous', label: 'Strenuous', base: 25, healthCost: 2, cartWear: 1.30, spirit: -0.25, blurb: 'Dawn to dusk, one long push, and a cold dinner.' },
  grueling:  { id: 'grueling',  label: 'Grueling',  base: 31, healthCost: 5, cartWear: 2.00, spirit: -0.85, blurb: 'Headlamps on at both ends of the day. This breaks people.' },
};

export const RATIONS = {
  filling: { id: 'filling', label: 'Filling', lbPerDay: 3, healthCost: 0, spirit:  0.25, blurb: 'Three pounds a head. Real dinners.' },
  meager:  { id: 'meager',  label: 'Meager',  lbPerDay: 2, healthCost: 2, spirit: -0.20, blurb: 'Two pounds a head. Nobody is happy about it.' },
  bare:    { id: 'bare',    label: 'Bare',    lbPerDay: 1, healthCost: 5, spirit: -0.65, blurb: 'One pound a head. This is how hikers get hollow.' },
};

export const WEATHERS = ['clear', 'hot', 'rain', 'storm', 'hail', 'snow', 'smoke', 'fog', 'wind'];

/** Travel multiplier per weather kind (SPEC §5.2 step 4), before severity weighting. */
export const WEATHER_SPEED = {
  clear: 1.0, hot: 0.90, rain: 0.88, storm: 0.70, hail: 0.75,
  snow: 0.55, smoke: 0.85, fog: 0.90, wind: 0.93,
};

/** Health drain per day at full severity, per weather kind. */
export const WEATHER_HEALTH = {
  clear: 0.0, hot: 1.6, rain: 0.7, storm: 2.2, hail: 2.0,
  snow: 3.2, smoke: 1.4, fog: 0.2, wind: 0.5,
};

export const DIFFICULTIES = {
  easy:   { id: 'easy',   label: 'Section Hiker', moneyMult: 1.30, snowMult: 0.85, illnessMult: 0.75, scoreMult: 0.75 },
  normal: { id: 'normal', label: 'Thru-Hiker',    moneyMult: 1.00, snowMult: 1.00, illnessMult: 1.00, scoreMult: 1.00 },
  hard:   { id: 'hard',   label: 'Calendar Year', moneyMult: 0.80, snowMult: 1.12, illnessMult: 1.30, scoreMult: 1.35 },
};

/**
 * Every tuned number in one place. These are the knobs the Monte-Carlo balance harness
 * sweeps, and the values below are the ones it settled on. Measured over 400 seeds per
 * policy, five mules, ranger, filling rations:
 *
 *   departure x pace     win%     median finish     dominant loss
 *   March    strenuous    51%     day 176           the Sierra buries you (party-wipe)
 *   April    strenuous    81%     day 172           mixed
 *   May      strenuous    55%     day 157           the snow line catches you
 *   May      grueling     34%     day 161           grueling costs more health than it buys
 *   June     strenuous     2%     day 133           snowed off, almost always
 *
 *   player archetype     win%     notes
 *   good                 66%      resupplies, repairs the cart, rests when sick
 *   average              61%      same shape, thinner margins
 *   reckless              0%      grueling + bare rations + no resupply: starves by mile 600
 *
 * Two properties are load-bearing and should be re-measured if these numbers move:
 * grueling must stay *worse* than strenuous for a healthy crew, and losses must stay
 * split between the snow line and party-wipe rather than collapsing onto one cause.
 */
export const BALANCE = {
  // --- health ---
  // Daily recovery is proportional to the health deficit, so health settles at an
  // equilibrium set by how hard you are pushing rather than sliding monotonically.
  // regen = regenRange * (1 - health/100) + regenBase
  regenRange: 16.0,
  regenBase: 0.80,
  restBonus: 4.2,          // extra regen on a camp/zero day
  starveDrain: 12.0,       // SPEC §5.2 step 5
  altitudeFloorFt: 9000,
  altitudePerKFt: 1.15,    // health per 1,000 ft above the floor
  overloadDrain: 1.2,
  lowSpiritDrain: 1.0,
  luxuryHealth: 0.22,      // per luxury item carried, capped below
  luxuryHealthCap: 0.9,

  // --- ailments ---
  onsetDivisor: 900,       // p = (100 - health) / divisor, per living member per day
  onsetFloor: 0.004,
  onsetWeatherBonus: 0.030,
  onsetAltitudeBonus: 0.022,
  onsetStarveBonus: 0.045,

  // --- spirit ---
  spiritDrift: -0.30,
  spiritLandmark: 6,
  spiritTown: 10,
  spiritDeath: -14,
  spiritRest: 2.4,
  spiritLuxury: 0.30,
  spiritStarve: -3.0,
  spiritLowThreshold: 15,
  spiritPacePenalty: 0.88, // travel multiplier when the crew's morale bottoms out

  // --- cart ---
  cartBaseCapacityLb: 160,
  cartCapacityPerMuleLb: 90,
  // Wear is the slow, boring cost of every mile. It has to be small enough that a cart
  // maintained at towns survives a season, and large enough that ignoring it is fatal.
  // A well-mule'd, healthy crew on good ground should beat its nominal pace; a sick
  // crew hauling the cart themselves should crawl. These set both ends of that band.
  muleFloor: 0.60,
  mulePerHead: 0.10,       // x min(mules, 5)  -> 1.10 at a full string
  healthFloor: 0.60,
  healthRange: 0.55,       // -> 1.15 at full health
  cartWearScale: 0.42,
  cartFloor: 0.78,         // travel multiplier at 0% condition (was 0.70)
  cartRestRepair: 3.5,     // condition regained per camp day — the crew has tools
  cartRepairCostPerPoint: 0.85,   // dollars per condition point at a store
  breakdownBase: 0.009,
  breakdownSlope: 0.042,   // × (1 - condition/100)
  breakdownPaceMult: { steady: 0.85, strenuous: 1.0, grueling: 1.35 },
  gearFailureBase: 0.010,
  ailmentPaceFloor: 0.68,  // the crew never drops below this from illness alone

  // --- the Sierra snowpack ---
  // The other half of the calendar. The snow line chases you from the north; the
  // *snowpack* is already sitting on the High Sierra when you get there, and it does
  // not melt out until mid-June. Arrive early and the passes are a different game:
  // postholing, whiteout navigation, and creeks running at peak melt.
  snowpackFromMile: 690,
  snowpackToMile: 1090,
  snowpackMeltMonth: 6,
  snowpackMeltDay: 18,     // fully melted out by June 18
  snowpackOnsetMonth: 5,   // meaningful snowpack before June; total before May
  snowpackPaceMin: 0.70,   // travel multiplier at a full snowpack
  snowpackHealth: 2.3,     // extra health drain per day at a full snowpack
  snowpackIllness: 0.030,   // extra ailment odds per day at a full snowpack

  // --- snow line ---
  // Miles the snow line walks south per day, by calendar month. It is nearly idle in
  // spring, wakes up in August and slams shut in October.
  snowRateByMonth: { 1: 30, 2: 30, 3: 4.5, 4: 4.5, 5: 4.5, 6: 5.0, 7: 5.5, 8: 8.5, 9: 12.0, 10: 20, 11: 30, 12: 30 },
  snowCloseMonth: 10,      // the snow line reaches the Northern Terminus on...
  snowCloseDay: 31,        // ...October 31. Everything upstream is integrated from here.

  // --- events ---
  eventChance: 0.28,       // SPEC §5.2 step 12

  // --- economy ---
  sellRatio: 0.5,
  haggleMult: 0.9,

  // --- foraging ---
  forageCapLb: 100,
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LOG_LIMIT = 600;

// ---------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v, dflt = 0) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
function addDays(date, n) {
  let { year, month, day } = date;
  for (let i = 0; i < n; i++) {
    day++;
    if (day > daysInMonth(year, month)) { day = 1; month++; if (month > 12) { month = 1; year++; } }
  }
  return { year, month, day };
}
/** Days from Jan 1 (Jan 1 === 1). Used by the snow-line integrator. */
function ordinal(date) {
  let d = date.day;
  for (let m = 1; m < date.month; m++) d += daysInMonth(date.year, m);
  return d;
}
export function dateLabel(date) {
  if (!date) return '';
  return `${MONTH_ABBR[(date.month || 1) - 1]} ${date.day}`;
}
export function monthName(m) { return MONTH_NAMES[clamp((m | 0) - 1, 0, 11)]; }

export function livingParty(g) { return (g?.party || []).filter((m) => m && m.alive); }
export function livingCount(g) { return livingParty(g).length; }
export function meanHealth(g) {
  const l = livingParty(g);
  if (!l.length) return 0;
  return l.reduce((s, m) => s + num(m.health), 0) / l.length;
}
export function meanSpirit(g) {
  const l = livingParty(g);
  if (!l.length) return 0;
  return l.reduce((s, m) => s + num(m.spirit), 0) / l.length;
}

function occupationOf(g) {
  const id = g?.leader?.occupation;
  return OCCUPATIONS.find((o) => o.id === id) || OCCUPATIONS[0] || { id: 'ranger', effects: {}, scoreMult: 1, money: 1200 };
}
function perk(g, key, dflt = 0) {
  const e = occupationOf(g).effects || {};
  return e[key] === undefined ? dflt : e[key];
}
function difficultyOf(g) { return DIFFICULTIES[g?.difficulty] || DIFFICULTIES.normal; }

function logLine(g, kind, text) {
  if (!g.log) g.log = [];
  g.log.push({ day: g.day, kind, text: String(text) });
  if (g.log.length > LOG_LIMIT) g.log.splice(0, g.log.length - LOG_LIMIT);
  return text;
}

/** Fill {leader} {member} {name} {landmark} {miles} placeholders in event/ailment copy. */
export function fillTemplate(g, text, extra = {}) {
  if (typeof text !== 'string') return '';
  const here = lastLandmark(g.mile) || LANDMARKS[0] || { name: 'the trail' };
  const living = livingParty(g);
  const member = extra.member || (living.length ? living[Math.floor((g.rng ? g.rng() : 0) * living.length)] : null);
  const map = {
    leader: g.leader?.name || 'the leader',
    member: extra.name || member?.name || 'someone',
    name: extra.name || member?.name || 'someone',
    landmark: extra.landmark || here.name || 'the trail',
    miles: String(Math.round(g.mile || 0)),
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));
}

// ---------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------

const SUPPLY_ALIAS = { food: 'food', mule: 'mules' };
/** supplies key for an item id ('food' -> food, 'mule' -> mules, otherwise the id). */
function supplyKey(itemId) { return SUPPLY_ALIAS[itemId] || itemId; }

export function getQty(g, itemId) { return num(g?.supplies?.[supplyKey(itemId)], 0); }
function setQty(g, itemId, v) { g.supplies[supplyKey(itemId)] = Math.max(0, round2(v)); }

function emptySupplies() {
  const s = { food: 0, money: 0, mules: 0 };
  for (const it of ITEMS) if (it && it.id && it.id !== 'food' && it.id !== 'mule') s[it.id] = 0;
  return s;
}

/**
 * Starting money and (empty) pack for an occupation. The outfitting store at the
 * Southern Terminus is where a run actually gets equipped — you must be able to leave
 * broke, so the kit itself is deliberately bare.
 */
export function startingKit(occupationId) {
  const occ = OCCUPATIONS.find((o) => o.id === occupationId) || OCCUPATIONS[0] || { money: 1200, scoreMult: 1 };
  const supplies = emptySupplies();
  supplies.money = round2(num(occ.money, 1200));
  // Everyone walks up to the monument wearing one set of clothes and carrying a bottle.
  if ('clothing' in supplies) supplies.clothing = 1;
  if ('water_carry' in supplies) supplies.water_carry = 1;
  return { occupation: occ.id, money: supplies.money, scoreMult: num(occ.scoreMult, 1), supplies };
}

function makePortrait(rng) {
  const P = PORTRAIT_PARTS || {};
  return {
    skin: pick(rng, P.skin || ['#c98d63']) || '#c98d63',
    hair: pick(rng, P.hair || ['#2b2233']) || '#2b2233',
    shirt: pick(rng, P.shirt || ['#8fd0a4']) || '#8fd0a4',
  };
}

function randomName(rng) {
  const first = pick(rng, NAME_POOL?.first || ['Sam']) || 'Sam';
  const last = pick(rng, NAME_POOL?.last || ['Reyes']) || 'Reyes';
  return `${first} ${last}`;
}

function makeMember(rng, name, isLeader) {
  return {
    name: String(name || randomName(rng)).slice(0, 24),
    trailName: generateTrailName(rng),
    isLeader: !!isLeader,
    alive: true,
    health: 100,
    spirit: 78,
    ailments: [],
    portrait: makePortrait(rng),
    causeOfDeath: null,
    diedMile: null,
    diedDate: null,
  };
}

/**
 * @param {object} opts { leaderName, memberNames:[4], occupation, month, seed, difficulty }
 */
export function newGame(opts = {}) {
  const {
    leaderName = '', memberNames = [], occupation = OCCUPATIONS[0]?.id,
    month = 4, seed, difficulty = 'normal', day = 15, year = 2026,
  } = opts || {};

  const usedSeed = (Number.isFinite(Number(seed)) ? Number(seed) : Math.floor(Math.random() * 1e9)) >>> 0;
  const rng = makeRng(usedSeed);
  const kit = startingKit(occupation);
  const diff = DIFFICULTIES[difficulty] ? difficulty : 'normal';

  const party = [makeMember(rng, leaderName || randomName(rng), true)];
  for (let i = 0; i < 4; i++) party.push(makeMember(rng, memberNames[i], false));

  const date = {
    year,
    month: clamp(Math.round(num(month, 4)), 1, 12),
    day: clamp(Math.round(num(day, 15)), 1, 28),
  };

  const supplies = kit.supplies;
  supplies.money = round2(supplies.money * DIFFICULTIES[diff].moneyMult);

  const g = {
    version: 1,
    seed: usedSeed,
    rngCalls: 0,
    rng,
    difficulty: diff,
    leader: { name: party[0].name, occupation: kit.occupation },
    party,
    day: 1,
    date,
    startDate: { ...date },
    mile: 0,
    pace: 'steady',
    rations: 'filling',
    supplies,
    cart: { condition: 100, load: 0, parts: partsRecord() },
    weather: { kind: 'clear', tempF: 68, severity: 0.2, daysLeft: 2 },
    snowMile: 0,
    landmarkIndex: 0,
    atLandmark: LANDMARKS[0]?.id ?? null,
    pendingFord: null,
    firedEvents: [],
    starving: false,
    log: [],
    status: 'playing',
    cause: null,
    stats: {
      milesHiked: 0, daysOnTrail: 0, eventsSurvived: 0,
      fordsCrossed: 0, lbsForaged: 0, moneySpent: 0, restDays: 0, deaths: 0,
    },
  };

  g.snowMile = initialSnowMile(g.date);
  recomputeLoad(g);
  rollWeather(g, true);
  logLine(g, 'landmark', `${MONTH_NAMES[date.month - 1]} ${date.day}. The crew signs the register at the Southern Terminus and starts walking north.`);
  g.rngCalls = rng.calls;
  return g;
}

function partsRecord() {
  const parts = {};
  for (const p of (CART_PARTS || [])) parts[p] = 100;
  return parts;
}

// ---------------------------------------------------------------------------------
// The snow line
// ---------------------------------------------------------------------------------

function snowRateFor(date) {
  const r = BALANCE.snowRateByMonth[date.month];
  return Number.isFinite(r) ? r : 12;
}

/**
 * The snow line is a calendar, not a stopwatch: it always reaches the Northern Terminus
 * on the same date, so leaving in March buys weeks of slack and leaving in June means it
 * is breathing on your neck from day one. We integrate backwards from the close date to
 * find where the line stands on departure day.
 */
export function initialSnowMile(date) {
  const close = { year: date.year, month: BALANCE.snowCloseMonth, day: BALANCE.snowCloseDay };
  let total = 0;
  let cur = addDays(date, 1);
  let guard = 0;
  while (guard++ < 400) {
    total += snowRateFor(cur);
    if (cur.year === close.year && cur.month === close.month && cur.day === close.day) break;
    if (ordinal(cur) > ordinal(close) && cur.year >= close.year) break;
    cur = addDays(cur, 1);
  }
  return Math.round(TOTAL_MILES + total);
}

/** Days of slack left before the line reaches you at the current rate (UI convenience). */
export function snowDaysOfSlack(g) {
  const gap = g.snowMile - g.mile;
  const rate = snowRateFor(g.date) * difficultyOf(g).snowMult;
  return rate > 0 ? Math.max(0, Math.round(gap / rate)) : 999;
}

function tickSnow(g) {
  g.snowMile = round2(g.snowMile - snowRateFor(g.date) * difficultyOf(g).snowMult);
  if (g.status === 'playing' && g.snowMile <= g.mile) {
    g.status = 'lost';
    g.cause = 'snowed-off';
    logLine(g, 'weather', 'The passes close. Snow fills the trail ahead and behind, and the crew turns around. The trail wins this year.');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------------

const BIOME_WEATHER = {
  desert:     { clear: 3.0, hot: 3.5, rain: 0.35, storm: 0.5, hail: 0.2, snow: 0.05, smoke: 0.9, fog: 0.2, wind: 1.4 },
  chaparral:  { clear: 2.6, hot: 2.4, rain: 0.6,  storm: 0.7, hail: 0.3, snow: 0.10, smoke: 1.6, fog: 0.5, wind: 1.2 },
  sierra:     { clear: 2.0, hot: 0.9, rain: 1.0,  storm: 1.8, hail: 1.6, snow: 1.60, smoke: 1.0, fog: 0.6, wind: 1.3 },
  alpine:     { clear: 1.6, hot: 0.4, rain: 0.9,  storm: 2.2, hail: 2.0, snow: 2.60, smoke: 0.7, fog: 0.9, wind: 2.0 },
  forest:     { clear: 2.2, hot: 0.9, rain: 1.8,  storm: 1.0, hail: 0.5, snow: 0.55, smoke: 1.5, fog: 1.4, wind: 0.9 },
  volcanic:   { clear: 2.2, hot: 1.4, rain: 0.9,  storm: 1.1, hail: 0.7, snow: 0.60, smoke: 2.4, fog: 0.8, wind: 1.6 },
  rainforest: { clear: 1.3, hot: 0.4, rain: 3.0,  storm: 1.4, hail: 0.5, snow: 0.70, smoke: 0.4, fog: 2.4, wind: 1.0 },
};
const MONTH_WEATHER = {
  3:  { snow: 3.2, hot: 0.2, storm: 1.4, smoke: 0.2, fog: 1.3 },
  4:  { snow: 2.4, hot: 0.4, storm: 1.3, smoke: 0.3, fog: 1.2 },
  5:  { snow: 1.5, hot: 0.7, storm: 1.2, smoke: 0.5 },
  6:  { snow: 0.7, hot: 1.3, smoke: 0.8 },
  7:  { snow: 0.3, hot: 2.2, smoke: 1.9 },
  8:  { snow: 0.5, hot: 2.0, smoke: 2.6 },
  9:  { snow: 1.4, hot: 1.0, smoke: 1.7, storm: 1.2 },
  10: { snow: 3.0, hot: 0.3, smoke: 0.6, storm: 1.4 },
  11: { snow: 4.0, hot: 0.1, smoke: 0.3 },
};

function weatherWeights(g) {
  const biome = safeBiome(g.mile);
  const elev = num(elevAtMile(g.mile), 5000);
  const base = BIOME_WEATHER[biome] || BIOME_WEATHER.forest;
  const mm = MONTH_WEATHER[g.date.month] || {};
  const w = {};
  for (const k of WEATHERS) {
    let v = num(base[k], 1) * num(mm[k], 1);
    if (elev > 9000) {
      if (k === 'snow') v *= 2.4;
      else if (k === 'hot') v *= 0.25;
      else if (k === 'wind') v *= 1.6;
      else if (k === 'hail') v *= 1.5;
    } else if (elev < 3000) {
      if (k === 'snow') v *= 0.15;
      else if (k === 'hot') v *= 1.5;
    }
    w[k] = Math.max(0, v);
  }
  return w;
}

function tempFor(g, kind) {
  const elev = num(elevAtMile(g.mile), 5000);
  const seasonal = [38, 42, 52, 60, 70, 80, 88, 86, 76, 62, 48, 38][g.date.month - 1];
  let t = seasonal - (elev / 1000) * 3.2 + 10;
  if (kind === 'hot') t += 16;
  if (kind === 'snow') t -= 22;
  if (kind === 'storm' || kind === 'hail' || kind === 'rain') t -= 8;
  if (kind === 'fog') t -= 4;
  return Math.round(t);
}

function rollWeather(g, force = false) {
  const w = g.weather;
  if (!force) {
    w.daysLeft = num(w.daysLeft, 0) - 1;
    if (w.daysLeft > 0) return false;
  }
  const weights = weatherWeights(g);
  const pack = snowpack(g);
  if (pack > 0) {
    // Snow and whiteout fog dominate; the desert kinds stop making sense up there.
    weights.snow = num(weights.snow, 1) + 26 * pack;
    weights.fog = num(weights.fog, 1) + 10 * pack;
    weights.wind = num(weights.wind, 1) + 8 * pack;
    weights.hot = num(weights.hot, 1) * (1 - 0.9 * pack);
    weights.smoke = num(weights.smoke, 1) * (1 - 0.9 * pack);
    weights.clear = num(weights.clear, 1) * (1 - 0.45 * pack);
  }
  const kind = weighted(g.rng, WEATHERS, (k) => weights[k]) || 'clear';
  const r = g.rng();
  const severity = round2(kind === 'clear' ? 0.05 + r * 0.2 : 0.2 + r * r * 0.8);
  const short = kind === 'storm' || kind === 'hail';
  g.weather = {
    kind,
    severity,
    tempF: tempFor(g, kind),
    daysLeft: short ? randInt(g.rng, 1, 2) : randInt(g.rng, 1, 4),
  };
  return true;
}

/**
 * How buried the High Sierra is right now, 0..1.
 *
 * 1 = March, everything above 10,000 ft is a snowfield with a trail somewhere under it.
 * 0 = after June 18, or anywhere outside the high country.
 * The curve is linear in days from May 1 to the melt-out date, so every week you wait
 * at Kennedy Meadows buys a real, legible improvement.
 */
export function snowpack(g) {
  if (!g) return 0;
  const mile = num(g.mile);
  if (mile < BALANCE.snowpackFromMile || mile > BALANCE.snowpackToMile) return 0;

  const meltOrdinal = ordinal({ year: g.date.year, month: BALANCE.snowpackMeltMonth, day: BALANCE.snowpackMeltDay });
  const onsetOrdinal = ordinal({ year: g.date.year, month: BALANCE.snowpackOnsetMonth, day: 1 });
  const today = ordinal(g.date);
  if (today >= meltOrdinal) return 0;

  const frac = today <= onsetOrdinal ? 1 : (meltOrdinal - today) / Math.max(1, meltOrdinal - onsetOrdinal);

  // Only the genuinely high ground holds it — the approach miles are just cold.
  const elev = num(elevAtMile(mile), 0);
  const altitude = clamp((elev - 7500) / 3500, 0, 1);
  return round2(clamp(frac, 0, 1) * altitude);
}

/** True when the crew is in the high country before it has melted out. */
export function inSnowpack(g) { return snowpack(g) > 0.08; }

function weatherSpeedFactor(g) {
  const base = num(WEATHER_SPEED[g.weather.kind], 1);
  const sev = clamp(num(g.weather.severity, 0.5), 0, 1);
  return clamp(1 - (1 - base) * (0.55 + 0.45 * sev), 0.35, 1);
}
function weatherHealthCost(g) {
  const base = num(WEATHER_HEALTH[g.weather.kind], 0);
  const sev = clamp(num(g.weather.severity, 0.5), 0, 1);
  return base * (0.4 + 0.6 * sev);
}

function safeBiome(mile) {
  const b = biomeAtMile(mile);
  return typeof b === 'string' ? b : 'forest';
}

// ---------------------------------------------------------------------------------
// Load / capacity
// ---------------------------------------------------------------------------------

export function cartCapacity(g) {
  return BALANCE.cartBaseCapacityLb + BALANCE.cartCapacityPerMuleLb * Math.min(num(g.supplies.mules), 8);
}

export function recomputeLoad(g) {
  let lb = 0;
  for (const it of ITEMS) {
    if (!it || !it.id || it.id === 'mule') continue;
    lb += getQty(g, it.id) * num(it.weightLb, 1);
  }
  g.cart.load = Math.round(lb);
  return g.cart.load;
}

function overloadRatio(g) {
  const cap = cartCapacity(g);
  if (cap <= 0) return 2;
  return g.cart.load / cap;
}

function luxuryCount(g) {
  let n = 0;
  for (const it of ITEMS) if (it && it.category === 'luxury' && getQty(g, it.id) > 0) n++;
  return n;
}

// ---------------------------------------------------------------------------------
// The daily tick
// ---------------------------------------------------------------------------------

function emptyReport() {
  return {
    miles: 0, arrived: null, event: null, eventChoices: false,
    weatherChanged: false, deaths: [], recoveries: [], onsets: [],
    breakdown: null, lines: [], ended: false,
  };
}

/**
 * THE tick (SPEC §5.2). Thirteen ordered steps, one calendar day, never throws.
 * @returns {object} DayReport
 */
export function advanceDay(g) {
  const rep = emptyReport();
  try {
    // 1. Already over?
    if (!g || g.status !== 'playing') { rep.ended = true; return rep; }

    // 2. Calendar.
    g.day += 1;
    g.date = addDays(g.date, 1);
    g.stats.daysOnTrail += 1;
    g.atLandmark = null;
    g.pendingFord = null;

    // 3. Weather.
    rep.weatherChanged = rollWeather(g);
    if (rep.weatherChanged && g.weather.kind !== 'clear') {
      rep.lines.push(logLine(g, 'weather', weatherLine(g)));
    }

    // 4. Miles.
    const moved = travelDistance(g);
    let miles = moved;
    const next = nextLandmark(g.mile);
    let arrivedLm = null;
    if (next && g.mile + miles >= next.mile) {
      miles = Math.max(0, next.mile - g.mile);
      arrivedLm = next;
    }
    g.mile = Math.min(TOTAL_MILES, round2(g.mile + miles));
    g.stats.milesHiked = round2(g.stats.milesHiked + miles);
    rep.miles = Math.round(miles);
    rep.lines.push(logLine(g, 'travel', `Day ${g.day}: ${Math.round(miles)} miles. ${Math.round(g.mile)} of ${TOTAL_MILES}.`));

    // 5. Food.
    consumeFood(g, rep);

    // 6. Health.
    tickHealth(g, rep, { resting: false });

    // 7. Ailments.
    tickAilments(g, rep);

    // 8. Spirit.
    tickSpirit(g, rep, { resting: false });

    // 9. Cart.
    tickCart(g, rep);

    // 10. Snow line.
    if (tickSnow(g)) { rep.ended = true; syncRng(g); return rep; }
    if (g.status !== 'playing') { rep.ended = true; syncRng(g); return rep; }

    // 11. Arrival.
    if (arrivedLm) {
      g.atLandmark = arrivedLm.id;
      const idx = LANDMARKS.indexOf(arrivedLm);
      if (idx >= 0) g.landmarkIndex = idx;
      rep.arrived = arrivedLm;
      rep.lines.push(logLine(g, 'landmark', `You reach ${arrivedLm.name} (mile ${arrivedLm.mile}).`));
      const bump = arrivedLm.kind === 'town' ? BALANCE.spiritTown : BALANCE.spiritLandmark;
      for (const m of livingParty(g)) m.spirit = clamp(m.spirit + bump, 0, 100);
      if (arrivedLm.ford && !arrivedLm.ford.bridge) {
        g.pendingFord = { ...arrivedLm.ford, landmarkId: arrivedLm.id, waited: 0 };
      }
    } else {
      // 12. Event (only on a plain trail day).
      fireEvent(g, rep);
    }

    // 13. Win.
    checkEnd(g, rep);
    rep.ended = g.status !== 'playing';
  } catch (err) {
    // A bug must never take the page down; degrade to an uneventful day.
    rep.lines.push('The day passes in a blur of switchbacks.');
    if (g && typeof g === 'object' && !g.log) g.log = [];
  }
  syncRng(g);
  return rep;
}

function syncRng(g) { if (g && g.rng) g.rngCalls = g.rng.calls; }

function weatherLine(g) {
  const w = g.weather;
  const heavy = w.severity > 0.66;
  const map = {
    hot: heavy ? 'Heat hammers the trail; the water carries feel light and wrong.' : 'It turns hot. The crew starts hiking before dawn.',
    rain: heavy ? 'Rain comes sideways and does not stop.' : 'A steady rain sets in.',
    storm: 'Thunder walks along the ridge. Everyone gets low and small.',
    hail: 'Hail rattles off the cart like gravel.',
    snow: heavy ? 'Snow. Real snow, filling the tread ahead.' : 'Snow flurries drift through the pass.',
    smoke: heavy ? 'Smoke swallows the ridgeline. Everything tastes like a campfire.' : 'Woodsmoke haze settles into the valley.',
    fog: 'Fog closes in; the trail goes quiet.',
    wind: 'A hard wind comes off the crest and stays all day.',
  };
  return map[w.kind] || 'The weather turns.';
}

function travelDistance(g) {
  const pace = PACES[g.pace] || PACES.steady;
  const base = pace.base;
  const terrain = clamp(num(terrainFactor(g.mile), 1), 0.5, 1.3);
  const muleFactor = BALANCE.muleFloor + BALANCE.mulePerHead * Math.min(num(g.supplies.mules), 5);
  const healthFactor = BALANCE.healthFloor + BALANCE.healthRange * clamp(meanHealth(g) / 100, 0, 1);
  const wFactor = weatherSpeedFactor(g);
  const cartFactor = BALANCE.cartFloor + (1 - BALANCE.cartFloor) * clamp(num(g.cart.condition) / 100, 0, 1);

  let m = base * terrain * muleFactor * healthFactor * wFactor * cartFactor;

  // Ailments slow the whole crew (the party moves at the pace of its worst day).
  let ailMult = 1;
  const seen = new Set();
  for (const mem of livingParty(g)) {
    for (const a of mem.ailments || []) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      ailMult *= clamp(num(AILMENTS_BY_ID[a.id]?.paceMult, 1), 0.5, 1);
    }
  }
  m *= clamp(ailMult, BALANCE.ailmentPaceFloor, 1);

  // Postholing through rotten spring snow is the slowest walking there is.
  const pack = snowpack(g);
  if (pack > 0) m *= 1 - (1 - BALANCE.snowpackPaceMin) * pack;

  if (meanSpirit(g) < BALANCE.spiritLowThreshold) m *= BALANCE.spiritPacePenalty;

  const over = overloadRatio(g);
  if (over > 1) m *= clamp(1 - (over - 1) * 0.55, 0.55, 1);

  if (livingCount(g) === 0) return 0;
  return Math.max(1, Math.floor(m));
}

function consumeFood(g, rep) {
  const rat = RATIONS[g.rations] || RATIONS.filling;
  const need = livingCount(g) * rat.lbPerDay;
  const have = num(g.supplies.food);
  if (have >= need) {
    g.supplies.food = round2(have - need);
    g.starving = false;
  } else {
    g.supplies.food = 0;
    g.starving = need > 0;
    if (g.starving) {
      rep.lines.push(logLine(g, 'health', 'The food bags are empty. Dinner is hot water and whatever is at the bottom of a pocket.'));
    }
  }
  recomputeLoad(g);
}

function tickHealth(g, rep, { resting }) {
  const pace = PACES[g.pace] || PACES.steady;
  const rat = RATIONS[g.rations] || RATIONS.filling;
  const elev = num(elevAtMile(g.mile), 5000);
  const wCost = weatherHealthCost(g);
  const altCost = elev > BALANCE.altitudeFloorFt
    ? ((elev - BALANCE.altitudeFloorFt) / 1000) * BALANCE.altitudePerKFt : 0;
  const lux = Math.min(luxuryCount(g) * BALANCE.luxuryHealth, BALANCE.luxuryHealthCap);
  const over = overloadRatio(g);
  const healRate = num(perk(g, 'healRate', 0));
  const puffy = getQty(g, 'puffy') > 0;
  const clothing = getQty(g, 'clothing');
  const pack = snowpack(g);
  // An ice axe does not keep you warm, but it is the difference between a crossing and
  // a fall, and the crew that has one is not spending the day terrified.
  const packCost = pack * BALANCE.snowpackHealth * (getQty(g, 'ice_axe') > 0 ? 0.55 : 1);

  for (const m of livingParty(g)) {
    let d = BALANCE.regenRange * (1 - clamp(m.health, 0, 100) / 100) + BALANCE.regenBase;
    d += healRate;
    if (resting) d += BALANCE.restBonus;
    else {
      d -= pace.healthCost;
      d -= rat.healthCost;
    }
    if (resting) d -= rat.healthCost * 0.5;
    if (g.starving) d -= BALANCE.starveDrain;

    // Cold weather is much worse without insulation; a puffy and spare clothing help.
    let cold = wCost;
    if (g.weather.kind === 'snow' || g.weather.tempF < 30) {
      if (puffy) cold *= 0.6;
      if (clothing >= 2) cold *= 0.85;
    }
    d -= cold;
    d -= altCost;
    if (packCost > 0) d -= packCost * (resting ? 0.5 : 1);
    for (const a of m.ailments || []) d -= num(AILMENTS_BY_ID[a.id]?.healthDrainPerDay, 0);
    if (over > 1) d -= BALANCE.overloadDrain * Math.min(over - 1, 2);
    if (m.spirit < BALANCE.spiritLowThreshold) d -= BALANCE.lowSpiritDrain;
    d += lux;

    m.health = clamp(round2(m.health + d), 0, 100);
    if (m.health <= 0) killMember(g, rep, m, deathCause(g, m));
  }
  if (livingCount(g) === 0 && g.status === 'playing') {
    g.status = 'lost';
    g.cause = 'party-wipe';
    logLine(g, 'death', 'There is nobody left to carry the register. The crew is gone.');
  }
}

function deathCause(g, m) {
  if (m.ailments && m.ailments.length) {
    const worst = m.ailments
      .map((a) => AILMENTS_BY_ID[a.id])
      .filter(Boolean)
      .sort((x, y) => num(y.severity) - num(x.severity))[0];
    if (worst) return worst.id;
  }
  if (g.starving) return 'starvation';
  return 'exhaustion';
}

function killMember(g, rep, m, cause) {
  if (!m.alive) return;
  m.alive = false;
  m.health = 0;
  m.causeOfDeath = cause;
  m.diedMile = Math.round(g.mile);
  m.diedDate = { ...g.date };
  g.stats.deaths += 1;
  rep.deaths.push(m.name);

  const ail = AILMENTS_BY_ID[cause];
  const here = lastLandmark(g.mile) || { name: 'the trail' };
  const text = ail?.deathText
    ? fillTemplate(g, ail.deathText, { name: m.name, landmark: here.name })
    : `${m.name} does not get up. ${cause === 'starvation' ? 'There had been nothing in the food bag for days.' : 'The trail took more than the crew had left.'}`;
  rep.lines.push(logLine(g, 'death', text));
  const ep = pick(g.rng, EPITAPHS || []);
  if (ep) rep.lines.push(logLine(g, 'death', `Cairn at mile ${Math.round(g.mile)}: "${ep}"`));
  for (const other of livingParty(g)) other.spirit = clamp(other.spirit + BALANCE.spiritDeath, 0, 100);
  if (livingCount(g) === 0 && g.status === 'playing') {
    g.status = 'lost';
    g.cause = 'party-wipe';
  }
}

function ailmentCandidates(g) {
  const biome = safeBiome(g.mile);
  const kind = g.weather.kind;
  return (AILMENTS || []).filter((a) => {
    if (!a) return false;
    if (Array.isArray(a.biomes) && a.biomes.length && !a.biomes.includes(biome)) return false;
    if (a.weather && a.weather !== kind) return false;
    return true;
  });
}

function onsetChance(g, m) {
  const diff = difficultyOf(g);
  let p = (100 - clamp(m.health, 0, 100)) / BALANCE.onsetDivisor + BALANCE.onsetFloor;
  const w = g.weather.kind;
  if (w === 'snow' || w === 'storm' || w === 'hail' || w === 'rain') {
    p += BALANCE.onsetWeatherBonus * clamp(num(g.weather.severity, 0.5), 0, 1);
  }
  if (w === 'hot' || w === 'smoke') p += BALANCE.onsetWeatherBonus * 0.6 * clamp(num(g.weather.severity, 0.5), 0, 1);
  if (num(elevAtMile(g.mile), 0) > 10000) p += BALANCE.onsetAltitudeBonus;
  if (g.starving) p += BALANCE.onsetStarveBonus;
  p += snowpack(g) * BALANCE.snowpackIllness;   // wet feet and cold nights, for weeks
  if (getQty(g, 'first_aid') > 0) p *= 0.92;
  return clamp(p * diff.illnessMult, 0, 0.6);
}

function tickAilments(g, rep) {
  for (const m of livingParty(g)) {
    // Recoveries first.
    const keep = [];
    for (const a of m.ailments || []) {
      a.daysLeft = num(a.daysLeft) - 1;
      if (a.daysLeft <= 0) {
        const def = AILMENTS_BY_ID[a.id];
        rep.recoveries.push(m.name);
        rep.lines.push(logLine(g, 'health', def?.recoverText
          ? fillTemplate(g, def.recoverText, { name: m.name })
          : `${m.name} is over the worst of it.`));
        m.spirit = clamp(m.spirit + 3, 0, 100);
      } else keep.push(a);
    }
    m.ailments = keep;

    // New onset — at most one per member per day.
    if (!chance(g.rng, onsetChance(g, m))) continue;
    const pool = ailmentCandidates(g).filter((a) => !m.ailments.some((x) => x.id === a.id));
    if (!pool.length) continue;
    // Milder things are commoner than severe ones.
    const def = weighted(g.rng, pool, (a) => 1 / Math.max(1, num(a.severity, 1)));
    if (!def) continue;
    applyAilmentTo(g, rep, m, def);
  }
}

function applyAilmentTo(g, rep, m, def) {
  if (!m || !m.alive || !def) return null;
  if ((m.ailments || []).some((x) => x.id === def.id)) return null;
  const days = randInt(g.rng, num(def.minDays, 2), Math.max(num(def.minDays, 2), num(def.maxDays, 5)));
  m.ailments.push({ id: def.id, daysLeft: days });
  rep.onsets.push({ name: m.name, ailment: def.id });
  rep.lines.push(logLine(g, 'health', def.onsetText
    ? fillTemplate(g, def.onsetText, { name: m.name })
    : `${m.name} comes down with ${def.name}.`));
  m.spirit = clamp(m.spirit - 4, 0, 100);
  return def.id;
}

function tickSpirit(g, rep, { resting }) {
  const pace = PACES[g.pace] || PACES.steady;
  const rat = RATIONS[g.rations] || RATIONS.filling;
  const lux = luxuryCount(g) * BALANCE.spiritLuxury;
  const w = g.weather;
  const bad = { storm: 1.2, hail: 1.1, snow: 1.4, rain: 0.7, smoke: 0.9, hot: 0.7, fog: 0.4, wind: 0.4, clear: -0.5 }[w.kind] ?? 0;

  for (const m of livingParty(g)) {
    let d = BALANCE.spiritDrift;
    d += resting ? BALANCE.spiritRest : pace.spirit;
    d += rat.spirit;
    d -= bad * clamp(num(w.severity, 0.5), 0, 1);
    if (g.starving) d += BALANCE.spiritStarve;
    if (m.health > 80) d += 0.5;
    if (m.health < 35) d -= 0.6;
    d += lux;
    m.spirit = clamp(round2(m.spirit + d), 0, 100);
  }
  if (meanSpirit(g) < BALANCE.spiritLowThreshold && !resting) {
    rep.lines.push(logLine(g, 'health', 'Around the stove, the crew is talking about which town has a bus stop.'));
  }
}

function tickCart(g, rep) {
  const pace = PACES[g.pace] || PACES.steady;
  const terrain = clamp(num(terrainFactor(g.mile), 1), 0.5, 1.3);
  const rough = clamp(2 - terrain, 0.7, 1.4);
  const sev = clamp(num(g.weather.severity, 0.4), 0, 1);
  const over = overloadRatio(g);

  let wear = pace.cartWear * BALANCE.cartWearScale * rough * (1 + sev * 0.25);
  if (over > 1) wear *= 1 + (over - 1) * 0.8;
  g.cart.condition = clamp(round2(g.cart.condition - wear), 0, 100);

  const paceMult = num(BALANCE.breakdownPaceMult[g.pace], 1);
  const p = (BALANCE.breakdownBase + BALANCE.breakdownSlope * (1 - g.cart.condition / 100)) * paceMult;
  if (!chance(g.rng, p)) {
    // A separate, gentler roll for the things strapped to your body rather than the cart.
    if (chance(g.rng, BALANCE.gearFailureBase)) gearFailure(g, rep);
    return;
  }
  breakPart(g, rep);
}

function breakdownTable() {
  const rows = [];
  for (const p of (CART_PARTS || [])) rows.push({ part: p, cart: true, weight: 3 });
  for (const [p, w] of [['soles', 2], ['poles', 1.4], ['filter', 1.4]]) {
    if (ITEMS_BY_ID[`spare_${p}`]) rows.push({ part: p, cart: false, weight: w });
  }
  return rows;
}

function breakPart(g, rep) {
  const table = breakdownTable().filter((r) => r.cart);
  const row = weighted(g.rng, table, (r) => r.weight) || table[0];
  if (!row) return;
  const part = row.part;
  const spareId = `spare_${part}`;
  rep.breakdown = part;
  if (g.cart.parts) g.cart.parts[part] = 0;

  if (getQty(g, spareId) >= 1) {
    setQty(g, spareId, getQty(g, spareId) - 1);
    if (g.cart.parts) g.cart.parts[part] = 100;
    g.cart.condition = clamp(g.cart.condition + 22, 0, 100);
    recomputeLoad(g);
    rep.lines.push(logLine(g, 'event', `The cart's ${part} shears through. You have a spare ${part}; it is swapped in before dinner.`));
    return;
  }
  g.cart.condition = clamp(g.cart.condition - 18, 0, 100);
  const lost = randInt(g.rng, 1, 3);
  rep.lines.push(logLine(g, 'event', `The cart's ${part} shears through and there is no spare. ${lost} day${lost > 1 ? 's' : ''} lost bodging a repair.`));
  for (const m of livingParty(g)) m.spirit = clamp(m.spirit - 4, 0, 100);
  const sub = passDays(g, lost, { resting: false, reason: 'repair' });
  for (const l of sub.lines) rep.lines.push(l);
  for (const d of sub.deaths) rep.deaths.push(d);
  if (g.cart.parts) g.cart.parts[part] = 60;
}

function gearFailure(g, rep) {
  const table = breakdownTable().filter((r) => !r.cart);
  const row = weighted(g.rng, table, (r) => r.weight);
  if (!row) return;
  const part = row.part;
  const spareId = `spare_${part}`;
  rep.breakdown = part;
  const label = { soles: 'a pair of boots blows out', poles: 'a trekking pole snaps at the joint', filter: 'the water filter clogs solid' }[part];

  if (getQty(g, spareId) >= 1) {
    setQty(g, spareId, getQty(g, spareId) - 1);
    recomputeLoad(g);
    rep.lines.push(logLine(g, 'event', `On a talus field ${label}. You carry a spare — five minutes and it is handled.`));
    return;
  }
  rep.lines.push(logLine(g, 'event', `On a talus field ${label}, and nobody has a spare.`));
  const victim = pick(g.rng, livingParty(g));
  if (!victim) return;
  if (part === 'filter') {
    const def = AILMENTS_BY_ID.giardia || pick(g.rng, ailmentCandidates(g));
    if (def && chance(g.rng, 0.55)) applyAilmentTo(g, rep, victim, def);
  } else {
    victim.health = clamp(victim.health - (part === 'soles' ? 7 : 4), 0, 100);
    if (victim.health <= 0) killMember(g, rep, victim, 'exhaustion');
    const blist = AILMENTS_BY_ID.blisters;
    if (part === 'soles' && blist && chance(g.rng, 0.5)) applyAilmentTo(g, rep, victim, blist);
  }
  for (const m of livingParty(g)) m.spirit = clamp(m.spirit - 2, 0, 100);
}

function fireEvent(g, rep) {
  if (!chance(g.rng, BALANCE.eventChance)) return;
  let ev = null;
  try { ev = rollEvent(g, g.rng); } catch { ev = null; }
  if (!ev || typeof ev !== 'object') return;
  if (ev.once && (g.firedEvents || []).includes(ev.id)) return;
  if (!g.firedEvents) g.firedEvents = [];
  g.firedEvents.push(ev.id);
  g.stats.eventsSurvived += 1;
  rep.event = ev;
  rep.lines.push(logLine(g, 'event', fillTemplate(g, ev.title ? `${ev.title}: ${ev.text || ''}` : (ev.text || ''))));

  if (Array.isArray(ev.choices) && ev.choices.length) {
    // A choice card: the UI presents it and calls resolveChoice(). Nothing applies yet.
    rep.eventChoices = true;
    return;
  }
  const lines = applyEffects(g, ev.effects || {});
  for (const l of lines) rep.lines.push(l);
  if (ev.resultText) rep.lines.push(logLine(g, 'event', fillTemplate(g, ev.resultText)));
  checkEnd(g, rep);
}

/**
 * Resolve a choice card option (the UI's counterpart to `fireEvent`).
 * @returns {{ok:boolean, success:boolean, lines:string[]}}
 */
export function resolveChoice(g, event, choiceIndex) {
  const out = { ok: false, success: false, lines: [] };
  try {
    const ch = event?.choices?.[choiceIndex];
    if (!ch) { out.lines.push('Nothing comes of it.'); return out; }
    out.ok = true;
    const hasChance = typeof ch.chance === 'number';
    const success = hasChance ? chance(g.rng, ch.chance) : true;
    out.success = success;
    const fx = success ? ch.effects : (ch.failEffects || {});
    const txt = success ? ch.resultText : (ch.failText || ch.resultText);
    for (const l of applyEffects(g, fx || {})) out.lines.push(l);
    if (txt) out.lines.push(logLine(g, 'event', fillTemplate(g, txt)));
    checkEnd(g, { lines: out.lines, deaths: [] });
  } catch {
    out.lines.push('The moment passes.');
  }
  syncRng(g);
  return out;
}

function checkEnd(g, rep) {
  if (g.status !== 'playing') return;
  if (livingCount(g) === 0) {
    g.status = 'lost'; g.cause = 'party-wipe';
    rep?.lines?.push(logLine(g, 'death', 'The crew is gone. The register at the northern monument stays unsigned.'));
    return;
  }
  if (g.snowMile <= g.mile) {
    g.status = 'lost'; g.cause = 'snowed-off';
    rep?.lines?.push(logLine(g, 'weather', 'The snow line catches you. The season is over.'));
    return;
  }
  if (g.mile >= TOTAL_MILES) {
    g.mile = TOTAL_MILES;
    g.status = 'won'; g.cause = 'finished';
    rep?.lines?.push(logLine(g, 'landmark', 'Monument 78. The crew touches the wooden obelisk on the Canadian border and nobody says anything for a while.'));
  }
}

// ---------------------------------------------------------------------------------
// Rest / zero days
// ---------------------------------------------------------------------------------

/** Internal: n days of not travelling. Used by rest, repairs, foraging and fords. */
function passDays(g, n, { resting = true, reason = 'rest' } = {}) {
  const out = { days: 0, lines: [], deaths: [], recoveries: [], ended: false };
  const count = Math.max(0, Math.min(30, Math.floor(num(n))));
  for (let i = 0; i < count; i++) {
    if (g.status !== 'playing') break;
    g.day += 1;
    g.date = addDays(g.date, 1);
    g.stats.daysOnTrail += 1;
    if (resting) {
      g.stats.restDays += 1;
      // A layover is also a maintenance day — this is the crew's only free repair.
      g.cart.condition = clamp(round2(g.cart.condition + BALANCE.cartRestRepair), 0, 100);
    }
    rollWeather(g);
    const rep = emptyReport();
    consumeFood(g, rep);
    tickHealth(g, rep, { resting });
    tickAilments(g, rep);
    tickSpirit(g, rep, { resting });
    tickSnow(g);
    checkEnd(g, rep);
    out.days += 1;
    out.lines.push(...rep.lines);
    out.deaths.push(...rep.deaths);
    out.recoveries.push(...rep.recoveries);
  }
  out.ended = g.status !== 'playing';
  syncRng(g);
  return out;
}

/**
 * Pay somebody with a workshop to true the wheels and re-tension the frame.
 * Only worth doing where there is a road, which is exactly where the stores are.
 * @returns {{ok:boolean, reason?:string, cost?:number, restored?:number}}
 */
export function repairCart(g, mult = 1) {
  try {
    if (!g || g.status !== 'playing') return { ok: false, reason: 'The run is over.' };
    const missing = 100 - num(g.cart.condition);
    if (missing < 1) return { ok: false, reason: 'The cart is already sound.' };
    const rate = BALANCE.cartRepairCostPerPoint * (Number(mult) || 1);
    const money = num(g.supplies.money);
    if (money < rate) return { ok: false, reason: 'You cannot afford even an hour of their time.' };
    // Spend what you have, up to a full restoration.
    const points = Math.min(missing, Math.floor(money / rate));
    const cost = round2(points * rate);
    g.supplies.money = round2(money - cost);
    g.stats.moneySpent = round2(g.stats.moneySpent + cost);
    g.cart.condition = clamp(round2(g.cart.condition + points), 0, 100);
    if (g.cart.parts) for (const k of Object.keys(g.cart.parts)) g.cart.parts[k] = Math.max(g.cart.parts[k], g.cart.condition);
    logLine(g, 'store', `$${cost.toFixed(2)} of work on the cart. It rolls at ${Math.round(g.cart.condition)}%.`);
    return { ok: true, cost, restored: points };
  } catch { return { ok: false, reason: 'Nobody here works on carts.' }; }
}

/** What a full repair would cost here, for the store UI. */
export function repairQuote(g, mult = 1) {
  const missing = Math.max(0, 100 - num(g?.cart?.condition));
  return round2(missing * BALANCE.cartRepairCostPerPoint * (Number(mult) || 1));
}

/** Camp for n days: no miles, better recovery, morale up, snow line keeps coming. */
export function restDays(g, n) {
  const out = { days: 0, lines: [], deaths: [], recoveries: [], ended: true };
  try {
    if (!g || g.status !== 'playing') return out;
    const days = Math.max(0, Math.min(30, Math.floor(num(n))));
    if (days === 0) { out.ended = false; return out; }
    logLine(g, 'travel', `The crew takes ${days} day${days > 1 ? 's' : ''} off at ${(lastLandmark(g.mile) || { name: 'camp' }).name}.`);
    const r = passDays(g, days, { resting: true, reason: 'rest' });
    out.days = r.days; out.lines = r.lines; out.deaths = r.deaths;
    out.recoveries = r.recoveries; out.ended = r.ended;
  } catch { /* never throw */ }
  return out;
}

// ---------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------

function effMult(g, mult) {
  const m = Number.isFinite(Number(mult)) ? Number(mult) : 1;
  return perk(g, 'haggle', false) ? m * BALANCE.haggleMult : m;
}

/** Unit price for an item at this store, including the haggle perk. */
export function unitPrice(g, itemId, mult) {
  const p = priceOf(itemId, effMult(g, mult));
  return Number.isFinite(p) ? p : 0;
}

/** @returns {{ok:boolean, reason?:string, cost?:number, unit?:number, qty?:number}} */
export function buy(g, itemId, qty, mult = 1) {
  try {
    if (!g || g.status !== 'playing') return { ok: false, reason: 'The run is over.' };
    const item = ITEMS_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'They do not stock that.' };
    const n = Math.floor(num(qty));
    if (!(n > 0)) return { ok: false, reason: 'Choose a quantity.' };
    const cap = num(item.max, Infinity);
    if (getQty(g, itemId) + n > cap) return { ok: false, reason: `You cannot carry more than ${cap} ${item.unit === 'lb' ? 'lb' : ''}${item.name}.`.replace('  ', ' ') };
    const unit = unitPrice(g, itemId, mult);
    const cost = round2(unit * n);
    if (cost > round2(num(g.supplies.money))) return { ok: false, reason: 'Not enough money.' };
    g.supplies.money = round2(num(g.supplies.money) - cost);
    setQty(g, itemId, getQty(g, itemId) + n);
    g.stats.moneySpent = round2(g.stats.moneySpent + cost);
    recomputeLoad(g);
    logLine(g, 'store', `Bought ${n} ${item.name} for $${cost.toFixed(2)}.`);
    return { ok: true, cost, unit, qty: n };
  } catch { return { ok: false, reason: 'The register jams.' }; }
}

export function sell(g, itemId, qty, mult = 1) {
  try {
    if (!g) return { ok: false, reason: 'No game.' };
    const item = ITEMS_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'Nobody wants that.' };
    const n = Math.floor(num(qty));
    if (!(n > 0)) return { ok: false, reason: 'Choose a quantity.' };
    if (getQty(g, itemId) < n) return { ok: false, reason: `You only have ${getQty(g, itemId)}.` };
    const unit = round2(unitPrice(g, itemId, mult) * BALANCE.sellRatio);
    const paid = round2(unit * n);
    setQty(g, itemId, getQty(g, itemId) - n);
    g.supplies.money = round2(num(g.supplies.money) + paid);
    recomputeLoad(g);
    logLine(g, 'store', `Sold ${n} ${item.name} for $${paid.toFixed(2)}.`);
    return { ok: true, paid, unit, qty: n };
  } catch { return { ok: false, reason: 'No deal.' }; }
}

// ---------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------

/** Use a consumable on a party member. Medical items shorten what they cure. */
export function useItem(g, itemId, memberIndex) {
  const out = { ok: false, reason: '', lines: [] };
  try {
    const item = ITEMS_BY_ID[itemId];
    if (!item) { out.reason = 'No such item.'; return out; }
    if (getQty(g, itemId) < 1) { out.reason = `You have no ${item.name}.`; return out; }
    const m = g.party?.[memberIndex];
    if (!m || !m.alive) { out.reason = 'Nobody there to help.'; return out; }
    if (item.category !== 'medical') { out.reason = `${item.name} is not something you use up on someone.`; return out; }

    setQty(g, itemId, getQty(g, itemId) - 1);
    recomputeLoad(g);

    let healed = itemId === 'first_aid' ? 22 : itemId === 'electrolytes' ? 10 : 6;
    let shortened = 0;
    for (const a of m.ailments || []) {
      const def = AILMENTS_BY_ID[a.id];
      if (def && Array.isArray(def.curedBy) && def.curedBy.includes(itemId)) {
        a.daysLeft = Math.max(0, Math.floor(num(a.daysLeft) / 2));
        shortened++;
      }
    }
    m.ailments = (m.ailments || []).filter((a) => a.daysLeft > 0);
    m.health = clamp(round2(m.health + healed), 0, 100);
    m.spirit = clamp(m.spirit + 3, 0, 100);
    out.ok = true;
    out.lines.push(logLine(g, 'health', shortened
      ? `${item.name} on ${m.name}: the worst of it eases off.`
      : `${item.name} on ${m.name}. It helps a little.`));
    syncRng(g);
    return out;
  } catch { out.reason = 'That did not work.'; return out; }
}

// ---------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------

const EFFECT_SPECIALS = new Set(['food', 'money', 'mules', 'miles', 'spirit', 'health', 'days',
  'ailment', 'kill', 'partHealth', 'cartCondition', 'weather']);

/** Every legal effect key from SPEC §3.4, applied to `g`. Returns human-readable lines. */
export function applyEffects(g, effects) {
  const lines = [];
  try {
    if (!g || !effects || typeof effects !== 'object') return lines;

    if ('food' in effects) {
      const v = num(effects.food);
      const before = num(g.supplies.food);
      g.supplies.food = Math.max(0, round2(before + v));
      const delta = round2(g.supplies.food - before);
      if (delta) lines.push(logLine(g, 'event', delta > 0 ? `+${Math.abs(delta)} lb of food.` : `${Math.abs(delta)} lb of food gone.`));
    }
    if ('money' in effects) {
      const v = num(effects.money);
      const before = num(g.supplies.money);
      g.supplies.money = Math.max(0, round2(before + v));
      const delta = round2(g.supplies.money - before);
      if (delta < 0) g.stats.moneySpent = round2(g.stats.moneySpent + Math.abs(delta));
      if (delta) lines.push(logLine(g, 'event', delta > 0 ? `+$${Math.abs(delta).toFixed(2)}.` : `-$${Math.abs(delta).toFixed(2)}.`));
    }
    if ('mules' in effects) {
      const v = num(effects.mules);
      const before = num(g.supplies.mules);
      g.supplies.mules = Math.max(0, Math.round(before + v));
      const delta = g.supplies.mules - before;
      if (delta) lines.push(logLine(g, 'event', delta > 0 ? `You gain ${delta} mule${delta > 1 ? 's' : ''}.` : `You lose ${Math.abs(delta)} mule${Math.abs(delta) > 1 ? 's' : ''}.`));
    }
    // Item quantities (any id in the catalog).
    for (const key of Object.keys(effects)) {
      if (EFFECT_SPECIALS.has(key)) continue;
      const item = ITEMS_BY_ID[key];
      if (!item) continue;
      const v = num(effects[key]);
      if (!v) continue;
      const before = getQty(g, key);
      setQty(g, key, before + v);
      const delta = round2(getQty(g, key) - before);
      if (delta) lines.push(logLine(g, 'event', delta > 0 ? `+${delta} ${item.name}.` : `${item.name}: ${delta}.`));
    }
    recomputeLoad(g);

    if ('miles' in effects) {
      const v = num(effects.miles);
      const before = g.mile;
      g.mile = clamp(round2(g.mile + v), 0, TOTAL_MILES);
      const delta = round2(g.mile - before);
      if (delta > 0) g.stats.milesHiked = round2(g.stats.milesHiked + delta);
      const lm = lastLandmark(g.mile);
      const idx = lm ? LANDMARKS.indexOf(lm) : -1;
      if (idx >= 0) g.landmarkIndex = idx;
      if (delta) lines.push(logLine(g, 'event', delta > 0 ? `You gain ${Math.abs(delta)} miles.` : `You lose ${Math.abs(delta)} miles.`));
    }
    if ('spirit' in effects) {
      const v = num(effects.spirit);
      for (const m of livingParty(g)) m.spirit = clamp(round2(m.spirit + v), 0, 100);
      if (v) lines.push(logLine(g, 'event', v > 0 ? 'Morale lifts.' : 'Morale sags.'));
    }
    if ('health' in effects) {
      const v = num(effects.health);
      const rep = emptyReport();
      for (const m of livingParty(g)) {
        m.health = clamp(round2(m.health + v), 0, 100);
        if (m.health <= 0) killMember(g, rep, m, 'injury');
      }
      lines.push(...rep.lines);
      if (v) lines.push(logLine(g, 'health', v > 0 ? 'Everyone feels a bit better.' : 'The crew takes a beating.'));
    }
    if ('cartCondition' in effects) {
      g.cart.condition = clamp(round2(g.cart.condition + num(effects.cartCondition)), 0, 100);
      lines.push(logLine(g, 'event', `The cart is at ${Math.round(g.cart.condition)}%.`));
    }
    if ('partHealth' in effects) {
      const v = num(effects.partHealth);
      const keys = Object.keys(g.cart.parts || {});
      const key = pick(g.rng, keys);
      if (key) {
        g.cart.parts[key] = clamp(round2(num(g.cart.parts[key], 100) + v), 0, 100);
        lines.push(logLine(g, 'event', `The ${key} is at ${Math.round(g.cart.parts[key])}%.`));
        if (g.cart.parts[key] <= 0) {
          const rep = emptyReport();
          breakPart(g, rep);
          lines.push(...rep.lines);
        }
      }
    }
    if ('weather' in effects && WEATHERS.includes(effects.weather)) {
      g.weather = {
        kind: effects.weather,
        severity: round2(0.45 + g.rng() * 0.5),
        tempF: tempFor(g, effects.weather),
        daysLeft: randInt(g.rng, 1, 3),
      };
      lines.push(logLine(g, 'weather', weatherLine(g)));
    }
    if ('ailment' in effects && effects.ailment) {
      const def = AILMENTS_BY_ID[effects.ailment];
      const victim = pick(g.rng, livingParty(g).filter((m) => !(m.ailments || []).some((a) => a.id === effects.ailment)))
        || pick(g.rng, livingParty(g));
      if (def && victim) {
        const rep = emptyReport();
        applyAilmentTo(g, rep, victim, def);
        lines.push(...rep.lines);
      }
    }
    if (effects.kill) {
      const victim = pick(g.rng, livingParty(g));
      if (victim) {
        const rep = emptyReport();
        killMember(g, rep, victim, 'accident');
        lines.push(...rep.lines);
      }
    }
    if ('days' in effects) {
      const v = Math.round(num(effects.days));
      if (v > 0) {
        lines.push(logLine(g, 'event', `${v} day${v > 1 ? 's' : ''} lost.`));
        const sub = passDays(g, v, { resting: false, reason: 'delay' });
        lines.push(...sub.lines);
      }
    }
    checkEnd(g, { lines, deaths: [] });
  } catch { /* effects must never break a day */ }
  syncRng(g);
  return lines;
}

// ---------------------------------------------------------------------------------
// Fords
// ---------------------------------------------------------------------------------

const FORD_FLOW = { calm: 0.10, brisk: 0.26, raging: 0.46 };

/** Base failure odds for a crossing method, given the ford and the crew. */
export function fordRisk(g, method) {
  const f = g.pendingFord || {};
  const flow = num(FORD_FLOW[f.flow], 0.26);
  const depth = clamp(num(f.depthFt, 3) / 6, 0, 1.4);
  let risk = flow * (0.55 + depth);
  // Peak snowmelt: the same creek is a different creek in May than it is in August.
  risk *= 1 + 0.8 * snowpack(g);
  if (f.waited) risk *= 0.72;
  if (method === 'rock-hop') risk *= 0.45;
  else if (method === 'raft') risk *= 0.75;
  else if (method === 'shuttle' || method === 'wait') risk = 0;
  risk -= num(perk(g, 'fordBonus', 0));
  const h = meanHealth(g) / 100;
  risk *= clamp(1.25 - 0.4 * h, 0.8, 1.3);
  return clamp(risk, 0, 0.9);
}

/**
 * Apply the outcome of the ford minigame.
 * @param {object} g
 * @param {'ford'|'rock-hop'|'raft'|'shuttle'|'wait'} method
 * @param {{success?:boolean, severity?:number}} [outcome] from minigames/ford.js
 */
export function resolveFord(g, method, outcome) {
  const out = { ok: true, success: true, lines: [], losses: {}, method };
  try {
    if (!g || g.status !== 'playing') { out.ok = false; return out; }
    const f = g.pendingFord;
    const name = f?.name || 'the creek';

    if (method === 'wait') {
      out.lines.push(logLine(g, 'travel', `You camp on the south bank of ${name} and wait for the snowmelt to drop overnight.`));
      const sub = passDays(g, 1, { resting: true, reason: 'ford-wait' });
      out.lines.push(...sub.lines);
      if (g.pendingFord) g.pendingFord.waited = (g.pendingFord.waited || 0) + 1;
      out.success = true;
      syncRng(g);
      return out; // the ford is still pending; the player chooses again
    }

    if (method === 'shuttle') {
      const fee = 40 + randInt(g.rng, 0, 30);
      const paid = Math.min(fee, num(g.supplies.money));
      g.supplies.money = round2(num(g.supplies.money) - paid);
      g.stats.moneySpent = round2(g.stats.moneySpent + paid);
      out.losses.money = paid;
      out.lines.push(logLine(g, 'travel', paid >= fee
        ? `$${paid.toFixed(2)} to a local with a truck, and ${name} is behind you.`
        : `You scrape together $${paid.toFixed(2)} and the driver takes pity on you at ${name}.`));
      const sub = passDays(g, 1, { resting: false, reason: 'shuttle' });
      out.lines.push(...sub.lines);
      g.stats.fordsCrossed += 1;
      g.pendingFord = null;
      checkEnd(g, out);
      syncRng(g);
      return out;
    }

    const risk = fordRisk(g, method);
    const success = typeof outcome?.success === 'boolean' ? outcome.success : !chance(g.rng, risk);
    const severity = clamp(num(outcome?.severity, success ? 0.15 : 0.4 + g.rng() * 0.6), 0, 1);
    out.success = success;

    if (method === 'rock-hop') {
      const sub = passDays(g, 1, { resting: false, reason: 'rock-hop' });
      out.lines.push(...sub.lines);
    }

    if (success) {
      out.lines.push(logLine(g, 'travel', `The crew crosses ${name} without incident. Boots off, boots on, keep walking.`));
      for (const m of livingParty(g)) m.spirit = clamp(m.spirit + 4, 0, 100);
    } else {
      out.lines.push(logLine(g, 'event', `${name} takes the crew off their feet.`));
      const foodLost = Math.round(num(g.supplies.food) * (0.12 + severity * 0.35));
      if (foodLost > 0) {
        g.supplies.food = Math.max(0, round2(num(g.supplies.food) - foodLost));
        out.losses.food = foodLost;
        out.lines.push(logLine(g, 'event', `${foodLost} lb of food washes downstream.`));
      }
      if (severity > 0.45 && num(g.supplies.mules) > 0 && chance(g.rng, severity * 0.55)) {
        g.supplies.mules = Math.max(0, num(g.supplies.mules) - 1);
        out.losses.mules = 1;
        out.lines.push(logLine(g, 'event', 'A mule is swept into the strainer and does not come out.'));
      }
      const dmg = Math.round(6 + severity * 22);
      const rep = emptyReport();
      for (const m of livingParty(g)) {
        m.health = clamp(round2(m.health - dmg), 0, 100);
        m.spirit = clamp(m.spirit - 6, 0, 100);
        if (m.health <= 0) killMember(g, rep, m, 'exposure');
      }
      out.lines.push(...rep.lines);
      if (severity > 0.75 && chance(g.rng, (severity - 0.7) * 1.1)) {
        const victim = pick(g.rng, livingParty(g));
        if (victim && livingCount(g) > 1) {
          const rep2 = emptyReport();
          killMember(g, rep2, victim, 'drowning');
          out.lines.push(...rep2.lines);
          out.losses.member = victim.name;
        }
      }
      const hypo = AILMENTS_BY_ID.hypothermia;
      if (hypo && severity > 0.35) {
        const victim = pick(g.rng, livingParty(g));
        const rep3 = emptyReport();
        if (victim && chance(g.rng, severity * 0.6)) applyAilmentTo(g, rep3, victim, hypo);
        out.lines.push(...rep3.lines);
      }
      recomputeLoad(g);
    }
    g.stats.fordsCrossed += 1;
    g.pendingFord = null;
    checkEnd(g, out);
  } catch { out.ok = false; }
  syncRng(g);
  return out;
}

// ---------------------------------------------------------------------------------
// Foraging
// ---------------------------------------------------------------------------------

/** Ceiling on a forage haul at this spot, before the minigame's own performance. */
export function forageCap(g) {
  const lm = lastLandmark(g.mile) || {};
  const q = { poor: 0.35, fair: 0.6, good: 0.85, rich: 1.0 }[lm.forage] ?? 0.5;
  const bonus = num(perk(g, 'forageBonus', 1), 1);
  return Math.round(BALANCE.forageCapLb * q * bonus);
}

/** Fold a forage minigame result into the game. Costs one day (SPEC §5.5). */
export function applyForageResult(g, lbs) {
  const out = { ok: false, lbs: 0, lines: [], ended: false };
  try {
    if (!g || g.status !== 'playing') return out;
    const bonus = num(perk(g, 'forageBonus', 1), 1);
    const got = Math.max(0, Math.min(BALANCE.forageCapLb, Math.round(num(lbs) * bonus)));
    g.supplies.food = round2(num(g.supplies.food) + got);
    g.stats.lbsForaged = round2(g.stats.lbsForaged + got);
    recomputeLoad(g);
    out.ok = true;
    out.lbs = got;
    out.lines.push(logLine(g, 'travel', got > 0
      ? `A day spent foraging: ${got} lb of berries, greens and one lucky trout.`
      : 'A day spent foraging turns up almost nothing worth carrying.'));
    for (const m of livingParty(g)) m.spirit = clamp(m.spirit + (got > 20 ? 3 : -1), 0, 100);
    const sub = passDays(g, 1, { resting: false, reason: 'forage' });
    out.lines.push(...sub.lines);
    out.ended = g.status !== 'playing';
  } catch { /* never throw */ }
  return out;
}

// ---------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------

export function setPace(g, pace) {
  if (!g || !PACES[pace]) return { ok: false, reason: 'No such pace.' };
  if (g.pace === pace) return { ok: true, pace };
  g.pace = pace;
  logLine(g, 'travel', `Pace set to ${PACES[pace].label.toLowerCase()}.`);
  return { ok: true, pace };
}

export function setRations(g, r) {
  if (!g || !RATIONS[r]) return { ok: false, reason: 'No such ration level.' };
  if (g.rations === r) return { ok: true, rations: r };
  g.rations = r;
  logLine(g, 'travel', `Rations set to ${RATIONS[r].label.toLowerCase()}.`);
  return { ok: true, rations: r };
}

export function isOver(g) { return !g || g.status !== 'playing'; }

// ---------------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------------

/** Plain-JSON snapshot. The rng function is dropped; `{seed, rngCalls}` replaces it. */
export function serialize(g) {
  const snapshot = { ...g };
  snapshot.rngCalls = g.rng ? g.rng.calls : num(g.rngCalls);
  delete snapshot.rng;
  return JSON.stringify(snapshot);
}

/** Rebuild a game from `serialize` output, restoring the exact RNG stream position. */
export function deserialize(json) {
  // A save file is user-controlled input and may be truncated, hand-edited or garbage.
  // Loading one must never throw — a corrupt save reads as "no save", not as a crash.
  let o = null;
  if (typeof json === 'string') {
    try { o = JSON.parse(json); } catch { return null; }
    if (!o || typeof o !== 'object') return null;
    o = { ...o };
  } else if (json && typeof json === 'object') {
    o = { ...json };
  }
  if (!o) return null;
  o.version = num(o.version, 1);
  o.seed = (num(o.seed) >>> 0);
  o.rngCalls = Math.max(0, Math.floor(num(o.rngCalls)));
  o.rng = makeRng(o.seed, o.rngCalls);
  o.party = Array.isArray(o.party) ? o.party : [];
  for (const m of o.party) {
    m.ailments = Array.isArray(m.ailments) ? m.ailments : [];
    m.alive = !!m.alive;
    m.health = clamp(num(m.health), 0, 100);
    m.spirit = clamp(num(m.spirit, 50), 0, 100);
  }
  o.supplies = { ...emptySupplies(), ...(o.supplies || {}) };
  o.cart = o.cart || { condition: 100, load: 0, parts: partsRecord() };
  o.cart.parts = { ...partsRecord(), ...(o.cart.parts || {}) };
  o.weather = o.weather || { kind: 'clear', tempF: 60, severity: 0.2, daysLeft: 1 };
  o.log = Array.isArray(o.log) ? o.log : [];
  o.firedEvents = Array.isArray(o.firedEvents) ? o.firedEvents : [];
  o.stats = {
    milesHiked: 0, daysOnTrail: 0, eventsSurvived: 0, fordsCrossed: 0,
    lbsForaged: 0, moneySpent: 0, restDays: 0, deaths: 0, ...(o.stats || {}),
  };
  o.status = ['playing', 'won', 'lost'].includes(o.status) ? o.status : 'playing';
  o.difficulty = DIFFICULTIES[o.difficulty] ? o.difficulty : 'normal';
  o.pace = PACES[o.pace] ? o.pace : 'steady';
  o.rations = RATIONS[o.rations] ? o.rations : 'filling';
  recomputeLoad(o);
  return o;
}
