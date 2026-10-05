const test = require('node:test');
const assert = require('node:assert');
const { parseGuideMatrix, mentionsBrand, parseRange } = require('../src/guide-table.js');

const row = (label, m, aliases = {}) => ({ label, waist: null, hip: null, bust: null, foot_length: null, ...m, aliases });

test('a Revolve-style dress chart in inches, sizes down the side', () => {
  const chart = parseGuideMatrix([
    ['Size', 'US', 'Bust', 'Waist', 'Hips'],
    ['XS', '0-2', '32"', '24"', '34.5"'],
    ['S', '4-6', '33.5"', '25.5"', '36"'],
    ['M', '8-10', '35"', '27"', '37 1/2"'],
    ['L', '12-14', '37"', '29"', '39½"'],
  ], { brand: 'Helsa' });
  assert.equal(chart.category, 'general');
  assert.equal(chart.unit, 'in');
  assert.equal(chart.size_system, 'letter');
  assert.equal(chart.measurement_basis, 'body');
  assert.deepEqual(chart.rows, [
    row('XS', { bust: [32, 32], waist: [24, 24], hip: [34.5, 34.5] }, { us: '0-2' }),
    row('S', { bust: [33.5, 33.5], waist: [25.5, 25.5], hip: [36, 36] }, { us: '4-6' }),
    row('M', { bust: [35, 35], waist: [27, 27], hip: [37.5, 37.5] }, { us: '8-10' }),
    row('L', { bust: [37, 37], waist: [29, 29], hip: [39.5, 39.5] }, { us: '12-14' }),
  ]);
  assert.equal(chart.mentions_brand, false);
});

test('a Zalando brand chart in cm with sizes across the top', () => {
  const chart = parseGuideMatrix([
    ['Size', 'XS', 'S', 'M', 'L', 'XL'],
    ['EU', '34', '36', '38', '40', '42'],
    ['Bust (cm)', '80-84', '84-88', '88-92', '92–96', '96 to 100'],
    ['Waist (cm)', '62-66', '66-70', '70-74', '74–78', '78 to 82'],
    ['Hip (cm)', '88-92', '92-96', '96-100', '100–104', '104 to 108'],
  ], { brand: 'rag & bone' });
  assert.equal(chart.category, 'general');
  assert.equal(chart.unit, 'cm');
  assert.equal(chart.size_system, 'letter');
  assert.deepEqual(chart.rows.map((r) => r.label), ['XS', 'S', 'M', 'L', 'XL']);
  assert.deepEqual(chart.rows[0], row('XS', { bust: [80, 84], waist: [62, 66], hip: [88, 92] }, { eu: '34' }));
  assert.deepEqual(chart.rows[3].bust, [92, 96]);
  assert.deepEqual(chart.rows[4], row('XL', { bust: [96, 100], waist: [78, 82], hip: [104, 108] }, { eu: '42' }));
});

test('an ASOS-style UK EU US waist hip table takes UK as the label and the rest as aliases', () => {
  const chart = parseGuideMatrix([
    ['UK', 'EU', 'US', 'Waist', 'Hip'],
    ['6', '34', '2', '60', '85'],
    ['8', '36', '4', '64', '89'],
    ['10', '38', '6', '68', '93'],
    ['12', '40', '8', '73', '98'],
  ], { brand: "Levi's", unit: 'cm' });
  assert.equal(chart.category, 'bottoms');
  assert.equal(chart.unit, 'cm');
  assert.equal(chart.size_system, 'uk');
  assert.deepEqual(chart.rows[0], row('6', { waist: [60, 60], hip: [85, 85] }, { eu: '34', us: '2' }));
  assert.deepEqual(chart.rows[3], row('12', { waist: [73, 73], hip: [98, 98] }, { eu: '40', us: '8' }));
});

test('a shoe table reads foot length by EU size', () => {
  const chart = parseGuideMatrix([
    ['EU', 'UK', 'US', 'Foot length (cm)'],
    ['36', '3.5', '6', '22.9'],
    ['37', '4', '6.5', '23,5'],
    ['38', '5', '7.5', '24.1'],
  ], { brand: 'Ganni' });
  assert.equal(chart.category, 'shoes');
  assert.equal(chart.unit, 'cm');
  assert.equal(chart.size_system, 'eu');
  assert.deepEqual(chart.rows, [
    row('36', { foot_length: [22.9, 22.9] }, { uk: '3.5', us: '6' }),
    row('37', { foot_length: [23.5, 23.5] }, { uk: '4', us: '6.5' }),
    row('38', { foot_length: [24.1, 24.1] }, { uk: '5', us: '7.5' }),
  ]);
});

test('French headers: taille alone is the size, tour de taille is the waist, unit from magnitude', () => {
  const chart = parseGuideMatrix([
    ['Taille', 'Tour de taille', 'Tour de hanches'],
    ['36', '66', '92'],
    ['38', '70', '96'],
    ['40', '74', '100'],
  ], { brand: 'Sézane' });
  assert.equal(chart.unit, 'cm');
  assert.equal(chart.category, 'bottoms');
  assert.deepEqual(chart.rows.map((r) => [r.label, r.waist[0], r.hip[0]]), [['36', 66, 92], ['38', 70, 96], ['40', 74, 100]]);
});

test('a chart printing cm and inches keeps the cm columns', () => {
  const chart = parseGuideMatrix([
    ['Size', 'Waist', 'Waist', 'Hip', 'Hip'],
    ['', 'cm', 'in', 'cm', 'in'],
    ['S', '66', '26', '92', '36'],
    ['M', '70', '27.5', '96', '38'],
  ], {});
  assert.equal(chart.unit, 'cm');
  assert.deepEqual(chart.rows.map((r) => [r.waist[0], r.hip[0]]), [[66, 92], [70, 96]]);
});

test('a header caption naming garment measurements marks the chart garment-measured', () => {
  const chart = parseGuideMatrix([
    ['Garment measurements (cm)', '', ''],
    ['Size', 'Waist', 'Hip'],
    ['S', '70', '98'],
    ['M', '74', '102'],
  ], {});
  assert.equal(chart.measurement_basis, 'garment');
  assert.equal(chart.unit, 'cm');
});

test('the unit hint accepts inches spelled out', () => {
  const chart = parseGuideMatrix([['Size', 'Waist', 'Hip'], ['S', '26', '36'], ['M', '28', '38']], { unit: 'inches' });
  assert.equal(chart.unit, 'in');
});

test('a waist-size column of denim sizes is the label, not a measurement', () => {
  const chart = parseGuideMatrix([
    ['Waist size', 'Waist (cm)', 'Hip (cm)'],
    ['25', '64', '89'],
    ['26', '66.5', '91.5'],
    ['27', '69', '94'],
  ], {});
  assert.equal(chart.size_system, 'denim_waist');
  assert.deepEqual(chart.rows.map((r) => r.label), ['25', '26', '27']);
  assert.deepEqual(chart.rows[1].waist, [66.5, 66.5]);
});

test('non-charts return null', () => {
  const cases = {
    delivery: [['Delivery', 'Cost', 'Time'], ['Standard', 'Free', '3-5 days'], ['Express', '£6', '1-2 days']],
    composition: [['Material', '%'], ['Cotton', '98'], ['Elastane', '2']],
    reviews: [['Rating', 'Reviews'], ['5 stars', '12'], ['4 stars', '3'], ['3 stars', '1']],
    // Revolve's two in-page tables, colspan expanded, as the fixture prints them.
    revolveModel: [
      ['Model Info', 'Model Info'],
      ["Blanc est 5' 9'' et porte une taille 24", "Blanc est 5' 9'' et porte une taille 24"],
      ['Tour de taille', "24''"], ['Poitrine', "32''"], ['Hanches', "34''"],
    ],
    revolveDimensions: [
      ['Dimensions du produit', 'Dimensions du produit'],
      ['Entrejambe', '29.5"'], ['Demi-fourche', '11.0"'], ['Circonférence du genou', '17"'], ['Circonférence du bas', '13"'],
    ],
  };
  for (const [name, matrix] of Object.entries(cases)) assert.equal(parseGuideMatrix(matrix, { brand: 'AGOLDE' }), null, name);
});

test('charts that break the §5 rules return null', () => {
  const base = [['Size', 'Waist', 'Hip'], ['S', '66', '92'], ['M', '70', '96'], ['L', '74', '100']];
  assert.ok(parseGuideMatrix(base, {}));
  assert.equal(parseGuideMatrix([base[0], base[1]], {}), null, 'one row');
  assert.equal(parseGuideMatrix([base[0], base[1], ['S', '70', '96']], {}), null, 'duplicate label');
  assert.equal(parseGuideMatrix([base[0], base[1], ['M', '64', '96']], {}), null, 'waist goes down');
  assert.equal(parseGuideMatrix([['Size', 'Waist'], ['S', '66'], ['M', '70']], {}), null, 'one measurement');
  assert.equal(parseGuideMatrix([base[0], base[1], ['M', 'see note', '96']], {}), null, 'unreadable value');
  assert.equal(parseGuideMatrix([base[0], base[1], ['M', '700', '96']], {}), null, 'implausible value');
  assert.equal(parseGuideMatrix([], {}), null, 'empty');
  assert.equal(parseGuideMatrix(null, {}), null, 'no matrix');
});

test('no unit anywhere and magnitudes that fit both units return null', () => {
  // A 60 waist and a 64 hip are plausible in cm and in inches.
  assert.equal(parseGuideMatrix([['Size', 'Waist', 'Hip'], ['S', '60', '64'], ['M', '62', '66']], {}), null);
});

test('parseRange reads the forms size guides print', () => {
  assert.deepEqual(parseRange('27-28'), [27, 28]);
  assert.deepEqual(parseRange('27–28'), [27, 28]);
  assert.deepEqual(parseRange('27 to 28'), [27, 28]);
  assert.deepEqual(parseRange('27½'), [27.5, 27.5]);
  assert.deepEqual(parseRange('27 1/2'), [27.5, 27.5]);
  assert.deepEqual(parseRange('62,5 cm'), [62.5, 62.5]);
  assert.deepEqual(parseRange('24"'), [24, 24]);
  assert.deepEqual(parseRange("24''"), [24, 24]);
  assert.deepEqual(parseRange('66 cm / 26 in', 'cm'), [66, 66]);
  assert.deepEqual(parseRange('66 cm / 26 in', 'in'), [26, 26]);
  assert.equal(parseRange('28-27'), null);
  assert.equal(parseRange('3-5 days'), null);
  assert.equal(parseRange(''), null);
});

test('mentionsBrand matches whole words across cells and caption', () => {
  assert.equal(mentionsBrand([['AGOLDE women', 'x']], '', 'Agolde'), true);
  assert.equal(mentionsBrand([['Size']], 'Rag and Bone size guide', 'rag & bone'), true);
  assert.equal(mentionsBrand([['Size']], 'Sezane sizes', 'Sézane'), true);
  assert.equal(mentionsBrand([['Returns']], '', 'Re'), false);
  assert.equal(mentionsBrand([['AGOLDE']], 'AGOLDE', ''), false);
  const chart = parseGuideMatrix([['AGOLDE size', 'Waist', 'Hip'], ['24', '61', '86'], ['25', '64', '89']], { brand: 'AGOLDE' });
  assert.equal(chart.mentions_brand, true);
});

test('guide-table.js loads before extract.js everywhere the reader runs', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const manifest = JSON.parse(read('manifest.json')).content_scripts[0].js;
  assert.ok(manifest.indexOf('src/guide-table.js') > -1 && manifest.indexOf('src/guide-table.js') < manifest.indexOf('src/extract.js'), 'manifest');
  for (const [file, a, b] of [
    ['ui/popup.js', "'src/guide-table.js'", "'src/extract.js'"],
    ['tests/fixture-shop.html', 'src/guide-table.js', 'src/extract.js'],
    ['tests/shops.html', 'src/guide-table.js', 'src/extract.js'],
    ['tools/render-shop.py', "'guide-table'", "'extract'"],
  ]) {
    const text = read(file);
    assert.ok(text.indexOf(a) > -1 && text.indexOf(a) < text.indexOf(b), file);
  }
});

test('hints carry through to the chart', () => {
  const chart = parseGuideMatrix([['Size', 'Waist', 'Hip'], ['S', '66', '92'], ['M', '70', '96']], { url: 'https://helsa.example/p/1', caption: 'Size guide' });
  assert.equal(chart.source_url, 'https://helsa.example/p/1');
  assert.equal(chart.source_type, null);
  assert.equal(chart.retailer, null);
});
