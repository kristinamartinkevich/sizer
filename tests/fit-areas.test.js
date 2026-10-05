// C2: where the size will be tight or loose, and reviews weighted by how like you the reviewer is.
const test = require('node:test');
const assert = require('node:assert');
const { recommend } = require('../src/engine.js');
require('../src/defaults.js');

// A brand with no chart, so the standard EU chart (body cm per size) is used: 38 is waist 72, hip
// 97; 40 is waist 76, hip 100.
const trousers = (over = {}) => ({ brand: 'Ostra', title: 'Straight trousers', text: '', sizes: ['34', '36', '38', '40', '42'].map((label) => ({ label })), ...over });
const ME = { waist: '68', hip: '102', anchors: [], height: '160' };

test('each area you measured is compared with the size picked', () => {
  const r = recommend(ME, trousers(), null);
  assert.strictEqual(r.size, '40');
  assert.deepStrictEqual(r.areas.map((a) => [a.area, a.verdict]), [['hip', 'close'], ['waist', 'roomy']]);
  assert.match(r.areas[1].text, /roomy at the waist/i);
});

test('a size down for a runs-large note shows where it will be tight, first', () => {
  const r = recommend(ME, trousers({ text: 'This style runs large, we recommend sizing down.' }), null);
  assert.strictEqual(r.size, '38');
  assert.deepStrictEqual(r.areas[0], { area: 'hip', verdict: 'tight', source: 'chart', text: 'May be tight at the hips' });
});

test('areas the profile has no measurement for are left out', () => {
  const r = recommend({ anchors: [], waist: '68', hip: '102' }, trousers(), null);
  assert.ok(!r.areas.some((a) => a.area === 'bust' || a.area === 'shoulder'));
});

// Three petite, curvy reviewers say small; four tall, straight-hipped reviewers say large.
const CARD_SMALL = 'About my curves About my height curvy petite Lovely trousers. Sizing runs small';
const CARD_LARGE = 'About my curves About my height straight hips tall Nice. Sizing runs large';
const reviewed = (cards, texts) => trousers({ reviewCards: cards, reviews: texts });

test('reviewers built like you outweigh a plain count of reviewers who are not', () => {
  const p = reviewed([CARD_SMALL, CARD_SMALL, CARD_SMALL, CARD_LARGE, CARD_LARGE, CARD_LARGE, CARD_LARGE], ['Runs small.', 'Runs small.', 'Runs small.', 'Runs large.', 'Runs large.', 'Runs large.', 'Runs large.']);
  const plain = recommend({ waist: '68', hip: '102', anchors: [] }, { ...p, reviewCards: [] }, null);
  assert.strictEqual(plain.reviews.verdict, 'large');
  const r = recommend(ME, p, null);
  assert.strictEqual(r.reviews.verdict, 'small');
  assert.strictEqual(r.reviews.weighted.similar, 3);
  assert.ok(r.reasons.some((x) => x.text === '3 reviewers about your height and shape say it runs small.' && x.delta === 1), JSON.stringify(r.reasons));
  assert.strictEqual(r.headline, 'Reviewers like you say it runs small, sized up');
});

test('the local tally sent to the pool is the plain count, whatever the weighting says', () => {
  const p = reviewed([CARD_SMALL, CARD_SMALL, CARD_SMALL, CARD_LARGE], ['Runs small.', 'Runs small.', 'Runs small.', 'Runs large.']);
  const r = recommend(ME, p, null);
  assert.deepStrictEqual([r.reviews.local.small, r.reviews.local.large], [3, 1]);
});

test('areas that similar reviewers mention join the chart’s areas', () => {
  const card = 'About my curves About my height curvy petite Tight in the hips. Sizing true to size';
  const r = recommend(ME, reviewed([card, card, card], ['Tight in the hips.', 'Tight in the hips.', 'Tight in the hips.']), null);
  const hip = r.areas.find((a) => a.area === 'hip' && a.source === 'reviews');
  assert.ok(hip, JSON.stringify(r.areas));
  assert.strictEqual(hip.verdict, 'tight');
  assert.strictEqual(hip.text, '3 reviewers like you found it tight at the hips');
});

const { areaLine, sheetAreas } = require('../src/engine.js');

test('the line names a tight area only, and the sheet lists up to three that are not simply fine', () => {
  const tight = recommend(ME, trousers({ text: 'This style runs large, we recommend sizing down.' }), null);
  assert.strictEqual(areaLine(tight), 'May be tight at the hips');
  assert.deepStrictEqual(sheetAreas(tight), ['May be tight at the hips', 'Roomy at the waist']);
  const easy = recommend(ME, trousers(), null);
  assert.strictEqual(areaLine(easy), null);
  assert.deepStrictEqual(sheetAreas(easy), ['Close fit at the hips', 'Roomy at the waist']);
});

test('when every area is fine the sheet says so in one line', () => {
  const r = { areas: [{ area: 'waist', verdict: 'fine', source: 'chart', text: 'Fine at the waist' }, { area: 'hip', verdict: 'fine', source: 'chart', text: 'Fine at the hips' }] };
  assert.deepStrictEqual(sheetAreas(r), ['Fits as expected at the waist and hips']);
  assert.deepStrictEqual(sheetAreas({ areas: [] }), []);
  assert.strictEqual(areaLine({}), null);
});

test('trousers never name the bust or shoulders, from the chart or from reviewers', () => {
  const card = 'About my curves About my height curvy petite Tight in the bust. Sizing true to size';
  const r = recommend({ ...ME, bust: '120', shoulder: '50' }, reviewed([card, card, card], []), null);
  assert.ok(!r.areas.some((a) => ['bust', 'shoulder', 'sleeve'].includes(a.area)), JSON.stringify(r.areas));
  const dress = recommend({ ...ME, bust: '120' }, trousers({ title: 'Midi dress' }), null);
  assert.ok(dress.areas.some((a) => a.area === 'bust'), JSON.stringify(dress.areas));
});

test('a weighted verdict of none replaces the plain one, so mixed reviewers like you leave the size alone', () => {
  const small = 'About my curves About my height curvy petite Ok. Sizing runs small';
  const large = 'About my curves About my height curvy petite Ok. Sizing runs large';
  const texts = ['Runs small.', 'Runs small.', 'Runs small.', 'Runs large.', 'Runs large.'];
  const p = reviewed([small, small, large, large], texts);
  assert.strictEqual(recommend({ waist: '68', hip: '102', anchors: [] }, { ...p, reviewCards: [] }, null).reviews.verdict, 'small');
  const r = recommend(ME, p, null);
  assert.strictEqual(r.reviews.verdict, null);
  assert.strictEqual(r.size, recommend(ME, trousers(), null).size);
});

test('with no reviewer details nothing changes', () => {
  const a = recommend(ME, trousers({ reviews: ['Runs small.', 'Runs small.'] }), null);
  assert.strictEqual(a.reviews.verdict, 'small');
  assert.strictEqual(a.reviews.weighted, undefined);
});
