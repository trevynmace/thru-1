// NORTHBOUND — crew setup. Occupation, five names, departure month.
// This is the Oregon Trail "who are you / who is with you / when do you leave"
// opening, with the same money-versus-score tradeoff on the occupation.
import { el, panel, button, mountTo, fmtMoney } from '../dom.js';
import { Audio } from '../../audio/audio.js';
import { OCCUPATIONS, NAME_POOL } from '../../../../data/party.js';
import { makeRng, pick } from '../../engine/rng.js';

const MONTHS = [
  { value: 3, label: 'March', blurb: 'Weeks of slack against the snow line, paid for in the High Sierra: postholing, whiteouts, and creeks at peak melt. Bring an ice axe.' },
  { value: 4, label: 'April', blurb: 'The bubble. Warm days, company at every water cache, passes that melt out just in time.' },
  { value: 5, label: 'May', blurb: 'The Sierra is mostly melted out and the walking is easy — but the snow line is already breathing on your neck by Oregon.' },
  { value: 6, label: 'June', blurb: 'Dry passes, no snowpack, and no margin at all. Almost nobody who leaves this late touches the northern monument. A dare, not a plan.' },
];

export function setup(ctx) {
  const rng = makeRng((Math.random() * 1e9) >>> 0);

  const choice = {
    occupation: OCCUPATIONS[0].id,
    month: 4,
    names: [randomName(rng), randomName(rng), randomName(rng), randomName(rng), randomName(rng)],
  };

  const nameInputs = [];
  const occCards = el('div.cards');
  const monthCards = el('div.cards');

  function renderOccupations() {
    mountTo(occCards, OCCUPATIONS.map((o) => el('button.card' + (o.id === choice.occupation ? '.selected' : ''), {
      type: 'button',
      onclick: () => { choice.occupation = o.id; Audio.sfx('click'); renderOccupations(); renderSummary(); },
    },
      el('div.card-title', o.name),
      el('div.card-sub', `${fmtMoney(o.money)} · score ×${o.scoreMult}`),
      el('div.card-body', o.blurb),
      el('div.card-stat', o.perk),
    )));
  }

  function renderMonths() {
    mountTo(monthCards, MONTHS.map((m) => el('button.card' + (m.value === choice.month ? '.selected' : ''), {
      type: 'button',
      onclick: () => { choice.month = m.value; Audio.sfx('click'); renderMonths(); renderSummary(); },
    },
      el('div.card-title', m.label),
      el('div.card-body', m.blurb),
    )));
  }

  const summary = el('p.prose.small');
  function renderSummary() {
    const o = OCCUPATIONS.find((x) => x.id === choice.occupation);
    const m = MONTHS.find((x) => x.value === choice.month);
    mountTo(summary,
      el('b', o.name), ' leaves Campo on ', el('b', `${m.label} 1`),
      ' with ', el('b', fmtMoney(o.money)), ' and four people who trust them. ',
      el('span.faint', `Every point you finish with is multiplied by ${o.scoreMult}.`),
    );
  }

  const nameFields = el('div.stack',
    ...choice.names.map((n, i) => {
      const input = el('input', {
        type: 'text', value: n, maxLength: 18, spellcheck: false,
        oninput: (e) => { choice.names[i] = e.target.value; },
      });
      nameInputs.push(input);
      return el('div.field', el('label', i === 0 ? 'Trail boss (you)' : `Crew member ${i}`), input);
    }),
    el('div.inline',
      button('Roll new names', () => {
        Audio.sfx('page');
        for (let i = 0; i < 5; i++) { choice.names[i] = randomName(rng); nameInputs[i].value = choice.names[i]; }
      }, { cls: 'small' }),
      el('span.faint.small', 'Trail names get earned out there, not chosen.'),
    ),
  );

  const body = el('div.stack',
    el('h3', '1. Who is leading'),
    occCards,
    el('h3', '2. Who is walking'),
    el('div.split', nameFields, el('div',
      el('p.prose.small',
        'Five people leave the monument together. Name them after people you like, because you are going to ',
        'read those names in the journal for a long time, and one of them is probably going to get giardia.'),
      el('hr.divider'),
      el('h3', 'The plan'),
      summary,
    )),
    el('h3', '3. When you leave'),
    monthCards,
  );

  const node = panel({
    title: 'Outfitting the crew',
    meta: 'Campo, California · mile 0',
    body,
    foot: [
      button('Back', () => ctx.go('title'), { cls: 'ghost' }),
      button('To the outfitter', () => {
        const names = choice.names.map((n, i) => (n || '').trim() || randomName(rng));
        Audio.sfx('select');
        ctx.startGame({
          leaderName: names[0],
          memberNames: names.slice(1),
          occupation: choice.occupation,
          month: choice.month,
          seed: (Math.random() * 1e9) >>> 0,
        });
        ctx.go('store', { outfitting: true });
      }, { cls: 'primary' }),
    ],
    cls: 'wide',
  });

  renderOccupations();
  renderMonths();
  renderSummary();

  return { node };
}

function randomName(rng) {
  return `${pick(rng, NAME_POOL.first)} ${pick(rng, NAME_POOL.last)}`;
}
