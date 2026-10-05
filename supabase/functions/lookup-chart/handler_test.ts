import assert from "node:assert/strict";
import "../../../src/charts.js";
import { handle } from "./handler.ts";
import {
  ANTHROPIC_KEY,
  answerMessage,
  brandChart,
  collectLogs,
  DRESS_BODY,
  FakeDb,
  INSTALL,
  lookupRequest,
  NOW,
  retailerChart,
  scriptedFetch,
  SERVICE_KEY,
  shopGuide,
  storedChart,
  textMessage,
} from "./test_helpers.ts";

// deno-lint-ignore no-explicit-any
const SizerCharts = (globalThis as any).SizerCharts;

function deps(db: FakeDb, model: ReturnType<typeof scriptedFetch>, logs = collectLogs()) {
  return { db, fetch: model.fetch, anthropicKey: ANTHROPIC_KEY, now: () => NOW, log: logs.log };
}

const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

Deno.test("bad input is a 400 and nothing is read or asked", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([]);
  for (const body of [{ ...DRESS_BODY, kind: "hats" }, { ...DRESS_BODY, install: "x" }, "{not json"]) {
    const res = await handle(lookupRequest(body), deps(db, model));
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  }
  assert.equal((await handle(lookupRequest(null, "GET"), deps(db, model))).status, 405);
  assert.equal((await handle(new Request("http://localhost/lookup-chart", { method: "OPTIONS" }), deps(db, model))).status, 204);
  assert.deepEqual(db.calls, []);
  assert.equal(model.requests.length, 0);
});

Deno.test("cache hit: a stored chart for the brand returns without a model call", async () => {
  const db = new FakeDb();
  db.brands.push({ id: "helsa", name: "Helsa", aliases: ["helsa"], website: null });
  db.charts.push(storedChart({ category: "general" }));
  const model = scriptedFetch([]);
  const res = await handle(lookupRequest({ ...DRESS_BODY, brand: "HELSA" }), deps(db, model));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.tier, "brand_site");
  assert.equal(out.chart.id, "stored-1");
  assert.ok(SizerCharts.convertChart(out.chart));
  assert.equal(model.requests.length, 0);
  assert.equal(db.lookups.length, 0, "a cache hit spends nothing from the caps");
});

Deno.test("cache: a brand whose only chart is unusable still gets looked up", async () => {
  const db = new FakeDb();
  db.brands.push({ id: "helsa", name: "Helsa", aliases: ["helsa"], website: null });
  db.charts.push(storedChart({ size_chart_rows: storedChart().size_chart_rows.map((r) => ({ ...r, hip_min: null, hip_max: null })) }));
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.equal(model.requests.length, 1);
});

Deno.test("cache: a no_chart marker younger than 30 days answers none without a model call; an older one does not", async () => {
  const db = new FakeDb();
  db.lookups.push({ brand: "helsa", kind: "dresses", shop: "revolve.com", install: INSTALL, outcome: "no_chart", reason: "Helsa publishes no size guide.", created_at: ago(29) });
  const model = scriptedFetch([]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.deepEqual(await res.json(), { chart: null, tier: "none", note: "Helsa publishes no size guide." });
  assert.equal(model.requests.length, 0);

  const stale = new FakeDb();
  stale.lookups.push({ brand: "helsa", kind: "dresses", shop: "revolve.com", install: INSTALL, outcome: "no_chart", reason: "old", created_at: ago(31) });
  const model2 = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  const res2 = await handle(lookupRequest(DRESS_BODY), deps(stale, model2));
  assert.equal((await res2.json()).tier, "brand_site");
  assert.equal(model2.requests.length, 1);
});

Deno.test("caps: 20 lookups from this install today is a 429, and so is 300 overall", async () => {
  const db = new FakeDb();
  for (let i = 0; i < 20; i++) db.lookups.push({ brand: `b${i}`, kind: "tops", shop: "revolve.com", install: INSTALL, outcome: "chart", reason: null, created_at: ago(0.5) });
  const model = scriptedFetch([]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).chart, null);
  assert.equal(model.requests.length, 0);

  const yesterday = new FakeDb();
  for (let i = 0; i < 20; i++) yesterday.lookups.push({ brand: `b${i}`, kind: "tops", shop: "revolve.com", install: INSTALL, outcome: "chart", reason: null, created_at: ago(1.1) });
  const model2 = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  assert.equal((await handle(lookupRequest(DRESS_BODY), deps(yesterday, model2))).status, 200, "yesterday's lookups do not count");

  const busy = new FakeDb();
  for (let i = 0; i < 300; i++) busy.lookups.push({ brand: `b${i}`, kind: "tops", shop: "revolve.com", install: crypto.randomUUID(), outcome: "chart", reason: null, created_at: ago(0.2) });
  const model3 = scriptedFetch([]);
  assert.equal((await handle(lookupRequest(DRESS_BODY), deps(busy, model3))).status, 429);
  assert.equal(model3.requests.length, 0);
});

Deno.test("model request: sonnet 5, web search and fetch capped at 6, a strict answer tool, no sampling override", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  await handle(lookupRequest({ ...DRESS_BODY, shopGuide: shopGuide(true) }), deps(db, model));
  const [req] = model.requests;
  assert.equal(req.url, "https://api.anthropic.com/v1/messages");
  assert.equal(req.headers.get("x-api-key"), ANTHROPIC_KEY);
  assert.equal(req.headers.get("anthropic-version"), "2023-06-01");
  const body = req.body;
  assert.equal(body.model, "claude-sonnet-5");
  assert.equal("temperature" in body, false);
  // deno-lint-ignore no-explicit-any
  const tools = body.tools as any[];
  assert.deepEqual(tools.slice(0, 2), [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
  ]);
  assert.equal(tools[2].name, "record_lookup");
  assert.equal(tools[2].strict, true);
  assert.equal(tools[2].input_schema.additionalProperties, false);
  assert.match(String(body.system), /The brand's own chart always outranks a shop's chart\./);
  // deno-lint-ignore no-explicit-any
  const user = String((body.messages as any[])[0].content);
  assert.match(user, /Helsa/);
  assert.match(user, /Helsa size guide/);
  assert.equal(user.includes("helsa-dress/dp"), false, "the page address never reaches the model");
});

Deno.test("a model answer in the schema is validated and stored as machine_read, and returned in the bundle shape", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.tier, "brand_site");
  assert.equal(out.note, "Size guide on helsastudio.com, the brand's own site.");

  assert.deepEqual(db.brands, [{ id: "helsa", name: "Helsa", aliases: ["helsa"], website: "https://helsastudio.com" }]);
  assert.equal(db.charts.length, 1);
  const stored = db.charts[0];
  assert.equal(stored.status, "machine_read");
  assert.equal(stored.read_by, "lookup-chart");
  assert.equal(stored.lookup_note, "Size guide on helsastudio.com, the brand's own site.");
  assert.equal(stored.retrieved_on, "2026-10-05");
  assert.equal(stored.source_type, "brand_site");
  assert.equal(stored.category, "dresses");
  assert.equal(stored.size_chart_rows.length, 3);
  assert.deepEqual(stored.size_chart_rows.map((r) => [r.position, r.label, r.waist_min, r.waist_max]), [[0, "XS", 62, 66], [1, "S", 66, 70], [2, "M", 70, 74]]);
  assert.deepEqual(stored.size_chart_rows[0].aliases, { us: "2", uk: "6", eu: "34" });

  assert.equal(out.chart.id, stored.id);
  assert.equal(out.chart.status, "machine_read");
  assert.equal(out.chart.read_by, "lookup-chart");
  assert.deepEqual(out.chart.rows[1].hip, [92, 96]);
  const converted = SizerCharts.convertChart(out.chart);
  assert.ok(converted);
  assert.equal(converted.source.tier, 3);

  assert.deepEqual(db.lookups.map((l) => [l.brand, l.kind, l.shop, l.install, l.outcome]), [["helsa", "dresses", "www.revolveclothing.fr", INSTALL, "chart"]]);
});

Deno.test("an existing brand under another spelling gains the alias instead of a second brand", async () => {
  const db = new FakeDb();
  db.brands.push({ id: "rag-bone", name: "rag & bone", aliases: ["rag & bone"], website: null });
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart({ category: "general" }) }) }]);
  const res = await handle(lookupRequest({ ...DRESS_BODY, brand: "Rag-Bone" }), deps(db, model));
  assert.equal(res.status, 200);
  assert.equal(db.brands.length, 1);
  assert.deepEqual(db.brands[0].aliases, ["rag & bone", "rag-bone"]);
  assert.equal(db.charts[0].brand_id, "rag-bone");
});

Deno.test("an out-of-schema answer stores a no_chart marker and returns null", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart({ unit: "mm" }) }) }]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.chart, null);
  assert.equal(out.tier, "none");
  assert.match(out.note, /unit/);
  assert.equal(db.charts.length, 0);
  assert.deepEqual(db.lookups.map((l) => l.outcome), ["no_chart"]);
  assert.match(String(db.lookups[0].reason), /unit/);
});

Deno.test("a non-monotonic answer stores a no_chart marker and returns null", async () => {
  const db = new FakeDb();
  const rows = brandChart().rows;
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart({ rows: [rows[0], { ...rows[1], hip: [80, 84] }, rows[2]] }) }) }]);
  const out = await (await handle(lookupRequest(DRESS_BODY), deps(db, model))).json();
  assert.equal(out.chart, null);
  assert.match(out.note, /goes down/);
  assert.equal(db.charts.length, 0);
  assert.deepEqual(db.lookups.map((l) => l.outcome), ["no_chart"]);
});

Deno.test("a bust and waist chart without hip stores a no_chart marker and returns null", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart({ category: "tops", rows: brandChart().rows.map((r) => ({ ...r, hip: null })) }) }) }]);
  const out = await (await handle(lookupRequest(DRESS_BODY), deps(db, model))).json();
  assert.equal(out.chart, null);
  assert.match(out.note, /waist and hip/);
  assert.equal(db.charts.length, 0);
  assert.deepEqual(db.lookups.map((l) => l.outcome), ["no_chart"]);
});

Deno.test("the model finding nothing stores a no_chart marker with its reason", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: false, reason: "Helsa's site has no size guide.", chart: null }) }]);
  const out = await (await handle(lookupRequest(DRESS_BODY), deps(db, model))).json();
  assert.deepEqual(out, { chart: null, tier: "none", note: "Helsa's site has no size guide." });
  assert.deepEqual(db.lookups.map((l) => [l.outcome, l.reason]), [["no_chart", "Helsa's site has no size guide."]]);
});

Deno.test("a retailer table that names the brand becomes retailer_brand_chart", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: retailerChart(true) }) }]);
  const out = await (await handle(lookupRequest({ ...DRESS_BODY, shopGuide: shopGuide(true) }), deps(db, model))).json();
  assert.equal(out.tier, "retailer_brand_chart");
  assert.equal(out.chart.retailer, "revolveclothing.fr");
  assert.equal(db.charts[0].source_type, "retailer_brand_chart");
  assert.equal(db.charts[0].retailer, "revolveclothing.fr");
  assert.equal(db.brands[0].website, null, "a shop's address is not the brand's website");
  assert.equal(SizerCharts.convertChart(out.chart).source.tier, 4);
});

Deno.test("a retailer table that does not name the brand becomes retailer_house_chart", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: retailerChart(false) }) }]);
  const out = await (await handle(lookupRequest({ ...DRESS_BODY, shopGuide: shopGuide(false) }), deps(db, model))).json();
  assert.equal(out.tier, "retailer_house_chart");
  assert.equal(db.charts[0].source_type, "retailer_house_chart");
  assert.equal(SizerCharts.convertChart(out.chart).source.tier, 5);
});

Deno.test("the brand-site answer wins even when a shop guide was sent", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  const out = await (await handle(lookupRequest({ ...DRESS_BODY, shopGuide: shopGuide(true) }), deps(db, model))).json();
  assert.equal(out.tier, "brand_site");
  assert.equal(db.charts[0].source_type, "brand_site");
  assert.equal(db.charts[0].retailer, null);
  assert.equal(db.charts[0].source_url, "https://helsastudio.com/pages/size-guide");
});

Deno.test("a paused turn is resumed, and an answer left in prose is forced through the answer tool", async () => {
  const db = new FakeDb();
  const paused = { ...textMessage("Searching.", "pause_turn"), content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Helsa size guide" } }] };
  const model = scriptedFetch([
    { body: paused },
    { body: textMessage("I found the chart on helsastudio.com.") },
    { body: answerMessage({ found: true, reason: "", chart: brandChart() }) },
  ]);
  const out = await (await handle(lookupRequest(DRESS_BODY), deps(db, model))).json();
  assert.equal(out.tier, "brand_site");
  assert.equal(model.requests.length, 3);
  const [first, second, third] = model.requests.map((r) => r.body);
  assert.deepEqual(first.tool_choice, { type: "auto" });
  // deno-lint-ignore no-explicit-any
  const secondMessages = second.messages as any[];
  assert.equal(secondMessages.length, 2, "a paused turn is resent as it is, with no extra user message");
  assert.equal(secondMessages[1].role, "assistant");
  assert.deepEqual(third.tool_choice, { type: "tool", name: "record_lookup" });
  // deno-lint-ignore no-explicit-any
  const thirdMessages = third.messages as any[];
  assert.equal(thirdMessages.at(-1).role, "user");
});

Deno.test("a model that never records an answer is an error, recorded, with a 502", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: textMessage("No idea.") }, { body: textMessage("Still no idea.") }]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).chart, null);
  assert.deepEqual(db.lookups.map((l) => l.outcome), ["error"]);
});

Deno.test("an Anthropic failure or refusal is recorded as an error, never as a no_chart marker", async () => {
  for (const reply of [{ status: 529, body: { type: "error", error: { type: "overloaded_error" } } }, { throws: true }, { body: textMessage("", "refusal") }]) {
    const db = new FakeDb();
    const model = scriptedFetch([reply]);
    const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
    assert.equal(res.status, 502);
    assert.deepEqual(db.lookups.map((l) => l.outcome), ["error"]);
  }
});

Deno.test("a chart stored by a concurrent lookup is returned instead of a second copy", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  const realLatest = db.latestNoChart.bind(db);
  db.latestNoChart = async (...args) => {
    const r = await realLatest(...args);
    // Another shopper's lookup lands while this one is asking the model.
    db.brands.push({ id: "helsa", name: "Helsa", aliases: ["helsa"], website: null });
    db.charts.push(storedChart({ id: "theirs", status: "machine_read", read_by: "lookup-chart" }));
    return r;
  };
  const out = await (await handle(lookupRequest(DRESS_BODY), deps(db, model))).json();
  assert.equal(out.chart.id, "theirs");
  assert.equal(db.charts.length, 1);
});

Deno.test("rows that fail to store take their chart with them", async () => {
  const db = new FakeDb();
  db.failOn = "insertRows";
  const model = scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }]);
  const res = await handle(lookupRequest(DRESS_BODY), deps(db, model));
  assert.equal(res.status, 500);
  assert.equal(db.charts.length, 0);
  assert.ok(db.calls.includes("deleteChart"));
  assert.deepEqual(db.lookups.map((l) => l.outcome), ["error"]);
});

Deno.test("no key appears in any response or log line", async () => {
  const logs = collectLogs();
  const scenarios: [FakeDb, ReturnType<typeof scriptedFetch>][] = [];
  const failing = new FakeDb();
  failing.failOn = "findBrand";
  scenarios.push([failing, scriptedFetch([])]);
  scenarios.push([new FakeDb(), scriptedFetch([{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }])]);
  scenarios.push([new FakeDb(), scriptedFetch([{ body: answerMessage({ found: true, reason: "", chart: brandChart() }) }])]);
  for (const [db, model] of scenarios) {
    const res = await handle(lookupRequest(DRESS_BODY), deps(db, model, logs));
    const text = await res.text();
    assert.equal(text.includes(ANTHROPIC_KEY) || text.includes(SERVICE_KEY), false);
  }
  assert.ok(logs.lines.length > 0);
  for (const line of logs.lines) assert.equal(line.includes(ANTHROPIC_KEY) || line.includes(SERVICE_KEY), false, line);
});
