// NORTHBOUND — the outfitter. Used both for the opening kit at Campo and for
// every resupply store on trail, where the price multiplier climbs with remoteness.
import { el, panel, button, mountTo, fmtMoney, fmtNum } from '../dom.js';
import { Audio } from '../../audio/audio.js';
import { ITEMS, ITEMS_BY_ID } from '../../../../data/items.js';
import { stockFor } from '../../../../data/store.js';
import { STORE_GREETINGS } from '../../../../data/dialogue.js';
import { LANDMARKS } from '../../../../data/trail.js';
import { itemIcon } from './icons.js';

const CATEGORY_ORDER = ['food', 'stock', 'parts', 'clothing', 'medical', 'tools', 'luxury'];
const CATEGORY_LABEL = {
  food: 'Calories', stock: 'Stock', parts: 'Spares', clothing: 'Layers',
  medical: 'Medical', tools: 'Kit', luxury: 'Comforts',
};

export function store(ctx, params = {}) {
  const g = ctx.game;
  const landmark = params.landmark
    || LANDMARKS.find((l) => l.id === g.atLandmark)
    || LANDMARKS[0];
  const mult = (landmark.store && landmark.store.mult) || 1;
  const outfitting = !!params.outfitting;

  // The engine owns the price model (including the haggle perk) so the sticker price
  // here and the price charged at checkout can never drift apart.
  const price = (id) => ctx.Sim.unitPrice(g, id, mult);

  const stock = stockFor(landmark).filter((id) => ITEMS_BY_ID[id]);
  const cart = Object.create(null);          // pending purchases, applied on checkout
  const total = () => stock.reduce((s, id) => s + (cart[id] || 0) * price(id), 0);

  const listNode = el('div.scroller');
  const totalNode = el('div.inline');

  function qty(id) { return cart[id] || 0; }

  function change(id, delta) {
    const item = ITEMS_BY_ID[id];
    const step = item.unit === 'lb' ? 10 * Math.sign(delta) : delta;
    const next = Math.max(0, Math.min(item.max ?? 999, qty(id) + step));
    cart[id] = next;
    if (total() > g.supplies.money) {
      cart[id] = qty(id) - step;
      Audio.sfx('error');
      ctx.toast('Not enough money for that.', 'bad');
    } else {
      Audio.sfx(delta > 0 ? 'click' : 'back', { vol: 0.6 });
    }
    render();
  }

  function render() {
    const groups = CATEGORY_ORDER
      .map((cat) => [cat, stock.filter((id) => ITEMS_BY_ID[id].category === cat)])
      .filter(([, ids]) => ids.length);

    mountTo(listNode, groups.map(([cat, ids]) => el('div',
      el('h3', CATEGORY_LABEL[cat] || cat),
      el('div.rows', ids.map((id) => {
        const item = ITEMS_BY_ID[id];
        const unit = price(id);
        const have = Math.round(g.supplies[id] ?? 0);
        const n = qty(id);
        return el('div.row',
          itemIcon(id),
          el('div.grow',
            el('div.name', item.name, n ? el('span.gold', `  ×${fmtNum(n)}`) : null),
            el('div.sub', item.blurb),
          ),
          el('div', { style: { textAlign: 'right', minWidth: '84px' } },
            el('div.num', fmtMoney(unit) + (item.unit === 'lb' ? '/lb' : '')),
            el('div.sub', `have ${fmtNum(have)}${item.unit === 'lb' ? ' lb' : ''}`),
          ),
          el('div.inline',
            button('−', () => change(id, -1), { cls: 'small', disabled: n === 0 }),
            button('+', () => change(id, +1), { cls: 'small' }),
          ),
        );
      })),
    )));

    const spend = total();
    mountTo(totalNode,
      el('span.muted', 'In the pile: '), el('b.gold', fmtMoney(spend)),
      el('span.faint', '   ·   '),
      el('span.muted', 'Left after: '), el('b', { class: g.supplies.money - spend < 60 ? 'bad' : 'good' },
        fmtMoney(g.supplies.money - spend)),
    );
  }

  function checkout() {
    let bought = 0;
    for (const [id, n] of Object.entries(cart)) {
      if (!n) continue;
      const res = ctx.Sim.buy(g, id, n, mult);
      if (!res.ok) { Audio.sfx('error'); ctx.toast(res.reason || 'That purchase failed.', 'bad'); return; }
      bought += n;
    }
    if (bought) { Audio.sfx('buy'); ctx.toast('Loaded up.', 'good'); }
    for (const k of Object.keys(cart)) delete cart[k];
    ctx.refreshHud();
    if (outfitting) leaveOutfitting();
    else render();
  }

  function leaveOutfitting() {
    if (g.supplies.food < 40) {
      if (!confirm('You are leaving Campo with almost no food. That is a choice, but it is a bad one. Go anyway?')) return;
    }
    ctx.toast('Northbound.', 'good');
    ctx.close();
  }

  // --- cart repair -------------------------------------------------------
  // Anywhere with a store has a road, and anywhere with a road can true a wheel.
  // Without this the cart only ever decays and the run quietly becomes unwinnable.
  const repairRow = el('div');
  function renderRepair() {
    const cond = Math.round(g.cart.condition);
    if (cond >= 100) {
      mountTo(repairRow, el('p.prose.small.faint', 'The cart is sound. Nothing to do here.'));
      return;
    }
    const quote = ctx.Sim.repairQuote(g, mult);
    const affordable = Math.min(quote, g.supplies.money);
    mountTo(repairRow, el('div.row',
      itemIcon('spare_wheel'),
      el('div.grow',
        el('div.name', 'Work on the cart'),
        el('div.sub', `Condition ${cond}%. A full job runs ${fmtMoney(quote)}.`),
      ),
      button(g.supplies.money >= quote ? 'Repair fully' : `Spend ${fmtMoney(affordable)}`, () => {
        const res = ctx.Sim.repairCart(g, mult);
        if (!res.ok) { Audio.sfx('error'); ctx.toast(res.reason || 'They cannot help.', 'bad'); return; }
        Audio.sfx('hammer');
        ctx.toast(`Cart back to ${Math.round(g.cart.condition)}%.`, 'good');
        ctx.refreshHud();
        renderRepair();
        render();
      }, { cls: 'small', disabled: g.supplies.money < 1 }),
    ));
  }

  const greeting = STORE_GREETINGS[landmark.id]
    || 'The shelves are thin and the prices are honest enough, considering how far the truck has to come.';

  const body = el('div.stack',
    el('p.prose.small', greeting),
    outfitting && el('p.prose.small',
      el('b', 'Buy well here.'), ' This is the cheapest store on the whole trail. Food is the one thing you ',
      'cannot improvise, mules pull the cart, and every spare you skip is a day you will spend sitting in the dirt.'),
    listNode,
    el('hr.divider'),
    el('h3', 'The cart'),
    repairRow,
    el('hr.divider'),
    totalNode,
  );

  const node = panel({
    title: (landmark.store && landmark.store.name) || 'Outfitter',
    meta: `${landmark.name} · mile ${fmtNum(landmark.mile)}${mult > 1 ? ` · prices ×${mult.toFixed(1)}` : ''}`,
    body,
    foot: [
      el('span.spacer'),
      !outfitting && button('Done', () => { Audio.sfx('back'); ctx.close(); }, { cls: 'ghost' }),
      button(outfitting ? 'Buy it and go north' : 'Buy', checkout, { cls: 'primary' }),
      outfitting && button('Leave with what I have', leaveOutfitting, { cls: 'ghost' }),
    ].filter(Boolean),
    cls: 'wide',
  });

  render();
  renderRepair();
  return { node };
}

export { ITEMS };
