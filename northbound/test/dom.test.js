// NORTHBOUND — the DOM helper's selector parsing.
//
// `el()` is used by every screen, and a mis-parsed `#id` fails silently: the element
// still renders, it just has a class literally named "menu#thing" and no id, so
// getElementById and any `#id` selector quietly find nothing. That cost a stuck
// playtest once; these tests make sure it stays fixed.
import test from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the tiny slice of the DOM that el() touches.
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.attrs = {};
    this.listeners = {};
  }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = v; }
}

globalThis.document = {
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => ({ text: String(t) }),
};
globalThis.Node = FakeEl;

const { el } = await import('../public/js/ui/dom.js');

test('el(): tag, classes and id parse from any segment', () => {
  const cases = [
    ['div', 'DIV', '', ''],
    ['span.muted', 'SPAN', '', 'muted'],
    ['div.a.b.c', 'DIV', '', 'a b c'],
    ['section#only', 'SECTION', 'only', ''],
    ['div#box.card', 'DIV', 'box', 'card'],
    ['div.menu-numbered#event-choices', 'DIV', 'event-choices', 'menu-numbered'],
    ['button.btn.wide#go', 'BUTTON', 'go', 'btn wide'],
  ];
  for (const [spec, tag, id, cls] of cases) {
    const n = el(spec);
    assert.equal(n.tagName, tag, `${spec} tag`);
    assert.equal(n.id, id, `${spec} id`);
    assert.equal(n.className, cls, `${spec} class`);
  }
});

test('el(): a class is never left holding a # fragment', () => {
  for (const spec of ['div.menu#x', 'p.a.b#y', 'div#z.a.b']) {
    const n = el(spec);
    assert.ok(!n.className.includes('#'), `${spec} leaked a # into className: "${n.className}"`);
    assert.ok(n.id && !n.id.includes('.'), `${spec} produced a bad id: "${n.id}"`);
  }
});

test('el(): props, children and text all land', () => {
  const child = el('span');
  const n = el('div.card', { title: 'hi' }, 'text', child);
  assert.equal(n.attrs.title ?? n.title, 'hi');
  assert.equal(n.children.length, 2);
  assert.equal(n.children[1], child);
});

test('el(): the props argument is optional', () => {
  const n = el('div', 'just text');
  assert.equal(n.children.length, 1);
});
