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

(filled during build)

## Stop attempts

None.

## Drift flags

None.

## Round-skip requests

None.

## Review findings + resolutions

(filled after the battery)

## Areas examined and rejected

(filled after the battery)

## Open items NOT addressed in this PR

(filled at commit)

## Durable handles

- marker: /Users/kristina/.claude/autonomous-active/autonomous-task-feat-brand-chart-lookup-b2
- worktree: /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup
- worktree_entry: name (reused from B1)
- cron: (none — bundle-loop armed 7b451094 for the whole loop)
- battery_run_id: (pending)

## Decisions (build)

- The consent half of CHROME is split out as CONSENT. Size guides commonly live in a pre-rendered
  `role="dialog"` modal, so the guide finder skips consent UI and reviews but not every dialog. The
  existing readers keep the full CHROME list unchanged.
- No unit in any header, value, caption or hint: inferred from magnitude only when every value sits
  in the plausible range for one unit and not the other; otherwise null.
- `taille` alone is a size header (French "size"); `tour de taille` is waist.
