// NORTHBOUND — headless playtest.
//
// Boots the real server, drives the real UI in Chromium, plays a full run, and
// fails loudly on any console error, page error, failed request, or unhandled
// rejection. Also writes the README screenshots.
//
//   node scripts/playtest.mjs            full run + screenshots
//   node scripts/playtest.mjs --quick    shorter run, no screenshots
//   node scripts/playtest.mjs --headed   watch it play

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHOT_DIR = join(ROOT, 'docs', 'screenshots');
// A leftover server from an aborted run must not wedge the next one, so each run
// takes a fresh port unless one is pinned explicitly.
const PORT = process.env.PORT || (3200 + (process.pid % 700));
const BASE = `http://localhost:${PORT}`;

const QUICK = process.argv.includes('--quick');
const HEADED = process.argv.includes('--headed');
const TIMING = process.argv.includes('--timing');

const problems = [];
let step = 0;

const log = (msg) => console.log(`  ${String(++step).padStart(2, '0')}. ${msg}`);
const fail = (msg) => { problems.push(msg); console.log(`      ✗ ${msg}`); };

async function main() {
  await fs.mkdir(SHOT_DIR, { recursive: true });

  console.log('\nNORTHBOUND playtest\n');
  const server = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => fail(`server stderr: ${String(d).trim()}`));
  await waitForServer();

  // This environment ships a preinstalled Chromium that may not match the revision the
  // installed Playwright expects, so point at it directly rather than downloading one.
  const preinstalled = process.env.NB_CHROMIUM
    || (await firstExisting([
      '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      '/opt/pw-browsers/chromium/chrome-linux/chrome',
    ]));
  const browser = await chromium.launch({
    headless: !HEADED,
    ...(preinstalled ? { executablePath: preinstalled } : {}),
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });

  page.on('console', (m) => {
    const type = m.type();
    if (type === 'error' || type === 'warning') fail(`console.${type}: ${m.text()}`);
  });
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().includes('favicon')) fail(`request failed: ${r.url()} — ${r.failure()?.errorText}`);
  });

  try {
    await run(page);
  } catch (err) {
    fail(`playtest threw: ${err.stack || err}`);
  }

  await browser.close();
  server.kill('SIGTERM');
  await new Promise((r) => { server.once('exit', r); setTimeout(r, 2000); });

  console.log('');
  if (problems.length) {
    console.log(`FAILED — ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 40)) console.log('  · ' + p);
    process.exitCode = 1;
  } else {
    console.log('PASSED — a full run with zero console errors.');
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('server never came up');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstExisting(paths) {
  for (const p of paths) {
    try { await fs.access(p); return p; } catch {}
  }
  return null;
}

async function shot(page, name) {
  if (QUICK) return;
  await sleep(320);
  await page.screenshot({ path: join(SHOT_DIR, name + '.png') });
}

/**
 * Click a button whose text contains `text` inside the *topmost* screen.
 *
 * Modal screens layer over the trail HUD, so both are `.screen.active` at once and a
 * bare `.screen.active` selector can match the HUD button sitting underneath the modal
 * (which is unclickable, because the modal's scrim covers it).
 */
async function clickText(page, text, { timeout = 8000, optional = false } = {}) {
  const screen = await page.evaluate(() => (window.NB && window.NB.screen) || null);
  const scope = screen ? `#screen-${screen}` : '.screen.active';
  const locator = page.locator(`${scope} button:has-text("${text}"), ${scope} .btn:has-text("${text}")`).first();
  try {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click({ timeout });
    await sleep(180);
    return true;
  } catch (err) {
    if (!optional) fail(`could not click "${text}"`);
    return false;
  }
}

async function activeScreen(page) {
  return page.evaluate(() => {
    if (window.NB && window.NB.screen) return window.NB.screen;
    const s = document.querySelector('.screen.active');
    return s ? s.dataset.screen : null;
  });
}

async function gameState(page) {
  return page.evaluate(() => {
    const g = window.NB && window.NB.game;
    if (!g) return null;
    return {
      day: g.day, mile: Math.round(g.mile), status: g.status, cause: g.cause,
      food: Math.round(g.supplies.food), money: Math.round(g.supplies.money),
      fuel: g.supplies.stove_fuel, alive: g.party.filter((m) => m.alive).length,
      snowMile: Math.round(g.snowMile), kit: Math.round(g.kit.condition),
      load: Math.round(g.kit.load),
    };
  });
}

async function run(page) {
  log('load the title screen');
  // The bot cannot play a twitch minigame, and a run that escapes out of every ford and
  // every forage day is not a run. Boot with the crew handling them, at a compressed
  // clock so a full season fits in a test.
  await page.goto(BASE + '/?auto=1&speed=8', { waitUntil: 'networkidle' });
  await page.waitForSelector('#screen-title.active', { timeout: 15000 });
  await page.waitForFunction(() => !!window.NB, null, { timeout: 15000 });
  await sleep(700);
  await shot(page, 'title');

  log('read the help screen');
  await clickText(page, 'How to hike it');
  await shot(page, 'help');
  await clickText(page, 'Back');

  log('set up a crew');
  await clickText(page, 'Begin the trail');
  await page.waitForSelector('#screen-setup.active');
  await page.locator('#screen-setup .card').nth(2).click({ timeout: 5000 });   // an occupation
  await clickText(page, 'Roll new names', { optional: true });
  await sleep(150);
  await shot(page, 'setup');

  log('outfit at the terminus');
  await clickText(page, 'To the outfitter');
  await page.waitForSelector('#screen-store.active');

  // A trip's worth of food and a spread of spares.
  // Everything rides on somebody's back now, so buy a trip's worth, not a season's.
  const buys = [
    ['Trail Food', 14], ['Stove Fuel', 8], ['Spare Shoes', 3], ['Spare Poles', 2],
    ['Spare Filter', 2], ['Spare Pack', 1], ['Tent Repair Kit', 1],
    ['First Aid Kit', 3], ['Clothing', 4],
  ];
  for (const [name, clicks] of buys) {
    const row = page.locator('#screen-store .row', { hasText: name }).first();
    if (!(await row.count())) continue;
    const plus = row.locator('button:has-text("+")');
    for (let i = 0; i < clicks; i++) await plus.click({ timeout: 3000 }).catch(() => {});
  }
  await sleep(200);
  await shot(page, 'store');
  await clickText(page, 'Buy it and go north');
  await page.waitForSelector('#screen-trail.active', { timeout: 8000 });

  const start = await gameState(page);
  if (!start) fail('no game state after outfitting');
  else log(`on trail with ${start.food} lb, $${start.money}, ${start.load} lb on their backs`);
  await sleep(600);
  await shot(page, 'trail');

  log('play the run');
  const turnsArg = process.argv.find((a) => a.startsWith('--turns='));
  const maxTurns = turnsArg ? Number(turnsArg.slice(8)) : (QUICK ? 40 : 400);
  let lastMile = -1, stuck = 0, forded = 0, foraged = 0, events = 0, landmarks = 0;

  let lastReport = Date.now();
  let turnStart = Date.now();
  for (let turn = 0; turn < maxTurns; turn++) {
    const state = await gameState(page);
    const took = Date.now() - turnStart;
    turnStart = Date.now();
    if (TIMING || Date.now() - lastReport > 20000) {
      lastReport = Date.now();
      console.log(`      … turn ${turn}: ${took}ms  day ${state?.day} mile ${state?.mile} on "${await activeScreen(page)}"`);
    }
    if (!state) { fail('lost the game state mid-run'); break; }
    if (state.status !== 'playing') {
      log(`run ended: ${state.status} (${state.cause || '—'}) on day ${state.day}, mile ${state.mile}`);
      if (state.status === 'lost' && state.day < 25) {
        const tail = await page.evaluate(() => (window.NB.game.log || []).slice(-16).map((l) => `${l.day} [${l.kind}] ${l.text}`));
        fail(`run collapsed on day ${state.day}; last log lines:\n      ` + tail.join('\n      '));
      }
      break;
    }

    if (state.mile === lastMile) stuck++; else stuck = 0;
    lastMile = state.mile;
    if (stuck > 26) {
      const where = await activeScreen(page);
      // A wedge is only useful if it says what it was looking at, so dump the panel.
      const dump = await page.evaluate((scr) => {
        const sec = document.getElementById('screen-' + scr);
        if (!sec) return 'no such section';
        const btns = [...sec.querySelectorAll('button')].map((b) => `[${b.textContent.trim()}]`).join(' ');
        const all = [...document.querySelectorAll('.screen.active')].map((n) => n.id).join(',');
        return `active=${sec.classList.contains('active')} allActive=${all} buttons: ${btns || '(none)'}\n      `
          + (sec.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      }, where).catch(() => '(dump failed)');
      fail(`stuck at mile ${state.mile} for ${stuck} turns on screen "${where}"\n      ${dump}`);
      break;
    }

    const screen = await activeScreen(page);

    if (screen === 'event') {
      events++;
      if (events === 1) await shot(page, 'event');
      if (!await clickText(page, 'See what happens', { timeout: 1200, optional: true })) {
        await page.locator('#screen-event #event-choices .btn').first().click({ timeout: 2000 }).catch(() => {});
      }
      await sleep(220);
      await clickText(page, 'Onward', { timeout: 2500, optional: true });
      continue;
    }

    if (screen === 'landmark') {
      landmarks++;
      if (TIMING) console.log(`      @landmark d${state.day} mi${state.mile} food=${state.food} fuel=${state.fuel} hp?`);
      if (landmarks === 1) await shot(page, 'landmark');

      // Top up food when low, rest when the crew is hurting.
      if (await clickText(page, 'Buy supplies', { timeout: 700, optional: true })) {
        // Fill the food bag to whatever is left of the crew's carrying capacity —
        // the store sells in 10 lb steps and the long Sierra gaps punish half measures.
        const headroom = await page.evaluate(() => {
          const g = window.NB.game;
          return Math.max(0, window.NB.ctx.Sim.packCapacity(g) - g.kit.load);
        }).catch(() => 100);
        const row = page.locator('#screen-store .row', { hasText: 'Trail Food' }).first();
        const plus = row.locator('button:has-text("+")');
        for (let i = 0; i < Math.round(headroom / 10); i++) await plus.click({ timeout: 1500 }).catch(() => {});
        const fuelRow = page.locator('#screen-store .row', { hasText: 'Stove Fuel' }).first();
        if (await fuelRow.count()) {
          const fp = fuelRow.locator('button:has-text("+")');
          for (let i = 0; i < 6; i++) await fp.click({ timeout: 1200 }).catch(() => {});
        }
        await clickText(page, 'Buy', { optional: true });
        await clickText(page, 'Done', { optional: true });
        continue;
      }

      // Between Kennedy Meadows and Tuolumne there are 240 miles and no store, so a
      // crew that only forages once the bag is nearly empty starves in the Sierra.
      if (state.food < 100 && foraged < 14 && state.fuel > 0) {
        foraged++;
        if (await clickText(page, 'Try to forage', { timeout: 700, optional: true })) {
          await clickText(page, 'Spend the day', { timeout: 3000, optional: true });
          await sleep(1200);
          if (foraged === 1) await shot(page, 'forage');
          const done = await page.waitForSelector('#screen-forage.active .btn', { timeout: 25000 })
            .then(() => true, () => false);
          if (!done) {
            await page.keyboard.press('Escape');
            await page.waitForSelector('#screen-forage.active .btn', { timeout: 8000 }).catch(() => {});
          }
          await clickText(page, 'Back to the trail', { timeout: 6000, optional: true });
          continue;
        }
      }

      if (turn % 7 === 3 && await clickText(page, 'Talk to people', { timeout: 700, optional: true })) {
        await sleep(200);
        await clickText(page, 'Back', { optional: true });
        continue;
      }

      // The numbered menus are keyboard-driven, and "1" is always "carry on" - a far
      // more robust way to advance than matching button text.
      if (!(await clickText(page, 'Continue on the trail', { timeout: 2500, optional: true }))) {
        await page.keyboard.press('1');
        await sleep(300);
      }
      continue;
    }

    // Arriving at a river opens the crossing directly, the way The Oregon Trail does,
    // so the ford is its own top-level screen rather than a landmark menu item.
    if (screen === 'ford') {
      forded++;
      if (forded === 1) await shot(page, 'ford');
      const methods = page.locator('#screen-ford .menu-numbered .btn');
      const n = await methods.count();
      if (n) await methods.nth(Math.min(n - 1, forded % n)).click({ timeout: 3000 }).catch(() => {});
      // The crossing plays itself out; wait for the result panel rather than bailing.
      const resolved = await page.waitForSelector('#screen-ford.active .btn', { timeout: 20000 })
        .then(() => true, () => false);
      if (!resolved) {
        await page.keyboard.press('Escape');
        await page.waitForSelector('#screen-ford.active .btn', { timeout: 8000 }).catch(() => {});
      }
      if (!(await clickText(page, 'Onward', { timeout: 4000, optional: true }))) {
        await clickText(page, 'Look at it again', { timeout: 2000, optional: true });
      }
      continue;
    }

    if (screen === 'trail') {
      // Occasionally poke the info screens to prove they render mid-run.
      if (turn === 6) { await page.keyboard.press('m'); await sleep(500); await shot(page, 'map'); await page.keyboard.press('Escape'); }
      if (turn === 9) { await page.keyboard.press('i'); await sleep(400); await shot(page, 'pack'); await page.keyboard.press('Escape'); }
      if (turn === 12) { await page.keyboard.press('c'); await sleep(400); await shot(page, 'party'); await page.keyboard.press('Escape'); }
      if (turn === 15) { await page.keyboard.press('r'); await sleep(400); await shot(page, 'camp'); await page.keyboard.press('Escape'); }
      // Between Kennedy Meadows and Tuolumne there is no store for 240 miles, so a crew
      // that only forages at landmarks starves in the Sierra. Forage from the trail the
      // way a player would, the moment the bag stops reaching the next store.
      if (state.food < 90 && state.fuel > 0 && foraged < 20) {
        foraged++;
        await page.keyboard.press('f');
        await sleep(300);
        if ((await activeScreen(page)) === 'forage') {
          if (await clickText(page, 'Spend the day', { timeout: 2500, optional: true })) {
            await sleep(1200);
            if (foraged === 1) await shot(page, 'forage');
            const done = await page.waitForSelector('#screen-forage.active .btn', { timeout: 25000 })
              .then(() => true, () => false);
            if (!done) {
              await page.keyboard.press('Escape');
              await page.waitForSelector('#screen-forage.active .btn', { timeout: 8000 }).catch(() => {});
            }
            await clickText(page, 'Back to the trail', { timeout: 6000, optional: true });
          } else {
            await clickText(page, 'Not today', { timeout: 1500, optional: true });
          }
          continue;
        }
      }

      // Space *toggles* travel, so only press it when the crew is actually stopped -
      // pressing every turn just switches walking on and off and goes nowhere.
      const moving = await page.evaluate(() => !!(window.NB && window.NB.isTravelling && window.NB.isTravelling()));
      if (!moving) await page.keyboard.press(' ');
      // Wait on the game rather than the clock: travel ticks a day roughly every 0.6s,
      // so a fixed sleep either burns wall time or misses the tick entirely.
      await page.waitForFunction(
        (fromDay) => {
          const g = window.NB && window.NB.game;
          if (!g) return true;
          return g.day >= fromDay + 2
            || g.status !== 'playing'
            || (window.NB.screen && window.NB.screen !== 'trail');
        },
        state.day,
        { timeout: 3500, polling: 80 },
      ).catch(() => {});
      continue;
    }

    if (screen === 'end') break;

    // Every other screen is a panel with a way out; take it, and fall back to Esc.
    const exits = {
      store: 'Done', pack: 'Close', party: 'Close', map: 'Close',
      talk: 'Back', trade: 'Walk away', camp: 'Never mind',
      forage: 'Not today', ford: 'Onward', settings: 'Back', help: 'Back', scores: 'Back',
    };
    const exit = exits[screen];
    if (!exit || !(await clickText(page, exit, { timeout: 1500, optional: true }))) {
      await page.keyboard.press('Escape');
      await sleep(300);
      // Still here? The screen has no working exit — that is worth failing on.
      if ((await activeScreen(page)) === screen && screen !== 'trail') {
        await page.keyboard.press('Escape');
        await sleep(400);
        if ((await activeScreen(page)) === screen) fail(`no way out of the "${screen}" screen`);
      }
    }
    await sleep(200);
  }

  // If the bounded run has not ended naturally, drive the last stretch so the ending,
  // the score tally and the register all get exercised for real.
  let finalState = await gameState(page);
  if (finalState && finalState.status === 'playing') {
    log(`forcing the finish from mile ${finalState.mile} to exercise the ending`);
    await page.evaluate(() => {
      const g = window.NB.game;
      g.mile = 2610;                       // just short of the northern terminus
      g.supplies.food = Math.max(g.supplies.food, 120);
      window.NB.ctx.refreshHud();
    });
    for (let i = 0; i < 30; i++) {
      const st = await gameState(page);
      if (!st || st.status !== 'playing') break;
      const screen = await activeScreen(page);
      if (screen === 'event') {
        if (!await clickText(page, 'See what happens', { timeout: 1200, optional: true })) {
          await page.locator('#screen-event #event-choices .btn').first().click({ timeout: 2000 }).catch(() => {});
        }
        await clickText(page, 'Onward', { timeout: 2500, optional: true });
      } else if (screen === 'landmark') {
        await page.keyboard.press('1');
        await sleep(300);
      } else if (screen === 'trail') {
        const moving = await page.evaluate(() => !!(window.NB && window.NB.isTravelling()));
        if (!moving) await page.keyboard.press(' ');
        await sleep(900);
      } else {
        await page.keyboard.press('Escape');
        await sleep(250);
      }
    }
  }

  log('reach the end screen');
  finalState = await gameState(page);
  if (finalState && finalState.status !== 'playing') {
    await page.waitForSelector('#screen-end.active', { timeout: 12000 }).catch(() => fail('end screen never appeared'));
    await sleep(500);
    await shot(page, 'end');
    await clickText(page, 'Sign the register', { optional: true });
    await sleep(400);
    await clickText(page, 'Hall of fame', { optional: true });
    await sleep(300);
    await shot(page, 'scores');
  } else if (finalState) {
    log(`run still going at day ${finalState.day}, mile ${finalState.mile} — that is fine for a bounded playtest`);
  }

  log('summary: ' + JSON.stringify({ events, landmarks, forded, foraged, ...(finalState || {}) }));
}

main().catch((err) => { console.error(err); process.exit(1); });
