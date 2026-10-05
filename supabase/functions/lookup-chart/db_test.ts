import assert from "node:assert/strict";
import { restDb } from "./db.ts";
import { SERVICE_KEY } from "./test_helpers.ts";

const BASE = "https://project.supabase.co";

function recorder(replies: { status?: number; body?: unknown; headers?: Record<string, string> }[]) {
  const seen: { method: string; url: URL; headers: Headers; body: unknown }[] = [];
  const queue = [...replies];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    await Promise.resolve();
    seen.push({
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = queue.shift() ?? {};
    const status = r.status ?? 200;
    const body = status === 204 || r.body === undefined ? null : JSON.stringify(r.body);
    return new Response(body, { status, headers: r.headers });
  }) as typeof fetch;
  return { f, seen };
}

Deno.test("every request carries the service key as apikey and bearer, against the REST endpoint", async () => {
  const { f, seen } = recorder([{ body: [] }]);
  await restDb(BASE, SERVICE_KEY, f).findCharts("helsa", ["dresses", "general", "tops"]);
  const [r] = seen;
  assert.equal(r.url.origin + r.url.pathname, `${BASE}/rest/v1/size_charts`);
  assert.equal(r.headers.get("apikey"), SERVICE_KEY);
  assert.equal(r.headers.get("authorization"), `Bearer ${SERVICE_KEY}`);
  assert.equal(r.url.searchParams.get("select"), "*,size_chart_rows(*)");
  assert.equal(r.url.searchParams.get("brand_id"), "eq.helsa");
  assert.equal(r.url.searchParams.get("category"), "in.(dresses,general,tops)");
  assert.equal(r.url.searchParams.get("status"), "in.(verified,machine_read)");
  assert.equal(r.url.searchParams.get("size_chart_rows.order"), "position.asc");
});

Deno.test("findBrand looks up the alias as an array literal, then the slug, and prefers the alias match", async () => {
  const { f, seen } = recorder([{ body: [] }, { body: [{ id: "rag-bone", name: "rag & bone", aliases: ["rag & bone"], website: null }] }]);
  const brand = await restDb(BASE, SERVICE_KEY, f).findBrand('rag "&" bone', "rag-bone");
  assert.equal(brand?.id, "rag-bone");
  assert.equal(seen[0].url.searchParams.get("aliases"), 'cs.{"rag \\"&\\" bone"}');
  assert.equal(seen[1].url.searchParams.get("id"), "eq.rag-bone");

  const one = recorder([{ body: [{ id: "helsa", name: "Helsa", aliases: ["helsa"], website: null }] }]);
  assert.equal((await restDb(BASE, SERVICE_KEY, one.f).findBrand("helsa", "helsa"))?.id, "helsa");
  assert.equal(one.seen.length, 1, "an alias match needs no second query");
});

Deno.test("countLookups reads the exact count from Content-Range, for one install or for everyone", async () => {
  const { f, seen } = recorder([
    { status: 200, headers: { "content-range": "*/17" } },
    { status: 206, headers: { "content-range": "0-0/301" } },
  ]);
  const db = restDb(BASE, SERVICE_KEY, f);
  assert.equal(await db.countLookups("2026-10-04T12:00:00.000Z", "3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64"), 17);
  assert.equal(await db.countLookups("2026-10-04T12:00:00.000Z"), 301);
  assert.equal(seen[0].method, "HEAD");
  assert.equal(seen[0].headers.get("prefer"), "count=exact");
  assert.equal(seen[0].url.searchParams.get("created_at"), "gt.2026-10-04T12:00:00.000Z");
  assert.equal(seen[0].url.searchParams.get("install"), "eq.3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64");
  assert.equal(seen[1].url.searchParams.has("install"), false);
});

Deno.test("latestNoChart asks for the newest no_chart marker after a date", async () => {
  const { f, seen } = recorder([{ body: [{ reason: "none", created_at: "2026-10-01T00:00:00Z" }] }]);
  assert.deepEqual(await restDb(BASE, SERVICE_KEY, f).latestNoChart("helsa", "dresses", "2026-09-05T12:00:00.000Z"), { reason: "none" });
  const p = seen[0].url.searchParams;
  assert.equal(seen[0].url.pathname, "/rest/v1/chart_lookups");
  assert.equal(p.get("brand"), "eq.helsa");
  assert.equal(p.get("kind"), "eq.dresses");
  assert.equal(p.get("outcome"), "eq.no_chart");
  assert.equal(p.get("created_at"), "gt.2026-09-05T12:00:00.000Z");
  assert.equal(p.get("order"), "created_at.desc");
  assert.equal(p.get("limit"), "1");
});

Deno.test("writes: brand insert ignores a duplicate, chart and rows return what was stored", async () => {
  const { f, seen } = recorder([
    { status: 201 },
    { status: 204 },
    { status: 201, body: [{ id: "c1", brand_id: "helsa" }] },
    { status: 201, body: [{ id: "r1", chart_id: "c1" }] },
    { status: 204 },
    { status: 201 },
  ]);
  const db = restDb(BASE, SERVICE_KEY, f);
  await db.insertBrand({ id: "helsa", name: "Helsa", aliases: ["helsa"], website: null });
  await db.setAliases("helsa", ["helsa", "helsa studio"]);
  assert.equal((await db.insertChart({ brand_id: "helsa" })).id, "c1");
  assert.equal((await db.insertRows([{ chart_id: "c1" }]))[0].id, "r1");
  await db.deleteChart("c1");
  await db.recordLookup({ brand: "helsa", kind: "dresses", shop: "revolve.com", install: "3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64", outcome: "chart", reason: null });

  assert.deepEqual(seen.map((s) => `${s.method} ${s.url.pathname}`), [
    "POST /rest/v1/brands", "PATCH /rest/v1/brands", "POST /rest/v1/size_charts", "POST /rest/v1/size_chart_rows",
    "DELETE /rest/v1/size_charts", "POST /rest/v1/chart_lookups",
  ]);
  assert.equal(seen[0].url.searchParams.get("on_conflict"), "id");
  assert.match(String(seen[0].headers.get("prefer")), /resolution=ignore-duplicates/);
  assert.equal(seen[1].url.searchParams.get("id"), "eq.helsa");
  assert.deepEqual(seen[1].body, { aliases: ["helsa", "helsa studio"] });
  assert.match(String(seen[2].headers.get("prefer")), /return=representation/);
  assert.equal(seen[4].url.searchParams.get("id"), "eq.c1");
});

Deno.test("a failed request throws with the status and body, never the key", async () => {
  const { f } = recorder([{ status: 401, body: { message: "Invalid API key" } }]);
  await assert.rejects(restDb(BASE, SERVICE_KEY, f).findCharts("helsa", ["dresses"]), (e: Error) => {
    assert.match(e.message, /HTTP 401/);
    assert.equal(e.message.includes(SERVICE_KEY), false);
    return true;
  });
});
