# Commitments from feat-fit-evidence-c5

1. **Browser run of `tests/shops.html` owed.** No browser in this session. Expect PASS with every
   existing check unchanged and 25 new (vinted-measured 12, vinted-label 13).
2. **A real Vinted listing owes a look, with the extension loaded.** Open one listing on vinted.fr and
   one on another domain: the line sits under the details block, "Ask the seller to measure" shows
   "Copied" and the clipboard holds the message, "Read measurements from the photos" reaches the
   function (needs the redeploy) and labels what it reads. Confirm the real page's markup matches what
   `src/vinted-page.js` reads (JSON-LD Product, `data-testid="item-attributes-*"` rows or itemprop,
   item-photo images); the fixtures are synthetic, so a mismatch only shows on a real page. If the
   reader misses a field, capture that listing as a fixture and fix the selector.
3. **Photo host rule to confirm.** The photo read accepts only `*.vinted.<tld>` image hosts (client and
   function). If a real listing's photos come from another host, widen both rules together.
4. **In-place navigation to confirm.** The content script is declared on `/items/*`. Going from the
   catalogue to a listing without a reload may not inject it; the popup then injects the Vinted files.
   If that proves common, the bundle loop may widen the match to the Vinted origins with the path gate
   already in `src/vinted-page.js` (a store-copy change too).
5. **Optional migration 0009.** Measurements calls are ledger rows with `route = 'product'` and
   `reason = 'measurements'`, so no schema change was needed. If the operator wants a distinct route
   value, add `'measurements'` to `chart_images.route` (and the `product_row` constraint) in 0009, not
   0008, which is reserved for C6.

## Amendments to prior commitments

- C4 commitment 3 ("add `'measurements'` to `chart_images.route` in its own migration") is met without
  a migration: the route shares the caps and the ledger through product-shaped rows; see item 5 above.
