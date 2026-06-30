// Gear catalog. Drawn from the original repo's GameData/Items.json, given thru-hiker
// stats. Gear provides passive bonuses but `wear` accrues with miles; at 0 durability
// the item breaks and its bonus is lost (matches the Steam description: "gear also
// provides bonuses but wears and breaks with miles").
//
// bonus keys map to player stats. weight (oz, lighter = faster) feeds pack weight.
export const GEAR = [
  { id: 'trekking-poles', name: 'Trekking Poles', slot: 'hands', weightOz: 18, price: 120, durability: 1400,
    bonus: { Speed: 4, Fitness: 2 }, blurb: '+Speed on climbs, saves the knees. Wears down over many miles.' },
  { id: 'ul-tent', name: 'Ultralight Tent', slot: 'shelter', weightOz: 28, price: 350, durability: 1800,
    bonus: { Morale: 3, Chillness: 2 }, blurb: 'Dry nights = better mornings. +Morale.' },
  { id: 'quilt', name: 'Down Quilt', slot: 'sleep', weightOz: 21, price: 300, durability: 2000,
    bonus: { Energy: 4, Morale: 2 }, blurb: 'Warm sleep restores more Energy each night.' },
  { id: 'bear-can', name: 'Bear Canister', slot: 'food', weightOz: 33, price: 80, durability: 9999,
    bonus: { Outdoorsyness: 3 }, blurb: 'Required in the Sierra. Protects your Snacks from critters.' },
  { id: 'sawyer', name: 'Sawyer Squeeze Filter', slot: 'water', weightOz: 3, price: 40, durability: 1600,
    bonus: { Fitness: 2, Chillness: 1 }, blurb: 'Clean water, no stomach lottery.' },
  { id: 'ice-axe', name: 'Ice Axe', slot: 'hands2', weightOz: 12, price: 110, durability: 2200,
    bonus: { Outdoorsyness: 5 }, blurb: 'Self-arrest on Sierra snow. +Outdoorsyness on alpine hazards.' },
  { id: 'puffy', name: 'Puffy Jacket', slot: 'torso', weightOz: 11, price: 220, durability: 1500,
    bonus: { Chillness: 3, Morale: 2 }, blurb: 'Cozy at camp, takes the edge off cold mornings.' },
  { id: 'rain-jacket', name: 'Rain Jacket', slot: 'shell', weightOz: 7, price: 150, durability: 1300,
    bonus: { Chillness: 2, Outdoorsyness: 2 }, blurb: 'Washington insurance. Keeps morale up in the wet.' },
  { id: 'trail-runners', name: 'Trail Runners', slot: 'feet', weightOz: 21, price: 140, durability: 500,
    bonus: { Speed: 5 }, blurb: 'Fast and light — but you’ll burn through several pairs on a thru.' },
  { id: 'stove', name: 'Canister Stove', slot: 'kitchen', weightOz: 3, price: 50, durability: 1700,
    bonus: { Morale: 3, Energy: 2 }, blurb: 'Hot dinner is a morale machine.' },
  { id: 'cold-soak-jar', name: 'Cold Soak Jar', slot: 'kitchen', weightOz: 2, price: 5, durability: 9999,
    bonus: { Speed: 2 }, blurb: 'No stove, no fuss. Lighter pack, sadder dinners.' },
  { id: 'sun-hoodie', name: 'Sun Hoodie', slot: 'torso', weightOz: 5, price: 60, durability: 1200,
    bonus: { Fitness: 2, Chillness: 2 }, blurb: 'Beats the desert sun without sunscreen.' },
];

export const GEAR_BY_ID = Object.fromEntries(GEAR.map(g => [g.id, g]));

// The starter kit every hiker leaves Campo with.
export const STARTER_GEAR = ['ul-tent', 'quilt', 'sawyer', 'trail-runners', 'stove'];
