// Review wf_fdd1e9c0-f4e: the Vinted page script (src/vinted-page.js) and the popup (ui/popup.js) run
// in a node vm sandbox with a minimal fake document and chrome, so their timing and messages can be
// checked without a browser. The fake DOM knows only what these two files touch.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Vinted = require('../src/vinted.js');
const Store = require('../src/charts-store.js');

const ROOT = path.join(__dirname, '..');
const PAGE_SRC = fs.readFileSync(path.join(ROOT, 'src/vinted-page.js'), 'utf8');
const POPUP_SRC = fs.readFileSync(path.join(ROOT, 'ui/popup.js'), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// ---- the Vinted page ----------------------------------------------------------------------------

const COS_TOP = { brand: 'COS', type: 'top', size: 'S', fit: 'perfect', flat: { chest: 49, length: 64 } };
const PHOTOS = ['https://images1.vinted.net/t/01_a/f800/1.jpeg'];

function pageSandbox(start) {
  const elements = [];
  const timeouts = [];
  const intervals = [];
  const listeners = { message: null, storage: null };
  const sent = [];
  const hold = { profile: false, queue: [] };
  let listing = start.listing;
  let reads = 0;

  function el(tag) {
    const e = {
      tagName: tag, id: '', style: {}, dataset: {}, className: '', isConnected: false, parentElement: null, children: [],
      _html: '', buttons: [], mount: null,
      attachShadow() { return { append: (...kids) => { e.mount = kids[kids.length - 1]; } }; },
      append() {}, remove() { e.isConnected = false; }, focus() {}, setAttribute() {}, getAttribute: () => null,
      insertAdjacentElement(_where, child) { child.isConnected = true; },
      querySelector: (sel) => (sel === '.sheet' ? { focus() {} } : null),
      querySelectorAll: (sel) => (sel === '[data-act]' ? e.buttons : []),
      closest: () => null,
    };
    Object.defineProperty(e, 'innerHTML', {
      get: () => e._html,
      set: (html) => { e._html = html; e.buttons = [...html.matchAll(/data-act="([a-z]+)"/g)].map((m) => ({ dataset: { act: m[1] }, onclick: null, isConnected: true, focus() {} })); },
    });
    elements.push(e);
    return e;
  }

  const location = { href: `https://www.vinted.fr${start.path}`, pathname: start.path, hostname: 'www.vinted.fr' };
  const sandbox = {
    location,
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: el,
      documentElement: { appendChild: (c) => { c.isConnected = true; } },
      body: { appendChild() {} },
      addEventListener() {},
    },
    MutationObserver: class { observe() {} },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearTimeout() {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    SIZER_MARK_SVG: '<svg></svg>',
    SIZER_STYLE: '',
    SIZER_DEFAULT_PROFILE: { anchors: [] },
    SizerVinted: { ...Vinted, listingFrom: () => { reads++; return JSON.parse(JSON.stringify(listing)); } },
    SizerEngine: { placeLabel: () => ({ result: null }), provenance: () => ({}) },
    SizerChartsStore: Store,
    chrome: {
      runtime: {
        id: 'sizer-test',
        sendMessage: (msg) => { sent.push(msg); return start.onSend ? start.onSend(msg) : Promise.resolve(null); },
        onMessage: { addListener: (fn) => { listeners.message = fn; } },
      },
      storage: {
        sync: { get: (_d, cb) => { const go = () => cb({ profile: { anchors: [COS_TOP] } }); if (hold.profile) hold.queue.push(go); else go(); } },
        local: { get: (_d, cb) => cb({ charts: null }) },
        onChanged: { addListener: (fn) => { listeners.storage = fn; } },
      },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(PAGE_SRC, sandbox, { filename: 'src/vinted-page.js' });

  return {
    location, sent, hold,
    get reads() { return reads; },
    setListing(l) { listing = l; },
    goTo(p) { location.pathname = p; location.href = `https://www.vinted.fr${p}`; },
    async runTimers() {
      while (timeouts.length) { const t = timeouts.shift(); if (t.ms >= 600) t.fn(); await flush(); }
    },
    async tick() { intervals.forEach((fn) => fn()); await flush(); },
    ask(msg) {
      return new Promise((resolve) => { listeners.message(msg, {}, resolve); });
    },
    async storageChanged() { listeners.storage({ profile: {} }); await flush(); },
    host(id) { return elements.find((e) => e.id === id && e.isConnected) || null; },
    panelHTML() { const h = elements.find((e) => e.id === 'sizer-panel' && e.isConnected); return h ? h.mount.innerHTML : ''; },
    async click(act) {
      const h = elements.find((e) => e.id === 'sizer-panel' && e.isConnected);
      const b = h && h.mount.buttons.find((x) => x.dataset.act === act);
      assert.ok(b, `no ${act} button in the sheet`);
      b.onclick();
      await flush();
    },
  };
}

const listingA = { brand: 'COS', title: 'Top A', sizeRaw: 'S', size: 'S', kind: 'top', condition: '', description: '', photos: PHOTOS, lang: 'en', have: {} };
const listingB = { brand: 'COS', title: 'Top B', sizeRaw: 'S', size: 'S', kind: 'top', condition: '', description: '', photos: PHOTOS, lang: 'en', have: { pit: 49 } };

test('a photo read that finishes after the shopper moved to another listing is dropped (finding 1)', async () => {
  const photo = deferred();
  const p = pageSandbox({ path: '/items/1-top-a', listing: listingA, onSend: (m) => (m.type === 'sizer:read-measurements' ? photo.promise : Promise.resolve(null)) });
  await p.ask({ type: 'sizer:open' });
  await p.click('photos');
  assert.ok(p.sent.some((m) => m.type === 'sizer:read-measurements'));
  // The shopper moves to listing B in place; B's run finishes before the photo answer arrives.
  p.goTo('/items/2-top-b');
  p.setListing(listingB);
  await p.tick();
  await p.runTimers();
  photo.resolve({ measurements: { pit: 48, length: 65 } });
  await flush();
  await p.ask({ type: 'sizer:open' });
  const html = p.panelHTML();
  assert.ok(html.includes('49 cm'), 'B shows its own measurement');
  assert.ok(!html.includes('read from a photo'), 'nothing on B is marked as read from a photo');
  assert.ok(!html.includes('65 cm'), 'A’s photo length is not on B');
  assert.ok(html.includes('data-act="photos"'), 'B can still have its own photos read');
});

test('a photo read survives a re-read of the same listing that was waiting when it finished (finding 1)', async () => {
  const photo = deferred();
  const p = pageSandbox({ path: '/items/1-top-a', listing: listingA, onSend: (m) => (m.type === 'sizer:read-measurements' ? photo.promise : Promise.resolve(null)) });
  await p.ask({ type: 'sizer:open' });
  await p.click('photos');
  // A profile change re-reads the page; it waits on storage while the photo answer lands.
  p.hold.profile = true;
  await p.storageChanged();
  photo.resolve({ measurements: { pit: 48, length: 65 } });
  await flush();
  p.hold.profile = false;
  p.hold.queue.splice(0).forEach((go) => go());
  await flush();
  await flush();
  const html = p.panelHTML();
  assert.ok(html.includes('48 cm'), 'the photo chest is kept');
  assert.ok(html.includes('65 cm'), 'the photo length is kept');
  assert.ok(html.includes('read from a photo'));
});

test('after Vinted moves to the catalogue in place, nothing reads it as a listing (finding 6)', async () => {
  const p = pageSandbox({ path: '/items/1-top-a', listing: listingA });
  p.goTo('/catalog/10-dresses');
  await p.runTimers();
  assert.strictEqual(p.reads, 0, 'the load-time runs do not read the catalogue');
  assert.strictEqual(p.host('sizer-pill'), null);
  assert.strictEqual(p.host('sizer-inline'), null);
  const analyzed = await p.ask({ type: 'sizer:analyze' });
  assert.strictEqual(analyzed.result, null);
  assert.strictEqual(analyzed.isProduct, false);
  const open = await p.ask({ type: 'sizer:open' });
  assert.strictEqual(open.ok, false);
  assert.strictEqual(p.host('sizer-panel'), null);
  await p.storageChanged();
  assert.strictEqual(p.reads, 0, 'a profile change does not read the catalogue either');
  // Back on a listing, it reads again.
  p.goTo('/items/2-top-b');
  p.setListing(listingB);
  await p.tick();
  await p.runTimers();
  assert.ok(p.reads > 0);
});

// ---- the popup ----------------------------------------------------------------------------------

function popupSandbox({ url, replies }) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || { id, textContent: '', hidden: id.startsWith('s-') && id !== 's-idle', disabled: false, onclick: null, classList: { toggle() {} }, appendChild() {} });
  const states = ['s-setup', 's-result', 's-idle', 's-ai'].map($);
  const sent = [];
  let closed = false;
  const sandbox = {
    document: {
      getElementById: $,
      querySelectorAll: (sel) => (sel === '.state' ? states : []),
      createElement: () => ({}),
      head: { appendChild() {} },
      documentElement: { dataset: {} },
    },
    window: { close: () => { closed = true; } },
    SIZER_DEFAULT_PROFILE: { anchors: [] },
    SizerFitQuestion: { STYLE: '', mount() {} },
    SizerFeedback: { due: () => [] },
    chrome: {
      runtime: { sendMessage: async (m) => { sent.push(m); return replies[m.type]; }, openOptionsPage() {} },
      tabs: { query: async () => [{ id: 7, url }], sendMessage: async (_id, m) => { sent.push(m); return replies[m.type]; } },
      scripting: { executeScript: async () => {} },
      storage: {
        sync: { get: (_d, cb) => cb({ profile: { anchors: [COS_TOP], waist: '', hip: '' } }) },
        local: { get: async () => ({ sizings: [] }) },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(POPUP_SRC, sandbox, { filename: 'ui/popup.js' });
  return { $, sent, get closed() { return closed; } };
}

test('the popup heading on a Vinted listing follows the verdict, never "Your size" over a size that is too small (finding 3)', async () => {
  const answer = Vinted.answerFor({ kind: 'top', lang: 'en', size: 'S', brand: 'COS', have: { pit: 44, length: 64 } }, { anchors: [COS_TOP] }, null, null);
  assert.strictEqual(answer.verdict, 'small');
  const result = Vinted.popupResult(answer, { size: 'S', brand: 'COS' });
  const p = popupSandbox({ url: 'https://www.vinted.fr/items/1-top', replies: { 'sizer:analyze': { result, isProduct: true } } });
  await flush();
  await flush();
  assert.strictEqual(p.$('s-result').hidden, false);
  assert.strictEqual(p.$('r-k').textContent, 'Too small for you');
  assert.match(p.$('r-headline').textContent, /^Too small for you/);
});

test('a shop result without its own heading keeps the shop wording', async () => {
  const p = popupSandbox({ url: 'https://www.zara.com/p/1', replies: { 'sizer:analyze': { result: { ok: true, size: 'M', headline: 'Your usual fit', confidence: 'High', brand: 'Zara' }, isProduct: true } } });
  await flush();
  await flush();
  assert.strictEqual(p.$('r-k').textContent, 'Your size');
});

test('on Vinted the popup never offers the AI page read, so no daily read is spent and discarded (finding 4)', async () => {
  // A listing with no brand and no size: the sheet opens on the page and the popup closes.
  const p = popupSandbox({ url: 'https://www.vinted.fr/items/1-top', replies: { 'sizer:analyze': { result: null, isProduct: true }, 'sizer:open': { ok: true, brand: false, sizes: 0 } } });
  await flush();
  await p.$('idle-try').onclick();
  assert.strictEqual(p.closed, true);
  assert.strictEqual(p.$('s-ai').hidden, true, 'the AI read is not offered');
  // Off a listing (the catalogue, reached in place): the popup says to open one, still no AI read.
  const q = popupSandbox({ url: 'https://www.vinted.fr/catalog/10-dresses', replies: { 'sizer:analyze': { result: null, isProduct: false }, 'sizer:open': { ok: false, brand: false, sizes: 0 } } });
  await flush();
  await q.$('idle-try').onclick();
  assert.strictEqual(q.closed, false);
  assert.strictEqual(q.$('s-ai').hidden, true);
  assert.match(q.$('idle-text').textContent, /Vinted listing/);
  assert.ok(!q.sent.some((m) => m.type === 'sizer:read-product' || m.type === 'sizer:product-text'));
  // A shop page that found no sizes still gets the offer.
  const s = popupSandbox({ url: 'https://shop.example/p/1', replies: { 'sizer:analyze': { result: null, isProduct: false }, 'sizer:open': { ok: true, brand: false, sizes: 0 } } });
  await flush();
  await s.$('idle-try').onclick();
  assert.strictEqual(s.$('s-ai').hidden, false);
});
