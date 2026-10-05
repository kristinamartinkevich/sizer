const CM = 2.54;
const LB = 2.20462;
const $ = (id) => document.getElementById(id);
const ESTIMATE_BRANDS = ['rag & bone', "Levi's", 'AGOLDE', 'MOTHER', 'Zara', 'Mango', 'H&M', 'COS'];
// Plausible ranges in cm (weight in kg), so a number typed in the other unit is caught.
const RANGE_CM = { bust: [60, 170], waist: [45, 150], hip: [60, 170], shoulder: [28, 60], armLength: [40, 85], inseam: [55, 102], footLength: [18, 35], height: [120, 215], weight: [30, 250] };
const LABEL = { bust: 'bust', waist: 'waist', hip: 'hip', shoulder: 'shoulder width', armLength: 'arm length', inseam: 'inseam', footLength: 'foot length', height: 'height', weight: 'weight' };
const MEASURES = ['bust', 'waist', 'hip', 'shoulder', 'armLength', 'inseam', 'footLength', 'height', 'weight'];

// What to measure on a piece laid flat, by type. Widths are doubled by the engine; lengths are as measured.
const FLAT_HOW = {
  waist: ['Waist', 'Across the top of the waistband.'],
  hip: ['Hip', 'Across the widest point, about 18 cm below the waistband.'],
  chest: ['Chest', 'Armpit to armpit.'],
  shoulder: ['Shoulder', 'Seam to seam across the back.'],
  sleeve: ['Sleeve', 'Shoulder seam to the end of the cuff.'],
  inseam: ['Inseam', 'Crotch seam to the hem, along the inside leg.'],
  length: ['Length', 'Top to hem, at the longest point.'],
};
const FLAT_FOR = {
  jeans: ['waist', 'hip', 'inseam', 'length'],
  trousers: ['waist', 'hip', 'inseam', 'length'],
  skirt: ['waist', 'hip', 'length'],
  top: ['chest', 'shoulder', 'sleeve', 'length'],
  dress: ['chest', 'waist', 'hip', 'length'],
  jacket: ['chest', 'shoulder', 'sleeve', 'length'],
  shoes: [],
};
const FLAT_RANGE_CM = { waist: [20, 80], hip: [25, 90], chest: [25, 90], shoulder: [25, 60], sleeve: [20, 90], inseam: [40, 100], length: [20, 160] };

let profile;
let unit = 'cm';
let charts = null;
const refreshers = [];

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

// 'system' follows the OS; 'light' and 'dark' pin it through data-theme on <html>.
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// ---- measurements ----------------------------------------------------------

// Weight follows the unit switch as kg or lb; inseam is stored in inches; everything else in cm.
const weightUnit = () => (unit === 'cm' ? 'kg' : 'lb');
const factor = (id) => (id === 'weight' ? LB : CM);

function toDisplay(id, stored) {
  if (stored === '' || stored == null) return '';
  if (id === 'inseam') return String(+(unit === 'in' ? +stored : +stored * CM).toFixed(unit === 'in' ? 1 : 0));
  return String(+(unit === 'cm' ? +stored : +stored * (id === 'weight' ? LB : 1 / CM)).toFixed(1));
}

function readMeasure(id) {
  const raw = $(id).value.trim().replace(',', '.');
  $(`${id}-error`).textContent = '';
  if (!raw) return '';
  const n = parseFloat(raw);
  if (!isFinite(n)) { $(`${id}-error`).textContent = 'Use a number, like 70.'; return null; }
  const f = factor(id);
  const metric = unit === 'cm' ? n : n / (id === 'weight' ? LB : 1 / CM);
  const [lo, hi] = RANGE_CM[id];
  if (metric < lo || metric > hi) {
    const asOther = unit === 'cm' ? (id === 'weight' ? n / LB : n * CM) : n;
    const looksLikeOther = unit === 'cm' ? asOther >= lo && asOther <= hi : n / f >= lo && n / f <= hi;
    const other = id === 'weight' ? (unit === 'cm' ? 'pounds' : 'kilograms') : unit === 'cm' ? 'inches' : 'centimetres';
    $(`${id}-error`).textContent = looksLikeOther
      ? `That looks like ${other}. Switch units above?`
      : `That seems off for a ${LABEL[id]}. Check the number.`;
    return null;
  }
  return id === 'inseam' ? +(metric / CM).toFixed(1) : +metric.toFixed(1);
}

function fillMeasures() {
  for (const id of MEASURES) {
    $(id).value = toDisplay(id, profile[id]);
    $(`${id}-error`).textContent = '';
  }
  document.querySelectorAll('[data-unit]').forEach((u) => (u.textContent = unit));
  document.querySelectorAll('[data-unit-weight]').forEach((u) => (u.textContent = weightUnit()));
  markFigure();
}

// Only the measurements drawn on the figure have a line to light up.
const figureLine = (id) => document.querySelector(`.figure [data-m="${id}"]`);

function markFigure() {
  for (const id of MEASURES) {
    const line = figureLine(id);
    if (line) line.classList.toggle('filled', !!$(id).value.trim());
  }
}

for (const id of MEASURES) {
  const field = document.querySelector(`.field[data-m="${id}"]`);
  const line = figureLine(id);
  const input = $(id);
  input.addEventListener('focus', () => { field.classList.add('on'); if (line) line.classList.add('on'); });
  input.addEventListener('blur', () => { field.classList.remove('on'); if (line) line.classList.remove('on'); });
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
  if (a.flat && typeof a.flat === 'object') item.flat = { ...a.flat };
  profile.anchors.push(item);
  const brand = node.querySelector('.i-brand');
  const size = node.querySelector('.i-size');
  brand.value = item.brand;
  size.value = item.size;
  bindSeg(node.querySelector('.types'), item.type, (v) => { item.type = v; renderFlat(); update(); });
  bindSeg(node.querySelector('.fitseg'), item.fit, (v) => { item.fit = v; update(); });
  brand.addEventListener('input', () => { item.brand = brand.value.trim(); update(); });
  size.addEventListener('input', () => { item.size = size.value.trim(); update(); });
  node.querySelector('.remove').onclick = () => {
    profile.anchors.splice(profile.anchors.indexOf(item), 1);
    refreshers.splice(refreshers.indexOf(renderFlat), 1);
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

  // "Measure this piece": what to measure for this type, in the current unit, stored in cm.
  const details = node.querySelector('.flat');
  function renderFlat() {
    const keys = FLAT_FOR[item.type] || [];
    details.hidden = !keys.length;
    const box = details.querySelector('.flat-fields');
    box.innerHTML = '';
    for (const key of keys) {
      const row = $('flat-tpl').content.firstElementChild.cloneNode(true);
      const [name, how] = FLAT_HOW[key];
      row.querySelector('.flat-name').textContent = name;
      row.querySelector('.flat-how').textContent = how;
      row.querySelector('[data-unit]').textContent = unit;
      const input = row.querySelector('input');
      input.setAttribute('aria-label', `${name}, laid flat`);
      const stored = item.flat && item.flat[key];
      input.value = stored == null || stored === '' ? '' : String(+(unit === 'cm' ? +stored : +stored / CM).toFixed(1));
      input.addEventListener('input', () => {
        const err = row.querySelector('.flat-error');
        err.textContent = '';
        const raw = input.value.trim().replace(',', '.');
        item.flat = item.flat || {};
        if (!raw) { delete item.flat[key]; changed(); return; }
        const n = parseFloat(raw);
        if (!isFinite(n)) { err.textContent = 'Use a number, like 38.'; return; }
        const cmValue = unit === 'cm' ? n : n * CM;
        const [lo, hi] = FLAT_RANGE_CM[key];
        if (cmValue < lo || cmValue > hi) { err.textContent = `That seems off for a flat ${name.toLowerCase()}. Measure straight across, not all the way round.`; return; }
        item.flat[key] = +cmValue.toFixed(1);
        changed();
      });
      box.appendChild(row);
    }
    if (item.flat && Object.keys(item.flat).length) details.open = true;
  }
  refreshers.push(renderFlat);
  renderFlat();
  explain();
  $('wardrobe').appendChild(node);
  if (focus) brand.focus();
}

$('add').onclick = () => { addItem({}, true); changed(); };

// ---- live read-out ---------------------------------------------------------

function renderRead() {
  const clean = cleaned();
  const body = SizerEngine.bodyFromProfile(clean, charts);
  $('read-empty').hidden = !!body;
  $('read-body').hidden = !body;
  if (!body) return;

  const show = (cm) => (cm == null ? '—' : `${unit === 'cm' ? Math.round(cm) : (cm / CM).toFixed(1)}<small>${unit}</small>`);
  $('r-waist').innerHTML = show(body.waist);
  $('r-hip').innerHTML = show(body.hip);
  $('r-bust-cell').hidden = body.bust == null;
  $('r-bust').innerHTML = show(body.bust);

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
  const leg = body.inseamGuess ? ` Leg length about ${unit === 'in' ? `${Math.round(body.inseam)} in` : `${Math.round(body.inseam * CM)} cm`}, a guess from your height.` : '';
  $('r-from').textContent = (from + foot + leg).trim();

  const off = body.waist == null ? [] : body.points.filter((p) => Math.abs(p.hip - body.hip) + Math.abs(p.waist - body.waist) > 5).map((p) => p.name);
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

// Pieces without a size are drafts; empty flat-lay sets are dropped.
function cleaned() {
  const anchors = profile.anchors.filter((a) => a.size).map((a) => {
    const { flat, ...rest } = a;
    return flat && Object.keys(flat).length ? { ...rest, flat: { ...flat } } : rest;
  });
  return { ...profile, anchors };
}

let saveTimer;
function changed() {
  renderRead();
  clearTimeout(saveTimer);
  $('status').textContent = '';
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set({ profile: cleaned() }, () => { $('status').textContent = 'Saved'; toast(); });
  }, 400);
}

// The header status scrolls away; the toast confirms the save wherever you are on the page.
let toastTimer;
function toast() {
  const t = $('toast');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// Older profiles stored generic chart ids instead of brand names and item types.
function migrate(p) {
  const anchors = (p.anchors || []).map((a) => {
    if (a.brand && a.brand.startsWith('generic')) return { brand: '', type: a.brand === 'generic-denim' ? 'jeans' : 'trousers', size: a.size, fit: a.fit || 'perfect' };
    const known = SizerBrands.BRANDS.find((b) => b.id === a.brand);
    return { type: 'jeans', fit: 'perfect', ...a, brand: known ? known.name : a.brand };
  });
  return { ...SIZER_DEFAULT_PROFILE, ...p, fitByCategory: { ...(p.fitByCategory || {}) }, anchors };
}

// First run leads with a piece you own; measurements come second.
function welcome() {
  $('intro-title').textContent = 'Welcome to Sizer';
  $('intro-text').textContent = 'Start with a piece you own that fits well: its brand and the size on the label. Measurements come second, if you have a tape to hand. From then on, your size appears under the size picker on product pages. Everything stays in your browser.';
  $('measure-block').before($('wardrobe-block'));
  $('w-num').textContent = '01';
  $('m-num').textContent = '02';
  $('w-title').textContent = 'Add a piece you own that fits well';
}

chrome.storage.local.get({ charts: null }, (r) => {
  charts = r.charts;
  if (profile) renderRead();
});

chrome.storage.sync.get({ profile: SIZER_DEFAULT_PROFILE }, ({ profile: stored }) => {
  const p = migrate(stored);
  const fresh = !p.anchors.length && !(p.waist && p.hip) && !p.bust && !p.footLength;
  const greet = fresh || new URLSearchParams(location.search).has('welcome');
  if (greet) welcome();
  profile = { ...p, anchors: [] };
  unit = p.unit || 'cm';
  p.anchors.forEach((a) => addItem(a));
  if (!p.anchors.length) addItem({}, greet);
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
    refreshers.forEach((f) => f());
    changed();
  });
  bindSeg($('fit'), profile.fitPreference || 'regular', (v) => { profile.fitPreference = v; changed(); });
  for (const group of document.querySelectorAll('[data-kind]')) {
    const kind = group.dataset.kind;
    bindSeg(group, profile.fitByCategory[kind] || '', (v) => {
      profile.fitByCategory = { ...profile.fitByCategory };
      if (v) profile.fitByCategory[kind] = v;
      else delete profile.fitByCategory[kind];
      changed();
    });
  }
  if (Object.keys(profile.fitByCategory).length) $('per-kind').open = true;
  bindSeg($('between'), profile.betweenSizes || 'stretch', (v) => { profile.betweenSizes = v; changed(); });
  applyTheme(profile.theme);
  bindSeg($('theme'), profile.theme || 'system', (v) => { profile.theme = v; applyTheme(v); changed(); });
  renderRead();
});
