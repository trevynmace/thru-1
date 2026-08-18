// data/*.js — the integration contract from SPEC §3. These are the invariants the
// simulation assumes without checking at runtime, so they get checked hard here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TOTAL_MILES, LANDMARKS, BIOMES,
  landmarkAtMile, nextLandmark, lastLandmark, biomeAtMile, elevAtMile, terrainFactor,
} from '../data/trail.js';
import { ITEMS, ITEMS_BY_ID, CART_PARTS, priceOf } from '../data/items.js';
import { AILMENTS, AILMENTS_BY_ID } from '../data/ailments.js';
import { EVENTS, rollEvent } from '../data/events.js';
import { OCCUPATIONS, NAME_POOL, TRAIL_NAMES, generateTrailName, EPITAPHS, PORTRAIT_PARTS } from '../data/party.js';
import { TALK, talkLine } from '../data/dialogue.js';
import { STORE_STOCK, stockFor } from '../data/store.js';
import { makeRng } from '../public/js/engine/rng.js';
import { newGame } from '../public/js/engine/sim.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LANDMARK_KINDS = ['terminus', 'town', 'landmark', 'ford', 'pass'];
const FORAGE_QUALITIES = ['poor', 'fair', 'good', 'rich'];

// ---------------------------------------------------------------- trail

test('trail: 24-28 landmarks, strictly increasing miles, anchored at 0 and TOTAL_MILES', () => {
  assert.equal(TOTAL_MILES, 2650);
  assert.ok(LANDMARKS.length >= 24 && LANDMARKS.length <= 28, `got ${LANDMARKS.length}`);
  assert.equal(LANDMARKS[0].mile, 0);
  assert.equal(LANDMARKS[LANDMARKS.length - 1].mile, TOTAL_MILES);
  for (let i = 1; i < LANDMARKS.length; i++) {
    assert.ok(LANDMARKS[i].mile > LANDMARKS[i - 1].mile,
      `mile order broken at ${LANDMARKS[i].id}: ${LANDMARKS[i].mile} <= ${LANDMARKS[i - 1].mile}`);
  }
});

test('trail: every landmark is well-formed and ids are unique kebab-case', () => {
  const ids = new Set();
  for (const l of LANDMARKS) {
    assert.match(l.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${l.id}`);
    assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
    ids.add(l.id);
    assert.equal(typeof l.name, 'string');
    assert.ok(l.name.length > 0);
    assert.ok(Number.isFinite(l.elev), `${l.id} elev`);
    assert.ok(l.elev >= -100 && l.elev < 15000, `${l.id} elev out of range: ${l.elev}`);
    assert.equal(typeof l.state, 'string');
    assert.ok(BIOMES.includes(l.biome), `${l.id} biome ${l.biome}`);
    assert.ok(LANDMARK_KINDS.includes(l.kind), `${l.id} kind ${l.kind}`);
    assert.ok(FORAGE_QUALITIES.includes(l.forage), `${l.id} forage ${l.forage}`);
    assert.equal(typeof l.blurb, 'string');
    assert.ok(l.blurb.length > 10, `${l.id} blurb too short`);
    assert.ok(l.store === null || typeof l.store === 'object');
    assert.ok(l.ford === null || typeof l.ford === 'object');
  }
});

test('trail: biome list is exactly the seven from the spec', () => {
  assert.deepEqual([...BIOMES].sort(),
    ['alpine', 'chaparral', 'desert', 'forest', 'rainforest', 'sierra', 'volcanic']);
});

test('trail: at least 6 fords and 9 stores, with valid shapes and rising multipliers', () => {
  const fords = LANDMARKS.filter((l) => l.ford);
  const stores = LANDMARKS.filter((l) => l.store);
  assert.ok(fords.length >= 6, `only ${fords.length} fords`);
  assert.ok(stores.length >= 9, `only ${stores.length} stores`);
  for (const l of fords) {
    const f = l.ford;
    assert.equal(typeof f.name, 'string');
    assert.ok(Number.isFinite(f.widthFt) && f.widthFt > 0, `${l.id} widthFt`);
    // A bridge crossing (Bridge of the Gods) is a real ford entry with zero depth.
    assert.ok(Number.isFinite(f.depthFt) && (f.bridge ? f.depthFt >= 0 : f.depthFt > 0), `${l.id} depthFt`);
    assert.ok(['calm', 'brisk', 'raging'].includes(f.flow), `${l.id} flow ${f.flow}`);
    assert.equal(typeof f.bridge, 'boolean', `${l.id} bridge`);
  }
  for (const l of stores) {
    assert.ok(Number.isFinite(l.store.mult), `${l.id} store.mult`);
    assert.ok(l.store.mult >= 1 && l.store.mult <= 2.5, `${l.id} mult ${l.store.mult}`);
    assert.equal(typeof l.store.name, 'string');
  }
  assert.equal(stores[0].store.mult, 1.0, 'the outfitter at the terminus must be at mult 1.0');
  const last = stores[stores.length - 1];
  assert.ok(last.store.mult > 1.4, `remote stores should be dear, got ${last.store.mult}`);
});

test('trail: lookup helpers agree with the table at every landmark', () => {
  for (const l of LANDMARKS) {
    assert.equal(landmarkAtMile(l.mile)?.id, l.id);
    assert.equal(lastLandmark(l.mile)?.id, l.id);
    assert.equal(biomeAtMile(l.mile), l.biome);
    assert.equal(Math.round(elevAtMile(l.mile)), Math.round(l.elev), `elev at ${l.id}`);
  }
  assert.equal(landmarkAtMile(7.5), null);
  assert.equal(nextLandmark(TOTAL_MILES), null, 'nothing comes after Canada');
  assert.equal(nextLandmark(0)?.id, LANDMARKS[1].id);
  assert.equal(nextLandmark(-50)?.id, LANDMARKS[0].id);
});

test('trail: nextLandmark is strictly ahead and lastLandmark is behind, everywhere', () => {
  for (let m = 0; m <= TOTAL_MILES; m += 7) {
    const n = nextLandmark(m);
    const p = lastLandmark(m);
    if (n) assert.ok(n.mile > m, `nextLandmark(${m}) = ${n.mile}`);
    assert.ok(p, `no lastLandmark at ${m}`);
    assert.ok(p.mile <= m, `lastLandmark(${m}) = ${p.mile}`);
  }
});

test('trail: elevation interpolates monotonically between neighbours', () => {
  for (let i = 1; i < LANDMARKS.length; i++) {
    const a = LANDMARKS[i - 1];
    const b = LANDMARKS[i];
    const mid = (a.mile + b.mile) / 2;
    const e = elevAtMile(mid);
    const lo = Math.min(a.elev, b.elev) - 1;
    const hi = Math.max(a.elev, b.elev) + 1;
    assert.ok(e >= lo && e <= hi, `elev at ${mid} = ${e}, not between ${a.elev} and ${b.elev}`);
  }
});

test('trail: terrainFactor stays inside the contracted 0.72..1.15 band', () => {
  for (let m = -20; m <= TOTAL_MILES + 20; m += 3) {
    const f = terrainFactor(m);
    assert.ok(Number.isFinite(f), `terrainFactor(${m}) not finite`);
    assert.ok(f >= 0.72 && f <= 1.15, `terrainFactor(${m}) = ${f}`);
  }
});

test('trail: the canon touchstones are present', () => {
  const names = LANDMARKS.map((l) => l.name.toLowerCase()).join(' | ');
  for (const needle of ['terminus', 'kennedy meadows', 'forester', 'tuolumne', 'tahoe',
    'burney', 'crater lake', 'timberline', 'cascade locks', 'snoqualmie', 'stehekin']) {
    assert.ok(names.includes(needle), `missing landmark: ${needle}`);
  }
});

// ---------------------------------------------------------------- items

test('items: catalog is valid and ids are unique', () => {
  const units = ['lb', 'each', 'set', 'head'];
  const cats = ['food', 'parts', 'clothing', 'medical', 'stock', 'tools', 'luxury'];
  const seen = new Set();
  for (const it of ITEMS) {
    assert.ok(!seen.has(it.id), `duplicate item ${it.id}`);
    seen.add(it.id);
    assert.match(it.id, /^[a-z0-9_]+$/, `bad item id ${it.id}`);
    assert.equal(typeof it.name, 'string');
    assert.ok(units.includes(it.unit), `${it.id} unit ${it.unit}`);
    assert.ok(Number.isFinite(it.price) && it.price > 0, `${it.id} price`);
    assert.ok(Number.isFinite(it.weightLb) && it.weightLb >= 0, `${it.id} weightLb`);
    assert.ok(cats.includes(it.category), `${it.id} category ${it.category}`);
    assert.equal(it.icon, `item_${it.id}`, `${it.id} icon must be item_<id>`);
    assert.equal(typeof it.blurb, 'string');
    assert.ok(Number.isFinite(it.max) && it.max > 0, `${it.id} max`);
    assert.equal(ITEMS_BY_ID[it.id], it, `${it.id} missing from ITEMS_BY_ID`);
  }
  assert.equal(Object.keys(ITEMS_BY_ID).length, ITEMS.length);
});

test('items: every id the sim hard-codes exists', () => {
  const required = ['food', 'spare_wheel', 'spare_axle', 'spare_hitch', 'spare_soles',
    'spare_poles', 'spare_filter', 'clothing', 'puffy', 'first_aid', 'electrolytes',
    'blister_kit', 'mule', 'bear_can', 'ice_axe', 'stove_fuel', 'water_carry',
    'camp_chair', 'paperback', 'harmonica'];
  for (const id of required) assert.ok(ITEMS_BY_ID[id], `missing required item ${id}`);
  assert.ok(!ITEMS_BY_ID.money, 'money is not an item');
  for (const p of CART_PARTS) assert.ok(ITEMS_BY_ID[`spare_${p}`], `no spare for cart part ${p}`);
  assert.deepEqual(CART_PARTS, ['wheel', 'axle', 'hitch']);
});

test('items: there is at least one luxury and one of every category the store needs', () => {
  for (const cat of ['food', 'parts', 'clothing', 'medical', 'stock', 'tools', 'luxury']) {
    assert.ok(ITEMS.some((i) => i.category === cat), `no items in category ${cat}`);
  }
});

test('items: priceOf multiplies and rounds to 2dp', () => {
  assert.equal(priceOf('food', 1), ITEMS_BY_ID.food.price);
  assert.equal(priceOf('food', 2), Math.round(ITEMS_BY_ID.food.price * 2 * 100) / 100);
  const p = priceOf('food', 1.5);
  assert.equal(p, Math.round(p * 100) / 100, 'must be rounded to cents');
  assert.ok(p > 0);
  for (const it of ITEMS) {
    assert.ok(priceOf(it.id, 2.1) > priceOf(it.id, 1.0), `${it.id} does not scale with mult`);
  }
});

test('items: atlas icons exist if the atlas has been baked', () => {
  const atlasPath = join(HERE, '..', 'public', 'assets', 'atlas.json');
  if (!existsSync(atlasPath)) {
    // The baker has not run in this checkout; the naming contract is checked above.
    return;
  }
  const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
  for (const it of ITEMS) {
    assert.ok(atlas.frames && atlas.frames[it.icon], `atlas has no frame ${it.icon}`);
  }
});

// ---------------------------------------------------------------- ailments

test('ailments: at least 14, well-formed, unique ids', () => {
  assert.ok(AILMENTS.length >= 14, `only ${AILMENTS.length} ailments`);
  const seen = new Set();
  for (const a of AILMENTS) {
    assert.ok(!seen.has(a.id), `duplicate ailment ${a.id}`);
    seen.add(a.id);
    assert.ok(['illness', 'injury', 'exposure'].includes(a.kind), `${a.id} kind ${a.kind}`);
    assert.ok([1, 2, 3].includes(a.severity), `${a.id} severity ${a.severity}`);
    assert.ok(Number.isInteger(a.minDays) && a.minDays >= 1, `${a.id} minDays`);
    assert.ok(Number.isInteger(a.maxDays) && a.maxDays >= a.minDays, `${a.id} maxDays`);
    assert.ok(Number.isFinite(a.healthDrainPerDay) && a.healthDrainPerDay >= 0, `${a.id} drain`);
    assert.ok(a.paceMult > 0 && a.paceMult <= 1, `${a.id} paceMult ${a.paceMult}`);
    assert.ok(Array.isArray(a.curedBy), `${a.id} curedBy`);
    for (const c of a.curedBy) assert.ok(ITEMS_BY_ID[c], `${a.id} cured by unknown item ${c}`);
    for (const key of ['onsetText', 'recoverText', 'deathText']) {
      assert.equal(typeof a[key], 'string', `${a.id} ${key}`);
      assert.ok(a[key].includes('{name}'), `${a.id} ${key} must template {name}`);
    }
    assert.ok(a.weather === null || typeof a.weather === 'string', `${a.id} weather`);
    assert.ok(a.biomes === null || Array.isArray(a.biomes), `${a.id} biomes`);
    if (Array.isArray(a.biomes)) for (const b of a.biomes) assert.ok(BIOMES.includes(b), `${a.id} biome ${b}`);
    assert.equal(AILMENTS_BY_ID[a.id], a);
  }
});

test('ailments: the ones the sim references by name exist', () => {
  for (const id of ['giardia', 'hypothermia', 'blisters']) {
    assert.ok(AILMENTS_BY_ID[id], `sim hard-codes ailment ${id}`);
  }
});

test('ailments: no single ailment is instantly lethal at full health', () => {
  for (const a of AILMENTS) {
    assert.ok(a.healthDrainPerDay < 100, `${a.id} would kill in one day`);
    assert.ok(a.healthDrainPerDay * a.minDays < 200, `${a.id} is unsurvivable by construction`);
  }
});

// ---------------------------------------------------------------- events

const EFFECT_KEYS = new Set(['food', 'money', 'mules', 'miles', 'spirit', 'health', 'days',
  'ailment', 'kill', 'partHealth', 'cartCondition', 'weather']);

function checkEffects(where, fx) {
  assert.equal(typeof fx, 'object', `${where} effects must be an object`);
  assert.ok(fx !== null, `${where} effects null`);
  for (const [k, v] of Object.entries(fx)) {
    assert.ok(EFFECT_KEYS.has(k) || ITEMS_BY_ID[k], `${where}: unknown effect key "${k}"`);
    if (k === 'ailment') assert.ok(AILMENTS_BY_ID[v], `${where}: unknown ailment "${v}"`);
    else if (k === 'kill') assert.equal(typeof v, 'boolean', `${where}: kill must be boolean`);
    else if (k === 'weather') assert.ok(typeof v === 'string', `${where}: weather must be a string`);
    else assert.ok(Number.isFinite(v), `${where}: ${k} must be numeric, got ${v}`);
  }
}

test('events: at least 60, unique ids, sane weights and mile ranges', () => {
  assert.ok(EVENTS.length >= 60, `only ${EVENTS.length} events`);
  const seen = new Set();
  for (const e of EVENTS) {
    assert.ok(!seen.has(e.id), `duplicate event ${e.id}`);
    seen.add(e.id);
    assert.ok(Number.isFinite(e.weight) && e.weight > 0, `${e.id} weight ${e.weight}`);
    assert.ok(e.biomes === null || Array.isArray(e.biomes), `${e.id} biomes`);
    if (Array.isArray(e.biomes)) {
      assert.ok(e.biomes.length > 0, `${e.id} empty biome list`);
      for (const b of e.biomes) assert.ok(BIOMES.includes(b), `${e.id} biome ${b}`);
    }
    assert.ok(Number.isFinite(e.minMile) && Number.isFinite(e.maxMile), `${e.id} mile range`);
    assert.ok(e.minMile < e.maxMile, `${e.id} inverted mile range`);
    assert.ok(e.requires === null || typeof e.requires === 'function', `${e.id} requires must be null or a function`);
    assert.equal(typeof e.once, 'boolean', `${e.id} once`);
    assert.equal(typeof e.title, 'string', `${e.id} title`);
    assert.equal(typeof e.text, 'string', `${e.id} text`);
    assert.ok(e.text.length > 10, `${e.id} text too short`);
  }
});

test('events: every effect key is one the sim knows how to apply', () => {
  let choiceCards = 0;
  for (const e of EVENTS) {
    if (Array.isArray(e.choices) && e.choices.length) {
      choiceCards++;
      assert.ok(e.choices.length >= 2 && e.choices.length <= 3, `${e.id} needs 2-3 choices`);
      for (const [i, c] of e.choices.entries()) {
        assert.equal(typeof c.label, 'string', `${e.id}.${i} label`);
        checkEffects(`${e.id}.choice${i}`, c.effects || {});
        assert.equal(typeof c.resultText, 'string', `${e.id}.${i} resultText`);
        if (c.chance !== undefined) {
          assert.ok(c.chance > 0 && c.chance <= 1, `${e.id}.${i} chance ${c.chance}`);
          assert.ok(c.failEffects !== undefined || c.failText !== undefined,
            `${e.id}.${i} has a chance but no failure branch`);
        }
        if (c.failEffects) checkEffects(`${e.id}.choice${i}.fail`, c.failEffects);
      }
    } else {
      checkEffects(e.id, e.effects || {});
      assert.equal(typeof e.resultText, 'string', `${e.id} plain events need resultText`);
    }
  }
  assert.ok(choiceCards >= 20, `only ${choiceCards} choice cards, spec wants 20+`);
});

test('events: requires predicates are pure and survive a real game state', () => {
  const g = newGame({ seed: 4, occupation: OCCUPATIONS[0].id });
  for (const e of EVENTS) {
    if (typeof e.requires !== 'function') continue;
    const before = JSON.stringify(g.supplies);
    const v = e.requires(g);
    assert.equal(typeof v, 'boolean', `${e.id}.requires must return a boolean, got ${typeof v}`);
    assert.equal(JSON.stringify(g.supplies), before, `${e.id}.requires mutated the game state`);
  }
});

test('events: rollEvent honours biome and mile filters', () => {
  const rng = makeRng(1234);
  const g = newGame({ seed: 1234 });
  for (const mile of [50, 700, 1400, 2100, 2600]) {
    g.mile = mile;
    const biome = biomeAtMile(mile);
    for (let i = 0; i < 300; i++) {
      const e = rollEvent(g, rng);
      if (!e) continue;
      assert.ok(EVENTS.includes(e), 'rollEvent returned something not in EVENTS');
      if (Array.isArray(e.biomes)) assert.ok(e.biomes.includes(biome), `${e.id} fired in ${biome}`);
      assert.ok(mile >= e.minMile && mile <= e.maxMile, `${e.id} fired at mile ${mile}`);
      if (typeof e.requires === 'function') assert.ok(e.requires(g), `${e.id} fired with requires() false`);
    }
  }
});

test('events: rollEvent is deterministic for a seed', () => {
  const g = newGame({ seed: 55 });
  g.mile = 900;
  const a = makeRng(9);
  const b = makeRng(9);
  for (let i = 0; i < 100; i++) {
    assert.equal(rollEvent(g, a)?.id, rollEvent(g, b)?.id);
  }
});

// ---------------------------------------------------------------- party

test('party: five occupations with the money-vs-score tradeoff', () => {
  assert.equal(OCCUPATIONS.length, 5);
  const ids = OCCUPATIONS.map((o) => o.id);
  for (const id of ['trail-angel', 'gear-rep', 'ranger', 'cook', 'dirtbag']) {
    assert.ok(ids.includes(id), `missing occupation ${id}`);
  }
  for (const o of OCCUPATIONS) {
    assert.ok(Number.isFinite(o.money) && o.money > 0, `${o.id} money`);
    assert.ok([1, 2, 3].includes(o.scoreMult), `${o.id} scoreMult ${o.scoreMult}`);
    assert.equal(typeof o.blurb, 'string');
    assert.equal(typeof o.perk, 'string');
    assert.equal(typeof o.effects, 'object');
    for (const k of Object.keys(o.effects)) {
      assert.ok(['fordBonus', 'weatherForecast', 'healRate', 'haggle', 'forageBonus'].includes(k),
        `${o.id} unknown perk effect ${k}`);
    }
  }
  const byMult = {};
  for (const o of OCCUPATIONS) byMult[o.scoreMult] = Math.max(byMult[o.scoreMult] || 0, o.money);
  assert.ok(byMult[1] > byMult[3], 'the ×3 occupation must be the poorest');
});

test('party: name pools, trail names and epitaphs are deep enough', () => {
  assert.ok(NAME_POOL.first.length >= 40, `first names: ${NAME_POOL.first.length}`);
  assert.ok(NAME_POOL.last.length >= 40, `last names: ${NAME_POOL.last.length}`);
  assert.ok(TRAIL_NAMES.length >= 60, `trail names: ${TRAIL_NAMES.length}`);
  assert.ok(EPITAPHS.length >= 25, `epitaphs: ${EPITAPHS.length}`);
  assert.equal(new Set(TRAIL_NAMES).size, TRAIL_NAMES.length, 'duplicate trail names');
  for (const list of [NAME_POOL.first, NAME_POOL.last, TRAIL_NAMES, EPITAPHS]) {
    for (const s of list) assert.ok(typeof s === 'string' && s.length > 0);
  }
});

test('party: generateTrailName is deterministic and always returns a string', () => {
  const a = makeRng(7);
  const b = makeRng(7);
  for (let i = 0; i < 50; i++) {
    const n = generateTrailName(a);
    assert.equal(typeof n, 'string');
    assert.ok(n.length > 0);
    assert.equal(n, generateTrailName(b));
  }
});

test('party: portrait parts are hex colours', () => {
  for (const key of ['hair', 'skin', 'shirt']) {
    assert.ok(Array.isArray(PORTRAIT_PARTS[key]) && PORTRAIT_PARTS[key].length > 0, `${key} empty`);
    for (const hex of PORTRAIT_PARTS[key]) assert.match(hex, /^#[0-9a-fA-F]{6}$/, `${key}: ${hex}`);
  }
});

// ---------------------------------------------------------------- dialogue & store

test('dialogue: 70+ lines, valid filters, no emoji', () => {
  assert.ok(TALK.length >= 70, `only ${TALK.length} talk lines`);
  for (const t of TALK) {
    assert.ok(t.biome === null || BIOMES.includes(t.biome), `bad talk biome ${t.biome}`);
    // Talk lines may be scoped to any landmark kind, not just towns.
    assert.ok(t.kind === null || LANDMARK_KINDS.includes(t.kind), `bad talk kind ${t.kind}`);
    assert.equal(typeof t.speaker, 'string');
    assert.equal(typeof t.line, 'string');
    assert.ok(t.line.length > 5);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.line + t.speaker), `emoji in: ${t.line}`);
  }
});

test('dialogue: talkLine returns a fitting line for every landmark', () => {
  const rng = makeRng(3);
  for (const l of LANDMARKS) {
    for (let i = 0; i < 20; i++) {
      const line = talkLine(l, rng);
      assert.ok(line, `no talk line for ${l.id}`);
      const obj = typeof line === 'string' ? { line } : line;
      assert.equal(typeof obj.line, 'string');
      assert.ok(obj.line.length > 0);
    }
  }
});

test('store: stock ids are real items and stockFor is a subset in display order', () => {
  assert.ok(STORE_STOCK.length > 5);
  for (const id of STORE_STOCK) assert.ok(ITEMS_BY_ID[id], `store stocks unknown item ${id}`);
  assert.ok(STORE_STOCK.includes('food'), 'every store must sell food');

  for (const l of LANDMARKS.filter((x) => x.store)) {
    const s = stockFor(l);
    assert.ok(Array.isArray(s) && s.length > 0, `${l.id} stocks nothing`);
    for (const id of s) assert.ok(STORE_STOCK.includes(id), `${l.id} stocks off-catalog ${id}`);
    const order = s.map((id) => STORE_STOCK.indexOf(id));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${l.id} stock is out of display order`);
    assert.equal(new Set(s).size, s.length, `${l.id} has duplicate stock`);
    assert.ok(s.includes('food'), `${l.id} must sell food`);
  }
  // The outfitter at mile 0 should be the fullest shop on the trail.
  const outfitter = stockFor(LANDMARKS.find((l) => l.store));
  assert.ok(outfitter.length >= Math.floor(STORE_STOCK.length * 0.8),
    `the outfitting store only carries ${outfitter.length}/${STORE_STOCK.length}`);
});
