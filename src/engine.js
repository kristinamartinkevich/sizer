// Turns a shopper profile + a product page into one size recommendation with reasons.
(function (root) {
  const { BRANDS, GENERIC, TO_EU } = root.SizerBrands || require('./brands.js');
  const Charts = root.SizerCharts || require('./charts.js');

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

  const LETTER_RE = /^(3XL|XXXL|XXL|2XL|XL|XXS|2XS|XS|S|M|L)(?![A-Z])/;
  const LETTER_CANON = { XXXL: '3XL', '2XL': 'XXL', '2XS': 'XXS' };

  function parseSizeLabel(raw) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!s || s.length > 24) return null;
    let m;
    if ((m = s.match(/^W\s?(\d{2})(?:\s?[\/X]?\s?L\s?(\d{2}))?\b/))) return { system: 'denim', value: +m[1], length: m[2] ? +m[2] : null, label: m[0] };
    if ((m = s.match(/^(\d{2})\s?[\/X]\s?(\d{2})\b/)) && +m[1] >= 22 && +m[1] <= 40 && +m[2] >= 26 && +m[2] <= 38) return { system: 'denim', value: +m[1], length: +m[2], label: m[0] };
    // Half sizes are shoes: 38.5, EU 38½, UK 5.5.
    if ((m = s.match(/^(EU|FR|DE|UK|US)?\s?(\d{1,2})(?:[.,]5|\s?1\/2|½)(?![\d.,])/))) {
      const system = { EU: 'eu', FR: 'eu', DE: 'eu', UK: 'uk', US: 'us' }[m[1]] || 'number';
      return { system, value: +m[2] + 0.5, label: m[0] };
    }
    if ((m = s.match(/^(EU|FR|DE)\s?(\d{2})\b/))) return { system: 'eu', value: +m[2], label: m[0] };
    if ((m = s.match(/^IT\s?(\d{2})\b/))) return { system: 'it', value: +m[1], label: m[0] };
    if ((m = s.match(/^UK\s?(\d{1,2})\b/))) return { system: 'uk', value: +m[1], label: m[0] };
    if ((m = s.match(/^US\s?(00|\d{1,2})\b/))) return { system: 'us', value: m[1] === '00' ? '00' : +m[1], label: m[0] };
    if ((m = s.match(/^(00|\d{1,2})(?![\d.,])/))) return { system: 'number', value: m[1] === '00' ? '00' : +m[1], label: m[0] };
    if ((m = s.match(LETTER_RE))) return { system: 'letter', value: LETTER_CANON[m[1]] || m[1], label: m[0] };
    return null;
  }

  // Bare numbers are ambiguous (32 can be a denim waist or EU 32); settle them with context.
  function inferNumberSystem(values, hint) {
    if (hint === 'denim' || hint === 'eu' || hint === 'us') return hint;
    const nums = values.filter((v) => typeof v === 'number');
    if (!nums.length) return 'eu';
    if (nums.every((n) => n <= 24)) return 'us';
    if (nums.some((n) => n % 2 === 1) && nums.every((n) => n >= 22 && n <= 40)) return 'denim';
    if (nums.every((n) => n >= 30)) return 'eu';
    return 'denim';
  }

  function resolveSizes(labels, hint) {
    const parsed = labels.map((l) => ({ ...l, parsed: parseSizeLabel(l.label) })).filter((l) => l.parsed);
    const numSystem = inferNumberSystem(parsed.filter((l) => l.parsed.system === 'number').map((l) => l.parsed.value), hint);
    for (const l of parsed) if (l.parsed.system === 'number') l.parsed = { ...l.parsed, system: numSystem };
    return parsed;
  }

  function dominantSystem(parsed) {
    const count = {};
    for (const l of parsed) count[l.parsed.system] = (count[l.parsed.system] || 0) + 1;
    return Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
  }

  // Body measurements a size is cut for, using the brand's own chart when the systems match.
  function measure(parsed, brand) {
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
    if (TO_EU[sys]) return GENERIC.eu.find((x) => x.value === TO_EU[sys](parsed.value)) || null;
    return (GENERIC[sys] || []).find((x) => String(x.value) === String(parsed.value)) || null;
  }

  // ---- body estimate -----------------------------------------------------

  // A garment that feels tight means your body is a little bigger than its size, and the reverse.
  const FIT_SHIFT_CM = { tight: 1.5, perfect: 0, loose: -1.5 };
  const BOTTOMS = ['jeans', 'trousers', 'skirt', 'shorts'];

  const KIND_OF_TYPE = { jeans: 'bottoms', trousers: 'bottoms', skirt: 'bottoms', shorts: 'bottoms', top: 'tops', dress: 'dresses', shoes: 'shoes' };

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
    if (!row) return null;
    const label = brand ? brand.name : a.brand || 'shoes';
    return { foot: +(row.footMid + (FOOT_SHIFT_CM[a.fit] || 0)).toFixed(2), name: `${label} ${a.size}`, brand };
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
      const m = measure(parsed, brand);
      if (!m) continue;
      const shift = FIT_SHIFT_CM[a.fit] || 0;
      const name = brand ? brand.name : a.brand && !a.brand.startsWith('generic') ? a.brand : a.type || (a.brand === 'generic-denim' || parsed.system === 'denim' ? 'jeans' : 'size');
      points.push({ waist: m.waist + shift, hip: m.hip + shift, name: `${name} ${a.size}` });
    }
    return points;
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

  function bodyFromProfile(profile, charts) {
    const points = wardrobePoints(profile.anchors, charts);
    const avg = (k) => points.reduce((s, p) => s + p[k], 0) / points.length;
    const waist = profile.waist ? +profile.waist : points.length ? avg('waist') : null;
    const hip = profile.hip ? +profile.hip : points.length ? avg('hip') : null;
    const foot = footFromProfile(profile, charts);
    if (waist == null || hip == null) return foot ? { waist: null, hip: null, sources: [], spread: 0, points, foot: foot.foot, footSource: foot.source } : null;
    const spread = points.length ? Math.max(...points.map((p) => Math.abs(p.hip - hip) + Math.abs(p.waist - waist))) : 0;
    const sources = [];
    if (profile.waist && profile.hip) sources.push('measurements');
    else if (profile.waist) sources.push('your waist');
    else if (profile.hip) sources.push('your hip');
    if (!(profile.waist && profile.hip)) sources.push(...points.map((p) => p.name));
    return { waist, hip, sources, spread, points, foot: foot ? foot.foot : null, footSource: foot ? foot.source : null };
  }

  // ---- page text signals -------------------------------------------------

  const RE = {
    small: /runs?\s+small|fits?\s+small|(?:is\s+)?cut\s+small|small(?:er)?\s+than\s+(?:usual|normal|expected)|(?:order|choose|select|take|go|pick|buy)\s+(?:one|a|1)\s+size\s+(?:up|larger|bigger)|size\s+up\b|we\s+recommend\s+(?:sizing|going)\s+up|fällt\s+(?:eher\s+)?klein\s+aus|eine\s+größe\s+größer|taille\s+petit|prenez\s+une\s+taille\s+au-dessus|talla\s+pequeñ|veste\s+piccolo|valt\s+klein/i,
    large: /runs?\s+(?:large|big)|fits?\s+(?:large|big)|(?:is\s+)?cut\s+(?:large|generous)|large(?:r)?\s+than\s+(?:usual|normal)|(?:order|choose|select|take|go|pick)\s+(?:one|a|1)\s+size\s+(?:down|smaller)|size\s+down\b|we\s+recommend\s+(?:sizing|going)\s+down|fällt\s+(?:eher\s+)?groß\s+aus|eine\s+größe\s+kleiner|taille\s+grand|talla\s+grande|veste\s+grande|valt\s+groot/i,
    tts: /true\s+to\s+size|fits\s+true|normal\s+fit|fällt\s+normal\s+aus|größengerecht|taille\s+normalement/i,
    rigid: /no\s+stretch|non[-\s]?stretch|zero\s+stretch|without\s+stretch|rigid(?:\s+denim)?|ohne\s+stretch|kein(?:en)?\s+stretch|nicht\s+elastisch|sans\s+stretch|sin\s+elasticidad|stretch\s*:\s*(?:none|no)/i,
    slight: /slight\s+stretch|light\s+stretch|comfort\s+stretch|low\s+stretch|leichte[rn]?\s+stretch|wenig\s+stretch|stretch\s*:\s*(?:slight|light|low)/i,
    high: /super\s*[-\s]?stretch|high\s+stretch|power\s+stretch|ultra\s+stretch|very\s+stretchy|stretchy|sculpt|stretch\s*:\s*(?:high|very)/i,
    elastane: /(\d{1,2}(?:[.,]\d)?)\s*%\s*(?:elastane|elasthan|elastan|spandex|lycra|élasthanne|elastomultiester|elastomultiestere|elastolefin)/i,
    cotton100: /100\s*%\s*(?:organic\s+)?(?:cotton|baumwolle|coton|algodón|cotone|katoen)/i,
    skinny: /\b(?:skinny|slim|cigarette|super\s+tight)\b/i,
    roomy: /\b(?:oversize[d]?|relaxed|baggy|boyfriend|loose|barrel|balloon)\b/i,
    model: /model[^.]{0,40}?(?:wears?|wearing|is\s+wearing|trägt)[^.]{0,20}?(?:size|größe|grösse|taille)\s*:?\s*([A-Z]{0,2}\s?\d{0,2}(?:\s?\/\s?L?\d{2})?|[XSML]{1,3})/i,
    modelHeight: /(?:model'?s?\s+height|model\s+is|größe\s+des\s+models|modelgröße)[^.\d]{0,20}(\d{3})\s*cm/i,
    modelHeightFt: /model[^.\d]{0,30}?(\d)\s*['’]\s*(\d{1,2})/i,
    bottoms: /\b(?:jeans?|denim|trousers?|pants?|chinos?|skirts?|shorts|culottes?|leggings|hose|rock)\b/i,
    shoes: /\b(?:sneakers?|trainers?|shoes?|boots?|booties?|sandals?|heels?|loafers?|mules?|pumps?|espadrilles?|slides?|slippers?|ballerinas?|flats|clogs?|oxfords?|derby|derbies|brogues?|footwear|schuhe?|stiefel(?:etten)?|sandalen|chaussures?|bottes?|baskets|zapatos?|botas|scarpe|stivali)\b/i,
    dress: /\b(?:dress(?:es)?|gowns?|kleid(?:er)?|robes?|vestidos?|abito)\b/i,
    tops: /\b(?:t-?shirts?|tees?|shirts?|blouses?|tops?|sweaters?|jumpers?|knits?|cardigans?|hoodies?|sweatshirts?|jackets?|coats?|blazers?|pullover|bluse|hemd|jacke|mantel|chemise|veste|manteau)\b/i,
  };

  // What kind of item the page sells, from its title: it decides which of the brand's charts answers.
  function kindOf(title) {
    const t = String(title || '');
    if (RE.shoes.test(t)) return 'shoes';
    if (RE.bottoms.test(t)) return 'bottoms';
    if (RE.dress.test(t)) return 'dresses';
    if (RE.tops.test(t)) return 'tops';
    return 'bottoms';
  }

  function analyzeText(text) {
    const t = String(text || '');
    const elastane = (t.match(RE.elastane) || [])[1];
    const elastanePct = elastane ? parseFloat(elastane.replace(',', '.')) : null;
    let stretch = 'unknown';
    if (RE.rigid.test(t)) stretch = 'none';
    else if (RE.high.test(t) || (elastanePct != null && elastanePct >= 3)) stretch = 'high';
    else if (RE.slight.test(t) || (elastanePct != null && elastanePct > 0)) stretch = 'slight';
    else if (RE.cotton100.test(t)) stretch = 'none';

    const small = RE.small.test(t);
    const large = RE.large.test(t);
    const modelSize = (t.match(RE.model) || [])[1];
    const ft = t.match(RE.modelHeightFt);
    const modelHeight = (t.match(RE.modelHeight) || [])[1] || (ft ? Math.round((+ft[1] * 12 + +ft[2]) * 2.54) : null);
    return {
      fitNote: small && !large ? 'small' : large && !small ? 'large' : RE.tts.test(t) ? 'tts' : null,
      fitNoteText: ((t.match(small && !large ? RE.small : large && !small ? RE.large : RE.tts) || [])[0] || '').trim(),
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
    if (!(pct.small || pct.large || pct.tts)) return out;
    const count = (String(summary).match(REVIEW_COUNT) || [])[1];
    const total = count ? parseInt(count.replace(/[,.]/g, ''), 10) : Math.max(out.total, 100);
    const share = (p) => Math.round((p / 100) * total);
    return { small: share(pct.small), large: share(pct.large), tts: share(pct.tts), total, fromSummary: true };
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
    const shops = rv.vendors ? `, across ${rv.vendors + (rv.local.total ? 1 : 0)} shops` : '';
    const basis = rv.fromSummary && !rv.vendors
      ? `${Math.round(rv.share * 100)} % of ${rv.total} reviews`
      : `${rv[rv.verdict]} of ${rv.mentions} reviews that mention fit${shops}`;
    return rv.verdict === 'tts' ? `Buyers say it ${what} (${basis}).` : `Buyers say it ${what}: ${basis}.`;
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
  function approxLabel(chart, system, pos) {
    const i = Math.max(0, Math.min(chart.length - 1, Math.floor(pos)));
    const f = pos - Math.floor(pos);
    if (pos <= 0 || f < 0.25) return chart[i].label;
    if (f > 0.75 || i === chart.length - 1) return chart[Math.min(i + 1, chart.length - 1)].label;
    return system === 'denim' ? `${chart[i].label}½` : `between ${chart[i].label} and ${chart[i + 1].label}`;
  }

  function recommend(profile, product, charts) {
    const kind = kindOf(product.title);
    const signals = analyzeText(`${product.title || ''}\n${product.text || ''}`);
    const reviews = analyzeReviews(product.reviews, product.reviewSummary, product.poolFit);
    const brand = findBrand(product.brand, charts, kind) || findBrand(product.title, charts, kind);
    if (kind === 'shoes') return recommendShoes(profile, product, brand, signals, charts, reviews);

    const body = bodyFromProfile(profile, charts);
    if (!body || body.waist == null) return { ok: false, needsProfile: true, reason: 'Add your measurements or one piece you own, and Sizer will size this for you.' };

    const pageSizes = resolveSizes(product.sizes || [], brand && brand.system);
    const pageSystem = dominantSystem(pageSizes);

    const chartSystem = brand ? brand.system : pageSystem && GENERIC[pageSystem] ? pageSystem : TO_EU[pageSystem] ? 'eu' : signals.bottoms ? 'denim' : 'eu';
    const chart = brand ? brand.sizes : GENERIC[chartSystem];
    const chartName = brand ? brand.name : 'standard';

    const reasons = [];
    const w = position(chart, 'waist', body.waist);
    const h = position(chart, 'hip', body.hip);
    const rigid = signals.stretch === 'none';
    // Too small is the worse failure for bottoms, so lean on the larger dimension.
    const base = rigid ? Math.max(w, h) : 0.4 * Math.min(w, h) + 0.6 * Math.max(w, h);
    reasons.push({ text: `Your ${joinNames(body.sources)} fit${body.sources.length === 1 && !/measurements/.test(body.sources[0]) ? 's' : ''} like ${chartName} ${approxLabel(chart, chartSystem, base)}.`, delta: null });
    if (brand && brand.garment) reasons.push({ text: `${brand.name} lists garment measurements, so Sizer allowed a little ease.`, delta: null });

    let adj = 0;
    // The page's own note comes first; buyers' reports count only when the page says nothing.
    const pageNote = signals.fitNote === 'small' || signals.fitNote === 'large';
    const buyersNote = !pageNote && (reviews.verdict === 'small' || reviews.verdict === 'large');
    const explicit = pageNote || buyersNote;
    const elastane = signals.elastanePct ? ` (${signals.elastanePct}% elastane)` : '';
    if (rigid) {
      if (!explicit) adj += 0.35 + (signals.skinny ? 0.15 : 0);
      reasons.push({ text: `No stretch${signals.cotton100 ? ', 100% cotton' : ''}, so going up when in doubt.`, delta: null });
    } else if (signals.stretch === 'high') {
      adj -= 0.25;
      reasons.push({ text: `Lots of stretch${elastane}, so it gives and eases with wear.`, delta: null });
    } else if (signals.stretch === 'slight') {
      reasons.push({ text: `A little stretch${elastane}, so your usual fit.`, delta: null });
    }
    if (brand && brand.tendency && !explicit) {
      adj += brand.tendency;
      if (brand.note) reasons.push({ text: brand.note, delta: null });
    }
    const pref = FIT_PREF[profile.fitPreference] || 0;
    if (pref) {
      adj += pref;
      reasons.push({ text: profile.fitPreference === 'relaxed' ? 'You like a little room.' : 'You like a close fit.', delta: null });
    }

    const threshold = rigid ? 0.35 : signals.stretch === 'high' ? 0.65 : 0.5;
    const raw = base + adj;
    const frac = raw - Math.floor(raw);
    const roundedUp = frac >= threshold;
    let idx = Math.floor(raw) + (roundedUp ? 1 : 0);
    const usual = Math.floor(base) + (base - Math.floor(base) >= 0.5 ? 1 : 0);

    if (signals.fitNote === 'small') { idx += 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size up.`, delta: +1 }); }
    if (signals.fitNote === 'large') { idx -= 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size down.`, delta: -1 }); }
    if (signals.fitNote === 'tts') reasons.push({ text: 'The page says it fits true to size.', delta: null });
    if (buyersNote && reviews.verdict === 'small') { idx += 1; reasons.push({ text: reviewReason(reviews), delta: +1 }); }
    if (buyersNote && reviews.verdict === 'large') { idx -= 1; reasons.push({ text: reviewReason(reviews), delta: -1 }); }
    if (!pageNote && reviews.verdict === 'tts') reasons.push({ text: reviewReason(reviews), delta: null });
    if (signals.roomy) reasons.push({ text: 'Relaxed cut, roomy by design. Go one down only if you want it closer.', delta: null });

    idx = Math.max(0, Math.min(chart.length - 1, idx));
    const altIdx = !explicit && frac > 0.25 && frac < 0.75 ? idx + (roundedUp ? -1 : 1) : null;

    const headline = signals.fitNote === 'small' ? 'Runs small, sized up'
      : signals.fitNote === 'large' ? 'Runs large, sized down'
        : buyersNote && reviews.verdict === 'small' ? 'Buyers say it runs small, sized up'
          : buyersNote && reviews.verdict === 'large' ? 'Buyers say it runs large, sized down'
        : rigid && idx > usual ? 'No stretch, sized up'
          : signals.stretch === 'high' && idx < usual ? 'Stretchy, sized down'
            : idx > usual ? 'Sized up for you' : idx < usual ? 'Sized down for you' : 'Your usual fit';

    const pick = chart[idx];
    const pageMatch = matchPageSize(pick, pageSizes, brand, profile.inseam);
    const alt = altIdx != null && altIdx >= 0 && altIdx < chart.length ? chart[altIdx] : null;
    const altMatch = alt ? matchPageSize(alt, pageSizes, brand, profile.inseam) : null;
    const at = (m) => (position(chart, 'waist', m.waist) + position(chart, 'hip', m.hip)) / 2;
    const inStock = pageMatch && pageMatch.available === false
      ? nearestInStock(at(pick), pageSizes, (s) => { const m = measure(s.parsed, brand); return m ? at(m) : null; }, rigid)
      : null;
    const size = pageMatch ? pageMatch.label : displayLabel(pick, chartSystem, brand);

    let score = 0.4;
    if (brand) score += 0.2;
    if (signals.stretch !== 'unknown') score += 0.15;
    if (signals.fitNote) score += 0.1;
    if (reviews.verdict) score += 0.1;
    const corroborated = body.points.length > 1 || (profile.waist && profile.hip);
    if (corroborated) score += 0.1;
    if (body.spread > 5) score -= 0.15;
    if (!signals.bottoms) score -= 0.1;
    const confidence = score >= 0.75 ? 'High' : score >= 0.55 ? 'Medium' : 'Low';
    const firmUp = !brand ? 'There’s no size chart for this brand yet, so this uses a standard one.'
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
      stockText: pageMatch && pageMatch.available === false ? inStockText(size, inStock) : null,
      alternative: alt ? { size: altMatch ? altMatch.label : displayLabel(alt, chartSystem, brand), why: altIdx > idx ? 'if you like more room' : 'if you like a closer fit' } : null,
      headline,
      confidence,
      firmUp,
      brand: brand ? brand.name : product.brand || null,
      brandKnown: !!brand,
      guide: brand ? brand.guide || null : null,
      source: brand && brand.source ? brand.source : null,
      reasons,
      signals,
      reviews,
      body,
    };
  }

  // ---- shoes: one dimension, read straight off the chart ---------------------

  const cm = (n) => String(+(+n).toFixed(1));

  function recommendShoes(profile, product, found, signals, charts, reviews = analyzeReviews()) {
    const f = footFromProfile(profile, charts);
    if (!f) return { ok: false, needsProfile: true, reason: 'Add your foot length to your fit profile, and Sizer will size shoes for you.' };
    const brand = found && found.shoes ? found : null;
    const rows = brand ? brand.sizes : Charts.GENERIC_SHOES;
    const system = brand ? brand.system : 'eu';
    const pageSizes = resolveSizes(product.sizes || [], 'eu');

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
    const explicit = pageNote || buyersNote;
    let alt = null;
    if (!explicit && inRow && f.foot >= row.foot[1] - 0.2 && idx < rows.length - 1) alt = { row: rows[idx + 1], why: 'if you like more room' };
    else if (!explicit && inRow && f.foot <= row.foot[0] + 0.2 && idx > 0) alt = { row: rows[idx - 1], why: 'if you like a closer fit' };
    if (signals.fitNote === 'small') { idx += 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size up.`, delta: +1 }); }
    if (signals.fitNote === 'large') { idx -= 1; reasons.push({ text: `The page says “${signals.fitNoteText}”, so one size down.`, delta: -1 }); }
    if (signals.fitNote === 'tts') reasons.push({ text: 'The page says it fits true to size.', delta: null });
    if (buyersNote && reviews.verdict === 'small') { idx += 1; reasons.push({ text: reviewReason(reviews), delta: +1 }); }
    if (buyersNote && reviews.verdict === 'large') { idx -= 1; reasons.push({ text: reviewReason(reviews), delta: -1 }); }
    if (!pageNote && reviews.verdict === 'tts') reasons.push({ text: reviewReason(reviews), delta: null });
    idx = Math.max(0, Math.min(rows.length - 1, idx));
    const pick = rows[idx];

    const matchOf = (r) => {
      const s = pageSizes.find((p) => shoeRow(p.parsed, [r], system));
      return s ? { label: s.label, available: s.available } : null;
    };
    const label = (r) => (system === 'eu' ? `EU ${r.label}` : r.label);
    const pageMatch = matchOf(pick);
    const altMatch = alt ? matchOf(alt.row) : null;
    const inStock = pageMatch && pageMatch.available === false
      ? nearestInStock(idx, pageSizes, (s) => { const r = shoeRow(s.parsed, rows, system); return r ? rows.indexOf(r) : null; }, true)
      : null;
    const size = pageMatch ? pageMatch.label : label(pick);

    const headline = signals.fitNote === 'small' ? 'Runs small, sized up' : signals.fitNote === 'large' ? 'Runs large, sized down'
      : buyersNote && reviews.verdict === 'small' ? 'Buyers say it runs small, sized up'
        : buyersNote && reviews.verdict === 'large' ? 'Buyers say it runs large, sized down' : 'By your foot length';
    const confidence = brand && f.measured ? 'High' : brand ? 'Medium' : 'Low';
    const firmUp = !brand ? 'There’s no shoe chart for this brand yet, so this uses a standard EU chart.'
      : !f.measured ? 'Add your foot length to firm this up.' : null;

    return {
      ok: true,
      size,
      matchedOnPage: !!pageMatch,
      available: pageMatch ? pageMatch.available !== false : null,
      inStock,
      stockText: pageMatch && pageMatch.available === false ? inStockText(size, inStock) : null,
      alternative: alt ? { size: altMatch ? altMatch.label : label(alt.row), why: alt.why } : null,
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

  function inStockText(size, inStock) {
    if (!inStock) return `Sold out in ${size}, and nothing close is in stock.`;
    const first = `${inStock.size}, ${STEP_WORDS[inStock.steps]}`;
    return inStock.other
      ? `Sold out in ${size}. In stock: ${first}, or ${inStock.other.size}, ${STEP_WORDS[inStock.other.steps]}.`
      : `Sold out in ${size}. Nearest in stock: ${first}.`;
  }

  function displayLabel(entry, system, brand) {
    if (system === 'denim') return `W${entry.label}`;
    const letter = brand && brand.letters ? brand.letters[entry.value] : entry.aliases && entry.aliases.letter;
    if (system === 'eu') return `EU ${entry.label}${letter ? ` (${letter})` : ''}`;
    return entry.label;
  }

  function matchPageSize(target, pageSizes, brand, inseam) {
    let best = null;
    for (const s of pageSizes) {
      const m = measure(s.parsed, brand);
      if (!m) continue;
      let d = Math.abs(m.waist - target.waist) + Math.abs(m.hip - target.hip);
      if (inseam && s.parsed.length) d += Math.abs(s.parsed.length - inseam) * 0.5;
      if (!best || d < best.d - 0.01 || (Math.abs(d - best.d) <= 0.01 && s.available !== false && best.s.available === false)) best = { s, d };
    }
    return best && best.d < 6 ? { label: best.s.label, available: best.s.available } : null;
  }

  const api = { recommend, analyzeText, analyzeReviews, parseSizeLabel, findBrand, bodyFromProfile, resolveSizes, explainAnchor, kindOf };
  root.SizerEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
