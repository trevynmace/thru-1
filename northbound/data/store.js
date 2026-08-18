// NORTHBOUND — what each store actually has on the shelf.
//
// The Southern Terminus outfitter carries everything, because that is where you are
// supposed to make your real decisions. Everything north of it is a gas station, a
// resort porch or a hiker box, and the stock thins out the further you get from a road.
import { ITEMS, ITEMS_BY_ID } from './items.js';

/** Display order for a full-service outfitter. */
export const STORE_STOCK = [
  'food',
  'mule',
  'spare_wheel', 'spare_axle', 'spare_hitch',
  'spare_soles', 'spare_poles', 'spare_filter',
  'clothing', 'puffy',
  'first_aid', 'electrolytes', 'blister_kit',
  'bear_can', 'ice_axe', 'stove_fuel', 'water_carry',
  'camp_chair', 'paperback', 'harmonica',
];

// A tiny store cannot sell you a mule or a cart axle. These are the tiers.
const TIER = {
  // Everything. Only the terminus outfitter and the big trail towns.
  full: STORE_STOCK,

  // A real town with a gear shop, but no livestock and no cart parts beyond the basics.
  town: [
    'food', 'spare_soles', 'spare_poles', 'spare_filter', 'spare_wheel',
    'clothing', 'puffy', 'first_aid', 'electrolytes', 'blister_kit',
    'stove_fuel', 'water_carry', 'paperback',
  ],

  // A resort porch, a post office, a general store with three shelves.
  outpost: [
    'food', 'spare_soles', 'first_aid', 'electrolytes', 'blister_kit',
    'stove_fuel', 'water_carry',
  ],

  // A hiker box and a vending machine. Calories and whatever somebody left behind.
  scrap: ['food', 'electrolytes', 'blister_kit'],
};

// Stores that carry the Sierra-entry kit no matter their size — this is where the
// bear canister and the ice axe are actually required, so this is where they sell them.
const SIERRA_GATEWAYS = new Set(['kennedy-meadows', 'kennedy', 'bishop', 'kearsarge', 'lone-pine']);

// Stores big enough to sell you a replacement mule.
const STOCK_TOWNS = new Set(['campo', 'tehachapi', 'kennedy-meadows', 'kennedy', 'tahoe', 'ashland', 'cascade-locks']);

/**
 * Which tier a landmark's store belongs to. Remoteness is encoded in the price
 * multiplier the trail data already carries, so we reuse it rather than inventing a
 * second scale: cheap store = road access = deep shelves.
 */
function tierFor(landmark) {
  const store = landmark && landmark.store;
  if (!store) return null;
  const mult = Number(store.mult) || 1;
  if (landmark.kind === 'terminus' || mult <= 1.05) return 'full';
  if (mult <= 1.35) return 'town';
  if (mult <= 1.75) return 'outpost';
  return 'scrap';
}

/**
 * The item ids a given landmark will sell, in display order.
 * @param {object} landmark a LANDMARKS entry
 * @returns {string[]}
 */
export function stockFor(landmark) {
  const tier = tierFor(landmark);
  if (!tier) return [];

  const ids = new Set(TIER[tier]);

  if (SIERRA_GATEWAYS.has(landmark.id)) {
    ids.add('bear_can');
    ids.add('ice_axe');
  }
  if (STOCK_TOWNS.has(landmark.id)) {
    ids.add('mule');
    ids.add('spare_axle');
    ids.add('spare_hitch');
  }
  // A ford landmark that somehow has a store always has the thing you wish you had.
  if (landmark.ford) ids.add('water_carry');

  return STORE_STOCK.filter((id) => ids.has(id) && ITEMS_BY_ID[id]);
}

/** Every item any store can sell — used by tests to prove icons exist for all of them. */
export const SELLABLE = ITEMS.filter((it) => STORE_STOCK.includes(it.id)).map((it) => it.id);
