// Pure helpers for read-chart-image's /measurements route (fit-evidence HANDOFF §8): the request check
// and the model's answer turned into flat widths and lengths in cm. The model copies what the photos
// show; the arithmetic (inches to cm, a circumference halved) and the plausibility check happen here.
// MEASUREMENT_RANGE and the halving rule are copies of src/vinted.js; measurements_test.ts holds them equal.

export const LISTING_KINDS = ["top", "dress", "jeans", "trousers", "shorts", "skirt", "outerwear", "shoes"] as const;
export type ListingKind = typeof LISTING_KINDS[number];

export const MEASUREMENT_KEYS = ["pit", "length", "waistFlat", "rise", "inseam", "legOpening", "shoulder", "sleeve", "insole"] as const;
export type MeasurementKey = typeof MEASUREMENT_KEYS[number];

// What a flat width or a length can plausibly be, in cm, after any halving. Same as src/vinted.js.
export const MEASUREMENT_RANGE: Record<MeasurementKey, [number, number]> = {
  waistFlat: [20, 80],
  pit: [25, 80],
  length: [15, 150],
  inseam: [40, 100],
  rise: [15, 45],
  legOpening: [8, 45],
  shoulder: [25, 60],
  sleeve: [25, 95],
  insole: [15, 33],
};

// A waist or chest at least this wide, not measured flat, is a circumference. Same as src/vinted.js.
const ROUND_FROM_CM: Partial<Record<MeasurementKey, number>> = { waistFlat: 55, pit: 70 };

export const MAX_PHOTOS = 4;
const MAX_URL = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Vinted serves listing photos from its own image hosts (images1.vinted.net and the like). Same rule
// as measurementsBody in src/charts-store.js; anything else is refused, so the route reads only listings.
const VINTED_HOST = /(^|\.)vinted\.[a-z]{2,3}(\.[a-z]{2})?$/i;

export interface MeasurementsInput {
  image_urls: string[];
  kind: ListingKind;
  install: string;
}

export interface MeasurementsAnswer {
  measurements: Partial<Record<MeasurementKey, number>>;
  note: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const round1 = (v: number) => Math.round(v * 10) / 10;

function photoAddress(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_URL) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || !VINTED_HOST.test(u.hostname)) return null;
  u.hash = "";
  return u.href.length <= MAX_URL ? u.href : null;
}

export function parseMeasurementsInput(body: unknown): { ok: true; input: MeasurementsInput } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "Send a JSON object." };
  if (!Object.keys(body).every((k) => ["image_urls", "kind", "install"].includes(k))) return { ok: false, error: "Send only image_urls, kind and install." };
  if (!Array.isArray(body.image_urls) || body.image_urls.length < 1 || body.image_urls.length > MAX_PHOTOS) {
    return { ok: false, error: `image_urls must list 1 to ${MAX_PHOTOS} photo addresses.` };
  }
  const urls: string[] = [];
  for (const raw of body.image_urls) {
    const u = photoAddress(raw);
    if (!u) return { ok: false, error: "Every photo must be a public https address on a Vinted image host." };
    if (!urls.includes(u)) urls.push(u);
  }
  if (typeof body.kind !== "string" || !(LISTING_KINDS as readonly string[]).includes(body.kind)) {
    return { ok: false, error: `kind must be one of ${LISTING_KINDS.join(", ")}.` };
  }
  const install = typeof body.install === "string" ? body.install.trim().toLowerCase() : "";
  if (!UUID.test(install)) return { ok: false, error: "install must be a uuid." };
  return { ok: true, input: { image_urls: urls, kind: body.kind as ListingKind, install } };
}

// The model's record_measurements input: each measurement null or { value, unit, laid_flat } as the
// photo shows it. Returns flat widths and lengths in cm within the plausible ranges; null when the
// answer is not in the tool's shape at all.
export function parseMeasurementsAnswer(raw: unknown): MeasurementsAnswer | null {
  if (!isObject(raw) || typeof raw.found !== "boolean" || !isObject(raw.measurements)) return null;
  const note = typeof raw.note === "string" ? clean(raw.note).slice(0, 300) : "";
  const given = raw.measurements;
  if (!Object.keys(given).every((k) => (MEASUREMENT_KEYS as readonly string[]).includes(k))) return null;
  const out: Partial<Record<MeasurementKey, number>> = {};
  for (const key of MEASUREMENT_KEYS) {
    const m = given[key];
    if (m === null || m === undefined) continue;
    if (!isObject(m) || typeof m.value !== "number" || !Number.isFinite(m.value) || (m.unit !== "cm" && m.unit !== "in")) return null;
    if (m.laid_flat !== null && m.laid_flat !== undefined && typeof m.laid_flat !== "boolean") return null;
    if (!raw.found) continue;
    let v = m.unit === "in" ? m.value * 2.54 : m.value;
    const from = ROUND_FROM_CM[key];
    if (from && v >= from && m.laid_flat !== true) v /= 2;
    const [lo, hi] = MEASUREMENT_RANGE[key];
    if (v >= lo && v <= hi) out[key] = round1(v);
  }
  return { measurements: out, note };
}
