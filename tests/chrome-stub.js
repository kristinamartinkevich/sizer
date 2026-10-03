// Lets the extension pages run in a plain browser tab for testing.
window.chrome = {
  runtime: { getURL: (p) => '../' + p, sendMessage: () => {}, onMessage: { addListener: () => {} }, openOptionsPage: () => {} },
  storage: {
    sync: {
      get: (d, cb) => { const s = localStorage.getItem('sizer'); cb(s ? JSON.parse(s) : d); },
      set: (v, cb) => { localStorage.setItem('sizer', JSON.stringify(v)); cb && cb(); },
    },
    onChanged: { addListener: () => {} },
  },
};
