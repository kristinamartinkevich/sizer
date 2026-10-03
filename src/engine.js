// Turns a shopper profile + a product page into one size recommendation with reasons.
(function (root) {
  const { BRANDS, GENERIC, TO_EU } = root.SizerBrands || require('./brands.js');

  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

  function findBrand(text) {
    const t = ` ${norm(text)} `;
    if (!t.trim()) return null;
    let best = null;
    for (const b of BRANDS) {
      for (const a of b.aliases) {
        const n = norm(a);
        if (n && t.includes(` ${n} `) && (!best || n.length > best.len)) best = { brand: b, len: n.length };
      }
    }
    return best && best.brand;
  }

  function brandById(id) {
    return BRANDS.find((b) => b.id === id) || null;
  }

  // ---- size labels -------------------------------------------------------

  const LETTER_RE = /^(3XL|XXXL|XXL|2XL|XL|XXS|2XS|XS|S|M|L)(?![A-Z])/;
  const LETTER_CANON = { XXXL: '3XL', '2XL': 'XXL', '2XS': 'XXS' };

  function parseSizeLabel(raw) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!s || s.length > 24) return null;
    let m;
    if ((m = s.match(/^W\s?(\d{2})(?:\s?[\/X]?\s?L\s?(\d{2}))?\b/))) return { system: 'denim', value: +m[1], length: m[2] ? +m[2] : null, label: m[0] };
    if ((m = s.match(/^(\d{2})\s?[\/X]\s?(\d{2})\b/)) && +m[1] >= 22 && +m[1] <= 40 && +m[2] >= 26 && +m[2] <= 38) return { system: 'denim', value: +m[1], length: +m[2], label: m[0] };
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

  function anchorBrand(a) {
    if (!a.brand || a.brand.startsWith('generic')) return null;
    return brandById(a.brand) || findBrand(a.brand);
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

  function wardrobePoints(anchors) {
    const points = [];
    for (const a of anchors || []) {
      const brand = anchorBrand(a);
      let parsed = parseSizeLabel(a.size);
      if (!parsed) continue;
      if (parsed.system === 'number') parsed = { ...parsed, system: anchorNumberSystem(a, brand, parsed.value) };
      const m = measure(parsed, brand);
      if (!m) continue;
      const shift = FIT_SHIFT_CM[a.fit] || 0;
      const name = brand ? brand.name : a.brand && !a.brand.startsWith('generic') ? a.brand : genericName(parsed.system);
      points.push({ waist: m.waist + shift, hip: m.hip + shift, name: `${name} ${a.size}` });
    }
    return points;
  }

  // How one wardrobe item is being read, so the settings page can show it.
  function explainAnchor(a) {
    const brand = anchorBrand(a);
    let parsed = parseSizeLabel(a.size);
    if (!parsed) return { ok: false, brand: brand ? brand.name : null };
    if (parsed.system === 'number') parsed = { ...parsed, system: anchorNumberSystem(a, brand, parsed.value) };
    return { ok: !!measure(parsed, brand), brand: brand ? brand.name : null, system: parsed.system };
  }

  function bodyFromProfile(profile) {
    const points = wardrobePoints(profile.anchors);
    const avg = (k) => points.reduce((s, p) => s + p[k], 0) / points.length;
    const waist = profile.waist ? +profile.waist : points.length ? avg('waist') : null;
    const hip = profile.hip ? +profile.hip : points.length ? avg('hip') : null;
    if (waist == null || hip == null) return null;
    const spread = points.length ? Math.max(...points.map((p) => Math.abs(p.hip - hip) + Math.abs(p.waist - waist))) : 0;
    const sources = [];
    if (profile.waist && profile.hip) sources.push('your measurements');
    else if (profile.waist) sources.push('your waist');
    else if (profile.hip) sources.push('your hip');
    if (!(profile.waist && profile.hip)) sources.push(...points.map((p) => p.name));
    return { waist, hip, sources, spread, points };
  }

  function genericName(system) {
    return { denim: 'Denim waist', eu: 'EU', us: 'US', uk: 'UK', it: 'IT', letter: 'Size' }[system] || system;
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
    bottoms: /\b(?:jeans?|denim|trousers?|pants?|chinos?|skirts?|shorts|culottes?|leggings|hose|rock)\b/i,
  };

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
    const modelHeight = (t.match(RE.modelHeight) || [])[1];
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

  function recommend(profile, product) {
    const body = bodyFromProfile(profile);
    if (!body) return { ok: false, reason: 'Add a size you know in Sizer settings first.' };

    const brand = findBrand(product.brand) || findBrand(product.title);
    const pageSizes = resolveSizes(product.sizes || [], brand && brand.system);
    const pageSystem = dominantSystem(pageSizes);
    const signals = analyzeText(`${product.title || ''}\n${product.text || ''}`);

    const chartSystem = brand ? brand.system : pageSystem && GENERIC[pageSystem] ? pageSystem : TO_EU[pageSystem] ? 'eu' : signals.bottoms ? 'denim' : 'eu';
    const chart = brand ? brand.sizes : GENERIC[chartSystem];

    const reasons = [];
    const w = position(chart, 'waist', body.waist);
    const h = position(chart, 'hip', body.hip);
    const rigid = signals.stretch === 'none';
    // Too small is the worse failure for bottoms, so lean on the larger dimension.
    const base = rigid ? Math.max(w, h) : 0.4 * Math.min(w, h) + 0.6 * Math.max(w, h);
    reasons.push({ text: `Your ${body.sources.join(' + ')} matches ${brand ? brand.name : 'the standard'} chart between ${labelAt(chart, Math.floor(base))} and ${labelAt(chart, Math.floor(base) + 1)}.`, delta: null });

    let adj = 0;
    const explicit = signals.fitNote === 'small' || signals.fitNote === 'large';
    if (signals.stretch === 'none') {
      if (explicit) reasons.push({ text: 'No stretch: rounding up when you fall between sizes.', delta: null });
      else { adj += 0.35; reasons.push({ text: `No stretch${signals.cotton100 ? ' (100% cotton)' : ''}: rigid fabric won’t give, so leaning up.`, delta: +0.35 }); }
      if (signals.skinny && !explicit) { adj += 0.15; reasons.push({ text: 'Slim or skinny cut in rigid fabric fits tighter still.', delta: +0.15 }); }
    } else if (signals.stretch === 'high') {
      adj -= 0.25;
      reasons.push({ text: `High stretch${signals.elastanePct ? ` (${signals.elastanePct}% elastane)` : ''}: it gives and relaxes with wear, so leaning down.`, delta: -0.25 });
    } else if (signals.stretch === 'slight') {
      reasons.push({ text: `Slight stretch${signals.elastanePct ? ` (${signals.elastanePct}% elastane)` : ''}: your usual size should work.`, delta: 0 });
    }
    if (brand && brand.tendency && !explicit) {
      adj += brand.tendency;
      reasons.push({ text: `${brand.name}: ${brand.note}`, delta: brand.tendency });
    }
    const pref = FIT_PREF[profile.fitPreference] || 0;
    if (pref) { adj += pref; reasons.push({ text: `You prefer a ${profile.fitPreference} fit.`, delta: pref }); }

    const threshold = rigid ? 0.35 : signals.stretch === 'high' ? 0.65 : 0.5;
    const raw = base + adj;
    const frac = raw - Math.floor(raw);
    const roundedUp = frac >= threshold;
    let idx = Math.floor(raw) + (roundedUp ? 1 : 0);

    if (signals.fitNote === 'small') { idx += 1; reasons.push({ text: `The product page says “${signals.fitNoteText}”: one size up.`, delta: +1 }); }
    if (signals.fitNote === 'large') { idx -= 1; reasons.push({ text: `The product page says “${signals.fitNoteText}”: one size down.`, delta: -1 }); }
    if (signals.fitNote === 'tts') reasons.push({ text: 'The product page says it fits true to size.', delta: 0 });
    if (signals.roomy) reasons.push({ text: 'Relaxed or oversized cut: this size gives the intended roomy look. Go one down only if you want it closer.', delta: null });

    idx = Math.max(0, Math.min(chart.length - 1, idx));
    const altIdx = !explicit && frac > 0.25 && frac < 0.75 ? idx + (roundedUp ? -1 : 1) : null;

    const pick = chart[idx];
    const pageMatch = matchPageSize(pick, pageSizes, brand, profile.inseam);
    const alt = altIdx != null && altIdx >= 0 && altIdx < chart.length ? chart[altIdx] : null;
    const altMatch = alt ? matchPageSize(alt, pageSizes, brand, profile.inseam) : null;

    let score = 0.4;
    if (brand) score += 0.2;
    if (signals.stretch !== 'unknown') score += 0.15;
    if (signals.fitNote) score += 0.1;
    if (body.sources.length > 1 || profile.waist) score += 0.1;
    if (body.spread > 5) score -= 0.15;
    if (!signals.bottoms) score -= 0.1;
    const confidence = score >= 0.75 ? 'High' : score >= 0.55 ? 'Medium' : 'Low';

    return {
      ok: true,
      size: pageMatch ? pageMatch.label : displayLabel(pick, chartSystem, brand),
      available: pageMatch ? pageMatch.available !== false : null,
      alternative: alt ? { size: altMatch ? altMatch.label : displayLabel(alt, chartSystem, brand), why: altIdx > idx ? 'if you prefer more room' : 'if you like a closer fit' } : null,
      confidence,
      brand: brand ? brand.name : product.brand || null,
      brandKnown: !!brand,
      guide: brand ? brand.guide : null,
      reasons,
      signals,
      body,
    };
  }

  function labelAt(chart, i) {
    return chart[Math.max(0, Math.min(chart.length - 1, i))].label;
  }

  function displayLabel(entry, system, brand) {
    if (system === 'denim') return `W${entry.label}`;
    if (system === 'eu') return `EU ${entry.label}${brand && brand.letters && brand.letters[entry.value] ? ` (${brand.letters[entry.value]})` : ''}`;
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

  const api = { recommend, analyzeText, parseSizeLabel, findBrand, bodyFromProfile, resolveSizes, explainAnchor };
  root.SizerEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
