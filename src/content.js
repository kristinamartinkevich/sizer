(function () {
  if (window.__sizerLoaded) return;
  window.__sizerLoaded = true;

  const { recommend } = globalThis.SizerEngine;
  const { extractProduct } = globalThis.SizerExtract;

  let host = null;
  let shadow = null;
  let open = false;
  let last = null;

  function getProfile() {
    return new Promise((resolve) => chrome.storage.sync.get({ profile: globalThis.SIZER_DEFAULT_PROFILE }, (r) => resolve(r.profile)));
  }

  async function analyze() {
    const product = extractProduct(document, globalThis.SizerEngine);
    const profile = await getProfile();
    return { product, profile, result: product.isProduct || product.sizes.length ? recommend(profile, product) : null };
  }

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'sizer-root';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('src/panel.css');
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const deltaText = (d) => (Math.abs(d) >= 1 ? `${d > 0 ? '+' : '−'}${Math.abs(d)} size` : d > 0 ? 'leans up' : 'leans down');

  function render() {
    mount();
    const wrap = document.createElement('div');
    const { product, result } = last;
    if (!open) {
      wrap.innerHTML = `<button class="pill" aria-label="Open Sizer"><span class="mark">S</span>${result && result.ok ? `<span>Your size <b>${esc(result.size)}</b></span>` : '<span>Sizer</span>'}</button>`;
      wrap.querySelector('.pill').onclick = () => { open = true; render(); };
    } else {
      wrap.innerHTML = `<section class="card" role="dialog" aria-label="Sizer recommendation">
        <header><span class="mark">S</span><span class="title">Sizer</span><button class="x" aria-label="Close">×</button></header>
        ${body(product, result)}
        <footer><button class="link edit">Edit my sizes</button><button class="link again">Re-check page</button></footer>
      </section>`;
      wrap.querySelector('.x').onclick = () => { open = false; render(); };
      wrap.querySelector('.edit').onclick = () => chrome.runtime.sendMessage({ type: 'sizer:options' });
      wrap.querySelector('.again').onclick = () => run(true);
    }
    shadow.querySelectorAll('.pill, .card').forEach((n) => n.parentElement.remove());
    shadow.appendChild(wrap);
  }

  function body(product, r) {
    if (!r) return `<p class="muted">Sizer couldn’t find a product or size picker on this page.</p>`;
    if (!r.ok) return `<p class="muted">${esc(r.reason)}</p>`;
    const s = r.signals;
    const facts = [
      ['Brand', r.brand ? `${esc(r.brand)}${r.brandKnown ? '' : ' (no brand chart, using the standard one)'}` : 'Not found'],
      ['Stretch', { none: 'None', slight: 'Slight', high: 'High', unknown: 'Not stated' }[s.stretch] + (s.elastanePct ? `, ${s.elastanePct}% elastane` : '')],
      ['Fit note', s.fitNote ? `“${esc(s.fitNoteText)}”` : 'None on the page'],
      s.modelSize ? ['Model', `Wears ${esc(s.modelSize)}${s.modelHeight ? `, ${s.modelHeight} cm tall` : ''}`] : null,
      ['Sizes on page', product.sizes.length ? product.sizes.map((x) => `<span class="${x.available === false ? 'gone' : ''}">${esc(x.label)}</span>`).join(' ') : 'Not found'],
    ].filter(Boolean);
    return `
      <div class="hero">
        <div class="size">${esc(r.size)}</div>
        <div class="meta">
          <span class="conf conf-${r.confidence.toLowerCase()}">${r.confidence} confidence</span>
          ${r.available === false ? '<span class="warn">Sold out in this size</span>' : ''}
        </div>
      </div>
      ${r.alternative ? `<p class="alt">Or <b>${esc(r.alternative.size)}</b> ${esc(r.alternative.why)}.</p>` : ''}
      <h3>Why</h3>
      <ul class="reasons">${r.reasons.map((x) => `<li><span>${esc(x.text)}</span>${x.delta != null && x.delta !== 0 ? `<em>${deltaText(x.delta)}</em>` : ''}</li>`).join('')}</ul>
      <h3>What Sizer read on this page</h3>
      <dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <p class="fine">Brand charts are approximate${r.guide ? `. Check the ${esc(r.guide)}` : ''} before you buy.</p>`;
  }

  async function run(force) {
    last = await analyze();
    if (!force && !last.product.isProduct) {
      if (host) { host.remove(); host = null; shadow = null; }
      return;
    }
    render();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'sizer:open') { open = true; run(true).then(() => reply({ ok: true })); return true; }
    if (msg.type === 'sizer:analyze') { analyze().then((a) => reply({ result: a.result, brand: a.product.brand, title: a.product.title })); return true; }
  });

  chrome.storage.onChanged.addListener((c) => { if (c.profile && host) run(true); });

  // Product pages hydrate late and shops navigate without full reloads.
  let url = location.href;
  [800, 2500, 5000].forEach((ms) => setTimeout(() => run(false), ms));
  setInterval(() => {
    if (location.href !== url) {
      url = location.href;
      open = false;
      [800, 2500].forEach((ms) => setTimeout(() => run(false), ms));
    }
  }, 1000);
})();
