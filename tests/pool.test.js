const test = require('node:test');
const assert = require('node:assert');
const { itemKey, poolExcept } = require('../src/charts-store.js');
const { recommend, analyzeReviews } = require('../src/engine.js');

test('the same style on different shops shares one key', () => {
  assert.equal(itemKey('rag & bone', 'WREN - Straight leg jeans - blue denim'), 'rag and bone|wren');
  assert.equal(itemKey('rag & bone', 'rag & bone Wren straight-leg jeans'), 'rag and bone|wren');
  assert.equal(itemKey("Levi's", "501 Original Straight Jeans"), 'levi s|501');
  assert.equal(itemKey('', 'Wren jeans'), null);
  assert.equal(itemKey('COS', 'Jeans'), null);
});

const rows = [
  { vendor: 'www.zalando.de', small: 23, large: 2, tts: 9, total: 51 },
  { vendor: 'www.net-a-porter.com', small: 11, large: 1, tts: 4, total: 20 },
  { vendor: 'www.rag-bone.com', small: 0, large: 0, tts: 0, total: 0 },
];

test('other shops are summed once each, the current shop left out', () => {
  const p = poolExcept(rows, 'www.zalando.de');
  assert.deepEqual(p, { small: 11, large: 1, tts: 4, total: 20, vendors: 2 });
});

test('pooled reviews join the local ones and the local tally stays reportable', () => {
  const r = analyzeReviews(['Runs small for me'], '', poolExcept(rows, 'www.mytheresa.com'));
  assert.deepEqual(r.local, { small: 1, large: 0, tts: 0, total: 1, fromSummary: false });
  assert.equal(r.small, 35);
  assert.equal(r.mentions, 51);
  assert.equal(r.total, 72);
  assert.equal(r.vendors, 3);
  assert.equal(r.verdict, 'small');
});

const profile = { anchors: [{ brand: 'zara', size: '38' }, { brand: 'generic-denim', size: '27' }], fitPreference: 'regular' };
const sizes = ['25', '26', '27', '28', '29', '30'].map((label) => ({ label }));
const stretchy = { brand: 'rag & bone', title: 'WREN - Straight leg jeans', text: '2% elastane', sizes };

test('what buyers said elsewhere moves the size and says how many shops', () => {
  const r = recommend(profile, { ...stretchy, reviews: [], poolFit: poolExcept(rows, 'www.mytheresa.com') });
  assert.equal(r.size, '28');
  assert.equal(r.headline, 'Buyers say it runs small, sized up');
  assert.ok(r.reasons.some((x) => /34 of 50 reviews that mention fit, across 3 shops/.test(x.text)), JSON.stringify(r.reasons));
});

test('the page’s own note still wins over the pool', () => {
  const r = recommend(profile, { ...stretchy, text: '2% elastane. Fits large, we recommend going one size down.', poolFit: poolExcept(rows, 'x') });
  assert.equal(r.size, '26');
});
