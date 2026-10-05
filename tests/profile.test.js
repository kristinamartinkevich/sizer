// C1: the fuller profile. Bust, shoulder, height, weight, flat-lay measurements on pieces you own,
// fit preference per kind of clothing, the between-sizes rule and the women's size conversion table.
const test = require('node:test');
const assert = require('node:assert');
const { recommend, parseSizeLabel, kindOf, lookupFor, convertSize, explainAnchor, bodyFromProfile } = require('../src/engine.js');
const { REGION } = require('../src/brands.js');
const { normalise } = require('../src/charts-store.js');
require('../src/defaults.js');

// ---- the conversion table ------------------------------------------------------

const SYSTEMS = ['fr', 'eu', 'de', 'it', 'uk', 'us', 'letter'];

test('the table follows the rules: IT is FR + 4, UK is FR − 28, US is UK − 4, DE is FR', () => {
  assert.deepEqual(REGION.map((r) => r.fr), [32, 34, 36, 38, 40, 42, 44, 46, 48]);
  for (const r of REGION) {
    assert.equal(r.eu, r.fr);
    assert.equal(r.de, r.fr);
    assert.equal(r.it, r.fr + 4);
    assert.equal(r.uk, r.fr - 28);
    assert.equal(r.us, r.uk - 4);
  }
  assert.deepEqual(REGION.map((r) => r.letter), ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']);
});

test('every size converts between every pair of systems, both directions', () => {
  let pairs = 0;
  for (const row of REGION) {
    for (const from of SYSTEMS) {
      for (const to of SYSTEMS) {
        if (from === to) continue;
        assert.equal(convertSize(row[from], from, to), row[to], `${from} ${row[from]} → ${to}`);
        assert.equal(convertSize(row[to], to, from), row[from], `${to} ${row[to]} → ${from}`);
        pairs += 1;
      }
    }
  }
  assert.equal(pairs, REGION.length * SYSTEMS.length * (SYSTEMS.length - 1));
});

test('a size outside the table, or a system it does not cover, converts to nothing', () => {
  assert.equal(convertSize(60, 'fr', 'uk'), null);
  assert.equal(convertSize(27, 'denim', 'fr'), null);
  assert.equal(convertSize('38', 'fr', 'uk'), 10);
});

test('size labels carry their FR/EU equivalent', () => {
  assert.equal(parseSizeLabel('UK 10').eu, 38);
  assert.equal(parseSizeLabel('US 6').eu, 38);
  assert.equal(parseSizeLabel('IT 42').eu, 38);
  assert.equal(parseSizeLabel('FR 38').eu, 38);
  assert.equal(parseSizeLabel('DE 40').eu, 40);
  assert.equal(parseSizeLabel('M').eu, 38);
  assert.equal(parseSizeLabel('W27 L30').eu, undefined);
});

test('2XL, 3XL and 4XL are letter sizes, not the numbers 2, 3 and 4', () => {
  assert.deepEqual([parseSizeLabel('2XL').system, parseSizeLabel('2XL').value], ['letter', 'XXL']);
  assert.deepEqual([parseSizeLabel('3XL').system, parseSizeLabel('3XL').value], ['letter', '3XL']);
  assert.deepEqual([parseSizeLabel('4XL').system, parseSizeLabel('4XL').value], ['letter', '4XL']);
  assert.equal(parseSizeLabel('4XL').eu, 48);
});

// ---- a test brand with every measurement --------------------------------------

const rows = (spec) => spec.map(([label, bust, waist, hip, shoulder]) => ({
  label, aliases: {}, bust: [bust - 2, bust + 2], waist: [waist - 2, waist + 2], hip: [hip - 2, hip + 2], inseam: null, foot_length: null,
  extra: shoulder ? { shoulder: [shoulder - 0.5, shoulder + 0.5] } : {}, suspect: null,
}));
const testaRows = rows([['XS', 82, 62, 88, 36.5], ['S', 86, 66, 92, 37.5], ['M', 90, 70, 96, 38.5], ['L', 94, 74, 100, 39.5], ['XL', 98, 78, 104, 40.5]]);
const chart = (c) => ({ gender: 'women', fit_line: null, measurement_basis: 'body', unit: 'cm', size_system: 'letter', source_url: 'https://testa.example/size-guide', source_archive_url: null, retrieved_on: '2026-10-05', fit_advice: null, ...c });
const testa = normalise([{ brand_id: 'testa', brand_name: 'Testa', aliases: ['testa'], updated_at: null, fit_notes: [], charts: [chart({ id: 't1', category: 'general', rows: testaRows })] }]);
const letters = ['XS', 'S', 'M', 'L', 'XL'].map((label) => ({ label }));
const page = (title) => ({ brand: 'Testa', title, text: '', sizes: letters });

// Waist and hip say XS, bust says L, shoulder says XL.
const curvy = { waist: '62', hip: '88', bust: '94', shoulder: '40.5', anchors: [], fitPreference: 'regular' };

test('a top is sized on the bust when the chart has it', () => {
  const r = recommend(curvy, page('Silk blouse'), testa);
  assert.equal(r.size, 'L');
});

test('a dress is never smaller than the bust allows', () => {
  assert.equal(recommend(curvy, page('Wrap dress'), testa).size, 'L');
});

test('a coat is sized on bust and shoulder', () => {
  assert.equal(recommend(curvy, page('Wool coat'), testa).size, 'XL');
});

test('trousers keep waist and hip, whatever the bust', () => {
  assert.equal(recommend(curvy, page('Wide trousers'), testa).size, 'XS');
});

test('a bust alone sizes a top, but not jeans', () => {
  const bustOnly = { bust: '94', anchors: [] };
  assert.equal(recommend(bustOnly, page('Silk blouse'), testa).size, 'L');
  assert.equal(recommend(bustOnly, page('Straight jeans'), testa).needsProfile, true);
});

test('a top on a chart without a bust column falls back to waist and hip', () => {
  const noBust = normalise([{ brand_id: 'testa', brand_name: 'Testa', aliases: ['testa'], updated_at: null, fit_notes: [], charts: [chart({ id: 't2', category: 'general', rows: testaRows.map((r) => ({ ...r, bust: null })) })] }]);
  assert.equal(recommend(curvy, page('Silk blouse'), noBust).size, 'XS');
  const bustOnly = recommend({ bust: '94', anchors: [] }, page('Silk blouse'), noBust);
  assert.equal(bustOnly.needsProfile, true);
  assert.match(bustOnly.reason, /no bust/);
});

// ---- kinds -------------------------------------------------------------------------

test('coats, jackets, blazers, parkas and trenches are outerwear, in French and German too', () => {
  for (const t of ['Wool coat', 'Denim jacket', 'Double-breasted blazer', 'Hooded parka', 'Belted trench', 'Manteau long en laine', 'Veste en tweed', 'Jacke aus Wolle']) {
    assert.equal(kindOf(t), 'outerwear', t);
  }
  assert.equal(kindOf('Silk blouse'), 'tops');
  assert.equal(kindOf('Shirt dress'), 'dresses');
});

test('a lookup for outerwear asks for a tops chart, the kind the database knows', () => {
  const ask = lookupFor({ ok: true, brandKnown: false }, { brand: 'Ostra', title: 'Wool coat' });
  assert.deepEqual(ask, { brand: 'Ostra', kind: 'tops' });
});

test('a jacket you own is read like any other piece', () => {
  const e = explainAnchor({ brand: '', type: 'jacket', size: 'M', fit: 'perfect' });
  assert.equal(e.ok, true);
});

// ---- the page matcher uses the table ----------------------------------------------

const dressRows = [['XS', 62, 88], ['S', 66, 92], ['M', 70, 96], ['L', 74, 100], ['XL', 78, 104]]
  .map(([label, w, h]) => ({ label, aliases: {}, bust: null, inseam: null, foot_length: null, extra: {}, suspect: null, waist: [w - 2, w + 2], hip: [h - 2, h + 2] }));
const helsa = normalise([{ brand_id: 'helsa', brand_name: 'Helsa', aliases: ['helsa'], updated_at: null, fit_notes: [], charts: [chart({ id: 'h1', category: 'dresses', rows: dressRows })] }]);

test('EU sizes on the page land on a letter chart through the table', () => {
  const r = recommend({ waist: '66', hip: '92', anchors: [] }, { brand: 'Helsa', title: 'Slip dress', text: '', sizes: ['EU 34', 'EU 36', 'EU 38', 'EU 40'].map((label) => ({ label })) }, helsa);
  assert.equal(r.size, 'EU 36');
});

test('UK sizes on the page land on an EU brand chart through the table', () => {
  const r = recommend({ anchors: [{ brand: 'Mango', type: 'trousers', size: '38' }] }, { brand: 'Mango', title: 'Trousers', text: '', sizes: ['UK 6', 'UK 8', 'UK 10', 'UK 12'].map((label) => ({ label })) });
  assert.equal(r.size, 'UK 10');
});

// ---- flat-lay measurements: garment to garment ------------------------------------------

const garmentRows = [34, 36, 38, 40, 42].map((eu, i) => ({
  label: String(eu), aliases: {}, bust: null, inseam: null, foot_length: null, extra: {}, suspect: null,
  waist: [69 + 4 * i, 71 + 4 * i], hip: [95 + 4 * i, 97 + 4 * i],
}));
const flatChart = (basis) => normalise([{ brand_id: 'ostra', brand_name: 'Ostra', aliases: ['ostra'], updated_at: null, fit_notes: [], charts: [chart({ id: 'o1', category: 'trousers', size_system: 'eu', measurement_basis: basis, rows: garmentRows })] }]);
const trousers = { brand: 'Ostra', title: 'Straight trousers', text: '', sizes: ['34', '36', '38', '40', '42'].map((label) => ({ label })) };
const owned = { brand: 'Some Label', type: 'jeans', size: '27', fit: 'perfect' };

test('a piece with flat-lay measurements is compared garment to garment with a garment chart', () => {
  const plain = recommend({ anchors: [owned] }, trousers, flatChart('garment'));
  assert.equal(plain.size, '36');
  const flat = recommend({ anchors: [{ ...owned, flat: { waist: '39', hip: '52' } }] }, trousers, flatChart('garment'));
  assert.equal(flat.size, '38');
  assert.match(flat.reasons[0].text, /garment to garment/);
  assert.match(flat.reasons[0].text, /Some Label 27/);
});

test('flat-lay measurements on a piece of another kind are not used', () => {
  const top = { brand: 'Some Label', type: 'top', size: 'S', fit: 'perfect', flat: { waist: '39', hip: '52' } };
  const r = recommend({ anchors: [owned, top] }, trousers, flatChart('garment'));
  assert.doesNotMatch(r.reasons[0].text, /garment to garment/);
});

test('a piece that fits tight asks for a slightly bigger garment', () => {
  const just = recommend({ anchors: [{ ...owned, flat: { waist: '37.5', hip: '50.5' } }] }, trousers, flatChart('garment'));
  const tight = recommend({ anchors: [{ ...owned, fit: 'tight', flat: { waist: '37.5', hip: '50.5' } }] }, trousers, flatChart('garment'));
  assert.equal(just.size, '36');
  assert.equal(tight.size, '38');
});

test('a body chart ignores flat-lay measurements', () => {
  const plain = recommend({ anchors: [owned] }, trousers, flatChart('body'));
  const flat = recommend({ anchors: [{ ...owned, flat: { waist: '39', hip: '52' } }] }, trousers, flatChart('body'));
  assert.equal(flat.size, plain.size);
  assert.doesNotMatch(flat.reasons[0].text, /garment to garment/);
});

// ---- height, weight -------------------------------------------------------------------

const lengths = ['W27/L30', 'W27/L32', 'W27/L34'].map((label) => ({ label }));
const measured = { waist: '70', hip: '95', anchors: [] };
const jeans = { brand: 'rag & bone', title: 'Jeans', text: '2% elastane', sizes: lengths };

test('with no inseam, height guesses the leg length and says it is a guess', () => {
  const tall = recommend({ ...measured, height: '190' }, jeans);
  assert.equal(tall.size, 'W27/L34');
  assert.ok(tall.reasons.some((x) => /guess/i.test(x.text) && /height/i.test(x.text)), 'labelled a guess');
  assert.equal(recommend({ ...measured, height: '160' }, jeans).size, 'W27/L30');
});

test('a typed inseam beats the height guess', () => {
  const r = recommend({ ...measured, height: '190', inseam: '30' }, jeans);
  assert.equal(r.size, 'W27/L30');
  assert.ok(!r.reasons.some((x) => /guess/i.test(x.text)));
});

test('weight never moves the size, and the sheet says so', () => {
  const light = recommend({ ...measured, weight: '45' }, page('Wide trousers'), testa);
  const heavy = recommend({ ...measured, weight: '120' }, page('Wide trousers'), testa);
  const none = recommend(measured, page('Wide trousers'), testa);
  assert.equal(light.size, none.size);
  assert.equal(heavy.size, none.size);
  assert.ok(heavy.reasons.some((x) => /weight/i.test(x.text) && /never/i.test(x.text)));
  assert.ok(!none.reasons.some((x) => /weight/i.test(x.text)));
});

test('bodyFromProfile carries bust, shoulder and the inseam guess', () => {
  const b = bodyFromProfile({ waist: '70', hip: '96', bust: '88', shoulder: '38', height: '170', anchors: [] });
  assert.equal(b.bust, 88);
  assert.equal(b.shoulder, 38);
  assert.equal(b.inseamGuess, true);
  assert.ok(Math.abs(b.inseam - 30.1) < 0.1, `inseam ${b.inseam}`);
});

// ---- fit preference per kind, and between sizes ------------------------------------------

// Waist 63 and hip 89 sit a quarter of the way from XS to S.
const quarter = { waist: '63', hip: '89', anchors: [], fitPreference: 'regular' };

test('fit preference can differ by kind of clothing', () => {
  assert.equal(recommend(quarter, page('Silk blouse'), testa).size, 'XS');
  const roomyTops = { ...quarter, fitByCategory: { tops: 'relaxed' } };
  assert.equal(recommend(roomyTops, page('Silk blouse'), testa).size, 'S');
  assert.equal(recommend(roomyTops, page('Wide trousers'), testa).size, 'XS');
});

test('a kind with no preference of its own falls back to the overall one', () => {
  const p = { ...quarter, fitPreference: 'relaxed', fitByCategory: { bottoms: 'snug' } };
  assert.equal(recommend(p, page('Silk blouse'), testa).size, 'S');
  assert.equal(recommend(p, page('Wide trousers'), testa).size, 'XS');
});

// 0.4 and 0.6 of the way from XS to S.
const lowBetween = { waist: '63.6', hip: '89.6', anchors: [] };
const highBetween = { waist: '64.4', hip: '90.4', anchors: [] };

test('between sizes, "up" takes the bigger one and says so', () => {
  assert.equal(recommend(lowBetween, page('Wide trousers'), testa).size, 'XS');
  const up = recommend({ ...lowBetween, betweenSizes: 'up' }, page('Wide trousers'), testa);
  assert.equal(up.size, 'S');
  assert.ok(up.reasons.some((x) => /between two sizes/i.test(x.text)));
});

test('between sizes, "down" takes the smaller one', () => {
  assert.equal(recommend(highBetween, page('Wide trousers'), testa).size, 'S');
  assert.equal(recommend({ ...highBetween, betweenSizes: 'down' }, page('Wide trousers'), testa).size, 'XS');
});

test('"stretch" keeps the fabric deciding, as before', () => {
  assert.equal(recommend({ ...lowBetween, betweenSizes: 'stretch' }, page('Wide trousers'), testa).size, 'XS');
});

test('the default profile carries the new fields, empty, and lets the fabric decide', () => {
  const d = globalThis.SIZER_DEFAULT_PROFILE;
  for (const k of ['height', 'weight', 'bust', 'shoulder', 'armLength']) assert.equal(d[k], '', k);
  assert.deepEqual(d.fitByCategory, {});
  assert.equal(d.betweenSizes, 'stretch');
});
