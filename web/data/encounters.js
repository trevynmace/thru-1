// Encounter deck. Mirrors the original MonoGame EncounterOptionData model:
// each option has a checkStat, a diceCheck (DC), and success/failure resolutions
// that apply { stat, effect, text }. Resolution rolls are stat + d20 >= DC.
// `tags` gate which biomes/contexts a card can appear in. `special` triggers
// engine hooks (recruit a tramily member, award a trail name, award gear).
//
// Stats usable as checks: Charisma, Chillness, Cleverness, Energy, Fitness, Luck, Outdoorsyness, Speed.
// Stats commonly affected: Morale, Money, Snacks, Energy, Miles.

export const ENCOUNTERS = [
  {
    id: 'rattlesnake', tags: ['desert'], weight: 3,
    title: 'Rattlesnake on the Trail',
    text: 'A diamondback is coiled across the singletrack, buzzing its tail like a busted maraca. The brush is thick on either side.',
    options: [
      { text: 'Wait calmly for it to leave', checkStat: 'Chillness', diceCheck: 9,
        success: { effectedStat: 'Morale', effect: 6, text: 'You breathe slow. After a tense minute it pours itself into the chaparral. You feel weirdly serene.' },
        failure: { effectedStat: 'Energy', effect: -10, text: 'Your patience snaps and you bushwhack around, arriving sweaty and rattled.' } },
      { text: 'Hop the snake quickly', checkStat: 'Speed', diceCheck: 13,
        success: { effectedStat: 'Morale', effect: 4, text: 'One clean leap and you’re past. You feel like an action hero.' },
        failure: { effectedStat: 'Morale', effect: -12, text: 'It strikes at your shoe. No bite, but your heart is in your throat for an hour.' } },
    ],
  },
  {
    id: 'trail-magic-cooler', tags: ['any'], weight: 4,
    title: 'Trail Magic!',
    text: 'A cooler sits at a dirt road crossing, a note taped to the lid: "Hikers help yourselves — leave some for the next one. ❤ The Andersons".',
    options: [
      { text: 'Take a soda and a banana', checkStat: 'Chillness', diceCheck: 0,
        success: { effectedStat: 'Morale', effect: 12, text: 'Cold sugar and potassium. You sit in the dirt grinning at the sky. This is why you came.' },
        failure: { effectedStat: 'Morale', effect: 12, text: 'Cold sugar and potassium. You sit in the dirt grinning at the sky. This is why you came.' } },
      { text: 'Take extra for later', checkStat: 'Luck', diceCheck: 14,
        success: { effectedStat: 'Snacks', effect: 14, text: 'You pack out a few bars and nobody minds. Future-you is grateful.' },
        failure: { effectedStat: 'Morale', effect: -6, text: 'Another hiker watches you over-pack the cooler. The guilt follows you up the climb.' } },
    ],
  },
  {
    id: 'water-cache', tags: ['desert'], weight: 3,
    title: 'A Dwindling Water Cache',
    text: 'The cache at the road has three gallons left and a logbook begging you not to take more than you need. Your bottles are nearly empty and the next source is 14 dry miles on.',
    options: [
      { text: 'Take only a liter, trust your legs', checkStat: 'Outdoorsyness', diceCheck: 12,
        success: { effectedStat: 'Morale', effect: 8, text: 'You ration smart and cruise the dry stretch. Desert competence unlocked.' },
        failure: { effectedStat: 'Energy', effect: -16, text: 'You misjudged the heat. The last miles are a cotton-mouthed slog.' } },
      { text: 'Camel up and fill everything', checkStat: 'Fitness', diceCheck: 11,
        success: { effectedStat: 'Morale', effect: 4, text: 'Heavy pack, but you’re strong enough. You float the dry miles.' },
        failure: { effectedStat: 'Energy', effect: -10, text: 'Eight pounds of water grinds your shoulders raw.' } },
    ],
  },
  {
    id: 'lost-hiker', tags: ['any'], weight: 3, special: 'recruit',
    title: 'A Hiker at the Junction',
    text: 'Someone is squinting at a phone where two trails fork, clearly turned around. They look up hopefully. "Hey — is this the PCT or did I take the horse trail again?"',
    options: [
      { text: 'Help them navigate, hike together', checkStat: 'Charisma', diceCheck: 8,
        success: { effectedStat: 'Morale', effect: 10, text: 'You sort it out and fall into easy conversation. They ask if you want to hike on together.', recruit: true },
        failure: { effectedStat: 'Morale', effect: -2, text: 'They thank you stiffly and hike off fast. Some people just want to be alone out here.' } },
      { text: 'Point the way and keep your pace', checkStat: 'Speed', diceCheck: 6,
        success: { effectedStat: 'Miles', effect: 2, text: 'You point, they nod, and you make great time solo.' },
        failure: { effectedStat: 'Morale', effect: -4, text: 'You feel a little cold about it for the rest of the day.' } },
    ],
  },
  {
    id: 'afternoon-storm', tags: ['mountain', 'alpine'], weight: 3,
    title: 'Afternoon Thunderstorm',
    text: 'Cumulus piles into anvils over the ridge. You’re an hour below the pass and the air smells like a struck match.',
    options: [
      { text: 'Race over before it hits', checkStat: 'Speed', diceCheck: 13,
        success: { effectedStat: 'Morale', effect: 8, text: 'You crest the pass as the first thunder cracks behind you. Pure adrenaline.' },
        failure: { effectedStat: 'Morale', effect: -14, text: 'Lightning forks across the saddle while you’re still exposed. Terrifying. You cower in a krummholz patch.' } },
      { text: 'Drop down and wait it out', checkStat: 'Chillness', diceCheck: 9,
        success: { effectedStat: 'Energy', effect: 6, text: 'You brew a hot drink under a tree and let it pass. Smart hiking is slow hiking.' },
        failure: { effectedStat: 'Snacks', effect: -8, text: 'The storm parks overhead for hours. You stress-eat half your food bag.' } },
    ],
  },
  {
    id: 'bear-canister', tags: ['alpine', 'mountain', 'forest'], weight: 2,
    title: 'A Bear in Camp',
    text: 'A scuffle and a metallic clatter wake you at 2am. A black bear is batting your bear canister around the meadow like a hockey puck.',
    options: [
      { text: 'Yell and bang your pot', checkStat: 'Charisma', diceCheck: 10,
        success: { effectedStat: 'Morale', effect: 6, text: 'You make a terrifying racket and the bear lopes off. The canister held. The system works.' },
        failure: { effectedStat: 'Snacks', effect: -6, text: 'It ignores you and gnaws the lid another ten minutes before giving up, bored.' } },
      { text: 'Stay in your bag and trust the can', checkStat: 'Chillness', diceCheck: 12,
        success: { effectedStat: 'Energy', effect: 4, text: 'You wait it out. By dawn the canister is scratched but sealed. You even slept a little.' },
        failure: { effectedStat: 'Morale', effect: -10, text: 'You lie rigid until sunrise, replaying every nature documentary you’ve ever seen.' } },
    ],
  },
  {
    id: 'norovirus', tags: ['town', 'any'], weight: 2,
    title: 'Something You Ate',
    text: 'Your stomach lurches ominously. A norovirus has been ripping through the bubble, passed along by unwashed hands and shared snack bags.',
    options: [
      { text: 'Push through to the next town', checkStat: 'Fitness', diceCheck: 14,
        success: { effectedStat: 'Morale', effect: 4, text: 'Your gut of iron wins out. You feel queasy but you make the miles.' },
        failure: { effectedStat: 'Energy', effect: -20, text: 'You spend a wretched night losing the battle behind a manzanita bush.' } },
      { text: 'Stop, hydrate, and rest a day', checkStat: 'Outdoorsyness', diceCheck: 8,
        success: { effectedStat: 'Energy', effect: 10, text: 'You hole up, drink electrolytes, and recover faster than the hikers who pushed on.' },
        failure: { effectedStat: 'Snacks', effect: -10, text: 'You can’t keep anything down. The rest day costs you food and time.' } },
    ],
  },
  {
    id: 'view', tags: ['alpine', 'mountain'], weight: 3,
    title: 'The View From the Pass',
    text: 'You top out and the world drops away on both sides — range after range of blue ridgelines fading into haze, a lake like a chip of sky far below. You set your pack down without deciding to.',
    options: [
      { text: 'Sit and take it all in', checkStat: 'Outdoorsyness', diceCheck: 0,
        success: { effectedStat: 'Morale', effect: 16, text: 'You sit for twenty minutes and don’t check the time once. This is the whole point.' },
        failure: { effectedStat: 'Morale', effect: 16, text: 'You sit for twenty minutes and don’t check the time once. This is the whole point.' } },
      { text: 'Snap a photo and keep moving', checkStat: 'Speed', diceCheck: 5,
        success: { effectedStat: 'Miles', effect: 3, text: 'One good photo, then momentum. You make camp early with the view still in your eyes.' },
        failure: { effectedStat: 'Morale', effect: 6, text: 'You hike on, but the view keeps tugging you to look back, and you don’t really mind.' } },
    ],
  },
  {
    id: 'blowdowns', tags: ['forest', 'mountain'], weight: 2,
    title: 'A Maze of Blowdowns',
    text: 'A windstorm laid a hundred trees across the trail. The tread vanishes under a chaos of trunks and root balls taller than you.',
    options: [
      { text: 'Climb over methodically', checkStat: 'Fitness', diceCheck: 11,
        success: { effectedStat: 'Morale', effect: 4, text: 'You vault and scramble for an hour and pop out the far side filthy and triumphant.' },
        failure: { effectedStat: 'Energy', effect: -14, text: 'You straddle a slick log wrong and go down hard on your hip. Nothing broken but your pride.' } },
      { text: 'Route-find around the worst of it', checkStat: 'Cleverness', diceCheck: 10,
        success: { effectedStat: 'Energy', effect: 4, text: 'You read the slope, find the gap, and thread the maze like a puzzle.' },
        failure: { effectedStat: 'Miles', effect: -2, text: 'Your clever detour cliffs out and you backtrack, losing ground.' } },
    ],
  },
  {
    id: 'trail-name', tags: ['any'], weight: 2, special: 'trailname',
    title: 'You Earn a Trail Name',
    text: 'Around the campfire someone recounts the absurd thing you did today, and a name gets pinned on you before you can object. Out here, you don’t pick your trail name — it picks you.',
    options: [
      { text: 'Accept it with grace', checkStat: 'Chillness', diceCheck: 0,
        success: { effectedStat: 'Morale', effect: 10, text: 'You shrug and grin. It’s yours now.', trailname: true },
        failure: { effectedStat: 'Morale', effect: 10, text: 'You shrug and grin. It’s yours now.', trailname: true } },
    ],
  },
  {
    id: 'gear-find', tags: ['town', 'any'], weight: 2, special: 'gear',
    title: 'Hiker Box Treasure',
    text: 'The hiker box at the hostel is a graveyard of half-empty fuel canisters and mystery powders — but something useful is buried in there.',
    options: [
      { text: 'Dig through it', checkStat: 'Luck', diceCheck: 9,
        success: { effectedStat: 'Morale', effect: 4, text: 'Score! You fish out something genuinely good and pack it out.', gear: true },
        failure: { effectedStat: 'Morale', effect: -2, text: 'Just expired tuna packets and a single trekking pole. You wash your hands twice.' } },
    ],
  },
  {
    id: 'river-ford', tags: ['alpine'], weight: 3,
    title: 'A Roaring Ford',
    text: 'Snowmelt has turned the creek into a brown freight train of water. The trail goes straight in. It’s thigh-deep and pushing hard.',
    options: [
      { text: 'Ford it early, unbuckle your hipbelt', checkStat: 'Outdoorsyness', diceCheck: 12,
        success: { effectedStat: 'Morale', effect: 10, text: 'You face upstream, shuffle across braced on your poles, and climb out shaking and proud.' },
        failure: { effectedStat: 'Energy', effect: -16, text: 'A foot slips and the current takes your legs for one heart-stopping second before you scramble out downstream.' } },
      { text: 'Hunt upstream for a safer crossing', checkStat: 'Cleverness', diceCheck: 10,
        success: { effectedStat: 'Morale', effect: 6, text: 'A half-mile up you find a log jam and cross dry. Patience beats bravado.' },
        failure: { effectedStat: 'Miles', effect: -3, text: 'You burn an hour scouting and end up fording the same spot anyway.' } },
    ],
  },
  {
    id: 'mosquitoes', tags: ['forest', 'alpine'], weight: 3,
    title: 'The Mosquito Swarm',
    text: 'You drop into a green basin and the air comes alive. A cloud of mosquitoes finds you instantly and does not let go.',
    options: [
      { text: 'Power through without stopping', checkStat: 'Fitness', diceCheck: 10,
        success: { effectedStat: 'Miles', effect: 4, text: 'You put your head down and hammer out of the kill zone. They never had a chance.' },
        failure: { effectedStat: 'Morale', effect: -12, text: 'They feast through your shirt. You arrive at camp lumpy, twitching, and homicidal.' } },
      { text: 'Stop to put on rain gear as armor', checkStat: 'Cleverness', diceCheck: 7,
        success: { effectedStat: 'Morale', effect: 2, text: 'Hood up, cuffs cinched, head net on — you become an unbiteable ghost.' },
        failure: { effectedStat: 'Energy', effect: -8, text: 'You sweat buckets inside the rain gear and they bite your hands anyway.' } },
    ],
  },
  {
    id: 'wildfire-smoke', tags: ['forest', 'mountain'], weight: 2,
    title: 'Smoke on the Wind',
    text: 'The sun goes orange and the air tastes of campfire. A fire is burning somewhere west, and the smoke is thickening fast.',
    options: [
      { text: 'Push hard to get ahead of it', checkStat: 'Speed', diceCheck: 12,
        success: { effectedStat: 'Morale', effect: 6, text: 'You make big miles and climb into cleaner air on a high ridge by dark.' },
        failure: { effectedStat: 'Energy', effect: -12, text: 'You hike all day with a headache and a raw throat, the smoke never letting up.' } },
      { text: 'Check the map for an exit', checkStat: 'Cleverness', diceCheck: 9,
        success: { effectedStat: 'Morale', effect: 4, text: 'You find a side trail to a road and a plan to flip around the closure if needed. Knowledge is calm.' },
        failure: { effectedStat: 'Morale', effect: -8, text: 'No good options. You camp uneasy, watching the glow on the horizon.' } },
    ],
  },
  {
    id: 'nero-decision', tags: ['town'], weight: 2,
    title: 'The Siren Song of Town',
    text: 'You only meant to resupply, but the brewery has a hiker special, the hostel has an open bunk, and your legs are very interested in a zero.',
    options: [
      { text: 'Discipline: resupply and hike out', checkStat: 'Chillness', diceCheck: 11,
        success: { effectedStat: 'Miles', effect: 5, text: 'You eat one burger, fill the food bag, and night-hike out smug. The winter line shrinks behind you.' },
        failure: { effectedStat: 'Morale', effect: -4, text: 'You hike out, but you spend the climb thinking about that open bunk.' } },
      { text: 'Treat yourself to a zero', checkStat: 'Luck', diceCheck: 0,
        success: { effectedStat: 'Morale', effect: 14, text: 'A full day off. Shower, laundry, two real meals, a real bed. You feel reborn — but the season ticks on.', zeroDay: true },
        failure: { effectedStat: 'Morale', effect: 14, text: 'A full day off. Shower, laundry, two real meals, a real bed. You feel reborn — but the season ticks on.', zeroDay: true } },
    ],
  },
];

// Pick a weighted-random encounter valid for the given biome/context.
export function rollEncounter(biome, rng = Math.random, opts = {}) {
  const pool = ENCOUNTERS.filter(e => {
    if (opts.onlySpecial && e.special !== opts.onlySpecial) return false;
    return e.tags.includes('any') || e.tags.includes(biome) || (opts.inTown && e.tags.includes('town'));
  });
  if (pool.length === 0) return null;
  const total = pool.reduce((s, e) => s + (e.weight || 1), 0);
  let r = rng() * total;
  for (const e of pool) { r -= (e.weight || 1); if (r <= 0) return e; }
  return pool[pool.length - 1];
}
