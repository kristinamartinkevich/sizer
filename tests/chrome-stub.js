// Lets the extension pages run in a plain browser tab for testing and store screenshots.
// ?profile=filled preloads a two-piece wardrobe.
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('profile') === 'filled') {
    localStorage.setItem('sizer', JSON.stringify({ profile: { anchors: [{ brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' }, { brand: 'rag & bone', type: 'jeans', size: '27', fit: 'perfect' }], waist: '70', hip: '97', inseam: '30', unit: 'cm', fitPreference: 'regular' } }));
  } else if (q.get('profile') === 'none') {
    localStorage.removeItem('sizer');
  }
  window.chrome = {
    runtime: { getURL: (p) => '../' + p, sendMessage: () => {}, onMessage: { addListener: () => {} }, openOptionsPage: () => {} },
    tabs: { query: async () => [] },
    storage: {
      sync: {
        get: (d, cb) => { const s = localStorage.getItem('sizer'); cb(s ? JSON.parse(s) : d); },
        set: (v, cb) => { localStorage.setItem('sizer', JSON.stringify(v)); if (cb) cb(); },
      },
      // ?charts=1 serves the verified rag & bone chart the way the background worker would have stored it.
      local: {
        get: (d, cb) => {
          if (!q.get('charts')) { cb(d); return; }
          fetch('../tests/fixtures/bundle-rag-bone.json').then((r) => r.json()).then((list) => cb({
            charts: { fetchedAt: Date.now(), brands: list.map((b) => ({ id: b.brand_id, name: b.brand_name, aliases: b.aliases || [], charts: b.charts, fitNotes: b.fit_notes || [], updatedAt: b.updated_at })) },
          })).catch(() => cb(d));
        },
        set: (v, cb) => { if (cb) cb(); },
      },
      onChanged: { addListener: () => {} },
    },
  };
})();
