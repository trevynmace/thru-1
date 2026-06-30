// Headless browser smoke test: load the game, create a hiker, hike many days,
// click through any encounters/towns, and assert no console/page errors.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const PORT = 3899;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.click('[data-action="new-game"]');
  await page.waitForSelector('#screen-create.active');
  await page.fill('#inp-name', 'Smokey');
  await page.click('[data-action="start-hike"]');
  await page.waitForSelector('#screen-hike.active');

  let hikes = 0, encounters = 0, towns = 0;
  for (let i = 0; i < 120; i++) {
    // resolve any open encounter
    if (await page.isVisible('#modal-encounter.open')) {
      const opt = page.locator('#enc-options .enc-option').first();
      if (await opt.isVisible()) { await opt.click({ force: true }); encounters++; }
      const cont = page.locator('#enc-continue');
      if (await cont.isVisible()) await cont.click({ force: true });
      continue;
    }
    // leave any town
    if (await page.isVisible('#modal-town.open')) { await page.click('[data-action="leave-town"]', { force: true }); towns++; continue; }
    // end screen?
    if (await page.isVisible('#modal-end.open')) break;
    // otherwise hike
    if (await page.isVisible('[data-action="hike"]')) { await page.click('[data-action="hike"]', { force: true }); hikes++; await page.waitForTimeout(750); }
  }

  const ended = await page.isVisible('#modal-end.open');
  const endTitle = ended ? await page.textContent('#end-title') : '(did not end within 120 turns)';
  const mile = await page.textContent('#hud-mile');

  console.log(`hikes=${hikes} encounters=${encounters} towns=${towns}`);
  console.log(`final: ${mile} · ended=${ended} · "${endTitle?.trim()}"`);
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('NO CONSOLE/PAGE ERRORS ✓');
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  if (errors.length) console.log(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  srv.kill();
}
