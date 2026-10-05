// read-chart-image: reads a shop's size chart image, and a product page's text, with Claude
// (fit-evidence HANDOFF §7). Two routes on one function:
//   POST /read-chart-image[/image]  { image_url, brand, kind, install } → { chart | null, note }
//     a. check the input              400 otherwise
//     b. the shared cache             a chart read from this image (by URL hash), or a no-chart marker younger than 30 days
//     c. the caps                     from the settings row, 40 per install and 2000 overall per day by default, 429 beyond
//     d. one vision call              the image by address, the answer through a strict tool
//     e. check the chart              parseGuideMatrix's rules; a failure leaves a no-chart marker
//     f. store and return it          the plan 1 §5 shape, machine_read, for a shop guide in a lookup
//   POST /read-chart-image/product  { title, headings, picker, install } → { brand, title, kind, sizes, fabric }
//     the same check and caps, one text call, nothing cached, nothing about the page stored.
//   POST /read-chart-image/measurements  { image_urls (1 to 4 Vinted photos), kind, install } → { measurements, note }
//     the same caps and ledger, one vision call, nothing cached, nothing about the listing stored; the
//     ledger row is a 'product' row (no address, brand or answer) with reason 'measurements', so no
//     migration is needed for it (fit-evidence HANDOFF §8).
// Written against injected clients so the tests never touch the network; index.ts wires the real ones.
import {
  answersFor,
  type ImageChart,
  type ImageInput,
  parseImageInput,
  parseProductAnswer,
  parseProductInput,
  type ProductInput,
  servedChart,
  urlHash,
  checkImageChart,
  validateImageAnswer,
} from "./chart.ts";
import {
  CHART_SYSTEM,
  CHART_TOOL,
  CHART_TOOL_NAME,
  chartUserContent,
  forceAnswer,
  MAX_TOKENS,
  MEASURE_SYSTEM,
  MEASURE_TOOL,
  MEASURE_TOOL_NAME,
  measureUserContent,
  MODEL,
  PRODUCT_SYSTEM,
  PRODUCT_TOOL,
  PRODUCT_TOOL_NAME,
  productUserContent,
} from "./prompt.ts";
import { parseMeasurementsAnswer, parseMeasurementsInput } from "./measurements.ts";

export interface CallRecord {
  route: "image" | "product";
  url_hash: string | null;
  image_url: string | null;
  brand: string | null;
  kind: string | null;
  install: string;
}

export type Outcome = "chart" | "no_chart" | "read" | "error";

export interface StoredRead {
  outcome: "chart" | "no_chart";
  chart: unknown;
  reason: string | null;
}

export interface ImageDb {
  // The newest chart read from this image, else the newest no-chart marker after noChartSince.
  cachedImage(urlHash: string, noChartSince: string): Promise<StoredRead | null>;
  capSettings(): Promise<{ per_install_per_day: number; global_per_day: number } | null>;
  countCalls(since: string, install?: string): Promise<number>;
  // The ledger row is written before the model is asked, so concurrent calls see each other in the caps.
  reserveCall(record: CallRecord): Promise<string>;
  finishCall(id: string, outcome: Outcome, reason: string | null, chart: ImageChart | null): Promise<void>;
  cancelCall(id: string): Promise<void>;
}

export interface Deps {
  db: ImageDb;
  fetch: typeof fetch;
  anthropicKey: string;
  now?: () => Date;
  log?: (line: string) => void;
}

export const DEFAULT_CAPS = { perInstallPerDay: 40, globalPerDay: 2000 };
export const NO_CHART_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const noChart = (status: number, note: string) => json(status, { chart: null, note });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function routeOf(req: Request): "image" | "product" | "measurements" | null {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (/\/read-chart-image(\/image)?$/.test(path)) return "image";
  if (/\/read-chart-image\/product$/.test(path)) return "product";
  if (/\/read-chart-image\/measurements$/.test(path)) return "measurements";
  return null;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const route = routeOf(req);
  if (!route) return json(404, { error: "Use /image, /product or /measurements." });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "The body is not JSON." });
  }
  if (route === "image") return await readImage(body, deps);
  return route === "product" ? await readProduct(body, deps) : await readMeasurements(body, deps);
}

// Takes a place in the ledger, then reads the counts, so calls landing at the same moment count each
// other; one over a cap gives its place back. Returns the place, or the refusal to send.
async function holdPlace(db: ImageDb, record: CallRecord, now: Date): Promise<{ id: string } | { refused: string }> {
  const settings = await db.capSettings();
  const perInstall = settings?.per_install_per_day ?? DEFAULT_CAPS.perInstallPerDay;
  const global = settings?.global_per_day ?? DEFAULT_CAPS.globalPerDay;
  const id = await db.reserveCall(record);
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  if (await db.countCalls(since, record.install) > perInstall) {
    await db.cancelCall(id);
    return { refused: "Too many reads from this install today." };
  }
  if (await db.countCalls(since) > global) {
    await db.cancelCall(id);
    return { refused: "Too many reads today." };
  }
  return { id };
}

// ---- the image route -------------------------------------------------------------------------

async function readImage(body: unknown, deps: Deps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const now = (deps.now ?? (() => new Date()))();
  const parsed = parseImageInput(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const input = parsed.input;
  const { db } = deps;
  const hash = await urlHash(input.image_url);
  const tag = `${hash.slice(0, 12)}/${input.kind}`;

  const serve = (chart: ImageChart, note: string) =>
    answersFor(chart, input.kind)
      ? json(200, { chart: servedChart(chart, input), note })
      : noChart(200, "The chart in this image is for another kind of item.");

  let held: string;
  try {
    const cached = await db.cachedImage(hash, new Date(now.getTime() - NO_CHART_DAYS * DAY_MS).toISOString());
    if (cached?.outcome === "chart") {
      const checked = checkImageChart(cached.chart);
      if ("chart" in checked) {
        log(`read-chart-image: cache hit ${tag}`);
        return serve(checked.chart, "Chart already read.");
      }
      log(`read-chart-image: stored chart unusable ${tag}: ${checked.reason}`);
    } else if (cached?.outcome === "no_chart") {
      log(`read-chart-image: no-chart marker ${tag}`);
      return noChart(200, cached.reason || "No size chart in the image.");
    }
    const place = await holdPlace(db, { route: "image", url_hash: hash, image_url: input.image_url, brand: input.brand, kind: input.kind, install: input.install }, now);
    if ("refused" in place) {
      log(`read-chart-image: cap ${tag}`);
      return noChart(429, place.refused);
    }
    held = place.id;
  } catch (e) {
    log(`read-chart-image: database error before the read ${tag}: ${message(e)}`);
    return noChart(500, "The image could not be read.");
  }

  const asked = await askModel(deps, CHART_SYSTEM, chartUserContent(input), CHART_TOOL, CHART_TOOL_NAME);
  try {
    if (!asked.ok) {
      log(`read-chart-image: model error ${tag}: ${asked.reason}`);
      await db.finishCall(held, "error", asked.reason, null);
      return noChart(502, "The image could not be read, try again later.");
    }
    const checked = validateImageAnswer(asked.input);
    if (!checked.ok || !checked.answer.found) {
      const reason = checked.ok ? checked.answer.reason : checked.reason;
      await db.finishCall(held, "no_chart", reason, null);
      log(`read-chart-image: no chart ${tag}: ${reason}`);
      return noChart(200, reason);
    }
    await db.finishCall(held, "chart", null, checked.answer.chart);
    log(`read-chart-image: stored ${tag}`);
    return serve(checked.answer.chart, checked.answer.chart.note);
  } catch (e) {
    log(`read-chart-image: database error after the read ${tag}: ${message(e)}`);
    return noChart(500, "The image could not be stored.");
  }
}

// ---- the product route -----------------------------------------------------------------------

async function readProduct(body: unknown, deps: Deps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const now = (deps.now ?? (() => new Date()))();
  const parsed = parseProductInput(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const input: ProductInput = parsed.input;
  const { db } = deps;

  let held: string;
  try {
    const place = await holdPlace(db, { route: "product", url_hash: null, image_url: null, brand: null, kind: null, install: input.install }, now);
    if ("refused" in place) {
      log("read-chart-image: product cap");
      return json(429, { error: place.refused });
    }
    held = place.id;
  } catch (e) {
    log(`read-chart-image: database error before the product read: ${message(e)}`);
    return json(500, { error: "The page could not be read." });
  }

  const asked = await askModel(deps, PRODUCT_SYSTEM, productUserContent(input), PRODUCT_TOOL, PRODUCT_TOOL_NAME);
  const answer = asked.ok ? parseProductAnswer(asked.input) : null;
  try {
    if (!answer) {
      const reason = asked.ok ? "the answer was not usable" : asked.reason;
      log(`read-chart-image: product error: ${reason}`);
      await db.finishCall(held, "error", reason, null);
      return json(502, { error: "The page could not be read, try again later." });
    }
    await db.finishCall(held, "read", null, null);
    log("read-chart-image: product read");
    return json(200, answer);
  } catch (e) {
    log(`read-chart-image: database error after the product read: ${message(e)}`);
    return json(500, { error: "The page could not be read." });
  }
}

// ---- the measurements route ------------------------------------------------------------------

const MEASUREMENTS = "measurements";

// A Vinted listing's photos, read on the shopper's click. Same caps and ledger as the other routes;
// the ledger row is a product-shaped row (install and outcome only) marked 'measurements' in reason.
// Nothing is cached and no photo address is stored or logged.
async function readMeasurements(body: unknown, deps: Deps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const now = (deps.now ?? (() => new Date()))();
  const parsed = parseMeasurementsInput(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const input = parsed.input;
  const { db } = deps;
  const tag = `${input.kind}, ${input.image_urls.length} photo${input.image_urls.length === 1 ? "" : "s"}`;

  let held: string;
  try {
    const place = await holdPlace(db, { route: "product", url_hash: null, image_url: null, brand: null, kind: null, install: input.install }, now);
    if ("refused" in place) {
      log(`read-chart-image: measurements cap ${tag}`);
      return json(429, { error: place.refused });
    }
    held = place.id;
  } catch (e) {
    log(`read-chart-image: database error before the measurements read: ${message(e)}`);
    return json(500, { error: "The photos could not be read." });
  }

  const asked = await askModel(deps, MEASURE_SYSTEM, measureUserContent(input), MEASURE_TOOL, MEASURE_TOOL_NAME);
  const answer = asked.ok ? parseMeasurementsAnswer(asked.input) : null;
  try {
    if (!answer) {
      const reason = asked.ok ? "the answer was not usable" : asked.reason;
      log(`read-chart-image: measurements error ${tag}: ${reason}`);
      await db.finishCall(held, "error", `${MEASUREMENTS}: ${reason}`, null);
      return json(502, { error: "The photos could not be read, try again later." });
    }
    await db.finishCall(held, "read", MEASUREMENTS, null);
    log(`read-chart-image: measurements read ${tag}: ${Object.keys(answer.measurements).length} found`);
    return json(200, answer);
  } catch (e) {
    log(`read-chart-image: database error after the measurements read: ${message(e)}`);
    return json(500, { error: "The photos could not be read." });
  }
}

// ---- the model call ------------------------------------------------------------------------

type ContentBlock = { type: string; name?: string; input?: unknown };
type ModelMessage = { content?: ContentBlock[]; stop_reason?: string };

// One read: the model answers through the tool. An answer left in prose gets one follow-up that
// forces the tool through tool_choice, as lookup-chart does.
async function askModel(
  deps: Deps,
  system: string,
  content: unknown,
  tool: unknown,
  toolName: string,
): Promise<{ ok: true; input: unknown } | { ok: false; reason: string }> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content }];
  let toolChoice: Record<string, string> = { type: "auto" };
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": deps.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages, tools: [tool], tool_choice: toolChoice }),
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
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    const call = blocks.find((b) => b.type === "tool_use" && b.name === toolName);
    if (call) return { ok: true, input: call.input };
    if (msg.stop_reason === "refusal") return { ok: false, reason: "model declined the request" };
    if (blocks.length) messages.push({ role: "assistant", content: blocks });
    messages.push({ role: "user", content: forceAnswer(toolName) });
    toolChoice = { type: "tool", name: toolName };
  }
  return { ok: false, reason: "model did not record an answer" };
}
