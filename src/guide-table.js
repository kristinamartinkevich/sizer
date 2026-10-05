// Turns a size table printed on a shop or brand page (a grid of cell strings) into a chart in the
// shape the chart database stores, or null when the grid is not a size chart. Also the pure parts of
// finding a guide elsewhere: a same-shop size-guide link, a chart image's name, the guide page fetch
// (with fetch passed in).
(function (root) {
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  const KINDS = [
    ['foot_length', /foot\s*length|longueur\s+(du\s+)?pied|fu(ß|ss)l(ä|a)nge|heel\s*to\s*toe/i],
    ['bust', /\b(bust|chest)\b|poitrine|\bbrust|pecho|\bseno\b/i],
    ['waist', /\bwaist\b|tour de taille|taillenumfang|\btaillen?weite|cintura/i],
    ['hip', /\bhips?\b|hanches?|h(ü|u)fte|cadera|fianchi/i],
  ];
  const SIZE_WORD = /\bsizes?\b|^tailles?\b|gr(ö|o)(ß|ss)en?\b|^tallas?\b|^taglias?\b|^maat\b/i;
  const SYSTEMS = [['uk', /\b(uk|gb)\b/i], ['eu', /\b(eu|eur|europe|de)\b/i], ['fr', /\b(fr|france)\b/i], ['it', /\b(it|ital(y|ia))\b/i], ['us', /\b(us|usa)\b/i], ['letter', /\b(int|intl|international|letter)\b/i]];
  // A shop's "model info" panel lists the model's own body and the size she wears: real body
  // measurements against sizes, so only its wording tells it apart from a chart.
  const MODEL = /\bmodels?\b|mannequin|size worn|\bwears? (a )?size|is wearing|porte une taille|taille port[ée]e|tr(ä|a)gt gr(ö|o)(ß|ss)e/i;
  const GARMENT =/garment|product (measurements|dimensions)|item measurements|laid flat|\bflat\b|dimensions du produit|mesures du (produit|v[êe]tement)|ma(ß|ss)e des artikels/i;

  // Plausible body measurements, so a column of something else (inseam, model height) is not read as one.
  const PLAUSIBLE = {
    cm: { waist: [40, 160], hip: [60, 180], bust: [60, 170], foot_length: [12, 35] },
    in: { waist: [16, 63], hip: [24, 71], bust: [24, 67], foot_length: [5, 14] },
  };

  function classify(header) {
    const h = clean(header);
    if (!h) return null;
    const kind = (KINDS.find(([, re]) => re.test(h)) || [])[0];
    if (kind === 'waist' && SIZE_WORD.test(h)) return { size: 'denim_waist' };
    if (kind) return { kind };
    if (h.length > 30) return null;
    const system = (SYSTEMS.find(([, re]) => re.test(h)) || [])[0];
    if (system) return { size: system };
    return SIZE_WORD.test(h) ? { size: 'size' } : null;
  }

  const LETTER = /^(x{0,4}s|m|x{0,4}l|[2-6]x[sl]?|[2-6]xl|os|one size)$/i;

  function looksLikeSize(v) {
    const s = clean(v).replace(/\s*\(.*\)$/, '').replace(/^(size|eu|uk|us|it|fr|de|int)\s*/i, '');
    if (!s) return false;
    if (s.split(/\s*\/\s*/).every((p) => LETTER.test(p))) return true;
    if (/^\d{1,2}([.,]5|½| 1\/2)?$/.test(s)) return parseFloat(s) <= 60;
    return /^\d{1,2}\s*[-–/]\s*\d{1,2}$/.test(s) || /^W?\d{2}(\s*L\s?\d{2})?$/i.test(s);
  }

  const IN_MARK = /\binch(es)?\b|\bin\b|["″]|''|’’/i;

  function unitOfHeader(h) {
    const cm = /\bcm\b/i.test(h);
    const inch = /\binch(es)?\b|\(in\.?\)|\[in\]|\bin\.?$|["″]|''/i.test(h);
    return cm === inch ? null : cm ? 'cm' : 'in';
  }

  // Captions are prose ("find your size in our guide"), so only an explicit unit word counts.
  function unitOfProse(t) {
    const cm = /\bcm\b|centim/i.test(t);
    const inch = /\binch(es)?\b|\(in\)/i.test(t);
    return cm === inch ? null : cm ? 'cm' : 'in';
  }

  function unitOfHint(u) {
    if (/^cm$/i.test(clean(u))) return 'cm';
    return /^(in|inch|inches)$/i.test(clean(u)) ? 'in' : null;
  }

  function unitOfValues(values) {
    let cm = 0; let inch = 0;
    for (const v of values) {
      const hasCm = /\bcm\b/i.test(v);
      const hasIn = IN_MARK.test(v);
      if (hasCm && !hasIn) cm += 1;
      if (hasIn && !hasCm) inch += 1;
    }
    return cm && !inch ? 'cm' : inch && !cm ? 'in' : null;
  }

  // One printed measurement as [min, max]: "27-28", "27–28", "27 to 28", "27½", "27 1/2", "62,5 cm", 24".
  // A cell printing both units ("66 cm / 26 in") gives the part in `want`.
  function parseRange(cell, want = 'cm') {
    let s = clean(cell);
    if (!s) return null;
    if (/\bcm\b/i.test(s) && IN_MARK.test(s)) {
      const part = s.split(/[/|()]/).find((p) => (want === 'in' ? IN_MARK.test(p) && !/\bcm\b/i.test(p) : /\bcm\b/i.test(p)));
      if (!part) return null;
      s = part;
    }
    s = s.replace(/(\d)\s*(½|1\/2)(?!\d)/g, '$1.5').replace(/(\d)\s*(¼|1\/4)(?!\d)/g, '$1.25').replace(/(\d)\s*(¾|3\/4)(?!\d)/g, '$1.75')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/\b(cm|inches|inch|in)\b\.?|["″]|''|’’/gi, ' ');
    s = clean(s);
    const range = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|to|à|a|bis)\s*(\d+(?:\.\d+)?)$/i);
    if (range) {
      const a = +range[1]; const b = +range[2];
      return a <= b ? [a, b] : null;
    }
    return /^\d+(\.\d+)?$/.test(s) ? [+s, +s] : null;
  }

  const words = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

  // Whether the table or its caption names the brand, as a whole word.
  function mentionsBrand(matrix, caption, brand) {
    const b = words(brand);
    if (!b) return false;
    const cells = [].concat(...(matrix || []).map((r) => r || []));
    return ` ${words([...cells, caption || ''].join(' '))} `.includes(` ${b} `);
  }

  function transpose(m) {
    const width = Math.max(0, ...m.map((r) => r.length));
    return Array.from({ length: width }, (_, c) => m.map((r) => (r[c] == null ? '' : r[c])));
  }

  // A cell repeating the header above it is a rowspanned header ("Size" over two rows), not data.
  const UNIT_CELL = /^\(?(cm|in|inch(es)?|")\)?$/i;
  const isUnitRow = (r, above) => r.some((c) => UNIT_CELL.test(c)) && r.every((c, i) => !c || UNIT_CELL.test(c) || c === above[i]);
  const isSpanned = (r) => { const f = r.filter(Boolean); return !f.length || (f.length === r.length && f.length > 1 && f.every((c) => c === f[0])); };

  // Sizes down the side, one measurement per column. The other orientation is tried by transposing.
  function readOriented(m, hints) {
    const headerAt = m.slice(0, 5).findIndex((r, i) => i <= m.length - 3 && r.some((c) => (classify(c) || {}).kind));
    if (headerAt < 0) return null;
    const width = Math.max(...m.map((r) => r.length));
    const headers = Array.from({ length: width }, (_, c) => clean(m[headerAt][c]));
    let next = headerAt + 1;
    while (next < m.length && isUnitRow(m[next], m[headerAt])) {
      m[next].forEach((u, c) => { if (UNIT_CELL.test(u)) headers[c] = clean(`${headers[c]} ${u}`); });
      next += 1;
    }
    const context = m.slice(0, headerAt).map((r) => r.join(' ')).join(' ');
    if (MODEL.test(`${headers.join(' ')} ${context} ${hints.caption || ''}`)) return null;
    const body = m.slice(next).filter((r) => !isSpanned(r));
    if (body.length < 2) return null;
    const kinds = headers.map((h) => classify(h));

    const columnValues = (c) => body.map((r) => clean(r[c]));
    const sizeColumns = headers.map((_, c) => c).filter((c) => !(kinds[c] && kinds[c].kind) && columnValues(c).every(looksLikeSize));
    if (!sizeColumns.length) return null;
    const labelCol = sizeColumns[0];
    const labelSystem = kinds[labelCol] && kinds[labelCol].size;
    const aliasCols = sizeColumns.slice(1).filter((c) => kinds[c] && SYSTEMS.some(([s]) => s === kinds[c].size) && kinds[c].size !== labelSystem);

    const fallbackUnit = unitOfProse(`${context} ${hints.caption || ''}`) || unitOfHint(hints.unit);
    const measured = headers.map((h, c) => ({ c, kind: kinds[c] && kinds[c].kind, unit: unitOfHeader(h) || unitOfValues(columnValues(c)) })).filter((x) => x.kind);
    for (const col of measured) if (!col.unit) col.unit = fallbackUnit;
    const unknown = measured.filter((x) => !x.unit);
    if (unknown.length) {
      const fits = (unit) => unknown.every((x) => columnValues(x.c).every((v) => {
        const r = !v || parseRange(v, unit);
        return r === true || (r && r[0] >= PLAUSIBLE[unit][x.kind][0] && r[1] <= PLAUSIBLE[unit][x.kind][1]);
      }));
      const cm = fits('cm'); const inch = fits('in');
      for (const x of unknown) x.unit = cm !== inch ? (cm ? 'cm' : 'in') : null;
    }
    const usable = measured.filter((x) => x.unit);
    if (!usable.length) return null;
    const unit = usable.some((x) => x.unit === 'cm') ? 'cm' : 'in';

    const columns = {};
    for (const x of usable) if (x.unit === unit && !(x.kind in columns)) columns[x.kind] = x.c;
    const values = {};
    for (const [kind, c] of Object.entries(columns)) {
      const [lo, hi] = PLAUSIBLE[unit][kind];
      const read = columnValues(c).map((v) => (v ? parseRange(v, unit) : null));
      const bad = columnValues(c).some((v, i) => v && (!read[i] || read[i][0] < lo || read[i][1] > hi));
      if (!bad && read.filter(Boolean).length >= 2) values[kind] = read;
    }

    const rows = [];
    body.forEach((r, i) => {
      const row = { label: clean(r[labelCol]), waist: null, hip: null, bust: null, foot_length: null, aliases: {} };
      for (const kind of Object.keys(values)) row[kind] = values[kind][i];
      if (!Object.keys(values).some((k) => row[k])) return;
      for (const c of aliasCols) if (clean(r[c])) row.aliases[kinds[c].size] = clean(r[c]);
      rows.push(row);
    });
    if (rows.length < 2 || new Set(rows.map((r) => r.label.toUpperCase())).size !== rows.length) return null;
    for (const kind of Object.keys(values)) {
      const seen = rows.map((r) => r[kind]).filter(Boolean);
      if (seen.some((v, i) => i && (v[0] < seen[i - 1][0] || v[1] < seen[i - 1][1]))) return null;
    }

    const has = (k) => k in values;
    // Clothing is sized on waist and hip (convertChart drops any row without both), so a table
    // missing either is no chart the engine can use.
    let category;
    if (has('foot_length')) category = 'shoes';
    else if (!has('waist') || !has('hip')) return null;
    else category = has('bust') ? 'general' : 'bottoms';

    let sizeSystem = labelSystem && labelSystem !== 'size' ? labelSystem : null;
    if (!sizeSystem) sizeSystem = rows.every((r) => looksLikeSize(r.label) && r.label.split(/\s*\/\s*/).every((p) => LETTER.test(p))) ? 'letter' : 'mixed';

    return {
      category,
      unit,
      measurement_basis: GARMENT.test(`${headers.join(' ')} ${context} ${hints.caption || ''}`) ? 'garment' : 'body',
      size_system: sizeSystem,
      source_url: hints.url || null,
      source_type: hints.sourceType || null,
      retailer: hints.retailer || null,
      mentions_brand: mentionsBrand(m, hints.caption, hints.brand),
      rows,
      note: hints.note || null,
    };
  }

  function parseGuideMatrix(matrix, hints = {}) {
    if (!Array.isArray(matrix) || matrix.length < 3) return null;
    const m = matrix.map((r) => (Array.isArray(r) ? r.map(clean) : []));
    return readOriented(m.map((r) => r.slice()), hints || {}) || readOriented(transpose(m), hints || {});
  }

  // ---- where else a guide lives: the shop's own size-guide page, a chart image ----------------

  const hostOf = (u) => u.hostname.replace(/^www\./, '');

  // A link's address when it is a page on the shop's own host (www. or not), never the page itself.
  function sameShopUrl(href, pageUrl) {
    if (!href) return null;
    try {
      const page = new URL(pageUrl);
      const u = new URL(href, page);
      if (!/^https?:$/.test(u.protocol) || hostOf(u) !== hostOf(page)) return null;
      u.hash = '';
      page.hash = '';
      return u.href === page.href ? null : u.href;
    } catch {
      return null;
    }
  }

  // Whether an image's alt text or file name says it is a size chart.
  const CHART_IMAGE = /size|guide|chart|taille|gr(ö|o)(ß|ss)e|talla|taglia/i;
  function chartImageName(src, alt) {
    if (CHART_IMAGE.test(clean(alt))) return true;
    let file = '';
    try { file = decodeURIComponent(new URL(src, 'https://x.invalid/').pathname.split('/').pop() || ''); } catch { file = ''; }
    return CHART_IMAGE.test(file);
  }

  const GUIDE_FETCH_TIMEOUT_MS = 3000;

  // The size-guide page's HTML: one GET without the shopper's cookies, HTML only, still on the shop's
  // host after any redirect, abandoned after the time limit. Null on anything else.
  async function fetchGuideText(url, { fetch, pageUrl, timeoutMs = GUIDE_FETCH_TIMEOUT_MS }) {
    const target = sameShopUrl(url, pageUrl);
    if (!target) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(target, { method: 'GET', credentials: 'omit', redirect: 'follow', signal: ctrl.signal, headers: { Accept: 'text/html' } });
      if (!res.ok) return null;
      if (res.url && res.url !== target && !sameShopUrl(res.url, pageUrl)) return null;
      if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') || '')) return null;
      const text = await res.text();
      return text.slice(0, 3000000);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // When the page prints no size table, look where else the shop keeps its chart before the lookup:
  // the shop's own size-guide page (fetched once per page, without cookies, 3 s at most), then one size
  // chart image, read by the read-chart-image function. Skipped when the lookup would not run anyway,
  // so neither the page fetch nor the image read happens for a brand already answered or missed.
  // deps: message (to the service worker), fetch, pageUrl, guideFromHtml, withImageChart, and
  // firstTry, true the first time it is asked on a page.
  async function moreGuide(product, want, deps) {
    const guide = product.shopGuide;
    if (guide && guide.charts.length) return guide;
    const wanted = await deps.message({ type: 'sizer:lookup-wanted', brand: want.brand, kind: want.kind });
    if (!wanted || !wanted.wanted) return guide;
    let images = product.guideImages || [];
    if (product.guideLink && deps.firstTry()) {
      const html = await fetchGuideText(product.guideLink, { fetch: deps.fetch, pageUrl: deps.pageUrl });
      if (html) {
        const page = deps.guideFromHtml(html, product.guideLink, want.brand);
        if (page.charts.length) return { charts: page.charts, caption: page.caption };
        images = images.concat(page.images.filter((u) => !images.includes(u)));
      }
    }
    // One image, the likeliest: each read counts against the daily caps.
    if (images.length) {
      const read = await deps.message({ type: 'sizer:read-chart-image', image_url: images[0], brand: want.brand, kind: want.kind });
      if (read && read.chart) return deps.withImageChart(guide, read.chart);
    }
    return guide;
  }

  const api = { parseGuideMatrix, mentionsBrand, parseRange, looksLikeSize, PLAUSIBLE, sameShopUrl, chartImageName, fetchGuideText, moreGuide, GUIDE_FETCH_TIMEOUT_MS };
  root.SizerGuideTable = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
