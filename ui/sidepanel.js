// The side panel: the current tab's full reasoning, the Vinted slot on Vinted listings, and recent
// sizings with their "did it fit?" questions. It reads the page through the tab's content script
// and keeps nothing of its own.
const $ = (id) => document.getElementById(id);
const FILES = ['src/brands.js', 'src/charts-store.js', 'src/charts.js', 'src/defaults.js', 'src/review-details.js', 'src/engine.js', 'src/guide-table.js', 'src/extract.js', 'src/panel-style.js', 'src/mark.js', 'src/feedback.js', 'src/fit-question.js', 'src/sheet.js', 'src/content.js'];
const VINTED_ITEM = /^https:\/\/(?:www\.)?vinted\.[a-z.]+\/items\//i;
const OUTCOME_WORDS = { small: 'too small', right: 'right', big: 'too big' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const style = document.createElement('style');
style.textContent = SizerFitQuestion.STYLE;
document.head.appendChild(style);

$('profile').onclick = () => chrome.runtime.openOptionsPage();

// ---- this page -----------------------------------------------------------------

// The reasoning sits in a shadow root with the sheet's own styles, so it reads as the sheet does.
const sheetHost = $('now-sheet');
const sheetRoot = sheetHost.attachShadow({ mode: 'open' });

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ask(tab, msg) {
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Shops without a built-in match: the popup's click grants this tab, as it does for the popup.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
    return chrome.tabs.sendMessage(tab.id, msg);
  }
}

function nowText(text) {
  $('now-text').hidden = false;
  $('now-text').textContent = text;
  sheetHost.hidden = true;
}

let reading = 0;
async function showPage() {
  const turn = ++reading;
  const tab = await activeTab();
  vintedSlot(tab);
  if (!tab || !/^https?:/.test(tab.url || 'https:')) { nowText('Open a product page and its size appears here, with the reasons.'); return; }
  let r;
  try { r = await ask(tab, { type: 'sizer:analyze' }); } catch { r = null; }
  if (turn !== reading) return;
  if (!r) { nowText('Sizer cannot read this page from the side panel. Click the Sizer icon on it first.'); return; }
  const res = r.result;
  if (!res || (!r.isProduct && !res.ok)) { nowText('No product here. Open a product page and its size appears here, with the reasons.'); return; }
  $('now-text').hidden = true;
  sheetHost.hidden = false;
  sheetRoot.innerHTML = `<style>${globalThis.SIZER_STYLE}\n.body { padding: 18px 16px 6px; } .fine { display: block; padding: 0 16px 14px; }</style>
    <div class="body">${SizerSheet.body(res, r.product)}</div><p class="fine">${SizerSheet.sourceLine(res)}</p>`;
}

// ---- Vinted (filled by the Vinted bundle) ------------------------------------------

function vintedSlot(tab) {
  const slot = $('vinted-slot');
  const url = (tab && tab.url) || '';
  const on = VINTED_ITEM.test(url);
  slot.hidden = !on;
  if (on && globalThis.SizerVintedPanel && typeof globalThis.SizerVintedPanel.mount === 'function') {
    globalThis.SizerVintedPanel.mount(slot, { tab, url });
  }
}

// ---- recent sizings ------------------------------------------------------------------

// A question keeps its element, and so its progress, while the list redraws around it.
const questions = new Map();

function questionFor(sizing) {
  if (questions.has(sizing.itemKey)) return questions.get(sizing.itemKey);
  const el = document.createElement('div');
  el.className = 'fq';
  SizerFitQuestion.mount(el, sizing, {
    onAnswer: async (answer) => {
      const r = await chrome.runtime.sendMessage({ type: 'sizer:answer-fit', itemKey: sizing.itemKey, answer });
      return r && r.ok;
    },
    onDismiss: () => chrome.runtime.sendMessage({ type: 'sizer:dismiss-fit', itemKey: sizing.itemKey }),
  });
  questions.set(sizing.itemKey, el);
  return el;
}

function headOf(s) {
  const d = new Date(s.at);
  const p = document.createElement('p');
  p.className = 'recent-head';
  const b = document.createElement('b');
  b.textContent = [s.brand, s.style].filter(Boolean).join(' ') || 'An item';
  const span = document.createElement('span');
  span.textContent = `${(s.shop || '').replace(/^www\./, '')}${s.shop ? ', ' : ''}sized ${s.size} on ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  p.append(b, span);
  return p;
}

async function showRecent() {
  const { sizings } = await chrome.storage.local.get({ sizings: [] });
  const list = sizings.slice(0, 12);
  const due = new Set(SizerFeedback.due(sizings, Date.now()).map((s) => s.itemKey));
  $('recent-empty').hidden = list.length > 0;
  const box = $('recent-list');
  box.replaceChildren();
  for (const s of list) {
    const item = document.createElement('div');
    item.className = 'recent-item';
    if (questions.has(s.itemKey) || due.has(s.itemKey)) {
      item.append(questionFor(s));
    } else if (s.answered || s.dismissed) {
      const said = document.createElement('p');
      said.className = 'recent-said';
      said.textContent = s.answered && s.outcome ? `You said it was ${OUTCOME_WORDS[s.outcome]}.` : 'Not bought.';
      item.append(headOf(s), said);
    } else {
      // Not a week old yet: the question waits, but an early answer is welcome.
      const early = document.createElement('button');
      early.type = 'button';
      early.className = 'recent-ask';
      early.textContent = 'Bought it? Say how it fit';
      early.onclick = () => { item.replaceChildren(questionFor(s)); };
      item.append(headOf(s), early);
    }
    box.append(item);
  }
}

// ---- keeping up with the browser ---------------------------------------------------

chrome.tabs.onActivated.addListener(() => showPage());
chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (tab.active && change.status === 'complete') showPage(); });
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.sizings) showRecent();
  if (c.profile || c.charts) showPage();
});

chrome.storage.sync.get({ profile: SIZER_DEFAULT_PROFILE }, ({ profile }) => {
  if (profile.theme === 'light' || profile.theme === 'dark') document.documentElement.dataset.theme = profile.theme;
});
showPage();
showRecent();
