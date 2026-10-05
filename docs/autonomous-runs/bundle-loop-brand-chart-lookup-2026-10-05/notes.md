# bundle-loop session notes — brand-chart-lookup — 2026-10-05

HANDOFF: docs/brand-chart-lookup/HANDOFF.md
Mode: single PR (default). Shared branch `feat/brand-chart-lookup`, shared worktree
`/Users/kristina/sizer/.claude/worktrees/brand-chart-lookup` (EnterWorktree `name` form).
Resume determination: fresh run (no shared branch on disk, none on origin).
Parent repo: /Users/kristina/sizer (session moved here from /Users/kristina/app).
Skills: linked from /Users/kristina/app/.claude/skills (gitignored). The review battery runs from a
byte-identical copy at /Users/kristina/sizer/.claude/review-battery.js, because the Workflow tool
refuses script paths outside the session's working directories, including through the symlink.
Tooling: deno 2.9.7 (brew); supabase CLI 2.119.0 via `npm install -g supabase` (brew formula
refused: Command Line Tools outdated, needs sudo); Postgres 16 (brew) for tools/check-migrations.sh.
Push + auto-merge: operator's (guard hook refuses pushes from Claude; no CI). Ship step ends with the
push command.
Heartbeat task bbi2lve34 (pid 3605), watchdog cron 7b451094.

## Bundle list at start
| B1 provenance tiers | [ ] |
| B2 shop guide table reader | [ ] |
| B3 edge function lookup-chart | [ ] |
| B4 extension wiring + privacy | [ ] |

## Decisions
- 2026-10-05: no dashboard artifact for this run (personal repo, operator watching the chat).
- The worktree was cut from origin/main, which lacked the operator's unpushed HANDOFF and gitignore
  commits. B1 rebased the shared branch onto local main before review. The operator has since pushed
  main (fde832c), so origin/main and the branch base now agree.
- Review rounds: 1 adversarial + 1 QA per bundle (operator's standing calibration).

## Ledger
| Bundle | Commit | Findings | Deferrals |
|---|---|---|---|
| B1 | 32d6635 | 2 confirmed (1 BLOCKER, 1 MINOR), both applied | 0 |
| B2 | e3e8161, 366e2bd | 3 confirmed (1 MAJOR, 2 MINOR), all applied; 1 refuted | 0 |
| B3 | 9cbba14, 4ef4474 | 4 confirmed (2 MAJOR: cap race, brand_site poisoning; 2 MINOR docs), all applied | 0 |
| B4 | bffa044, bfc00e8 | 5 confirmed (1 MAJOR: launch copy under-disclosed; 4 MINOR copy), all applied | 0 |

## Cross-bundle notes
- B1 added tools/check-migrations.sh and wired it into HANDOFF §1.2/§1.9. B3 must run it for 0005
  and extend its anonymous-role checks (chart_lookups must be unreadable by anon).
- B1's provenance() in src/engine.js is the single home of the §4 wording; B4's looking-up copy
  should live beside it, not in content.js.
- The B1 launch command's "partial index where machine_read" was not buildable in a one-paste
  migration; a plain (brand_id, category, status) index replaced it. B3's cache query should filter
  on status::text in ('verified','machine_read') or on the enum after 0004 is committed.

- B2's parsed charts carry source_type null and no status. B4 must set source_type (from B3's
  classification) and status machine_read before a shop-table chart reaches convertChart, or
  tierOf ranks it as tier 1, a verified brand chart (refuted-for-B2 finding, wf_4c6c72bf-b19).
- B2's parser requires waist and hip for clothing charts (convertChart needs both), so the
  HANDOFF's "bust+waist → tops" mapping no longer exists. B3's validator should apply the same rule.

## Decisions (cont.)
- 2026-10-05, operator: "dont stop on test run them in bg and add bundles". B3 was built by a
  background builder in its own worktree (branched from e3e8161) while B2's battery ran, because
  the battery diffs the live shared worktree. Its commits are cherry-picked onto the shared branch
  after its own battery.

## Pasted plan from the operator (mid-run)
The operator pasted a broader product plan (reference garments, body-similarity review weighting,
Vinted seller-message generator, post-purchase feedback, chart images via vision). Assessed in chat:
none of it changes B1 to B4. Candidates for a second plan after this one ships.

## Loop exit (2026-10-05)
All four bundles built on feat/brand-chart-lookup; §2 flipped to [x] with branch SHAs (merge SHAs do
not exist until the single PR merges). Final gates on bfc00e8: node 103/103, deno 44/44,
tests/shops.html PASS (53), check-migrations passes. Claude does not push: the operator pushes the
branch and opens the one PR. B2's provenance note was closed in B4 (lookupEntry forces machine_read
and drops unknown source_type). B4's deviation: the chrome stub stays inline in fixture-shop.html
(HANDOFF §3.4 amended).

Not live until the operator: runs 0004 and 0005 in the SQL editor, sets ANTHROPIC_API_KEY with
`supabase secrets set`, and deploys with `supabase functions deploy lookup-chart --project-ref
cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api`.
