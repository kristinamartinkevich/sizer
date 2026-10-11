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
  // Reformation: the picker's label runs into the sentence when the page text is joined.
  assert.strictEqual(analyzeText('select a size Designed to be fitted at the waist and hips with a wide leg').fitDetail, 'Designed to be fitted at the waist and hips with a wide leg');
  assert.strictEqual(analyzeText('feels a little tight at the hips').fitDetail, 'feels a little tight at the hips', 'a note all in lower case is kept whole');
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

const { analyzeReviews } = require('../src/engine.js');
const reviewLine = (r, re) => r.reasons.map((x) => x.text).find((t) => re.test(t)) || '';

test('a fit slider with no numbers is not reported as a share of reviews', () => {
  const line = reviewLine(recommend(profile, { ...stevie, reviewSummary: 'Fit is True to size.' }), /true to size/);
  assert.match(line, /true to size/);
  assert.doesNotMatch(line, /\d/);
  const counted = reviewLine(recommend(profile, { ...stevie, reviewSummary: 'Fit is True to size. (37 reviews)' }), /true to size/);
  assert.match(counted, /37 reviews/);
  assert.doesNotMatch(counted, /%/);
  assert.equal(analyzeReviews([], 'Fit is True to size.').total, 0);
});

test('a shop fit bar with real shares reads them as percentages', () => {
  const summary = '72% say it runs small, 20% true to size (50 reviews)';
  assert.equal(analyzeReviews([], summary).verdict, 'small');
  assert.match(reviewLine(recommend(profile, { ...stevie, reviewSummary: summary }), /runs small/), /\d+% of 50 reviews/);
});

// ---- found shopping across 25 shops (2026-10-11) ----------------------------

const maya = { anchors: [], bust: '90', waist: '74', hip: '102', unit: 'cm', fitPreference: 'regular' };
const offered = (labels) => labels.map((label) => ({ label, available: true }));

test('bare 4 to 18 on a UK shop are UK sizes, even for a brand whose chart is EU', () => {
  // zara.com/uk lists 4, 6 ... 18; Zara's chart is EU, and EU 40 is UK 12.
  const zara = recommend(maya, { brand: 'ZARA', title: 'Slim fit jeans', text: '98% cotton, 2% elastane', sizes: offered(['4', '6', '8', '10', '12', '14', '16', '18']), url: 'https://www.zara.com/uk/en/jeans-p04730218.html', host: 'www.zara.com' });
  assert.equal(zara.size, '12');
  assert.equal(zara.matchedOnPage, true);
  // The same numbers on a US shop stay US: EU 40 is US 8.
  const us = recommend(maya, { brand: 'ZARA', title: 'Slim fit jeans', text: '98% cotton, 2% elastane', sizes: offered(['4', '6', '8', '10', '12', '14', '16', '18']), url: 'https://www.zara.com/us/en/jeans-p04730218.html', host: 'www.zara.com' });
  assert.equal(us.size, '8');
  // Zalando UK's double sizes: 8/10 is UK 8 to 10, not US.
  const tee = recommend(maya, { brand: 'Tommy Hilfiger', title: 'Print T-shirt', text: '100% cotton', sizes: offered(['6/8', '8/10', '12', '14/16', '18']), host: 'www.zalando.co.uk' });
  assert.equal(tee.size, '12');
});

test('a T-shirt says nothing about how it fits at the hips or waist', () => {
  const tee = recommend(maya, { brand: '', title: 'Crew neck T-shirt', text: '100% cotton', sizes: offered(['XS', 'S', 'M', 'L', 'XL']) });
  assert.deepEqual(tee.sizedOn, ['bust']);
  assert.ok(!tee.areas.some((a) => a.area === 'hip' || a.area === 'waist'), JSON.stringify(tee.areas));
});

test('denim is a fabric: a denim dress is a dress and a denim shirt a top', () => {
  const { kindOf } = require('../src/engine.js');
  assert.equal(kindOf('MIDI DRESS NMJOSEFINA - Denim dress'), 'dresses');
  assert.equal(kindOf('Oversized denim shirt'), 'tops');
  assert.equal(kindOf('Denim skirt'), 'bottoms');
  assert.equal(kindOf('Denim jacket'), 'outerwear');
  assert.equal(kindOf('Mid blue denim'), 'bottoms', 'denim on its own still means jeans');
  // Zalando UK, Noisy May: the answer is one of the page's UK sizes, not a denim waist.
  const r = recommend(maya, { brand: 'Noisy May', title: 'MIDI DRESS NMJOSEFINA - Denim dress', text: '95% cotton, 5% elastane', sizes: offered(['8', '10', '12', '14', '16']), host: 'www.zalando.co.uk' });
  assert.equal(r.kind, 'dresses');
  assert.equal(r.matchedOnPage, true, r.size);
});

test('a letter size with a length, like Mx32, is read and picked with your inseam', () => {
  const { parseSizeLabel } = require('../src/engine.js');
  assert.deepEqual(parseSizeLabel('Mx32'), { system: 'letter', value: 'M', length: 32, label: 'Mx32', eu: 38 });
  assert.equal(parseSizeLabel('XS x 30').length, 30);
  const labels = ['XSx30', 'XSx32', 'Sx30', 'Sx32', 'Sx34', 'Mx30', 'Mx32', 'Mx34', 'Lx30', 'Lx32', 'Lx34'];
  const r = recommend({ ...maya, inseam: '31.5' }, { brand: 'ONLY', title: 'Flared jeans', text: '94% cotton, 6% elastane', sizes: offered(labels), host: 'www.zalando.co.uk' });
  assert.equal(r.matchedOnPage, true, r.size);
  assert.match(r.size, /x32$/);
});

test('a bra is not sized on a clothing chart', () => {
  const r = recommend(maya, { brand: 'Fleur du Mal', title: 'Le Stretch Micro U-Plunge Bra', text: '67% nylon, 33% elastane', sizes: offered(['32', '34', '36', '38']) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /bras/);
});

test('when your size is not among the page’s sizes, the answer says so and names what is offered', () => {
  const r = recommend(maya, { brand: 'Issey Miyake', title: 'Pleated maxi dress', text: '', sizes: offered(['2']), host: 'www.ssense.com' });
  assert.equal(r.matchedOnPage, false);
  assert.match(r.stockText, /not offered on this page/);
  assert.match(r.stockText, /\b2\b/);
});
