const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/charts-store.js');

const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;

test('a bundle fetched under a day ago is fresh and usable', () => {
  const s = { brands: [], fetchedAt: now - DAY / 2 };
  assert.equal(store.isFresh(s, now), true);
  assert.equal(store.isUsable(s, now), true);
});

test('a bundle between one and seven days old is stale but still used', () => {
  const s = { brands: [], fetchedAt: now - 3 * DAY };
  assert.equal(store.isFresh(s, now), false);
  assert.equal(store.isUsable(s, now), true);
});

test('a bundle older than a week, or malformed, is not used', () => {
  assert.equal(store.isUsable({ brands: [], fetchedAt: now - 8 * DAY }, now), false);
  assert.equal(store.isUsable({ fetchedAt: now }, now), false);
  assert.equal(store.isUsable(null, now), false);
});

test('normalise keeps only brands with at least one verified chart and renames the fields', () => {
  const payload = [
    { brand_id: 'rag-bone', brand_name: 'rag & bone', aliases: ['rag & bone', 'rag and bone'], charts: [{ category: 'jeans', rows: [] }], fit_notes: [], updated_at: '2026-10-04T10:00:00Z' },
    { brand_id: 'zara', brand_name: 'Zara', aliases: ['zara'], charts: [], fit_notes: [], updated_at: null },
  ];
  const b = store.normalise(payload, now);
  assert.equal(b.fetchedAt, now);
  assert.deepEqual(b.brands.map((x) => x.id), ['rag-bone']);
  assert.deepEqual(b.brands[0].aliases, ['rag & bone', 'rag and bone']);
  assert.equal(b.brands[0].charts[0].category, 'jeans');
});

test('normalise refuses a payload that is not a list', () => {
  assert.throws(() => store.normalise({ message: 'No API key found in request' }), /not a list/);
});

test('normalise keeps each chart’s provenance so the engine can rank it', () => {
  const payload = [{ brand_id: 'helsa', brand_name: 'Helsa', aliases: ['helsa'], fit_notes: [], updated_at: null, charts: [
    { id: 'a', category: 'dresses', status: 'machine_read', source_type: 'brand_site', retailer: null, read_by: 'lookup-chart', rows: [] },
    { id: 'b', category: 'dresses', status: 'verified', source_type: 'retailer_house_chart', retailer: 'revolve.com', read_by: null, rows: [] },
  ] }];
  const [brand] = store.normalise(payload, now).brands;
  assert.deepEqual(brand.charts.map((c) => [c.status, c.source_type, c.retailer, c.read_by]), [['machine_read', 'brand_site', null, 'lookup-chart'], ['verified', 'retailer_house_chart', 'revolve.com', null]]);
});

test('the bundle URL points at the read-only view on the project', () => {
  assert.match(store.BUNDLE_URL, /^https:\/\/cqvrdsgutpczbucbpiqa\.supabase\.co\/rest\/v1\/chart_bundle\?select=/);
});
