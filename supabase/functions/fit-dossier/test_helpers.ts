// Shared fixtures for the fit-dossier tests: an in-memory database and a scripted Anthropic endpoint.
// Nothing here touches the network.
import type { Caps, DossierDb, RequestRecord, StoredDossier } from "./handler.ts";

export const INSTALL = "3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64";
export const SERVICE_KEY = "service-role-key-for-tests-only";
export const ANTHROPIC_KEY = "anthropic-key-for-tests-only";
export const NOW = new Date("2026-10-05T12:00:00Z");

export const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

export function dossierRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/fit-dossier", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

export const BODY = {
  item_key: "helsa|wd1",
  brand: "Helsa",
  style: "WD1",
  kind: "dresses",
  shop: "www.revolveclothing.fr",
  install: INSTALL,
  tallies: { small: 3, large: 0, tts: 5, total: 9, areas: { bust: { tight: 2 }, length: 1 } },
};

export const REVIEW_URL = "https://www.revolveclothing.fr/helsa-wrap-dress/dp/HELS-WD1/";
export const BLOG_URL = "https://fitnotes.example.com/2026/helsa-sizing";

// A model answer in the record_dossier schema, citing the two pages above.
export function dossierAnswer(overrides: Record<string, unknown> = {}) {
  return {
    verdict: "small",
    strength: 0.7,
    areas: [{ area: "bust", direction: "tight", note: "Several buyers say the bodice is snug across the bust." }],
    brand_note: "Helsa is often said to cut slim through the bodice.",
    sources: [
      { url: REVIEW_URL, title: "Helsa wrap dress reviews" },
      { url: BLOG_URL, title: "Helsa sizing notes" },
    ],
    ...overrides,
  };
}

// ---- the scripted Anthropic endpoint ---------------------------------------------------------

export interface ModelReply { status?: number; body?: unknown; throws?: boolean }

// A web_search server-tool result, as the Messages API returns it in the assistant content.
export function searched(urls: string[]) {
  return {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_test",
    content: urls.map((url) => ({ type: "web_search_result", url, title: "Result", encrypted_content: "opaque", page_age: null })),
  };
}

// The model's final answer. Unless `extra` is given, the reply carries a search result for every
// source the answer cites, so provenance holds; pass `[]` to leave the search out.
export function answerMessage(input: unknown, extra?: unknown[]) {
  // deno-lint-ignore no-explicit-any
  const sources = (input as any)?.sources;
  if (!extra) extra = Array.isArray(sources) && sources.length ? [searched(sources.map((s: { url: string }) => s.url))] : [];
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [...extra, { type: "tool_use", id: "toolu_test", name: "record_dossier", input }],
    stop_reason: "tool_use",
  };
}

export function textMessage(text: string, stopReason = "end_turn", extra: unknown[] = []) {
  return {
    id: "msg_text",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [...extra, { type: "text", text }],
    stop_reason: stopReason,
  };
}

export function scriptedFetch(replies: ModelReply[]) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const queue = [...replies];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    await Promise.resolve();
    const url = String(input instanceof Request ? input.url : input);
    requests.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? "{}")) });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    if (next.throws) throw new TypeError("network down");
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: fetchFn, requests, remaining: () => queue.length };
}

// ---- the in-memory database ------------------------------------------------------------------

export class FakeDb implements DossierDb {
  dossiers: StoredDossier[] = [];
  requests: (RequestRecord & { created_at: string; id?: string })[] = [];
  caps: Caps | null = { perInstallPerDay: 40, globalPerDay: 2000 };
  calls: string[] = [];
  failOn: string | null = null;
  private seq = 0;

  private hit(op: string) {
    this.calls.push(op);
    if (this.failOn === op) throw new Error(`${op} failed: HTTP 500 boom`);
  }

  findDossier(itemKey: string, since: string): Promise<StoredDossier | null> {
    this.hit("findDossier");
    return Promise.resolve(structuredClone(this.dossiers.find((d) => d.item_key === itemKey && d.created_at > since) ?? null));
  }

  readCaps(): Promise<Caps | null> {
    this.hit("readCaps");
    return Promise.resolve(this.caps ? { ...this.caps } : null);
  }

  async reserveRequest(record: Omit<RequestRecord, "outcome" | "reason">): Promise<string> {
    this.hit("reserveRequest");
    await Promise.resolve();
    const id = `request-${++this.seq}`;
    this.requests.push({ ...record, outcome: "pending", reason: null, created_at: NOW.toISOString(), id });
    return id;
  }

  countRequests(since: string, install?: string): Promise<number> {
    this.hit(install ? "countInstall" : "countGlobal");
    return Promise.resolve(this.requests.filter((r) => r.created_at > since && (!install || r.install === install)).length);
  }

  finishRequest(id: string, outcome: RequestRecord["outcome"], reason: string | null): Promise<void> {
    this.hit("finishRequest");
    const row = this.requests.find((r) => r.id === id);
    if (row) Object.assign(row, { outcome, reason });
    return Promise.resolve();
  }

  cancelRequest(id: string): Promise<void> {
    this.hit("cancelRequest");
    this.requests = this.requests.filter((r) => r.id !== id);
    return Promise.resolve();
  }

  saveDossier(record: Record<string, unknown>): Promise<StoredDossier> {
    this.hit("saveDossier");
    const row = structuredClone(record) as unknown as StoredDossier & Record<string, unknown>;
    this.dossiers = this.dossiers.filter((d) => d.item_key !== row.item_key);
    this.dossiers.push(row);
    const { brand: _b, style: _s, kind: _k, ...pub } = row;
    return Promise.resolve(structuredClone(pub) as StoredDossier);
  }
}

export function storedDossier(overrides: Partial<StoredDossier> = {}): StoredDossier {
  return {
    item_key: "helsa|wd1",
    verdict: "small",
    strength: 0.7,
    areas: [{ area: "bust", direction: "tight", note: "Snug across the bust." }],
    brand_note: null,
    sources: [{ url: REVIEW_URL, title: "Helsa wrap dress reviews" }],
    created_at: ago(3),
    ...overrides,
  };
}

export function collectLogs() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}
