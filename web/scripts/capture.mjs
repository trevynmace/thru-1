// Capture polished screenshots of every screen for the README.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const PORT = 3912;
const OUT = 'docs/screenshots';
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

// 1) Menu
await wait(900); await shot('menu');

// 2) Character creation — fill it out nicely
await page.click('[data-action="new-game"]');
await page.waitForSelector('#screen-create.active'); await wait(300);
await page.fill('#inp-name', 'Juniper');
await page.click('.swatches-row[data-kind="skin"] .sw:nth-child(3)');
await page.click('.swatches-row[data-kind="shirt"] .sw:nth-child(1)');
await page.click('.swatches-row[data-kind="pack"] .sw:nth-child(2)');
await wait(200); await shot('create');

// Start hiking
await page.click('[data-action="start-hike"]');
await page.waitForSelector('#screen-hike.active'); await wait(500);

let gotEncounter = false, gotEncounterResult = false, gotTown = false, gotHud = false;
for (let i = 0; i < 200; i++) {
  if (await page.isVisible('#modal-encounter.open')) {
    if (!gotEncounter) { await wait(250); await shot('encounter'); gotEncounter = true; }
    const opt = page.locator('#enc-options .enc-option');
    if (await opt.first().isVisible()) { await opt.first().click({ force: true }); }
    await wait(300);
    if (!gotEncounterResult && await page.isVisible('#enc-result')) { await shot('encounter-result'); gotEncounterResult = true; }
    const cont = page.locator('#enc-continue');
    if (await cont.isVisible()) await cont.click({ force: true });
    continue;
  }
  if (await page.isVisible('#modal-town.open')) {
    if (!gotTown) { await wait(250); await shot('town'); gotTown = true; }
    await page.click('[data-action="leave-town"]', { force: true });
    continue;
  }
  if (await page.isVisible('#modal-end.open')) break;

  // grab a clean HUD shot a few days in (after some progress, before any modal)
  if (!gotHud && i >= 4) { await shot('hike'); gotHud = true; }

  if (await page.isVisible('[data-action="hike"]')) {
    await page.click('[data-action="hike"]', { force: true });
    await wait(700);
  }
  // Once we have encounter + town + hud, grab map & pack then keep going to the end.
  if (gotEncounter && gotTown && gotHud && i % 25 === 24) {
    await page.click('[data-action="open-map"]'); await wait(300); await shot('map'); await page.click('[data-action="close-map"]'); await wait(150);
    await page.click('[data-action="open-pack"]'); await wait(300); await shot('pack'); await page.click('[data-action="close-pack"]'); await wait(150);
  }
}

// Ensure map & pack captured even if loop ended early
if (await page.isVisible('#modal-end.open')) { await wait(300); await shot('end'); }

console.log({ gotEncounter, gotEncounterResult, gotTown, gotHud });
await browser.close(); srv.kill();
