const test = require('node:test');
const assert = require('node:assert');
const RD = require('../src/review-details.js');

// Real card text from the saved Revolve page (tests/fixtures/shops/revolve.html).
const REVOLVE_CARD = 'SHIRY Z. 🇮🇱 About my curves About my height Would you recommend this item? straight hips tall yes Excellent! It is really great fitting and amazing quality, I wish it was just a little bit higher on the waist. Sizing taille petit Product Quality excellente Date de publication 10/18/25';

test('reads Revolve’s height, curves and sizing fields from a review card', () => {
  const d = RD.parseReview(REVOLVE_CARD);
  assert.strictEqual(d.heightBucket, 'tall');
  assert.strictEqual(d.curves, 'straight');
  assert.strictEqual(d.verdict, 'small');
});

test('reads the labels however the page capitalises them, as the live Revolve card does', () => {
  const d = RD.parseReview('SHIRY Z. 🇮🇱 About My Curves About My Height Would You Recommend This Item? straight hips tall yes It is really great fitting. Sizing taille petit Product Quality excellente');
  assert.strictEqual(d.heightBucket, 'tall');
  assert.strictEqual(d.curves, 'straight');
  assert.strictEqual(d.verdict, 'small');
});

test('reads the same fields in French, and product quality words are not a height', () => {
  const d = RD.parseReview('Marie 🇫🇷 À propos de mes courbes À propos de ma taille en courbes petite Très joli. Tailles taille grand Qualité du produit moyenne');
  assert.strictEqual(d.curves, 'curvy');
  assert.strictEqual(d.heightBucket, 'petite');
  assert.strictEqual(d.verdict, 'large');
  const q = RD.parseReview('Joli jean. Sizing taille normal Product Quality moyenne');
  assert.strictEqual(q.heightBucket, null);
  assert.strictEqual(q.verdict, 'tts');
});

test('reads heights written in feet and inches, metres and centimetres', () => {
  assert.strictEqual(RD.parseReview("I'm 5'4 and the length is perfect").height, 163);
  assert.strictEqual(RD.parseReview('I am 5’ 9” and usually a 27').height, 175);
  assert.strictEqual(RD.parseReview('Je mesure 1,65 m et je porte du 38').height, 165);
  assert.strictEqual(RD.parseReview('1m72, taille parfaite').height, 172);
  assert.strictEqual(RD.parseReview('I am 168 cm').height, 168);
  assert.strictEqual(RD.parseReview("Waist is 26'' and hips 36''").height, null);
});

test('a height becomes a bucket too, so it can be compared with Revolve’s buckets', () => {
  assert.strictEqual(RD.parseReview("I'm 5'2").heightBucket, 'petite');
  assert.strictEqual(RD.parseReview('I am 168 cm').heightBucket, 'average');
  assert.strictEqual(RD.parseReview('1m78').heightBucket, 'tall');
});

test('reads the size bought and the usual size', () => {
  const d = RD.parseReview('I usually wear a 26 but sized up to a 27 and it fits great.');
  assert.strictEqual(d.usualSize, '26');
  assert.strictEqual(d.sizeBought, '27');
  const fr = RD.parseReview("D'habitude je porte du S, j'ai pris un M.");
  assert.strictEqual(fr.usualSize, 'S');
  assert.strictEqual(fr.sizeBought, 'M');
});

test('reads where it was tight, loose, long or short', () => {
  assert.deepStrictEqual(RD.parseReview('Tight in the hips and a bit long in the leg.').areas, [{ area: 'hip', direction: 'tight' }, { area: 'inseam', direction: 'long' }]);
  assert.deepStrictEqual(RD.parseReview('The waist was loose but the thighs were snug.').areas, [{ area: 'waist', direction: 'loose' }, { area: 'hip', direction: 'tight' }]);
  assert.deepStrictEqual(RD.parseReview('Serré aux hanches, trop long.').areas, [{ area: 'hip', direction: 'tight' }, { area: 'length', direction: 'long' }]);
  assert.deepStrictEqual(RD.parseReview('Lovely colour.').areas, []);
});

test('free-text verdicts', () => {
  assert.strictEqual(RD.parseReview('Runs small, size up.').verdict, 'small');
  assert.strictEqual(RD.parseReview('Way too big, size down.').verdict, 'large');
  assert.strictEqual(RD.parseReview('True to size for me.').verdict, 'tts');
  assert.strictEqual(RD.parseReview('Lovely colour.').verdict, null);
});

test('review-details.js loads before engine.js everywhere the engine runs in a page', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const manifest = JSON.parse(read('manifest.json')).content_scripts[0].js;
  assert.ok(manifest.indexOf('src/review-details.js') > -1 && manifest.indexOf('src/review-details.js') < manifest.indexOf('src/engine.js'), 'manifest');
  for (const [file, a, b] of [
    ['ui/popup.js', "'src/review-details.js'", "'src/engine.js'"],
    ['tests/fixture-shop.html', 'src/review-details.js', 'src/engine.js'],
    ['tests/shops.html', 'src/review-details.js', 'src/engine.js'],
    ['tools/render-shop.py', "'review-details'", "'engine'"],
  ]) {
    const text = read(file);
    assert.ok(text.indexOf(a) > -1 && text.indexOf(a) < text.indexOf(b), file);
  }
});

test('the engine reads raw review cards, keeping only those with a verdict or an area', () => {
  const { recommend } = require('../src/engine.js');
  const nav = 'Curvy jeans Tall jeans Petite jeans';
  const card = 'About my curves About my height curvy petite Nice. Sizing runs small';
  const product = { brand: 'Ostra', title: 'Straight trousers', text: '', sizes: ['36', '38', '40'].map((label) => ({ label })), reviews: [] };
  const r = recommend({ anchors: [], waist: '68', hip: '102', height: '160' }, { ...product, reviewCards: [nav, nav, nav, card, card] }, null);
  assert.strictEqual(r.reviews.weighted, undefined);
});

const ME = { height: 163, waist: 68, hip: 96 };

test('similarity is highest for a reviewer of your height and shape', () => {
  assert.strictEqual(RD.similarity({ height: 164, curves: 'curvy' }, ME), 1);
  assert.ok(RD.similarity({ height: 178, curves: 'curvy' }, ME) <= 0.25);
  assert.ok(RD.similarity({ height: 164, curves: 'straight' }, ME) <= 0.25);
  assert.strictEqual(RD.similarity({}, ME), 0.36);
  assert.strictEqual(RD.similarity({ heightBucket: 'petite', curves: 'curvy' }, ME), 1);
  assert.strictEqual(RD.similarity({ height: 164 }, {}), 0.36);
});

test('with three or more reviewers who say their height or shape, the verdict is weighted by similarity', () => {
  const details = [
    { verdict: 'small', height: 162, curves: 'curvy' },
    { verdict: 'small', height: 165, curves: 'some' },
    { verdict: 'small', heightBucket: 'petite' },
    { verdict: 'large', height: 180, curves: 'straight' },
    { verdict: 'large', height: 178, curves: 'straight' },
    { verdict: 'large', height: 177, curves: 'straight' },
    { verdict: 'large' },
  ];
  const w = RD.weightedVerdict(details, ME);
  assert.strictEqual(w.verdict, 'small');
  assert.strictEqual(w.similar, 3);
  assert.strictEqual(w.described, 6);
});

test('too few described reviewers, or no height or shape in the profile, gives no weighted verdict', () => {
  assert.strictEqual(RD.weightedVerdict([{ verdict: 'small', height: 162 }, { verdict: 'small', height: 165 }], ME), null);
  assert.strictEqual(RD.weightedVerdict([{ verdict: 'small', height: 162 }, { verdict: 'small', height: 165 }, { verdict: 'small', height: 160 }], {}), null);
});

test('areas are tallied by similarity too, and one mention is not enough', () => {
  const details = [
    { verdict: 'tts', height: 163, curves: 'curvy', areas: [{ area: 'hip', direction: 'tight' }] },
    { verdict: 'tts', height: 162, curves: 'curvy', areas: [{ area: 'hip', direction: 'tight' }] },
    { verdict: 'tts', height: 180, curves: 'straight', areas: [{ area: 'inseam', direction: 'short' }] },
  ];
  assert.deepStrictEqual(RD.weightedVerdict(details, ME).areas, [{ area: 'hip', direction: 'tight', count: 2 }]);
});
