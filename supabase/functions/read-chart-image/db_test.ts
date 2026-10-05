import assert from "node:assert/strict";
import { restDb } from "./db.ts";
import { INSTALL, SERVICE_KEY } from "./test_helpers.ts";

const BASE = "https://project.supabase.co";
const HASH = "a".repeat(64);

function recorder(replies: { status?: number; body?: unknown; headers?: Record<string, string> }[]) {
  const seen: { method: string; url: URL; headers: Headers; body: unknown }[] = [];
  const queue = [...replies];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    await Promise.resolve();
    seen.push({ method: init?.method ?? "GET", url: new URL(String(input)), headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = queue.shift() ?? {};
    const status = r.status ?? 200;
    const body = status === 204 || r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(body, { status, headers: r.headers });
  }) as typeof fetch;
  return { f, seen };
}

Deno.test("cachedImage asks chart_images for this hash: any chart, or a no-chart marker after the date, chart first", async () => {
  const { f, seen } = recorder([{ body: [{ outcome: "chart", chart: { category: "general" }, reason: null }] }]);
  const got = await restDb(BASE, SERVICE_KEY, f).cachedImage(HASH, "2026-09-05T12:00:00.000Z");
  assert.deepEqual(got, { outcome: "chart", chart: { category: "general" }, reason: null });
  const [r] = seen;
  assert.equal(r.url.pathname, "/rest/v1/chart_images");
  assert.equal(r.headers.get("apikey"), SERVICE_KEY);
  assert.equal(r.headers.get("authorization"), `Bearer ${SERVICE_KEY}`);
  const p = r.url.searchParams;
  assert.equal(p.get("url_hash"), `eq.${HASH}`);
  assert.equal(p.get("route"), "eq.image");
  assert.equal(p.get("or"), "(outcome.eq.chart,and(outcome.eq.no_chart,created_at.gt.2026-09-05T12:00:00.000Z))");
  assert.equal(p.get("order"), "outcome.asc,created_at.desc");
  assert.equal(p.get("limit"), "1");

  const empty = recorder([{ body: [] }]);
  assert.equal(await restDb(BASE, SERVICE_KEY, empty.f).cachedImage(HASH, "2026-09-05T12:00:00.000Z"), null);
});

Deno.test("capSettings reads the one settings row, or null when it is missing", async () => {
  const { f, seen } = recorder([{ body: [{ per_install_per_day: 40, global_per_day: 2000 }] }, { body: [] }]);
  const db = restDb(BASE, SERVICE_KEY, f);
  assert.deepEqual(await db.capSettings(), { per_install_per_day: 40, global_per_day: 2000 });
  assert.equal(await db.capSettings(), null);
  assert.equal(seen[0].url.pathname, "/rest/v1/chart_image_settings");
  assert.equal(seen[0].url.searchParams.get("select"), "per_install_per_day,global_per_day");
});

Deno.test("countCalls reads the exact count from Content-Range, for one install or for everyone", async () => {
  const { f, seen } = recorder([{ headers: { "content-range": "*/7" } }, { status: 206, headers: { "content-range": "0-0/1999" } }, { headers: {} }]);
  const db = restDb(BASE, SERVICE_KEY, f);
  assert.equal(await db.countCalls("2026-10-04T12:00:00.000Z", INSTALL), 7);
  assert.equal(await db.countCalls("2026-10-04T12:00:00.000Z"), 1999);
  await assert.rejects(db.countCalls("2026-10-04T12:00:00.000Z"), /no count/);
  assert.equal(seen[0].method, "HEAD");
  assert.equal(seen[0].headers.get("prefer"), "count=exact");
  assert.equal(seen[0].url.searchParams.get("install"), `eq.${INSTALL}`);
  assert.equal(seen[1].url.searchParams.has("install"), false);
});

Deno.test("the ledger: reserve a pending row, finish it with the chart, or cancel it", async () => {
  const { f, seen } = recorder([{ status: 201, body: [{ id: "c1" }] }, { status: 204 }, { status: 204 }]);
  const db = restDb(BASE, SERVICE_KEY, f);
  const record = { route: "image" as const, url_hash: HASH, image_url: "https://cdn.example/size-chart.png", brand: "Lune Atelier", kind: "dresses", install: INSTALL };
  assert.equal(await db.reserveCall(record), "c1");
  await db.finishCall("c1", "chart", null, null);
  await db.cancelCall("c1");
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url.pathname}`), ["POST /rest/v1/chart_images", "PATCH /rest/v1/chart_images", "DELETE /rest/v1/chart_images"]);
  assert.deepEqual(seen[0].body, { ...record, outcome: "pending" });
  assert.match(String(seen[0].headers.get("prefer")), /return=representation/);
  assert.deepEqual(seen[1].body, { outcome: "chart", reason: null, chart: null });
  assert.equal(seen[1].url.searchParams.get("id"), "eq.c1");
  assert.equal(seen[2].url.searchParams.get("id"), "eq.c1");
});

Deno.test("a failed request throws with the status and body, never the key", async () => {
  const { f } = recorder([{ status: 401, body: { message: "Invalid API key" } }]);
  await assert.rejects(restDb(BASE, SERVICE_KEY, f).cachedImage(HASH, "2026-09-05T12:00:00.000Z"), (e: Error) => {
    assert.match(e.message, /HTTP 401/);
    assert.equal(e.message.includes(SERVICE_KEY), false);
    return true;
  });
});
