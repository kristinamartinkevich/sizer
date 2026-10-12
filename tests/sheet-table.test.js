const test = require('node:test');
const assert = require('node:assert');
const { recommend } = require('../src/engine.js');
const { GENERIC } = require('../src/brands.js');
const Sheet = require('../src/sheet.js');
const { normalise } = require('../src/charts-store.js');

// The "Why this size" sheet compares any size on the page with you, one size at a time, the way
// Minga London's size guide does: your body against the chart, the garment's own measurements, and
// the size in other countries, each on its own tab.

const jeans = {
  title: 'Straight jeans',
  text: '98% cotton, 2% elastane',
  sizes: [
    { label: '26', available: true },
    { label: '27', available: false },
    { label: '28', available: true },
    { label: '29', available: true },
    { label: '30', available: false },
  ],
};
const you = { waist: 72, hip: 98 };

test('the answer carries a table: each chart size with the range of body it is cut for', () => {
  const r = recommend(you, jeans, { brands: [] });
  assert.ok(r.ok && r.table, 'a table comes with the answer');
  const rows = GENERIC.denim;
  const i = rows.findIndex((x) => x.label === '28');
  const row = r.table.rows[i];
  assert.strictEqual(row.label, 'W28');
  // Halfway to the size below and the size above: where the chart stops calling it a 28.
  assert.ok(Math.abs(row.body.waist[0] - (rows[i - 1].waist + rows[i].waist) / 2) < 0.06);
  assert.ok(Math.abs(row.body.waist[1] - (rows[i].waist + rows[i + 1].waist) / 2) < 0.06);
  assert.ok(Math.abs(row.body.hip[0] - (rows[i - 1].hip + rows[i].hip) / 2) < 0.06);
  // The first size has no size below it: its range runs as far down as it runs up.
  const first = r.table.rows[0].body.waist;
  assert.ok(Math.abs((first[0] + first[1]) / 2 - rows[0].waist) < 0.06);
  assert.deepStrictEqual(r.table.you, { waist: 72, hip: 98 });
});

test('every size on the page is placed on a chart row, with its stock', () => {
  const r = recommend(you, jeans, { brands: [] });
  const at = (l) => GENERIC.denim.findIndex((x) => x.label === l);
  assert.deepStrictEqual(r.table.sizes, [
    { label: '26', available: true, row: at('26') },
    { label: '27', available: false, row: at('27') },
    { label: '28', available: true, row: at('28') },
    { label: '29', available: true, row: at('29') },
    { label: '30', available: false, row: at('30') },
  ]);
});

test('the sheet lists the page’s sizes once, marks the answer and the sold out ones, and shows the answer first', () => {
  const r = recommend(you, jeans, { brands: [] });
  const html = Sheet.body(r, jeans);
  const answer = r.table.sizes.findIndex((s) => s.label === r.size);
  assert.match(html, new RegExp(`<button type="button" class="sz yours view" data-size="${answer}" aria-pressed="true"`));
  assert.match(html, /<button type="button" class="sz gone" data-size="1" aria-pressed="false" aria-label="27, sold out">27<\/button>/);
  for (const tab of ['body', 'garment', 'conv']) assert.match(html, new RegExp(`role="tab" data-tab="${tab}"`));
  // The answer's body tab is the one open; every other panel waits, hidden.
  assert.match(html, new RegExp(`<div class="tp" role="tabpanel" data-for-size="${answer}" data-for-tab="body">`));
  assert.match(html, /<div class="tp" role="tabpanel" data-for-size="0" data-for-tab="body" hidden>/);
  assert.match(html, new RegExp(`data-for-size="${answer}" data-for-tab="garment" hidden`));
  // The sold out chips now live in the size row, not in the read-out at the bottom.
  assert.doesNotMatch(html, /<span class="k">Sold out<\/span>/);
});

test('the body tab says where you sit in each size, in words and as a bar', () => {
  const r = recommend(you, jeans, { brands: [] });
  const html = Sheet.body(r, jeans);
  const panel = (label, tab) => {
    const i = r.table.sizes.findIndex((s) => s.label === label);
    const m = html.match(new RegExp(`data-for-size="${i}" data-for-tab="${tab}"[^>]*>([\\s\\S]*?)</div><!--tp-->`));
    assert.ok(m, `${label} ${tab} panel`);
    return m[1];
  };
  // W28 is cut for a waist of about 71 to 74 cm; 72 is inside it.
  assert.match(panel('28', 'body'), /Inside this size’s range, \d cm from the top/);
  assert.match(panel('28', 'body'), /class="bar"/);
  // W30 starts above 74 cm: a 72 waist is under it, so it would be loose.
  assert.match(panel('30', 'body'), /\d cm under this size’s range, so looser/);
  assert.match(panel('26', 'body'), /\d cm over this size’s range, so tighter/);
  // On the Zalando page a 70 cm waist sat 1 cm under the answer's range, and the tab said "so looser"
  // over the line "Fits as expected at the waist". Just outside a range is not roomy: W29 starts at
  // about 73.7 cm, 2 cm over a 72 waist, yet its middle is under 4 cm away, where the fit lines
  // first call a size roomy.
  assert.match(panel('29', 'body'), /2 cm under this size’s range<\/span>/);
  assert.doesNotMatch(panel('29', 'body'), /looser/);
  // No garment measurements and no other countries for a standard jeans waist: each tab says so.
  assert.match(panel('28', 'garment'), /body measurements, not the garment’s own/);
  assert.match(panel('28', 'conv'), /no other countries’ sizes/);
});

test('the conversion tab gives the size in other countries when the chart’s system has them', () => {
  const dress = { title: 'Midi dress', text: 'Viscose', sizes: ['36', '38', '40'].map((label) => ({ label: `EU ${label}`, available: true })) };
  const r = recommend({ bust: 88, waist: 72, hip: 97 }, dress, { brands: [] });
  const html = Sheet.body(r, dress);
  const i = r.table.sizes.findIndex((s) => s.label === 'EU 38');
  const conv = html.match(new RegExp(`data-for-size="${i}" data-for-tab="conv"[^>]*>([\\s\\S]*?)</div><!--tp-->`))[1];
  assert.match(conv, /<span class="n">UK<\/span><span class="c">10<\/span>/);
  assert.match(conv, /<span class="n">US<\/span><span class="c">6<\/span>/);
  assert.match(conv, /<span class="n">IT<\/span><span class="c">42<\/span>/);
});

test('the garment tab shows the garment’s own measurements when the brand’s chart prints them', () => {
  // A brand whose chart prints the trousers' own measurements, in cm, all the way round.
  const bundle = normalise([{
    brand_id: 'testbrand', brand_name: 'Testbrand', aliases: ['testbrand'], updated_at: '2026-10-12T00:00:00Z', fit_notes: [],
    charts: [{
      id: 'c-test', gender: 'women', category: 'trousers', fit_line: null, measurement_basis: 'garment', unit: 'cm', size_system: 'eu',
      source_url: 'https://example.com/size-guide', source_archive_url: null, retrieved_on: '2026-10-12', fit_advice: null,
      rows: [34, 36, 38, 40, 42].map((eu, i) => ({
        label: String(eu), aliases: {}, bust: null, inseam: null, foot_length: null, extra: {}, suspect: null,
        waist: [67 + i * 4, 67 + i * 4], hip: [93 + i * 4, 93 + i * 4],
      })),
    }],
  }]);
  const product = { brand: 'Testbrand', title: 'Straight trousers', text: '100% cotton', sizes: ['34', '36', '38', '40', '42'].map((label) => ({ label, available: true })) };
  const r = recommend({ waist: 72, hip: 98, anchors: [] }, product, bundle);
  assert.ok(r.ok, r.reason);
  const html = Sheet.body(r, product);
  const i = r.table.sizes.findIndex((s) => s.label === '38');
  const garment = html.match(new RegExp(`data-for-size="${i}" data-for-tab="garment"[^>]*>([\\s\\S]*?)</div><!--tp-->`))[1];
  // EU 38 is 75 cm round the waist and 101 cm round the hip, as the brand prints it.
  assert.match(garment, /<span class="n">Waist<\/span><span class="c">75<\/span>/);
  assert.match(garment, /<span class="n">Hip<\/span><span class="c">101<\/span>/);
  assert.doesNotMatch(garment, /body measurements, not the garment’s own/);
});

test('size labels from the page are escaped in the size row', () => {
  const evil = { ...jeans, sizes: [{ label: '28<img>', available: true }, ...jeans.sizes] };
  const r = recommend(you, evil, { brands: [] });
  assert.doesNotMatch(Sheet.body(r, evil), /<img>/);
});

// A tiny stand-in for the shadow root: enough of the DOM for wire() to show and hide panels.
function fakeRoot(html) {
  const els = [];
  for (const m of html.matchAll(/<(button|div)\s([^>]*?(data-size|data-tab|data-for-size)="[^"]*"[^>]*)>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] == null ? '' : a[2];
    els.push({
      attrs,
      hidden: 'hidden' in attrs,
      classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
      getAttribute(k) { return this.attrs[k] ?? null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      get classList() { const c = this.classes; return { toggle: (n, on) => (on ? c.add(n) : c.delete(n)), contains: (n) => c.has(n) }; },
      closest(sel) { const k = sel.replace(/[[\]]/g, ''); return k in this.attrs ? this : null; },
    });
  }
  let handler;
  return {
    els,
    querySelectorAll(sel) { const k = sel.replace(/[[\]]/g, ''); return els.filter((e) => k in e.attrs); },
    addEventListener(type, fn) { if (type === 'click') handler = fn; },
    click(el) { handler({ target: el }); },
  };
}

test('wire() follows the clicked size and tab, and reports them so a redraw keeps them', () => {
  const r = recommend(you, jeans, { brands: [] });
  const root = fakeRoot(Sheet.body(r, jeans));
  const seen = [];
  Sheet.wire(root, (v) => seen.push(v));
  const btn = (k, v) => root.els.find((e) => e.attrs[k] === v);
  const open = () => root.els.filter((e) => 'data-for-size' in e.attrs && !e.hidden).map((e) => `${e.attrs['data-for-size']}/${e.attrs['data-for-tab']}`);
  root.click(btn('data-size', '4'));
  assert.deepStrictEqual(open(), ['4/body']);
  assert.strictEqual(btn('data-size', '4').attrs['aria-pressed'], 'true');
  assert.ok(btn('data-size', '4').classList.contains('view'));
  root.click(btn('data-tab', 'conv'));
  assert.deepStrictEqual(open(), ['4/conv']);
  assert.strictEqual(btn('data-tab', 'conv').attrs['aria-selected'], 'true');
  assert.strictEqual(btn('data-tab', 'body').attrs['aria-selected'], 'false');
  assert.deepStrictEqual(seen[seen.length - 1], { size: 4, tab: 'conv' });
});

test('a redraw opens the size and tab the shopper last chose', () => {
  const r = recommend(you, jeans, { brands: [] });
  const html = Sheet.body(r, jeans, { view: { size: 4, tab: 'conv' } });
  assert.match(html, /data-for-size="4" data-for-tab="conv">/);
  assert.match(html, /class="sz gone view" data-size="4" aria-pressed="true"/);
  // A size that no longer exists falls back to the answer.
  const back = Sheet.body(r, jeans, { view: { size: 99, tab: 'body' } });
  const answer = r.table.sizes.findIndex((s) => s.label === r.size);
  assert.match(back, new RegExp(`data-for-size="${answer}" data-for-tab="body">`));
});
