// NORTHBOUND — persistence.
//
// The server (server.js) keeps the canonical save and hall of fame under saves/, but the
// game must stay playable from a file:// page, from Electron, offline, or with the API
// down — so every call mirrors to localStorage and falls back to it.
//
// HARD RULE: none of these ever reject. A failed save is a resolved `{ok:false}`, never
// an unhandled promise rejection in the middle of a run.
import { serialize, deserialize } from './sim.js';

const SAVE_KEY = 'northbound.save.v1';
const SCORE_KEY = 'northbound.scores.v1';
const TIMEOUT_MS = 4000;

// --- storage shim -----------------------------------------------------------------
// node --test has no localStorage; an in-memory Map keeps the fallback path testable
// (and keeps Electron's odd sandboxes from throwing on access).
const memory = new Map();
function storage() {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function') return ls;
  } catch { /* SecurityError in some embedded contexts */ }
  return {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
}
function readLocal(key) {
  try { return storage().getItem(key); } catch { return null; }
}
function writeLocal(key, value) {
  try { storage().setItem(key, value); return true; } catch { return false; }
}
function dropLocal(key) {
  try { storage().removeItem(key); return true; } catch { return false; }
}

// --- transport --------------------------------------------------------------------
// Injectable so tests can exercise both the server path and the offline path.
let _fetch = (...args) => (globalThis.fetch ? globalThis.fetch(...args) : Promise.reject(new Error('no fetch')));
/** Test seam. Pass a fetch-like function, or null to restore the global one. */
export function _setFetch(fn) {
  _fetch = typeof fn === 'function'
    ? fn
    : (...args) => (globalThis.fetch ? globalThis.fetch(...args) : Promise.reject(new Error('no fetch')));
}
/** Test seam: wipe the in-memory localStorage stand-in. */
export function _clearMemory() { memory.clear(); }

async function api(path, options = {}) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch { /* ignore */ } }, TIMEOUT_MS) : null;
  try {
    const res = await _fetch(path, {
      headers: { 'content-type': 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
      ...options,
    });
    if (!res || !res.ok) return { ok: false, status: res ? res.status : 0 };
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { ok: true, status: res.status, body };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// --- game save ---------------------------------------------------------------------

/** @returns {Promise<{ok:boolean, remote:boolean, local:boolean}>} */
export async function saveGame(g) {
  let json;
  try { json = serialize(g); } catch { return { ok: false, remote: false, local: false }; }
  const local = writeLocal(SAVE_KEY, json);
  const res = await api('/api/save', { method: 'POST', body: json });
  return { ok: res.ok || local, remote: res.ok, local };
}

/** @returns {Promise<object|null>} the game state, or null if there is nothing saved. */
export async function loadGame() {
  // The server exposes the save at /api/load (GET) and accepts writes/deletes at
  // /api/save; try both spellings so either server generation works.
  for (const path of ['/api/load', '/api/save']) {
    const res = await api(path, { method: 'GET' });
    if (res.ok && res.body && typeof res.body === 'object') {
      try {
        const g = deserialize(res.body);
        if (g && Array.isArray(g.party)) {
          writeLocal(SAVE_KEY, JSON.stringify(res.body));
          return g;
        }
      } catch { /* fall through to local */ }
    }
  }
  const raw = readLocal(SAVE_KEY);
  if (!raw) return null;
  try {
    const g = deserialize(raw);
    return g && Array.isArray(g.party) ? g : null;
  } catch { return null; }
}

/** @returns {Promise<{ok:boolean}>} */
export async function clearSave() {
  const local = dropLocal(SAVE_KEY);
  const res = await api('/api/save', { method: 'DELETE' });
  return { ok: res.ok || local, remote: res.ok, local };
}

// --- hall of fame -------------------------------------------------------------------

function normalizeEntry(e) {
  return {
    name: String(e?.name ?? 'Anonymous').slice(0, 24) || 'Anonymous',
    score: Math.max(0, Math.round(Number(e?.score) || 0)),
    rank: String(e?.rank ?? '').slice(0, 32),
    miles: Math.max(0, Math.round(Number(e?.miles) || 0)),
    date: String(e?.date ?? new Date().toISOString().slice(0, 10)).slice(0, 32),
  };
}
function sortTop(list) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeEntry)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/** @returns {Promise<{ok:boolean, scores:object[]}>} */
export async function saveScore(entry) {
  const e = normalizeEntry(entry);
  // Mirror locally first so an offline run still builds a hall of fame.
  let local = [];
  try { local = JSON.parse(readLocal(SCORE_KEY) || '[]'); } catch { local = []; }
  const merged = sortTop([...(Array.isArray(local) ? local : []), e]);
  writeLocal(SCORE_KEY, JSON.stringify(merged));

  const res = await api('/api/scores', { method: 'POST', body: JSON.stringify(e) });
  if (res.ok && Array.isArray(res.body?.scores)) {
    const remote = sortTop(res.body.scores);
    writeLocal(SCORE_KEY, JSON.stringify(remote));
    return { ok: true, scores: remote };
  }
  return { ok: true, scores: merged };
}

/** @returns {Promise<object[]>} top 10, highest first. Never rejects, never returns null. */
export async function loadScores() {
  const res = await api('/api/scores', { method: 'GET' });
  if (res.ok && Array.isArray(res.body)) {
    const list = sortTop(res.body);
    writeLocal(SCORE_KEY, JSON.stringify(list));
    return list;
  }
  try { return sortTop(JSON.parse(readLocal(SCORE_KEY) || '[]')); } catch { return []; }
}
