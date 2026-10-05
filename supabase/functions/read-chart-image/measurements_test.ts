// The /measurements route (fit-evidence HANDOFF §8): measurements read from a Vinted listing's photos.
// Nothing here touches the network.
import assert from "node:assert/strict";
import "../../../src/vinted.js";
import "../../../src/charts-store.js";
import { handle } from "./handler.ts";
import { LISTING_KINDS, MEASUREMENT_KEYS, MEASUREMENT_RANGE, parseMeasurementsAnswer, parseMeasurementsInput } from "./measurements.ts";
import { MEASURE_TOOL } from "./prompt.ts";
import {
  ANTHROPIC_KEY,
  collectLogs,
  FakeDb,
  INSTALL,
  MEASURE_BODY,
  measurementsAnswer,
  measurementsMessage,
  measurementsRequest,
  NOW,
  PHOTO_URLS,
  scriptedFetch,
  SERVICE_KEY,
  textMessage,
} from "./test_helpers.ts";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

function deps(db: FakeDb, model: ReturnType<typeof scriptedFetch>, logs = collectLogs()) {
  return { db, fetch: model.fetch, anthropicKey: ANTHROPIC_KEY, now: () => NOW, log: logs.log };
}

const ago = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

// ---- the pure checks ------------------------------------------------------------------------

Deno.test("the plausible ranges, measurement names and kinds match src/vinted.js and src/charts-store.js", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(MEASUREMENT_RANGE)), JSON.parse(JSON.stringify(g.SizerVinted.RANGE)));
  assert.deepEqual([...MEASUREMENT_KEYS].sort(), Object.keys(g.SizerVinted.RANGE).sort());
  assert.deepEqual([...MEASUREMENT_KEYS], [...g.SizerChartsStore.MEASUREMENT_KEYS]);
  assert.deepEqual([...LISTING_KINDS], [...g.SizerChartsStore.LISTING_KINDS]);
  // The tool asks for exactly these measurements, every one required (strict tools need that).
  const props = MEASURE_TOOL.input_schema.properties.measurements;
  assert.deepEqual(Object.keys(props.properties).sort(), [...MEASUREMENT_KEYS].sort());
  assert.deepEqual([...props.required].sort(), [...MEASUREMENT_KEYS].sort());
  assert.equal(MEASURE_TOOL.strict, true);
});

Deno.test("input: one to four public Vinted photo addresses, a kind of item and an install id", () => {
  const r = parseMeasurementsInput({ image_urls: [`${PHOTO_URLS[0]}#zoom`, PHOTO_URLS[0], PHOTO_URLS[1]], kind: "dress", install: INSTALL.toUpperCase() });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.input, { image_urls: [PHOTO_URLS[0], PHOTO_URLS[1]], kind: "dress", install: INSTALL });
  const bad = [
    { ...MEASURE_BODY, image_urls: [] },
    { ...MEASURE_BODY, image_urls: [1, 2, 3, 4, 5].map((n) => `https://images1.vinted.net/${n}.jpeg`) },
    { ...MEASURE_BODY, image_urls: ["https://evil.example/a.jpeg"] },
    { ...MEASURE_BODY, image_urls: ["http://images1.vinted.net/a.jpeg"] },
    { ...MEASURE_BODY, image_urls: ["https://u:p@images1.vinted.net/a.jpeg"] },
    { ...MEASURE_BODY, image_urls: "https://images1.vinted.net/a.jpeg" },
    { ...MEASURE_BODY, kind: "bottoms" },
    { ...MEASURE_BODY, install: "nope" },
    { ...MEASURE_BODY, page: "https://www.vinted.fr/items/1" },
    "text",
  ];
  for (const body of bad) assert.equal(parseMeasurementsInput(body).ok, false, JSON.stringify(body));
});

Deno.test("answer: the function does the arithmetic, inches to cm and a circumference halved, and drops what is implausible", () => {
  assert.deepEqual(parseMeasurementsAnswer(measurementsAnswer()), { measurements: { pit: 46, length: 111.8, waistFlat: 36 }, note: "A tape across the chest and down the back in photo 2." });
  // Laid flat, a wide number stays as it is; out of range it is dropped, whatever the model says.
  const r = parseMeasurementsAnswer(measurementsAnswer({
    pit: { value: 72, unit: "cm", laid_flat: true },
    length: { value: 400, unit: "cm", laid_flat: null },
    waistFlat: null,
    insole: { value: 24.5, unit: "cm", laid_flat: null },
    sleeve: { value: -3, unit: "cm", laid_flat: null },
  }));
  assert.deepEqual(r?.measurements, { pit: 72, insole: 24.5 });
  assert.deepEqual(parseMeasurementsAnswer(measurementsAnswer({}, false)), { measurements: {}, note: "A tape across the chest and down the back in photo 2." });
  assert.equal(parseMeasurementsAnswer("nope"), null);
  assert.equal(parseMeasurementsAnswer({ found: true, measurements: { pit: { value: "46", unit: "cm", laid_flat: true } }, note: "" }), null);
  assert.equal(parseMeasurementsAnswer({ found: true, measurements: { hips: { value: 46, unit: "cm", laid_flat: true } }, note: "" }), null);
  assert.equal(parseMeasurementsAnswer({ found: true, measurements: { pit: { value: 46, unit: "mm", laid_flat: true } }, note: "" }), null);
});

// ---- the route ------------------------------------------------------------------------------

Deno.test("measurements: the photos go to the model by address, the cm come back, and nothing about the listing is kept", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: measurementsMessage(measurementsAnswer()) }]);
  const res = await handle(measurementsRequest(MEASURE_BODY), deps(db, model));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { measurements: { pit: 46, length: 111.8, waistFlat: 36 }, note: "A tape across the chest and down the back in photo 2." });
  const body = model.requests[0].body;
  assert.equal(body.model, "claude-sonnet-5");
  assert.equal("temperature" in body, false);
  // deno-lint-ignore no-explicit-any
  const tools = body.tools as any[];
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "record_measurements");
  assert.equal(tools[0].strict, true);
  // deno-lint-ignore no-explicit-any
  const content = (body.messages as any[])[0].content as any[];
  assert.deepEqual(content.slice(0, 3), PHOTO_URLS.map((url) => ({ type: "image", source: { type: "url", url } })));
  assert.match(content[3].text, /dress/);
  // The ledger row is the same table and caps as the other routes, and keeps no address, brand or answer.
  assert.deepEqual(db.rows.map((r) => [r.route, r.outcome, r.reason, r.url_hash, r.image_url, r.brand, r.kind, r.chart]), [["product", "read", "measurements", null, null, null, null, null]]);
});

Deno.test("measurements: not cached, so the same photos ask the model each time", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([{ body: measurementsMessage(measurementsAnswer()) }, { body: measurementsMessage(measurementsAnswer()) }]);
  await handle(measurementsRequest(MEASURE_BODY), deps(db, model));
  await handle(measurementsRequest(MEASURE_BODY), deps(db, model));
  assert.equal(model.requests.length, 2);
  assert.equal(db.calls.includes("cachedImage"), false);
});

Deno.test("measurements: the same per-install and overall caps as image and product reads", async () => {
  const full = new FakeDb();
  for (let i = 0; i < 40; i++) full.seed({ url_hash: "a".repeat(64), created_at: ago(0.3) });
  const res = await handle(measurementsRequest(MEASURE_BODY), deps(full, scriptedFetch([])));
  assert.equal(res.status, 429, "image reads count against photo reads");
  assert.equal(full.rows.length, 40, "the refused call gives its place back");

  const busy = new FakeDb();
  busy.settings = { per_install_per_day: 40, global_per_day: 3 };
  for (let i = 0; i < 3; i++) busy.seed({ route: "product", install: `00000000-0000-4000-8000-00000000000${i}`, outcome: "read" });
  assert.equal((await handle(measurementsRequest(MEASURE_BODY), deps(busy, scriptedFetch([])))).status, 429, "the overall cap from the settings row");
});

Deno.test("measurements: bad input is a 400 and asks nothing", async () => {
  const db = new FakeDb();
  const model = scriptedFetch([]);
  for (const body of [{ ...MEASURE_BODY, kind: "hats" }, { ...MEASURE_BODY, image_urls: ["https://evil.example/a.jpeg"] }, "{not json"]) {
    assert.equal((await handle(measurementsRequest(body), deps(db, model))).status, 400);
  }
  assert.deepEqual(db.calls, []);
  assert.equal(model.requests.length, 0);
});

Deno.test("measurements: no measurement in the photos is a 200 with none; a model failure is a 502 error", async () => {
  const db = new FakeDb();
  const none = await handle(measurementsRequest(MEASURE_BODY), deps(db, scriptedFetch([{ body: measurementsMessage(measurementsAnswer({}, false)) }])));
  assert.equal(none.status, 200);
  assert.deepEqual((await none.json()).measurements, {});
  const down = new FakeDb();
  const failed = await handle(measurementsRequest(MEASURE_BODY), deps(down, scriptedFetch([{ status: 529, body: {} }])));
  assert.equal(failed.status, 502);
  assert.deepEqual(down.rows.map((r) => [r.outcome, r.reason?.startsWith("measurements")]), [["error", true]]);
  const prose = new FakeDb();
  const forced = scriptedFetch([{ body: textMessage("About 46 cm.") }, { body: measurementsMessage(measurementsAnswer()) }]);
  assert.equal((await handle(measurementsRequest(MEASURE_BODY), deps(prose, forced))).status, 200);
  assert.deepEqual(forced.requests[1].body.tool_choice, { type: "tool", name: "record_measurements" });
  const junk = new FakeDb();
  assert.equal((await handle(measurementsRequest(MEASURE_BODY), deps(junk, scriptedFetch([{ body: measurementsMessage({ found: "yes" }) }])))).status, 502);
});

Deno.test("measurements: no key and no photo address appears in a response or a log line", async () => {
  const logs = collectLogs();
  const failing = new FakeDb();
  failing.failOn = "reserveCall";
  const scenarios: [FakeDb, ReturnType<typeof scriptedFetch>][] = [
    [failing, scriptedFetch([])],
    [new FakeDb(), scriptedFetch([{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }])],
    [new FakeDb(), scriptedFetch([{ body: measurementsMessage(measurementsAnswer()) }])],
  ];
  for (const [db, model] of scenarios) {
    const text = await (await handle(measurementsRequest(MEASURE_BODY), deps(db, model, logs))).text();
    assert.equal(text.includes(ANTHROPIC_KEY) || text.includes(SERVICE_KEY) || text.includes("vinted.net"), false, text);
  }
  assert.ok(logs.lines.length > 0);
  for (const line of logs.lines) assert.equal(line.includes(ANTHROPIC_KEY) || line.includes(SERVICE_KEY) || line.includes("vinted.net"), false, line);
});
