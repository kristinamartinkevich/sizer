const test = require('node:test');
const assert = require('node:assert');
const Feedback = require('../src/feedback.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 5);
const sizing = (over = {}) => ({ itemKey: 'agolde|90s', brand: 'Agolde', style: '90s', kind: 'bottoms', type: 'jeans', shop: 'www.revolve.com', size: '26', tier: 1, at: NOW, ...over });

test('a sizing is remembered once per item, the newest replacing the older', () => {
  let list = Feedback.remember([], sizing({ at: NOW - 3 * DAY, size: '25' }), NOW);
  list = Feedback.remember(list, sizing(), NOW);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].size, '26');
});

test('sizing an item again keeps the answer or dismissal it already has', () => {
  let list = Feedback.remember([], sizing({ at: NOW - 9 * DAY, answered: NOW - DAY }), NOW);
  list = Feedback.remember(list, sizing(), NOW);
  assert.strictEqual(list[0].answered, NOW - DAY);
  list = Feedback.remember([sizing({ itemKey: 'b', at: NOW - 9 * DAY, dismissed: true })], sizing({ itemKey: 'b' }), NOW);
  assert.strictEqual(list[0].dismissed, true);
});

test('only the last 50 sizings from the last 60 days are kept, newest first', () => {
  let list = [];
  for (let i = 0; i < 60; i++) list = Feedback.remember(list, sizing({ itemKey: `k${i}`, at: NOW - i * 1000 }), NOW);
  assert.strictEqual(list.length, 50);
  assert.strictEqual(list[0].itemKey, 'k0');
  const old = Feedback.remember([sizing({ itemKey: 'old', at: NOW - 61 * DAY })], sizing(), NOW);
  assert.deepStrictEqual(old.map((s) => s.itemKey), ['agolde|90s']);
});

test('the question is due a week after sizing, and never again once answered or dismissed', () => {
  const list = [sizing({ itemKey: 'a', at: NOW - 8 * DAY }), sizing({ itemKey: 'b', at: NOW - 2 * DAY }), sizing({ itemKey: 'c', at: NOW - 9 * DAY, answered: true }), sizing({ itemKey: 'd', at: NOW - 9 * DAY, dismissed: true })];
  assert.deepStrictEqual(Feedback.due(list, NOW).map((s) => s.itemKey), ['a']);
});

test('a revisit asks straight away for an item sized before, whatever its age', () => {
  const list = [sizing({ at: NOW - 2 * DAY })];
  assert.strictEqual(Feedback.askOnRevisit(list, 'agolde|90s'), list[0]);
  assert.strictEqual(Feedback.askOnRevisit([sizing({ answered: true })], 'agolde|90s'), null);
  assert.strictEqual(Feedback.askOnRevisit(list, 'other'), null);
});

test('reloading the page soon after sizing it is not a revisit', () => {
  assert.strictEqual(Feedback.askOnRevisit([sizing({ at: NOW - 60 * 1000 })], 'agolde|90s', NOW), null);
  assert.ok(Feedback.askOnRevisit([sizing({ at: NOW - 13 * 60 * 60 * 1000 })], 'agolde|90s', NOW));
});

test('an answer becomes a piece you own with that fit', () => {
  assert.deepStrictEqual(Feedback.toAnchor(sizing(), { sizeBought: '27', outcome: 'small' }), { brand: 'Agolde', type: 'jeans', size: '27', fit: 'tight', fromFeedback: true });
  assert.strictEqual(Feedback.toAnchor(sizing(), { sizeBought: '26', outcome: 'right' }).fit, 'perfect');
  assert.strictEqual(Feedback.toAnchor(sizing(), { sizeBought: '26', outcome: 'big' }).fit, 'loose');
});

test('outerwear and unknown kinds become the nearest kind the profile knows', () => {
  const as = (over) => Feedback.toAnchor(sizing({ type: undefined, ...over }), { sizeBought: 'S', outcome: 'right' });
  assert.strictEqual(as({ kind: 'dresses' }).type, 'dress');
  assert.strictEqual(as({ kind: 'outerwear' }).type, 'jacket');
  assert.strictEqual(as({ kind: 'tops' }).type, 'top');
  assert.strictEqual(as({ kind: 'bottoms' }).type, 'trousers');
  assert.strictEqual(as({ kind: 'shoes' }).type, 'shoes');
  assert.strictEqual(as({ kind: null }), null);
});

test('the piece type is read from the title: jeans, skirts and shorts are told apart from trousers', () => {
  assert.strictEqual(Feedback.typeOf('Wren straight leg jeans', 'bottoms'), 'jeans');
  assert.strictEqual(Feedback.typeOf('Pleated midi skirt', 'bottoms'), 'skirt');
  assert.strictEqual(Feedback.typeOf('Denim shorts', 'bottoms'), 'shorts');
  assert.strictEqual(Feedback.typeOf('Wide-leg trousers', 'bottoms'), 'trousers');
  assert.strictEqual(Feedback.typeOf('Wool coat', 'outerwear'), 'jacket');
  assert.strictEqual(Feedback.typeOf('Slip dress', 'dresses'), 'dress');
  assert.strictEqual(Feedback.typeOf('Anything', 'nonsense'), null);
});

test('the outcome sent carries the item, the sizes and the verdict, never measurements', () => {
  const body = Feedback.outcomeBody(sizing({ waist: 70, sizes: ['25', '26'] }), { sizeBought: '27', outcome: 'small', areas: ['waist', 'nonsense', 'hip'] }, 'install-1');
  assert.deepStrictEqual(body, {
    item_key: 'agolde|90s', brand: 'Agolde', kind: 'bottoms', shop: 'www.revolve.com', install: 'install-1',
    size_bought: '27', size_suggested: '26', outcome: 'small', areas: ['waist', 'hip'], chart_tier: 1,
  });
});

test('the kind sent is the kind of clothing, so outcomes pool per brand and kind', () => {
  assert.strictEqual(Feedback.outcomeBody(sizing({ kind: 'jeans' }), { sizeBought: '27', outcome: 'small' }, 'i').kind, 'bottoms');
  assert.strictEqual(Feedback.outcomeBody(sizing({ kind: 'outerwear' }), { sizeBought: 'M', outcome: 'right' }, 'i').kind, 'outerwear');
});

test('an outcome with no size, no kind or an unknown verdict is not sent', () => {
  assert.strictEqual(Feedback.outcomeBody(sizing(), { sizeBought: '', outcome: 'small' }, 'i'), null);
  assert.strictEqual(Feedback.outcomeBody(sizing(), { sizeBought: '27', outcome: 'meh' }, 'i'), null);
  assert.strictEqual(Feedback.outcomeBody(sizing({ kind: null }), { sizeBought: '27', outcome: 'small' }, 'i'), null);
});

test('a "right" answer sends no areas; only a size that did not fit says where', () => {
  assert.deepStrictEqual(Feedback.outcomeBody(sizing(), { sizeBought: '26', outcome: 'right', areas: ['waist'] }, 'i').areas, []);
});

test('a sizing is built from the answer the page showed, with the page sizes kept for the question', () => {
  const s = Feedback.sizingFrom({ brand: 'AGOLDE', title: '90s Pinch Waist jeans', sizes: [{ label: '25' }, { label: '26' }] }, { ok: true, size: '26', kind: 'bottoms', source: { tier: 2 } }, 'agolde|90s', 'www.revolve.com', NOW);
  assert.deepStrictEqual(s, { itemKey: 'agolde|90s', brand: 'AGOLDE', style: '90s Pinch Waist jeans', kind: 'bottoms', type: 'jeans', shop: 'www.revolve.com', size: '26', tier: 2, sizes: ['25', '26'], at: NOW });
  assert.strictEqual(Feedback.sizingFrom({ brand: 'X', title: 'Boots', sizes: [] }, { ok: true, size: 'EU 38', shoes: true }, 'x|boots', 'shop.example', NOW).kind, 'shoes');
  assert.strictEqual(Feedback.sizingFrom({ brand: 'X', title: 'Jeans', sizes: [] }, { ok: true, size: '26', kind: 'bottoms' }, 'x|y', 'shop.example', NOW).tier, null);
  assert.strictEqual(Feedback.sizingFrom({ brand: 'X', title: 'Jeans', sizes: [] }, { ok: false }, 'x|y', 'shop.example', NOW), null);
  assert.strictEqual(Feedback.sizingFrom({ brand: 'X', title: 'Jeans', sizes: [] }, { ok: true, size: '26', kind: 'bottoms' }, null, 'shop.example', NOW), null);
});

test('answering adds the piece to the profile, marks the sizing and gives the body to send', () => {
  const profile = { waist: '70', anchors: [{ brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' }] };
  const out = Feedback.applyAnswer([sizing({ at: NOW - 8 * DAY })], profile, 'agolde|90s', { sizeBought: '27', outcome: 'big', areas: ['waist'] }, 'install-1', NOW);
  assert.strictEqual(out.list[0].answered, NOW);
  assert.strictEqual(out.list[0].outcome, 'big');
  assert.strictEqual(out.profile.anchors.length, 2);
  assert.deepStrictEqual(out.profile.anchors[1], { brand: 'Agolde', type: 'jeans', size: '27', fit: 'loose', fromFeedback: true });
  assert.strictEqual(out.profile.waist, '70');
  assert.strictEqual(profile.anchors.length, 1, 'the stored profile is not mutated');
  assert.strictEqual(out.body.outcome, 'big');
  assert.deepStrictEqual(Object.keys(out.body).sort(), ['areas', 'brand', 'chart_tier', 'install', 'item_key', 'kind', 'outcome', 'shop', 'size_bought', 'size_suggested']);
});

test('answering the same piece twice updates its fit instead of adding a second one', () => {
  const profile = { anchors: [{ brand: 'Agolde', type: 'jeans', size: '27', fit: 'loose', fromFeedback: true }] };
  const out = Feedback.applyAnswer([sizing()], profile, 'agolde|90s', { sizeBought: '27', outcome: 'right' }, 'i', NOW);
  assert.strictEqual(out.profile.anchors.length, 1);
  assert.strictEqual(out.profile.anchors[0].fit, 'perfect');
});

test('an answer for an item Sizer does not have, or with no size, changes nothing', () => {
  const profile = { anchors: [] };
  assert.strictEqual(Feedback.applyAnswer([sizing()], profile, 'other', { sizeBought: '27', outcome: 'right' }, 'i', NOW), null);
  assert.strictEqual(Feedback.applyAnswer([sizing()], profile, 'agolde|90s', { sizeBought: '', outcome: 'right' }, 'i', NOW), null);
});

test('dismissing marks the sizing so it is never asked about again', () => {
  const list = Feedback.dismiss([sizing({ at: NOW - 8 * DAY })], 'agolde|90s');
  assert.strictEqual(list[0].dismissed, true);
  assert.deepStrictEqual(Feedback.due(list, NOW), []);
});

test('an outcome that could not be sent waits, one per item, at most twenty', () => {
  let box = [];
  for (let i = 0; i < 25; i++) box = Feedback.enqueue(box, { item_key: `k|${i}`, outcome: 'right' });
  assert.strictEqual(box.length, 20);
  assert.strictEqual(box[0].item_key, 'k|24');
  box = Feedback.enqueue(box, { item_key: 'k|24', outcome: 'small' });
  assert.strictEqual(box.filter((b) => b.item_key === 'k|24').length, 1);
  assert.strictEqual(box[0].outcome, 'small');
  assert.deepStrictEqual(Feedback.enqueue(undefined, null), []);
});

test('the areas offered depend on the kind of clothing and are all ones the server accepts', () => {
  assert.deepStrictEqual(Feedback.areasFor('bottoms'), ['waist', 'hip', 'inseam', 'length']);
  assert.deepStrictEqual(Feedback.areasFor('shoes'), ['foot']);
  for (const k of ['bottoms', 'tops', 'dresses', 'outerwear', 'shoes']) for (const a of Feedback.areasFor(k)) assert.ok(Feedback.AREAS.includes(a), a);
});
