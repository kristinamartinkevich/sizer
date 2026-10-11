const test = require('node:test');
const assert = require('node:assert');
const { recommend, parseSizeLabel, findBrand, analyzeText } = require('../src/engine.js');

const profile = { anchors: [{ brand: 'zara', size: '38' }, { brand: 'generic-denim', size: '27' }], fitPreference: 'regular' };
const denimSizes = ['W25/L32', 'W26/L32', 'W27/L32', 'W28/L32', 'W29/L32', 'W30/L32'].map((label) => ({ label }));

test('rigid rag & bone that runs small: one size up from the usual 27', () => {
  const r = recommend(profile, {
    brand: 'rag & bone',
    title: 'Jeans Straight Leg',
    text: 'Outer fabric material: 100% cotton. Stretch: No stretch. This item runs small, we recommend ordering one size up.',
    sizes: denimSizes,
  });
  assert.equal(r.size, 'W28/L32');
  assert.equal(r.confidence, 'High');
});

test('stretch rag & bone with no fit note stays at the usual 27', () => {
  const r = recommend(profile, { brand: 'rag & bone', title: 'Skinny jeans', text: '92% cotton, 6% polyester, 2% elastane', sizes: denimSizes });
  assert.equal(r.size, 'W27/L32');
});

test('Zara itself gives back the anchored size', () => {
  const r = recommend({ anchors: [{ brand: 'zara', size: '38' }] }, { brand: 'Zara', title: 'Wide leg trousers', text: '', sizes: ['32', '34', '36', '38', '40'].map((label) => ({ label })) });
  assert.equal(r.size, '38');
});

test('letter sizes on a Zara page map through Zara letters', () => {
  const r = recommend({ anchors: [{ brand: 'zara', size: '38' }] }, { brand: 'Zara', title: 'Trousers', text: '', sizes: ['XS', 'S', 'M', 'L'].map((label) => ({ label })) });
  assert.equal(r.size, 'M');
});

test('runs-large note sizes down', () => {
  const r = recommend(profile, { brand: "Levi's", title: 'Jeans', text: 'Fits large, we recommend going one size down. 99% cotton 1% elastane', sizes: ['25', '26', '27', '28', '29'].map((label) => ({ label })) });
  assert.equal(r.size, '26');
});

test('sold-out pick is flagged', () => {
  const r = recommend(profile, { brand: 'rag & bone', title: 'Jeans', text: '2% elastane', sizes: denimSizes.map((s) => ({ ...s, available: s.label !== 'W27/L32' })) });
  assert.equal(r.size, 'W27/L32');
  assert.equal(r.available, false);
});

test('parses common size labels', () => {
  assert.deepEqual(parseSizeLabel('W27 L30'), { system: 'denim', value: 27, length: 30, label: 'W27 L30' });
  assert.equal(parseSizeLabel('27/32').system, 'denim');
  assert.equal(parseSizeLabel('EU 38').value, 38);
  assert.equal(parseSizeLabel('IT 42').system, 'it');
  assert.equal(parseSizeLabel('XS').value, 'XS');
  assert.equal(parseSizeLabel('Notify me'), null);
});

test('finds brands inside longer strings', () => {
  assert.equal(findBrand('rag&bone MIRAMAR - Jeans Skinny Fit').id, 'rag-bone');
  assert.equal(findBrand('Pull&Bear Mom jeans').id, 'pull-bear');
  assert.equal(findBrand('Some unknown label'), null);
});

test('reads German Zalando fit notes', () => {
  const s = analyzeText('Passform: Fällt klein aus. Wir empfehlen, eine Größe größer zu bestellen. Obermaterial: 100% Baumwolle');
  assert.equal(s.fitNote, 'small');
  assert.equal(s.stretch, 'none');
});

const { bodyFromProfile, disagreeing } = require('../src/engine.js');

test('wardrobe items accept a typed brand name and resolve to its chart', () => {
  const typed = bodyFromProfile({ anchors: [{ brand: 'Zara', type: 'trousers', size: '38', fit: 'perfect' }] });
  const byId = bodyFromProfile({ anchors: [{ brand: 'zara', size: '38' }] });
  assert.equal(typed.waist, byId.waist);
  assert.equal(typed.sources[0], 'Zara 38');
});

test('an unknown brand of jeans reads a bare number as a denim waist', () => {
  const other = bodyFromProfile({ anchors: [{ brand: 'Some Label', type: 'jeans', size: '27' }] });
  const generic = bodyFromProfile({ anchors: [{ brand: 'generic-denim', size: '27' }] });
  assert.equal(other.waist, generic.waist);
});

test('an unknown brand of trousers reads 38 as EU, not a 38 inch waist', () => {
  const b = bodyFromProfile({ anchors: [{ brand: '', type: 'trousers', size: '38' }] });
  assert.ok(b.waist < 80, `waist ${b.waist}`);
});

test('an item that fits tight means a slightly bigger body than its size', () => {
  const perfect = bodyFromProfile({ anchors: [{ brand: 'Zara', size: '38', fit: 'perfect' }] });
  const tight = bodyFromProfile({ anchors: [{ brand: 'Zara', size: '38', fit: 'tight' }] });
  const loose = bodyFromProfile({ anchors: [{ brand: 'Zara', size: '38', fit: 'loose' }] });
  assert.ok(tight.hip > perfect.hip && loose.hip < perfect.hip);
});

test('measurements win over wardrobe, and the wardrobe still reports disagreement', () => {
  const b = bodyFromProfile({ waist: '70', hip: '96', anchors: [{ brand: 'Zara', size: '44' }] });
  assert.equal(b.waist, 70);
  assert.equal(b.hip, 96);
  assert.ok(b.spread > 5);
});

// QA 2026-10-11: Zalando said "Customers say these fit tight around the ankle." above the picker, and
// the sheet listed the fit note as None.
test('a fit note about one part of the body is kept, though it does not move the size', () => {
  const s = analyzeText('Customers say these fit tight around the ankle. Upper: textile.');
  assert.strictEqual(s.fitNote, null);
  assert.strictEqual(s.fitDetail, 'Customers say these fit tight around the ankle');
  assert.strictEqual(analyzeText('Narrow at the toes, so wide feet may want more room.').fitDetail, 'Narrow at the toes, so wide feet may want more room');
  assert.strictEqual(analyzeText('Wide leg jeans in organic cotton.').fitDetail, null, 'a style name is not a fit note');
  assert.strictEqual(analyzeText('Runs small, we recommend sizing up. Tight at the ankle.').fitDetail, null, 'a size note takes the row');
});

// QA 2026-10-11: on ASOS the answer was "UK 14" and the reason said "fit like standard between 40 and
// 42", with nothing to say those were EU sizes.
test('a reason names the size system it compares in', () => {
  const pear = { waist: '74', hip: '102', anchors: [] };
  const r = recommend(pear, { brand: 'Unknown Label', title: 'Soft utility cargo trousers', text: '', sizes: ['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16'].map((label) => ({ label })) });
  assert.match(r.reasons[0].text, /like a standard (?:EU \d+|between EU \d+ and \d+)\.$/);
  const dress = recommend(pear, { brand: 'Unknown Label', title: 'Midi dress', text: '', sizes: ['XS', 'S', 'M', 'L', 'XL'].map((label) => ({ label })) });
  assert.match(dress.reasons[0].text, /like a standard (?:[A-Z]+|between [A-Z]+ and [A-Z]+)\.$/, 'letters need no system');
  const jeans = recommend(pear, { brand: 'Unknown Label', title: 'Straight jeans', text: '', sizes: ['26', '27', '28', '29', '30', '31'].map((label) => ({ label })) });
  assert.match(jeans.reasons[0].text, /like a standard W\d+½?\.$/);
});

// QA 2026-10-11: a COS top in S read as a waist and hip, pulled the hip down from 101.6 to 98.8 cm
// and took Mango jeans from EU 40 to EU 38.
test('a top you own says nothing about your waist or hip, so it never moves a jeans size', () => {
  const jeans = { brand: "Levi's", type: 'jeans', size: 'W29 L32', fit: 'perfect' };
  const top = { brand: 'COS', type: 'top', size: 'S', fit: 'perfect' };
  const page = { brand: 'Mango', title: 'Straight jeans', text: '', sizes: [] };
  const alone = bodyFromProfile({ anchors: [jeans] });
  const both = bodyFromProfile({ anchors: [jeans, top] });
  assert.equal(both.hip, alone.hip);
  assert.equal(both.waist, alone.waist);
  assert.equal(recommend({ anchors: [jeans, top] }, page).size, recommend({ anchors: [jeans] }, page).size);
  assert.ok(both.bust > 0, 'the top still tells the bust');
});

test('a dress you own still tells the waist and hip', () => {
  const b = bodyFromProfile({ anchors: [{ brand: 'Zara', type: 'dress', size: 'M', fit: 'perfect' }] });
  assert.ok(b.waist > 0 && b.hip > 0);
});

// QA 2026-10-11: Zara trousers in M marked "a bit tight" on a 102 cm hip were flagged as disagreeing,
// though a tight pair is exactly what that hip predicts.
test('a piece marked tight that sits under your measurements does not count as disagreeing', () => {
  const zara = (fit) => ({ waist: '74', hip: '102', anchors: [{ brand: 'Zara', type: 'trousers', size: 'M', fit }] });
  assert.deepStrictEqual(disagreeing(bodyFromProfile(zara('tight'))), []);
  assert.ok(bodyFromProfile(zara('tight')).spread <= 5);
  assert.deepStrictEqual(disagreeing(bodyFromProfile(zara('perfect'))), ['Zara M'], 'the same pair marked just right still disagrees');
  assert.deepStrictEqual(disagreeing(bodyFromProfile({ waist: '70', hip: '96', anchors: [{ brand: 'Zara', size: '44', fit: 'tight' }] })), ['Zara 44'], 'tight does not excuse a pair bigger than you');
});

// ---- the answer in plain words, stock fallback, first run ------------------

const stevie = {
  brand: 'rag & bone',
  title: 'STEVIE - Straight leg jeans',
  text: 'Outer fabric material: 65% cotton, 35% polyester. Fit: Relaxed. Stretch level: no stretch',
  sizes: [['26', true], ['27', false], ['28', false], ['29', false], ['30', true]].map(([label, available]) => ({ label, available })),
};

test('a sold-out pick offers the nearest size in stock and says which way it fits', () => {
  const r = recommend(profile, stevie);
  assert.equal(r.size, '28');
  assert.equal(r.available, false);
  assert.deepEqual(r.inStock, { size: '30', steps: 2, other: { size: '26', steps: -2 } });
});

test('the headline names the deciding factor', () => {
  assert.equal(recommend(profile, stevie).headline, 'No stretch, sized up');
  const small = recommend(profile, { ...stevie, text: '100% cotton. No stretch. Runs small, size up.' });
  assert.equal(small.headline, 'Runs small, sized up');
  const stretch = recommend(profile, { ...stevie, text: '92% cotton 6% polyester 2% elastane' });
  assert.equal(stretch.headline, 'Your usual fit');
});

test('the first reason says what your sizes equal in this brand, in half sizes', () => {
  const r = recommend(profile, stevie);
  assert.match(r.reasons[0].text, /^Your Zara 38 and jeans 27 fit like rag & bone 27½\.$/);
});

test('reasons only carry whole-size moves', () => {
  const r = recommend(profile, { ...stevie, text: '100% cotton denim, skinny fit, 4% elastane' });
  assert.ok(r.reasons.every((x) => x.delta == null || Number.isInteger(x.delta)));
});

test('a single wardrobe item says how to firm the answer up', () => {
  const r = recommend({ anchors: [{ brand: 'Zara', size: '38' }] }, stevie);
  assert.equal(r.firmUp, 'Add another piece you own to firm this up.');
});

test('an empty profile asks for sizes instead of guessing', () => {
  const r = recommend({ anchors: [] }, stevie);
  assert.equal(r.ok, false);
  assert.equal(r.needsProfile, true);
});

test('reads Zalando size-and-fit text where the labels run together', () => {
  const s = analyzeText('Size & fit Our model\'s height: Our model is 5\' 10"  tall and is wearing size 28 Fit: Relaxed Stretch level: no stretch');
  assert.equal(s.modelSize, '28');
  assert.equal(s.modelHeight, 178);
  assert.equal(s.stretch, 'none');
  assert.equal(s.roomy, true);
});

test('one size away in stock needs no second option', () => {
  const r = recommend(profile, { ...stevie, sizes: [['27', false], ['28', false], ['29', true], ['30', true]].map(([label, available]) => ({ label, available })) });
  assert.deepEqual(r.inStock, { size: '29', steps: 1, other: null });
});
