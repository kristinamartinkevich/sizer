// Shared fixtures for the read-chart-image tests: an in-memory database and a scripted Anthropic endpoint.
// Nothing here touches the network.
import type { CallRecord, ImageDb, StoredRead } from "./handler.ts";

export const INSTALL = "3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64";
export const SERVICE_KEY = "service-role-key-for-tests-only";
export const ANTHROPIC_KEY = "anthropic-key-for-tests-only";
export const NOW = new Date("2026-10-05T12:00:00Z");
export const IMAGE_URL = "https://cdn.lune-atelier.example/files/size-chart-women.png?v=3";

export function imageRequest(body: unknown, method = "POST", path = "/read-chart-image"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

export const productRequest = (body: unknown) => imageRequest(body, "POST", "/read-chart-image/product");

export const IMAGE_BODY = { image_url: IMAGE_URL, brand: "Lune Atelier", kind: "dresses", install: INSTALL };

export const PRODUCT_BODY = {
  title: "Bias silk midi skirt",
  headings: ["Bias silk midi skirt", "Details", "Size and fit"],
  picker: "Size XS S M L XL Sold out: S",
  install: INSTALL,
};

const none = { us: null, uk: null, eu: null, it: null, fr: null, letter: null };

// What the model records for a women's size chart image, in the read tool's schema.
export function imageChart(overrides: Record<string, unknown> = {}) {
  return {
    category: "general",
    unit: "cm",
    measurement_basis: "body",
    size_system: "letter",
    heading: "Lune Atelier size guide",
    brands_named: ["Lune Atelier"],
    rows: [
      { label: "XS", waist: [62, 66], hip: [88, 92], bust: [80, 84], foot_length: null, aliases: { ...none, fr: "34" } },
      { label: "S", waist: [66, 70], hip: [92, 96], bust: [84, 88], foot_length: null, aliases: { ...none, fr: "36" } },
      { label: "M", waist: [70, 74], hip: [96, 100], bust: [88, 92], foot_length: null, aliases: { ...none, fr: "38" } },
    ],
    note: "A three-row women's chart in cm, headed Lune Atelier size guide.",
    ...overrides,
  };
}

export function shoeChart() {
  return imageChart({
    category: "shoes",
    size_system: "eu",
    heading: "Shoe size chart",
    brands_named: [],
    rows: [
      { label: "37", waist: null, hip: null, bust: null, foot_length: [23.5, 23.5], aliases: none },
      { label: "38", waist: null, hip: null, bust: null, foot_length: [24.1, 24.1], aliases: none },
      { label: "39", waist: null, hip: null, bust: null, foot_length: [24.8, 24.8], aliases: none },
    ],
    note: "EU shoe sizes with foot length.",
  });
}

export const found = (chart: unknown, tableType = "size_chart") => ({ found: true, reason: "", table_type: tableType, chart });
export const notFound = (reason: string, tableType = "other") => ({ found: false, reason, table_type: tableType, chart: null });

export const productAnswer = (over: Record<string, unknown> = {}) => ({
  brand: "Lune Atelier",
  title: "Bias silk midi skirt",
  kind: "bottoms",
  sizes: ["XS", "S", "M", "L", "XL"],
  fabric: "100% silk",
  ...over,
});

// ---- the scripted Anthropic endpoint ---------------------------------------------------------

export interface ModelReply { status?: number; body?: unknown; throws?: boolean }

export function toolMessage(name: string, input: unknown) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "tool_use", id: "toolu_test", name, input }],
    stop_reason: "tool_use",
  };
}

export const chartMessage = (input: unknown) => toolMessage("record_chart", input);
export const productMessage = (input: unknown) => toolMessage("record_product", input);

export function textMessage(text: string, stopReason = "end_turn") {
  return { id: "msg_text", type: "message", role: "assistant", model: "claude-sonnet-5", content: [{ type: "text", text }], stop_reason: stopReason };
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

export type Row = CallRecord & { id: string; outcome: string; reason: string | null; chart: unknown; created_at: string };

export class FakeDb implements ImageDb {
  rows: Row[] = [];
  settings: { per_install_per_day: number; global_per_day: number } | null = { per_install_per_day: 40, global_per_day: 2000 };
  calls: string[] = [];
  failOn: string | null = null;
  private seq = 0;

  private hit(op: string) {
    this.calls.push(op);
    if (this.failOn === op) throw new Error(`${op} failed: HTTP 500 boom`);
  }

  cachedImage(urlHash: string, noChartSince: string): Promise<StoredRead | null> {
    this.hit("cachedImage");
    const usable = this.rows
      .filter((r) => r.route === "image" && r.url_hash === urlHash && (r.outcome === "chart" || (r.outcome === "no_chart" && r.created_at > noChartSince)))
      .sort((a, b) => a.outcome.localeCompare(b.outcome) || b.created_at.localeCompare(a.created_at));
    const r = usable[0];
    return Promise.resolve(r ? structuredClone({ outcome: r.outcome as "chart" | "no_chart", chart: r.chart, reason: r.reason }) : null);
  }

  capSettings() {
    this.hit("capSettings");
    return Promise.resolve(this.settings ? { ...this.settings } : null);
  }

  countCalls(since: string, install?: string): Promise<number> {
    this.hit(install ? "countInstall" : "countGlobal");
    return Promise.resolve(this.rows.filter((r) => r.created_at > since && (!install || r.install === install)).length);
  }

  async reserveCall(record: CallRecord): Promise<string> {
    this.hit("reserveCall");
    await Promise.resolve();
    const id = `call-${++this.seq}`;
    this.rows.push({ ...structuredClone(record), id, outcome: "pending", reason: null, chart: null, created_at: NOW.toISOString() });
    return id;
  }

  finishCall(id: string, outcome: string, reason: string | null, chart: unknown): Promise<void> {
    this.hit("finishCall");
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, { outcome, reason, chart: chart ?? null });
    return Promise.resolve();
  }

  cancelCall(id: string): Promise<void> {
    this.hit("cancelCall");
    this.rows = this.rows.filter((r) => r.id !== id);
    return Promise.resolve();
  }

  // A row as an earlier call left it.
  seed(row: Partial<Row>) {
    this.rows.push({
      id: `seed-${++this.seq}`, route: "image", url_hash: null, image_url: null, brand: null, kind: null, install: INSTALL,
      outcome: "chart", reason: null, chart: null, created_at: NOW.toISOString(), ...row,
    } as Row);
  }
}

export function collectLogs() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}
