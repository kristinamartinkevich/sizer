// Reads brand, title, fit/fabric text and the size picker from a product page.
(function (root) {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

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

  function meta(doc, sel) {
    const el = doc.querySelector(sel);
    return el ? clean(el.getAttribute('content')) : '';
  }

  const DETAIL_SEL = [
    '[class*="description" i]', '[id*="description" i]', '[data-testid*="description" i]',
    '[class*="detail" i]', '[id*="detail" i]', '[data-testid*="detail" i]',
    '[class*="size-fit" i]', '[class*="sizefit" i]', '[class*="fit" i][class*="size" i]', '[data-testid*="fit" i]',
    '[class*="composition" i]', '[class*="material" i]', '[data-testid*="material" i]',
    '[class*="accordion" i]', '[class*="product-info" i]', '[class*="pdp" i] section',
  ].join(',');

  function detailText(doc) {
    const seen = new Set();
    const parts = [];
    let total = 0;
    for (const el of doc.querySelectorAll(DETAIL_SEL)) {
      if (el.closest('#sizer-root') || el.closest('[class*="review" i], [class*="recommend" i], [class*="carousel" i], footer, nav')) continue;
      const t = clean(el.textContent);
      if (t.length < 15 || seen.has(t) || [...seen].some((s) => s.includes(t))) continue;
      seen.add(t);
      parts.push(t.slice(0, 3000));
      total += t.length;
      if (total > 20000) break;
    }
    return parts.join('\n');
  }

  const SIZE_SEL = [
    'select option',
    '[data-testid*="size" i] button', '[data-testid*="size" i] li', '[data-testid*="size" i] label', '[data-testid*="size" i] [role="option"]',
    '[class*="size" i] button', '[class*="size" i] li', '[class*="size" i] label', '[class*="size" i] [role="option"]', '[class*="size" i] [role="radio"]',
    '[id*="size" i] button', '[id*="size" i] li', '[id*="size" i] option',
    '[aria-label*="size" i]', '[role="listbox"] [role="option"]', '[role="radiogroup"] [role="radio"]',
  ].join(',');

  function isUnavailable(el, text) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    const cls = `${el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className} ${el.parentElement ? el.parentElement.className : ''}`;
    return /disabled|unavailable|sold-?out|out-?of-?stock|\boos\b/i.test(cls) || /sold out|out of stock|notify me|ausverkauft|benachrichtig|épuisé|agotad/i.test(text);
  }

  function sizeOptions(doc, parse) {
    const out = new Map();
    for (const el of doc.querySelectorAll(SIZE_SEL)) {
      if (el.closest('#sizer-root') || el.childElementCount > 4) continue;
      const text = clean(el.getAttribute('aria-label') && !el.textContent.trim() ? el.getAttribute('aria-label') : el.textContent);
      if (!text || text.length > 40) continue;
      const p = parse(text.replace(/^(size|größe|taille|talla|taglia)\s*:?\s*/i, ''));
      if (!p) continue;
      const label = p.label.trim();
      const available = !isUnavailable(el, text);
      if (!out.has(label) || (available && out.get(label).available === false)) out.set(label, { label, available });
    }
    if (out.size < 2) {
      for (const s of doc.querySelectorAll('script:not([src])')) {
        const re = /"(?:size|sizeName|size_name|displaySize)"\s*:\s*"([^"]{1,12})"/g;
        let m;
        while ((m = re.exec(s.textContent)) && out.size < 40) {
          const p = parse(m[1]);
          if (p && !out.has(p.label.trim())) out.set(p.label.trim(), { label: p.label.trim(), available: null });
        }
      }
    }
    return [...out.values()];
  }

  function extractProduct(doc, engine) {
    const ld = jsonLdProduct(doc);
    const ldBrand = ld && (typeof ld.brand === 'string' ? ld.brand : ld.brand && ld.brand.name);
    const h1 = clean(doc.querySelector('h1') && doc.querySelector('h1').textContent);
    const title = clean((ld && ld.name) || meta(doc, 'meta[property="og:title"]') || h1 || doc.title);
    const brandEl = doc.querySelector('[itemprop="brand"], [data-testid*="brand" i], [class*="brand-name" i], [class*="product-brand" i]');
    const brand = clean(ldBrand || meta(doc, 'meta[property="product:brand"]') || (brandEl ? brandEl.textContent : '').slice(0, 60));

    const description = clean(ld && ld.description);
    let text = [description, detailText(doc)].filter(Boolean).join('\n');
    if (text.length < 200) {
      const main = doc.querySelector('main') || doc.body;
      text += `\n${clean(main ? main.textContent : '').slice(0, 20000)}`;
    }

    const sizes = sizeOptions(doc, engine.parseSizeLabel);
    const brandGuess = brand || [title, h1, doc.title].map((s) => engine.findBrand(s)).find(Boolean)?.name || '';
    return {
      brand: brandGuess,
      title,
      text,
      sizes,
      url: location.href,
      isProduct: !!ld || (sizes.length >= 2 && !!(brandGuess || title)),
    };
  }

  root.SizerExtract = { extractProduct };
})(globalThis);
