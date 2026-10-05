# Sizer

A Chrome extension that puts your size right under the size picker on clothing product pages.
It works from your measurements and the clothes you own, then reads the brand's size chart, the
fabric's stretch, the page's fit notes and the stock.

## Install for development

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. The fit profile opens on first install. Add measurements, clothes you own, or both.

On supported shops (Zalando, ASOS, Net-a-Porter, Mytheresa, Farfetch, Revolve, Shopbop, SSENSE,
Nordstrom, Zara, Mango, H&M, COS, ARKET and a few brand sites) the answer appears under the size
picker. On any other shop, click the Sizer icon and choose **Check this page anyway**.

## What appears on a product page

- **The line** under the size picker: your size, a one-line reason ("No stretch, sized up") and
  **Why this size**. The matching option in the shop's picker gets a ring.
- **Sold out:** the line names the nearest sizes in stock and how many sizes off they are, and
  rings them dashed.
- **Rough guess:** with thin information the line goes dashed and says what would firm it up.
- **First run:** with no sizes saved, the line offers **Add your sizes** instead of guessing.
- **The sheet:** the full reasoning, what Sizer read on the page, and a confidence meter.
- **The pill:** a bottom-right fallback when there is no picker to attach to.

## How it decides

1. Measurements are used as given. Otherwise each piece you own becomes body measurements through
   its brand's chart, nudged for pieces marked tight or loose.
2. Those measurements are placed on the product brand's chart: the verified chart downloaded from
   the chart database when the brand has one for this kind of item, else the built-in approximation.
   Rows the brand page gets visibly wrong are marked suspect in the database and skipped. Charts
   that list garment rather than body measurements get a little ease taken off.
3. Rigid fabric rounds up when you fall between sizes, high stretch rounds down, and the brand's
   reputation and your fit preference adjust it.
4. A "runs small / size up" note on the page moves it one full size (or down for "runs large").
   When the page says nothing, buyers' reviews stand in: one vote per review, and a verdict only
   when at least two reviews agree and they are the majority of those that mention fit. A shop's
   own fit bar ("68% say it runs small") counts the same way. Review text is kept out of the page
   text, so a reviewer's "runs small" is never mistaken for the brand's.
   The tally from each page is sent to the chart database keyed by brand and style, and every
   product page asks for the pooled tally of the same style on other shops, so a style's fit
   reputation follows it from Zalando to Net-a-Porter to the brand's own site. Each shop counts
   once, however many people read it. See `store/privacy.html` for exactly what travels.
5. The result maps to the sizes on the page, using the shop's product data for stock.
6. Shoes are sized by foot length alone, typed into the fit profile or taken from a pair you own, on
   the brand's shoe chart or a standard EU one.

The sheet's footer links to the brand page the chart was read from, with the date it was read.

## Layout

| Path | What it is |
|---|---|
| `src/brands.js` | Built-in approximate charts (body measurements per size) for 40 brands, plus generic charts |
| `src/charts.js` | Turns the downloaded chart bundle into engine charts: cm, suspect rows dropped, one chart per kind of item |
| `src/charts-store.js`, `src/background.js` | Daily download of verified charts from the Supabase project into `chrome.storage.local` |
| `src/engine.js` | Profile + page → size, reasons, confidence, stock fallback |
| `supabase/` | Schema migrations, the research seed and the script that builds it |
| `src/extract.js` | Reads the product page, finds the size picker and any size table the page prints in its size guide |
| `src/guide-table.js` | Turns a printed size table into a chart, or rejects it (model measurements, garment dimensions, delivery tables) |
| `src/content.js`, `src/panel-style.js`, `src/mark.js` | What Sizer draws on shop pages; the mark is inline SVG so shop CSPs cannot block it |
| `ui/` | Popup and fit profile page |
| `store/` | Store listing, privacy policy, Product Hunt kit, image sources and renders |
| `tests/` | Engine tests and a neutral demo product page for visual checks |

## Limits

- Only verified charts are downloaded; a brand without one falls back to the built-in approximation,
  and the sheet says which it used. Women's charts only so far.
- Clothing runs on waist and hip, so it's strongest for jeans, trousers and skirts. Shoes need a foot
  length or a pair you own.
- Page reading is heuristic. If a shop changes its markup, `src/extract.js` may need a fix.

## Test and package

    node --test tests/
    python3 tools/serve.py 8766   # demo shop page and store frames, served without caching
                                  # http://localhost:8766/tests/fixture-shop.html?open=why&charts=1
    sh package.sh        # dist/sizer-<version>.zip for the Chrome Web Store
    sh tools/check-migrations.sh   # applies supabase/migrations/*.sql to a throwaway local Postgres,
                                   # one transaction per file, as the Supabase SQL editor runs them

`tests/fixture-shop.html` is a demo product page with query switches (first run, sold out, open
sheet, no picker) for checking every state; serve the folder over HTTP to open it.

`tests/shops.html` runs the reader against saved real product pages in `tests/fixtures/shops/`
(Zalando, ASOS, Net-a-Porter, Revolve) and checks brand, sizes, stock, fit notes, reviews, size-guide
tables and the answer. `inline-guide.html` there is synthetic: a fictional brand page that prints
its size table inline, since none of the four real shops carries its chart in the page. Open it at `http://localhost:8766/tests/shops.html` after any change to `src/extract.js`.
To add a shop: open the product page in a browser, save `document.documentElement.outerHTML`
as `tests/fixtures/shops/<shop>.html` (the demo server also accepts `POST /save?name=<shop>`), add
its expectations to `SHOPS` in `tests/shops.html`, and `python3 tools/render-shop.py <shop> <origin>`
builds a copy with Sizer injected at `store/render/<shop>.html` for a look or a store screenshot.
