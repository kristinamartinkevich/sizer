const $ = (id) => document.getElementById(id);
const FILES = ['src/brands.js', 'src/defaults.js', 'src/engine.js', 'src/extract.js', 'src/content.js'];

chrome.storage.sync.get({ profile: SIZER_DEFAULT_PROFILE }, ({ profile }) => {
  const name = (a) => {
    const known = SizerBrands.BRANDS.find((b) => b.id === a.brand);
    if (known) return known.name;
    if (!a.brand || a.brand.startsWith('generic')) return a.type === 'jeans' || a.brand === 'generic-denim' ? 'Jeans' : 'Size';
    return a.brand;
  };
  const known = profile.anchors.map((a) => `${name(a)} ${a.size}`).join(', ');
  $('profile').textContent = profile.waist && profile.hip ? 'Based on your measurements' : known ? `Based on ${known}` : 'Add your measurements or a size you know to get started.';
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Shops without a built-in match still work: inject on demand via activeTab.
async function send(tab, msg) {
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
    return chrome.tabs.sendMessage(tab.id, msg);
  }
}

(async () => {
  const tab = await activeTab();
  if (!tab || !/^https?:/.test(tab.url || '')) return;
  try {
    const r = await send(tab, { type: 'sizer:analyze' });
    if (r && r.result && r.result.ok) {
      $('result').hidden = false;
      $('result').innerHTML = '';
      const big = document.createElement('div');
      big.className = 'big';
      big.textContent = r.result.size;
      const sub = document.createElement('div');
      sub.className = 'muted';
      sub.textContent = `${r.result.brand || 'Unknown brand'} · ${r.result.confidence} confidence`;
      $('result').append(big, sub);
    }
  } catch {
    // Pages Chrome won't let extensions touch (store pages, PDFs) just skip the preview.
  }
})();

$('show').onclick = async () => {
  const tab = await activeTab();
  try { await send(tab, { type: 'sizer:open' }); window.close(); } catch { $('profile').textContent = 'Sizer can’t run on this page.'; }
};
$('edit').onclick = () => chrome.runtime.openOptionsPage();
