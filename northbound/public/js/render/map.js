// NORTHBOUND — the trail map.
//
// Not a chart: a map. The route is drawn as the real elevation profile of the PCT
// from `data/trail.js`, running left (Mexico) to right (Canada), with the ground
// filled beneath it, landmark pins standing on the ridge, state bands along the
// bottom, and the snow line hanging off the northern edge like a curtain.
//
//   drawMap(ctx, g, { width, height, selected })
//   hitTestLandmark(x, y) -> landmark id | null   (uses the last drawn layout)

import { LANDMARKS, TOTAL_MILES, elevAtMile } from '../../../data/trail.js';

const C = {
  bg: '#0b0813',
  bgBand: '#120e1d',
  ink: '#f4ecdd',
  dim: '#a99e8c',
  faint: '#6f6656',
  edge: '#4b3f66',
  gold: '#f2c98a',
  goldDim: '#c39d63',
  rust: '#d1785c',
  sage: '#8fd0a4',
  ice: '#bfe3ff',
  violet: '#6b5a94',
};

// Biome tints for the ground fill, so the profile reads as country and not as data.
const BIOME_FILL = {
  desert: '#3a2b3f', chaparral: '#33303c', sierra: '#2c3350', alpine: '#39425f',
  forest: '#22322f', volcanic: '#332a35', rainforest: '#1d2f32',
};

const MAX_ELEV = 13500;

// Layout of the last frame, for hit testing.
let pins = [];
let lastLayout = null;

export function drawMap(ctx, g, opts = {}) {
  const W = opts.width || ctx.canvas.width;
  const H = opts.height || ctx.canvas.height;
  const selected = opts.selected || null;

  const padL = 26, padR = 26, padT = 26, padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  const xOf = (mile) => padL + (mile / TOTAL_MILES) * plotW;
  const yOf = (elev) => baseY - Math.max(0, Math.min(1, elev / MAX_ELEV)) * plotH;

  lastLayout = { W, H, padL, padR, padT, padB, plotW, plotH, baseY, xOf, yOf };
  pins = [];

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'alphabetic';

  // ---- ground -------------------------------------------------------------
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Faint elevation rules, labelled in thousands of feet.
  ctx.font = '9px ui-monospace, monospace';
  for (let ft = 2000; ft <= 12000; ft += 2000) {
    const y = Math.round(yOf(ft)) + 0.5;
    ctx.strokeStyle = 'rgba(75,63,102,0.35)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = C.faint;
    ctx.textAlign = 'right';
    ctx.fillText(String(ft / 1000) + 'k', padL - 5, y + 3);
  }

  // ---- the profile, filled per biome segment ------------------------------
  // Sample once, then paint the fill in runs of constant biome so the colour
  // changes where the country does.
  const STEP = 4;                                     // px between samples
  const samples = [];
  for (let px = 0; px <= plotW; px += STEP) {
    const mile = (px / plotW) * TOTAL_MILES;
    samples.push({ px, mile, elev: elevAtMile(mile), biome: biomeOf(mile) });
  }
  if (samples[samples.length - 1].px !== plotW) {
    const mile = TOTAL_MILES;
    samples.push({ px: plotW, mile, elev: elevAtMile(mile), biome: biomeOf(mile) });
  }

  let runStart = 0;
  for (let i = 1; i <= samples.length; i++) {
    const endOfRun = i === samples.length || samples[i].biome !== samples[runStart].biome;
    if (!endOfRun) continue;
    const run = samples.slice(runStart, Math.min(i + 1, samples.length));
    if (run.length > 1) {
      ctx.beginPath();
      ctx.moveTo(padL + run[0].px, baseY);
      for (const s of run) ctx.lineTo(padL + s.px, yOf(s.elev));
      ctx.lineTo(padL + run[run.length - 1].px, baseY);
      ctx.closePath();
      ctx.fillStyle = BIOME_FILL[samples[runStart].biome] || BIOME_FILL.forest;
      ctx.fill();
    }
    runStart = i;
  }

  // Dither the fill so it reads as hatched country rather than flat paint.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = 0; x < plotW; x += 2) {
    for (let y = 0; y < plotH; y += 2) {
      if (((x >> 1) + (y >> 1)) % 2) continue;
      const s = samples[Math.min(samples.length - 1, Math.round(x / STEP))];
      if (padT + y < yOf(s.elev)) continue;
      ctx.fillRect(padL + x, padT + y, 1, 1);
    }
  }

  // ---- the route line: walked in gold, ahead in dim -----------------------
  const walkedPx = Math.max(0, Math.min(plotW, (g.mile / TOTAL_MILES) * plotW));
  strokeProfile(ctx, samples, padL, yOf, 0, walkedPx, C.gold, 2);
  strokeProfile(ctx, samples, padL, yOf, walkedPx, plotW, C.edge, 1);

  // ---- state bands --------------------------------------------------------
  const STATES = [
    { label: 'CALIFORNIA', from: 0, to: 1690 },
    { label: 'OREGON', from: 1690, to: 2145 },
    { label: 'WASHINGTON', from: 2145, to: TOTAL_MILES },
  ];
  ctx.textAlign = 'center';
  for (const st of STATES) {
    const x0 = xOf(st.from), x1 = xOf(st.to);
    ctx.fillStyle = 'rgba(37,29,54,0.72)';
    ctx.fillRect(x0, baseY + 8, x1 - x0 - 1, 13);
    ctx.fillStyle = C.faint;
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(st.label, (x0 + x1) / 2, baseY + 17);
    ctx.strokeStyle = C.edge;
    ctx.beginPath();
    ctx.moveTo(Math.round(x0) + 0.5, padT); ctx.lineTo(Math.round(x0) + 0.5, baseY + 8);
    ctx.stroke();
  }

  // ---- the snow line, hanging from the north ------------------------------
  const snowX = xOf(Math.max(0, Math.min(TOTAL_MILES, g.snowMile)));
  const grad = ctx.createLinearGradient(snowX, 0, W, 0);
  grad.addColorStop(0, 'rgba(191,227,255,0.20)');
  grad.addColorStop(1, 'rgba(191,227,255,0.04)');
  ctx.fillStyle = grad;
  ctx.fillRect(snowX, padT - 10, W - snowX - padR + 10, plotH + 10);
  ctx.strokeStyle = C.ice;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(snowX) + 0.5, padT - 10);
  ctx.lineTo(Math.round(snowX) + 0.5, baseY);
  ctx.stroke();
  // A row of flakes along the curtain edge.
  ctx.fillStyle = C.ice;
  for (let y = padT - 6; y < baseY; y += 11) {
    const jitter = ((y * 7) % 5) - 2;
    ctx.fillRect(Math.round(snowX + 3 + jitter), y, 1, 1);
    ctx.fillRect(Math.round(snowX + 7 + jitter), y + 5, 1, 1);
  }
  ctx.fillStyle = C.ice;
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = snowX > W - 90 ? 'right' : 'left';
  ctx.fillText('SNOW', snowX + (snowX > W - 90 ? -4 : 4), padT - 12);

  // ---- landmark pins ------------------------------------------------------
  for (const lm of LANDMARKS) {
    const x = Math.round(xOf(lm.mile));
    const y = Math.round(yOf(lm.elev));
    const behind = lm.mile <= g.mile;
    const isSel = selected === lm.id;
    pins.push({ id: lm.id, x, y, r: 7 });

    ctx.strokeStyle = behind ? 'rgba(242,201,138,0.5)' : 'rgba(75,63,102,0.7)';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y - 7);
    ctx.stroke();

    drawPin(ctx, lm, x, y - 7, behind, isSel);

    // Only label the big ones, plus whatever is hovered, or the map turns to soup.
    const major = lm.kind === 'terminus' || lm.kind === 'pass'
      || (lm.store && lm.store.mult <= 1.1) || lm.mile === 1325;
    if (major || isSel) {
      ctx.font = isSel ? 'bold 9px ui-monospace, monospace' : '8px ui-monospace, monospace';
      ctx.fillStyle = isSel ? C.gold : (behind ? C.dim : C.faint);
      ctx.textAlign = x > W - 110 ? 'right' : x < 90 ? 'left' : 'center';
      const label = shorten(lm.name, isSel ? 40 : 16);
      ctx.fillText(label, x, y - 12);
    }
  }

  // ---- you are here -------------------------------------------------------
  const youX = Math.round(xOf(g.mile));
  const youY = Math.round(yOf(elevAtMile(g.mile)));
  ctx.fillStyle = 'rgba(242,201,138,0.22)';
  ctx.beginPath(); ctx.arc(youX, youY, 9, 0, Math.PI * 2); ctx.fill();
  // A three-pixel person, because a dot is not a crew.
  ctx.fillStyle = C.gold;
  ctx.fillRect(youX - 1, youY - 8, 2, 2);
  ctx.fillRect(youX - 1, youY - 5, 2, 3);
  ctx.fillRect(youX - 2, youY - 2, 1, 2);
  ctx.fillRect(youX + 1, youY - 2, 1, 2);

  ctx.fillStyle = C.gold;
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = youX > W - 80 ? 'right' : 'left';
  ctx.fillText(Math.round(g.mile) + ' mi', youX + (youX > W - 80 ? -6 : 6), youY - 10);

  // ---- legend -------------------------------------------------------------
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'left';
  const legend = [
    [C.gold, 'you'],
    [C.ice, 'snow line'],
    [C.sage, 'resupply'],
    [C.violet, 'river'],
  ];
  let lx = padL;
  for (const [colour, label] of legend) {
    ctx.fillStyle = colour;
    ctx.fillRect(lx, H - 12, 5, 5);
    ctx.fillStyle = C.faint;
    ctx.fillText(label, lx + 8, H - 7);
    lx += 18 + label.length * 5;
  }

  ctx.restore();
}

/** Which landmark pin is under this canvas-space point, if any. */
export function hitTestLandmark(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const p of pins) {
    const dx = x - p.x;
    const dy = y - (p.y - 7);
    const d = dx * dx + dy * dy;
    if (d < p.r * p.r * 2.2 && d < bestD) { bestD = d; best = p.id; }
  }
  // Fall back to nearest-by-x so hovering anywhere near a pin's column works too.
  if (!best && lastLayout && y > lastLayout.padT && y < lastLayout.baseY) {
    for (const p of pins) {
      const dx = Math.abs(x - p.x);
      if (dx < 5 && dx < bestD) { bestD = dx; best = p.id; }
    }
  }
  return best;
}

/** The layout of the last drawn map — used by tests and by anything that wants to overlay. */
export function mapLayout() { return lastLayout; }

// --------------------------------------------------------------------------

function strokeProfile(ctx, samples, padL, yOf, fromPx, toPx, colour, width) {
  if (toPx <= fromPx) return;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (const s of samples) {
    if (s.px < fromPx - 4 || s.px > toPx + 4) continue;
    const x = padL + Math.max(fromPx, Math.min(toPx, s.px));
    const y = yOf(s.elev);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  if (started) ctx.stroke();
  ctx.restore();
}

function drawPin(ctx, lm, x, y, behind, isSel) {
  const colour = isSel ? C.gold
    : lm.ford ? C.violet
    : lm.store ? C.sage
    : lm.kind === 'terminus' ? C.gold
    : lm.kind === 'pass' ? C.ice
    : behind ? C.goldDim : C.faint;

  ctx.fillStyle = colour;
  if (lm.kind === 'terminus') {
    // A monument: a little obelisk.
    ctx.fillRect(x - 2, y - 5, 4, 6);
    ctx.fillRect(x - 3, y + 1, 6, 2);
  } else if (lm.kind === 'pass') {
    // A notch between two peaks.
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 3); ctx.lineTo(x - 1, y - 3); ctx.lineTo(x + 2, y + 1);
    ctx.lineTo(x + 4, y - 2); ctx.lineTo(x + 5, y + 3);
    ctx.closePath(); ctx.fill();
  } else if (lm.ford) {
    // Three ripples.
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 3 + (i % 2), y - 2 + i * 2, 6, 1);
  } else if (lm.store) {
    // A roof over a box.
    ctx.fillRect(x - 3, y - 1, 6, 4);
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 1); ctx.lineTo(x, y - 5); ctx.lineTo(x + 4, y - 1);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  if (isSel) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 6.5, y - 7.5, 13, 13);
  }
}

function biomeOf(mile) {
  let b = LANDMARKS[0].biome;
  for (const l of LANDMARKS) { if (l.mile <= mile) b = l.biome; else break; }
  return b;
}

function shorten(name, max) {
  const clean = String(name).replace(/ \/ .*$/, '');
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
}
