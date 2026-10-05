# fit-dossier

A Supabase Edge Function that gathers what people say about how one item fits (retailer reviews, fit
blogs, and the brand's general fit reputation), checks every source against the pages a web search
really returned, and keeps the result for everyone for 30 days. See `docs/fit-evidence/HANDOFF.md` §6.

The function never sizes anything. It returns evidence; the extension's engine does the maths.

```
POST /functions/v1/fit-dossier
{
  "item_key": "helsa|wd1",
  "brand": "Helsa",
  "style": "WD1",
  "kind": "dresses",
  "shop": "www.revolveclothing.fr",
  "install": "<uuid>",
  "tallies": { "small": 3, "large": 0, "tts": 5, "total": 9, "areas": { "bust": { "tight": 2 }, "length": 1 } }
}

200 { "dossier": { "item_key", "verdict", "strength", "areas", "brand_note", "sources", "created_at" } }
200 { "dossier": null }                       nothing sourced was found (also cached for 30 days)
400 { "error": "..." }                        bad input
429 { "dossier": null, "error": "..." }       over the per-install or global daily cap
502 { "dossier": null, "error": "..." }       the model call failed or answered outside the schema
500 { "dossier": null, "error": "..." }       a database error
```

Every error is non-200 and stores nothing, so the extension caches nothing for it and the next visit
tries again.

The dossier:

| Field | Shape |
|---|---|
| `verdict` | `small`, `tts`, `large` or `null` |
| `strength` | 0 to 1; 0 whenever `verdict` is null |
| `areas` | `[{ area, direction, note }]`, area one of bust, chest, waist, hip, length, inseam, shoulder, sleeve, foot; direction tight, loose, long or short; note at most 140 characters |
| `brand_note` | at most 200 characters, or null |
| `sources` | `[{ url, title }]`, at most 8 |

## The request, checked strictly

- Only the seven fields above; any other field is a 400 (no profile, no page address, no review text).
- `item_key` is `<brand>|<style>` in the shape `item_fit_reports` uses: lowercase letters, digits and
  spaces, a bar, then lowercase letters and digits, at most 120 characters.
- `brand` and `style` 1 to 80 characters; `kind` bottoms, tops, dresses or shoes (lookup-chart's kinds);
  `shop` a hostname; `install` a uuid.
- `tallies`: exactly `small`, `large`, `tts`, `total` and `areas`. The four counts are whole numbers from
  0 to 5000, and small + large + tts is at most total. `areas` is an object whose keys are the areas
  listed above; each value is either a count or counts per direction (`{ "tight": 2, "loose": 1 }`).
- The tallies go to the model as context only, labelled as not a source. The install id never reaches
  the model; it is used only for the caps.

## In order, the function

1. checks the input;
2. returns the item's dossier if one younger than 30 days is stored, with no model call;
3. reads the caps from `fit_dossier_settings` (40 per install and 2000 overall per 24 hours as seeded;
   the same numbers apply if the row is missing), writes a `pending` row in `dossier_requests`, then
   counts; a request over a cap deletes its own row and gets a 429;
4. asks `claude-sonnet-5` once, with `web_search_20260209` (at most 5 searches) and a strict
   `record_dossier` tool, no temperature; a paused turn is resumed and an answer left in prose is
   forced through the tool once;
5. drops every source whose host and path were not in a web search result of the same conversation
   (pauses included); with no source left, the verdict is null and the areas and brand note are
   dropped too, since nothing backs them;
6. stores the dossier (replacing an older one for the same item), records the outcome, and returns it.

## Deploy

The operator does this once, after the branch is merged.

1. In the Supabase SQL editor, run `supabase/migrations/0006_fit_dossiers.sql`, pasted as a whole.
2. From `/Users/kristina/sizer`, signed in with `supabase login`:

   ```bash
   supabase functions deploy fit-dossier --project-ref cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api
   ```

   No new secret: the function reuses `ANTHROPIC_API_KEY`, already set for `lookup-chart`.
   `--no-verify-jwt` because the extension calls with the publishable key, which is not a JWT; the
   caps are what limit use. `--use-api` bundles on Supabase's side, so Docker is not needed.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. The service-role key is used
only in the function's database requests and is never logged, returned or written.

To change the caps:

```sql
update public.fit_dossier_settings set per_install_per_day = 60, global_per_day = 3000, updated_at = now();
```

To check it after deploying:

```bash
curl -s https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/fit-dossier \
  -H 'content-type: application/json' \
  -d '{"item_key":"helsa|wd1","brand":"Helsa","style":"WD1","kind":"dresses","shop":"www.revolveclothing.fr","install":"3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64","tallies":{"small":0,"large":0,"tts":0,"total":0,"areas":{}}}'
```

Dossiers are in `fit_dossiers`, calls in `dossier_requests`. The public key can read dossiers only
through the `fit_dossier_public` view.

## Test

```bash
deno test supabase/functions/
deno check supabase/functions/fit-dossier/index.ts
sh tools/check-migrations.sh
```

The tests run the handler against an in-memory database and a scripted Anthropic endpoint; none
touches the network.

## Files

| File | What it is |
|---|---|
| `index.ts` | The `Deno.serve` entry: reads the environment and wires the real clients |
| `handler.ts` | The pure handler, steps 1 to 6, against injected database and fetch clients |
| `dossier.ts` | The input check, the answer check and the provenance rule |
| `prompt.ts` | The system prompt, the user prompt and the `record_dossier` tool schema |
| `db.ts` | The database client: Supabase's REST endpoint through `fetch` with the service-role key |
