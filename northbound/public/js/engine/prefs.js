// NORTHBOUND — player preferences that outlive a run.
//
// These are not part of a save file: they belong to the person, not the crew. The
// store is deliberately tiny and never throws — a browser with localStorage disabled
// should still play, just without remembering anything.

const KEY = 'nb.prefs';

const DEFAULTS = {
  // Hands the river crossing and the foraging day to the game. Some people came for a
  // survival simulation and not for an arcade cabinet, and the trail is no less real
  // when the crew walks it competently on its own.
  autoMinigames: false,
  // How fast the minigames run. Only the playtest harness moves this off 1.
  minigameSpeed: 1,
};

let cache = null;

function read() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(cache, JSON.parse(raw) || {});
  } catch { /* defaults are a fine answer */ }

  // A query string wins over stored prefs so a harness (or a curious player) can flip
  // these without touching the settings screen.
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('auto')) cache.autoMinigames = q.get('auto') !== '0';
    if (q.has('speed')) {
      const n = Number(q.get('speed'));
      if (Number.isFinite(n) && n > 0) cache.minigameSpeed = Math.min(20, Math.max(0.1, n));
    }
  } catch { /* no location in a test runner */ }

  return cache;
}

export function getPref(name) {
  const p = read();
  return name in p ? p[name] : DEFAULTS[name];
}

export function setPref(name, value) {
  const p = read();
  p[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* nothing to do */ }
  return value;
}

/** Options every minigame takes, so the two call sites cannot drift apart. */
export function minigameOpts() {
  return { autoplay: !!getPref('autoMinigames'), timeScale: getPref('minigameSpeed') };
}
