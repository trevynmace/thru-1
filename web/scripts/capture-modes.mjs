// Capture screenshots of the new game-mode screens for the README.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const PORT = 3915;
const OUT = 'docs/screenshots';
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

// 1) Mode-select screen, with a mode expanded to show its blurb.
await page.click('[data-action="choose-mode"]');
await page.waitForSelector('#screen-modes.active');
await page.click('.mode-card[data-mode="deck"]');
await wait(400);
await shot('modes');

// 2) Trailcraft deckbuilder screen with a hand dealt.
await page.click('button[data-action="begin-mode"][data-mode="deck"]');
await page.waitForSelector('#screen-create.active');
await page.fill('#inp-name', 'Patches');
await page.click('[data-action="start-hike"]');
await page.waitForSelector('#screen-deck.active');
await wait(700);
await shot('deck');

console.log('captured modes.png + deck.png');
await browser.close();
srv.kill();
