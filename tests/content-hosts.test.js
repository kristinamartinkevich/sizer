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

// The UK high street, the Inditex sister brands and Uniqlo run on their own, like Zara and ASOS:
// about a quarter of UK online clothing spend that needed a click on the toolbar icon (2026-10-12).
test('the UK high street, Inditex and Uniqlo are on the automatic list', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const matches = manifest.content_scripts[0].matches;
  for (const shop of ['marksandspencer.com', 'johnlewis.com', 'riverisland.com', 'boohoo.com', 'prettylittlething.com', 'newlook.com', 'next.co.uk', 'jdsports.co.uk', 'bershka.com', 'pullandbear.com', 'stradivarius.com', 'massimodutti.com', 'uniqlo.com']) {
    assert.ok(matches.includes(`https://*.${shop}/*`), shop);
  }
});

// Amazon sells about a third of US clothing online. Sizer runs on its product pages only, which hold
// every kind of product; the engine says nothing where the options are not clothing sizes.
test('Amazon product pages are on the automatic list, and only its product pages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const matches = manifest.content_scripts[0].matches;
  const amazon = matches.filter((m) => /amazon\./.test(m));
  for (const site of ['com', 'co.uk', 'de', 'fr', 'it', 'es', 'ca', 'com.au', 'nl', 'ie']) {
    assert.ok(matches.includes(`https://www.amazon.${site}/*dp/*`), site);
    assert.ok(matches.includes(`https://www.amazon.${site}/gp/product/*`), site);
  }
  assert.ok(amazon.every((m) => /\/(\*dp|gp\/product)\/\*$/.test(m)), 'no Amazon search, basket or home page');
});
