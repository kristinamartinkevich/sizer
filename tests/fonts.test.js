const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The extension draws in three faces: Archivo, wide, for the wordmark and the big size figure;
// DM Mono for labels and measurements; Hanken Grotesk for sentences. A face whose file is missing
// from the package falls back to Arial without a word, so every file each surface asks for must
// be shipped, and reachable from a shop page.

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const FAMILIES = ['Archivo', 'DM Mono', 'Hanken Grotesk'];

test('the extension pages declare every face, and every file they ask for is in fonts/', () => {
  const css = read('ui/fonts.css');
  for (const f of FAMILIES) assert.match(css, new RegExp(`font-family: "${f}"`), `${f} declared in ui/fonts.css`);
  const urls = [...css.matchAll(/url\("\.\.\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 8, 'latin and latin-ext for each face and weight');
  for (const u of urls) assert.ok(fs.existsSync(path.join(root, u)), `${u} is shipped`);
});

test('a shop page gets the same faces, from files the manifest lets the page load', () => {
  const content = read('src/content.js');
  for (const f of FAMILIES) assert.match(content, new RegExp(`face\\('${f}', 'fonts/`), `${f} injected on shop pages`);
  const files = [...content.matchAll(/'(fonts\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(files.some((f) => /Archivo/.test(f)) && files.some((f) => /DMMono/.test(f)));
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `${f} is shipped`);
  const manifest = JSON.parse(read('manifest.json'));
  const open = manifest.web_accessible_resources.flatMap((w) => w.resources);
  for (const f of files) assert.ok(open.some((r) => r === f || (r === 'fonts/*.woff2' && /^fonts\/[^/]+\.woff2$/.test(f))), `${f} is web accessible`);
});

test('the open-font licences travel with the files', () => {
  for (const f of ['OFL-Archivo.txt', 'OFL-DMMono.txt']) assert.ok(fs.existsSync(path.join(root, 'fonts', f)), f);
});

test('every surface names the wide and mono faces as tokens', () => {
  for (const f of ['src/panel-style.js', 'ui/ui.css', 'ui/options.css']) {
    const s = read(f);
    assert.match(s, /--wide: "Archivo"/, `${f} --wide`);
    assert.match(s, /--mono: "DM Mono"/, `${f} --mono`);
  }
});
