// Pure helpers for the fit-dossier function: the request check (fit-evidence HANDOFF §6) and the
// check of the model's record_dossier answer, provenance included. KINDS is lookup-chart's list;
// dossier_test.ts holds them equal.

export type Kind = "bottoms" | "tops" | "dresses" | "shoes";
export const KINDS: readonly Kind[] = ["bottoms", "tops", "dresses", "shoes"];
export const AREAS = ["bust", "chest", "waist", "hip", "length", "inseam", "shoulder", "sleeve", "foot"] as const;
export const DIRECTIONS = ["tight", "loose", "long", "short"] as const;
export const VERDICTS = ["small", "tts", "large"] as const;

export type Area = typeof AREAS[number];
export type Direction = typeof DIRECTIONS[number];
export type Verdict = typeof VERDICTS[number];

// Mentions per area: a plain count, or counts per direction ({ tight: 2, loose: 1 }).
export type AreaTally = number | Partial<Record<Direction, number>>;

export interface Tallies {
  small: number;
  large: number;
  tts: number;
  total: number;
  areas: Partial<Record<Area, AreaTally>>;
}

export interface DossierInput {
  item_key: string;
  brand: string;
  style: string;
  kind: Kind;
  shop: string;
  install: string;
  tallies: Tallies;
}

export interface DossierArea { area: Area; direction: Direction; note: string }
export interface DossierSource { url: string; title: string }

export interface Dossier {
  verdict: Verdict | null;
  strength: number;
  areas: DossierArea[];
  brand_note: string | null;
  sources: DossierSource[];
}

export const LIMITS = { name: 80, itemKey: 120, count: 5000, note: 140, brandNote: 200, title: 200, sources: 8 };

// Same shapes as 0003's item_fit_reports and lookup-chart's input check.
const ITEM_KEY = /^[a-z0-9 ]+\|[a-z0-9]+$/;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BODY_KEYS = new Set(["item_key", "brand", "style", "kind", "shop", "install", "tallies"]);
const TALLY_KEYS = new Set(["small", "large", "tts", "total", "areas"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= LIMITS.count;
const chars = (s: string) => [...s].length;
const clip = (s: string, n: number) => [...s].slice(0, n).join("").trim();
const squash = (s: string) => s.trim().replace(/\s+/g, " ");

// ---- the request -----------------------------------------------------------------------------

function parseTallies(t: unknown): Tallies | string {
  if (!isObject(t)) return "tallies must be an object.";
  if (Object.keys(t).some((k) => !TALLY_KEYS.has(k))) return "tallies has an unknown field.";
  const { small, large, tts, total, areas } = t;
  if (![small, large, tts, total].every(isCount)) return "tallies small, large, tts and total must be whole numbers from 0 to 5000.";
  if ((small as number) + (large as number) + (tts as number) > (total as number)) return "tallies small, large and tts cannot add up to more than total.";
  if (!isObject(areas)) return "tallies.areas must be an object.";
  const out: Partial<Record<Area, AreaTally>> = {};
  for (const [area, v] of Object.entries(areas)) {
    if (!includes(AREAS, area)) return `tallies.areas: ${area.slice(0, 20)} is not a known area.`;
    if (isCount(v)) {
      out[area] = v;
    } else if (isObject(v) && Object.entries(v).every(([d, n]) => includes(DIRECTIONS, d) && isCount(n))) {
      out[area] = { ...v } as Partial<Record<Direction, number>>;
    } else {
      return `tallies.areas.${area} must be a count or counts per tight, loose, long, short.`;
    }
  }
  return { small: small as number, large: large as number, tts: tts as number, total: total as number, areas: out };
}

export function parseDossierInput(body: unknown): { ok: true; input: DossierInput } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "Send a JSON object." };
  if (Object.keys(body).some((k) => !BODY_KEYS.has(k))) return { ok: false, error: "The body has an unknown field." };
  const itemKey = typeof body.item_key === "string" ? body.item_key : "";
  if (!ITEM_KEY.test(itemKey) || itemKey.length > LIMITS.itemKey) return { ok: false, error: "item_key must be brand|style, lowercase, at most 120 characters." };
  const brand = typeof body.brand === "string" ? squash(body.brand) : "";
  if (!brand || chars(brand) > LIMITS.name) return { ok: false, error: "brand must be 1 to 80 characters." };
  const style = typeof body.style === "string" ? squash(body.style) : "";
  if (!style || chars(style) > LIMITS.name) return { ok: false, error: "style must be 1 to 80 characters." };
  if (!includes(KINDS, body.kind)) return { ok: false, error: "kind must be bottoms, tops, dresses or shoes." };
  const shop = typeof body.shop === "string" ? body.shop.trim().toLowerCase() : "";
  if (!HOSTNAME.test(shop)) return { ok: false, error: "shop must be a hostname." };
  const install = typeof body.install === "string" ? body.install.trim().toLowerCase() : "";
  if (!UUID.test(install)) return { ok: false, error: "install must be a uuid." };
  const tallies = parseTallies(body.tallies);
  if (typeof tallies === "string") return { ok: false, error: tallies };
  return { ok: true, input: { item_key: itemKey, brand, style, kind: body.kind, shop, install, tallies } };
}

// ---- provenance ------------------------------------------------------------------------------

// What two addresses must share to count as the same page: host (lowercase, no www.) and path (no
// trailing slash). Scheme, query and fragment are ignored. Anything that is not http(s) is null.
export function urlKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return host + path;
}

// ---- the model's answer ----------------------------------------------------------------------

// Checks a record_dossier answer against the schema and holds every source to a page a web search
// in the same conversation returned. With no source left, nothing the model said is kept: the
// verdict is null, and so are the areas and the brand note, since none of it can be traced.
export function checkAnswer(raw: unknown, searchedUrls: string[]): { ok: true; dossier: Dossier } | { ok: false; reason: string } {
  if (!isObject(raw)) return { ok: false, reason: "answer is not an object" };
  const { verdict, strength, areas, brand_note, sources } = raw;
  if (verdict !== null && !includes(VERDICTS, verdict)) return { ok: false, reason: "verdict out of schema" };
  if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 1) return { ok: false, reason: "strength out of range" };
  if (!Array.isArray(areas)) return { ok: false, reason: "areas is not a list" };
  if (brand_note !== null && typeof brand_note !== "string") return { ok: false, reason: "brand_note out of schema" };
  if (!Array.isArray(sources)) return { ok: false, reason: "sources is not a list" };

  const seen = new Set(searchedUrls.map(urlKey).filter((k): k is string => k !== null));
  const kept: DossierSource[] = [];
  const keptKeys = new Set<string>();
  for (const s of sources) {
    if (!isObject(s)) continue;
    const key = urlKey(s.url);
    if (!key || !seen.has(key) || keptKeys.has(key)) continue;
    keptKeys.add(key);
    kept.push({ url: String(s.url).trim(), title: typeof s.title === "string" ? clip(squash(s.title), LIMITS.title) : "" });
    if (kept.length === LIMITS.sources) break;
  }
  if (!kept.length) return { ok: true, dossier: { verdict: null, strength: 0, areas: [], brand_note: null, sources: [] } };

  const outAreas: DossierArea[] = [];
  const pairs = new Set<string>();
  for (const a of areas) {
    if (!isObject(a) || !includes(AREAS, a.area) || !includes(DIRECTIONS, a.direction) || typeof a.note !== "string") continue;
    const pair = `${a.area}/${a.direction}`;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    outAreas.push({ area: a.area, direction: a.direction, note: clip(squash(a.note), LIMITS.note) });
  }
  const note = typeof brand_note === "string" ? clip(squash(brand_note), LIMITS.brandNote) : "";
  const v = verdict as Verdict | null;
  return {
    ok: true,
    dossier: { verdict: v, strength: v === null ? 0 : strength, areas: outAreas, brand_note: note || null, sources: kept },
  };
}

// A dossier that says nothing: the function stores it (so the item is not asked again for 30 days)
// but answers { dossier: null }.
export function isEmpty(d: Pick<Dossier, "verdict" | "areas" | "brand_note">): boolean {
  return d.verdict === null && (!Array.isArray(d.areas) || d.areas.length === 0) && !d.brand_note;
}
