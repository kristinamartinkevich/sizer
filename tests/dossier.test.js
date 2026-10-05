// C3, client half: what the fit-dossier request sends, how the background caches the reply, and how
// the engine folds what others say online into the answer.
const test = require('node:test');
const assert = require('node:assert');
const Store = require('../src/charts-store.js');
const { recommend } = require('../src/engine.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const INSTALL = '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64';

// The function's input check (supabase/functions/fit-dossier/dossier.ts), mirrored so a body that
// would be a 400 fails here first.
const ITEM_KEY = /^[a-z0-9 ]+\|[a-z0-9]+$/;
const AREAS = ['bust', 'chest', 'waist', 'hip', 'length', 'inseam', 'shoulder', 'sleeve', 'foot'];
const DIRECTIONS = ['tight', 'loose', 'long', 'short'];
const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 5000;
function serverAccepts(b) {
  assert.deepStrictEqual(Object.keys(b).sort(), ['brand', 'install', 'item_key', 'kind', 'shop', 'style', 'tallies']);
  assert.ok(ITEM_KEY.test(b.item_key) && b.item_key.length <= 120, b.item_key);
  assert.ok(b.brand.length >= 1 && [...b.brand].length <= 80);
  assert.ok(b.style.length >= 1 && [...b.style].length <= 80);
  assert.ok(['bottoms', 'tops', 'dresses', 'shoes'].includes(b.kind));
  assert.deepStrictEqual(Object.keys(b.tallies).sort(), ['areas', 'large', 'small', 'total', 'tts']);
  const t = b.tallies;
  assert.ok([t.small, t.large, t.tts, t.total].every(isCount), JSON.stringify(t));
  assert.ok(t.small + t.large + t.tts <= t.total);
  assert.ok(t.areas && typeof t.areas === 'object' && !Array.isArray(t.areas));
  for (const [area, v] of Object.entries(t.areas)) {
    assert.ok(AREAS.includes(area), area);
    if (typeof v === 'number') assert.ok(isCount(v));
    else assert.ok(Object.entries(v).every(([d, n]) => DIRECTIONS.includes(d) && isCount(n)), JSON.stringify(v));
  }
}

const REQ = {
  itemKey: 'rag and bone|wren', brand: ' rag & bone ', style: 'wren', kind: 'bottoms', shop: 'WWW.Zalando.de',
  tallies: { small: 3, large: 1, tts: 1, total: 5, fromSummary: false, areas: [{ area: 'hip', direction: 'tight', count: 2 }, { area: 'inseam', direction: 'long', count: 1 }] },
};

// ---- the request ---------------------------------------------------------------------------------

test('the dossier address is the project function', () => {
  assert.strictEqual(Store.DOSSIER_URL, 'https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/fit-dossier');
});

test('dossierBody: exactly the seven fields the function accepts, tallies as counts and an areas object', () => {
  const b = Store.dossierBody(REQ, INSTALL);
  serverAccepts(b);
  assert.deepStrictEqual(b, {
    item_key: 'rag and bone|wren', brand: 'rag & bone', style: 'wren', kind: 'bottoms', shop: 'www.zalando.de', install: INSTALL,
    tallies: { small: 3, large: 1, tts: 1, total: 5, areas: { hip: { tight: 2 }, inseam: { long: 1 } } },
  });
});

test('dossierBody never carries the profile, the page address or review text, whatever it is handed', () => {
  const b = Store.dossierBody({ ...REQ, profile: { waist: 68 }, url: 'https://www.zalando.de/rag-bone-wren.html', reviews: ['Runs small in the hips'], title: 'WREN jeans', tallies: { ...REQ.tallies, text: 'Runs small', waist: 68 } }, INSTALL);
  serverAccepts(b);
  const json = JSON.stringify(b);
  for (const s of ['68', 'http', 'Runs small', 'WREN jeans', 'fromSummary']) assert.strictEqual(json.includes(s), false, s);
});

test('dossierBody keeps counts inside the function limits and drops areas it does not know', () => {
  const big = Store.dossierBody({ ...REQ, tallies: { small: 6800, large: 1200, tts: 3500, total: 12000, areas: [{ area: 'hip', direction: 'tight', count: 9000 }, { area: 'elbow', direction: 'tight', count: 2 }, { area: 'waist', direction: 'weird', count: 2 }, { area: 'bust', direction: 'loose', count: -1 }, { area: 'waist', direction: 'loose', count: 2.5 }] } }, INSTALL);
  serverAccepts(big);
  assert.strictEqual(big.tallies.total, 5000);
  assert.deepStrictEqual(big.tallies.areas, { hip: { tight: 5000 } });
  const odd = Store.dossierBody({ ...REQ, tallies: { small: 4, large: 4, tts: 4, total: 3, areas: null } }, INSTALL);
  serverAccepts(odd);
  assert.deepStrictEqual(odd.tallies.areas, {});
  const none = Store.dossierBody({ ...REQ, tallies: undefined }, INSTALL);
  serverAccepts(none);
  assert.deepStrictEqual(none.tallies, { small: 0, large: 0, tts: 0, total: 0, areas: {} });
  const both = Store.dossierBody({ ...REQ, tallies: { small: 1, large: 0, tts: 0, total: 1, areas: [{ area: 'hip', direction: 'tight', count: 1 }, { area: 'hip', direction: 'loose', count: 2 }, { area: 'hip', direction: 'tight', count: 1 }] } }, INSTALL);
  assert.deepStrictEqual(both.tallies.areas, { hip: { tight: 2, loose: 2 } });
});

test('dossierBody: coats ask as tops, and a bad key, brand or kind sends nothing', () => {
  assert.strictEqual(Store.dossierBody({ ...REQ, kind: 'outerwear' }, INSTALL).kind, 'tops');
  assert.strictEqual(Store.dossierBody({ ...REQ, itemKey: 'Rag and Bone|Wren' }, INSTALL), null);
  assert.strictEqual(Store.dossierBody({ ...REQ, itemKey: 'rag and bone|wren-2' }, INSTALL), null);
  assert.strictEqual(Store.dossierBody({ ...REQ, itemKey: `${'a'.repeat(118)}|bc` }, INSTALL), null);
  assert.strictEqual(Store.dossierBody({ ...REQ, itemKey: null }, INSTALL), null);
  assert.strictEqual(Store.dossierBody({ ...REQ, brand: '  ' }, INSTALL), null);
  assert.strictEqual(Store.dossierBody({ ...REQ, kind: 'hats' }, INSTALL), null);
  assert.strictEqual(Store.dossierBody({ ...REQ, brand: 'x'.repeat(200) }, INSTALL).brand.length, 80);
  assert.strictEqual(Store.dossierBody({ ...REQ, style: '' }, INSTALL).style, 'wren', 'the style falls back to the key');
});

test('the item key the page builds for the pool is one the function accepts', () => {
  const key = Store.itemKey('rag & bone', 'WREN - Straight leg jeans - blue denim');
  assert.strictEqual(key, 'rag and bone|wren');
  assert.ok(ITEM_KEY.test(key));
});

// ---- the background worker's request --------------------------------------------------------------

const DOSSIER = {
  item_key: 'rag and bone|wren', verdict: 'small', strength: 0.8,
  areas: [{ area: 'hip', direction: 'tight', note: 'Snug through the hips and thighs.' }],
  brand_note: 'rag & bone denim is cut slim.', sources: [{ url: 'https://fit-blog.example/rag-bone-wren', title: 'Wren fit notes' }],
  created_at: '2026-10-01T00:00:00Z',
};

function harness(replies, stored = {}, clock = { now: NOW }) {
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
    now: () => clock.now,
  };
  return { dossier: Store.createDossier(deps), store, calls, clock };
}

const slot = (key) => Store.dossierKey(key);

test('a found dossier is posted for, returned, and kept 30 days', async () => {
  const h = harness([{ body: { dossier: DOSSIER } }]);
  const out = await h.dossier(REQ);
  assert.strictEqual(out.dossier.verdict, 'small');
  assert.strictEqual(out.dossier.sources[0].url, 'https://fit-blog.example/rag-bone-wren');
  assert.strictEqual(h.calls[0].url, Store.DOSSIER_URL);
  assert.strictEqual(h.calls[0].init.method, 'POST');
  assert.strictEqual(h.calls[0].init.headers.apikey, Store.SUPABASE_ANON_KEY);
  assert.strictEqual(h.calls[0].init.headers['Content-Type'], 'application/json');
  serverAccepts(h.calls[0].body);
  assert.strictEqual(h.store[slot('rag and bone|wren')].at, NOW);
  h.clock.now = NOW + 30 * DAY - 1000;
  assert.strictEqual((await h.dossier(REQ)).dossier.verdict, 'small');
  assert.strictEqual(h.calls.length, 1, 'answered from the local copy');
  assert.strictEqual(Store.DOSSIER_FOUND_TTL, 30 * DAY);
});

test('an old found dossier is asked for again', async () => {
  const h = harness([{ body: { dossier: { ...DOSSIER, verdict: 'large' } } }], { [slot('rag and bone|wren')]: { at: NOW - 31 * DAY, dossier: DOSSIER } });
  assert.strictEqual((await h.dossier(REQ)).dossier.verdict, 'large');
  assert.strictEqual(h.calls.length, 1);
});

test('no dossier is remembered for 7 days, then asked again', async () => {
  const h = harness([{ body: { dossier: null } }, { body: { dossier: null } }]);
  assert.deepStrictEqual(await h.dossier(REQ), { dossier: null });
  assert.deepStrictEqual(h.store[slot('rag and bone|wren')], { at: NOW, dossier: null });
  h.clock.now = NOW + 7 * DAY - 1000;
  assert.deepStrictEqual(await h.dossier(REQ), { dossier: null });
  assert.strictEqual(h.calls.length, 1);
  h.clock.now = NOW + 7 * DAY + 1000;
  await h.dossier(REQ);
  assert.strictEqual(h.calls.length, 2);
  assert.strictEqual(Store.DOSSIER_MISS_TTL, 7 * DAY);
});

test('errors cache nothing, so the next visit tries again', async () => {
  for (const reply of [{ status: 429, body: { dossier: null, error: 'cap' } }, { status: 502, body: { dossier: null } }, { status: 400, body: { error: 'bad' } }, { throws: true }, { badJson: true }, { body: { unexpected: true } }, { body: { dossier: { verdict: 'huge', strength: 2, areas: [], sources: [] } } }]) {
    const h = harness([reply]);
    const out = await h.dossier(REQ);
    assert.strictEqual(out.dossier, null, JSON.stringify(reply));
    assert.ok(out.error, JSON.stringify(reply));
    assert.strictEqual(h.store[slot('rag and bone|wren')], undefined, JSON.stringify(reply));
  }
});

test('one request in flight per item, and a bad request makes no call', async () => {
  const h = harness([{ delay: 20, body: { dossier: DOSSIER } }]);
  const [a, b] = await Promise.all([h.dossier(REQ), h.dossier({ ...REQ, shop: 'www.asos.com' })]);
  assert.strictEqual(a.dossier.verdict, 'small');
  assert.strictEqual(b.dossier.verdict, 'small');
  assert.strictEqual(h.calls.length, 1);
  const bad = harness([]);
  assert.strictEqual((await bad.dossier({ ...REQ, kind: 'hats' })).dossier, null);
  assert.strictEqual((await bad.dossier({ ...REQ, itemKey: '' })).dossier, null);
  assert.strictEqual(bad.calls.length, 0);
});

test('the reply is cleaned: unknown areas and non-web sources are dropped', () => {
  const d = Store.dossierEntry({ ...DOSSIER, areas: [...DOSSIER.areas, { area: 'elbow', direction: 'tight', note: 'x' }, { area: 'waist', direction: 'sideways', note: 'x' }], sources: [...DOSSIER.sources, { url: 'javascript:alert(1)', title: 'x' }, { url: 'ftp://x.example/a', title: 'y' }, { url: 42 }] });
  assert.deepStrictEqual(d.areas.map((a) => a.area), ['hip']);
  assert.deepStrictEqual(d.sources.map((s) => s.url), ['https://fit-blog.example/rag-bone-wren']);
  assert.strictEqual(Store.dossierEntry(null), null);
  assert.strictEqual(Store.dossierEntry({ verdict: 'small', strength: 'lots', areas: [], sources: [] }), null);
});

// ---- the engine --------------------------------------------------------------------------------------

// A brand with no chart, so the standard EU chart is used: this profile lands on 40 (see fit-areas).
const trousers = (over = {}) => ({ brand: 'Ostra', title: 'Straight trousers', text: '', sizes: ['34', '36', '38', '40', '42'].map((label) => ({ label })), ...over });
const ME = { waist: '68', hip: '102', anchors: [] };
const web = (over = {}) => ({ verdict: 'small', strength: 0.8, areas: [], brand_note: null, sources: [{ url: 'https://fit-blog.example/ostra', title: 'Ostra fit notes' }, { url: 'https://shop.example/reviews', title: 'Reviews' }], ...over });

test('without a dossier the answer is exactly as before', () => {
  const plain = recommend(ME, trousers(), null);
  assert.deepStrictEqual(recommend(ME, trousers({ dossier: null }), null), plain);
  assert.strictEqual(plain.size, '40');
  assert.strictEqual(plain.dossier, undefined);
});

test('a strong "runs small" from others online moves the size one up, and says so', () => {
  const r = recommend(ME, trousers({ dossier: web() }), null);
  assert.strictEqual(r.size, '42');
  assert.strictEqual(r.headline, 'Others online say it runs small, sized up');
  const reason = r.reasons.find((x) => x.delta === 1);
  assert.strictEqual(reason.text, 'Others online say it runs small (2 sources), so one size up.');
  assert.deepStrictEqual(r.dossier, { verdict: 'small', strength: 0.8, moved: 1, brand_note: null, sources: web().sources });
  const large = recommend(ME, trousers({ dossier: web({ verdict: 'large', sources: [web().sources[0]] }) }), null);
  assert.strictEqual(large.size, '38');
  assert.ok(large.reasons.some((x) => x.text === 'Others online say it runs large (1 source), so one size down.' && x.delta === -1), JSON.stringify(large.reasons));
});

test('a weak verdict, under 0.6, is mentioned but moves nothing', () => {
  const r = recommend(ME, trousers({ dossier: web({ strength: 0.59 }) }), null);
  assert.strictEqual(r.size, '40');
  assert.ok(r.reasons.some((x) => x.text === 'Others online lean towards it running small (2 sources), not clearly enough to move the size.' && !x.delta), JSON.stringify(r.reasons));
  assert.strictEqual(r.dossier.moved, 0);
});

test('the page’s own note wins, and the dossier never moves the size twice', () => {
  const page = recommend(ME, trousers({ text: 'This style runs small, we recommend sizing up.' }), null);
  const both = recommend(ME, trousers({ text: 'This style runs small, we recommend sizing up.', dossier: web() }), null);
  assert.strictEqual(both.size, page.size);
  assert.strictEqual(both.reasons.filter((x) => x.delta).length, 1);
  assert.ok(both.reasons.some((x) => x.text === 'Others online also say it runs small (2 sources).'), JSON.stringify(both.reasons));
  const against = recommend(ME, trousers({ text: 'This style runs large.', dossier: web() }), null);
  assert.strictEqual(against.size, '38');
  assert.ok(against.reasons.some((x) => x.text === 'Others online say it runs small (2 sources), but what this page says comes first.'), JSON.stringify(against.reasons));
});

test('reviews that already moved the size keep it; the dossier does not add a second step', () => {
  const reviews = ['Runs small.', 'Runs small, size up.', 'Lovely.'];
  const rv = recommend(ME, trousers({ reviews }), null);
  const both = recommend(ME, trousers({ reviews, dossier: web() }), null);
  assert.strictEqual(rv.size, '42');
  assert.strictEqual(both.size, '42');
  assert.strictEqual(both.headline, rv.headline);
  assert.strictEqual(both.reasons.filter((x) => x.delta).length, 1);
});

test('a page or reviews saying true to size hold the size against the dossier', () => {
  const page = recommend(ME, trousers({ text: 'Fits true to size.', dossier: web() }), null);
  assert.strictEqual(page.size, '40');
  const rv = recommend(ME, trousers({ reviews: ['True to size.', 'True to size for me.', 'Fits true.'], dossier: web() }), null);
  assert.strictEqual(rv.size, '40');
});

test('"true to size" from others online is a reason line only', () => {
  const r = recommend(ME, trousers({ dossier: web({ verdict: 'tts' }) }), null);
  assert.strictEqual(r.size, '40');
  assert.ok(r.reasons.some((x) => x.text === 'Others online say it fits true to size (2 sources).'), JSON.stringify(r.reasons));
});

test('the dossier’s areas join the areas, marked as from the web', () => {
  const r = recommend(ME, trousers({ dossier: web({ verdict: null, strength: 0, areas: [{ area: 'hip', direction: 'tight', note: 'Snug at the hips.' }, { area: 'inseam', direction: 'long', note: 'Long in the leg.' }, { area: 'waist', direction: 'loose', note: 'Gapes.' }] }) }), null);
  assert.strictEqual(r.size, '40');
  const webAreas = r.areas.filter((a) => a.source === 'web');
  assert.deepStrictEqual(webAreas.map((a) => [a.area, a.verdict, a.text]), [
    ['hip', 'tight', 'Others online find it tight at the hips'],
    ['inseam', 'long', 'Others online find it long in the leg'],
    ['waist', 'roomy', 'Others online find it loose at the waist'],
  ]);
  assert.strictEqual(r.areas[0].source, 'web', 'a tight area comes first');
  assert.ok(r.reasons.some((x) => x.text === 'Sizer also read what others online say about the fit (2 sources).'), JSON.stringify(r.reasons));
});

test('a dossier that moved the size keeps Sizer users’ brand tendency from moving it again', () => {
  const learned = { brands: [], brandFit: [{ brand_key: 'ostra', kind: 'bottoms', small: 10, tts: 1, large: 0, total: 11 }] };
  const plain = recommend(ME, trousers(), null);
  const fromUsers = recommend(ME, trousers(), learned);
  const both = recommend(ME, trousers({ dossier: web() }), learned);
  assert.strictEqual(+fromUsers.size, +plain.size + 2, 'Sizer users alone move it one size');
  assert.strictEqual(both.size, fromUsers.size, 'the dossier moves it instead, not as well');
  assert.strictEqual(both.headline, 'Others online say it runs small, sized up');
  assert.ok(!both.reasons.some((x) => /Sizer users/.test(x.text)), JSON.stringify(both.reasons));
});

test('the shared sheet lists the dossier’s web sources, escaped, so the side panel shows them too', () => {
  const Sheet = require('../src/sheet.js');
  const r = recommend(ME, trousers({ dossier: web({ brand_note: 'Cut <b>slim</b>.', sources: [{ url: 'https://ok.example/a?x="1"', title: '<i>Fit</i>' }, { url: 'javascript:alert(1)', title: 'bad' }] }) }), null);
  const html = Sheet.body(r, { sizes: [] });
  assert.match(html, /<h3>What others say online<\/h3>/);
  assert.match(html, /href="https:\/\/ok\.example\/a\?x=&quot;1&quot;"/);
  assert.match(html, /&lt;i&gt;Fit&lt;\/i&gt;/);
  assert.match(html, /Cut &lt;b&gt;slim&lt;\/b&gt;\./);
  assert.ok(!/javascript:/.test(html));
  assert.match(Sheet.body(r, { sizes: [] }, { checking: true }), /Checking what others say about the fit/);
});

test('trousers take no bust, shoulder or sleeve area from the web either', () => {
  const r = recommend(ME, trousers({ dossier: web({ verdict: null, strength: 0, areas: [{ area: 'bust', direction: 'tight', note: 'x' }, { area: 'shoulder', direction: 'tight', note: 'x' }, { area: 'hip', direction: 'tight', note: 'x' }] }) }), null);
  assert.deepStrictEqual(r.areas.filter((a) => a.source === 'web').map((a) => a.area), ['hip']);
});

test('a web area that reviewers like you already named is not listed twice', () => {
  const card = 'About my curves About my height curvy petite Tight in the hips. Sizing true to size';
  const me = { ...ME, height: '160' };
  const r = recommend(me, trousers({ reviewCards: [card, card, card], reviews: [], dossier: web({ verdict: null, areas: [{ area: 'hip', direction: 'tight', note: 'x' }] }) }), null);
  assert.ok(r.areas.some((a) => a.source === 'reviews' && a.area === 'hip'));
  assert.ok(!r.areas.some((a) => a.source === 'web' && a.area === 'hip'), JSON.stringify(r.areas));
});

test('only web sources are listed, and a dossier with none changes nothing', () => {
  const r = recommend(ME, trousers({ dossier: web({ sources: [{ url: 'javascript:alert(1)', title: 'x' }, { url: 'https://ok.example/a', title: '' }] }) }), null);
  assert.deepStrictEqual(r.dossier.sources, [{ url: 'https://ok.example/a', title: 'ok.example' }]);
  const none = recommend(ME, trousers({ dossier: web({ sources: [{ url: 'data:text/html,x', title: 'x' }] }) }), null);
  assert.deepStrictEqual(none, recommend(ME, trousers(), null));
});

test('shoes take the dossier too', () => {
  const shoe = { brand: 'Ostra', title: 'Leather ankle boots', text: '', sizes: ['37', '38', '39', '40'].map((label) => ({ label })) };
  const me = { anchors: [], footLength: '24.5' };
  const plain = recommend(me, shoe, null);
  const r = recommend(me, { ...shoe, dossier: web({ areas: [{ area: 'foot', direction: 'tight', note: 'Narrow.' }] }) }, null);
  assert.notStrictEqual(r.size, plain.size);
  assert.strictEqual(r.headline, 'Others online say it runs small, sized up');
  assert.deepStrictEqual(r.areas.map((a) => a.text), ['Others online find it tight across the foot']);
});

test('the review tally for the dossier counts area mentions once per review, unweighted', () => {
  const r = recommend({ ...ME, height: '190' }, trousers({ reviewCards: ['Tight in the hips. Runs small', 'Tight in the hips and long in the leg.', 'Lovely colour.'], reviews: [] }), null);
  assert.deepStrictEqual(r.reviewAreas, [{ area: 'hip', direction: 'tight', count: 2 }, { area: 'inseam', direction: 'long', count: 1 }]);
});

test('dossier copy has no em dash or exclamation mark', () => {
  const texts = [];
  for (const d of [web(), web({ strength: 0.3 }), web({ verdict: 'tts' }), web({ verdict: 'large' }), web({ verdict: null, areas: [{ area: 'sleeve', direction: 'short', note: 'x' }] })]) {
    const r = recommend(ME, trousers({ dossier: d, text: 'Runs large.' }), null);
    const r2 = recommend(ME, trousers({ dossier: d }), null);
    for (const x of [r, r2]) texts.push(x.headline, ...x.reasons.map((y) => y.text), ...x.areas.map((a) => a.text));
  }
  for (const t of texts) assert.strictEqual(/—|!/.test(t), false, t);
});
