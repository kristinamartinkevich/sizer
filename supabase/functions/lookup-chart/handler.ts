// lookup-chart: finds a brand's size chart when no shopper has one yet (HANDOFF §3.3 and §7).
// POST { brand, kind, shop, install, shopGuide? } → { chart | null, tier, note }
//   a. check the input             400 otherwise
//   b. the shared cache            a usable stored chart, or a no_chart marker younger than 30 days
//   c. the caps                    20 per install and 300 overall per day, 429 beyond
//   d. one model lookup            brand's own site first, the shop's table judged second
//   e. check the chart             a failing chart leaves a no_chart marker
//   f. store and return it         machine_read, in the per-chart shape chart_bundle serves
// Written against injected clients so the tests never touch the network; index.ts wires the real ones.
import {
  type Answer,
  brandSlug,
  CHARTS_FOR,
  chartRecord,
  type LookupInput,
  parseLookupInput,
  pickBest,
  rowRecords,
  type StoredChartLike,
  type StoredRowLike,
  toBundleChart,
  validateAnswer,
} from "./chart.ts";
import { ANSWER_TOOL, ANSWER_TOOL_NAME, FORCE_ANSWER, MAX_TOKENS, MODEL, SYSTEM_PROMPT, userPrompt, WEB_TOOLS } from "./prompt.ts";

export type StoredRow = StoredRowLike & { id: string; chart_id: string };
export type StoredChart = StoredChartLike & { brand_id: string; lookup_note?: string | null };

export interface BrandRecord {
  id: string;
  name: string;
  aliases: string[];
  website: string | null;
}

export interface LookupRecord {
  brand: string;
  kind: string;
  shop: string;
  install: string;
  outcome: "pending" | "chart" | "no_chart" | "error";
  reason: string | null;
}

export interface LookupDb {
  findBrand(alias: string, slug: string): Promise<BrandRecord | null>;
  findCharts(brandId: string, categories: readonly string[]): Promise<StoredChart[]>;
  latestNoChart(brand: string, kind: string, since: string): Promise<{ reason: string | null } | null>;
  countLookups(since: string, install?: string): Promise<number>;
  insertBrand(brand: BrandRecord): Promise<void>;
  setAliases(id: string, aliases: string[]): Promise<void>;
  insertChart(record: Record<string, unknown>): Promise<StoredChart>;
  insertRows(rows: Record<string, unknown>[]): Promise<StoredRow[]>;
  deleteChart(id: string): Promise<void>;
  // The ledger row is written before the model is asked, so concurrent lookups see each other in the caps.
  reserveLookup(record: Omit<LookupRecord, "outcome" | "reason">): Promise<string>;
  finishLookup(id: string, outcome: Exclude<LookupRecord["outcome"], "pending">, reason: string | null): Promise<void>;
  cancelLookup(id: string): Promise<void>;
}

export interface Deps {
  db: LookupDb;
  fetch: typeof fetch;
  anthropicKey: string;
  now?: () => Date;
  log?: (line: string) => void;
}

export const CAPS = { perInstallPerDay: 20, globalPerDay: 300 };
export const NO_CHART_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MODEL_REQUESTS = 6;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const none = (status: number, note: string) => json(status, { chart: null, tier: "none", note });

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const now = (deps.now ?? (() => new Date()))();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "The body is not JSON." });
  }
  const parsed = parseLookupInput(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const input = parsed.input;
  const slug = await brandSlug(input.alias);
  const tag = `${input.alias}/${input.kind}`;
  const { db } = deps;

  let held = "";
  const record = async (outcome: Exclude<LookupRecord["outcome"], "pending">, reason: string | null) => {
    await db.finishLookup(held, outcome, reason);
  };

  // b. the shared cache, then c. the caps. The place in the ledger is taken first and the counts read
  // after, so lookups landing at the same moment count each other; one over a cap gives its place back.
  try {
    const cached = await storedChartFor(db, input, slug);
    if (cached) {
      log(`lookup-chart: cache hit ${tag}`);
      return json(200, { chart: cached, tier: cached.source_type, note: "Chart already stored." });
    }
    const marker = await db.latestNoChart(input.alias, input.kind, new Date(now.getTime() - NO_CHART_DAYS * DAY_MS).toISOString());
    if (marker) {
      log(`lookup-chart: no_chart marker ${tag}`);
      return none(200, marker.reason || "No size chart found.");
    }
    held = await db.reserveLookup({ brand: input.alias, kind: input.kind, shop: input.shop, install: input.install });
    const since = new Date(now.getTime() - DAY_MS).toISOString();
    if (await db.countLookups(since, input.install) > CAPS.perInstallPerDay) {
      await db.cancelLookup(held);
      log(`lookup-chart: install cap ${tag}`);
      return none(429, "Too many lookups from this install today.");
    }
    if (await db.countLookups(since) > CAPS.globalPerDay) {
      await db.cancelLookup(held);
      log(`lookup-chart: global cap ${tag}`);
      return none(429, "Too many lookups today.");
    }
  } catch (e) {
    log(`lookup-chart: database error before the lookup ${tag}: ${message(e)}`);
    return none(500, "The lookup could not run.");
  }

  // d. the model.
  const asked = await askModel(input, deps);
  if (!asked.ok) {
    log(`lookup-chart: model error ${tag}: ${asked.reason}`);
    try {
      await record("error", asked.reason);
    } catch (e) {
      log(`lookup-chart: could not record the error ${tag}: ${message(e)}`);
    }
    return none(502, "The lookup failed, try again later.");
  }

  // e. the chart, checked.
  let answer: Answer;
  try {
    const checked = validateAnswer(asked.input, { kind: input.kind, shop: input.shop, shopGuideSent: !!input.shopGuide, fetched: asked.fetched });
    if (!checked.ok || !checked.answer.found) {
      const reason = checked.ok ? checked.answer.reason : checked.reason;
      await record("no_chart", reason);
      log(`lookup-chart: no_chart ${tag}: ${reason}`);
      return none(200, reason);
    }
    answer = checked.answer;
  } catch (e) {
    log(`lookup-chart: database error recording a miss ${tag}: ${message(e)}`);
    return none(500, "The lookup could not be stored.");
  }

  // f. store it.
  try {
    // Another shopper's lookup for the same brand may have landed while the model was reading.
    const landed = await storedChartFor(db, input, slug);
    if (landed) {
      await record("chart", "stored by a concurrent lookup");
      return json(200, { chart: landed, tier: landed.source_type, note: "Chart already stored." });
    }
    const chart = answer.chart;
    const brandId = await ensureBrand(db, input, slug, chart.source_type === "brand_site" ? new URL(chart.source_url).origin : null);
    const stored = await db.insertChart(chartRecord(brandId, chart, now.toISOString().slice(0, 10)));
    let rows: StoredRow[];
    try {
      rows = await db.insertRows(rowRecords(stored.id, chart));
    } catch (e) {
      await db.deleteChart(stored.id);
      throw e;
    }
    await record("chart", `${chart.source_type} ${chart.source_url}`);
    const served = toBundleChart({ ...stored, size_chart_rows: rows });
    log(`lookup-chart: stored ${tag} as ${chart.source_type}`);
    return json(200, { chart: served, tier: served.source_type, note: chart.note });
  } catch (e) {
    log(`lookup-chart: database error storing ${tag}: ${message(e)}`);
    try {
      await record("error", "the chart could not be stored");
    } catch (e2) {
      log(`lookup-chart: could not record the error ${tag}: ${message(e2)}`);
    }
    return none(500, "The lookup could not be stored.");
  }
}

// The brand's best usable stored chart for this kind of item, verified or machine-read.
async function storedChartFor(db: LookupDb, input: LookupInput, slug: string) {
  const brand = await db.findBrand(input.alias, slug);
  if (!brand) return null;
  const charts = await db.findCharts(brand.id, CHARTS_FOR[input.kind]);
  return pickBest(charts.map(toBundleChart), input.kind);
}

// The brand row the chart hangs off: an existing brand under this spelling or slug gains the spelling
// as an alias; otherwise a new brand is added. A concurrent insert of the same id is ignored and read back.
async function ensureBrand(db: LookupDb, input: LookupInput, slug: string, website: string | null): Promise<string> {
  let brand = await db.findBrand(input.alias, slug);
  if (!brand) {
    await db.insertBrand({ id: slug, name: input.brand, aliases: [input.alias], website });
    brand = await db.findBrand(input.alias, slug);
    if (!brand) throw new Error(`brand ${slug} missing after insert`);
  }
  if (!brand.aliases.includes(input.alias)) await db.setAliases(brand.id, [...brand.aliases, input.alias]);
  return brand.id;
}

// ---- the model call ------------------------------------------------------------------------

type ContentBlock = { type: string; name?: string; input?: unknown; content?: unknown };
type ModelMessage = { content?: ContentBlock[]; stop_reason?: string };

// Addresses the web_fetch tool actually retrieved in this reply. Failed fetches carry no url.
function fetchedUrls(content: ContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of content) {
    const c = b.content as { type?: string; url?: unknown } | undefined;
    if (b.type === "web_fetch_tool_result" && c?.type === "web_fetch_result" && typeof c.url === "string") out.push(c.url);
  }
  return out;
}

// One lookup: the model searches and reads with the web tools and answers through record_lookup.
// A paused server-tool turn is resent as it is. An answer left in prose gets one follow-up that
// forces the answer tool through tool_choice. Every page the model fetched along the way is
// returned with the answer, so a brand-site chart can be held to a page that was really read.
async function askModel(
  input: LookupInput,
  deps: Deps,
): Promise<{ ok: true; input: unknown; fetched: string[] } | { ok: false; reason: string }> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: userPrompt(input) }];
  let toolChoice: Record<string, string> = { type: "auto" };
  let forced = false;
  const fetched: string[] = [];

  for (let i = 0; i < MAX_MODEL_REQUESTS; i++) {
    let res: Response;
    try {
      res = await deps.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": deps.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages,
          tools: [...WEB_TOOLS, ANSWER_TOOL],
          tool_choice: toolChoice,
        }),
      });
    } catch {
      return { ok: false, reason: "model call failed (network)" };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, reason: `model call failed (HTTP ${res.status})` };
    }
    let msg: ModelMessage;
    try {
      msg = await res.json();
    } catch {
      return { ok: false, reason: "model reply was not JSON" };
    }
    const content = Array.isArray(msg.content) ? msg.content : [];
    fetched.push(...fetchedUrls(content));
    const call = content.find((b) => b.type === "tool_use" && b.name === ANSWER_TOOL_NAME);
    if (call) return { ok: true, input: call.input, fetched };
    if (msg.stop_reason === "refusal") return { ok: false, reason: "model declined the request" };

    messages.push({ role: "assistant", content });
    if (msg.stop_reason === "pause_turn") continue;
    if (forced) return { ok: false, reason: "model did not record an answer" };
    messages.push({ role: "user", content: FORCE_ANSWER });
    toolChoice = { type: "tool", name: ANSWER_TOOL_NAME };
    forced = true;
  }
  return { ok: false, reason: "model did not finish" };
}
