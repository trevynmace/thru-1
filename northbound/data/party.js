// NORTHBOUND — who is walking, and what they brought.
//
// Occupations mirror the Oregon Trail banker/carpenter/farmer trade: money now
// against points later. The `effects` keys are read by the sim (see SPEC 5.6):
// fordBonus, weatherForecast, healRate, haggle, forageBonus.

export const OCCUPATIONS = [
  {
    id: 'trail-angel',
    name: 'Trail Angel',
    money: 4600,
    scoreMult: 1,
    blurb: 'You have been driving coolers to road crossings for eleven years and everyone from Campo to Cascade Locks owes you a favor. This year you are walking it.',
    perk: 'Everyone gives you a deal. Nobody in the crew stays down for long.',
    effects: { haggle: 0.9, healRate: 0.35 },
  },
  {
    id: 'gear-rep',
    name: 'Gear Rep',
    money: 3700,
    scoreMult: 1,
    blurb: 'Nine years of trade shows and warranty claims. You can tell what shoe someone is wearing from forty feet and you have never paid retail for anything.',
    perk: 'Pro deal at every counter on the trail.',
    effects: { haggle: 0.8 },
  },
  {
    id: 'ranger',
    name: 'Backcountry Ranger',
    money: 3200,
    scoreMult: 2,
    blurb: 'Six seasons in the Sierra, most of them alone. You have pulled people out of creeks that looked exactly like this one and you read a sky the way other people read a room.',
    perk: 'You know tomorrow\'s weather today, and you pick the right line at a ford.',
    effects: { fordBonus: 0.15, weatherForecast: true },
  },
  {
    id: 'cook',
    name: 'Camp Cook',
    money: 2800,
    scoreMult: 2,
    blurb: 'Twenty years of feeding fire crews out of the back of a truck. You can make four ingredients into a dinner people talk about, and you know which plants out here are worth stopping for.',
    perk: 'Bigger foraging hauls, and a crew that eats well heals faster.',
    effects: { forageBonus: 1.25, healRate: 0.6 },
  },
  {
    id: 'dirtbag',
    name: 'Dirtbag',
    money: 2400,
    scoreMult: 3,
    blurb: 'You live out of a station wagon eight months a year and have not paid rent since 2019. You own almost nothing and can make almost nothing last a very long time.',
    perk: 'You find food where others see brush, and cold water does not frighten you.',
    effects: { forageBonus: 1.15, fordBonus: 0.08, healRate: 0.4 },
  },
];

export const OCCUPATIONS_BY_ID = Object.fromEntries(OCCUPATIONS.map((o) => [o.id, o]));

// --- names -------------------------------------------------------------------

export const NAME_POOL = {
  first: [
    'Abel', 'Acacia', 'Ada', 'Adrian', 'Aisha', 'Alba', 'Alma', 'Amara', 'Anouk', 'Arlo',
    'Astrid', 'Auggie', 'Beau', 'Bodhi', 'Brigid', 'Caleb', 'Camila', 'Cyrus', 'Dahlia', 'Delia',
    'Dev', 'Diego', 'Edith', 'Eli', 'Elif', 'Esme', 'Ezra', 'Fern', 'Finn', 'Freya',
    'Greta', 'Gus', 'Hank', 'Hazel', 'Idris', 'Imani', 'Ira', 'Iris', 'Jasper', 'Juniper',
    'Kai', 'Levi', 'Lila', 'Linnea', 'Maeve', 'Mateo', 'Milo', 'Nadia', 'Nico', 'Noor',
    'Omar', 'Opal', 'Otto', 'Phoebe', 'Priya', 'Quinn', 'Rafael', 'Rosa', 'Saoirse', 'Silas',
    'Sol', 'Soren', 'Tamsin', 'Thea', 'Tobias', 'Wendell', 'Wren', 'Xochitl', 'Yara', 'Zadie',
  ],
  last: [
    'Abernathy', 'Alcott', 'Barlow', 'Beaumont', 'Bellweather', 'Bishop', 'Blackwood', 'Calloway',
    'Carrasco', 'Castellan', 'Chastain', 'Corliss', 'Crowder', 'Dalgleish', 'Danforth', 'Delacroix',
    'Duhamel', 'Eastlake', 'Everly', 'Fairweather', 'Farrow', 'Fenwick', 'Fontaine', 'Gallagher',
    'Glass', 'Halloran', 'Hargrove', 'Hawthorne', 'Ibarra', 'Ingram', 'Kearney', 'Larkin',
    'Lindqvist', 'Mahoney', 'Marchetti', 'Merriweather', 'Mireles', 'Nakamura', 'Okonkwo', 'Ortega',
    'Pemberton', 'Quintero', 'Rasmussen', 'Reyes', 'Rothery', 'Sandoval', 'Selkirk', 'Sorensen',
    'Stroud', 'Thackeray', 'Underhill', 'Vandermeer', 'Vasquez', 'Winslow', 'Wren', 'Yarborough',
  ],
};

/** Names you do not choose. Sixty-odd of them, mostly earned the hard way. */
export const TRAIL_NAMES = [
  'Tortoise', 'Mosey', 'Featherweight', 'Bushwhack', 'Gigawatt', 'Mockingbird', 'Driftwood',
  'Tumbleweed', 'Backtrack', 'Banjo', 'Pretzel', 'Chuckles', 'Avalanche', 'Riptide', 'Quicksand',
  'Honeybadger', 'Cornbread', 'Wildfire', 'Goosebump', 'Lighthouse', 'Jellybean', 'Roadrunner',
  'Postholer', 'Switchback', 'Sourdough', 'Nightshift', 'Cold Soak', 'Second Breakfast', 'Ziptie',
  'Duct Tape', 'Left Sock', 'Bear Bait', 'Marmot', 'Ptarmigan', 'Bristlecone', 'Manzanita',
  'Saguaro', 'Rain Fly', 'Snowplow', 'Ghost Pepper', 'Two Lunches', 'Bandit', 'Pinecone',
  'Blister', 'Crampon', 'Static', 'Waffles', 'Pacman', 'Moondance', 'Cricket', 'Salt Lick',
  'Grasshopper', 'Windmill', 'Hardtack', 'Tinder', 'Skillet', 'Compass Rose', 'Sunchips',
  'Nine Lives', 'Bad Beta', 'Trail Legs', 'Slow Clap', 'Deadfall', 'Rock Hop', 'Mile Marker',
  'Buckwheat', 'Doghouse', 'Kettle', 'Bramble', 'Tarptent', 'Wolverine', 'Chapstick', 'Half Ounce',
  'Yardsale', 'Nero', 'Zero Day', 'Foxglove', 'Snowmelt',
];

const TRAIL_PREFIX = [
  'Sleepy', 'Two-Bear', 'Sasquatch', 'Patches', 'Sunshine', 'Moonpie', 'Doctor', 'Captain',
  'Lucky', 'Sourdough', 'Tinker', 'Cactus', 'Pickle', 'Maps', 'Snacks', 'Salty', 'Whistle',
  'Toast', 'Compass', 'Gizmo', 'Mango', 'Mudball', 'Echo', 'Half-Mile', 'Catnap', 'Boomerang',
  'Rambler', 'Cold', 'Quiet', 'Sideways',
];

const TRAIL_SUFFIX = [
  'Boots', 'Legs', 'Feet', 'Britches', 'Pockets', 'Steps', 'Toes', 'Whiskers', 'Mittens',
  'Cakes', 'Beans', 'Sprout', 'Noodle', 'Biscuit', 'Knees', 'Thumbs', 'Wanderer', 'Hat',
  'Gloves', 'Sunrise',
];

/** Roughly two thirds standalone names, one third compounded. */
export function generateTrailName(rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  if (roll() < 0.66) return TRAIL_NAMES[Math.floor(roll() * TRAIL_NAMES.length)];
  const a = TRAIL_PREFIX[Math.floor(roll() * TRAIL_PREFIX.length)];
  const b = TRAIL_SUFFIX[Math.floor(roll() * TRAIL_SUFFIX.length)];
  return `${a} ${b}`;
}

export function generateName(rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  const f = NAME_POOL.first[Math.floor(roll() * NAME_POOL.first.length)];
  const l = NAME_POOL.last[Math.floor(roll() * NAME_POOL.last.length)];
  return `${f} ${l}`;
}

/** Scratched into a flat rock and leaned against the cairn. */
export const EPITAPHS = [
  'WALKED NORTH AS FAR AS THIS',
  'SHE CARRIED THE HEAVY BAG',
  'HE NEVER ONCE SET THE PACE',
  'FILTERED EVERYTHING. STILL GOT IT.',
  'GONE LIGHT AT LAST',
  'BEST COOK IN THE CREW',
  'LOVED THE MORNINGS',
  'ASKED FOR ONE MORE MILE',
  'FIRST UP, LAST TO BED',
  'DID NOT COMPLAIN ABOUT THE RAIN',
  'HERE LIES A GOOD PARTNER',
  'THE MULES LIKED HER',
  'NEVER FOUND THE RIGHT SHOES',
  'TOLD BETTER STORIES THAN ANY OF US',
  'SIGNED EVERY REGISTER',
  'MADE IT TO THE SIERRA',
  'ONE HUNDRED AND SIX DAYS',
  'HE SAW CRATER LAKE',
  'STOPPED FOR EVERY VIEW',
  'CARRIED THE HARMONICA THE WHOLE WAY',
  'SHARED THE LAST OF IT',
  'KNEW WHERE THE WATER WAS',
  'GAVE AWAY HIS PUFFY',
  'LAUGHED IN THE HAIL',
  'NORTHBOUND',
  'REST EASY, SORE FEET',
  'WOULD HAVE FINISHED',
  'NO DEAD WEIGHT',
  'TOOK THE LONG WAY ROUND',
  'SEE YOU AT THE MONUMENT',
];

// --- portraits ---------------------------------------------------------------
// Tint colours for the 16x24 hiker sprite. Kept inside the NORTHBOUND ramp:
// nothing fully saturated, everything sits under the parchment and gold.

export const PORTRAIT_PARTS = {
  hair: ['#1a1526', '#2a2233', '#3d2f26', '#4b3f66', '#5a4632', '#6b5a94', '#8a6a4a', '#a99e8c', '#c39d63', '#d1785c'],
  skin: ['#f0d3b4', '#e6c2a0', '#d9a887', '#c99771', '#b0825d', '#a97b57', '#8a5e41', '#6b452f', '#553524', '#3f2718'],
  shirt: ['#8fd0a4', '#d1785c', '#f2c98a', '#bfe3ff', '#6b5a94', '#4b3f66', '#c39d63', '#a99e8c', '#7d9a8b', '#9a6f8c', '#5f7f9a', '#b5654f'],
};

/** Deterministic portrait roll for a new crew member. */
export function generatePortrait(rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  const pick = (arr) => arr[Math.floor(roll() * arr.length)];
  return {
    skin: pick(PORTRAIT_PARTS.skin),
    hair: pick(PORTRAIT_PARTS.hair),
    shirt: pick(PORTRAIT_PARTS.shirt),
  };
}
