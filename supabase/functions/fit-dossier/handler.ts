// fit-dossier: what people say about how one item fits, gathered once and cached for everyone
// (fit-evidence HANDOFF §6).
// POST { item_key, brand, style, kind, shop, install, tallies } → { dossier } | { dossier: null }
//   a. check the input             400 otherwise
//   b. the shared cache            a dossier for this item younger than 30 days, no model call
//   c. the caps                    per install and overall per day, from fit_dossier_settings; 429 beyond
//   d. one model call              web search for reviews, blogs and the brand's fit reputation
//   e. check the answer            every source must be a page a search returned; no source, no verdict
//   f. store and return it         an empty dossier is stored too, and answered as { dossier: null }
// Every error is non-200 and stores nothing, so neither the function nor the client caches it.
// Written against injected clients so the tests never touch the network; index.ts wires the real ones.
import { checkAnswer, type Dossier, type DossierInput, isEmpty, parseDossierInput } from "./dossier.ts";
import { ANSWER_TOOL, ANSWER_TOOL_NAME, FORCE_ANSWER, MAX_TOKENS, MODEL, SYSTEM_PROMPT, userPrompt, WEB_TOOLS } from "./prompt.ts";

// One row of fit_dossier_public: what the function returns and the client caches.
export interface StoredDossier extends Dossier {
  item_key: string;
  created_at: string;
}

export interface Caps { perInstallPerDay: number; globalPerDay: number }

export interface RequestRecord {
  item_key: string;
  brand: string;
  kind: string;
  shop: string;
  install: string;
  outcome: "pending" | "dossier" | "empty" | "error";
  reason: string | null;
}

export interface DossierDb {
  findDossier(itemKey: string, since: string): Promise<StoredDossier | null>;
  readCaps(): Promise<Caps | null>;
  // The ledger row is written before the model is asked, so concurrent requests see each other in the caps.
  reserveRequest(record: Omit<RequestRecord, "outcome" | "reason">): Promise<string>;
  countRequests(since: string, install?: string): Promise<number>;
  finishRequest(id: string, outcome: Exclude<RequestRecord["outcome"], "pending">, reason: string | null): Promise<void>;
  cancelRequest(id: string): Promise<void>;
  saveDossier(record: Record<string, unknown>): Promise<StoredDossier>;
}

export interface Deps {
  db: DossierDb;
  fetch: typeof fetch;
  anthropicKey: string;
  now?: () => Date;
  log?: (line: string) => void;
}

// Used only when the settings row is missing; the migration seeds the same numbers.
export const DEFAULT_CAPS: Caps = { perInstallPerDay: 40, globalPerDay: 2000 };
export const CACHE_DAYS = 30;
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

const failure = (status: number, error: string) => json(status, { dossier: null, error });
const answer = (d: StoredDossier) => json(200, { dossier: isEmpty(d) ? null : d });
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
  const parsed = parseDossierInput(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const input = parsed.input;
  const tag = input.item_key;
  const { db } = deps;

  let held = "";
  const record = async (outcome: Exclude<RequestRecord["outcome"], "pending">, reason: string | null) => {
    await db.finishRequest(held, outcome, reason);
  };

  // b. the shared cache, then c. the caps. The place in the ledger is taken first and the counts read
  // after, so requests landing at the same moment count each other; one over a cap gives its place back.
  try {
    const cached = await db.findDossier(input.item_key, new Date(now.getTime() - CACHE_DAYS * DAY_MS).toISOString());
    if (cached) {
      log(`fit-dossier: cache hit ${tag}`);
      return answer(cached);
    }
    const caps = (await db.readCaps()) ?? DEFAULT_CAPS;
    held = await db.reserveRequest({ item_key: input.item_key, brand: input.brand, kind: input.kind, shop: input.shop, install: input.install });
    const since = new Date(now.getTime() - DAY_MS).toISOString();
    if (await db.countRequests(since, input.install) > caps.perInstallPerDay) {
      await db.cancelRequest(held);
      log(`fit-dossier: install cap ${tag}`);
      return failure(429, "Too many fit checks from this install today.");
    }
    if (await db.countRequests(since) > caps.globalPerDay) {
      await db.cancelRequest(held);
      log(`fit-dossier: global cap ${tag}`);
      return failure(429, "Too many fit checks today.");
    }
  } catch (e) {
    log(`fit-dossier: database error before the model call ${tag}: ${message(e)}`);
    return failure(500, "The fit check could not run.");
  }

  // d. the model, then e. its answer checked.
  const asked = await askModel(input, deps);
  const checked = asked.ok ? checkAnswer(asked.input, asked.searched) : asked;
  if (!checked.ok) {
    log(`fit-dossier: model error ${tag}: ${checked.reason}`);
    try {
      await record("error", checked.reason);
    } catch (e) {
      log(`fit-dossier: could not record the error ${tag}: ${message(e)}`);
    }
    return failure(502, "The fit check failed, try again later.");
  }

  // f. store it. An item asked again after 30 days replaces its old row.
  try {
    const d = checked.dossier;
    const stored = await db.saveDossier({
      item_key: input.item_key,
      brand: input.brand,
      style: input.style,
      kind: input.kind,
      verdict: d.verdict,
      strength: d.strength,
      areas: d.areas,
      brand_note: d.brand_note,
      sources: d.sources,
      created_at: now.toISOString(),
    });
    const empty = isEmpty(stored);
    await record(empty ? "empty" : "dossier", `${d.verdict ?? "no verdict"}, ${d.sources.length} sources`);
    log(`fit-dossier: stored ${tag} (${d.verdict ?? "no verdict"}, ${d.sources.length} sources)`);
    return answer(stored);
  } catch (e) {
    log(`fit-dossier: database error storing ${tag}: ${message(e)}`);
    try {
      await record("error", "the dossier could not be stored");
    } catch (e2) {
      log(`fit-dossier: could not record the error ${tag}: ${message(e2)}`);
    }
    return failure(500, "The fit check could not be stored.");
  }
}

// ---- the model call ------------------------------------------------------------------------

type ContentBlock = { type: string; name?: string; input?: unknown; content?: unknown };
type ModelMessage = { content?: ContentBlock[]; stop_reason?: string };

// Addresses the web_search tool actually returned in this reply. A failed search carries an error
// object instead of a list, and gives nothing.
function searchedUrls(content: ContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of content) {
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: unknown }[]) {
      if (r?.type === "web_search_result" && typeof r.url === "string") out.push(r.url);
    }
  }
  return out;
}

// One call: the model searches and answers through record_dossier. A paused server-tool turn is
// resent as it is. An answer left in prose gets one follow-up that forces the answer tool. Every
// address a search returned along the way is returned with the answer, for the provenance check.
async function askModel(
  input: DossierInput,
  deps: Deps,
): Promise<{ ok: true; input: unknown; searched: string[] } | { ok: false; reason: string }> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: userPrompt(input) }];
  let toolChoice: Record<string, string> = { type: "auto" };
  let forced = false;
  const searched: string[] = [];

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
    searched.push(...searchedUrls(content));
    const call = content.find((b) => b.type === "tool_use" && b.name === ANSWER_TOOL_NAME);
    if (call) return { ok: true, input: call.input, searched };
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
