const test = require('node:test');
const assert = require('node:assert');
const { recommend, analyzeReviews } = require('../src/engine.js');

const profile = { anchors: [{ brand: 'zara', size: '38' }, { brand: 'generic-denim', size: '27' }], fitPreference: 'regular' };
const sizes = ['25', '26', '27', '28', '29', '30'].map((label) => ({ label }));
const stretchy = { brand: 'rag & bone', title: 'Jeans', text: '92% cotton 6% polyester 2% elastane', sizes };

test('counts what reviewers say about fit, one vote per review', () => {
  const r = analyzeReviews([
    'Love these but they run small, I had to size up.',
    'Runs small! Order a size up.',
    'Fits true to size, great quality.',
    'Beautiful colour.',
    'Definitely runs small in the waist. Runs small, runs small.',
  ]);
  assert.deepEqual({ small: r.small, large: r.large, tts: r.tts, mentions: r.mentions, total: r.total }, { small: 3, large: 0, tts: 1, mentions: 4, total: 5 });
  assert.equal(r.verdict, 'small');
});

test('a single review is not a verdict', () => {
  assert.equal(analyzeReviews(['Runs small.']).verdict, null);
  assert.equal(analyzeReviews(['Runs small.', 'Runs large.', 'Fits true to size.']).verdict, null);
});

test('a shop’s fit summary with percentages counts as reviews', () => {
  const r = analyzeReviews([], 'Fit: 68% say it runs small, 27% true to size, 5% runs large. Based on 112 reviews.');
  assert.equal(r.verdict, 'small');
  assert.equal(r.total, 112);
  assert.equal(r.small, 76);
  assert.ok(Math.abs(r.share - 0.68) < 0.01);
});

test('buyers reporting it runs small move the size up, with the count in the reason', () => {
  const plain = recommend(profile, stretchy);
  const r = recommend(profile, { ...stretchy, reviews: ['Runs small, size up', 'Had to go a size up, runs small', 'Runs small for me', 'Gorgeous'] });
  assert.equal(plain.size, '27');
  assert.equal(r.size, '28');
  assert.equal(r.headline, 'Buyers say it runs small, sized up');
  assert.ok(r.reasons.some((x) => x.delta === 1 && /3 of 3 reviews/.test(x.text)), JSON.stringify(r.reasons));
});

test('the page’s own fit note wins and reviews do not move it twice', () => {
  const r = recommend(profile, { ...stretchy, text: `${stretchy.text}. This item runs small, we recommend ordering one size up.`, reviews: ['Runs small', 'Runs small', 'Runs small'] });
  assert.equal(r.size, '28');
  assert.equal(r.reasons.filter((x) => x.delta).length, 1);
});

test('reviewers agreeing it fits true to size are mentioned but move nothing', () => {
  const r = recommend(profile, { ...stretchy, reviews: ['True to size', 'Fits true to size', 'True to size, lovely'] });
  assert.equal(r.size, '27');
  assert.ok(r.reasons.some((x) => /true to size/.test(x.text)));
  assert.equal(r.reviews.verdict, 'tts');
});

test('a review saying it runs small is not read as the page saying so', () => {
  const r = recommend(profile, { ...stretchy, reviews: ['Runs small'] });
  assert.equal(r.signals.fitNote, null);
  assert.equal(r.size, '27');
});
