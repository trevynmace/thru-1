// NORTHBOUND — UI controller.
//
// Owns the screen router, the persistent trail HUD, the journal, the travel loop,
// and the render loop that drives the scene + fx canvases. Screen modules under
// ./screens/ are handed a `ctx` and build their own DOM; this file never reaches
// into their markup, and they never reach into each other's.

import { el, clear, mountTo, $ } from './dom.js';
import * as Sim from '../engine/sim.js';
import { scoreGame } from '../engine/score.js';
import { saveGame, loadGame, clearSave, saveScore, loadScores } from '../engine/save.js';
import { loadAtlas, BASE_W, BASE_H } from '../render/atlas.js';
import { createScene } from '../render/scene.js';
import { createFx } from '../render/fx.js';
import { Audio } from '../audio/audio.js';
import { TOTAL_MILES, LANDMARKS, nextLandmark, biomeAtMile, elevAtMile } from '../../../data/trail.js';
import { OCCUPATIONS } from '../../../data/party.js';

import * as ScreenMenu from './screens/menu.js';
import * as ScreenSetup from './screens/setup.js';
import * as ScreenStore from './screens/store.js';
import * as ScreenTravel from './screens/travel.js';
import * as ScreenInfo from './screens/info.js';
import * as ScreenFinale from './screens/finale.js';

const SCREENS = {
  title: ScreenMenu.title,
  settings: ScreenMenu.settings,
  help: ScreenMenu.help,
  scores: ScreenMenu.scores,
  setup: ScreenSetup.setup,
  store: ScreenStore.store,
  landmark: ScreenTravel.landmark,
  event: ScreenTravel.event,
  camp: ScreenTravel.camp,
  talk: ScreenTravel.talk,
  trade: ScreenTravel.trade,
  ford: ScreenTravel.ford,
  forage: ScreenTravel.forage,
  map: ScreenInfo.map,
  pack: ScreenInfo.pack,
  party: ScreenInfo.party,
  end: ScreenFinale.end,
};

// Screens that sit on top of the trail HUD rather than replacing it.
const OVERLAY_SCREENS = new Set([
  'map', 'pack', 'party', 'event', 'camp', 'talk', 'trade', 'landmark', 'store',
  'settings', 'help', 'scores',
  // The minigame screens are modal too: their intro/outcome panels sit over the HUD,
  // and Esc has to be able to back out of them like any other panel.
  'ford', 'forage',
]);

// Music selection per biome, for the travel screen.
const BIOME_TRACK = {
  desert: 'trail_desert', chaparral: 'trail_desert',
  sierra: 'trail_sierra', alpine: 'trail_sierra',
  forest: 'trail_forest', volcanic: 'trail_forest', rainforest: 'trail_rain',
};

const state = {
  game: null,
  screen: null,
  params: null,
  stack: [],          // screens layered over the trail HUD
  scene: null,
  fx: null,
  sceneState: null,
  scroll: 0,
  walking: false,
  travelling: false,  // multi-day auto travel is running
  travelTimer: 0,
  lastFrame: 0,
  raf: 0,
  camped: false,
  cleanup: null,      // active screen's unmount fn
  booted: false,
};

// ---------------------------------------------------------------- boot ----

export async function init() {
  const sceneCanvas = $('#scene');
  const overlayCanvas = $('#overlay');
  sceneCanvas.width = BASE_W; sceneCanvas.height = BASE_H;
  overlayCanvas.width = BASE_W; overlayCanvas.height = BASE_H;

  await loadAtlas();
  state.scene = createScene(sceneCanvas);
  state.fx = createFx();
  state.overlayCtx = overlayCanvas.getContext('2d');
  state.overlayCtx.imageSmoothingEnabled = false;
  state.overlayCanvas = overlayCanvas;

  state.sceneState = {
    biome: 'desert', mile: 0, scroll: 0, walking: false, dayPhase: 0.35,
    weather: { kind: 'clear', severity: 0 }, party: [], mules: 0,
    cartCondition: 100, landmark: null, elevation: 2915, night: false, camped: false,
  };

  wireGlobalKeys();
  wireSoundButton();
  window.addEventListener('resize', () => state.scene.resize());

  state.booted = true;
  state.lastFrame = performance.now();
  state.raf = requestAnimationFrame(frame);

  go('title');

  // Expose a tiny surface for the headless playtest harness. Not used by the game.
  window.NB = {
    go, get game() { return state.game; }, startGame, ctx: makeCtx(),
    isTravelling: () => state.travelling,
    // The router's own idea of the current screen. Modal screens layer *over* the trail
    // HUD, so reading `.screen.active` from the DOM can report the one underneath.
    get screen() { return state.screen; },
    version: 1,
  };
}

// ------------------------------------------------------------ rendering ----

function frame(now) {
  state.raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;

  const g = state.game;
  const s = state.sceneState;

  if (g) {
    s.mile = g.mile;
    s.biome = biomeAtMile(g.mile);
    s.weather = g.weather;
    s.mules = g.supplies.mules;
    s.cartCondition = g.cart.condition;
    s.elevation = elevAtMile(g.mile);
    s.party = g.party;
    s.dayPhase = dayPhaseFor(g, now);
    s.night = state.camped;
    s.camped = state.camped;
    s.landmark = g.atLandmark ? LANDMARKS.find((l) => l.id === g.atLandmark) : upcomingLandmark(g);
    s.landmarkDistance = s.landmark ? Math.max(0, s.landmark.mile - g.mile) : 999;
  }

  s.walking = state.walking;
  if (state.walking) state.scroll += dt * 34;
  s.scroll = state.scroll;

  // A render fault must never take the game down — the travel loop below is driven
  // from this same frame callback, so killing it would freeze the whole game. Drop the
  // scene, keep the loop, and say so exactly once.
  if (!state.renderBroken) {
    try {
      state.scene.render(s, dt);
      state.fx.update(dt);
      const octx = state.overlayCtx;
      octx.clearRect(0, 0, BASE_W, BASE_H);
      state.fx.draw(octx);
    } catch (err) {
      state.renderBroken = true;
      console.error('[northbound] scene rendering disabled after an error', err);
    }
  }

  if (state.travelling) {
    state.travelTimer -= dt;
    if (state.travelTimer <= 0) stepTravel();
  }
}

// Day phase 0..1 across the in-game day, nudged by real time so the sky always drifts.
function dayPhaseFor(g, now) {
  const base = state.travelling ? ((now / 26000) % 1) : 0.34 + 0.12 * Math.sin(now / 9000);
  return state.camped ? 0.94 : base;
}

function upcomingLandmark(g) {
  const nl = nextLandmark(g.mile);
  return nl && nl.mile - g.mile < 60 ? nl : null;
}

// -------------------------------------------------------------- routing ----

function makeCtx() {
  return {
    get game() { return state.game; },
    Sim, scoreGame, LANDMARKS, TOTAL_MILES,
    audio: Audio, fx: state.fx, scene: state.scene,
    overlayCanvas: () => state.overlayCanvas,
    go, back, close, toast, journal, refreshHud,
    startGame, saveNow, loadSaved, abandonRun, endRun,
    saveScore, loadScores, clearSave,
    setTravelling, setCamped, isTravelling: () => state.travelling,
    playMusicForContext,
  };
}

export function go(name, params = null) {
  const screen = SCREENS[name];
  if (!screen) { console.error('[northbound] no such screen', name); return; }

  // Leaving the trail HUD entirely? Stop auto-travel first.
  if (!OVERLAY_SCREENS.has(name)) { setTravelling(false); state.stack.length = 0; }

  if (state.cleanup) { try { state.cleanup(); } catch {} state.cleanup = null; }

  const node = document.getElementById('screen-' + name);
  if (!node) { console.error('[northbound] missing screen node', name); return; }

  for (const s of document.querySelectorAll('.screen.active')) {
    if (s !== node && !(OVERLAY_SCREENS.has(name) && s.id === 'screen-trail')) s.classList.remove('active');
  }

  clear(node);
  node.classList.toggle('dim', OVERLAY_SCREENS.has(name));
  state.screen = name;
  state.params = params;

  const ctx = makeCtx();
  const result = screen(ctx, params || {}) || {};
  if (result.node) node.appendChild(result.node);
  state.cleanup = result.unmount || null;
  node.classList.add('active');

  document.body.classList.toggle('on-trail', false);

  focusFirst(node);
  playMusicForContext();
}

/** Show the persistent trail HUD (the game's home base). */
export function showTrail() {
  if (state.cleanup) { try { state.cleanup(); } catch {} state.cleanup = null; }
  for (const s of document.querySelectorAll('.screen.active')) s.classList.remove('active');
  document.getElementById('screen-trail').classList.add('active');
  document.body.classList.add('on-trail');
  state.screen = 'trail';
  state.stack.length = 0;
  refreshHud();
  playMusicForContext();
}

export function close() { showTrail(); }
export function back() { state.game ? showTrail() : go('title'); }

function focusFirst(node) {
  const target = node.querySelector('[autofocus], input, .btn.primary, .btn, .card');
  if (target && typeof target.focus === 'function') {
    // Defer so the screen-in animation does not fight the scroll-into-view.
    requestAnimationFrame(() => { try { target.focus({ preventScroll: true }); } catch {} });
  }
}

// ------------------------------------------------------------ game flow ----

export function startGame(opts) {
  state.game = Sim.newGame(opts);
  state.camped = false;
  state.scroll = 0;
  clearJournal();
  journal('landmark', `${state.game.leader.name} and four others sign the register at the Southern Terminus.`);
  refreshHud();
  return state.game;
}

export function setTravelling(on) {
  state.travelling = !!on && !!state.game && state.game.status === 'playing';
  state.walking = state.travelling;
  if (state.travelling) {
    state.camped = false;
    state.travelTimer = 0.15;
    Audio.sfx('footstep', { vol: 0.5 });
  }
  refreshHud();
}

export function setCamped(on) {
  state.camped = !!on;
  state.walking = false;
}

/** One day of the auto-travel loop. Stops on anything that needs a decision. */
function stepTravel() {
  const g = state.game;
  if (!g || g.status !== 'playing') { setTravelling(false); return; }

  let report;
  try {
    report = Sim.advanceDay(g);
  } catch (err) {
    console.error('[northbound] advanceDay failed', err);
    setTravelling(false);
    toast('Something went wrong on the trail.', 'bad');
    return;
  }

  state.travelTimer = 0.62;
  reportToJournal(report);
  refreshHud();
  emitWeatherFx(g);

  if (report.deaths && report.deaths.length) {
    Audio.sfx('death_knell');
    state.scene.flash('#d1785c', 0.5);
  }

  if (g.status !== 'playing') {
    setTravelling(false);
    setTimeout(() => endRun(), 900);
    return;
  }

  if (report.arrived) {
    setTravelling(false);
    Audio.sfx('arrive');
    setTimeout(() => go('landmark', { landmark: report.arrived }), 420);
    return;
  }

  if (report.event) {
    setTravelling(false);
    setTimeout(() => go('event', { event: report.event, report }), 320);
    return;
  }

  if (report.breakdown) {
    Audio.sfx('snap');
    state.scene.shake(3);
  }

  autosave();
}

function emitWeatherFx(g) {
  const w = g.weather || {};
  state.fx.clear();
  const n = Math.round(60 + 120 * (w.severity ?? 0.4));
  if (w.kind === 'rain' || w.kind === 'storm') state.fx.emit('rain', { count: n });
  else if (w.kind === 'snow') state.fx.emit('snow', { count: n });
  else if (w.kind === 'hail') state.fx.emit('hail', { count: Math.round(n * 0.6) });
  else if (w.kind === 'smoke') state.fx.emit('smoke', { count: 30 });
  else if (w.kind === 'hot') state.fx.emit('dust', { count: 18 });
  if (w.kind === 'storm' && Math.random() < 0.5) {
    state.scene.flash('#dfe8ff', 0.8);
    Audio.sfx('thunder', { vol: 0.8 });
  }
}

function reportToJournal(report) {
  for (const line of report.lines || []) journal(lineKind(line), line);
}

function lineKind(text) {
  const t = String(text).toLowerCase();
  if (t.includes('died') || t.includes('buried')) return 'death';
  if (t.includes('reach') || t.includes('arrive')) return 'landmark';
  return 'travel';
}

export function endRun() {
  const g = state.game;
  if (!g) return;
  setTravelling(false);
  Audio.playMusic(g.status === 'won' ? 'victory' : 'defeat');
  go('end', { score: scoreGame(g) });
}

export function abandonRun() {
  state.game = null;
  state.camped = false;
  clearJournal();
  clearSave();
  go('title');
}

let saveDebounce = 0;
function autosave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveNow, 800);
}

export async function saveNow() {
  if (!state.game) return;
  try { await saveGame(Sim.serialize(state.game)); } catch {}
}

export async function loadSaved() {
  const raw = await loadGame();
  if (!raw) return null;
  try {
    state.game = Sim.deserialize(raw);
    state.camped = false;
    clearJournal();
    journal('travel', 'You shoulder the packs and pick up where you left off.');
    refreshHud();
    return state.game;
  } catch (err) {
    console.warn('[northbound] save file could not be read');
    return null;
  }
}

// ------------------------------------------------------------------ HUD ----

export function refreshHud() {
  const g = state.game;
  if (!g) return;

  const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };

  set('hud-leader', g.leader.name);
  set('hud-occupation', occupationLabel(g));
  set('hud-date', dateLabel(g.date));
  set('hud-weather', weatherLabel(g));
  set('hud-mile', Math.round(g.mile).toLocaleString('en-US'));

  const nl = nextLandmark(g.mile);
  set('hud-next', nl ? `${nl.name} in ${Math.max(0, Math.round(nl.mile - g.mile))} mi` : 'The border is close');

  const pct = Math.max(0, Math.min(100, (g.mile / TOTAL_MILES) * 100));
  const snowPct = Math.max(0, Math.min(100, (g.snowMile / TOTAL_MILES) * 100));
  const fill = $('#rail-fill'); if (fill) fill.style.width = pct + '%';
  const you = $('#rail-you'); if (you) you.style.left = pct + '%';
  const snow = $('#rail-snow'); if (snow) snow.style.left = snowPct + '%';

  const gap = Math.round(g.snowMile - g.mile);
  const status = $('#rail-status');
  if (status) {
    status.textContent = gap > 900 ? `Snow line ${gap.toLocaleString('en-US')} mi ahead`
      : gap > 260 ? `Snow line closing — ${gap} mi`
      : `SNOW LINE ${gap} MI BEHIND SCHEDULE`;
    status.className = 'rail-status' + (gap <= 260 ? ' danger' : gap <= 900 ? ' warn' : '');
  }

  renderReadout(g);
  renderCrew(g);
  renderActions(g);
}

function renderReadout(g) {
  const node = $('#hud-readout'); if (!node) return;
  const s = g.supplies;
  const foodDays = Math.floor(s.food / Math.max(1, livingCount(g) * Sim.RATIONS[g.rations].lbPerDay));
  mountTo(node,
    el('span', 'Food ', el('b', { class: foodDays < 4 ? 'bad' : foodDays < 9 ? 'warn' : '' }, `${Math.round(s.food)} lb`),
      el('span.faint', ` (${foodDays}d)`)),
    el('span', 'Cash ', el('b', '$' + Math.round(s.money).toLocaleString('en-US'))),
    el('span', 'Mules ', el('b', String(s.mules))),
    el('span', 'Cart ', el('b', { class: g.cart.condition < 30 ? 'bad' : '' }, Math.round(g.cart.condition) + '%')),
    el('span', 'Pace ', el('b', Sim.PACES[g.pace].label || g.pace)),
    el('span', 'Rations ', el('b', Sim.RATIONS[g.rations].label || g.rations)),
    el('span', 'Day ', el('b', String(g.day))),
  );
}

function renderCrew(g) {
  const node = $('#hud-crew'); if (!node) return;
  mountTo(node, g.party.map((m) => {
    const cls = !m.alive ? 'bad' : m.health > 70 ? '' : m.health > 45 ? 'fair' : m.health > 22 ? 'poor' : 'bad';
    return el('div.crew-chip' + (m.alive ? '' : '.dead'), {
      title: m.alive ? `${healthWord(m.health)}${m.ailments.length ? ' — ' + m.ailments.map((a) => a.id).join(', ') : ''}` : 'Off trail',
    }, el('i.pip' + (cls ? '.' + cls : '')), m.trailName || m.name);
  }));
}

function renderActions(g) {
  const node = $('#hud-actions'); if (!node) return;
  const b = (label, fn, opts = {}) => el('button.btn' + (opts.cls ? '.' + opts.cls : '') + '.small',
    { type: 'button', onclick: () => { Audio.sfx('click'); fn(); }, title: opts.title || '' }, label);

  const travelling = state.travelling;
  mountTo(node,
    travelling
      ? b('Stop  [space]', () => setTravelling(false), { cls: 'danger' })
      : b('Continue on the trail  [space]', () => setTravelling(true), { cls: 'primary' }),
    b('Camp  [R]', () => go('camp')),
    b('Map  [M]', () => go('map')),
    b('Pack  [I]', () => go('pack')),
    b('Crew  [C]', () => go('party')),
    b('Forage  [F]', () => go('forage')),
    b('Menu  [Esc]', () => go('settings')),
  );
}

// ---------------------------------------------------------- HUD helpers ----

export function livingCount(g) { return g.party.filter((m) => m.alive).length; }

export function healthWord(h) {
  return h > 78 ? 'Good' : h > 55 ? 'Fair' : h > 32 ? 'Poor' : h > 12 ? 'Very poor' : 'Failing';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dateLabel(d) { return `${MONTHS[(d.month - 1) % 12]} ${d.day}`; }

function weatherLabel(g) {
  const w = g.weather || {};
  const kind = (w.kind || 'clear').replace(/^\w/, (c) => c.toUpperCase());
  return `${kind}, ${Math.round(w.tempF ?? 60)}°F`;
}

function occupationLabel(g) {
  const occ = g.leader.occupation;
  if (occ && typeof occ === 'object') return occ.name || '';
  const found = OCCUPATIONS.find((o) => o.id === occ);
  return found ? found.name : String(occ || '');
}

// -------------------------------------------------------------- journal ----

const journalLines = [];
export function journal(kind, text) {
  if (!text) return;
  const node = $('#journal'); if (!node) return;
  const line = el('div.line.' + kind, text);
  node.appendChild(line);
  journalLines.push(line);
  while (journalLines.length > 7) {
    const old = journalLines.shift();
    old.classList.add('fade');
    setTimeout(() => old.remove(), 700);
  }
}

function clearJournal() {
  journalLines.length = 0;
  const node = $('#journal'); if (node) clear(node);
}

// ---------------------------------------------------------------- toast ----

let toastTimer = 0;
export function toast(msg, kind = '') {
  const node = $('#toast'); if (!node) return;
  node.textContent = msg;
  node.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = 'toast' + (kind ? ' ' + kind : ''); }, 2400);
}

// ---------------------------------------------------------------- audio ----

let currentTrack = null;
export function playMusicForContext() {
  let track = 'theme_title';
  const g = state.game;
  if (state.screen === 'title' || !g) track = 'theme_title';
  else if (state.screen === 'end') track = g.status === 'won' ? 'victory' : 'defeat';
  else if (state.screen === 'store') track = 'store';
  else if (state.screen === 'forage') track = 'forage';
  else if (state.screen === 'ford') track = 'ford';
  else if (state.screen === 'camp' || state.camped) track = 'night_camp';
  else if (state.screen === 'landmark' || state.screen === 'talk' || state.screen === 'trade') {
    const lm = LANDMARKS.find((l) => l.id === g.atLandmark);
    track = lm && lm.kind === 'town' ? 'town' : BIOME_TRACK[biomeAtMile(g.mile)] || 'trail_forest';
  } else if (g.status === 'playing') {
    const dying = g.party.some((m) => m.alive && m.health < 22);
    const snowClose = g.snowMile - g.mile < 220;
    track = (dying || snowClose) ? 'danger'
      : (g.weather && (g.weather.kind === 'rain' || g.weather.kind === 'storm')) ? 'trail_rain'
      : BIOME_TRACK[biomeAtMile(g.mile)] || 'trail_forest';
  }
  if (track === currentTrack) return;
  currentTrack = track;
  Audio.playMusic(track);
}

function wireSoundButton() {
  const btn = $('#btn-sound');
  if (!btn) return;
  const sync = () => btn.classList.toggle('off', !!Audio.muted);
  btn.addEventListener('click', async () => {
    await Audio.init();
    Audio.toggleMute();
    sync();
    if (!Audio.muted) { currentTrack = null; playMusicForContext(); }
  });
  sync();
}

// ------------------------------------------------------------- keyboard ----

function wireGlobalKeys() {
  // The first gesture anywhere unlocks WebAudio.
  const unlock = async () => {
    await Audio.init();
    currentTrack = null;
    playMusicForContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const onTrail = state.screen === 'trail';
    const key = e.key.toLowerCase();

    if (key === 'm' && (onTrail || state.screen === 'map')) {
      e.preventDefault(); state.screen === 'map' ? close() : go('map'); return;
    }
    if (!state.game) return;

    if (onTrail) {
      switch (key) {
        case ' ': case 'enter': e.preventDefault(); setTravelling(!state.travelling); return;
        case 'i': e.preventDefault(); go('pack'); return;
        case 'c': e.preventDefault(); go('party'); return;
        case 'f': e.preventDefault(); go('forage'); return;
        case 'r': e.preventDefault(); go('camp'); return;
        case 'escape': e.preventDefault(); go('settings'); return;
      }
    } else if (key === 'escape' && OVERLAY_SCREENS.has(state.screen) && state.screen !== 'event') {
      e.preventDefault(); close(); return;
    }
  });

  // Number keys drive the numbered menus, Oregon-Trail style.
  window.addEventListener('keydown', (e) => {
    if (!/^[1-9]$/.test(e.key)) return;
    if (e.target instanceof HTMLInputElement) return;
    const active = document.querySelector('.screen.active [data-key="' + e.key + '"]');
    if (active) { e.preventDefault(); active.click(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.travelling) setTravelling(false);
  });
}

export { state as _state };
