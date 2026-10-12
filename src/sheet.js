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
    const shopCount = rv.vendors + (rv.local && rv.local.total ? 1 : 0);
    const where = rv.vendors ? ` on ${shopCount === 1 ? 'one shop' : `${shopCount} shops`}` : '';
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

  // ---- one size at a time: your body, this garment, other countries ----
  // After Minga London's size guide: one row of sizes drives every tab, so a shopper compares any
  // size with their own measurements without finding a row in a table.

  const KEY_NAME = { bust: 'Bust', waist: 'Waist', hip: 'Hip' };
  const SYSTEM_NAME = { uk: 'UK', eu: 'EU', us: 'US', it: 'IT' };
  const TABS = [['body', 'Your body'], ['garment', 'This garment'], ['conv', 'Other countries']];
  const cm = (v) => String(Math.round(v));
  const sameLabel = (a, b) => String(a || '').replace(/\s+/g, '').toUpperCase() === String(b || '').replace(/\s+/g, '').toUpperCase();

  // Where you sit in a size's range, in words. Half a centimetre either side still counts as inside.
  // Looser or tighter is said only as far from the size's middle as the fit lines say roomy or tight
  // (engine fitAreas), so the tab never contradicts "Fits as expected".
  function where(you, range, stretch) {
    const [lo, hi] = range;
    const d = you - (lo + hi) / 2;
    const tightFrom = stretch === 'none' ? 1.5 : stretch === 'high' ? 3.5 : 2.5;
    if (you < lo - 0.5) return `${cm(lo - you)} cm under this size’s range${d <= -4 ? ', so looser' : ''}`;
    if (you > hi + 0.5) return `${cm(you - hi)} cm over this size’s range${d >= tightFrom ? ', so tighter' : ''}`;
    const top = Math.round(hi - you);
    return top <= 0 ? 'Inside this size’s range, at the top' : `Inside this size’s range, ${top} cm from the top`;
  }

  // The range as a bar with you as a tick. SVG geometry rather than inline styles, which some shops'
  // content security policies refuse.
  function bar(you, range) {
    const [lo, hi] = range;
    const pad = Math.max(hi - lo, Math.abs(you - (lo + hi) / 2) - (hi - lo) / 2 + 2);
    const a = lo - pad;
    const span = hi + pad - a;
    const x = (v) => (((v - a) / span) * 100).toFixed(1);
    return `<svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="track" x="0" y="4.5" width="100" height="1"/><rect class="range" x="${x(lo)}" y="3" width="${(((hi - lo) / span) * 100).toFixed(1)}" height="4"/><rect class="you" x="${(x(you) - 0.4).toFixed(1)}" y="0" width="0.8" height="10"/></svg>`;
  }

  // The sizes the row offers: the page's, or the chart's own when the page shows none yet.
  function tableSizes(r) {
    const t = r.table;
    if (t.sizes.length) return { sizes: t.sizes, yours: t.sizes.findIndex((s) => sameLabel(s.label, r.size)) };
    return { sizes: t.rows.map((row, i) => ({ label: row.label, available: null, row: i })), yours: r.pickIndex };
  }

  function panelHTML(r, size, tab, isYours) {
    const t = r.table;
    const row = size.row == null ? null : t.rows[size.row];
    if (!row) return `<p class="none">Sizer can’t place ${esc(size.label)} on the chart.</p>`;
    if (tab === 'body') {
      const lines = t.keys.map((k) => `<div class="tr"><span class="n">${KEY_NAME[k]}</span><span class="c">${cm(t.you[k])}</span><span class="c">${cm(row.body[k][0])}–${cm(row.body[k][1])}</span><div class="v">${bar(t.you[k], row.body[k])}<span class="w">${where(t.you[k], row.body[k], r.signals && r.signals.stretch)}</span></div></div>`).join('');
      const areas = isYours ? Engine.sheetAreas(r) : [];
      return `<div class="tr th"><span class="n"></span><span class="c">You</span><span class="c">This size</span></div>${lines}
        ${areas.length ? `<ul class="areas">${areas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="src">In cm, from your fit profile and the chart.</p>`;
    }
    if (tab === 'garment') {
      if (!row.garment) return '<p class="none">The chart Sizer used gives body measurements, not the garment’s own, so it sized this from your body.</p>';
      const keys = Object.keys(row.garment);
      return `<div class="tr th"><span class="n"></span><span class="c">All round</span></div>${keys.map((k) => `<div class="tr"><span class="n">${KEY_NAME[k]}</span><span class="c">${cm(row.garment[k])}</span></div>`).join('')}
        <p class="src">In cm, measured on the garment, from the brand’s chart.</p>`;
    }
    if (!row.conv.length) return `<p class="none">This chart has no other countries’ sizes for ${esc(row.label)}.</p>`;
    return `<div class="tr th"><span class="n">Country</span><span class="c">Size</span></div>${row.conv.map((c) => `<div class="tr"><span class="n">${SYSTEM_NAME[c.system]}</span><span class="c">${esc(c.value)}</span></div>`).join('')}`;
  }

  // view: { size, tab } the shopper last chose, kept across redraws; else the answer's body tab.
  function fitTable(r, view) {
    if (!r.table) return '';
    const { sizes, yours } = tableSizes(r);
    const v = view && sizes[view.size] && TABS.some(([id]) => id === view.tab) ? view : { size: yours >= 0 ? yours : 0, tab: 'body' };
    const buttons = sizes.map((s, i) => {
      const gone = s.available === false;
      const label = [s.label, gone && 'sold out', i === yours && 'Sizer’s answer'].filter(Boolean).join(', ');
      const cls = `sz${gone ? ' gone' : ''}${i === yours ? ' yours' : ''}${i === v.size ? ' view' : ''}`;
      return `<button type="button" class="${cls}" data-size="${i}" aria-pressed="${i === v.size}"${label !== s.label ? ` aria-label="${esc(label)}"` : ''}>${esc(s.label)}</button>`;
    }).join('');
    const tabs = TABS.map(([id, name]) => `<button type="button" class="tab" role="tab" data-tab="${id}" aria-selected="${id === v.tab}">${name}</button>`).join('');
    const panels = sizes.map((s, i) => TABS.map(([id]) => `<div class="tp" role="tabpanel" data-for-size="${i}" data-for-tab="${id}"${i === v.size && id === v.tab ? '' : ' hidden'}>${panelHTML(r, s, id, i === yours)}</div><!--tp-->`).join('')).join('');
    return `<section class="fit">
        <h3>Compare a size</h3>
        <div class="sizes" role="group" aria-label="Compare a size">${buttons}</div>
        <div class="tabs" role="tablist" aria-label="What to compare">${tabs}</div>
        ${panels}
      </section>`;
  }

  // Shows the chosen size and tab. root is the element holding the sheet; it is replaced on every
  // redraw, so the listener goes with it. onChange hears { size, tab } so a redraw can keep them.
  function wire(root, onChange) {
    if (!root || !root.querySelectorAll) return;
    const pressed = Array.from(root.querySelectorAll('[data-size]')).find((b) => b.getAttribute('aria-pressed') === 'true');
    const selected = Array.from(root.querySelectorAll('[data-tab]')).find((b) => b.getAttribute('aria-selected') === 'true');
    if (!pressed || !selected) return;
    let size = +pressed.getAttribute('data-size');
    let tab = selected.getAttribute('data-tab');
    root.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target : null;
      const sizeBtn = el && el.closest('[data-size]');
      const tabBtn = el && el.closest('[data-tab]');
      if (!sizeBtn && !tabBtn) return;
      if (sizeBtn) size = +sizeBtn.getAttribute('data-size');
      if (tabBtn) tab = tabBtn.getAttribute('data-tab');
      root.querySelectorAll('[data-size]').forEach((b) => {
        const on = +b.getAttribute('data-size') === size;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('view', on);
      });
      root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab)));
      root.querySelectorAll('[data-for-size]').forEach((p) => { p.hidden = !(+p.getAttribute('data-for-size') === size && p.getAttribute('data-for-tab') === tab); });
      if (onChange) onChange({ size, tab });
    });
  }

  // r is the engine's result; p is the product as read (only its sizes are used); opts.checking while
  // the fit-dossier request is out; opts.view the size and tab the shopper last chose.
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
      ['Fit note', s.fitNote ? `“${esc(s.fitNoteText)}”` : s.fitDetail ? `“${esc(s.fitDetail)}”, which doesn’t change the size` : 'None'],
      s.modelSize && !r.shoes ? ['Model', `Wears ${esc(s.modelSize)}${s.modelHeight ? `, ${s.modelHeight} cm tall` : ''}`] : null,
      reviewsFact(r.reviews),
      // With a size row above, the sizes and their stock are already on show.
      r.table ? null : !sizes.length ? ['Sizes', 'Not found']
        : !stockKnown ? ['Sizes', sizes.map(chip).join('')]
          : ['In stock', inStock.length ? inStock.map(chip).join('') : 'None'],
      !r.table && stockKnown && soldOut.length ? ['Sold out', soldOut.map(chip).join('')] : null,
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
      ${r.table ? fitTable(r, opts.view) : areas.length ? `<h3>Where it fits</h3><ul class="areas">${areas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
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

  const api = { body, sourceLine, reviewsFact, dots, esc, webBlock, wire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerSheet = api;
})(globalThis);
