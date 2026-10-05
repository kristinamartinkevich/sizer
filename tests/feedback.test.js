const test = require('node:test');
const assert = require('node:assert');
const Feedback = require('../src/feedback.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 5);
const sizing = (over = {}) => ({ itemKey: 'agolde|90s pinch waist', brand: 'Agolde', style: '90s Pinch Waist', kind: 'jeans', shop: 'www.revolve.com', size: '26', tier: 1, at: NOW, ...over });

test('a sizing is remembered once per item, the newest replacing the older', () => {
  let list = Feedback.remember([], sizing({ at: NOW - 3 * DAY, size: '25' }), NOW);
  list = Feedback.remember(list, sizing(), NOW);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].size, '26');
});

test('only the last 50 sizings from the last 60 days are kept, newest first', () => {
  let list = [];
  for (let i = 0; i < 60; i++) list = Feedback.remember(list, sizing({ itemKey: `k${i}`, at: NOW - i * 1000 }), NOW);
  assert.strictEqual(list.length, 50);
  assert.strictEqual(list[0].itemKey, 'k0');
  const old = Feedback.remember([sizing({ itemKey: 'old', at: NOW - 61 * DAY })], sizing(), NOW);
  assert.deepStrictEqual(old.map((s) => s.itemKey), ['agolde|90s pinch waist']);
});

test('the question is due a week after sizing, and never again once answered or dismissed', () => {
  const list = [sizing({ itemKey: 'a', at: NOW - 8 * DAY }), sizing({ itemKey: 'b', at: NOW - 2 * DAY }), sizing({ itemKey: 'c', at: NOW - 9 * DAY, answered: true }), sizing({ itemKey: 'd', at: NOW - 9 * DAY, dismissed: true })];
  assert.deepStrictEqual(Feedback.due(list, NOW).map((s) => s.itemKey), ['a']);
});

test('a revisit asks straight away for an item sized before, whatever its age', () => {
  const list = [sizing({ at: NOW - 2 * DAY })];
  assert.strictEqual(Feedback.askOnRevisit(list, 'agolde|90s pinch waist'), list[0]);
  assert.strictEqual(Feedback.askOnRevisit([sizing({ answered: true })], 'agolde|90s pinch waist'), null);
  assert.strictEqual(Feedback.askOnRevisit(list, 'other'), null);
});

test('an answer becomes a piece you own with that fit', () => {
  assert.deepStrictEqual(Feedback.toAnchor(sizing(), { sizeBought: '27', outcome: 'small' }), { brand: 'Agolde', type: 'jeans', size: '27', fit: 'tight', fromFeedback: true });
  assert.strictEqual(Feedback.toAnchor(sizing(), { sizeBought: '26', outcome: 'right' }).fit, 'perfect');
  assert.strictEqual(Feedback.toAnchor(sizing(), { sizeBought: '26', outcome: 'big' }).fit, 'loose');
});

test('outerwear and unknown kinds become the nearest kind the profile knows', () => {
  assert.strictEqual(Feedback.toAnchor(sizing({ kind: 'dress' }), { sizeBought: 'S', outcome: 'right' }).type, 'dress');
  assert.strictEqual(Feedback.toAnchor(sizing({ kind: 'outerwear' }), { sizeBought: 'S', outcome: 'right' }).type, 'outerwear');
  assert.strictEqual(Feedback.toAnchor(sizing({ kind: null }), { sizeBought: 'S', outcome: 'right' }), null);
});

test('the outcome sent carries the item, the sizes and the verdict, never measurements', () => {
  const body = Feedback.outcomeBody(sizing({ waist: 70 }), { sizeBought: '27', outcome: 'small', areas: ['waist', 'nonsense', 'hip'] }, 'install-1');
  assert.deepStrictEqual(body, {
    item_key: 'agolde|90s pinch waist', brand: 'Agolde', kind: 'jeans', shop: 'www.revolve.com', install: 'install-1',
    size_bought: '27', size_suggested: '26', outcome: 'small', areas: ['waist', 'hip'], chart_tier: 1,
  });
});

test('an outcome with no size or an unknown verdict is not sent', () => {
  assert.strictEqual(Feedback.outcomeBody(sizing(), { sizeBought: '', outcome: 'small' }, 'i'), null);
  assert.strictEqual(Feedback.outcomeBody(sizing(), { sizeBought: '27', outcome: 'meh' }, 'i'), null);
});
