# NORTHBOUND — Build Spec

> **NORTHBOUND** is an Oregon Trail clone reskinned into the world of this repo:
> a five-hiker *trail crew* carrying everything they own 2,650 miles up the Pacific
> Crest Trail from the Mexican border to Canada, racing the snow line.
>
> There are no draft animals here. The Oregon Trail's oxen-and-wagon has no honest
> equivalent on the modern PCT, so the lever it puts on livestock sits on **pack
> weight**: capacity scales with how many people are still walking, and every pound
> is a pound somebody carries to Canada.
>
> Gameplay is a deliberate, close clone of *The Oregon Trail* (1985/1990):
> occupation choice → outfitting store → pace/rations management → landmarks →
> river fords → hunting (here: **foraging**) → illness/breakdowns → resupply →
> score screen. The *style* is ours: the atmospheric, limited-palette, silhouette
> pixel art established in `/web` (Sword & Sworcery-adjacent), plus real PCT
> landmarks from `/Thru`.

**This file is the integration contract.** Every module below must export exactly
the named symbols with the named shapes. Do not rename, do not add required
constructor arguments, do not change a function's arity. Additive extras are fine.

---

## 0. Stack & ground rules

- Node 22, **ES modules everywhere**, `"type": "module"`. **No build step, no bundler, no transpiler.**
- Runtime deps: `express` only. Dev deps: `playwright` (headless playtest) — Chromium is preinstalled at `/opt/pw-browsers`, never download browsers.
- Client is plain `<script type="module">`. Imports are **relative paths with explicit `.js` extensions**.
- Shared data lives in `northbound/data/*.js` and is imported by *both* the client (served at `/data/`) and `node --test`. From client code the path is `/data/xxx.js`; from `northbound/public/js/**` use `../../../data/xxx.js` style relative paths **only in tests**. **Rule: client modules import data as `/data/xxx.js` (absolute URL path).** Tests import `../data/xxx.js`.
  - This works because the server mounts `data/` at `/data`.
- No external network calls at runtime. No CDN. No web fonts.
- Everything renders into a **320×180** internal canvas buffer, scaled up nearest-neighbour (`image-rendering: pixelated`). Constants `BASE_W = 320`, `BASE_H = 180`.
- Never crash the page. Zero console errors/warnings during a full playthrough is a **hard requirement**.

## 1. Directory layout

```
northbound/
  package.json
  server.js                  express + save API
  electron/main.js
  SPEC.md                    (this file)
  README.md
  data/
    trail.js  items.js  events.js  ailments.js  party.js  dialogue.js  store.js
  public/
    index.html
    css/style.css
    assets/
      atlas.json             generated
      sprites/*.png          generated
    js/
      main.js                bootstrap
      engine/ rng.js  sim.js  save.js  score.js
      audio/  audio.js
      render/ atlas.js  scene.js  fx.js  map.js  text.js
      minigames/ forage.js  ford.js
      ui/     ui.js  screens/*.js  hud.js
  scripts/
    bake-assets.mjs          generates public/assets/**
    playtest.mjs             headless full playthrough + screenshots
  test/
    *.test.js                node --test
  docs/screenshots/*.png
```

## 2. Art direction (binding on every visual module)

**Palette — the NORTHBOUND core ramp.** Use these exact hex values for UI chrome and
as the anchor of every biome palette. Never introduce fully saturated primaries.

```
ink        #f4ecdd   parchment text
ink-dim    #a99e8c
night      #0e0b17   page background
panel      #1a1526
panel-2    #251d36
edge       #4b3f66   borders
gold       #f2c98a   primary accent (headings, selection)
gold-dim   #c39d63
rust       #d1785c   danger / illness
sage       #8fd0a4   good / healthy
sky-ice    #bfe3ff   the snow line, cold, winter
violet     #6b5a94   shadow tint
```

**Rules.**
- Everything is 1px-grid pixel art at 320×180. No sub-pixel positions when drawing
  sprites: always `x|0`, `y|0`.
- Backgrounds are **flat colour fields + silhouettes**, not textures. Depth comes from
  parallax layers, each a single flat colour, getting lighter/hazier with distance.
- The party is rendered as small (12–20px tall), mostly-silhouetted figures with 1–2
  accent colours each. Readability at 320×180 beats detail.
- Dithering (checkerboard 50%, and 25%/75% Bayer) is the only gradient tool inside the
  pixel buffer. CSS gradients are allowed in HTML UI chrome, not in the canvas.
- Every biome gets a 8-colour palette: `[skyTop, skyBottom, sun, ridgeFar, ridgeMid, ridgeNear, ground, accent]`.
  Biomes: `desert`, `chaparral`, `sierra`, `alpine`, `forest`, `volcanic`, `rainforest`.
- Weather tints the whole frame via an overlay pass, never by swapping palettes.

**Motion.** Nothing is static. The trail scene always has: parallax scroll, a 6-frame
walk cycle, mule head bob for a passing packer's string, drifting clouds, weather particles,
and a slow day/night colour drift.

---

## 3. `data/` contracts

### 3.1 `data/trail.js`

```js
export const TOTAL_MILES = 2650;

// 24–28 entries, strictly increasing `mile`, first mile 0, last mile TOTAL_MILES.
export const LANDMARKS = [{
  id: 'campo',                    // kebab-case unique
  name: 'Southern Terminus',
  mile: 0,
  elev: 2915,                     // feet
  state: 'CA',
  biome: 'desert',                // one of the 7 biomes
  kind: 'terminus',               // 'terminus' | 'town' | 'landmark' | 'ford' | 'pass'
  store: null,                    // null | { mult: 1.0, name: "Scout's Outfitters" }  price multiplier
  ford: null,                     // null | { name, widthFt, depthFt, flow: 'calm'|'brisk'|'raging', bridge: bool }
  forage: 'poor',                 // 'poor' | 'fair' | 'good' | 'rich'  — quality of the foraging minigame here
  blurb: 'A wooden monument...',  // 1–3 sentences, second person, present tense
}];

export const BIOMES = ['desert','chaparral','sierra','alpine','forest','volcanic','rainforest'];

export function landmarkAtMile(mile)   // exact match or null
export function nextLandmark(mile)     // first landmark with mile > given, or null
export function lastLandmark(mile)     // last landmark with mile <= given
export function biomeAtMile(mile)      // biome of lastLandmark
export function elevAtMile(mile)       // linear interpolation between landmarks
export function terrainFactor(mile)    // 0.72..1.15 speed multiplier from grade+elevation
```

Landmark set must include real PCT touchstones: Southern Terminus, Lake Morena, Mount
Laguna, Scissors Crossing, Warner Springs, Idyllwild, Big Bear, Deep Creek Hot Springs,
Cajon Pass, Wrightwood, Agua Dulce, Hikertown, Tehachapi, Walker Pass, Kennedy Meadows,
Forester Pass, Kearsarge/Bishop, Muir Trail Ranch, Tuolumne Meadows, Sonora Pass, South
Lake Tahoe, Sierra City, Belden, Midpoint Monument, Burney Falls, Etna, Seiad Valley,
Ashland, Crater Lake, Shelter Cove, Sisters/McKenzie Pass, Timberline Lodge, Cascade
Locks, Trout Lake, White Pass, Snoqualmie Pass, Stevens Pass, Stehekin, Northern
Terminus. Trim to ~28 of the strongest, keeping mile order and spacing sane.

At least **6** must be `ford` (Deep Creek, Kern, Evolution Creek, Bear Creek, Rock
Creek, Suiattle River, Bridge of the Gods is a bridge crossing) and at least **9** must
have a `store`. Store multipliers rise with remoteness (1.0 at the terminus up to ~2.1
at Stehekin/VVR-style outposts).

### 3.2 `data/items.js`

```js
export const ITEMS = [{
  id: 'food',
  name: 'Trail Food',
  unit: 'lb',              // 'lb' | 'each' | 'set' | 'head'
  price: 0.42,             // base price in dollars per unit at mult 1.0
  weightLb: 1,             // per unit, counts against what the crew can carry
  category: 'food',        // 'food'|'parts'|'clothing'|'medical'|'stock'|'tools'|'luxury'
  icon: 'item_food',       // MUST match an atlas frame name
  blurb: 'Calories are miles.',
  max: 2000,               // purchase cap
}];
export const ITEMS_BY_ID;                  // Record<id, item>
export const GEAR_PARTS = ['soles','poles','filter','pack','shelter'];  // spares are `spare_<part>`
export function priceOf(itemId, mult)      // rounded to 2dp
```

Required item ids (the sim references these by name — do not rename):
`food`, `money` is not an item. Parts: `spare_soles`, `spare_poles`, `spare_filter`,
`spare_pack`, `spare_shelter`. Clothing: `clothing` (sets), `puffy`.
Medical: `first_aid`, `electrolytes`, `blister_kit`. Tools: `bear_can`,
`ice_axe`, `stove_fuel`, `water_carry`. Luxury: `camp_chair`, `paperback`, `harmonica`.
Each luxury gives a small daily spirit bonus.

### 3.3 `data/ailments.js`

```js
export const AILMENTS = [{
  id: 'giardia',
  name: 'Giardia',
  kind: 'illness',           // 'illness' | 'injury' | 'exposure'
  severity: 2,               // 1 mild .. 3 severe
  minDays: 3, maxDays: 8,
  healthDrainPerDay: 6,      // subtracted from that member's health each day
  paceMult: 0.85,            // party speed multiplier while anyone has it
  curedBy: ['first_aid'],    // item ids that shorten it (consumes 1, halves remaining days)
  onsetText: '{name} is doubled over behind a juniper. It is giardia.',
  recoverText: '{name} keeps food down again and manages a weak thumbs-up.',
  deathText: '{name} could not hold water down. The crew buries a cairn at {landmark}.',
  weather: null,             // null | 'snow' | 'rain' | 'heat' — raises odds in this weather
  biomes: null,              // null = any, else array of biome ids
}];
export const AILMENTS_BY_ID;
```
Minimum 14 ailments: giardia, dysentery, norovirus, hypothermia, heat exhaustion,
altitude sickness, shin splints, blisters, sprained ankle, stress fracture, snakebite,
sunburn, tendonitis, smoke inhalation, tooth abscess.

### 3.4 `data/events.js`

```js
export const EVENTS = [{
  id: 'marmot-raid',
  weight: 6,                             // relative frequency
  biomes: ['sierra','alpine'],           // null = any
  minMile: 0, maxMile: 2650,
  requires: null,                        // null | (g) => bool   — pure predicate on game state
  once: false,                           // fire at most once per run
  title: 'Marmot Raid',
  text: 'A marmot has chewed through the mesh...',    // supports {leader} {member} {landmark} {miles}
  // Either a plain outcome (fires immediately, Oregon-Trail style):
  effects: { food: -18, spirit: -4 },    // see Effects below
  resultText: 'You lose 18 lb of food.',
  // ...or a choice card (2–3 options, our Thru-flavoured extension):
  choices: [{
    label: 'Chase it down',
    effects: { spirit: +3, health: -2 },
    resultText: 'You get half of it back, laughing.',
    chance: 0.5,                         // optional; if present, effects apply on success
    failEffects: { food: -6 }, failText: 'It vanishes into the talus.'
  }],
}];
export function rollEvent(g, rng)        // weighted pick honouring filters; returns event or null
```

**Effects object** — every key optional, all numeric deltas applied by the sim:
`food, money, miles, spirit, health, days` plus any item id (`spare_soles: -1`),
plus `ailment: 'giardia'` (applies to a random living member), `kill: true` (a random
member dies), `partHealth: -10`, `kitCondition: -15`, `weather: 'snow'`.

Minimum **60** events, spread across biomes, with the Oregon Trail canon reskinned:
theft, lost trail, bad water, blown pack strap, wildfire closure, trail magic,
snowstorm, hail, heat wave, hitchhiker, lost member, rattlesnake, bear canister failure,
river washout, ranger encounter, norovirus outbreak in a shelter, trail crew handing out
sodas, thunderstorm above treeline, mosquito hell, resupply box lost in the mail, etc.
At least 20 must be choice cards.

### 3.5 `data/party.js`

```js
export const OCCUPATIONS = [{
  id: 'ranger', name: 'Backcountry Ranger', money: 1600, scoreMult: 1,
  blurb: '...', perk: 'Reads weather a day ahead; fords are safer.',
  effects: { fordBonus: 0.15, weatherForecast: true },   // consumed by sim, see §5.6
}];
export const NAME_POOL = { first: [...], last: [...] };  // >= 40 each
export const TRAIL_NAMES = [...];                        // >= 60 given trail names
export function generateTrailName(rng)
export const EPITAPHS = [...];                           // >= 25 short cairn inscriptions
export const PORTRAIT_PARTS = { hair: [...], skin: [...], shirt: [...] };  // hex colour arrays for sprite tinting
```
Occupations (5, mirroring OT's banker/carpenter/farmer money-vs-score tradeoff):
`trail-angel` (rich, ×1), `gear-rep` (×1), `ranger` (×2), `cook` (×2), `dirtbag` (×3, poorest).

### 3.6 `data/dialogue.js`

```js
export const TALK = [{ biome: 'desert'|null, kind: 'town'|'landmark'|null, speaker: 'A sunburnt southbounder', line: '...' }];
export function talkLine(landmark, rng)   // picks a fitting line
export const STORE_GREETINGS = { 'campo': '...' };  // keyed by landmark id, optional
```
Minimum 70 talk lines. Voice: dry, warm, specific, occasionally funny. No emoji.

### 3.7 `data/store.js`

```js
export const STORE_STOCK = ['food','spare_soles','spare_poles',...];  // ids offered, in display order
export function stockFor(landmark)   // subset appropriate to that landmark (small stores carry less)
```

---

## 4. `public/js/engine/`

### 4.1 `engine/rng.js`
```js
export function makeRng(seed)          // mulberry32 -> () => [0,1)
export function randInt(rng, lo, hi)   // inclusive
export function pick(rng, arr)
export function weighted(rng, arr, weightFn)
export function chance(rng, p)
export function shuffle(rng, arr)      // returns new array
```

### 4.2 `engine/sim.js` — the whole game, pure logic, **no DOM, no imports from render/ui/audio**

```js
export const PACES   = { steady:{...}, strenuous:{...}, grueling:{...} };
export const RATIONS  = { filling:{lbPerDay:3}, meager:{lbPerDay:2}, bare:{lbPerDay:1} };
export const WEATHERS = ['clear','hot','rain','storm','hail','snow','smoke','fog','wind'];

export function newGame(opts)   // opts: { leaderName, memberNames:[4], occupation, month, seed, difficulty }
export function startingKit(occupationId)
export function advanceDay(g)   // THE tick. returns a `DayReport` (see below). Never throws.
export function restDays(g, n)  // camp/zero days
export function buy(g, itemId, qty, mult)      // returns {ok, reason}
export function sell(g, itemId, qty, mult)
export function useItem(g, itemId, memberIndex)
export function applyEffects(g, effects)       // returns string[] of log lines
export function resolveFord(g, method, outcome) // method: 'ford'|'rock-hop'|'raft'|'shuttle'|'wait'
export function applyForageResult(g, lbs)
export function setPace(g, pace); export function setRations(g, r)
export function isOver(g)      // bool
export function serialize(g);  export function deserialize(json)   // rng seed+calls must round-trip
```

**Game state `g`** (this exact shape is what save files and the UI read):
```js
{
  version: 1, seed, rngCalls,
  leader: { name, occupation },
  party: [{ name, trailName, alive, health, /* 0..100 */ ailments: [{id, daysLeft}],
            spirit /*0..100*/, portrait: {skin, hair, shirt}, causeOfDeath, diedMile, diedDate }],
  day, date: { year: 2026, month, day },
  mile, pace, rations,
  supplies: { food, money, /* plus every item id: */ spare_soles, ... },
  kit: { condition /*0..100*/, load /*lb*/, parts /*Record<part, 0..100>*/ },
  weather: { kind, tempF, severity /*0..1*/, daysLeft },
  snowMile,            // the snow line, chasing from the north; game over if snowMile <= mile
  landmarkIndex,       // index of last reached landmark
  atLandmark,          // landmark id or null — set when the day's travel arrives at one
  pendingFord,         // ford descriptor or null
  log: [{ day, kind, text }],   // kind: 'travel'|'event'|'health'|'store'|'landmark'|'death'|'weather'
  status: 'playing'|'won'|'lost',
  cause: null|string,
  stats: { milesHiked, daysOnTrail, eventsSurvived, fordsCrossed, lbsForaged, moneySpent },
}
```

**`DayReport`** returned by `advanceDay`:
```js
{ miles, arrived: landmark|null, event: event|null, eventChoices: bool,
  weatherChanged: bool, deaths: [name], recoveries: [name], onsets: [{name, ailment}],
  breakdown: partId|null, lines: [string], ended: bool }
```

### 4.3 `engine/score.js`
```js
export function scoreGame(g)   // { rows: [{label, qty, points}], total, rank }
```
Oregon-Trail-style: points per surviving member scaled by health, per lb of
food, per spare part, per dollar, ×occupation multiplier. `rank` from a table
("Trail Legend", "Thru-Hiker", "Section Hiker", "Weekend Warrior", "Day Hiker").

### 4.4 `engine/save.js`
```js
export async function saveGame(g)      // POST /api/save, localStorage mirror
export async function loadGame()       // GET /api/load, falls back to localStorage, returns g|null
export async function clearSave()
export async function saveScore(entry) // POST /api/scores  {name, score, rank, miles, date}
export async function loadScores()     // GET /api/scores -> array, sorted desc, top 10
```
All must resolve (never reject) — network failure falls back to `localStorage`.

---

## 5. Gameplay rules (the clone, precisely)

### 5.1 Setup
1. **Occupation** — sets starting money and score multiplier.
2. **Name the crew** — leader + 4 members; a "Roll the dice" button fills random names.
3. **Departure month** — Mar/Apr/May/Jun. Earlier = more Sierra snow and a colder start
   but a huge head start on the snow line; later = easy passes but the snow line is
   right behind you. This is the OT "leave in March vs July" tradeoff.
4. **Outfitting store** at the Southern Terminus (mult 1.0). Must be able to leave broke.

### 5.2 The daily tick (`advanceDay`)
In this order, always:
1. If `status !== 'playing'` return `{ended:true}`.
2. Advance date by 1 day; `day++`.
3. Roll/decay weather (`weather.daysLeft--`, new system when 0; weather odds by biome + month + elevation).
4. Compute **miles**:
   `base(pace) × terrainFactor(mile) × packFactor × healthFactor × weatherFactor × kitFactor`
   - `base`: steady 15, strenuous 20, grueling 25
   - `packFactor`: a curve on `load / packCapacity`. Under ~half capacity the crew beats
     baseline; at capacity they are slowed; over it, badly. `packCapacity` is
     `12 + 34 × livingCount` lb, so it *shrinks when somebody dies*.
   - `healthFactor`: mean living-member health mapped 0.55..1.1
   - `weatherFactor`: clear 1.0, hot .9, rain .88, storm .7, hail .75, snow .55, smoke .85, fog .9, wind .93
   - `kitFactor`: `0.7 + 0.3 × kit.condition/100`
   - Result clamped ≥ 1, floored to integer. Never overshoot the next landmark by more
     than it takes to arrive — if `mile + miles >= nextLandmark.mile`, clamp to the
     landmark and set `atLandmark`.
5. **Food**: consume `livingCount × RATIONS[rations].lbPerDay`. If insufficient, eat what
   is left, set `starving`, and drain health hard (−12/member/day).
6. **Health tick** per living member: start from a drift toward 100, then subtract for
   pace (steady 0, strenuous 2, grueling 5), rations (filling −0, meager 2, bare 5),
   weather severity, elevation over 9,000 ft, ailments' `healthDrainPerDay`, kit
   overload. Add for camp/rest days, luxuries, and `first_aid` use. Clamp 0..100.
   Health ≤ 0 ⇒ member dies (log a death + epitaph).
7. **Ailments**: tick `daysLeft`, recover at 0. Roll new onsets with probability from
   (100 − health)/900 + weather/biome modifiers.
8. **Spirit** (party morale, the nod to *Thru*): drifts down on grueling pace, bad
   weather, deaths; up at landmarks, towns, trail magic, luxuries. Spirit < 15 gives a
   pace penalty and unlocks "the crew is talking about getting off trail" warnings.
9. **Kit**: wear `kit.condition` by pace and terrain; a random breakdown roll can
   destroy a part. With a matching spare in supplies, it is consumed automatically and
   costs 0 days; without one, the party loses 1–3 days (or must trade/shop).
10. **Snow line**: `snowMile -= snowPerDay` where `snowPerDay` grows through the season
    (September onward it accelerates). If `snowMile <= mile` ⇒ `status='lost'`,
    `cause='snowed-off'`.
11. **Arrival**: if `atLandmark`, push a landmark log line, spirit bonus, and (for towns)
    let the UI open the town menu.
12. **Event**: if no landmark arrival, `rollEvent` at ~28% per day.
13. Win when `mile >= TOTAL_MILES` ⇒ `status='won'`.

### 5.3 Landmark / town menu
The Oregon Trail's menu, in its order — this list and its ordering are a requirement,
not a suggestion, and `test/oregon-trail-parity.test.js` pins the pieces of it that the
engine owns:

1. Continue on the trail
2. Check supplies
3. Look at the map
4. Change pace
5. Change food rations
6. Stop to rest
7. Attempt to trade
8. Talk to people
9. Buy supplies *(stores only)*

River crossings are **not** menu items: arriving at a ford opens the crossing directly,
the way the original stops you at the bank. Foraging is reached from the trail HUD on
any day, matching where "Hunt" sits in the original.

### 5.4 Fords
At a `ford` landmark, offer: **Ford it** (fast, risks losing supplies or a member —
odds from depth × flow), **Rock-hop upstream** (costs ½–1 day, safer), **Pack-raft
across** (needs `water_carry`… no: costs money if a shuttle is nearby; else risky),
**Hire a shuttle/hitch around** (costs money), **Wait a day** (flow drops with cold
nights; snowmelt fords are lower in the morning). Implemented as a short **minigame**
(§7.2) whose outcome feeds `resolveFord`.

### 5.5 Foraging (the "hunting" minigame)
Costs 1 day. Yields `lbs` of food capped by what the crew can carry back (100 lb) and by
the landmark's `forage` quality. Playable 2D minigame (§7.1).

**Gated by a consumable, exactly as hunting is gated by bullets.** A trip out spends one
canister of `stove_fuel`; with none left the crew can only bring back what they can eat
raw (`BALANCE.forageNoFuelYield`). Fuel is therefore a real store decision, is stocked at
every store on the trail, and leftover fuel scores points at the end like leftover
ammunition does.

### 5.6 Occupation perks
`fordBonus` (added to ford success chance), `weatherForecast` (UI shows tomorrow's
weather), `healRate` (health drift bonus), `haggle` (store price ×0.9),
`forageBonus` (×1.25 forage yield).

---

## 6. `public/js/render/`

### 6.1 `render/atlas.js`
```js
export const BASE_W = 320, BASE_H = 180;
export async function loadAtlas()                       // fetch /assets/atlas.json + all PNGs
export function frame(name)                             // {img, x, y, w, h} — throws only in dev; returns a magenta 8x8 placeholder if missing
export function draw(ctx, name, x, y, opts)             // opts: {flip, alpha, tint, scale}
export function drawAnim(ctx, animName, t, x, y, opts)  // t in seconds
export function tintedFrame(name, hex)                  // cached recolour (for portraits/shirts)
```

### 6.2 Required atlas frame names (the baker MUST produce these; the renderer MUST only use these)

| group | frames |
|---|---|
| hikers | `hiker_walk_0..5`, `hiker_idle_0..1`, `hiker_rest_0..1`, `hiker_sick_0..1`, `hiker_dead_0` (16×24, feet at bottom, faces right) |
| leader | `leader_walk_0..5` (18×26, distinct hat) |
| mule | `mule_walk_0..5`, `mule_idle_0..1`, `mule_sick_0` (24×20) |
| props | `prop_saguaro`, `prop_yucca`, `prop_juniper`, `prop_pine_0..2`, `prop_boulder_0..1`, `prop_snowpatch`, `prop_sign`, `prop_cairn`, `prop_tent`, `prop_campfire_0..3`, `prop_wildflower`, `prop_stump`, `prop_fern`, `prop_lupine` |
| landmarks | `lm_monument`, `lm_town`, `lm_pass`, `lm_ford`, `lm_lake`, `lm_falls`, `lm_lodge`, `lm_firetower` (48×40 hero silhouettes) |
| items | `item_<id>` for every id in `ITEMS` (16×16) |
| ui | `ui_frame_tl/t/tr/l/r/bl/b/br/c` (8×8 nine-slice), `ui_cursor`, `ui_arrow`, `ui_heart_full/half/empty`, `ui_star`, `ui_snowflake`, `ui_compass` |
| forage | `berry_0..2`, `mushroom_0..2`, `fish_0..2`, `bear_walk_0..3`, `snake_0..1`, `forager_walk_0..3`, `forager_grab_0..1` |
| ford | `water_0..3` (32×16 tiling), `raft_0..1`, `rock_0..2` |
| font | `font_<char>` for `A-Z 0-9 . , ! ? ' " : ; - + % $ / ( ) space` at 5×7 |
| weather | `rain_0..1`, `snowflake_0..2`, `cloud_0..3`, `sun`, `moon`, `star_0..1` |

`atlas.json` shape:
```json
{ "images": { "main": "sprites/main.png", "font": "sprites/font.png" },
  "frames": { "hiker_walk_0": { "img": "main", "x": 0, "y": 0, "w": 16, "h": 24 } },
  "anims":  { "hiker_walk": { "frames": ["hiker_walk_0","..."], "fps": 10, "loop": true } } }
```

### 6.3 `render/scene.js`
```js
export function createScene(canvas)   // -> { render(state, dt), resize(), flash(color), shake(power) }
```
`state`: `{ biome, mile, scroll, walking, dayPhase /*0..1*/, weather, party, kitCondition, landmark, elevation, night }`.
Draws (back→front): sky gradient (dithered bands, **not** a smooth CSS gradient), sun/moon
+ stars, 3 parallax ridgelines, haze dither, midground props, ground band, trail tread,
foreground props, the **caravan** (crew → leader, spaced, each with the
walk cycle offset), weather particles, vignette, and a subtle 1px scanline/grain overlay.

### 6.4 `render/fx.js`
```js
export function createFx()  // { emit(kind, opts), update(dt), draw(ctx), clear() }
```
Kinds: `dust`, `rain`, `snow`, `hail`, `ember`, `leaf`, `splash`, `sparkle`, `smoke`,
`blood`(muted), `heart`, `coin`, `sweat`. Plus `shake` and `flash` helpers used by scene.

### 6.5 `render/map.js`
```js
export function drawMap(ctx, g, opts)   // full-screen trail map: route polyline shaped by
                                        // elevation profile, landmark pins, you-are-here
                                        // marker, snow-line curtain from the north,
                                        // hover/selected landmark detail.
export function hitTestLandmark(x, y)   // for mouse interaction; returns landmark id|null
```

### 6.6 `render/text.js`
```js
export function drawText(ctx, str, x, y, opts)  // bitmap font from the atlas; opts {color, scale, align, wrap, shadow}
export function measureText(str, scale)
```

---

## 7. `public/js/minigames/`

### 7.1 `minigames/forage.js`
```js
export function runForage(canvas, opts)   // opts: { quality, biome, rng, bonus } -> Promise<{ lbs, log: [] }>
```
A 45-second, side-on 2D field: the forager sprite moves left/right/up/down (arrows or
WASD, and on-screen buttons for touch), presses Space/click to gather glowing nodes
(berries/mushrooms/fish at water). Nodes respawn. A bear and a rattlesnake wander; a
bear collision ends the run early and costs some of the haul. HUD shows carried lb (cap
100) and time. Must clean up all listeners and rAF on resolve.

### 7.2 `minigames/ford.js`
```js
export function runFord(canvas, opts)  // opts: { ford, method, g, rng } -> Promise<{ success, severity, log }>
```
For `ford`: a timing/steering game — the crew crosses a scrolling river; the player holds
a line against current drift with left/right; drifting into deep water raises risk.
For `rock-hop`: a rhythm/timing bar (press at the right moment ×3).
For `raft`/`shuttle`/`wait`: resolve instantly with a short animated beat, no input.

Both minigames must be **skippable** (`Esc` → resolves with an average result) so the
headless playtest never hangs.

---

## 8. `public/js/audio/audio.js`

```js
export const Audio = {
  async init(),                         // must be called from a user gesture; safe to call twice
  playMusic(id, { fade = 1.2 } = {}),   // crossfades
  stopMusic({fade}),
  sfx(id, { vol = 1, rate = 1 } = {}),
  setMusicVolume(v), setSfxVolume(v),   // 0..1, persisted to localStorage
  muted, toggleMute(),
};
```
**Music ids** (all synthesized, no files): `theme_title`, `trail_desert`, `trail_sierra`,
`trail_forest`, `trail_rain`, `town`, `store`, `danger`, `night_camp`, `funeral`,
`victory`, `defeat`, `forage`, `ford`.
Each track is a real composition: a chord progression, a bass line, a lead motif, and
percussion, with per-track instrument patches (square/triangle/saw/noise + envelope +
filter + delay). Tracks loop seamlessly and are scheduled ahead on the WebAudio clock
(no `setInterval` note scheduling drift).

**SFX ids**: `click`, `back`, `select`, `buy`, `coin`, `error`, `footstep`, `pack_creak`,
`mule_bray`, `thunder`, `rain_start`, `wind`, `splash`, `river`, `bird`, `snake_rattle`,
`bear_growl`, `pickup`, `chomp`, `heartbeat`, `sick`, `death_knell`, `snap`, `hammer`,
`page`, `map_open`, `win_fanfare`, `lose_fanfare`, `level_up`, `campfire`, `snowfall`,
`arrive`, `whistle`, `tick`.

The audio module must never throw if WebAudio is unavailable — degrade to no-ops.

---

## 9. `public/js/ui/`

`ui/ui.js` exports `export async function init()`, called by `main.js`. It owns:
screen routing, keyboard shortcuts, focus, the HUD, and all modal panels. Screens live in
`ui/screens/*.js`, each exporting `export function mount(ctx)` / `export function unmount()`
where `ctx` gives `{ game, go(screen, params), toast(msg), refresh(), audio, scene, fx }`.

Screens: `title`, `setup`, `store`, `trail`, `landmark`, `map`, `pack`, `party`, `event`,
`camp`, `talk`, `forage`, `ford`, `end`, `scores`, `settings`, `help`.

**Every** interactive element must be reachable by keyboard, and every screen must render
correctly from 960×540 up to 4K. Panels use the nine-slice `ui_frame_*` sprites *or* the
CSS panel style — pick one per surface and be consistent.

---

## 10. Testing bar

- `npm test` → `node --test test/` must pass, covering: trail data invariants (monotonic
  miles, valid biomes, ford/store shapes), item catalog validity (every `icon` exists in
  atlas.json), events (all effect keys known, all `requires` are functions, weights > 0),
  sim determinism (same seed ⇒ same 200-day trace), food/starvation, ailment lifecycle,
  death and party wipe, snow-line loss, win reachability, gear breakdowns, store
  buy/sell arithmetic, save round-trip, scoring.
- `node scripts/playtest.mjs` → headless Chromium boots the server, plays a full run
  (setup → store → ~150 days with pace/ration changes, fords, foraging, events) and
  asserts **zero** console errors/warnings and zero page errors, then writes screenshots
  to `docs/screenshots/`.
- Both must be green before shipping.
