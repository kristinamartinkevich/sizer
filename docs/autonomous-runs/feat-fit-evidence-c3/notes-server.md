# fit-evidence C3, server half: notes

Branch `c3-server`, cut from `dae6052` (the plan commit on `feat/fit-evidence`). Scope: the
`fit-dossier` Edge Function, migration `0006_fit_dossiers.sql`, and its checks in
`tools/check-migrations.sh`. The extension (the client half) was not touched.

## What was built

- `supabase/functions/fit-dossier/` with lookup-chart's layout: `index.ts`, `handler.ts` (injected db
  and fetch), `db.ts` (PostgREST over fetch), `prompt.ts`, `dossier.ts` (pure input and answer checks),
  `test_helpers.ts`, three `*_test.ts` files, `README.md`.
- `supabase/migrations/0006_fit_dossiers.sql`: `fit_dossiers`, `dossier_requests`,
  `fit_dossier_settings` (one row, seeded 40 and 2000), the `fit_dossier_public` view. One file, one
  transaction; does not depend on 0007.

## Decisions

1. **Request contract.** Exactly the seven fields `{item_key, brand, style, kind, shop, install,
   tallies}`; any other field at the top or inside `tallies` is a 400. `item_key` uses the shape
   0003's `item_fit_reports.key_shape` already enforces (`^[a-z0-9 ]+\|[a-z0-9]+$`, at most 120).
   Counts are whole numbers 0 to 5000 with small + large + tts at most total, as 0003 does.
2. **`tallies.areas` shape.** C2 has not landed in this branch, so no on-page area tally exists to
   copy. The function accepts an object keyed by the whitelisted areas (bust, chest, waist, hip,
   length, inseam, shoulder, sleeve, foot) whose values are either a plain count or counts per
   direction (`{ tight, loose, long, short }`). The client half should send one of those two shapes.
3. **Caps from a settings row.** `fit_dossier_settings` is a one-row table (`id boolean primary key
   check (id)`), private like the ledger. The function reads it on every call; if the row is missing
   it falls back to 40 and 2000 (the same numbers the migration seeds). A failing read is a 500.
4. **Caps pattern copied from lookup-chart.** Reserve a `pending` row, count with `>` against the
   caps, cancel the row when over, finish it with `dossier`, `empty` or `error`. The concurrency test
   (1999 rows, three parallel requests) proves at most one model call.
5. **Provenance on web_search.** Every `web_search_result.url` in every assistant reply of the
   conversation (pause_turn continuations included) is collected. A source is kept only when its
   host (lowercase, `www.` stripped) plus path (trailing slash stripped) matches one of them; scheme,
   query and fragment are ignored. At most 8 sources, duplicates merged.
6. **No surviving source means nothing kept.** The brief says the verdict becomes null. I went one
   step further: the areas and the brand note are dropped as well, since nothing traceable backs them,
   and strength is 0. A null verdict always carries strength 0.
7. **Empty dossiers are cached.** A dossier with no verdict, no areas and no brand note is stored (so
   the same item is not asked again for 30 days) and answered as `{ dossier: null }`, on the first
   call and on cache hits.
8. **Out-of-schema answers are errors.** `strict: true` should prevent them; if one arrives anyway
   (verdict not in the enum, strength outside 0..1, non-list areas or sources) it is a 502 with nothing
   cached. Notes are trimmed to 140 characters and the brand note to 200, rather than rejected, since
   the strict schema cannot carry lengths.
9. **Model request.** `claude-sonnet-5`, no temperature, `web_search_20260209` with `max_uses: 5`
   only (no web_fetch, per the brief), strict `record_dossier` tool, max 6 requests per conversation,
   one forced tool_choice if the answer is left in prose. The install id never enters the prompt.
10. **View safety.** A one-table view is auto-updatable and runs with its owner's rights, so the
    default privileges Supabase gives anon would let anon insert into `fit_dossiers` through it. The
    migration revokes everything on the view and grants back only select. check-migrations pins it.
11. **Storage.** `fit_dossiers.item_key` is unique; the function upserts on it (merge-duplicates) with
    a fresh `created_at`, so a dossier older than 30 days is replaced in place. brand, style and kind
    are stored but not served by the view or the function.

## Verification

- `deno test supabase/functions/`: **80 passed, 0 failed** (44 at start, 36 new: 11 in
  `dossier_test.ts`, 19 in `handler_test.ts`, 6 in `db_test.ts`).
- Tests written first and run red (type check failed on the missing modules) before the code.
- Mutation checks, each reverted after: removing the provenance filter (5 tests fail), `>` to `>=` on
  the install cap (1 fails), dropping the cancel on the global cap (2 fail), collecting searches only
  from the final reply (1 fails), keeping a verdict with no source (2 fail).
- `deno check supabase/functions/fit-dossier/index.ts`: clean. `deno lint`: clean.
- `sh tools/check-migrations.sh`: **ran against a local Postgres 16, all 6 migrations ok, all three
  anon checks ok** (including the new 0006 block). Mutation checks on the migration, each reverted:
  removing the view revoke, the `dossier_requests` revoke, or the view's select grant each makes the
  script fail.
- Not run here (out of scope for the server half): `node --test tests/`, `tests/shops.html`, any live
  deploy or real model call.
