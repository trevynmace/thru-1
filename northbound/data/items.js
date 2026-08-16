// NORTHBOUND — the outfitting catalog.
//
// Prices are 2020s dollars at a store multiplier of 1.0 (the Campo outfitter).
// `weightLb` is what one unit adds to the cart load; mules carry themselves.
// `icon` must match an atlas frame, which the baker generates as `item_<id>`.
//
// The sim references `food`, `mule`, the three cart spares, and the luxury ids
// by name. Do not rename them.

export const ITEMS = [
  // --- food -----------------------------------------------------------------
  {
    id: 'food',
    name: 'Trail Food',
    unit: 'lb',
    price: 0.42,
    weightLb: 1,
    category: 'food',
    icon: 'item_food',
    blurb: 'Ramen, tortillas, peanut butter, bars nobody likes by week three. Calories are miles.',
    max: 2000,
  },

  // --- cart parts -----------------------------------------------------------
  {
    id: 'spare_wheel',
    name: 'Spare Wheel',
    unit: 'each',
    price: 38,
    weightLb: 9,
    category: 'parts',
    icon: 'item_spare_wheel',
    blurb: 'A spoked wheel with a fat tire. Heavy to carry, ruinous to need and not have.',
    max: 6,
  },
  {
    id: 'spare_axle',
    name: 'Spare Axle',
    unit: 'each',
    price: 26,
    weightLb: 12,
    category: 'parts',
    icon: 'item_spare_axle',
    blurb: 'Cold-rolled steel bar, threaded at both ends. It bends before it snaps, which is a mercy.',
    max: 6,
  },
  {
    id: 'spare_hitch',
    name: 'Spare Hitch',
    unit: 'each',
    price: 18,
    weightLb: 5,
    category: 'parts',
    icon: 'item_spare_hitch',
    blurb: 'The pin and yoke that hold the cart to the mules. Small, cheap, and the piece that fails first.',
    max: 6,
  },
  {
    id: 'spare_soles',
    name: 'Spare Shoes',
    unit: 'each',
    price: 92,
    weightLb: 1.4,
    category: 'parts',
    icon: 'item_spare_soles',
    blurb: 'Trail runners, one pair. Good for five hundred miles if the tread is lucky and the rock is kind.',
    max: 12,
  },
  {
    id: 'spare_poles',
    name: 'Spare Poles',
    unit: 'set',
    price: 58,
    weightLb: 1.1,
    category: 'parts',
    icon: 'item_spare_poles',
    blurb: 'Aluminum, not carbon. Aluminum bends and keeps working. Carbon explodes into splinters in a talus field.',
    max: 10,
  },
  {
    id: 'spare_filter',
    name: 'Spare Filter',
    unit: 'each',
    price: 42,
    weightLb: 0.4,
    category: 'parts',
    icon: 'item_spare_filter',
    blurb: 'Hollow fiber cartridge. One hard freeze ruins it without leaving a mark you can see.',
    max: 10,
  },

  // --- clothing -------------------------------------------------------------
  {
    id: 'clothing',
    name: 'Clothing',
    unit: 'set',
    price: 65,
    weightLb: 4,
    category: 'clothing',
    icon: 'item_clothing',
    blurb: 'Sun hoodie, shorts, socks, a rain shell that will lose to Washington. One set per person, plus spares for the cold.',
    max: 30,
  },
  {
    id: 'puffy',
    name: 'Down Puffy',
    unit: 'each',
    price: 180,
    weightLb: 1.3,
    category: 'clothing',
    icon: 'item_puffy',
    blurb: 'Eight hundred fill, packs to the size of a grapefruit. Useless soaked, indispensable at 3 a.m. above treeline.',
    max: 10,
  },

  // --- medical --------------------------------------------------------------
  {
    id: 'first_aid',
    name: 'First Aid Kit',
    unit: 'each',
    price: 22,
    weightLb: 0.8,
    category: 'medical',
    icon: 'item_first_aid',
    blurb: 'Ibuprofen, antibiotics somebody talked a doctor into, tape, gauze, a needle. Cuts a bad stretch of illness roughly in half.',
    max: 20,
  },
  {
    id: 'electrolytes',
    name: 'Electrolytes',
    unit: 'each',
    price: 9,
    weightLb: 0.2,
    category: 'medical',
    icon: 'item_electrolytes',
    blurb: 'A tube of tablets that taste like sweet chalk. The difference between a hard afternoon and a stretcher.',
    max: 40,
  },
  {
    id: 'blister_kit',
    name: 'Blister Kit',
    unit: 'each',
    price: 8,
    weightLb: 0.2,
    category: 'medical',
    icon: 'item_blister_kit',
    blurb: 'Leukotape, gel pads, a lighter and a needle. Applied at the hot spot it costs ten minutes; applied later it costs a week.',
    max: 30,
  },

  // --- stock ----------------------------------------------------------------
  {
    id: 'mule',
    name: 'Pack Mule',
    unit: 'head',
    price: 175,
    weightLb: 0,
    category: 'stock',
    icon: 'item_mule',
    blurb: 'Steadier than a horse and twice as opinionated. Five in the string moves the cart at a walking pace; fewer and the crew takes up the slack.',
    max: 8,
  },

  // --- tools ----------------------------------------------------------------
  {
    id: 'bear_can',
    name: 'Bear Canister',
    unit: 'each',
    price: 85,
    weightLb: 2.4,
    category: 'tools',
    icon: 'item_bear_can',
    blurb: 'A black plastic barrel the rangers require between Kennedy Meadows and Sonora Pass. It doubles as a camp stool, which is the only nice thing anyone says about it.',
    max: 8,
  },
  {
    id: 'ice_axe',
    name: 'Ice Axe',
    unit: 'each',
    price: 115,
    weightLb: 1.1,
    category: 'tools',
    icon: 'item_ice_axe',
    blurb: 'Sixty centimeters of steel and aluminum for the one minute in the season when you need to stop sliding.',
    max: 8,
  },
  {
    id: 'stove_fuel',
    name: 'Stove Fuel',
    unit: 'each',
    price: 7,
    weightLb: 0.9,
    category: 'tools',
    icon: 'item_stove_fuel',
    blurb: 'Isobutane canister. Hot dinner in bad weather does more for a crew than most things you can buy.',
    max: 30,
  },
  {
    id: 'water_carry',
    name: 'Water Carry',
    unit: 'each',
    price: 12,
    weightLb: 0.3,
    category: 'tools',
    icon: 'item_water_carry',
    blurb: 'A collapsible four-liter bladder. Empty it weighs nothing; full it is nine pounds and the reason you get through the aqueduct.',
    max: 20,
  },

  // --- luxury ---------------------------------------------------------------
  {
    id: 'camp_chair',
    name: 'Camp Chair',
    unit: 'each',
    price: 65,
    weightLb: 1.2,
    category: 'luxury',
    icon: 'item_camp_chair',
    blurb: 'A pound of fabric and poles that everyone mocks until the first night with no log to sit on.',
    max: 5,
  },
  {
    id: 'paperback',
    name: 'Paperback',
    unit: 'each',
    price: 9,
    weightLb: 0.6,
    category: 'luxury',
    icon: 'item_paperback',
    blurb: 'Read it, tear out the finished pages, leave them in the hiker box. Somebody else gets chapter twelve onward.',
    max: 10,
  },
  {
    id: 'harmonica',
    name: 'Harmonica',
    unit: 'each',
    price: 35,
    weightLb: 0.3,
    category: 'luxury',
    icon: 'item_harmonica',
    blurb: 'Three ounces of tin in the key of C. Nobody in the crew can play it well and it helps anyway.',
    max: 5,
  },
];

export const ITEMS_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** Cart part suffixes. The purchasable spares are `spare_<part>`. */
export const CART_PARTS = ['wheel', 'axle', 'hitch'];

/** Luxuries each give a small daily spirit bonus while owned. */
export const LUXURIES = ITEMS.filter((i) => i.category === 'luxury').map((i) => i.id);

export const CATEGORIES = ['food', 'parts', 'clothing', 'medical', 'stock', 'tools', 'luxury'];

/** Price of one unit at a given store multiplier, rounded to cents. */
export function priceOf(itemId, mult = 1) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return 0;
  const m = Number.isFinite(mult) && mult > 0 ? mult : 1;
  return Math.round(item.price * m * 100) / 100;
}
