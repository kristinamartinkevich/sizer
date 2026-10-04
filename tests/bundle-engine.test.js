const test = require('node:test');
const assert = require('node:assert');
const { recommend, bodyFromProfile, parseSizeLabel, findBrand, explainAnchor } = require('../src/engine.js');
const { normalise } = require('../src/charts-store.js');
const ragBone = require('./fixtures/bundle-rag-bone.json');

// A garment-measured chart in inches, from a brand the built-in table does not know.
const sezane = {
  brand_id: 'sezane', brand_name: 'Sézane', aliases: ['sezane', 'sézane'], updated_at: '2026-10-04T00:00:00Z', fit_notes: [],
  charts: [{
    id: 'c-sez', gender: 'women', category: 'trousers', fit_line: null, measurement_basis: 'garment', unit: 'in', size_system: 'eu',
    source_url: 'https://www.sezane.com/size-guide', source_archive_url: null, retrieved_on: '2026-10-01', fit_advice: null,
    rows: [34, 36, 38, 40, 42].map((eu, i) => ({
      label: String(eu), aliases: { us: String(i * 2) }, bust: null, inseam: null, foot_length: null, extra: {}, suspect: null,
      waist: [26 + i * 1.5, 26.5 + i * 1.5], hip: [36 + i * 1.5, 36.5 + i * 1.5],
    })),
  }],
};

const veja = {
  brand_id: 'veja', brand_name: 'Veja', aliases: ['veja'], updated_at: '2026-10-04T00:00:00Z', fit_notes: [],
  charts: [{
    id: 'c-veja', gender: 'women', category: 'shoes', fit_line: null, measurement_basis: 'body', unit: 'cm', size_system: 'eu',
    source_url: 'https://www.veja-store.com/en_eu/size-guide', source_archive_url: null, retrieved_on: '2026-10-02', fit_advice: null,
    rows: [[36, 22.9, 23.5], [37, 23.5, 24.1], [38, 24.1, 24.8], [39, 24.8, 25.4], [40, 25.4, 26.1]].map(([eu, lo, hi]) => ({
      label: String(eu), aliases: { uk: String(eu - 33), us: String(eu - 30.5) }, bust: null, waist: null, hip: null, inseam: null, extra: {}, suspect: null,
      foot_length: [lo, hi],
    })),
  }],
};

const bundle = normalise([...ragBone, sezane, veja]);
const measured = { waist: '71', hip: '97', fitPreference: 'regular', anchors: [] };
const denim = ['25', '26', '27', '28', '29', '30'].map((label) => ({ label }));

test('a verified brand chart replaces the built-in approximation and names its source', () => {
  const r = recommend(measured, { brand: 'rag & bone', title: 'Jeans', text: '2% elastane', sizes: denim }, bundle);
  assert.equal(r.size, '27');
  assert.equal(r.source.url, ragBone[0].charts[0].source_url);
  assert.equal(r.source.name, 'rag & bone');
  assert.equal(r.source.retrievedOn, '2026-10-04');
  assert.equal(r.reasons[0].text, 'Your measurements fit like rag & bone 26½.');
});

test('a row the brand page gets wrong is skipped, not read', () => {
  const r = recommend({ ...measured, waist: '60', hip: '86' }, { brand: 'rag & bone', title: 'Jeans', text: '2% elastane', sizes: ['23', '24', '25'].map((label) => ({ label })) }, bundle);
  assert.equal(r.size, '24');
});

test('a bundle brand the built-in table never knew is found by alias and read in cm', () => {
  const r = recommend(measured, { brand: 'Sézane', title: 'Trousers', text: '', sizes: ['34', '36', '38', '40'].map((label) => ({ label })) }, bundle);
  assert.equal(r.brandKnown, true);
  assert.equal(r.source.name, 'Sézane');
  assert.equal(r.size, '38');
  assert.ok(r.reasons.some((x) => /garment/i.test(x.text)), 'says the chart lists garment measurements');
});

test('a bundle brand without a chart for this kind of item falls back to the built-in chart', () => {
  const topsOnly = normalise([{ ...ragBone[0], charts: [{ ...ragBone[0].charts[0], category: 'tops' }] }]);
  const r = recommend(measured, { brand: 'rag & bone', title: 'Jeans', text: '', sizes: denim }, topsOnly);
  assert.equal(r.source, null);
  assert.equal(r.guide, 'rag-bone.com size guide');
});

test('without a bundle everything behaves as before', () => {
  const a = recommend(measured, { brand: 'rag & bone', title: 'Jeans', text: '', sizes: denim });
  const b = recommend(measured, { brand: 'rag & bone', title: 'Jeans', text: '', sizes: denim }, null);
  assert.deepEqual(a, b);
});

// ---- shoes ------------------------------------------------------------------

test('shoes are sized by foot length on the brand chart', () => {
  const r = recommend({ ...measured, footLength: '24.5' }, { brand: 'Veja', title: 'Campo sneakers', text: '', sizes: ['36', '37', '38', '39', '40'].map((label) => ({ label })) }, bundle);
  assert.equal(r.size, '38');
  assert.equal(r.headline, 'By your foot length');
  assert.equal(r.source.name, 'Veja');
  assert.match(r.reasons[0].text, /24\.5 cm/);
  assert.equal(r.confidence, 'High');
});

test('shoes without a foot length ask for one', () => {
  const r = recommend(measured, { brand: 'Veja', title: 'Campo sneakers', text: '', sizes: [] }, bundle);
  assert.equal(r.ok, false);
  assert.equal(r.needsProfile, true);
  assert.match(r.reason, /foot length/);
});

test('shoes from a brand without a chart use a standard EU chart and say so', () => {
  const r = recommend({ ...measured, footLength: '24.0' }, { brand: 'Some Label', title: 'Leather loafers', text: '', sizes: ['37', '38', '39'].map((label) => ({ label })) }, bundle);
  assert.equal(r.size, '38');
  assert.equal(r.confidence, 'Low');
  assert.match(r.firmUp, /standard/);
});

test('a runs-small note moves shoes up a size too', () => {
  const r = recommend({ ...measured, footLength: '24.5' }, { brand: 'Veja', title: 'Campo sneakers', text: 'These run small, we recommend ordering one size up.', sizes: ['37', '38', '39'].map((label) => ({ label })) }, bundle);
  assert.equal(r.size, '39');
});

test('a pair of shoes you own gives your foot length', () => {
  const b = bodyFromProfile({ waist: '71', hip: '97', anchors: [{ brand: 'Veja', type: 'shoes', size: 'EU 38', fit: 'perfect' }] }, bundle);
  assert.ok(Math.abs(b.foot - 24.45) < 0.1, `foot ${b.foot}`);
  assert.ok(b.sources.every((s) => !/Veja/.test(s)), 'shoes do not feed the waist and hip');
  assert.equal(b.footSource, 'Veja EU 38');
  const e = explainAnchor({ brand: 'Veja', type: 'shoes', size: 'EU 38' }, bundle);
  assert.equal(e.ok, true);
  assert.equal(e.brand, 'Veja');
});

test('half sizes parse', () => {
  assert.deepEqual(parseSizeLabel('38.5'), { system: 'number', value: 38.5, label: '38.5' });
  assert.equal(parseSizeLabel('EU 38½').value, 38.5);
  assert.equal(parseSizeLabel('UK 5.5').value, 5.5);
  assert.equal(parseSizeLabel('UK 5.5').system, 'uk');
});

test('bundle aliases find brands the built-in table does not list', () => {
  assert.equal(findBrand('SÉZANE Paris trousers', bundle).id, 'sezane');
  assert.equal(findBrand('SÉZANE Paris trousers'), null);
});
