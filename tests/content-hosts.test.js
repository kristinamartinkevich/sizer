const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Found shopping as a tall persona: Lucy & Yak's theme (Shopify Dawn) hides "div:empty", and a
// Sizer host holds only a shadow root, so "Why this size" opened a sheet nobody could see. The line
// below the picker survived only because it set its own display. tests/fixture-shop.html?empty=1
// adds the same rule to the demo page.
test('every Sizer host is shown over a shop rule that hides empty divs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  const host = src.match(/function host\(id, place\) \{[\s\S]*?\n  \}/);
  assert.ok(host, 'content.js has one host() that makes every Sizer element');
  assert.match(host[0], /el\.style\.setProperty\('display', 'block', 'important'\)/);
  assert.strictEqual((src.match(/document\.createElement\('div'\);\s*el\.id = id;/g) || []).length, 1, 'no host is made outside host()');
});
