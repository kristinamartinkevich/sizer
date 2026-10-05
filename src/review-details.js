(function (root) {
  // What one buyer's review says about them and the fit: their height or height group, their shape,
  // the size they bought and usually wear, the verdict, and where it was tight, loose, long or short.
  // Then how much each review should count for you, by how like you the reviewer is. All on the
  // device: the profile never leaves the browser. Pure: no DOM, no chrome.

  const SIZE = '(\\d{1,2}|XXS|XS|S|M|L|XL|XXL)';
  const LETTER = /^(XXS|XS|S|M|L|XL|XXL)$/i;

  // ---- one review -------------------------------------------------------------

  const CURVES = [[/straight hips|hanches droites/i, 'straight'], [/some curves|quelques courbes/i, 'some'], [/\bcurvy\b|en courbes/i, 'curvy']];
  const HEIGHT_LABEL = /About my height|À propos de ma taille/i;
  const FIELDS_END = /\b(?:Sizing|Tailles|Product Quality|Qualité du produit)\b/i;
  const BUCKET_WORD = { petite: 'petite', average: 'average', tall: 'tall', moyenne: 'average', grande: 'tall' };
  const SIZING_FIELD = /(?:Sizing|Tailles)\s+(taille petit|taille normal|taille grand|runs small|true to size|runs large)/i;
  const SIZING_VERDICT = { 'taille petit': 'small', 'runs small': 'small', 'taille normal': 'tts', 'true to size': 'tts', 'taille grand': 'large', 'runs large': 'large' };

  // Revolve's own groups, by height: petite to 5'4", tall from 5'8".
  const bucketOf = (cm) => (cm <= 163 ? 'petite' : cm >= 173 ? 'tall' : 'average');

  function heightOf(t) {
    let m = t.match(/(?<![\d'’])([4-6])\s*(?:'|’|ft|foot|feet)(?!['’])\s*(\d{1,2})?/i);
    if (m && (!m[2] || +m[2] < 12)) return Math.round((+m[1] * 12 + (+m[2] || 0)) * 2.54);
    m = t.match(/(?<![\d$£€.,])1\s?[.,m]\s?(\d{2})(?!\d)(?!\s?(?:€|£|\$|eur|usd))/i);
    if (m) return 100 + +m[1];
    m = t.match(/(?<!\d)(1[4-9]\d)\s?cm\b/i);
    return m ? +m[1] : null;
  }

  // A weight given in pounds or kilos, in kg; 30 to 200 kg only, so a price or a size never reads.
  function weightOf(t) {
    const m = t.match(/(?<![\d.,])(\d{2,3}(?:[.,]\d)?)\s?(lbs?|pounds|kg|kilos?)\b/i);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.')) * (/^(?:lb|pound)/i.test(m[2]) ? 0.4536 : 1);
    return v >= 30 && v <= 200 ? Math.round(v) : null;
  }

  function verdictOf(t) {
    const field = t.match(SIZING_FIELD);
    if (field) return SIZING_VERDICT[field[1].toLowerCase()];
    const small = /runs?\s+small|too\s+small|sized?\s+up\b|taille\s+petit/i.test(t);
    const large = /runs?\s+(?:large|big)|too\s+(?:big|large)|sized?\s+down\b|taille\s+grand/i.test(t);
    if (small !== large) return small ? 'small' : 'large';
    return /true\s+to\s+size|\btts\b|fits?\s+(?:perfectly|as\s+expected)|taille\s+normal/i.test(t) ? 'tts' : null;
  }

  // A letter size only counts in capitals, so "a small" or "a long" is not read as S or L.
  function sizeAfter(t, lead) {
    const m = t.match(new RegExp(`(?:${lead})\\s+(?:i\\s+)?(?:wear\\s+|am\\s+|take\\s+|je\\s+porte\\s+|je\\s+prends\\s+)?(?:an?\\s+|the\\s+|size\\s+|en\\s+|une?\\s+|la\\s+taille\\s+|du\\s+)?${SIZE}\\b`, 'i'));
    if (!m || (LETTER.test(m[1]) && m[1] !== m[1].toUpperCase())) return null;
    return m[1];
  }

  const DIR = { tight: 'tight', snug: 'tight', small: 'tight', 'serré': 'tight', 'serrée': 'tight', loose: 'loose', big: 'loose', baggy: 'loose', ample: 'loose', large: 'loose', long: 'long', longue: 'long', short: 'short', court: 'short', courte: 'short' };
  const BODY = [
    [/^(?:bust|chest|boobs|poitrine)$/, 'bust'], [/^(?:waist|waistband|taille)$/, 'waist'],
    [/^(?:hips?|thighs?|butt|bum|rear|seat|hanches|cuisses|fesses)$/, 'hip'], [/^(?:legs?|inseam|jambes)$/, 'inseam'],
    [/^length$/, 'length'], [/^(?:shoulders?|épaules)$/, 'shoulder'], [/^(?:arms?|sleeves?|manches)$/, 'sleeve'],
  ];
  const DIRS = 'tight|snug|small|loose|big|baggy|long|short';
  const PARTS = 'bust|chest|boobs|waistband|waist|hips?|thighs?|butt|bum|rear|seat|legs?|inseam|length|shoulders?|arms?|sleeves?';
  const AREA_PATTERNS = [
    [new RegExp(`\\b(${DIRS})\\s+(?:in|on|at|around|through|across)\\s+(?:the\\s+)?(${PARTS})\\b`, 'gi'), 1, 2],
    [new RegExp(`\\b(?:the\\s+)?(${PARTS})\\s+(?:was|were|is|are|felt|feels|fit|fits)\\s+(?:a\\s+(?:bit|little)\\s+|slightly\\s+|very\\s+|too\\s+|quite\\s+|really\\s+)?(${DIRS})\\b`, 'gi'), 2, 1],
    [/(serrée?|ample|large|longue?|courte?)s?\s+(?:aux|à la|au|des|sur les)\s+(hanches|cuisses|taille|épaules|fesses|jambes|poitrine|manches)/gi, 1, 2],
  ];
  const BARE_LENGTH = /(?:trop|too|a\s+bit|slightly|un\s+peu)\s+(long|longue|short|court|courte)\b/gi;
  // "Not tight in the hips" says the opposite; a short rise or strap is not a short garment.
  const NEGATED = /\b(?:not|never|no|isn['’]t|wasn['’]t|aren['’]t|weren['’]t|pas)\s+(?:\w+\s+)?$/i;
  const OTHER_PART = /\b(?:rise|crotch|zip|zipper|straps?|torso|bodice|cuffs?|collar|neck|neckline|slit|fly)\s+(?:is|was|are|were|felt|feels|seems?|est)?\s*$/i;

  function areaOf(word) {
    const w = word.toLowerCase();
    const hit = BODY.find(([re]) => re.test(w));
    return hit ? hit[1] : null;
  }

  function areasOf(text) {
    let rest = text;
    const found = [];
    for (const [re, d, b] of AREA_PATTERNS) {
      re.lastIndex = 0;
      rest = rest.replace(re, (whole, ...g) => {
        const at = g[g.length - 2];
        const area = areaOf(g[b - 1]);
        const direction = DIR[g[d - 1].toLowerCase()];
        if (area && direction && !NEGATED.test(text.slice(Math.max(0, at - 20), at))) found.push({ at, area, direction });
        return ' '.repeat(whole.length);
      });
    }
    BARE_LENGTH.lastIndex = 0;
    let m;
    while ((m = BARE_LENGTH.exec(rest))) {
      const before = rest.slice(Math.max(0, m.index - 30), m.index);
      if (NEGATED.test(before) || OTHER_PART.test(before)) continue;
      found.push({ at: m.index, area: 'length', direction: DIR[m[1].toLowerCase()] });
    }
    const out = [];
    for (const f of found.sort((a, b) => a.at - b.at)) {
      if (!out.some((o) => o.area === f.area && o.direction === f.direction)) out.push({ area: f.area, direction: f.direction });
    }
    return out;
  }

  function parseReview(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const curves = (CURVES.find(([re]) => re.test(t)) || [])[1] || null;
    const height = heightOf(t);
    let heightBucket = height ? bucketOf(height) : null;
    const label = t.search(HEIGHT_LABEL);
    if (!heightBucket && label >= 0) {
      const after = t.slice(label);
      const end = after.search(FIELDS_END);
      const m = (end >= 0 ? after.slice(0, end) : after).replace(HEIGHT_LABEL, ' ').match(/\b(petite|average|tall|moyenne|grande)\b/i);
      if (m) heightBucket = BUCKET_WORD[m[1].toLowerCase()];
    }
    return {
      text: t,
      verdict: verdictOf(t),
      height,
      heightBucket,
      curves,
      weight: weightOf(t),
      sizeBought: sizeAfter(t, "sized?\\s+(?:up|down)\\s+to|went\\s+(?:up|down)\\s+to|bought|ordered|purchased|got|went\\s+with|took|j['’]ai\\s+pris|j['’]ai\\s+commandé"),
      usualSize: sizeAfter(t, "usually|normally|typically|always|d['’]habitude|habituellement|normalement"),
      areas: areasOf(t),
    };
  }

  // ---- how like you the reviewer is -------------------------------------------

  const UNKNOWN = 0.6;
  const BUCKETS = ['petite', 'average', 'tall'];
  const SHAPES = ['straight', 'some', 'curvy'];
  const NEAR = [1, 0.6, 0.25];

  function shapeOf(profile) {
    const w = +profile.waist, h = +profile.hip;
    if (!(w > 0 && h > 0)) return null;
    const d = h - w;
    return d < 20 ? 'straight' : d >= 28 ? 'curvy' : 'some';
  }

  function heightMatch(r, profile) {
    const mine = +profile.height;
    if (!(mine > 0)) return UNKNOWN;
    if (r.height) {
      const d = Math.abs(r.height - mine);
      return d <= 4 ? 1 : d >= 12 ? 0.25 : +(1 - ((d - 4) / 8) * 0.75).toFixed(3);
    }
    if (r.heightBucket) return [1, 0.5, 0.25][Math.abs(BUCKETS.indexOf(r.heightBucket) - BUCKETS.indexOf(bucketOf(mine)))];
    return UNKNOWN;
  }

  function shapeMatch(r, profile) {
    const mine = shapeOf(profile);
    if (!mine || !r.curves) return UNKNOWN;
    return NEAR[Math.abs(SHAPES.indexOf(r.curves) - SHAPES.indexOf(mine))];
  }

  // Weight only sharpens a match: when you and the reviewer both give one it scales the weight from 1
  // (within 4 kg) to 0.4 (15 kg or more apart); when either is missing it changes nothing.
  function weightMatch(r, profile) {
    const mine = +profile.weight;
    if (!(mine > 0) || !r.weight) return 1;
    const d = Math.abs(r.weight - mine);
    return d <= 4 ? 1 : d >= 15 ? 0.4 : +(1 - ((d - 4) / 11) * 0.6).toFixed(3);
  }

  const similarity = (r, profile) => +(heightMatch(r, profile || {}) * shapeMatch(r, profile || {}) * weightMatch(r, profile || {})).toFixed(4);

  const SIMILAR = 0.6;
  const MIN_DESCRIBED = 3;
  const MIN_WEIGHT = 1.2;

  // The verdict reviews give once each counts by how like you its writer is. Only when at least
  // three reviewers say their height or shape and the profile has a height or a waist and hip;
  // otherwise null and the plain count stands. The winner needs weight 1.2 and a weighted majority.
  // "Similar" (the count the copy calls "about your height and shape") needs a reviewer who gave both
  // and matches; an area counts only reviewers that like you, so its number means what it says.
  function weightedVerdict(details, profile) {
    const p = profile || {};
    if (!(+p.height > 0) && !shapeOf(p)) return null;
    const described = (details || []).filter((d) => d.height || d.heightBucket || d.curves);
    if (described.length < MIN_DESCRIBED) return null;
    const sum = { small: 0, large: 0, tts: 0 };
    const areaSum = new Map();
    let similar = { small: 0, large: 0, tts: 0 };
    for (const d of details) {
      const w = similarity(d, p);
      if (d.verdict) {
        sum[d.verdict] += w;
        if (w >= SIMILAR && (d.height || d.heightBucket) && d.curves) similar[d.verdict] += 1;
      }
      for (const a of w >= SIMILAR ? d.areas || [] : []) {
        const k = `${a.area}|${a.direction}`;
        const cur = areaSum.get(k) || { area: a.area, direction: a.direction, weight: 0, count: 0 };
        cur.weight += w;
        cur.count += 1;
        areaSum.set(k, cur);
      }
    }
    const total = sum.small + sum.large + sum.tts;
    const top = Object.keys(sum).sort((a, b) => sum[b] - sum[a])[0];
    const verdict = sum[top] >= MIN_WEIGHT && sum[top] > total / 2 ? top : null;
    const areas = [...areaSum.values()].filter((a) => a.count >= 2 && a.weight >= 1.5).map(({ area, direction, count }) => ({ area, direction, count }));
    return { verdict, similar: verdict ? similar[verdict] : 0, described: described.length, weight: verdict ? +sum[verdict].toFixed(2) : 0, areas };
  }

  const api = { parseReview, similarity, weightedVerdict, bucketOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerReviewDetails = api;
})(globalThis);
