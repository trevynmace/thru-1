// Thru — UI controller. Wires the engine + procedural renderer to the DOM screens.
import * as E from './engine.js';
import { makeScene } from './art.js';
import { LOCATIONS, lastPassed, nextLocation, biomeAt, TERMINUS_NORTH_MILE } from '../../data/locations.js';
import { GEAR, GEAR_BY_ID } from '../../data/gear.js';
import { rollEncounter } from '../../data/encounters.js';
import { generateTrailName, randomName } from '../../data/names.js';

const SKIN = ['#f2c89a', '#e8b98c', '#c98e62', '#a06a44', '#7a4d30', '#5a3a24'];
const SHIRT = ['#8fd9a8', '#e0b878', '#7aa9e0', '#d98a7a', '#b59ad9', '#e3d27a'];
const PACK = ['#5a4a6e', '#3a7163', '#7a4a63', '#3a4a70', '#9a5560', '#2c5750'];

let game = null;             // current engine game
let scene = null;            // renderer
let creating = {             // character creation working state
  direction: 'NOBO', difficulty: 'normal', skin: 1, shirt: 0, pack: 0, stats: null,
};
let anim = { scroll: 0, walking: false, t: 0, targetScroll: 0 };

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

export function init() {
  const canvas = $('#scene');
  scene = makeScene(canvas);
  buildSwatches();
  creating.stats = E.rollStats();
  renderStatRoll();
  updateDiffDesc();
  wireEvents();
  loop();
  // Idle menu scene
  setMenuScene();
}

// ---------------------------------------------------------------- render loop
function loop() {
  requestAnimationFrame(loop);
  anim.t += 0.016;
  // ease scroll toward target (set when we hike)
  anim.scroll += (anim.targetScroll - anim.scroll) * 0.08;
  const moving = Math.abs(anim.targetScroll - anim.scroll) > 0.5;
  anim.walking = moving;

  let biome = 'desert', dayPhase = 0.5, tramilyCount = 0, hiker = null;
  if (game) {
    biome = biomeAt(game.mile);
    dayPhase = 0.5 + 0.42 * Math.sin(anim.t * 0.25); // gentle day/night drift while idle
    tramilyCount = game.tramily.length;
    hiker = { skin: SKIN[creating.skin], shirt: SHIRT[creating.shirt], pack: PACK[creating.pack] };
  } else {
    dayPhase = 0.5 + 0.42 * Math.sin(anim.t * 0.18);
  }
  scene.render({ biome, scroll: anim.scroll, walking: anim.walking || !game, time: anim.t, dayPhase, hiker, tramilyCount });
}

function setMenuScene() { anim.targetScroll = anim.scroll + 6000; } // gently auto-scroll behind the menu

// ---------------------------------------------------------------- screens
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}
function openModal(id) { $('#' + id).classList.add('open'); }
function closeModal(id) { $('#' + id).classList.remove('open'); }
function closeAllModals() { $$('.modal').forEach(m => m.classList.remove('open')); }

// ---------------------------------------------------------------- events
function wireEvents() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) handleAction(btn.dataset.action, btn, e);
  });

  // direction / difficulty segmented controls
  $('#seg-direction').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]'); if (!b) return;
    creating.direction = b.dataset.dir;
    $$('#seg-direction .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  });
  $('#seg-difficulty').addEventListener('click', (e) => {
    const b = e.target.closest('[data-diff]'); if (!b) return;
    creating.difficulty = b.dataset.diff;
    $$('#seg-difficulty .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    updateDiffDesc();
  });
}

function handleAction(action, btn, e) {
  switch (action) {
    case 'new-game': show('screen-create'); break;
    case 'how-to': openModal('modal-howto'); break;
    case 'close-howto': closeModal('modal-howto'); break;
    case 'continue': loadGame(); break;
    case 'back-menu': show('screen-menu'); break;
    case 'roll-name': $('#inp-name').value = randomName(Math.random() < 0.5 ? 'female' : 'male'); break;
    case 'reroll-stats': creating.stats = E.rollStats(); renderStatRoll(); break;
    case 'start-hike': startHike(); break;
    case 'hike': onHike(); break;
    case 'open-map': renderMap(); openModal('modal-map'); break;
    case 'close-map': closeModal('modal-map'); break;
    case 'open-pack': renderPack(); openModal('modal-pack'); break;
    case 'close-pack': closeModal('modal-pack'); break;
    case 'open-town': renderTown(); openModal('modal-town'); break;
    case 'leave-town': closeModal('modal-town'); break;
    case 'enc-continue': closeEncounter(); break;
    case 'save-quit': saveGame(true); break;
    case 'end-menu': closeAllModals(); game = null; show('screen-menu'); setMenuScene(); break;
  }
}

// ---------------------------------------------------------------- creation UI
function buildSwatches() {
  const mk = (kind, arr, sel) => {
    const row = $(`.swatches-row[data-kind="${kind}"]`);
    row.innerHTML = '';
    arr.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'sw' + (i === sel ? ' active' : '');
      d.style.background = c;
      d.onclick = () => { creating[kind] = i; $$(`.swatches-row[data-kind="${kind}"] .sw`).forEach((s, j) => s.classList.toggle('active', j === i)); };
      row.appendChild(d);
    });
  };
  mk('skin', SKIN, creating.skin);
  mk('shirt', SHIRT, creating.shirt);
  mk('pack', PACK, creating.pack);
}
function renderStatRoll() {
  const el = $('#stat-roll'); el.innerHTML = '';
  for (const k of E.STAT_KEYS) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<span>${k}</span><b>${creating.stats[k]}</b>`;
    el.appendChild(d);
  }
}
function updateDiffDesc() {
  const d = E.DIFFICULTY[creating.difficulty];
  $('#diff-desc').textContent = `Start $${d.money} · Morale ${d.moraleStart} · winter advances ${d.winterPerDay} mi/day · sets out ${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.startMonth]} ${d.startDay}.`;
}

function startHike() {
  const name = $('#inp-name').value.trim() || randomName('female');
  const trailName = $('#inp-trailname').value.trim();
  game = E.newGame({
    name, trailName, gender: 'female',
    difficulty: creating.difficulty, direction: creating.direction, stats: creating.stats,
  });
  // SOBO starts at the north end; nudge scene to that biome.
  anim.scroll = 0; anim.targetScroll = 0;
  show('screen-hike');
  closeAllModals();
  refreshHUD();
  toast(`${trailName || name} sets out from ${lastPassed(game.mile).name}.`);
  // entering at a terminus counts as visiting it
  game.visited.add(lastPassed(game.mile).id);
}

// ---------------------------------------------------------------- hiking
function onHike() {
  if (!game || game.status !== 'playing') return;
  const before = game.mile;
  const result = E.advanceDay(game);
  anim.targetScroll = anim.scroll + Math.max(40, result.miles * 6);
  refreshHUD();

  // Process events from the day.
  let arrivedTown = null;
  for (const ev of result.events) {
    if (ev.type === 'arrive') {
      if (ev.location.kind === 'town') arrivedTown = ev.location;
      else if (ev.location.kind === 'terminus' && game.status === 'won') { /* handled below */ }
      else toast(`📍 ${ev.location.name}${ev.location.kind === 'landmark' ? ' — ' + scenicBoost(ev.location) : ''}`);
    } else if (ev.type === 'gear-break') toast('🎒 ' + ev.text);
    else if (ev.type === 'starving') toast('🍫 ' + ev.text);
  }

  if (game.status !== 'playing') { setTimeout(() => endGame(), 700); return; }

  // Reaching a town opens the town panel and reveals the Town button.
  if (arrivedTown) {
    game._town = arrivedTown;
    $('#btn-town').hidden = false;
    setTimeout(() => { renderTown(); openModal('modal-town'); }, 650);
    return;
  } else {
    // leaving a town hides the button until the next one
    const here = lastPassed(game.mile);
    if (here.kind !== 'town') $('#btn-town').hidden = true;
  }

  // Random encounter chance (higher when not in/near a town).
  const chance = 0.5;
  if (game.rng() < chance) {
    const enc = rollEncounter(result.biome, game.rng);
    if (enc) setTimeout(() => openEncounter(enc), 500);
  }
}

function scenicBoost(loc) {
  E.applyStat(game, 'Morale', 8);
  refreshHUD();
  return 'a view that resets your soul (+Morale)';
}

// ---------------------------------------------------------------- encounters
let activeEnc = null;
function openEncounter(enc) {
  activeEnc = enc;
  $('#enc-title').textContent = enc.title;
  $('#enc-text').textContent = enc.text;
  $('#enc-result').hidden = true;
  $('#enc-continue').hidden = true;
  const wrap = $('#enc-options'); wrap.innerHTML = ''; wrap.hidden = false;
  enc.options.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'btn enc-option';
    const dc = opt.diceCheck === 0 ? 'automatic' : `${opt.checkStat} check (DC ${opt.diceCheck})`;
    b.innerHTML = `${opt.text}<span class="check">${dc}</span>`;
    b.onclick = () => chooseOption(opt);
    wrap.appendChild(b);
  });
  openModal('modal-encounter');
}
function chooseOption(opt) {
  const r = E.resolveOption(game, activeEnc, opt);
  $('#enc-options').hidden = true;
  const box = $('#enc-result');
  box.hidden = false;
  box.className = 'enc-result ' + (r.success ? 'success' : 'failure');
  let extra = '';
  if (r.extra.recruit) extra += `<br><b>${r.extra.recruit.trailName}</b> (${r.extra.recruit.perk.name}) joins your tramily! <span class="muted">${r.extra.recruit.perk.blurb}</span>`;
  if (r.extra.trailName) extra += `<br>From now on, they call you <b>${r.extra.trailName}</b>.`;
  if (r.extra.gear) extra += `<br>You scored a <b>${r.extra.gear.name}</b>!`;
  if (r.extra.zeroDay) extra += `<br><span class="muted">You took a zero. The season ticks on.</span>`;
  const sign = r.effect >= 0 ? '+' : '';
  const dpart = r.effectedStat ? `<span class="delta">${sign}${r.effect} ${r.effectedStat}</span>` : '';
  box.innerHTML = `<p>${r.text}</p><p>${dpart}${extra}</p>` +
    (opt.diceCheck > 0 ? `<div class="roll">Rolled ${r.roll} + ${r.statVal} ${opt.checkStat} = ${r.roll + r.statVal} vs DC ${r.dc} → ${r.success ? 'success' : 'failure'}</div>` : '');
  $('#enc-continue').hidden = false;
  refreshHUD();
}
function closeEncounter() {
  closeModal('modal-encounter');
  activeEnc = null;
  if (game.status !== 'playing') setTimeout(() => endGame(), 300);
}

// ---------------------------------------------------------------- town
function renderTown() {
  const loc = game._town || lastPassed(game.mile);
  $('#town-name').textContent = loc.name;
  $('#town-blurb').textContent = loc.blurb;
  const acts = $('#town-actions'); acts.innerHTML = '';
  for (const [key, a] of Object.entries(E.TOWN_ACTIONS)) {
    const cost = Math.round(a.cost * E.townDiscount(game));
    const b = document.createElement('button');
    b.className = 'btn town-act';
    b.innerHTML = `${a.label}<span class="price">$${cost}</span>`;
    b.disabled = game.stats.Money < cost;
    b.onclick = () => { const res = E.doTownAction(game, key); if (res.ok) { toast(`${a.label} ✓`); renderTown(); refreshHUD(); if (game.status !== 'playing') { closeModal('modal-town'); endGame(); } } };
    acts.appendChild(b);
  }
  const shop = $('#town-shop'); shop.innerHTML = '';
  for (const def of GEAR) {
    const owned = game.gear.find(i => i.id === def.id && i.wear > 0);
    const cost = Math.round(def.price * E.townDiscount(game));
    const b = document.createElement('button');
    b.className = 'btn shop-item';
    const bonus = Object.entries(def.bonus).map(([k, v]) => `+${v} ${k}`).join(', ');
    b.innerHTML = `${def.name} <span class="price">${owned ? 'owned' : '$' + cost}</span><span class="gbon">${bonus} · ${def.weightOz}oz</span>`;
    b.disabled = owned || game.stats.Money < cost;
    b.onclick = () => { const res = E.buyGear(game, def.id); if (res.ok) { toast(`Bought ${def.name}`); renderTown(); refreshHUD(); } };
    shop.appendChild(b);
  }
}

// ---------------------------------------------------------------- map
function renderMap() {
  const list = $('#map-list'); list.innerHTML = '';
  const here = lastPassed(game.mile);
  for (const loc of LOCATIONS) {
    const passed = game.direction === 'NOBO' ? loc.mile < game.mile - 1 : loc.mile > game.mile + 1;
    const isHere = loc.id === here.id;
    const row = document.createElement('div');
    row.className = 'map-row' + (passed ? ' passed' : '') + (isHere ? ' here' : '');
    const color = { desert: '#caa06a', forest: '#3a7163', mountain: '#6b7aa3', alpine: '#cdd9ec' }[loc.biome];
    const icon = loc.kind === 'town' ? '🏠' : loc.kind === 'terminus' ? '🏁' : loc.kind === 'hazard' ? '⚠️' : '⛰️';
    row.innerHTML = `<span class="dot" style="background:${color}"></span>${icon} ${loc.name}${isHere ? ' — you are here' : ''}<span class="mi">mi ${loc.mile}</span>`;
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------- pack
function renderPack() {
  $('#pack-weight').textContent = E.packWeightOz(game);
  const list = $('#pack-list'); list.innerHTML = '';
  for (const item of game.gear) {
    const def = GEAR_BY_ID[item.id];
    const pct = Math.round((item.wear / def.durability) * 100);
    const broken = item.wear <= 0;
    const row = document.createElement('div');
    row.className = 'pack-item' + (broken ? ' broken' : '');
    const bonus = Object.entries(def.bonus).map(([k, v]) => `+${v} ${k}`).join(', ');
    row.innerHTML = `<span>${def.name}</span><span class="muted small">${broken ? 'BROKEN' : bonus}</span>
      <span class="dur"><div class="dur-track"><div class="dur-meter" style="width:${broken ? 100 : pct}%"></div></div></span>`;
    list.appendChild(row);
  }
  const tl = $('#tramily-list'); tl.innerHTML = '';
  if (!game.tramily.length) tl.innerHTML = '<p class="muted small">No tramily yet. Help a hiker on trail and they may join you.</p>';
  for (const m of game.tramily) {
    const c = document.createElement('div'); c.className = 'tramily-card';
    c.innerHTML = `<b>${m.trailName}</b> <span class="muted">(${m.name})</span> — ${m.perk.name}<br><span class="muted small">${m.perk.blurb}</span>`;
    tl.appendChild(c);
  }
}

// ---------------------------------------------------------------- HUD refresh
const STAT_DISPLAY = [
  { key: 'Morale', color: '#8fd9a8', max: 100 },
  { key: 'Energy', color: '#7aa9e0', max: 100 },
  { key: 'Snacks', color: '#e0b878', max: 100 },
  { key: 'Money', color: '#f0c987', max: null },
];
function refreshHUD() {
  $('#hud-trailname').textContent = game.trailName || game.name;
  $('#hud-name').textContent = game.trailName ? game.name : '(unnamed — earn a trail name out there)';
  $('#hud-date').textContent = E.dateLabel(game.date);
  $('#hud-day').textContent = game.day;
  $('#hud-mile').textContent = `Mile ${Math.round(game.mile)}`;

  const pct = E.progressPct(game) * 100;
  $('#progress-fill').style.width = pct + '%';
  $('#progress-hiker').style.left = (game.mile / TERMINUS_NORTH_MILE * 100) + '%';
  const wpct = Math.max(0, Math.min(100, game.winterMile / TERMINUS_NORTH_MILE * 100));
  $('#progress-winter').style.left = wpct + '%';

  const bars = $('#stat-bars'); bars.innerHTML = '';
  for (const s of STAT_DISPLAY) {
    const v = game.stats[s.key];
    const div = document.createElement('div'); div.className = 'sbar';
    const w = s.max ? Math.max(0, Math.min(100, (v / s.max) * 100)) : 100;
    const display = s.key === 'Money' ? '$' + Math.round(v) : Math.round(v);
    div.innerHTML = `<div class="sbar-top"><span>${s.key}</span><b>${display}</b></div>
      <div class="track"><div class="meter" style="width:${w}%;background:${v < 0 ? '#e08a7a' : s.color}"></div></div>`;
    bars.appendChild(div);
  }

  const gap = E.milesToWinter(game);
  const warn = $('#winter-warn');
  if (gap < 60) { warn.textContent = `❄ The winter line is only ${gap} miles behind you — MOVE!`; warn.className = 'winter-warn danger'; }
  else if (gap < 150) { warn.textContent = `❄ Winter is ${gap} miles back. Don't dawdle.`; warn.className = 'winter-warn'; }
  else { warn.textContent = `❄ Winter line: ${gap} mi behind · Morale is your lifeline.`; warn.className = 'winter-warn'; }
}

// ---------------------------------------------------------------- end
function endGame() {
  closeAllModals();
  const m = $('#modal-end'); const card = m.querySelector('.card');
  const won = game.status === 'won';
  card.className = 'card end-card ' + (won ? 'won' : 'lost');
  $('#end-title').textContent = won ? '🏁 You made it to Canada!' : 'Your hike ends here.';
  let text;
  if (won) text = `${game.trailName || game.name} touched the northern monument after ${game.day} days and ${Math.round(game.stats.Miles)} miles. The trail let you go.`;
  else if (game.cause === 'morale') text = `${game.trailName || game.name}'s morale gave out at mile ${Math.round(game.mile)}. Sometimes the trail asks more than we have that season. There's always next year.`;
  else text = `Winter caught ${game.trailName || game.name} at mile ${Math.round(game.mile)}. The snow came early and the high passes closed. You get off trail — but you'll be back.`;
  $('#end-text').textContent = text;
  const es = $('#end-stats'); es.innerHTML = '';
  const rows = [['Miles hiked', Math.round(game.stats.Miles)], ['Days on trail', game.day], ['Final morale', game.stats.Morale],
    ['Money left', '$' + game.stats.Money], ['Tramily', game.tramily.length], ['Furthest point', lastPassed(game.mile).name]];
  for (const [k, v] of rows) { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = `<span>${k}</span><b>${v}</b>`; es.appendChild(d); }
  clearSave();
  openModal('modal-end');
}

// ---------------------------------------------------------------- save / load
async function saveGame(thenQuit) {
  try {
    await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: E.serialize(game) });
    toast('Saved.');
  } catch { localStorage.setItem('thru-save', E.serialize(game)); toast('Saved locally.'); }
  if (thenQuit) { game = null; show('screen-menu'); setMenuScene(); }
}
async function loadGame() {
  let data = null;
  try { const r = await fetch('/api/load'); if (r.ok) data = await r.json(); } catch {}
  if (!data) { const ls = localStorage.getItem('thru-save'); if (ls) data = JSON.parse(ls); }
  if (!data || !data.name) { toast('No saved hike found.'); return; }
  game = E.deserialize(data);
  show('screen-hike');
  $('#btn-town').hidden = lastPassed(game.mile).kind !== 'town';
  refreshHUD();
  toast('Welcome back to the trail.');
}
async function clearSave() {
  try { await fetch('/api/save', { method: 'DELETE' }); } catch {}
  localStorage.removeItem('thru-save');
}

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
