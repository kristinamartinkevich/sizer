// Where else a size chart lives (fit-evidence HANDOFF §7): a same-shop size-guide page, a chart image
// read by the read-chart-image function, and the product-text fallback. The DOM parts are checked by
// tests/shops.html; these are the pure parts and the request bodies.
const test = require('node:test');
const assert = require('node:assert');
const Store = require('../src/charts-store.js');
const G = require('../src/guide-table.js');
const { kindOf, recommend } = require('../src/engine.js');
const { convertChart } = require('../src/charts.js');

const INSTALL = '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64';
const PAGE = 'https://www.lune-atelier.example/products/bias-silk-midi-skirt?variant=12#reviews';
const IMAGE = 'https://cdn.lune-atelier.example/files/size-chart-women.png?v=3';

// ---- the same-shop size-guide page --------------------------------------------------------------

test('sameShopUrl: a link on the shop’s own host, resolved, without its fragment', () => {
  assert.equal(G.sameShopUrl('/pages/size-guide', PAGE), 'https://www.lune-atelier.example/pages/size-guide');
  assert.equal(G.sameShopUrl('https://lune-atelier.example/pages/size-guide#women', PAGE), 'https://lune-atelier.example/pages/size-guide', 'www. or not is the same shop');
  assert.equal(G.sameShopUrl('https://other.example/size-guide', PAGE), null, 'another host is never fetched');
  assert.equal(G.sameShopUrl('https://cdn.lune-atelier.example/size-guide', PAGE), null, 'a subdomain is another host');
  assert.equal(G.sameShopUrl('javascript:openGuide()', PAGE), null);
  assert.equal(G.sameShopUrl('#size-guide', PAGE), null, 'the page itself is not a guide page');
  assert.equal(G.sameShopUrl('', PAGE), null);
  assert.equal(G.sameShopUrl('/pages/size-guide', 'not a url'), null);
});

test('chartImageName: the alt text or the file name mentions size, guide or chart', () => {
  assert.equal(G.chartImageName(IMAGE, ''), true);
  assert.equal(G.chartImageName('https://cdn.example/files/IMG_2041.jpg', 'Size guide'), true);
  assert.equal(G.chartImageName('https://cdn.example/files/guide-des-tailles.png', ''), true);
  assert.equal(G.chartImageName('https://cdn.example/files/Gr%C3%B6%C3%9Fentabelle.png', ''), true);
  assert.equal(G.chartImageName('https://cdn.example/files/IMG_2041.jpg', 'Model wearing the skirt'), false);
  assert.equal(G.chartImageName('https://cdn.example/files/how-to-measure.jpg', 'How to measure yourself'), false, 'a how-to drawing is not a chart');
  assert.equal(G.chartImageName('https://cdn.example/size-chart/IMG_2041.jpg', ''), false, 'only the file name, not the folders');
});

function fakeFetch(reply) {
  const calls = [];
  const f = (url, init) => {
    calls.push({ url, init });
    if (reply.hang) {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }
    if (reply.throws) return Promise.reject(new TypeError('offline'));
    return Promise.resolve({
      ok: (reply.status || 200) < 300,
      status: reply.status || 200,
      url: reply.url || url,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (reply.type ?? 'text/html; charset=utf-8') : null) },
      text: async () => reply.body || '<html></html>',
    });
  };
  return { f, calls };
}

test('fetchGuideText: one GET without cookies, html only, on the same shop after redirects', async () => {
  const ok = fakeFetch({ body: '<table></table>' });
  assert.equal(await G.fetchGuideText('https://www.lune-atelier.example/pages/size-guide', { fetch: ok.f, pageUrl: PAGE }), '<table></table>');
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].init.credentials, 'omit');
  assert.equal(ok.calls[0].init.method, 'GET');
  assert.ok(ok.calls[0].init.signal);

  for (const reply of [{ status: 404 }, { type: 'application/json' }, { throws: true }, { url: 'https://login.other.example/' }]) {
    const r = fakeFetch(reply);
    assert.equal(await G.fetchGuideText('https://www.lune-atelier.example/pages/size-guide', { fetch: r.f, pageUrl: PAGE }), null, JSON.stringify(reply));
  }
  const elsewhere = fakeFetch({});
  assert.equal(await G.fetchGuideText('https://other.example/size-guide', { fetch: elsewhere.f, pageUrl: PAGE }), null);
  assert.equal(elsewhere.calls.length, 0, 'another host is refused before any request');
});

test('fetchGuideText gives up after its time limit, 3 s by default', async () => {
  assert.equal(G.GUIDE_FETCH_TIMEOUT_MS, 3000);
  const slow = fakeFetch({ hang: true });
  const started = Date.now();
  assert.equal(await G.fetchGuideText('https://www.lune-atelier.example/pages/size-guide', { fetch: slow.f, pageUrl: PAGE, timeoutMs: 40 }), null);
  assert.ok(Date.now() - started < 1000);
});

// ---- the chart image -----------------------------------------------------------------------------

test('imageBody: only the image address, brand, kind and install id; never the page', () => {
  const body = Store.imageBody({ image_url: `${IMAGE}#zoom`, brand: '  Lune   Atelier ', kind: 'dresses', page: PAGE, shop: 'www.lune-atelier.example' }, INSTALL);
  assert.deepStrictEqual(body, { image_url: IMAGE, brand: 'Lune Atelier', kind: 'dresses', install: INSTALL });
  assert.equal(Store.imageBody({ image_url: 'http://cdn.example/size-chart.png', brand: 'x', kind: 'dresses' }, INSTALL), null);
  assert.equal(Store.imageBody({ image_url: 'data:image/png;base64,AAAA', brand: 'x', kind: 'dresses' }, INSTALL), null);
  assert.equal(Store.imageBody({ image_url: 'https://me:pw@cdn.example/a.png', brand: 'x', kind: 'dresses' }, INSTALL), null);
  assert.equal(Store.imageBody({ image_url: IMAGE, brand: '', kind: 'dresses' }, INSTALL), null);
  assert.equal(Store.imageBody({ image_url: IMAGE, brand: 'x', kind: 'hats' }, INSTALL), null);
  assert.equal(Store.imageBody({ image_url: IMAGE, brand: 'x'.repeat(200), kind: 'tops' }, INSTALL).brand.length, 80);
});

const servedImageChart = (over = {}) => ({
  category: 'general', unit: 'cm', measurement_basis: 'body', size_system: 'letter', source_url: IMAGE,
  source_type: 'retailer_brand_chart', retailer: null, mentions_brand: true, note: 'read from the image', status: 'machine_read', read_by: 'read-chart-image',
  rows: [
    { label: 'XS', waist: [62, 66], hip: [88, 92], bust: [80, 84], foot_length: null, aliases: { fr: '34' } },
    { label: 'S', waist: [66, 70], hip: [92, 96], bust: [84, 88], foot_length: null, aliases: { fr: '36' } },
  ],
  ...over,
});

function harness(replies) {
  const calls = [];
  const queue = [...replies];
  const deps = {
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const next = queue.shift();
      if (!next) throw new Error('unexpected request');
      if (next.throws) throw new TypeError('offline');
      await new Promise((r) => setTimeout(r, next.delay || 0));
      return { ok: (next.status || 200) < 300, status: next.status || 200, json: async () => next.body };
    },
    installId: async () => INSTALL,
  };
  return { deps, calls };
}

test('the image read posts the body to the function and keeps the chart machine-read', async () => {
  const h = harness([{ body: { chart: servedImageChart({ status: 'verified' }), note: 'x' } }]);
  const read = Store.createImageRead(h.deps);
  const out = await read({ image_url: IMAGE, brand: 'Lune Atelier', kind: 'dresses' });
  assert.equal(Store.READ_IMAGE_URL, 'https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/read-chart-image/image');
  assert.equal(h.calls[0].url, Store.READ_IMAGE_URL);
  assert.equal(h.calls[0].init.method, 'POST');
  assert.equal(h.calls[0].init.headers.apikey, Store.SUPABASE_ANON_KEY);
  assert.deepStrictEqual(Object.keys(h.calls[0].body).sort(), ['brand', 'image_url', 'install', 'kind']);
  assert.equal(out.chart.status, 'machine_read', 'never trusted as checked');
  assert.equal(out.chart.source_type, 'retailer_brand_chart');
});

test('the image read: no chart, errors and odd replies give no chart; one request per image at a time', async () => {
  for (const reply of [{ body: { chart: null, note: 'A photo.' } }, { status: 429, body: { chart: null } }, { throws: true }, { body: { chart: servedImageChart({ source_type: 'brand_site' }) } }, { body: { chart: { rows: 'x' } } }]) {
    const h = harness([reply]);
    const out = await Store.createImageRead(h.deps)({ image_url: IMAGE, brand: 'Lune Atelier', kind: 'dresses' });
    assert.equal(out.chart, null, JSON.stringify(reply).slice(0, 60));
  }
  const bad = harness([]);
  assert.equal((await Store.createImageRead(bad.deps)({ image_url: 'http://x.example/a.png', brand: 'x', kind: 'tops' })).chart, null);
  assert.equal(bad.calls.length, 0);

  const h = harness([{ delay: 20, body: { chart: servedImageChart() } }]);
  const read = Store.createImageRead(h.deps);
  const [a, b] = await Promise.all([read({ image_url: IMAGE, brand: 'Lune Atelier', kind: 'dresses' }), read({ image_url: IMAGE, brand: 'Lune Atelier', kind: 'dresses' })]);
  assert.ok(a.chart && b.chart);
  assert.equal(h.calls.length, 1);
});

test('an image chart joins the page’s shop guide, which the lookup then sends without the image address', () => {
  const guide = Store.withImageChart(null, servedImageChart());
  assert.equal(guide.charts.length, 1);
  assert.equal(guide.charts[0].status, 'machine_read');
  assert.equal(guide.caption, 'Size chart image');
  const kept = Store.withImageChart({ caption: 'Size guide', charts: [] }, servedImageChart());
  assert.equal(kept.caption, 'Size guide');
  const body = Store.lookupBody({ brand: 'Lune Atelier', kind: 'dresses', shop: 'www.lune-atelier.example', shopGuide: guide }, INSTALL);
  assert.equal(body.shopGuide.charts.length, 1);
  assert.equal(JSON.stringify(body).includes('cdn.lune-atelier'), false);
  assert.ok(convertChart({ ...servedImageChart(), rows: servedImageChart().rows.map((r) => ({ ...r, inseam: null, extra: {}, suspect: null })) }));
});

// ---- the product-text fallback --------------------------------------------------------------------

test('productBody: title, headings and picker text, at most 6000 characters, no web address, no page', () => {
  const body = Store.productBody({ title: 'Bias silk midi skirt', headings: ['Details', 'Details', 'Shipping: see https://www.lune-atelier.example/shipping'], picker: 'Size XS S M www.lune-atelier.example', url: PAGE }, INSTALL);
  assert.deepStrictEqual(Object.keys(body).sort(), ['headings', 'install', 'picker', 'title']);
  assert.deepStrictEqual(body.headings, ['Details', 'Shipping: see']);
  assert.equal(JSON.stringify(body).includes('lune-atelier.example'), false);
  const huge = Store.productBody({ title: 't'.repeat(1000), headings: Array.from({ length: 80 }, (_, i) => `heading ${i} ${'h'.repeat(150)}`), picker: 'p'.repeat(9000) }, INSTALL);
  const chars = huge.title.length + huge.picker.length + huge.headings.reduce((n, h) => n + h.length, 0);
  assert.ok(chars <= 6000, String(chars));
  assert.ok(huge.picker.length >= 2000, 'the size picker text keeps a good share');
  assert.ok(huge.headings.length <= 20);
});

test('the product read posts the body and returns only the five fields', async () => {
  const h = harness([{ body: { brand: 'Lune Atelier', title: 'Bias silk midi skirt', kind: 'bottoms', sizes: ['XS', 'S', 7], fabric: '100% silk', extra: 'x' } }]);
  const out = await Store.createProductRead(h.deps)({ title: 'Bias silk midi skirt', headings: [], picker: 'XS S' });
  assert.equal(Store.READ_PRODUCT_URL, 'https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/read-chart-image/product');
  assert.equal(h.calls[0].url, Store.READ_PRODUCT_URL);
  assert.deepStrictEqual(out, { product: { brand: 'Lune Atelier', title: 'Bias silk midi skirt', kind: 'bottoms', sizes: ['XS', 'S'], fabric: '100% silk' } });
  for (const reply of [{ status: 502, body: {} }, { throws: true }, { body: 'nope' }]) {
    const e = harness([reply]);
    const r = await Store.createProductRead(e.deps)({ title: 'x', headings: [], picker: '' });
    assert.equal(r.product, undefined);
    assert.ok(r.error);
  }
});

test('applyReadProduct fills only what the page reader missed, and the engine sizes on it', () => {
  const page = { brand: '', title: 'Midi skirt', text: '', sizes: [], reviews: [], isProduct: false };
  const ai = { brand: 'Lune Atelier', title: 'Bias silk midi skirt', kind: 'bottoms', sizes: ['XS', 'S', 'M', 'L'], fabric: '97% silk, 3% elastane' };
  const p = Store.applyReadProduct(page, ai, kindOf);
  assert.equal(p.brand, 'Lune Atelier');
  assert.equal(p.title, 'Midi skirt', 'the page’s own title is kept');
  assert.deepStrictEqual(p.sizes.map((s) => s.label), ['XS', 'S', 'M', 'L']);
  assert.match(p.text, /3% elastane/);
  assert.equal(p.isProduct, true);
  assert.equal(page.brand, '', 'the page reading is not changed in place');

  const kept = Store.applyReadProduct({ ...page, brand: 'Ganni', sizes: [{ label: '36', available: false }] }, ai, kindOf);
  assert.equal(kept.brand, 'Ganni');
  assert.deepStrictEqual(kept.sizes, [{ label: '36', available: false }]);

  const shoes = Store.applyReadProduct({ ...page, title: 'Lune' }, { ...ai, kind: 'shoes' }, kindOf);
  assert.equal(kindOf(shoes.title), 'shoes', 'the model’s kind reaches the engine when the title says nothing');
  const dress = Store.applyReadProduct({ ...page, title: 'Mira midi dress' }, { ...ai, kind: 'tops' }, kindOf);
  assert.equal(kindOf(dress.title), 'dresses', 'a title that names the kind wins');
  const skirt = Store.applyReadProduct({ ...page, title: 'Midi skirt' }, { ...ai, kind: 'shoes' }, kindOf);
  assert.equal(skirt.title, 'Midi skirt', 'a bottoms word in the title is a kind too');

  const profile = { anchors: [], waist: '68', hip: '94', inseam: '', unit: 'cm', fitPreference: 'regular' };
  const r = recommend(profile, p, null);
  assert.equal(r.ok, true);
  assert.equal(r.signals.stretch !== 'unknown', true, 'the fabric the model read reaches the stretch reading');
});
