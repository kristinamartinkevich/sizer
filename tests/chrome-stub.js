// Lets the extension pages run in a plain browser tab for testing and store screenshots.
// ?profile=filled preloads a two-piece wardrobe.
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get('profile') === 'filled') {
    localStorage.setItem('sizer', JSON.stringify({ profile: { anchors: [{ brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' }, { brand: 'rag & bone', type: 'jeans', size: '27', fit: 'tight' }], waist: '70', hip: '97', inseam: '30', unit: 'cm', fitPreference: 'regular' } }));
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
      onChanged: { addListener: () => {} },
    },
  };
})();
