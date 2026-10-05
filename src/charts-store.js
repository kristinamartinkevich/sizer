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

  root.SizerChartsStore = {
    SUPABASE_URL, SUPABASE_ANON_KEY, BUNDLE_URL, ITEM_FIT_URL, REPORT_URL, LOOKUP_URL, MISS_TTL,
    headers, isFresh, isUsable, normalise, itemKey, poolExcept,
    missKey, isMissFresh, sanitiseShopGuide, lookupBody, lookupEntry, mergeChart, createLookup,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
if (typeof module !== 'undefined') module.exports = globalThis.SizerChartsStore;
