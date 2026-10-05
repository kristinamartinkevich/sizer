// The downloaded chart bundle: where it comes from, how long it is trusted, how it is kept.
// Pure helpers here so they can be tested; the fetching lives in background.js.
(function (root) {
  const SUPABASE_URL = 'https://cqvrdsgutpczbucbpiqa.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_6yLZgmy6DXn9eMXctQaapQ_c7D6Ldcv'; // the project's anon (publishable) key; read-only by RLS
  const BUNDLE_URL = `${SUPABASE_URL}/rest/v1/chart_bundle?select=brand_id,brand_name,aliases,charts,fit_notes,updated_at`;
  const ITEM_FIT_URL = `${SUPABASE_URL}/rest/v1/item_fit_by_vendor?select=vendor,small,large,tts,total,from_summary&item_key=eq.`;
  const REPORT_URL = `${SUPABASE_URL}/rest/v1/rpc/report_item_fit`;
  const BRAND_FIT_URL = `${SUPABASE_URL}/rest/v1/brand_fit?select=brand_key,kind,small,tts,large,total`;
  const OUTCOME_URL = `${SUPABASE_URL}/rest/v1/rpc/report_fit_outcome`;
  const DAY = 24 * 60 * 60 * 1000;

  // ---- one style across shops ---------------------------------------------

  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const GENERIC = new Set(['jeans', 'jean', 'denim', 'trousers', 'trouser', 'pants', 'pant', 'skirt', 'shorts', 'dress', 'top', 'shirt', 'blouse', 'sweater', 'jumper', 'cardigan', 'jacket', 'coat', 'blazer', 'shoes', 'sneakers', 'boots', 'sandals', 'the', 'a', 'in', 'with', 'for', 'womens', 'women', 'woman', 'ladies', 'mens', 'men', 'new', 'sale']);

  // "rag & bone" + "WREN - Straight leg jeans - blue denim" → "rag and bone|wren": the brand plus the
  // first word of the title that is not the brand or a garment word, which is how shops name a style.
  function itemKey(brand, title) {
    const b = norm(brand);
    if (!b) return null;
    const t = ` ${norm(title)} `.split(` ${b} `).join(' ');
    const style = t.split(' ').find((w) => w && !GENERIC.has(w));
    if (!style || style.length < 2) return null;
    return `${b}|${style}`;
  }

  // Sums the other shops' tallies, each shop counted once; the current shop is read live instead.
  function poolExcept(rows, vendor) {
    const out = { small: 0, large: 0, tts: 0, total: 0, vendors: 0 };
    for (const r of rows || []) {
      if (!r || r.vendor === vendor) continue;
      out.small += +r.small || 0;
      out.large += +r.large || 0;
      out.tts += +r.tts || 0;
      out.total += +r.total || 0;
      out.vendors += 1;
    }
    return out;
  }

  function headers() {
    return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' };
  }

  // A bundle is used for a day, then refreshed; a failed refresh keeps the old one for a week before it is dropped.
  function isFresh(stored, now = Date.now()) {
    return !!stored && Array.isArray(stored.brands) && typeof stored.fetchedAt === 'number' && now - stored.fetchedAt < DAY;
  }
  function isUsable(stored, now = Date.now()) {
    return !!stored && Array.isArray(stored.brands) && typeof stored.fetchedAt === 'number' && now - stored.fetchedAt < 7 * DAY;
  }

  // Keeps only brands that actually carry a verified chart, so an empty project yields an empty bundle.
  function normalise(payload, now = Date.now()) {
    if (!Array.isArray(payload)) throw new Error('chart bundle is not a list');
    const brands = payload
      .filter((b) => b && typeof b.brand_id === 'string' && Array.isArray(b.charts) && b.charts.length)
      .map((b) => ({
        id: b.brand_id,
        name: b.brand_name,
        aliases: Array.isArray(b.aliases) ? b.aliases : [],
        charts: b.charts,
        fitNotes: Array.isArray(b.fit_notes) ? b.fit_notes : [],
        updatedAt: b.updated_at || null,
      }));
    return { brands, fetchedAt: now };
  }

  // ---- what Sizer users who bought a brand said ------------------------------------

  const FIT_KINDS = ['bottoms', 'tops', 'dresses', 'outerwear', 'shoes'];

  // The brand_fit rows as the engine reads them: one per brand and kind, counts as numbers.
  function normaliseBrandFit(payload) {
    if (!Array.isArray(payload)) throw new Error('brand fit is not a list');
    const count = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
    return payload
      .filter((r) => r && typeof r.brand_key === 'string' && r.brand_key.trim() && FIT_KINDS.includes(r.kind))
      .map((r) => ({ brand_key: r.brand_key, kind: r.kind, small: count(r.small), tts: count(r.tts), large: count(r.large), total: count(r.total) }));
  }

  // The learned tendencies travel inside the stored chart bundle, so the engine gets them with the charts.
  function withBrandFit(bundle, rows) {
    return { ...bundle, brandFit: rows };
  }

  // ---- looking up a brand nobody has a chart for -------------------------------

  const LOOKUP_URL = `${SUPABASE_URL}/functions/v1/lookup-chart`;
  const MISS_TTL = 7 * DAY;
  const KINDS = ['bottoms', 'tops', 'dresses', 'shoes'];
  const SOURCE_TYPES = ['brand_site', 'retailer_brand_chart', 'retailer_house_chart'];
  const GUIDE_LIMIT = 30000;

  function missKey(brand, kind) {
    const b = norm(brand);
    return b && KINDS.includes(kind) ? `miss:${b}|${kind}` : null;
  }

  function isMissFresh(entry, now = Date.now()) {
    return !!entry && typeof entry.at === 'number' && now - entry.at < MISS_TTL;
  }

  // The page's size tables as the lookup may see them: the table itself and nothing else. The reader
  // keeps the page address on each chart, and a caption can quote one; neither leaves the browser.
  function sanitiseShopGuide(guide) {
    if (!guide || !Array.isArray(guide.charts) || !guide.charts.length) return null;
    const pick = (r) => ({ label: r.label, waist: r.waist || null, hip: r.hip || null, bust: r.bust || null, foot_length: r.foot_length || null, aliases: r.aliases || {} });
    const charts = guide.charts.slice(0, 30).filter((c) => c && Array.isArray(c.rows)).map((c) => ({
      category: c.category, unit: c.unit, measurement_basis: c.measurement_basis, size_system: c.size_system,
      mentions_brand: !!c.mentions_brand, rows: c.rows.map(pick),
    }));
    const caption = String(guide.caption || '').replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const out = { caption, charts };
    while (out.charts.length && JSON.stringify(out).length > GUIDE_LIMIT) out.charts.pop();
    return out.charts.length ? out : null;
  }

  function lookupBody({ brand, kind, shop, shopGuide }, install) {
    const body = { brand: String(brand || '').trim().slice(0, 80), kind, shop: String(shop || '').toLowerCase(), install };
    const guide = sanitiseShopGuide(shopGuide);
    if (guide) body.shopGuide = guide;
    return body;
  }

  // The bundle entry for a chart the lookup returned. Whatever the reply says, a looked-up chart is
  // machine-read until a person checks it in the dashboard; without a known source it is not used,
  // because a chart with no provenance would rank as a checked brand chart.
  function lookupEntry(brand, chart) {
    const name = String(brand || '').trim();
    if (!name || !chart || typeof chart.id !== 'string' || !Array.isArray(chart.rows) || !SOURCE_TYPES.includes(chart.source_type)) return null;
    return {
      id: `lookup:${norm(name).replace(/ /g, '-')}`,
      name,
      aliases: [name.toLowerCase()],
      charts: [{ ...chart, status: 'machine_read', read_by: chart.read_by || 'lookup-chart' }],
      fitNotes: [],
      updatedAt: null,
    };
  }

  // Adds the brand to the stored bundle, or swaps in its chart for that kind of item. The download
  // time is kept, and a bundle that only exists because of a lookup counts as never downloaded.
  function mergeChart(bundle, entry) {
    const brands = bundle && Array.isArray(bundle.brands) ? bundle.brands : [];
    const fetchedAt = bundle && typeof bundle.fetchedAt === 'number' ? bundle.fetchedAt : 0;
    const names = new Set(entry.aliases.concat(entry.name).map(norm));
    const at = brands.findIndex((b) => b.id === entry.id || [b.name].concat(b.aliases || []).some((a) => names.has(norm(a))));
    if (at < 0) return { ...bundle, fetchedAt, brands: brands.concat(entry) };
    const chart = entry.charts[0];
    const old = brands[at];
    const merged = { ...old, charts: (old.charts || []).filter((c) => c.category !== chart.category && c.id !== chart.id).concat(chart) };
    return { ...bundle, fetchedAt, brands: brands.map((b, i) => (i === at ? merged : b)) };
  }

  // The background worker's lookup, with its browser APIs passed in so it can be tested.
  // One request per brand and kind at a time. A chart is merged into the stored bundle; "no chart"
  // is remembered for a week; any failure is remembered for nothing, so the next visit tries again.
  function createLookup({ fetch, get, set, installId, now = Date.now }) {
    const inFlight = new Map();
    async function ask(msg, key) {
      if (isMissFresh((await get(key))[key], now())) return { found: false };
      const body = lookupBody(msg, await installId());
      const res = await fetch(LOOKUP_URL, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) return { found: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      if (data && data.chart === null) {
        await set({ [key]: { at: now() } });
        return { found: false };
      }
      const entry = lookupEntry(body.brand, data && data.chart);
      if (!entry) return { found: false, error: 'unexpected reply' };
      const { charts } = await get('charts');
      await set({ charts: mergeChart(charts, entry) });
      return { found: true };
    }
    return function lookup(msg) {
      const key = missKey(msg && msg.brand, msg && msg.kind);
      if (!key) return Promise.resolve({ found: false, error: 'bad request' });
      if (!inFlight.has(key)) {
        inFlight.set(key, ask(msg, key)
          .catch((e) => ({ found: false, error: String((e && e.message) || e) }))
          .finally(() => inFlight.delete(key)));
      }
      return inFlight.get(key);
    };
  }

  // ---- reading a size chart image, and a page's product text, with AI -------------------------

  const READ_IMAGE_URL = `${SUPABASE_URL}/functions/v1/read-chart-image/image`;
  const READ_PRODUCT_URL = `${SUPABASE_URL}/functions/v1/read-chart-image/product`;
  const SHOP_SOURCES = ['retailer_brand_chart', 'retailer_house_chart'];
  const clip = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const noAddresses = (s) => clip(String(s == null ? '' : s).replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, ' '));

  // What a chart image read sends: the image's public address (never the page's), the brand, the kind
  // of item and the install id. Null when the image is not a public https address.
  function imageBody({ image_url, brand, kind }, install) {
    let u;
    try { u = new URL(String(image_url || '')); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    u.hash = '';
    const b = clip(brand).slice(0, 80);
    if (!b || !KINDS.includes(kind) || u.href.length > 2048) return null;
    return { image_url: u.href, brand: b, kind, install };
  }

  // The chart the function read, as a shop guide chart: always machine-read, and only a shop's chart.
  function imageChartEntry(chart) {
    if (!chart || !Array.isArray(chart.rows) || chart.rows.length < 2 || !SHOP_SOURCES.includes(chart.source_type)) return null;
    return { ...chart, status: 'machine_read', read_by: 'read-chart-image' };
  }

  // The page's shop guide with a chart read from an image added, so the brand lookup can judge it.
  function withImageChart(guide, chart) {
    const charts = guide && Array.isArray(guide.charts) ? guide.charts : [];
    return { caption: (guide && guide.caption) || 'Size chart image', charts: charts.concat(chart) };
  }

  function post(fetch, url, body) {
    return fetch(url, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  // The background worker's image read, with its browser APIs passed in. One request per image, brand
  // and kind at a time. Any failure is just no chart; the function caches what it read for everyone.
  function createImageRead({ fetch, installId }) {
    const inFlight = new Map();
    async function ask(body) {
      const res = await post(fetch, READ_IMAGE_URL, body);
      if (!res.ok) return { chart: null, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { chart: imageChartEntry(data && data.chart) };
    }
    return async function read(msg) {
      const body = imageBody(msg || {}, await installId());
      if (!body) return { chart: null, error: 'bad request' };
      const key = `${body.image_url}|${body.kind}|${norm(body.brand)}`;
      if (!inFlight.has(key)) {
        inFlight.set(key, ask(body)
          .catch((e) => ({ chart: null, error: String((e && e.message) || e) }))
          .finally(() => inFlight.delete(key)));
      }
      return inFlight.get(key);
    };
  }

  const PRODUCT_TEXT_LIMIT = 6000;

  // What "Read this page with AI" sends: the page title, its headings and the text around the size
  // picker, web addresses taken out, 6000 characters at most, and the install id. Never the address.
  function productBody({ title, headings, picker }, install) {
    const t = noAddresses(title).slice(0, 300);
    const p = noAddresses(picker).slice(0, 3000);
    let budget = PRODUCT_TEXT_LIMIT - t.length - p.length;
    const hs = [];
    for (const h of [].concat(headings || [])) {
      const x = noAddresses(h).slice(0, 200);
      if (!x || hs.includes(x)) continue;
      if (x.length > budget || hs.length >= 20) break;
      hs.push(x);
      budget -= x.length;
    }
    return { title: t, headings: hs, picker: p, install };
  }

  function readProductEntry(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.sizes)) return null;
    const text = (v, n) => (typeof v === 'string' && clip(v) ? clip(v).slice(0, n) : null);
    return {
      brand: text(data.brand, 80),
      title: text(data.title, 200),
      kind: KINDS.includes(data.kind) ? data.kind : null,
      sizes: data.sizes.filter((x) => typeof x === 'string' && clip(x)).map(clip).slice(0, 40),
      fabric: text(data.fabric, 200),
    };
  }

  function createProductRead({ fetch, installId }) {
    return async function read(text) {
      try {
        const res = await post(fetch, READ_PRODUCT_URL, productBody(text || {}, await installId()));
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const product = readProductEntry(await res.json());
        return product ? { product } : { error: 'unexpected reply' };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    };
  }

  // ---- measurements read from a Vinted listing's photos ---------------------------------------

  const READ_MEASUREMENTS_URL = `${SUPABASE_URL}/functions/v1/read-chart-image/measurements`;
  const LISTING_KINDS = ['top', 'dress', 'jeans', 'trousers', 'shorts', 'skirt', 'outerwear', 'shoes'];
  const MEASUREMENT_KEYS = ['pit', 'length', 'waistFlat', 'rise', 'inseam', 'legOpening', 'shoulder', 'sleeve', 'insole'];
  const MAX_PHOTOS = 4;
  // Vinted serves listing photos from its own image hosts, images1.vinted.net and its numbered
  // siblings, on every country site. Only those: not a Vinted listing page, not a lookalike domain.
  // Same rule as read-chart-image's measurements.ts; its Deno test holds the two equal.
  const VINTED_PHOTO_HOST = /^images\d*\.vinted\.net$/i;

  // What "Read measurements from the photos" sends: up to four of the listing's photo addresses
  // (public pictures on Vinted's servers, never the listing's address), the kind of item and the
  // install id. Null when no photo is a public https address on a Vinted host, or the kind is unknown.
  function measurementsBody({ image_urls, kind }, install) {
    if (!LISTING_KINDS.includes(kind)) return null;
    const urls = [];
    for (const raw of [].concat(image_urls || [])) {
      let u;
      try { u = new URL(String(raw)); } catch { continue; }
      if (u.protocol !== 'https:' || u.username || u.password || !VINTED_PHOTO_HOST.test(u.hostname)) continue;
      u.hash = '';
      if (u.href.length > 2048 || urls.includes(u.href)) continue;
      urls.push(u.href);
      if (urls.length >= MAX_PHOTOS) break;
    }
    return urls.length ? { image_urls: urls, kind, install } : null;
  }

  // The function's answer cut to the measurement names, numbers only; src/vinted.js checks the ranges.
  function readMeasurementsEntry(data) {
    const m = data && data.measurements;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const out = {};
    for (const k of MEASUREMENT_KEYS) if (typeof m[k] === 'number' && Number.isFinite(m[k])) out[k] = m[k];
    return out;
  }

  // The background worker's photo read, on the shopper's click only. Nothing is cached: the function
  // reads the photos again each time, within the same daily caps as the other reads.
  function createMeasurementsRead({ fetch, installId }) {
    return async function read(msg) {
      try {
        const body = measurementsBody(msg || {}, await installId());
        if (!body) return { error: 'bad request' };
        const res = await post(fetch, READ_MEASUREMENTS_URL, body);
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const measurements = readMeasurementsEntry(await res.json());
        return measurements ? { measurements } : { error: 'unexpected reply' };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    };
  }

  // A word that makes kindOf read the model's kind from the title, used only when the title names none.
  const KIND_WORD = { bottoms: 'trousers', tops: 'top', dresses: 'dress', shoes: 'shoes' };

  // The page reading with the model's answer filling only what the page reader missed.
  function applyReadProduct(product, ai, kindOf) {
    const p = { ...product };
    if (!ai) return p;
    if (!clip(p.brand) && ai.brand) p.brand = ai.brand;
    if (!clip(p.title) && ai.title) p.title = ai.title;
    // kindOf falls back to bottoms when the title names no kind; a title that names one keeps it.
    const namesNoKind = kindOf(p.title) === 'bottoms' && kindOf(`${p.title} dress`) === 'dresses';
    if (ai.kind && namesNoKind && ai.kind !== 'bottoms') {
      p.title = `${p.title} ${KIND_WORD[ai.kind]}`.trim();
    }
    if (!(p.sizes && p.sizes.length) && ai.sizes && ai.sizes.length) p.sizes = ai.sizes.map((label) => ({ label, available: null }));
    if (ai.fabric) p.text = `${p.text || ''}\nComposition: ${ai.fabric}`.trim();
    p.isProduct = p.isProduct || !!(p.brand && p.sizes && p.sizes.length);
    return p;
  }

  // ---- what others say about the fit online (fit-dossier) ---------------------------------------

  const DOSSIER_URL = `${SUPABASE_URL}/functions/v1/fit-dossier`;
  const DOSSIER_FOUND_TTL = 30 * DAY;
  const DOSSIER_MISS_TTL = 7 * DAY;
  // The shapes the function checks (supabase/functions/fit-dossier/dossier.ts).
  const ITEM_KEY_SHAPE = /^[a-z0-9 ]+\|[a-z0-9]+$/;
  const DOSSIER_AREAS = ['bust', 'chest', 'waist', 'hip', 'length', 'inseam', 'shoulder', 'sleeve', 'foot'];
  const DOSSIER_DIRECTIONS = ['tight', 'loose', 'long', 'short'];
  const DOSSIER_VERDICTS = ['small', 'tts', 'large'];
  const COUNT_MAX = 5000;
  const count = (v) => (Number.isInteger(v) && v > 0 ? Math.min(v, COUNT_MAX) : 0);

  const validItemKey = (k) => typeof k === 'string' && k.length <= 120 && ITEM_KEY_SHAPE.test(k);
  const dossierKey = (itemKey) => (validItemKey(itemKey) ? `dossier:${itemKey}` : null);

  // The page's anonymous review tally as the function takes it: four whole counts inside its limits,
  // small + large + tts never over total, and area mentions as { area: { direction: count } }.
  // A shop's fit bar can report more reviews than the limit; the shares are kept, scaled down.
  function dossierTallies(t) {
    const src = t && typeof t === 'object' ? t : {};
    const whole = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
    const out = { small: whole(src.small), large: whole(src.large), tts: whole(src.tts) };
    out.total = Math.max(whole(src.total), out.small + out.large + out.tts);
    if (out.total > COUNT_MAX) {
      const f = COUNT_MAX / out.total;
      for (const k of ['small', 'large', 'tts']) out[k] = Math.floor(out[k] * f);
      out.total = COUNT_MAX;
    }
    const areas = {};
    for (const a of Array.isArray(src.areas) ? src.areas : []) {
      if (!a || !DOSSIER_AREAS.includes(a.area) || !DOSSIER_DIRECTIONS.includes(a.direction)) continue;
      const n = count(a.count);
      if (!n) continue;
      const at = areas[a.area] || (areas[a.area] = {});
      at[a.direction] = Math.min((at[a.direction] || 0) + n, COUNT_MAX);
    }
    return { small: out.small, large: out.large, tts: out.tts, total: out.total, areas };
  }

  // What the fit-dossier request sends, field for field: the item key, brand, style, kind of item,
  // the shop's hostname, the install id and the anonymous review tally. Never the profile, the page
  // address or review text. Null when the function would refuse it.
  function dossierBody({ itemKey, brand, style, kind, shop, tallies }, install) {
    if (!validItemKey(itemKey)) return null;
    const b = clip(brand).slice(0, 80);
    const s = clip(style).slice(0, 80) || itemKey.split('|')[1];
    const k = kind === 'outerwear' ? 'tops' : kind;
    // The function refuses a shop that is not a dotted hostname (localhost, an intranet name, an
    // address) and an install that is not a uuid; such a page never asks.
    const host = String(shop || '').trim().toLowerCase();
    const id = String(install || '').trim().toLowerCase();
    if (!b || !KINDS.includes(k) || !DOSSIER_HOSTNAME.test(host) || !DOSSIER_UUID.test(id)) return null;
    return { item_key: itemKey, brand: b, style: s, kind: k, shop: host, install: id, tallies: dossierTallies(tallies) };
  }

  // The fit-dossier function's own shapes for the shop and the install (fit-dossier/dossier.ts).
  const DOSSIER_HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  const DOSSIER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // The reply's dossier, held to the function's shape; null when it is not one. Only web sources.
  function dossierEntry(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.verdict !== null && !DOSSIER_VERDICTS.includes(d.verdict)) return null;
    if (typeof d.strength !== 'number' || !(d.strength >= 0 && d.strength <= 1)) return null;
    if (!Array.isArray(d.areas) || !Array.isArray(d.sources)) return null;
    const web = (u) => { try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } };
    return {
      verdict: d.verdict,
      strength: d.strength,
      areas: d.areas.filter((a) => a && DOSSIER_AREAS.includes(a.area) && DOSSIER_DIRECTIONS.includes(a.direction))
        .map((a) => ({ area: a.area, direction: a.direction, note: clip(a.note).slice(0, 140) })),
      brand_note: typeof d.brand_note === 'string' && clip(d.brand_note) ? clip(d.brand_note).slice(0, 200) : null,
      sources: d.sources.filter((s) => s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url.trim()) && web(s.url.trim()))
        .slice(0, 8).map((s) => ({ url: s.url.trim(), title: clip(s.title).slice(0, 200) })),
    };
  }

  // The background worker's dossier request, with its browser APIs passed in. One request per item
  // at a time. A found dossier is kept 30 days and "nothing found" 7 days, per item; an error is kept
  // for nothing, so the next visit asks again.
  function createDossier({ fetch, get, set, installId, now = Date.now }) {
    const inFlight = new Map();
    async function ask(msg, key) {
      const cached = (await get(key))[key];
      if (cached && typeof cached.at === 'number') {
        const ttl = cached.dossier ? DOSSIER_FOUND_TTL : DOSSIER_MISS_TTL;
        if (now() - cached.at < ttl) return { dossier: cached.dossier || null };
      }
      const body = dossierBody(msg, await installId());
      if (!body) return { dossier: null, error: 'bad request' };
      const res = await post(fetch, DOSSIER_URL, body);
      if (!res.ok) return { dossier: null, error: `HTTP ${res.status}` };
      const data = await res.json();
      if (data && data.dossier === null) {
        await set({ [key]: { at: now(), dossier: null } });
        return { dossier: null };
      }
      const dossier = dossierEntry(data && data.dossier);
      if (!dossier) return { dossier: null, error: 'unexpected reply' };
      await set({ [key]: { at: now(), dossier } });
      return { dossier };
    }
    return function dossier(msg) {
      const key = dossierKey(msg && msg.itemKey);
      // Checked before the install id is read, with a stand-in of the same shape.
      if (!key || !dossierBody(msg, '00000000-0000-0000-0000-000000000000')) return Promise.resolve({ dossier: null, error: 'bad request' });
      if (!inFlight.has(key)) {
        inFlight.set(key, ask(msg, key)
          .catch((e) => ({ dossier: null, error: String((e && e.message) || e) }))
          .finally(() => inFlight.delete(key)));
      }
      return inFlight.get(key);
    };
  }

  root.SizerChartsStore = {
    SUPABASE_URL, SUPABASE_ANON_KEY, BUNDLE_URL, ITEM_FIT_URL, REPORT_URL, LOOKUP_URL, MISS_TTL,
    BRAND_FIT_URL, OUTCOME_URL, normaliseBrandFit, withBrandFit,
    headers, isFresh, isUsable, normalise, itemKey, poolExcept,
    missKey, isMissFresh, sanitiseShopGuide, lookupBody, lookupEntry, mergeChart, createLookup,
    READ_IMAGE_URL, READ_PRODUCT_URL, imageBody, imageChartEntry, withImageChart, createImageRead,
    productBody, readProductEntry, createProductRead, applyReadProduct,
    DOSSIER_URL, DOSSIER_FOUND_TTL, DOSSIER_MISS_TTL, dossierKey, dossierBody, dossierEntry, createDossier,
    READ_MEASUREMENTS_URL, LISTING_KINDS, MEASUREMENT_KEYS, VINTED_PHOTO_HOST, measurementsBody, readMeasurementsEntry, createMeasurementsRead,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
if (typeof module !== 'undefined') module.exports = globalThis.SizerChartsStore;
