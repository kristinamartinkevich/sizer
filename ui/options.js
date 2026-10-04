const CM = 2.54;
const $ = (id) => document.getElementById(id);
const ESTIMATE_BRANDS = ['rag & bone', "Levi's", 'AGOLDE', 'MOTHER', 'Zara', 'Mango', 'H&M', 'COS'];
const RANGE_CM = { waist: [45, 150], hip: [60, 170], inseam: [55, 102], footLength: [18, 35] };
const LABEL = { waist: 'waist', hip: 'hip', inseam: 'inseam', footLength: 'foot length' };
const MEASURES = ['waist', 'hip', 'inseam', 'footLength'];

let profile;
let unit = 'cm';
let charts = null;

for (const b of SizerBrands.BRANDS.slice().sort((a, b) => a.name.localeCompare(b.name))) {
  $('brands').appendChild(new Option(b.name));
}

// ---- radio-like button groups ----------------------------------------------

function bindSeg(group, value, onPick) {
  const buttons = [...group.querySelectorAll('[role="radio"]')];
  const set = (v) => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
  set(value);
  buttons.forEach((b, i) => {
    b.type = 'button';
    b.onclick = () => { set(b.dataset.v); onPick(b.dataset.v); };
    b.onkeydown = (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = buttons[(i + step + buttons.length) % buttons.length];
      next.focus();
      next.click();
    };
  });
}

// ---- measurements ----------------------------------------------------------

const toDisplay = (cm) => (cm === '' || cm == null ? '' : String(+(unit === 'cm' ? +cm : +cm / CM).toFixed(1)));
const inseamToDisplay = (inch) => (inch === '' || inch == null ? '' : String(+(unit === 'in' ? +inch : +inch * CM).toFixed(unit === 'in' ? 1 : 0)));

function readMeasure(id) {
  const raw = $(id).value.trim().replace(',', '.');
  $(`${id}-error`).textContent = '';
  if (!raw) return '';
  const n = parseFloat(raw);
  if (!isFinite(n)) { $(`${id}-error`).textContent = 'Use a number, like 70.'; return null; }
  const cm = unit === 'cm' ? n : n * CM;
  const [lo, hi] = RANGE_CM[id];
  if (cm < lo || cm > hi) {
    const looksLikeOther = unit === 'cm' ? n * CM >= lo && n * CM <= hi : n / CM >= lo && n / CM <= hi;
    $(`${id}-error`).textContent = looksLikeOther
      ? `That looks like ${unit === 'cm' ? 'inches' : 'centimetres'}. Switch units above?`
      : `That seems off for a ${LABEL[id]}. Check the number.`;
    return null;
  }
  return id === 'inseam' ? +(cm / CM).toFixed(1) : +cm.toFixed(1);
}

function fillMeasures() {
  $('waist').value = toDisplay(profile.waist);
  $('hip').value = toDisplay(profile.hip);
  $('inseam').value = inseamToDisplay(profile.inseam);
  $('footLength').value = toDisplay(profile.footLength);
  document.querySelectorAll('[data-unit]').forEach((u) => (u.textContent = unit));
  for (const id of MEASURES) $(`${id}-error`).textContent = '';
  markFigure();
}

function markFigure() {
  for (const id of MEASURES) {
    document.querySelector(`.figure [data-m="${id}"]`).classList.toggle('filled', !!$(id).value.trim());
  }
}

for (const id of MEASURES) {
  const field = document.querySelector(`.field[data-m="${id}"]`);
  const line = document.querySelector(`.figure [data-m="${id}"]`);
  const input = $(id);
  input.addEventListener('focus', () => { field.classList.add('on'); line.classList.add('on'); });
  input.addEventListener('blur', () => { field.classList.remove('on'); line.classList.remove('on'); });
  input.addEventListener('input', () => {
    const v = readMeasure(id);
    if (v !== null) { profile[id] = v === '' ? '' : String(v); changed(); }
    markFigure();
  });
}

// ---- wardrobe --------------------------------------------------------------

function addItem(a, focus) {
  const node = $('item-tpl').content.firstElementChild.cloneNode(true);
  const item = { brand: a.brand || '', type: a.type || 'jeans', size: a.size || '', fit: a.fit || 'perfect' };
  profile.anchors.push(item);
  const brand = node.querySelector('.i-brand');
  const size = node.querySelector('.i-size');
  brand.value = item.brand;
  size.value = item.size;
  bindSeg(node.querySelector('.types'), item.type, (v) => { item.type = v; update(); });
  bindSeg(node.querySelector('.fitseg'), item.fit, (v) => { item.fit = v; update(); });
  brand.addEventListener('input', () => { item.brand = brand.value.trim(); update(); });
  size.addEventListener('input', () => { item.size = size.value.trim(); update(); });
  node.querySelector('.remove').onclick = () => {
    profile.anchors.splice(profile.anchors.indexOf(item), 1);
    node.remove();
    changed();
  };
  function update() { explain(); changed(); }
  function explain() {
    const r = node.querySelector('.reading');
    if (!item.size) { r.textContent = ''; return; }
    const e = SizerEngine.explainAnchor(item, charts);
    r.classList.toggle('bad', !e.ok);
    if (item.type === 'shoes') {
      if (!e.ok) r.textContent = 'Sizer can’t read this size yet. Try the EU number, like 38.';
      else if (e.brand) r.textContent = `Read with the ${e.brand} shoe chart`;
      else r.textContent = 'Read as an EU shoe size on a standard chart';
      return;
    }
    const what = { denim: 'a denim waist size', eu: 'an EU size', us: 'a US size', uk: 'a UK size', it: 'an Italian size', letter: 'a letter size' }[e.system];
    if (!e.ok) r.textContent = 'Sizer can’t read this size yet. Try the number on the label.';
    else if (e.brand) r.textContent = `Read with the ${e.brand} chart`;
    else if (!item.brand) r.textContent = `Any brand, read as ${what}`;
    else r.textContent = `No chart for this brand yet, read as ${what}`;
  }
  explain();
  $('wardrobe').appendChild(node);
  if (focus) brand.focus();
}

$('add').onclick = () => { addItem({}, true); changed(); };

// ---- live read-out ---------------------------------------------------------

function renderRead() {
  const clean = { ...profile, anchors: profile.anchors.filter((a) => a.size) };
  const body = SizerEngine.bodyFromProfile(clean, charts);
  $('read-empty').hidden = !!body;
  $('read-body').hidden = !body;
  if (!body) return;

  const show = (cm) => (cm == null ? '—' : `${unit === 'cm' ? Math.round(cm) : (cm / CM).toFixed(1)}<small>${unit}</small>`);
  $('r-waist').innerHTML = show(body.waist);
  $('r-hip').innerHTML = show(body.hip);

  const items = body.points.length;
  const measured = profile.waist && profile.hip;
  const from = body.waist == null ? ''
    : measured
      ? items ? `From your measurements, checked against ${items} thing${items > 1 ? 's' : ''} you own.` : 'From your measurements.'
      : profile.waist || profile.hip
        ? `From your ${profile.waist ? 'waist' : 'hip'} and ${items} thing${items > 1 ? 's' : ''} you own.`
        : `From ${items} thing${items > 1 ? 's' : ''} you own.`;
  const footCm = body.foot == null ? '' : unit === 'cm' ? `${body.foot.toFixed(1)} cm` : `${(body.foot / CM).toFixed(1)} in`;
  const foot = body.foot == null ? '' : body.footSource === 'your foot length' ? ` Foot length ${footCm}.` : ` Foot length ${footCm} from your ${body.footSource}.`;
  $('r-from').textContent = (from + foot).trim();

  const off = body.points.filter((p) => Math.abs(p.hip - body.hip) + Math.abs(p.waist - body.waist) > 5).map((p) => p.name);
  $('r-warn').hidden = !off.length;
  $('r-warn').textContent = off.length ? `${off.join(', ')} ${off.length > 1 ? 'don’t' : 'doesn’t'} quite agree with the rest. Check the size, or mark how ${off.length > 1 ? 'they fit' : 'it fits'}.` : '';

  $('r-sizes').innerHTML = '';
  for (const name of ESTIMATE_BRANDS) {
    const r = SizerEngine.recommend(clean, { brand: name, title: 'jeans', text: '', sizes: [] }, charts);
    if (!r.ok) continue;
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.textContent = name;
    const s = document.createElement('b');
    s.textContent = r.size.replace(/^W/, '');
    li.append(n, s);
    $('r-sizes').appendChild(li);
  }
}

// ---- saving ----------------------------------------------------------------

let saveTimer;
function changed() {
  renderRead();
  clearTimeout(saveTimer);
  $('status').textContent = '';
  saveTimer = setTimeout(() => {
    const out = { ...profile, anchors: profile.anchors.filter((a) => a.size) };
    chrome.storage.sync.set({ profile: out }, () => { $('status').textContent = 'Saved'; });
  }, 400);
}

// Older profiles stored generic chart ids instead of brand names and item types.
function migrate(p) {
  const anchors = (p.anchors || []).map((a) => {
    if (a.brand && a.brand.startsWith('generic')) return { brand: '', type: a.brand === 'generic-denim' ? 'jeans' : 'trousers', size: a.size, fit: a.fit || 'perfect' };
    const known = SizerBrands.BRANDS.find((b) => b.id === a.brand);
    return { type: 'jeans', fit: 'perfect', ...a, brand: known ? known.name : a.brand };
  });
  return { ...SIZER_DEFAULT_PROFILE, ...p, anchors };
}

chrome.storage.local.get({ charts: null }, (r) => {
  charts = r.charts;
  if (profile) renderRead();
});

chrome.storage.sync.get({ profile: SIZER_DEFAULT_PROFILE }, ({ profile: stored }) => {
  const p = migrate(stored);
  const fresh = !p.anchors.length && !(p.waist && p.hip) && !p.footLength;
  if (fresh || new URLSearchParams(location.search).has('welcome')) {
    $('intro-title').textContent = 'Welcome to Sizer';
    $('intro-text').textContent = 'Start with your waist and hip, or one piece you own that fits well. From then on, your size appears under the size picker on product pages. Everything stays in your browser.';
  }
  profile = { ...p, anchors: [] };
  unit = p.unit || 'cm';
  p.anchors.forEach((a) => addItem(a));
  if (!p.anchors.length) addItem({});
  fillMeasures();
  bindSeg($('unit'), unit, (v) => {
    // A value flagged as the wrong unit was typed in the new one, so re-read it rather than convert it.
    const retyped = MEASURES.filter((id) => $(`${id}-error`).textContent);
    const raw = Object.fromEntries(retyped.map((id) => [id, $(id).value]));
    unit = v;
    profile.unit = v;
    fillMeasures();
    for (const id of retyped) {
      $(id).value = raw[id];
      const val = readMeasure(id);
      if (val !== null) profile[id] = val === '' ? '' : String(val);
    }
    markFigure();
    changed();
  });
  bindSeg($('fit'), profile.fitPreference || 'regular', (v) => { profile.fitPreference = v; changed(); });
  renderRead();
});
