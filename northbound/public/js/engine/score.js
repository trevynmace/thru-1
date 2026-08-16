// NORTHBOUND — end-of-run scoring.
//
// Oregon Trail's scoring, reskinned: you are graded on who and what you still have when
// the walking stops, then multiplied by how hard your occupation made the run. Dying rich
// is worth less than arriving broke with five people.
import { ITEMS, TOTAL_MILES, OCCUPATIONS } from './data.js';
import { DIFFICULTIES } from './sim.js';

/** Points for one surviving crew member, by their health. Mirrors OT's health tiers. */
export const HEALTH_TIERS = [
  { min: 85, label: 'in good health', points: 200 },
  { min: 60, label: 'in fair health', points: 150 },
  { min: 30, label: 'in poor health', points: 100 },
  { min: 0,  label: 'barely standing', points: 60 },
];

export const POINTS = {
  perMule: 20,
  perFoodLb: 1 / 25,
  perSparePart: 2,
  perClothing: 2,
  perDollar: 1 / 5,
  perMile: 1 / 50,
  finishBonus: 400,
  cartCondition: 0.4,   // per point of remaining cart condition
};

/** Highest first. `rank` is the first row whose `min` the total clears. */
export const RANKS = [
  { min: 3200, rank: 'Trail Legend' },
  { min: 1900, rank: 'Thru-Hiker' },
  { min: 1000, rank: 'Section Hiker' },
  { min: 400,  rank: 'Weekend Warrior' },
  { min: -Infinity, rank: 'Day Hiker' },
];

export function rankFor(total) {
  const n = Number(total) || 0;
  return (RANKS.find((r) => n >= r.min) || RANKS[RANKS.length - 1]).rank;
}

function healthTier(h) {
  const v = Number(h) || 0;
  return HEALTH_TIERS.find((t) => v >= t.min) || HEALTH_TIERS[HEALTH_TIERS.length - 1];
}

function qtyOf(g, id) {
  const key = id === 'mule' ? 'mules' : id;
  return Number(g?.supplies?.[key]) || 0;
}

/**
 * @param {object} g game state
 * @returns {{rows: {label:string, qty:number, points:number}[], subtotal:number,
 *            multiplier:number, total:number, rank:string}}
 */
export function scoreGame(g) {
  const rows = [];
  const add = (label, qty, points) => {
    const p = Math.round(Number(points) || 0);
    if (qty || p) rows.push({ label, qty: Math.round((Number(qty) || 0) * 100) / 100, points: p });
  };

  const party = Array.isArray(g?.party) ? g.party : [];
  const living = party.filter((m) => m && m.alive);

  // Crew, bucketed by health so the score screen reads like Oregon Trail's.
  for (const tier of HEALTH_TIERS) {
    const n = living.filter((m) => healthTier(m.health) === tier).length;
    if (n) add(`Crew ${tier.label}`, n, n * tier.points);
  }
  if (!living.length) add('Crew who finished', 0, 0);

  add('Mules', qtyOf(g, 'mule'), qtyOf(g, 'mule') * POINTS.perMule);
  add('Food remaining (lb)', qtyOf(g, 'food'), qtyOf(g, 'food') * POINTS.perFoodLb);

  const spareIds = (ITEMS || []).filter((i) => i && typeof i.id === 'string' && i.id.startsWith('spare_')).map((i) => i.id);
  const spares = spareIds.reduce((s, id) => s + qtyOf(g, id), 0);
  add('Spare parts', spares, spares * POINTS.perSparePart);

  const clothes = qtyOf(g, 'clothing') + qtyOf(g, 'puffy');
  add('Clothing', clothes, clothes * POINTS.perClothing);

  const cash = qtyOf(g, 'money');
  add('Cash on hand', Math.round(cash * 100) / 100, cash * POINTS.perDollar);

  const cart = Math.max(0, Number(g?.cart?.condition) || 0);
  add('Cart condition', Math.round(cart), cart * POINTS.cartCondition);

  const miles = Math.max(0, Math.round(Number(g?.mile) || 0));
  add('Miles walked', miles, miles * POINTS.perMile);

  if (g?.status === 'won') add('Reached the Northern Terminus', 1, POINTS.finishBonus);

  const subtotal = rows.reduce((s, r) => s + r.points, 0);

  const occ = (OCCUPATIONS || []).find((o) => o.id === g?.leader?.occupation);
  const occMult = Number(occ?.scoreMult) || 1;
  const diffMult = Number(DIFFICULTIES[g?.difficulty]?.scoreMult) || 1;
  const multiplier = Math.round(occMult * diffMult * 100) / 100;

  const total = Math.max(0, Math.round(subtotal * multiplier));
  return {
    rows,
    subtotal,
    multiplier,
    occupation: occ?.name || occ?.id || 'Hiker',
    total,
    rank: rankFor(total),
    miles,
    finished: g?.status === 'won',
    pct: Math.round((miles / (TOTAL_MILES || 2650)) * 100),
  };
}
