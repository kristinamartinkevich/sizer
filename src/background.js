importScripts('charts-store.js', 'defaults.js', 'feedback.js');

const Store = globalThis.SizerChartsStore;
const Feedback = globalThis.SizerFeedback;
const REFRESH_ALARM = 'sizer:refresh-charts';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('ui/options.html?welcome=1') });
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 24 * 60 });
  refreshCharts();
});

chrome.runtime.onStartup.addListener(() => { refreshCharts(); flushOutcomes(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === REFRESH_ALARM) { refreshCharts(); flushOutcomes(); } });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'sizer:options') chrome.runtime.openOptionsPage();
  if (msg.type === 'sizer:refresh-charts') { refreshCharts(true).then(reply); return true; }
  if (msg.type === 'sizer:item-fit') { itemFit(msg.key).then(reply, () => reply({ rows: [] })); return true; }
  if (msg.type === 'sizer:report-fit') { reportFit(msg).then(reply, (e) => reply({ ok: false, reason: String(e) })); return true; }
  if (msg.type === 'sizer:lookup-chart') { lookupChart({ ...msg, shop: shopOf(sender, msg) }).then(reply); return true; }
  if (msg.type === 'sizer:lookup-wanted') { lookupWanted(msg).then(reply, () => reply({ wanted: false })); return true; }
  if (msg.type === 'sizer:read-chart-image') { readChartImage(msg).then(reply); return true; }
  if (msg.type === 'sizer:fit-dossier') { fitDossier({ ...msg, shop: shopOf(sender, msg) }).then(reply); return true; }
  // Only the popup asks this, on the shopper's click; a page's script cannot.
  if (msg.type === 'sizer:read-product' && !sender.tab) { readProduct(msg.text).then(reply); return true; }
  // Recent sizings and "did it fit?": a product page remembers its answer; the popup, the side panel
  // and the sheet on a revisit send an answer or a dismissal.
  if (msg.type === 'sizer:remember-sizing' && sender.tab) { rememberSizing(msg.sizing, shopOf(sender, msg)).then(reply, () => reply({ ok: false })); return true; }
  if (msg.type === 'sizer:answer-fit') { answerFit(msg).then(reply, (e) => reply({ ok: false, reason: String(e) })); return true; }
  if (msg.type === 'sizer:dismiss-fit') { dismissFit(msg).then(reply, () => reply({ ok: false })); return true; }
  // Only Sizer's own script on a Vinted listing asks this, on the shopper's click.
  if (msg.type === 'sizer:read-measurements' && fromVinted(sender)) { readMeasurements(msg).then(reply); return true; }
});

// The shop is the sending tab's hostname, not whatever the page claims; only the hostname travels.
function shopOf(sender, msg) {
  try { return new URL(sender.tab.url).hostname; } catch { return String(msg.shop || ''); }
}

// ---- a brand nobody has a chart for -----------------------------------------

const lookupChart = Store.createLookup({
  fetch: (url, init) => fetch(url, init),
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  installId: () => installId(),
});

// Whether a lookup for this brand and kind would reach the function, so the page only looks for a
// guide page or a chart image when the answer would be used.
async function lookupWanted({ brand, kind }) {
  const key = Store.missKey(brand, kind);
  if (!key) return { wanted: false };
  const entry = (await chrome.storage.local.get(key))[key];
  return { wanted: !Store.isMissFresh(entry) };
}

// ---- what others say about the fit online ------------------------------------

const fitDossier = Store.createDossier({
  fetch: (url, init) => fetch(url, init),
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  installId: () => installId(),
});

// ---- a size chart image, and the product-text fallback, read with AI ----------

const readChartImage = Store.createImageRead({
  fetch: (url, init) => fetch(url, init),
  installId: () => installId(),
});

const readProduct = Store.createProductRead({
  fetch: (url, init) => fetch(url, init),
  installId: () => installId(),
});

// ---- measurements read from a Vinted listing's photos ---------------------------

const readMeasurements = Store.createMeasurementsRead({
  fetch: (url, init) => fetch(url, init),
  installId: () => installId(),
});

function fromVinted(sender) {
  try { return /^www\.vinted\.[a-z.]+$/.test(new URL(sender.tab.url).hostname); } catch { return false; }
}

// ---- one style across shops -------------------------------------------------

const ITEM_FIT_TTL = 6 * 60 * 60 * 1000;

// What Sizer users read on other shops for this style, cached for a few hours per style.
async function itemFit(key) {
  if (!key) return { rows: [] };
  const slot = `itemFit:${key}`;
  const cached = (await chrome.storage.local.get(slot))[slot];
  if (cached && Date.now() - cached.at < ITEM_FIT_TTL) return { rows: cached.rows };
  const res = await fetch(Store.ITEM_FIT_URL + encodeURIComponent(key), { headers: Store.headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  await chrome.storage.local.set({ [slot]: { at: Date.now(), rows } });
  return { rows };
}

// A random id per install, so a re-read of the same shop page replaces the earlier report.
async function installId() {
  const { installId: id } = await chrome.storage.local.get('installId');
  if (id) return id;
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ installId: fresh });
  return fresh;
}

// Sends the tally of what this page's reviews say about fit. Brand, style, shop and counts only.
async function reportFit({ key, brand, style, vendor, counts }) {
  if (!key || !counts || !counts.total) return { ok: false, reason: 'nothing to report' };
  const body = {
    p_item_key: key, p_brand: String(brand).slice(0, 80), p_style: String(style).slice(0, 80), p_vendor: vendor, p_install: await installId(),
    p_small: counts.small, p_large: counts.large, p_tts: counts.tts, p_total: Math.min(counts.total, 5000), p_from_summary: !!counts.fromSummary,
  };
  const res = await fetch(Store.REPORT_URL, { method: 'POST', headers: { ...Store.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await chrome.storage.local.remove(`itemFit:${key}`);
  return { ok: true };
}

// ---- did it fit? ----------------------------------------------------------------

// One change to the sizings list at a time, so two tabs sizing at once never lose one.
let sizingsQueue = Promise.resolve();
function withSizings(change) {
  const run = sizingsQueue.then(async () => {
    const { sizings } = await chrome.storage.local.get({ sizings: [] });
    const out = await change(sizings);
    if (out && out.sizings) await chrome.storage.local.set({ sizings: out.sizings });
    return out ? out.reply : { ok: false };
  });
  sizingsQueue = run.catch(() => {});
  return run;
}

// The page's sizing, field by field, with the shop from the sending tab and the time from here.
function rememberSizing(sizing, shop) {
  if (!sizing || typeof sizing.itemKey !== 'string' || !sizing.itemKey) return Promise.resolve({ ok: false });
  const clean = {
    itemKey: sizing.itemKey.slice(0, 200), brand: String(sizing.brand || '').slice(0, 80), style: String(sizing.style || '').slice(0, 120),
    kind: sizing.kind, type: sizing.type || null, shop: String(shop || '').toLowerCase(), size: String(sizing.size || '').slice(0, 20),
    tier: Number.isInteger(sizing.tier) ? sizing.tier : null,
    learned: [-1, 0, 1].includes(sizing.learned) ? sizing.learned : 0,
    sizes: Array.isArray(sizing.sizes) ? sizing.sizes.map((s) => String(s).slice(0, 20)).slice(0, 30) : [],
  };
  return withSizings((list) => ({ sizings: Feedback.remember(list, { ...clean, at: Date.now() }, Date.now()), reply: { ok: true } }));
}

// An answer: the piece joins the fit profile (sync storage, never sent), the sizing is marked, and the
// anonymous outcome (outcomeBody's fields only) goes to the database, or waits if it cannot.
function answerFit({ itemKey, answer }) {
  return withSizings(async (list) => {
    const { profile } = await chrome.storage.sync.get({ profile: globalThis.SIZER_DEFAULT_PROFILE });
    const out = Feedback.applyAnswer(list, profile, itemKey, answer, await installId(), Date.now());
    if (!out) return { reply: { ok: false, reason: 'unknown item or incomplete answer' } };
    await chrome.storage.sync.set({ profile: out.profile });
    const { outcomeOutbox } = await chrome.storage.local.get({ outcomeOutbox: [] });
    await chrome.storage.local.set({ outcomeOutbox: Feedback.enqueue(outcomeOutbox, out.body) });
    flushOutcomes();
    return { sizings: out.list, reply: { ok: true } };
  });
}

function dismissFit({ itemKey }) {
  return withSizings((list) => ({ sizings: Feedback.dismiss(list, itemKey), reply: { ok: true } }));
}

// Sends what is waiting, oldest first; whatever fails stays for the next day's try. A refusal
// (4xx: a bad body) is dropped, so one bad outcome never blocks the rest.
// An answer that arrives while a send is running asks for another pass, so it goes out now rather
// than the next day; the outbox is rewritten in the same queue answers are added in, so none is lost.
let flushing = null;
let flushAgain = false;
function flushOutcomes() {
  if (flushing) { flushAgain = true; return flushing; }
  flushing = (async () => {
    let offline = false;
    do {
      flushAgain = false;
      const { outcomeOutbox } = await chrome.storage.local.get({ outcomeOutbox: [] });
      // Kept as the exact text sent, so an answer changed while this was sending still waits its turn.
      const sent = new Set();
      for (const body of outcomeOutbox.slice().reverse()) {
        const text = JSON.stringify(body);
        try {
          const res = await fetch(Store.OUTCOME_URL, { method: 'POST', headers: { ...Store.headers(), 'Content-Type': 'application/json' }, body: text });
          if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) sent.add(text);
        } catch { offline = true; break; }
      }
      if (sent.size) {
        await withSizings(async () => {
          const { outcomeOutbox: now } = await chrome.storage.local.get({ outcomeOutbox: [] });
          await chrome.storage.local.set({ outcomeOutbox: now.filter((b) => !sent.has(JSON.stringify(b))) });
        });
      }
    } while (flushAgain && !offline);
  })().catch(() => {}).finally(() => { flushing = null; flushAgain = false; });
  return flushing;
}

// Downloads the charts once a day (checked ones and machine-read lookups). Offline, the last good bundle is kept; before any
// download, the charts shipped with the extension are used.
// What Sizer users who bought each brand said (brand_fit). A failed download keeps the last one.
async function brandFit(previous) {
  try {
    const res = await fetch(Store.BRAND_FIT_URL, { headers: Store.headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Store.normaliseBrandFit(await res.json());
  } catch {
    return previous && Array.isArray(previous.brandFit) ? previous.brandFit : [];
  }
}

async function refreshCharts(force = false) {
  const { charts } = await chrome.storage.local.get('charts');
  if (!force && Store.isFresh(charts)) return { ok: true, reason: 'fresh' };
  try {
    const res = await fetch(Store.BUNDLE_URL, { headers: Store.headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bundle = Store.withBrandFit(Store.normalise(await res.json()), await brandFit(charts));
    await chrome.storage.local.set({ charts: bundle });
    return { ok: true, brands: bundle.brands.length };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}
