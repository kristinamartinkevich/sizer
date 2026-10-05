const test = require('node:test');
const assert = require('node:assert');
const Vinted = require('../src/vinted.js');

test('reads measurements sellers write in French, English and German', () => {
  assert.deepStrictEqual(Vinted.parseMeasurements('Très bon état. Aisselle à aisselle 48 cm, longueur 65 cm.'), { pit: 48, length: 65 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Pit to pit 19 in, length 26"'), { pit: 48.3, length: 66 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Bundweite 38 cm, Innenbeinlänge 78 cm'), { waistFlat: 38, inseam: 78 });
  assert.deepStrictEqual(Vinted.parseMeasurements('tour de taille 72cm, entrejambe 76'), { waistFlat: 36, inseam: 76 });
});

test('reads measurements written number first, as many UK sellers do', () => {
  // A real Vinted UK listing (2026-10-05): read label-first, the waist took the leg's 79 (halved to
  // 39.5) and the inside leg took the length's 100.
  assert.deepStrictEqual(Vinted.parseMeasurements('Approximate flat measurements:\n36cm waist,\n79cm inside leg,\n100cm length'), { waistFlat: 36, inseam: 79, length: 100 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Measured flat: 46 cm pit to pit, 64 cm length'), { pit: 46, length: 64 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Size 10, worn 2 times. 15" waist, 30" inseam'), { waistFlat: 38.1, inseam: 76.2 });
  // Label first stays label first, even with a unit straight before the next label.
  assert.deepStrictEqual(Vinted.parseMeasurements('Waist 36cm length 100cm'), { waistFlat: 36, length: 100 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Waist: 36cm (when flat)\nRise: 25cm\nInseam: 77cm'), { waistFlat: 36, rise: 25, inseam: 77 });
});

test('reads Spanish, Italian, Dutch and Polish', () => {
  assert.deepStrictEqual(Vinted.parseMeasurements('axila a axila 50 cm, largo 70 cm'), { pit: 50, length: 70 });
  assert.deepStrictEqual(Vinted.parseMeasurements('ascella ascella 46 cm, lunghezza 60'), { pit: 46, length: 60 });
  assert.deepStrictEqual(Vinted.parseMeasurements('oksel tot oksel 47 cm, lengte 64 cm'), { pit: 47, length: 64 });
  assert.deepStrictEqual(Vinted.parseMeasurements('pacha pacha 45 cm, długość 62 cm'), { pit: 45, length: 62 });
});

test('a circumference is halved to a flat width, a flat width is kept', () => {
  assert.deepStrictEqual(Vinted.parseMeasurements('waist 68 cm'), { waistFlat: 34 });
  assert.deepStrictEqual(Vinted.parseMeasurements('waist flat 34 cm'), { waistFlat: 34 });
  assert.deepStrictEqual(Vinted.parseMeasurements('waist laid flat 13.5 in'), { waistFlat: 34.3 });
});

test('sizes, prices and years are not measurements', () => {
  assert.deepStrictEqual(Vinted.parseMeasurements('Taille 38, porté 2 fois, acheté 45 € en 2021'), {});
  assert.deepStrictEqual(Vinted.parseMeasurements('W27 L30 jeans'), {});
});

test('a number out of range for that measurement is not read, so ordinary words with numbers pass', () => {
  assert.deepStrictEqual(Vinted.parseMeasurements('Pas de défaut, porté 2 fois. Manches 3/4.'), {});
  assert.deepStrictEqual(Vinted.parseMeasurements('longueur 400 cm'), {});
});

test('the message asks for what matters for the kind of item and skips what is given', () => {
  assert.deepStrictEqual(Vinted.wanted('top', {}), ['pit', 'length']);
  assert.deepStrictEqual(Vinted.wanted('dress', { pit: 48 }), ['waistFlat', 'length']);
  assert.deepStrictEqual(Vinted.wanted('jeans', {}), ['waistFlat', 'rise', 'inseam', 'legOpening']);
  assert.deepStrictEqual(Vinted.wanted('skirt', {}), ['waistFlat', 'length']);
  assert.deepStrictEqual(Vinted.wanted('outerwear', {}), ['pit', 'shoulder', 'sleeve', 'length']);
  assert.deepStrictEqual(Vinted.wanted('shoes', {}), ['insole']);
  assert.deepStrictEqual(Vinted.wanted('top', { pit: 48, length: 65 }), []);
});

test('the message is written in the listing language, English otherwise', () => {
  const fr = Vinted.sellerMessage({ kind: 'jeans', lang: 'fr', have: {} });
  assert.match(fr, /^Bonjour/);
  assert.match(fr, /tour de taille à plat/);
  assert.match(fr, /entrejambe/);
  const de = Vinted.sellerMessage({ kind: 'top', lang: 'de', have: {} });
  assert.match(de, /^Hallo/);
  assert.match(de, /Achsel zu Achsel/);
  for (const lang of ['es', 'it', 'nl', 'pl']) assert.ok(Vinted.sellerMessage({ kind: 'top', lang, have: {} }).length > 40, lang);
  assert.match(Vinted.sellerMessage({ kind: 'top', lang: 'lt', have: {} }), /^Hello/);
});

test('the message has no em dash or exclamation mark, and nothing to ask gives null', () => {
  for (const lang of ['fr', 'en', 'de', 'es', 'it', 'nl', 'pl']) {
    for (const kind of ['top', 'dress', 'jeans', 'trousers', 'skirt', 'outerwear', 'shoes']) {
      const m = Vinted.sellerMessage({ kind, lang, have: {} });
      assert.ok(!/[—!]/.test(m), `${lang} ${kind}`);
    }
  }
  assert.strictEqual(Vinted.sellerMessage({ kind: 'top', lang: 'fr', have: { pit: 48, length: 65 } }), null);
});

const PIECES = [
  { brand: 'Agolde', type: 'jeans', size: '26', fit: 'perfect', flat: { waist: 35, inseam: 76, hip: 47 } },
  { brand: 'COS', type: 'top', size: 'S', fit: 'perfect', flat: { chest: 49, length: 64 } },
  { brand: 'Zara', type: 'top', size: 'M', fit: 'loose', flat: { chest: 55, length: 68 } },
  { brand: 'Levi’s', type: 'jeans', size: '27', fit: 'perfect' },
];

test('seller measurements are compared with the nearest piece you own of that kind', () => {
  const r = Vinted.compare({ kind: 'top', have: { pit: 48.5, length: 65 } }, { anchors: PIECES });
  assert.strictEqual(r.verdict, 'fits');
  assert.strictEqual(r.against, 'COS top in S');
  assert.match(r.line, /^Your size/);
});

test('narrower than your piece is too small, wider is roomy, and the areas say where', () => {
  const small = Vinted.compare({ kind: 'jeans', have: { waistFlat: 32.5, inseam: 76 } }, { anchors: PIECES });
  assert.strictEqual(small.verdict, 'small');
  assert.match(small.line, /^Too small for you/);
  assert.deepStrictEqual(small.areas.map((a) => [a.area, a.verdict]), [['waist', 'tight'], ['inseam', 'fine']]);
  const roomy = Vinted.compare({ kind: 'jeans', have: { waistFlat: 39, inseam: 70 } }, { anchors: PIECES });
  assert.strictEqual(roomy.verdict, 'roomy');
  assert.deepStrictEqual(roomy.areas.map((a) => [a.area, a.verdict]), [['waist', 'roomy'], ['inseam', 'short']]);
});

test('a piece you own that fits loose counts as a little too big, so the same width is roomy on you', () => {
  const r = Vinted.compare({ kind: 'top', have: { pit: 55 } }, { anchors: [PIECES[2]] });
  assert.strictEqual(r.verdict, 'roomy');
});

test('without a measured piece, your body measurements plus ease decide', () => {
  const profile = { anchors: [PIECES[3]], bust: 88, waist: 70, hip: 96 };
  assert.strictEqual(Vinted.compare({ kind: 'top', have: { pit: 49 } }, profile).verdict, 'fits');
  assert.strictEqual(Vinted.compare({ kind: 'top', have: { pit: 43 } }, profile).verdict, 'small');
  assert.strictEqual(Vinted.compare({ kind: 'jeans', have: { waistFlat: 36 } }, profile).verdict, 'fits');
  assert.strictEqual(Vinted.compare({ kind: 'jeans', have: { waistFlat: 42 } }, profile).verdict, 'roomy');
  assert.match(Vinted.compare({ kind: 'top', have: { pit: 49 } }, profile).against, /your measurements/);
});

test('nothing to compare gives null, so the label size is used instead', () => {
  assert.strictEqual(Vinted.compare({ kind: 'top', have: {} }, { anchors: PIECES }), null);
  assert.strictEqual(Vinted.compare({ kind: 'top', have: { length: 60 } }, { anchors: [] }), null);
});

test('the listing language comes from the Vinted domain', () => {
  assert.strictEqual(Vinted.langOf('www.vinted.fr'), 'fr');
  assert.strictEqual(Vinted.langOf('www.vinted.be'), 'fr');
  assert.strictEqual(Vinted.langOf('www.vinted.co.uk'), 'en');
  assert.strictEqual(Vinted.langOf('www.vinted.at'), 'de');
  assert.strictEqual(Vinted.langOf('www.vinted.lt'), 'en');
});

// ---- review wf_fdd1e9c0-f4e ---------------------------------------------------------------------

test('a denim skirt or denim shorts are a skirt or shorts, not jeans, in the Vinted languages', () => {
  const skirts = [
    [['Femmes', 'Vêtements', 'Jupes', 'Jupes en jean'], ''],
    [[], 'Jupe en jean Levi’s taille haute'],
    [['Damen', 'Kleidung', 'Röcke', 'Jeansröcke'], ''],
    [[], 'Jeansrock von Esprit'],
    [[], 'Denim skirt, mid length'],
    [[], 'Falda vaquera de jeans'],
    [[], 'Gonna di jeans'],
    [[], 'Spijkerrok maat 38'],
    [[], 'Spódnica jeansowa'],
  ];
  for (const [parts, title] of skirts) assert.strictEqual(Vinted.kindOfListing(parts, title), 'skirt', `${parts.join(' > ')} ${title}`);
  const shorts = [
    [[], 'Short en jean taille haute'],
    [['Women', 'Clothing', 'Shorts', 'Denim shorts'], ''],
    [[], 'Jeansshorts von Levi’s'],
    [[], 'Shorts vaqueros jeans'],
    [[], 'Szorty jeansowe'],
  ];
  for (const [parts, title] of shorts) assert.strictEqual(Vinted.kindOfListing(parts, title), 'shorts', `${parts.join(' > ')} ${title}`);
  // Plain jeans stay jeans, and the message for a denim skirt asks for a skirt's measurements.
  assert.strictEqual(Vinted.kindOfListing(['Damen', 'Kleidung', 'Jeans', 'Skinny Jeans'], ''), 'jeans');
  assert.strictEqual(Vinted.kindOfListing([], 'Jean Levi’s 501'), 'jeans');
  const l = Vinted.listingFrom({ host: 'www.vinted.fr', title: 'Jupe en jean', description: '' });
  assert.strictEqual(l.kind, 'skirt');
  assert.ok(!/entrejambe/.test(Vinted.sellerMessage(l)));
});

test('the popup heading follows the verdict, so it never says "Your size" over a size that is not', () => {
  const listing = { size: 'S', brand: 'COS' };
  const small = Vinted.popupResult({ mode: 'measured', verdict: 'small', byPiece: true, line: 'Too small for you, compared with your COS top in S' }, listing);
  assert.strictEqual(small.heading, 'Too small for you');
  assert.strictEqual(small.verdict, 'small');
  assert.strictEqual(Vinted.popupResult({ mode: 'measured', verdict: 'roomy', byPiece: false, line: 'x' }, listing).heading, 'Roomy on you');
  assert.strictEqual(Vinted.popupResult({ mode: 'measured', verdict: 'fits', byPiece: true, line: 'x' }, listing).heading, 'Your size');
  assert.strictEqual(Vinted.popupResult({ mode: 'label', verdict: 'small', line: 'x' }, listing).heading, 'Too small for you');
  assert.strictEqual(Vinted.popupResult({ mode: 'label', verdict: 'fits', line: 'x' }, listing).heading, 'Rough guess');
  assert.strictEqual(Vinted.popupResult({ mode: 'label', verdict: null, line: 'x' }, listing).heading, 'Rough guess');
  // The heading uses the line's own words.
  const cmp = Vinted.compare({ kind: 'jeans', have: { waistFlat: 32.5, inseam: 76 } }, { anchors: PIECES });
  assert.ok(cmp.line.startsWith(small.heading));
});

test('against a piece that fits you loose or tight, the stated cm are the real difference from the piece', () => {
  const loose = { brand: 'Zara', type: 'top', size: 'M', fit: 'loose', flat: { chest: 55, length: 68 } };
  const same = Vinted.compare({ kind: 'top', have: { pit: 55, length: 68 } }, { anchors: [loose] });
  assert.strictEqual(same.verdict, 'roomy');
  assert.deepStrictEqual(Vinted.areaLines(same), ['Roomy at the chest, the same as yours, which fits you loose', 'Fine in length, the same as yours']);
  const tight = { brand: 'COS', type: 'top', size: 'S', fit: 'tight', flat: { chest: 47 } };
  const wider = Vinted.compare({ kind: 'top', have: { pit: 47.5 } }, { anchors: [tight] });
  assert.strictEqual(wider.verdict, 'small');
  assert.deepStrictEqual(Vinted.areaLines(wider), ['Tight at the chest, 0.5 cm wider than yours, which is tight on you']);
  // A piece that fits you well reads as before.
  const perfect = { brand: 'COS', type: 'top', size: 'S', fit: 'perfect', flat: { chest: 49 } };
  assert.deepStrictEqual(Vinted.areaLines(Vinted.compare({ kind: 'top', have: { pit: 47 } }, { anchors: [perfect] })), ['Tight at the chest, 2 cm narrower than yours']);
});

test('the photo read sends only addresses on Vinted image hosts, never a lookalike or a listing page', () => {
  const Store = require('../src/charts-store.js');
  const INSTALL = '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64';
  const ok = ['https://images1.vinted.net/t/a.jpeg', 'https://images.vinted.net/t/b.jpeg', 'https://images12.vinted.net/t/c.jpeg'];
  assert.deepStrictEqual(Store.measurementsBody({ image_urls: ok, kind: 'top' }, INSTALL).image_urls, ok);
  const refused = [
    'https://vinted.xyz/a.jpeg',
    'https://images1.vinted.xyz/a.jpeg',
    'https://vinted.com.ru/a.jpeg',
    'https://images1.vinted.com.ru/a.jpeg',
    'https://www.vinted.fr/items/123-robe',
    'https://www.vinted.co.uk/a.jpeg',
    'https://images1.vinted.net.evil.example/a.jpeg',
    'https://evilvinted.net/a.jpeg',
    'https://cdn.vinted.net/a.jpeg',
  ];
  for (const u of refused) assert.strictEqual(Store.measurementsBody({ image_urls: [u], kind: 'top' }, INSTALL), null, u);
});
