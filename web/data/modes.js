// Game modes — the five (plus Classic) different ways Thru can be played.
//
// This is the experimental "mode lab": each mode is a self-contained ruleset that
// reshapes the core simulation into a genuinely different game. Modes are plain data
// with lifecycle *hooks* (init / onDayEnd / checkEnd) the engine calls at the right
// moments. Because the hooks are functions they are NOT serialized — the engine
// re-attaches the mode by `id` on load (exactly like it re-seeds the rng).
//
// A mode may set config flags read by the engine and UI:
//   winter   : false  -> no winter line, and it never ends your hike
//   terminus : false  -> reaching the far monument does NOT auto-win
//   deck     : true   -> uses the card-driven loop (its own screen), not the day loop
//   race     : true   -> spawns AI rival hikers you compete against
//   hideCreate: true  -> skip character creation (mode rolls the hiker for you)
//
// Hooks receive the live game object and mutate it directly. To avoid a circular
// import with the engine, hooks only touch plain state + the tiny helpers passed in
// on `g.helpers` (clamp / applyStat), which the engine attaches at newGame time.
import { TERMINUS_NORTH_MILE, LOCATIONS, lastPassed } from './locations.js';
import { randomName, generateTrailName } from './names.js';

// ---- Race rivals: the "bubble" of hikers you leapfrog up the trail -------------
// Each has a pace personality that drives their simulated daily mileage.
export const RIVAL_ARCHETYPES = [
  { key: 'hare',    trailName: 'Gigawatt',  color: '#e0b878', base: 26, variance: 10, blurb: 'Blazes huge days, then crashes in town for two zeros.' },
  { key: 'tortoise',trailName: 'Mosey',     color: '#8fd9a8', base: 20, variance: 3,  blurb: 'Same 20 every single day. Metronomic. Terrifying.' },
  { key: 'grinder', trailName: 'Switchback',color: '#7aa9e0', base: 22, variance: 6,  blurb: 'Steady climber who never takes a full zero.' },
  { key: 'wildcard',trailName: 'Honeybadger',color: '#d98a7a',base: 23, variance: 13, blurb: 'Chaos hiker. Forty-mile days and mysterious disappearances.' },
];

function spawnRivals(g) {
  const rivals = [];
  const used = new Set([g.trailName]);
  for (const a of RIVAL_ARCHETYPES) {
    let tn = a.trailName;
    while (used.has(tn)) tn = generateTrailName(g.rng);
    used.add(tn);
    rivals.push({
      key: a.key, trailName: tn, color: a.color, blurb: a.blurb,
      base: a.base, variance: a.variance,
      mile: g.direction === 'NOBO' ? 0 : TERMINUS_NORTH_MILE,
      zeroCooldown: 0, finished: false, finishDay: null,
    });
  }
  return rivals;
}

function advanceRivals(g) {
  if (!g.rivals) return;
  const dir = g.direction === 'NOBO' ? 1 : -1;
  const done = (m) => g.direction === 'NOBO' ? m >= TERMINUS_NORTH_MILE : m <= 0;
  for (const r of g.rivals) {
    if (r.finished) continue;
    // Occasional zero day (hare/wildcard love them; tortoise never).
    if (r.zeroCooldown > 0) { r.zeroCooldown--; continue; }
    const zeroChance = { hare: 0.10, tortoise: 0.0, grinder: 0.03, wildcard: 0.09 }[r.key] || 0.04;
    if (g.rng() < zeroChance) { r.zeroCooldown = r.key === 'hare' ? 2 : 1; continue; }
    // Rubber-band: rivals far behind the leader push a little harder (keeps races tense).
    const lead = Math.max(g.mile * dir, ...g.rivals.map(x => x.mile * dir));
    const behind = lead - r.mile * dir;
    const catchup = 1 + Math.min(0.35, behind / 1600);
    let step = (r.base + (g.rng() * 2 - 1) * r.variance) * catchup;
    step = Math.max(4, step);
    r.mile += dir * step;
    if (done(r.mile)) {
      r.mile = g.direction === 'NOBO' ? TERMINUS_NORTH_MILE : 0;
      r.finished = true; r.finishDay = g.day;
    }
  }
}

// Ordinal standings (1 = furthest up the trail). Includes the player as {you:true}.
export function raceStandings(g) {
  const dir = g.direction === 'NOBO' ? 1 : -1;
  const field = [
    { you: true, trailName: g.trailName || g.name, color: '#f0c987', mile: g.mile, finished: g.status === 'won', finishDay: g.status === 'won' ? g.day : null },
    ...(g.rivals || []).map(r => ({ ...r })),
  ];
  field.sort((a, b) => {
    const af = a.finished ? 1 : 0, bf = b.finished ? 1 : 0;
    if (af !== bf) return bf - af;                 // finishers first
    if (af && bf) return a.finishDay - b.finishDay; // earlier finish ranks higher
    return b.mile * dir - a.mile * dir;             // else furthest up trail
  });
  return field.map((f, i) => ({ ...f, place: i + 1 }));
}

export const MODES = {
  classic: {
    id: 'classic', order: 0, icon: '🥾', name: 'Expedition',
    tagline: 'The classic thru-hike.',
    blurb: 'Walk all 2,650 miles from Mexico to Canada. Outrun the winter line, keep your morale above zero, and touch the northern monument. The original Thru.',
    winter: true, terminus: true,
  },

  // 1) Endless procedural survival — how far can you get, forever?
  endless: {
    id: 'endless', order: 1, icon: '♾️', name: 'Forever Trail',
    tagline: 'Endless. Escalating. How far can you go?',
    blurb: 'The trail never ends — reach Canada and it loops you back to the desert for another, harder lap. Winter speeds up the longer you last. There is no winning, only your furthest mile. Chase your personal best.',
    winter: true, terminus: false,
    init(g) {
      g.lap = 0;
      g.best = 0;
      // Winter starts hungrier and closer, and accelerates over time.
      g.winterPerDay = 11;
      g.winterMile = g.direction === 'NOBO' ? -140 : TERMINUS_NORTH_MILE + 140;
      g.stats.Money = 2200;
    },
    onDayEnd(g) {
      // Every 8 days the winter grinds a little faster — the escalator.
      if (g.day % 8 === 0) g.winterPerDay = Math.round((g.winterPerDay + 0.6) * 10) / 10;
      // Lap wrap: crossing the far terminus rolls you back to the start, harder.
      const dir = g.direction === 'NOBO' ? 1 : -1;
      const crossed = g.direction === 'NOBO' ? g.mile >= TERMINUS_NORTH_MILE : g.mile <= 0;
      if (crossed) {
        g.lap += 1;
        g.mile = g.direction === 'NOBO' ? 0 : TERMINUS_NORTH_MILE;
        g.winterMile -= dir * 260;                       // small reprieve at the reset
        g.winterPerDay = Math.round((g.winterPerDay + 1.5) * 10) / 10;
        g.stats.Morale = g.helpers.clamp(g.stats.Morale + 20, -20, 100); // a lap-completion high
        g.visited = new Set();                           // milestones fire again next lap
        g._lapEvent = true;
      }
      g.score = Math.round(g.stats.Miles);
    },
  },

  // 2) Deterministic daily challenge — same run for everyone, shareable score.
  daily: {
    id: 'daily', order: 2, icon: '📅', name: 'Trail of the Day',
    tagline: 'One seed. One season. Everyone hikes the same trail.',
    blurb: 'A single deterministic run seeded by today\'s date — identical stats, weather, and encounters for every hiker on Earth. You have a 45-day season window to get as far up the trail as you can. Compare and share your result.',
    winter: true, terminus: true, hideCreate: true,
    seasonDays: 45,
    init(g) {
      g.seasonDays = 45;
      g.daily = true;
    },
    checkEnd(g) {
      if (g.status !== 'playing') return;
      // The season window closes — your run is scored where you stand.
      if (g.day > g.seasonDays) { g.status = 'lost'; g.cause = 'season'; }
    },
  },

  // 3) Zen — no winter, no losing. A walking meditation with a trail journal.
  zen: {
    id: 'zen', order: 3, icon: '🌿', name: 'Hike Your Own Hike',
    tagline: 'No winter. No losing. Just the walk.',
    blurb: 'The pressure is gone. Winter never comes and your morale can dip but never end your hike. Wander the whole trail at your own pace, collect encounters and views, and fill a trail journal with the story of your walk to Canada.',
    winter: false, terminus: true,
    init(g) {
      g.journal = [];
      g.stats.Money = 6000;
      g.stats.Morale = 85;
      g.zen = true;
    },
    onDayEnd(g) {
      // Morale can sag but never sinks you.
      if (g.stats.Morale < 5) g.stats.Morale = 5;
    },
  },

  // 4) Deckbuilder — a card-driven reimagining with its own screen.
  deck: {
    id: 'deck', order: 4, icon: '🃏', name: 'Trailcraft',
    tagline: 'A deckbuilding hike. Draw, play, build your kit.',
    blurb: 'Thru as a solitaire deckbuilder. Each day you draw a hand of trail cards and spend Stamina to play them for miles, morale, and rest. Make camp to end the day and let winter creep closer. Buy and cull cards in town to sculpt the perfect hiking deck — all the way to Canada.',
    winter: true, terminus: true, deck: true,
    // deck state is initialized by the engine's deck module (needs card helpers).
  },

  // 5) Race — beat the bubble of AI hikers to the northern monument.
  race: {
    id: 'race', order: 5, icon: '🏁', name: 'The Bubble',
    tagline: 'Race four rival hikers to Canada.',
    blurb: 'You are not alone out here. Four rival thru-hikers — each with their own pace and personality — race you north. See the whole field live on the trail. Winter still chases everyone. First to touch Monument 78 wins the year; the rest are just stories. Where will you place?',
    winter: true, terminus: true, race: true,
    init(g) {
      g.rivals = spawnRivals(g);
    },
    onDayEnd(g) {
      advanceRivals(g);
    },
  },
};

export const MODE_LIST = Object.values(MODES).sort((a, b) => a.order - b.order);

// A stable daily seed from a Date (YYYYMMDD as an integer).
export function dailySeed(date = new Date()) {
  return (date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()) >>> 0;
}
export function dailyLabel(date = new Date()) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${M[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
