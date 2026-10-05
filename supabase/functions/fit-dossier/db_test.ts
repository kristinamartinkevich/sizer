import assert from "node:assert/strict";
import { restDb } from "./db.ts";
import { INSTALL, SERVICE_KEY } from "./test_helpers.ts";

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

const PUBLIC = "item_key,verdict,strength,areas,brand_note,sources,created_at";

Deno.test("findDossier reads the public columns of a fresh row, with the service key as apikey and bearer", async () => {
  const { f, seen } = recorder([{ body: [] }]);
  assert.equal(await restDb(BASE, SERVICE_KEY, f).findDossier("helsa|wd1", "2026-09-05T12:00:00.000Z"), null);
  const [r] = seen;
  assert.equal(r.url.origin + r.url.pathname, `${BASE}/rest/v1/fit_dossiers`);
  assert.equal(r.headers.get("apikey"), SERVICE_KEY);
  assert.equal(r.headers.get("authorization"), `Bearer ${SERVICE_KEY}`);
  assert.equal(r.url.searchParams.get("select"), PUBLIC);
  assert.equal(r.url.searchParams.get("item_key"), "eq.helsa|wd1");
  assert.equal(r.url.searchParams.get("created_at"), "gt.2026-09-05T12:00:00.000Z");
});

Deno.test("readCaps reads the settings row, or null when it is missing", async () => {
  const { f, seen } = recorder([{ body: [{ per_install_per_day: 40, global_per_day: 2000 }] }, { body: [] }]);
  const db = restDb(BASE, SERVICE_KEY, f);
  assert.deepEqual(await db.readCaps(), { perInstallPerDay: 40, globalPerDay: 2000 });
  assert.equal(await db.readCaps(), null);
  assert.equal(seen[0].url.pathname, "/rest/v1/fit_dossier_settings");
});

Deno.test("countRequests reads the exact count from Content-Range, for one install or for everyone", async () => {
  const { f, seen } = recorder([
    { status: 200, headers: { "content-range": "*/17" } },
    { status: 206, headers: { "content-range": "0-0/2001" } },
    { status: 200, headers: {} },
  ]);
  const db = restDb(BASE, SERVICE_KEY, f);
  assert.equal(await db.countRequests("2026-10-04T12:00:00.000Z", INSTALL), 17);
  assert.equal(await db.countRequests("2026-10-04T12:00:00.000Z"), 2001);
  await assert.rejects(db.countRequests("2026-10-04T12:00:00.000Z"));
  assert.equal(seen[0].method, "HEAD");
  assert.equal(seen[0].url.pathname, "/rest/v1/dossier_requests");
  assert.equal(seen[0].headers.get("prefer"), "count=exact");
  assert.equal(seen[0].url.searchParams.get("install"), `eq.${INSTALL}`);
  assert.equal(seen[1].url.searchParams.has("install"), false);
});

Deno.test("the ledger: reserve writes a pending row, finish patches it, cancel deletes it", async () => {
  const { f, seen } = recorder([{ status: 201, body: [{ id: "r1" }] }, { status: 204 }, { status: 204 }]);
  const db = restDb(BASE, SERVICE_KEY, f);
  const id = await db.reserveRequest({ item_key: "helsa|wd1", brand: "Helsa", kind: "dresses", shop: "revolve.com", install: INSTALL });
  assert.equal(id, "r1");
  assert.equal(seen[0].method, "POST");
  assert.deepEqual(seen[0].body, { item_key: "helsa|wd1", brand: "Helsa", kind: "dresses", shop: "revolve.com", install: INSTALL, outcome: "pending", reason: null });
  await db.finishRequest("r1", "dossier", null);
  assert.equal(seen[1].method, "PATCH");
  assert.equal(seen[1].url.searchParams.get("id"), "eq.r1");
  assert.deepEqual(seen[1].body, { outcome: "dossier", reason: null });
  await db.cancelRequest("r1");
  assert.equal(seen[2].method, "DELETE");
  assert.equal(seen[2].url.searchParams.get("id"), "eq.r1");
});

Deno.test("saveDossier upserts on item_key and returns the public columns", async () => {
  const row = { item_key: "helsa|wd1", verdict: null, strength: 0, areas: [], brand_note: null, sources: [], created_at: "2026-10-05T12:00:00.000Z" };
  const { f, seen } = recorder([{ status: 201, body: [row] }]);
  const stored = await restDb(BASE, SERVICE_KEY, f).saveDossier({ ...row, brand: "Helsa", style: "WD1", kind: "dresses" });
  assert.deepEqual(stored, row);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].url.searchParams.get("on_conflict"), "item_key");
  assert.equal(seen[0].url.searchParams.get("select"), PUBLIC);
  assert.equal(seen[0].headers.get("prefer"), "resolution=merge-duplicates,return=representation");
});

Deno.test("a failing request names the operation and status, never the key", async () => {
  const { f } = recorder([{ status: 401, body: { message: "bad" } }]);
  const err = await restDb(BASE, SERVICE_KEY, f).findDossier("helsa|wd1", "x").catch((e) => e as Error);
  assert.ok(err instanceof Error);
  assert.match(err.message, /findDossier failed: HTTP 401/);
  assert.equal(err.message.includes(SERVICE_KEY), false);
});
