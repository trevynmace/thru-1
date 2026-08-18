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

1. **The playtest bot loses in the Sierra.** `scripts/playtest.mjs` passes its actual
   contract — a full run of the real UI with zero console errors — and its forced
   finish exercises the ending, but its own policy starves somewhere around Forester
   Pass. `scripts/balance.mjs` is the authority on whether the *game* is winnable, and
   says it is. If you want the bot to finish honestly, the gap is that it does not
   carry enough over the 240-mile Kennedy Meadows → Tuolumne stretch and cannot
   forage its way out of it. Same applies to `playthrough.mjs`.
2. **Four screenshots are stale** — `camp`, `pace`, `party`, `rations`,
   `forage-nofuel`. They are UI panels unaffected by the rework, and the playtest only
   captures them if it is on the trail screen at particular turns. Harmless, but they
   are older than the rest of the set.

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
