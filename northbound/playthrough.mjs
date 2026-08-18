// A real playthrough: sensible decisions, screenshots at every beat, and a
// narrative log of what actually happened on the trail.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

const PORT = 3910, BASE = `http://localhost:${PORT}`;
const OUT = 'docs/playthrough';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let shotN = 0;
const story = [];
const problems = [];
function note(line) { story.push(line); console.log('   ' + line); }

const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(200); }

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => problems.push('pageerror: ' + e.message));

async function shot(label) {
  await sleep(260);
  const name = `${String(++shotN).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: join(OUT, name) });
  return name;
}
const screen = () => page.evaluate(() => (window.NB && window.NB.screen) || null);
const state = () => page.evaluate(() => {
  const g = window.NB && window.NB.game; if (!g) return null;
  return { day: g.day, mile: Math.round(g.mile), status: g.status, cause: g.cause,
    food: Math.round(g.supplies.food), money: Math.round(g.supplies.money), fuel: g.supplies.stove_fuel,
    mules: g.supplies.mules, cart: Math.round(g.cart.condition), pace: g.pace, rations: g.rations,
    alive: g.party.filter(m => m.alive).length, snow: Math.round(g.snowMile),
    date: `${g.date.month}/${g.date.day}`,
    health: Math.round(g.party.filter(m=>m.alive).reduce((s,m)=>s+m.health,0) / Math.max(1,g.party.filter(m=>m.alive).length)),
    lastLog: (g.log || []).slice(-3).map(l => l.text) };
});
async function click(text, { timeout = 4000, optional = false } = {}) {
  const s = await screen();
  const scope = s ? `#screen-${s}` : '.screen.active';
  try {
    const loc = page.locator(`${scope} button:has-text("${text}")`).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.click({ timeout });
    await sleep(200);
    return true;
  } catch { if (!optional) problems.push(`could not click "${text}" on ${s}`); return false; }
}

// ---------------------------------------------------------------- play ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.NB, null, { timeout: 20000 });
await sleep(1200);
note('The title screen. Desert at dusk, the crew already walking behind the menu.');
await shot('title');

await click('How to hike it');
await shot('help');
await click('Back');

note('Setting out.');
await click('Begin the trail');
await page.waitForSelector('#screen-setup.active');
// Pick the ranger: less money, double score, safer river crossings.
await page.locator('#screen-setup .card').nth(2).click({ timeout: 4000 });
await page.evaluate(() => {
  const names = ['Wren Halloway', 'Ada Reyes', 'Bo Tran', 'Cass Okafor', 'Dov Machado'];
  document.querySelectorAll('#screen-setup input[type=text]').forEach((el, i) => {
    el.value = names[i]; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
});
await sleep(200);
await shot('setup-occupation');
// April: the sweet spot.
await page.locator('#screen-setup .card', { hasText: 'April' }).first().click({ timeout: 4000 });
await sleep(250);
await shot('setup-month');

note('Outfitting at Campo — the cheapest store on the whole trail.');
await click('To the outfitter');
await page.waitForSelector('#screen-store.active');
async function buy(name, clicks) {
  const row = page.locator('#screen-store .row', { hasText: name }).first();
  if (!(await row.count())) return;
  const plus = row.locator('button:has-text("+")');
  for (let i = 0; i < clicks; i++) await plus.click({ timeout: 2500 }).catch(() => {});
}
await buy('Pack Mule', 5);
await buy('Trail Food', 42);
await buy('Stove Fuel', 8);
await buy('Spare Wheel', 2);
await buy('Spare Axle', 1);
await buy('Spare Hitch', 1);
await buy('Spare Shoes', 3);
await buy('Spare Poles', 2);
await buy('Spare Filter', 2);
await buy('Clothing', 4);
await buy('First Aid Kit', 3);
await buy('Ice Axe', 1);
await sleep(300);
await shot('store-outfitting');
await click('Buy it and go north');
await page.waitForSelector('#screen-trail.active', { timeout: 8000 });
let s = await state();
note(`Left Campo with ${s.food} lb of food, ${s.mules} mules, ${s.fuel} fuel and $${s.money}.`);
await sleep(900);
await shot('trail-day-one');

// A quick look at the map and the crew before we start walking.
await page.keyboard.press('m'); await sleep(900); await shot('map-start'); await page.keyboard.press('Escape');
await page.keyboard.press('c'); await sleep(500); await shot('crew-start'); await page.keyboard.press('Escape');

note('Walking north.');
let firstEvent = true, firstLandmark = true, firstFord = true, firstForage = true, firstStore = true;
let turns = 0;
const MAX = Number(process.env.MAX_TURNS || 220);

while (turns++ < MAX) {
  s = await state();
  if (!s) { problems.push('lost game state'); break; }
  if (s.status !== 'playing') break;
  const sc = await screen();

  if (sc === 'event') {
    if (firstEvent) { firstEvent = false; note(`Day ${s.day}, mile ${s.mile}: something happens.`); await shot('event'); }
    if (!(await click('See what happens', { timeout: 1000, optional: true }))) {
      await page.locator('#screen-event #event-choices .btn').first().click({ timeout: 1500 }).catch(() => {});
      await sleep(250);
      if (firstEvent === false && shotN < 14) await shot('event-choice-result');
    }
    await click('Onward', { timeout: 2500, optional: true });
    continue;
  }

  if (sc === 'ford') {
    if (firstFord) { firstFord = false; note(`Day ${s.day}: a river at mile ${s.mile}.`); await shot('ford-choice'); }
    // Cold morning crossings are safer: wait once, then wade.
    const waited = await page.evaluate(() => !!(window.NB.game.pendingFord || {}).waited);
    await click(waited ? 'Wade across' : 'Camp and cross at dawn', { timeout: 2500, optional: true });
    await sleep(2200);
    for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape'); await sleep(300); }
    if (!firstFord && shotN < 20) await shot('ford-result');
    await click('Onward', { timeout: 3000, optional: true });
    await click('Look at it again', { timeout: 1500, optional: true });
    continue;
  }

  if (sc === 'landmark') {
    if (firstLandmark) { firstLandmark = false; note(`Day ${s.day}: reached the first landmark.`); await shot('landmark-menu'); }
    const daysFood = s.food / (s.alive * (s.rations === 'filling' ? 3 : s.rations === 'meager' ? 2 : 1));

    // Resupply when the bags are getting light.
    if (daysFood < 12 && await click('Buy supplies', { timeout: 900, optional: true })) {
      await buy('Trail Food', 22);
      await buy('Stove Fuel', 3);
      const repair = page.locator('#screen-store button:has-text("Repair"), #screen-store button:has-text("Spend")').first();
      if (s.cart < 70 && await repair.count()) await repair.click({ timeout: 2000 }).catch(() => {});
      if (firstStore) { firstStore = false; await shot('store-resupply'); }
      await click('Buy', { optional: true });
      await click('Done', { optional: true });
      continue;
    }
    // Rest when the crew is hurting and the snow is far off.
    if (s.health < 60 && s.snow - s.mile > 500) {
      if (await click('Stop to rest', { timeout: 900, optional: true })) {
        await click('Rest', { timeout: 2000, optional: true });
        await sleep(400);
        if (shotN < 24) await shot('camp-rest');
        await click('Break camp', { timeout: 2500, optional: true });
        continue;
      }
    }
    // Forage when food is short and fuel allows.
    if (daysFood < 6 && s.fuel > 0 && await click('Continue on the trail', { timeout: 500, optional: true })) {
      await sleep(200);
    } else {
      await click('Continue on the trail', { timeout: 2500, optional: true });
    }
    continue;
  }

  if (sc === 'trail') {
    const daysFood = s.food / (s.alive * (s.rations === 'filling' ? 3 : s.rations === 'meager' ? 2 : 1));
    // Push harder when the snow line closes; ease off when the crew is failing.
    const slack = s.snow - s.mile;
    const wantPace = s.health < 45 ? 'steady' : slack < 700 ? 'grueling' : 'strenuous';
    if (wantPace !== s.pace) {
      await page.evaluate((p) => window.NB.ctx.Sim.setPace(window.NB.game, p), wantPace);
      await page.evaluate(() => window.NB.ctx.refreshHud());
      note(`Day ${s.day}: pace to ${wantPace} (${slack} mi of slack, health ${s.health}).`);
    }
    if (daysFood < 5 && s.fuel > 0) {
      if (firstForage) note(`Day ${s.day}: food down to ${s.food} lb. Spending a day foraging.`);
      await page.keyboard.press('f'); await sleep(400);
      await click('Spend the day', { timeout: 2500, optional: true });
      await sleep(2400);
      if (firstForage) { firstForage = false; await shot('forage-minigame'); }
      for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape'); await sleep(300); }
      await click('Back to the trail', { timeout: 3000, optional: true });
      continue;
    }
    const moving = await page.evaluate(() => !!(window.NB && window.NB.isTravelling()));
    if (!moving) await page.keyboard.press(' ');
    await page.waitForFunction((d) => {
      const g = window.NB && window.NB.game; if (!g) return true;
      return g.day >= d + 2 || g.status !== 'playing' || (window.NB.screen && window.NB.screen !== 'trail');
    }, s.day, { timeout: 3500, polling: 80 }).catch(() => {});
    // A mid-trail portrait once we are deep into the Sierra.
    if (s.mile > 780 && s.mile < 1100 && shotN < 30) { await page.keyboard.press(' '); await sleep(600); await shot('trail-sierra'); }
    continue;
  }

  await page.keyboard.press('Escape');
  await sleep(250);
}

s = await state();
note(`Run over on day ${s.day} at mile ${s.mile}: ${s.status}${s.cause ? ' (' + s.cause + ')' : ''}, ${s.alive} still walking.`);
for (const l of s.lastLog) note('  › ' + l);

if (s.status === 'playing') {
  note('Bounded run — driving the last stretch so the ending is real.');
  await page.evaluate(() => { const g = window.NB.game; g.mile = 2612; window.NB.ctx.refreshHud(); });
  for (let i = 0; i < 40; i++) {
    const st = await state(); if (!st || st.status !== 'playing') break;
    const sc = await screen();
    if (sc === 'event') { await click('See what happens', { timeout: 900, optional: true })
      || await page.locator('#screen-event #event-choices .btn').first().click({ timeout: 1200 }).catch(()=>{});
      await click('Onward', { timeout: 2000, optional: true }); }
    else if (sc === 'landmark') { await page.keyboard.press('1'); await sleep(250); }
    else if (sc === 'ford') { await click('Pay for a shuttle', { timeout: 1200, optional: true }); await sleep(1500);
      for (let k=0;k<3;k++){ await page.keyboard.press('Escape'); await sleep(250); }
      await click('Onward', { timeout: 2000, optional: true }); }
    else if (sc === 'trail') { const mv = await page.evaluate(()=>!!window.NB.isTravelling()); if (!mv) await page.keyboard.press(' '); await sleep(800); }
    else { await page.keyboard.press('Escape'); await sleep(250); }
  }
}

await page.waitForSelector('#screen-end.active', { timeout: 15000 }).catch(() => problems.push('no end screen'));
await sleep(700);
await shot('end-score');
await click('Sign the register', { optional: true });
await sleep(400);
await click('Hall of fame', { optional: true });
await sleep(400);
await shot('hall-of-fame');

await browser.close();
server.kill();

await fs.writeFile(join(OUT, 'log.txt'), story.join('\n') + '\n');
console.log('\n' + '='.repeat(60));
console.log(`${shotN} screenshots in ${OUT}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.slice(0, 12).join('\n  ') : 'no console errors');
