// NORTHBOUND — title, settings, help and hall-of-fame screens.
import { el, panel, button, mountTo, fmtNum } from '../dom.js';
import { Audio } from '../../audio/audio.js';

// The title screen is markup-in-HTML plus a generated menu, so it can show a
// "Continue" entry only when a save actually exists.
export function title(ctx) {
  const menu = document.getElementById('title-menu');
  const buttons = [];

  const add = (label, fn, cls = '') => buttons.push(button(label, () => { Audio.sfx('select'); fn(); }, { cls }));

  add('Begin the trail', () => ctx.go('setup'), 'primary big');
  const resume = button('Continue your run', async () => {
    Audio.sfx('select');
    const g = await ctx.loadSaved();
    if (g) { ctx.go('map'); ctx.close(); }
    else ctx.toast('No save could be read.', 'bad');
  });
  resume.disabled = true;
  resume.style.display = 'none';
  buttons.push(resume);
  add('Hall of fame', () => ctx.go('scores'));
  add('How to hike it', () => ctx.go('help'));
  add('Settings', () => ctx.go('settings'));

  mountTo(menu, buttons);

  // Reveal Continue only if a save round-trips.
  ctx.loadScores; // (kept for symmetry; scores are loaded on their own screen)
  (async () => {
    try {
      const { loadGame } = await import('../../engine/save.js');
      const raw = await loadGame();
      if (raw) { resume.disabled = false; resume.style.display = ''; }
    } catch {}
  })();

  return { node: null, unmount: () => {} };
}

export function settings(ctx) {
  const g = ctx.game;
  const musicVol = Number(localStorage.getItem('nb.musicVol') ?? 0.7);
  const sfxVol = Number(localStorage.getItem('nb.sfxVol') ?? 0.8);

  const slider = (label, value, onInput) => el('div.field',
    el('label', label),
    el('input', {
      type: 'range', min: 0, max: 1, step: 0.05, value,
      oninput: (e) => onInput(Number(e.target.value)),
    }),
  );

  const body = el('div.stack',
    slider('Music', musicVol, (v) => { Audio.setMusicVolume(v); }),
    slider('Sound effects', sfxVol, (v) => { Audio.setSfxVolume(v); Audio.sfx('click'); }),
    el('hr.divider'),
    el('p.prose.small',
      'Northbound autosaves after every day on the trail. Your run also lives in this browser, ',
      'so you can close the window and come back to it.',
    ),
  );

  const foot = [
    g && button('Save now', async () => { await ctx.saveNow(); ctx.toast('Saved.', 'good'); }),
    g && button('Abandon this run', () => {
      if (confirm('Leave the trail for good? This deletes your save.')) ctx.abandonRun();
    }, { cls: 'danger' }),
    button('Back', () => ctx.back(), { cls: 'primary' }),
  ].filter(Boolean);

  return { node: panel({ title: 'Settings', body, foot, cls: 'narrow' }) };
}

export function help(ctx) {
  const section = (h, ...p) => [el('h3', h), ...p.map((t) => el('p.prose.small', { html: t }))];

  const body = el('div.scroller',
    ...section('The point',
      'Get five hikers from the Mexican border to the Canadian border — <b>2,650 miles</b> — before the snow line ' +
      'sweeps south and closes the passes behind you. Everyone who is still walking when you touch the northern ' +
      'monument makes it into the record.'),
    ...section('Every day costs food',
      'The crew eats <b>3 lb each per day</b> on filling rations, 2 on meager, 1 on bare-bones. Thin rations save ' +
      'weight and money and quietly wreck everyone\'s health. Empty packs are much worse.'),
    ...section('Pace is the whole game',
      '<em>Steady</em> makes about 15 miles a day and keeps people healthy. <em>Strenuous</em> makes 20. ' +
      '<em>Grueling</em> makes 25 and will put someone in a tent with a stress fracture. Push when the snow is ' +
      'close, ease off when it isn\'t.'),
    ...section('Things break',
      'Mules go lame. Cart wheels split. Filters clog and soles delaminate. Spares are cheap at the terminus and ' +
      'painful to need at Sonora Pass. Buy more than you think you need.'),
    ...section('Rivers',
      'Snowmelt fords are the classic way to lose a crew. You can wade it, rock-hop upstream, pay for a shuttle, ' +
      'or camp and cross in the cold morning when the water has dropped. Deep and raging means somebody swims.'),
    ...section('Foraging',
      'Costs a day. You can only carry 100 lb back to camp, and the good country for it is not always where you ' +
      'run out of food.'),
    ...section('Keys',
      '<kbd>Space</kbd> travel / stop &nbsp; <kbd>M</kbd> map &nbsp; <kbd>I</kbd> pack &nbsp; <kbd>C</kbd> crew ' +
      '&nbsp; <kbd>F</kbd> forage &nbsp; <kbd>R</kbd> camp &nbsp; <kbd>Esc</kbd> menu / back &nbsp; ' +
      '<kbd>1</kbd>–<kbd>9</kbd> pick a numbered option'),
  );

  return { node: panel({ title: 'How to hike it', body, foot: button('Back', () => ctx.back(), { cls: 'primary' }) }) };
}

export function scores(ctx) {
  const list = el('div.rows', el('p.prose.small', 'Reading the register…'));
  const node = panel({
    title: 'Hall of fame',
    meta: 'the ones who made it',
    body: list,
    foot: button('Back', () => ctx.back(), { cls: 'primary' }),
    cls: 'narrow',
  });

  (async () => {
    const rows = await ctx.loadScores();
    if (!rows || !rows.length) {
      mountTo(list, el('p.prose.small.center', 'Nobody has signed the northern register yet.'));
      return;
    }
    mountTo(list, rows.map((r, i) => el('div.row',
      el('span.num.dim', String(i + 1).padStart(2, '0')),
      el('div.grow', el('div.name', r.name), el('div.sub', `${r.rank} · ${fmtNum(r.miles)} mi · ${r.date}`)),
      el('span.num', fmtNum(r.score)),
    )));
  })();

  return { node };
}
