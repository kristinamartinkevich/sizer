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
   the reviews have no verdict; it replaces the researched `brand.tendency`. A true-to-size majority
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
