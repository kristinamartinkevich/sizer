importScripts('charts-store.js');

const Store = globalThis.SizerChartsStore;
const REFRESH_ALARM = 'sizer:refresh-charts';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('ui/options.html?welcome=1') });
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 24 * 60 });
  refreshCharts();
});

chrome.runtime.onStartup.addListener(() => refreshCharts());
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === REFRESH_ALARM) refreshCharts(); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'sizer:options') chrome.runtime.openOptionsPage();
  if (msg.type === 'sizer:refresh-charts') { refreshCharts(true).then(reply); return true; }
  if (msg.type === 'sizer:item-fit') { itemFit(msg.key).then(reply, () => reply({ rows: [] })); return true; }
  if (msg.type === 'sizer:report-fit') { reportFit(msg).then(reply, (e) => reply({ ok: false, reason: String(e) })); return true; }
  if (msg.type === 'sizer:lookup-chart') { lookupChart({ ...msg, shop: shopOf(sender, msg) }).then(reply); return true; }
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

// Downloads the verified charts once a day. Offline, the last good bundle is kept; before any
// download, the charts shipped with the extension are used.
async function refreshCharts(force = false) {
  const { charts } = await chrome.storage.local.get('charts');
  if (!force && Store.isFresh(charts)) return { ok: true, reason: 'fresh' };
  try {
    const res = await fetch(Store.BUNDLE_URL, { headers: Store.headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bundle = Store.normalise(await res.json());
    await chrome.storage.local.set({ charts: bundle });
    return { ok: true, brands: bundle.brands.length };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}
