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

// ---- provenance tiers --------------------------------------------------------

const { provenance } = require('../src/engine.js');

const dressRows = [['XS', 60, 64, 86, 90], ['S', 64, 68, 90, 94], ['M', 68, 72, 94, 98], ['L', 72, 76, 98, 102], ['XL', 76, 80, 102, 106]]
  .map(([label, w0, w1, h0, h1]) => ({ label, aliases: {}, bust: null, inseam: null, foot_length: null, extra: {}, suspect: null, waist: [w0, w1], hip: [h0, h1] }));

// The same Helsa dress chart from five sources, listed worst first so arrival order cannot win.
const helsaCharts = {
  house: { id: 'h5', category: 'dresses', status: 'verified', source_type: 'retailer_house_chart', retailer: 'revolve.com', source_url: 'https://www.revolve.com/sizeguide', retrieved_on: '2026-10-05', read_by: null },
  shopMachine: { id: 'h4', category: 'dresses', status: 'machine_read', source_type: 'retailer_brand_chart', retailer: 'revolve.com', source_url: 'https://www.revolve.com/helsa/sizeguide', retrieved_on: '2026-10-05', read_by: 'lookup-chart' },
  brandMachine: { id: 'h3', category: 'dresses', status: 'machine_read', source_type: 'brand_site', retailer: null, source_url: 'https://helsastudio.com/pages/size-guide', retrieved_on: '2026-10-05', read_by: 'lookup-chart' },
  shopVerified: { id: 'h2', category: 'dresses', status: 'verified', source_type: 'retailer_brand_chart', retailer: 'revolve.com', source_url: 'https://www.revolve.com/helsa/sizeguide', retrieved_on: '2026-09-12', read_by: null },
  brandVerified: { id: 'h1', category: 'dresses', status: 'verified', source_type: 'brand_site', retailer: null, source_url: 'https://helsastudio.com/pages/size-guide', retrieved_on: '2026-09-12', read_by: null },
};
const chartOf = (c) => ({ gender: 'women', fit_line: null, measurement_basis: 'body', unit: 'cm', size_system: 'letter', source_archive_url: null, fit_advice: null, rows: dressRows, ...c });
const helsaWith = (...keys) => normalise([{ brand_id: 'helsa', brand_name: 'Helsa', aliases: ['helsa'], updated_at: '2026-10-05T00:00:00Z', fit_notes: [], charts: keys.map((k) => chartOf(helsaCharts[k])) }]);
const dress = { brand: 'Helsa', title: 'The Margaux polo dress in thick crepe', text: '96% polyester, 4% elastane', sizes: ['XS', 'S', 'M', 'L', 'XL'].map((label) => ({ label })) };
const sized = { waist: '69', hip: '95', fitPreference: 'regular', anchors: [] };

test('the brand’s own verified chart outranks every other source of the same chart', () => {
  const r = recommend(sized, dress, helsaWith('house', 'shopMachine', 'brandMachine', 'shopVerified', 'brandVerified'));
  assert.equal(r.source.tier, 1);
  assert.equal(r.source.url, helsaCharts.brandVerified.source_url);
  assert.equal(r.size, 'S');
});

test('the tiers fall through in order: brand verified, shop verified, brand machine-read, shop machine-read, house chart', () => {
  assert.equal(recommend(sized, dress, helsaWith('house', 'shopMachine', 'brandMachine', 'shopVerified')).source.tier, 2);
  assert.equal(recommend(sized, dress, helsaWith('house', 'shopMachine', 'brandMachine')).source.tier, 3);
  assert.equal(recommend(sized, dress, helsaWith('house', 'shopMachine')).source.tier, 4);
  assert.equal(recommend(sized, dress, helsaWith('house')).source.tier, 5);
});

test('a higher tier wins even when a lower tier has the closer category', () => {
  const mixed = normalise([{ brand_id: 'helsa', brand_name: 'Helsa', aliases: ['helsa'], updated_at: null, fit_notes: [], charts: [chartOf({ ...helsaCharts.brandVerified, category: 'general' }), chartOf(helsaCharts.brandMachine)] }]);
  const r = recommend(sized, dress, mixed);
  assert.equal(r.source.tier, 1);
  assert.equal(r.source.id, 'h1');
});

test('a chart from an older bundle without provenance fields counts as the brand’s verified chart', () => {
  const r = recommend(measured, { brand: 'rag & bone', title: 'Jeans', text: '2% elastane', sizes: denim }, bundle);
  assert.equal(r.source.tier, 1);
  assert.equal(r.source.status, 'verified');
  assert.equal(r.source.sourceType, 'brand_site');
});

test('a machine-read chart costs 0.1 of confidence, a house chart 0.2, and each says why', () => {
  const verified = recommend(sized, dress, helsaWith('brandVerified'));
  const machine = recommend(sized, dress, helsaWith('brandMachine'));
  const shopMachine = recommend(sized, dress, helsaWith('shopMachine'));
  const house = recommend(sized, dress, helsaWith('house'));
  assert.ok(Math.abs(verified.score - machine.score - 0.1) < 1e-9, `${verified.score} vs ${machine.score}`);
  assert.ok(Math.abs(verified.score - shopMachine.score - 0.1) < 1e-9);
  assert.ok(Math.abs(verified.score - house.score - 0.2) < 1e-9);
  assert.equal(verified.firmUp, null);
  assert.equal(machine.firmUp, 'This chart was read by machine and not yet checked by a person.');
  assert.equal(shopMachine.firmUp, 'This chart was read by machine and not yet checked by a person.');
  assert.equal(house.firmUp, 'This is Revolve’s general chart, not Helsa’s own.');
});

test('the Brand fact and the footer name the tier in the HANDOFF wording', () => {
  const line = (keys) => provenance(recommend(sized, dress, helsaWith(...keys)));
  assert.deepEqual(line(['brandVerified']), { brandFact: 'Helsa', footer: { lead: 'Chart from ', link: 'Helsa’s size guide', url: helsaCharts.brandVerified.source_url, tail: ', 12 Sep 2026' } });
  assert.deepEqual(line(['shopVerified']), { brandFact: 'Helsa', footer: { lead: 'Chart from ', link: 'Helsa’s size guide on Revolve', url: helsaCharts.shopVerified.source_url, tail: ', 12 Sep 2026' } });
  assert.deepEqual(line(['brandMachine']), { brandFact: 'Helsa, chart read by machine', footer: { lead: 'Chart read from ', link: 'helsastudio.com', url: helsaCharts.brandMachine.source_url, tail: ' on 5 Oct 2026, not yet checked by a person' } });
  assert.deepEqual(line(['shopMachine']), { brandFact: 'Helsa, chart read by machine', footer: { lead: 'Chart read from ', link: 'Helsa’s guide on Revolve', url: helsaCharts.shopMachine.source_url, tail: ', 5 Oct 2026, not yet checked by a person' } });
  assert.deepEqual(line(['house']), { brandFact: 'Helsa, using Revolve’s general chart', footer: { lead: '', link: 'Revolve’s general size guide', url: helsaCharts.house.source_url, tail: ', not Helsa’s own, 5 Oct 2026' } });
});

test('a chart address that is not http or https is named but never linked', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', ' JavaScript:alert(1)']) {
    const keys = normalise([{ brand_id: 'helsa', brand_name: 'Helsa', aliases: ['helsa'], updated_at: null, fit_notes: [], charts: [chartOf({ ...helsaCharts.brandMachine, source_url: url })] }]);
    const f = provenance(recommend(sized, dress, keys)).footer;
    assert.equal(f.url, null, url);
  }
});

test('the built-in and generic cases keep today’s wording', () => {
  const builtin = provenance(recommend(measured, { brand: 'rag & bone', title: 'Jeans', text: '', sizes: denim }, null));
  assert.deepEqual(builtin, { brandFact: 'rag & bone', footer: { lead: 'Charts are approximate. Check the rag-bone.com size guide.', link: null, url: null, tail: '' } });
  const generic = provenance(recommend(sized, dress, null));
  assert.deepEqual(generic, { brandFact: 'Helsa, no size chart yet', footer: { lead: 'Size charts are approximate.', link: null, url: null, tail: '' } });
  assert.equal(provenance(recommend(sized, { ...dress, brand: '' }, null)).brandFact, 'Not found');
});

test('a machine-read shoe chart is one notch less sure, a house shoe chart two', () => {
  const shoe = (extra) => normalise([{ ...veja, charts: [{ ...veja.charts[0], ...extra }] }]);
  const ask = (b) => recommend({ ...measured, footLength: '24.5' }, { brand: 'Veja', title: 'Campo sneakers', text: '', sizes: ['37', '38', '39'].map((label) => ({ label })) }, b);
  assert.equal(ask(shoe({ status: 'verified', source_type: 'brand_site' })).confidence, 'High');
  const machine = ask(shoe({ status: 'machine_read', source_type: 'brand_site', read_by: 'lookup-chart' }));
  assert.equal(machine.confidence, 'Medium');
  assert.equal(machine.firmUp, 'This chart was read by machine and not yet checked by a person.');
  const house = ask(shoe({ status: 'verified', source_type: 'retailer_house_chart', retailer: 'zalando.de' }));
  assert.equal(house.confidence, 'Low');
  assert.equal(house.firmUp, 'This is Zalando’s general chart, not Veja’s own.');
});
