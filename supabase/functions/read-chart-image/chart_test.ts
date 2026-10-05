import assert from "node:assert/strict";
import "../../../src/charts.js";
import "../../../src/guide-table.js";
import { CHARTS_FOR as LOOKUP_CHARTS_FOR } from "../lookup-chart/chart.ts";
import {
  answersFor,
  CHARTS_FOR,
  checkImageChart,
  KINDS,
  parseImageInput,
  parseProductAnswer,
  parseProductInput,
  PLAUSIBLE,
  servedChart,
  urlHash,
  validateImageAnswer,
} from "./chart.ts";
import { found, IMAGE_URL, imageChart, INSTALL, notFound, productAnswer, shoeChart } from "./test_helpers.ts";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

Deno.test("CHARTS_FOR matches src/charts.js and lookup-chart, and the plausible ranges match src/guide-table.js", () => {
  // Coats and jackets reach the function as tops (lookupFor in src/engine.js); compare the four kinds served.
  const served = Object.fromEntries(Object.entries(g.SizerCharts.CHARTS_FOR).filter(([k]) => (KINDS as readonly string[]).includes(k)));
  assert.deepEqual(JSON.parse(JSON.stringify(CHARTS_FOR)), JSON.parse(JSON.stringify(served)));
  assert.deepEqual(JSON.parse(JSON.stringify(CHARTS_FOR)), JSON.parse(JSON.stringify(LOOKUP_CHARTS_FOR)));
  // The extension's reader rejects a column outside these ranges; the image reader holds the same line.
  assert.deepEqual(JSON.parse(JSON.stringify(PLAUSIBLE)), JSON.parse(JSON.stringify(g.SizerGuideTable.PLAUSIBLE)));
});

Deno.test("image input: a public https image, brand, kind and install; the fragment is dropped", () => {
  const r = parseImageInput({ image_url: `${IMAGE_URL}#zoom`, brand: " Lune  Atelier ", kind: "dresses", install: INSTALL.toUpperCase() });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.input.image_url, IMAGE_URL);
  assert.equal(r.input.brand, "Lune Atelier");
  assert.equal(r.input.kind, "dresses");
  assert.equal(r.input.install, INSTALL);
});

Deno.test("image input: every bad field is refused", () => {
  const good = { image_url: IMAGE_URL, brand: "Lune Atelier", kind: "dresses", install: INSTALL };
  const bad: [string, unknown][] = [
    ["not an object", "x"],
    ["http, not https", { ...good, image_url: "http://cdn.example/size-chart.png" }],
    ["data url", { ...good, image_url: "data:image/png;base64,AAAA" }],
    ["not a url", { ...good, image_url: "size chart" }],
    ["user and password", { ...good, image_url: "https://me:pw@cdn.example/size-chart.png" }],
    ["no dot in the host", { ...good, image_url: "https://localhost/size-chart.png" }],
    ["ip address", { ...good, image_url: "https://10.0.0.1/size-chart.png" }],
    ["too long", { ...good, image_url: `https://cdn.example/${"a".repeat(2100)}.png` }],
    ["brand blank", { ...good, brand: " " }],
    ["brand 81", { ...good, brand: "x".repeat(81) }],
    ["kind", { ...good, kind: "hats" }],
    ["install", { ...good, install: "nope" }],
    ["an extra field", { ...good, page: "https://shop.example/p/1" }],
  ];
  for (const [why, body] of bad) assert.equal(parseImageInput(body).ok, false, why);
});

Deno.test("the cache key is the SHA-256 of the image address", async () => {
  const h = await urlHash(IMAGE_URL);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await urlHash(IMAGE_URL), h);
  assert.notEqual(await urlHash(`${IMAGE_URL}x`), h);
});

Deno.test("product input: title, headings and picker text, at most 6000 characters, addresses removed", () => {
  const r = parseProductInput({ title: "Silk skirt", headings: ["Details", "See https://shop.example/p/1 for more"], picker: "XS S M www.shop.example/sizes", install: INSTALL });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(JSON.stringify(r.input).includes("shop.example"), false);
  assert.deepEqual(r.input.headings, ["Details", "See for more"]);
  const bad: unknown[] = [
    { title: "x", headings: [], picker: "", install: "nope" },
    { title: 3, headings: [], picker: "", install: INSTALL },
    { title: "x", headings: "Details", picker: "", install: INSTALL },
    { title: "x", headings: [], picker: "y".repeat(6001), install: INSTALL },
    { title: "", headings: [], picker: "", install: INSTALL },
    { title: "x", headings: [], picker: "", install: INSTALL, url: "https://shop.example/p/1" },
    { title: "x", headings: Array.from({ length: 41 }, () => "h"), picker: "", install: INSTALL },
  ];
  for (const b of bad) assert.equal(parseProductInput(b).ok, false, JSON.stringify(b).slice(0, 80));
});

Deno.test("a clean chart passes, and keeps only what convertChart needs plus the heading and the brands it names", () => {
  const r = checkImageChart(imageChart());
  assert.ok("chart" in r);
  if (!("chart" in r)) return;
  assert.equal(r.chart.rows.length, 3);
  assert.deepEqual(r.chart.rows[0].aliases, { fr: "34" });
  assert.deepEqual(r.chart.brands_named, ["Lune Atelier"]);
  assert.ok("chart" in checkImageChart(shoeChart()));
});

Deno.test("the parseGuideMatrix rules: waist and hip on clothing, foot length on shoes, plausible, monotonic, unique", () => {
  const rows = imageChart().rows;
  const cases: [string, unknown, RegExp][] = [
    ["no hip", imageChart({ rows: rows.map((r) => ({ ...r, hip: null })) }), /waist and hip/],
    ["shoes without foot length", imageChart({ category: "shoes" }), /foot length/],
    ["one row", imageChart({ rows: rows.slice(0, 1) }), /two rows/],
    ["repeated label", imageChart({ rows: [rows[0], { ...rows[1], label: "xs" }, rows[2]] }), /repeat/],
    ["goes down", imageChart({ rows: [rows[0], { ...rows[1], hip: [80, 84] }, rows[2]] }), /goes down/],
    ["min above max", imageChart({ rows: [{ ...rows[0], waist: [66, 62] }, rows[1], rows[2]] }), /min is above/],
    ["implausible cm", imageChart({ rows: rows.map((r) => ({ ...r, waist: [r.waist![0] * 3, r.waist![1] * 3] })) }), /plausible/],
    ["inches read as cm", imageChart({ rows: rows.map((r, i) => ({ ...r, waist: [24 + i, 25 + i] })) }), /plausible/],
    ["unknown unit", imageChart({ unit: "mm" }), /unit/],
    ["unknown category", imageChart({ category: "hats" }), /category/],
    ["unknown field", imageChart({ source_url: "https://x.example" }), /unknown field/],
  ];
  for (const [why, raw, re] of cases) {
    const r = checkImageChart(raw);
    assert.ok("reason" in r, why);
    if ("reason" in r) assert.match(r.reason, re, why);
  }
});

Deno.test("model panels are rejected, by the model's own call and by the heading", () => {
  const byType = validateImageAnswer(found(imageChart(), "model_measurements"));
  assert.equal(byType.ok, false);
  if (!byType.ok) assert.match(byType.reason, /model/);
  for (const heading of ["Model measurements", "Model is wearing size S", "Taille portée par le mannequin", "Size worn: M"]) {
    const r = validateImageAnswer(found(imageChart({ heading })));
    assert.equal(r.ok, false, heading);
  }
  const garmentDims = validateImageAnswer(found(imageChart(), "garment_dimensions"));
  assert.equal(garmentDims.ok, false);
});

Deno.test("the model finding nothing is a plain no-chart answer", () => {
  const r = validateImageAnswer(notFound("The image is a photo of the dress."));
  assert.deepEqual(r, { ok: true, answer: { found: false, reason: "The image is a photo of the dress.", chart: null } });
  assert.equal(validateImageAnswer({ found: true, reason: "", table_type: "size_chart", chart: null }).ok, false);
  assert.equal(validateImageAnswer("nope").ok, false);
});

Deno.test("a stored chart answers for a kind only through CHARTS_FOR", () => {
  const r = checkImageChart(imageChart());
  if (!("chart" in r)) throw new Error("bad fixture");
  assert.equal(answersFor(r.chart, "dresses"), true);
  assert.equal(answersFor(r.chart, "bottoms"), true);
  assert.equal(answersFor(r.chart, "shoes"), false);
});

Deno.test("the served chart is the plan 1 §5 shape, machine-read, its source the image, and convertChart reads it", () => {
  const r = checkImageChart(imageChart());
  if (!("chart" in r)) throw new Error("bad fixture");
  const named = servedChart(r.chart, { image_url: IMAGE_URL, brand: "lune atelier" });
  assert.deepEqual(Object.keys(named).sort(), ["category", "measurement_basis", "mentions_brand", "note", "read_by", "retailer", "rows", "size_system", "source_type", "source_url", "status", "unit"]);
  assert.equal(named.source_url, IMAGE_URL);
  assert.equal(named.source_type, "retailer_brand_chart");
  assert.equal(named.mentions_brand, true);
  assert.equal(named.status, "machine_read");
  assert.equal(named.read_by, "read-chart-image");
  assert.equal(named.retailer, null);
  const house = servedChart(r.chart, { image_url: IMAGE_URL, brand: "Helsa" });
  assert.equal(house.source_type, "retailer_house_chart");
  assert.equal(house.mentions_brand, false);
  // The extension's sanitiseShopGuide and lookup-chart both read this shape.
  const converted = g.SizerCharts.convertChart({ ...named, rows: named.rows.map((x) => ({ ...x, inseam: null, extra: {}, suspect: null })) });
  assert.ok(converted);
});

Deno.test("the product answer is cut to its fields and limits", () => {
  assert.deepEqual(parseProductAnswer(productAnswer()), { brand: "Lune Atelier", title: "Bias silk midi skirt", kind: "bottoms", sizes: ["XS", "S", "M", "L", "XL"], fabric: "100% silk" });
  const messy = parseProductAnswer(productAnswer({ brand: "  ", kind: "hats", sizes: ["S", "s", "", "x".repeat(30), ...Array.from({ length: 60 }, (_, i) => `${i}`)], fabric: null, title: "t".repeat(400) }));
  assert.ok(messy);
  if (!messy) return;
  assert.equal(messy.brand, null);
  assert.equal(messy.kind, null);
  assert.equal(messy.fabric, null);
  assert.equal(messy.title!.length, 200);
  assert.ok(messy.sizes.length <= 40);
  assert.equal(messy.sizes.filter((s) => s.toUpperCase() === "S").length, 1);
  assert.equal(messy.sizes.some((s) => s.length > 20 || !s), false);
  assert.equal(parseProductAnswer("nope"), null);
  assert.equal(parseProductAnswer({ ...productAnswer(), sizes: "S M" }), null);
});
