// NORTHBOUND — the end of the run: the score tally and the register.
import { el, panel, button, mountTo, fmtNum, fmtMoney } from '../dom.js';
import { Audio } from '../../audio/audio.js';
import { TOTAL_MILES } from '../../../../data/trail.js';
import { memberSprite } from './icons.js';

const ENDINGS = {
  won: {
    title: 'The Northern Terminus',
    line: 'Monument 78 stands in a clearcut on the Canadian border, a wooden obelisk that a lot of people have cried at. ' +
          'You sign the register with a pencil on a string.',
  },
  'snowed-off': {
    title: 'Snowed Off',
    line: 'The snow catches you in the open. Trail turns to postholing, postholing turns to route-finding, and route-finding ' +
          'turns into a road walk to a bus. The trail will be here next year.',
  },
  starved: {
    title: 'Out of Food',
    line: 'Calories are miles, and you ran out of both. What is left of the crew walks out to the nearest road.',
  },
  wiped: {
    title: 'Nobody Left Walking',
    line: 'The cart sits where it stopped. Somebody else will find it, eventually, and wonder.',
  },
  quit: {
    title: 'Off Trail',
    line: 'You get off trail. Most people do. It does not mean nothing happened.',
  },
};

export function end(ctx, params = {}) {
  const g = ctx.game;
  const score = params.score || ctx.scoreGame(g);
  const won = g.status === 'won';
  const ending = ENDINGS[won ? 'won' : (g.cause || 'quit')] || ENDINGS.quit;

  Audio.sfx(won ? 'win_fanfare' : 'lose_fanfare');

  const survivors = g.party.filter((m) => m.alive);
  const lost = g.party.filter((m) => !m.alive);

  const tally = el('div.rows', score.rows.map((r) => el('div.row',
    el('div.grow', el('div.name', r.label), r.qty != null ? el('div.sub', String(r.qty)) : null),
    el('span.num', fmtNum(r.points)),
  )));

  const registered = el('div');
  let saved = false;

  async function signRegister() {
    if (saved) return;
    saved = true;
    Audio.sfx('page');
    await ctx.saveScore({
      name: g.leader.name,
      score: score.total,
      rank: score.rank,
      miles: Math.round(g.mile),
      date: `${g.date.month}/${g.date.day}`,
    });
    mountTo(registered, el('p.prose.small.good', 'Signed into the register.'));
    ctx.clearSave();
  }

  const body = el('div',
    el('p.prose', ending.line),
    el('hr.divider'),
    el('div.split',
      el('div',
        el('h3', 'Who finished'),
        survivors.length
          ? el('div.stack', survivors.map((m) => el('div.row',
              memberSprite(m, 40),
              el('div.grow', el('div.name', m.trailName || m.name),
                el('div.sub', `${Math.round(m.health)} health${m.trailName ? ` · ${m.name}` : ''}`)),
            )))
          : el('p.prose.small.bad', 'Nobody.'),
        lost.length ? el('h3', 'Who did not') : null,
        lost.length
          ? el('div.stack', lost.map((m) => el('div.row',
              memberSprite(m, 40),
              el('div.grow', el('div.name.faint', m.name),
                el('div.sub', `${m.causeOfDeath || 'left the trail'} · mile ${fmtNum(Math.round(m.diedMile || 0))}`),
                m.epitaph ? el('div.sub.faint', `“${m.epitaph}”`) : null),
            )))
          : null,
      ),
      el('div',
        el('h3', 'The tally'),
        tally,
        el('div.row', { style: { marginTop: '8px', borderTop: '1px solid var(--edge)' } },
          el('div.grow', el('b.gold', 'Total')),
          el('span.num', el('b', fmtNum(score.total))),
        ),
        el('p.prose', { style: { marginTop: '12px' } },
          'Rank: ', el('b.gold', score.rank)),
        el('div.kv', { style: { marginTop: '10px' } },
          el('div', el('span', 'Miles'), el('b', `${fmtNum(Math.round(g.mile))} of ${fmtNum(TOTAL_MILES)}`)),
          el('div', el('span', 'Days'), el('b', String(g.day))),
          el('div', el('span', 'Cash left'), el('b', fmtMoney(g.supplies.money))),
          el('div', el('span', 'Fords crossed'), el('b', String(g.stats.fordsCrossed || 0))),
          el('div', el('span', 'Foraged'), el('b', `${fmtNum(Math.round(g.stats.lbsForaged || 0))} lb`)),
          el('div', el('span', 'Events'), el('b', String(g.stats.eventsSurvived || 0))),
        ),
        registered,
      ),
    ),
  );

  return {
    node: panel({
      title: ending.title,
      meta: won ? 'Manning Park, British Columbia' : `Mile ${fmtNum(Math.round(g.mile))}`,
      body,
      foot: [
        button('Sign the register', signRegister),
        button('Hall of fame', () => ctx.go('scores')),
        button('Walk it again', () => { ctx.clearSave(); ctx.go('setup'); }, { cls: 'primary' }),
      ],
      cls: 'wide',
    }),
  };
}
