const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

require('../src/mark.js');

// An <img> pointing at chrome-extension:// is blocked by a shop's Content Security Policy
// (Revolve showed a broken image), so the mark has to be inline SVG.
test('the mark is inline SVG, not an extension image URL', () => {
  const svg = globalThis.SIZER_MARK_SVG;
  assert.match(svg, /^<svg [^>]*viewBox="0 0 1000 1000"/);
  assert.match(svg, /<\/svg>$/);
  const content = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
  assert.ok(!/getURL\(['"]brand\/mark\.svg/.test(content), 'content.js must not load the mark through chrome.runtime.getURL');
  assert.ok(content.includes('SIZER_MARK_SVG'));
});

test('mark.js is loaded before content.js everywhere the content script runs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  const js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf('src/mark.js') > -1 && js.indexOf('src/mark.js') < js.indexOf('src/content.js'));
  const popup = fs.readFileSync(path.join(__dirname, '../ui/popup.js'), 'utf8');
  assert.ok(popup.indexOf("'src/mark.js'") > -1 && popup.indexOf("'src/mark.js'") < popup.indexOf("'src/content.js'"));
});
