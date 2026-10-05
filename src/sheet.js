(function (root) {
  // The reasoning sheet's content for one answer: the figure, where it fits, the reasons and what
  // Sizer read on the page. Markup only, from the engine's result and the page's sizes, so the sheet
  // on a shop page and the side panel show the same thing.
  const Engine = root.SizerEngine || (typeof require === 'function' ? require('./engine.js') : null);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dots(conf) {
    const n = { High: 3, Medium: 2, Low: 1 }[conf] || 0;
    return `<span class="dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  // What buyers wrote about fit, as one line for the folded read-out.
  function reviewsFact(rv) {
    if (!rv || !rv.total) return null;
    if (!rv.mentions) return ['Reviews', `${rv.total} read, none mention fit`];
    const parts = [rv.small && `${rv.small} small`, rv.large && `${rv.large} large`, rv.tts && `${rv.tts} true to size`].filter(Boolean);
    const where = rv.vendors ? ` on ${rv.vendors + (rv.local && rv.local.total ? 1 : 0)} shops` : '';
    return ['Reviews', `${rv.mentions} of ${rv.total}${where} mention fit: ${parts.join(', ')}`];
  }

  // Under the reasons: "Checking what others say" while the dossier is out, then its sources as links
  // (http and https only, escaped).
  function webBlock(r, checking) {
    if (checking) return '<p class="checking" aria-live="polite">Checking what others say about the fit</p>';
    const d = r.dossier;
    const links = d ? d.sources.filter((s) => /^https?:\/\//i.test(String(s.url || ''))) : [];
    if (!links.length) return '';
    return `<h3>What others say online</h3>
      ${d.brand_note ? `<p class="web-note">${esc(d.brand_note)}</p>` : ''}
      <ul class="sources">${links.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a></li>`).join('')}</ul>`;
  }

  // r is the engine's result; p is the product as read (only its sizes are used); opts.checking while
  // the fit-dossier request is out.
  function body(r, p, opts = {}) {
    if (!r) return '<p class="empty">Sizer couldn’t find a product or size picker on this page.</p>';
    if (r.needsProfile) return `<p class="empty">${esc(r.reason)}</p>`;
    if (!r.ok) return `<p class="empty">${esc(r.reason)}</p>`;
    const s = r.signals;
    const sizes = (p && p.sizes) || [];
    const norm = (x) => String(x || '').replace(/\s+/g, '').toUpperCase();
    const chip = (x) => `<span class="chip${x.available === false ? ' gone' : ''}${norm(x.label) === norm(r.size) ? ' pick' : ''}">${esc(x.label)}</span>`;
    const stockKnown = sizes.some((x) => x.available != null);
    const inStock = sizes.filter((x) => x.available !== false);
    const soldOut = sizes.filter((x) => x.available === false);
    const facts = [
      ['Brand', esc(Engine.provenance(r).brandFact)],
      r.shoes ? null : ['Stretch', { none: 'None', slight: 'A little', high: 'Lots', unknown: 'Not stated' }[s.stretch] + (s.elastanePct ? `, ${s.elastanePct}% elastane` : '')],
      ['Fit note', s.fitNote ? `“${esc(s.fitNoteText)}”` : 'None'],
      s.modelSize && !r.shoes ? ['Model', `Wears ${esc(s.modelSize)}${s.modelHeight ? `, ${s.modelHeight} cm tall` : ''}`] : null,
      reviewsFact(r.reviews),
      !sizes.length ? ['Sizes', 'Not found']
        : !stockKnown ? ['Sizes', sizes.map(chip).join('')]
          : ['In stock', inStock.length ? inStock.map(chip).join('') : 'None'],
      stockKnown && soldOut.length ? ['Sold out', soldOut.map(chip).join('')] : null,
    ].filter(Boolean);
    // Three stops for the eye: the figure, the reasons, and everything else folded away.
    const nearest = r.inStock ? [r.inStock.size, r.inStock.other && r.inStock.other.size].filter(Boolean).map(norm) : [];
    const stockChip = (x) => `<span class="chip${nearest.includes(norm(x.label)) ? ' pick' : ''}">${esc(x.label)}</span>`;
    const areas = Engine.sheetAreas(r);
    return `
      <div class="hero">
        <div class="k">${r.confidence === 'Low' ? 'Rough guess' : 'Your size'}</div>
        <div class="big">${esc(r.size)}</div>
        <div class="headline${r.headline === 'Your usual fit' ? '' : ' moved'}">${esc(r.headline)}<span class="meter" title="${esc(r.confidence)} confidence">${dots(r.confidence)}</span></div>
        ${r.firmUp ? `<p class="firm">${esc(r.firmUp)}</p>` : ''}
      </div>
      ${r.stockText ? `<div class="stock"><p>${esc(r.stockText)}</p>${inStock.length ? `<div class="chips">${inStock.map(stockChip).join('')}</div>` : ''}</div>`
        : r.alternative ? `<p class="alt">Or <b>${esc(r.alternative.size)}</b> ${esc(r.alternative.why)}.</p>` : ''}
      ${areas.length ? `<h3>Where it fits</h3><ul class="areas">${areas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <h3>Why this size</h3>
      <ol>${r.reasons.map((x) => `<li><span>${esc(x.text)}</span>${x.delta ? `<em>${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)} size</em>` : ''}</li>`).join('')}</ol>
      ${webBlock(r, opts.checking)}
      <details class="more">
        <summary>What Sizer read on this page</summary>
        <div class="facts">${facts.map(([k, v]) => `<div class="fact"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
      </details>`;
  }

  // Where the chart came from, worded by how far it can be trusted, with a link to the page it was read from.
  function sourceLine(r) {
    if (!r || !r.ok) return 'Size charts are approximate.';
    const f = Engine.provenance(r).footer;
    const link = f.link && f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.link)}</a>` : esc(f.link || '');
    return `${esc(f.lead)}${link}${esc(f.tail)}`;
  }

  const api = { body, sourceLine, reviewsFact, dots, esc, webBlock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerSheet = api;
})(globalThis);
