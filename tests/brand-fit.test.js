const test = require('node:test');
const assert = require('node:assert');
const { recommend, learnedFit } = require('../src/engine.js');
const Store = require('../src/charts-store.js');

// What Sizer users who bought a brand said about the fit (migration 0008's brand_fit view), and
// what the engine does with it: a learned tendency once ten outcomes agree, used only when the page
// and its reviews say nothing.

const profile = { anchors: [{ brand: 'zara', size: '38' }, { brand: 'generic-denim', size: '27' }], fitPreference: 'regular' };
const denimSizes = ['W25/L32', 'W26/L32', 'W27/L32', 'W28/L32', 'W29/L32', 'W30/L32'].map((label) => ({ label }));
const stretchy = { brand: 'rag & bone', title: 'Skinny jeans', text: '92% cotton, 6% polyester, 2% elastane', sizes: denimSizes };
const fit = (over = {}) => ({ brand_key: 'rag and bone', kind: 'bottoms', small: 9, tts: 2, large: 1, total: 12, ...over });
const charts = (rows) => ({ brands: [], fetchedAt: 0, brandFit: rows });

test('without outcomes the usual size stands', () => {
  assert.equal(recommend(profile, stretchy, charts([])).size, 'W27/L32');
});

test('twelve users saying it runs small move the size one up, and the reason names them', () => {
  const r = recommend(profile, stretchy, charts([fit()]));
  assert.equal(r.size, 'W28/L32');
  const reason = r.reasons.find((x) => /Sizer users/.test(x.text));
  assert.equal(reason.text, '9 of 12 Sizer users who bought this brand say it runs small.');
  assert.equal(reason.delta, 1);
  assert.equal(r.headline, 'Sizer users say it runs small, sized up');
});

test('when every outcome agrees the reason gives the one number', () => {
  const r = recommend(profile, stretchy, charts([fit({ small: 12, tts: 0, large: 0 })]));
  assert.ok(r.reasons.some((x) => x.text === '12 Sizer users who bought this brand say it runs small.'));
});

test('runs large moves it down; true to size adds a reason and moves nothing', () => {
  assert.equal(recommend(profile, stretchy, charts([fit({ small: 1, large: 9 })])).size, 'W26/L32');
  const tts = recommend(profile, stretchy, charts([fit({ small: 1, tts: 10, large: 1 })]));
  assert.equal(tts.size, 'W27/L32');
  assert.ok(tts.reasons.some((x) => x.text === '10 of 12 Sizer users who bought this brand say it fits true to size.' && !x.delta));
});

test('fewer than ten outcomes are not enough to learn from', () => {
  assert.equal(learnedFit(charts([fit({ small: 9, tts: 0, large: 0, total: 9 })]), ['rag & bone'], 'bottoms'), null);
  assert.equal(recommend(profile, stretchy, charts([fit({ small: 9, tts: 0, large: 0, total: 9 })])).size, 'W27/L32');
});

test('a split verdict teaches nothing', () => {
  assert.equal(learnedFit(charts([fit({ small: 5, tts: 4, large: 3 })]), ['rag & bone'], 'bottoms'), null);
});

test('the page note wins over what users learned', () => {
  const r = recommend(profile, { ...stretchy, text: `${stretchy.text}. This style runs large, we recommend going one size down.` }, charts([fit()]));
  assert.equal(r.size, 'W26/L32');
  assert.ok(!r.reasons.some((x) => /Sizer users/.test(x.text)));
});

test('a page that says true to size also says something, so the learned tendency waits', () => {
  const r = recommend(profile, { ...stretchy, text: `${stretchy.text}. Fits true to size.` }, charts([fit()]));
  assert.equal(r.size, 'W27/L32');
  assert.ok(!r.reasons.some((x) => /Sizer users/.test(x.text)));
});

test('buyers reviews win over what users learned', () => {
  const reviews = ['Runs large, size down.', 'Runs large for sure.', 'Fits large.'];
  const r = recommend(profile, { ...stretchy, reviews }, charts([fit()]));
  assert.equal(r.size, 'W26/L32');
  assert.ok(!r.reasons.some((x) => /Sizer users/.test(x.text)));
});

test('outcomes are per kind of clothing: a brand whose jeans run small says nothing about its dresses', () => {
  assert.equal(learnedFit(charts([fit()]), ['rag & bone'], 'dresses'), null);
  assert.deepEqual(learnedFit(charts([fit()]), ['rag & bone'], 'bottoms'), { verdict: 'small', count: 9, total: 12 });
});

test('the brand is matched by its name or any alias, however the shop writes it', () => {
  assert.ok(learnedFit(charts([fit()]), ['RAG&BONE'], 'bottoms'));
  assert.ok(learnedFit(charts([fit({ brand_key: 'ragbone' })]), ['rag & bone', 'ragbone'], 'bottoms'));
  assert.equal(learnedFit(charts([fit()]), ['mother'], 'bottoms'), null);
  assert.equal(learnedFit(null, ['rag & bone'], 'bottoms'), null);
});

test('shoes learn the same way', () => {
  const shoes = { brand: 'Unknown Shoe Co', title: 'Leather boots', text: '', sizes: ['37', '38', '39', '40'].map((label) => ({ label })) };
  const p = { footLength: 24.2, anchors: [] };
  const base = recommend(p, shoes, charts([]));
  const r = recommend(p, shoes, charts([{ brand_key: 'unknown shoe co', kind: 'shoes', small: 11, tts: 0, large: 0, total: 11 }]));
  assert.notEqual(r.size, base.size);
  assert.ok(r.reasons.some((x) => x.text === '11 Sizer users who bought this brand say it runs small.'));
});

test('the brand_fit rows downloaded are checked before they join the bundle', () => {
  const rows = Store.normaliseBrandFit([
    fit(), { brand_key: 'x', kind: 'hats', small: 1, tts: 1, large: 1, total: 3 }, { brand_key: '', kind: 'tops', small: 1, tts: 0, large: 0, total: 1 },
    { brand_key: 'y', kind: 'tops', small: '4', tts: '3', large: '3', total: '10' }, null,
  ]);
  assert.deepEqual(rows, [fit(), { brand_key: 'y', kind: 'tops', small: 4, tts: 3, large: 3, total: 10 }]);
  assert.throws(() => Store.normaliseBrandFit({}), /not a list/);
});

test('the learned tendencies ride along with the stored chart bundle', () => {
  const bundle = Store.withBrandFit({ brands: [{ id: 'a' }], fetchedAt: 5 }, [fit()]);
  assert.deepEqual(bundle, { brands: [{ id: 'a' }], fetchedAt: 5, brandFit: [fit()] });
  assert.ok(Store.BRAND_FIT_URL.includes('/rest/v1/brand_fit?select=brand_key,kind,small,tts,large,total'));
  const merged = Store.mergeChart(bundle, { id: 'lookup:x', name: 'X', aliases: ['x'], charts: [{ id: 'c', category: 'tops' }] });
  assert.deepEqual(merged.brandFit, [fit()], 'a looked-up chart keeps the learned tendencies');
});

// ---- C6 review: the learned step is added on top, never in place of what it was measured against ----

const step = (a, b) => denimSizes.findIndex((s) => s.label === b) - denimSizes.findIndex((s) => s.label === a);

test('a brand with a researched tendency keeps it, and the learned step is added on top', () => {
  // RE/DONE is researched to run small (+0.5) with a note. The answers counted for it were given to
  // suggestions that already carried that tendency, so the step corrects what is left.
  const redone = { brand: 'RE/DONE', title: '70s stove pipe jeans', text: '92% cotton, 6% polyester, 2% elastane', sizes: denimSizes };
  const NOTE = 'Vintage-cut rigid denim, widely reported to run small.';
  const base = recommend(profile, redone, charts([]));
  const learned = recommend(profile, redone, charts([fit({ brand_key: 're done' })]));
  assert.ok(base.reasons.some((x) => x.text === NOTE), JSON.stringify(base.reasons));
  assert.ok(learned.reasons.some((x) => x.text === NOTE), JSON.stringify(learned.reasons));
  assert.equal(step(base.size, learned.size), 1, `${base.size} then ${learned.size}`);
  assert.deepEqual([base.learnedStep, learned.learnedStep], [0, 1]);
});

test('on rigid fabric the lean stays and the learned step is added on top', () => {
  const rigid = { ...stretchy, title: 'Straight jeans', text: '100% cotton rigid denim, no stretch' };
  const base = recommend(profile, rigid, charts([]));
  const learned = recommend(profile, rigid, charts([fit()]));
  assert.ok(learned.reasons.some((x) => /No stretch/.test(x.text)), JSON.stringify(learned.reasons));
  assert.equal(step(base.size, learned.size), 1, `${base.size} then ${learned.size}`);
  assert.equal(learned.alternative, null, 'no alternative size once the learned step moved it');
});

test('runs large from Sizer users is a step down, recorded as -1', () => {
  const r = recommend(profile, stretchy, charts([fit({ small: 1, large: 9, tts: 2 })]));
  assert.equal(r.size, 'W26/L32');
  assert.equal(r.learnedStep, -1);
});
