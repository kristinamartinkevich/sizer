// Lets the extension pages run in a plain browser tab for testing and store screenshots.
// ?profile=filled preloads a two-piece wardrobe. ?sizings=due adds two products sized nine days ago,
// so the popup and the side panel show "Did it fit?".
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('profile') === 'filled') {
    localStorage.setItem('sizer', JSON.stringify({ profile: { anchors: [{ brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' }, { brand: 'rag & bone', type: 'jeans', size: '27', fit: 'perfect' }], waist: '70', hip: '97', inseam: '30', unit: 'cm', fitPreference: 'regular' } }));
  } else if (q.get('profile') === 'none') {
    localStorage.removeItem('sizer');
  }
  const nineDaysAgo = Date.now() - 9 * 24 * 60 * 60 * 1000;
  const DUE = [
    { itemKey: 'rag and bone|wren', brand: 'rag & bone', style: 'WREN Straight leg jeans', kind: 'bottoms', type: 'jeans', shop: 'www.zalando.co.uk', size: 'W27/L32', tier: 2, sizes: ['W26/L32', 'W27/L32', 'W28/L32'], at: nineDaysAgo },
    { itemKey: 'zara|satin', brand: 'Zara', style: 'Satin slip dress', kind: 'dresses', type: 'dress', shop: 'www.zara.com', size: 'M', tier: null, sizes: ['XS', 'S', 'M', 'L'], at: nineDaysAgo - 60000 },
  ];
  window.chrome = {
    // Answers are saved after 300 ms, as if the background worker had saved them.
    runtime: { getURL: (p) => '../' + p, sendMessage: (m) => (/^sizer:(answer|dismiss)-fit$/.test(m && m.type) ? new Promise((r) => setTimeout(() => r({ ok: true }), 300)) : Promise.resolve(undefined)), onMessage: { addListener: () => {} }, openOptionsPage: () => {} },
    tabs: { query: async () => [] },
    storage: {
      sync: {
        get: (d, cb) => { const s = localStorage.getItem('sizer'); cb(s ? JSON.parse(s) : d); },
        set: (v, cb) => { localStorage.setItem('sizer', JSON.stringify(v)); if (cb) cb(); },
      },
      // ?charts=1 serves the verified rag & bone chart the way the background worker would have stored it.
      // Answers with a callback or a promise, as chrome.storage does.
      local: {
        get: (d, cb) => {
          const read = (async () => {
            if (d && 'sizings' in d) return { sizings: q.get('sizings') === 'due' ? DUE : [] };
            if (!q.get('charts')) return d;
            try {
              const list = await (await fetch('../tests/fixtures/bundle-rag-bone.json')).json();
              return { charts: { fetchedAt: Date.now(), brands: list.map((b) => ({ id: b.brand_id, name: b.brand_name, aliases: b.aliases || [], charts: b.charts, fitNotes: b.fit_notes || [], updatedAt: b.updated_at })) } };
            } catch { return d; }
          })();
          if (cb) read.then(cb);
          return read;
        },
        set: (v, cb) => { if (cb) cb(); return Promise.resolve(); },
      },
      onChanged: { addListener: () => {} },
    },
  };
})();
