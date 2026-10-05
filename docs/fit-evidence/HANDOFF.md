# HANDOFF — Fit evidence, per-area fit, Vinted and post-purchase feedback

**Goal.** Close every gap between Sizer and the product brief the operator pasted on 2026-10-05
(the list of items checked as partly or not done in chat that day). After this plan Sizer knows
more of your body and your clothes, says where a size will be tight or loose, weights reviews by
how much the reviewer's body is like yours, refines the first answer with fit evidence gathered
once per item for everyone, reads size charts from images, iframes and size-guide pages, works on
Vinted, and asks "did it fit?" after you buy.

Builds on `feat/brand-chart-lookup` (plan 1). Branch `feat/fit-evidence` is cut from its last
commit; when plan 1 merges, this PR's base becomes `main`.

Operator decisions recorded 2026-10-05 ("do all"):
- Everything on the list except what the brief itself defers: **Reddit is v2, TikTok never.**
  Photo body scanning stays out, as the brief advises.
- **The profile never leaves the browser.** Every server-side model call is user-independent and
  cached per item or per image for everyone. Body-similarity weighting and per-area fit run on the
  device. This is how the brief's "cache per product" and the existing privacy promise coexist.
- **The model never does the size arithmetic.** It returns evidence (verdicts, per-area notes,
  extracted measurements); the engine does the maths, as the brief requires.
- **The inline line stays the primary surface.** The side panel is added beside it for the full
  reasoning, recent sizings and the Vinted message, not instead of it.
- **Cost guard.** Per-item model calls are capped per install per day and globally per day, like
  `lookup-chart`. Defaults: 40 per install, 2000 global. The operator can change them in the
  migration's settings row.

---

## 0. How to execute this plan

```
/autonomous-bundle-loop docs/fit-evidence/HANDOFF.md
```

Same setup as plan 1 (skills link, deno and supabase CLIs). Same delivery: **one PR**, shared branch
`feat/fit-evidence`, shared worktree `/Users/kristina/sizer/.claude/worktrees/brand-chart-lookup`
(reused from plan 1). **Claude never pushes and never arms auto-merge.** The ship step ends with:
```bash
cd /Users/kristina/sizer && git push -u origin feat/fit-evidence
```
```bash
cd /Users/kristina/sizer && gh pr create --base feat/brand-chart-lookup --head feat/fit-evidence --fill-first
```

Bundle order and parallelism: C1 first. C4 depends only on plan 1 and may be built in parallel with
C1 to C3 in its own worktree, then cherry-picked. C2 needs C1. C3 needs C2. C5 needs C1 and C4. C6
needs all.

**Operator steps after merge:** run migrations `0006` to `0008` in the SQL editor (in order), deploy
the two new functions with the same flags as `lookup-chart`
(`--no-verify-jwt --use-api`), reload the extension. No new secret: both functions reuse
`ANTHROPIC_API_KEY`.

---

## 1. Operating conventions

All of plan 1's §1 holds (TDD with a regression test for every fix; the pre-commit gate; no external
libraries; no secrets in the repo; the engine stays pure; copy rules; privacy wording ships in the
same bundle as what it sends; fixtures are not recaptured; migrations are append-only and pasted by
the operator). Changes:

1.1 Gate counts at the start of this plan: `node --test tests/` 103, `deno test
supabase/functions/` 44, `tests/shops.html` 53 checks, `sh tools/check-migrations.sh` passing.

1.2 Next free migration number is `0006`.

1.3 Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and carry
`Autonomous-Bundle: fit-evidence C<N>`.

1.4 New fixtures are synthetic and say so in their first comment (`tests/fixtures/shops/*.html`).
The saved Revolve page already carries real reviewer height, curves and sizing fields; use it.

1.5 Anything sent to a server is a field-for-field whitelist in a pure function with a node test,
like `lookupBody` in plan 1, and `tests/lookup.test.js`'s copy guard is extended to each new body.

---

## 2. Bundle status surface

| Bundle | Scope | Depends on | Status | PR # | Merge SHA |
|---|---|---|---|---|---|
| **C1** | Fuller profile: height, weight, bust, shoulder, arm; flat-lay on owned pieces; fit preference per category and between-sizes rule; FR/IT/UK/US/EU conversion; onboarding pushes owned pieces | — | [ ] not started | | |
| **C2** | Per-area fit ("tight in the bust, fine at the waist"); structured reviews; body-similarity weighting | C1 | [ ] not started | | |
| **C3** | `fit-dossier` function: per-item web fit commentary and model refinement, cached for everyone; two-stage answer | C2 | [ ] not started | | |
| **C4** | Charts from images (vision), same-origin iframes and same-shop size-guide pages; model fallback reader for "Check this page anyway" | — | [ ] not started | | |
| **C5** | Vinted: listing reader, seller measurements vs your owned pieces, brand-level fit, seller-message generator, photo measurements on request | C1, C4 | [ ] not started | | |
| **C6** | Post-purchase "did it fit?", anonymous fit outcomes, side panel | C1–C5 | [ ] not started | | |

---

## 3. Per-bundle launch commands

### 3.1 · C1 — Fuller profile

```
Implement bundle C1 of docs/fit-evidence/HANDOFF.md.
Branch: feat/fit-evidence
Worktree: /Users/kristina/sizer/.claude/worktrees/brand-chart-lookup
Scope: §4 of the HANDOFF.
Exit: node green with new tests; shops.html PASS 53; options page checked in the browser.
```

### 3.2 · C2 — Per-area fit and weighted reviews

```
Implement bundle C2 of docs/fit-evidence/HANDOFF.md. Same branch and worktree. Scope: §5.
Exit: node green; shops.html PASS with new Revolve review checks; demo shop shows per-area lines.
```

### 3.3 · C3 — fit-dossier

```
Implement bundle C3 of docs/fit-evidence/HANDOFF.md. Same branch and worktree. Scope: §6.
Exit: node and deno green; check-migrations passes with 0006; demo shop shows the two-stage answer.
```

### 3.4 · C4 — Charts from images, iframes and guide pages

```
Implement bundle C4 of docs/fit-evidence/HANDOFF.md. Branch: build in an isolated worktree cut
from feat/fit-evidence's first commit, then cherry-pick onto feat/fit-evidence. Scope: §7.
Exit: node and deno green; check-migrations passes with 0007; shops.html PASS with new fixtures.
```

### 3.5 · C5 — Vinted

```
Implement bundle C5 of docs/fit-evidence/HANDOFF.md. Same branch and worktree. Scope: §8.
Exit: node green; shops.html PASS with the synthetic Vinted fixtures; demo listing checked.
```

### 3.6 · C6 — Did it fit, and the side panel

```
Implement bundle C6 of docs/fit-evidence/HANDOFF.md. Same branch and worktree. Scope: §9.
Exit: node and deno green; check-migrations passes with 0008; side panel and prompt checked.
```

---

## 4. C1 — Fuller profile

Profile fields added to `SIZER_DEFAULT_PROFILE` (all optional, stored in cm unless noted):
`height`, `weight` (kg), `bust`, `shoulder` (shoulder width), `armLength`, `fitByCategory`
(`{ bottoms, tops, dresses, outerwear }`, each `snug | regular | relaxed`, falling back to
`fitPreference`), `betweenSizes` (`up | down | stretch`, default `stretch`, today's behaviour).

Owned pieces gain optional flat-lay measurements: `flat: { waist, hip, chest, length, inseam,
shoulder, sleeve }` in cm, measured flat across (a circumference is twice the flat width; the
engine converts). A piece with flat-lay measurements becomes a garment-to-garment reference: its
garment measurements are compared directly with the product chart when that chart is garment-based
(brief: "compares a garment to a garment").

Engine:
- Tops, dresses and outerwear use bust (and shoulder for outerwear) when the chart has it; bottoms
  keep waist and hip. `measure`/`position` work on bust and shoulder too, but a chart row still
  needs waist and hip to be kept (as built: a bust-only tops chart is dropped). Only a top, dress or
  jacket you own can tell Sizer your bust or shoulders (C1 review fix).
- `kindOf` gains `outerwear` (coat, jacket, blazer, parka, trench, manteau, veste, jacke).
- Height feeds the inseam guess when inseam is empty (inseam ≈ 0.45 × height, labelled a guess),
  and C2's similarity.
- Weight alone never sizes anything; it is only used by C2's similarity, and the sheet says so.
- A full conversion table `REGION` for women's clothing: FR/EU, IT (= FR + 4), UK (= FR − 28 for
  32–48), US (= UK − 4), DE = FR, and letter sizes, used by `parseSizeLabel` and the page matcher.
  Tests cover every pair in both directions.
- `betweenSizes` replaces the stretch threshold when set to `up` or `down`.

Options page: new fields under "Your measurements", a "Measure this piece" disclosure (first drafted as "Measure a piece you own") per
owned piece with a diagram-free list of what to measure, fit preference per category. Onboarding
(`?welcome=1`) leads with "Add a piece you own that fits well" and puts measurements second.

## 5. C2 — Per-area fit and weighted reviews

Per-area fit (as built): for the chosen size, compare each measurement the profile has among bust,
waist, hip and shoulder with that size's row. Chart rows are points, not ranges, so the verdict is
by how far over or under the row value you are: `tight` from 2.5 cm over (1.5 rigid, 3.5 high
stretch), `close` from 1 cm over, `roomy` from 4 cm under, else `fine`. Bottoms never name the bust,
shoulders or sleeves. Leg and length come only from reviewers (`long`/`short`); arm length has no
chart column yet. The result carries `areas: [{ area, verdict, source, text }]`, ordered tight,
short, long, close, roomy, fine; the sheet shows up to three that are not fine (or one line when
all are), and the line shows the first when it is `tight` ("May be tight at the hips").

Structured reviews: `extractReviews` keeps returning strings for compatibility, and
`reviewCards(doc)` returns the whole text of each review container; `parseReview` (in
`src/review-details.js`) turns one into `{ text, verdict, height, heightBucket, curves, weight,
sizeBought, usualSize, areas }`, reading:
- Revolve's fields ("About my height" petite/average/tall, "About my curves" straight hips/some
  curves/curvy, "Sizing" runs small/true/large, in English and French, any capitalisation).
- Free text: heights ("I'm 5'4", "1m65", "165 cm", "je mesure 1,65"; never a price), weights,
  "I bought a 27", "usually a 26", and areas ("tight in the hips", "long in the leg", "serré aux
  hanches"; not when negated, and not "the rise is a bit short").

Body similarity (pure, on the device): weight `w = height match × shape match × weight match`,
height match from the reviewer's height or bucket against the user's height (1 within 4 cm, 0.25
beyond 12 cm), shape match from curves against the user's hip − waist (straight < 20 cm, curvy
≥ 28 cm). Unknown fields count 0.6. Weight, when both you and the reviewer give one, scales the
result from 1 (within 4 kg) to 0.4 (15 kg apart) and is neutral otherwise; it never sizes anything.
The weighted verdict replaces the plain count, including with no verdict, when at least three
reviews carry a height or shape; the plain tally still goes to the pool. The reason says "3
reviewers about your height and shape say it runs small", counting only reviewers who gave both a
height and a shape and match (w ≥ 0.6). Area mentions from reviewers like you (w ≥ 0.6) feed
`areas` when at least two give the same one.

## 6. C3 — fit-dossier

Edge Function `supabase/functions/fit-dossier/` (Deno, std only, same structure as `lookup-chart`,
sharing nothing at runtime but copying its PostgREST and Anthropic helpers). Request body,
whitelisted in `src/charts-store.js` as `dossierBody`: `{ item_key, brand, style, kind, shop,
install, tallies }` where `tallies` is the anonymous on-page review tally `{small, large, tts,
total, areas}` the page already computed. No profile, no page address, no review text.

The function: cache hit on `fit_dossiers.item_key` younger than 30 days returns it. Otherwise caps
(per install, global), then one Claude call with `web_search` (max 5) asking for fit commentary on
this brand and style from retailer reviews and blogs, plus brand-level fit reputation, returned
through a strict tool: `{ verdict: small|tts|large|null, strength: 0..1, areas: [{ area, direction:
tight|loose|long|short, note }], brand_note, sources: [{ url, title }] }`. Every source URL must
appear in a web search result of the same turn (plan 1's provenance rule). Stored in
`fit_dossiers` (migration 0006, anon can read through a view, only the service role writes) and
returned.

Client: after the first answer renders (never blocking it), `content.js` asks the background for the
dossier; the line keeps the answer and the sheet shows "Checking what others say about the fit"
until it lands. The engine folds it in deterministically: a dossier verdict with strength ≥ 0.6
moves the size one step only when neither the page nor the weighted reviews already did; its areas
merge into C2's `areas`; its sources are listed in the sheet. A miss or error changes nothing and
is cached per item for 7 days locally (errors are not cached).

## 7. C4 — Charts from images, iframes and size-guide pages

- Same-origin iframes: `sizeGuideTables` also searches `iframe.contentDocument` when readable.
- Size-guide pages: a link whose text matches the size-guide words and whose host is the shop's own
  is fetched by the content script (`credentials: 'omit'`), parsed with `DOMParser`, and searched with
  the same finder. At most one fetch per page, 3 s timeout.
- Images: an `<img>` inside or next to a size-guide element, whose alt or file name mentions size,
  guide or chart, is sent by URL to a new function `read-chart-image` that reads it with Claude
  vision into the plan 1 §5 chart shape, validated by the same `parseGuideMatrix` rules ported to
  the function (waist and hip required for clothing, foot length for shoes, no model panels).
  Cached per image URL hash for everyone (`chart_images`, migration 0007). The client sends only the
  image URL (a public asset, not the page address), brand and kind. Results enter the lookup as
  `shopGuide` charts with `source_type` from the function and status `machine_read`.
- Model fallback reader: when "Check this page anyway" finds no brand or no sizes, the popup offers
  "Read this page with AI". It sends the page's cleaned product text (title, headings, the
  size-picker region's text, at most 6000 characters, no URL) to `read-chart-image`'s sibling route
  `/product` and gets `{ brand, title, kind, sizes, fabric }` back; nothing is cached.

## 8. C5 — Vinted

Content script on `https://www.vinted.*/items/*` (fr, de, co.uk, es, it, nl, be, pl, lt, cz, at,
lu, pt, se, fi, dk, sk, hu, ro, hr, ie, gr). Listing reader: brand, size label, category, condition,
description, and measurements written in the description ("aisselle à aisselle 48 cm", "pit to pit
19 in", "longueur 65", "tour de taille 34", "entrejambe 76", in FR/EN/DE/ES/IT/NL/PL).

The Vinted line says one of:
- "Your size" / "Too small for you" / "Roomy on you", from the seller's measurements compared with
  your owned pieces' flat-lay measurements of the same kind (nearest piece wins, the sheet names it),
  else with your body measurements plus standard ease;
- else the label size placed on the brand chart, flagged "label only, the seller has not measured
  it", with the brand's tendency and pooled review verdict as brand-level knowledge;
- and always a "Ask the seller to measure" button.

Seller message generator (pure, `src/vinted.js`): picks the measurements that matter by category
(tops: pit to pit and length; dresses: pit to pit, waist, length; jeans and trousers: waist flat,
rise, inseam, leg opening; skirts: waist and length; coats: pit to pit, shoulder, sleeve, length;
shoes: insole length), leaves out what the description already gives, and writes a short, polite
message in the listing's language (fr, en, de, es, it, nl, pl; others get English). Copy to the
clipboard; Sizer never sends a message.

Photo measurements on request: "Read measurements from the photos" sends the listing's photo URLs
(at most 4) to `read-chart-image`'s route `/measurements` and merges what it reads, labelled "read
from a photo". Never automatic.

## 9. C6 — Did it fit, and the side panel

Recent sizings: each answered product is kept locally (brand, style, kind, shop, size suggested,
date, chart tier), the last 50, 60 days.

"Did it fit?": in the popup and the side panel, sizings older than 7 days ask "Did you buy it?"
then "Which size?" and "How did it fit?" (too small / right / too big, plus optional areas). A
revisit of the same product page shows the same question in the sheet. An answer:
- becomes an owned piece with that fit, so the profile learns (local);
- is sent anonymously to `fit_outcomes` (migration 0008): `{ item_key, brand, kind, shop, install,
  size_bought, size_suggested, outcome, areas, chart_tier }`, no measurements, whitelisted in
  `outcomeBody` with a test. A view aggregates outcomes per brand and kind into `brand_fit`
  (small/tts/large counts), which joins the daily bundle as the brand's learned tendency once it has
  10 outcomes, and is named in the sheet ("12 Sizer users who bought this brand say it runs small").

Side panel (`chrome.sidePanel`, permission `sidePanel`): the current tab's full reasoning (the sheet
content, without the shop page's layout limits), the Vinted message tool on Vinted, and recent
sizings with the "did it fit?" questions. The inline line and sheet stay as they are.

Privacy, listing and README updated for every new outbound body: dossier request, chart image URL,
product-text fallback, photo URLs, fit outcomes. The copy guard test covers each.

---

## 10. Out of scope

- Reddit (brief: v2) and TikTok (brief: never). Photo body scanning.
- Clicking or scripting a shop's size-guide button; only links, iframes and what is in the page.
- Mass crawling: every server call is triggered by a page the user is viewing.
- Sending messages on Vinted for the user.
- Men's sizing.
