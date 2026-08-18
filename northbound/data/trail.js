// NORTHBOUND — the trail itself.
//
// Twenty-eight landmarks, mile 0 (the wall at Campo) to mile 2650 (Monument 78 in
// the clearcut on the Canadian line). Mileages are the widely cited PCT numbers,
// elevations in feet at the point a crew actually stands. Everything downstream
// reads this file: the sim paces travel by `mile`, the renderer picks palettes by
// `biome`, the store prices by `store.mult`, the ford minigame by `ford`.
//
// Text is rendered in a 5x7 bitmap font with a restricted glyph set. Keep all
// strings to plain ASCII: straight apostrophes, no dashes longer than a hyphen.

export const TOTAL_MILES = 2650;

export const BIOMES = ['desert', 'chaparral', 'sierra', 'alpine', 'forest', 'volcanic', 'rainforest'];

export const LANDMARKS = [
  {
    id: 'campo',
    name: 'Southern Terminus',
    mile: 0,
    elev: 2915,
    state: 'CA',
    biome: 'desert',
    kind: 'terminus',
    store: { mult: 1.0, name: 'Southern Terminus Outfitters' },
    ford: null,
    forage: 'poor',
    blurb: "Five wooden posts in the dust, twenty feet from a rusting steel wall. You sign the register, take the photo everybody takes, and turn north.",
  },
  {
    id: 'warner-springs',
    name: 'Warner Springs',
    mile: 109,
    elev: 3040,
    state: 'CA',
    biome: 'chaparral',
    kind: 'town',
    store: { mult: 1.2, name: 'Warner Springs Resource Center' },
    ford: null,
    forage: 'fair',
    blurb: "Eagle Rock sits out in the grass a few miles back, a boulder that looks exactly like a bird with its wings spread. The community center offers a bucket shower and a hot dog, and nobody here would trade that for a hotel.",
  },
  {
    id: 'idyllwild',
    name: 'Idyllwild',
    mile: 179,
    elev: 5380,
    state: 'CA',
    biome: 'chaparral',
    kind: 'town',
    store: { mult: 1.2, name: 'Nomad Ventures' },
    ford: null,
    forage: 'fair',
    blurb: "A pine town under San Jacinto that elects a golden retriever as mayor and takes the office seriously. Above it the trail climbs into thin air, and your lungs register an opinion about 9,000 feet.",
  },
  {
    id: 'big-bear',
    name: 'Big Bear City',
    mile: 266,
    elev: 6760,
    state: 'CA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.1, name: 'Big Bear Sporting Goods' },
    ford: null,
    forage: 'good',
    blurb: "A lake town of tackle shops and ski rentals, an easy hitch down from the ridge. The crew eats until it hurts, then buys three extra days of food it will regret carrying by tomorrow afternoon.",
  },
  {
    id: 'deep-creek',
    name: 'Deep Creek',
    mile: 308,
    elev: 3120,
    state: 'CA',
    biome: 'desert',
    kind: 'ford',
    store: null,
    ford: { name: 'Deep Creek', widthFt: 42, depthFt: 2.4, flow: 'brisk', bridge: false },
    forage: 'fair',
    blurb: "Green water at the bottom of a chaparral canyon, with hot springs downstream and a crowd around them not always wearing clothes. The crossing itself is short, slick, and colder than the canyon led you to believe.",
  },
  {
    id: 'wrightwood',
    name: 'Wrightwood',
    mile: 369,
    elev: 5980,
    state: 'CA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.2, name: 'Mountain Hardware' },
    ford: null,
    forage: 'fair',
    blurb: "A ski town that adopts hikers on sight. Somebody's neighbor drives you to the grocery store and waves off gas money, and then Baden-Powell waits above with forty switchbacks and a very old limber pine.",
  },
  {
    id: 'agua-dulce',
    name: 'Agua Dulce',
    mile: 454,
    elev: 2530,
    state: 'CA',
    biome: 'chaparral',
    kind: 'town',
    store: { mult: 1.25, name: 'Sweetwater Market' },
    ford: null,
    forage: 'poor',
    blurb: "Sandstone slabs tilt out of the ground like a rockslide stopped mid-fall. The town is one street long and every business on it knows what a resupply box is.",
  },
  {
    id: 'tehachapi',
    name: 'Tehachapi',
    mile: 566,
    elev: 4150,
    state: 'CA',
    biome: 'desert',
    kind: 'town',
    store: { mult: 1.05, name: 'Tehachapi Feed and Supply' },
    ford: null,
    forage: 'poor',
    blurb: "Wind turbines stand in ranks on every ridge, turning slow and enormous and never quite in unison. The town gives hikers free camping in the park and cheap motel rooms, mostly out of civic pride.",
  },
  {
    id: 'kennedy-meadows',
    name: 'Kennedy Meadows',
    mile: 702,
    elev: 6150,
    state: 'CA',
    biome: 'sierra',
    kind: 'town',
    store: { mult: 1.45, name: 'Kennedy Meadows General Store' },
    ford: null,
    forage: 'fair',
    blurb: "The porch of the General Store applauds when you walk in, every time, for everybody. Inside, the whole room is repacking for the Sierra: bear cans, ice axes, a frankly unreasonable amount of food. The desert ends here.",
  },
  {
    id: 'rock-creek',
    name: 'Rock Creek',
    mile: 750,
    elev: 9550,
    state: 'CA',
    biome: 'sierra',
    kind: 'ford',
    store: null,
    ford: { name: 'Rock Creek', widthFt: 34, depthFt: 2.9, flow: 'raging', bridge: false },
    forage: 'good',
    blurb: "Snowmelt off the Whitney crest funnels into one cold chute here and does not slow down for anyone. Cross in the morning, before the sun has spent a whole day on the snowfields above.",
  },
  {
    id: 'forester-pass',
    name: 'Forester Pass',
    mile: 779,
    elev: 13153,
    state: 'CA',
    biome: 'alpine',
    kind: 'pass',
    store: null,
    ford: null,
    forage: 'poor',
    blurb: "A notch chipped into a granite wall at 13,153 feet, the highest point on the trail. The switchbacks are blasted out of the cliff face, and the ice chute a hundred yards below the notch does not forgive a slip.",
  },
  {
    id: 'evolution-creek',
    name: 'Evolution Creek',
    mile: 845,
    elev: 9210,
    state: 'CA',
    biome: 'sierra',
    kind: 'ford',
    store: null,
    ford: { name: 'Evolution Creek', widthFt: 68, depthFt: 3.3, flow: 'brisk', bridge: false },
    forage: 'good',
    blurb: "In the meadow the water spreads wide and slows down, which is why everyone walks upstream to cross there instead of at the trail. Thigh deep, sixty feet of round stones, and a bottom you can feel but not see.",
  },
  {
    id: 'bear-creek',
    name: 'Bear Creek',
    mile: 872,
    elev: 9010,
    state: 'CA',
    biome: 'sierra',
    kind: 'ford',
    store: null,
    ford: { name: 'Bear Creek', widthFt: 52, depthFt: 3.1, flow: 'raging', bridge: false },
    forage: 'good',
    blurb: "Coming down off Selden Pass the creek is steep, cold, and shoving. The bed is loose cobble and the far bank is a scramble on hands. Face upstream, small steps, do not look down at the water.",
  },
  {
    id: 'tuolumne-meadows',
    name: 'Tuolumne Meadows',
    mile: 942,
    elev: 8600,
    state: 'CA',
    biome: 'sierra',
    kind: 'town',
    store: { mult: 1.5, name: 'Tuolumne Meadows Store' },
    ford: null,
    forage: 'good',
    blurb: "Yosemite's high meadow: pale domes, a slow river, and a grill selling hamburgers to people who have not seen one in nine days. The post office is a tent and it closes at four.",
  },
  {
    id: 'sonora-pass',
    name: 'Sonora Pass',
    mile: 1017,
    elev: 9620,
    state: 'CA',
    biome: 'alpine',
    kind: 'pass',
    store: null,
    ford: null,
    forage: 'fair',
    blurb: "Red and orange volcanic ridges above 10,000 feet, with a north-facing traverse that holds hard snow into July. The wind up here has opinions and shares them.",
  },
  {
    id: 'south-lake-tahoe',
    name: 'South Lake Tahoe',
    mile: 1090,
    elev: 6260,
    state: 'CA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.0, name: 'Lakeside Outfitters' },
    ford: null,
    forage: 'fair',
    blurb: "A blue lake the size of a small sea, a real gear shop, casinos, and every temptation a tired crew can name. Half the hikers who stop for one zero here take three.",
  },
  {
    id: 'sierra-city',
    name: 'Sierra City',
    mile: 1195,
    elev: 4180,
    state: 'CA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.3, name: 'Sierra Country Store' },
    ford: null,
    forage: 'good',
    blurb: "The store porch has a bench, a hose, and a one-pound burger across the street that has beaten stronger crews than this one. The climb out of the canyon is 3,000 feet and it starts at the edge of the parking lot.",
  },
  {
    id: 'midpoint',
    name: 'Midpoint Monument',
    mile: 1325,
    elev: 4990,
    state: 'CA',
    biome: 'forest',
    kind: 'landmark',
    store: null,
    ford: null,
    forage: 'good',
    blurb: "A low stone monument in unremarkable forest: 1,325 miles behind, 1,325 ahead. Everyone stops here. Almost nobody says anything.",
  },
  {
    id: 'burney-falls',
    name: 'Burney Falls',
    mile: 1419,
    elev: 3170,
    state: 'CA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.35, name: 'Burney Falls Camp Store' },
    ford: null,
    forage: 'rich',
    blurb: "A hundred million gallons a day comes out of a mossy cliff, half of it straight through the rock rather than over the lip. The park store sells ice cream sandwiches and charges what it likes.",
  },
  {
    id: 'seiad-valley',
    name: 'Seiad Valley',
    mile: 1656,
    elev: 1370,
    state: 'CA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.5, name: 'Seiad Valley Store' },
    ford: null,
    forage: 'good',
    blurb: "A valley floor at 1,370 feet in high summer, which is a hazard in its own right. The cafe will comp you five one-pound pancakes if you finish them, and the wall of photographs is mostly people who did not.",
  },
  {
    id: 'crater-lake',
    name: 'Crater Lake',
    mile: 1829,
    elev: 7100,
    state: 'OR',
    biome: 'volcanic',
    kind: 'landmark',
    store: { mult: 1.7, name: 'Mazama Village Store' },
    ford: null,
    forage: 'fair',
    blurb: "Six miles of impossibly blue water standing in the throat of a mountain that emptied itself out and fell in. There is no water on the rim and you will still walk the rim.",
  },
  {
    id: 'timberline-lodge',
    name: 'Timberline Lodge',
    mile: 2097,
    elev: 5960,
    state: 'OR',
    biome: 'volcanic',
    kind: 'town',
    store: { mult: 1.8, name: "Timberline Wy'East Store" },
    ford: null,
    forage: 'fair',
    blurb: "A WPA lodge of hand-cut timber and wrought iron on the shoulder of Mount Hood, famous among hikers for a breakfast buffet they treat as a competitive event. Sit near the food and pace yourself.",
  },
  {
    id: 'cascade-locks',
    name: 'Cascade Locks',
    mile: 2147,
    elev: 240,
    state: 'OR',
    biome: 'rainforest',
    kind: 'ford',
    store: { mult: 1.1, name: 'Cascade Locks Mercantile' },
    ford: { name: 'Bridge of the Gods', widthFt: 1858, depthFt: 0, flow: 'calm', bridge: true },
    forage: 'good',
    blurb: "The lowest ground on the trail, 240 feet, with the Columbia sliding by wide and green. The Bridge of the Gods is a steel grate deck with no walkway, so you cross with cars ten inches from your elbow and the river visible under your shoes.",
  },
  {
    id: 'white-pass',
    name: 'White Pass',
    mile: 2295,
    elev: 4410,
    state: 'WA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 1.6, name: 'Kracker Barrel Store' },
    ford: null,
    forage: 'good',
    blurb: "A gas station at a ski area, which sounds bleak until you have just carried a full food bag over the Goat Rocks. They keep the hiker boxes by the beer cooler and the resupply parcels in the back.",
  },
  {
    id: 'snoqualmie-pass',
    name: 'Snoqualmie Pass',
    mile: 2390,
    elev: 3030,
    state: 'WA',
    biome: 'rainforest',
    kind: 'town',
    store: { mult: 1.35, name: 'Summit Chevron' },
    ford: null,
    forage: 'rich',
    blurb: "An interstate pass with a pancake house and a motel that pretends not to notice six people in one room. North of here the Cascades stop pretending to be gentle.",
  },
  {
    id: 'suiattle-river',
    name: 'Suiattle River',
    mile: 2510,
    elev: 2870,
    state: 'WA',
    biome: 'rainforest',
    kind: 'ford',
    store: null,
    ford: { name: 'Suiattle River', widthFt: 88, depthFt: 2.7, flow: 'raging', bridge: false },
    forage: 'rich',
    blurb: "Glacier flour turns the water the grey of wet concrete and hides the bottom completely. The big cedar that people used to walk across went out in the spring, so it is a ford: wide, loud, and pushing hard at the knees.",
  },
  {
    id: 'stehekin',
    name: 'Stehekin',
    mile: 2580,
    elev: 1230,
    state: 'WA',
    biome: 'forest',
    kind: 'town',
    store: { mult: 2.1, name: 'Stehekin Valley Store' },
    ford: null,
    forage: 'good',
    blurb: "A village with no road to it, reached by a shuttle bus from the trail and a boat from anywhere else. Everything on the shelves came up the lake by barge and the price says so. The bakery is why people talk about Stehekin for the rest of their lives.",
  },
  {
    id: 'manning-park',
    name: 'Northern Terminus',
    mile: 2650,
    elev: 4360,
    state: 'WA',
    biome: 'alpine',
    kind: 'terminus',
    store: null,
    ford: null,
    forage: 'poor',
    blurb: "Monument 78 stands in a twenty-foot swath cut through the trees, a wooden obelisk with a drawer in the base and a register inside it. You put a hand on the top of it. The trail is finished with you.",
  },
];

// --- lookups -----------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Exact hit only: the landmark sitting on this mile, or null. */
export function landmarkAtMile(mile) {
  const m = Number(mile) || 0;
  for (const l of LANDMARKS) if (l.mile === m) return l;
  return null;
}

/** First landmark strictly ahead of `mile`, or null past the terminus. */
export function nextLandmark(mile) {
  const m = Number(mile) || 0;
  for (const l of LANDMARKS) if (l.mile > m) return l;
  return null;
}

/** Last landmark at or behind `mile`. Never null. */
export function lastLandmark(mile) {
  const m = Number(mile) || 0;
  let last = LANDMARKS[0];
  for (const l of LANDMARKS) {
    if (l.mile <= m) last = l;
    else break;
  }
  return last;
}

export function biomeAtMile(mile) {
  return lastLandmark(mile).biome;
}

/** Straight line between the bracketing landmarks. Feet. */
export function elevAtMile(mile) {
  const m = clamp(Number(mile) || 0, 0, TOTAL_MILES);
  const a = lastLandmark(m);
  const b = nextLandmark(m);
  if (!b) return a.elev;
  const span = b.mile - a.mile;
  if (span <= 0) return a.elev;
  const t = (m - a.mile) / span;
  return Math.round(a.elev + (b.elev - a.elev) * t);
}

/**
 * Speed multiplier for the ground under you, 0.72 to 1.15.
 * Climbing costs about twice what descending gives back, and everything above
 * 8,000 feet costs a little more on top of that.
 */
export function terrainFactor(mile) {
  const m = clamp(Number(mile) || 0, 0, TOTAL_MILES);
  const a = lastLandmark(m);
  const b = nextLandmark(m);
  let f = 1.0;
  if (b) {
    const span = Math.max(1, b.mile - a.mile);
    const grade = (b.elev - a.elev) / span; // feet gained per mile
    f -= grade > 0 ? grade / 700 : grade / 1600;
  }
  const e = elevAtMile(m);
  if (e > 8000) f -= (e - 8000) / 38000;
  return clamp(Number(f.toFixed(4)), 0.72, 1.15);
}

/** Convenience for the map screen and tests. */
export const FORDS = LANDMARKS.filter((l) => l.ford);
export const STORES = LANDMARKS.filter((l) => l.store);
export const LANDMARKS_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
