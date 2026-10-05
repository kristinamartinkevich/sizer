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

  root.SizerChartsStore = { SUPABASE_URL, SUPABASE_ANON_KEY, BUNDLE_URL, ITEM_FIT_URL, REPORT_URL, headers, isFresh, isUsable, normalise, itemKey, poolExcept };
})(typeof globalThis !== 'undefined' ? globalThis : this);
if (typeof module !== 'undefined') module.exports = globalThis.SizerChartsStore;
