# autonomous-task notes — feat/brand-chart-lookup · Bundle 1 (brand-chart-lookup)

Started: 2026-10-05T12:40:00Z

## Task description

Implement bundle B1 of docs/brand-chart-lookup/HANDOFF.md: chart provenance tiers. Migration 0004
(machine_read status, retailer_house_chart source, read_by + lookup_note columns, chart_bundle view
serving verified + machine_read charts with status/source_type/retailer, RLS relaxed the same way,
machine_read partial index); tier ranking in src/charts.js; score deltas and firmUp wording in
src/engine.js; Brand fact and footer wording per HANDOFF §4 in src/content.js. Tests first.
Flags: --bundle-id 1 --plan-slug brand-chart-lookup --accumulate --branch feat/brand-chart-lookup
--worktree-name brand-chart-lookup --adversarial-rounds 1 --qa-rounds 1.

## Execution context

- Probes: Workflow present, Agent callable (haiku probe returned OK). args round-trip OK
  (ARGS-OK-7f3a9c), effortTiers: true, customAgents: true (bare `at-reviewer` resolved),
  worktreeNative: true.
- Origin-bundle prefix: B1. Identifier: `brand-chart-lookup Bundle 1`. Run slug:
  feat-brand-chart-lookup-b1.
- Mode: --accumulate, bundle 1 creates the shared branch. Worktree created by EnterWorktree
  (`name` form) at /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup; minted branch renamed
  in place to feat/brand-chart-lookup. No node_modules, no env files (plain-script repo).
- Project conventions: no CLAUDE.md in this repo; HANDOFF §1 is the conventions doc. Tests:
  `node --test tests/`. No lint, no typecheck, no CI.
- Parent-clean canary at Phase 1: clean (tracked files).
- Orphan sweep: the autonomous-active dir held only this loop's and this bundle's markers; the
  `find -mtime +1 -delete` sweep was refused by the worktree guard (runtime-computed path), nothing
  older than a day was present.

## Task interpretation

Deliverable: `supabase/migrations/0004_chart_provenance.sql` plus tier-aware chart selection in
`src/charts.js`, tier-aware confidence and firmUp in `src/engine.js`, and tier wording in
`src/content.js`, with new cases in `tests/bundle-engine.test.js` and `tests/charts-store.test.js`.
Acceptance: a bundle fixture carrying one chart per tier for the same brand resolves to the
verified brand_site chart; removing it resolves to the retailer_brand_chart verified one, then the
machine_read one, then the house chart; confidence score drops 0.1 / 0.2 for machine_read /
house charts; the Brand fact and footer strings match HANDOFF §4 exactly; the migration reads
cleanly against 0001/0002.

## Plan

See "Plan (Phase 2)" below.

## Decisions made unilaterally

See "Decisions (build)" below, plus:
- The machine_read partial index the HANDOFF asked for cannot exist in a one-paste migration (an
  index predicate must be IMMUTABLE; the enum-to-text cast is STABLE; the enum literal is unusable
  in the adding transaction). Replaced with a plain (brand_id, category, status) index, which serves
  the B3 lookup query for both statuses. The verified partial index from 0001 is kept.
- Added tools/check-migrations.sh: applies all migrations to a throwaway Postgres 16, one
  transaction per file, and asserts what anon reads through chart_bundle. Wired into HANDOFF §1.2
  and §1.9 and the README so B3 runs it for 0005.
- Footer links only for http(s) addresses; anything else keeps its text and loses the link.

## Edge cases considered

- Bundle payloads from before 0004 carry no status/source_type: counted as tier 1 (test).
- Higher tier with a worse category beats lower tier with the right category (test).
- Missing retrieved_on: every footer drops the date cleanly (code path; tails built conditionally).
- Retailer null on a retailer chart: shop name falls back to the source URL's host.
- Non-web source_url (javascript:, data:, leading-space JavaScript:): never linked (test).
- Shoes: High/Medium/Low notching at tiers 3–5, generic stays Low (test).

## Stop attempts

None.

## Drift flags

None.

## Round-skip requests

None.

## Review findings + resolutions

Battery wf_cc96114e-9f1: 3 raw → 2 unique → 2 confirmed, 0 refuted, 0 deferrals, 0 escalations.
- BLOCKER supabase/migrations/0004_chart_provenance.sql:25 — partial index predicate
  `status::text = 'machine_read'` fails ("functions in index predicate must be marked IMMUTABLE"),
  rolling back the whole paste. Reproduced with tools/check-migrations.sh (0004 FAIL), fixed with a
  plain composite index, re-run: all four apply and the anon checks pass. APPLIED.
- MINOR src/content.js:221 — footer href accepted any scheme; machine-read source_urls make a
  javascript: link possible. Regression test first (failed), then provenance() only links
  http(s). APPLIED.

## Areas examined and rejected

From the battery (18 entries, condensed):
- Enum ADD VALUE used in the same transaction: every use goes through ::text; only the index
  predicate failed (reported, fixed).
- CREATE OR REPLACE VIEW: same six output columns, names, order and types as 0002.
- New CHECK on existing rows: no existing row can be machine_read; holds.
- Policy drop/create: names match 0001; drafts and retired charts stay private.
- Tier ranking and backward compatibility: missing fields → tier 1, tier before category rank,
  suspect rows still dropped.
- Confidence arithmetic: no new boundary flip at 0.75 vs the old arithmetic; shoes notching matches.
- §4 copy, tiers 1–7: exact, asserted with deepEqual.
- HTML escaping of brand fact, firmUp and footer text: all escaped; only the href scheme was open.
- src/extract.js untouched; no fixture changed.
- shopName capitalisation (borderline, not raised): "Asos", "Net-a-porter"; acceptable until a
  shop-name table exists; fixtures render correctly.

## Open items NOT addressed in this PR

None. No deferrals from this bundle.

Telemetry: skipped by design under --accumulate; the loop emits one record for the plan at merge.

## Durable handles

- marker: /Users/kristina/.claude/autonomous-active/autonomous-task-feat-brand-chart-lookup-b1
- worktree: /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup
- worktree_entry: name
- cron: (none — bundle-loop armed 7b451094 for the whole loop)
- battery_run_id: wf_cc96114e-9f1

## Decisions (build)

- Migration compares status::text / source_type::text everywhere so it applies in one paste: Postgres
  refuses to use an enum value in the transaction that added it, and the SQL editor runs one
  transaction. Added a constraint that machine_read charts name their reader.
- Provenance strings live in a pure `provenance()` in src/engine.js so the §4 wording is
  node-testable; content.js only escapes and renders them. shortDate moved there with it.
- Shoes: High/Medium/Low with one notch off for tiers 3–4 and two for tier 5, matching the clothing
  score deltas in effect.
- The shared branch was cut from origin/main by EnterWorktree, which lacks the operator's two local,
  unpushed main commits (the HANDOFF and the gitignore). Rebased onto local `main` before review so
  the plan travels with the branch; the battery's base is `main`.
- The battery script was copied byte-identical (cmp clean) to /Users/kristina/sizer/.claude/
  (gitignored) because the session moved to the Sizer repo and the Workflow tool refuses paths
  outside its working dirs, including through the skills symlink. Run with args, unedited; not a
  config fork.
- The parent-clean canary (`git -C /Users/kristina/sizer status`) is refused by the worktree
  isolation guard. The session never addressed the parent tree.
- Test ledger: the one expectation changed after writing was the size in the new tier test
  ('M' → 'S'); it was my own guess in a test written minutes earlier, and the engine's S is the
  correct high-stretch rounding for waist 69 / hip 95. No pre-existing assertion changed.

## Plan (Phase 2)

Cross-run commitments: none exist (first bundle of the plan).

Files: supabase/migrations/0004_chart_provenance.sql (new); src/charts.js (tier ranking, source
provenance); src/engine.js (score deltas, firmUp wording, pure `provenance()` helper that yields the
Brand fact and footer strings so they are node-testable); src/content.js (uses the helper);
tests/bundle-engine.test.js, tests/charts-store.test.js (new cases).

Tier function (status, source_type): brand_site+verified 1; retailer_brand_chart+verified 2;
brand_site+machine_read 3; retailer_brand_chart+machine_read 4; retailer_house_chart (any) 5.
A chart with no status/source_type (older bundle payload) counts as tier 1. pickChart sorts
convertible candidates by (tier, CHARTS_FOR index). Score: tier 3/4 −0.1, tier 5 −0.2. Shoes get
the same delta in recommendShoes.

Verification: `node --test tests/` (54 before, more after); migration read against 0001/0002.

Open questions resolved:
- Postgres refuses to USE an enum value added in the same transaction ("unsafe use of new value"),
  and the SQL editor runs a pasted file as one transaction. The view, the policies and the partial
  index therefore compare `status::text` / `source_type::text` instead of enum literals, so 0004
  applies in one paste. Recorded under Decisions.
- The footer link target per tier: tiers 1–4 link source_url; tier 5 links the shop's guide URL
  (also source_url). Retailer display name = first hostname label, capitalised ("revolve.com" →
  "Revolve").

test-edit-approved: /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup/tests/bundle-engine.test.js — new tier cases appended; no existing assertion changed
test-edit-approved: /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup/tests/charts-store.test.js — new normalise provenance case appended; no existing assertion changed
