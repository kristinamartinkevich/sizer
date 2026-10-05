# autonomous-task notes: feat/fit-evidence · Bundle C6 (fit-evidence)

Built in an isolated worktree on branch `c6-build`, cut from `a45b5cd` (feat/fit-evidence). The Vinted
bundle (C5) is built in parallel elsewhere; C6 builds no Vinted feature and leaves a named hook.

## Task interpretation

HANDOFF §9: recent sizings kept locally, "Did it fit?" in the popup, the side panel and (on a
revisit) the sheet, an answer becoming a piece you own and an anonymous outcome, migration 0008 with
`fit_outcomes`, `report_fit_outcome` and `brand_fit`, the engine using a brand's learned tendency,
the side panel, and the privacy, store and README copy with a copy guard.

Files:
- `src/feedback.js` (pure core, extended): `remember` keeps an earlier answer or dismissal;
  `askOnRevisit(list, key, now)` ignores a sizing from the last 12 hours (a reload is not a revisit);
  `typeOf`, `areasFor`, `sizingFrom`, `applyAnswer`, `dismiss`, `enqueue` (outbox, 20 max).
- `src/fit-question.js` (new): the question's steps and markup (pure) plus `mount()` for the popup,
  side panel and sheet.
- `src/sheet.js` (new): the sheet's content moved out of `content.js` unchanged, so the side panel
  draws the same reasoning.
- `src/engine.js`: `learnedFit` and its use in `recommend` and `recommendShoes`.
- `src/charts-store.js`: `BRAND_FIT_URL`, `OUTCOME_URL`, `normaliseBrandFit`, `withBrandFit`.
- `src/background.js`: `sizer:remember-sizing` (tabs only; shop from the sender tab),
  `sizer:answer-fit`, `sizer:dismiss-fit`; one queued writer for the sizings list; outcome outbox
  flushed after an answer, on startup and daily; `brand_fit` fetched with the daily charts.
- `src/content.js`: remembers each answered product once per page, asks on a revisit (line note and
  the question first in the sheet, kept across re-renders), `sizer:analyze` now also returns the
  product's brand, title and sizes for the side panel.
- `ui/sidepanel.html|css|js` (new), `ui/popup.html|js` ("Did it fit?" list, "Open side panel"),
  `ui/ui.css`, `ui/options.js` (keeps `fromFeedback` on save), `manifest.json` (`sidePanel`,
  `side_panel`, three new content scripts).
- `supabase/migrations/0008_fit_outcomes.sql`, `tools/check-migrations.sh` (0008 block).
- Tests: `tests/feedback.test.js` (extended), `tests/fit-question.test.js`, `tests/brand-fit.test.js`,
  `tests/side-panel.test.js`, copy guard in `tests/lookup.test.js`.
- Demo pages: `tests/fixture-shop.html` `?ask=1`; `tests/chrome-stub.js` `?sizings=due`, promise-form
  storage, stubbed answers.
- Copy: `store/privacy.html`, `store/LISTING.md` (incl. the `sidePanel` permission justification),
  `store/PRODUCT_HUNT.md`, `README.md`; HANDOFF §9 amended with the as-built decisions.

## Decisions made unilaterally

1. **A sizing carries the engine's kind and the profile's piece type.** `kind` is bottoms, tops,
   dresses, outerwear or shoes (what `brand_fit` groups by and the engine looks up); `type` is the
   anchor type read from the title (jeans, skirt, shorts, trousers, top, dress, jacket, shoes).
   The pre-built test "outerwear and unknown kinds become the nearest kind the profile knows"
   asserted `type: 'outerwear'`, which contradicted its own title: the profile has no outerwear type,
   and the engine would read such a piece as bottoms. It now asserts `jacket`; the fixture sizing
   gained `type: 'jeans'` and `kind: 'bottoms'`, and the sent body's `kind` is normalised.
2. **A revisit needs 12 hours.** The content script runs several times per page and remembers the
   sizing on the first run, so without a minimum the question would appear on the first visit or on
   a reload. The list is read before the sizing is remembered.
3. **`brand_fit` counts only outcomes where the size bought equals the size suggested.** Those are
   the ones that say whether Sizer's answer for the brand ran small or large; someone who ignored the
   suggestion says nothing about it. The view also hides any brand and kind under ten outcomes, so a
   single purchase never shows. The engine checks the same threshold.
4. **The learned tendency moves one whole size** (reason with `+1 size`, headline "Sizer users say
   it runs small, sized up"), only when the page has no fit note at all (true to size included) and
   the reviews have no verdict (nor a dossier move); since the review it is added on top of the
   researched `brand.tendency` and the rigid lean (see Review below). A true-to-size majority
   adds a reason and moves nothing. Shoes use it too.
5. **`brand_fit` is a separate daily fetch**, stored inside the chart bundle as `brandFit` (the
   HANDOFF allowed either). A failed fetch keeps the last list; `mergeChart` keeps it.
6. **A "right" answer sends no areas**, and areas are de-duplicated.
7. **Unsent outcomes wait in `outcomeOutbox`** (local storage, one per item, 20 max) and are retried
   after each answer, on startup and with the daily alarm. A 4xx refusal (other than 429) is dropped
   so one bad body never blocks the rest.
8. **The RPC's parameters are named after `outcomeBody`'s fields**, so the body posts as it is;
   bad input raises a message (PostgREST 400); one install is held to 50 outcomes a day.
9. **The side panel draws the sheet in a shadow root with the sheet's own (light) styles**, inside
   the theme-aware panel frame. It refreshes on tab switch, page load and storage changes; open
   questions keep their element (and progress) across redraws.
10. **Vinted hook:** `#vinted-slot[data-hook="vinted"]` in `ui/sidepanel.html`, shown on
    `https://*vinted.*/items/*`; `ui/sidepanel.js` calls `globalThis.SizerVintedPanel.mount(slot,
    { tab, url })` when the Vinted bundle defines it, else a placeholder line stays.
11. **The popup opens the side panel with the window id read at load**, because Chrome only opens
    it straight from the click.

## Verification

- `node --test tests/`: 238/238 (196 at start). `deno test supabase/functions/`: 115/115 (no
  function changed).
- `sh tools/check-migrations.sh`: ran on a local Postgres 16, 0001 to 0008 each as one transaction,
  plus the new 0008 block (RLS on, no policies, grants revoked, upsert replaces, the size-mismatch
  outcome left out, the under-ten brand hidden, bad outcome, kind, area, item key, shop and empty
  size refused, the 51st outcome of the day refused, anon cannot read or write the table). Mutation
  check: changing the expected `small` count makes the block fail.
- Not run: any browser check (no browser in this run). See commitments.md.

## Review (1 adversarial + 1 QA, wf_2dfac5ca-a56): 7 confirmed, all applied

- MAJOR: `brand_fit` counted answers against the suggested size, but that suggestion already
  carried the brand tendency, the rigid lean and possibly the learned step itself, and the learned
  step then replaced the first two. Now the step is added on top of the tendency and the lean (the
  answers were given to suggestions that already had them), each sizing records the step it used
  (`learned_step`, -1, 0 or 1, a new column in the unshipped 0008, with a range check), and answers
  to a suggestion that already carried a step are not counted, so a step cannot vote itself away.
  Copy in the privacy policy, listing, Product Hunt text and README names the new field.
- MAJOR: the ten-answer threshold counted rows, so one install could fill it alone. The view now
  keeps one vote per install per brand and kind (the latest) and needs ten installs.
  check-migrations covers a solo install with ten items (hidden) and learned_step 1 (not counted).
- MAJOR: a revisit overwrote the stored sizing with today's suggestion before the shopper answered
  the question about the earlier one. `remember` now keeps an unanswered, undismissed entry from
  the last 60 days as it is.
- MAJOR: no test combined a researched tendency or rigid fabric with brand_fit rows. Added: RE/DONE
  keeps its note and moves one step further; rigid keeps its lean, moves one step and offers no
  alternative; runs large records -1. Mutation-checked.
- MAJOR: the side panel, the popup's list and the sheet question had never run in a browser. All
  three now have, through the stub: the sheet question (yes, size, too small, hips, save) on the
  demo shop; the side panel with two due questions, each keeping its own step while the other is
  answered; the popup in light and dark, with "Open side panel" and the No path. The stub gained
  `tabs.onActivated` and `tabs.onUpdated`, without which the side panel stopped at "Reading this page".
- MINOR: `flushOutcomes` rewrote the outbox outside the queue answers are added in, so an answer
  given mid-send could be lost, and it waited for the next day. The rewrite now goes through
  `withSizings`, and an answer during a send asks for another pass (stopped when offline).
- MINOR: no test for the outbox. Added `tests/outbox.test.js` (background.js in a vm sandbox with
  storage that honours defaults): an answer given while another is sending goes out in the same
  run and the outbox empties; offline, the answer waits and the run does not loop. Mutation-checked.

Still open, for the operator: the side panel's Vinted slot shows a placeholder line, because the
Vinted bundle (C5) does not define `SizerVintedPanel.mount`.

`node --test tests/`: 312/312. `sh tools/check-migrations.sh`: 0001 to 0008 pass.
