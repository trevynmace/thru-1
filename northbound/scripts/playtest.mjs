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
const PORT = process.env.PORT || 3199;
const BASE = `http://localhost:${PORT}`;

const QUICK = process.argv.includes('--quick');
const HEADED = process.argv.includes('--headed');

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

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

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
  server.kill();

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

async function shot(page, name) {
  if (QUICK) return;
  await sleep(320);
  await page.screenshot({ path: join(SHOT_DIR, name + '.png') });
}

/** Click a button whose text contains `text` inside the active screen. */
async function clickText(page, text, { timeout = 8000, optional = false } = {}) {
  const locator = page.locator(`.screen.active button:has-text("${text}"), .screen.active .btn:has-text("${text}")`).first();
  try {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click();
    await sleep(180);
    return true;
  } catch (err) {
    if (!optional) fail(`could not click "${text}"`);
    return false;
  }
}

async function activeScreen(page) {
  return page.evaluate(() => {
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
      mules: g.supplies.mules, alive: g.party.filter((m) => m.alive).length,
      snowMile: Math.round(g.snowMile), cart: Math.round(g.cart.condition),
    };
  });
}

async function run(page) {
  log('load the title screen');
  await page.goto(BASE, { waitUntil: 'networkidle' });
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
  await page.locator('.screen.active .card').nth(2).click();     // an occupation
  await clickText(page, 'Roll new names', { optional: true });
  await sleep(150);
  await shot(page, 'setup');

  log('outfit at the terminus');
  await clickText(page, 'To the outfitter');
  await page.waitForSelector('#screen-store.active');

  // Buy a sane kit: plenty of food, mules, and a spread of spares.
  const buys = [
    ['Trail Food', 55], ['Pack Mule', 4], ['Spare Wheel', 2], ['Spare Axle', 1],
    ['Spare Shoes', 3], ['Spare Poles', 2], ['Spare Filter', 2],
    ['First Aid Kit', 3], ['Clothing', 4],
  ];
  for (const [name, clicks] of buys) {
    const row = page.locator('.screen.active .row', { hasText: name }).first();
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
  else log(`on trail with ${start.food} lb, $${start.money}, ${start.mules} mules`);
  await sleep(600);
  await shot(page, 'trail');

  log('play the run');
  const maxTurns = QUICK ? 40 : 260;
  let lastMile = -1, stuck = 0, forded = 0, foraged = 0, events = 0, landmarks = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const state = await gameState(page);
    if (!state) { fail('lost the game state mid-run'); break; }
    if (state.status !== 'playing') { log(`run ended: ${state.status} (${state.cause || '—'}) on day ${state.day}, mile ${state.mile}`); break; }

    if (state.mile === lastMile) stuck++; else stuck = 0;
    lastMile = state.mile;
    if (stuck > 14) { fail(`stuck at mile ${state.mile} for ${stuck} turns on screen "${await activeScreen(page)}"`); break; }

    const screen = await activeScreen(page);

    if (screen === 'event') {
      events++;
      if (events === 1) await shot(page, 'event');
      if (!await clickText(page, 'See what happens', { timeout: 1200, optional: true })) {
        await page.locator('.screen.active #event-choices .btn').first().click().catch(() => {});
      }
      await sleep(220);
      await clickText(page, 'Onward', { timeout: 4000, optional: true });
      continue;
    }

    if (screen === 'landmark') {
      landmarks++;
      if (landmarks === 1) await shot(page, 'landmark');

      // Cross rivers, top up food when low, rest when the crew is hurting.
      if (await clickText(page, 'Cross ', { timeout: 700, optional: true })) {
        forded++;
        await sleep(250);
        if (forded === 1) await shot(page, 'ford');
        await page.locator('.screen.active .btn').nth(Math.min(4, forded % 5)).click().catch(() => {});
        await sleep(2600);                       // let the crossing play out
        await page.keyboard.press('Escape');
        await sleep(600);
        await clickText(page, 'Onward', { timeout: 6000, optional: true });
        continue;
      }

      if (state.food < 120 && await clickText(page, 'Buy supplies', { timeout: 700, optional: true })) {
        const row = page.locator('.screen.active .row', { hasText: 'Trail Food' }).first();
        const plus = row.locator('button:has-text("+")');
        for (let i = 0; i < 30; i++) await plus.click({ timeout: 1500 }).catch(() => {});
        await clickText(page, 'Buy', { optional: true });
        await clickText(page, 'Done', { optional: true });
        continue;
      }

      if (state.food < 60 && foraged < 3) {
        foraged++;
        if (await clickText(page, 'Try to forage', { timeout: 700, optional: true })) {
          await clickText(page, 'Spend the day', { timeout: 3000, optional: true });
          await sleep(1200);
          if (foraged === 1) await shot(page, 'forage');
          await page.keyboard.press('Escape');
          await sleep(900);
          await clickText(page, 'Back to the trail', { timeout: 6000, optional: true });
          continue;
        }
      }

      if (turn % 7 === 3 && await clickText(page, 'Talk to people', { timeout: 700, optional: true })) {
        await sleep(200);
        await clickText(page, 'Back', { optional: true });
        continue;
      }

      await clickText(page, 'Continue on the trail', { timeout: 3000 });
      continue;
    }

    if (screen === 'trail') {
      // Occasionally poke the info screens to prove they render mid-run.
      if (turn === 6) { await page.keyboard.press('m'); await sleep(500); await shot(page, 'map'); await page.keyboard.press('Escape'); }
      if (turn === 9) { await page.keyboard.press('i'); await sleep(400); await shot(page, 'pack'); await page.keyboard.press('Escape'); }
      if (turn === 12) { await page.keyboard.press('c'); await sleep(400); await shot(page, 'party'); await page.keyboard.press('Escape'); }
      if (turn === 15) { await page.keyboard.press('r'); await sleep(400); await shot(page, 'camp'); await page.keyboard.press('Escape'); }
      await page.keyboard.press(' ');            // travel
      await sleep(QUICK ? 700 : 1500);
      continue;
    }

    if (screen === 'end') break;

    // Any other screen: back out and keep going.
    await page.keyboard.press('Escape');
    await sleep(250);
  }

  log('reach the end screen');
  const finalState = await gameState(page);
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
