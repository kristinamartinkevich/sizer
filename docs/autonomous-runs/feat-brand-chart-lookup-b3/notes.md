# autonomous-task notes: feat/brand-chart-lookup · Bundle 3 (brand-chart-lookup)

Built in an isolated worktree (`/Users/kristina/sizer/.claude/worktrees/agent-a5541aba7bf9fe5e2`,
branch `b3-build`, cut from e3e8161, B2's last commit). The worktree was first based on fde832c, so
the branch was recut from e3e8161 before any work.

## Task interpretation

HANDOFF §3.3 exactly: the `lookup-chart` Edge Function (Deno, std and fetch only), migration 0005, the
prompt in `prompt.ts`, Deno tests first with no network, a README with the deploy and secret commands,
and nothing in the extension changed. Plus, from the coordinator: tools/check-migrations.sh applies 0005
and proves anon cannot read `chart_lookups`; the chart check rejects a clothing chart without waist and
hip on two rows, and a shoe chart without foot length, as convertChart would.

Files:
- `supabase/functions/lookup-chart/index.ts`: `Deno.serve` entry, wires `restDb` and `fetch` from
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`; re-exports `handle`.
- `handler.ts`: the pure handler, steps a to f, against an injected `LookupDb` and `fetch`.
- `chart.ts`: input check, the §5 contract check, provenance rule, tiers, the bundle's per-chart shape.
- `prompt.ts`: system prompt (brand-first rule verbatim, §5 contract inlined), user prompt, answer tool.
- `db.ts`: PostgREST client over plain fetch.
- `supabase/migrations/0005_chart_lookups.sql`, `tools/check-migrations.sh` (extended).
- Tests: `chart_test.ts`, `handler_test.ts`, `db_test.ts`, shared `test_helpers.ts`.

## Decisions made unilaterally

1. **No `temperature: 0`.** The brief and §7 ask for temperature 0, but Claude Sonnet 5 rejects
   non-default sampling parameters with a 400 (Anthropic's current model notes for Sonnet 5). Sending it
   would make every lookup fail. The request leaves temperature at its default; a test asserts the
   field is absent, and `prompt.ts` says why. Determinism comes from the strict answer schema and the
   function's own validation instead.
2. **Tool versions `web_search_20260209` and `web_fetch_20260209`, no beta header.** These are the
   current variants on Sonnet 5; the 2025 variants named in the brief are for older models. Cited in a
   comment in `prompt.ts`.
3. **`max_uses: 6` on each web tool**, as the brief words it ("web_search and web_fetch tools with
   max_uses 6"). The API caps per tool, so a lookup can make up to 6 searches and 6 fetches; §7's "at
   most 6 tool uses" cannot be enforced as one shared cap inside a single server-side turn.
4. **How the final answer is forced.** Forcing `record_lookup` with `tool_choice` on the first request
   would stop the model from searching at all. So the first request uses `tool_choice: auto` with a
   strict tool and a prompt instruction; a `pause_turn` is resent unchanged; if the model ends in prose,
   one follow-up forces `{ type: "tool", name: "record_lookup" }`. The function never parses free text:
   no tool call after the forced follow-up is an `error`.
5. **Provenance is settled by rule, not taken from the model.** A shop chart is `retailer_brand_chart`
   when the model's `mentions_brand` is true (it names the brand or the shop labels it as the brand's),
   otherwise `retailer_house_chart`, whatever `source_type` the model wrote. `retailer` is always the
   request's shop without `www.` (the form B1's `shopName` reads). A shop chart's `source_url` keeps the
   model's address only on the shop's own host, else `https://<shop>/`. A shop chart when no shop guide
   was sent is rejected (the model was not asked for one).
6. **The page address never travels.** B2's `shopGuide.charts[].source_url` is the product page URL;
   the function drops it on input, so it reaches neither the model nor storage. B4 must still not send
   it (privacy §8 of the HANDOFF); this is a second guard, not a replacement.
7. **`tier` in the response is the chart's `source_type`** (`brand_site`, `retailer_brand_chart`,
   `retailer_house_chart`) or `none`, following §3.3d's wording "tier 'brand_site'". The chart carries
   `status`, so the extension computes the numeric §4 tier with `tierOf`.
8. **The cache serves only charts the engine can use.** A brand whose only stored chart convertChart
   would drop (conversion-only, suspect rows, no waist and hip) still gets a lookup; otherwise the
   extension would ask, be handed the same unusable chart, and never get an answer.
9. **Cache filter in PostgREST, not SQL.** The cross-bundle note asked for `status::text in (...)`. That
   cast matters only for SQL run in the transaction that added the enum value (0004). The cache query is
   a runtime REST request (`status=in.(verified,machine_read)`) on a committed schema, so no cast is
   needed; 0005 itself never names an enum value.
10. **Brand rows.** The brand is found by alias (lowercase, spaces collapsed) or by slug in the seed's
    style (`rag & bone` → `rag-bone`; a name with no Latin letters gets `b-<12 hex of SHA-256>`). An
    existing brand gains the new spelling as an alias; a new brand gets `website` set to the brand
    site's origin only for a `brand_site` chart.
11. **No-chart markers are per brand and kind**, across shops. A model answer of "nothing found" also
    leaves a marker (step b implies markers exist for that case). Model and network failures are
    recorded as `error`, never as markers, so the next visit tries again; they count toward the caps.
12. **Caps are rolling 24 hours**, like `report_item_fit` in 0003. Cache hits and markers spend nothing;
    only lookups that reach the model are recorded.
13. **No transaction across REST calls**, so a failed row insert deletes its chart, and the function
    re-reads the cache right before storing so two concurrent lookups for one brand do not store two
    charts (the second returns the first's).
14. **Deploy with `--no-verify-jwt --use-api`.** The brief's command is `supabase functions deploy
    lookup-chart`; the extension calls with the publishable key, which is not a JWT, so the platform's
    default JWT check would refuse every call. `--use-api` bundles server-side, so Docker is not needed.
    The README gives the exact commands with `--project-ref cqvrdsgutpczbucbpiqa`; HANDOFF §0's operator
    steps now name 0005 and the flag and point to the README.
15. **check-migrations mirrors Supabase's default grants.** It now creates `service_role` (bypassrls)
    and grants all on new public tables to anon, authenticated and service_role, as a Supabase project
    does, so a table counts as private only because of RLS and revokes, not because the harness never
    granted it. 0005 both enables RLS with no policies and revokes the API roles' grants. Proven by
    mutation: removing those two lines fails the check.
16. **Assertions use `node:assert/strict`**, built into Deno, instead of `jsr:@std/assert`, which is not
    in the Deno cache here and would need a network download for every fresh checkout's first test run.
17. **CORS**: OPTIONS answers 204 with permissive CORS headers, as Supabase recommends for functions
    called from browsers. The extension's service worker may not need it; it costs nothing.
18. **README and .gitignore.** The root README's Layout table and test commands list the function.
    `supabase/.temp/` is ignored: the CLI writes its cache there (this run's `--help` calls did, and
    `supabase link` does).
19. Commit attribution follows the coordinator's line (Claude Opus 5.5), not HANDOFF §1.10's.

## Edge cases considered

- Bad input of every kind (each field, non-JSON, wrong method, 81-character brand vs 80, uppercase
  shop and install normalised, oversized or malformed shopGuide): 400 before any database read.
- A brand spelled differently from the stored alias but with the same slug (`Rag-Bone` vs `rag & bone`):
  found, alias added, no second brand (test).
- Cache: stored chart in a lower category order (general for dresses) is still returned (test);
  unusable stored chart leads to a lookup (test); a marker at 29 days blocks, at 31 days does not (test).
- Caps: 20 lookups today from this install is 429, 20 from yesterday is not; 300 overall is 429 (tests).
- Model: `pause_turn` resumed without an extra user message; prose answer forced through the tool; still
  no answer after forcing is a 502 `error`; HTTP 529, network failure and `refusal` are 502 `error`
  (tests).
- Answers: every schema violation and impossible chart is a marker with a reason: unknown fields,
  categories outside CHARTS_FOR for the kind, unit, basis, size system, source type, non-web address
  (`javascript:`), one row, more than 60 rows, repeated labels (case and spaces ignored), ranges not two
  positive numbers under 1000, min above max, any measurement going down (min or max), blank labels,
  non-text aliases, bust and waist without hip, shoes without foot length (tests).
- Stored values: rounded to one decimal as `numeric(5,1)` stores them; rounding keeps order, so a chart
  that passed the monotonic check still passes after storage.
- Storage: rows failing removes the chart (test); a concurrent lookup's chart is returned (test).
- Secrets: no key in any response body or log line across a database failure, an Anthropic 401 and a
  success (test); `restDb` errors carry status and body, never the key (test); a missing environment
  variable is logged by name only.
- The returned chart is accepted by the real `convertChart` from `src/charts.js` with tier 3, 4 or 5 as
  expected (tests), and CHARTS_FOR, tierOf and the usable rule are asserted identical to the extension's.

## Out of scope, noticed

- README "Limits" still says only verified charts are downloaded, which has been untrue since B1
  (machine-read charts are served). B4 rewrites that README's "How it decides" and privacy text in the
  same pass; left for it.

## Test results

- RED first: `deno test supabase/functions/` failed with module not found for `chart.ts` (and the
  handler and db modules) before any implementation existed.
- Mutation check after green: disabling the usable-rows rule, the mentions_brand provenance rule, the
  monotonic check, the cache hit and the `pause_turn` resume made 7 tests fail; restored.
- `deno test supabase/functions/`: 38 passed, 0 failed (chart 11, db 6, handler 21).
- `deno check supabase/functions/lookup-chart/index.ts`: clean. `deno lint supabase/functions/`: clean.
- `node --test tests/`: 80 passed, 0 failed (unchanged), measured on the builder's base e3e8161.
  On the shared branch after cherry-picking onto 616eca1: 84 passed, 0 failed.
- `sh tools/check-migrations.sh`: 0001 to 0005 apply, one transaction each; chart_bundle check ok;
  chart_lookups check ok. Mutation: 0005 without RLS and revoke fails the check.
- `tests/shops.html` not run: `src/extract.js` and the fixtures are unchanged.

## Review findings + resolutions (applied on the shared branch)

Battery wf_18f938ef-f0e: 4 raw → 4 unique → 4 confirmed, 0 refuted, 0 deferrals, 0 escalations.
- MAJOR handler.ts — caps were read before the model call but the ledger row was written after it,
  so lookups landing together all passed the cap. Each lookup now writes a 'pending' row first
  (0005's outcome check gains 'pending'), reads the counts after, gives its row back when over a
  cap, and turns the row into its outcome at the end. Tests first: the row exists when the model is
  asked; three concurrent lookups at one remaining global slot make at most one model call and
  leave no pending rows. APPLIED.
- MAJOR chart.ts — a brand_site answer was accepted with any address, so a caller's shop guide
  could be stored as the brand's own chart for everyone (and set brands.website). A brand_site
  chart now needs its page on a host the model fetched with web_fetch during this lookup (www
  ignored, subdomains distinct, fetches before a paused turn count). Tests first: unfetched
  answer → no_chart and no brand row; a shop-address answer with only the brand site fetched →
  rejected; pause-turn fetch counts; validateAnswer host rules. APPLIED.
- MINOR HANDOFF §3.3 and §7 still said temperature 0 and 6 tool uses in total. Amended. APPLIED.
- MINOR this file's node figure was measured on the pre-cherry-pick base. Both figures now
  stated. APPLIED.

test-edit-approved: supabase/functions/lookup-chart/test_helpers.ts — answerMessage now adds a
web_fetch result for a brand-site chart's own address unless `extra` is given; FakeDb's
recordLookup replaced by reserve/finish/cancel to match the new ledger contract.
test-edit-approved: supabase/functions/lookup-chart/db_test.ts — the writes test exercises
reserve/finish/cancel instead of recordLookup.
test-edit-approved: supabase/functions/lookup-chart/chart_test.ts — the shared ctx carries the
fetched page of the brand chart, as every real brand-site answer now must.

After fixes: deno test 44/44, deno check and deno lint clean, node --test 84/84,
check-migrations all five apply and both anon checks pass.
