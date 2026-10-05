// The downloaded chart bundle: where it comes from, how long it is trusted, how it is kept.
// Pure helpers here so they can be tested; the fetching lives in background.js.
(function (root) {
  const SUPABASE_URL = 'https://cqvrdsgutpczbucbpiqa.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_6yLZgmy6DXn9eMXctQaapQ_c7D6Ldcv'; // the project's anon (publishable) key; read-only by RLS
  const BUNDLE_URL = `${SUPABASE_URL}/rest/v1/chart_bundle?select=brand_id,brand_name,aliases,charts,fit_notes,updated_at`;
  const ITEM_FIT_URL = `${SUPABASE_URL}/rest/v1/item_fit_by_vendor?select=vendor,small,large,tts,total,from_summary&item_key=eq.`;
  const REPORT_URL = `${SUPABASE_URL}/rest/v1/rpc/report_item_fit`;
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

  root.SizerChartsStore = {
    SUPABASE_URL, SUPABASE_ANON_KEY, BUNDLE_URL, ITEM_FIT_URL, REPORT_URL, LOOKUP_URL, MISS_TTL,
    headers, isFresh, isUsable, normalise, itemKey, poolExcept,
    missKey, isMissFresh, sanitiseShopGuide, lookupBody, lookupEntry, mergeChart, createLookup,
    READ_IMAGE_URL, READ_PRODUCT_URL, imageBody, imageChartEntry, withImageChart, createImageRead,
    productBody, readProductEntry, createProductRead, applyReadProduct,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
if (typeof module !== 'undefined') module.exports = globalThis.SizerChartsStore;
