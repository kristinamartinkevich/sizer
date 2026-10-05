# read-chart-image

A Supabase Edge Function with two routes, both answered by Claude (`claude-sonnet-5`). See
`docs/fit-evidence/HANDOFF.md` §7.

- **`/image`** (also the function's root): reads a shop's size chart image into the plan 1 §5 chart
  shape, so the extension can hand it to `lookup-chart` as a shop guide. One read per image address,
  stored for every shopper.
- **`/product`**: the popup's "Read this page with AI". Reads a product page's cleaned text into
  `{ brand, title, kind, sizes, fabric }`. Nothing is cached and nothing about the page is stored.

```
POST /functions/v1/read-chart-image/image
{ "image_url": "https://cdn.shop.example/size-chart.png", "brand": "Lune Atelier", "kind": "dresses", "install": "<uuid>" }

200 { "chart": { ...§5 chart, "status": "machine_read", "read_by": "read-chart-image" }, "note": "..." }
200 { "chart": null, "note": "<why there is no chart>" }
400 { "error": "..." }               bad input, or a field that is not one of the four
429 { "chart": null, "note": ... }   over the per-install or the overall daily cap
502 { "chart": null, "note": ... }   the model call failed; nothing is cached, so the next visit tries again
500 { "chart": null, "note": ... }   a database error

POST /functions/v1/read-chart-image/product
{ "title": "...", "headings": ["..."], "picker": "text around the size picker", "install": "<uuid>" }

200 { "brand": "Lune Atelier" | null, "title": "..." | null, "kind": "bottoms" | null, "sizes": ["XS", "S"], "fabric": "100% silk" | null }
400 / 429 / 502 / 500 { "error": "..." }
```

The image route, in order:
1. checks the input: exactly `image_url` (a public https address with a real hostname, no
   credentials, at most 2048 characters; the fragment is dropped), `brand` (at most 80 characters),
   `kind` (bottoms, tops, dresses or shoes) and `install` (a uuid);
2. answers from `chart_images` when this image (by the SHA-256 of its address) was already read into a
   chart, or found to hold none in the last 30 days, without spending any cap;
3. takes a place in the ledger, then enforces the caps from `chart_image_settings` (40 per install and
   2000 overall in 24 hours by default; image and product reads share them);
4. sends the image to the model by address (`{ type: "image", source: { type: "url" } }`) with a
   strict `record_chart` tool;
5. checks the answer with the rules of `src/guide-table.js`'s `parseGuideMatrix`: a model panel or a
   single garment's dimensions is not a chart; two rows or more, unique labels, measurements never
   going down and within plausible body ranges, waist and hip on two rows for clothing, foot length for
   shoes. A failing image leaves a 30-day "no chart" marker;
6. stores what the image shows (independent of who asked) and returns it for this request: the image
   address as `source_url`, `retailer_brand_chart` when the image names the brand and
   `retailer_house_chart` otherwise, `status` `machine_read`. A chart for another kind of item (a shoe
   chart on a dress page) answers `null`.

The product route checks the input (title, headings and picker text, at most 6000 characters
together, web addresses removed again), enforces the same caps, asks the model with a strict
`record_product` tool, and returns the cleaned answer. Its ledger row keeps only the install id and
the outcome; the migration refuses a product row that carries anything else.

## Deploy

The operator does this once, after the branch is merged. The function is not live until every step is done.

1. In the Supabase SQL editor, run `supabase/migrations/0007_chart_images.sql`, pasted as a whole
   (after 0006 if that is part of the same release; 0007 does not depend on it).
2. From `/Users/kristina/sizer`, signed in with `supabase login`:

   ```bash
   supabase functions deploy read-chart-image --project-ref cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api
   ```

   No new secret: the function reads `ANTHROPIC_API_KEY`, already set for `lookup-chart`.
   `--no-verify-jwt`: the extension calls with the project's publishable key, which is not a JWT; the
   function's own caps are what limit use. `--use-api` bundles on Supabase's side, so Docker is not needed.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase into every Edge Function. The
service-role key is used only in the function's database requests and is never logged, returned or
written.

To change the caps, edit the one row of `chart_image_settings` in the dashboard.

To check it after deploying (any public size chart image works):

```bash
curl -s https://cqvrdsgutpczbucbpiqa.supabase.co/functions/v1/read-chart-image/image \
  -H 'content-type: application/json' \
  -d '{"image_url":"https://<a public size chart image>","brand":"Helsa","kind":"dresses","install":"3f2b8c1e-6d4a-4f7b-9a1c-2e5d8f0b7c64"}'
```

Reads are listed in `chart_images`, with what was read in `chart`.

## Test

```bash
deno test supabase/functions/
deno check supabase/functions/read-chart-image/index.ts
sh tools/check-migrations.sh
```

The tests run the handler against an in-memory database and a scripted Anthropic endpoint; none
touches the network. `chart_test.ts` loads `src/charts.js`, `src/guide-table.js` and lookup-chart's
`chart.ts` to keep `CHARTS_FOR` and the plausible ranges identical everywhere.

## Files

| File | What it is |
|---|---|
| `index.ts` | The `Deno.serve` entry: reads the environment and wires the real clients |
| `handler.ts` | The two routes against injected database and fetch clients |
| `chart.ts` | Input checks, the ported chart rules, the §5 shape, the product answer |
| `prompt.ts` | The two system prompts and the two strict tool schemas |
| `db.ts` | The database client: Supabase's REST endpoint through `fetch` with the service-role key |
