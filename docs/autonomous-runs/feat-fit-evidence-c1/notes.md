# autonomous-task notes: feat/fit-evidence · Bundle C1 (fit-evidence)

Built by a builder agent in an isolated worktree on branch `c1-build`, reset to `dae6052` (the plan
commit on `feat/fit-evidence`). Not pushed. The coordinator cherry-picks it onto the shared branch.

## Task interpretation

HANDOFF §4 (C1, fuller profile): more of your body and your clothes in the profile, used by the
engine where the chart can answer, and one women's size table across regions.

Files:
- `src/defaults.js`: `height`, `weight` (kg), `bust`, `shoulder`, `armLength`, `fitByCategory` (`{}`),
  `betweenSizes` (`stretch`), and the flat-lay shape documented.
- `src/brands.js`: `REGION` (FR 32 to 48: FR = EU = DE, IT = FR + 4, UK = FR − 28, US = UK − 4,
  letters XXS to 4XL); a bust column on the generic EU and letter charts.
- `src/charts.js`: rows keep bust and shoulder (`extra.shoulder`, a range or a number); garment charts
  keep the raw garment numbers in `row.garment` beside the eased body numbers; bust ease 4 cm;
  `CHARTS_FOR.outerwear`.
- `src/engine.js`: `convertSize`; `parseSizeLabel` adds the FR/EU equivalent (`eu`) to labelled
  regional and letter sizes, and reads 2XL, 3XL and 4XL as letters; `measure` (the page matcher)
  lands a size from another region on the brand's own row through the table; `kindOf` gains
  `outerwear`; `bodyFromProfile` carries bust, shoulder, height and the inseam guess;
  `sizingKeys`/`basePosition` pick and combine the measurements per kind; flat-lay pieces compared
  garment to garment (`garmentReference`); `fitByCategory`; `betweenSizes`; weight reason;
  `matchPageSize` over the sizing measurements. The result also carries `kind`, `sizedOn` and
  `garmentToGarment` for C2.
- `ui/options.html`, `ui/options.js`, `ui/options.css`: the five new fields (bust and shoulder drawn
  on the figure; weight in kg or lb with the unit switch), a "Coat or jacket" type, a "Measure this
  piece" disclosure per piece listing what to measure for its type, fit per kind of clothing, the
  between-sizes control, bust in the read-out, and first-run onboarding that puts the wardrobe first.
- `ui/popup.js`: a bust-only profile counts as a profile.
- `tests/profile.test.js` (30 tests). `README.md`, `store/LISTING.md`, `store/privacy.html`.

## Decisions made unilaterally

1. **Dresses and coats are never sized smaller than the bust or shoulder allows.** §4 says they "use
   bust"; it does not say how bust combines with waist and hip. Waist and hip keep their 40/60 lean to
   the larger, and the final position is the largest of that and the bust (and shoulder for coats).
   A blend would have put a bust-L, waist-XS shopper in an M dress.
2. **Outerwear needs a bust to use the shoulder.** Shoulder alone is not enough to size a coat, so a
   chart or profile without bust falls back to waist and hip.
3. **Chart rows still need waist and hip** to be kept. A tops chart that prints only bust is still
   dropped, as before; accepting it would have needed every bottoms path to cope with rows without a
   waist. Out of §4's scope.
4. **Outerwear looks up and reads tops charts.** The database enum and the `lookup-chart` function know
   bottoms, tops, dresses and shoes only, so `lookupFor` sends `tops` for a coat and `CHARTS_FOR`
   reads tops, general, dresses for outerwear. No migration needed.
5. **`kindOf` checks outerwear before bottoms**, so "Denim jacket" is a jacket, not jeans. "Blazer
   dress" becomes outerwear; judged rarer than denim jackets.
6. **Flat-lay is used only against garment charts**, exactly as §4 says. Against a body chart the
   piece is read from its label size as before. Only pieces of the same kind count; several are
   averaged. A tight piece asks for a garment 1.5 cm bigger round, a loose one 1.5 cm smaller (the
   wardrobe's existing shift).
7. **`betweenSizes` thresholds**: `up` rounds up from a quarter of the way, `down` only from three
   quarters, matching the band in which Sizer already offers an alternative size. A reason ("Between
   two sizes, so the bigger one, as you asked.") appears only when the position was in that band.
8. **The weight reason appears in the sheet only when a weight is saved**: "Your weight is never used
   to pick a size." It rides the existing reasons list, so `content.js` is unchanged.
9. **The height guess is said only when the page has lengths** (W27/L30 style), since that is the only
   place it acts. The read-out on the profile page also shows it as a guess.
10. **Arm length is stored but not used to size in C1.** §4 lists the field; per-area fit (C2) reads
    it. Its hint makes no claim about what it does.
11. **The disclosure is labelled "Measure this piece"**, not "Measure a piece you own" as §4 words it:
    it sits inside one piece's card, where the plan's wording reads as an instruction to add another.
12. **A bust-only profile on a chart with no bust** gets a specific ask ("<brand>’s chart has no bust,
    so Sizer needs your waist and hip, or one piece you own.") instead of the generic first-run line.
13. **The generic EU and letter charts gained a bust column** (standard women's values), so a top from
    a brand with no chart can be sized on the bust. Built-in brand tables have no bust and fall back to
    waist and hip; the README limits say so.
14. **Weight follows the unit switch** (kg with cm, lb with inches), stored in kg.
15. **Store copy updated** (LISTING profile list and sizing paragraph, privacy policy's profile
    sentence names height, weight and flat-lay measurements). Nothing new leaves the browser.

Existing expectations: none changed. All 103 tests at the start pass unmodified.

## Verification

- `node --test tests/`: 133/133 (103 at start + 30 in `tests/profile.test.js`). The new tests were
  run before the implementation: 21 failed, 9 passed because today's behaviour already matched
  (outerwear lookup kind, the jacket anchor, UK sizes on Mango, trousers ignoring bust, the no-bust
  fallback, flat-lay of another kind and on a body chart, typed inseam, the `stretch` rule); those
  now guard against regressions. The bust-only ask in decision 12 was added test first (failed, then
  passed).
- REGION: 42 ordered system pairs × 9 rows = 378 conversions, each asserted in both directions.
- `deno test supabase/functions/`: not run; no function or migration changed. `check-migrations`: no
  migration added.
- `tests/shops.html`: **not run, must be re-run in a browser.** `parseSizeLabel` is what the reader
  uses to find the size picker (`src/extract.js` `domSizes`, `src/content.js` `findPicker`), and it
  now reads 2XL to 4XL as letters and adds an `eu` field. The builder had no browser.
- Options page: **not checked in a browser.** Static check only: every id the script reads exists in
  the page, and `node --check` passes for `ui/options.js` and `ui/popup.js`.

## Coordinator verification after cherry-pick

- `tests/shops.html`: PASS, 53 checks, on the shared branch with C1 in.
- Options page, driven in the browser pane with `tests/chrome-stub.js` injected: `?welcome=1` puts
  "Add a piece you own that fits well" first as 01; the "Measure this piece" fields follow the type
  (waist, hip, inseam, length for jeans; chest, shoulder, sleeve, length for a coat; hidden for
  shoes); per-kind preference and "Between two sizes" render; weight switches kg to lb; no errors.
- Cross-bundle break found on integration: C1 added `outerwear` to `CHARTS_FOR` in `src/charts.js`,
  and the parity tests in `lookup-chart` and `read-chart-image` (which C1's builder never ran)
  failed. The functions serve four kinds and the extension asks for coats as tops, so the parity
  tests now compare the served kinds and pin outerwear to read the same charts as tops.

## Review (1 adversarial + 1 QA, base dae6052, head db568be)

Five findings, all confirmed, all applied:
1. BLOCKER: a trousers or skirt piece read through the standard EU or letter chart (which C1 gave a
   bust column) lent the profile a bust, so a typed waist and hip stopped sizing tops. Only a top,
   dress or jacket now gives bust or shoulder. Regression test in `tests/profile.test.js`
   (reproduced at bust 88.5 before the fix).
2. MAJOR: the weight field promised to weigh reviews from people built like you, and nothing did.
   Kept the promise: C2's similarity now reads reviewer weights and scales by them when both sides
   give one. Tests in `tests/review-details.test.js`.
3. MINOR: "Your your waist, your hip and top M". Typed measurements are now bare names. Test added.
4. MINOR: HANDOFF §4 drift (label name, bust-only charts still dropped). Amended in place.
5. MINOR: garment-to-garment was covered for trousers only. Added a top measured flat across the
   chest against a garment chart's bust.
