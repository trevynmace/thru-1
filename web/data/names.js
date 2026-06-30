// Name pools (sampled from the original repo's first_name_list.json) plus a
// procedural trail-name generator. On the PCT you don't choose your trail name —
// it's given to you. The generator mirrors how real names get coined: from a habit,
// a mishap, a piece of gear, or a personality quirk.
export const FIRST_NAMES_M = ['Aaron','Abel','Abe','Abhinav','Adam','Adrian','Ahmed','Aiden','Akira','Alan','Albert','Alejandro','Andre','Angus','Anton','Arlo','Asher','Atticus','Auggie','Bartholomew','Beau','Ben','Bodhi','Caleb','Cyrus','Dario','Dev','Diego','Eli','Emiliano','Ezra','Finn','Gus','Hank','Idris','Ira','Jasper','Kai','Levi','Mateo','Milo','Nico','Omar','Otto','Quinn','Rafael','Silas','Soren','Tobias','Wendell'];
export const FIRST_NAMES_F = ['Abby','Acacia','Ada','Adela','Aisha','Alba','Alma','Amara','Anouk','Astrid','Aurora','Beatrix','Brigid','Camila','Clementine','Dahlia','Delia','Edith','Elif','Esme','Fern','Freya','Greta','Hazel','Imani','Iris','Juniper','Lila','Linnea','Maeve','Nadia','Noor','Opal','Phoebe','Priya','Rosa','Saoirse','Sigrid','Sol','Tamsin','Thea','Wren','Xochitl','Yara','Zadie','Zola'];

const TRAIL_PREFIX = ['Sleepy','Two-Bear','Sasquatch','Patches','Sunshine','Moonpie','Dr.','Captain','Lucky','Sourdough','Tinker','Cactus','Pickle','Maps','Snacks','Salty','Foxtrot','Whistle','Toast','Compass','Gizmo','Switchback','Mango','Mudball','Echo','Half-Mile','Catnap','Boomerang','Rambler','Marmot'];
const TRAIL_SUFFIX = ['Boots','Legs','Feet','Britches','Pockets','Steps','Toes','Whiskers','Mittens','Cakes','Beans','Sprout','Gizzard','Noodle','Biscuit','Knees','Thumbs','Wanderer'];
const TRAIL_SOLO = ['Tortoise','Mosey','Dawdle','Featherweight','Bushwhack','Gigawatt','Mockingbird','Driftwood','Tumbleweed','Backtrack','Banjo','Pretzel','Chuckles','Avalanche','Riptide','Quicksand','Honeybadger','Cornbread','Wildfire','Goosebump','Northbound','Lighthouse','Jellybean','Roadrunner'];

export function randomName(gender, rng = Math.random) {
  const pool = gender === 'female' ? FIRST_NAMES_F : FIRST_NAMES_M;
  return pool[Math.floor(rng() * pool.length)];
}

export function generateTrailName(rng = Math.random) {
  const roll = rng();
  if (roll < 0.45) return TRAIL_SOLO[Math.floor(rng() * TRAIL_SOLO.length)];
  return `${TRAIL_PREFIX[Math.floor(rng() * TRAIL_PREFIX.length)]} ${TRAIL_SUFFIX[Math.floor(rng() * TRAIL_SUFFIX.length)]}`;
}

// Special abilities a recruited tramily member can bring (from the Steam description:
// "recruit hikers to your tramily for special bonuses and new encounter options").
export const TRAMILY_PERKS = [
  { id: 'medic', name: 'Medic', blurb: 'Heals the bubble. Reduces Energy losses from hazards.', effect: { hazardResist: 0.4 } },
  { id: 'eats-half', name: 'Eats Half', blurb: 'Hiker hunger of a hummingbird. Snacks deplete slower.', effect: { snackRate: 0.6 } },
  { id: 'free-housing', name: 'Knows Everyone', blurb: 'Always has a friend with a couch. Town stays cost less.', effect: { townDiscount: 0.4 } },
  { id: 'morale-booster', name: 'Camp Comedian', blurb: 'Keeps spirits high. Slows morale drain on trail.', effect: { moraleRate: 0.7 } },
  { id: 'pace-setter', name: 'Pace Setter', blurb: 'Sets a relentless rhythm. Small daily mileage bonus.', effect: { mileBonus: 1.5 } },
  { id: 'navigator', name: 'Navigator', blurb: 'Never misses a turn. Better odds on Cleverness checks.', effect: { clevernessBonus: 4 } },
];
