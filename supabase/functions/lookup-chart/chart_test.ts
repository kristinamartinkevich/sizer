import assert from "node:assert/strict";
import "../../../src/charts.js";
import {
  brandSlug,
  CHARTS_FOR,
  KINDS,
  normaliseBrand,
  parseLookupInput,
  pickBest,
  tierOf,
  toBundleChart,
  usable,
  validateAnswer,
} from "./chart.ts";
import { brandChart, INSTALL, retailerChart, shopGuide, storedChart } from "./test_helpers.ts";

// deno-lint-ignore no-explicit-any
const SizerCharts = (globalThis as any).SizerCharts;

const ctx = { kind: "dresses" as const, shop: "www.revolveclothing.fr", shopGuideSent: false, fetched: ["https://helsastudio.com/pages/size-guide"] };

// The extension knows coats and jackets as their own kind but asks the function for a tops chart
// (lookupFor in src/engine.js), so the function serves four kinds and is compared on those.
const servedKinds = (all: Record<string, unknown>) => Object.fromEntries(Object.entries(all).filter(([k]) => (KINDS as readonly string[]).includes(k)));

Deno.test("CHARTS_FOR and tierOf match src/charts.js exactly, on the kinds the function serves", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(CHARTS_FOR)), JSON.parse(JSON.stringify(servedKinds(SizerCharts.CHARTS_FOR))));
  assert.deepEqual(SizerCharts.CHARTS_FOR.outerwear, SizerCharts.CHARTS_FOR.tops, "outerwear is asked for as tops, so it must read the same charts");
  for (const source_type of ["brand_site", "retailer_brand_chart", "retailer_house_chart", undefined]) {
    for (const status of ["verified", "machine_read", undefined]) {
      assert.equal(tierOf({ source_type, status }), SizerCharts.tierOf({ source_type, status }), `${source_type}/${status}`);
    }
  }
});

Deno.test("brand names become a lowercase alias and a slug in the seed's style", async () => {
  assert.equal(normaliseBrand("  Rag &   Bone "), "rag & bone");
  assert.equal(await brandSlug("rag & bone"), "rag-bone");
  assert.equal(await brandSlug("helsa"), "helsa");
  assert.equal(await brandSlug("acne studios"), "acne-studios");
  assert.equal(await brandSlug("sézane"), "sezane");
  const kanji = await brandSlug("東京");
  assert.match(kanji, /^b-[0-9a-f]{12}$/);
  assert.equal(await brandSlug("東京"), kanji);
});

Deno.test("input: a valid request is accepted and the shop guide loses its page address", () => {
  const r = parseLookupInput({ brand: " Helsa ", kind: "dresses", shop: "WWW.RevolveClothing.fr", install: INSTALL.toUpperCase(), shopGuide: shopGuide(true) });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.input.brand, "Helsa");
  assert.equal(r.input.alias, "helsa");
  assert.equal(r.input.shop, "www.revolveclothing.fr");
  assert.equal(r.input.install, INSTALL);
  assert.ok(r.input.shopGuide);
  assert.equal(JSON.stringify(r.input.shopGuide).includes("helsa-dress/dp"), false);
  assert.equal(r.input.shopGuide?.caption, "Helsa size guide");
});

Deno.test("input: every bad field is refused", () => {
  const good = { brand: "Helsa", kind: "dresses", shop: "revolve.com", install: INSTALL };
  const bad: [string, unknown][] = [
    ["not an object", "Helsa"],
    ["brand missing", { ...good, brand: undefined }],
    ["brand blank", { ...good, brand: "   " }],
    ["brand 81 characters", { ...good, brand: "x".repeat(81) }],
    ["kind unknown", { ...good, kind: "hats" }],
    ["shop with a path", { ...good, shop: "revolve.com/dresses" }],
    ["shop with a scheme", { ...good, shop: "https://revolve.com" }],
    ["shop without a dot", { ...good, shop: "localhost" }],
    ["install not a uuid", { ...good, install: "abc" }],
    ["shopGuide not an object", { ...good, shopGuide: "table" }],
    ["shopGuide charts not a list", { ...good, shopGuide: { charts: {}, caption: "" } }],
    ["shopGuide caption not text", { ...good, shopGuide: { charts: [], caption: 3 } }],
    ["shopGuide too large", { ...good, shopGuide: { charts: [{ note: "x".repeat(30001) }], caption: "" } }],
  ];
  for (const [name, body] of bad) assert.equal(parseLookupInput(body).ok, false, name);
  assert.equal(parseLookupInput({ ...good, brand: "x".repeat(80) }).ok, true, "80 characters is allowed");
  assert.equal(parseLookupInput({ ...good, shopGuide: null }).ok, true, "a null shop guide is allowed");
});

Deno.test("answer: a brand-site chart in the contract is accepted as it is", () => {
  const v = validateAnswer({ found: true, reason: "", chart: brandChart() }, ctx);
  assert.ok(v.ok);
  if (!v.ok || !v.answer.found) throw new Error("expected a chart");
  assert.equal(v.answer.chart.source_type, "brand_site");
  assert.equal(v.answer.chart.retailer, null);
  assert.equal(v.answer.chart.rows.length, 3);
});

Deno.test("answer: found false keeps the one-line reason", () => {
  const v = validateAnswer({ found: false, reason: "Helsa publishes no size guide.", chart: null }, ctx);
  assert.deepEqual(v, { ok: true, answer: { found: false, reason: "Helsa publishes no size guide.", chart: null } });
});

Deno.test("answer: out-of-schema and impossible charts are rejected with a reason", () => {
  const rows = brandChart().rows;
  const cases: [string, unknown, RegExp][] = [
    ["not an object", "chart", /not an object/],
    ["found missing", { reason: "", chart: brandChart() }, /found/],
    ["chart missing", { found: true, reason: "", chart: null }, /chart/],
    ["unknown unit", { found: true, reason: "", chart: brandChart({ unit: "mm" }) }, /unit/],
    ["unknown category", { found: true, reason: "", chart: brandChart({ category: "hats" }) }, /category/],
    ["category does not answer for dresses", { found: true, reason: "", chart: brandChart({ category: "jeans" }) }, /does not answer/],
    ["unknown basis", { found: true, reason: "", chart: brandChart({ measurement_basis: "flat" }) }, /basis/],
    ["unknown size system", { found: true, reason: "", chart: brandChart({ size_system: "jp" }) }, /size system/],
    ["unknown source type", { found: true, reason: "", chart: brandChart({ source_type: "blog" }) }, /source type/],
    ["script address", { found: true, reason: "", chart: brandChart({ source_url: "javascript:alert(1)" }) }, /web address/],
    ["one row", { found: true, reason: "", chart: brandChart({ rows: rows.slice(0, 1) }) }, /two rows/],
    ["repeated labels", { found: true, reason: "", chart: brandChart({ rows: [rows[0], { ...rows[1], label: " xs " }, rows[2]] }) }, /repeat/],
    ["range of three numbers", { found: true, reason: "", chart: brandChart({ rows: [{ ...rows[0], waist: [1, 2, 3] }, rows[1], rows[2]] }) }, /range/],
    ["range as text", { found: true, reason: "", chart: brandChart({ rows: [{ ...rows[0], hip: ["88", "92"] }, rows[1], rows[2]] }) }, /range/],
    ["min above max", { found: true, reason: "", chart: brandChart({ rows: [{ ...rows[0], waist: [66, 62] }, rows[1], rows[2]] }) }, /above/],
    ["waist goes down", { found: true, reason: "", chart: brandChart({ rows: [rows[0], { ...rows[1], waist: [60, 64] }, rows[2]] }) }, /goes down/],
    ["hip max goes down", { found: true, reason: "", chart: brandChart({ rows: [rows[0], rows[1], { ...rows[2], hip: [96, 95.5] }] }) }, /above|goes down/],
    ["blank label", { found: true, reason: "", chart: brandChart({ rows: [{ ...rows[0], label: " " }, rows[1], rows[2]] }) }, /label/],
    ["alias as a number", { found: true, reason: "", chart: brandChart({ rows: [{ ...rows[0], aliases: { us: 2 } }, rows[1], rows[2]] }) }, /aliases/],
    ["unknown row field", { found: true, reason: "", chart: brandChart({ rows: [{ ...rows[0], thigh: [50, 52] }, rows[1], rows[2]] }) }, /unknown field/],
  ];
  for (const [name, raw, reason] of cases) {
    const v = validateAnswer(raw, ctx);
    assert.equal(v.ok, false, name);
    if (!v.ok) assert.match(v.reason, reason, name);
  }
});

Deno.test("answer: a clothing chart needs waist and hip on two rows, a shoe chart foot length", () => {
  const bustWaist = brandChart({
    rows: brandChart().rows.map((r) => ({ ...r, hip: null })),
  });
  const v = validateAnswer({ found: true, reason: "", chart: bustWaist }, ctx);
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.reason, /waist and hip/);

  const shoeRows = [
    { label: "37", waist: null, hip: null, bust: null, foot_length: [23.4, 23.7], aliases: { us: "6.5", uk: "4", eu: null, it: null, fr: null, letter: null } },
    { label: "38", waist: null, hip: null, bust: null, foot_length: [24.1, 24.4], aliases: { us: "7.5", uk: "5", eu: null, it: null, fr: null, letter: null } },
  ];
  const shoes = brandChart({ category: "shoes", size_system: "eu", rows: shoeRows });
  assert.equal(validateAnswer({ found: true, reason: "", chart: shoes }, { ...ctx, kind: "shoes" }).ok, true);
  const noFoot = brandChart({ category: "shoes", size_system: "eu", rows: shoeRows.map((r) => ({ ...r, foot_length: null })) });
  const nf = validateAnswer({ found: true, reason: "", chart: noFoot }, { ...ctx, kind: "shoes" });
  assert.equal(nf.ok, false);
  if (!nf.ok) assert.match(nf.reason, /foot length/);
});

Deno.test("answer: a shop table that names the brand is the brand's chart on that shop, else the shop's own", () => {
  const withGuide = { ...ctx, shopGuideSent: true };
  const named = validateAnswer({ found: true, reason: "", chart: retailerChart(true) }, withGuide);
  assert.ok(named.ok && named.answer.found);
  if (named.ok && named.answer.found) {
    assert.equal(named.answer.chart.source_type, "retailer_brand_chart");
    assert.equal(named.answer.chart.retailer, "revolveclothing.fr");
    assert.equal(named.answer.chart.source_url, "https://www.revolveclothing.fr/r/sizeguide");
  }
  const house = validateAnswer({ found: true, reason: "", chart: retailerChart(false) }, withGuide);
  assert.ok(house.ok && house.answer.found);
  if (house.ok && house.answer.found) assert.equal(house.answer.chart.source_type, "retailer_house_chart");

  // The label follows mentions_brand, whatever source_type the model wrote beside it.
  const mislabelled = validateAnswer({ found: true, reason: "", chart: { ...retailerChart(false), source_type: "retailer_brand_chart" } }, withGuide);
  assert.ok(mislabelled.ok && mislabelled.answer.found);
  if (mislabelled.ok && mislabelled.answer.found) assert.equal(mislabelled.answer.chart.source_type, "retailer_house_chart");

  // A shop chart from another host keeps the shop's own address, never a third site's.
  const elsewhere = validateAnswer({ found: true, reason: "", chart: { ...retailerChart(true), source_url: "https://example.org/guide" } }, withGuide);
  assert.ok(elsewhere.ok && elsewhere.answer.found);
  if (elsewhere.ok && elsewhere.answer.found) assert.equal(elsewhere.answer.chart.source_url, "https://www.revolveclothing.fr/");

  // Without a shop guide in the request, a shop chart is not an answer the function asked for.
  const unasked = validateAnswer({ found: true, reason: "", chart: retailerChart(true) }, ctx);
  assert.equal(unasked.ok, false);
});

Deno.test("bundle shape: a stored chart comes back as chart_bundle serves it and convertChart reads it", () => {
  const chart = toBundleChart(storedChart({ status: "machine_read", read_by: "lookup-chart" }));
  assert.deepEqual(Object.keys(chart).sort(), [
    "category", "fit_advice", "fit_line", "gender", "id", "measurement_basis", "read_by", "retailer", "retrieved_on", "rows",
    "size_system", "source_archive_url", "source_type", "source_url", "status", "unit",
  ]);
  assert.deepEqual(chart.rows[0], {
    label: "XS", aliases: {}, bust: null, waist: [62, 66], hip: [88, 92], inseam: null, foot_length: null, extra: {}, suspect: null,
  });
  const converted = SizerCharts.convertChart(chart);
  assert.ok(converted);
  assert.equal(converted.source.tier, 3);
  assert.equal(converted.rows.length, 3);
});

Deno.test("usable agrees with convertChart, and pickBest ranks by tier then category order", () => {
  const good = toBundleChart(storedChart());
  const suspect = toBundleChart(storedChart({
    size_chart_rows: storedChart().size_chart_rows.map((r, i) => ({ ...r, suspect: i > 0, suspect_note: i > 0 ? "typo" : null })),
  }));
  const noHip = toBundleChart(storedChart({
    size_chart_rows: storedChart().size_chart_rows.map((r) => ({ ...r, hip_min: null, hip_max: null })),
  }));
  for (const c of [good, suspect, noHip]) assert.equal(usable(c), SizerCharts.convertChart(c) !== null);

  const generalVerified = toBundleChart(storedChart({ id: "g", category: "general" }));
  const dressesHouse = toBundleChart(storedChart({ id: "d", source_type: "retailer_house_chart", retailer: "revolve.com" }));
  const dressesMachine = toBundleChart(storedChart({ id: "m", status: "machine_read", read_by: "lookup-chart" }));
  assert.equal(pickBest([dressesHouse, generalVerified, dressesMachine], "dresses")?.id, "g");
  assert.equal(pickBest([dressesHouse, dressesMachine], "dresses")?.id, "m");
  assert.equal(pickBest([suspect, noHip], "dresses"), null);
});

Deno.test("answer: a brand-site chart needs a page on its host that the model fetched", () => {
  const raw = { found: true, reason: "", chart: brandChart() };
  const none = validateAnswer(raw, { ...ctx, fetched: [] });
  assert.equal(none.ok, false);
  if (!none.ok) assert.match(none.reason, /never read/);
  assert.equal(validateAnswer(raw, { ...ctx, fetched: ["https://example.org/helsa"] }).ok, false, "another host");
  assert.equal(validateAnswer(raw, { ...ctx, fetched: ["https://www.helsastudio.com/collections/dresses"] }).ok, true, "same host, www ignored");
  assert.equal(validateAnswer({ found: true, reason: "", chart: brandChart({ source_url: "https://shop.helsastudio.com/size" }) }, { ...ctx, fetched: ["https://helsastudio.com/"] }).ok, false, "a subdomain is another host");
});
