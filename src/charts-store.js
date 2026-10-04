// The downloaded chart bundle: where it comes from, how long it is trusted, how it is kept.
// Pure helpers here so they can be tested; the fetching lives in background.js.
(function (root) {
  const SUPABASE_URL = 'https://cqvrdsgutpczbucbpiqa.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_6yLZgmy6DXn9eMXctQaapQ_c7D6Ldcv'; // the project's anon (publishable) key; read-only by RLS
  const BUNDLE_URL = `${SUPABASE_URL}/rest/v1/chart_bundle?select=brand_id,brand_name,aliases,charts,fit_notes,updated_at`;
  const DAY = 24 * 60 * 60 * 1000;

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

  root.SizerChartsStore = { SUPABASE_URL, SUPABASE_ANON_KEY, BUNDLE_URL, headers, isFresh, isUsable, normalise };
})(typeof globalThis !== 'undefined' ? globalThis : this);
if (typeof module !== 'undefined') module.exports = globalThis.SizerChartsStore;
