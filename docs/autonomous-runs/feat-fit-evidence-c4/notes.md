# autonomous-task notes: feat/fit-evidence · Bundle C4 (fit-evidence)

Built in an isolated worktree on branch `c4-build`, cut from `dae6052` (the plan commit), as §0 of the
HANDOFF allows ("C4 may be built in parallel with C1 to C3 in its own worktree, then cherry-picked").
The two commits are meant to be cherry-picked onto `feat/fit-evidence`.

## Task interpretation

HANDOFF §7: charts from same-origin iframes, from the shop's own size-guide page, and from images
(new `read-chart-image` function, vision), plus the "Read this page with AI" fallback on the same
function's `/product` route. Privacy, listing, launch and README copy say what each sends, pinned
by the copy guard.

Files:
- `supabase/functions/read-chart-image/`: `handler.ts` (two routes, caps, cache), `chart.ts` (input
  checks, parseGuideMatrix rules ported, §5 shape, product answer), `prompt.ts`, `db.ts`, `index.ts`,
  tests (`chart_test.ts`, `handler_test.ts`, `db_test.ts`, 35 tests), `README.md` with the deploy command.
- `supabase/migrations/0007_chart_images.sql`: `chart_images` (cache, ledger) and
  `chart_image_settings` (the caps row, 40 and 2000). Applies on 0001 to 0005; no dependency on 0006.
- `tools/check-migrations.sh`: service role reads and writes both tables, anon reads and writes
  neither, one settings row only, a product row cannot keep a page address, an image row must be https.
- `src/guide-table.js`: `sameShopUrl`, `chartImageName`, `fetchGuideText` (credentials omit, 3 s,
  html only, same host after redirect), `PLAUSIBLE` exported.
- `src/extract.js`: `sizeGuideTables` searches readable same-origin frames and has a whole-page mode;
  `guideLink`, `guideImages`, `guideFromHtml`, `productText`.
- `src/charts-store.js`: `imageBody`, `productBody` (the two whitelists), `createImageRead`,
  `createProductRead`, `withImageChart`, `applyReadProduct`, `READ_IMAGE_URL`, `READ_PRODUCT_URL`.
- `src/background.js`: `sizer:lookup-wanted`, `sizer:read-chart-image`, `sizer:read-product`.
- `src/content.js`: `moreGuide` before the lookup; `sizer:product-text`; `sizer:open` takes `ai`.
- `ui/popup.html`, `ui/popup.js`: "Read this page with AI" state.
- `tests/guide-sources.test.js` (11), copy guard in `tests/lookup.test.js` (1 new test).
- Fixtures `iframe-guide.html`, `guide-link.html`, `guide-link-page.html`; 8 new checks in `tests/shops.html`.

## Decisions made unilaterally

1. **One table for cache and ledger.** `chart_images` has a row per model call, both routes. The
   image cache is the newest `chart` row for the URL hash (or a no-chart row under 30 days). A
   product row keeps only install, outcome and time, enforced by a check constraint.
2. **The caps live in `chart_image_settings`**, a one-row table owned by this migration, so 0007
   needs nothing from 0006. If C3's 0006 adds a shared settings row, the two can be merged later.
   Image and product reads share the caps. A missing row falls back to 40 and 2000 in code.
3. **What is cached is brand and kind independent.** The model records the image's heading and the
   brands it prints; `mentions_brand`, `source_type` (`retailer_brand_chart` or
   `retailer_house_chart`) and the kind check are settled per request. One read serves every shop
   and brand that uses the same image. A chart for another kind of item answers null.
4. **Model panels are rejected twice**: the strict tool's `table_type` and the MODEL wording from
   `guide-table.js` applied to the heading. Plausible ranges are copied and held equal by a test.
5. **Tool choice mirrors lookup-chart**: `auto` first, one forced follow-up if the answer came back
   as prose. No temperature. The image goes as `{ type: "image", source: { type: "url" } }`
   (confirmed against the claude-api reference).
6. **The guide page and the image only run when the lookup would.** `sizer:lookup-wanted` checks
   the 7-day local miss first, so a chartless brand never spends an image read. Only the first chart
   image is read per page.
7. **"Check this page anyway" now waits for the answer**: if the page has a brand and sizes the popup
   closes as before; otherwise it shows the AI offer. The AI answer fills only what the page reader
   missed (`applyReadProduct`); its kind reaches the engine by a kind word on the title only when the
   title names no kind.
8. **`productText` falls back to the block around the title** when there is no size picker, and
   leaves out header, menu, footer, dialogs and reviews. The privacy copy says so.
9. **`sizer:read-product` is refused from a tab**: only the popup can ask, so it stays a click.

## Verification

- `node --test tests/`: 115/115 (103 at start; 11 in guide-sources, 1 copy guard).
- `deno test supabase/functions/`: 79/79 (44 at start; 35 new). `deno check` clean on the new files.
- `sh tools/check-migrations.sh`: passes, 0001 to 0005 and 0007, three anon checks.
- A mutation check: disabling the model-heading rule fails 2 tests.
- The three fixture tables were run through `parseGuideMatrix` in node and give what `SHOPS` expects.
- **Not run: `tests/shops.html`.** This session had no browser. The 53 existing checks are
  unchanged in code; 8 checks were added (iframe-guide 2, guide-link 6). It needs a browser run
  (serve with `python3 tools/serve.py 8766`, open `/tests/shops.html`, expect PASS with 61).
- **Not run: the popup flow and a live page.** "Check this page anyway" then "Read this page with AI"
  needs the extension loaded and the function deployed.

## Operator-only

Run 0007 in the SQL editor; deploy with
`supabase functions deploy read-chart-image --project-ref cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api`
(no new secret); reload the extension. Then try a shop whose chart is an image, and a page Sizer
cannot read, from the popup.

## Review (1 adversarial + 1 QA, wf_69277a80-867): 6 confirmed, all applied

- MAJOR: the store listing's data-usage answer said every request carries the shop's hostname and
  install id. The image and product-text requests carry the install id and no hostname; it now says
  which is which, four cases.
- MAJOR: `productText` had no tests. Two synthetic fixtures in `tests/shops.html`: `product-text`
  (header, breadcrumb menu, reviews, dialog and footer each carry a marker; the picker's block is
  short so it grows to `<main>` past them) and `product-text-bare` (no picker: the title's block).
  Mutation-checked: dropping the header, nav and footer exclusions fails both. The first version of
  the fixture never grew past the product block, so it could not catch a menu leak; rebuilt.
- MAJOR (same finding): the popup-only gate and the lookup gate were untested.
  `tests/background.test.js` loads the service worker in a `vm` sandbox; a tab's message is refused,
  the popup's goes to `/product`. Mutation-checked by removing `!sender.tab`. `moreGuide` moved from
  `content.js` into `src/guide-table.js` with its effects passed in, so the gate (no page fetch and no
  image read when the lookup would not run; one guide fetch per page; one image) is tested in node.
- MINOR: Product Hunt copy now names what the image read and the AI read send.
- MINOR: popup consent copy names the install id.
- MINOR: HANDOFF §7 says both reads send the install id.
- MINOR: LISTING "WHAT IT READS" names the shop's guide (table, frame, guide page, picture) and the
  AI fallback.

`node --test tests/`: 206/206. `tests/shops.html`: PASS, 72.
