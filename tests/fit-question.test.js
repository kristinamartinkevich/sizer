const test = require('node:test');
const assert = require('node:assert');
const Q = require('../src/fit-question.js');

const AT = new Date(2026, 8, 27, 12).getTime();
const sizing = (over = {}) => ({ itemKey: 'agolde|90s', brand: 'AGOLDE', style: '90s Pinch Waist jeans', kind: 'bottoms', type: 'jeans', shop: 'www.revolve.com', size: '26', sizes: ['25', '26', '27'], tier: 1, at: AT, ...over });

test('the question starts with "Did you buy it?" and names the item, the shop and the size suggested', () => {
  const html = Q.html(Q.start(sizing()));
  assert.match(html, /Did you buy it\?/);
  assert.match(html, /AGOLDE 90s Pinch Waist jeans/);
  assert.match(html, /revolve\.com, sized 26 on 27 Sep/);
  assert.match(html, /data-fq="yes"/);
  assert.match(html, /data-fq="no"/);
});

test('yes asks which size, offering the suggested size first and the page sizes', () => {
  const s = Q.next(Q.start(sizing()), 'yes');
  assert.strictEqual(s.step, 'size');
  assert.deepStrictEqual(Q.sizeChoices(s.sizing), ['26', '25', '27']);
  assert.match(Q.html(s), /Which size\?/);
  assert.match(Q.html(s), /data-fq-input/);
});

test('no dismisses the question', () => {
  const s = Q.next(Q.start(sizing()), 'no');
  assert.strictEqual(s.step, 'dismissed');
  assert.match(Q.html(s), /will not ask about this one again/);
});

test('a size, then too small with areas, gives the answer to send', () => {
  let s = Q.next(Q.next(Q.start(sizing()), 'yes'), 'size', '27');
  assert.strictEqual(s.step, 'fit');
  assert.match(Q.html(s), /How did 27 fit\?/);
  s = Q.next(s, 'outcome', 'small');
  assert.match(Q.html(s), /Where\? Optional\./);
  s = Q.next(Q.next(Q.next(s, 'area', 'waist'), 'area', 'hip'), 'area', 'waist');
  s = Q.next(s, 'area', 'sleeve');
  assert.deepStrictEqual(s.areas, ['hip'], 'tapping an area twice clears it, and areas of another kind are ignored');
  s = Q.next(s, 'send');
  assert.strictEqual(s.step, 'sending');
  assert.deepStrictEqual(Q.answerOf(s), { sizeBought: '27', outcome: 'small', areas: ['hip'] });
  assert.strictEqual(Q.next(s, 'sent').step, 'done');
});

test('right needs no areas, and clears any picked before', () => {
  let s = Q.next(Q.next(Q.start(sizing()), 'yes'), 'size', '26');
  s = Q.next(Q.next(s, 'outcome', 'big'), 'area', 'waist');
  s = Q.next(s, 'outcome', 'right');
  assert.deepStrictEqual(s.areas, []);
  assert.doesNotMatch(Q.html(s), /Where\?/);
});

test('saving without a verdict, or with an empty typed size, asks again', () => {
  let s = Q.next(Q.next(Q.start(sizing()), 'yes'), 'size', '  ');
  assert.strictEqual(s.step, 'size');
  assert.ok(s.error);
  s = Q.next(Q.next(s, 'size', 'W27'), 'send');
  assert.strictEqual(s.step, 'fit');
  assert.ok(s.error);
});

test('a failed save keeps the choices and says so', () => {
  let s = Q.next(Q.next(Q.next(Q.start(sizing()), 'yes'), 'size', '27'), 'outcome', 'right');
  s = Q.next(Q.next(s, 'send'), 'failed');
  assert.strictEqual(s.step, 'fit');
  assert.strictEqual(s.outcome, 'right');
  assert.match(Q.html(s), /could not save/);
});

test('page text in a sizing is escaped', () => {
  const html = Q.html(Q.start(sizing({ brand: '<img src=x onerror=alert(1)>', style: 'x" onclick="y' })));
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /" onclick/);
});

test('the question copy has no em dashes or exclamation marks', () => {
  let s = Q.start(sizing());
  const pages = [Q.html(s)];
  s = Q.next(s, 'yes'); pages.push(Q.html(Q.next(s, 'size', ' ')));
  s = Q.next(Q.next(s, 'size', '27'), 'outcome', 'small'); pages.push(Q.html(s));
  pages.push(Q.html(Q.next(Q.next(s, 'send'), 'failed')), Q.html(Q.next(Q.next(s, 'send'), 'sent')), Q.html(Q.next(Q.start(sizing()), 'no')));
  for (const p of pages) assert.doesNotMatch(p.replace(/<[^>]+>/g, ''), /—|!/);
});
