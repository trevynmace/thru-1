# Thru — One-Shot Build Prompt for Claude Code

> Paste everything below the line into a fresh Claude Code session opened at the root of
> this repository. It is written to take the existing in-development Unity/MonoGame game
> and produce a complete, playable, Node-based web port (Electron-ready for Steam) in a
> single pass. A reference implementation produced by this prompt already lives in
> [`/web`](./web) — point the model there if you want it to extend rather than rebuild.

---

You are porting an in-development game called **Thru** from Unity/MonoGame (C#) to a
**web game that runs entirely on Node**, packaged with **Electron** for Steam
distribution. Build it to be **fully playable in one pass** — make every design decision
yourself and do not stop until it runs end-to-end with no console errors.

## 1. Understand the source first
This repo is the original C#/MonoGame game (the owner called it "Unity"; it's actually
MonoGame). Read it for mechanics and content before writing code:
- `Thru/GameLogic/Characters/Stats.cs` — the stat model (Speed, Fitness, Charisma,
  Cleverness, Chillness, Energy, Luck, Outdoorsyness, Morale, Money, Snacks, Miles, Age).
- `Thru/GameLogic/Encounter/Encounter.cs` + `Thru/FileIO/RecordTypes.cs` — encounters are
  **stat + d20 ≥ DC** checks with success/failure resolutions that mutate a stat and can
  award items/trail-names. Preserve this exact resolution model.
- `Thru/GameLogic/TrailMaps/{Trail,Location,TrailMap}.cs` — graph of trail Locations.
- `Thru/GameLogic/Characters/{HikerMemory,HikerSocialRelationship}.cs` — hikers remember
  each other; "tramily" relationships grant bonuses.
- `Thru/GameData/Items.json` — real gear (bear can, Sawyer filter, tent, trekking poles…).
- `Thru/Content/DataLists/pct_map/*waypoints*.geojson` — **real PCT waypoint data** (name,
  desc, sym, lat/lon/elev). Mine it for authentic location names.
- `Thru/Content/Character Animation/**` — the **layered** character spritesheets (body,
  arms, hair, eyes, beard, shirts, sleeves, pants, shoes, backpacks, straps, trekking
  poles). Keep this layer system in the port's customizer.
- `Thru/Content/Backgrounds/*` — existing biome art (`southern_terminus`, `westcoast`…).

## 2. The game (from the Steam page, app 1730830)
Thru is "a modern day Oregon Trail" about thru-hiking the **Pacific Crest Trail**
(Mexico→Canada, 2,650 miles). Implement these rules exactly:
- **Single player.** Pick **NOBO or SOBO** and a **difficulty** (sets starting money,
  morale, and start date).
- **No health — only Morale.** If Morale drops **below 0**, the hiker leaves trail → you lose.
- **A "winter line"** advances along the trail toward you each day. If it reaches your
  mile, you're snowed off trail → you lose. Reaching the far terminus → you win.
- **Finite money**; spend it **in towns** for morale, food (Snacks), gear, and zero days.
- **Stats** gate encounter checks. **Gear** gives passive bonuses but **wears and breaks
  with miles**. **Recruit hikers to your tramily** for passive bonuses + new options.
- Hikers can **earn a trail name** on trail (don't pick it — it's given).

## 3. Visual style
Pixel art in the spirit of **Superbrothers: Sword & Sworcery EP** (match the 1st & 3rd
Steam screenshots): tiny silhouetted pixel humans, flat atmospheric color fields, limited
per-biome palettes, glowing skies, dithered horizon haze, parallax silhouette ridgelines.
**Draw everything procedurally from primitives** so the game is playable with zero external
assets — real art is a later drop-in. Render to a small internal buffer (e.g. 256×144) and
scale up nearest-neighbour (`image-rendering: pixelated`).

## 4. Architecture (Node, no build step required)
- `web/server.js` — Express: serves `public/` and a `/data` static mount; file-backed
  save API (`POST/GET/DELETE /api/save|load`) mirroring the original `FileIO/IOController`.
- `web/public/` — ES-module client (`index.html`, `css/`, `js/`): a pure-logic **engine**
  (no DOM), a procedural pixel-art **renderer**, and a **UI controller** wiring screens
  (menu → character creation → hiking HUD → encounter/town/map/pack modals → win/lose).
- `web/data/` — shared data modules imported by both client and tests: `locations.js`
  (PCT milestones with real miles/elevations/biomes), `encounters.js` (the stat-check deck),
  `gear.js`, `names.js` (name pools + procedural trail-name generator).
- `web/electron/main.js` — spawns the server, loads it in a BrowserWindow.
- `web/scripts/pixelate.js` — **offline** texture→pixel-art baker using `sharp` (downscale
  → optional palette-quantize → nearest upscale). Never pixelate at runtime; commit baked PNGs.
- `web/test/engine.test.js` — `node --test` invariants (progress, winter loss, win
  reachable, encounter resolution, save round-trip, town actions).
- `web/todo.html` — a styled page of copy-paste **Gemini prompts** for every spritesheet,
  background, prop, icon, and music track, organized to match the repo's layer system, plus
  the texture-pixelation workflow.

## 5. Gameplay loop to implement
Daily mileage = f(effective Speed, Energy, Morale, terrain by biome, pack weight, tramily
bonuses). Each "Hike" advances a day: move along the trail, wear gear, consume Snacks
(starving tanks Morale), restore Energy by sleep, drift Morale, advance the calendar and the
winter line, fire milestone arrivals (towns open the town panel; landmarks give a scenic
Morale boost), and roll a weighted **encounter** for the current biome. Encounters present
choice cards; resolving one rolls `stat + d20 ≥ DC` and applies the success/failure effect,
possibly recruiting tramily, granting gear, or awarding a trail name. Towns let you resupply
/ feast / motel / take a zero (winter keeps advancing on zeros) and buy/repair gear. Show a
progress rail with the hiker and the winter line, live stat bars, and a winter-distance warning.

## 6. Definition of done
- `cd web && npm install --omit=dev && npm start` serves a playable game at `localhost:3000`.
- `npm test` passes. A headless browser can create a hiker, hike ~30 days, clear encounters
  and towns, and reach a win/lose end screen **with zero console/page errors**.
- `npm run electron` opens it as a desktop app.
- The menu and hiking scenes visibly match the Sword & Sworcery pixel aesthetic.
- `web/todo.html` contains ready-to-use art/audio generation prompts.

Build it. Commit with clear messages. Don't stop until it's complete and verified.
