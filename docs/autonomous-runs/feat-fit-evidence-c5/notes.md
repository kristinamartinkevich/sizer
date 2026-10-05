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
   host is not one of Vinted's image hosts, `images<n>.vinted.net` (`/^images\d*\.vinted\.net$/i`, the
   same rule on both sides since review wf_fdd1e9c0-f4e; the first rule also let in lookalike domains
   such as vinted.xyz and listing pages), so the route cannot be used as a general vision reader. If
   Vinted serves listing photos from another host, the photo read refuses them; a browser check below
   covers it.
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
   piece is High, against your measurements Medium, the label alone Low. Its heading follows the
   verdict in the line's words ("Too small for you", "Roomy on you", "Your size"; "Rough guess" for a
   label that fits), and it never offers "Read this page with AI" on Vinted (review wf_fdd1e9c0-f4e).

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
- `tests/shops.html`: not run by the builder (no browser in this session). Since run by the
  coordinator in a browser: PASS, 97 checks, including vinted-measured 12 and vinted-label 13.
- Copy: no em dash or exclamation mark in any added line (checked over the diff; a node test also
  scans `src/vinted.js` and `src/vinted-page.js`).

## Review

Not run in this session (the caller runs the battery on the shared branch).

## Operator-only

Redeploy `read-chart-image` (same flags as before) so `/measurements` exists; no migration, no new
secret. Reload the extension.

## Review (wf_fdd1e9c0-f4e): 9 confirmed, all applied

Every test below was mutation-checked: with its fix reverted on its own, the named test fails; with
the fix back, it passes. `tests/vinted-page.test.js` is new: it runs `src/vinted-page.js` and
`ui/popup.js` in a node vm sandbox with a minimal fake document and chrome.

1. Photo read on the wrong listing (major): `readPhotos` now drops an answer that arrives after the
   address moved on (a page counter bumped on navigation, plus the address itself), and writes to the
   current read of the listing rather than the object captured before the await; `run()` keeps photo
   values after its own awaits, so a re-read that was waiting no longer loses them. Tests: "a photo
   read that finishes after the shopper moved to another listing is dropped" and "a photo read
   survives a re-read of the same listing that was waiting when it finished" (vinted-page.test.js);
   each fails with its half of the fix reverted.
2. Denim skirts and shorts read as jeans (major): skirt and shorts now come before jeans in
   `KIND_WORDS`, and German and Dutch one-word compounds (Jeansrock, Jeansröcke, Jeansshorts,
   spijkerrok) match as endings. Test: "a denim skirt or denim shorts are a skirt or shorts, not
   jeans, in the Vinted languages" (vinted.test.js, French, German, English, Spanish, Italian, Dutch,
   Polish); fails with jeans moved back first.
3. Popup said "Your size" over a too small or roomy verdict (major): `popupResult` now carries
   `verdict` and a `heading` in the line's words ("Too small for you", "Roomy on you", "Your size";
   "Rough guess" for a label that fits or no verdict), and `ui/popup.js` shows `res.heading` when
   present (shops keep their wording). Tests: "the popup heading follows the verdict" (vinted.test.js)
   and "the popup heading on a Vinted listing follows the verdict" (vinted-page.test.js, the popup in
   a sandbox); each fails with its half reverted.
4. AI page read spent on Vinted and discarded (major): chose to not offer it on Vinted. On any
   `www.vinted.<tld>` page, "Check this page anyway" opens the listing's sheet and closes the popup,
   or off a listing says "Open a Vinted listing and Sizer will size it."; the AI offer is never
   shown, so no `sizer:product-text` / `sizer:read-product` call and no daily cap slot is spent.
   Why not apply the AI answer: it is a shop reader (brand, kinds, a size list for a chart), while a
   Vinted listing is one second-hand piece whose answer comes from the seller's measurements and the
   label, and the listing's sheet already says what is missing and copies a message asking the
   seller. Not offering it is both the honest and the simplest option. Test: "on Vinted the popup
   never offers the AI page read" (vinted-page.test.js, also checks a shop page still gets the offer);
   fails with the Vinted branch disabled.
5. Photo host rule let in lookalikes (minor): both sides now use `/^images\d*\.vinted\.net$/i`
   (`VINTED_PHOTO_HOST`, exported from `src/charts-store.js` and `measurements.ts`). The fixtures,
   the Deno helpers and the C5 notes all show photos on images1.vinted.net; www.vinted.<tld> serves
   listing pages, not photos, so it is not allowed. Tests: "the photo read sends only addresses on
   Vinted image hosts" (vinted.test.js) and "photos only from Vinted image hosts" (measurements_test.ts,
   which also checks the two rules are identical and runs the same lookalike list through both);
   each fails with the old rule restored on its side.
6. Catalogue read as a product after in-place navigation (minor): `run()` returns at once off an
   `/items/` page (so the load-time timers and a profile change do nothing there), and the popup's
   `sizer:analyze` / `sizer:open` reply "no product" without reading. `Vinted.isListingPath` holds the
   path rule. Test: "after Vinted moves to the catalogue in place, nothing reads it as a listing"
   (vinted-page.test.js); fails with either guard removed.
7. Area cm counted the loose/tight adjustment (minor): areas now carry `raw` (listing minus piece),
   `areaLines` states that, and against a piece marked loose or tight adds ", which fits you loose" /
   ", which is tight on you" so a roomy verdict at the same width reads true. Test: "against a piece
   that fits you loose or tight, the stated cm are the real difference from the piece"
   (vinted.test.js); fails with the adjusted diff restored.
8. ROUND_FROM_CM claimed but not compared (minor): `measurements.ts` exports `ROUND_FROM_CM`,
   `src/vinted.js` exports it too, and measurements_test.ts compares them; the header comment now
   names both copies (and the host rule). Test: "the halving rule matches src/vinted.js"; fails when
   the server value drifts.
9. shops.html never run (verifiability): recorded above under Verification and in commitments.md
   item 1: the coordinator ran it in a browser, PASS, 97 checks, vinted-measured 12 and vinted-label 13.

Verification after the fixes: `node --test tests/` 316/316 (306 before, 10 new); `deno test
--allow-read supabase/functions/` 126/126 (124 before, 2 new); `sh tools/check-migrations.sh` passes
(no migration touched). `tests/shops.html` was not re-run after these fixes (no browser here); none
of its checks read the changed wording, and its photo body check uses images1.vinted.net.
