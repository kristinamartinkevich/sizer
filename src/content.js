(function () {
  if (window.__sizerLoaded) return;
  window.__sizerLoaded = true;

  const Engine = globalThis.SizerEngine;
  const { extractProduct, findPicker, optionElements } = globalThis.SizerExtract;

  const state = { phase: 'reading', product: null, result: null, sheetOpen: false, forced: false };
  const hosts = {};
  let lastTrigger = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MARK = `<span class="mark" aria-hidden="true"><img src="${chrome.runtime.getURL('brand/mark.svg')}" alt=""></span>`;

  function getProfile() {
    return new Promise((resolve) => chrome.storage.sync.get({ profile: globalThis.SIZER_DEFAULT_PROFILE }, (r) => resolve(r.profile)));
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
    if (state.phase === 'reading') {
      return `<div class="line" aria-busy="true">${MARK}<span class="k">Sizing this for you</span><span class="reading" aria-hidden="true"></span></div>`;
    }
    if (r && r.needsProfile) {
      return `<div class="line">${MARK}<span class="answer"><span>Sizer can tell you your size here.</span></span><button class="cta" data-act="profile">Add your sizes</button></div>`;
    }
    if (!r || !r.ok) return '';
    const low = r.confidence === 'Low';
    const stock = r.stockText ? `<span class="note gone">${esc(r.stockText)}</span>`
      : low && r.firmUp ? `<span class="note">${esc(r.firmUp)}</span>` : '';
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
    if (!r || (!r.ok && !r.needsProfile)) { drop('sizer-pill'); return; }
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

  function sheetBody() {
    const r = state.result;
    const p = state.product;
    if (!r) return '<p class="empty">Sizer couldn’t find a product or size picker on this page.</p>';
    if (r.needsProfile) return `<p class="empty">${esc(r.reason)}</p>`;
    if (!r.ok) return `<p class="empty">${esc(r.reason)}</p>`;
    const s = r.signals;
    const facts = [
      ['Brand', r.brand ? `${esc(r.brand)}${r.brandKnown ? '' : ', no size chart yet'}` : 'Not found'],
      ['Stretch', { none: 'None', slight: 'A little', high: 'Lots', unknown: 'Not stated' }[s.stretch] + (s.elastanePct ? `, ${s.elastanePct}% elastane` : '')],
      ['Fit note', s.fitNote ? `“${esc(s.fitNoteText)}”` : 'None'],
      s.modelSize ? ['Model', `Wears ${esc(s.modelSize)}${s.modelHeight ? `, ${s.modelHeight} cm tall` : ''}`] : null,
      ['Sizes', p.sizes.length ? p.sizes.map((x) => (x.available === false ? `<s>${esc(x.label)}</s>` : esc(x.label))).join(' · ') : 'Not found'],
    ].filter(Boolean);
    return `
      <div class="hero">
        <div class="k">${r.confidence === 'Low' ? 'Rough guess' : 'Your size'}</div>
        <div class="big">${esc(r.size)}</div>
        <div class="headline${r.headline === 'Your usual fit' ? '' : ' moved'}">${esc(r.headline)}</div>
        <div class="meter">${dots(r.confidence)}<span>${r.confidence} confidence</span></div>
        ${r.firmUp ? `<p class="firm">${esc(r.firmUp)}</p>` : ''}
      </div>
      ${r.stockText ? `<div class="stock">${esc(r.stockText)}</div>` : ''}
      ${r.alternative ? `<p class="alt">Or <b>${esc(r.alternative.size)}</b> ${esc(r.alternative.why)}.</p>` : ''}
      <h3>Why this size</h3>
      <ol>${r.reasons.map((x) => `<li><span>${esc(x.text)}</span>${x.delta ? `<em>${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)} size</em>` : ''}</li>`).join('')}</ol>
      <h3>Read on this page</h3>
      <dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  function renderSheet() {
    if (!state.sheetOpen) { drop('sizer-panel'); return; }
    const r = state.result;
    const h = host('sizer-panel', (el) => { if (!el.isConnected) document.documentElement.appendChild(el); });
    const guide = r && r.guide ? `Charts are approximate. Check the ${esc(r.guide)}.` : 'Size charts are approximate.';
    h.mount.innerHTML = `<section class="sheet" role="dialog" aria-modal="false" aria-labelledby="sizer-title" tabindex="-1">
      <header>${MARK}<span class="title" id="sizer-title">sizer</span><button class="close" data-act="close" aria-label="Close">×</button></header>
      <div class="body">${sheetBody()}</div>
      <footer><span class="fine">${guide}</span><button class="link" data-act="profile">Edit fit profile</button></footer>
    </section>`;
    bind(h.mount);
    h.mount.querySelector('.sheet').focus();
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
    const product = extractProduct(document, Engine);
    const profile = await getProfile();
    state.product = product;
    state.result = product.isProduct || product.sizes.length || state.forced ? Engine.recommend(profile, product) : null;
    state.phase = 'ready';
    place();
    if (state.sheetOpen) renderSheet();
  }

  function reset() {
    state.phase = 'reading';
    state.product = null;
    state.result = null;
    state.sheetOpen = false;
    state.forced = false;
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
      run().then(() => { state.sheetOpen = true; renderSheet(); reply({ ok: true }); });
      return true;
    }
    if (msg.type === 'sizer:analyze') {
      getProfile().then((profile) => {
        const product = extractProduct(document, Engine);
        reply({ result: product.isProduct || product.sizes.length ? Engine.recommend(profile, product) : null, isProduct: product.isProduct });
      });
      return true;
    }
  });

  chrome.storage.onChanged.addListener((c) => { if (c.profile) run(); });

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
