const test = require('node:test');
const assert = require('node:assert');
const { recommend, parseSizeLabel, findBrand, analyzeText, resolveSizes } = require('../src/engine.js');

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

// Found shopping as a tall persona: Shopbop prints a stretch scale ("Non-Stretch to Super-Stretch")
// beside the fabric, and Madewell compares a jean to "rigid jeans"; both list elastane.
test('a stretch scale or a comparison is not the stretch, and elastane on the label beats "rigid"', () => {
  const shopbop = analyzeText('Fabric Stretch : Stretch ranging from Non-Stretch to Super-Stretch Non-Stretch Super-Stretch Fabric: Mid-weight stretch corduroy. Shell: 98% cotton/2% elastane');
  assert.strictEqual(shopbop.stretch, 'slight');
  const madewell = analyzeText('The fabric: combines the holds-you-in structure of rigid jeans with a touch of stretch. 96% cotton/3% elastomultiester/1% elastane.');
  assert.notStrictEqual(madewell.stretch, 'none');
  assert.strictEqual(analyzeText('Rigid denim, 100% cotton.').stretch, 'none');
  assert.strictEqual(analyzeText('Stretch ranging from Non-Stretch to Super-Stretch. 100% cotton.').stretch, 'none');
});

// Found shopping as a US persona: Express's fit note quoted a recommended product's card, "60 2 out
// of 5 stars 2 ( 2 ) 2073 Online Only Asymmetrical One Shoulder Wide Leg Jumpsuit", and Old Navy's
// quoted "Product details ... Product #908485 Size & fit oversized fit hits at waist".
test('a product card or a details list is not a fit note', () => {
  assert.strictEqual(analyzeText('$61.60 marked down from $88.00 $61.60 2 out of 5 stars 2 ( 2 ) 2073 Online Only Asymmetrical One Shoulder Wide Leg Jumpsuit').fitDetail, null);
  assert.strictEqual(analyzeText('Product details turtleneck long wide sleeves pullover style Product #908485 Size & fit oversized fit hits at waist models are approx').fitDetail, null);
  assert.match(analyzeText('Customers say these fit tight around the ankle.').fitDetail, /tight around the ankle/);
});

// Old Navy, 2026-10-11: trousers in US sizes 00 to 30 were read as jeans waists, because the plus
// sizes run past 22, so a W31 shopper got size 30, a US plus size.
test('US sizes from 00 into the plus range are US sizes, not waists', () => {
  const sizes = offered(['00', '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28', '30']);
  assert.deepEqual([...new Set(resolveSizes(sizes, 'denim').map((l) => l.parsed.system))], ['us']);
  assert.deepEqual([...new Set(resolveSizes(sizes).map((l) => l.parsed.system))], ['us']);
  const r = recommend(maya, { brand: 'Old Navy', title: 'Extra High-Waisted Taylor Wide-Leg Trouser Pants', text: '94% polyester, 6% elastane', sizes, url: 'https://oldnavy.gap.com/browse/product.do?pid=791404012', host: 'oldnavy.gap.com' });
  assert.ok(+r.size >= 6 && +r.size <= 14, r.size);
  // Real waists still read as waists.
  assert.deepEqual([...new Set(resolveSizes(offered(['24', '25', '26', '27', '28', '29', '30', '31', '32'])).map((l) => l.parsed.system))], ['denim']);
});

// Fashion Nova, 2026-10-11: jeans in juniors' sizes 1, 3 ... 15 told a US 10 shopper "10 is not
// offered. Nearest in stock: 14 Plus, two sizes up", with 9 and 11 on the page.
test("US juniors' odd sizes are matched as the even size they fit like", () => {
  const sizes = offered(['0', '1', '3', '5', '7', '9', '11', '13', '15', '14 Plus', '16 Plus']);
  const r = recommend(maya, { brand: 'Fashion Nova', title: 'In Sync Stretch Crossover Straight Leg Jeans', text: '99% cotton, 1% elastane', sizes, url: 'https://www.fashionnova.com/products/in-sync', host: 'www.fashionnova.com' });
  assert.ok(['9', '11'].includes(r.size), r.size);
  assert.equal(r.matchedOnPage, true);
});

// Nordstrom, 2026-10-11: the sizes load only when the size menu opens, so the page shows none, and a
// shopper whose own sizes are all US was told "EU 44".
test("with no sizes on the page, the answer is in the shopper's own sizes", () => {
  const us = { ...maya, anchors: [{ brand: 'J.Crew', type: 'dresses', size: 'US 10', fit: 'perfect' }] };
  const dress = { brand: 'Vince Camuto', title: 'Cowl Neck Velvet Midi Dress', text: '', sizes: [], url: 'https://www.nordstrom.com/s/x/9210004', host: 'www.nordstrom.com' };
  assert.match(recommend(us, dress).size, /^US \d+$/);
  assert.match(recommend(maya, { ...dress, currency: 'GBP' }).size, /^UK \d+$/);
  assert.match(recommend(maya, dress).size, /^EU \d+$/);
});

// RIXO, 2026-10-11: the reviews' fit scale labels its ends "How it fits Small Just Right Big", whatever
// the reviews say, and Sizer read "fits Small" as the page saying it runs small. The same kind of scale
// reads "Runs Small True to Size Runs Large" elsewhere, which named all three at once.
test('a fit scale naming both ends is not a fit note', () => {
  assert.strictEqual(analyzeText('Reviews Close Lucina Midi Dress How it fits Small Just Right Big Customer Gallery').fitNote, null);
  assert.strictEqual(analyzeText('Fit Runs Small True to Size Runs Large').fitNote, null);
  assert.strictEqual(analyzeText('Fit: runs small – true to size – runs large').fitNote, null);
  assert.strictEqual(analyzeText('This style runs small, so we recommend sizing up.').fitNote, 'small');
  // SHEIN prints the reviews' shares on the scale: "Overall Fit Small 2% True to Size 7% Large 91%".
  assert.strictEqual(analyzeText('Overall Fit Small 2% True to Size 7% Large 91%').fitNote, null);
});

// Nike, 2026-10-11: "Nike Sportswear Women's Tight Off-Shoulder Long-Sleeve Top" was shown as the
// page's fit note, because the product's own name has a fit word and a body area in it.
test("the product's own name is not a fit note", () => {
  const title = "Nike Sportswear Women's Tight Off-Shoulder Long-Sleeve Top";
  assert.strictEqual(recommend(profile, { title, brand: 'Nike', url: 'https://www.nike.com/t/x', sizes: ['XS', 'S', 'M', 'L', 'XL'].map((label) => ({ label })), text: 'Made with soft ribbed fabric. 90% cotton, 10% elastane.' }).signals.fitDetail, null);
  assert.match(analyzeText(`${title}\nIt sits tight across the shoulders.`, title).fitDetail, /tight across the shoulders/);
});

// Found shopping as a petite persona: Selfridges called a wool-blend jumper "Lightweight, stretchy."
// over 2% elastane, and the sheet said "Lots of stretch (2% elastane)".
test('a plain "stretchy" over a little elastane is a little stretch', () => {
  assert.strictEqual(analyzeText('Lightweight, stretchy. 78% wool, 20% polyamide, 2% elastane.').stretch, 'slight');
  assert.strictEqual(analyzeText('Super stretch skinny jeans. 98% cotton, 2% elastane.').stretch, 'high');
  assert.strictEqual(analyzeText('Soft and stretchy jersey.').stretch, 'high');
  assert.strictEqual(analyzeText('Stretchy rib. 95% viscose, 5% elastane.').stretch, 'high');
  // Karen Millen's trench: "a sculptural, fashion-forward silhouette" is the cut, not the fabric.
  assert.strictEqual(analyzeText('Funnel neck creating a sculptural, fashion-forward silhouette. 100% polyester.').stretch, 'unknown');
  assert.strictEqual(analyzeText('Sculpting fabric that holds you in.').stretch, 'high');
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
  assert.match(us.size, /^(?:8|10)$/);
  assert.deepEqual(resolveSizes(offered(['0', '2', '4'])).map((l) => l.parsed.system), ['us', 'us', 'us']);
  assert.deepEqual(resolveSizes(offered(['1', '2', '3'])).map((l) => l.parsed.value), ['S', 'M', 'L']);
  // Zalando UK's double sizes: 8/10 is UK 8 to 10, not US.
  const tee = recommend(maya, { brand: 'Tommy Hilfiger', title: 'Print T-shirt', text: '100% cotton', sizes: offered(['6/8', '8/10', '12', '14/16', '18']), host: 'www.zalando.co.uk' });
  assert.equal(tee.size, '12');
  // prettylittlething.com and boohoo.com are UK shops on .com hosts; their prices are in pounds.
  const plt = recommend(maya, { brand: 'PrettyLittleThing', title: 'Wide leg jeans', text: '98% cotton, 2% elastane', sizes: offered(['4', '6', '8', '10', '12', '14', '16']), host: 'www.prettylittlething.com', currency: 'GBP' });
  assert.equal(plt.size, '12');
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

test('a bra-free dress, or one with a built-in bra, is sized as a dress', () => {
  for (const title of ['Women\'s Bra-Free High-Neck Forme Ruched Mini Dress', 'Bra Free Knit Midi Dress', 'Satin slip dress with built-in bra', 'Jersey jumpsuit with shelf bra']) {
    const r = recommend(maya, { brand: 'Nobody', title, text: '', sizes: offered(['XS', 'S', 'M', 'L', 'XL']) });
    assert.equal(r.ok, true, title);
  }
  assert.equal(recommend(maya, { brand: 'Nobody', title: 'Lace balconette bra', text: '', sizes: offered(['32B', '34B']) }).ok, false);
});

test('when your size is not among the page’s sizes, the answer says so and names what is offered', () => {
  const r = recommend(maya, { brand: 'Issey Miyake', title: 'Pleated maxi dress', text: '', sizes: offered(['2']), host: 'www.ssense.com' });
  assert.equal(r.matchedOnPage, false);
  assert.match(r.stockText, /not offered on this page/);
  assert.match(r.stockText, /\b2\b/);
});

test('a size the page does not list is named the way the page names its sizes', () => {
  // Reformation lists only what is in stock: 0, 2, 6, 12. Maya is a US 8, not "EU 40".
  const r = recommend(maya, { brand: 'Reformation', title: 'Legacy Gown', text: '', sizes: offered(['0', '2', '6', '12']), host: 'www.thereformation.com' });
  assert.equal(r.matchedOnPage, false);
  assert.equal(r.size, '8');
  assert.match(r.stockText, /^8 is not offered on this page\. Nearest in stock: 6/);
  // A brand chart in EU on a UK page: the UK number.
  const z = recommend(maya, { brand: 'Zara', title: 'Midi dress', text: '', sizes: offered(['4', '6', '8', '10']), host: 'www.zara.com', url: 'https://www.zara.com/uk/en/midi-p01.html' });
  assert.equal(z.size, '12');
});

// ---- size labels as shops print them ----

// Found shopping in inches: Zalando prints Nike's UK 6 twice, "6 (39)" and "6 (40)", and they merged
// into one 6; Selfridges prints "EUR 36 / 3 UK WOMEN", which did not parse at all.
test('a size with its EU size beside it goes by the EU size, keeping the page’s label', () => {
  const pick = (p) => p && { system: p.system, value: p.value, label: p.label };
  assert.deepStrictEqual(pick(parseSizeLabel('6 (39)')), { system: 'eu', value: 39, label: '6 (39)' });
  assert.deepStrictEqual(pick(parseSizeLabel('6 (40)')), { system: 'eu', value: 40, label: '6 (40)' });
  assert.deepStrictEqual(pick(parseSizeLabel('5.5 (38.5)')), { system: 'eu', value: 38.5, label: '5.5 (38.5)' });
  assert.deepStrictEqual(pick(parseSizeLabel('EUR 36 / 3 UK WOMEN')), { system: 'eu', value: 36, label: 'EUR 36 / 3 UK WOMEN' });
  assert.deepStrictEqual(pick(parseSizeLabel('EUR 38/5 UK WOMEN')), { system: 'eu', value: 38, label: 'EUR 38/5 UK WOMEN' });
  assert.strictEqual(parseSizeLabel('S (8-10)').value, 8, 'a letter with numbers is unchanged');
});

// Found shopping with an Adidas pair in "EU 40 2/3": read as EU 40. A Vinted kids' listing sized
// "9 Jahre" was placed on a women's chart as a 9.
test('third sizes keep their third, and an age is not a size', () => {
  assert.strictEqual(parseSizeLabel('EU 40 2/3').value, 40 + 2 / 3);
  assert.strictEqual(parseSizeLabel('36 1/3').value, 36 + 1 / 3);
  assert.strictEqual(parseSizeLabel('UK 7 ⅓').value, 7 + 1 / 3);
  assert.strictEqual(parseSizeLabel('38⅔').value, 38 + 2 / 3);
  assert.strictEqual(parseSizeLabel('EU 40 2/3').system, 'eu');
  for (const age of ['9 Jahre', '9-10 Years', '13-14 yrs', '6 ans', '18 months', '10 años']) assert.strictEqual(parseSizeLabel(age), null, age);
});

test('two-size labels span both sizes: S/M, XS-S, 8/10, 10-12, UK 8-10', () => {
  assert.deepEqual([parseSizeLabel('S/M').value, parseSizeLabel('S/M').span, parseSizeLabel('S/M').label], ['S', 'M', 'S/M']);
  assert.equal(parseSizeLabel('XS-S').span, 'S');
  assert.deepEqual([parseSizeLabel('8/10').value, parseSizeLabel('8/10').span, parseSizeLabel('8/10').label], [8, 10, '8/10']);
  assert.equal(parseSizeLabel('10-12').span, 12);
  assert.deepEqual([parseSizeLabel('UK 8-10').system, parseSizeLabel('UK 8-10').span], ['uk', 10]);
  // A jeans waist and leg stay a waist and leg.
  assert.equal(parseSizeLabel('28/30').system, 'denim');
});

test('a body between two sizes gets the label that spans both', () => {
  const r = recommend(maya, { brand: 'Nobody', title: 'Knit midi dress', text: '', sizes: offered(['XS/S', 'S/M', 'M/L', 'L/XL']), host: 'www.example.com' });
  assert.equal(r.size, 'M/L');
  const u = recommend(maya, { brand: 'Nobody', title: 'Jersey dress', text: '', sizes: offered(['6/8', '10/12', '14/16', '18/20']), host: 'www.example.co.uk' });
  assert.equal(u.size, '10/12');
  assert.equal(u.matchedOnPage, true);
});

test('EU pairs like 36/38 on every label are spans, not a jeans waist and leg', () => {
  const labels = ['32/34', '36/38', '40/42', '44/46'];
  const read = require('../src/engine.js').resolveSizes(offered(labels));
  assert.deepEqual(read.map((s) => [s.parsed.system, s.parsed.value, s.parsed.span]), [['eu', 32, 34], ['eu', 36, 38], ['eu', 40, 42], ['eu', 44, 46]]);
  const r = recommend(maya, { brand: 'Nobody', title: 'Wide trousers', text: '', sizes: offered(labels), host: 'www.example.de' });
  assert.equal(r.size, '40/42');
  assert.match(r.reasons[0].text, /EU 40/);
});

test('a letter with the shop’s own numbers goes by the numbers: S (8-10)', () => {
  const r = recommend(maya, { brand: 'Nobody', title: 'Shirt dress', text: '', sizes: offered(['XS (6)', 'S (8-10)', 'M (12-14)', 'L (16-18)']), host: 'www.example.co.uk' });
  assert.equal(r.size, 'M (12-14)');
  // A shop whose S is a UK 12: Maya, a UK 12, gets its S, not the letter M.
  const s = recommend(maya, { brand: 'Nobody', title: 'Shirt dress', text: '', sizes: offered(['XS (UK 10)', 'S (UK 12)', 'M (UK 14)', 'L (UK 16)']), host: 'www.example.co.uk' });
  assert.equal(s.size, 'S (UK 12)');
});

test('one size is not sized', () => {
  for (const label of ['One Size', 'ONE SIZE', 'OS', 'O/S', 'Onesize']) {
    const r = recommend(maya, { brand: 'Nobody', title: 'Wrap skirt', text: '', sizes: offered([label]), host: 'www.example.com' });
    assert.equal(r.ok, false, label);
    assert.match(r.reason, /one size/);
  }
});

test('words and region tags read as sizes: Small, X-Large, AU 10, 8 UK, 38 EU, XXXS', () => {
  assert.equal(parseSizeLabel('Small').value, 'S');
  assert.equal(parseSizeLabel('Medium').value, 'M');
  assert.equal(parseSizeLabel('X-Large').value, 'XL');
  assert.equal(parseSizeLabel('Extra Small').value, 'XS');
  assert.equal(parseSizeLabel('XX-Large').value, 'XXL');
  assert.deepEqual([parseSizeLabel('AU 10').system, parseSizeLabel('AU 10').value], ['uk', 10]);
  assert.deepEqual([parseSizeLabel('8 UK').system, parseSizeLabel('8 UK').value], ['uk', 8]);
  assert.deepEqual([parseSizeLabel('38 EU').system, parseSizeLabel('38 EU').value], ['eu', 38]);
  assert.equal(parseSizeLabel('3XS').value, 'XXXS');
  assert.equal(parseSizeLabel('XXXS').eu, 30);
  const r = recommend(maya, { brand: 'Nobody', title: 'Tee', text: '', sizes: offered(['X-Small', 'Small', 'Medium', 'Large', 'X-Large']), host: 'www.example.com' });
  assert.equal(r.matchedOnPage, true, r.size);
  assert.match(r.size, /^(Medium|Large)$/);
  // An Australian shop prints UK numbers.
  const a = recommend(maya, { brand: 'Nobody', title: 'Midi dress', text: '', sizes: offered(['6', '8', '10', '12', '14']), host: 'www.example.com.au' });
  assert.equal(a.size, '12');
});

// ---- found shopping as a plus-size persona, round 4 ----

const jo = { anchors: [], height: '178', bust: '112', waist: '98', hip: '122', unit: 'cm', fitPreference: 'relaxed', betweenSizes: 'down' };

test('boot-cut and boot leg jeans are jeans, not boots', () => {
  const { kindOf } = require('../src/engine.js');
  assert.equal(kindOf('High-waist boot-cut jeans'), 'bottoms');
  assert.equal(kindOf('Boot cut trousers'), 'bottoms');
  assert.equal(kindOf('Mid rise boot leg jeans'), 'bottoms');
  assert.equal(kindOf('Leather ankle boots'), 'shoes');
  assert.equal(kindOf('Western boot'), 'shoes');
});

// Found shopping as a pear-shaped persona: ASOS's "Moonboot Icon High space racing snowboot" was
// sized as clothing, UK 14.
test('a snowboot, moonboot or wellington is a shoe, and bootcut jeans still are not', () => {
  const { kindOf } = require('../src/engine.js');
  for (const t of ['Moonboot Icon High space racing snowboot in silver', 'Rubber rainboots', 'Classic wellington boots', 'Kids wellies']) assert.equal(kindOf(t), 'shoes', t);
  for (const t of ['ASOS DESIGN Lotus buckle detail mary jane ballets in black croc', 'Leather ballet flats', 'Patent Mary Janes', 'VLogo Signature 80 Woven Slingback Courts', 'Patent court heels']) assert.equal(kindOf(t), 'shoes', t);
  assert.equal(kindOf('Ballet wrap top'), 'tops');
  assert.equal(kindOf('Bootcut jeans in mid blue'), 'bottoms');
  // Found shopping as a US persona: Anthropologie's "Boxy Oxford Shirt" and American Eagle's "Kick
  // Boot Jean" were sized as shoes.
  assert.equal(kindOf('Maeve Mabel Boxy Oxford Shirt'), 'tops');
  assert.equal(kindOf('AE Super Low-Rise Kick Boot Jean'), 'bottoms');
  assert.equal(kindOf('High-rise boot jeans'), 'bottoms');
  for (const t of ['Leather Oxford shoes', 'Oxfords in tan', 'Chelsea boots', 'Kick boots']) assert.equal(kindOf(t), 'shoes', t);
});

test('Pull&Bear is found by the name its product data gives it, pullandbear', () => {
  assert.equal(findBrand('pullandbear').name, 'Pull&Bear');
});

test('the alternative is never the same size as the answer', () => {
  // Whistles: a standard W38 with W39 for more room, but the page stops at 38: "38, or 38".
  const r = recommend(jo, { brand: '', title: 'Stretch barrel-leg jeans', text: '99% cotton, 1% elastane', sizes: offered(['24', '26', '27', '28', '29', '30', '32', '34', '36', '38']), host: 'www.whistles.com' });
  assert.ok(!r.alternative || r.alternative.size !== r.size, JSON.stringify(r.alternative));
});

test('a brand chart that stops short of the page’s sizes runs on to them', () => {
  // Abercrombie's chart ends at 37; the page sells 38, which is what a 98 cm waist needs.
  const r = recommend({ ...jo, fitPreference: 'regular', betweenSizes: 'up' }, { brand: 'Abercrombie & Fitch', title: 'Curve Love high rise wide leg jean', text: '99% cotton, 1% elastane', sizes: offered(['33', '34', '35', '36', '37', '38']), host: 'www.abercrombie.com' });
  assert.equal(r.size, '38');
  assert.notEqual(r.headline, 'Larger than this chart goes');
});

test('a dress is never sized on a jeans waist chart, even with no sizes on the page', () => {
  const r = recommend(jo, { brand: 'Oh Polly', title: 'Ainslee square neck midi dress in wine', text: 'Shop our jeans and trousers too.', sizes: [], host: 'eu.ohpolly.com' });
  assert.doesNotMatch(r.size, /^W/);
});

test('an accessory is not sized as clothing, but a dress with a belt is', () => {
  const belt = recommend(jo, { brand: 'Massimo Dutti', title: 'Equestrian nappa leather belt', text: '', sizes: [] });
  assert.equal(belt.ok, false);
  assert.match(belt.reason, /clothes and shoes/);
  assert.equal(recommend(jo, { brand: 'Nobody', title: 'Midi dress with belt', text: '', sizes: [] }).ok, true);
  assert.equal(recommend(jo, { brand: 'Nobody', title: 'Belted trench coat', text: '', sizes: [] }).ok, true);
  assert.equal(recommend(jo, { brand: 'Nobody', title: 'Utility jumpsuit with belt', text: '', sizes: [] }).ok, true);
});

test('a gift card is not sized, even when its page talks about dresses or shoes', () => {
  for (const title of ['Whistles Gift Card', 'E-GIFT CARD', 'Digital gift voucher', 'Shoe gift card']) {
    const r = recommend(jo, { brand: 'Nobody', title, text: 'Treat them to a new dress.', sizes: [] });
    assert.equal(r.ok, false, title);
    assert.match(r.reason, /gift card/, title);
  }
});

// Found shopping as a tall persona: M&S's cupcake selection got "Rough guess EU 38".
test('with no sizes on the page and nothing in the title that is clothing, nothing is sized', () => {
  const cake = recommend(jo, { brand: 'M&S', title: 'Fantastically Fruity Cupcake Selection (Serves 12) by M&S', text: 'Twelve cupcakes.', sizes: [] });
  assert.equal(cake.ok, false);
  assert.match(cake.reason, /no sizes/);
  assert.equal(recommend(jo, { brand: 'Nobody', title: 'Satin midi dress', text: '', sizes: [] }).ok, true);
  assert.equal(recommend(jo, { brand: 'Nobody', title: 'Satin midi', text: '', sizes: offered(['8', '10', '12']) }).ok, true);
});

// Found shopping as a pear-shaped persona: a pair of Nike in UK 5.5 and no foot length, and every
// shoe page said "Add your sizes". The standard chart has whole EU sizes only.
test('a half-size shoe you own sizes shoes on the standard chart', () => {
  const profile = { anchors: [{ brand: 'Nike', type: 'shoes', size: 'UK 5.5', fit: 'perfect' }] };
  const r = recommend(profile, { brand: 'Nobody', title: 'Leather trainers', text: '', sizes: offered(['EU 37', 'EU 38', 'EU 39', 'EU 40']) });
  assert.equal(r.ok, true, r.reason);
  assert.match(r.size, /^EU 3[89]$/);
  assert.match(r.reasons[0].text, /UK 5\.5/);
  const us = recommend({ anchors: [{ brand: 'Nobody', type: 'shoes', size: 'US 8.5', fit: 'perfect' }] }, { brand: 'Nobody', title: 'Leather trainers', text: '', sizes: [] });
  assert.equal(us.ok, true, us.reason);
});

// Found shopping as a petite persona: sacai sizes run 1 to 4 (S to XL), read as UK 1 to 4, so a
// UK 6 was "not offered" and the nearest was 4, the largest.
test('a brand scale of 0 to 5 reads as letters, and shoes in UK 3 to 5 stay shoes', () => {
  const mid = { height: '168', bust: '92', waist: '74', hip: '100', unit: 'cm', fitPreference: 'regular', betweenSizes: 'up' };
  const r = recommend(mid, { brand: 'sacai', title: 'Black Leopard Jersey T-Shirt', text: '100% cotton.', sizes: offered(['1', '2', '3', '4']), host: 'www.ssense.com' });
  const letters = recommend(mid, { brand: 'sacai', title: 'Black Leopard Jersey T-Shirt', text: '100% cotton.', sizes: offered(['S', 'M', 'L', 'XL']), host: 'www.ssense.com' });
  assert.equal(r.size, String(['S', 'M', 'L', 'XL'].indexOf(letters.size) + 1), `${r.size} against ${letters.size}`);
  const us = recommend(mid, { brand: 'Nobody', title: 'Jersey T-Shirt', text: '100% cotton.', sizes: offered(['0', '2', '4', '6', '8', '10', '12']) });
  assert.match(us.size, /^(?:8|10)$/);
  assert.deepEqual(resolveSizes(offered(['0', '2', '4'])).map((l) => l.parsed.system), ['us', 'us', 'us']);
  assert.deepEqual(resolveSizes(offered(['1', '2', '3'])).map((l) => l.parsed.value), ['S', 'M', 'L']);
  const shoes = recommend({ anchors: [{ brand: 'Converse', type: 'shoes', size: 'UK 4', fit: 'perfect' }] }, { brand: 'Nobody', title: 'Leather loafers', text: '', sizes: offered(['3', '4', '5']), host: 'www.example.co.uk' });
  assert.equal(shoes.size, '4');
});

// Found shopping as a US persona: Urban Outfitters labels New Balance "W 6/M 4.5" to "W 10/M 8.5".
// Only "W 10/M 8.5" was read, as a W10 jeans waist, and the answer named EU 39, no button.
test('a women\'s and men\'s shoe size together is the US women\'s size: "W 7.5/M 6"', () => {
  for (const [label, v] of [['W 7.5/M 6', 7.5], ['W 10/M 8.5', 10], ['M 6 / W 7.5', 7.5], ['W6/M4.5', 6]]) {
    const p = parseSizeLabel(label);
    assert.strictEqual(p && p.system, 'us', label);
    assert.strictEqual(p.value, v, label);
  }
  const labels = ['W 6/M 4.5', 'W 6.5/M 5', 'W 7/M 5.5', 'W 7.5/M 6', 'W 8/M 6.5', 'W 8.5/M 7', 'W 9/M 7.5', 'W 9.5/M 8', 'W 10/M 8.5'];
  const r = recommend({ anchors: [{ brand: 'Nike', type: 'shoes', size: 'US 8.5', fit: 'perfect' }] }, { brand: 'New Balance', title: 'New Balance 9060 Sneakers', text: '', sizes: offered(labels), host: 'www.urbanoutfitters.com' });
  assert.ok(labels.includes(r.size), r.size);
});

// Found shopping as a US persona: Zara's US jeans read "25 (US 0)" to "32 (US 14)", which did not
// parse, and the answer named "EU 42 (XL)", a size with no button.
test('a waist with its US size beside it is the waist: Zara US "28 (US 6)"', () => {
  const p = parseSizeLabel('28 (US 6)');
  assert.strictEqual(p.system, 'denim');
  assert.strictEqual(p.value, 28);
  const labels = ['25 (US 0)', '26 (US 2)', '27 (US 4)', '28 (US 6)', '29 (US 8)', '30 (US 10)', '31 (US 12)', '32 (US 14)'];
  const r = recommend({ anchors: [{ brand: "Levi's", type: 'jeans', size: 'W30 L30', fit: 'perfect' }], unit: 'cm', fitPreference: 'regular', betweenSizes: 'up' },
    { brand: 'Zara', title: 'TRF MID-RISE STRAIGHT FIT JEANS', text: '', sizes: offered(labels), host: 'www.zara.com', url: 'https://www.zara.com/us/en/jeans-p1.html' });
  assert.ok(labels.includes(r.size), r.size);
  const measured = recommend({ anchors: [], height: '165.1', bust: '96.5', waist: '78.7', hip: '104.1', unit: 'in', fitPreference: 'regular', betweenSizes: 'up' },
    { brand: 'Zara', title: 'Z1975 HIGH-RISE MOM-FIT JEANS', text: '99% cotton, 1% elastane', sizes: offered(labels), host: 'www.zara.com', url: 'https://www.zara.com/us/en/jeans-p1.html' });
  assert.strictEqual(measured.size, '31 (US 12)');
});

// Found shopping as a tall persona: Zalando's UK 8 was sold out with 7.5 in stock, and the note said
// "nothing close is in stock": half sizes have no line on the standard chart, so they were not counted.
test('a half size beside a sold-out shoe is the nearest in stock', () => {
  const labels = ['2.5', '3.5', '4', '5', '5.5', '6.5', '7.5', '8', '9', '9.5', '10.5'];
  const sold = new Set(['8', '9', '9.5', '10.5']);
  const r = recommend({ footLength: '26.4', anchors: [] }, { brand: 'Anna Field', title: 'Classic heels', text: '', sizes: labels.map((label) => ({ label, available: !sold.has(label) })), host: 'www.zalando.co.uk', currency: 'GBP' });
  assert.equal(r.size, '8');
  assert.equal(r.stockText, 'Sold out in 8. Nearest in stock: 7.5, one size down.');
});

// Found shopping as a petite persona: Moon Boot sells "UK 3-5" and "UK 6-8", and the answer named
// EU 37, a size that is no button on the page.
test('a shoe size range on the page holds the sizes inside it', () => {
  const profile = { anchors: [{ brand: 'Converse', type: 'shoes', size: 'UK 4', fit: 'perfect' }] };
  const moon = (sizes) => recommend(profile, { brand: 'Moon Boot', title: 'Icon Low snow boot', text: '', sizes });
  assert.equal(moon(offered(['UK 3-5', 'UK 6-8'])).size, 'UK 3-5');
  assert.equal(moon(offered(['EU 35-36', 'EU 37-38', 'EU 39-41'])).size, 'EU 37-38');
  const uk5 = recommend({ anchors: [{ brand: 'Converse', type: 'shoes', size: 'UK 5', fit: 'perfect' }] }, { brand: 'Moon Boot', title: 'Icon Low snow boot', text: '', sizes: offered(['EU 35-36', 'EU 37-38', 'EU 39-41']) });
  assert.equal(uk5.size, 'EU 37-38');
});

// Found shopping as a pear-shaped persona: Shopbop's largest jean, 32, stood in for a W33 the page
// lacks, and its sold-out note called 31 "two sizes down", counting from the W33.
test('steps to the nearest size in stock count from the size the answer names', () => {
  const profile = { anchors: [{ brand: "Levi's", type: 'jeans', size: 'W29 L30', fit: 'perfect' }], height: '163', bust: '92', waist: '72', hip: '110', unit: 'cm', fitPreference: 'regular', betweenSizes: 'up' };
  const sizes = ['23', '24', '25', '26', '27', '28', '29', '30', '31', '32'].map((label) => ({ label, available: label !== '23' && label !== '32' }));
  const r = recommend(profile, { brand: 'Veronica Beard Jean', title: 'Kasey Wide Leg Jeans', text: '100% cotton. No stretch.', sizes, host: 'www.shopbop.com' });
  assert.equal(r.size, '32');
  assert.equal(r.stockText, 'Sold out in 32. Nearest in stock: 31, one size down.');
});

test('past every size on the page, the answer names the largest one there', () => {
  const r = recommend(jo, { brand: '', title: 'Baggy jeans', text: '98% cotton, 2% elastane', sizes: offered(['23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35']), host: 'www.hollisterco.com' });
  assert.match(r.stockText, /the largest here is 35\.$/, r.stockText);
});

// ---- plus sizes and petite sizes (found shopping as a plus-size and a petite persona) ----

const plus = { anchors: [], height: '165', bust: '130', waist: '118', hip: '140', unit: 'cm', fitPreference: 'regular', betweenSizes: 'up' };
const petite = { anchors: [], height: '152', bust: '76', waist: '58', hip: '82', unit: 'cm', fitPreference: 'regular', betweenSizes: 'up' };

test('plus letter sizes are read as letters: 5XL, 6XL, XXXXXL, and US 1X to 5X and 18W', () => {
  assert.equal(parseSizeLabel('5XL').value, '5XL');
  assert.equal(parseSizeLabel('6XL').system, 'letter');
  assert.equal(parseSizeLabel('XXXXXL').value, '5XL');
  assert.deepEqual([parseSizeLabel('1X').system, parseSizeLabel('1X').value, parseSizeLabel('1X').label], ['letter', 'XL', '1X']);
  assert.equal(parseSizeLabel('3X').value, '3XL');
  assert.deepEqual([parseSizeLabel('18W').system, parseSizeLabel('18W').value], ['us', 18]);
  // A denim waist with a length stays denim.
  assert.equal(parseSizeLabel('28X32').system, 'denim');
});

test('a plus-size body gets a plus size, not the top of a chart that stops at UK 22', () => {
  const r = recommend(plus, { brand: 'ASOS Curve', title: 'ASOS DESIGN Curve midi dress', text: '', sizes: offered(['UK 18', 'UK 20', 'UK 22', 'UK 24', 'UK 26', 'UK 28', 'UK 30']), host: 'www.asos.com' });
  assert.match(r.size, /^UK (26|28|30)$/, r.size);
  assert.doesNotMatch(r.headline, /Sized down/);
  const t = recommend(plus, { brand: 'Nobody', title: 'Oversized t-shirt', text: '', sizes: offered(['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']), host: 'www.example.com' });
  assert.equal(t.matchedOnPage, true, t.size);
  assert.match(t.size, /^[45]XL$/);
  const u = recommend({ ...plus, bust: '122', waist: '108', hip: '130' }, { brand: 'Nobody', title: 'Wrap dress', text: '', sizes: offered(['0X', '1X', '2X', '3X', '4X', '5X']), host: 'www.example.com' });
  assert.equal(u.matchedOnPage, true, u.size);
  assert.match(u.size, /^[45]X$/);
});

test('past the largest size a page or chart has, the answer says so instead of a size down', () => {
  const r = recommend(plus, { brand: 'Nobody', title: 'Satin midi skirt', text: '', sizes: offered(['XS', 'S', 'M', 'L', 'XL']), host: 'www.example.com' });
  assert.doesNotMatch(r.headline, /Sized down/);
  const huge = { ...plus, bust: '160', waist: '150', hip: '170' };
  const h = recommend(huge, { brand: 'Nobody', title: 'Midi dress', text: '', sizes: offered(['UK 18', 'UK 20', 'UK 22', 'UK 24', 'UK 26', 'UK 28', 'UK 30', 'UK 32']), host: 'www.asos.com' });
  assert.equal(h.headline, 'Larger than this chart goes');
  assert.ok(h.reasons.some((x) => /past the largest size/.test(x.text)), JSON.stringify(h.reasons));
  const tiny = { ...petite, bust: '66', waist: '48', hip: '70' };
  const s = recommend(tiny, { brand: 'Nobody', title: 'Midi dress', text: '', sizes: offered(['XXS', 'XS', 'S', 'M']), host: 'www.example.com' });
  assert.equal(s.headline, 'Smaller than this chart goes');
});

test('a petite size the page does not list is named like the page: 00 among US numbers, UK 4 among UK labels', () => {
  const r = recommend(petite, { brand: 'Nobody', title: 'Straight jeans', text: '', sizes: offered(['0', '2', '4', '6', '8']), host: 'www.example.com' });
  assert.equal(r.size, '00');
  const c = recommend(petite, { brand: 'Nobody', title: 'Midi dress', text: '', sizes: offered(['UK 18', 'UK 20', 'UK 22']), host: 'www.asos.com' });
  assert.equal(c.size, 'UK 4');
});

// JD Sports, 2026-10-11: "New Balance 530 Women's" names only the model, so it read as no clothing.
test('a trainer named only by its model is shoes by its half sizes', () => {
  const her = { anchors: [{ brand: 'Clarks', type: 'shoes', size: 'UK 7', fit: 'perfect' }] };
  const product = { brand: 'Kestrel', title: "Kestrel 530 Women's", text: '', sizes: offered(['3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8']), host: 'www.jdsports.co.uk', currency: 'GBP' };
  const r = recommend(her, product);
  assert.equal(r.ok, true, r.reason);
  assert.match(r.size, /^7(\.5)?$/);
  const eu = recommend(her, { ...product, host: 'www.jdsports.fr', currency: 'EUR', sizes: offered(['36', '36.5', '37.5', '38', '38.5', '40', '40.5', '41']) });
  assert.equal(eu.ok, true, eu.reason);
  // Whole sizes alone stay ambiguous, and a named garment stays a garment.
  assert.notEqual(recommend(her, { ...product, sizes: offered(['4', '5', '6', '7', '8']) }).ok, true);
  assert.notEqual(recommend(her, { ...product, title: "Kestrel 530 Women's Jeans", sizes: offered(['26', '26.5', '27', '27.5']) }).size, '7');
});

// M&S, 2026-10-11: a shopper whose M&S UK 18 trousers fit perfectly, with typed measurements that
// read as a UK 20 to 22, was told 24 for M&S jeans. The piece from this brand is the surest evidence.
test('a piece you own from this brand, of this kind, names the size there', () => {
  const her = {
    anchors: [{ brand: 'M&S', type: 'trousers', size: 'UK 18', fit: 'perfect' }, { brand: 'Next', type: 'dress', size: 'UK 18', fit: 'tight' }],
    height: '170', bust: '112', waist: '96', hip: '122', inseam: '77', unit: 'cm', fitPreference: 'relaxed', betweenSizes: 'up',
  };
  const sizes = offered(['6', '8', '10', '12', '14', '16', '18', '20', '22', '24']);
  const host = 'www.marksandspencer.com';
  const currency = 'GBP';
  const r = recommend(her, { brand: 'M&S', title: 'Mid Rise Barrel Jeans', text: 'Relaxed fit. 100% cotton', sizes, host, currency });
  assert.equal(r.size, '18');
  assert.equal(r.reasons[0].text, 'Your M&S UK 18 trousers fit, so the same size.');
  assert.doesNotMatch(String(r.firmUp), /standard one/);
  // The page's own note still moves it.
  const s = recommend(her, { brand: 'M&S', title: 'Straight Leg Trousers', text: 'This style runs small, we recommend ordering one size up.', sizes, host, currency });
  assert.equal(s.size, '20');
  // A piece marked tight asks for one size up; a dress says nothing about trousers.
  const t = recommend({ ...her, anchors: [{ brand: 'M&S', type: 'trousers', size: 'UK 16', fit: 'tight' }] }, { brand: 'M&S', title: 'Tapered Trousers', text: '', sizes, host, currency });
  assert.equal(t.size, '18');
  const d = recommend(her, { brand: 'M&S', title: 'Jersey Midi Dress', text: '', sizes, host, currency });
  assert.notEqual(d.size, '18');
});
