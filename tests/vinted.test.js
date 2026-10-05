const test = require('node:test');
const assert = require('node:assert');
const Vinted = require('../src/vinted.js');

test('reads measurements sellers write in French, English and German', () => {
  assert.deepStrictEqual(Vinted.parseMeasurements('Très bon état. Aisselle à aisselle 48 cm, longueur 65 cm.'), { pit: 48, length: 65 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Pit to pit 19 in, length 26"'), { pit: 48.3, length: 66 });
  assert.deepStrictEqual(Vinted.parseMeasurements('Bundweite 38 cm, Innenbeinlänge 78 cm'), { waistFlat: 38, inseam: 78 });
  assert.deepStrictEqual(Vinted.parseMeasurements('tour de taille 72cm, entrejambe 76'), { waistFlat: 36, inseam: 76 });
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
