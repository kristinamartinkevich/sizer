// C5: the Vinted listing reader's pure half, the label-only answer, the photo read's request body,
// and the manifest entry. The DOM half (src/vinted-page.js) is checked in tests/shops.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../src/defaults.js');
const Vinted = require('../src/vinted.js');
const Engine = require('../src/engine.js');
const Store = require('../src/charts-store.js');

const ROOT = path.join(__dirname, '..');
const INSTALL = '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64';

test('the category path decides the kind of item, most specific part first, in every Vinted language', () => {
  assert.strictEqual(Vinted.kindOfListing(['Femmes', 'Vêtements', 'Robes', 'Robes midi'], ''), 'dress');
  assert.strictEqual(Vinted.kindOfListing(['Damen', 'Kleidung', 'Jeans', 'Skinny Jeans'], ''), 'jeans');
  assert.strictEqual(Vinted.kindOfListing(['Women', 'Clothing', 'Outerwear', 'Coats', 'Trench coats'], ''), 'outerwear');
  assert.strictEqual(Vinted.kindOfListing(['Mujer', 'Ropa', 'Faldas'], ''), 'skirt');
  assert.strictEqual(Vinted.kindOfListing(['Donna', 'Abbigliamento', 'Pantaloni e leggings'], ''), 'trousers');
  assert.strictEqual(Vinted.kindOfListing(['Dames', 'Schoenen', 'Laarzen'], ''), 'shoes');
  assert.strictEqual(Vinted.kindOfListing(['Kobiety', 'Ubrania', 'Szorty'], ''), 'shorts');
  assert.strictEqual(Vinted.kindOfListing(['Femmes', 'Vêtements', 'Hauts et t-shirts', 'Chemises'], ''), 'top');
  assert.strictEqual(Vinted.kindOfListing(['Femmes', 'Vêtements', 'Manteaux et vestes', 'Vestes', 'Vestes en jean'], ''), 'outerwear');
});

test('with no category, the title decides, and a top is the fallback', () => {
  assert.strictEqual(Vinted.kindOfListing([], 'Jean Levi’s 501 taille haute'), 'jeans');
  assert.strictEqual(Vinted.kindOfListing([], 'Robe longue fleurie'), 'dress');
  assert.strictEqual(Vinted.kindOfListing([], 'Joli haut'), 'top');
});

test('each kind of listing has a word the engine reads as the same kind', () => {
  const expect = { top: 'tops', dress: 'dresses', jeans: 'bottoms', trousers: 'bottoms', shorts: 'bottoms', skirt: 'bottoms', outerwear: 'outerwear', shoes: 'shoes' };
  for (const [kind, engineKind] of Object.entries(expect)) assert.strictEqual(Engine.kindOf(Vinted.engineTitle(kind)), engineKind, kind);
});

test('the size label is the first size Vinted prints; one-size and other are no size', () => {
  assert.strictEqual(Vinted.sizeLabel('M / 38 / 10'), 'M');
  assert.strictEqual(Vinted.sizeLabel('Taille : 38'), '38');
  assert.strictEqual(Vinted.sizeLabel('W27 | FR 36'), 'W27');
  assert.strictEqual(Vinted.sizeLabel('  XS  '), 'XS');
  assert.strictEqual(Vinted.sizeLabel('Taille unique'), null);
  assert.strictEqual(Vinted.sizeLabel('One size'), null);
  assert.strictEqual(Vinted.sizeLabel('Autre'), null);
  assert.strictEqual(Vinted.sizeLabel(''), null);
});

const LD = {
  '@type': 'Product',
  name: 'Robe midi Sézane',
  description: 'Portée deux fois. Aisselle à aisselle 46 cm, longueur 112 cm.',
  brand: { '@type': 'Brand', name: 'Sézane' },
  image: ['https://images1.vinted.net/t/01_a/f800/1.jpeg', { url: 'https://images1.vinted.net/t/01_a/f800/2.jpeg' }, 'http://images1.vinted.net/insecure.jpeg'],
  itemCondition: 'https://schema.org/UsedCondition',
  category: 'Femmes > Vêtements > Robes > Robes midi',
};

test('a listing is read from its structured data first, the page second', () => {
  const l = Vinted.listingFrom({ host: 'www.vinted.fr', ld: LD, brand: 'Autre marque', title: 'Autre titre', size: 'S / 36 / 8', condition: 'Très bon état', category: ['Femmes', 'Vêtements', 'Hauts'], photos: ['https://images1.vinted.net/t/01_a/f800/1.jpeg', 'https://images1.vinted.net/t/01_a/f800/3.jpeg'], description: '' });
  assert.strictEqual(l.brand, 'Sézane');
  assert.strictEqual(l.title, 'Robe midi Sézane');
  assert.strictEqual(l.kind, 'dress');
  assert.strictEqual(l.sizeRaw, 'S / 36 / 8');
  assert.strictEqual(l.size, 'S');
  assert.strictEqual(l.condition, 'Très bon état');
  assert.strictEqual(l.lang, 'fr');
  assert.deepStrictEqual(l.have, { pit: 46, length: 112 });
  assert.deepStrictEqual(l.photos, ['https://images1.vinted.net/t/01_a/f800/1.jpeg', 'https://images1.vinted.net/t/01_a/f800/2.jpeg', 'https://images1.vinted.net/t/01_a/f800/3.jpeg']);
});

test('without structured data the page fields are used, and the condition falls back to the schema word', () => {
  const l = Vinted.listingFrom({ host: 'www.vinted.de', ld: null, brand: ' Levi’s ', title: 'Levi’s 501', size: 'W27', category: ['Damen', 'Kleidung', 'Jeans'], description: 'Bundweite 36 cm, Innenbeinlänge 76 cm', photos: [] });
  assert.strictEqual(l.brand, 'Levi’s');
  assert.strictEqual(l.kind, 'jeans');
  assert.strictEqual(l.lang, 'de');
  assert.deepStrictEqual(l.have, { waistFlat: 36, inseam: 76 });
  assert.strictEqual(Vinted.listingFrom({ host: 'www.vinted.fr', ld: { ...LD, brand: 'Sézane' } }).condition, 'Used');
  assert.strictEqual(Vinted.listingFrom({ host: 'www.vinted.fr', ld: { ...LD, brand: 'Sézane' } }).brand, 'Sézane');
});

test('photo measurements fill only what the description left out, and are marked as read from a photo', () => {
  const m = Vinted.mergeMeasurements({ pit: 46 }, { pit: 50, length: 112, sleeve: 3, rise: 'x', shoulder: 38 });
  assert.deepStrictEqual(m.have, { pit: 46, length: 112, shoulder: 38 });
  assert.deepStrictEqual(m.fromPhoto, ['length', 'shoulder']);
  assert.deepStrictEqual(Vinted.mergeMeasurements({}, null), { have: {}, fromPhoto: [] });
});

test('a coat is compared with a jacket you own (regression: outerwear never matched a jacket)', () => {
  const jacket = { brand: 'Arket', type: 'jacket', size: 'S', fit: 'perfect', flat: { chest: 52, shoulder: 40, sleeve: 60, length: 70 } };
  const r = Vinted.compare({ kind: 'outerwear', have: { pit: 52.5, shoulder: 40, sleeve: 61 } }, { anchors: [jacket] });
  assert.ok(r, 'a measured jacket must be the reference for a coat');
  assert.strictEqual(r.verdict, 'fits');
  assert.strictEqual(r.against, 'Arket jacket in S');
});

test('each area says where and by how much, against your piece or your measurements', () => {
  const pieces = [{ brand: 'Agolde', type: 'jeans', size: '26', fit: 'perfect', flat: { waist: 35, inseam: 76 } }];
  const small = Vinted.compare({ kind: 'jeans', have: { waistFlat: 32.5, inseam: 70 } }, { anchors: pieces });
  assert.deepStrictEqual(Vinted.areaLines(small), ['Tight at the waist, 2.5 cm narrower than yours', 'Short in the leg, 6 cm shorter than yours']);
  const body = Vinted.compare({ kind: 'top', have: { pit: 49 } }, { anchors: [], bust: 88 });
  assert.deepStrictEqual(Vinted.areaLines(body), ['Fine at the chest, 10 cm of room over your bust']);
});

test('the label-only answer says how the label sits against your size and that the seller has not measured it', () => {
  assert.deepStrictEqual(Vinted.labelResult(0), { verdict: 'fits', line: 'Your size by the label', flag: 'Label only, the seller has not measured it' });
  assert.strictEqual(Vinted.labelResult(-1).line, 'Too small for you by the label');
  assert.strictEqual(Vinted.labelResult(2).line, 'Roomy on you by the label');
  assert.strictEqual(Vinted.labelResult(null), null);
});

test('no copy on the Vinted line has an em dash or an exclamation mark', () => {
  const copy = [...Object.values(Vinted.COPY), ...[-1, 0, 1].map((s) => Vinted.labelResult(s).line)];
  for (const s of copy) assert.ok(!/[—!]/.test(s), s);
  for (const file of ['src/vinted.js', 'src/vinted-page.js']) {
    assert.ok(!fs.readFileSync(path.join(ROOT, file), 'utf8').includes('—'), `${file} has an em dash`);
  }
  const page = fs.readFileSync(path.join(ROOT, 'src/vinted-page.js'), 'utf8');
  for (const m of page.matchAll(/(['`])((?:(?!\1).)*)\1/g)) {
    if (/[a-z] [a-z]/i.test(m[2])) assert.ok(!/!(\s|$)/.test(m[2]), m[2]);
  }
});

// ---- the label placed on the brand chart --------------------------------------------------------

const ME = { anchors: [], waist: '68', hip: '102', bust: '', unit: 'cm', fitPreference: 'regular' };

test('placeLabel: the label Sizer would pick is your size, one below is too small, one above roomy', () => {
  const product = (label) => ({ brand: 'Zara', title: Vinted.engineTitle('trousers'), text: '', label });
  const pick = Engine.placeLabel(ME, product('40'), null);
  assert.ok(pick.result.ok);
  const same = pick.result.pickLabel.replace(/^EU /, '').replace(/ \(.*\)$/, '');
  assert.strictEqual(Engine.placeLabel(ME, product(same), null).steps, 0);
  assert.strictEqual(Engine.placeLabel(ME, product(String(+same - 2)), null).steps, -1);
  assert.strictEqual(Engine.placeLabel(ME, product(String(+same + 2)), null).steps, 1);
});

test('placeLabel: a letter label on an EU brand, a UK label through the region table', () => {
  const at = (label) => Engine.placeLabel(ME, { brand: 'Zara', title: 'trousers', text: '', label }, null).steps;
  assert.strictEqual(at('L'), at('40'));
  assert.strictEqual(at('UK 12'), at('40'));
});

test('placeLabel: the brand’s reputation and pooled reviews move the size it compares with', () => {
  const plain = Engine.placeLabel(ME, { brand: 'Ostra', title: 'trousers', text: '', label: '40' }, null);
  const pooled = Engine.placeLabel(ME, { brand: 'Ostra', title: 'trousers', text: '', label: '40', poolFit: { small: 6, large: 0, tts: 1, total: 7, vendors: 2 } }, null);
  assert.strictEqual(pooled.steps, plain.steps - 1);
  assert.ok(pooled.result.reasons.some((x) => /runs small/.test(x.text)));
});

test('placeLabel: shoes by foot length, and nothing to compare without a profile or a label', () => {
  const feet = { anchors: [], footLength: '24.1' };
  const r = Engine.placeLabel(feet, { brand: '', title: Vinted.engineTitle('shoes'), text: '', label: '38' }, null);
  assert.strictEqual(r.result.shoes, true);
  assert.strictEqual(r.steps, Engine.placeLabel(feet, { brand: '', title: 'shoes', text: '', label: r.result.pickLabel.replace(/^EU /, '') }, null).steps);
  assert.strictEqual(Engine.placeLabel({ anchors: [] }, { brand: 'Zara', title: 'trousers', text: '', label: '40' }, null).steps, null);
  assert.strictEqual(Engine.placeLabel(ME, { brand: 'Zara', title: 'trousers', text: '', label: '' }, null).steps, null);
});

// ---- the answer the line shows -------------------------------------------------------------------

const listing = (over = {}) => ({ brand: 'COS', title: 'Haut COS', size: 'S', sizeRaw: 'S / 36 / 8', kind: 'top', lang: 'fr', description: '', photos: [], have: {}, ...over });
const COS_TOP = { brand: 'COS', type: 'top', size: 'S', fit: 'perfect', flat: { chest: 49, length: 64 } };

test('answerFor: seller measurements win, compared with your piece, with the areas and the message for what is missing', () => {
  const a = Vinted.answerFor(listing({ have: { pit: 48.5 } }), { anchors: [COS_TOP] }, null, Engine);
  assert.strictEqual(a.mode, 'measured');
  assert.strictEqual(a.verdict, 'fits');
  assert.match(a.line, /^Your size, compared with your COS top in S/);
  assert.deepStrictEqual(a.areas, ['Fine at the chest, 0.5 cm narrower than yours']);
  assert.match(a.message, /^Bonjour/);
  assert.match(a.message, /longueur totale/);
  assert.doesNotMatch(a.message, /aisselle/);
});

test('answerFor: without measurements, the label on the brand chart, flagged, with what Sizer knows about the brand', () => {
  const a = Vinted.answerFor(listing({ brand: 'AGOLDE', size: '27', kind: 'jeans', title: 'Jean AGOLDE Riley' }), ME, null, Engine);
  assert.strictEqual(a.mode, 'label');
  assert.strictEqual(a.flag, 'Label only, the seller has not measured it');
  assert.match(a.line, /by the label$/);
  assert.ok(a.reasons.some((t) => /rigid cotton/.test(t)), 'the brand’s tendency is brand-level knowledge');
  assert.match(a.message, /tour de taille à plat/);
  // A brand note the engine had no reason to apply (Zara's tendency is 0) is still brand knowledge.
  const zara = Vinted.answerFor(listing({ brand: 'Zara', size: 'M', kind: 'trousers', title: 'Pantalon Zara' }), ME, null, Engine);
  assert.ok(zara.reasons.some((t) => /Cut small/.test(t)), zara.reasons.join(' | '));
  assert.strictEqual(zara.reasons.filter((t) => /Cut small/.test(t)).length, 1);
});

test('length reads as length, not as a body part', () => {
  const r = Vinted.compare({ kind: 'top', have: { pit: 49, length: 60 } }, { anchors: [COS_TOP] });
  assert.deepStrictEqual(Vinted.areaLines(r), ['Fine at the chest, the same as yours', 'Short in length, 4 cm shorter than yours']);
});

test('answerFor: no profile asks for your sizes; no size and nothing measured still offers the message', () => {
  assert.strictEqual(Vinted.answerFor(listing({ size: '40' }), { anchors: [] }, null, Engine).mode, 'needsProfile');
  assert.strictEqual(Vinted.answerFor(listing({ size: null }), { anchors: [] }, null, Engine).mode, 'needsProfile');
  const unknown = Vinted.answerFor(listing({ size: null }), ME, null, Engine);
  assert.strictEqual(unknown.mode, 'unknown');
  assert.match(unknown.message, /aisselle à aisselle/);
});

test('the popup gets the same answer in its own shape, a label-only answer as a rough guess', () => {
  const measured = Vinted.popupResult(Vinted.answerFor(listing({ have: { pit: 48.5 } }), { anchors: [COS_TOP] }, null, Engine), listing());
  assert.deepStrictEqual(measured, { ok: true, size: 'S', headline: 'Your size, compared with your COS top in S', confidence: 'High', brand: 'COS', available: null });
  const label = Vinted.popupResult(Vinted.answerFor(listing({ brand: 'Zara', size: '40', kind: 'trousers' }), ME, null, Engine), listing({ brand: 'Zara', size: '40' }));
  assert.strictEqual(label.confidence, 'Low');
  assert.match(label.headline, /by the label/);
  assert.strictEqual(Vinted.popupResult({ mode: 'needsProfile' }, listing()), null);
});

// ---- the photo read ------------------------------------------------------------------------------

test('measurementsBody: at most four public Vinted photo addresses, the kind of item and the install id', () => {
  const urls = [1, 2, 3, 4, 5].map((n) => `https://images1.vinted.net/t/01_a/f800/${n}.jpeg?s=abc#zoom`);
  const body = Store.measurementsBody({ image_urls: urls, kind: 'dress', page: 'https://www.vinted.fr/items/1', brand: 'Sézane' }, INSTALL);
  assert.deepStrictEqual(Object.keys(body).sort(), ['image_urls', 'install', 'kind']);
  assert.deepStrictEqual(body.image_urls, urls.slice(0, 4).map((u) => u.replace('#zoom', '')));
  assert.strictEqual(body.kind, 'dress');
  assert.strictEqual(body.install, INSTALL);
});

test('measurementsBody: other hosts, plain http and duplicates are dropped; nothing left or an unknown kind is no request', () => {
  const body = Store.measurementsBody({ image_urls: ['https://images1.vinted.net/a.jpeg', 'https://images1.vinted.net/a.jpeg', 'http://images1.vinted.net/b.jpeg', 'https://evil.example/c.jpeg', 'https://user:pw@images1.vinted.net/d.jpeg', 'not a url'], kind: 'top' }, INSTALL);
  assert.deepStrictEqual(body.image_urls, ['https://images1.vinted.net/a.jpeg']);
  assert.strictEqual(Store.measurementsBody({ image_urls: ['https://evil.example/c.jpeg'], kind: 'top' }, INSTALL), null);
  assert.strictEqual(Store.measurementsBody({ image_urls: ['https://images1.vinted.net/a.jpeg'], kind: 'hat' }, INSTALL), null);
  assert.strictEqual(Store.measurementsBody({ kind: 'top' }, INSTALL), null);
});

test('the photo read keeps only known measurements as numbers, and any failure is no measurements', async () => {
  assert.deepStrictEqual(Store.readMeasurementsEntry({ measurements: { pit: 48, length: '65', sleeve: null, hips: 50 }, note: 'x' }), { pit: 48 });
  assert.strictEqual(Store.readMeasurementsEntry({ chart: null }), null);
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ measurements: { pit: 47, length: 66 } }) }; };
  const read = Store.createMeasurementsRead({ fetch, installId: async () => INSTALL });
  assert.deepStrictEqual(await read({ image_urls: ['https://images1.vinted.net/a.jpeg'], kind: 'top' }), { measurements: { pit: 47, length: 66 } });
  assert.strictEqual(calls[0].url, Store.READ_MEASUREMENTS_URL);
  assert.match(Store.READ_MEASUREMENTS_URL, /\/functions\/v1\/read-chart-image\/measurements$/);
  assert.deepStrictEqual(Object.keys(calls[0].body).sort(), ['image_urls', 'install', 'kind']);
  assert.deepStrictEqual(await read({ image_urls: ['https://evil.example/a.jpeg'], kind: 'top' }), { error: 'bad request' });
  assert.strictEqual(calls.length, 1, 'a refused body sends nothing');
  const failing = Store.createMeasurementsRead({ fetch: async () => ({ ok: false, status: 429 }), installId: async () => INSTALL });
  assert.deepStrictEqual(await failing({ image_urls: ['https://images1.vinted.net/a.jpeg'], kind: 'top' }), { error: 'HTTP 429' });
  const throwing = Store.createMeasurementsRead({ fetch: async () => { throw new Error('offline'); }, installId: async () => INSTALL });
  assert.deepStrictEqual(await throwing({ image_urls: ['https://images1.vinted.net/a.jpeg'], kind: 'top' }), { error: 'offline' });
});

test('the photo read and the function agree on the kinds of item and the measurement names', () => {
  assert.deepStrictEqual([...Store.LISTING_KINDS].sort(), ['dress', 'jeans', 'outerwear', 'shoes', 'shorts', 'skirt', 'top', 'trousers']);
  assert.deepStrictEqual([...Store.MEASUREMENT_KEYS].sort(), Object.keys(Vinted.RANGE).sort());
});

// ---- the manifest ---------------------------------------------------------------------------------

const VINTED = ['fr', 'de', 'co.uk', 'es', 'it', 'nl', 'be', 'pl', 'lt', 'cz', 'at', 'lu', 'pt', 'se', 'fi', 'dk', 'sk', 'hu', 'ro', 'hr', 'ie', 'gr'];

test('the Vinted content script runs on item pages of every Vinted domain, listed one by one', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const entry = manifest.content_scripts.find((c) => c.js.includes('src/vinted-page.js'));
  assert.ok(entry);
  assert.deepStrictEqual(entry.matches, VINTED.map((tld) => `https://www.vinted.${tld}/items/*`));
  assert.ok(!entry.js.includes('src/content.js'), 'the shop reader does not run on Vinted');
  const order = ['src/brands.js', 'src/charts-store.js', 'src/charts.js', 'src/defaults.js', 'src/review-details.js', 'src/engine.js', 'src/panel-style.js', 'src/mark.js', 'src/vinted.js', 'src/vinted-page.js'];
  assert.deepStrictEqual(entry.js, order);
  for (const s of entry.js) assert.ok(fs.existsSync(path.join(ROOT, s)), s);
  const shops = manifest.content_scripts.find((c) => c.js.includes('src/content.js'));
  assert.ok(!shops.matches.some((m) => /vinted/.test(m)));
});

test('the popup injects the same Vinted files as the manifest on a listing reached without a reload', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const entry = manifest.content_scripts.find((c) => c.js.includes('src/vinted-page.js'));
  const popup = fs.readFileSync(path.join(ROOT, 'ui/popup.js'), 'utf8');
  const list = popup.match(/const VINTED_FILES = \[([^\]]*)\]/);
  assert.ok(list);
  assert.deepStrictEqual(list[1].split(',').map((s) => s.trim().replace(/'/g, '')), entry.js);
  assert.match(popup, /isVintedItem\(tab\.url\) \? VINTED_FILES : FILES/);
});

test('the copy names the Vinted sites and every field the photo read sends', () => {
  const body = Store.measurementsBody({ image_urls: ['https://images1.vinted.net/a.jpeg'], kind: 'top' }, INSTALL);
  assert.deepStrictEqual(Object.keys(body).sort(), ['image_urls', 'install', 'kind'], 'a new field in measurementsBody needs a line in the copy below');
  const words = { vinted: /Vinted/, photos: /photo/, four: /four|4/, kind: /kind of item/, install: /install id/, click: /only (when|if) you click|on that click|on request/i, notStored: /not (stored|kept|cached)|nothing (of it|from them) is (stored|kept)/i };
  for (const file of ['store/privacy.html', 'store/LISTING.md', 'store/PRODUCT_HUNT.md', 'README.md']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\s+/g, ' ');
    for (const [field, re] of Object.entries(words)) assert.match(text, re, `${file} does not mention ${field}`);
  }
  const listing = fs.readFileSync(path.join(ROOT, 'store/LISTING.md'), 'utf8');
  assert.match(listing, /vinted\.\*\/items|Vinted item pages/i, 'the listing justifies the Vinted matches');
});
