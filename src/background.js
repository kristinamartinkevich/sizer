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

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'sizer:options') chrome.runtime.openOptionsPage();
  if (msg.type === 'sizer:refresh-charts') { refreshCharts(true).then(reply); return true; }
});

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
