// Trailcraft (deckbuilder mode) — card catalog.
//
// Cards are pure data so a deck is just a list of card ids that serializes cleanly.
// The engine's deck module (in engine.js) interprets each card's `fx` effect object:
//   cost    : Stamina to play it
//   miles   : miles advanced up the trail
//   morale  : morale delta
//   energy  : energy delta
//   snacks  : snacks delta
//   stamina : Stamina refunded/added (enables chaining)
//   draw    : extra cards drawn into hand
//   money   : money delta
//   camp    : true -> immediately ends the day after resolving (a "zero"-ish card)
//
// `kind` groups cards: 'start' seed the opening deck; 'shop' can be bought in town.
export const CARDS = {
  // ---- Starter kit -------------------------------------------------------------
  steady:   { id: 'steady',   kind: 'start', name: 'Steady Steps', cost: 1, fx: { miles: 9 },
              text: 'Put one foot in front of the other. +9 miles.' },
  amble:    { id: 'amble',    kind: 'start', name: 'Amble',        cost: 1, fx: { miles: 6, morale: 3 },
              text: 'An easy, happy pace. +6 miles, +3 morale.' },
  snackbar: { id: 'snackbar', kind: 'start', name: 'Trail Snack',  cost: 1, fx: { snacks: 12, morale: 1 },
              text: 'A honey bun and a fistful of gummi bears. +12 snacks.' },
  breath:   { id: 'breath',   kind: 'start', name: 'Second Wind',  cost: 0, fx: { stamina: 2 },
              text: 'Catch your breath. +2 Stamina this day.' },
  pushon:   { id: 'pushon',   kind: 'start', name: 'Push On',      cost: 2, fx: { miles: 20, morale: -3 },
              text: 'Grind out a big block. +20 miles, -3 morale.' },

  // ---- Shop: mileage engines ---------------------------------------------------
  bigmiles: { id: 'bigmiles', kind: 'shop', name: 'Big Miles',     cost: 2, price: 45, fx: { miles: 25, morale: -4 },
              text: 'A monster day. +25 miles, -4 morale.' },
  traillegs:{ id: 'traillegs',kind: 'shop', name: 'Trail Legs',    cost: 1, price: 60, fx: { miles: 12, stamina: 1 },
              text: 'You are made of rebar now. +12 miles, +1 Stamina.' },
  ultralight:{id:'ultralight',kind: 'shop', name: 'Ultralight',    cost: 1, price: 70, fx: { miles: 15 },
              text: 'Cut the toothbrush in half. +15 miles.' },
  doubletime:{id:'doubletime',kind: 'shop', name: 'Double Time',   cost: 3, price: 85, fx: { miles: 36 },
              text: 'Dawn to dark, no dawdling. +36 miles.' },
  nighthike:{ id: 'nighthike',kind: 'shop', name: 'Night Hike',    cost: 1, price: 55, fx: { miles: 14, energy: -6 },
              text: 'Headlamp on, cruise the cool dark. +14 miles, -6 energy.' },

  // ---- Shop: morale & recovery -------------------------------------------------
  trailmagic:{id:'trailmagic',kind: 'shop', name: 'Trail Magic',   cost: 0, price: 50, fx: { morale: 10, draw: 1 },
              text: 'A cooler of cold soda at the road. +10 morale, draw a card.' },
  zenmoment:{ id: 'zenmoment',kind: 'shop', name: 'Zen Moment',    cost: 1, price: 40, fx: { morale: 15 },
              text: 'Sit on a rock and watch the light. +15 morale.' },
  coffee:   { id: 'coffee',   kind: 'shop', name: 'Camp Coffee',   cost: 0, price: 45, fx: { energy: 12, stamina: 1 },
              text: 'A hot cup at dawn changes everything. +12 energy, +1 Stamina.' },
  resupply: { id: 'resupply', kind: 'shop', name: 'Resupply',      cost: 1, price: 35, fx: { snacks: 45, morale: 3 },
              text: 'Box picked up, food bag stuffed. +45 snacks.' },
  cowboy:   { id: 'cowboy',   kind: 'shop', name: 'Cowboy Camp',   cost: 0, price: 50, fx: { stamina: 1, draw: 1 },
              text: 'No tent, just stars. +1 Stamina, draw a card.' },
  angel:    { id: 'angel',    kind: 'shop', name: 'Trail Angel',   cost: 0, price: 60, fx: { morale: 8, snacks: 20, draw: 1 },
              text: 'A stranger with a truck full of kindness. +8 morale, +20 snacks, draw.' },
};

export const CARD_LIST = Object.values(CARDS);
export const SHOP_CARDS = CARD_LIST.filter(c => c.kind === 'shop');

// The deck you leave Campo with in Trailcraft mode.
export const STARTER_DECK = [
  'steady', 'steady', 'steady', 'steady',
  'amble', 'amble',
  'snackbar', 'snackbar',
  'breath',
  'pushon',
];

export const HAND_SIZE = 5;
export const STAMINA_MAX = 3;
export const CULL_COST = 25; // pay to permanently remove a card from your deck in town
