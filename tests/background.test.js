// The service worker's message router, loaded in a sandbox with a stub chrome (C4 review): the
// product-text read is the popup's alone, so a page's script cannot spend the shared AI caps.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBackground(opts = {}) {
  const listeners = [];
  const fetches = [];
  const noop = { addListener: () => {} };
  const store = {};
  const sandbox = {
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onMessage: { addListener: (f) => listeners.push(f) }, getURL: (p) => p, openOptionsPage: () => {} },
      alarms: { onAlarm: noop, create: () => {} },
      tabs: { create: () => {} },
      storage: { local: { get: async () => store, set: async (o) => Object.assign(store, o) } },
    },
    fetch: async (url, init) => { fetches.push({ url, body: init && init.body }); return { ok: true, status: 200, json: async () => ({}) }; },
    crypto: globalThis.crypto,
    URL, AbortController, setTimeout, clearTimeout, console,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8'), ctx);
  if (opts.ai) sandbox.SIZER_AI = true;
  const replies = [];
  return { send: (msg, sender) => listeners[0](msg, sender, (r) => replies.push(r)), fetches, replies, sandbox };
}

const TEXT = { title: 'Pleated wool trousers', headings: ['Details'], picker: 'Cut generously at the hip.' };
const productReads = (fetches) => fetches.filter((f) => /read-chart-image\/product/.test(f.url));

test('a page cannot ask for the product-text read; nothing is sent', async () => {
  const bg = loadBackground();
  const kept = bg.send({ type: 'sizer:read-product', text: TEXT }, { tab: { id: 4, url: 'https://shop.example/p' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.notStrictEqual(kept, true);
  assert.deepStrictEqual(productReads(bg.fetches), []);
});

test('the popup can, and the request goes to the product route', async () => {
  const bg = loadBackground({ ai: true });
  const kept = bg.send({ type: 'sizer:read-product', text: TEXT }, { id: 'ext', url: 'chrome-extension://x/ui/popup.html' });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(kept, true);
  assert.strictEqual(productReads(bg.fetches).length, 1);
});

// The AI switch (SIZER_AI in src/defaults.js) ships off: no AI request leaves, whoever asks.
const tab = { tab: { id: 4, url: 'https://www.vinted.fr/items/1-skirt' } };
const popup = { id: 'ext', url: 'chrome-extension://x/ui/popup.html' };
const AI_ASKS = [
  [{ type: 'sizer:lookup-chart', brand: 'Paloma Wool', kind: 'bottoms' }, tab],
  [{ type: 'sizer:lookup-wanted', brand: 'Paloma Wool', kind: 'bottoms' }, tab],
  [{ type: 'sizer:read-chart-image', image_url: 'https://shop.example/chart.png', brand: 'Paloma Wool', kind: 'bottoms' }, tab],
  [{ type: 'sizer:fit-dossier', itemKey: 'paloma wool|skirt', brand: 'Paloma Wool', style: 'skirt', kind: 'bottoms' }, tab],
  [{ type: 'sizer:read-product', text: TEXT }, popup],
  [{ type: 'sizer:read-measurements', image_urls: ['https://images1.vinted.net/t/a.jpg'], kind: 'bottoms' }, tab],
];

test('with the AI switch off, no AI request is sent and each ask is answered as off', async () => {
  assert.strictEqual(loadBackground().sandbox.SIZER_AI, false);
  for (const [msg, sender] of AI_ASKS) {
    const bg = loadBackground();
    bg.send(msg, sender);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepStrictEqual(bg.fetches.map((f) => f.url), [], msg.type);
    assert.strictEqual(bg.replies.length, 1, msg.type);
    assert.strictEqual(bg.replies[0].off, true, msg.type);
  }
});
