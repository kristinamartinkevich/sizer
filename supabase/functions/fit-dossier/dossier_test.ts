import assert from "node:assert/strict";
import { checkAnswer, KINDS, parseDossierInput, urlKey } from "./dossier.ts";
import { KINDS as LOOKUP_KINDS } from "../lookup-chart/chart.ts";
import { BLOG_URL, BODY, dossierAnswer, REVIEW_URL } from "./test_helpers.ts";

Deno.test("kinds are the same as lookup-chart's", () => {
  assert.deepEqual([...KINDS], [...LOOKUP_KINDS]);
});

Deno.test("a well-formed body parses, the shop lowercased and areas kept", () => {
  const parsed = parseDossierInput({ ...BODY, shop: "WWW.RevolveClothing.fr" });
  assert.ok(parsed.ok);
  assert.equal(parsed.input.shop, "www.revolveclothing.fr");
  assert.deepEqual(parsed.input.tallies, BODY.tallies);
});

Deno.test("validation rejects anything outside the whitelist", () => {
  const t = BODY.tallies;
  const bad: unknown[] = [
    null,
    [],
    "x",
    { ...BODY, item_key: "Helsa|WD1" },
    { ...BODY, item_key: "helsa-wd1" },
    { ...BODY, item_key: "a".repeat(118) + "|b1" },
    { ...BODY, brand: "" },
    { ...BODY, brand: "b".repeat(81) },
    { ...BODY, style: "" },
    { ...BODY, style: "s".repeat(81) },
    { ...BODY, kind: "hats" },
    { ...BODY, shop: "https://revolve.com/x" },
    { ...BODY, install: "not-a-uuid" },
    { ...BODY, page: "https://revolve.com/x" },
    { ...BODY, profile: { waist: 70 } },
    { ...BODY, tallies: undefined },
    { ...BODY, tallies: { ...t, small: -1 } },
    { ...BODY, tallies: { ...t, small: 1.5 } },
    { ...BODY, tallies: { ...t, large: "2" } },
    { ...BODY, tallies: { ...t, total: 2 } },
    { ...BODY, tallies: { ...t, total: 5001 } },
    { ...BODY, tallies: { ...t, text: "runs small" } },
    { ...BODY, tallies: { ...t, areas: { neck: 1 } } },
    { ...BODY, tallies: { ...t, areas: { bust: -1 } } },
    { ...BODY, tallies: { ...t, areas: { bust: { snug: 1 } } } },
    { ...BODY, tallies: { ...t, areas: { bust: { tight: 0.5 } } } },
    { ...BODY, tallies: { ...t, areas: [] } },
  ];
  for (const body of bad) {
    const parsed = parseDossierInput(body);
    assert.equal(parsed.ok, false, JSON.stringify(body));
    if (!parsed.ok) assert.ok(parsed.error.length > 0);
  }
});

Deno.test("every whitelisted area is accepted, as a count or as direction counts", () => {
  const areas = { bust: 1, chest: { loose: 2 }, waist: 0, hip: { tight: 1, loose: 1 }, length: { long: 3 }, inseam: { short: 1 }, shoulder: 1, sleeve: 1, foot: 2 };
  assert.ok(parseDossierInput({ ...BODY, tallies: { ...BODY.tallies, areas } }).ok);
  assert.ok(parseDossierInput({ ...BODY, tallies: { small: 0, large: 0, tts: 0, total: 0, areas: {} } }).ok);
});

Deno.test("urlKey compares host and path, ignoring scheme, www, query, fragment and a trailing slash", () => {
  assert.equal(urlKey("https://www.Example.com/a/b/?utm=1#x"), "example.com/a/b");
  assert.equal(urlKey("http://example.com/a/b"), "example.com/a/b");
  assert.equal(urlKey("https://example.com/"), "example.com");
  assert.equal(urlKey("javascript:alert(1)"), null);
  assert.equal(urlKey("not a url"), null);
});

Deno.test("a source whose page no search returned is dropped; the rest are kept", () => {
  const res = checkAnswer(dossierAnswer(), [REVIEW_URL]);
  assert.ok(res.ok);
  assert.deepEqual(res.dossier.sources.map((s) => s.url), [REVIEW_URL]);
  assert.equal(res.dossier.verdict, "small");
});

Deno.test("a source on a searched host but another path is dropped", () => {
  const res = checkAnswer(dossierAnswer({ sources: [{ url: "https://www.revolveclothing.fr/other/", title: "x" }] }), [REVIEW_URL]);
  assert.ok(res.ok);
  assert.deepEqual(res.dossier.sources, []);
});

Deno.test("a verdict with no surviving source becomes null, with nothing else unsourced kept", () => {
  const res = checkAnswer(dossierAnswer(), []);
  assert.ok(res.ok);
  assert.deepEqual(res.dossier, { verdict: null, strength: 0, areas: [], brand_note: null, sources: [] });
});

Deno.test("notes are trimmed to their limits, unknown areas and directions dropped, duplicates merged", () => {
  const res = checkAnswer(dossierAnswer({
    areas: [
      { area: "bust", direction: "tight", note: "  " + "n".repeat(200) },
      { area: "bust", direction: "tight", note: "again" },
      { area: "neck", direction: "tight", note: "x" },
      { area: "hip", direction: "snug", note: "x" },
      { area: "length", direction: "long", note: "Falls below the knee." },
    ],
    brand_note: "b".repeat(250),
  }), [REVIEW_URL, BLOG_URL]);
  assert.ok(res.ok);
  assert.equal(res.dossier.areas.length, 2);
  assert.equal(res.dossier.areas[0].note.length, 140);
  assert.equal(res.dossier.areas[1].area, "length");
  assert.equal(res.dossier.brand_note?.length, 200);
});

Deno.test("a null verdict carries strength 0; an empty brand note is null", () => {
  const res = checkAnswer(dossierAnswer({ verdict: null, strength: 0.9, brand_note: "  " }), [REVIEW_URL, BLOG_URL]);
  assert.ok(res.ok);
  assert.equal(res.dossier.verdict, null);
  assert.equal(res.dossier.strength, 0);
  assert.equal(res.dossier.brand_note, null);
});

Deno.test("an answer outside the schema is rejected", () => {
  for (const bad of [
    null,
    dossierAnswer({ verdict: "huge" }),
    dossierAnswer({ strength: 1.5 }),
    dossierAnswer({ strength: -0.1 }),
    dossierAnswer({ strength: "0.5" }),
    dossierAnswer({ areas: "tight" }),
    dossierAnswer({ sources: null }),
    dossierAnswer({ brand_note: 3 }),
  ]) {
    assert.equal(checkAnswer(bad, [REVIEW_URL, BLOG_URL]).ok, false, JSON.stringify(bad));
  }
});
