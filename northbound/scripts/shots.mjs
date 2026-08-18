// NORTHBOUND — visual QA.
//
// Renders the scene across a matrix of biomes, times of day and weather, plus the
// sprite atlas contact sheet, upscaled so the results can actually be judged by eye.
//
//   node scripts/shots.mjs [outDir]

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = process.argv[2] || join(ROOT, 'docs', 'visual');
const PORT = process.env.PORT || (3900 + (process.pid % 90));
const BASE = `http://localhost:${PORT}`;
const SCALE = 3;

const BIOMES = ['desert', 'chaparral', 'sierra', 'alpine', 'forest', 'volcanic', 'rainforest'];
const PHASES = [['dawn', 0.08], ['noon', 0.5], ['dusk', 0.82], ['night', 0.97]];
const WEATHER = ['clear', 'rain', 'storm', 'snow', 'smoke'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const server = spawn(process.execPath, [join(ROOT, 'server.js')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 320 * SCALE, height: 180 * SCALE } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE + '/dev/scene.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SCENE_READY === true, null, { timeout: 20000 });

  let n = 0;
  for (const biome of BIOMES) {
    for (const [phaseName, dayPhase] of PHASES) {
      const weather = WEATHER[n % WEATHER.length];
      await page.evaluate(([b, dp, w]) => window.setScene({ biome: b, dayPhase: dp, weather: w }), [biome, dayPhase, weather]);
      await sleep(1100);
      await page.screenshot({ path: join(OUT, `scene-${biome}-${phaseName}-${weather}.png`) });
      n++;
    }
  }

  for (const w of ['clear', 'hot', 'rain', 'storm', 'hail', 'snow', 'smoke', 'fog', 'wind']) {
    await page.evaluate((ww) => window.setScene({ biome: 'sierra', dayPhase: 0.45, weather: ww }), w);
    await sleep(1100);
    await page.screenshot({ path: join(OUT, `weather-${w}.png`) });
  }

  await page.setViewportSize({ width: 1180, height: 1200 });
  await page.goto(BASE + '/dev/atlas.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SHEET_READY === true, null, { timeout: 20000 });
  await sleep(400);
  await page.screenshot({ path: join(OUT, 'atlas-contact-sheet.png'), fullPage: true });

  await browser.close();
  server.kill();

  const files = (await fs.readdir(OUT)).filter((f) => f.endsWith('.png'));
  console.log(`wrote ${files.length} images to ${OUT}`);
  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const e of errors.slice(0, 10)) console.log('  · ' + e);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
