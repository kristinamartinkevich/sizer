# Commitments from feat-fit-evidence-c3 (client half)

1. **Browser check of the demo shop owed.** This session had no browser. Open
   `tests/fixture-shop.html?dossier=small&open=why`: the sheet shows "Checking what others say about
   the fit" briefly, then the size moves one up (headline "Others online say it runs small, sized
   up"), "Others online find it tight at the hips" is listed under "Where it fits", and "What others
   say online" lists two links (the second titled by its host) and no `javascript:` link. With
   `&reviews=small` added, the size moves once only. `?dossier=none` changes nothing.
2. **`tests/shops.html` should still PASS** with its current count; no reader changed, but run it.
3. **Live check after deploy.** Once 0006 is run and `fit-dossier` deployed, load the extension on a
   Revolve product page and confirm one POST to `/functions/v1/fit-dossier` per item, the body's seven
   fields, and that a second visit makes no request.
4. **C6 side panel.** It should show the dossier block (sources, brand note) from `result.dossier`,
   the same way the sheet does.

## Amendments to prior commitments

None.
