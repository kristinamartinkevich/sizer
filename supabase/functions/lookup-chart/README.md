# lookup-chart

A Supabase Edge Function that finds a brand's women's size chart when no shopper has one yet, stores
it for everyone as `machine_read`, and returns it in the same shape the `chart_bundle` view serves.
See `docs/brand-chart-lookup/HANDOFF.md` §3.3 and §7.

```
POST /functions/v1/lookup-chart
{ "brand": "Helsa", "kind": "dresses", "shop": "www.revolveclothing.fr", "install": "<uuid>", "shopGuide": { "charts": [...], "caption": "..." } }

200 { "chart": { ...one chart as chart_bundle serves it... }, "tier": "brand_site", "note": "..." }
200 { "chart": null, "tier": "none", "note": "<why there is no chart>" }
400 { "error": "..." }                        bad input
429 { "chart": null, "tier": "none", ... }    20 lookups per install or 300 overall in the last 24 hours
502 { "chart": null, "tier": "none", ... }    the model call failed; nothing is cached, so the next visit tries again
500 { "chart": null, "tier": "none", ... }    a database error
```

`tier` is the chart's `source_type`: `brand_site`, `retailer_brand_chart` or `retailer_house_chart`.
The chart itself carries `status`, so the extension ranks it with `tierOf` in `src/charts.js`.

In order, the function:
1. checks the input (brand at most 80 characters, kind bottoms, tops, dresses or shoes, shop a
   hostname, install a uuid, shopGuide at most 30000 characters; the guide's page address is dropped);
2. returns a stored verified or machine-read chart the engine can use, if the brand has one for this
   kind of item, or `none` if a lookup found nothing in the last 30 days;
3. enforces the caps from `chart_lookups`;
4. asks `claude-sonnet-5`, with web search and web fetch (at most 6 uses each), for the brand's own
   size guide first and only then a judgement on the shop's table; the answer comes back through a
   strict tool schema, never as free text;
5. checks the chart (two rows or more, unique labels, measurements never going down, unit cm or in,
   waist and hip on two rows for clothing, foot length for shoes); a failing chart leaves a 30-day
   "no chart" marker;
6. stores the brand (or adds the spelling to an existing brand), the chart and its rows, records the
   lookup, and returns the stored chart.

## Deploy

The operator does this once, after the branch is merged. The function is not live until every step is done.

1. In the Supabase SQL editor, run `supabase/migrations/0004_chart_provenance.sql`, then
   `supabase/migrations/0005_chart_lookups.sql`, each pasted as a whole.
2. From `/Users/kristina/sizer`, signed in with `supabase login`:

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=<key> --project-ref cqvrdsgutpczbucbpiqa
   supabase functions deploy lookup-chart --project-ref cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api
   ```

   `--no-verify-jwt`: the extension calls the function with the project's publishable key, which is
   not a JWT, so the platform's JWT check would refuse every call. The function's own caps are what
   limit use. `--use-api` bundles on Supabase's side, so Docker is not needed.

   With the project linked (`supabase link --project-ref cqvrdsgutpczbucbpiqa`), the two commands
   are the same without `--project-ref`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase into every Edge Function;
nothing else needs setting. The service-role key is used only in the function's database requests and
is never logged, returned or written. The Anthropic key lives only in Supabase secrets.

To check it after deploying:

```bash
curl -s https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/lookup-chart \
  -H 'content-type: application/json' \
  -d '{"brand":"Helsa","kind":"dresses","shop":"www.revolveclothing.fr","install":"3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64"}'
```

Then look at the new row in `size_charts` in the dashboard and flip `status` to `verified` if the
chart is right. Lookups are listed in `chart_lookups`.

## Test

```bash
deno test supabase/functions/
deno check supabase/functions/lookup-chart/index.ts
sh tools/check-migrations.sh
```

The tests run the handler against an in-memory database and a scripted Anthropic endpoint; none
touches the network. `chart_test.ts` also loads `src/charts.js` to keep `CHARTS_FOR`, `tierOf` and
the usable-chart rule identical to the extension's, and to prove `convertChart` reads what the
function returns.

## Files

| File | What it is |
|---|---|
| `index.ts` | The `Deno.serve` entry: reads the environment and wires the real clients |
| `handler.ts` | The pure handler, steps 1 to 6, against injected database and fetch clients |
| `chart.ts` | Input check, the chart contract, tiers, and the bundle's per-chart shape |
| `prompt.ts` | The system prompt with the brand-first rule and the chart contract, and the answer tool schema |
| `db.ts` | The database client: Supabase's REST endpoint through `fetch` with the service-role key |
