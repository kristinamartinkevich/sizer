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

| Bundle | Commits | Review | Findings applied | Deferrals |
|---|---|---|---|---|
| C1 fuller profile | 8693e66, 9242c3c, abce7c9 | wf (C1) | 1 BLOCKER, 1 MAJOR, minors | none |
| C2 areas + weighted reviews | core part, engine part, a45b5cd, a9576c9 | wf_76cdfbea-c03 | 3 MAJOR, 3 MINOR | none |
| C3 server | 5f4a933 | with C3 client | | |
| C3 client | c11ae36 (from da9a5b3) | wf_d185200d-764 (running) | | |
| C4 charts from images, frames, guide pages | 66faf5e, 840b7f1, 7ccd8e1 | wf_69277a80-867 | 2 MAJOR, 4 MINOR | none |
| C5 Vinted | core part; wiring building | | | |
| C6 feedback + side panel | core part; wiring building | | | |

## Cross-bundle notes
- Integrating C3 onto C2's review fix: the dossier's web areas now follow the same rule as chart and
  review areas, so trousers never take a bust, shoulder or sleeve area from the web (test in
  tests/dossier.test.js, mutation-checked).
- C3's dossier move takes the place of the rigid-fabric lean rather than adding to it, so on the
  rigid demo jeans `?dossier=small` keeps 28 and changes the headline; a stretch page moves a size.
- The store copy merges C3's dossier request with C4's "which request carries the hostname" fix:
  five cases, three with the hostname (tally, dossier, chart lookup), two without (image, AI read).
- Every commit on the branch has git's auto-configured committer identity
  (`Kristina <kristina@Host-001.lan>`); left for the operator to decide.
