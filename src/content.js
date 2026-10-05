(function () {
  if (window.__sizerLoaded) return;
  window.__sizerLoaded = true;

  const Engine = globalThis.SizerEngine;
  const { extractProduct, findPicker, optionElements, guideFromHtml, productText } = globalThis.SizerExtract;
  const Guide = globalThis.SizerGuideTable;
  const Sheet = globalThis.SizerSheet;
  const Feedback = globalThis.SizerFeedback;
  const Question = globalThis.SizerFitQuestion;

  // dossiers: per item key, 'asking' while the fit-dossier request is out, then the dossier or null.
  const state = { phase: 'reading', product: null, result: null, sheetOpen: false, forced: false, lookups: {}, looking: null, guideTried: false, ai: null, ask: null, noted: null, dossiers: {} };
  const hosts = {};
  let lastTrigger = null;
  // The "did it fit?" question in the sheet keeps its place and its answers across re-renders.
  let askEl = null;

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

  // Keeps this answer in the recent sizings (local storage, through the background worker), once per
  // page. The list is read first: an item sized on an earlier visit and not yet answered is asked
  // about in the sheet ("did it fit?").
  async function noteSizing(product, result) {
    const key = Store.itemKey(product.brand, product.title);
    const sizing = Feedback.sizingFrom(product, result, key, location.hostname, Date.now());
    if (!sizing || state.noted === key) return;
    state.noted = key;
    try {
      const { sizings } = await chrome.storage.local.get({ sizings: [] });
      state.ask = Feedback.askOnRevisit(sizings, key, Date.now());
    } catch { state.ask = null; }
    message({ type: 'sizer:remember-sizing', sizing });
  }

  async function recommendHere(profile, charts) {
    // What "Read this page with AI" returned fills only what the page reader missed.
    const product = state.ai ? Store.applyReadProduct(extractProduct(document, Engine), state.ai, Engine.kindOf) : extractProduct(document, Engine);
    if (!(product.isProduct || product.sizes.length || state.forced)) return { product, result: null };
    product.poolFit = await poolFor(product);
    // What others say online, once it has landed; until then the engine answers without it.
    const landed = state.dossiers[Store.itemKey(product.brand, product.title)];
    product.dossier = landed && landed !== 'asking' ? landed : null;
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
      style.textContent = globalThis.SIZER_STYLE + Question.STYLE;
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
        : area ? `<span class="note">${esc(area)}</span>`
          : state.ask && !(askEl && /done|dismissed/.test(askEl.dataset.step)) ? '<span class="note">Sized here before. Did it fit? Tell Sizer under Why this size.</span>' : '';
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

  function renderSheet() {
    if (!state.sheetOpen) { drop('sizer-panel'); return; }
    const r = state.result;
    const h = host('sizer-panel', (el) => { if (!el.isConnected) document.documentElement.appendChild(el); });
    const guide = Sheet.sourceLine(r);
    h.mount.innerHTML = `<section class="sheet" role="dialog" aria-modal="false" aria-labelledby="sizer-title" tabindex="-1">
      <header>${MARK}<span class="title" id="sizer-title">sizer</span><button class="close" data-act="close" aria-label="Close">×</button></header>
      <div class="body">${askHTML()}${Sheet.body(state.result, state.product, { checking: checkingDossier() })}</div>
      <footer><span class="fine">${guide}</span><button class="link" data-act="profile">Edit fit profile</button></footer>
    </section>`;
    bind(h.mount);
    const slot = h.mount.querySelector('[data-fq-host]');
    if (slot) slot.replaceWith(askQuestion());
    h.mount.querySelector('.sheet').focus();
  }

  // A product sized on an earlier visit and not yet answered: the "did it fit?" question, first in the sheet.
  function askHTML() {
    return state.ask ? '<section class="ask"><h3>Did it fit?</h3><div data-fq-host></div></section>' : '';
  }

  function askQuestion() {
    if (askEl) return askEl;
    askEl = document.createElement('div');
    askEl.className = 'fq';
    const itemKey = state.ask.itemKey;
    Question.mount(askEl, state.ask, {
      onAnswer: async (answer) => {
        const r = await message({ type: 'sizer:answer-fit', itemKey, answer });
        return r && r.ok;
      },
      onDismiss: () => message({ type: 'sizer:dismiss-fit', itemKey }),
    });
    return askEl;
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
    if (result && (product.isProduct || state.forced)) await noteSizing(product, result);
    lookUp(product, result);
    place();
    if (state.sheetOpen) renderSheet();
    if (!state.looking) askDossier(product, result);
  }

  // How long the sheet says it is checking before it lets the question go. A late reply is still
  // kept by the background worker, so the next visit to this item uses it.
  const DOSSIER_WAIT_MS = 90000;

  // What others say about the fit online: asked once per item, only after the first answer is on the
  // page and any chart lookup has settled, so it never holds the answer up. When it lands, the page
  // is sized again with it.
  function askDossier(product, result) {
    const key = product && Store.itemKey(product.brand, product.title);
    if (!key || !result || !result.ok || key in state.dossiers) return;
    state.dossiers[key] = 'asking';
    const reviews = result.reviews && result.reviews.local;
    const msg = {
      type: 'sizer:fit-dossier', itemKey: key, brand: product.brand, style: key.split('|')[1],
      kind: result.kind || Engine.kindOf(product.title), shop: location.hostname,
      tallies: { small: reviews ? reviews.small : 0, large: reviews ? reviews.large : 0, tts: reviews ? reviews.tts : 0, total: reviews ? reviews.total : 0, areas: result.reviewAreas || [] },
    };
    const settle = (reply) => {
      if (state.dossiers[key] !== 'asking') return;
      const dossier = reply && reply.dossier ? reply.dossier : null;
      state.dossiers[key] = dossier;
      if (dossier) run(); else if (state.sheetOpen) renderSheet();
    };
    setTimeout(() => settle(null), DOSSIER_WAIT_MS);
    message(msg).then(settle);
    if (state.sheetOpen) renderSheet();
  }

  function checkingDossier() {
    const p = state.product;
    const key = p && Store.itemKey(p.brand, p.title);
    return !!key && state.dossiers[key] === 'asking';
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
      if (reply && reply.found) { run(); return; }
      place();
      askDossier(state.product, state.result);
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

  // Where else the shop keeps its chart, before the lookup (see SizerGuideTable.moreGuide).
  function moreGuide(product, want) {
    return Guide.moreGuide(product, want, {
      message,
      fetch: (u, init) => fetch(u, init),
      pageUrl: location.href,
      guideFromHtml,
      withImageChart: Store.withImageChart,
      firstTry: () => !state.guideTried && (state.guideTried = true),
    });
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
    state.ask = null;
    state.noted = null;
    askEl = null;
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
        // The side panel draws the full sheet from this; the popup reads only the result.
        reply({ result, isProduct: product.isProduct, product: { brand: product.brand || '', title: product.title || '', sizes: product.sizes || [] } });
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
