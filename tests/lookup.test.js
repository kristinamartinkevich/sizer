const test = require('node:test');
const assert = require('node:assert');
const Store = require('../src/charts-store.js');
const { convertChart } = require('../src/charts.js');
const { recommend, lookupFor, lookingUpText, LOOKUP_TIMEOUT_MS } = require('../src/engine.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const INSTALL = '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64';

// The chart the lookup-chart function returns, in the per-chart shape chart_bundle serves.
const servedChart = (over = {}) => ({
  id: 'c-helsa', gender: 'women', category: 'dresses', fit_line: null, measurement_basis: 'body', unit: 'cm', size_system: 'letter',
  source_url: 'https://helsastudio.com/pages/size-guide', source_archive_url: null, source_type: 'brand_site', retailer: null,
  status: 'machine_read', read_by: 'lookup-chart', retrieved_on: '2026-10-05', fit_advice: null,
  rows: [
    { label: 'XS', aliases: {}, bust: [80, 84], waist: [62, 66], hip: [88, 92], inseam: null, foot_length: null, extra: {}, suspect: null },
    { label: 'S', aliases: {}, bust: [84, 88], waist: [66, 70], hip: [92, 96], inseam: null, foot_length: null, extra: {}, suspect: null },
    { label: 'M', aliases: {}, bust: [88, 92], waist: [70, 74], hip: [96, 100], inseam: null, foot_length: null, extra: {}, suspect: null },
  ],
  ...over,
});

// What src/guide-table.js gives for a page's size table: the page address rides along in source_url.
const pageGuide = () => ({
  caption: 'Helsa size guide, see https://www.revolveclothing.fr/helsa-dress/dp/HELS-WD1/',
  charts: [{
    category: 'general', unit: 'in', measurement_basis: 'body', size_system: 'letter',
    source_url: 'https://www.revolveclothing.fr/helsa-dress/dp/HELS-WD1/', source_type: null, retailer: null, mentions_brand: true, note: 'from the page',
    rows: [
      { label: 'XS', waist: [24, 25], hip: [34, 35], bust: [31, 32], foot_length: null, aliases: {} },
      { label: 'S', waist: [26, 27], hip: [36, 37], bust: [33, 34], foot_length: null, aliases: {} },
    ],
  }],
});

test('the lookup address is the project function', () => {
  assert.equal(Store.LOOKUP_URL, 'https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/lookup-chart');
});

test('missKey: one key per brand and kind of item, however the brand is spelled', () => {
  assert.equal(Store.missKey('Rag & Bone', 'bottoms'), Store.missKey('rag and bone', 'bottoms'));
  assert.notEqual(Store.missKey('Helsa', 'dresses'), Store.missKey('Helsa', 'tops'));
  assert.match(Store.missKey('Helsa', 'dresses'), /^miss:/);
  assert.equal(Store.missKey('', 'dresses'), null);
  assert.equal(Store.missKey('Helsa', 'hats'), null);
});

test('a miss is remembered for 7 days', () => {
  assert.equal(Store.MISS_TTL, 7 * DAY);
  assert.equal(Store.isMissFresh({ at: NOW - 7 * DAY + 1000 }, NOW), true);
  assert.equal(Store.isMissFresh({ at: NOW - 7 * DAY - 1000 }, NOW), false);
  assert.equal(Store.isMissFresh(undefined, NOW), false);
  assert.equal(Store.isMissFresh({ at: 'yesterday' }, NOW), false);
});

test('the shop guide sent to the lookup carries the table and never the page address', () => {
  const sent = Store.sanitiseShopGuide(pageGuide());
  const json = JSON.stringify(sent);
  assert.equal(json.includes('revolveclothing.fr'), false);
  assert.equal(json.includes('http'), false);
  assert.deepEqual(Object.keys(sent.charts[0]).sort(), ['category', 'measurement_basis', 'mentions_brand', 'rows', 'size_system', 'unit']);
  assert.deepEqual(sent.charts[0].rows[0], { label: 'XS', waist: [24, 25], hip: [34, 35], bust: [31, 32], foot_length: null, aliases: {} });
  assert.equal(sent.caption, 'Helsa size guide, see');
  assert.equal(Store.sanitiseShopGuide(null), null);
  assert.equal(Store.sanitiseShopGuide({ caption: 'Model info', charts: [] }), null, 'a guide with no chart is not sent');
});

test('the shop guide stays inside the function limits: 30 charts and 30000 characters', () => {
  const many = { caption: 'x'.repeat(5000), charts: Array.from({ length: 40 }, () => pageGuide().charts[0]) };
  const sent = Store.sanitiseShopGuide(many);
  assert.ok(sent.charts.length <= 30);
  assert.ok(sent.caption.length <= 200);
  assert.ok(JSON.stringify(sent).length <= 30000);
  const huge = { caption: '', charts: [{ ...pageGuide().charts[0], rows: Array.from({ length: 3000 }, (_, i) => ({ label: `L${i}`, waist: [60, 61], hip: [90, 91] })) }] };
  assert.equal(Store.sanitiseShopGuide(huge), null, 'a single chart over the limit is dropped, not truncated');
});

test('lookupBody: brand, kind, shop hostname and install id, and the cleaned guide when there is one', () => {
  const body = Store.lookupBody({ brand: '  Helsa ', kind: 'dresses', shop: 'WWW.RevolveClothing.fr', shopGuide: pageGuide() }, INSTALL);
  assert.deepEqual(Object.keys(body).sort(), ['brand', 'install', 'kind', 'shop', 'shopGuide']);
  assert.equal(body.brand, 'Helsa');
  assert.equal(body.shop, 'www.revolveclothing.fr');
  assert.equal(body.install, INSTALL);
  assert.equal(JSON.stringify(body).includes('/dp/'), false);
  assert.deepEqual(Object.keys(Store.lookupBody({ brand: 'Helsa', kind: 'dresses', shop: 'revolve.com', shopGuide: null }, INSTALL)).sort(), ['brand', 'install', 'kind', 'shop']);
  assert.equal(Store.lookupBody({ brand: 'x'.repeat(200), kind: 'dresses', shop: 'a.com' }, INSTALL).brand.length, 80);
});

test('lookupEntry keeps a looked-up chart machine-read, so it never ranks as a checked brand chart', () => {
  const e = Store.lookupEntry('Helsa', servedChart());
  assert.equal(e.name, 'Helsa');
  assert.deepEqual(e.aliases, ['helsa']);
  assert.equal(e.charts[0].status, 'machine_read');
  assert.equal(convertChart(e.charts[0]).source.tier, 3);

  const claimsVerified = Store.lookupEntry('Helsa', servedChart({ status: 'verified' }));
  assert.equal(claimsVerified.charts[0].status, 'machine_read', 'a lookup answer is never trusted as checked');
  const noStatus = Store.lookupEntry('Helsa', servedChart({ status: undefined }));
  assert.equal(convertChart(noStatus.charts[0]).source.tier, 3);
  const house = Store.lookupEntry('Helsa', servedChart({ source_type: 'retailer_house_chart', retailer: 'revolve.com' }));
  assert.equal(convertChart(house.charts[0]).source.tier, 5);

  assert.equal(Store.lookupEntry('Helsa', servedChart({ source_type: undefined })), null, 'no provenance, no merge');
  assert.equal(Store.lookupEntry('Helsa', servedChart({ source_type: 'made_up' })), null);
  assert.equal(Store.lookupEntry('Helsa', { id: 'x' }), null);
  assert.equal(Store.lookupEntry('', servedChart()), null);
});

test('mergeChart adds the brand, or replaces its chart of that category, and keeps the download time', () => {
  const entry = Store.lookupEntry('Helsa', servedChart());
  const fresh = Store.mergeChart(null, entry);
  assert.equal(fresh.fetchedAt, 0, 'a bundle made by a lookup still lets the daily download run');
  assert.equal(Store.isFresh(fresh, NOW), false);
  assert.equal(fresh.brands.length, 1);

  const bundle = { fetchedAt: NOW - 1000, brands: [{ id: 'ganni', name: 'Ganni', aliases: ['ganni'], charts: [], fitNotes: [] }] };
  const added = Store.mergeChart(bundle, entry);
  assert.equal(added.fetchedAt, NOW - 1000);
  assert.deepEqual(added.brands.map((b) => b.name), ['Ganni', 'Helsa']);
  assert.equal(bundle.brands.length, 1, 'the stored bundle is not changed in place');

  const existing = { fetchedAt: NOW, brands: [{ id: 'helsa', name: 'Helsa', aliases: ['helsa', 'helsa studio'], charts: [servedChart({ id: 'old', category: 'dresses' }), servedChart({ id: 'tops', category: 'tops' })], fitNotes: ['note'] }] };
  const replaced = Store.mergeChart(existing, Store.lookupEntry('HELSA', servedChart({ id: 'new' })));
  assert.equal(replaced.brands.length, 1);
  assert.deepEqual(replaced.brands[0].charts.map((c) => c.id).sort(), ['new', 'tops']);
  assert.deepEqual(replaced.brands[0].fitNotes, ['note']);
  assert.equal(replaced.brands[0].id, 'helsa');
});

test('a merged lookup chart is what the engine sizes the page on next', () => {
  const bundle = Store.mergeChart(null, Store.lookupEntry('Helsa', servedChart()));
  const profile = { anchors: [], waist: '68', hip: '94', inseam: '', unit: 'cm', fitPreference: 'regular' };
  const product = { brand: 'Helsa', title: 'Helsa Mira midi dress', text: 'Non-stretch crepe.', sizes: [{ label: 'XS' }, { label: 'S' }, { label: 'M' }], reviews: [] };
  const before = recommend(profile, product, null);
  assert.equal(before.brandKnown, false);
  const after = recommend(profile, product, bundle);
  assert.equal(after.brandKnown, true);
  assert.equal(after.source.tier, 3);
});

// ---- the background worker's lookup ----------------------------------------------------------

function harness(replies, stored = {}) {
  const store = { ...stored };
  const calls = [];
  const queue = [...replies];
  const deps = {
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const next = queue.shift();
      if (!next) throw new Error('unexpected request');
      if (next.throws) throw new TypeError('offline');
      await new Promise((r) => setTimeout(r, next.delay || 0));
      return { ok: (next.status || 200) < 300, status: next.status || 200, json: async () => { if (next.badJson) throw new SyntaxError('bad'); return next.body; } };
    },
    get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]])),
    set: async (v) => { Object.assign(store, v); },
    installId: async () => INSTALL,
    now: () => NOW,
  };
  return { lookup: Store.createLookup(deps), store, calls };
}

const MSG = { brand: 'Helsa', kind: 'dresses', shop: 'www.revolveclothing.fr', shopGuide: pageGuide() };

test('a found chart is merged into the stored bundle and the page is told', async () => {
  const h = harness([{ body: { chart: servedChart(), tier: 'brand_site', note: 'x' } }], { charts: { fetchedAt: NOW, brands: [] } });
  assert.deepEqual(await h.lookup(MSG), { found: true });
  assert.equal(h.calls[0].url, Store.LOOKUP_URL);
  assert.equal(h.calls[0].init.method, 'POST');
  assert.equal(h.calls[0].init.headers.apikey, Store.SUPABASE_ANON_KEY);
  assert.equal(h.calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(h.calls[0].body.install, INSTALL);
  assert.equal(JSON.stringify(h.calls[0].body).includes('/dp/'), false);
  assert.equal(h.store.charts.brands[0].name, 'Helsa');
  assert.equal(h.store.charts.brands[0].charts[0].status, 'machine_read');
});

test('no chart stores a miss for 7 days, and the next ask is answered without a request', async () => {
  const h = harness([{ body: { chart: null, tier: 'none', note: 'No size guide found.' } }]);
  assert.deepEqual(await h.lookup(MSG), { found: false });
  assert.deepEqual(h.store[Store.missKey('Helsa', 'dresses')], { at: NOW });
  assert.deepEqual(await h.lookup(MSG), { found: false });
  assert.equal(h.calls.length, 1);
});

test('errors store no miss, so the next visit tries again', async () => {
  for (const reply of [{ status: 429, body: { chart: null } }, { status: 502, body: {} }, { throws: true }, { badJson: true }, { body: { unexpected: true } }, { body: { chart: servedChart({ source_type: undefined }) } }]) {
    const h = harness([reply]);
    const out = await h.lookup(MSG);
    assert.equal(out.found, false);
    assert.ok(out.error, JSON.stringify(reply));
    assert.equal(h.store[Store.missKey('Helsa', 'dresses')], undefined, JSON.stringify(reply));
    assert.equal(h.store.charts, undefined);
  }
});

test('one lookup in flight per brand and kind', async () => {
  const h = harness([{ delay: 20, body: { chart: servedChart(), tier: 'brand_site' } }]);
  const [a, b] = await Promise.all([h.lookup(MSG), h.lookup({ ...MSG, brand: 'HELSA' })]);
  assert.deepEqual([a, b], [{ found: true }, { found: true }]);
  assert.equal(h.calls.length, 1);
  const other = harness([{ body: { chart: null } }, { body: { chart: null } }]);
  await Promise.all([other.lookup(MSG), other.lookup({ ...MSG, kind: 'tops' })]);
  assert.equal(other.calls.length, 2, 'a different kind of item is its own lookup');
});

test('a request with no brand or an unknown kind is refused without a call', async () => {
  const h = harness([]);
  assert.equal((await h.lookup({ ...MSG, brand: '' })).found, false);
  assert.equal((await h.lookup({ ...MSG, kind: 'hats' })).found, false);
  assert.equal(h.calls.length, 0);
});

test('the bundle is read again just before the merge, so a download that landed meanwhile is kept', async () => {
  const h = harness([{ delay: 10, body: { chart: servedChart(), tier: 'brand_site' } }], { charts: { fetchedAt: NOW - DAY * 2, brands: [] } });
  const p = h.lookup(MSG);
  await new Promise((r) => setTimeout(r, 1));
  h.store.charts = { fetchedAt: NOW, brands: [{ id: 'ganni', name: 'Ganni', aliases: ['ganni'], charts: [], fitNotes: [] }] };
  await p;
  assert.deepEqual(h.store.charts.brands.map((b) => b.name), ['Ganni', 'Helsa']);
  assert.equal(h.store.charts.fetchedAt, NOW);
});

// ---- what the page shows while it looks ------------------------------------------------------

test('a lookup is wanted only for a sized answer on a brand with no chart', () => {
  const product = { brand: 'Helsa', title: 'Helsa Mira midi dress' };
  assert.deepEqual(lookupFor({ ok: true, brandKnown: false }, product), { brand: 'Helsa', kind: 'dresses' });
  assert.deepEqual(lookupFor({ ok: true, brandKnown: false }, { brand: 'Helsa', title: 'Helsa leather boots' }), { brand: 'Helsa', kind: 'shoes' });
  assert.equal(lookupFor({ ok: true, brandKnown: true }, product), null, 'a brand with any chart never waits');
  assert.equal(lookupFor({ ok: false, needsProfile: true }, product), null);
  assert.equal(lookupFor({ ok: true, brandKnown: false }, { brand: '', title: 'Midi dress' }), null);
  assert.equal(lookupFor(null, product), null);
});

test('the looking-up line and its time limit', () => {
  assert.equal(lookingUpText('Helsa'), 'Looking up Helsa’s size chart');
  assert.equal(/—|!/.test(lookingUpText('Helsa')), false);
  assert.equal(LOOKUP_TIMEOUT_MS, 6000);
});

test('every content script in the manifest ships in the store package', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const pkg = fs.readFileSync(path.join(root, 'package.sh'), 'utf8');
  const zipLine = pkg.split('\n').find((l) => /^\s*zip /.test(l));
  const included = zipLine.split(/\s+/).filter((w) => !w.startsWith('-') && !w.startsWith('"'));
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).content_scripts[0].js;
  assert.ok(scripts.includes('src/guide-table.js'));
  for (const s of scripts) assert.ok(included.some((dir) => s === dir || s.startsWith(`${dir}/`)), s);
});

test('the privacy policy and launch copy name every field a lookup sends', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const body = Store.lookupBody({ brand: 'Ostra Studio', kind: 'jeans', shop: 'shop.example', shopGuide: { caption: 'Size guide', charts: [{ category: 'jeans', unit: 'cm', rows: [] }] } }, 'id-1');
  assert.deepStrictEqual(Object.keys(body).sort(), ['brand', 'install', 'kind', 'shop', 'shopGuide'], 'a new field in lookupBody needs a line in the copy below');
  const words = { brand: /brand name/, kind: /kind of item/, shop: /hostname|shop’s name/, install: /install id/, shopGuide: /size table/ };
  for (const file of ['store/privacy.html', 'store/PRODUCT_HUNT.md']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+/g, ' ');
    for (const [field, re] of Object.entries(words)) assert.match(text, re, `${file} does not mention ${field}`);
  }
});
