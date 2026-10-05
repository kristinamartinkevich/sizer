import assert from "node:assert/strict";
import { handle } from "./handler.ts";
import {
  ago,
  ANTHROPIC_KEY,
  answerMessage,
  BLOG_URL,
  BODY,
  collectLogs,
  dossierAnswer,
  dossierRequest,
  FakeDb,
  INSTALL,
  NOW,
  REVIEW_URL,
  scriptedFetch,
  searched,
  SERVICE_KEY,
  storedDossier,
  textMessage,
} from "./test_helpers.ts";

function deps(db: FakeDb, model: ReturnType<typeof scriptedFetch>, logs = collectLogs()) {
  return { db, fetch: model.fetch, anthropicKey: ANTHROPIC_KEY, now: () => NOW, log: logs.log };
}

const fill = (db: FakeDb, n: number, install?: string) => {
  for (let i = 0; i < n; i++) {
    db.requests.push({ item_key: `b${i}|s`, brand: `b${i}`, kind: "tops", shop: "revolve.com", install: install ?? crypto.randomUUID(), outcome: "dossier", reason: null, created_at: ago(0.2) });
  }
};

Deno.test("bad input is a 400 and nothing is read or asked", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([]);
  for (const body of [{ ...BODY, kind: "hats" }, { ...BODY, install: "x" }, { ...BODY, tallies: { ...BODY.tallies, small: -1 } }, "{not json"]) {
    const res = await handle(dossierRequest(body), deps(db, model));
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  }
  assert.equal((await handle(dossierRequest(null, "GET"), deps(db, model))).status, 405);
  assert.equal((await handle(new Request("http://localhost/fit-dossier", { method: "OPTIONS" }), deps(db, model))).status, 204);
  assert.deepEqual(db.calls, []);
  assert.equal(model.requests.length, 0);
});

Deno.test("cache hit: a dossier younger than 30 days returns with no model call and no ledger row", async () => {
  const db = new FakeDb();
  db.dossiers.push(storedDossier({ created_at: ago(29) }));
  const model = scriptedFetch([]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.dossier.verdict, "small");
  assert.equal(body.dossier.item_key, "helsa|wd1");
  assert.equal(model.requests.length, 0);
  assert.deepEqual(db.requests, []);
});

Deno.test("cache: a stored dossier with nothing in it answers dossier null, still without a model call", async () => {
  const db = new FakeDb();
  db.dossiers.push(storedDossier({ verdict: null, strength: 0, areas: [], sources: [], brand_note: null }));
  const model = scriptedFetch([]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { dossier: null });
  assert.equal(model.requests.length, 0);
});

Deno.test("cache: a dossier older than 30 days is asked again and replaced", async () => {
  const db = new FakeDb();
  db.dossiers.push(storedDossier({ created_at: ago(31), verdict: "large" }));
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).dossier.verdict, "small");
  assert.equal(model.requests.length, 1);
  assert.equal(db.dossiers.length, 1);
  assert.equal(db.dossiers[0].created_at, NOW.toISOString());
});

Deno.test("caps under: 39 from this install and 1999 overall still asks the model", async () => {
  const db = new FakeDb();
  fill(db, 39, INSTALL);
  fill(db, 1960);
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.equal(model.requests.length, 1);
});

Deno.test("caps over: 40 from this install today is a 429, and so is 2000 overall; the place is given back", async () => {
  const perInstall = new FakeDb();
  fill(perInstall, 40, INSTALL);
  const model = scriptedFetch([]);
  const res = await handle(dossierRequest(BODY), deps(perInstall, model));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { dossier: null, error: "Too many fit checks from this install today." });
  assert.equal(perInstall.requests.length, 40);

  const global = new FakeDb();
  fill(global, 2000);
  const res2 = await handle(dossierRequest(BODY), deps(global, model));
  assert.equal(res2.status, 429);
  assert.equal(global.requests.length, 2000);
  assert.equal(model.requests.length, 0);
  assert.ok(global.calls.includes("cancelRequest"));
});

Deno.test("caps come from the settings row, so the operator can change them", async () => {
  const db = new FakeDb();
  db.caps = { perInstallPerDay: 2, globalPerDay: 5 };
  fill(db, 2, INSTALL);
  const model = scriptedFetch([]);
  assert.equal((await handle(dossierRequest(BODY), deps(db, model))).status, 429);

  const roomy = new FakeDb();
  roomy.caps = { perInstallPerDay: 100, globalPerDay: 5000 };
  fill(roomy, 60, INSTALL);
  const model2 = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  assert.equal((await handle(dossierRequest(BODY), deps(roomy, model2))).status, 200);
});

Deno.test("caps: a missing settings row falls back to 40 and 2000", async () => {
  const db = new FakeDb();
  db.caps = null;
  fill(db, 40, INSTALL);
  const model = scriptedFetch([]);
  assert.equal((await handle(dossierRequest(BODY), deps(db, model))).status, 429);
});

Deno.test("a request holds its pending place in the ledger before the model is asked", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  let pendingWhenAsked = -1;
  const watching = (async (input: RequestInfo | URL, init?: RequestInit) => {
    pendingWhenAsked = db.requests.filter((r) => r.outcome === "pending").length;
    return await model.fetch(input, init);
  }) as typeof fetch;
  await handle(dossierRequest(BODY), { ...deps(db, model), fetch: watching });
  assert.equal(pendingWhenAsked, 1);
  assert.deepEqual(db.requests.map((r) => r.outcome), ["dossier"]);
  assert.deepEqual(Object.keys(db.requests[0]).sort(), ["brand", "created_at", "id", "install", "item_key", "kind", "outcome", "reason", "shop"]);
});

Deno.test("caps hold under concurrent requests: one slot left means at most one model call", async () => {
  const db = new FakeDb();
  fill(db, 1999);
  const model = scriptedFetch([
    { body: answerMessage(dossierAnswer()) },
    { body: answerMessage(dossierAnswer()) },
    { body: answerMessage(dossierAnswer()) },
  ]);
  const bodies = ["helsa|wd1", "ganni|x2", "rixo|y3"].map((item_key) => ({ ...BODY, item_key, install: crypto.randomUUID() }));
  const statuses = (await Promise.all(bodies.map((b) => handle(dossierRequest(b), deps(db, model))))).map((r) => r.status);
  assert.ok(model.requests.length <= 1, `model asked ${model.requests.length} times`);
  assert.ok(statuses.filter((s) => s === 429).length >= 2, statuses.join(","));
  assert.ok(db.requests.length <= 2000, `${db.requests.length} ledger rows`);
  assert.equal(db.requests.filter((r) => r.outcome === "pending").length, 0, "refused requests give their place back");
});

Deno.test("model request: sonnet 5, web search only capped at 5, a strict record_dossier tool, no sampling override, tallies as context", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  await handle(dossierRequest(BODY), deps(db, model));
  const [r] = model.requests;
  assert.equal(r.url, "https://api.anthropic.com/v1/messages");
  assert.equal(r.headers.get("x-api-key"), ANTHROPIC_KEY);
  assert.equal(r.headers.get("anthropic-version"), "2023-06-01");
  assert.equal(r.body.model, "claude-sonnet-5");
  assert.equal("temperature" in r.body, false);
  assert.equal("top_p" in r.body, false);
  // deno-lint-ignore no-explicit-any
  const tools = r.body.tools as any[];
  assert.deepEqual(tools.filter((t) => t.type !== "custom" && t.type).map((t) => [t.type, t.name, t.max_uses]), [["web_search_20260209", "web_search", 5]]);
  const answer = tools.find((t) => t.name === "record_dossier");
  assert.equal(answer.strict, true);
  assert.deepEqual(answer.input_schema.required, ["verdict", "strength", "areas", "brand_note", "sources"]);
  // deno-lint-ignore no-explicit-any
  const prompt = String((r.body.messages as any[])[0].content);
  assert.match(prompt, /Helsa/);
  assert.match(prompt, /WD1/);
  assert.match(prompt, /"small":3/);
  assert.match(prompt, /context only/i);
  assert.equal(prompt.includes(INSTALL), false, "the install id never reaches the model");
});

Deno.test("a sourced answer is stored and returned in the public shape", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  const { dossier } = await res.json();
  assert.deepEqual(Object.keys(dossier).sort(), ["areas", "brand_note", "created_at", "item_key", "sources", "strength", "verdict"]);
  assert.equal(dossier.verdict, "small");
  assert.equal(dossier.sources.length, 2);
  const stored = db.dossiers[0] as unknown as Record<string, unknown>;
  assert.equal(stored.brand, "Helsa");
  assert.equal(stored.style, "WD1");
  assert.equal(stored.kind, "dresses");
  assert.equal("install" in stored, false);
  assert.equal("shop" in stored, false);
});

Deno.test("provenance: a source no search returned is dropped before storing", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer(), [searched([REVIEW_URL])]) }]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  const { dossier } = await res.json();
  assert.deepEqual(dossier.sources.map((s: { url: string }) => s.url), [REVIEW_URL]);
  assert.deepEqual(db.dossiers[0].sources.map((s) => s.url), [REVIEW_URL]);
  assert.equal(dossier.verdict, "small");
});

Deno.test("provenance: a search before a paused turn still counts", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([
    { body: textMessage("Searching", "pause_turn", [searched([REVIEW_URL, BLOG_URL])]) },
    { body: answerMessage(dossierAnswer(), []) },
  ]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal((await res.json()).dossier.sources.length, 2);
  assert.equal(model.requests.length, 2);
});

Deno.test("provenance: a verdict with no surviving source is stored as null and answered as dossier null", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer(), [searched(["https://elsewhere.example.com/page"])]) }]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { dossier: null });
  assert.equal(db.dossiers.length, 1, "the empty result is cached so the next visit does not ask again");
  assert.equal(db.dossiers[0].verdict, null);
  assert.deepEqual(db.requests.map((r) => r.outcome), ["empty"]);
});

Deno.test("a paused turn is resumed, and an answer left in prose is forced through the answer tool", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([
    { body: textMessage("Still searching", "pause_turn") },
    { body: textMessage("It runs small.") },
    { body: answerMessage(dossierAnswer()) },
  ]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.equal(model.requests.length, 3);
  assert.deepEqual(model.requests[2].body.tool_choice, { type: "tool", name: "record_dossier" });
});

Deno.test("model errors are non-200 with nothing cached, and recorded in the ledger", async () => {
  const cases = [
    [{ status: 500, body: { type: "error" } }],
    [{ throws: true }],
    [{ body: textMessage("No", "refusal") }],
    [{ body: textMessage("prose") }, { body: textMessage("more prose") }],
    [{ body: answerMessage({ verdict: "enormous", strength: 2, areas: [], brand_note: null, sources: [] }) }],
  ];
  for (const replies of cases) {
    const db = new FakeDb();
    const model = scriptedFetch(replies);
    const res = await handle(dossierRequest(BODY), deps(db, model));
    assert.equal(res.status, 502, JSON.stringify(replies));
    assert.equal((await res.json()).dossier, null);
    assert.deepEqual(db.dossiers, [], "nothing cached");
    assert.deepEqual(db.requests.map((r) => r.outcome), ["error"]);
  }
});

Deno.test("database errors are a 500 and nothing is asked or cached", async () => {
  for (const op of ["findDossier", "readCaps", "reserveRequest", "countInstall", "countGlobal"]) {
    const db = new FakeDb();
    db.failOn = op;
    const model = scriptedFetch([]);
    const res = await handle(dossierRequest(BODY), deps(db, model));
    assert.equal(res.status, 500, op);
    assert.equal(model.requests.length, 0, op);
  }
  const db = new FakeDb();
  db.failOn = "saveDossier";
  const model = scriptedFetch([{ body: answerMessage(dossierAnswer()) }]);
  const res = await handle(dossierRequest(BODY), deps(db, model));
  assert.equal(res.status, 500);
  assert.deepEqual(db.requests.map((r) => r.outcome), ["error"]);
});

Deno.test("no key appears in any response or log line", async () => {
  const logs = collectLogs();
  const scenarios: [FakeDb, ReturnType<typeof scriptedFetch>][] = [];
  const failing = new FakeDb();
  failing.failOn = "findDossier";
  scenarios.push([failing, scriptedFetch([])]);
  scenarios.push([new FakeDb(), scriptedFetch([{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }])]);
  scenarios.push([new FakeDb(), scriptedFetch([{ body: answerMessage(dossierAnswer()) }])]);
  for (const [db, model] of scenarios) {
    const res = await handle(dossierRequest(BODY), deps(db, model, logs));
    const text = await res.text();
    assert.equal(text.includes(ANTHROPIC_KEY) || text.includes(SERVICE_KEY), false);
  }
  assert.ok(logs.lines.length > 0);
  for (const line of logs.lines) assert.equal(line.includes(ANTHROPIC_KEY) || line.includes(SERVICE_KEY), false, line);
});
