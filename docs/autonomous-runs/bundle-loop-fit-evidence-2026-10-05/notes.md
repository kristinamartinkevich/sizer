# Bundle-loop session notes: fit-evidence (2026-10-05)

HANDOFF: `docs/fit-evidence/HANDOFF.md` (plan commit dae6052). Shared branch `feat/fit-evidence`,
cut from `feat/brand-chart-lookup` at c8aa14b, in the reused worktree
`.claude/worktrees/brand-chart-lookup`. Single PR; Claude does not push.

Operator directive: "do all" (every item from the pasted brief that was partly or not done), after
"dont stop on test run them in bg and add bundles" earlier the same day.

## How the work is split

The battery and builders must not share a live tree, so:
- C1 (fuller profile) and C4 (charts from images, iframes, guide pages) are built by background
  builders in their own worktrees from dae6052 and cherry-picked.
- The C3 server half (fit-dossier function, migration 0006) is a third background builder.
- The coordinator builds the pure cores that touch no file the builders edit, as part-commits
  without the bundle trailer: C5 `src/vinted.js`, C6 `src/feedback.js`, C2 `src/review-details.js`.
- Wiring (extract.js, engine.js, content.js, background.js, options, manifest, copy) waits for the
  builders, then each bundle closes with its trailer commit and its battery.

## Decisions
- Cost caps for per-item model calls: 40 per install and 2000 global per day, in a settings row
  the operator can change (HANDOFF header).
- The side panel is added beside the inline line, not instead of it (HANDOFF header).
- Reddit and TikTok stay out, as the brief itself says.

## Ledger

| Bundle | Commits | Findings | Deferrals |
|---|---|---|---|
| C5 core | part-commit | | |
| C6 core | part-commit | | |
| C2 core | part-commit | | |
