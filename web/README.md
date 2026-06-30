# Thru — Web Port 🥾

A modern-day Oregon Trail on the **Pacific Crest Trail**. A Node/Electron port of the
in-development Unity/MonoGame game ([Steam](https://store.steampowered.com/app/1730830/Thru/)).

Walk 2,650 miles from the Mexican border to Canada. There's no health — only **morale**.
Keep ahead of the **winter line**, manage money and food, survive trail encounters, recruit
your **tramily**, and try to touch the northern monument before the snow closes the passes.

![style](https://img.shields.io/badge/style-Sword%20%26%20Sworcery-caa06a) ![runtime](https://img.shields.io/badge/runtime-Node%2018%2B-3a7163)

## Run it

```bash
cd web
npm install --omit=dev      # runtime dep is just express
npm start                   # → http://localhost:3000
```

Desktop (Electron, for Steam distribution):

```bash
npm install                 # adds electron + electron-builder (downloads a binary)
npm run electron            # run as a desktop app
npm run dist                # build installers into web/dist/
```

Tests:

```bash
npm test                    # node --test, engine invariants
node scripts/smoke.mjs      # headless browser end-to-end (needs playwright-core + a chromium)
```

## How it plays
- **Hike** to advance a day. Daily miles depend on Speed, Energy, Morale, terrain, and pack weight.
- **Morale < 0 = game over.** The **winter line** chases you up the trail — get caught and you're off trail.
- **Encounters** resolve as `stat + d20 ≥ DC`, applying a success/failure effect (faithful to the original C# model).
- **Towns** spend money on resupply, morale, gear, and zeros. **Gear** wears out with miles. **Tramily** members grant passive bonuses.

## Layout
```
web/
  server.js            Express server + file-backed save API (mirrors original FileIO)
  public/
    index.html  css/   pixel UI shell
    js/engine.js        pure simulation (no DOM) — the rules
    js/art.js           procedural Sword & Sworcery pixel renderer (zero assets needed)
    js/ui.js            screens, render loop, encounter/town/map/pack flows
  data/                 locations (real PCT miles), encounters, gear, names — shared by client + tests
  electron/main.js      desktop wrapper
  scripts/pixelate.js   offline texture → pixel-art baker (sharp)
  test/engine.test.js   node --test invariants
  todo.html             Gemini art/audio generation prompts (drop-in asset upgrades)
```

## Replacing placeholder art
The game ships drawing everything procedurally. To use real assets:
- **Backgrounds:** load an `Image` and blit it before the procedural props in `art.js`.
- **Characters:** replace `drawHiker()` with layered sprite draws keyed off the customizer (the repo's `Character Animation/` layers map 1:1).
- **Textures:** bake pixel versions offline with `npm run pixelate -- --in raw/x.jpg --out public/assets/x.png --quantize`.

See [`todo.html`](./todo.html) for ready-to-paste generation prompts for every asset.

## Provenance
Mechanics, stats, gear, the encounter resolution model, the layered character system, and
real PCT waypoint data are taken from the original C#/MonoGame project in this repo
(`/Thru`). Design rules follow the Steam description. Built as a faithful, self-contained
web reimplementation.
