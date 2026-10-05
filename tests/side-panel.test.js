const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { recommend } = require('../src/engine.js');
const Sheet = require('../src/sheet.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('the side panel is declared with its permission and page', () => {
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.strictEqual(manifest.side_panel.default_path, 'ui/sidepanel.html');
  assert.ok(fs.existsSync(path.join(root, 'ui/sidepanel.html')));
});

test('every page that runs content.js loads the sheet and the question before it', () => {
  const need = ['src/engine.js', 'src/feedback.js', 'src/fit-question.js', 'src/sheet.js'];
  const order = (list) => {
    const at = (f) => list.findIndex((x) => x.endsWith(f));
    for (const f of need) assert.ok(at(f) >= 0 && at(f) < at('src/content.js'), `${f} loads before content.js`);
    assert.ok(at('src/feedback.js') < at('src/fit-question.js') && at('src/engine.js') < at('src/sheet.js'));
  };
  order(manifest.content_scripts[0].js);
  for (const file of ['ui/popup.js', 'ui/sidepanel.js']) order(JSON.parse(read(file).match(/const FILES = (\[[^\]]+\])/)[1].replace(/'/g, '"')));
  order([...read('tests/fixture-shop.html').matchAll(/<script src="\.\.\/(src\/[^"]+)"/g)].map((m) => m[1]));
});

test('the side panel page loads what the sheet and the question need, in order', () => {
  const scripts = [...read('ui/sidepanel.html').matchAll(/<script src="\.\.\/(src\/[^"]+)"/g)].map((m) => m[1]);
  const at = (f) => scripts.indexOf(f);
  for (const f of ['src/brands.js', 'src/charts.js', 'src/review-details.js']) assert.ok(at(f) >= 0 && at(f) < at('src/engine.js'), `${f} loads before the engine`);
  for (const f of ['src/panel-style.js', 'src/defaults.js']) assert.ok(at(f) >= 0, f);
  assert.ok(at('src/engine.js') < at('src/sheet.js'));
  assert.ok(at('src/feedback.js') < at('src/fit-question.js'));
});

test('the popup offers the side panel and loads the question', () => {
  assert.match(read('ui/popup.html'), /id="open-panel"[^>]*>Open side panel</);
  assert.match(read('ui/popup.html'), /src="\.\.\/src\/fit-question\.js"/);
});

test('the side panel leaves a named slot for the Vinted bundle, shown on Vinted listings only', () => {
  const html = read('ui/sidepanel.html');
  assert.match(html, /id="vinted-slot" data-hook="vinted"[^>]* hidden/);
  const js = read('ui/sidepanel.js');
  assert.match(js, /SizerVintedPanel\.mount\(slot, \{ tab, url \}\)/);
  const re = new RegExp(js.match(/const VINTED_ITEM = \/(.+)\/i;/)[1], 'i');
  assert.ok(re.test('https://www.vinted.fr/items/123-robe'));
  assert.ok(re.test('https://www.vinted.co.uk/items/9'));
  assert.ok(!re.test('https://www.vinted.fr/catalog'));
  assert.ok(!re.test('https://www.zalando.de/items/1'));
});

test('the sheet content names what Sizer users learned, and escapes the page', () => {
  const profile = { anchors: [{ brand: 'zara', size: '38' }, { brand: 'generic-denim', size: '27' }] };
  const product = { brand: 'rag & bone', title: 'Skinny jeans <b>', text: '2% elastane', sizes: ['W26/L32', 'W27/L32', 'W28/L32<script>'].map((label) => ({ label })) };
  const r = recommend(profile, product, { brands: [], brandFit: [{ brand_key: 'rag and bone', kind: 'bottoms', small: 10, tts: 1, large: 0, total: 11 }] });
  const html = Sheet.body(r, product);
  assert.match(html, /10 of 11 Sizer users who bought this brand say it runs small\./);
  assert.match(html, /\+1 size/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(Sheet.body(null, null), /couldn’t find a product/);
});
