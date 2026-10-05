# autonomous-task notes: feat/fit-evidence · Bundle C5 (fit-evidence, Vinted)

Built in an isolated worktree on branch `c5-build`, cut from `a45b5cd` (feat/fit-evidence after C4's
"Show where it fits on the line and in the sheet"). Not pushed. The bundle loop cherry-picks it onto
`feat/fit-evidence`.

## Task interpretation

HANDOFF §8, on top of the already-built pure core in `src/vinted.js` (parseMeasurements, wanted,
sellerMessage, langOf, compare), which was reused and extended, not rewritten:

1. A Vinted content script on `https://www.vinted.<tld>/items/*` for the 22 domains in §8, each listed
   in the manifest. It loads the engine's dependencies, `src/vinted.js` and a new `src/vinted-page.js`
   (DOM reading and drawing only).
2. The Vinted line in a shadow root, like `content.js`: the seller's measurements against your pieces
   or body ("Your size" / "Too small for you" / "Roomy on you"), else the label placed on the brand
   chart through the engine, flagged "Label only, the seller has not measured it", with brand-level
   knowledge in the sheet; "Ask the seller to measure" copies the message, shows "Copied", sends nothing.
3. "Read measurements from the photos", on click only: up to four photo addresses to
   `read-chart-image/measurements`, a new route sharing the caps and the ledger, not cached.
4. Two synthetic fixtures and 25 new checks in `tests/shops.html`.
5. Privacy, listing, Product Hunt and README copy for the photo request and the Vinted matches.

Files:
- `src/vinted.js`: RANGE exported; areaLines, labelResult, COPY, kindOfListing (category path in the
  Vinted languages, most specific part first), engineTitle, sizeLabel, listingFrom (JSON-LD first,
  page details second), mergeMeasurements, answerFor (engine injected, so it stays pure), popupResult,
  hasProfile. SAME_KIND gains `outerwear: ['jacket']` (regression fix, below).
- `src/engine.js`: placeLabel (how many sizes a single label sits from your pick, clothing and shoes),
  and `pickIndex`, `pickLabel`, `chartSystem` on recommend's result (`pickIndex`, `pickLabel` on shoes).
- `src/vinted-page.js`: readRaw / readListing / anchorFor (exported as `SizerVintedPage` for
  `tests/shops.html`), the line, the pill fallback, the sheet, clipboard copy, the photo read, the
  popup's `sizer:analyze` / `sizer:open` / `sizer:product-text`, URL-change reset.
- `src/charts-store.js`: READ_MEASUREMENTS_URL, LISTING_KINDS, MEASUREMENT_KEYS, measurementsBody
  (field-for-field whitelist), readMeasurementsEntry, createMeasurementsRead.
- `src/background.js`: `sizer:read-measurements`, accepted only from a `www.vinted.*` tab.
- `src/panel-style.js`: `.line.vinted`, `.actions`, `.ghost`, `.msg`, `.tag`.
- `ui/popup.js`: VINTED_FILES, injected instead of the shop reader on a Vinted item reached without
  a reload.
- `manifest.json`: the second content_scripts entry.
- `supabase/functions/read-chart-image/`: `measurements.ts` (input check, arithmetic, ranges),
  `prompt.ts` (MEASURE_SYSTEM, measureUserContent, MEASURE_TOOL, strict), `handler.ts` (route),
  `measurements_test.ts` (9 tests), `test_helpers.ts`, README.
- Tests: `tests/vinted-listing.test.js` (27 tests), `tests/lookup.test.js` (package check covers every
  content_scripts entry), `tests/shops.html` (VINTED list, runVinted).
- Fixtures: `tests/fixtures/shops/vinted-measured.html`, `vinted-label.html` (both say synthetic first).
- Copy: `store/privacy.html`, `store/LISTING.md`, `store/PRODUCT_HUNT.md`, `README.md`.

## Decisions made unilaterally

1. **No migration.** C4's commitments suggested adding `'measurements'` to `chart_images.route` in a
   migration; the brief here said prefer none. A measurements call is written as a `product`-shaped
   ledger row (install id and outcome only, no address, brand, kind or answer, which 0007's
   `product_row` constraint already enforces) with `reason = 'measurements'`, so it shares the per-install
   and global caps and the same table with no schema change, and the dashboard can still tell the rows
   apart. Recorded as a commitment in case the operator wants a distinct route value later (0009).
2. **Vinted photo hosts only.** Both the client body and the function refuse any photo address whose
   host is not `vinted.<tld>` (images1.vinted.net and the like), so the route cannot be used as a
   general vision reader. If Vinted serves listing photos from another host, the photo read refuses
   them; a browser check below covers it.
3. **The model copies, the function does the maths.** The tool returns `{ value, unit, laid_flat }` per
   measurement; inches to cm, halving a waist or chest measured around (the same 55 / 70 cm rule as
   `parseMeasurements`) and the plausible ranges happen in `measurements.ts`, held equal to
   `src/vinted.js` RANGE by a Deno test that loads the extension file.
4. **The label is placed on the chart the label's own system implies.** `placeLabel` calls recommend
   with the label as the only page size (so a letter label on an EU brand reads on that brand's chart),
   then compares chart rows: the label's row by identity, else by position over the sizing keys. The
   brand's tendency and pooled reviews move the pick, so they move the verdict.
5. **Brand note always listed on the label path.** The engine pushes a brand's note only when its
   tendency is non-zero; on Vinted the note is shown as brand-level knowledge anyway (placeLabel returns
   `brandNote`; answerFor adds it once).
6. **"Always an Ask the seller to measure button" read as: in every state of the line, whenever there is
   something to ask.** When the description already gives every measurement that matters for the kind,
   sellerMessage returns null and the button is left out rather than copying an empty message.
7. **Content script on `/items/*` as specified**, plus two fallbacks for Vinted's in-place navigation:
   the script resets and re-reads when the address changes to another listing, and the popup injects
   the Vinted files (not the shop reader) on a Vinted item that has none.
8. **Kind of item from the category path**, read from its most specific part up, in all the Vinted
   languages; the title is the fallback, a top the default. The engine gets a fixed kind word
   (`engineTitle`) rather than the listing title, so a French or Polish title cannot pick the wrong chart.
9. **The popup on Vinted** gets the line's answer in its own result shape: a measured answer against a
   piece is High, against your measurements Medium, the label alone Low ("Rough guess").

## Regression fix

`compare()` never matched a coat listing to a jacket you own: listing kinds say `outerwear`, the options
page stores `jacket`. Fixed with `SAME_KIND.outerwear = ['jacket']`; the test "a coat is compared with a
jacket you own" fails without it (compare returns null).

## Verification

- `node --test tests/`: 223/223 (196 at start, 27 new).
- `deno test supabase/functions/`: 124/124 (115 at start, 9 new). `deno check` on `index.ts` clean.
- `sh tools/check-migrations.sh`: passes (no migration touched).
- `deno lint supabase/functions/read-chart-image/` reports one pre-existing problem (`ImageInput`
  imported and unused in handler.ts since C4), not touched here.
- `tests/shops.html`: NOT RUN (no browser in this session). Expected PASS with the existing checks
  unchanged plus 25 new (12 vinted-measured, 13 vinted-label).
- Copy: no em dash or exclamation mark in any added line (checked over the diff; a node test also
  scans `src/vinted.js` and `src/vinted-page.js`).

## Review

Not run in this session (the caller runs the battery on the shared branch).

## Operator-only

Redeploy `read-chart-image` (same flags as before) so `/measurements` exists; no migration, no new
secret. Reload the extension.
