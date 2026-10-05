// Pure helpers for the lookup function: the request check, the chart contract (HANDOFF §5), provenance
// tiers (HANDOFF §4) and the per-chart shape chart_bundle serves. CHARTS_FOR, tierOf and usable mirror
// src/charts.js; chart_test.ts holds them equal so the function and the extension never disagree.

export type Kind = "bottoms" | "tops" | "dresses" | "shoes";
export const KINDS: readonly Kind[] = ["bottoms", "tops", "dresses", "shoes"];

// Which chart categories can answer for which kind of page, best first. Same as src/charts.js.
export const CHARTS_FOR: Record<Kind, readonly string[]> = {
  bottoms: ["jeans", "bottoms", "trousers", "general"],
  tops: ["tops", "general", "dresses"],
  dresses: ["dresses", "general", "tops"],
  shoes: ["shoes"],
};

export const CATEGORIES = ["bottoms", "jeans", "trousers", "tops", "dresses", "general", "shoes"] as const;
export const UNITS = ["cm", "in"] as const;
export const BASES = ["body", "garment"] as const;
export const SIZE_SYSTEMS = ["denim_waist", "eu", "us", "uk", "it", "fr", "letter", "mixed"] as const;
export const SOURCE_TYPES = ["brand_site", "retailer_brand_chart", "retailer_house_chart"] as const;
export const ALIAS_SYSTEMS = ["us", "uk", "eu", "it", "fr", "letter"] as const;
export const MEASURES = ["waist", "hip", "bust", "foot_length"] as const;

export type SourceType = typeof SOURCE_TYPES[number];
export type Range = [number, number];
export type Measure = typeof MEASURES[number];

export interface ChartRow {
  label: string;
  waist: Range | null;
  hip: Range | null;
  bust: Range | null;
  foot_length: Range | null;
  aliases: Record<string, string>;
}

export interface Chart {
  category: string;
  unit: "cm" | "in";
  measurement_basis: "body" | "garment";
  size_system: string;
  source_url: string;
  source_type: SourceType;
  retailer: string | null;
  mentions_brand: boolean;
  rows: ChartRow[];
  note: string;
}

export type Answer = { found: true; reason: string; chart: Chart } | { found: false; reason: string; chart: null };

export interface ShopGuide {
  charts: Record<string, unknown>[];
  caption: string;
}

export interface LookupInput {
  brand: string;
  alias: string;
  kind: Kind;
  shop: string;
  install: string;
  shopGuide: ShopGuide | null;
}

const MAX_BRAND = 80;
const MAX_GUIDE_CHARS = 30000;
const MAX_GUIDE_CHARTS = 30;
const MAX_ROWS = 60;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

// ---- names -----------------------------------------------------------------------------------

// How brands.aliases stores a spelling: lowercase, spaces collapsed.
export function normaliseBrand(brand: string): string {
  return brand.trim().replace(/\s+/g, " ").toLowerCase();
}

// A stable brand id in the seed's style ("rag & bone" → "rag-bone"). A name with no Latin letters or
// digits gets a short hash so it still has an id.
export async function brandSlug(alias: string): Promise<string> {
  const slug = alias.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug) return slug;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(alias)));
  return `b-${Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const shopHost = (shop: string) => shop.replace(/^www\./, "");

// ---- the request -----------------------------------------------------------------------------

export function parseLookupInput(body: unknown): { ok: true; input: LookupInput } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "Send a JSON object." };
  const brand = typeof body.brand === "string" ? body.brand.trim().replace(/\s+/g, " ") : "";
  if (!brand || [...brand].length > MAX_BRAND) return { ok: false, error: "brand must be 1 to 80 characters." };
  if (!includes(KINDS, body.kind)) return { ok: false, error: "kind must be bottoms, tops, dresses or shoes." };
  const shop = typeof body.shop === "string" ? body.shop.trim().toLowerCase() : "";
  if (!HOSTNAME.test(shop)) return { ok: false, error: "shop must be a hostname." };
  const install = typeof body.install === "string" ? body.install.trim().toLowerCase() : "";
  if (!UUID.test(install)) return { ok: false, error: "install must be a uuid." };

  let shopGuide: ShopGuide | null = null;
  if (body.shopGuide !== undefined && body.shopGuide !== null) {
    const g = body.shopGuide;
    if (
      !isObject(g) || !Array.isArray(g.charts) || g.charts.length > MAX_GUIDE_CHARTS || !g.charts.every(isObject) ||
      typeof g.caption !== "string" || JSON.stringify(g).length > MAX_GUIDE_CHARS
    ) {
      return { ok: false, error: "shopGuide must be { charts, caption } under 30000 characters." };
    }
    // The page address never travels further than this: the model gets the table, not the URL.
    const charts = (g.charts as Record<string, unknown>[]).map(({ source_url: _url, ...rest }) => rest);
    shopGuide = { charts, caption: g.caption };
  }
  return { ok: true, input: { brand, alias: normaliseBrand(brand), kind: body.kind, shop, install, shopGuide } };
}

// ---- the model's answer ----------------------------------------------------------------------

function webAddress(v: unknown): URL | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function readRange(v: unknown): Range | null | undefined {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1000)) return undefined;
  return [v[0], v[1]];
}

const ROW_FIELDS = new Set(["label", "aliases", ...MEASURES]);
const CHART_FIELDS = new Set(["category", "unit", "measurement_basis", "size_system", "source_url", "source_type", "retailer", "mentions_brand", "rows", "note"]);

// Checks one chart against the §5 contract and against what convertChart can use. Returns the chart
// with clean rows, or the reason it fails, in plain words for the no_chart marker.
export function checkChart(raw: unknown, kind: Kind): { chart: Chart } | { reason: string } {
  if (!isObject(raw)) return { reason: "the chart is not an object" };
  const extra = Object.keys(raw).find((k) => !CHART_FIELDS.has(k));
  if (extra) return { reason: `the chart has an unknown field ${extra}` };
  if (!includes(CATEGORIES, raw.category)) return { reason: `unknown category ${String(raw.category)}` };
  if (!CHARTS_FOR[kind].includes(raw.category)) return { reason: `category ${raw.category} does not answer for ${kind}` };
  if (!includes(UNITS, raw.unit)) return { reason: `unit must be cm or in, not ${String(raw.unit)}` };
  if (!includes(BASES, raw.measurement_basis)) return { reason: `unknown measurement basis ${String(raw.measurement_basis)}` };
  if (!includes(SIZE_SYSTEMS, raw.size_system)) return { reason: `unknown size system ${String(raw.size_system)}` };
  if (!includes(SOURCE_TYPES, raw.source_type)) return { reason: `unknown source type ${String(raw.source_type)}` };
  const url = webAddress(raw.source_url);
  if (!url) return { reason: "source_url is not a web address" };
  if (raw.retailer !== null && raw.retailer !== undefined && typeof raw.retailer !== "string") return { reason: "retailer is not text" };
  if (typeof raw.mentions_brand !== "boolean") return { reason: "mentions_brand is not true or false" };
  if (typeof raw.note !== "string") return { reason: "note is not text" };
  if (!Array.isArray(raw.rows)) return { reason: "rows is not a list" };
  if (raw.rows.length < 2) return { reason: "the chart has fewer than two rows" };
  if (raw.rows.length > MAX_ROWS) return { reason: `the chart has more than ${MAX_ROWS} rows` };

  const rows: ChartRow[] = [];
  for (const [i, r] of raw.rows.entries()) {
    const n = i + 1;
    if (!isObject(r)) return { reason: `row ${n} is not an object` };
    const unknown = Object.keys(r).find((k) => !ROW_FIELDS.has(k));
    if (unknown) return { reason: `row ${n} has an unknown field ${unknown}` };
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label || label.length > 20) return { reason: `row ${n} has no usable label` };
    const row: ChartRow = { label, waist: null, hip: null, bust: null, foot_length: null, aliases: {} };
    for (const m of MEASURES) {
      const range = readRange(r[m]);
      if (range === undefined) return { reason: `row ${n}: ${m} is not a [min, max] range` };
      if (range && range[0] > range[1]) return { reason: `row ${n}: ${m} min is above its max` };
      row[m] = range;
    }
    if (r.aliases !== null && r.aliases !== undefined) {
      if (!isObject(r.aliases)) return { reason: `row ${n}: aliases are not an object` };
      for (const [k, v] of Object.entries(r.aliases)) {
        if (!includes(ALIAS_SYSTEMS, k) || (v !== null && typeof v !== "string")) return { reason: `row ${n}: aliases are not text by size system` };
        if (typeof v === "string" && v.trim()) row.aliases[k] = v.trim();
      }
    }
    rows.push(row);
  }

  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.label.toUpperCase();
    if (seen.has(key)) return { reason: `labels repeat: ${r.label}` };
    seen.add(key);
  }

  for (const m of MEASURES) {
    let prev: Range | null = null;
    for (const [i, r] of rows.entries()) {
      const cur = r[m];
      if (!cur) continue;
      if (prev && (cur[0] < prev[0] || cur[1] < prev[1])) return { reason: `${m} goes down at row ${i + 1}` };
      prev = cur;
    }
  }

  // convertChart drops every clothing row without both waist and hip, and every shoe row without a
  // foot length, and needs two rows left.
  const shoes = raw.category === "shoes";
  const usableRows = rows.filter((r) => (shoes ? r.foot_length : r.waist && r.hip)).length;
  if (usableRows < 2) return { reason: shoes ? "fewer than two rows carry a foot length" : "fewer than two rows carry both waist and hip" };

  return {
    chart: {
      category: raw.category,
      unit: raw.unit,
      measurement_basis: raw.measurement_basis,
      size_system: raw.size_system,
      source_url: url.href,
      source_type: raw.source_type,
      retailer: typeof raw.retailer === "string" ? raw.retailer : null,
      mentions_brand: raw.mentions_brand,
      rows,
      note: raw.note.trim(),
    },
  };
}

// The model's record_lookup input, checked, with its provenance settled by rule rather than taken on
// trust: a shop chart is the brand's only when the model judged that it names the brand or the shop
// labels it as the brand's (mentions_brand), its retailer is always the shop the request came from,
// and its address is the shop's own.
export function validateAnswer(
  raw: unknown,
  ctx: { kind: Kind; shop: string; shopGuideSent: boolean },
): { ok: true; answer: Answer } | { ok: false; reason: string } {
  if (!isObject(raw)) return { ok: false, reason: "Answer rejected: the answer is not an object." };
  if (typeof raw.found !== "boolean") return { ok: false, reason: "Answer rejected: found is not true or false." };
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (!raw.found) return { ok: true, answer: { found: false, reason: reason || "No size chart found.", chart: null } };
  if (!isObject(raw.chart)) return { ok: false, reason: "Answer rejected: found is true but there is no chart." };

  const checked = checkChart(raw.chart, ctx.kind);
  if ("reason" in checked) return { ok: false, reason: `Answer rejected: ${checked.reason}.` };
  const chart = checked.chart;

  if (chart.source_type === "brand_site") {
    chart.retailer = null;
  } else {
    if (!ctx.shopGuideSent) return { ok: false, reason: "Answer rejected: a shop chart came back but no shop guide was sent." };
    const host = shopHost(ctx.shop);
    chart.source_type = chart.mentions_brand ? "retailer_brand_chart" : "retailer_house_chart";
    chart.retailer = host;
    const urlHost = new URL(chart.source_url).hostname.replace(/^www\./, "");
    if (urlHost !== host && !urlHost.endsWith(`.${host}`)) chart.source_url = `https://${ctx.shop}/`;
  }
  return { ok: true, answer: { found: true, reason, chart } };
}

// ---- what is stored, and how the bundle serves it --------------------------------------------

export interface StoredRowLike {
  position: number;
  label: string;
  aliases: Record<string, string> | null;
  bust_min: number | string | null; bust_max: number | string | null;
  waist_min: number | string | null; waist_max: number | string | null;
  hip_min: number | string | null; hip_max: number | string | null;
  inseam_min: number | string | null; inseam_max: number | string | null;
  foot_length_min: number | string | null; foot_length_max: number | string | null;
  extra: Record<string, unknown> | null;
  suspect: boolean;
  suspect_note: string | null;
}

export interface StoredChartLike {
  id: string;
  gender: string;
  category: string;
  fit_line: string | null;
  measurement_basis: string | null;
  unit: string | null;
  size_system: string;
  source_url: string;
  source_archive_url: string | null;
  source_type: string;
  retailer: string | null;
  status: string;
  read_by: string | null;
  retrieved_on: string;
  fit_advice: string | null;
  size_chart_rows: StoredRowLike[];
}

export type BundleRange = [number, number] | null;

export interface BundleRow {
  label: string;
  aliases: Record<string, string>;
  bust: BundleRange;
  waist: BundleRange;
  hip: BundleRange;
  inseam: BundleRange;
  foot_length: BundleRange;
  extra: Record<string, unknown>;
  suspect: string | null;
}

export interface BundleChart {
  id: string;
  gender: string;
  category: string;
  fit_line: string | null;
  measurement_basis: string | null;
  unit: string | null;
  size_system: string;
  source_url: string;
  source_archive_url: string | null;
  source_type: string;
  retailer: string | null;
  status: string;
  read_by: string | null;
  retrieved_on: string;
  fit_advice: string | null;
  rows: BundleRow[];
}

const pair = (min: number | string | null, max: number | string | null): BundleRange =>
  min === null || min === undefined ? null : [Number(min), Number(max)];

// The same object chart_bundle (migration 0004) builds for one chart, so the extension can merge it
// into its stored bundle unchanged.
export function toBundleChart(c: StoredChartLike): BundleChart {
  const rows = [...(c.size_chart_rows || [])].sort((a, b) => a.position - b.position);
  return {
    id: c.id,
    gender: c.gender,
    category: c.category,
    fit_line: c.fit_line,
    measurement_basis: c.measurement_basis,
    unit: c.unit,
    size_system: c.size_system,
    source_url: c.source_url,
    source_archive_url: c.source_archive_url,
    source_type: c.source_type,
    retailer: c.retailer,
    status: c.status,
    read_by: c.read_by,
    retrieved_on: c.retrieved_on,
    fit_advice: c.fit_advice,
    rows: rows.map((r) => ({
      label: r.label,
      aliases: r.aliases ?? {},
      bust: pair(r.bust_min, r.bust_max),
      waist: pair(r.waist_min, r.waist_max),
      hip: pair(r.hip_min, r.hip_max),
      inseam: pair(r.inseam_min, r.inseam_max),
      foot_length: pair(r.foot_length_min, r.foot_length_max),
      extra: r.extra ?? {},
      suspect: r.suspect ? r.suspect_note : null,
    })),
  };
}

// Where a chart came from, best first. Same rule as tierOf in src/charts.js.
export function tierOf(chart: { source_type?: string | null; status?: string | null }): number {
  const sourceType = chart.source_type || "brand_site";
  const machine = chart.status === "machine_read";
  if (sourceType === "retailer_house_chart") return 5;
  if (sourceType === "retailer_brand_chart") return machine ? 4 : 2;
  return machine ? 3 : 1;
}

// Whether convertChart in src/charts.js would turn this chart into something the engine can size with.
export function usable(chart: BundleChart): boolean {
  const shoes = chart.category === "shoes";
  return chart.rows.filter((r) => !r.suspect && (shoes ? r.foot_length : r.waist && r.hip)).length >= 2;
}

// The brand's best usable chart for this kind of item: provenance first, then category order.
export function pickBest(charts: BundleChart[], kind: Kind): BundleChart | null {
  const order = CHARTS_FOR[kind];
  const ranked = charts
    .filter((c) => order.includes(c.category) && usable(c))
    .map((c) => ({ c, tier: tierOf(c), rank: order.indexOf(c.category) }))
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank);
  return ranked.length ? ranked[0].c : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// size_charts columns for a machine-read chart.
export function chartRecord(brandId: string, chart: Chart, today: string): Record<string, unknown> {
  return {
    brand_id: brandId,
    gender: "women",
    category: chart.category,
    measurement_basis: chart.measurement_basis,
    unit: chart.unit,
    size_system: chart.size_system,
    source_url: chart.source_url,
    source_type: chart.source_type,
    retailer: chart.retailer,
    retrieved_on: today,
    status: "machine_read",
    read_by: "lookup-chart",
    lookup_note: chart.note || null,
  };
}

// size_chart_rows columns, smallest size first, one decimal as the columns store it.
export function rowRecords(chartId: string, chart: Chart): Record<string, unknown>[] {
  return chart.rows.map((r, position) => {
    const rec: Record<string, unknown> = { chart_id: chartId, position, label: r.label, aliases: r.aliases };
    for (const m of MEASURES) {
      const range = r[m];
      rec[`${m}_min`] = range ? round1(range[0]) : null;
      rec[`${m}_max`] = range ? round1(range[1]) : null;
    }
    return rec;
  });
}
