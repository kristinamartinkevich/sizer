// Sizer on a Vinted listing: reads the listing from the page, shows the answer line under its details
// and the sheet with the full reasoning. The arithmetic and the wording live in src/vinted.js and
// src/engine.js; this file only reads the DOM and draws. Nothing is sent anywhere except the pooled
// review lookup every product page makes and, on the shopper's click only, the photo read.
(function () {
  const Vinted = globalThis.SizerVinted;
  const Engine = globalThis.SizerEngine;
  const Store = globalThis.SizerChartsStore;
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // ---- reading the listing ------------------------------------------------------------

  function jsonLd(doc) {
    const out = { product: null, breadcrumb: [] };
    for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(el.textContent); } catch { continue; }
      const stack = [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object') continue;
        if (Array.isArray(n)) { stack.push(...n); continue; }
        const type = [].concat(n['@type'] || []);
        if (!out.product && (type.includes('Product') || type.includes('IndividualProduct'))) out.product = n;
        if (type.includes('BreadcrumbList') && !out.breadcrumb.length) {
          out.breadcrumb = [].concat(n.itemListElement || [])
            .sort((a, b) => (+a.position || 0) - (+b.position || 0))
            .map((x) => clean(x && (x.name || (x.item && x.item.name)))).filter(Boolean);
        }
        if (n['@graph']) stack.push(n['@graph']);
      }
    }
    return out;
  }

  // The details Vinted prints beside the photos, each a label and a value. Read by itemprop, by the
  // row's test id, then by the label's text in any of the Vinted languages.
  const DETAIL = {
    brand: { prop: 'brand', test: 'brand', label: 'marque|brand|marke|marca|merk|marka|prekės ženklas|značka|márka|brand|tuotemerkki|mærke|varumärke|μάρκα' },
    size: { prop: 'size', test: 'size', label: 'taille|size|größe|grösse|talla|taglia|maat|rozmiar|dydis|velikost|veľkosť|méret|mărime|veličina|tamanho|storlek|koko|størrelse|μέγεθος' },
    condition: { prop: 'itemCondition', test: 'status', label: 'état|condition|zustand|estado|condizioni|staat|stan|būklė|stav|állapot|stare|stanje|kunto|stand|skick|κατάσταση' },
  };

  function rowValue(row) {
    if (!row) return '';
    const value = row.querySelector('[data-testid$="-value"], [class*="value" i], [itemprop]');
    if (value && value !== row) return clean(value.getAttribute('content') || value.textContent);
    const kids = [...row.children];
    return kids.length >= 2 ? clean(kids[kids.length - 1].textContent) : clean(row.textContent);
  }

  function detail(doc, key) {
    const d = DETAIL[key];
    const prop = doc.querySelector(`[itemprop="${d.prop}"]`);
    if (prop && !prop.closest('script')) {
      const v = clean(prop.getAttribute('content') || (prop.querySelector('[itemprop="name"]') || prop).textContent);
      if (v) return v;
    }
    const row = doc.querySelector(`[data-testid="item-attributes-${d.test}"], [data-testid="item-details-${d.test}"]`);
    const v = rowValue(row);
    if (v) return v;
    const label = new RegExp(`^(?:${d.label})\\s*:?$`, 'i');
    for (const el of doc.querySelectorAll('dt, th, span, div')) {
      if (el.children.length || !label.test(clean(el.textContent))) continue;
      const next = el.nextElementSibling;
      if (next && clean(next.textContent)) return clean(next.textContent);
    }
    return '';
  }

  function breadcrumbs(doc, ld) {
    if (ld.breadcrumb.length) return ld.breadcrumb;
    const sel = '[itemtype*="BreadcrumbList"] [itemprop="name"], nav[aria-label*="readcrumb" i] li, [data-testid*="breadcrumb" i] a, [class*="breadcrumb" i] li';
    return [...doc.querySelectorAll(sel)].map((el) => clean(el.textContent)).filter(Boolean);
  }

  function photos(doc) {
    const sel = '[data-testid^="item-photo"] img, [class*="item-photo" i] img, [class*="item-photos" i] img';
    const urls = [...doc.querySelectorAll(sel)].map((img) => img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '');
    const og = doc.querySelector('meta[property="og:image"]');
    if (og) urls.push(og.getAttribute('content') || '');
    return urls.filter((u) => /^https:/i.test(u));
  }

  function description(doc) {
    const el = doc.querySelector('[itemprop="description"], [data-testid="item-description"], [data-testid*="description" i]');
    if (el) return clean(el.getAttribute('content') || el.textContent);
    const meta = doc.querySelector('meta[name="description"], meta[property="og:description"]');
    return meta ? clean(meta.getAttribute('content')) : '';
  }

  // What src/vinted.js's listingFrom needs, straight off the page.
  function readRaw(doc, host) {
    const ld = jsonLd(doc);
    const h1 = doc.querySelector('h1');
    const og = doc.querySelector('meta[property="og:title"]');
    return {
      host,
      ld: ld.product,
      brand: detail(doc, 'brand'),
      size: detail(doc, 'size'),
      condition: detail(doc, 'condition'),
      title: clean(h1 ? h1.textContent : og ? og.getAttribute('content') : ''),
      description: description(doc),
      category: breadcrumbs(doc, ld),
      photos: photos(doc),
    };
  }

  const readListing = (doc, host) => Vinted.listingFrom(readRaw(doc, host));

  // The line goes under the listing's details block (the outermost details container a few levels
  // above the size row); failing that, under the size row's parent, then the title's.
  const BLOCK = /item-details|details-list|item-attributes(?!-)/i;
  function anchorFor(doc) {
    const sizeRow = doc.querySelector('[data-testid="item-attributes-size"], [data-testid="item-details-size"], [itemprop="size"]');
    let block = null;
    let el = sizeRow;
    for (let depth = 0; el && el !== doc.body && depth < 6; depth++, el = el.parentElement) {
      const id = `${el.getAttribute('data-testid') || ''} ${typeof el.className === 'string' ? el.className : ''}`;
      if (el !== sizeRow && BLOCK.test(id)) block = el;
    }
    if (block) return block;
    if (sizeRow && sizeRow.parentElement) return sizeRow.parentElement;
    const h1 = doc.querySelector('h1');
    return h1 ? h1.parentElement : null;
  }

  globalThis.SizerVintedPage = { readRaw, readListing, anchorFor };

  // In tests/shops.html the reader is all that is wanted.
  if (!(globalThis.chrome && chrome.runtime && chrome.runtime.id)) return;
  if (window.__sizerLoaded) return;
  window.__sizerLoaded = true;

  // ---- state ----------------------------------------------------------------------------

  const state = { phase: 'reading', listing: null, answer: null, sheetOpen: false, copied: false, photos: 'idle', photosNote: '', fromPhoto: [] };
  const hosts = {};
  let lastTrigger = null;
  let profile = null;
  let charts = null;
  let pool = null;
  // Counts listings: bumped whenever the address moves to another page, so an answer that arrives
  // after the shopper left the listing it was asked for is dropped.
  let page = 0;
  const onListing = () => Vinted.isListingPath(location.pathname);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MARK = `<span class="mark" aria-hidden="true">${globalThis.SIZER_MARK_SVG}</span>`;

  function getProfile() {
    return new Promise((resolve) => chrome.storage.sync.get({ profile: globalThis.SIZER_DEFAULT_PROFILE }, (r) => resolve(r.profile)));
  }
  function getCharts() {
    return new Promise((resolve) => chrome.storage.local.get({ charts: null }, (r) => resolve(r.charts)));
  }

  function message(msg) {
    try { return Promise.resolve(chrome.runtime.sendMessage(msg)).catch(() => null); } catch { return Promise.resolve(null); }
  }

  // What Sizer users read about this style on shops, pooled; a slow answer means none.
  async function poolFor(listing) {
    const key = Store.itemKey(listing.brand, listing.title);
    if (!key) return null;
    const r = await Promise.race([message({ type: 'sizer:item-fit', key }), new Promise((res) => setTimeout(() => res(null), 1500))]);
    return r && Array.isArray(r.rows) ? Store.poolExcept(r.rows, location.hostname) : null;
  }

  function recompute() {
    state.answer = state.listing ? Vinted.answerFor(state.listing, profile, charts, Engine, pool) : null;
  }

  async function run() {
    // Vinted moves to the catalogue in place: a page that is not a listing is never read as one.
    if (!onListing()) return;
    const at = page;
    const href = location.href;
    const listing = readListing(document, location.hostname);
    [profile, charts] = await Promise.all([getProfile(), getCharts()]);
    if (!state.listing || state.listing.title !== listing.title || state.listing.brand !== listing.brand) pool = await poolFor(listing);
    if (at !== page || location.href !== href) return;
    if (state.listing && state.fromPhoto.length) {
      // Keep what the photos gave when the page re-reads, including a photo read that finished while
      // this re-read was waiting.
      const merged = Vinted.mergeMeasurements(listing.have, Object.fromEntries(state.fromPhoto.map((k) => [k, state.listing.have[k]])));
      listing.have = merged.have;
    }
    state.listing = listing;
    state.phase = 'ready';
    recompute();
    render();
  }

  // ---- drawing --------------------------------------------------------------------------

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

  const canReadPhotos = () => {
    const l = state.listing;
    return !!l && l.photos.length > 0 && state.photos !== 'done' && Vinted.wanted(l.kind, l.have).length > 0;
  };

  function actionsHTML() {
    const a = state.answer;
    const ask = a && a.message
      ? `<button class="ghost${state.copied ? ' done' : ''}" data-act="ask">${state.copied ? Vinted.COPY.copied : Vinted.COPY.ask}</button>` : '';
    const read = canReadPhotos()
      ? `<button class="ghost" data-act="photos"${state.photos === 'reading' ? ' disabled' : ''}>${state.photos === 'reading' ? 'Reading the photos' : Vinted.COPY.photos}</button>` : '';
    return ask || read ? `<div class="actions">${ask}${read}</div>` : '';
  }

  function lineHTML() {
    const a = state.answer;
    const l = state.listing;
    if (state.phase === 'reading') {
      return `<div class="line" aria-busy="true">${MARK}<span class="k">Sizing this for you</span><span class="reading" aria-hidden="true"></span></div>`;
    }
    if (!a) return '';
    if (a.mode === 'needsProfile') {
      return `<div class="line vinted">${MARK}<span class="answer"><span>Sizer can tell you if this fits.</span></span><button class="cta" data-act="profile">Add your sizes</button>${actionsHTML()}</div>`;
    }
    const size = l.size ? `<span class="size">${esc(l.size)}</span>` : '';
    let k;
    let text;
    let note = '';
    if (a.mode === 'measured') {
      k = 'Seller’s measurements';
      text = a.line;
      const tight = a.areas.find((t) => /^(Tight|Short)/.test(t));
      note = tight || (state.fromPhoto.length ? `Some measurements ${Vinted.COPY.fromPhoto}` : '');
    } else if (a.mode === 'label') {
      k = 'Label only';
      text = a.line;
      note = a.flag;
    } else {
      k = 'No measurements';
      text = l.size ? 'Sizer has no chart for this label' : 'The seller gives no size or measurements';
    }
    const low = a.mode !== 'measured';
    return `<div class="line vinted${low ? ' low' : ''}">${MARK}
      <span class="answer">
        <span class="k">${esc(k)}</span>
        <span class="row">${size}<span class="why-text">${esc(text)}</span></span>
        ${note ? `<span class="note">${esc(note)}</span>` : ''}
        ${state.photosNote ? `<span class="note">${esc(state.photosNote)}</span>` : ''}
      </span>
      <button class="go" data-act="why" aria-haspopup="dialog">Why</button>
      ${actionsHTML()}
    </div>`;
  }

  function factsHTML() {
    const l = state.listing;
    const keys = Object.keys(l.have);
    const measured = keys.length
      ? keys.map((k) => `<div class="fact"><span class="k">${esc(Vinted.NAMES.en[k])}</span><span class="v">${l.have[k]} cm${state.fromPhoto.includes(k) ? ` <span class="tag">${Vinted.COPY.fromPhoto}</span>` : ''}</span></div>`).join('')
      : '<div class="fact"><span class="v">None in the description</span></div>';
    const rows = [
      ['Brand', l.brand || 'Not found'],
      ['Size', l.sizeRaw || 'Not given'],
      ['Condition', l.condition || 'Not given'],
    ];
    return { measured, details: rows.map(([k, v]) => `<div class="fact"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('') };
  }

  function sheetBody() {
    const a = state.answer;
    const l = state.listing;
    if (!a || !l) return '<p class="empty">Sizer couldn’t read this listing.</p>';
    const facts = factsHTML();
    const ask = a.message
      ? `<h3>Ask the seller</h3><p class="msg">${esc(a.message)}</p>` : '';
    let hero;
    let why = '';
    if (a.mode === 'needsProfile') {
      hero = '<p class="empty">Add your measurements or one piece you own, and Sizer will tell you if this fits.</p>';
    } else if (a.mode === 'measured') {
      hero = `<div class="hero"><div class="k">Seller’s measurements</div>${l.size ? `<div class="big">${esc(l.size)}</div>` : ''}<div class="headline">${esc(a.line)}</div></div>`;
      why = `<h3>Where it fits</h3><ul class="areas">${a.areas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    } else if (a.mode === 'label') {
      hero = `<div class="hero"><div class="k">Label only</div><div class="big">${esc(l.size)}</div><div class="headline">${esc(a.line)}</div><p class="firm">${esc(a.flag)}. Sizer picks ${esc(a.pick)} for you on this brand’s chart.</p></div>`;
      why = `<h3>What Sizer knows about ${esc(l.brand || 'this brand')}</h3><ol>${a.reasons.map((t) => `<li><span>${esc(t)}</span></li>`).join('')}</ol>`;
    } else {
      hero = `<p class="empty">${l.size ? 'Sizer has no chart for this label.' : 'The seller gives no size or measurements.'} Ask the seller to measure it.</p>`;
    }
    return `${hero}${why}
      <h3>The seller’s measurements</h3><div class="facts">${facts.measured}</div>
      ${ask}
      ${actionsHTML()}
      ${state.photosNote ? `<p class="firm">${esc(state.photosNote)}</p>` : ''}
      <details class="more"><summary>What Sizer read on this listing</summary><div class="facts">${facts.details}</div></details>`;
  }

  function renderSheet() {
    if (!state.sheetOpen) { drop('sizer-panel'); return; }
    const h = host('sizer-panel', (el) => { if (!el.isConnected) document.documentElement.appendChild(el); });
    h.mount.innerHTML = `<section class="sheet" role="dialog" aria-modal="false" aria-labelledby="sizer-title" tabindex="-1">
      <header>${MARK}<span class="title" id="sizer-title">sizer</span><button class="close" data-act="close" aria-label="Close">×</button></header>
      <div class="body">${sheetBody()}</div>
      <footer><span class="fine">Sizer copies the message; it never sends anything on Vinted.</span><button class="link" data-act="profile">Edit fit profile</button></footer>
    </section>`;
    bind(h.mount);
    h.mount.querySelector('.sheet').focus();
  }

  function renderLine() {
    const html = lineHTML();
    if (!html) { drop('sizer-inline'); drop('sizer-pill'); return; }
    const anchor = anchorFor(document);
    if (anchor) {
      drop('sizer-pill');
      const h = host('sizer-inline', (el) => { if (el.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', el); });
      h.el.style.display = 'block';
      if (h.mount.dataset.html !== html) { h.mount.innerHTML = html; h.mount.dataset.html = html; bind(h.mount); }
      return;
    }
    drop('sizer-inline');
    if (state.phase === 'reading') return;
    const h = host('sizer-pill', (el) => { if (!el.isConnected) document.documentElement.appendChild(el); });
    const pill = `<button class="pill" data-act="why" aria-haspopup="dialog">${MARK}<span>Sizer</span>${state.listing && state.listing.size ? `<b>${esc(state.listing.size)}</b>` : ''}</button>`;
    if (h.mount.dataset.html !== pill) { h.mount.innerHTML = pill; h.mount.dataset.html = pill; bind(h.mount); }
  }

  function render() {
    renderLine();
    if (state.sheetOpen) renderSheet();
  }

  // ---- actions --------------------------------------------------------------------------

  // Copies the message to the clipboard; Sizer never sends it.
  async function copyMessage() {
    const text = state.answer && state.answer.message;
    if (!text) return;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
    if (!ok) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(area);
      area.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
    }
    if (!ok) return;
    state.copied = true;
    render();
    setTimeout(() => { state.copied = false; render(); }, 2500);
  }

  // On this click only: up to four photo addresses go to the read-chart-image function.
  // The answer lands on the listing it was asked for: if the shopper moved to another listing while
  // the photos were read, it is dropped; if the page re-read the same listing meanwhile, it goes on
  // the current read (run() keeps it through later re-reads).
  async function readPhotos() {
    const l = state.listing;
    if (!l || state.photos === 'reading') return;
    const at = page;
    const href = location.href;
    state.photos = 'reading';
    state.photosNote = '';
    render();
    const r = await message({ type: 'sizer:read-measurements', image_urls: l.photos.slice(0, 4), kind: l.kind });
    if (at !== page || location.href !== href || !state.listing) return;
    const cur = state.listing;
    if (!r || !r.measurements) {
      state.photos = 'idle';
      state.photosNote = 'Sizer couldn’t read the photos. Try again later.';
    } else {
      const merged = Vinted.mergeMeasurements(cur.have, r.measurements);
      state.photos = 'done';
      state.fromPhoto = state.fromPhoto.concat(merged.fromPhoto);
      cur.have = merged.have;
      state.photosNote = merged.fromPhoto.length ? '' : 'No measurements found in the photos.';
      recompute();
    }
    render();
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
        if (act === 'profile') message({ type: 'sizer:options' });
        if (act === 'ask') copyMessage();
        if (act === 'photos') readPhotos();
      };
    });
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheetOpen) closeSheet(); });

  // The popup asks the same questions it asks a shop page. Off a listing (Vinted moved to the
  // catalogue in place) there is no product here. The popup never offers its AI page read on Vinted
  // (ui/popup.js), so sizer:open carries no msg.ai here and none is spent.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'sizer:analyze') {
      if (!onListing()) { reply({ result: null, isProduct: false }); return false; }
      run().then(() => reply({ result: Vinted.popupResult(state.answer, state.listing), isProduct: !!state.listing }));
      return true;
    }
    if (msg.type === 'sizer:open') {
      if (!onListing()) { reply({ ok: false, brand: false, sizes: 0 }); return false; }
      run().then(() => {
        state.sheetOpen = true;
        renderSheet();
        const l = state.listing;
        reply({ ok: true, brand: !!(l && l.brand), sizes: l && l.size ? 1 : 0 });
      });
      return true;
    }
    if (msg.type === 'sizer:product-text') {
      const l = state.listing || readListing(document, location.hostname);
      reply({ title: l.title, headings: [], picker: l.sizeRaw ? `Size ${l.sizeRaw}` : '' });
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((c) => { if (c.profile || c.charts) run(); });

  // Vinted re-renders and moves between listings without a full reload: keep the line attached and
  // start over when the address changes to another listing.
  let pending = 0;
  new MutationObserver((muts) => {
    if (muts.every((m) => m.target.closest && m.target.closest('#sizer-inline, #sizer-panel, #sizer-pill'))) return;
    clearTimeout(pending);
    pending = setTimeout(() => { if (state.phase === 'ready') renderLine(); }, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });

  let url = location.href;
  [600, 2000, 4500].forEach((ms) => setTimeout(run, ms));
  setInterval(() => {
    if (location.href === url) return;
    url = location.href;
    page++;
    Object.assign(state, { phase: 'reading', listing: null, answer: null, sheetOpen: false, copied: false, photos: 'idle', photosNote: '', fromPhoto: [] });
    drop('sizer-panel');
    drop('sizer-inline');
    drop('sizer-pill');
    if (!onListing()) return;
    [600, 2000].forEach((ms) => setTimeout(run, ms));
  }, 500);
})();
