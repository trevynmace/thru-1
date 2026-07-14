// Thru — UI controller. Wires the engine + procedural renderer to the DOM screens.
import * as E from './engine.js';
import { makeScene } from './art.js';
import { LOCATIONS, lastPassed, nextLocation, biomeAt, TERMINUS_NORTH_MILE } from '../../data/locations.js';
import { GEAR, GEAR_BY_ID } from '../../data/gear.js';
import { rollEncounter } from '../../data/encounters.js';
import { generateTrailName, randomName } from '../../data/names.js';
import { MODES, MODE_LIST, dailySeed, dailyLabel, raceStandings } from '../../data/modes.js';
import { CARDS, SHOP_CARDS, CULL_COST } from '../../data/deck.js';

const SKIN = ['#f2c89a', '#e8b98c', '#c98e62', '#a06a44', '#7a4d30', '#5a3a24'];
const SHIRT = ['#8fd9a8', '#e0b878', '#7aa9e0', '#d98a7a', '#b59ad9', '#e3d27a'];
const PACK = ['#5a4a6e', '#3a7163', '#7a4a63', '#3a4a70', '#9a5560', '#2c5750'];

let game = null;             // current engine game
let scene = null;            // renderer
let creating = {             // character creation working state
  direction: 'NOBO', difficulty: 'normal', skin: 1, shirt: 0, pack: 0, stats: null, mode: 'classic',
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
function anyModalOpen() { return $$('.modal.open').length > 0; }

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
    case 'choose-mode': renderModes(); show('screen-modes'); break;
    case 'pick-mode': pickMode(btn.dataset.mode); break;
    case 'begin-mode': beginMode(btn.dataset.mode); break;
    case 'how-to': openModal('modal-howto'); break;
    case 'close-howto': closeModal('modal-howto'); break;
    case 'continue': loadGame(); break;
    case 'back-menu': show('screen-menu'); break;
    case 'back-modes': renderModes(); show('screen-modes'); break;
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
    // --- Trailcraft (deck) ---
    case 'play-card': onPlayCard(+btn.dataset.i); break;
    case 'make-camp': onMakeCamp(); break;
    case 'open-deckview': renderDeckView(); openModal('modal-deckview'); break;
    case 'close-deckview': closeModal('modal-deckview'); break;
    case 'open-cardshop': renderCardShop(); openModal('modal-cardshop'); break;
    case 'leave-cardshop': closeModal('modal-cardshop'); refreshDeck(); break;
    // --- Zen journal / Race standings ---
    case 'open-journal': renderJournal(); openModal('modal-journal'); break;
    case 'close-journal': closeModal('modal-journal'); break;
    case 'open-standings': renderStandings(); openModal('modal-standings'); break;
    case 'close-standings': closeModal('modal-standings'); break;
    case 'copy-result': copyResult(btn); break;
  }
}

// ---------------------------------------------------------------- mode select
function renderModes() {
  const grid = $('#mode-grid'); grid.innerHTML = '';
  for (const m of MODE_LIST) {
    const card = document.createElement('div');
    card.className = 'mode-card' + (m.id === creating.mode ? ' selected' : '');
    card.dataset.action = 'pick-mode';
    card.dataset.mode = m.id;
    card.innerHTML =
      `<div class="mc-top"><span class="mc-icon">${m.icon}</span><span class="mc-name">${m.name}</span></div>
       <p class="mc-tag">${m.tagline}</p>
       <p class="mc-blurb">${m.blurb}</p>
       <div class="mc-go"><button class="btn primary" data-action="begin-mode" data-mode="${m.id}">${m.hideCreate ? "Today's Trail ▸" : 'Outfit a hiker ▸'}</button></div>`;
    grid.appendChild(card);
  }
}
function pickMode(id) {
  creating.mode = id;
  $$('#mode-grid .mode-card').forEach(c => c.classList.toggle('selected', c.dataset.mode === id));
}
function beginMode(id) {
  creating.mode = id;
  const m = MODES[id];
  if (m.hideCreate) { startHike(); }         // deterministic modes skip creation
  else { show('screen-create'); }
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
  const mode = creating.mode;
  const m = MODES[mode] || MODES.classic;
  let opts;
  if (m.hideCreate) {
    // Deterministic daily run: same seed, stats, and hiker for everyone, every day.
    const seed = dailySeed();
    creating.skin = seed % 6; creating.shirt = (seed >> 3) % 6; creating.pack = (seed >> 6) % 6;
    opts = { name: "Today's Hiker", trailName: '', gender: 'female', difficulty: 'normal', direction: 'NOBO', seed, mode };
  } else {
    const name = $('#inp-name').value.trim() || randomName('female');
    const trailName = $('#inp-trailname').value.trim();
    opts = { name, trailName, gender: 'female', difficulty: creating.difficulty, direction: creating.direction, stats: creating.stats, mode };
  }
  game = E.newGame(opts);
  advancing = false;
  anim.scroll = 0; anim.targetScroll = 0;
  closeAllModals();
  // entering at a terminus counts as visiting it
  game.visited.add(lastPassed(game.mile).id);
  logJournal(`Set out ${game.direction === 'NOBO' ? 'north from Campo' : 'south from Manning Park'}.`);

  if (m.deck) { enterDeckScreen(); toast('Draw a hand. Spend Stamina. Make miles.'); return; }
  show('screen-hike');
  configureHudForMode();
  refreshHUD();
  toast(startToast(m));
}

function startToast(m) {
  const who = game.trailName || game.name;
  if (m.id === 'endless') return `${who} sets out on the Forever Trail. Go as far as you can.`;
  if (m.id === 'daily') return `Trail of the Day — ${dailyLabel()}. Everyone hikes this exact run.`;
  if (m.id === 'zen') return `${who} begins a hike with nowhere to be. Breathe.`;
  if (m.id === 'race') return `The gun goes off. Four rivals bolt up the trail. Chase them down.`;
  return `${who} sets out from ${lastPassed(game.mile).name}.`;
}

// Show/hide the mode-specific HUD controls and labels.
function configureHudForMode() {
  const id = game.mode;
  $('#btn-standings').hidden = id !== 'race';
  $('#btn-journal').hidden = id !== 'zen';
  $('#btn-town').hidden = true;
  const warn = $('#winter-warn');
  warn.style.display = (game.modeDef && game.modeDef.winter === false) ? 'none' : '';
  updateModeExtra();
}

function updateModeExtra() {
  const el = $('#hud-mode-extra'); if (!el) return;
  const id = game.mode;
  if (id === 'endless') {
    const best = Number(localStorage.getItem('thru-endless-best') || 0);
    el.textContent = `Lap ${game.lap + 1} · Best ${best} mi`;
  } else if (id === 'daily') {
    el.textContent = `Season day ${game.day} / ${game.seasonDays}`;
  } else if (id === 'race') {
    const me = raceStandings(game).find(s => s.you);
    el.textContent = `Place ${me.place} of ${raceStandings(game).length}`;
  } else if (id === 'zen') {
    el.textContent = `Journal: ${(game.journal || []).length} entries`;
  } else {
    el.textContent = '';
  }
}

function logJournal(text) {
  if (!game || !game.journal) return;
  game.journal.push({ day: game.day, date: E.dateLabel(game.date), text });
}

// ---------------------------------------------------------------- hiking
let advancing = false; // debounce: a day's delayed modals (enc/town) open up to ~650ms later
function onHike() {
  if (!game || game.status !== 'playing') return;
  if (advancing || anyModalOpen()) return; // don't stack a new day on an in-flight one
  advancing = true; setTimeout(() => { advancing = false; }, 720);
  const before = game.mile;
  const result = E.advanceDay(game);
  anim.targetScroll = anim.scroll + Math.max(40, result.miles * 6);
  refreshHUD();

  // Process events from the day.
  let arrivedTown = null;
  for (const ev of result.events) {
    if (ev.type === 'arrive') {
      if (ev.location.kind === 'town') { arrivedTown = ev.location; logJournal(`Rolled into ${ev.location.name}.`); }
      else if (ev.location.kind === 'terminus' && game.status === 'won') { /* handled below */ }
      else { toast(`📍 ${ev.location.name}${ev.location.kind === 'landmark' ? ' — ' + scenicBoost(ev.location) : ''}`); logJournal(`Reached ${ev.location.name}.`); }
    } else if (ev.type === 'gear-break') { toast('🎒 ' + ev.text); logJournal(ev.text); }
    else if (ev.type === 'starving') toast('🍫 ' + ev.text);
    else if (ev.type === 'lap') { toast(`♾️ Lap ${ev.lap} complete! The trail resets — harder now. +Morale.`); logJournal(`Completed lap ${ev.lap} of the Forever Trail.`); }
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
  logJournal(`${loc.name} — a view that reset something in me. (+Morale)`);
  refreshHUD();
  return 'a view that resets your soul (+Morale)';
}

// Refresh whichever play screen is active (deck loop vs. day loop).
function syncUI() {
  if (!game) return;
  if (game.mode === 'deck') refreshDeck(); else refreshHUD();
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
  logJournal(`${activeEnc.title}: ${r.text}`);
  syncUI();
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

  const posPct = Math.max(0, Math.min(100, game.mile / TERMINUS_NORTH_MILE * 100));
  $('#progress-fill').style.width = posPct + '%';
  $('#progress-hiker').style.left = posPct + '%';
  const wpct = Math.max(0, Math.min(100, game.winterMile / TERMINUS_NORTH_MILE * 100));
  $('#progress-winter').style.left = wpct + '%';
  $('#progress-winter').style.display = (game.modeDef && game.modeDef.winter === false) ? 'none' : '';
  renderRivalMarkers();
  updateModeExtra();

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

// ---------------------------------------------------------------- Trailcraft (deck)
function enterDeckScreen() {
  show('screen-deck');
  $('#deck-trailname').textContent = game.trailName || game.name;
  $('#btn-deck-town').hidden = lastPassed(game.mile).kind !== 'town';
  refreshDeck();
}

function refreshDeck() {
  if (!game || !game.deck) return;
  $('#deck-date').textContent = E.dateLabel(game.date);
  $('#deck-day').textContent = game.day;
  $('#deck-mile').textContent = `Mile ${Math.round(game.mile)}`;
  const posPct = Math.max(0, Math.min(100, game.mile / TERMINUS_NORTH_MILE * 100));
  $('#deck-progress-fill').style.width = posPct + '%';
  $('#deck-progress-hiker').style.left = posPct + '%';
  $('#deck-progress-winter').style.left = Math.max(0, Math.min(100, game.winterMile / TERMINUS_NORTH_MILE * 100)) + '%';
  $('#deck-morale').textContent = `♥ ${Math.round(game.stats.Morale)}`;
  $('#deck-snacks').textContent = `🍫 ${Math.round(game.stats.Snacks)}`;
  $('#deck-money').textContent = `$${Math.round(game.stats.Money)}`;
  const d = game.deck;
  $('#deck-stamina').textContent = `⚡ ${d.stamina}/${d.staminaMax}`;

  const gap = E.milesToWinter(game);
  const warn = $('#deck-winter-warn');
  if (gap < 60) { warn.textContent = `❄ Winter is only ${gap} mi back — make miles!`; warn.className = 'winter-warn danger'; }
  else if (gap < 160) { warn.textContent = `❄ Winter ${gap} mi behind. Keep moving.`; warn.className = 'winter-warn'; }
  else { warn.textContent = `❄ Winter ${gap} mi back · ${d.draw.length} in draw, ${d.discard.length} in discard`; warn.className = 'winter-warn'; }
  renderHand();
}

function fxChips(fx) {
  const c = [];
  if (fx.miles)  c.push(`<span class="tc-chip mi">+${fx.miles} mi</span>`);
  if (fx.morale) c.push(`<span class="tc-chip mo">${fx.morale > 0 ? '+' : ''}${fx.morale} ♥</span>`);
  if (fx.energy) c.push(`<span class="tc-chip en">${fx.energy > 0 ? '+' : ''}${fx.energy} en</span>`);
  if (fx.snacks) c.push(`<span class="tc-chip sn">+${fx.snacks} 🍫</span>`);
  if (fx.stamina)c.push(`<span class="tc-chip st">+${fx.stamina} ⚡</span>`);
  if (fx.draw)   c.push(`<span class="tc-chip dr">draw ${fx.draw}</span>`);
  if (fx.camp)   c.push(`<span class="tc-chip">ends day</span>`);
  return c.join('');
}

function renderHand() {
  const wrap = $('#deck-hand'); wrap.innerHTML = '';
  const hand = E.deckHand(game);
  if (!hand.length) { wrap.innerHTML = '<p class="deck-empty-note">Hand empty — Make Camp to sleep and deal a fresh hand.</p>'; return; }
  for (const h of hand) {
    const c = document.createElement('div');
    c.className = 'trail-card' + (h.playable ? '' : ' unplayable');
    if (h.playable) { c.dataset.action = 'play-card'; c.dataset.i = h.index; }
    c.innerHTML = `<span class="tc-cost">${h.card.cost}</span>
      <div class="tc-name">${h.card.name}</div>
      <div class="tc-text">${h.card.text}</div>
      <div class="tc-tags">${fxChips(h.card.fx)}</div>`;
    wrap.appendChild(c);
  }
}

function onPlayCard(i) {
  if (!game || game.status !== 'playing') return;
  if (anyModalOpen()) return;
  const before = game.mile;
  const r = E.playCard(game, i);
  if (!r.ok) { toastDeck(r.reason); return; }
  if (game.mile > before) anim.targetScroll = anim.scroll + Math.max(24, (game.mile - before) * 6);
  refreshDeck();
  if (game.status !== 'playing') { setTimeout(() => endGame(), 450); }
}

function onMakeCamp() {
  if (!game || game.status !== 'playing') return;
  if (advancing || anyModalOpen()) return;
  advancing = true; setTimeout(() => { advancing = false; }, 520);
  const r = E.makeCamp(game);
  refreshDeck();
  afterCamp(r);
}

function afterCamp(result) {
  let arrivedTown = null;
  for (const ev of (result?.events || [])) {
    if (ev.type === 'arrive') {
      if (ev.location.kind === 'town') arrivedTown = ev.location;
      else if (ev.location.kind !== 'terminus') toastDeck(`📍 ${ev.location.name}`);
    }
  }
  if (game.status !== 'playing') { setTimeout(() => endGame(), 500); return; }
  if (arrivedTown) {
    game._town = arrivedTown; $('#btn-deck-town').hidden = false;
    setTimeout(() => { renderCardShop(); openModal('modal-cardshop'); }, 400);
    return;
  } else {
    const here = lastPassed(game.mile);
    if (here.kind !== 'town') $('#btn-deck-town').hidden = true;
  }
  if (game.rng() < 0.42) {
    const enc = rollEncounter(biomeAt(game.mile), game.rng);
    if (enc) setTimeout(() => openEncounter(enc), 400);
  }
}

function renderDeckView() {
  const list = $('#deckview-list'); list.innerHTML = '';
  const counts = E.deckCounts(game);
  const ids = Object.keys(counts).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name));
  for (const id of ids) {
    const def = CARDS[id];
    const row = document.createElement('div'); row.className = 'deckview-row';
    row.innerHTML = `<span class="dv-cost">${def.cost}</span><span class="dv-name">${def.name}</span>
      <span class="muted small">${def.text}</span><span class="dv-count">×${counts[id]}</span>`;
    list.appendChild(row);
  }
  const d = game.deck;
  $('#deckview-piles').textContent = `${d.cards.length} cards · ${d.draw.length} in draw · ${d.hand.length} in hand · ${d.discard.length} in discard`;
}

function renderCardShop() {
  const loc = game._town || lastPassed(game.mile);
  $('#cardshop-name').textContent = loc.name;
  $('#cardshop-blurb').textContent = loc.blurb;
  $('#cardshop-money').textContent = `You have $${Math.round(game.stats.Money)}`;

  const basics = $('#cardshop-basics'); basics.innerHTML = '';
  for (const [key, a] of Object.entries(E.TOWN_ACTIONS)) {
    const cost = Math.round(a.cost * E.townDiscount(game));
    const b = document.createElement('button'); b.className = 'btn town-act';
    b.innerHTML = `${a.label}<span class="price">$${cost}</span>`;
    b.disabled = game.stats.Money < cost;
    b.onclick = () => { const res = E.doTownAction(game, key); if (res.ok) { toastDeck(`${a.label} ✓`); renderCardShop(); refreshDeck(); if (game.status !== 'playing') { closeModal('modal-cardshop'); endGame(); } } };
    basics.appendChild(b);
  }

  const buy = $('#cardshop-buy'); buy.innerHTML = '';
  for (const def of SHOP_CARDS) {
    const cost = Math.round(def.price * E.townDiscount(game));
    const b = document.createElement('button'); b.className = 'btn shop-card';
    b.innerHTML = `${def.name} <span class="price">$${cost}</span><span class="sc-text">⚡${def.cost} · ${def.text}</span>`;
    b.disabled = game.stats.Money < cost;
    b.onclick = () => { const res = E.buyCard(game, def.id); if (res.ok) { toastDeck(`Added ${def.name} to your deck`); renderCardShop(); refreshDeck(); } };
    buy.appendChild(b);
  }

  const cull = $('#cardshop-cull'); cull.innerHTML = '';
  const counts = E.deckCounts(game);
  const ids = Object.keys(counts).sort((a, b) => CARDS[a].cost - CARDS[b].cost);
  for (const id of ids) {
    const def = CARDS[id];
    const b = document.createElement('button'); b.className = 'btn shop-card';
    b.innerHTML = `Cull ${def.name} <span class="price">$${CULL_COST}</span><span class="sc-text">you hold ${counts[id]} · ⚡${def.cost}</span>`;
    b.disabled = game.stats.Money < CULL_COST || game.deck.cards.length <= 5;
    b.onclick = () => { const res = E.cullCard(game, id); if (res.ok) { toastDeck(`Culled a ${def.name}`); renderCardShop(); refreshDeck(); } };
    cull.appendChild(b);
  }
}

// ---------------------------------------------------------------- journal / standings / rivals
function renderJournal() {
  const list = $('#journal-list'); list.innerHTML = '';
  const j = game.journal || [];
  if (!j.length) { list.innerHTML = '<p class="journal-empty">Nothing written yet. Take a few steps and come back.</p>'; return; }
  for (const e of [...j].reverse()) {
    const d = document.createElement('div'); d.className = 'journal-entry';
    d.innerHTML = `<div class="je-day">Day ${e.day} · ${e.date}</div>${e.text}`;
    list.appendChild(d);
  }
}

function renderStandings() {
  const list = $('#standings-list'); list.innerHTML = '';
  for (const s of raceStandings(game)) {
    const row = document.createElement('div');
    row.className = 'standings-row' + (s.you ? ' you' : '') + (s.finished ? ' done' : '');
    const status = s.finished ? `🏁 finished day ${s.finishDay}` : `mile ${Math.round(s.mile)}`;
    row.innerHTML = `<span class="st-place">${s.place}</span><span class="st-dot" style="background:${s.color}"></span>
      <span class="st-name">${s.trailName}${s.you ? ' (you)' : ''}</span><span class="st-mile">${status}</span>`;
    list.appendChild(row);
  }
}

function renderRivalMarkers() {
  const wrap = $('#progress-rivals'); if (!wrap) return;
  if (!game || game.mode !== 'race' || !game.rivals) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '';
  for (const r of game.rivals) {
    const d = document.createElement('div'); d.className = 'rival-marker';
    d.style.left = Math.max(0, Math.min(100, r.mile / TERMINUS_NORTH_MILE * 100)) + '%';
    d.style.background = r.color;
    d.title = `${r.trailName} — mile ${Math.round(r.mile)}`;
    wrap.appendChild(d);
  }
}

function toastDeck(msg) {
  const t = $('#toast-deck'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function copyResult(btn) {
  const text = game && game._shareText ? game._shareText : '';
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => { btn.textContent = 'Copied ✓'; setTimeout(() => btn.textContent = 'Copy result', 1600); }).catch(() => {});
}

// ---------------------------------------------------------------- end
function endGame() {
  closeAllModals();
  const m = $('#modal-end'); const card = m.querySelector('.card');
  const won = game.status === 'won';
  const id = game.mode;
  const who = game.trailName || game.name;
  const extra = $('#end-extra'); extra.hidden = true; extra.innerHTML = '';
  let title, text, rows;

  if (id === 'endless') {
    const best = Number(localStorage.getItem('thru-endless-best') || 0);
    const score = Math.round(game.stats.Miles);
    const isBest = score > best;
    if (isBest) localStorage.setItem('thru-endless-best', String(score));
    card.className = 'card end-card lost';
    title = '♾️ The Forever Trail goes on';
    text = game.cause === 'winter'
      ? `Winter finally ran ${who} down at mile ${Math.round(game.mile)} on lap ${game.lap + 1}. The trail is undefeated — but you went far.`
      : `${who}'s heart gave out at mile ${Math.round(game.mile)} on lap ${game.lap + 1}. The Forever Trail always wins eventually. How far next time?`;
    rows = [['Total miles', score], ['Laps completed', game.lap], ['Days on trail', game.day], ['Furthest point', lastPassed(game.mile).name]];
    extra.hidden = false;
    extra.innerHTML = `<div class="end-best">${isBest ? '🏆 NEW PERSONAL BEST — ' : 'Personal best: '}${Math.max(best, score)} mi</div>`;
  } else if (id === 'daily') {
    const finished = won;
    card.className = 'card end-card ' + (finished ? 'won' : 'lost');
    title = finished ? '🏁 You finished the daily!' : "📅 The season closes";
    text = finished
      ? `${who} walked the whole trail in ${game.day} days on today's seed. A rare, clean run.`
      : `The 45-day window shut with ${who} at mile ${Math.round(game.mile)}. Same trail for everyone today — how did you do?`;
    rows = [['Furthest mile', Math.round(game.mile)], ['Season day', `${Math.min(game.day, game.seasonDays)} / ${game.seasonDays}`],
      ['Final morale', game.stats.Morale], ['Furthest point', lastPassed(game.mile).name]];
    game._shareText = buildDailyShare(finished);
    extra.hidden = false;
    extra.innerHTML = `<div class="end-share">${game._shareText.replace(/\n/g, '<br>')}</div><button class="btn" data-action="copy-result">Copy result</button>`;
  } else if (id === 'race') {
    const board = raceStandings(game);
    const me = board.find(s => s.you);
    const place = me.place, n = board.length;
    const first = place === 1 && me.finished;
    card.className = 'card end-card ' + (first ? 'won' : 'lost');
    const ord = ['', '1st', '2nd', '3rd', '4th', '5th'][place] || `${place}th`;
    title = first ? '🏁 You won the year!' : `🏁 You placed ${ord}`;
    text = won
      ? `${who} touched Monument 78 in ${ord} place out of ${n}. ${first ? 'First to Canada. The bubble tells stories about you now.' : 'You made it — just not first. Next year.'}`
      : `${who} came off trail at mile ${Math.round(game.mile)} (${game.cause === 'winter' ? 'winter' : 'morale'}), ${ord} in the bubble. The others hike on without you.`;
    rows = [['Your place', `${ord} of ${n}`], ['Your mile', Math.round(game.mile)], ['Days on trail', game.day], ['Winner', board[0].trailName + (board[0].you ? ' (you)' : '')]];
    extra.hidden = false;
    extra.innerHTML = '<div class="end-place">' + board.map(s => `${s.place}. ${s.trailName}${s.you ? ' (you)' : ''}`).join('  ·  ') + '</div>';
  } else if (id === 'zen') {
    card.className = 'card end-card won';
    title = won ? '🌿 You walked the whole trail' : '🌿 A good walk';
    text = `${who} reached ${won ? 'Canada' : 'the end of this session'} after ${game.day} unhurried days and ${Math.round(game.stats.Miles)} miles, with ${(game.journal || []).length} pages of journal. No winter, no clock — just the walk.`;
    rows = [['Miles walked', Math.round(game.stats.Miles)], ['Days out', game.day], ['Journal entries', (game.journal || []).length], ['Tramily', game.tramily.length]];
    extra.hidden = false;
    extra.innerHTML = `<button class="btn" data-action="open-journal">Read your journal</button>`;
  } else if (id === 'deck') {
    card.className = 'card end-card ' + (won ? 'won' : 'lost');
    title = won ? '🃏 Deck complete — Canada!' : '🃏 The run ends here';
    text = won
      ? `${who} built a deck all the way to Monument 78 in ${game.day} days. A perfectly tuned kit.`
      : game.cause === 'winter'
        ? `Winter caught ${who} at mile ${Math.round(game.mile)}. The deck couldn't out-draw the snow.`
        : `${who}'s morale ran out at mile ${Math.round(game.mile)}. Too many hard miles, not enough rest cards.`;
    rows = [['Miles hiked', Math.round(game.stats.Miles)], ['Days on trail', game.day], ['Deck size', game.deck.cards.length], ['Camps made', game.deck.campsMade]];
  } else {
    card.className = 'card end-card ' + (won ? 'won' : 'lost');
    title = won ? '🏁 You made it to Canada!' : 'Your hike ends here.';
    if (won) text = `${who} touched the northern monument after ${game.day} days and ${Math.round(game.stats.Miles)} miles. The trail let you go.`;
    else if (game.cause === 'morale') text = `${who}'s morale gave out at mile ${Math.round(game.mile)}. Sometimes the trail asks more than we have that season. There's always next year.`;
    else text = `Winter caught ${who} at mile ${Math.round(game.mile)}. The snow came early and the high passes closed. You get off trail — but you'll be back.`;
    rows = [['Miles hiked', Math.round(game.stats.Miles)], ['Days on trail', game.day], ['Final morale', game.stats.Morale],
      ['Money left', '$' + game.stats.Money], ['Tramily', game.tramily.length], ['Furthest point', lastPassed(game.mile).name]];
  }

  $('#end-title').textContent = title;
  $('#end-text').textContent = text;
  const es = $('#end-stats'); es.innerHTML = '';
  for (const [k, v] of rows) { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = `<span>${k}</span><b>${v}</b>`; es.appendChild(d); }
  clearSave();
  openModal('modal-end');
}

function buildDailyShare(finished) {
  const pct = Math.max(0, Math.min(1, game.mile / TERMINUS_NORTH_MILE));
  const filled = Math.round(pct * 12);
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(12 - filled);
  const cap = finished ? '🏁 finished!' : (game.cause === 'winter' ? '❄️ winter' : game.cause === 'season' ? '📅 season' : '💔 morale');
  return `Thru — Trail of the Day 🥾\n${dailyLabel()}\n${bar}\nMile ${Math.round(game.mile)} · Day ${Math.min(game.day, game.seasonDays)}/${game.seasonDays} · ${cap}`;
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
  advancing = false;
  anim.scroll = 0; anim.targetScroll = 0;
  if (game.modeDef && game.modeDef.deck) { enterDeckScreen(); toast('Welcome back to the trail.'); return; }
  show('screen-hike');
  configureHudForMode();
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
