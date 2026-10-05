const $ = (id) => document.getElementById(id);
const FILES = ['src/brands.js', 'src/charts-store.js', 'src/charts.js', 'src/defaults.js', 'src/review-details.js', 'src/engine.js', 'src/guide-table.js', 'src/extract.js', 'src/panel-style.js', 'src/mark.js', 'src/content.js'];

function show(id) {
  document.querySelectorAll('.state').forEach((s) => (s.hidden = s.id !== id));
}

function summary(profile) {
  if (profile.waist && profile.hip) return 'From your measurements';
  const n = profile.anchors.length;
  return n ? `From ${n} piece${n > 1 ? 's' : ''} you own` : '';
}

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

function cannotRead() {
  show('s-idle');
  $('idle-text').textContent = 'Chrome doesn’t let extensions read this page.';
  $('idle-try').hidden = true;
}

document.querySelectorAll('[data-act="profile"]').forEach((b) => (b.onclick = () => chrome.runtime.openOptionsPage()));
document.querySelectorAll('[data-act="why"]').forEach((b) => {
  b.onclick = async () => {
    const tab = await activeTab();
    try {
      await send(tab, { type: 'sizer:open' });
      window.close();
    } catch {
      cannotRead();
    }
  };
});

// "Check this page anyway": the sheet opens on the page; when it found no brand or no sizes, the
// popup stays open and offers to read the page with AI instead.
$('idle-try').onclick = async () => {
  const tab = await activeTab();
  let r;
  try { r = await send(tab, { type: 'sizer:open' }); } catch { cannotRead(); return; }
  if (r && r.brand && r.sizes) { window.close(); return; }
  show('s-ai');
};

// Sends only the cleaned product text (see productBody in src/charts-store.js), on this click alone.
$('ai-read').onclick = async () => {
  const tab = await activeTab();
  $('ai-read').disabled = true;
  $('ai-text').textContent = 'Reading the page';
  try {
    const text = await send(tab, { type: 'sizer:product-text' });
    const r = await chrome.runtime.sendMessage({ type: 'sizer:read-product', text });
    if (!r || !r.product) throw new Error((r && r.error) || 'no answer');
    await send(tab, { type: 'sizer:open', ai: r.product });
    window.close();
  } catch {
    $('ai-text').textContent = 'Sizer couldn’t read this page. Try again later.';
    $('ai-read').disabled = false;
  }
};

chrome.storage.sync.get({ profile: SIZER_DEFAULT_PROFILE }, async ({ profile }) => {
  if (profile.theme === 'light' || profile.theme === 'dark') document.documentElement.dataset.theme = profile.theme;
  const hasProfile = (profile.waist && profile.hip) || profile.bust || profile.anchors.length || profile.footLength;
  $('profile').textContent = summary(profile);
  if (!hasProfile) { show('s-setup'); return; }

  show('s-idle');
  const tab = await activeTab();
  if (!tab || !/^https?:/.test(tab.url || '')) {
    $('idle-try').hidden = true;
    return;
  }
  let r;
  try { r = await send(tab, { type: 'sizer:analyze' }); } catch { $('idle-try').hidden = true; return; }
  const res = r && r.result;
  if (!res || !res.ok || !r.isProduct) return;

  show('s-result');
  $('r-k').textContent = res.confidence === 'Low' ? 'Rough guess' : 'Your size';
  $('r-size').textContent = res.size;
  $('r-headline').textContent = res.headline;
  $('r-headline').classList.toggle('moved', res.headline !== 'Your usual fit');
  $('r-meta').textContent = `${res.brand || 'Unknown brand'} · ${res.confidence} confidence`;
  if (res.available === false) {
    $('r-stock').hidden = false;
    $('r-stock').textContent = res.stockText;
  }
});
