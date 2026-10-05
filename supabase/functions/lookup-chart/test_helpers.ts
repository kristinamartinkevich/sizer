// Shared fixtures for the lookup-chart tests: an in-memory database and a scripted Anthropic endpoint.
// Nothing here touches the network.
import type { BrandRecord, LookupDb, LookupRecord, StoredChart, StoredRow } from "./handler.ts";

export const INSTALL = "3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64";
export const SERVICE_KEY = "service-role-key-for-tests-only";
export const ANTHROPIC_KEY = "anthropic-key-for-tests-only";
export const NOW = new Date("2026-10-05T12:00:00Z");

export function lookupRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/lookup-chart", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

export const DRESS_BODY = { brand: "Helsa", kind: "dresses", shop: "www.revolveclothing.fr", install: INSTALL };

// A shop size-guide table as src/guide-table.js reads it (HANDOFF §6), the page address included,
// which the function must never forward.
export function shopGuide(mentionsBrand: boolean) {
  return {
    caption: mentionsBrand ? "Helsa size guide" : "Size guide",
    charts: [{
      category: "general",
      unit: "in",
      measurement_basis: "body",
      size_system: "letter",
      source_url: "https://www.revolveclothing.fr/helsa-dress/dp/HELS-WD1/",
      source_type: null,
      retailer: null,
      mentions_brand: mentionsBrand,
      rows: [
        { label: "XS", bust: [31, 32], waist: [24, 25], hip: [34, 35] },
        { label: "S", bust: [33, 34], waist: [26, 27], hip: [36, 37] },
        { label: "M", bust: [35, 36], waist: [28, 29], hip: [38, 39] },
      ],
      note: null,
    }],
  };
}

export function brandChart(overrides: Record<string, unknown> = {}) {
  return {
    category: "dresses",
    unit: "cm",
    measurement_basis: "body",
    size_system: "letter",
    source_url: "https://helsastudio.com/pages/size-guide",
    source_type: "brand_site",
    retailer: null,
    mentions_brand: true,
    rows: [
      { label: "XS", waist: [62, 66], hip: [88, 92], bust: [80, 84], foot_length: null, aliases: { us: "2", uk: "6", eu: "34", it: null, fr: null, letter: null } },
      { label: "S", waist: [66, 70], hip: [92, 96], bust: [84, 88], foot_length: null, aliases: { us: "4", uk: "8", eu: "36", it: null, fr: null, letter: null } },
      { label: "M", waist: [70, 74], hip: [96, 100], bust: [88, 92], foot_length: null, aliases: { us: "6", uk: "10", eu: "38", it: null, fr: null, letter: null } },
    ],
    note: "Size guide on helsastudio.com, the brand's own site.",
    ...overrides,
  };
}

export function retailerChart(mentionsBrand: boolean) {
  return brandChart({
    category: "general",
    unit: "in",
    source_url: "https://www.revolveclothing.fr/r/sizeguide",
    source_type: mentionsBrand ? "retailer_brand_chart" : "retailer_house_chart",
    retailer: "revolve.com",
    mentions_brand: mentionsBrand,
    rows: [
      { label: "XS", waist: [24, 25], hip: [34, 35], bust: [31, 32], foot_length: null, aliases: { us: null, uk: null, eu: null, it: null, fr: null, letter: null } },
      { label: "S", waist: [26, 27], hip: [36, 37], bust: [33, 34], foot_length: null, aliases: { us: null, uk: null, eu: null, it: null, fr: null, letter: null } },
      { label: "M", waist: [28, 29], hip: [38, 39], bust: [35, 36], foot_length: null, aliases: { us: null, uk: null, eu: null, it: null, fr: null, letter: null } },
    ],
    note: mentionsBrand ? "The shop's table is headed Helsa size guide." : "The shop's general size guide, no brand named.",
  });
}

// ---- the scripted Anthropic endpoint ---------------------------------------------------------

export interface ModelReply { status?: number; body?: unknown; throws?: boolean }

// A successful web_fetch server-tool result, as the Messages API returns it in the assistant content.
export function fetched(url: string) {
  return {
    type: "web_fetch_tool_result",
    tool_use_id: "srvtoolu_test",
    content: { type: "web_fetch_result", url, retrieved_at: "2026-10-05T11:59:00Z", content: { type: "document", source: { type: "text", media_type: "text/plain", data: "Size guide" } } },
  };
}

// The model's final answer. A brand-site chart is only accepted for a page the model fetched, so unless
// `extra` is given the reply carries a fetch of the chart's own address; pass `[]` to leave it out.
export function answerMessage(input: unknown, extra?: unknown[]) {
  // deno-lint-ignore no-explicit-any
  const chart = (input as any)?.chart;
  if (!extra) extra = chart?.source_type === "brand_site" && typeof chart.source_url === "string" ? [fetched(chart.source_url)] : [];
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [
      ...extra,
      { type: "tool_use", id: "toolu_test", name: "record_lookup", input },
    ],
    stop_reason: "tool_use",
  };
}

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

export class FakeDb implements LookupDb {
  brands: BrandRecord[] = [];
  charts: StoredChart[] = [];
  lookups: (LookupRecord & { created_at: string; id?: string })[] = [];
  calls: string[] = [];
  failOn: string | null = null;
  private seq = 0;

  private hit(op: string) {
    this.calls.push(op);
    if (this.failOn === op) throw new Error(`${op} failed: HTTP 500 boom`);
  }

  findBrand(alias: string, slug: string): Promise<BrandRecord | null> {
    this.hit("findBrand");
    return Promise.resolve(this.brands.find((b) => b.aliases.includes(alias)) ?? this.brands.find((b) => b.id === slug) ?? null);
  }

  findCharts(brandId: string, categories: readonly string[]): Promise<StoredChart[]> {
    this.hit("findCharts");
    return Promise.resolve(structuredClone(this.charts.filter((c) =>
      c.brand_id === brandId && categories.includes(c.category) && (c.status === "verified" || c.status === "machine_read")
    )));
  }

  latestNoChart(brand: string, kind: string, since: string): Promise<{ reason: string | null } | null> {
    this.hit("latestNoChart");
    const found = this.lookups
      .filter((l) => l.brand === brand && l.kind === kind && l.outcome === "no_chart" && l.created_at > since)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return Promise.resolve(found ? { reason: found.reason } : null);
  }

  countLookups(since: string, install?: string): Promise<number> {
    this.hit(install ? "countInstall" : "countGlobal");
    return Promise.resolve(this.lookups.filter((l) => l.created_at > since && (!install || l.install === install)).length);
  }

  insertBrand(brand: BrandRecord): Promise<void> {
    this.hit("insertBrand");
    if (!this.brands.some((b) => b.id === brand.id)) this.brands.push(structuredClone(brand));
    return Promise.resolve();
  }

  setAliases(id: string, aliases: string[]): Promise<void> {
    this.hit("setAliases");
    const b = this.brands.find((x) => x.id === id);
    if (b) b.aliases = [...aliases];
    return Promise.resolve();
  }

  insertChart(record: Record<string, unknown>): Promise<StoredChart> {
    this.hit("insertChart");
    const row = {
      id: `chart-${++this.seq}`, gender: "women", fit_line: null, source_archive_url: null, fit_advice: null,
      ...record, size_chart_rows: [],
    } as unknown as StoredChart;
    this.charts.push(row);
    const { size_chart_rows: _rows, ...bare } = structuredClone(row);
    return Promise.resolve(bare as StoredChart);
  }

  insertRows(rows: Record<string, unknown>[]): Promise<StoredRow[]> {
    this.hit("insertRows");
    const stored = rows.map((r) => ({
      id: `row-${++this.seq}`, bust_min: null, bust_max: null, waist_min: null, waist_max: null, hip_min: null, hip_max: null,
      inseam_min: null, inseam_max: null, foot_length_min: null, foot_length_max: null, extra: {}, suspect: false, suspect_note: null,
      ...r,
    })) as unknown as StoredRow[];
    for (const r of stored) this.charts.find((c) => c.id === r.chart_id)?.size_chart_rows.push(r);
    return Promise.resolve(structuredClone(stored));
  }

  deleteChart(id: string): Promise<void> {
    this.hit("deleteChart");
    this.charts = this.charts.filter((c) => c.id !== id);
    return Promise.resolve();
  }

  async reserveLookup(record: Omit<LookupRecord, "outcome" | "reason">): Promise<string> {
    this.hit("reserveLookup");
    await Promise.resolve();
    const id = `lookup-${++this.seq}`;
    this.lookups.push({ ...record, outcome: "pending", reason: null, created_at: NOW.toISOString(), id });
    return id;
  }

  finishLookup(id: string, outcome: LookupRecord["outcome"], reason: string | null): Promise<void> {
    this.hit("finishLookup");
    const row = this.lookups.find((l) => l.id === id);
    if (row) Object.assign(row, { outcome, reason });
    return Promise.resolve();
  }

  cancelLookup(id: string): Promise<void> {
    this.hit("cancelLookup");
    this.lookups = this.lookups.filter((l) => l.id !== id);
    return Promise.resolve();
  }
}

// A verified chart already in the shared store, in the shape PostgREST returns for
// size_charts?select=*,size_chart_rows(*).
export function storedChart(overrides: Partial<StoredChart> = {}): StoredChart {
  const id = overrides.id ?? "stored-1";
  const row = (position: number, label: string, waist: number, hip: number): StoredRow => ({
    id: `${id}-r${position}`, chart_id: id, position, label, aliases: {},
    bust_min: null, bust_max: null, waist_min: waist, waist_max: waist + 4, hip_min: hip, hip_max: hip + 4,
    inseam_min: null, inseam_max: null, foot_length_min: null, foot_length_max: null, extra: {}, suspect: false, suspect_note: null,
  });
  return {
    id, brand_id: "helsa", gender: "women", category: "dresses", fit_line: null, measurement_basis: "body", unit: "cm",
    size_system: "letter", source_url: "https://helsastudio.com/pages/size-guide", source_archive_url: null,
    source_type: "brand_site", retailer: null, status: "verified", read_by: null, retrieved_on: "2026-09-12", fit_advice: null,
    size_chart_rows: [row(0, "XS", 62, 88), row(1, "S", 66, 92), row(2, "M", 70, 96)],
    ...overrides,
  };
}

export function collectLogs() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}
