// Reads brand, title, fit/fabric text, sizes and stock, and finds the size picker on a product page.
(function (root) {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const OURS = '#sizer-inline, #sizer-panel, #sizer-pill';

  const REVIEW_AREA = '[class*="review" i], [id*="review" i], [data-testid*="review" i], [itemprop="review"]';

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
      if (el.closest(OURS) || el.closest(`${REVIEW_AREA}, [class*="recommend" i], [class*="carousel" i], footer, nav`)) continue;
      const t = spacedText(el, REVIEW_AREA);
      if (t.length < 15 || seen.some((s) => s.includes(t))) continue;
      seen.push(t.slice(0, 3000));
      total += t.length;
      if (total > 20000) break;
    }
    return seen.join('\n');
  }

  const REVIEW_SEL = [
    '[itemprop="reviewBody"]',
    '[class*="review" i] [class*="text" i]', '[class*="review" i] [class*="body" i]', '[class*="review" i] [class*="content" i]', '[class*="review" i] [class*="comment" i]',
    '[data-testid*="review" i] p', '[class*="review" i] p', '[id*="review" i] p',
  ].join(',');

  // What buyers wrote, one string per review, from structured data first and the page second.
  function extractReviews(doc, ld) {
    const out = [];
    for (const r of [].concat((ld && ld.review) || [])) {
      const body = clean(r && r.reviewBody);
      if (body) out.push(body);
    }
    for (const el of doc.querySelectorAll(REVIEW_SEL)) {
      if (el.closest(OURS) || el.querySelector('p')) continue;
      const t = spacedText(el);
      if (t.length < 10 || t.length > 2000 || out.some((s) => s === t || s.includes(t))) continue;
      out.push(t);
      if (out.length >= 200) break;
    }
    return out;
  }

  // A shop's own fit bar from reviews, like "68% say it runs small".
  function reviewSummary(doc) {
    for (const el of doc.querySelectorAll('[class*="fit" i], [data-testid*="fit" i], [class*="review" i], [id*="review" i]')) {
      if (el.closest(OURS) || el.querySelectorAll('*').length > 60) continue;
      const t = spacedText(el);
      if (/\d{1,3}\s?%[^.%\d]{0,40}(small|true to size|as expected|large|big)/i.test(t)) return t.slice(0, 600);
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

  function isUnavailable(el, text) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    const cls = `${typeof el.className === 'string' ? el.className : ''} ${el.parentElement && typeof el.parentElement.className === 'string' ? el.parentElement.className : ''}`;
    return /disabled|unavailable|sold-?out|out-?of-?stock|\boos\b/i.test(cls) || /sold out|out of stock|notify me|set a reminder|ausverkauft|benachrichtig|épuisé|agotad/i.test(text);
  }

  // Size option elements currently in the page, with the size each one stands for.
  function optionElements(doc, parse) {
    const out = [];
    for (const el of doc.querySelectorAll(OPTION_SEL)) {
      if (el.closest(OURS) || el.childElementCount > 6) continue;
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
    '[class*="size-picker" i]', '[class*="sizePicker" i]', '[class*="size-selector" i]', '[class*="sizeSelector" i]',
    'select[name*="size" i]', 'select[id*="size" i]', '[role="radiogroup"][aria-label*="size" i]', '[role="listbox"][aria-label*="size" i]',
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

  function extractProduct(doc, engine) {
    const ld = jsonLdProduct(doc);
    const ldBrand = ld && (typeof ld.brand === 'string' ? ld.brand : ld.brand && ld.brand.name);
    const h1El = doc.querySelector('h1');
    const h1 = h1El ? spacedText(h1El) : '';
    const title = clean((ld && ld.name) || meta(doc, 'meta[property="og:title"]') || h1 || doc.title);
    const brandEl = doc.querySelector('[itemprop="brand"], [data-testid*="brand" i], [class*="brand-name" i], [class*="product-brand" i]');
    const brand = clean(ldBrand || meta(doc, 'meta[property="product:brand"]') || (brandEl ? spacedText(brandEl) : '').slice(0, 60));

    const description = clean(ld && ld.description);
    let text = [description, detailText(doc)].filter(Boolean).join('\n');
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
      url: location.href,
      isProduct: !!ld || (sizes.length >= 2 && !!(brandGuess || title)),
    };
  }

  root.SizerExtract = { extractProduct, findPicker, optionElements };
})(globalThis);
