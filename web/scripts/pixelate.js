// Offline texture pixelizer. Addresses the design note: take real photographic
// textures/backgrounds and bake permanent pixel-art versions (NOT at runtime).
//
// Pipeline: downscale to a tiny grid (nearest), optionally quantize to a limited
// palette (Sword & Sworcery vibe), then upscale back with nearest-neighbour so the
// committed asset is crisp pixel art. Run once; commit the output to public/assets.
//
//   npm run pixelate -- --in raw/forest.jpg --out public/assets/forest.png --size 256 --colors 16
//
// Requires the optional `sharp` devDependency. If sharp isn't installed this prints
// guidance instead of failing the build.
import { promises as fs } from 'fs';
import path from 'path';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// A muted limited palette to map textures toward the game's look (extend freely).
const PALETTE = [
  [59,43,84],[201,111,90],[255,217,160],[122,74,99],[154,85,96],[181,97,92],[202,160,106],[240,201,135],
  [22,50,58],[63,126,110],[31,59,62],[44,87,80],[58,113,99],[38,74,58],
  [42,47,85],[111,134,184],[57,64,107],[74,86,133],[107,122,163],[86,96,137],
  [13,10,22],[243,236,223],[183,173,154],[74,63,99],
];

function nearestColor(r, g, b) {
  let best = PALETTE[0], bd = Infinity;
  for (const c of PALETTE) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

async function main() {
  const input = arg('in');
  const output = arg('out');
  const size = parseInt(arg('size', '256'), 10);
  const quantize = process.argv.includes('--quantize') || arg('colors');

  if (!input || !output) {
    console.log('Usage: npm run pixelate -- --in <file> --out <file.png> [--size 256] [--quantize]');
    process.exit(input ? 1 : 0);
  }

  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch {
    console.log('`sharp` is not installed. Run `npm i -D sharp`, then re-run this script.');
    process.exit(1);
  }

  const meta = await sharp(input).metadata();
  const smallW = size;
  const smallH = Math.max(1, Math.round((meta.height / meta.width) * size));

  // 1) downscale to the pixel grid
  let img = sharp(input).resize(smallW, smallH, { kernel: 'nearest' });

  // 2) optional palette quantize
  if (quantize) {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    for (let i = 0; i < data.length; i += ch) {
      const c = nearestColor(data[i], data[i + 1], data[i + 2]);
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    }
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: ch } });
  }

  // 3) upscale back with nearest so the committed asset stays crisp
  await fs.mkdir(path.dirname(output), { recursive: true });
  await img.resize(smallW * 4, smallH * 4, { kernel: 'nearest' }).png().toFile(output);
  console.log(`Pixelated ${input} -> ${output} (${smallW}x${smallH} grid${quantize ? ', palette-mapped' : ''})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
