// NORTHBOUND — the three "look at what you have" screens: map, pack, crew.
import { el, panel, button, mountTo, kv, meter, fmtMoney, fmtNum, segmented } from '../dom.js';
import { Audio } from '../../audio/audio.js';
import { LANDMARKS, TOTAL_MILES, elevAtMile } from '../../../../data/trail.js';
import { ITEMS, ITEMS_BY_ID } from '../../../../data/items.js';
import { AILMENTS_BY_ID } from '../../../../data/ailments.js';
import { drawMap, hitTestLandmark } from '../../render/map.js';
import { itemIcon, memberSprite } from './icons.js';

// ------------------------------------------------------------------ map ----

export function map(ctx) {
  const g = ctx.game;
  const canvas = el('canvas.map-canvas', { width: 640, height: 300 });
  const detail = el('div.prose.small');
  let selected = null;
  let raf = 0;

  Audio.sfx('map_open');

  function paint() {
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    try {
      drawMap(c, g, { width: canvas.width, height: canvas.height, selected });
    } catch (err) {
      c.fillStyle = '#0b0813';
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function loop() { raf = requestAnimationFrame(loop); paint(); }
  loop();

  function showDetail(id) {
    const lm = LANDMARKS.find((l) => l.id === id);
    if (!lm) {
      mountTo(detail, el('span.faint', 'Hover a marker to read about it.'));
      return;
    }
    const behind = lm.mile <= g.mile;
    mountTo(detail,
      el('b.gold', lm.name), ' · ', el('span.faint', `mile ${fmtNum(lm.mile)} · ${fmtNum(lm.elev)} ft · ${lm.state}`),
      el('br'), lm.blurb,
      el('br'),
      el('span', { class: behind ? 'good' : 'muted' },
        behind ? 'Behind you.' : `${fmtNum(Math.round(lm.mile - g.mile))} miles ahead.`),
      lm.store ? el('span.faint', '  ·  resupply') : null,
      lm.ford ? el('span.cold', '  ·  river crossing') : null,
    );
  }

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    const id = hitTestLandmark(x, y);
    if (id !== selected) { selected = id; showDetail(id); }
  });
  canvas.addEventListener('mouseleave', () => { selected = null; showDetail(null); });

  showDetail(null);

  const pct = (g.mile / TOTAL_MILES) * 100;
  const body = el('div',
    canvas,
    el('div.inline', { style: { marginTop: '12px' } },
      el('span.gold', `${fmtNum(Math.round(g.mile))} mi`),
      el('span.faint', `of ${fmtNum(TOTAL_MILES)} — ${pct.toFixed(1)}%`),
      el('span.cold', `snow line at mile ${fmtNum(Math.round(g.snowMile))}`),
      el('span.muted', `${fmtNum(Math.round(elevAtMile(g.mile)))} ft`),
    ),
    el('hr.divider'),
    detail,
  );

  return {
    node: panel({ title: 'The trail', meta: `Day ${g.day}`, body, foot: button('Close', () => ctx.close(), { cls: 'primary' }), cls: 'wide' }),
    unmount: () => cancelAnimationFrame(raf),
  };
}

// ----------------------------------------------------------------- pack ----

export function pack(ctx) {
  const g = ctx.game;
  const s = g.supplies;

  const owned = ITEMS.filter((it) => (s[it.id] || 0) > 0);
  const load = owned.reduce((sum, it) => sum + (s[it.id] || 0) * (it.weightLb || 0), 0);
  const capacity = 120 + g.supplies.mules * 160;

  const body = el('div',
    kv([
      ['Money', fmtMoney(s.money)],
      ['Food', Math.round(s.food) + ' lb'],
      ['Mules', String(s.mules)],
      ['Cart condition', Math.round(g.cart.condition) + '%'],
      ['Load', `${fmtNum(Math.round(load))} / ${fmtNum(capacity)} lb`],
      ['Miles walked', fmtNum(Math.round(g.stats.milesHiked || g.mile))],
    ]),
    el('div', { style: { marginTop: '10px' } }, meter((load / capacity) * 100)),
    load > capacity
      ? el('p.prose.small.bad', 'You are over-loaded. The cart drags and everybody feels it.')
      : el('p.prose.small.faint', 'Weight slows the cart. Everything you carry is a choice.'),
    el('h3', 'In the cart'),
    el('div.scroller', el('div.rows', owned.map((it) => el('div.row',
      itemIcon(it.id),
      el('div.grow', el('div.name', it.name), el('div.sub', it.blurb)),
      el('span.num', fmtNum(Math.round(s[it.id])) + (it.unit === 'lb' ? ' lb' : '')),
    )))),
    owned.length === 0 ? el('p.prose.small.bad', 'The cart is empty. This is a serious problem.') : null,
  );

  return {
    node: panel({ title: 'The cart', meta: `mile ${fmtNum(Math.round(g.mile))}`, body, foot: button('Close', () => ctx.close(), { cls: 'primary' }) }),
  };
}

// ---------------------------------------------------------------- party ----

export function party(ctx) {
  const g = ctx.game;
  const list = el('div.stack');

  function render() {
    mountTo(list, g.party.map((m, i) => {
      const ails = m.ailments.map((a) => {
        const def = AILMENTS_BY_ID[a.id];
        return el('span.tag.bad', { title: def ? def.name : a.id }, (def ? def.name : a.id) + ` · ${a.daysLeft}d`);
      });
      const meds = ['first_aid', 'electrolytes', 'blister_kit'].filter((id) => (g.supplies[id] || 0) > 0);

      return el('div.row', { style: { alignItems: 'flex-start', padding: '12px' } },
        memberSprite(m, 48),
        el('div.grow',
          el('div.inline',
            el('b', { class: m.alive ? 'gold' : 'faint' }, m.trailName || m.name),
            m.trailName ? el('span.faint.small', m.name) : null,
            i === 0 ? el('span.tag', 'trail boss') : null,
            !m.alive ? el('span.tag.bad', 'off trail') : null,
          ),
          m.alive
            ? el('div', { style: { marginTop: '6px' } },
                meter(m.health),
                el('div.sub', `${healthWord(m.health)} · spirit ${Math.round(m.spirit)}`),
                ails.length ? el('div.inline', { style: { marginTop: '6px' } }, ails) : null,
                meds.length && (m.health < 92 || m.ailments.length)
                  ? el('div.inline', { style: { marginTop: '8px' } }, meds.map((id) => button(
                      `Use ${ITEMS_BY_ID[id].name}`,
                      () => {
                        const res = ctx.Sim.useItem(g, id, i);
                        Audio.sfx(res && res.ok ? 'pickup' : 'error');
                        if (res && res.text) ctx.toast(res.text, res.ok ? 'good' : 'bad');
                        ctx.refreshHud();
                        render();
                      },
                      { cls: 'small' },
                    )))
                  : null,
              )
            : el('div.sub', `${m.causeOfDeath || 'Left the trail'} · mile ${fmtNum(Math.round(m.diedMile || 0))}`),
        ),
      );
    }));
  }

  render();

  const paceSeg = segmented(
    Object.entries(ctx.Sim.PACES).map(([k, v]) => ({ value: k, label: v.label || k, title: v.blurb || '' })),
    g.pace,
    (v) => { ctx.Sim.setPace(g, v); Audio.sfx('click'); ctx.refreshHud(); ctx.toast(`Pace: ${ctx.Sim.PACES[v].label || v}`); },
  );

  const rationSeg = segmented(
    Object.entries(ctx.Sim.RATIONS).map(([k, v]) => ({ value: k, label: v.label || k, title: `${v.lbPerDay} lb per person per day` })),
    g.rations,
    (v) => { ctx.Sim.setRations(g, v); Audio.sfx('click'); ctx.refreshHud(); ctx.toast(`Rations: ${ctx.Sim.RATIONS[v].label || v}`); },
  );

  const body = el('div',
    el('div.split',
      el('div', el('h3', 'Pace'), paceSeg,
        el('p.prose.small.faint', 'Grueling covers ground and breaks people. Steady is how most crews actually finish.')),
      el('div', el('h3', 'Rations'), rationSeg,
        el('p.prose.small.faint', 'Filling is 3 lb each per day, meager 2, bare-bones 1. Cutting food is a loan you pay back in health.')),
    ),
    el('hr.divider'),
    el('div.scroller', list),
  );

  return {
    node: panel({
      title: 'The crew',
      meta: `${g.party.filter((m) => m.alive).length} of 5 still walking`,
      body,
      foot: button('Close', () => ctx.close(), { cls: 'primary' }),
      cls: 'wide',
    }),
  };
}

function healthWord(h) {
  return h > 78 ? 'Good' : h > 55 ? 'Fair' : h > 32 ? 'Poor' : h > 12 ? 'Very poor' : 'Failing';
}
