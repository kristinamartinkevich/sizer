# autonomous-task notes: feat/fit-evidence · Bundle C2 (fit-evidence)

Built by the coordinator in the shared worktree, in three commits: the pure core
(`src/review-details.js`) while C1 and C4 were building elsewhere, the engine and reader wiring after
C1 landed, and the line and sheet display.

## Task interpretation

HANDOFF §5: per-area fit for the size picked; structured reviews (Revolve's fields and free text);
body-similarity weighting on the device.

Files: `src/review-details.js` (new), `src/engine.js` (`fitAreas`, `areaLine`, `sheetAreas`, weighted
verdict in `recommend`, `reviewReason`), `src/extract.js` (`reviewCards`), `src/content.js` and
`src/panel-style.js` (line note, "Where it fits" in the sheet), script lists in `manifest.json`,
`ui/popup.js`, `tests/fixture-shop.html`, `tests/shops.html`, `tools/render-shop.py`. Tests:
`tests/review-details.test.js`, `tests/fit-areas.test.js`, a Revolve "reviewer details" check in
`tests/shops.html`, a `?profile=measured` switch on the demo page.

## Decisions made unilaterally

1. **Chart rows are points, not ranges**, so an area compares your measurement with the size's
   row value: 2.5 cm over is tight (1.5 rigid, 3.5 high stretch), 1 cm over is close, 4 cm under is
   roomy. The plan's "over the row's max" wording assumed ranges.
2. **No inseam long/short from the chart.** The page matcher already picks the length from your
   inseam; `matchPageSize` does not return a parsed length. Leg long/short comes from reviewers.
   Arm length has no chart column to compare with and is not used yet.
3. **`reviewCards` reads whole review containers** (`.yotpo-review`, `[itemprop=review]`, `article`
   and similar), outermost first. The innermost-card rule split Revolve's fields into separate list
   items; caught by the new shops.html check.
4. **A card counts only with a verdict or an area**, so a menu reading "Curvy jeans Tall jeans"
   inside a review region cannot add a described reviewer.
5. **Height groups follow Revolve**: petite to 163 cm (5'4"), tall from 173 cm (5'8").
6. **Curvy is hip minus waist of 28 cm or more** (the plan said more than 28); a 28 cm difference
   reads curvy.
7. **Weight** (added after the C1 review): reviewer weights are read and scale the match from 1
   to 0.4 only when both sides give one, so the weight field's copy is true.
8. **The weighted verdict replaces the plain one** whenever three reviewers describe themselves,
   including replacing it with no verdict; the plain tally in `reviews.local` is what the pool gets.

## Verification

- `node --test tests/`: 196/196. `tests/shops.html`: PASS, 62 (54 before C4's 8).
- Demo shop `?profile=measured&open=why`: the sheet shows "Where it fits: Roomy at the waist".

Nothing new leaves the browser in C2; the profile and the weighting stay on the device.

## Review (1 adversarial + 1 QA, wf_76cdfbea-c03): 6 confirmed, all applied

- MAJOR: trousers could name the bust or shoulders (from a chart row or from reviewers).
  `fitAreas` now takes the kind; bottoms skip bust, shoulder and sleeve. Test mutation-checked.
- MAJOR: "N reviewers about your height and shape" counted reviewers with an unknown field. Similar
  now needs both a height (or group) and a shape, and w ≥ 0.6. The first weighting test's count drops
  from 3 to 2: its petite-only reviewer was the overclaim.
- MAJOR: an area's count included reviewers unlike you. Areas tally only w ≥ 0.6.
- MINOR: "$1.65" read as a height; "not tight in the hips" read as tight; "the rise is a bit short"
  read as a short garment. All three fixed, each with a test.
- MINOR: decision 8 (a weighted null replaces a plain verdict) now has a test.
- MINOR: HANDOFF §5 rewritten to the build (reviewCards, point thresholds, no arm, the copy).

`node --test tests/`: 201/201.
