# autonomous-task notes — feat/brand-chart-lookup · Bundle 2 (brand-chart-lookup)

Started: 2026-10-05

## Task description

Implement bundle B2 of docs/brand-chart-lookup/HANDOFF.md: the deterministic shop size-guide table
reader. A pure parser `src/guide-table.js` (matrix of cell strings → §5 chart or null), a DOM finder
`sizeGuideTables` in `src/extract.js` exposed as `product.shopGuide`, script-list wiring, and shop
fixture checks (Revolve's two in-page tables rejected, the other three shops null, a synthetic
inline-guide fixture with one chart). Flags: --bundle-id 2 --plan-slug brand-chart-lookup
--accumulate --branch feat/brand-chart-lookup --worktree-name brand-chart-lookup
--adversarial-rounds 1 --qa-rounds 1.

## Execution context

- Probes: inherited from B1 in the same session (Workflow, Agent, args round-trip, effortTiers,
  customAgents, worktreeNative all true). Session cwd is the shared worktree.
- Origin-bundle prefix: B2. Identifier: `brand-chart-lookup Bundle 2`. Run slug:
  feat-brand-chart-lookup-b2.
- Mode: --accumulate, reusing the shared worktree and branch created by B1.
- Conventions: HANDOFF §1 (no CLAUDE.md in this repo). Tests `node --test tests/`; browser harness
  `tests/shops.html` on the worktree's server (port 8767).

## Task interpretation

Deliverable: `src/guide-table.js` exporting `parseGuideMatrix(matrix, hints)`, `mentionsBrand`,
`parseRange`; `sizeGuideTables(doc, brand)` in `src/extract.js` and `product.shopGuide`;
`tests/guide-table.test.js`; `tests/fixtures/shops/inline-guide.html`; new checks in
`tests/shops.html`; the script added before extract.js in the manifest, popup, demo page, harness
and render tool.
Acceptance: the four real-shaped charts parse to the exact §5 rows asserted in the test; the five
non-charts (delivery, composition, review, Revolve model info, Revolve product dimensions) return
null; the harness shows Revolve shopGuide with zero charts, the other three null, the synthetic
fixture one chart, and every pre-existing check still passing.

## Plan (Phase 2)

Cross-run commitments: B1's commitments.md is empty; nothing incoming.

Parser: try sizes-down-the-side, then the transpose. Header row = the first of the top five rows
with a measurement word (waist, hip, bust, foot length, in English, French, German, Spanish,
Italian); unit-only rows under it merge into the column headers; rows above it are context. Label
column = the first non-measurement column whose every body value looks like a size; other size
columns become aliases keyed by their system. Each kind keeps one column (cm preferred when a chart
prints both). Every printed value must parse and sit in a plausible body range for its kind and
unit, else the kind is dropped. Rows ≥ 2, labels unique, every measurement non-decreasing.
A chart needs foot length, or at least two of waist, hip, bust.

Finder: tables and role="table" grids, skipped inside reviews or consent UI or Sizer's own nodes,
skipped when they contain a nested table or exceed 40 × 20; kept when the table, an ancestor within
six levels, or a heading just before either names a size guide or chart. Colspan and rowspan
expanded. shopGuide is null when no guide table is found, `{ charts, caption }` otherwise.

## Decisions made unilaterally

See "Decisions (build)" below.

## Edge cases considered

- Either orientation; a header row under a title row; unit rows under the header, including a
  rowspanned Size cell repeating into the unit row (found by the aria-guide fixture, regression test).
- cm and inches printed side by side: the cm columns win. Cells printing both units: the wanted part.
- Ranges with hyphen, en dash, "to"; halves as ½ and 1/2; decimal commas.
- No unit anywhere: magnitude inference only when exactly one unit is plausible (test).
- "Taille" alone is size, "Tour de taille" is waist; "Waist size" is a denim size column (tests).
- Model panels: any model wording in headers, context or caption rejects the table (tests). A real
  size guide captioned with model wording is lost; that is the safe direction for a size mover.
- Tables in cookie banners and reviews are never read; tables in a size-guide dialog are (fixture).
- Nested layout tables skipped; grids over 40 rows or 20 columns skipped.

## Stop attempts

None.

## Drift flags

None.

## Round-skip requests

None.

## Review findings + resolutions

Battery wf_4c6c72bf-b19: 4 raw → 4 unique → 3 confirmed, 1 refuted, 0 deferrals, 0 escalations.
- MAJOR src/guide-table.js — model-measurement tables (two models, "size worn" column, a model
  panel with sizes across the top) parsed as body charts. Tests first (failed), then a MODEL
  wording check over headers, context and caption. APPLIED.
- MINOR tests — no round trip through convertChart; the 'tops' branch (bust + waist) was dead,
  since convertChart drops rows without waist and hip. Round-trip test per category added; the
  parser now requires waist and hip for clothing (test for bust+waist and bust+hip → null). APPLIED.
- MINOR DOM finder coverage — ARIA grid, aria-rowspan/colspan, <caption>, attribute-only label,
  dialog searched, consent and review tables skipped had no test. Synthetic
  tests/fixtures/shops/aria-guide.html with guide-only checks in shops.html. It caught a real
  defect: a rowspanned Size header broke unit-row detection, so the grid yielded no chart.
  Regression test first (failed), fixed in isUnitRow. APPLIED.
- REFUTED (0/1): parsed charts carry source_type null, which convertChart/tierOf would rank as
  tier 1. Correct for B2 (B3 classifies, B4 wires), recorded as a B4 cross-bundle note: B4 must set
  source_type and status before any shop-table chart reaches convertChart.

## Areas examined and rejected

From the battery (21 entries, condensed): script order in all five loaders (guarded by a test);
engine purity; §5 shape and convertChart compatibility; unit inference (children's cm charts
with hips under 60 would read as inches, out of scope); an unlabelled numeric column before
Size would become the label column (borderline, real guides lead with Size); orientation on
sizes-across tables; the CONSENT/CHROME split leaves existing readers unchanged; tableMatrix
bounds and no injection path; the delivery table on the synthetic page never captioned;
performance; Revolve negative matrices match the fixture cell for cell; shops.html assertions
enforce found-but-zero on Revolve; README and HANDOFF text.

## Open items NOT addressed in this PR

None. No deferrals.

Verification after fixes: node --test tests/ 84/84; tests/shops.html PASS, 53 checks (the
original 37 untouched, 4 shop-guide checks on the real shops, 10 on inline-guide, 2 on aria-guide).

## Durable handles

- marker: /Users/kristina/.claude/autonomous-active/autonomous-task-feat-brand-chart-lookup-b2
- worktree: /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup
- worktree_entry: name (reused from B1)
- cron: (none — bundle-loop armed 7b451094 for the whole loop)
- battery_run_id: wf_4c6c72bf-b19

## Decisions (build)

- The consent half of CHROME is split out as CONSENT. Size guides commonly live in a pre-rendered
  `role="dialog"` modal, so the guide finder skips consent UI and reviews but not every dialog. The
  existing readers keep the full CHROME list unchanged.
- No unit in any header, value, caption or hint: inferred from magnitude only when every value sits
  in the plausible range for one unit and not the other; otherwise null.
- `taille` alone is a size header (French "size"); `tour de taille` is waist.
- Clothing charts need waist and hip, matching convertChart; the HANDOFF's bust+waist → tops
  mapping was dropped as unusable by the engine.
- shops.html gained a guideOnly mode for the non-product aria-guide fixture.
- The synthetic page's expected size (M) is the engine's current answer with the generic chart;
  B4 may move it when the page's own chart is wired in.

test-edit-approved: tests/shops.html — new guide checks and fixtures appended; existing expectations unchanged
test-edit-approved: tests/guide-table.test.js — new file; the one edit after first run swapped an ambiguity case whose bust value was implausible in cm
