// NORTHBOUND — title, settings, help and hall-of-fame screens.
import { el, panel, button, mountTo, fmtNum } from '../dom.js';
import { Audio } from '../../audio/audio.js';
import { getPref, setPref } from '../../engine/prefs.js';

// The router owns every screen node, so the title builds its own markup. The
// "Continue" entry only appears once a save file has actually been read back.
export function title(ctx) {
  const menu = el('nav.menu-buttons');

  const add = (label, fn, cls = '') =>
    menu.appendChild(button(label, () => { Audio.sfx('select'); fn(); }, { cls }));

  add('Begin the trail', () => ctx.go('setup'), 'primary big');

  const resume = button('Continue your run', async () => {
    Audio.sfx('select');
    const g = await ctx.loadSaved();
    if (g) ctx.close();
    else ctx.toast('No save could be read.', 'bad');
  });
  resume.disabled = true;
  resume.hidden = true;
  menu.appendChild(resume);

  add('Hall of fame', () => ctx.go('scores'));
  add('How to hike it', () => ctx.go('help'));
  add('Settings', () => ctx.go('settings'));

  let cancelled = false;
  (async () => {
    try {
      const { loadGame } = await import('../../engine/save.js');
      const raw = await loadGame();
      if (raw && !cancelled) { resume.disabled = false; resume.hidden = false; }
    } catch { /* no save is the normal case */ }
  })();

  const node = el('div',
    el('div.title-block',
      el('h1.logo', 'NORTHBOUND'),
      el('p.subtitle', 'two thousand six hundred and fifty miles'),
      el('p.tagline',
        'Five hikers walk north from the Mexican border in spring, carrying everything they own. ',
        'Canada is a long way north, and the snow is already thinking about the passes.'),
    ),
    menu,
    el('p.footnote', 'Mouse or keyboard. ', el('kbd', 'Enter'), ' to choose, ', el('kbd', 'Esc'), ' to go back.'),
  );
  node.style.display = 'flex';
  node.style.flexDirection = 'column';
  node.style.alignItems = 'center';

  return { node, unmount: () => { cancelled = true; } };
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

  // Not everyone came for an arcade cabinet. Handing the crossing and the forage day to
  // the crew costs nothing in fidelity — they walk it competently, the way a real crew
  // would — and it keeps the trail open to people who cannot play a twitch minigame.
  const autoBtn = button('', () => {
    const next = !getPref('autoMinigames');
    setPref('autoMinigames', next);
    Audio.sfx(next ? 'select' : 'back');
    paintAuto();
  }, { cls: 'small' });
  function paintAuto() {
    const on = getPref('autoMinigames');
    mountTo(autoBtn, on ? 'The crew handles it' : 'I play them myself');
    autoBtn.classList.toggle('primary', on);
  }
  paintAuto();

  const body = el('div.stack',
    slider('Music', musicVol, (v) => { Audio.setMusicVolume(v); }),
    slider('Sound effects', sfxVol, (v) => { Audio.setSfxVolume(v); Audio.sfx('click'); }),
    el('hr.divider'),
    el('div.field',
      el('label', 'River crossings and foraging'),
      autoBtn,
      el('p.prose.small.faint', { style: { marginTop: '8px' } },
        'Fords and forage days are hands-on by default. Switch this and the crew plays them ',
        'for you — a little worse than a good player, a lot better than panicking.'),
    ),
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
      '<em>Steady</em> keeps people healthy and still covers ground. <em>Strenuous</em> is the pace that ' +
      'actually finishes the trail. <em>Grueling</em> looks faster on the day and is slower over a season — ' +
      'it burns the crew down until sick, slow people cost you more miles than the extra hours won. Push it ' +
      'when the snow is close, not because it sounds bold.'),
    ...section('When you leave matters most',
      'Leave in <b>March</b> and you reach the High Sierra while it is still buried: postholing, whiteouts, ' +
      'and creeks at peak melt. Leave in <b>June</b> and the passes are dry but the snow line is behind you ' +
      'from day one. <b>April</b> is the answer most crews land on, which does not make it the only one.'),
    ...section('The kit wears out',
      'Every mile grinds it down, and worn gear is slow gear. Camp days let the crew do field repairs, and any ' +
      'town with a road will sell you new tread. Ignore it and you will spend the season getting slower.'),
    ...section('Weight is miles',
      'Everything you own is on your back. A light kit walks fast; a full pack of food walks slowly, which is ' +
      'why you buy five or six days at a time and resupply in town rather than carrying a season of dinners.'),
    ...section('Things break',
      'Tread delaminates. Poles fold. Filters silt up, straps tear out of packs, and tent poles snap in the wind. ' +
      'Spares are cheap at the terminus and painful to need at Sonora Pass. Buy more than you think you need.'),
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
