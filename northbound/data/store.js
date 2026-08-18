// NORTHBOUND — what each store actually has on the shelf.
//
// The Southern Terminus outfitter carries everything, because that is where you are
// supposed to make your real decisions. Everything north of it is a gas station, a
// resort porch or a hiker box, and the stock thins out the further you get from a road.
import { ITEMS, ITEMS_BY_ID } from './items.js';

/** Display order for a full-service outfitter. */
export const STORE_STOCK = [
  'food',
  'spare_soles', 'spare_poles', 'spare_filter', 'spare_pack', 'spare_shelter',
  'clothing', 'puffy',
  'first_aid', 'electrolytes', 'blister_kit',
  'bear_can', 'ice_axe', 'stove_fuel', 'water_carry',
  'camp_chair', 'paperback', 'harmonica',
];

// A gas station cannot sell you a sixty-litre pack. These are the tiers.
const TIER = {
  // Everything. Only the terminus outfitter and the big trail towns.
  full: STORE_STOCK,

  // A real town with a gear shop: everything that wears out, plus layers and medical.
  town: [
    'food', 'spare_soles', 'spare_poles', 'spare_filter', 'spare_pack',
    'clothing', 'puffy', 'first_aid', 'electrolytes', 'blister_kit',
    'stove_fuel', 'water_carry', 'paperback',
  ],

  // A resort porch, a post office, a general store with three shelves.
  outpost: [
    'food', 'spare_soles', 'first_aid', 'electrolytes', 'blister_kit',
    'stove_fuel', 'water_carry',
  ],

  // A hiker box and a vending machine. Calories, fuel and whatever somebody left
  // behind — fuel is on every shelf, because being unable to cook is a dead end.
  scrap: ['food', 'stove_fuel', 'electrolytes', 'blister_kit'],
};

// Stores that carry the Sierra-entry kit no matter their size — this is where the
// bear canister and the ice axe are actually required, so this is where they sell them.
const SIERRA_GATEWAYS = new Set(['kennedy-meadows', 'kennedy', 'bishop', 'kearsarge', 'lone-pine']);

// Stores with a real gear wall — the ones that can replace a pack or a shelter.
const OUTFITTERS = new Set(['campo', 'tehachapi', 'kennedy-meadows', 'kennedy', 'south-lake-tahoe', 'tahoe', 'ashland', 'cascade-locks']);

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
  if (OUTFITTERS.has(landmark.id)) {
    ids.add('spare_pack');
    ids.add('spare_shelter');
  }
  // A ford landmark that somehow has a store always has the thing you wish you had.
  if (landmark.ford) ids.add('water_carry');

  return STORE_STOCK.filter((id) => ids.has(id) && ITEMS_BY_ID[id]);
}

/** Every item any store can sell — used by tests to prove icons exist for all of them. */
export const SELLABLE = ITEMS.filter((it) => STORE_STOCK.includes(it.id)).map((it) => it.id);
