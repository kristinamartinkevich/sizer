# HANDOFF — Brand-first size chart lookup

**Goal.** When Sizer meets a brand it has no chart for (today: "Helsa, no size chart yet", a
generic women's chart and a confidence hit), it finds the chart instead of guessing: the brand's
own size guide first, a brand-specific guide on the shop second, the shop's house chart third, the
built-in approximation last. Each chart found is stored once, for every shopper, with its
provenance, and the sheet says exactly which tier answered.

Operator decisions recorded 2026-10-05:
- The brand's own chart always outranks a shop's chart. A shop's generic guide ("Revolve dresses")
  is used only when nothing brand-specific exists, and the sheet says so.
- The model call runs in a Supabase Edge Function. The Anthropic key is a Supabase secret the
  operator sets; it never appears in the repo or the extension package.
- One lookup per brand and item kind, cached for everyone. Cost is one model call per new brand.

---

## 0. How to execute this plan

```
/autonomous-bundle-loop docs/brand-chart-lookup/HANDOFF.md
```

**Before the first run, three one-time setup steps the loop cannot do itself:**

1. The autonomous skills live in `/Users/kristina/app/.claude/skills`. This repo has none.
   Make them visible here once:
   ```bash
   mkdir -p /Users/kristina/sizer/.claude && ln -s /Users/kristina/app/.claude/skills /Users/kristina/sizer/.claude/skills
   ```
   and add `.claude/` to `.gitignore` (the link must not be committed).
2. Run the loop from a session whose working directory is `/Users/kristina/sizer`, on `main`,
   with the tree clean. Worktrees go under `/Users/kristina/sizer/.worktrees/` (also gitignored).
3. `deno --version` and `supabase --version` must both work (B3 writes an Edge Function and its
   tests). Install with `brew install deno supabase/tap/supabase`. `supabase login` and
   `supabase link --project-ref cqvrdsgutpczbucbpiqa` are the operator's, since they need her
   sign-in. If either binary is missing the loop must hard-stop at B3's setup, not skip the tests.

Bundles are **strictly sequential**. B3 needs B1's schema. B4 needs all three.

**Delivery: ONE PR for the whole plan.** The loop runs in its default single-PR mode: each bundle is
built, reviewed and verified in full, then commits to the shared branch `feat/brand-chart-lookup`.
One aggregated PR opens at the end.

**Auto-merge: NOT armed. Push: operator's.** The operator's guard hook refuses `git push` from
Claude in this repo and there is no CI. The ship step therefore stops when the shared branch is
complete and verified, and ends with the exact commands for the operator:
```bash
cd /Users/kristina/sizer && git push -u origin feat/brand-chart-lookup && gh pr create --fill-first --base main
```
Do not attempt the push. Do not arm auto-merge. A refused push is the expected outcome, not an
error to retry.

**Operator steps after the merge** (the plan is not live until these are done, and B4's exit
criteria say so explicitly):
1. Run migrations `0004` and then `0005` in the Supabase SQL editor.
2. `supabase secrets set ANTHROPIC_API_KEY=<key>` then `supabase functions deploy lookup-chart --no-verify-jwt`
   (exact commands and why the flag is needed: `supabase/functions/lookup-chart/README.md`).
3. Bump `version` in `manifest.json`, `sh package.sh`, upload to the Web Store.

To drive a single bundle by hand, copy its §3 launch command into `/autonomous-task` verbatim.

---

## 1. Operating conventions

1.1 **TDD is mandatory.** Write the failing test first, confirm it fails for the expected reason,
then make it pass. A bug fix without a regression test that fails on `git stash` of the fix is
incomplete. Node tests: `node --test tests/`. Deno tests (B3): `deno test supabase/functions/`.
Browser reader checks: `tests/shops.html` served by `python3 tools/serve.py 8766`, opened in a
browser the session can drive (Playwright MCP or the built-in pane), wait for
`window.__shopResults`, must print PASS.

1.2 **Pre-commit gate, no exceptions.** Every bundle runs `node --test tests/` (84 pass after B2)
and, when `src/extract.js` or a fixture changed, the `tests/shops.html` harness (53 checks after B2, PASS).
B3 also runs `deno test`. Any bundle that adds or changes a file under `supabase/migrations/` runs
`sh tools/check-migrations.sh` (added in B1), which applies every migration to a throwaway local
Postgres 16, each file as one transaction the way the SQL editor runs it, and checks what the
anonymous role can read. State the counts in chat before committing.

1.3 **No external libraries.** The extension is plain scripts, no bundler, no npm. The Edge
Function uses only Deno's standard library and `fetch`. No Anthropic SDK: the Messages API is one
`fetch`.

1.4 **Secrets never enter the repo.** The only key in source is the Supabase publishable key
already in `src/charts-store.js`. The Anthropic key lives in Supabase secrets. The service-role key
is read inside the Edge Function from the environment Supabase injects and is never logged,
returned or written anywhere.

1.5 **The engine stays pure.** `src/engine.js`, `src/charts.js`, `src/charts-store.js` and the new
`src/guide-table.js` must keep working under `node --test` with no DOM and no `chrome`. DOM reading
lives in `src/extract.js`; network lives in `src/background.js`.

1.6 **Copy.** User-visible strings are short, plain, no em dashes, no exclamation marks, sentence
case. Provenance wording is fixed in §4 and is not to be reworded per bundle.

1.7 **Privacy wording is part of the feature.** Anything new that leaves the browser is listed in
`store/privacy.html`, `store/LISTING.md` (data disclosure) and `README.md` in the same bundle that
sends it. A reviewer treats a mismatch as a finding.

1.8 **Fixture expectations encode stock on the capture date.** Do not recapture
`tests/fixtures/shops/*.html` in this plan; add to `SHOPS` in `tests/shops.html` only what the
saved pages already contain.

1.9 **Migrations are numbered, append-only, and pasted by the operator.** The next free number is
`0004`. Write it to run cleanly on a project that has 0001 to 0003 applied. Never edit 0001 to 0003.
A bundle verifies its migration with `sh tools/check-migrations.sh` (see 1.2) and extends that
script's anonymous-role checks when it changes what anon may read. The operator's paste into the
dashboard is the deploy, not the test.

1.10 **Commits end with** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## 2. Bundle status surface

| Bundle | Scope | Depends on | Status | PR # | Merge SHA |
|---|---|---|---|---|---|
| **B1** | Chart provenance tiers: schema 0004, bundle view, ranking in the extension, sheet wording | — | [ ] not started | | |
| **B2** | Deterministic shop size-guide table reader (pure parser + DOM finder), fixture checks | — | [ ] not started | | |
| **B3** | Edge Function `lookup-chart`: brand site first, shop guide classified second, cached, capped | B1 | [ ] not started | | |
| **B4** | Extension wiring: ask on a miss, merge the answer, looking-up state, privacy and store copy | B1, B2, B3 | [ ] not started | | |

---

## 3. Per-bundle launch commands

Worktree root on this machine is `/Users/kristina/sizer/.worktrees/`. The main checkout is the
operator's and must not be branch-switched.

### 3.1 · B1 — Chart provenance tiers

```
Implement bundle B1 of docs/brand-chart-lookup/HANDOFF.md.

Branch: feat/brand-chart-lookup
Worktree: /Users/kristina/sizer/.worktrees/brand-chart-lookup-b1

Scope: §4 and §5 of the HANDOFF, nothing of §6 or §7.

1. Migration supabase/migrations/0004_chart_provenance.sql:
   - add enum value 'machine_read' to chart_status, and 'retailer_house_chart' to source_type;
   - add size_charts.read_by text (null for human research, 'lookup-chart' for the function)
     and size_charts.lookup_note text (the model's one-line justification, for review);
   - recreate the chart_bundle view so it returns charts with status in ('verified',
     'machine_read') and each chart carries status, source_type and retailer;
   - relax the two public-read RLS policies the same way;
   - keep the partial index on verified charts and add one on (brand_id, category) where
     status = 'machine_read'.
   The file must be pasteable as a whole into the SQL editor on a project with 0001–0003
   applied. Read 0001 and 0002 first; the view body in 0002 is the one to extend.

2. src/charts.js: pickChart ranks candidates by the §4 tier before category order, so a verified
   brand_site chart beats a machine_read one, which beats any retailer_house_chart, within the
   same CHARTS_FOR order. toBrand carries { tier, status, sourceType, retailer, readBy,
   retrievedOn } into brand.source. convertChart keeps dropping suspect rows.

3. src/engine.js: a brand resolved from a machine_read chart scores 0.1 below a verified one;
   a retailer_house_chart scores 0.2 below. The firmUp sentence for those cases is the §4 wording.
   The generic-chart case keeps its current sentence.

4. src/content.js: the Brand fact and the sheet footer use the §4 wording per tier, with the
   source link and the read date. "no size chart yet" remains only for the built-in/generic case.

Tests first (node --test tests/): bundle-engine.test.js gets a fixture bundle with the same brand
carrying one chart per tier and asserts the pick order, the score deltas and the footer strings;
charts-store.test.js asserts normalise keeps status/source_type/retailer on each chart. Do not
touch src/extract.js.

Exit: node --test tests/ green with the new cases; migration file reviewed line by line against
0001/0002; no fixture or copy outside §4 changed.
```

### 3.2 · B2 — Shop size-guide table reader

```
Implement bundle B2 of docs/brand-chart-lookup/HANDOFF.md.

Branch: feat/brand-chart-lookup
Worktree: /Users/kristina/sizer/.worktrees/brand-chart-lookup-b2

Scope: §6 of the HANDOFF only.

1. New src/guide-table.js (pure, node-testable, no DOM): parseGuideMatrix(matrix, hints) takes a
   2-D array of cell strings (header row(s) + body rows) plus { brand, unit? } and returns either
   null or a chart in the §5 JSON shape: category guessed from the header words (waist+hip →
   'bottoms', bust+waist+hip → 'general', foot length → 'shoes'), unit from a header or a
   hint ("cm", "in", "inches"), rows with label and [min,max] ranges (a single number becomes
   [n,n]; "27-28" and "27–28" and "27 to 28" are ranges; "27½" and "27 1/2" are 27.5), size
   labels taken from the first column whose values look like sizes (XS..XXL, 00..24, 23..40,
   EU 32..52, UK 4..20), both orientations (sizes across the top or down the side). It also
   returns mentionsBrand: whether any cell or the caption names the brand.

2. src/extract.js: sizeGuideTables(doc, brand) finds <table> elements, and role="table"
   grids, in or near an element whose text or attributes match /size (guide|chart)/i, converts
   each to a matrix (colspan expanded, whitespace collapsed) and returns the parsed charts plus
   the guide's caption text. The CHROME/REVIEW_AREA exclusions from the existing reader apply.
   extractProduct exposes it as product.shopGuide = { charts, caption } or null.

3. tests/shops.html: none of the four saved shops carries a size chart in its DOM (see §6, corrected
   2026-10-05 after reading the Revolve fixture). Revolve's two tables inside
   #size-guide-measurements-1 are the model's measurements and the garment's dimensions; both must be
   rejected as charts, so assert shopGuide.charts is empty on Revolve and shopGuide is null on the
   other three. Add a fifth, synthetic fixture tests/fixtures/shops/inline-guide.html (a brand page
   with an inline women's size table, sizes across the top, cm) and assert one parsed chart there.
   Keep the existing 37 checks.

Tests first: tests/guide-table.test.js with matrices copied from real guides (Revolve dresses in
inches, a Zalando brand chart in cm with sizes across the top, an ASOS-style "UK EU US waist hip"
table, a shoe table with foot length, and three non-charts that must return null: a delivery
table, a composition table, a review table).

Exit: node --test tests/ green; tests/shops.html PASS with the new Revolve checks; no change to
what the four fixtures already assert.
```

### 3.3 · B3 — Edge Function `lookup-chart`

```
Implement bundle B3 of docs/brand-chart-lookup/HANDOFF.md.

Branch: feat/brand-chart-lookup
Worktree: /Users/kristina/sizer/.worktrees/brand-chart-lookup-b3

Scope: §7 of the HANDOFF only. Setup check first: `deno --version` and `supabase --version`
must both succeed; if not, hard-stop and name the brew command from §0.

1. supabase/functions/lookup-chart/index.ts (Deno, std only): POST { brand, kind, shop,
   install, shopGuide? } → { chart | null, tier, note }. Steps in order:
   a. validate input (brand ≤ 80 chars, kind in bottoms|tops|dresses|shoes, shop a hostname,
      install a uuid); 400 otherwise.
   b. cache: select from size_charts joined to brands by alias for this brand + the CHARTS_FOR
      categories of the kind, status in (verified, machine_read); if a chart exists return it
      with its tier. If a 'no_chart' marker exists in chart_lookups younger than 30 days return
      { chart: null, tier: 'none' }.
   c. caps: chart_lookups counts; 20 per install per day, 300 per day globally; 429 beyond.
   d. the model call (one fetch to https://api.anthropic.com/v1/messages, model
      claude-sonnet-5, web_search and web_fetch tools with max_uses 6 each, default sampling; see the
      B3 notes, Sonnet 5 rejects a temperature override): find the
      brand's own women's size guide for this kind of item on the brand's site; if found return
      the chart in the §5 JSON with source_url, unit, measurement_basis, and tier 'brand_site'.
      If the brand site has none and shopGuide was sent, judge whether the shop's table is that
      brand's (names the brand, or the shop labels it as the brand's) → 'retailer_brand_chart',
      else 'retailer_house_chart'. If nothing at all, return null with a one-line reason.
      Use a strict JSON schema via tool-use for the final answer, so the function never parses
      free text.
   e. validate the chart (≥ 2 rows, labels unique, ranges monotonic, unit known); on failure
      store a 'no_chart' marker with the reason and return null.
   f. upsert brands (alias added), size_charts (status machine_read, read_by 'lookup-chart',
      lookup_note, retrieved_on today) and size_chart_rows via the service-role client built from
      SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from Deno.env. Record the lookup in chart_lookups.
      Return the stored chart in the bundle's per-chart shape.

2. Migration supabase/migrations/0005_chart_lookups.sql: table chart_lookups (id, brand,
   kind, shop, install uuid, outcome text check in ('chart','no_chart','error'), reason text,
   created_at), RLS on, no policies (the function writes with the service role). Index on
   (install, created_at) and (created_at).

3. Prompt lives in supabase/functions/lookup-chart/prompt.ts as a plain template string,
   with the §5 schema inlined. The brand-first rule from §4 is stated in the prompt verbatim.

Tests first (deno test supabase/functions/): the handler is written against injected fetch and
db clients so tests cover: cache hit returns without a model call; caps return 429; a model
answer in the schema is validated and stored; an out-of-schema or non-monotonic answer stores a
no_chart marker; a retailer table that names the brand becomes retailer_brand_chart, one that
does not becomes retailer_house_chart; the brand-site answer wins even when a shop guide was
sent. No test touches the network.

Exit: deno test green; node --test tests/ unchanged and green; a README section under
supabase/functions/lookup-chart/ with the exact deploy and secret commands; nothing in the
extension changed.
```

### 3.4 · B4 — Extension wiring, privacy and store copy

```
Implement bundle B4 of docs/brand-chart-lookup/HANDOFF.md.

Branch: feat/brand-chart-lookup
Worktree: /Users/kristina/sizer/.worktrees/brand-chart-lookup-b4

Scope: §8 of the HANDOFF.

1. src/charts-store.js: LOOKUP_URL = `${SUPABASE_URL}/functions/v1/lookup-chart`; pure helpers
   mergeChart(bundle, brandEntry) (adds or replaces the brand's chart of that category, keeps
   fetchedAt) and missKey(brand, kind); a negative-cache TTL of 7 days.

2. src/background.js: handler 'sizer:lookup-chart' { brand, kind, shop, shopGuide } → checks
   storage.local `miss:<key>`; otherwise POSTs to LOOKUP_URL with the publishable key headers,
   the install id from installId(), and shopGuide when present; on a chart, merges it into the
   stored bundle (storage.onChanged already re-runs the page) and replies { found: true }; on
   null stores the miss and replies { found: false }; on error replies { found: false, error }
   without storing a miss. One in-flight lookup per key.

3. src/content.js: when Engine.recommend reports no brand chart (brandKnown false) and the
   product has a brand, show the line in its reading state with "Looking up <brand>'s size
   chart" and send 'sizer:lookup-chart' with product.shopGuide; a found answer re-renders via
   storage.onChanged; a miss renders the generic answer as today. A 6 s timeout falls back to
   the generic answer. Never block the first paint on the lookup.

4. Copy: the §4 strings in the Brand fact and footer. Privacy: store/privacy.html gets a
   paragraph stating exactly what a lookup sends (brand name, item kind, shop hostname, a random
   install id, and the shop's size-guide table text when the page has one; never the profile,
   never the page address). store/LISTING.md data disclosure and README.md "How it decides"
   step 2 updated to match. PRODUCT_HUNT.md checklist gets the deploy + migration lines.

5. tests/fixture-shop.html gets a `?brand=unknown` switch that renders the looking-up state
   with a stubbed chrome.runtime (tests/chrome-stub.js) answering after 500 ms, for the visual
   check and a store screenshot later.

Tests first: tests/lookup.test.js for mergeChart, missKey and the TTL; a content-level test of
the reading-state and timeout copy through the existing render functions where they are pure.

Exit: node --test tests/ green; tests/shops.html PASS; the four privacy/listing/readme texts say
the same thing; package.sh output includes src/guide-table.js; the final summary states plainly
that the feature is live only after the operator runs 0004 and 0005, sets the secret and deploys
the function.
```

---

## 4. Provenance tiers and wording

Highest tier wins. Within a tier the existing `CHARTS_FOR` category order applies.

| Tier | source_type | status | Sheet: Brand fact | Sheet: footer |
|---|---|---|---|---|
| 1 | brand_site | verified | `Helsa` | `Chart from Helsa's size guide, 12 Sep 2026` (link) |
| 2 | retailer_brand_chart | verified | `Helsa` | `Chart from Helsa's size guide on Revolve, 12 Sep 2026` |
| 3 | brand_site | machine_read | `Helsa, chart read by machine` | `Chart read from helsastudio.com on 5 Oct 2026, not yet checked by a person` |
| 4 | retailer_brand_chart | machine_read | `Helsa, chart read by machine` | `Chart read from Helsa's guide on Revolve, 5 Oct 2026, not yet checked by a person` |
| 5 | retailer_house_chart | any | `Helsa, using Revolve's general chart` | `Revolve's general size guide, not Helsa's own, 5 Oct 2026` |
| 6 | built-in approximation | n/a | `rag & bone` (as today) | `Size charts are approximate.` (as today) |
| 7 | generic | n/a | `Helsa, no size chart yet` | `Size charts are approximate.` |

Confidence: tier 3 and 4 score 0.1 below tier 1, tier 5 scores 0.2 below. The firmUp line for
tier 3 and 4: "This chart was read by machine and not yet checked by a person." For tier 5:
"This is Revolve's general chart, not Helsa's own."

A human flipping a `machine_read` chart to `verified` in the dashboard promotes it to tier 1 or
2 with no code change. A `retired` chart is never served.

---

## 5. Chart JSON contract (shared by B2, B3 and the bundle)

```json
{
  "category": "bottoms | jeans | trousers | tops | dresses | general | shoes",
  "unit": "cm | in",
  "measurement_basis": "body | garment",
  "size_system": "denim_waist | eu | us | uk | it | fr | letter | mixed",
  "source_url": "https://…",
  "source_type": "brand_site | retailer_brand_chart | retailer_house_chart",
  "retailer": "revolve.com | null",
  "mentions_brand": true,
  "rows": [
    { "label": "XS", "waist": [62, 66], "hip": [88, 92], "bust": [80, 84], "foot_length": null, "aliases": { "us": "2" } }
  ],
  "note": "one line on where it was found and why it is the brand's own"
}
```

Rows must be at least two, labels unique, each present measurement monotonic non-decreasing down
the rows. This is exactly what `convertChart` in `src/charts.js` already reads once it is stored
through `chart_bundle`.

---

## 6. Shop guide reading (B2)

What the four saved shops actually expose, verified 2026-10-05 against the fixtures (Revolve line
corrected during the run after reading the markup):
- **Revolve**: two tables in the DOM inside `#size-guide-measurements-1`, but neither is a size
  chart. One is "Model Info" (the model's waist, bust and hips and the size she wears), the other
  "Dimensions du produit" (inseam, rise, knee, hem of this garment). The real chart is fetched on
  click from a same-origin `pdpSizeGuideUrl` (`/r/ajax/sizeguide/views/<markup>.jsp?...`) declared
  in the page script. The two tables are B2's best negative fixtures. The model row is a useful fit
  signal for a later plan, not this one.
- **ASOS**: the guide is fetched from `api.asos.com/api/sizing/...` on click. Not in the DOM.
- **Net-a-Porter**: a size guide link opens a scripted panel. Not in the DOM.
- **Zalando**: a size-guide script bundle, loaded on click. Not in the DOM.

So on the four saved shops B2's finder correctly finds no chart. Its value is on pages that do
inline the table, which brand sites (Shopify size-guide pages, many DTC labels) commonly do, proven
by the synthetic fixture. B2 must not click, fetch or wait for anything; the brand-site lookup in
B3 is what covers the scripted shops.

---

## 7. The lookup function (B3)

Sequence for a miss, as seen by the extension:

1. Content script detects no brand chart for this kind of item and sends the lookup message.
2. Background checks the 7-day negative cache, then POSTs to the function.
3. Function checks its cache (a chart already stored by any shopper, or a 30-day no-chart marker),
   then caps, then asks the model with the brand-first rule.
4. The chart is stored as `machine_read` and returned; background merges it into the local
   bundle; the page re-renders with the tier-3 wording. The next day's bundle refresh carries it
   for everyone.

Model: `claude-sonnet-5`, default sampling (it rejects a temperature override, so none is sent),
`web_search` and `web_fetch` tools, at most 6 uses of each (the API caps per tool),
final answer forced through a tool with the §5 schema. Haiku was considered and rejected for this
step: table reading across unfamiliar brand sites is where accuracy matters and the call happens
once per brand.

Caps: 20 lookups per install per day, 300 per day globally, each enforced in the function from
`chart_lookups`. The extension's own negative cache keeps repeat visits to a chartless brand from
spending any of it.

---

## 8. Extension wiring (B4)

States of the line, in order, for an unknown brand:
1. `Sizing this for you` (existing reading state)
2. `Looking up Helsa's size chart` (new, at most 6 s)
3. The answer, in tier-3/4/5 wording, or the generic answer with "no size chart yet" on a miss.

The lookup never blocks the first answer on a brand that already has any chart. A failed network
call is silent: the generic answer renders and no miss is stored, so the next visit tries again.

---

## 9. Verification the loop can run, and what only the operator can

Loop-runnable, per bundle (see 1.1 and 1.2): node tests, Deno tests, the fixture harness, the
demo shop with `?brand=unknown`.

Operator-only, after merge: run 0004 and 0005 in the SQL editor; set the secret; deploy the
function; reload the extension; open the Helsa dress on revolveclothing.fr and confirm the sheet
reads "Helsa, chart read by machine" with a helsastudio.com link; then open the same brand on a
second shop and confirm no second lookup is made (the bundle already carries it). Check the
`size_charts` row in the dashboard and flip it to `verified` if it is right.

---

## 11. Out of scope

- Men's charts, and any gender other than women, in the lookup prompt.
- Clicking, fetching or waiting for scripted size guides on ASOS, Net-a-Porter or Zalando.
- A review UI for machine-read charts; the Supabase dashboard is the review surface.
- Recapturing the shop fixtures.
- Shoe lookups beyond what the §5 shape already allows (foot_length rows are accepted, not
  specially prompted for).
- Any change to the review-pooling feature from migration 0003.
