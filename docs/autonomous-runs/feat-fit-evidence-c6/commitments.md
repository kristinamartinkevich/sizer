# Commitments from feat-fit-evidence-c6

HANDOFF §9 was built in full except the Vinted message tool, which belongs to C5 and is left as a
named hook (`#vinted-slot`, `globalThis.SizerVintedPanel.mount`). Deviations are recorded in notes.md.

## Owed: browser checks (no browser in this run)

1. `tests/fixture-shop.html?ask=1`: the line reads "Sized here before. Did it fit? Tell Sizer under
   Why this size."; the sheet opens with "Did it fit?"; Yes, a size, Too small, an area, Save shows
   the thanks line and the note leaves the line; No shows "will not ask about this one again".
2. Popup with two sizings older than a week (in the real extension, or a page loading
   `tests/chrome-stub.js?sizings=due` with `ui/popup.html`'s scripts): the "Did it fit?" list, its
   styling in light and dark, and **Open side panel** opening the panel and closing the popup.
3. Side panel on a supported shop's product page: the full reasoning matches the sheet, it follows
   tab switches and page loads, recent sizings list with questions and "Bought it? Say how it fit",
   and an answer updates the list without resetting another open question.
4. Side panel on a `vinted.*/items/*` page: the Vinted slot shows (placeholder until C5 fills it).
5. After merge with C5: the Vinted bundle defines `SizerVintedPanel.mount` and loads its script in
   `ui/sidepanel.html` before `sidepanel.js`.

## Owed: operator

- Run migration `0008_fit_outcomes.sql` in the SQL editor after 0006 and 0007.
- Chrome Web Store: the new `sidePanel` permission needs the justification now in LISTING.md; the
  data disclosure note was extended for the answer (decide whether "User activity" applies).

## Amendments to prior commitments

None.
