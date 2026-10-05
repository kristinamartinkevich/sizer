// Reads brand, title, fit/fabric text, sizes and stock, and finds the size picker on a product page.
(function (root) {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const OURS = '#sizer-inline, #sizer-panel, #sizer-pill';

  const REVIEW_AREA = '[class*="review" i], [id*="review" i], [data-testid*="review" i], [itemprop="review"]';
  // Cookie banners and consent dialogs: never product text.
  const CONSENT = '#onetrust-consent-sdk, [id^="onetrust" i], [id^="ot-" i], [class*="cookie" i], [class*="consent" i], [id*="cookie" i]';
  const CHROME = `${CONSENT}, [role="dialog"]`;

  // textContent glues sibling labels together ("Fit:RelaxedShape"), which breaks word matching.
  // `skip` keeps buyers' reviews out of the page's own text, so a reviewer's "runs small" is never read as the shop's.
  function spacedText(el, skip) {
    const parts = [];
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(skip ? `script, style, noscript, svg, ${skip}` : 'script, style, noscript, svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return clean(parts.join(' '));
  }

  function jsonLdProduct(doc) {
    for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(el.textContent); } catch { continue; }
      const stack = [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object') continue;
        if (Array.isArray(n)) { stack.push(...n); continue; }
        const type = [].concat(n['@type'] || []);
        if (type.includes('Product') || type.includes('ProductGroup')) return n;
        if (n['@graph']) stack.push(n['@graph']);
      }
    }
    return null;
  }

  const OUT_OF_STOCK = /OutOfStock|SoldOut|Discontinued/i;

  function variantSizes(ld) {
    const variants = ld && [].concat(ld.hasVariant || []);
    if (!variants || !variants.length) return [];
    const out = new Map();
    for (const v of variants) {
      const size = clean(typeof v.size === 'object' ? v.size && v.size.name : v.size);
      if (!size) continue;
      const availability = [].concat(v.offers || []).map((o) => o && o.availability).filter(Boolean).join(' ');
      const available = availability ? !OUT_OF_STOCK.test(availability) : null;
      if (!out.has(size) || available) out.set(size, { label: size, available, sku: v.sku || null });
    }
    return [...out.values()];
  }

  function meta(doc, sel) {
    const el = doc.querySelector(sel);
    return el ? clean(el.getAttribute('content')) : '';
  }

  const DETAIL_SEL = [
    '[data-testid^="pdp-accordion" i]',
    '[class*="description" i]', '[id*="description" i]', '[data-testid*="description" i]',
    '[class*="detail" i]', '[id*="detail" i]', '[data-testid*="detail" i]',
    '[class*="size-fit" i]', '[class*="sizefit" i]', '[class*="fit" i][class*="size" i]', '[data-testid*="fit" i]',
    '[class*="composition" i]', '[class*="material" i]', '[data-testid*="material" i]',
    '[class*="accordion" i]', '[class*="product-info" i]', '[class*="pdp" i] section',
  ].join(',');

  function detailText(doc) {
    const seen = [];
    let total = 0;
    for (const el of doc.querySelectorAll(DETAIL_SEL)) {
      // A page-level wrapper that happens to match (Revolve's <body class="…detail…">) would swamp the real details with header text.
      if (el === doc.body || el === doc.documentElement || el.tagName === 'MAIN') continue;
      if (el.closest(OURS) || el.closest(`${REVIEW_AREA}, ${CHROME}, [class*="recommend" i], [class*="carousel" i], footer, nav`)) continue;
      const t = spacedText(el, REVIEW_AREA);
      if (t.length < 15 || t.length > 12000 || seen.some((s) => s.includes(t))) continue;
      seen.push(t.slice(0, 3000));
      total += t.length;
      if (total > 20000) break;
    }
    return seen.join('\n');
  }

  // Shops print the fit note anywhere near the picker ("The size runs small so we recommend going one
  // size up"), not only inside the details. Short standalone sentences that read like one are kept.
  const FIT_NOTE = /\b(runs?|fits?|comes? up|sized?)\s+(a\s+)?(bit\s+|little\s+|half\s+)?(small|large|big|narrow|wide|tight|loose|long|short|true to size)\b|\b(size|go(ing)?|order)\s+(up|down)\b|one size (up|down)/i;

  function fitNoteText(doc) {
    const out = [];
    for (const el of doc.querySelectorAll('p, span, div, li')) {
      if (el.children.length > 2 || el.closest(OURS) || el.closest(`${REVIEW_AREA}, footer, nav`)) continue;
      const t = clean(el.textContent);
      if (t.length < 12 || t.length > 240 || !FIT_NOTE.test(t) || out.includes(t)) continue;
      out.push(t);
      if (out.length >= 5) break;
    }
    return out.join('\n');
  }

  const REVIEW_BODY_SEL = '[itemprop="reviewBody"], .yotpo-read-more-text, [class*="review-text" i], [class*="review_text" i], [class*="reviewText" i], [class*="review-body" i], [class*="reviewBody" i], [class*="review-content" i] p, [data-testid*="review-body" i], [data-testid*="review-text" i]';
  const REVIEW_SEL = [
    '[itemprop="reviewBody"]',
    '[class*="review" i] [class*="text" i]', '[class*="review" i] [class*="body" i]', '[class*="review" i] [class*="content" i]', '[class*="review" i] [class*="comment" i]',
    '[data-testid*="review" i] p', '[class*="review" i] p', '[id*="review" i] p',
  ].join(',');

  // One review is one card: its title, stars line and body together, so a title and a body that both
  // say "runs small" count once. Shop boilerplate that lives among the cards is dropped.
  const REVIEW_CARD = 'article, li, [role="group"], [itemprop="review"], [class*="review-item" i], [class*="review_item" i], [class*="reviewItem" i], [class*="review-card" i], [class*="reviewCard" i], .review, .yotpo-review';
  const BOILERPLATE = /^\d(\.\d)?\s*(stars?|out of|étoiles?)|^verified|customers recommend|how we collect reviews|^(read|view) (more|all)|^report|^helpful|^was this|^bas[ée] sur \d+ avis|^based on \d+ reviews?|^(note|rating|toutes les évaluations|all ratings)\b|^\d+ (avis|reviews?)$|^(\d+ (étoiles?|stars?)\s*)+$/i;

  // What buyers wrote, one string per review, from structured data first and the page second.
  function extractReviews(doc, ld) {
    const out = [];
    for (const r of [].concat((ld && ld.review) || [])) {
      const body = clean(r && r.reviewBody);
      if (body) out.push(body);
    }
    // When the widget marks review bodies explicitly, only those count; the broad scan is for shops that don't.
    const explicit = [...doc.querySelectorAll(REVIEW_BODY_SEL)].filter((el) => !el.closest(OURS));
    const cards = new Set();
    for (const el of explicit.length ? explicit : doc.querySelectorAll(REVIEW_SEL)) {
      if (el.closest(OURS) || el.querySelector('p')) continue;
      const card = el.closest(REVIEW_CARD);
      const unit = card && card.querySelectorAll('p').length <= 12 ? card : el;
      if (cards.has(unit)) continue;
      cards.add(unit);
      const t = unit === el ? spacedText(el) : [...unit.querySelectorAll('p, [class*="text" i], [class*="body" i]')].map((p) => spacedText(p)).filter((s) => s && !BOILERPLATE.test(s)).join(' ');
      if (t.length < 10 || t.length > 2000 || BOILERPLATE.test(t) || out.some((s) => s === t || s.includes(t))) continue;
      out.push(t);
      if (out.length >= 200) break;
    }
    return out;
  }

  // A shop's own fit bar from reviews, like "68% say it runs small", or a labelled slider whose
  // accessible name reads "Fit is Runs Small." (ASOS). The review count nearby is kept for the total.
  function reviewSummary(doc) {
    for (const el of doc.querySelectorAll('[class*="fit" i], [data-testid*="fit" i], [class*="review" i], [id*="review" i]')) {
      if (el.closest(OURS) || el.querySelectorAll('*').length > 60) continue;
      const t = spacedText(el);
      if (/\d{1,3}\s?%[^.%\d]{0,40}(small|true to size|as expected|large|big)/i.test(t)) return t.slice(0, 600);
    }
    for (const el of doc.querySelectorAll('[aria-label^="Fit is" i], [aria-label*="size based on reviews" i]')) {
      if (el.closest(OURS)) continue;
      const label = clean(el.getAttribute('aria-label'));
      const area = el.closest(REVIEW_AREA);
      const count = area && (spacedText(area).match(/\(?\d[\d,.]*\s+reviews?\)?/i) || [])[0];
      return count ? `${label} ${count}` : label;
    }
    return '';
  }

  const OPTION_SEL = [
    'select option',
    'label[for*="size" i]',
    '[data-testid*="size" i] button', '[data-testid*="size" i] li', '[data-testid*="size" i] label', '[data-testid*="size" i] [role="option"]',
    '[class*="size" i] button', '[class*="size" i] li', '[class*="size" i] label', '[class*="size" i] [role="option"]', '[class*="size" i] [role="radio"]',
    '[id*="size" i] button', '[id*="size" i] li', '[id*="size" i] option',
    '[role="listbox"] [role="option"]', '[role="radiogroup"] [role="radio"]',
  ].join(',');

  // The option the shopper sees is often a label or list item; the disabled flag sits on the input it wraps.
  function inputOf(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'OPTION') return el;
    if (el.tagName === 'LABEL' && el.control) return el.control;
    return el.querySelector('input, option') || (el.previousElementSibling && el.previousElementSibling.tagName === 'INPUT' ? el.previousElementSibling : null);
  }

  function isUnavailable(el, text) {
    const input = inputOf(el);
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    if (input && (input.disabled || input.getAttribute('aria-disabled') === 'true' || input.dataset.qty === '0')) return true;
    const cls = `${typeof el.className === 'string' ? el.className : ''} ${el.parentElement && typeof el.parentElement.className === 'string' ? el.parentElement.className : ''}`;
    return /disabled|unavailable|sold-?out|out-?of-?stock|\boos\b/i.test(cls) || /sold out|out of stock|notify me|set a reminder|ausverkauft|benachrichtig|épuisé|agotad/i.test(text);
  }

  // Size option elements currently in the page, with the size each one stands for.
  function optionElements(doc, parse) {
    const out = [];
    for (const el of doc.querySelectorAll(OPTION_SEL)) {
      // Review widgets carry their own "options" (star filters, "5 4 3 2 1") that parse as sizes.
      if (el.closest(OURS) || el.childElementCount > 6 || el.closest(`${REVIEW_AREA}, [class*="yotpo" i], [class*="rating" i], ${CHROME}`)) continue;
      const text = spacedText(el) || clean(el.getAttribute('aria-label'));
      if (!text || text.length > 48) continue;
      const p = parse(text.replace(/^(size|größe|taille|talla|taglia)\s*:?\s*/i, ''));
      if (!p) continue;
      out.push({ el, label: p.label.trim(), available: !isUnavailable(el, text) });
    }
    return out;
  }

  function domSizes(doc, parse) {
    const out = new Map();
    for (const o of optionElements(doc, parse)) {
      if (!out.has(o.label) || (o.available && out.get(o.label).available === false)) out.set(o.label, { label: o.label, available: o.available });
    }
    return [...out.values()];
  }

  const PICKER_SEL = [
    '[data-testid*="size-picker" i]', '[data-testid*="sizepicker" i]', '[data-testid*="size-selector" i]', '[data-testid*="sizeselector" i]',
    '[data-testid*="variant-selector" i]',
    '[class*="size-picker" i]', '[class*="sizePicker" i]', '[class*="size-selector" i]', '[class*="sizeSelector" i]',
    'select[name*="size" i]', 'select[id*="size" i]', 'select[id*="variant" i]', '[role="radiogroup"][aria-label*="size" i]', '[role="listbox"][aria-label*="size" i]',
  ].join(',');

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 16 && getComputedStyle(el).visibility !== 'hidden';
  };

  // The element Sizer's answer line goes directly after.
  function findPicker(doc, parse) {
    for (const el of doc.querySelectorAll(PICKER_SEL)) {
      if (el.tagName === 'INPUT' || el.closest(OURS) || !visible(el)) continue;
      return el;
    }
    const opts = optionElements(doc, parse).filter((o) => visible(o.el));
    if (opts.length >= 2) {
      let a = opts[0].el.parentElement;
      while (a && !a.contains(opts[1].el)) a = a.parentElement;
      if (a && a !== doc.body) return a;
    }
    return null;
  }

  const GUIDE_NAME = /size[\s_-]*(guide|chart)|guide des tailles|tableau des tailles|gr(ö|o)(ß|ss)entabelle|tabla de tallas|guida alle taglie/i;

  function namesGuide(el) {
    for (const a of el.attributes || []) if (/^(id|class|aria-label|title)$|^data-/.test(a.name) && GUIDE_NAME.test(a.value)) return clean(a.name === 'aria-label' || a.name === 'title' ? a.value : '');
    return null;
  }

  // The size-guide label a table sits under: on the table, on an ancestor within six levels, or in a
  // short heading just before either. Returns the caption text ('' when only an attribute names it), or null.
  function guideCaption(table) {
    const own = table.querySelector('caption');
    if (own && GUIDE_NAME.test(own.textContent)) return clean(own.textContent);
    let el = table;
    for (let depth = 0; el && el !== el.ownerDocument.body && depth <= 6; depth += 1, el = el.parentElement) {
      const named = namesGuide(el);
      let sib = el.previousElementSibling;
      for (let i = 0; sib && i < 2; i += 1, sib = sib.previousElementSibling) {
        const t = clean(sib.textContent);
        if (t.length <= 120 && GUIDE_NAME.test(t)) return t;
      }
      if (named != null) return named;
    }
    return null;
  }

  // The table as a grid of cell strings, colspan and rowspan expanded.
  function tableMatrix(table) {
    const grid = table.tagName === 'TABLE'
      ? [...table.rows].map((r) => [...r.cells])
      : [...table.querySelectorAll('[role="row"]')].filter((r) => r.closest('[role="table"]') === table)
        .map((r) => [...r.querySelectorAll('[role="cell"], [role="gridcell"], [role="columnheader"], [role="rowheader"]')]);
    if (!grid.length || grid.length > 40) return null;
    const out = grid.map(() => []);
    grid.forEach((cells, r) => {
      let c = 0;
      for (const cell of cells) {
        while (out[r][c] != null) c += 1;
        const text = spacedText(cell);
        const span = Math.min(+(cell.getAttribute('colspan') || cell.getAttribute('aria-colspan')) || 1, 20);
        const down = Math.min(+(cell.getAttribute('rowspan') || cell.getAttribute('aria-rowspan')) || 1, grid.length - r);
        for (let i = 0; i < down; i += 1) for (let j = 0; j < span; j += 1) out[r + i][c + j] = text;
        c += span;
      }
    });
    if (out.some((row) => row.length > 20)) return null;
    return out.map((row) => Array.from(row, (v) => v || ''));
  }

  // Size tables the page prints in or near its size guide. Guides often live in a modal, so dialogs
  // are searched; consent banners and buyers' reviews are not.
  function sizeGuideTables(doc, brand, url) {
    const G = root.SizerGuideTable;
    const charts = [];
    let caption = null;
    let found = 0;
    for (const table of doc.querySelectorAll('table, [role="table"]')) {
      if (found >= 30) break;
      if (table.closest(OURS) || table.closest(`${REVIEW_AREA}, ${CONSENT}`) || table.querySelector('table, [role="table"]')) continue;
      const label = guideCaption(table);
      if (label == null) continue;
      found += 1;
      if (caption == null || (!caption && label)) caption = label;
      const matrix = tableMatrix(table);
      const chart = matrix && G.parseGuideMatrix(matrix, { brand, caption: label, url });
      if (chart && !charts.some((c) => JSON.stringify(c.rows) === JSON.stringify(chart.rows))) charts.push(chart);
    }
    return found ? { charts, caption: caption || '' } : null;
  }

  function extractProduct(doc, engine) {
    const ld = jsonLdProduct(doc);
    const ldBrand = ld && (typeof ld.brand === 'string' ? ld.brand : ld.brand && ld.brand.name);
    const h1El = doc.querySelector('h1');
    const h1 = h1El ? spacedText(h1El) : '';
    const title = clean((ld && ld.name) || meta(doc, 'meta[property="og:title"]') || h1 || doc.title);
    const brandEl = doc.querySelector('[itemprop="brand"], [data-testid*="brand" i], [class*="brand-name" i], [class*="product-brand" i]');
    const brand = clean(ldBrand || meta(doc, 'meta[property="product:brand"]') || (brandEl ? spacedText(brandEl) : '').slice(0, 60));

    const description = clean(ld && ld.description);
    let text = [description, detailText(doc), fitNoteText(doc)].filter(Boolean).join('\n');
    if (text.length < 200) {
      const main = doc.querySelector('main') || doc.body;
      text += `\n${main ? spacedText(main, REVIEW_AREA).slice(0, 20000) : ''}`;
    }
    const reviews = extractReviews(doc, ld);

    const fromLd = variantSizes(ld);
    const sizes = fromLd.length ? fromLd : domSizes(doc, engine.parseSizeLabel);
    const brandGuess = brand || ([title, h1, doc.title].map((s) => engine.findBrand(s)).find(Boolean) || {}).name || '';
    return {
      brand: brandGuess,
      title,
      text,
      sizes,
      reviews,
      reviewSummary: reviewSummary(doc),
      shopGuide: sizeGuideTables(doc, brandGuess, location.href),
      url: location.href,
      isProduct: !!ld || (sizes.length >= 2 && !!(brandGuess || title)),
    };
  }

  root.SizerExtract = { extractProduct, findPicker, optionElements, sizeGuideTables };
})(globalThis);
