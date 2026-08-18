// NORTHBOUND — the single data-import seam.
//
// ---------------------------------------------------------------------------------
// IMPORT STRATEGY (decided here, once, on purpose)
// ---------------------------------------------------------------------------------
// The shared game data in `northbound/data/*.js` is loaded by two very different
// resolvers: the browser (which sees the server's URL space, where `public/` is the web
// root and `data/` is mounted at `/data`) and `node --test` (which sees the filesystem).
// A bare `/data/trail.js` works in the browser and is meaningless to Node; a filesystem
// path works in Node and is meaningless to the browser.
//
// We resolve that with **relative specifiers, in this file only**:
//
//     ../../../data/trail.js
//
//   * In Node, from `northbound/public/js/engine/` that walks up to `northbound/`
//     and lands on `northbound/data/trail.js` — the real file.
//   * In the browser this module is served as `/js/engine/data.js`; per the URL spec,
//     `..` segments that would escape the origin root are clamped, so the three
//     `..` hops collapse to the root and the specifier resolves to `/data/trail.js`
//     — exactly where server.js mounts the data directory.
//
// Both resolutions were verified (node --test and headless Chromium) before this was
// written down. The alternative — a package.json `"imports"` map (`#data/*`) plus an
// `<script type="importmap">` in index.html — also works, but it needs two files that
// other modules own to stay in sync forever, and an import map must be declared before
// the first module load or it silently stops applying. The relative form needs nothing
// but this file and the directory layout the SPEC already fixes, so that is what we use.
//
// THE RULE FOR EVERYONE ELSE: engine modules import game data from `./data.js` and
// never reach into `../../../data/` or `/data/` themselves. One seam, one decision.
// ---------------------------------------------------------------------------------

export {
  TOTAL_MILES,
  LANDMARKS,
  BIOMES,
  landmarkAtMile,
  nextLandmark,
  lastLandmark,
  biomeAtMile,
  elevAtMile,
  terrainFactor,
} from '../../../data/trail.js';

export {
  ITEMS,
  ITEMS_BY_ID,
  CART_PARTS,
  priceOf,
} from '../../../data/items.js';

export {
  AILMENTS,
  AILMENTS_BY_ID,
} from '../../../data/ailments.js';

export {
  EVENTS,
  rollEvent,
} from '../../../data/events.js';

export {
  OCCUPATIONS,
  NAME_POOL,
  TRAIL_NAMES,
  generateTrailName,
  EPITAPHS,
  PORTRAIT_PARTS,
} from '../../../data/party.js';

export {
  TALK,
  talkLine,
  STORE_GREETINGS,
} from '../../../data/dialogue.js';

export {
  STORE_STOCK,
  stockFor,
} from '../../../data/store.js';
