# Northbound — where the work stands

Branch: `claude/oregon-trail-game-ik0o32`. Everything below is committed and pushed.

## Done

- **Backpacks replace pack animals.** `packCapacity()` = 12 lb + 34 lb per living
  hiker; `packFactor()` turns the load ratio into a daily-mileage multiplier.
  `g.cart` → `g.kit`, `repairCart` → `replaceGear`. Breakable gear is soles,
  poles, filter, pack, shelter.
- **120 unit tests pass** (`node --test test/*.test.js`).
- **`scripts/balance.mjs`** — Monte-Carlo harness over the real sim. Current
  reading at 150 runs per archetype:

  | archetype | wins | avg mile | survivors | median finish |
  |---|---|---|---|---|
  | good | 91% | 2577 | 2.7/5 | day 180 |
  | average | 87% | 2451 | 2.5/5 | day 154 |
  | reckless | 17% | 1192 | 1.8/5 | day 138 |

  Departure month (the "good" policy): March 79%, April 92%, May 39%, June 0%.
  The script exits non-zero if any of those fall out of band.
- **`scripts/playtest.mjs`** — drives the real UI in Chromium and fails on any
  console error. Boots at `?auto=1&speed=8` so the crew plays the minigames.
- **Six real bugs fixed**, listed in the commit message. The big one: the trail
  HUD painted over the store panel and ate its clicks, so every resupply after
  Campo bought nothing and crews starved around mile 300.
- **Assist setting** (Settings → "River crossings and foraging") hands the
  minigames to the crew. Backed by `public/js/engine/prefs.js`, which also reads
  `?auto=` and `?speed=` from the query string.

## Open

1. **A mule is still drawn in the river crossing.** `public/js/minigames/ford.js`
   lines ~255–258, 266, and ~901–903 (`S.mules`, `isMule`) still put a pack
   animal in the water. This is the exact inaccuracy the crossing was supposed to
   lose. Delete the mule from `createState` and from the crew-drawing loop, and
   redraw the extra figure as a sixth hiker or drop it.
2. **`drawPackString()` in `render/scene.js` has never been seen on screen.** It
   exists so a passing packer's mule string can appear as scenery — the honest
   place for that art. Confirm it renders, or cut it.
3. **The wade autopilot is too good.** After the fixed-timestep fix it crosses a
   3.6 ft raging river clean every time. Diagnosis got as far as: the completion
   branch in `updateWade` was never reached in the probe, which means the run is
   ending somewhere else — check which `endRun()` call site actually fires for
   `method: 'ford'`. Rock-hop, raft, shuttle and wait all behave.
4. **Screenshots in `docs/playthrough/` are stale** — captured with the old
   mule-and-cart build. Recapture with `node scripts/playtest.mjs` (without
   `--quick`).
5. **README and SPEC.md** still describe mules and the cart in places, and do not
   document the pack-weight model or the assist setting.
6. **Ship to `main`** once the above is closed out.

## How to run things

```
node --test test/*.test.js                 # 120 tests
node scripts/balance.mjs --runs=150         # simulation balance
node scripts/playtest.mjs --quick --timing  # the real UI, headless
node server.js                              # play it at :3100
```

The playtest needs the preinstalled Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; never run
`playwright install`.
