// Capture the remaining screens: map, pack, and the end screen.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
const PORT = 3913, OUT = 'docs/screenshots';
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const clearModals = async () => {
  for (const a of ['enc-continue', 'leave-town']) {
    if (a === 'enc-continue' && await page.isVisible('#modal-encounter.open')) {
      const o = page.locator('#enc-options .enc-option').first();
      if (await o.isVisible()) await o.click({ force: true }); await wait(200);
      if (await page.isVisible('#enc-continue')) await page.click('#enc-continue', { force: true });
    }
    if (a === 'leave-town' && await page.isVisible('#modal-town.open')) await page.click('[data-action="leave-town"]', { force: true });
  }
};

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.click('[data-action="new-game"]');
await page.waitForSelector('#screen-create.active');
await page.fill('#inp-name', 'Juniper');
await page.click('[data-action="start-hike"]');
await page.waitForSelector('#screen-hike.active'); await wait(400);

// hike ~12 days, clearing modals, to build some progress + tramily/gear for richer panels
for (let i = 0; i < 14; i++) {
  await clearModals();
  if (await page.isVisible('[data-action="hike"]')) { await page.click('[data-action="hike"]', { force: true }); await wait(650); }
  await clearModals();
}
// MAP
await clearModals();
await page.click('[data-action="open-map"]'); await wait(400); await shot('map'); await page.click('[data-action="close-map"]'); await wait(200);
// PACK
await page.click('[data-action="open-pack"]'); await wait(400); await shot('pack'); await page.click('[data-action="close-pack"]'); await wait(200);

// Drive to an END screen.
for (let i = 0; i < 400; i++) {
  if (await page.isVisible('#modal-end.open')) break;
  await clearModals();
  if (await page.isVisible('[data-action="hike"]')) { await page.click('[data-action="hike"]', { force: true }); await wait(180); }
}
if (await page.isVisible('#modal-end.open')) { await wait(400); await shot('end'); }
console.log('done:', { ended: await page.isVisible('#modal-end.open') });
await browser.close(); srv.kill();
