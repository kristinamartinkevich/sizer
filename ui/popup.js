const $ = (id) => document.getElementById(id);
const FILES = ['src/brands.js', 'src/defaults.js', 'src/engine.js', 'src/extract.js', 'src/panel-style.js', 'src/content.js'];

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

document.querySelectorAll('[data-act="profile"]').forEach((b) => (b.onclick = () => chrome.runtime.openOptionsPage()));
document.querySelectorAll('[data-act="why"]').forEach((b) => {
  b.onclick = async () => {
    const tab = await activeTab();
    try {
      await send(tab, { type: 'sizer:open' });
      window.close();
    } catch {
      show('s-idle');
      $('idle-text').textContent = 'Chrome doesn’t let extensions read this page.';
      $('idle-try').hidden = true;
    }
  };
});

chrome.storage.sync.get({ profile: SIZER_DEFAULT_PROFILE }, async ({ profile }) => {
  const hasProfile = (profile.waist && profile.hip) || profile.anchors.length;
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
