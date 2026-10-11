// Turns a shopper profile + a product page into one size recommendation with reasons.
(function (root) {
  const { BRANDS, GENERIC, MEN, TO_EU, REGION, IN } = root.SizerBrands || require('./brands.js');
  const Charts = root.SizerCharts || require('./charts.js');
  const RD = root.SizerReviewDetails || require('./review-details.js');

  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

  const bundleEntries = (charts) => (charts && Array.isArray(charts.brands) ? charts.brands : Array.isArray(charts) ? charts : []);

  // The brand's verified chart from the bundle when it has one for this kind of item, else the built-in approximation.
  function findBrand(text, charts, kind) {
    const t = ` ${norm(text)} `;
    if (!t.trim()) return null;
    const longest = (aliases) => {
      let len = 0;
      for (const a of aliases) {
        const n = norm(a);
        if (n && t.includes(` ${n} `) && n.length > len) len = n.length;
      }
      return len;
    };
    let entry = null;
    let entryLen = 0;
    for (const e of bundleEntries(charts)) {
      const len = longest(e.aliases && e.aliases.length ? e.aliases : [e.name]);
      if (len > entryLen) { entry = e; entryLen = len; }
    }
    let builtin = null;
    let builtinLen = 0;
    for (const b of BRANDS) {
      const len = longest(b.aliases);
      if (len > builtinLen) { builtin = b; builtinLen = len; }
    }
    if (entry && entryLen >= builtinLen) {
      return Charts.toBrand(entry, kind || 'bottoms') || brandById(entry.id) || builtin;
    }
    return builtin;
  }

  function brandById(id) {
    return BRANDS.find((b) => b.id === id) || null;
  }

  const sameSize = (a, b) => String(a).replace(/\s+/g, '').replace(/½/, '.5').replace(/\.0$/, '').toUpperCase() === String(b).replace(/\s+/g, '').replace(/½/, '.5').replace(/\.0$/, '').toUpperCase();

  // ---- size labels -------------------------------------------------------

  const LETTERS = '6XL|5XL|XXXXXL|4XL|XXXXL|3XL|XXXL|XXL|2XL|XL|XXXS|3XS|XXS|2XS|XS|S|M|L';
  const LETTER_RE = new RegExp(`^(${LETTERS})(?![A-Z])`);
  const LETTER_CANON = { XXXXXL: '5XL', XXXXL: '4XL', XXXL: '3XL', '2XL': 'XXL', '2XS': 'XXS', '3XS': 'XXXS' };
  const letterOf = (x) => LETTER_CANON[x] || x;
  // Sizes as words: Small, X-Large, Extra Small, XX-Large.
  const WORD_SIZE = /^(XXX|XX|X|EXTRA)?[- ]?(SMALL|MEDIUM|LARGE)$/;
  const ONE_SIZE = /^(?:ONE ?SIZE|O\/?S|TU|TAILLE UNIQUE|EINHEITSGR(?:Ö|OE)SSE|TALLA ÚNICA|TAGLIA UNICA)$/;
  const TAG_SYSTEM = { EU: 'eu', FR: 'eu', DE: 'eu', IT: 'it', UK: 'uk', AU: 'uk', US: 'us' };
  // US plus sizes: 0X is about an L, 1X an XL, on to 5X.
  const US_PLUS = { 0: 'L', 1: 'XL', 2: 'XXL', 3: '3XL', 4: '4XL', 5: '5XL' };

  // ---- women's sizes across regions ----------------------------------------

  const REGION_SYSTEMS = ['fr', 'eu', 'de', 'it', 'uk', 'us', 'letter'];
  const regionKey = (v) => String(v).trim().toUpperCase();

  // One size in another region's system, through the table: convertSize(38, 'fr', 'uk') is 10.
  function convertSize(value, from, to) {
    if (!REGION_SYSTEMS.includes(from) || !REGION_SYSTEMS.includes(to) || value == null) return null;
    const row = REGION.find((r) => r[from] != null && regionKey(r[from]) === regionKey(value));
    return row && row[to] != null ? row[to] : null;
  }

  // A labelled size carries its FR/EU number, so sizes from different regions can be lined up.
  function withEu(p) {
    const eu = convertSize(p.value, p.system, 'eu');
    return eu == null ? p : { ...p, eu };
  }

  function parseSizeLabel(raw) {
    const p = parseLabel(raw);
    return p && REGION_SYSTEMS.includes(p.system) ? withEu(p) : p;
  }

  function parseLabel(raw) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!s || s.length > 24) return null;
    const own = String(raw).replace(/\s+/g, ' ').trim();
    let m;
    // A child's age is not an adult size: 9 Jahre, 9-10 Years, 6 ans, 18 months.
    if (/^\d{1,2}(?: ?[-–\/] ?\d{1,2})? ?(?:JAHRE|YEARS?|YRS?|ANS|AÑOS|ANOS|ANNI|ÅR|LAT|MONTHS?|MTHS|MONATE|MOIS|MESES|MESI)$/.test(s)) return null;
    // One size: kept so the page's only size is known, never sized.
    if (ONE_SIZE.test(s)) return { system: 'one', value: 'one', label: own };
    if ((m = s.match(WORD_SIZE))) return { system: 'letter', value: letterOf(`${m[1] === 'EXTRA' ? 'X' : m[1] || ''}${m[2][0]}`), label: own };
    // Two sizes in one label span both: S/M, XS-S, 8/10, 10-12, UK 8-10. A jeans waist and leg
    // (28/30) is read below; EU pairs such as 36/38 are settled across the page in resolveSizes.
    if ((m = s.match(new RegExp(`^(${LETTERS}) ?[/-] ?(${LETTERS})$`)))) return { system: 'letter', value: letterOf(m[1]), span: letterOf(m[2]), label: own };
    if ((m = s.match(/^(?:(UK|AU|US|EU|FR|DE|IT) ?)?(\d{1,2}) ?[/-] ?(\d{1,2})$/)) && (+m[3] - +m[2] === 2 || +m[3] - +m[2] === 4 || (+m[2] >= 30 && +m[3] - +m[2] >= 1 && +m[3] - +m[2] <= 3)) && (m[1] || +m[2] < 22)) {
      return { system: TAG_SYSTEM[m[1]] || 'number', value: +m[2], span: +m[3], label: own };
    }
    // A letter with the shop's own numbers goes by the numbers, which are the more exact: S (8-10).
    if ((m = s.match(new RegExp(`^(?:${LETTERS}) ?\\((?:(UK|AU|US|EU) ?)?(\\d{1,2})(?: ?[-/] ?(\\d{1,2}))?\\)$`)))) {
      return { system: TAG_SYSTEM[m[1]] || 'number', value: +m[2], ...(m[3] ? { span: +m[3] } : {}), label: own };
    }
    // A size with its EU size beside it goes by the EU size: Zalando's Nike "6 (39)" and "6 (40)",
    // Selfridges' "EUR 36 / 3 UK WOMEN". The page's label is kept, so the answer names its button.
    if ((m = s.match(/^\d{1,2}(?:[.,]5)? ?\((\d{2}(?:[.,]5)?)\)$/)) && +m[1].replace(',', '.') >= 30) return { system: 'eu', value: +m[1].replace(',', '.'), label: own };
    if ((m = s.match(/^EUR? ?(\d{2}(?:[.,]5)?) ?\/ ?\d{1,2}(?:[.,]5)? ?(?:UK|US)\b/))) return { system: 'eu', value: +m[1].replace(',', '.'), label: own };
    // A US women's and men's shoe size together goes by the women's: Urban Outfitters' "W 7.5/M 6".
    if ((m = s.match(/^W ?(\d{1,2}(?:\.5)?) ?\/ ?M ?\d{1,2}(?:\.5)?$/)) || (m = s.match(/^M ?\d{1,2}(?:\.5)? ?\/ ?W ?(\d{1,2}(?:\.5)?)$/))) return { system: 'us', value: +m[1], label: own };
    // A denim waist with its US size beside it goes by the waist: Zara US "28 (US 6)".
    if ((m = s.match(/^(\d{2}) ?\(US ?\d{1,2}\)$/)) && +m[1] >= 22 && +m[1] <= 40) return { system: 'denim', value: +m[1], length: null, label: own };
    // The region after the number: 8 UK, 38 EU.
    if ((m = s.match(/^(\d{1,2}) ?(UK|AU|US|EU|FR|DE|IT)$/))) return { system: TAG_SYSTEM[m[2]], value: +m[1], label: own };
    // 2XL to 6XL and 3XS start with a digit, so they are read before the bare numbers; so are US 1X and 18W.
    if (/^[2-6]X/.test(s) && (m = s.match(LETTER_RE))) return { system: 'letter', value: letterOf(m[1]), label: m[0] };
    if ((m = s.match(/^([0-5]) ?X$/))) return { system: 'letter', value: US_PLUS[m[1]], label: String(raw).trim() };
    if ((m = s.match(/^(1[4-9]|2\d|3[0-2]) ?W$/))) return { system: 'us', value: +m[1], label: String(raw).trim() };
    // A letter with a leg length, as ONLY and Vero Moda print it on Zalando: Mx32, XS x 30.
    if ((m = s.match(/^(4XL|XXXXL|3XL|XXXL|XXL|2XL|XL|XXS|2XS|XS|S|M|L)\s?[X\/]\s?(2[6-9]|3[0-8])$/))) {
      return { system: 'letter', value: LETTER_CANON[m[1]] || m[1], length: +m[2], label: String(raw).trim() };
    }
    if ((m = s.match(/^W\s?(\d{2})(?:\s?[\/X]?\s?L\s?(\d{2}))?\b/))) return { system: 'denim', value: +m[1], length: m[2] ? +m[2] : null, label: m[0] };
    // Amazon's "28W / 30L" and "30W x 32L": the letters after the numbers. Without the L, 18W is a US plus size.
    if ((m = s.match(/^(\d{2}) ?W ?[\/X]? ?(\d{2}) ?L\b/)) && +m[1] >= 22 && +m[1] <= 48) return { system: 'denim', value: +m[1], length: +m[2], label: String(raw).trim() };
    if ((m = s.match(/^(\d{2})\s?[\/X]\s?(\d{2})\b/)) && +m[1] >= 22 && +m[1] <= 40 && +m[2] >= 26 && +m[2] <= 38) return { system: 'denim', value: +m[1], length: +m[2], label: m[0] };
    // Third sizes are shoes too, as Adidas prints them: EU 40 2/3, 36⅓.
    if ((m = s.match(/^(EU|FR|DE|UK|US)?\s?(\d{1,2})\s?([12])\/3|^(EU|FR|DE|UK|US)?\s?(\d{1,2})\s?([⅓⅔])/))) {
      const tag = m[1] || m[4];
      const third = m[3] ? +m[3] : m[6] === '⅓' ? 1 : 2;
      return { system: { EU: 'eu', FR: 'eu', DE: 'eu', UK: 'uk', US: 'us' }[tag] || 'number', value: +(m[2] || m[5]) + third / 3, label: m[0] };
    }
    // Half sizes are shoes: 38.5, EU 38½, UK 5.5.
    if ((m = s.match(/^(EU|FR|DE|UK|US)?\s?(\d{1,2})(?:[.,]5|\s?1\/2|½)(?![\d.,])/))) {
      const system = { EU: 'eu', FR: 'eu', DE: 'eu', UK: 'uk', US: 'us' }[m[1]] || 'number';
      return { system, value: +m[2] + 0.5, label: m[0] };
    }
    if ((m = s.match(/^(EU|FR|DE)\s?(\d{2})\b/))) return { system: 'eu', value: +m[2], label: m[0] };
    if ((m = s.match(/^IT\s?(\d{2})\b/))) return { system: 'it', value: +m[1], label: m[0] };
    // Australia prints UK numbers.
    if ((m = s.match(/^(?:UK|AU)\s?(\d{1,2})\b/))) return { system: 'uk', value: +m[1], label: m[0] };
    if ((m = s.match(/^US\s?(00|\d{1,2})\b/))) return { system: 'us', value: m[1] === '00' ? '00' : +m[1], label: m[0] };
    if ((m = s.match(/^(00|\d{1,2})(?![\d.,])/))) return { system: 'number', value: m[1] === '00' ? '00' : +m[1], label: m[0] };
    if ((m = s.match(LETTER_RE))) return { system: 'letter', value: letterOf(m[1]), label: m[0] };
    return null;
  }

  // A UK shop: prices in pounds (prettylittlething.com, boohoo.com), a .uk host, or a UK section of
  // an international one (zara.com/uk/, /en_gb/, /en-gb/). Australia and New Zealand print UK numbers too.
  const UK_SHOP = /(?:\.uk|\.au|\.nz)$/i;
  const UK_PATH = /\/(?:uk|gb)(?:\/|$)|[\/_-]en[-_](?:gb|uk)\b/i;
  function ukShop(product) {
    if (!product) return false;
    // Only a yes: a UK shop can show prices in another currency on request.
    if (String(product.currency || '').toUpperCase() === 'GBP') return true;
    return !!((product.host && UK_SHOP.test(product.host)) || (product.url && UK_PATH.test(String(product.url).replace(/^https?:\/\/[^/]+/i, ''))));
  }

  // Bare numbers are ambiguous (32 can be a denim waist or EU 32); settle them with context. Numbers
  // of 24 or under are never EU or IT clothing sizes, whatever the brand's chart is, so they are UK
  // on a UK shop and US elsewhere.
  function inferNumberSystem(values, hint, uk) {
    const nums = values.filter((v) => typeof v === 'number');
    const small = nums.length && nums.every((n) => n <= 24);
    // A denim waist starts at 22, so 8 to 16 under a denim chart are dress sizes, not waists. So is a
    // run that starts at 00 to 4 and mostly sits under 22, though its plus sizes go on to 30 (Old Navy).
    const dressRun = nums.length && Math.min(...nums) <= 4 && nums.filter((n) => n < 22).length * 2 > nums.length;
    if ((hint === 'denim' && nums.length && nums.every((n) => n < 22)) || ((hint === 'denim' || !hint) && dressRun)) return uk ? 'uk' : 'us';
    if (hint === 'denim' || hint === 'us' || hint === 'uk') return hint;
    if (small) return uk ? 'uk' : 'us';
    if (hint === 'eu') return hint;
    if (!nums.length) return 'eu';
    if (nums.some((n) => n % 2 === 1) && nums.every((n) => n >= 22 && n <= 40)) return 'denim';
    if (nums.every((n) => n >= 30)) return 'eu';
    return 'denim';
  }

  const BRAND_SCALE = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  function resolveSizes(labels, hint, uk) {
    const parsed = labels.map((l) => ({ ...l, parsed: parseSizeLabel(l.label) })).filter((l) => l.parsed && l.parsed.system !== 'one');
    // Every label an even EU pair, 32/34, 36/38: spans of two EU sizes, not jeans waists and legs.
    const pair = (l) => { const m = String(l.label).trim().match(/^(\d{2}) ?\/ ?(\d{2})$/); return m && +m[1] >= 30 && +m[1] % 2 === 0 && +m[2] === +m[1] + 2 ? +m[1] : null; };
    if (parsed.length >= 2 && hint !== 'denim' && parsed.every((l) => pair(l) != null)) {
      for (const l of parsed) l.parsed = withEu({ system: 'eu', value: pair(l), span: pair(l) + 2, label: String(l.label).trim() });
    }
    // A designer's own scale, 0 to 5 with an odd size among them (sacai and Issey Miyake 1 to 4, Ted
    // Baker 0 to 6 is longer): 1 is S. UK and US dress sizes are even. Only clothing with no brand
    // chart; shoes always pass their system.
    const nums = parsed.filter((l) => l.parsed.system === 'number');
    if (!hint && nums.length >= 2 && nums.length === parsed.length && nums.every((l) => Number.isInteger(l.parsed.value) && l.parsed.value <= 5 && l.parsed.span == null) && nums.some((l) => l.parsed.value % 2 === 1)) {
      for (const l of nums) l.parsed = { ...l.parsed, system: 'letter', value: BRAND_SCALE[l.parsed.value] };
    }
    const numSystem = inferNumberSystem(parsed.filter((l) => l.parsed.system === 'number').map((l) => l.parsed.value), hint, uk);
    for (const l of parsed) if (l.parsed.system === 'number') l.parsed = { ...l.parsed, system: numSystem };
    // US juniors' sizes run odd, 1 to 15 (Fashion Nova), and sit about one under the even sizes: a
    // junior 11 fits like a 10. Matched as that even size, shown as the page's own label.
    const odd = parsed.filter((l) => l.parsed.system === 'us' && Number.isInteger(l.parsed.value) && l.parsed.value % 2 === 1 && l.parsed.value <= 15);
    if (odd.length >= 4) for (const l of odd) l.parsed = { ...l.parsed, value: l.parsed.value - 1 };
    return parsed;
  }

  function dominantSystem(parsed) {
    const count = {};
    for (const l of parsed) count[l.parsed.system] = (count[l.parsed.system] || 0) + 1;
    return Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
  }

  // Body measurements a size is cut for, using the brand's own chart when the systems match. A label
  // that spans two sizes (S/M, 8/10) is cut for the body between them.
  function measure(parsed, brand) {
    if (parsed.span != null) {
      const a = measure({ ...parsed, span: null }, brand);
      const b = measure({ ...parsed, value: parsed.span, span: null }, brand);
      if (!a || !b) return a || b;
      const mid = { label: parsed.label, value: parsed.value };
      for (const k of ['waist', 'hip', 'bust', 'shoulder']) if (typeof a[k] === 'number' && typeof b[k] === 'number') mid[k] = (a[k] + b[k]) / 2;
      return mid;
    }
    const sys = parsed.system;
    if (brand && brand.system === sys) {
      const e = brand.sizes.find((x) => String(x.value) === String(parsed.value));
      if (e) return e;
    }
    if (brand) {
      // Bundle rows carry the other systems the brand prints next to each size.
      const e = brand.sizes.find((x) => x.aliases && x.aliases[sys] != null && sameSize(x.aliases[sys], parsed.value));
      if (e) return e;
    }
    if (brand && brand.system === 'eu' && sys === 'letter' && brand.letters) {
      const eu = Object.keys(brand.letters).find((k) => brand.letters[k] === parsed.value);
      const e = eu && brand.sizes.find((x) => String(x.value) === eu);
      if (e) return e;
    }
    if (brand) {
      // A UK 10 on the page is the brand's EU 38 or its M, through the regional table.
      const target = convertSize(parsed.value, sys, brand.system);
      const e = target != null && brand.sizes.find((x) => sameSize(x.value, target));
      if (e) return e;
    }
    if (TO_EU[sys]) return GENERIC.eu.find((x) => x.value === TO_EU[sys](parsed.value)) || null;
    return (GENERIC[sys] || []).find((x) => String(x.value) === String(parsed.value)) || null;
  }

  // ---- body estimate -----------------------------------------------------

  // A garment that feels tight means your body is a little bigger than its size, and the reverse.
  const FIT_SHIFT_CM = { tight: 1.5, perfect: 0, loose: -1.5 };
  const BOTTOMS = ['jeans', 'trousers', 'skirt', 'shorts'];

  const KIND_OF_TYPE = { jeans: 'bottoms', trousers: 'bottoms', skirt: 'bottoms', shorts: 'bottoms', top: 'tops', dress: 'dresses', jacket: 'outerwear', shoes: 'shoes' };

  // A typed number from the profile, or null when it is empty or not a number.
  const num = (v) => (v === '' || v == null || !isFinite(+v) || +v <= 0 ? null : +v);
  const BODY_KEYS = ['bust', 'waist', 'hip', 'shoulder'];
  const UPPER_TYPES = ['top', 'dress', 'jacket'];
  // A top or a jacket hangs from the shoulders, so its chart's waist and hip are not yours; a dress
  // is fitted through both and still tells them.
  const NO_LOWER_TYPES = ['top', 'jacket'];
  // How far a piece marked tight may sit under you (or loose, over you) and still agree, in cm.
  const FIT_SLACK_CM = 4;
  const CIRCUMFERENCE = ['bust', 'waist', 'hip'];
  // Without an inseam, the leg is guessed from height: inseam is about 0.45 of it.
  const INSEAM_PER_HEIGHT = 0.45;

  function anchorBrand(a, charts) {
    if (!a.brand || a.brand.startsWith('generic')) return null;
    return findBrand(a.brand, charts, KIND_OF_TYPE[a.type] || 'bottoms') || brandById(a.brand);
  }

  // ---- feet ----------------------------------------------------------------

  function shoeRow(parsed, rows, system) {
    return rows.find((r) => (parsed.system === system && sameSize(r.value, parsed.value))
      || (r.aliases && r.aliases[parsed.system] != null && sameSize(r.aliases[parsed.system], parsed.value))) || null;
  }

  const FOOT_SHIFT_CM = { tight: 0.3, perfect: 0, loose: -0.3 };

  // A pair of shoes you own, read as a foot length on the brand's chart or the standard EU one.
  function shoeAnchor(a, charts) {
    const found = a.brand ? findBrand(a.brand, charts, 'shoes') : null;
    const brand = found && found.shoes ? found : null;
    let parsed = parseSizeLabel(a.size);
    if (!parsed) return null;
    if (parsed.system === 'number') parsed = { ...parsed, system: 'eu' };
    const row = shoeRow(parsed, brand ? brand.sizes : Charts.GENERIC_SHOES, brand ? brand.system : 'eu');
    // The standard chart has whole EU sizes; a size between its lines (UK 6, EU 38.5) is read as a foot.
    const halfway = !row && !brand ? Charts.SHOE_FOOT(parsed.system, parsed.value, false) : null;
    if (!row && halfway == null) return null;
    const label = brand ? brand.name : a.brand || 'shoes';
    return { foot: +((row ? row.footMid : halfway) + (FOOT_SHIFT_CM[a.fit] || 0)).toFixed(2), name: `${label} ${a.size}`, brand };
  }

  function footFromProfile(profile, charts) {
    if (profile.footLength && +profile.footLength > 0) return { foot: +profile.footLength, source: 'your foot length', measured: true };
    for (const a of profile.anchors || []) {
      if (a.type !== 'shoes') continue;
      const f = shoeAnchor(a, charts);
      if (f) return { foot: f.foot, source: f.name, measured: false };
    }
    return null;
  }

  // Bare numbers on clothes you own: the brand's system if known, else guess from the item type.
  function anchorNumberSystem(a, brand, v) {
    if (brand) return brand.system;
    if (a.brand && a.brand.startsWith('generic')) {
      const sys = a.brand.replace('generic-', '');
      return sys === 'letter' ? 'eu' : sys;
    }
    if (v === '00' || v <= 20) return 'us';
    if (a.type === 'jeans' && v >= 22 && v <= 40) return 'denim';
    if (BOTTOMS.includes(a.type) && v >= 22 && v < 30) return 'denim';
    if (!a.type && v >= 22 && v < 30) return 'denim';
    return 'eu';
  }

  function wardrobePoints(anchors, charts) {
    const points = [];
    for (const a of anchors || []) {
      if (a.type === 'shoes') continue;
      const brand = anchorBrand(a, charts);
      let parsed = parseSizeLabel(a.size);
      if (!parsed) continue;
      if (parsed.system === 'number') parsed = { ...parsed, system: anchorNumberSystem(a, brand, parsed.value) };
      let m = measure(parsed, brand);
      if (!m) continue;
      // Most built-in brand charts are for bottoms and print no bust; for a top, the standard chart
      // for the same label gives one, the way an unknown brand is read.
      if (UPPER_TYPES.includes(a.type) && typeof m.bust !== 'number' && brand) {
        const std = measure(parsed, null);
        if (std && typeof std.bust === 'number') m = { ...m, bust: std.bust, shoulder: typeof m.shoulder === 'number' ? m.shoulder : std.shoulder };
      }
      const shift = FIT_SHIFT_CM[a.fit] || 0;
      const point = { name: anchorName(a, brand, parsed), fit: a.fit || 'perfect' };
      // Trousers or a skirt say nothing about your bust or shoulders, even read through a chart that
      // prints them; only a piece worn on the upper body does. The reverse holds for a top.
      const upper = UPPER_TYPES.includes(a.type);
      const noLower = NO_LOWER_TYPES.includes(a.type);
      for (const key of BODY_KEYS) {
        if (!upper && (key === 'bust' || key === 'shoulder')) continue;
        if (noLower && (key === 'waist' || key === 'hip')) continue;
        if (typeof m[key] === 'number') point[key] = m[key] + (CIRCUMFERENCE.includes(key) ? shift : 0);
      }
      points.push(point);
    }
    return points;
  }

  function anchorName(a, brand, parsed) {
    const name = brand ? brand.name : a.brand && !a.brand.startsWith('generic') ? a.brand : a.type || (a.brand === 'generic-denim' || (parsed && parsed.system === 'denim') ? 'jeans' : 'size');
    return `${name} ${a.size}`;
  }

  // ---- flat-lay measurements ------------------------------------------------

  // A piece measured flat across: circumferences are twice the flat width, lengths are as measured.
  // Chest is the garment's bust. A piece that fits tight asks for a slightly bigger garment.
  function flatGarment(a) {
    const f = a && a.flat;
    if (!f || typeof f !== 'object') return null;
    const shift = FIT_SHIFT_CM[a.fit] || 0;
    const out = {};
    const circ = { waist: num(f.waist), hip: num(f.hip), bust: num(f.chest) };
    for (const key of Object.keys(circ)) if (circ[key] != null) out[key] = circ[key] * 2 + shift;
    for (const key of ['shoulder', 'sleeve', 'length', 'inseam']) if (num(f[key]) != null) out[key] = num(f[key]);
    return Object.keys(out).length ? out : null;
  }

  // The pieces you own of this kind with flat-lay measurements, averaged, as one garment to compare with.
  function garmentReference(profile, kind, charts) {
    const pieces = [];
    for (const a of profile.anchors || []) {
      if ((KIND_OF_TYPE[a.type || 'jeans'] || 'bottoms') !== kind) continue;
      const g = flatGarment(a);
      if (!g) continue;
      const brand = anchorBrand(a, charts);
      pieces.push({ g, name: anchorName(a, brand, parseSizeLabel(a.size)) });
    }
    if (!pieces.length) return null;
    const values = {};
    for (const key of BODY_KEYS) {
      const have = pieces.filter((p) => p.g[key] != null);
      if (have.length) values[key] = have.reduce((s, p) => s + p.g[key], 0) / have.length;
    }
    return { values, names: pieces.map((p) => p.name) };
  }

  // How one wardrobe item is being read, so the settings page can show it.
  function explainAnchor(a, charts) {
    if (a.type === 'shoes') {
      const f = shoeAnchor(a, charts);
      return { ok: !!f, brand: f && f.brand ? f.brand.name : null, system: 'shoe' };
    }
    const brand = anchorBrand(a, charts);
    let parsed = parseSizeLabel(a.size);
    if (!parsed) return { ok: false, brand: brand ? brand.name : null };
    if (parsed.system === 'number') parsed = { ...parsed, system: anchorNumberSystem(a, brand, parsed.value) };
    return { ok: !!measure(parsed, brand), brand: brand ? brand.name : null, system: parsed.system };
  }

  // Your body as Sizer reads it: each measurement as typed, else the average of the pieces you own
  // that tell it. Weight is never part of it; it only compares you with reviewers.
  function bodyFromProfile(profile, charts) {
    const points = wardrobePoints(profile.anchors, charts);
    const fromPoints = (k) => {
      const have = points.filter((p) => typeof p[k] === 'number');
      return have.length ? have.reduce((s, p) => s + p[k], 0) / have.length : null;
    };
    const read = (k) => (num(profile[k]) != null ? num(profile[k]) : fromPoints(k));
    const waist = read('waist');
    const hip = read('hip');
    const bust = read('bust');
    const shoulder = read('shoulder');
    const height = num(profile.height);
    // Stored in cm like every measurement; leg lengths on labels (32L, Mx32) are inches.
    const typedInseam = num(profile.inseam) != null ? +(num(profile.inseam) / IN).toFixed(1) : null;
    const inseam = typedInseam != null ? typedInseam : height ? +((height * INSEAM_PER_HEIGHT) / IN).toFixed(1) : null;
    const extra = { bust, shoulder, height, inseam, inseamGuess: typedInseam == null && inseam != null };
    const foot = footFromProfile(profile, charts);
    if (waist == null || hip == null) {
      return foot || bust != null ? { waist: null, hip: null, ...extra, sources: [], spread: 0, points, foot: foot ? foot.foot : null, footSource: foot ? foot.source : null } : null;
    }
    const lower = points.filter((p) => typeof p.waist === 'number' && typeof p.hip === 'number');
    const spread = lower.length ? Math.max(...lower.map((p) => offBy(p, waist, hip))) : 0;
    return { waist, hip, ...extra, sources: sourcesFor(profile, points, ['waist', 'hip']), spread, points, foot: foot ? foot.foot : null, footSource: foot ? foot.source : null };
  }

  // How far a piece you own sits from your waist and hip, in cm. A piece marked tight is expected to
  // sit a little under you and one marked loose a little over, so that much is not held against it.
  function offBy(p, waist, hip) {
    let total = 0;
    for (const [mine, its] of [[waist, p.waist], [hip, p.hip]]) {
      let d = mine - its;
      if (p.fit === 'tight' && d > 0) d = Math.max(0, d - FIT_SLACK_CM);
      if (p.fit === 'loose' && d < 0) d = Math.min(0, d + FIT_SLACK_CM);
      total += Math.abs(d);
    }
    return total;
  }

  // The pieces you own that don't agree with the rest of your profile, by name.
  function disagreeing(body) {
    if (!body || body.waist == null || body.hip == null) return [];
    return body.points.filter((p) => typeof p.waist === 'number' && typeof p.hip === 'number' && offBy(p, body.waist, body.hip) > 5).map((p) => p.name);
  }

  // What the size was read from, for the measurements used: "measurements", "waist", the pieces.
  function sourcesFor(profile, points, keys) {
    const typed = keys.filter((k) => num(profile[k]) != null);
    if (keys.length && typed.length === keys.length) return ['measurements'];
    // Bare names: the reason already opens with "Your", so "your waist" would read "Your your waist".
    const out = typed.map((k) => k);
    const missing = keys.filter((k) => !typed.includes(k));
    out.push(...points.filter((p) => missing.some((k) => typeof p[k] === 'number')).map((p) => p.name));
    return out;
  }

  // ---- page text signals -------------------------------------------------

  const RE = {
    small: /runs?\s+small|fits?\s+small|(?:is\s+)?cut\s+small|small(?:er)?\s+than\s+(?:usual|normal|expected)|(?:order|choose|select|take|go|pick|buy)\s+(?:one|a|1)\s+size\s+(?:up|larger|bigger)|size\s+up\b|we\s+recommend\s+(?:sizing|going)\s+up|fällt\s+(?:eher\s+)?klein\s+aus|eine\s+größe\s+größer|taille\s+petit|prenez\s+une\s+taille\s+au-dessus|talla\s+pequeñ|veste\s+piccolo|valt\s+klein/i,
    large: /runs?\s+(?:large|big)|fits?\s+(?:large|big)|(?:is\s+)?cut\s+(?:large|generous)|large(?:r)?\s+than\s+(?:usual|normal)|(?:order|choose|select|take|go|pick)\s+(?:one|a|1)\s+size\s+(?:down|smaller)|size\s+down\b|we\s+recommend\s+(?:sizing|going)\s+down|fällt\s+(?:eher\s+)?groß\s+aus|eine\s+größe\s+kleiner|taille\s+grand|talla\s+grande|veste\s+grande|valt\s+groot/i,
    tts: /true\s+to\s+size|fits\s+true|normal\s+fit|fällt\s+normal\s+aus|größengerecht|taille\s+normalement/i,
    rigid: /no\s+stretch|non[-\s]?stretch|zero\s+stretch|without\s+stretch|rigid(?:\s+denim)?|ohne\s+stretch|kein(?:en)?\s+stretch|nicht\s+elastisch|sans\s+stretch|sin\s+elasticidad|stretch\s*:\s*(?:none|no)/i,
    slight: /slight\s+stretch|light\s+stretch|comfort\s+stretch|low\s+stretch|leichte[rn]?\s+stretch|wenig\s+stretch|stretch\s*:\s*(?:slight|light|low)/i,
    high: /super\s*[-\s]?stretch|high\s+stretch|power\s+stretch|ultra\s+stretch|very\s+stretchy|stretchy|sculpt(?:s|ing)?\b|stretch\s*:\s*(?:high|very)/i,
    highNamed: /super\s*[-\s]?stretch|high\s+stretch|power\s+stretch|ultra\s+stretch|very\s+stretchy|sculpt(?:s|ing)?\b|stretch\s*:\s*(?:high|very)/i,
    // A fit scale's end labels ("How it fits Small Just Right Big", "Runs Small True to Size Runs Large"),
    // with SHEIN's review shares between them ("Small 2% True to Size 7% Large 91%").
    fitScale: /\b(?:(?:runs?|fits?)\s+)?small(?:\s*\d{1,3}\s*%)?\s*[-–—|·:,]?\s*(?:just\s+right|true\s+to\s+size|perfect(?:\s+fit)?)(?:\s*\d{1,3}\s*%)?\s*[-–—|·:,]?\s*(?:(?:runs?|fits?)\s+)?(?:large|big)\b/gi,
    stretchScale: /(?:\b(?:ranging\s+)?from\s+)?\b(?:non|no|rigid)[-\s]?(?:stretch)?\s*(?:to|[-–—])?\s*(?:super|high|ultra|max(?:imum)?)[-\s]?stretch(?:y)?\b/gi,
    elastane: /(\d{1,2}(?:[.,]\d)?)\s*%\s*(?:elastane|elasthan|elastan|spandex|lycra|élasthanne|elastomultiester|elastomultiestere|elastolefin)/i,
    cotton100: /100\s*%\s*(?:organic\s+)?(?:cotton|baumwolle|coton|algodón|cotone|katoen)/i,
    skinny: /\b(?:skinny|slim|cigarette|super\s+tight)\b/i,
    fitWord: /\b(?:tight|snug|narrow|loose|roomy|wide|generous)\b/i,
    fitArea: /\b(?:ankles?|toes?|instep|heels?|calf|calves|foot|feet|waist(?:band)?|hips?|bust|chest|shoulders?|arms?|thighs?)\b/i,
    roomy: /\b(?:oversize[d]?|relaxed|baggy|boyfriend|loose|barrel|balloon)\b/i,
    model: /model[^.]{0,40}?(?:wears?|wearing|is\s+wearing|trägt)[^.]{0,20}?(?:size|größe|grösse|taille)\s*:?\s*([A-Z]{0,2}\s?\d{0,2}(?:\s?\/\s?L?\d{2})?|[XSML]{1,3})/i,
    modelHeight: /(?:model'?s?\s+height|model\s+is|größe\s+des\s+models|modelgröße)[^.\d]{0,20}(\d{3})\s*cm/i,
    modelHeightFt: /model[^.\d]{0,30}?(\d)\s*['’]\s*(\d{1,2})/i,
    bottoms: /\b(?:jeans?|denim|trousers?|pants?|chinos?|skirts?|shorts|culottes?|leggings|hose|rock)\b/i,
    bra: /\b(?:bras?|bralettes?|soutien-gorge|bh)\b/i,
    notBra: /\bbra[- ]?free\b|\bbraless\b|\b(?:built[- ]in|shelf)[- ]bra\b/gi,
    // Only when nothing in the title is clothing: a dress with a belt is a dress.
    giftCard: /\b(?:e-?)?gift ?(?:cards?|vouchers?|certificates?)\b/i,
    kidsTitle: /\bfor (?:boys|girls|kids|children|toddlers?|babies)\b|\b(?:boys|girls|kids|children)['’]s?(?=\s)|\b(?:toddlers?|infants?|newborn)\b/i,
    kidsSection: /(?:^|>)\s*(?:kids|boys|girls|baby|children|toddlers?)(?:\s*\(|\s*>|\s*$|\s+\d)/i,
    // An option that is a quantity or a dimension, not a size: 1.5L, 500ml, 2 Pack, 10 x 15 cm, 128GB.
    notSizeOption: /^\d+(?:\.\d+)?\s?(?:ml|cl|l|litres?|g|kg|gb|tb|oz|mm|cm|m)$|\b(?:pack|pcs|pieces|count|set of)\b|\d\s?x\s?\d+(?:\.\d+)?\s?(?:cm|mm|in|")/i,
    accessory: /\b(?:belts?|bags?|handbags?|totes?|clutch|backpacks?|scarf|scarves|hats?|caps?|beanies?|gloves|mittens|sunglasses|necklaces?|earrings?|bracelets?|wallets?|purses?|umbrellas?|keyrings?)\b/i,
    onePiece: /\b(?:jumpsuits?|playsuits?|bodysuits?|rompers?|dungarees|overalls|waistcoats?|vests?|swimsuits?|bikinis?|co-?ords?)\b/i,
    // Boot-cut, boot leg and American Eagle's "kick boot jean" are jeans, and an Oxford shirt is a
    // shirt; a snowboot or a moonboot is a boot.
    shoes: /\b(?:sneakers?|trainers?|shoes?|(?:snow|moon|rain|ski|hiking|walking)?boots?(?![- ](?:cut|leg|jeans?|denim|flares?)\b)|wellies|wellingtons?|ballets|mary[- ]?janes?|courts|court shoes?|slingbacks?|booties?|sandals?|heels?|loafers?|mules?|pumps?|espadrilles?|slides?|slippers?|ballerinas?|flats|clogs?|oxfords?(?![- ](?:shirts?|cloth|blouses?|tops?)\b)|derby|derbies|brogues?|footwear|schuhe?|stiefel(?:etten)?|sandalen|chaussures?|bottes?|baskets|zapatos?|botas|scarpe|stivali)\b/i,
    dress: /\b(?:dress(?:es)?|gowns?|kleid(?:er)?|robes?|vestidos?|abito)\b/i,
    outerwear: /\b(?:coats?|overcoats?|jackets?|blazers?|parkas?|trench(?:coat)?s?|anoraks?|puffers?|manteaux?|vestes?|jacken?|mantel)\b/i,
    tops: /\b(?:t-?shirts?|tees?|shirts?|blouses?|tops?|sweaters?|jumpers?|knits?|cardigans?|hoodies?|sweatshirts?|jackets?|coats?|blazers?|pullover|bluse|hemd|jacke|mantel|chemise|veste|manteau)\b/i,
  };

  // What kind of item the page sells, from its title: it decides which of the brand's charts answers.
  function kindOf(title) {
    const t = String(title || '');
    if (RE.shoes.test(t)) return 'shoes';
    // Before bottoms, so a denim jacket is a jacket.
    if (RE.outerwear.test(t)) return 'outerwear';
    // Denim is a fabric: a denim dress is a dress and a denim shirt a top. Alone, it means jeans.
    const noDenim = t.replace(/\bdenim\b/gi, '');
    if (RE.bottoms.test(noDenim)) return 'bottoms';
    if (RE.dress.test(t)) return 'dresses';
    if (RE.tops.test(t)) return 'tops';
    return 'bottoms';
  }

  // A trainer named only by its model ("New Balance 530 Women's") shows what it is in its sizes: half
  // sizes, all UK/US shoe numbers or all EU ones. Clothing has no half sizes there; a garment the
  // title names stays a garment.
  function productKind(product) {
    const title = String((product && product.title) || '');
    const kind = kindOf(title);
    if (kind === 'shoes' || [RE.outerwear, RE.bottoms, RE.dress, RE.tops, RE.onePiece].some((re) => re.test(title))) return kind;
    const nums = ((product && product.sizes) || []).map((s) => String(s.label || '').replace(/^\s*(?:uk|us|eu)\s*/i, '').trim())
      .map((t) => (/^\d{1,2}(?:[.,]5|½)?$/.test(t) ? parseFloat(t.replace(',', '.').replace('½', '.5')) : NaN));
    if (nums.length < 3 || nums.some(Number.isNaN) || nums.every(Number.isInteger)) return kind;
    return nums.every((n) => n >= 1 && n <= 15) || nums.every((n) => n >= 33 && n <= 50) ? 'shoes' : kind;
  }

  // A men's item: its title says so, or the shop files it under men in its address or breadcrumb.
  // "Women" holds "men", so whole words only, and a women's word anywhere wins.
  // "Man" counts only where the shop files things (Zara's "MAN"): in a title it is Spider-Man.
  const MEN_WORD = /(?:^|[^a-z])(?:men'?s?|mens|menswear|homme|hommes|herren|hombre|uomo|heren)(?:[^a-z]|$)/i;
  const MAN_WORD = /(?:^|[^a-z])man(?:[^a-z]|$)/i;
  const WOMEN_WORD = /(?:^|[^a-z])(?:women'?s?|womens|woman|ladies|lady|femme|femmes|damen|mujer|donna|dames|girls?)(?:[^a-z]|$)/i;
  function forMen(product) {
    if (!product) return false;
    let path = '';
    try { path = product.url ? decodeURIComponent(new URL(product.url).pathname) : ''; } catch { path = ''; }
    const said = [product.title, product.section, path.replace(/[-_]/g, ' ')].map((t) => String(t || ''));
    if (said.some((t) => WOMEN_WORD.test(t))) return false;
    return said.some((t) => MEN_WORD.test(t)) || said.slice(1).some((t) => MAN_WORD.test(t));
  }

  // Which men's chart a page's sizes are read on: letters; jeans and trousers by waist; tailoring
  // by chest in inches (UK and US numbers start under 42) or by EU size. Collar sizes (14.5 to 18)
  // need a neck measurement Sizer does not have.
  function menChartFor(product, kind) {
    const parsed = (product.sizes || []).map((s) => parseSizeLabel(s.label)).filter(Boolean);
    const nums = parsed.filter((p) => typeof p.value === 'number').map((p) => p.value);
    if (nums.length && nums.length >= parsed.length / 2) {
      // Collars run 13 to 22 inches, big and tall included; men's chests start at 34.
      if (nums.every((n) => n >= 13 && n <= 22)) return { collar: true };
      if (kind === 'bottoms') return 'denim';
      return Math.min(...nums) < 42 ? 'chest' : 'eu';
    }
    return kind === 'bottoms' && !parsed.length ? 'denim' : 'letter';
  }

  // The page's sizes in the men's chart's system: numbers become waists, chests or EU sizes; a
  // jeans length ("32/32") stays.
  function menSizes(sizes, system) {
    return (sizes || []).map((l) => ({ ...l, parsed: parseSizeLabel(l.label) })).filter((l) => l.parsed && l.parsed.system !== 'one')
      .map((l) => (system !== 'letter' && typeof l.parsed.value === 'number' ? { ...l, parsed: { ...l.parsed, system } } : l));
  }

  function analyzeText(text, title) {
    // Shopbop's stretch scale ("Non-Stretch to Super-Stretch") names both ends whatever the fabric.
    // A fit scale names small, true to size and large at once, so it says none of them.
    const t = String(text || '').replace(RE.stretchScale, ' ').replace(RE.fitScale, ' ');
    const elastane = (t.match(RE.elastane) || [])[1];
    const elastanePct = elastane ? parseFloat(elastane.replace(',', '.')) : null;
    let stretch = 'unknown';
    // Elastane on the label is the fact; "rigid" can be a comparison ("the structure of rigid jeans").
    if (RE.rigid.test(t) && !(elastanePct > 0)) stretch = 'none';
    // A plain "stretchy" over under 3% elastane is a knit's give, not a stretch fabric: a little stretch.
    else if ((elastanePct != null && elastanePct < 3 ? RE.highNamed : RE.high).test(t) || (elastanePct != null && elastanePct >= 3)) stretch = 'high';
    else if (RE.slight.test(t) || (elastanePct != null && elastanePct > 0)) stretch = 'slight';
    else if (RE.cotton100.test(t)) stretch = 'none';

    const small = RE.small.test(t);
    const large = RE.large.test(t);
    // A note about one part of the body ("tight around the ankle", "narrow at the toes"): shown as the
    // fit note when there is no size note, though it moves nothing.
    // Page text is joined from many elements, so a button label can run into a sentence ("select a
    // size Designed to be fitted…"): a fragment that starts in lower case and runs into a capital
    // starts at the capital.
    // A product card or a details list is no note: Express's "2 out of 5 stars … Wide Leg Jumpsuit",
    // Old Navy's "Product #908485 Size & fit …", a price. Nor is the product's own name: Nike's "…
  // Tight Off-Shoulder Long-Sleeve Top".
    const NOT_A_NOTE = /\bout of 5 stars?\b|\bproduct #|[$£€]\s?\d/i;
    const sentenceOf = (x) => x.replace(/^[a-z][^A-Z]*?\s(?=[A-Z][a-z])/, '');
    const fitDetail = small || large || RE.tts.test(t) ? null
      : (t.split(/[.!?\n]+/).map((x) => sentenceOf(x.trim())).find((x) => x.length <= 160 && RE.fitWord.test(x) && RE.fitArea.test(x) && !NOT_A_NOTE.test(x) && x !== String(title || '').trim()) || null);
    const modelSize = (t.match(RE.model) || [])[1];
    const ft = t.match(RE.modelHeightFt);
    const modelHeight = (t.match(RE.modelHeight) || [])[1] || (ft ? Math.round((+ft[1] * 12 + +ft[2]) * 2.54) : null);
    return {
      fitNote: small && !large ? 'small' : large && !small ? 'large' : RE.tts.test(t) ? 'tts' : null,
      fitNoteText: ((t.match(small && !large ? RE.small : large && !small ? RE.large : RE.tts) || [])[0] || '').trim(),
      fitDetail,
      stretch,
      elastanePct,
      cotton100: RE.cotton100.test(t),
      skinny: RE.skinny.test(t),
      roomy: RE.roomy.test(t),
      bottoms: RE.bottoms.test(t),
      modelSize: modelSize ? modelSize.trim() : null,
      modelHeight: modelHeight ? +modelHeight : null,
    };
  }

  // ---- what buyers say ------------------------------------------------------

  const REVIEW_PCT = /(\d{1,3})\s?%[^.%\d]{0,40}?(runs?\s+small|too\s+small|\bsmall\b|true\s+to\s+size|as\s+expected|runs?\s+large|too\s+large|\blarge\b|\bbig\b)/gi;
  const REVIEW_COUNT = /(\d[\d,.]*)\s+(?:reviews?|ratings?|bewertungen|avis|reseñas|recensioni)/i;

  // The reviews on this page: one vote each, or the shop's own fit bar ("68% say it runs small") as counts.
  function localReviews(reviews, summary) {
    const out = { small: 0, large: 0, tts: 0, total: 0, fromSummary: false };
    for (const text of reviews || []) {
      const t = String(text || '');
      if (!t.trim()) continue;
      out.total += 1;
      const small = RE.small.test(t);
      const large = RE.large.test(t);
      if (small && !large) out.small += 1;
      else if (large && !small) out.large += 1;
      else if (RE.tts.test(t)) out.tts += 1;
    }
    if (!summary) return out;
    const pct = { small: 0, large: 0, tts: 0 };
    for (const m of String(summary).matchAll(REVIEW_PCT)) {
      const kind = /small/i.test(m[2]) ? 'small' : /large|big/i.test(m[2]) ? 'large' : 'tts';
      pct[kind] = Math.max(pct[kind], Math.min(100, +m[1]));
    }
    // A labelled slider with no numbers ("Fit is Runs Small", ASOS) is read as a lean, not a landslide.
    const lean = String(summary).match(/fit is (between|runs small|runs large|true to size|too small|too large)/i);
    const slider = !(pct.small || pct.large || pct.tts) && !!lean;
    if (slider) {
      const kind = /small/i.test(lean[1]) ? 'small' : /large/i.test(lean[1]) ? 'large' : 'tts';
      pct[kind] = kind === 'tts' ? 70 : 65;
    }
    if (!(pct.small || pct.large || pct.tts)) return out;
    // Votes are spread over the stated count, or over 100 when the shop gives none. The total stays
    // the stated count (0 without one), so an invented figure is never shown or sent to the pool.
    const count = (String(summary).match(REVIEW_COUNT) || [])[1];
    const total = count ? parseInt(count.replace(/[,.]/g, ''), 10) : 0;
    const base = total || 100;
    const share = (p) => Math.round((p / 100) * base);
    return { small: share(pct.small), large: share(pct.large), tts: share(pct.tts), total, fromSummary: true, pct: slider ? null : pct };
  }

  // This page's reviews plus what Sizer users read on other shops for the same style, pooled as one tally.
  function analyzeReviews(reviews, summary, pool) {
    const local = localReviews(reviews, summary);
    const out = { ...local, local, vendors: 0, mentions: 0, share: 0, verdict: null };
    if (pool && pool.total) {
      out.small += pool.small || 0;
      out.large += pool.large || 0;
      out.tts += pool.tts || 0;
      out.total += pool.total || 0;
      out.vendors = pool.vendors || 0;
    }
    out.mentions = out.small + out.large + out.tts;
    if (out.small >= 2 && out.small > out.large && out.small / out.mentions >= 0.5) { out.verdict = 'small'; out.share = out.small / out.mentions; }
    else if (out.large >= 2 && out.large > out.small && out.large / out.mentions >= 0.5) { out.verdict = 'large'; out.share = out.large / out.mentions; }
    else if (out.tts >= 2 && out.tts / out.mentions >= 0.6) { out.verdict = 'tts'; out.share = out.tts / out.mentions; }
    return out;
  }

  const VERDICT_WORDS = { small: 'runs small', large: 'runs large', tts: 'fits true to size' };

  function reviewReason(rv) {
    const what = VERDICT_WORDS[rv.verdict];
    if (rv.weighted && rv.weighted.verdict === rv.verdict) {
      return rv.weighted.similar ? `${rv.weighted.similar} reviewer${rv.weighted.similar === 1 ? '' : 's'} about your height and shape say${rv.weighted.similar === 1 ? 's' : ''} it ${what}.`
        : `Reviewers, weighted by how like you they are, say it ${what}.`;
    }
    const shopCount = rv.vendors + (rv.local.total ? 1 : 0);
    const shops = rv.vendors ? `, ${shopCount === 1 ? 'on one shop' : `across ${shopCount} shops`}` : '';
    if (rv.fromSummary && !rv.vendors) {
      // The shop's own figure, as the shop gave it; a slider with no numbers gets no numbers.
      const counted = rv.total ? `${rv.total} reviews` : '';
      if (!rv.pct) return `The shop’s review summary says it ${what}${counted ? ` (${counted})` : ''}.`;
      const basis = `${rv.pct[rv.verdict]}% of ${counted || 'reviews'}`;
      return rv.verdict === 'tts' ? `Buyers say it ${what} (${basis}).` : `Buyers say it ${what}: ${basis}.`;
    }
    const basis = `${rv[rv.verdict]} of ${rv.mentions} reviews that mention fit${shops}`;
    return rv.verdict === 'tts' ? `Buyers say it ${what} (${basis}).` : `Buyers say it ${what}: ${basis}.`;
  }

  // ---- what Sizer users who bought the brand said ---------------------------

  const LEARN_FROM = 10;

  // The brand's learned tendency for this kind of clothing, from the anonymous "did it fit?" outcomes
  // (brand_fit, downloaded with the charts): once ten outcomes are in and a clear share agree.
  function learnedFit(charts, names, kind) {
    const rows = charts && Array.isArray(charts.brandFit) ? charts.brandFit : [];
    const keys = new Set((names || []).map(norm).filter(Boolean));
    const row = rows.find((r) => r && r.kind === kind && keys.has(norm(r.brand_key)));
    if (!row || !(row.total >= LEARN_FROM)) return null;
    const { small = 0, large = 0, tts = 0, total } = row;
    if (small > large && small / total >= 0.5) return { verdict: 'small', count: small, total };
    if (large > small && large / total >= 0.5) return { verdict: 'large', count: large, total };
    if (tts / total >= 0.6) return { verdict: 'tts', count: tts, total };
    return null;
  }

  // Every name the brand goes by, so "RAG&BONE" on a shop finds the outcomes filed as "rag & bone".
  function brandNames(product, brand) {
    return [product.brand, brand && brand.name].concat((brand && brand.aliases) || []).filter(Boolean);
  }

  function learnedReason(l) {
    const who = l.count === l.total ? `${l.count}` : `${l.count} of ${l.total}`;
    return `${who} Sizer users who bought this brand say it ${VERDICT_WORDS[l.verdict]}.`;
  }

  // ---- where it will be tight or loose -------------------------------------

  const AREA_NAME = { bust: 'bust', chest: 'chest', waist: 'waist', hip: 'hips', shoulder: 'shoulders', inseam: 'leg', length: 'length', sleeve: 'sleeves', foot: 'foot' };
  const AREA_TEXT = { tight: 'May be tight at the', close: 'Close fit at the', roomy: 'Roomy at the', fine: 'Fine at the' };
  const AREA_ORDER = ['tight', 'short', 'long', 'close', 'roomy', 'fine'];
  const REVIEW_VERDICT = { tight: 'tight', loose: 'roomy', long: 'long', short: 'short' };

  // Each measured area against the row of the size picked (body cm, or garment cm when sizing garment
  // to garment): over the row by the fabric's tolerance is tight, a little over is close, well under
  // is roomy. Then what reviewers like you say about particular areas. Most important first. Bottoms
  // cover no bust, shoulders or sleeves, so those are never named for trousers or a skirt.
  const UPPER_AREAS = ['bust', 'shoulder', 'sleeve'];
  function fitAreas(have, row, stretch, weighted, kind) {
    const tightFrom = stretch === 'none' ? 1.5 : stretch === 'high' ? 3.5 : 2.5;
    // Bottoms say nothing above the waist, and a top nothing about the waist or hips it does not size on.
    const covers = (area) => (kind === 'bottoms' ? !UPPER_AREAS.includes(area) : kind === 'tops' ? area !== 'waist' && area !== 'hip' : true);
    const out = [];
    for (const area of ['bust', 'waist', 'hip', 'shoulder']) {
      if (!covers(area) || have[area] == null || typeof row[area] !== 'number') continue;
      const d = have[area] - row[area];
      const verdict = d >= tightFrom ? 'tight' : d >= 1 ? 'close' : d <= -4 ? 'roomy' : 'fine';
      out.push({ area, verdict, source: 'chart', text: `${AREA_TEXT[verdict]} ${AREA_NAME[area]}` });
    }
    for (const a of ((weighted && weighted.areas) || []).filter((x) => covers(x.area))) {
      const verdict = REVIEW_VERDICT[a.direction];
      const where = ['inseam', 'length', 'sleeve'].includes(a.area) ? 'in the' : 'at the';
      out.push({ area: a.area, verdict, source: 'reviews', text: `${a.count} reviewers like you found it ${verdict} ${where} ${AREA_NAME[a.area] || a.area}` });
    }
    return out.sort((a, b) => AREA_ORDER.indexOf(a.verdict) - AREA_ORDER.indexOf(b.verdict));
  }

  // Area mentions in this page's reviews, one per review and unweighted, for the fit-dossier request:
  // the anonymous tally the page already holds, never shaped by the profile.
  function tallyAreas(details) {
    const seen = new Map();
    for (const d of details || []) {
      for (const a of d.areas || []) {
        const k = `${a.area}|${a.direction}`;
        const cur = seen.get(k) || { area: a.area, direction: a.direction, count: 0 };
        cur.count += 1;
        seen.set(k, cur);
      }
    }
    return [...seen.values()];
  }

  // ---- what others say online (the fit dossier) -----------------------------

  const WEB_AREAS = ['bust', 'chest', 'waist', 'hip', 'length', 'inseam', 'shoulder', 'sleeve', 'foot'];
  const WEB_STRENGTH = 0.6;

  // Only a web address is ever listed or linked; the title falls back to the host.
  function webSource(s) {
    if (!s || typeof s.url !== 'string') return null;
    const url = s.url.trim();
    if (!/^https?:\/\//i.test(url)) return null;
    let host;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      host = u.hostname.replace(/^www\./, '');
    } catch { return null; }
    const title = typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 200) : host;
    return { url, title };
  }

  // The dossier the page was handed, held to its shape. With no web source left it says nothing.
  function webDossier(d) {
    if (!d || typeof d !== 'object') return null;
    const sources = (Array.isArray(d.sources) ? d.sources : []).map(webSource).filter(Boolean).slice(0, 8);
    if (!sources.length) return null;
    const verdict = VERDICT_WORDS[d.verdict] ? d.verdict : null;
    const strength = verdict && typeof d.strength === 'number' && isFinite(d.strength) ? Math.max(0, Math.min(1, d.strength)) : 0;
    const areas = (Array.isArray(d.areas) ? d.areas : []).filter((a) => a && WEB_AREAS.includes(a.area) && REVIEW_VERDICT[a.direction]);
    const brandNote = typeof d.brand_note === 'string' && d.brand_note.trim() ? d.brand_note.trim().slice(0, 200) : null;
    if (!verdict && !areas.length && !brandNote) return null;
    return { verdict, strength, areas, brand_note: brandNote, sources };
  }

  // One step, and only when nothing on the page has already decided: no fit note, no review verdict.
  function webMoveFor(web, held) {
    if (!web || held || web.strength < WEB_STRENGTH) return 0;
    return web.verdict === 'small' ? 1 : web.verdict === 'large' ? -1 : 0;
  }

  // held: what already decided, { by: 'page' | 'reviews', verdict }, or null.
  function webReason(web, move, held) {
    const n = web.sources.length;
    const count = `${n} source${n === 1 ? '' : 's'}`;
    const what = VERDICT_WORDS[web.verdict];
    if (move) return `Others online say it ${what} (${count}), so one size ${move > 0 ? 'up' : 'down'}.`;
    if (!web.verdict) return `Sizer also read what others online say about the fit (${count}).`;
    if (web.verdict === 'tts') return `Others online say it fits true to size (${count}).`;
    if (web.strength < WEB_STRENGTH) return `Others online lean towards it running ${web.verdict} (${count}), not clearly enough to move the size.`;
    if (held && held.verdict === web.verdict) return `Others online also say it ${what} (${count}).`;
    return `Others online say it ${what} (${count}), but what ${held && held.by === 'reviews' ? 'reviewers say' : 'this page says'} comes first.`;
  }

  const webHeadline = (move) => (move > 0 ? 'Others online say it runs small, sized up' : 'Others online say it runs large, sized down');

  // The dossier's areas beside the chart's and the reviewers', unless reviewers like you said the same.
  function withWebAreas(areas, web, kind) {
    const out = areas.slice();
    for (const a of (web ? web.areas : []).filter((x) => kind !== 'bottoms' || !UPPER_AREAS.includes(x.area))) {
      const verdict = REVIEW_VERDICT[a.direction];
      if (out.some((x) => (x.source === 'reviews' || x.source === 'web') && x.area === a.area && x.verdict === verdict)) continue;
      const text = a.area === 'length' ? `Others online find it ${a.direction} overall`
        : `Others online find it ${a.direction} ${a.area === 'foot' ? 'across the' : ['inseam', 'sleeve'].includes(a.area) ? 'in the' : 'at the'} ${AREA_NAME[a.area] || a.area}`;
      out.push({ area: a.area, verdict, source: 'web', text });
    }
    return out.sort((a, b) => AREA_ORDER.indexOf(a.verdict) - AREA_ORDER.indexOf(b.verdict));
  }

  const webResult = (web, move) => ({ verdict: web.verdict, strength: web.strength, moved: move, brand_note: web.brand_note, sources: web.sources });

  // The one area worth a word on the line: a tight one, or nothing.
  function areaLine(r) {
    const a = ((r && r.areas) || []).find((x) => x.verdict === 'tight');
    return a ? a.text : null;
  }

  // What the sheet lists: up to three areas that are not simply fine, else one line saying all are.
  function sheetAreas(r) {
    const areas = (r && r.areas) || [];
    const notable = areas.filter((a) => a.verdict !== 'fine').slice(0, 3).map((a) => a.text);
    if (notable.length || !areas.length) return notable;
    return [`Fits as expected at the ${joinNames(areas.map((a) => AREA_NAME[a.area] || a.area))}`];
  }

  // ---- the recommendation ------------------------------------------------

  // Fractional chart position where a body dimension lands (2.5 = halfway between sizes 2 and 3).
  function position(chart, key, v) {
    if (v <= chart[0][key]) return (v - chart[0][key]) / (chart[1][key] - chart[0][key]);
    for (let i = 0; i < chart.length - 1; i++) {
      const a = chart[i][key];
      const b = chart[i + 1][key];
      if (v <= b) return i + (v - a) / (b - a);
    }
    const n = chart.length - 1;
    return n + (v - chart[n][key]) / (chart[n][key] - chart[n - 1][key]);
  }

  const FIT_PREF = { snug: -0.3, regular: 0, relaxed: 0.4 };

  function joinNames(list) {
    return list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }

  // Where a fractional chart position lands, in words: "27", "27½", or "between 36 and 38".
  // A chart size in words, named by system where a bare number could be read several ways:
  // "EU 40", "between EU 40 and 42". A brand's own denim chart needs no tag ("rag & bone 26½"); the
  // standard one says W ("a standard W29").
  const SYSTEM_TAG = { eu: 'EU ', uk: 'UK ', us: 'US ', it: 'IT ' };
  function approxLabel(chart, system, pos, standard) {
    const tag = SYSTEM_TAG[system] || (system === 'denim' && standard ? 'W' : '');
    const i = Math.max(0, Math.min(chart.length - 1, Math.floor(pos)));
    const f = pos - Math.floor(pos);
    if (pos <= 0 || f < 0.25) return `${tag}${chart[i].label}`;
    if (f > 0.75 || i === chart.length - 1) return `${tag}${chart[Math.min(i + 1, chart.length - 1)].label}`;
    return system === 'denim' ? `${tag}${chart[i].label}½` : `between ${tag}${chart[i].label} and ${chart[i + 1].label}`;
  }

  // A chart that stops short of sizes the page sells, in the chart's own system, runs on to them at
  // the step of its last two rows (Abercrombie's ends at 37; the page sells 38). Not garment charts.
  function runOnToPage(chart, pageSizes, system) {
    if (!chart || chart.length < 2 || chart.some((r) => r.garment || typeof r.value !== 'number')) return chart;
    const values = pageSizes.filter((s) => s.parsed.system === system && typeof s.parsed.value === 'number').map((s) => s.parsed.value);
    const keys = ['waist', 'hip', 'bust', 'shoulder'].filter((k) => chart.every((r) => typeof r[k] === 'number'));
    const step = (a, b, v) => {
      const row = { label: String(v), value: v };
      for (const k of keys) row[k] = +(b[k] + ((b[k] - a[k]) / (b.value - a.value)) * (v - b.value)).toFixed(1);
      return row;
    };
    // Upward only: a chart can start late because a wrong row was dropped, and that row stays out.
    const last = chart[chart.length - 1];
    const above = values.filter((v) => v > last.value).sort((x, y) => x - y).map((v) => step(chart[chart.length - 2], last, v));
    return above.length ? [...chart, ...above] : chart;
  }

  // Which measurements size this kind of item on this chart. Bottoms run on waist and hip; tops on
  // the bust; dresses on bust, waist and hip; outerwear on bust and shoulder. Each needs the body
  // value and a number in every row of the chart, else it falls back to waist and hip.
  function sizingKeys(kind, have, rows) {
    const ok = (k) => have[k] != null && rows.every((r) => r && typeof r[k] === 'number');
    const wh = ok('waist') && ok('hip') ? ['waist', 'hip'] : [];
    if (kind === 'bottoms' || !ok('bust')) return wh;
    if (kind === 'tops') return ['bust'];
    if (kind === 'dresses') return ['bust', ...wh];
    if (kind === 'outerwear') return ok('shoulder') ? ['bust', 'shoulder'] : ['bust'];
    return wh;
  }

  // Where the body lands on the chart. Too small is the worse failure, so waist and hip lean on the
  // larger of the two, and nothing ends up smaller than the bust or shoulders allow.
  function basePosition(rows, have, keys, rigid) {
    const at = (k) => position(rows, k, have[k]);
    const lower = keys.filter((k) => k === 'waist' || k === 'hip').map(at);
    const upper = keys.filter((k) => k === 'bust' || k === 'shoulder').map(at);
    const parts = [...upper];
    if (lower.length) parts.push(rigid ? Math.max(...lower) : 0.4 * Math.min(...lower) + 0.6 * Math.max(...lower));
    return Math.max(...parts);
  }

  // A piece you own from this brand, of this kind of clothing: the brand's own cut already shows in
  // it, so it names the size here before any measurement or standard chart does.
  const OWNED_STEP = { tight: 1, perfect: 0, loose: -1 };
  const OWNED_NOUN = { jeans: 'jeans', trousers: 'trousers', shorts: 'shorts', skirt: 'skirt', top: 'top', dress: 'dress', jacket: 'jacket' };
  const PAIR_NOUN = ['jeans', 'trousers', 'shorts'];
  function ownedSentence(owned) {
    const noun = OWNED_NOUN[owned.a.type];
    const pair = PAIR_NOUN.includes(owned.a.type);
    const verb = { tight: pair ? 'are a bit tight' : 'is a bit tight', perfect: pair ? 'fit' : 'fits', loose: pair ? 'are a bit loose' : 'is a bit loose' }[owned.fit];
    const step = { tight: 'one size up', perfect: 'the same size', loose: 'one size down' }[owned.fit];
    return `Your ${owned.name} ${noun} ${verb}, so ${step}.`;
  }
  function ownedPiece(profile, product, brand, kind, charts) {
    const names = new Set(brandNames(product, brand).map(norm).filter(Boolean));
    if (!names.size) return null;
    for (const a of profile.anchors || []) {
      if (!a.brand || a.brand.startsWith('generic') || KIND_OF_TYPE[a.type] !== kind || OWNED_STEP[a.fit || 'perfect'] == null) continue;
      const own = anchorBrand(a, charts);
      if (!names.has(norm(a.brand)) && !(own && brand && own.id && own.id === brand.id)) continue;
      let parsed = parseSizeLabel(a.size);
      if (!parsed) continue;
      if (parsed.system === 'number') parsed = { ...parsed, system: anchorNumberSystem(a, brand, parsed.value) };
      return { a, parsed, fit: a.fit || 'perfect', name: anchorName(a, own || brand, parsed) };
    }
    return null;
  }

  const PREF_WORDS = { relaxed: 'You like a little room.', snug: 'You like a close fit.' };
  const KIND_WORDS = { bottoms: 'bottoms', tops: 'tops', dresses: 'dresses', outerwear: 'coats and jackets' };

  function recommend(profile, product, charts) {
    const kind = productKind(product);
    const signals = analyzeText(`${product.title || ''}\n${product.text || ''}`, product.title);
    let reviews = analyzeReviews(product.reviews, product.reviewSummary, product.poolFit);
    const found = findBrand(product.brand, charts, kind) || findBrand(product.title, charts, kind);
    if (RE.giftCard.test(product.title || '')) return { ok: false, reason: 'This is a gift card, so there is no size to pick.' };
    // Old Navy and M&S sell children's clothes on the same pages, sized by age. A boyfriend jean or a
    // baby tee is a women's style: only "for boys", "girls'", "toddler" or a kids section count.
    if (RE.kidsTitle.test(product.title || '') || RE.kidsSection.test(product.section || '')) return { ok: false, reason: 'Sizer sizes adults’ clothes and shoes, not children’s.' };
    if (kind === 'shoes') return recommendShoes(profile, product, found, signals, charts, reviews);
    // "Bra-free" and "with built-in bra" describe a dress or a jumpsuit, not a bra.
    if (RE.bra.test(String(product.title || '').replace(RE.notBra, ''))) return { ok: false, reason: 'Sizer doesn’t size bras yet: they need a band and a cup, which clothing charts don’t have.' };
    const title = String(product.title || '');
    const labels = (product.sizes || []).map((s) => parseLabel(s.label));
    if (labels.length && labels.every((p) => p && p.system === 'one')) return { ok: false, reason: 'This comes in one size, so there is no size to pick.' };
    const clothing = [RE.outerwear, RE.bottoms, RE.dress, RE.tops, RE.onePiece].some((re) => re.test(title));
    if (RE.accessory.test(title) && !clothing) {
      return { ok: false, reason: 'Sizer sizes clothes and shoes, not accessories like this one.' };
    }
    // M&S sells cupcakes on the same pages: no sizes and no garment named means nothing to size.
    if (!labels.length && !clothing) return { ok: false, reason: 'This page shows no sizes and does not look like clothing, so there is no size to pick.' };
    // Amazon sells kettles in 1.5L, cases by phone and duvets in King on the same pages: with no
    // garment named, options that are mostly not clothing sizes mean nothing to size.
    const sizeLike = labels.filter((p, i) => p && !RE.notSizeOption.test(String(product.sizes[i].label).trim())).length;
    if (labels.length && !clothing && sizeLike * 2 < labels.length) return { ok: false, reason: 'The options on this page are not clothing sizes, so there is no size to pick.' };
    // A men's item goes on a standard men's chart: the brand charts Sizer has are women's. It stands
    // in for the brand so the page's sizes are read on it.
    const men = forMen(product);
    const menSystem = men ? menChartFor(product, kind) : null;
    if (menSystem && menSystem.collar) return { ok: false, reason: 'This shirt is sized by collar, and Sizer doesn’t size by neck yet.' };
    // A brand known only for its jeans chart says nothing about its dresses or tops.
    const brand0 = men ? { id: 'men', name: 'a standard men’s', system: menSystem, sizes: MEN[menSystem], men: true }
      : found && found.system === 'denim' && kind !== 'bottoms' ? null : found;

    const body = bodyFromProfile(profile, charts);
    const needs = { ok: false, needsProfile: true, reason: 'Add your measurements or one piece you own, and Sizer will size this for you.' };
    if (!body) return needs;

    const pageSizes = men ? menSizes(product.sizes, menSystem) : resolveSizes(product.sizes || [], brand0 && brand0.system, ukShop(product));
    const pageSystem = dominantSystem(pageSizes);

    // A jeans waist chart only for bottoms: "jeans" elsewhere on a dress's page is a menu or a link.
    const chartSystem = brand0 ? brand0.system : pageSystem && GENERIC[pageSystem] ? pageSystem : TO_EU[pageSystem] ? 'eu' : kind === 'bottoms' && signals.bottoms ? 'denim' : 'eu';
    const chart = runOnToPage(brand0 ? brand0.sizes : GENERIC[chartSystem], pageSizes, chartSystem);
    const brand = brand0 && chart !== brand0.sizes ? { ...brand0, sizes: chart } : brand0;
    // The brand as the shopper knows it, with a chart of its own: not the men's stand-in.
    const named = brand && !brand.men ? brand : null;
    const chartName = brand ? brand.name : 'a standard';

    // A garment chart and a piece you measured flat: compare garment to garment, no body in between.
    const garmentRows = brand && brand.garment && chart.every((r) => r.garment) ? chart.map((r) => r.garment) : null;
    const reference = garmentRows ? garmentReference(profile, kind, charts) : null;
    const garmentKeys = reference ? sizingKeys(kind, reference.values, garmentRows) : [];
    const g2g = garmentKeys.length ? reference : null;
    const keys = g2g ? garmentKeys : sizingKeys(kind, body, chart);
    if (!keys.length) {
      return body.bust != null && body.waist == null
        ? { ...needs, reason: `${named ? `${named.name}’s` : 'This'} chart has no bust, so Sizer needs your waist and hip, or one piece you own.` }
        : needs;
    }

    const reasons = [];
    const rigid = signals.stretch === 'none';
    const owned = g2g || men ? null : ownedPiece(profile, product, brand, kind, charts);
    const ownedM = owned ? measure(owned.parsed, brand) : null;
    const ownedKeys = ownedM ? keys.filter((k) => typeof ownedM[k] === 'number') : [];
    const ownedPos = ownedKeys.length ? Math.round(ownedKeys.reduce((s, k) => s + position(chart, k, ownedM[k]), 0) / ownedKeys.length) + OWNED_STEP[owned.fit] : null;
    const mine = ownedPos != null;
    const base = mine ? ownedPos : g2g ? basePosition(garmentRows, g2g.values, keys, rigid) : basePosition(chart, body, keys, rigid);
    if (mine) {
      reasons.push({ text: ownedSentence(owned), delta: null });
    } else if (g2g) {
      reasons.push({ text: `Compared garment to garment with your ${joinNames(g2g.names)}: like ${chartName} ${approxLabel(chart, chartSystem, base, !named)}.`, delta: null });
    } else {
      const sources = sourcesFor(profile, body.points, keys);
      reasons.push({ text: `Your ${joinNames(sources)} fit${sources.length === 1 && !/measurements/.test(sources[0]) ? 's' : ''} like ${chartName} ${approxLabel(chart, chartSystem, base, !named)}.`, delta: null });
      if (brand && brand.garment) reasons.push({ text: `${brand.name} lists garment measurements, so Sizer allowed a little ease.`, delta: null });
    }

    // Reviewers who say their height or shape count by how like you they are; the plain count, which
    // is what the pool receives, stays in reviews.local.
    // A card counts only when it says something about the fit; a menu reading "Curvy jeans" does not.
    const details = (product.reviewCards || []).map(RD.parseReview).filter((d) => d.verdict || d.areas.length);
    const weighted = details.length ? RD.weightedVerdict(details, { height: body.height, waist: body.waist, hip: body.hip, weight: num(profile.weight) }) : null;
    if (weighted) reviews = { ...reviews, verdict: weighted.verdict, weighted };

    let adj = 0;
    // The page's own note comes first; buyers' reports count only when the page says nothing; what
    // others say online counts only when neither has spoken, true to size included.
    const pageNote = signals.fitNote === 'small' || signals.fitNote === 'large';
    const buyersNote = !pageNote && (reviews.verdict === 'small' || reviews.verdict === 'large');
    const web = webDossier(product.dossier);
    const held = signals.fitNote ? { by: 'page', verdict: signals.fitNote } : reviews.verdict ? { by: 'reviews', verdict: reviews.verdict } : null;
    const webMove = webMoveFor(web, held);
    // What Sizer users who bought the brand said counts only when the page, its reviews and what others
    // say online about this item have not moved it.
    const learned = !mine && !men && !signals.fitNote && !reviews.verdict && !webMove ? learnedFit(charts, brandNames(product, brand), kind) : null;
    const learnedNote = !!learned && (learned.verdict === 'small' || learned.verdict === 'large');
    const explicit = pageNote || buyersNote || !!webMove;
    const learnedStep = learnedNote ? (learned.verdict === 'small' ? 1 : -1) : 0;
    // No alternative size once something has moved it, the learned step included.
    const settled = explicit || learnedNote;
    const elastane = signals.elastanePct ? ` (${signals.elastanePct}% elastane)` : '';
    // The piece you own already carries the brand's cut and the fit you like, so neither moves it.
    if (mine) {
      // Only what this item says about itself moves it from there.
    } else if (rigid) {
      if (!explicit) adj += 0.35 + (signals.skinny ? 0.15 : 0);
      reasons.push({ text: `No stretch${signals.cotton100 ? ', 100% cotton' : ''}, so going up when in doubt.`, delta: null });
    } else if (signals.stretch === 'high') {
      adj -= 0.25;
      reasons.push({ text: `Lots of stretch${elastane}, so it gives and eases with wear.`, delta: null });
    } else if (signals.stretch === 'slight') {
      reasons.push({ text: `A little stretch${elastane}, so your usual fit.`, delta: null });
    }
    // The researched tendency stays when Sizer users' answers apply: those answers were given to
    // suggestions that already carried it, so the learned step corrects what is left.
    if (!mine && brand && brand.tendency && !explicit) {
      adj += brand.tendency;
      if (brand.note) reasons.push({ text: brand.note, delta: null });
    }
    // A preference set for this kind of clothing wins over the overall one.
    const ownPref = profile.fitByCategory && FIT_PREF[profile.fitByCategory[kind]] != null ? profile.fitByCategory[kind] : null;
    const prefName = ownPref || profile.fitPreference;
    const pref = mine ? 0 : FIT_PREF[prefName] || 0;
    if (pref) {
      adj += pref;
      reasons.push({ text: ownPref ? `${PREF_WORDS[prefName].replace(/\.$/, '')} in ${KIND_WORDS[kind]}.` : PREF_WORDS[prefName], delta: null });
    }
    if (num(profile.weight) != null) reasons.push({ text: 'Your weight is never used to pick a size.', delta: null });

    // Between two sizes, your rule wins; otherwise the fabric decides which way to round.
    const between = profile.betweenSizes === 'up' || profile.betweenSizes === 'down' ? profile.betweenSizes : null;
    const threshold = between === 'up' ? 0.25 : between === 'down' ? 0.75 : rigid ? 0.35 : signals.stretch === 'high' ? 0.65 : 0.5;
    const raw = base + adj;
    const frac = raw - Math.floor(raw);
    const roundedUp = frac >= threshold;
    let idx = Math.floor(raw) + (roundedUp ? 1 : 0);
    const usual = Math.floor(base) + (base - Math.floor(base) >= 0.5 ? 1 : 0);
    if (between && frac > 0.25 && frac < 0.75) reasons.push({ text: `Between two sizes, so the ${between === 'up' ? 'bigger' : 'smaller'} one, as you asked.`, delta: null });

    if (signals.fitNote === 'small') { idx += 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size up.`, delta: +1 }); }
    if (signals.fitNote === 'large') { idx -= 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size down.`, delta: -1 }); }
    if (signals.fitNote === 'tts') reasons.push({ text: 'The page says it fits true to size.', delta: null });
    if (buyersNote && reviews.verdict === 'small') { idx += 1; reasons.push({ text: reviewReason(reviews), delta: +1 }); }
    if (buyersNote && reviews.verdict === 'large') { idx -= 1; reasons.push({ text: reviewReason(reviews), delta: -1 }); }
    if (!pageNote && reviews.verdict === 'tts') reasons.push({ text: reviewReason(reviews), delta: null });
    if (web) { idx += webMove; reasons.push({ text: webReason(web, webMove, held), delta: webMove || null }); }
    if (learned) {
      idx += learnedStep;
      reasons.push({ text: learnedReason(learned), delta: learnedStep || null });
    }
    if (signals.roomy) reasons.push({ text: 'Relaxed cut, roomy by design. Go one down only if you want it closer.', delta: null });

    idx = Math.max(0, Math.min(chart.length - 1, idx));
    // More than half a size past either end of the chart: the end size is the closest it has, not a fit.
    const past = base > chart.length - 0.5 ? 'up' : base < -0.5 ? 'down' : null;
    if (past === 'up') reasons.push({ text: `Your measurements are past the largest size on ${named ? `${named.name}’s` : 'this'} chart, so this is the closest it has.`, delta: null });
    if (past === 'down') reasons.push({ text: `Your measurements are under the smallest size on ${named ? `${named.name}’s` : 'this'} chart, so this is the closest it has.`, delta: null });
    const altIdx = !settled && !past && frac > 0.25 && frac < 0.75 ? idx + (roundedUp ? -1 : 1) : null;

    const headline = past === 'up' ? 'Larger than this chart goes'
      : past === 'down' ? 'Smaller than this chart goes'
      : signals.fitNote === 'small' ? 'Runs small, sized up'
      : signals.fitNote === 'large' ? 'Runs large, sized down'
        : buyersNote && reviews.verdict === 'small' ? `${weighted ? 'Reviewers like you' : 'Buyers'} say it runs small, sized up`
          : buyersNote && reviews.verdict === 'large' ? `${weighted ? 'Reviewers like you' : 'Buyers'} say it runs large, sized down`
            : webMove ? webHeadline(webMove)
            : learnedNote ? `Sizer users say it ${VERDICT_WORDS[learned.verdict]}, sized ${learned.verdict === 'small' ? 'up' : 'down'}`
        : rigid && idx > usual ? 'No stretch, sized up'
          : signals.stretch === 'high' && idx < usual ? 'Stretchy, sized down'
            : idx > usual ? 'Sized up for you' : idx < usual ? 'Sized down for you' : 'Your usual fit';

    const inseam = body.inseam;
    const pick = chart[idx];
    const at = (m) => {
      const ks = keys.filter((k) => typeof m[k] === 'number');
      return ks.length ? ks.reduce((s, k) => s + position(chart, k, m[k]), 0) / ks.length : null;
    };
    // Labels that span two sizes (S/M, M/L) both hold an M: take the one nearest where you sit
    // between sizes, so a body between M and L gets M/L.
    const matched = matchPageSize(pick, pageSizes, brand, inseam, keys);
    const spans = pageSizes.filter((s) => s.parsed.span != null).map((s) => { const m = measure(s.parsed, brand); return { s, p: m ? at(m) : null }; }).filter((x) => x.p != null);
    const target = raw + (idx - (Math.floor(raw) + (roundedUp ? 1 : 0)));
    const nearSpan = matched && spans.some((x) => x.s.label === matched.label)
      ? spans.reduce((a, b) => (Math.abs(b.p - target) < Math.abs(a.p - target) - 0.01 || (Math.abs(b.p - target) <= Math.abs(a.p - target) + 0.01 && b.s.available !== false && a.s.available === false) ? b : a)).s
      : null;
    const pageMatch = nearSpan ? { label: nearSpan.label, available: nearSpan.available } : matched;
    const altRow = altIdx != null && altIdx >= 0 && altIdx < chart.length ? chart[altIdx] : null;
    const altMatch = altRow ? matchPageSize(altRow, pageSizes, brand, inseam, keys) : null;
    // No "38, or 38": an alternative the page can only offer as the same size is no alternative.
    const alt = altRow && !(altMatch && pageMatch && altMatch.label === pageMatch.label) ? altRow : null;
    if (body.inseamGuess && pageSizes.some((s) => s.parsed.length)) {
      reasons.push({ text: `Leg length is a guess from your height, about ${Math.round(inseam)} in. Add your inseam to be sure.`, delta: null });
    }
    // Sold out, or not a size this page offers at all: the nearest it does have in stock.
    const notOffered = !pageMatch && pageSizes.length > 0;
    const posOf = (s) => { const m = measure(s.parsed, brand); return m ? at(m) : null; };
    // Steps count from the size the answer names: the page's 32 standing in for a W33 it lacks.
    const shown = pageMatch && pageSizes.find((s) => s.label === pageMatch.label);
    const from = (shown && posOf(shown)) ?? at(pick);
    // Sold out in 34W / 30L with 34W / 32L in stock: the same waist in another leg comes first.
    const otherLeg = pageMatch && pageMatch.available === false && shown ? otherLegInStock(shown, pageSizes) : null;
    const inStock = otherLeg || ((pageMatch && pageMatch.available === false) || notOffered
      ? nearestInStock(from, pageSizes, posOf, rigid)
      : null);
    // A size the page doesn't list is still named the way the page names its sizes: a US 8 among US
    // numbers, not the chart's EU 40.
    // A page that writes "UK 18" gets "UK 4", not a bare 4.
    const pagePrefix = (() => {
      const l = pageSizes.find((s) => s.parsed.system === pageSystem);
      const m = l && String(l.label).match(/^([A-Za-z]+ ?)\d/);
      return m ? m[1] : '';
    })();
    // A page that shows no sizes yet (Nordstrom loads them when the menu opens) gets the answer in
    // the shopper's own sizes: UK on a UK shop, else the region of the sizes in their profile.
    const ownSystem = pageSizes.length || men ? null : ukShop(product) ? 'uk' : profileRegion(profile);
    const nameIn = pageSystem || ownSystem;
    const prefix = pageSystem ? pagePrefix : ownSystem ? `${ownSystem.toUpperCase()} ` : '';
    const inPageSystem = (entry) => {
      const v = nameIn && nameIn !== chartSystem ? convertSize(entry.value, chartSystem, nameIn) : null;
      return v != null ? `${prefix}${v}` : displayLabel(entry, chartSystem, brand);
    };
    const size = pageMatch ? pageMatch.label : inPageSystem(pick);
    // Past every size the page has, either way: name the end it stops at.
    const placed = notOffered ? pageSizes.map((s) => { const m = measure(s.parsed, brand); return { s, p: m ? at(m) : null }; }).filter((x) => x.p != null) : [];
    const here = at(pick);
    const edge = placed.length && here != null && placed.every((x) => x.p < here - 0.5) ? { dir: 'largest', label: placed.reduce((a, b) => (b.p > a.p ? b : a)).s.label }
      : placed.length && here != null && placed.every((x) => x.p > here + 0.5) ? { dir: 'smallest', label: placed.reduce((a, b) => (b.p < a.p ? b : a)).s.label }
        : null;
    const stockText = notOffered ? notOfferedText(size, inStock, pageSizes, edge)
      : pageMatch && pageMatch.available === false ? inStockText(size, inStock) : null;
    const areas = withWebAreas(fitAreas(g2g ? g2g.values : body, g2g ? garmentRows[idx] : pick, signals.stretch, weighted, kind), web, kind);

    let score = 0.4;
    if (named) score += 0.2 - tierPenalty(named);
    else if (mine) score += 0.2;
    if (signals.stretch !== 'unknown') score += 0.15;
    if (signals.fitNote) score += 0.1;
    if (reviews.verdict || learned) score += 0.1;
    const corroborated = !!g2g || body.points.length > 1 || keys.every((k) => num(profile[k]) != null);
    if (corroborated) score += 0.1;
    if (body.spread > 5) score -= 0.15;
    // Clothing sized on waist and hip alone is surest for bottoms; a top sized on the bust is not penalised.
    if (!signals.bottoms && !keys.includes('bust')) score -= 0.1;
    const confidence = score >= 0.75 ? 'High' : score >= 0.55 ? 'Medium' : 'Low';
    const firmUp = mine ? null : men ? 'There’s no men’s size chart for this brand yet, so this uses a standard one.' : !brand ? 'There’s no size chart for this brand yet, so this uses a standard one.'
      : tierCaveat(brand) ? tierCaveat(brand)
      : body.spread > 5 ? 'Some of your sizes disagree. Check them in your fit profile.'
        : !corroborated ? 'Add another piece you own to firm this up.'
          : signals.stretch === 'unknown' ? 'The page doesn’t say how stretchy this is.'
            : null;

    return {
      ok: true,
      size,
      matchedOnPage: !!pageMatch,
      available: pageMatch ? pageMatch.available !== false : null,
      inStock,
      stockText,
      alternative: alt ? { size: altMatch ? altMatch.label : inPageSystem(alt), why: altIdx > idx ? 'if you like more room' : 'if you like a closer fit' } : null,
      headline,
      confidence,
      score,
      firmUp,
      brand: named ? named.name : product.brand || null,
      brandKnown: !!named,
      guide: named ? named.guide || null : null,
      source: named && named.source ? named.source : null,
      reasons,
      signals,
      reviews,
      body,
      areas,
      reviewAreas: tallyAreas(details),
      ...(web ? { dossier: webResult(web, webMove) } : {}),
      kind,
      sizedOn: keys,
      garmentToGarment: !!g2g,
      // Where the pick sits on the chart it was read from, for placeLabel.
      learnedStep,
      pickIndex: idx,
      pickLabel: displayLabel(pick, chartSystem, brand),
      chartSystem,
    };
  }

  // ---- one labelled size, as on a second-hand listing ------------------------

  // How many sizes a single label sits from the size Sizer picks for you on the same chart: 0 is
  // your size, below 0 smaller, above 0 bigger. The label is the only size on offer, so it settles
  // which system the chart is read in; the pick still comes from your profile, the brand's chart,
  // its reputation and any pooled reviews. Null steps when there is no answer or no label to place.
  function placeLabel(profile, product, charts) {
    const label = String((product && product.label) || '').trim();
    const result = recommend(profile, { ...product, sizes: label ? [{ label, available: true }] : [] }, charts);
    const kind = kindOf(product && product.title);
    // A men's piece is placed on the men's chart recommend used; the brand's charts are women's.
    const men = forMen(product);
    const brand = men ? null : findBrand(product && product.brand, charts, kind) || findBrand(product && product.title, charts, kind);
    // The brand's reputation, for the sheet, whether or not it moved the pick.
    const brandNote = (brand && brand.note) || null;
    const done = (steps) => ({ result, steps, brandNote });
    if (!result.ok || !label || typeof result.pickIndex !== 'number') return done(null);
    if (men && !result.shoes) {
      const system = menChartFor({ sizes: [{ label }] }, productKind(product));
      const [s] = menSizes([{ label }], system);
      const stand = { system, sizes: runOnToPage(MEN[system], s ? [s] : [], system) };
      const at = s ? stand.sizes.indexOf(measure(s.parsed, stand)) : -1;
      return done(at < 0 ? null : at - result.pickIndex);
    }
    if (result.shoes) {
      const b = brand && brand.shoes ? brand : null;
      const rows = b ? b.sizes : men ? Charts.GENERIC_SHOES_MEN : Charts.GENERIC_SHOES;
      const [s] = resolveSizes([{ label }], 'eu', ukShop(product));
      const row = s && b && shoeRow(s.parsed, rows, b.system);
      if (b) return done(row ? rows.indexOf(row) - result.pickIndex : null);
      // On the standard chart a label is a foot length, counted in its own sizes: a UK or US size is 8.47 mm, an EU size 6.67 mm.
      const foot = s && Charts.SHOE_FOOT(s.parsed.system, s.parsed.value, men);
      const step = s && s.parsed.system === 'eu' ? 0.667 : 0.847;
      return done(foot == null ? null : Math.round((foot - rows[result.pickIndex].footMid) / step));
    }
    const chart = brand ? brand.sizes : GENERIC[result.chartSystem];
    const [s] = resolveSizes([{ label }], brand && brand.system, ukShop(product));
    const m = s && measure(s.parsed, brand);
    if (!m && chart && s && typeof s.parsed.value === 'number' && s.parsed.system === result.chartSystem) {
      // Beyond either end of the chart ("W54" on a chart that stops at 34): counted on past the last
      // row at the chart's own step between sizes.
      const values = chart.map((r) => r.value).filter((v) => typeof v === 'number');
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const step = values.length > 1 ? (hi - lo) / (values.length - 1) : 1;
      if (values.length && s.parsed.value > hi) return done(chart.length - 1 - result.pickIndex + Math.ceil((s.parsed.value - hi) / step));
      if (values.length && s.parsed.value < lo) return done(-result.pickIndex - Math.ceil((lo - s.parsed.value) / step));
    }
    if (!m || !chart) return done(null);
    let at = chart.indexOf(m);
    if (at < 0) {
      const ks = [...new Set([...(result.sizedOn || []), 'waist', 'hip'])].filter((k) => typeof m[k] === 'number' && chart.every((r) => typeof r[k] === 'number'));
      if (!ks.length) return done(null);
      at = Math.round(ks.reduce((t, k) => t + position(chart, k, m[k]), 0) / ks.length);
    }
    return done(at - result.pickIndex);
  }

  // ---- where the chart came from -------------------------------------------

  const tierOfBrand = (brand) => (brand && brand.source && brand.source.tier) || 0;

  // A chart nobody has checked yet is one notch less sure; a shop's house chart is two.
  function tierPenalty(brand) {
    const tier = tierOfBrand(brand);
    return tier === 5 ? 0.2 : tier === 3 || tier === 4 ? 0.1 : 0;
  }

  // "revolve.com" → "Revolve": the shop as people name it, from the chart's retailer or its address.
  function shopName(source) {
    let host = source.retailer || '';
    if (!host && source.url) { try { host = new URL(source.url).hostname; } catch { host = ''; } }
    const label = host.replace(/^www\./, '').split('.')[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'the shop';
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  function tierCaveat(brand) {
    const tier = tierOfBrand(brand);
    if (tier === 3 || tier === 4) return 'This chart was read by machine and not yet checked by a person.';
    if (tier === 5) return `This is ${shopName(brand.source)}’s general chart, not ${brand.name}’s own.`;
    return null;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '';
  }

  // The Brand fact and the sheet footer for a result, worded by where its chart came from.
  // The footer is lead + an optional link + tail, so the page can make the link without parsing text.
  function provenance(r) {
    const name = r && r.brand;
    const plain = (lead) => ({ lead, link: null, url: null, tail: '' });
    if (!name) return { brandFact: 'Not found', footer: plain('Size charts are approximate.') };
    if (!r.brandKnown) return { brandFact: `${name}, no size chart yet`, footer: plain('Size charts are approximate.') };
    const s = r.source;
    if (!s || !s.url) return { brandFact: name, footer: plain(r.guide ? `Charts are approximate. Check the ${r.guide}.` : 'Size charts are approximate.') };
    const when = shortDate(s.retrievedOn);
    const shop = shopName(s);
    const unchecked = 'not yet checked by a person';
    // Machine-read charts carry addresses no person typed, so only a web address becomes a link.
    const url = /^https?:\/\//i.test(s.url) ? s.url : null;
    switch (s.tier) {
      case 2: return { brandFact: name, footer: { lead: 'Chart from ', link: `${name}’s size guide on ${shop}`, url, tail: when ? `, ${when}` : '' } };
      case 3: return { brandFact: `${name}, chart read by machine`, footer: { lead: 'Chart read from ', link: url ? hostOf(url) : 'an unlinked page', url, tail: when ? ` on ${when}, ${unchecked}` : `, ${unchecked}` } };
      case 4: return { brandFact: `${name}, chart read by machine`, footer: { lead: 'Chart read from ', link: `${name}’s guide on ${shop}`, url, tail: when ? `, ${when}, ${unchecked}` : `, ${unchecked}` } };
      case 5: return { brandFact: `${name}, using ${shop}’s general chart`, footer: { lead: '', link: `${shop}’s general size guide`, url, tail: `, not ${name}’s own${when ? `, ${when}` : ''}` } };
      default: return { brandFact: name, footer: { lead: 'Chart from ', link: `${name}’s size guide`, url, tail: when ? `, ${when}` : '' } };
    }
  }

  // ---- looking up a brand with no chart --------------------------------------

  const LOOKUP_TIMEOUT_MS = 6000;

  // The lookup a sized answer asks for: only when the brand has no chart at all, never to replace one.
  function lookupFor(r, product) {
    const brand = String((product && product.brand) || '').trim();
    // The charts a lookup finds are women's: a men's item does not wait for one.
    if (!r || !r.ok || r.brandKnown !== false || !brand || forMen(product)) return null;
    const kind = productKind(product);
    // The chart database files coats under tops.
    return { brand, kind: kind === 'outerwear' ? 'tops' : kind };
  }

  const lookingUpText = (brand) => `Looking up ${brand}’s size chart`;

  // ---- shoes: one dimension, read straight off the chart ---------------------

  const cm = (n) => String(+(+n).toFixed(1));

  // The region a shopper's own sizes are in, when they are all UK or all US: "US 10" in the profile.
  function profileRegion(profile) {
    const systems = new Set(((profile && profile.anchors) || []).map((a) => parseSizeLabel(a.size || '')).filter((p) => p && (p.system === 'us' || p.system === 'uk')).map((p) => p.system));
    return systems.size === 1 ? [...systems][0] : null;
  }

  // Bare shoe numbers on a page: EU from 30 up. Under 16 they are UK on a UK shop, else UK when the
  // list goes under 5 (women's US sizes rarely do), else US.
  function shoeNumberSystem(product) {
    const nums = (product.sizes || []).map((s) => parseSizeLabel(s.label)).filter((p) => p && p.system === 'number' && typeof p.value === 'number').map((p) => p.value);
    if (!nums.length || !nums.every((n) => n < 16)) return 'eu';
    if (ukShop(product)) return 'uk';
    return Math.min(...nums) < 5 ? 'uk' : 'us';
  }

  function recommendShoes(profile, product, found, signals, charts, reviews = analyzeReviews()) {
    const f = footFromProfile(profile, charts);
    if (!f) return { ok: false, needsProfile: true, reason: 'Add your foot length to your fit profile, and Sizer will size shoes for you.' };
    // Brand shoe charts are women's; a men's pair goes on the standard men's chart.
    const men = forMen(product);
    const brand = found && found.shoes && !men ? found : null;
    const rows = brand ? brand.sizes : men ? Charts.GENERIC_SHOES_MEN : Charts.GENERIC_SHOES;
    const system = brand ? brand.system : 'eu';
    const pageSizes = resolveSizes(product.sizes || [], shoeNumberSystem(product));

    const inRow = rows.find((r) => f.foot >= r.foot[0] && f.foot <= r.foot[1]);
    const pos = position(rows, 'footMid', f.foot);
    let idx = Math.max(0, Math.min(rows.length - 1, inRow ? rows.indexOf(inRow) : Math.round(pos)));
    const row = rows[idx];
    const reasons = [];
    const from = f.measured ? '' : `, going by your ${f.source}`;
    reasons.push({
      text: brand
        ? `Your foot is ${cm(f.foot)} cm${from}. On ${brand.name}’s chart that is ${row.label} (${cm(row.foot[0])} to ${cm(row.foot[1])} cm).`
        : `Your foot is ${cm(f.foot)} cm${from}, which is EU ${row.label} on a standard chart.`,
      delta: null,
    });

    const pageNote = signals.fitNote === 'small' || signals.fitNote === 'large';
    const buyersNote = !pageNote && (reviews.verdict === 'small' || reviews.verdict === 'large');
    const web = webDossier(product.dossier);
    const held = signals.fitNote ? { by: 'page', verdict: signals.fitNote } : reviews.verdict ? { by: 'reviews', verdict: reviews.verdict } : null;
    const webMove = webMoveFor(web, held);
    const learned = !signals.fitNote && !reviews.verdict && !webMove ? learnedFit(charts, brandNames(product, found), 'shoes') : null;
    const learnedNote = !!learned && (learned.verdict === 'small' || learned.verdict === 'large');
    const explicit = pageNote || buyersNote || !!webMove;
    const learnedStep = learnedNote ? (learned.verdict === 'small' ? 1 : -1) : 0;
    // No alternative size once something has moved it, the learned step included.
    const settled = explicit || learnedNote;
    let alt = null;
    if (!settled && inRow && f.foot >= row.foot[1] - 0.2 && idx < rows.length - 1) alt = { row: rows[idx + 1], why: 'if you like more room' };
    else if (!settled && inRow && f.foot <= row.foot[0] + 0.2 && idx > 0) alt = { row: rows[idx - 1], why: 'if you like a closer fit' };
    if (signals.fitNote === 'small') { idx += 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size up.`, delta: +1 }); }
    if (signals.fitNote === 'large') { idx -= 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size down.`, delta: -1 }); }
    if (signals.fitNote === 'tts') reasons.push({ text: 'The page says it fits true to size.', delta: null });
    if (buyersNote && reviews.verdict === 'small') { idx += 1; reasons.push({ text: reviewReason(reviews), delta: +1 }); }
    if (buyersNote && reviews.verdict === 'large') { idx -= 1; reasons.push({ text: reviewReason(reviews), delta: -1 }); }
    if (!pageNote && reviews.verdict === 'tts') reasons.push({ text: reviewReason(reviews), delta: null });
    if (web) { idx += webMove; reasons.push({ text: webReason(web, webMove, held), delta: webMove || null }); }
    if (learned) {
      idx += learnedStep;
      reasons.push({ text: learnedReason(learned), delta: learnedStep || null });
    }
    idx = Math.max(0, Math.min(rows.length - 1, idx));
    const pick = rows[idx];

    const matchOf = (r) => {
      // A range on the page (Moon Boot's "UK 3-5", "EU 37-38") holds every size inside it.
      const within = (p) => {
        if (!p.parsed || p.parsed.span == null) return false;
        const v = p.parsed.system === system ? r.value : r.aliases && +r.aliases[p.parsed.system];
        return typeof v === 'number' && !Number.isNaN(v) && v >= p.parsed.value && v < p.parsed.span + 1;
      };
      const s = pageSizes.find((p) => shoeRow(p.parsed, [r], system)) || pageSizes.find(within) || nearestFoot(r);
      return s ? { label: s.label, available: s.available } : null;
    };
    // On the standard chart, the page's size nearest the foot: up to half a size longer, or a hair
    // shorter, so a UK 8.5 foot gets the page's 9 and never a whole size too small.
    const pageFeet = brand ? [] : pageSizes.map((p) => ({ p, foot: Charts.SHOE_FOOT(p.parsed.system, p.parsed.value, men) })).filter((x) => x.foot != null);
    function nearestFoot(r) {
      const near = pageFeet.filter((x) => x.foot >= r.footMid - 0.2 && x.foot <= r.footMid + 0.45);
      if (!near.length) return null;
      return near.reduce((a, b) => {
        const da = Math.abs(a.foot - r.footMid);
        const db = Math.abs(b.foot - r.footMid);
        return db < da - 0.01 || (Math.abs(db - da) <= 0.01 && (b.foot > a.foot || (b.p.available !== false && a.p.available === false))) ? b : a;
      }).p;
    }
    const label = (r) => (system === 'eu' ? `EU ${r.label}` : r.label);
    // A size the page doesn't have is named the way the page names its sizes: UK 8.5 among UK numbers.
    const pageSystem = pageSizes.length && pageSizes.every((p) => p.parsed.system === pageSizes[0].parsed.system) ? pageSizes[0].parsed.system : null;
    const named = (r) => (!brand && (pageSystem === 'uk' || pageSystem === 'us') && r.aliases && r.aliases[pageSystem] ? `${pageSystem.toUpperCase()} ${r.aliases[pageSystem]}` : label(r));
    const pageMatch = matchOf(pick);
    const altMatch = alt ? matchOf(alt.row) : null;
    // Steps count the page's own buttons: Zalando's 7.5 beside a sold-out 8 is one size down, though
    // the standard chart has whole sizes only.
    const pageAt = pageMatch ? pageSizes.findIndex((s) => s.label === pageMatch.label) : -1;
    const inStock = pageMatch && pageMatch.available === false
      ? nearestInStock(pageAt, pageSizes, (s) => pageSizes.indexOf(s), true)
      : null;
    const size = pageMatch ? pageMatch.label : named(pick);
    // Past every size the page has, either way: name the end it stops at.
    const edge = !pageMatch && pageFeet.length && pageFeet.every((x) => x.foot < pick.footMid) ? { dir: 'largest', label: pageFeet.reduce((a, b) => (b.foot > a.foot ? b : a)).p.label }
      : !pageMatch && pageFeet.length && pageFeet.every((x) => x.foot > pick.footMid) ? { dir: 'smallest', label: pageFeet.reduce((a, b) => (b.foot < a.foot ? b : a)).p.label }
        : null;

    const headline = signals.fitNote === 'small' ? 'Runs small, sized up' : signals.fitNote === 'large' ? 'Runs large, sized down'
      : buyersNote && reviews.verdict === 'small' ? 'Buyers say it runs small, sized up'
        : buyersNote && reviews.verdict === 'large' ? 'Buyers say it runs large, sized down'
          : webMove ? webHeadline(webMove)
            : learnedNote ? `Sizer users say it ${VERDICT_WORDS[learned.verdict]}, sized ${learned.verdict === 'small' ? 'up' : 'down'}` : 'By your foot length';
    const LEVELS = ['Low', 'Medium', 'High'];
    const notches = !brand ? 0 : tierOfBrand(brand) === 5 ? 2 : tierPenalty(brand) ? 1 : 0;
    const confidence = !brand ? 'Low' : LEVELS[Math.max(0, (f.measured ? 2 : 1) - notches)];
    const firmUp = !brand ? `There’s no ${men ? 'men’s ' : ''}shoe chart for this brand yet, so this uses a standard EU chart.`
      : tierCaveat(brand) ? tierCaveat(brand)
      : !f.measured ? 'Add your foot length to firm this up.' : null;

    return {
      ok: true,
      size,
      matchedOnPage: !!pageMatch,
      available: pageMatch ? pageMatch.available !== false : null,
      inStock,
      stockText: pageMatch && pageMatch.available === false ? inStockText(size, inStock)
        : !pageMatch && pageFeet.length ? notOfferedText(size, null, pageSizes, edge) : null,
      alternative: alt ? { size: altMatch ? altMatch.label : named(alt.row), why: alt.why } : null,
      headline,
      confidence,
      firmUp,
      brand: brand ? brand.name : found ? found.name : product.brand || null,
      brandKnown: !!brand,
      guide: null,
      source: brand ? brand.source : null,
      reasons,
      signals,
      reviews,
      body: { foot: f.foot, footSource: f.source },
      shoes: true,
      ...(web ? { areas: withWebAreas([], web), dossier: webResult(web, webMove) } : {}),
      learnedStep,
      pickIndex: idx,
      pickLabel: label(pick),
    };
  }

  // In-stock sizes closest to the pick, counted in whole sizes; both directions when it's a tie.
  function nearestInStock(from, pageSizes, posOf, preferUp) {
    const options = [];
    for (const s of pageSizes) {
      if (s.available === false) continue;
      const p = posOf(s);
      if (p == null) continue;
      const steps = Math.round(p - from);
      if (steps !== 0 && Math.abs(steps) <= 2) options.push({ size: s.label, steps });
    }
    if (!options.length) return null;
    options.sort((x, y) => Math.abs(x.steps) - Math.abs(y.steps) || (preferUp ? y.steps - x.steps : x.steps - y.steps));
    const [best] = options;
    const other = options.find((o) => o.steps === -best.steps) || null;
    return { size: best.size, steps: best.steps, other };
  }

  const STEP_WORDS = { 1: 'one size up', 2: 'two sizes up', '-1': 'one size down', '-2': 'two sizes down' };

  // The same size in a leg up to two inches either way, nearest first.
  function otherLegInStock(shown, pageSizes) {
    const { system, value, length } = shown.parsed;
    if (!length) return null;
    const same = pageSizes.filter((s) => s.available !== false && s.parsed.system === system && s.parsed.value === value
      && s.parsed.length && s.parsed.length !== length && Math.abs(s.parsed.length - length) <= 2);
    if (!same.length) return null;
    const best = same.reduce((a, b) => (Math.abs(b.parsed.length - length) < Math.abs(a.parsed.length - length) ? b : a));
    return { size: best.label, steps: 0, leg: best.parsed.length > length ? 'longer' : 'shorter', same: system === 'denim' ? 'waist' : 'size', other: null };
  }

  function inStockText(size, inStock) {
    if (!inStock) return `Sold out in ${size}, and nothing close is in stock.`;
    if (inStock.leg) return `Sold out in ${size}. In stock: ${inStock.size}, the same ${inStock.same} with a ${inStock.leg} leg.`;
    const first = `${inStock.size}, ${STEP_WORDS[inStock.steps]}`;
    return inStock.other
      ? `Sold out in ${size}. In stock: ${first}, or ${inStock.other.size}, ${STEP_WORDS[inStock.other.steps]}.`
      : `Sold out in ${size}. Nearest in stock: ${first}.`;
  }

  // Your size is not one the page lists: the nearest it has in stock, or what it lists.
  function notOfferedText(size, near, pageSizes, edge) {
    const first = near && `${near.size}, ${STEP_WORDS[near.steps]}`;
    if (near && near.other) return `${size} is not offered on this page. In stock: ${first}, or ${near.other.size}, ${STEP_WORDS[near.other.steps]}.`;
    if (near) return `${size} is not offered on this page. Nearest in stock: ${first}.`;
    if (edge) return `${size} is not offered on this page: the ${edge.dir} here is ${edge.label}.`;
    const labels = pageSizes.slice(0, 8).map((s) => s.label);
    return `${size} is not offered on this page, which lists ${labels.join(', ')}${pageSizes.length > 8 ? ' and more' : ''}.`;
  }

  function displayLabel(entry, system, brand) {
    if (system === 'denim') return `W${entry.label}`;
    const letter = brand && brand.letters ? brand.letters[entry.value] : entry.aliases && entry.aliases.letter;
    if (system === 'eu') return `EU ${entry.label}${letter ? ` (${letter})` : ''}`;
    return entry.label;
  }

  // The page's size nearest the chart row picked, over the measurements that sized it; inseam settles lengths.
  function matchPageSize(target, pageSizes, brand, inseam, keys = ['waist', 'hip']) {
    let best = null;
    for (const s of pageSizes) {
      const m = measure(s.parsed, brand);
      if (!m) continue;
      let ks = keys.filter((k) => typeof m[k] === 'number' && typeof target[k] === 'number');
      if (!ks.length) ks = ['waist', 'hip'].filter((k) => typeof m[k] === 'number' && typeof target[k] === 'number');
      if (!ks.length) continue;
      let d = ks.reduce((sum, k) => sum + Math.abs(m[k] - target[k]), 0) * (2 / ks.length);
      if (inseam && s.parsed.length) d += Math.abs(s.parsed.length - inseam) * 0.5;
      if (!best || d < best.d - 0.01 || (Math.abs(d - best.d) <= 0.01 && s.available !== false && best.s.available === false)) best = { s, d };
    }
    return best && best.d < 6 ? { label: best.s.label, available: best.s.available } : null;
  }

  const api = { recommend, learnedFit, analyzeText, analyzeReviews, parseSizeLabel, convertSize, findBrand, bodyFromProfile, disagreeing, resolveSizes, explainAnchor, kindOf, provenance, lookupFor, lookingUpText, LOOKUP_TIMEOUT_MS, areaLine, sheetAreas, placeLabel };
  root.SizerEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
