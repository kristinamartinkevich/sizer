// The "did it fit?" outbox in the service worker, loaded in a sandbox with a stub chrome (C6 review):
// an answer given while an earlier one is still sending goes out in the same run, and none is lost.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INSTALL = '3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64';

// chrome.storage with its defaults behaviour: get({ key: fallback }) answers the fallback when unset.
function area(data) {
  return {
    get: async (keys) => {
      if (typeof keys === 'string') return keys in data ? { [keys]: data[keys] } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
      return Object.fromEntries(Object.entries(keys || {}).map(([k, d]) => [k, k in data ? structuredClone(data[k]) : d]));
    },
    set: async (o) => { Object.assign(data, structuredClone(o)); },
    remove: async (k) => { delete data[k]; },
  };
}

function loadBackground({ local, fetch }) {
  const listeners = [];
  const noop = { addListener: () => {} };
  const sandbox = {
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onMessage: { addListener: (f) => listeners.push(f) }, getURL: (p) => p, openOptionsPage: () => {} },
      alarms: { onAlarm: noop, create: () => {} },
      tabs: { create: () => {} },
      storage: { local: area(local), sync: area({ profile: { anchors: [] } }), onChanged: noop },
    },
    fetch, crypto: globalThis.crypto, structuredClone, URL, AbortController, setTimeout, clearTimeout, console,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8'), ctx);
  return (msg) => new Promise((reply) => { if (listeners[0](msg, {}, reply) !== true) reply(undefined); });
}

const sizing = (key) => ({ itemKey: key, brand: 'Ostra', style: 'Mira jeans', kind: 'bottoms', type: 'jeans', shop: 'shop.example', size: '27', tier: 2, learned: 0, sizes: ['26', '27', '28'], at: 0 });
const settle = () => new Promise((r) => setTimeout(r, 30));

test('an answer given while another is sending goes out in the same run, and the outbox empties', async () => {
  const local = { installId: INSTALL, sizings: [sizing('ostra|mira'), sizing('ostra|lune')], outcomeOutbox: [] };
  const posted = [];
  let release;
  const held = new Promise((r) => { release = r; });
  const send = loadBackground({
    local,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      posted.push(body.item_key);
      if (posted.length === 1) await held; // the first answer is still sending when the second arrives
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  assert.strictEqual((await send({ type: 'sizer:answer-fit', itemKey: 'ostra|mira', answer: { sizeBought: '27', outcome: 'small' } })).ok, true);
  await settle();
  assert.strictEqual((await send({ type: 'sizer:answer-fit', itemKey: 'ostra|lune', answer: { sizeBought: '27', outcome: 'right' } })).ok, true);
  release();
  await settle();
  assert.strictEqual(posted.join(','), 'ostra|mira,ostra|lune');
  assert.strictEqual(local.outcomeOutbox.length, 0);
});

test('offline, answers wait in the outbox and the run stops instead of retrying in a loop', async () => {
  const local = { installId: INSTALL, sizings: [sizing('ostra|mira')], outcomeOutbox: [] };
  let calls = 0;
  const send = loadBackground({ local, fetch: async () => { calls += 1; throw new TypeError('offline'); } });
  await send({ type: 'sizer:answer-fit', itemKey: 'ostra|mira', answer: { sizeBought: '27', outcome: 'small' } });
  await settle();
  assert.strictEqual(calls, 1);
  assert.strictEqual(local.outcomeOutbox.length, 1);
  assert.strictEqual(local.outcomeOutbox[0].item_key, 'ostra|mira');
});
