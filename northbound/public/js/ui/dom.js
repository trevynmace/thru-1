// NORTHBOUND — DOM helpers.
// Small, dependency-free builders so screen modules read like markup instead of
// twenty lines of createElement per panel.

/** el('div.card.selected', { onclick }, 'text', childNode, ...) */
export function el(spec, props, ...children) {
  const [tagPart, ...classes] = String(spec).split('.');
  const [tag, id] = tagPart.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  add(node, children);
  return node;
}

function add(node, children) {
  for (const c of children.flat(4)) {
    if (c == null || c === false || c === '') continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mountTo(node, ...children) {
  clear(node);
  add(node, children);
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** A standard bordered panel with head / body / foot. */
export function panel({ title, meta, body, foot, cls = '' }) {
  return el('div.panel' + (cls ? '.' + cls.split(' ').join('.') : ''),
    (title || meta) && el('div.panel-head',
      el('h2', title || ''),
      meta && el('div.meta', meta),
    ),
    body,
    foot && el('div.panel-foot', foot),
  );
}

/** Button with an optional secondary hint line. */
export function button(label, onclick, { cls = '', hint = '', disabled = false, key = '' } = {}) {
  return el('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), {
    onclick, disabled, type: 'button', dataset: key ? { key } : {},
  }, key ? `${key}. ${label}` : label, hint && el('span.hint', hint));
}

/** A segmented control. options: [{value, label, title}] */
export function segmented(options, value, onchange) {
  const wrap = el('div.seg');
  for (const o of options) {
    wrap.appendChild(el('button.seg-btn' + (o.value === value ? '.active' : ''), {
      type: 'button', title: o.title || '',
      onclick: () => {
        [...wrap.children].forEach((c) => c.classList.remove('active'));
        wrap.children[options.indexOf(o)].classList.add('active');
        onchange(o.value);
      },
    }, o.label));
  }
  return wrap;
}

/** 0..100 meter with severity colouring. */
export function meter(pct) {
  const p = Math.max(0, Math.min(100, pct));
  const cls = p > 66 ? '' : p > 40 ? '.mid' : p > 18 ? '.low' : '.crit';
  return el('div.meter' + cls, el('i', { style: { width: p + '%' } }));
}

/** A key/value grid: rows is [[label, value], ...] */
export function kv(rows) {
  return el('div.kv', rows.filter(Boolean).map(([k, v]) => el('div', el('span', k), el('b', String(v)))));
}

export function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('en-US');
}

export function fmtNum(n, digits = 0) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function plural(n, one, many) {
  return `${fmtNum(n)} ${Math.abs(n) === 1 ? one : (many || one + 's')}`;
}
