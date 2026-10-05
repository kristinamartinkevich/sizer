(function () {
  if (window.__sizerLoaded) return;
  window.__sizerLoaded = true;

  const Engine = globalThis.SizerEngine;
  const { extractProduct, findPicker, optionElements, guideFromHtml, productText } = globalThis.SizerExtract;
  const Guide = globalThis.SizerGuideTable;

  const state = { phase: 'reading', product: null, result: null, sheetOpen: false, forced: false, lookups: {}, looking: null, guideTried: false, ai: null };
  const hosts = {};
  let lastTrigger = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MARK = `<span class="mark" aria-hidden="true">${globalThis.SIZER_MARK_SVG}</span>`;

  function getProfile() {
    return new Promise((resolve) => chrome.storage.sync.get({ profile: globalThis.SIZER_DEFAULT_PROFILE }, (r) => resolve(r.profile)));
  }

  // The verified charts the background worker downloaded; null until the first download lands.
  function getCharts() {
    return new Promise((resolve) => chrome.storage.local.get({ charts: null }, (r) => resolve(r.charts)));
  }

  const Store = globalThis.SizerChartsStore;
  const reported = new Set();

  // What Sizer users read on other shops for this style. A slow or failed lookup just means this page alone.
  async function poolFor(product) {
    const key = Store.itemKey(product.brand, product.title);
    if (!key) return null;
    try {
      const r = await Promise.race([chrome.runtime.sendMessage({ type: 'sizer:item-fit', key }), new Promise((res) => setTimeout(() => res(null), 1500))]);
      return r && Array.isArray(r.rows) ? Store.poolExcept(r.rows, location.hostname) : null;
    } catch {
      return null;
    }
  }

  // Sends this page's review tally once per style, so other shops' shoppers can use it.
  function reportFit(product, result) {
    const key = Store.itemKey(product.brand, product.title);
    const counts = result && result.reviews && result.reviews.local;
    if (!key || !counts || !counts.total || reported.has(key)) return;
    reported.add(key);
    const style = key.split('|')[1];
    try { chrome.runtime.sendMessage({ type: 'sizer:report-fit', key, brand: product.brand, style, vendor: location.hostname, counts }).catch(() => {}); } catch { /* no worker in the demo pages */ }
  }

  async function recommendHere(profile, charts) {
    // What "Read this page with AI" returned fills only what the page reader missed.
    const product = state.ai ? Store.applyReadProduct(extractProduct(document, Engine), state.ai, Engine.kindOf) : extractProduct(document, Engine);
    if (!(product.isProduct || product.sizes.length || state.forced)) return { product, result: null };
    product.poolFit = await poolFor(product);
    const result = Engine.recommend(profile, product, charts);
    reportFit(product, result);
    return { product, result };
  }

  function host(id, place) {
    let h = hosts[id];
    if (!h || !h.el.isConnected) {
      const el = document.createElement('div');
      el.id = id;
      const shadow = el.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = globalThis.SIZER_STYLE;
      const mount = document.createElement('div');
      shadow.append(style, mount);
      h = hosts[id] = { el, mount };
    }
    place(h.el);
    return h;
  }

  function drop(id) {
    if (hosts[id]) { hosts[id].el.remove(); delete hosts[id]; }
  }

  function pageStyle() {
    if (document.getElementById('sizer-page-style')) return;
    const s = document.createElement('style');
    s.id = 'sizer-page-style';
    // One document-level face for the figure: @font-face is ignored inside a shadow root.
    const font = chrome.runtime.getURL('fonts/HankenGrotesk-latin.woff2');
    s.textContent = `@font-face { font-family: "Hanken Grotesk"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("${font}") format("woff2"); }\n` + globalThis.SIZER_PAGE_STYLE;
    document.head.appendChild(s);
  }

  // ---- the line under the picker ------------------------------------------

  function lineHTML() {
    const r = state.result;
    if (state.phase === 'reading' || state.looking) {
      const text = state.looking ? Engine.lookingUpText(state.looking) : 'Sizing this for you';
      return `<div class="line" aria-busy="true">${MARK}<span class="k">${esc(text)}</span><span class="reading" aria-hidden="true"></span></div>`;
    }
    if (r && r.needsProfile) {
      return `<div class="line">${MARK}<span class="answer"><span>Sizer can tell you your size here.</span></span><button class="cta" data-act="profile">Add your sizes</button></div>`;
    }
    if (!r || !r.ok) return '';
    const low = r.confidence === 'Low';
    const area = Engine.areaLine(r);
    const stock = r.stockText ? `<span class="note gone">${esc(r.stockText)}</span>`
      : low && r.firmUp ? `<span class="note">${esc(r.firmUp)}</span>`
        : area ? `<span class="note">${esc(area)}</span>` : '';
    return `<div class="line${low ? ' low' : ''}">${MARK}
      <span class="answer">
        <span class="k">${low ? 'Rough guess' : 'Your size'}</span>
        <span class="row"><span class="size">${esc(r.size)}</span><span class="why-text">${esc(r.headline)}</span></span>
        ${stock}
      </span>
      <button class="go" data-act="why" aria-haspopup="dialog">Why this size</button>
    </div>`;
  }

  // Below the picker, and below its option list when the list opens inline rather than as an overlay.
  function anchorAfter(picker) {
    let a = picker;
    const sib = () => a.nextElementSibling && a.nextElementSibling.id !== 'sizer-inline' ? a.nextElementSibling : null;
    while (sib() && optionElements(sib(), Engine.parseSizeLabel).length >= 2) a = sib();
    return a;
  }

  function renderLine(picker) {
    const html = lineHTML();
    if (!html) { drop('sizer-inline'); return; }
    const anchor = anchorAfter(picker);
    const h = host('sizer-inline', (el) => { if (el.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', el); });
    h.el.style.display = 'block';
    if (h.mount.dataset.html !== html) {
      h.mount.innerHTML = html;
      h.mount.dataset.html = html;
      bind(h.mount);
    }
  }

  // ---- fallback pill ------------------------------------------------------

  function renderPill() {
    const r = state.result;
    if (!r || (!r.ok && !r.needsProfile) || state.looking) { drop('sizer-pill'); return; }
    const h = host('sizer-pill', (el) => { if (!el.isConnected) document.documentElement.appendChild(el); });
    const label = r.ok ? `<span>${r.confidence === 'Low' ? 'Rough guess' : 'Your size'}</span><b>${esc(r.size)}</b>` : '<span>Add your sizes</span>';
    const html = `<button class="pill" data-act="${r.ok ? 'why' : 'profile'}" aria-haspopup="${r.ok ? 'dialog' : 'false'}">${MARK}${label}</button>`;
    if (h.mount.dataset.html !== html) { h.mount.innerHTML = html; h.mount.dataset.html = html; bind(h.mount); }
  }

  // ---- reasoning sheet ----------------------------------------------------

  function dots(conf) {
    const n = { High: 3, Medium: 2, Low: 1 }[conf] || 0;
    return `<span class="dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  // What buyers wrote about fit, as one line for the folded read-out.
  function reviewsFact(rv) {
    if (!rv || !rv.total) return null;
    if (!rv.mentions) return ['Reviews', `${rv.total} read, none mention fit`];
    const parts = [rv.small && `${rv.small} small`, rv.large && `${rv.large} large`, rv.tts && `${rv.tts} true to size`].filter(Boolean);
    const where = rv.vendors ? ` on ${rv.vendors + (rv.local.total ? 1 : 0)} shops` : '';
    return ['Reviews', `${rv.mentions} of ${rv.total}${where} mention fit: ${parts.join(', ')}`];
  }

  function sheetBody() {
    const r = state.result;
    const p = state.product;
    if (!r) return '<p class="empty">Sizer couldn’t find a product or size picker on this page.</p>';
    if (r.needsProfile) return `<p class="empty">${esc(r.reason)}</p>`;
    if (!r.ok) return `<p class="empty">${esc(r.reason)}</p>`;
    const s = r.signals;
    const norm = (x) => String(x || '').replace(/\s+/g, '').toUpperCase();
    const chip = (x) => `<span class="chip${x.available === false ? ' gone' : ''}${norm(x.label) === norm(r.size) ? ' pick' : ''}">${esc(x.label)}</span>`;
    const stockKnown = p.sizes.some((x) => x.available != null);
    const inStock = p.sizes.filter((x) => x.available !== false);
    const soldOut = p.sizes.filter((x) => x.available === false);
    const facts = [
      ['Brand', esc(Engine.provenance(r).brandFact)],
      r.shoes ? null : ['Stretch', { none: 'None', slight: 'A little', high: 'Lots', unknown: 'Not stated' }[s.stretch] + (s.elastanePct ? `, ${s.elastanePct}% elastane` : '')],
      ['Fit note', s.fitNote ? `“${esc(s.fitNoteText)}”` : 'None'],
      s.modelSize && !r.shoes ? ['Model', `Wears ${esc(s.modelSize)}${s.modelHeight ? `, ${s.modelHeight} cm tall` : ''}`] : null,
      reviewsFact(r.reviews),
      !p.sizes.length ? ['Sizes', 'Not found']
        : !stockKnown ? ['Sizes', p.sizes.map(chip).join('')]
          : ['In stock', inStock.length ? inStock.map(chip).join('') : 'None'],
      stockKnown && soldOut.length ? ['Sold out', soldOut.map(chip).join('')] : null,
    ].filter(Boolean);
    // Three stops for the eye: the figure, the reasons, and everything else folded away.
    const nearest = r.inStock ? [r.inStock.size, r.inStock.other && r.inStock.other.size].filter(Boolean).map(norm) : [];
    const stockChip = (x) => `<span class="chip${nearest.includes(norm(x.label)) ? ' pick' : ''}">${esc(x.label)}</span>`;
    return `
      <div class="hero">
        <div class="k">${r.confidence === 'Low' ? 'Rough guess' : 'Your size'}</div>
        <div class="big">${esc(r.size)}</div>
        <div class="headline${r.headline === 'Your usual fit' ? '' : ' moved'}">${esc(r.headline)}<span class="meter" title="${r.confidence} confidence">${dots(r.confidence)}</span></div>
        ${r.firmUp ? `<p class="firm">${esc(r.firmUp)}</p>` : ''}
      </div>
      ${r.stockText ? `<div class="stock"><p>${esc(r.stockText)}</p>${inStock.length ? `<div class="chips">${inStock.map(stockChip).join('')}</div>` : ''}</div>`
        : r.alternative ? `<p class="alt">Or <b>${esc(r.alternative.size)}</b> ${esc(r.alternative.why)}.</p>` : ''}
      ${Engine.sheetAreas(r).length ? `<h3>Where it fits</h3><ul class="areas">${Engine.sheetAreas(r).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <h3>Why this size</h3>
      <ol>${r.reasons.map((x) => `<li><span>${esc(x.text)}</span>${x.delta ? `<em>${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)} size</em>` : ''}</li>`).join('')}</ol>
      <details class="more">
        <summary>What Sizer read on this page</summary>
        <div class="facts">${facts.map(([k, v]) => `<div class="fact"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
      </details>`;
  }

  function renderSheet() {
    if (!state.sheetOpen) { drop('sizer-panel'); return; }
    const r = state.result;
    const h = host('sizer-panel', (el) => { if (!el.isConnected) document.documentElement.appendChild(el); });
    const guide = sourceLine(r);
    h.mount.innerHTML = `<section class="sheet" role="dialog" aria-modal="false" aria-labelledby="sizer-title" tabindex="-1">
      <header>${MARK}<span class="title" id="sizer-title">sizer</span><button class="close" data-act="close" aria-label="Close">×</button></header>
      <div class="body">${sheetBody()}</div>
      <footer><span class="fine">${guide}</span><button class="link" data-act="profile">Edit fit profile</button></footer>
    </section>`;
    bind(h.mount);
    h.mount.querySelector('.sheet').focus();
  }

  // Where the chart came from, worded by how far it can be trusted, with a link to the page it was read from.
  function sourceLine(r) {
    if (!r || !r.ok) return 'Size charts are approximate.';
    const f = Engine.provenance(r).footer;
    const link = f.link && f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.link)}</a>` : esc(f.link || '');
    return `${esc(f.lead)}${link}${esc(f.tail)}`;
  }

  function closeSheet() {
    state.sheetOpen = false;
    renderSheet();
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
  }

  function bind(mount) {
    mount.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'why') { lastTrigger = b; state.sheetOpen = true; renderSheet(); }
        if (act === 'close') closeSheet();
        if (act === 'profile') chrome.runtime.sendMessage({ type: 'sizer:options' });
      };
    });
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheetOpen) closeSheet(); });

  // ---- ring the chosen option in the shop's own picker ----------------------

  function markOptions() {
    const r = state.result;
    document.querySelectorAll('[data-sizer-pick]').forEach((el) => el.removeAttribute('data-sizer-pick'));
    if (!r || !r.ok || !r.matchedOnPage) return;
    pageStyle();
    const norm = (s) => s.replace(/\s+/g, '').toUpperCase();
    for (const o of optionElements(document, Engine.parseSizeLabel)) {
      if (norm(o.label) === norm(r.size)) o.el.setAttribute('data-sizer-pick', 'pick');
      else if (r.inStock && [r.inStock, r.inStock.other].some((x) => x && norm(o.label) === norm(x.size))) o.el.setAttribute('data-sizer-pick', 'in-stock');
    }
  }

  // ---- placement ------------------------------------------------------------

  function place() {
    const show = state.product && (state.product.isProduct || state.forced);
    if (!show && state.phase !== 'reading') { drop('sizer-inline'); drop('sizer-pill'); return; }
    const picker = findPicker(document, Engine.parseSizeLabel);
    if (picker) { drop('sizer-pill'); renderLine(picker); }
    else if (state.phase !== 'reading') { drop('sizer-inline'); renderPill(); }
    markOptions();
  }

  async function run() {
    const [profile, charts] = await Promise.all([getProfile(), getCharts()]);
    const { product, result } = await recommendHere(profile, charts);
    state.product = product;
    state.result = result;
    state.phase = 'ready';
    lookUp(product, result);
    place();
    if (state.sheetOpen) renderSheet();
  }

  // A brand with no chart at all: ask the background worker to look one up, once per brand and kind
  // on this page. The line says so for at most LOOKUP_TIMEOUT_MS, then the answer on the standard
  // chart shows. A chart that arrives lands in storage, and storage.onChanged sizes the page again.
  function lookUp(product, result) {
    const want = Engine.lookupFor(result, product);
    const key = want && Store.missKey(want.brand, want.kind);
    if (!key) { state.looking = null; return; }
    if (key in state.lookups) { state.looking = state.lookups[key] === 'looking' ? want.brand : null; return; }
    state.lookups[key] = 'looking';
    state.looking = want.brand;
    const done = (reply) => {
      if (state.lookups[key] !== 'looking') return;
      state.lookups[key] = 'done';
      state.looking = null;
      if (reply && reply.found) run(); else place();
    };
    setTimeout(done, Engine.LOOKUP_TIMEOUT_MS);
    const ask = (shopGuide) => {
      let asked;
      try {
        asked = chrome.runtime.sendMessage({ type: 'sizer:lookup-chart', brand: want.brand, kind: want.kind, shop: location.hostname, shopGuide });
      } catch { asked = null; }
      Promise.resolve(asked).then(done, () => done());
    };
    moreGuide(product, want).then(ask, () => ask(product.shopGuide));
  }

  function message(msg) {
    try { return Promise.resolve(chrome.runtime.sendMessage(msg)).catch(() => null); } catch { return Promise.resolve(null); }
  }

  // When the page prints no size table, look where else the shop keeps its chart before the lookup:
  // the shop's own size-guide page (fetched once per page, without cookies, 3 s at most), then a size
  // chart image, read by the read-chart-image function. Skipped when the lookup would not run anyway.
  async function moreGuide(product, want) {
    const guide = product.shopGuide;
    if (guide && guide.charts.length) return guide;
    const wanted = await message({ type: 'sizer:lookup-wanted', brand: want.brand, kind: want.kind });
    if (!wanted || !wanted.wanted) return guide;
    let images = product.guideImages || [];
    if (!state.guideTried && product.guideLink) {
      state.guideTried = true;
      const html = await Guide.fetchGuideText(product.guideLink, { fetch: (u, init) => fetch(u, init), pageUrl: location.href });
      if (html) {
        const page = guideFromHtml(html, product.guideLink, want.brand);
        if (page.charts.length) return { charts: page.charts, caption: page.caption };
        images = images.concat(page.images.filter((u) => !images.includes(u)));
      }
    }
    // One image, the likeliest: each read counts against the daily caps.
    if (images.length) {
      const read = await message({ type: 'sizer:read-chart-image', image_url: images[0], brand: want.brand, kind: want.kind });
      if (read && read.chart) return Store.withImageChart(guide, read.chart);
    }
    return guide;
  }

  function reset() {
    state.phase = 'reading';
    state.product = null;
    state.result = null;
    state.sheetOpen = false;
    state.forced = false;
    state.lookups = {};
    state.looking = null;
    state.guideTried = false;
    state.ai = null;
    drop('sizer-panel');
    drop('sizer-pill');
    drop('sizer-inline');
    document.querySelectorAll('[data-sizer-pick]').forEach((el) => el.removeAttribute('data-sizer-pick'));
  }

  // Shops re-render the picker (opening it, picking a colour), so keep the line attached.
  let pending = 0;
  new MutationObserver((muts) => {
    if (muts.every((m) => m.target.closest && m.target.closest('#sizer-inline, #sizer-panel, #sizer-pill'))) return;
    clearTimeout(pending);
    pending = setTimeout(() => { if (state.phase === 'ready') place(); }, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'sizer:open') {
      state.forced = true;
      if (msg.ai) state.ai = msg.ai;
      run().then(() => {
        state.sheetOpen = true;
        renderSheet();
        const p = state.product;
        reply({ ok: true, brand: !!(p && p.brand), sizes: p ? p.sizes.length : 0 });
      });
      return true;
    }
    if (msg.type === 'sizer:product-text') {
      reply(productText(document, Engine.parseSizeLabel));
      return false;
    }
    if (msg.type === 'sizer:analyze') {
      Promise.all([getProfile(), getCharts()]).then(([profile, charts]) => recommendHere(profile, charts)).then(({ product, result }) => {
        reply({ result, isProduct: product.isProduct });
      });
      return true;
    }
  });

  chrome.storage.onChanged.addListener((c) => { if (c.profile || c.charts) run(); });

  // Product pages hydrate late and shops navigate without full reloads.
  let url = location.href;
  setTimeout(place, 150);
  [600, 2000, 4500].forEach((ms) => setTimeout(run, ms));
  setInterval(() => {
    if (location.href === url) return;
    url = location.href;
    reset();
    setTimeout(place, 150);
    [600, 2000].forEach((ms) => setTimeout(run, ms));
  }, 500);
})();
