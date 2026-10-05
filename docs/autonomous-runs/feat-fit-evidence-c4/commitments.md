# Commitments from feat-fit-evidence-c4

1. **Browser run of `tests/shops.html` owed.** This session had no browser. Expect PASS with 61
   checks (53 unchanged, 8 new for iframe-guide and guide-link). Run before C4 is cherry-picked onto
   `feat/fit-evidence` or as the first step after.
2. **Popup check owed.** "Check this page anyway" on a page with no brand or sizes must show "Read
   this page with AI"; on a readable page it must close as before. Needs the extension loaded.
3. **C5 builds on this function.** §8 adds a `/measurements` route to `read-chart-image`; it should
   share the caps row and the ledger (add `'measurements'` to `chart_images.route` in its own migration).
4. **Settings row may merge with C3's.** If 0006 introduces a general settings table, consider
   folding `chart_image_settings` into it in a later migration; 0007 stays as written.

## Amendments to prior commitments

None.
