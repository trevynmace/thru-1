// NORTHBOUND — everything that happens while you are on the trail:
// landmark stops, events, camping, talking, trading, fords and foraging.
import { el, panel, button, mountTo, kv, fmtMoney, fmtNum, plural } from '../dom.js';
import { Audio } from '../../audio/audio.js';
import { LANDMARKS, nextLandmark } from '../../../../data/trail.js';
import { ITEMS_BY_ID } from '../../../../data/items.js';
import { talkLine } from '../../../../data/dialogue.js';
import { itemIcon } from './icons.js';

// ------------------------------------------------------------- landmark ----

export function landmark(ctx, params = {}) {
  const g = ctx.game;
  const lm = params.landmark && params.landmark.id
    ? params.landmark
    : LANDMARKS.find((l) => l.id === (params.landmark || g.atLandmark)) || LANDMARKS[0];

  const options = [];
  const opt = (label, fn, hint) => options.push({ label, fn, hint });

  opt('Continue on the trail', () => { ctx.close(); ctx.setTravelling(true); });
  if (lm.ford) opt(`Cross ${lm.ford.name}`, () => ctx.go('ford', { landmark: lm }));
  if (lm.store) opt('Buy supplies', () => ctx.go('store', { landmark: lm }));
  opt('Check supplies', () => ctx.go('pack'));
  opt('Look at the map', () => ctx.go('map'));
  opt('Look after the crew', () => ctx.go('party'));
  opt('Rest here', () => ctx.go('camp', { landmark: lm }));
  opt('Try to forage', () => ctx.go('forage', { landmark: lm }));
  opt('Trade with hikers', () => ctx.go('trade', { landmark: lm }));
  opt('Talk to people', () => ctx.go('talk', { landmark: lm }));

  const menu = el('div.stack', options.slice(0, 9).map((o, i) => el('button.btn.wide', {
    type: 'button', dataset: { key: String(i + 1) },
    onclick: () => { Audio.sfx('select'); o.fn(); },
  }, `${i + 1}. ${o.label}`, o.hint && el('span.hint', o.hint))));

  const nl = nextLandmark(g.mile);

  const body = el('div',
    el('p.prose', lm.blurb),
    el('hr.divider'),
    el('div.split',
      menu,
      el('div',
        kv([
          ['Elevation', fmtNum(lm.elev) + ' ft'],
          ['Mile', fmtNum(lm.mile)],
          ['Day', String(g.day)],
          ['Weather', `${g.weather.kind}, ${Math.round(g.weather.tempF)}°F`],
          ['Food', Math.round(g.supplies.food) + ' lb'],
          ['Money', fmtMoney(g.supplies.money)],
          ['Mules', String(g.supplies.mules)],
          ['Cart', Math.round(g.cart.condition) + '%'],
          ['Crew standing', `${g.party.filter((m) => m.alive).length} of 5`],
          nl ? ['Next stop', `${nl.name} · ${Math.round(nl.mile - g.mile)} mi`] : ['Next stop', 'Canada'],
        ]),
        lm.forage && el('p.prose.small', { style: { marginTop: '14px' } },
          'Foraging here looks ', el('em', lm.forage), '.'),
      ),
    ),
  );

  return {
    node: panel({
      title: lm.name,
      meta: `${lm.state} · mile ${fmtNum(lm.mile)} · ${lm.kind}`,
      body,
      cls: 'wide',
    }),
  };
}

// ---------------------------------------------------------------- event ----

export function event(ctx, params = {}) {
  const g = ctx.game;
  const ev = params.event;
  if (!ev) { ctx.close(); return { node: el('div') }; }

  const text = fillTemplate(ev.text, g);
  const outcome = el('div');

  // The engine rolls the odds and applies the effects so the UI cannot desync the RNG.
  function resolveChoice(index) {
    const res = ctx.Sim.resolveChoice(g, ev, index);
    const choice = ev.choices[index];
    const resultText = res.success ? choice.resultText : (choice.failText || choice.resultText);
    finish(resultText, res.lines || []);
  }

  // A plain event was already resolved by advanceDay() before this screen opened, so
  // there is nothing left to apply here — re-applying would charge the player twice.
  function resolvePlain() {
    finish(ev.resultText, params.report ? (params.report.lines || []).slice(-4) : []);
  }

  function finish(resultText, lines) {
    Audio.sfx('page');
    ctx.refreshHud();
    for (const l of lines) ctx.journal('event', l);
    mountTo(outcome,
      el('hr.divider'),
      resultText && el('p.prose', fillTemplate(resultText, g)),
      lines.length ? el('div.rows', lines.map((l) => el('div.row', el('span.grow', l)))) : null,
      el('div.panel-foot',
        button('Onward', () => {
          if (g.status !== 'playing') { ctx.endRun(); return; }
          ctx.close();
          ctx.setTravelling(true);
        }, { cls: 'primary' }),
      ),
    );
    // Replace the choice list once resolved.
    const choicesNode = document.getElementById('event-choices');
    if (choicesNode) choicesNode.remove();
  }

  const choices = ev.choices && ev.choices.length
    ? el('div.stack#event-choices', ev.choices.map((c, i) => el('button.btn.wide', {
        type: 'button', dataset: { key: String(i + 1) },
        onclick: () => { Audio.sfx('select'); resolveChoice(i); },
      }, `${i + 1}. ${c.label}`)))
    : el('div.stack#event-choices', button('See what happens', () => { Audio.sfx('select'); resolvePlain(); }, { cls: 'primary' }));

  const body = el('div', el('p.prose', text), el('hr.divider'), choices, outcome);

  return {
    node: panel({ title: ev.title, meta: `Day ${g.day} · mile ${fmtNum(Math.round(g.mile))}`, body, cls: 'narrow' }),
  };
}

function fillTemplate(text, g) {
  if (!text) return '';
  const living = g.party.filter((m) => m.alive);
  const member = living.length ? living[Math.floor(Math.random() * living.length)] : g.party[0];
  const lm = LANDMARKS.find((l) => l.id === g.atLandmark) || LANDMARKS[0];
  return String(text)
    .replace(/\{leader\}/g, g.leader.name)
    .replace(/\{member\}/g, member ? (member.trailName || member.name) : 'someone')
    .replace(/\{name\}/g, member ? (member.trailName || member.name) : 'someone')
    .replace(/\{landmark\}/g, lm.name)
    .replace(/\{miles\}/g, fmtNum(Math.round(g.mile)));
}

// ----------------------------------------------------------------- camp ----

export function camp(ctx, params = {}) {
  const g = ctx.game;
  const result = el('div');
  let days = 1;

  const dayButtons = el('div.inline', [1, 2, 3, 5, 7].map((n) => button(`${n} ${n === 1 ? 'day' : 'days'}`, () => {
    days = n;
    [...dayButtons.children].forEach((c) => c.classList.remove('primary'));
    dayButtons.children[[1, 2, 3, 5, 7].indexOf(n)].classList.add('primary');
    Audio.sfx('click');
  }, { cls: n === 1 ? 'small primary' : 'small' })));

  function rest() {
    ctx.setCamped(true);
    Audio.sfx('campfire');
    const report = ctx.Sim.restDays(g, days);
    ctx.refreshHud();
    for (const l of report.lines || []) ctx.journal('health', l);
    mountTo(result,
      el('hr.divider'),
      el('p.prose', report.summary || `You lay over for ${plural(days, 'day')}. The snow line does not lay over with you.`),
      report.lines && report.lines.length
        ? el('div.rows', report.lines.map((l) => el('div.row', el('span.grow', l))))
        : null,
      el('div.panel-foot', button('Break camp', () => {
        ctx.setCamped(false);
        if (g.status !== 'playing') { ctx.endRun(); return; }
        ctx.close();
      }, { cls: 'primary' })),
    );
  }

  const sick = g.party.filter((m) => m.alive && (m.health < 60 || m.ailments.length));
  const body = el('div',
    el('p.prose',
      'You pitch the tents, boil water, and let everybody stop being a machine for a day. Resting is the only ',
      'thing that actually heals people — and the snow line keeps coming south while you do it.'),
    sick.length
      ? el('div', el('h3', 'Who needs it'), el('div.rows', sick.map((m) => el('div.row',
          el('div.grow', el('div.name', m.trailName || m.name),
            el('div.sub', m.ailments.length ? m.ailments.map((a) => a.id.replace(/-/g, ' ')).join(', ') : 'worn down')),
          el('span.num', Math.round(m.health)),
        ))))
      : el('p.prose.small.good', 'Everybody is walking well. A rest day is a luxury right now.'),
    el('h3', 'How long'),
    dayButtons,
    result,
  );

  return {
    node: panel({
      title: 'Make camp',
      meta: `Day ${g.day} · ${Math.round(g.supplies.food)} lb of food`,
      body,
      foot: [
        button('Never mind', () => { ctx.setCamped(false); ctx.close(); }, { cls: 'ghost' }),
        button('Rest', rest, { cls: 'primary' }),
      ],
      cls: 'narrow',
    }),
    unmount: () => ctx.setCamped(false),
  };
}

// ----------------------------------------------------------------- talk ----

export function talk(ctx, params = {}) {
  const g = ctx.game;
  const lm = params.landmark || LANDMARKS.find((l) => l.id === g.atLandmark) || LANDMARKS[0];
  const lines = el('div.stack');
  const rng = g.rng || Math.random;
  const seen = new Set();

  function addLine() {
    let entry = null;
    for (let i = 0; i < 12 && !entry; i++) {
      const candidate = talkLine(lm, rng);
      if (candidate && !seen.has(candidate.line)) entry = candidate;
    }
    if (!entry) { ctx.toast('Everyone here has said their piece.'); return; }
    seen.add(entry.line);
    Audio.sfx('page');
    lines.appendChild(el('div.row',
      el('div.grow', el('div.sub', entry.speaker), el('div.name', `“${entry.line}”`)),
    ));
    lines.lastChild.scrollIntoView({ block: 'nearest' });
  }

  addLine();

  return {
    node: panel({
      title: 'Talk to people',
      meta: lm.name,
      body: el('div', el('div.scroller', lines)),
      foot: [
        button('Talk to someone else', addLine),
        button('Back', () => ctx.go('landmark', { landmark: lm }), { cls: 'primary' }),
      ],
      cls: 'narrow',
    }),
  };
}

// ---------------------------------------------------------------- trade ----

export function trade(ctx, params = {}) {
  const g = ctx.game;
  const lm = params.landmark || LANDMARKS.find((l) => l.id === g.atLandmark) || LANDMARKS[0];
  const rng = g.rng || Math.random;

  const offer = makeOffer(g, rng);
  const body = el('div');

  function render() {
    if (!offer) {
      mountTo(body, el('p.prose', 'Nobody here has anything they can spare today.'));
      return;
    }
    mountTo(body,
      el('p.prose', offer.flavour),
      el('div.rows',
        el('div.row', itemIcon(offer.wantId),
          el('div.grow', el('div.name', `They want ${fmtNum(offer.wantQty)} ${unitOf(offer.wantId)} of ${ITEMS_BY_ID[offer.wantId].name}`)),
        ),
        el('div.row', itemIcon(offer.giveId),
          el('div.grow', el('div.name', `They will give ${fmtNum(offer.giveQty)} ${unitOf(offer.giveId)} of ${ITEMS_BY_ID[offer.giveId].name}`)),
        ),
      ),
    );
  }

  function accept() {
    if (!offer) return;
    if ((g.supplies[offer.wantId] || 0) < offer.wantQty) {
      Audio.sfx('error');
      ctx.toast('You do not have that to give.', 'bad');
      return;
    }
    ctx.Sim.applyEffects(g, { [offer.wantId]: -offer.wantQty, [offer.giveId]: offer.giveQty });
    Audio.sfx('buy');
    ctx.toast('Traded.', 'good');
    ctx.refreshHud();
    ctx.go('landmark', { landmark: lm });
  }

  render();

  return {
    node: panel({
      title: 'Trade with hikers',
      meta: lm.name,
      body,
      foot: [
        button('Walk away', () => ctx.go('landmark', { landmark: lm }), { cls: 'ghost' }),
        offer && button('Trade', accept, { cls: 'primary' }),
      ].filter(Boolean),
      cls: 'narrow',
    }),
  };
}

const TRADE_GOODS = ['food', 'spare_soles', 'spare_poles', 'spare_filter', 'first_aid', 'electrolytes', 'clothing', 'stove_fuel'];

function makeOffer(g, rng) {
  const r = () => (typeof rng === 'function' ? rng() : Math.random());
  const pool = TRADE_GOODS.filter((id) => ITEMS_BY_ID[id]);
  if (pool.length < 2) return null;
  const wantId = pool[Math.floor(r() * pool.length)];
  let giveId = pool[Math.floor(r() * pool.length)];
  if (giveId === wantId) giveId = pool[(pool.indexOf(wantId) + 1) % pool.length];
  const wantQty = wantId === 'food' ? 20 + Math.floor(r() * 30) : 1;
  const giveQty = giveId === 'food' ? 20 + Math.floor(r() * 30) : 1;
  const flavours = [
    'A pair of southbounders have too much of one thing and none of another. The universal condition out here.',
    'Somebody at the picnic table is repacking their food bag with the look of a person who over-bought.',
    'A hiker with a homemade pack offers a swap, no money involved. Trail economy.',
  ];
  return { wantId, wantQty, giveId, giveQty, flavour: flavours[Math.floor(r() * flavours.length)] };
}

function unitOf(id) {
  const u = ITEMS_BY_ID[id] && ITEMS_BY_ID[id].unit;
  return u === 'lb' ? 'lb' : u === 'head' ? 'head' : u === 'set' ? 'sets' : 'units';
}

// ----------------------------------------------------------------- ford ----

export function ford(ctx, params = {}) {
  const g = ctx.game;
  const lm = params.landmark || LANDMARKS.find((l) => l.id === g.atLandmark) || LANDMARKS[0];
  const f = lm.ford;
  if (!f) { ctx.close(); return { node: el('div') }; }

  let running = false;
  const body = el('div');

  const methods = [
    { id: 'ford', label: 'Wade across', hint: 'Fast. The water decides how it goes.' },
    { id: 'rock-hop', label: 'Rock-hop upstream', hint: 'Costs most of a day. Safer if your feet are quick.' },
    { id: 'raft', label: 'Pack-raft it', hint: 'Needs nerve. Gear gets wet, people usually do not.' },
    { id: 'shuttle', label: 'Pay for a shuttle', hint: 'Costs money. Costs nothing else.' },
    { id: 'wait', label: 'Camp and cross at dawn', hint: 'Costs a day. Snowmelt drops overnight.' },
  ];

  async function run(method) {
    if (running) return;
    running = true;
    const canvas = ctx.overlayCanvas();
    canvas.classList.add('interactive');
    document.getElementById('screen-ford').classList.remove('active');

    let outcome = { success: true, severity: 1, log: [] };
    try {
      const { runFord } = await import('../../minigames/ford.js');
      outcome = await runFord(canvas, { ford: f, method, g, rng: g.rng, audio: Audio });
    } catch (err) {
      console.warn('[northbound] ford minigame unavailable, resolving directly');
    } finally {
      canvas.classList.remove('interactive');
    }

    const res = ctx.Sim.resolveFord(g, method, outcome);
    ctx.refreshHud();
    for (const l of (res.lines || [])) ctx.journal(l.includes('swept') ? 'death' : 'travel', l);
    Audio.sfx(outcome.severity >= 2 ? 'splash' : 'river');
    if (outcome.severity >= 2) ctx.scene.shake(4);

    document.getElementById('screen-ford').classList.add('active');
    mountTo(body,
      el('p.prose', res.text || (outcome.success ? 'You are across.' : 'That went badly.')),
      (res.lines || []).length ? el('div.rows', res.lines.map((l) => el('div.row', el('span.grow', l)))) : null,
      el('div.panel-foot', button('Onward', () => {
        if (g.status !== 'playing') { ctx.endRun(); return; }
        ctx.go('landmark', { landmark: lm });
      }, { cls: 'primary' })),
    );
    running = false;
  }

  mountTo(body,
    el('p.prose', f.blurb || `${f.name} is running ${f.flow}. It looks about ${f.depthFt} feet deep and ${f.widthFt} feet across.`),
    el('div.kv',
      el('div', el('span', 'Depth'), el('b', f.depthFt + ' ft')),
      el('div', el('span', 'Width'), el('b', f.widthFt + ' ft')),
      el('div', el('span', 'Flow'), el('b', f.flow)),
    ),
    el('hr.divider'),
    el('div.stack', methods.map((m, i) => el('button.btn.wide', {
      type: 'button', dataset: { key: String(i + 1) },
      onclick: () => { Audio.sfx('select'); run(m.id); },
    }, `${i + 1}. ${m.label}`, el('span.hint', m.hint)))),
  );

  return { node: panel({ title: f.name, meta: `${lm.name} · mile ${fmtNum(lm.mile)}`, body, cls: 'narrow' }) };
}

// --------------------------------------------------------------- forage ----

export function forage(ctx, params = {}) {
  const g = ctx.game;
  const lm = params.landmark || LANDMARKS.find((l) => l.id === g.atLandmark) || nearestLandmark(g.mile);
  const quality = (lm && lm.forage) || 'fair';
  const body = el('div');
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    const canvas = ctx.overlayCanvas();
    canvas.classList.add('interactive');
    document.getElementById('screen-forage').classList.remove('active');
    Audio.playMusic('forage');

    let out = { lbs: 18, log: [] };
    try {
      const { runForage } = await import('../../minigames/forage.js');
      // No occupation bonus here — applyForageResult() applies the forage perk itself.
      out = await runForage(canvas, { quality, biome: params.biome || 'forest', rng: g.rng, audio: Audio, bonus: 1 });
    } catch (err) {
      console.warn('[northbound] forage minigame unavailable, resolving directly');
    } finally {
      canvas.classList.remove('interactive');
    }

    const res = ctx.Sim.applyForageResult(g, out.lbs || 0);
    ctx.refreshHud();
    for (const l of (res.lines || [])) ctx.journal('travel', l);

    document.getElementById('screen-forage').classList.add('active');
    mountTo(body,
      el('p.prose', res.text || `You carry back ${Math.round(out.lbs)} lb.`),
      el('div.panel-foot', button('Back to the trail', () => {
        if (g.status !== 'playing') { ctx.endRun(); return; }
        ctx.close();
      }, { cls: 'primary' })),
    );
    running = false;
  }

  mountTo(body,
    el('p.prose',
      'You drop the packs and spend a day working the country around camp for berries, mushrooms and whatever ',
      'is holding in the creek. It costs a day, and you can only carry a hundred pounds back.'),
    el('p.prose.small', 'The foraging here looks ', el('em', quality), '.'),
    el('p.prose.small.faint', 'Arrows or WASD to move, Space to gather, Esc to head back early.'),
  );

  return {
    node: panel({
      title: 'Forage',
      meta: lm ? lm.name : `Mile ${fmtNum(Math.round(g.mile))}`,
      body,
      foot: [
        button('Not today', () => ctx.close(), { cls: 'ghost' }),
        button('Spend the day', run, { cls: 'primary' }),
      ],
      cls: 'narrow',
    }),
  };
}

function nearestLandmark(mile) {
  let best = LANDMARKS[0];
  for (const l of LANDMARKS) if (Math.abs(l.mile - mile) < Math.abs(best.mile - mile)) best = l;
  return best;
}
