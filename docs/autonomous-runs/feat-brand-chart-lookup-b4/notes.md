# autonomous-task notes: feat/brand-chart-lookup · Bundle 4 (brand-chart-lookup)

Built in the shared worktree (`.claude/worktrees/brand-chart-lookup`) on top of B3's review-fix commit.
A builder agent in a separate worktree was refused by the worktree guard (subagents cannot write to
another worktree), stopped cleanly, and its empty worktree was removed; the coordinator built B4 here.

## Task interpretation

HANDOFF §3.4 and §8: the extension asks the `lookup-chart` function for a brand with no chart, merges
the answer into the stored bundle, shows "Looking up <brand>'s size chart" for at most 6 s, and the
privacy, store and README copy say exactly what travels.

Files:
- `src/charts-store.js`: LOOKUP_URL, MISS_TTL (7 days), missKey, isMissFresh, sanitiseShopGuide,
  lookupBody, lookupEntry, mergeChart, createLookup (one in-flight request per key; a miss is stored,
  an error is not; the bundle is re-read just before the merge).
- `src/background.js`: `sizer:lookup-chart` handler; the shop is the sending tab's hostname.
- `src/engine.js`: LOOKUP_TIMEOUT_MS, lookupFor, lookingUpText.
- `src/content.js`: looking-up state on the line, pill hidden meanwhile, once per brand and kind per page.
- `tests/lookup.test.js` (18 tests), `tests/fixture-shop.html` (`?brand=unknown`, `&lookup=miss|slow`).
- Copy: `store/privacy.html`, `store/LISTING.md`, `store/PRODUCT_HUNT.md`, `store/competition.md`, `README.md`.

## Decisions made unilaterally

1. **The chrome stub stays inline in `tests/fixture-shop.html`**, not a new `tests/chrome-stub.js`
   as §3.4 item 5 names. The page already stubs `chrome` inline for every other switch; splitting one
   switch out would leave two stubs to keep in step.
2. **A looked-up chart is forced to `machine_read` client-side**, whatever the reply says, and a reply
   with no known `source_type` is dropped. `tierOf` reads a missing status as tier 1 (verified), so an
   unprovenanced chart would otherwise outrank checked ones. This closes the B2 review note.
3. **sanitiseShopGuide strips every `source_url` and caps the payload** (30 charts, 30 000 characters,
   caption 200). The page address never leaves the browser, as §3.4 item 4 requires, even though the
   function also drops it.
4. **The shop hostname comes from the sender tab**, not from the content script's message, so a page
   cannot claim to be another shop.
5. **The lookup runs after the first answer renders**, so first paint is never blocked; it only fires
   when Engine.recommend reports `brandKnown: false` and the product has a brand.
6. **Privacy copy names the model provider** (Anthropic's Claude) because the shop's table text and the
   brand go to it through the function; reviewers compare the policy against the data disclosure.

## Verification

- `node --test tests/`: 102/102. `deno test supabase/functions/`: 44/44. `tests/shops.html`: PASS, 53.
- Demo shop `?brand=unknown`: "Sizing this for you" → "Looking up Ostra Studio’s size chart" (~850 ms)
  → "Your size 28" (~1.4 s); sheet reads "Ostra Studio, chart read by machine" with the
  ostra-studio.example link. `&lookup=miss`: generic answer, "no size chart yet". `&lookup=slow`:
  generic answer at ~7 s.

## Operator-only (HANDOFF §9)

Run 0004 and 0005 in the SQL editor, set `ANTHROPIC_API_KEY`, deploy the function, reload, and open a
brand with no chart on a real shop.
