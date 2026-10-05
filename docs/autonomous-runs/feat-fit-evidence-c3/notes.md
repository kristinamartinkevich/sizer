# fit-evidence C3, client half: notes

Branch `c3-client`, cut from `a45b5cd` on `feat/fit-evidence`. Scope: HANDOFF §6, client side. The
server half (`supabase/functions/fit-dossier/`, migration 0006) is in `notes-server.md` and was not
touched here.

## What was built

- `src/charts-store.js`: `DOSSIER_URL`, `dossierKey`, the pure `dossierBody` (field-for-field
  whitelist), `dossierEntry` (the reply held to the function's shape) and `createDossier` (the
  background worker's request, browser APIs injected, like `createLookup`).
- `src/background.js`: message `sizer:fit-dossier` → `createDossier`, the shop taken from the sending
  tab's hostname as for lookups.
- `src/engine.js` (pure): `recommend` reads `product.dossier` and folds it in for clothing and shoes;
  the result gains `dossier` (only when there is one) and `reviewAreas` (clothing).
- `src/content.js`: asks once per item after the first answer, shows "Checking what others say about
  the fit" in the sheet while waiting, re-runs when it lands, lists sources as links under the reasons.
- `src/panel-style.js`: styles for the waiting line, the brand note and the source list.
- `tests/fixture-shop.html`: `&dossier=small` and `&dossier=none`, answered after 500 ms.
- Copy: `store/privacy.html`, `store/LISTING.md`, `store/PRODUCT_HUNT.md`, `README.md`.
- Tests: new `tests/dossier.test.js` (25), one new copy-guard test in `tests/lookup.test.js`.

## Decisions

1. **Request shape.** Exactly `{ item_key, brand, style, kind, shop, install, tallies }`, as
   `parseDossierInput` checks. `item_key` is `Store.itemKey(brand, title)`, the same key
   `item_fit_reports` uses for the pool, so the shapes match by construction (a test pins the regex).
   `style` is the key's style part, as `reportFit` already sends it. A body the function would
   refuse (bad key, empty brand, unknown kind) is never sent: `dossierBody` returns null.
2. **Kinds.** The function knows bottoms, tops, dresses and shoes. Outerwear is sent as `tops`, the
   same mapping `lookupFor` uses for chart lookups.
3. **Tallies.** `small`, `large`, `tts`, `total` come from `result.reviews.local`, the plain on-page
   count that already goes to the pool (never the pooled or the weighted one). `areas` is a new
   unweighted tally, `result.reviewAreas`, one mention per review per area and direction, sent as
   `{ area: { direction: count } }`. The weighted area tally was not used because its counts depend on
   the profile. A shop fit bar can report more reviews than the function's 5000 limit; then all four
   counts are scaled down together so the shares hold. `total` is never below small + large + tts.
4. **Caching in the browser.** Per item key (`dossier:<item_key>` in `chrome.storage.local`): a found
   dossier 30 days, `{ dossier: null }` 7 days, any error (non-200, network, bad JSON, a reply outside
   the schema) nothing. One request in flight per item key, whatever shop asks.
5. **Reply check.** `dossierEntry` keeps only known verdicts, a strength in 0..1, known areas and
   directions, and http(s) sources; anything else in the shape is an error, cached as nothing.
6. **The fold.** A `small` or `large` verdict with strength 0.6 or more moves the size one step, but
   only when nothing on the page has decided. I read "neither the page nor the reviews already moved
   it" to include a page note or review verdict of **true to size**: those hold the size too, since
   moving against direct evidence on the page would contradict it. The reason then says what came
   first. A move counts as explicit, like a page note: the brand's tendency and the rigid-fabric lean
   are skipped and no alternative is offered, so nothing is counted twice.
7. **Reason lines.** Always one when a dossier is used: moved ("Others online say it runs small
   (2 sources), so one size up."), weak, true to size, agreeing with the page, held by the page or
   reviews, or areas only. The headline is "Others online say it runs small, sized up" when it moved.
8. **Areas.** Merged into `result.areas` with `source: 'web'`, text "Others online find it tight at
   the hips" (loose maps to the `roomy` verdict as reviewer areas do). Skipped when reviewers like you
   already named the same area and verdict. The model's free-text `note` is not shown.
9. **Sources.** Only http(s) addresses, checked in three places (store, engine, sheet), escaped, opened
   with `rel="noopener noreferrer"`. A dossier whose sources are all dropped is treated as no dossier
   at all, matching the server rule that nothing unsourced is kept. The brand note shows above the
   links, escaped.
10. **Timing.** `askDossier` runs at the end of `run()`, after `place()`, and only when no chart lookup
    is pending; the lookup's `done` asks it after a miss or timeout, and a found chart re-runs, which
    asks. The waiting line shows for at most 90 s; a later reply is still cached by the worker.
11. **Shoes** take the verdict and areas too (`across the foot`); the dossier is the only source of
    areas for shoes.

## Verification

- `node --test tests/`: **222 passed, 0 failed** (196 at start, 26 new).
- Mutation checks, each reverted after (script in the session scratchpad): dropping the page/review
  hold (3 fail), threshold 0.5 (1), engine listing any scheme (1), true to size not holding (1),
  caching errors (1), a miss kept 30 days (1), raw tally fields leaking into the body (3), no
  in-flight dedupe (1), README losing "anonymous review counts" (1).
- `node --check` on `src/content.js` and `src/background.js`: clean.
- Not run here: anything in a browser (see commitments), `deno test` (server code untouched).

## Integration (coordinator)

Cherry-picked onto the shared branch as c11ae36. Conflicts with C2's review fix and C4's copy fix
resolved: `fitAreas` keeps C2's kind argument, and the dossier's web areas follow the same rule
(trousers never take a bust, shoulder or sleeve area from the web; test mutation-checked). The store
copy merges the dossier request with C4's "which request carries the hostname". C6 later moved the
sheet into `src/sheet.js`; the web block (checking line, brand note, sources) moved with it, so the
side panel lists the sources too (test in tests/dossier.test.js). With C6, the order is page note,
reviews, this item's dossier, then Sizer users' learned brand fit; a dossier move keeps the learned
fit from moving the size again (test mutation-checked).

Browser, demo shop: `?dossier=small&open=why` shows "Checking what others say about the fit" at
0.9 s, then "Others online say it runs small, sized up", "Others online find it tight at the hips"
and two links (no `javascript:`). On these rigid demo jeans the size stays 28: the dossier replaces
the rigid lean, as a page note does.

## Review (1 adversarial + 1 QA, wf_d185200d-764): 3 confirmed, all applied

- MAJOR: the privacy policy and the listing did not say the function keeps a record of each
  request (dossier_requests: item key, brand, kind, hostname, install id, time, outcome). Both say
  so now. The record has no retention limit; whether to add one is a schema decision left to the
  operator.
- MINOR: `dossierBody` sent any shop and install, so a tab on localhost, an intranet name or an
  address made a request the function always refuses, on every page load. It now holds the shop to
  the function's hostname shape and the install to a uuid; the test mirror checks both.
- MINOR: no test that a dossier move replaces the rigid lean and the brand tendency. Added: on
  rigid fabric a dossier lands where the page's own "runs small" note does, with one moving reason;
  RE/DONE's tendency note steps aside. Mutation-checked by dropping the dossier from `explicit`.

Observation, not changed: the rule that rigid fabric rounds up when you fall between two sizes
(README step 3) is separate from the lean, so a "runs small" from the page or from the dossier adds
a size on top of it (40 to 42 becomes 44). That predates C3 and applies to page notes too.

`node --test tests/`: 306/306.
