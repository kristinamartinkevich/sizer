// Pure helpers for read-chart-image (fit-evidence HANDOFF §7): the two request checks, the chart rules
// ported from src/guide-table.js's parseGuideMatrix and lookup-chart's checkChart, and the plan 1 §5
// chart shape the extension feeds into a lookup. CHARTS_FOR and PLAUSIBLE are copies; chart_test.ts
// holds them equal to src/charts.js, src/guide-table.js and lookup-chart, so the readers never disagree.

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
export const ALIAS_SYSTEMS = ["us", "uk", "eu", "it", "fr", "letter"] as const;
export const MEASURES = ["waist", "hip", "bust", "foot_length"] as const;
export const TABLE_TYPES = ["size_chart", "model_measurements", "garment_dimensions", "other"] as const;

// Plausible body measurements, so a column of something else is not read as one. Same as src/guide-table.js.
export const PLAUSIBLE = {
  cm: { waist: [40, 160], hip: [60, 180], bust: [60, 170], foot_length: [12, 35] },
  in: { waist: [16, 63], hip: [24, 71], bust: [24, 67], foot_length: [5, 14] },
} as const;

// A shop's "model info" panel lists the model's own body and the size she wears. Same wording as src/guide-table.js.
const MODEL = /\bmodels?\b|mannequin|size worn|\bwears? (a )?size|is wearing|porte une taille|taille port[ée]e|tr(ä|a)gt gr(ö|o)(ß|ss)e/i;

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

// What is stored per image: what the image shows, independent of who asked. The brand judgement and
// the kind of item are settled per request, so one read serves every shopper.
export interface ImageChart {
  category: string;
  unit: "cm" | "in";
  measurement_basis: "body" | "garment";
  size_system: string;
  heading: string;
  brands_named: string[];
  rows: ChartRow[];
  note: string;
}

export interface ImageInput {
  image_url: string;
  brand: string;
  kind: Kind;
  install: string;
}

export interface ProductInput {
  title: string;
  headings: string[];
  picker: string;
  install: string;
}

export interface ProductAnswer {
  brand: string | null;
  title: string | null;
  kind: Kind | null;
  sizes: string[];
  fabric: string | null;
}

const MAX_BRAND = 80;
const MAX_URL = 2048;
const MAX_ROWS = 60;
export const MAX_PRODUCT_CHARS = 6000;
const MAX_HEADINGS = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IP_HOST = /^\d{1,3}(\.\d{1,3}){3}$|^\[/;
const ADDRESS = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const noAddresses = (s: string) => clean(s.replace(ADDRESS, " "));
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

// ---- the requests ----------------------------------------------------------------------------

function parseInstall(v: unknown): string | null {
  const install = typeof v === "string" ? v.trim().toLowerCase() : "";
  return UUID.test(install) ? install : null;
}

// A public image on the web: https, a real hostname, no credentials. The fragment is dropped, the query
// kept (image CDNs size by it). The function never fetches it itself; the model's API does.
export function imageAddress(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_URL) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") || IP_HOST.test(u.hostname)) return null;
  u.hash = "";
  return u.href.length <= MAX_URL ? u.href : null;
}

export function parseImageInput(body: unknown): { ok: true; input: ImageInput } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "Send a JSON object." };
  if (!onlyKeys(body, ["image_url", "brand", "kind", "install"])) return { ok: false, error: "Send only image_url, brand, kind and install." };
  const image_url = imageAddress(body.image_url);
  if (!image_url) return { ok: false, error: "image_url must be a public https address." };
  const brand = typeof body.brand === "string" ? clean(body.brand) : "";
  if (!brand || [...brand].length > MAX_BRAND) return { ok: false, error: "brand must be 1 to 80 characters." };
  if (!includes(KINDS, body.kind)) return { ok: false, error: "kind must be bottoms, tops, dresses or shoes." };
  const install = parseInstall(body.install);
  if (!install) return { ok: false, error: "install must be a uuid." };
  return { ok: true, input: { image_url, brand, kind: body.kind, install } };
}

// The page's cleaned product text. Addresses are taken out again here, whatever the client did.
export function parseProductInput(body: unknown): { ok: true; input: ProductInput } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "Send a JSON object." };
  if (!onlyKeys(body, ["title", "headings", "picker", "install"])) return { ok: false, error: "Send only title, headings, picker and install." };
  const install = parseInstall(body.install);
  if (!install) return { ok: false, error: "install must be a uuid." };
  if (typeof body.title !== "string" || typeof body.picker !== "string" || !Array.isArray(body.headings) || body.headings.length > MAX_HEADINGS || !body.headings.every((h) => typeof h === "string")) {
    return { ok: false, error: "title and picker must be text and headings a list of text." };
  }
  const raw = body.title.length + body.picker.length + (body.headings as string[]).reduce((n, h) => n + h.length, 0);
  if (raw > MAX_PRODUCT_CHARS) return { ok: false, error: `The text must be at most ${MAX_PRODUCT_CHARS} characters.` };
  const title = noAddresses(body.title);
  const headings = (body.headings as string[]).map(noAddresses).filter(Boolean);
  const picker = noAddresses(body.picker);
  if (!title && !headings.length && !picker) return { ok: false, error: "There is no text to read." };
  return { ok: true, input: { title, headings, picker, install } };
}

// The cache key: SHA-256 of the image address, hex.
export async function urlHash(url: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- the image chart -------------------------------------------------------------------------

function readRange(v: unknown): Range | null | undefined {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1000)) return undefined;
  return [v[0], v[1]];
}

const ROW_FIELDS = ["label", "aliases", ...MEASURES];
const CHART_FIELDS = ["category", "unit", "measurement_basis", "size_system", "heading", "brands_named", "rows", "note"];

// One chart read from an image, checked by the rules the extension's own table reader applies.
export function checkImageChart(raw: unknown): { chart: ImageChart } | { reason: string } {
  if (!isObject(raw)) return { reason: "the chart is not an object" };
  const extra = Object.keys(raw).find((k) => !CHART_FIELDS.includes(k));
  if (extra) return { reason: `the chart has an unknown field ${extra}` };
  if (!includes(CATEGORIES, raw.category)) return { reason: `unknown category ${String(raw.category)}` };
  if (!includes(UNITS, raw.unit)) return { reason: `unit must be cm or in, not ${String(raw.unit)}` };
  if (!includes(BASES, raw.measurement_basis)) return { reason: `unknown measurement basis ${String(raw.measurement_basis)}` };
  if (!includes(SIZE_SYSTEMS, raw.size_system)) return { reason: `unknown size system ${String(raw.size_system)}` };
  if (typeof raw.heading !== "string") return { reason: "heading is not text" };
  if (MODEL.test(raw.heading)) return { reason: "the image is a model's measurements, not a size chart" };
  if (!Array.isArray(raw.brands_named) || !raw.brands_named.every((b) => typeof b === "string")) return { reason: "brands_named is not a list of text" };
  if (typeof raw.note !== "string") return { reason: "note is not text" };
  if (!Array.isArray(raw.rows)) return { reason: "rows is not a list" };
  if (raw.rows.length < 2) return { reason: "the chart has fewer than two rows" };
  if (raw.rows.length > MAX_ROWS) return { reason: `the chart has more than ${MAX_ROWS} rows` };
  const unit = raw.unit;

  const rows: ChartRow[] = [];
  for (const [i, r] of raw.rows.entries()) {
    const n = i + 1;
    if (!isObject(r)) return { reason: `row ${n} is not an object` };
    const unknown = Object.keys(r).find((k) => !ROW_FIELDS.includes(k));
    if (unknown) return { reason: `row ${n} has an unknown field ${unknown}` };
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label || label.length > 20) return { reason: `row ${n} has no usable label` };
    const row: ChartRow = { label, waist: null, hip: null, bust: null, foot_length: null, aliases: {} };
    for (const m of MEASURES) {
      const range = readRange(r[m]);
      if (range === undefined) return { reason: `row ${n}: ${m} is not a [min, max] range` };
      if (range && range[0] > range[1]) return { reason: `row ${n}: ${m} min is above its max` };
      if (range) {
        const [lo, hi] = PLAUSIBLE[unit][m];
        if (range[0] < lo || range[1] > hi) return { reason: `row ${n}: ${m} ${range.join("-")} ${unit} is not a plausible body measurement` };
      }
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

  // Clothing is sized on waist and hip, shoes on foot length; convertChart drops any other row.
  const shoes = raw.category === "shoes";
  const usableRows = rows.filter((r) => (shoes ? r.foot_length : r.waist && r.hip)).length;
  if (usableRows < 2) return { reason: shoes ? "fewer than two rows carry a foot length" : "fewer than two rows carry both waist and hip" };

  return {
    chart: {
      category: raw.category,
      unit,
      measurement_basis: raw.measurement_basis,
      size_system: raw.size_system,
      heading: clean(raw.heading).slice(0, 200),
      brands_named: raw.brands_named.map((b: string) => clean(b)).filter(Boolean).slice(0, 10),
      rows,
      note: clean(raw.note).slice(0, 300),
    },
  };
}

export type ImageAnswer = { found: true; reason: string; chart: ImageChart } | { found: false; reason: string; chart: null };

// The model's record_chart input, checked. Anything but a size chart is a plain "no chart".
export function validateImageAnswer(raw: unknown): { ok: true; answer: ImageAnswer } | { ok: false; reason: string } {
  if (!isObject(raw)) return { ok: false, reason: "Answer rejected: the answer is not an object." };
  if (typeof raw.found !== "boolean") return { ok: false, reason: "Answer rejected: found is not true or false." };
  const reason = typeof raw.reason === "string" ? clean(raw.reason).slice(0, 300) : "";
  if (!raw.found) return { ok: true, answer: { found: false, reason: reason || "No size chart in the image.", chart: null } };
  if (raw.table_type === "model_measurements") return { ok: false, reason: "Answer rejected: the image is a model's measurements, not a size chart." };
  if (raw.table_type !== "size_chart") return { ok: false, reason: `Answer rejected: the image is ${String(raw.table_type).replace(/_/g, " ")}, not a size chart.` };
  if (!isObject(raw.chart)) return { ok: false, reason: "Answer rejected: found is true but there is no chart." };
  const checked = checkImageChart(raw.chart);
  if ("reason" in checked) return { ok: false, reason: `Answer rejected: ${checked.reason}.` };
  return { ok: true, answer: { found: true, reason, chart: checked.chart } };
}

export const answersFor = (chart: { category: string }, kind: Kind) => CHARTS_FOR[kind].includes(chart.category);

const words = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

// Whether the image names this brand, as whole words, in its heading or the brands it prints.
export function namesBrand(chart: ImageChart, brand: string): boolean {
  const b = words(brand);
  if (!b) return false;
  return ` ${words([chart.heading, ...chart.brands_named].join(" "))} `.includes(` ${b} `);
}

export interface ServedChart {
  category: string;
  unit: string;
  measurement_basis: string;
  size_system: string;
  source_url: string;
  source_type: "retailer_brand_chart" | "retailer_house_chart";
  retailer: null;
  mentions_brand: boolean;
  rows: ChartRow[];
  note: string;
  status: "machine_read";
  read_by: "read-chart-image";
}

// The plan 1 §5 chart for this request. An image sits on a shop's page, so it is the shop's chart: the
// brand's when the image names the brand, the shop's general chart otherwise. The image address is the
// source; the client never sends the page address.
export function servedChart(chart: ImageChart, req: { image_url: string; brand: string }): ServedChart {
  const mentions = namesBrand(chart, req.brand);
  return {
    category: chart.category,
    unit: chart.unit,
    measurement_basis: chart.measurement_basis,
    size_system: chart.size_system,
    source_url: req.image_url,
    source_type: mentions ? "retailer_brand_chart" : "retailer_house_chart",
    retailer: null,
    mentions_brand: mentions,
    rows: chart.rows,
    note: chart.note,
    status: "machine_read",
    read_by: "read-chart-image",
  };
}

// ---- the product answer ----------------------------------------------------------------------

function text(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const s = noAddresses(v).slice(0, max);
  return s || null;
}

// The model's record_product input, cut to its fields and limits; null when it is not usable at all.
export function parseProductAnswer(raw: unknown): ProductAnswer | null {
  if (!isObject(raw)) return null;
  const brand = text(raw.brand, MAX_BRAND);
  const title = text(raw.title, 200);
  const fabric = text(raw.fabric, 200);
  if (brand === undefined || title === undefined || fabric === undefined) return null;
  if (!Array.isArray(raw.sizes)) return null;
  const sizes: string[] = [];
  for (const s of raw.sizes) {
    if (typeof s !== "string") continue;
    const label = clean(s);
    if (!label || label.length > 20 || sizes.some((x) => x.toUpperCase() === label.toUpperCase())) continue;
    sizes.push(label);
    if (sizes.length >= 40) break;
  }
  return { brand, title, kind: includes(KINDS, raw.kind) ? raw.kind : null, sizes, fabric };
}
