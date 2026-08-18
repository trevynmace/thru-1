// NORTHBOUND — sprite-backed icons for the HTML UI.
// The atlas is a canvas asset, so anything that wants a sprite inside a DOM panel
// gets a tiny <canvas> with the frame blitted into it at an integer scale.
import { frame, draw } from '../../render/atlas.js';

/** A canvas element showing one atlas frame, scaled to fit `size` px. */
export function sprite(name, size = 32, { cls = '', title = '' } = {}) {
  const f = frame(name);
  const w = (f && f.w) || 16;
  const h = (f && f.h) || 16;
  const scale = Math.max(1, Math.floor(size / Math.max(w, h)));

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  canvas.className = cls;
  canvas.style.imageRendering = 'pixelated';
  if (title) canvas.title = title;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  try {
    ctx.save();
    ctx.scale(scale, scale);
    draw(ctx, name, 0, 0);
    ctx.restore();
  } catch {
    // A missing frame should never break a panel; leave the canvas transparent.
  }
  return canvas;
}

/** The 32px item icon used in the store, pack and trade lists. */
export function itemIcon(itemId, size = 32) {
  const canvas = sprite('item_' + itemId, size, { cls: 'item-icon' });
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  return canvas;
}

/** A party member's walking sprite, recoloured to their portrait. */
export function memberSprite(member, size = 48, frameName = 'hiker_idle_0') {
  const canvas = document.createElement('canvas');
  const f = frame(frameName) || { w: 16, h: 24 };
  const scale = Math.max(1, Math.floor(size / f.h));
  canvas.width = f.w * scale;
  canvas.height = f.h * scale;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  if (!member.alive) canvas.style.filter = 'grayscale(1) brightness(0.55)';

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  try {
    ctx.save();
    ctx.scale(scale, scale);
    // `tint` is a single hex; a per-slot portrait map goes through `recolor`.
    draw(ctx, member.alive ? frameName : 'hiker_dead_0', 0, 0,
      member.alive ? { recolor: member.portrait } : undefined);
    ctx.restore();
  } catch {}
  return canvas;
}
