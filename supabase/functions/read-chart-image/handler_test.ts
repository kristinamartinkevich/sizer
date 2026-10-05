import assert from "node:assert/strict";
import { handle } from "./handler.ts";
import { urlHash } from "./chart.ts";
import {
  ANTHROPIC_KEY,
  chartMessage,
  collectLogs,
  FakeDb,
  found,
  IMAGE_BODY,
  IMAGE_URL,
  imageChart,
  imageRequest,
  INSTALL,
  notFound,
  NOW,
  PRODUCT_BODY,
  productAnswer,
  productMessage,
  productRequest,
  scriptedFetch,
  SERVICE_KEY,
  shoeChart,
  textMessage,
} from "./test_helpers.ts";

function deps(db: FakeDb, model: ReturnType<typeof scriptedFetch>, logs = collectLogs()) {
  return { db, fetch: model.fetch, anthropicKey: ANTHROPIC_KEY, now: () => NOW, log: logs.log };
}

const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

// ---- the image route ---------------------------------------------------------------------------

Deno.test("bad input is a 400 on both routes and nothing is read or asked", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([]);
  for (const body of [{ ...IMAGE_BODY, kind: "hats" }, { ...IMAGE_BODY, image_url: "http://x.example/a.png" }, "{not json"]) {
    assert.equal((await handle(imageRequest(body), deps(db, model))).status, 400);
  }
  assert.equal((await handle(productRequest({ ...PRODUCT_BODY, install: "x" }), deps(db, model))).status, 400);
  assert.equal((await handle(imageRequest(null, "GET"), deps(db, model))).status, 405);
  assert.equal((await handle(new Request("http://localhost/read-chart-image", { method: "OPTIONS" }), deps(db, model))).status, 204);
  assert.equal((await handle(imageRequest(IMAGE_BODY, "POST", "/read-chart-image/elsewhere"), deps(db, model))).status, 404);
  assert.deepEqual(db.calls, []);
  assert.equal(model.requests.length, 0);
});

Deno.test("the image route is reached at the function root and at /image", async () => {
  for (const path of ["/read-chart-image", "/read-chart-image/image", "/functions/v1/read-chart-image/image"]) {
    const db = new FakeDb();
    const model = scriptedFetch([{ body: chartMessage(found(imageChart())) }]);
    const res = await handle(imageRequest(IMAGE_BODY, "POST", path), deps(db, model));
    assert.equal(res.status, 200, path);
    assert.equal(model.requests.length, 1, path);
  }
});

Deno.test("model request: sonnet 5, the image by URL, a strict tool, no sampling override, no web tools", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: chartMessage(found(imageChart())) }]);
  await handle(imageRequest(IMAGE_BODY), deps(db, model));
  const [req] = model.requests;
  assert.equal(req.url, "https://api.anthropic.com/v1/messages");
  assert.equal(req.headers.get("x-api-key"), ANTHROPIC_KEY);
  assert.equal(req.headers.get("anthropic-version"), "2023-06-01");
  const body = req.body;
  assert.equal(body.model, "claude-sonnet-5");
  assert.equal("temperature" in body, false);
  // deno-lint-ignore no-explicit-any
  const tools = body.tools as any[];
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "record_chart");
  assert.equal(tools[0].strict, true);
  assert.equal(tools[0].input_schema.additionalProperties, false);
  // deno-lint-ignore no-explicit-any
  const content = (body.messages as any[])[0].content as any[];
  assert.deepEqual(content[0], { type: "image", source: { type: "url", url: IMAGE_URL } });
  assert.match(content[1].text, /Lune Atelier/);
  assert.match(String(body.system), /model/i);
});

Deno.test("a chart read from the image is stored for everyone by URL hash and returned in the §5 shape", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: chartMessage(found(imageChart())) }]);
  const res = await handle(imageRequest(IMAGE_BODY), deps(db, model));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.chart.source_url, IMAGE_URL);
  assert.equal(out.chart.source_type, "retailer_brand_chart");
  assert.equal(out.chart.status, "machine_read");
  assert.equal(out.chart.category, "general");
  assert.deepEqual(out.chart.rows[1].hip, [92, 96]);

  assert.equal(db.rows.length, 1);
  const row = db.rows[0];
  assert.equal(row.route, "image");
  assert.equal(row.url_hash, await urlHash(IMAGE_URL));
  assert.equal(row.outcome, "chart");
  assert.equal(row.install, INSTALL);
  // deno-lint-ignore no-explicit-any
  assert.deepEqual((row.chart as any).brands_named, ["Lune Atelier"]);
});

Deno.test("cache hit: a stored chart for the same image returns without a model call or a cap", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: chartMessage(found(imageChart())) }]);
  await handle(imageRequest(IMAGE_BODY), deps(db, model));
  const other = crypto.randomUUID();
  const again = await handle(imageRequest({ ...IMAGE_BODY, brand: "Helsa", install: other }), deps(db, model));
  const out = await again.json();
  assert.equal(model.requests.length, 1);
  assert.equal(out.chart.source_type, "retailer_house_chart", "the brand is judged per request from the brands the image names");
  assert.equal(db.rows.filter((r) => r.install === other).length, 0, "a cache hit spends nothing from the caps");
});

Deno.test("cache hit for another kind of item answers none without asking again", async () => {
  const db = new FakeDb();
  db.seed({ url_hash: await urlHash(IMAGE_URL), image_url: IMAGE_URL, chart: shoeChart(), created_at: ago(40) });
  const model = scriptedFetch([]);
  const out = await (await handle(imageRequest(IMAGE_BODY), deps(db, model))).json();
  assert.equal(out.chart, null);
  assert.match(out.note, /another kind/);
  assert.equal(model.requests.length, 0);
  const shoes = await (await handle(imageRequest({ ...IMAGE_BODY, kind: "shoes" }), deps(db, model))).json();
  assert.equal(shoes.chart.category, "shoes");
});

Deno.test("a no-chart marker younger than 30 days answers none; an older one is read again", async () => {
  const db = new FakeDb();
  db.seed({ url_hash: await urlHash(IMAGE_URL), outcome: "no_chart", reason: "A photo, not a chart.", created_at: ago(29) });
  const model = scriptedFetch([]);
  assert.deepEqual(await (await handle(imageRequest(IMAGE_BODY), deps(db, model))).json(), { chart: null, note: "A photo, not a chart." });
  assert.equal(model.requests.length, 0);

  const stale = new FakeDb();
  stale.seed({ url_hash: await urlHash(IMAGE_URL), outcome: "no_chart", reason: "old", created_at: ago(31) });
  const model2 = scriptedFetch([{ body: chartMessage(found(imageChart())) }]);
  assert.ok((await (await handle(imageRequest(IMAGE_BODY), deps(stale, model2))).json()).chart);
});

Deno.test("an image that is not a chart, a model panel, or a failing chart leaves a no-chart marker", async () => {
  const answers = [
    notFound("The image is a photo of the dress."),
    found(imageChart(), "model_measurements"),
    found(imageChart({ heading: "Model measurements" })),
    found(imageChart({ rows: imageChart().rows.map((r) => ({ ...r, hip: null })) })),
  ];
  for (const a of answers) {
    const db = new FakeDb();
    const model = scriptedFetch([{ body: chartMessage(a) }]);
    const res = await handle(imageRequest(IMAGE_BODY), deps(db, model));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).chart, null);
    assert.deepEqual(db.rows.map((r) => r.outcome), ["no_chart"], JSON.stringify(a).slice(0, 80));
    assert.equal(db.rows[0].chart, null);
  }
});

Deno.test("caps: the settings row sets them, 40 per install and 2000 overall by default", async () => {
  const db = new FakeDb();
  for (let i = 0; i < 40; i++) db.seed({ route: "product", created_at: ago(0.5) });
  const model = scriptedFetch([]);
  const res = await handle(imageRequest(IMAGE_BODY), deps(db, model));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).chart, null);
  assert.equal(model.requests.length, 0);
  assert.equal(db.rows.length, 40, "a refused call gives its place back");

  const yesterday = new FakeDb();
  for (let i = 0; i < 40; i++) yesterday.seed({ route: "product", created_at: ago(1.1) });
  assert.equal((await handle(imageRequest(IMAGE_BODY), deps(yesterday, scriptedFetch([{ body: chartMessage(found(imageChart())) }])))).status, 200);

  const tight = new FakeDb();
  tight.settings = { per_install_per_day: 2, global_per_day: 2000 };
  for (let i = 0; i < 2; i++) tight.seed({ route: "product", created_at: ago(0.1) });
  assert.equal((await handle(imageRequest(IMAGE_BODY), deps(tight, scriptedFetch([])))).status, 429, "the operator's row wins");

  const busy = new FakeDb();
  busy.settings = null;
  for (let i = 0; i < 2000; i++) busy.seed({ route: "product", install: crypto.randomUUID(), created_at: ago(0.2) });
  assert.equal((await handle(imageRequest(IMAGE_BODY), deps(busy, scriptedFetch([])))).status, 429, "no settings row falls back to the defaults");
});

Deno.test("caps hold under concurrent calls: one slot left means at most one model call", async () => {
  const db = new FakeDb();
  db.settings = { per_install_per_day: 40, global_per_day: 10 };
  for (let i = 0; i < 9; i++) db.seed({ route: "product", install: crypto.randomUUID(), created_at: ago(0.2) });
  const model = scriptedFetch([0, 1, 2].map(() => ({ body: chartMessage(found(imageChart())) })));
  const bodies = [0, 1, 2].map((i) => ({ ...IMAGE_BODY, image_url: `${IMAGE_URL}&n=${i}`, install: crypto.randomUUID() }));
  const statuses = (await Promise.all(bodies.map((b) => handle(imageRequest(b), deps(db, model))))).map((r) => r.status);
  assert.ok(model.requests.length <= 1, `model asked ${model.requests.length} times`);
  assert.ok(statuses.filter((s) => s === 429).length >= 2, statuses.join(","));
  assert.equal(db.rows.filter((r) => r.outcome === "pending").length, 0);
});

Deno.test("a call holds its place in the ledger before the model is asked", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: chartMessage(found(imageChart())) }]);
  let pendingWhenAsked = -1;
  const watching = (async (input: RequestInfo | URL, init?: RequestInit) => {
    pendingWhenAsked = db.rows.filter((r) => r.outcome === "pending").length;
    return await model.fetch(input, init);
  }) as typeof fetch;
  await handle(imageRequest(IMAGE_BODY), { ...deps(db, model), fetch: watching });
  assert.equal(pendingWhenAsked, 1);
  assert.deepEqual(db.rows.map((r) => r.outcome), ["chart"]);
});

Deno.test("an answer left in prose is forced once through the tool; a model that never answers is a recorded error", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: textMessage("It is a size chart.") }, { body: chartMessage(found(imageChart())) }]);
  const out = await (await handle(imageRequest(IMAGE_BODY), deps(db, model))).json();
  assert.ok(out.chart);
  assert.deepEqual(model.requests[0].body.tool_choice, { type: "auto" });
  assert.deepEqual(model.requests[1].body.tool_choice, { type: "tool", name: "record_chart" });

  const silent = new FakeDb();
  const res = await handle(imageRequest(IMAGE_BODY), deps(silent, scriptedFetch([{ body: textMessage("?") }, { body: textMessage("?") }])));
  assert.equal(res.status, 502);
  assert.deepEqual(silent.rows.map((r) => r.outcome), ["error"]);
});

Deno.test("an Anthropic failure or refusal is an error, never a no-chart marker, so the image is tried again", async () => {
  for (const reply of [{ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "could not fetch image" } } }, { throws: true }, { body: textMessage("", "refusal") }]) {
    const db = new FakeDb();
    const res = await handle(imageRequest(IMAGE_BODY), deps(db, scriptedFetch([reply])));
    assert.equal(res.status, 502);
    assert.deepEqual(db.rows.map((r) => r.outcome), ["error"]);
    assert.equal((await db.cachedImage(await urlHash(IMAGE_URL), ago(30))), null);
  }
});

Deno.test("a database error before the model is a 500 and asks nothing", async () => {
  for (const op of ["cachedImage", "capSettings", "reserveCall", "countInstall"]) {
    const db = new FakeDb();
    db.failOn = op;
    const model = scriptedFetch([]);
    assert.equal((await handle(imageRequest(IMAGE_BODY), deps(db, model))).status, 500, op);
    assert.equal(model.requests.length, 0, op);
  }
});

// ---- the product route -------------------------------------------------------------------------

Deno.test("product: the cleaned text goes to the model and the fields come back; nothing about the page is stored", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: productMessage(productAnswer()) }]);
  const res = await handle(productRequest(PRODUCT_BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { brand: "Lune Atelier", title: "Bias silk midi skirt", kind: "bottoms", sizes: ["XS", "S", "M", "L", "XL"], fabric: "100% silk" });
  const body = model.requests[0].body;
  assert.equal(body.model, "claude-sonnet-5");
  assert.equal("temperature" in body, false);
  // deno-lint-ignore no-explicit-any
  assert.equal((body.tools as any[])[0].name, "record_product");
  // deno-lint-ignore no-explicit-any
  assert.match(JSON.stringify((body.messages as any[])[0].content), /Sold out: S/);
  assert.deepEqual(db.rows.map((r) => [r.route, r.outcome, r.url_hash, r.image_url, r.brand, r.kind, r.chart]), [["product", "read", null, null, null, null, null]]);
});

Deno.test("product: not cached, so the same text asks the model each time, and capped like images", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: productMessage(productAnswer()) }, { body: productMessage(productAnswer()) }]);
  await handle(productRequest(PRODUCT_BODY), deps(db, model));
  await handle(productRequest(PRODUCT_BODY), deps(db, model));
  assert.equal(model.requests.length, 2);
  assert.equal(db.calls.includes("cachedImage"), false);

  const full = new FakeDb();
  for (let i = 0; i < 40; i++) full.seed({ url_hash: "a".repeat(64), created_at: ago(0.3) });
  assert.equal((await handle(productRequest(PRODUCT_BODY), deps(full, scriptedFetch([])))).status, 429, "image reads and product reads share the caps");
});

Deno.test("product: an unusable answer is a 502 error", async () => {
  const db = new FakeDb();
  const res = await handle(productRequest(PRODUCT_BODY), deps(db, scriptedFetch([{ body: productMessage({ brand: 3 }) }])));
  assert.equal(res.status, 502);
  assert.deepEqual(db.rows.map((r) => r.outcome), ["error"]);
});

// ---- keys ------------------------------------------------------------------------------------

Deno.test("no key appears in any response or log line", async () => {
  const logs = collectLogs();
  const failing = new FakeDb();
  failing.failOn = "cachedImage";
  const scenarios: [FakeDb, ReturnType<typeof scriptedFetch>, Request][] = [
    [failing, scriptedFetch([]), imageRequest(IMAGE_BODY)],
    [new FakeDb(), scriptedFetch([{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }]), imageRequest(IMAGE_BODY)],
    [new FakeDb(), scriptedFetch([{ body: chartMessage(found(imageChart())) }]), imageRequest(IMAGE_BODY)],
    [new FakeDb(), scriptedFetch([{ body: productMessage(productAnswer()) }]), productRequest(PRODUCT_BODY)],
  ];
  for (const [db, model, req] of scenarios) {
    const text = await (await handle(req, deps(db, model, logs))).text();
    assert.equal(text.includes(ANTHROPIC_KEY) || text.includes(SERVICE_KEY), false);
  }
  assert.ok(logs.lines.length > 0);
  for (const line of logs.lines) {
    assert.equal(line.includes(ANTHROPIC_KEY) || line.includes(SERVICE_KEY), false, line);
    assert.equal(line.includes("Bias silk"), false, "product text is never logged");
  }
});
