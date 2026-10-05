# Sizer

A Chrome extension that puts your size right under the size picker on clothing product pages.
It works from your measurements and the clothes you own, then reads the brand's size chart, the
fabric's stretch, the page's fit notes and the stock.

## Install for development

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. The fit profile opens on first install. It starts with a piece you own that fits well;
   measurements come second. Everything in it stays in your browser.

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

1. Measurements are used as given: bust, waist, hip, shoulder width, inseam, foot length. Otherwise
   each piece you own becomes body measurements through its brand's chart, nudged for pieces marked
   tight or loose. With no inseam, height gives a guessed leg length (about 0.45 of it) and the sheet
   says it is a guess. Weight never sizes anything.
   Bottoms are sized on waist and hip, tops on the bust, dresses on bust, waist and hip, and coats
   and jackets on bust and shoulder, each when the chart prints it; otherwise waist and hip. A piece
   you own can carry flat-lay measurements (measured straight across; widths are doubled). When the
   product's chart lists garment measurements, such a piece of the same kind is compared garment to
   garment, with no body estimate in between.
2. Those measurements are placed on the product brand's chart: the chart downloaded from the chart
   database when the brand has one for this kind of item, else the built-in approximation. A brand
   with no chart anywhere is looked up once: the line reads "Looking up <brand>'s size chart" for at
   most 6 s while the `lookup-chart` function finds the brand's published chart (or reads the shop's
   own size table), and the answer lands in the bundle as machine-read, ranked below checked charts.
   A miss is remembered for 7 days; a network failure is not, so the next visit tries again.
   When the page prints no size table, Sizer looks for one first in a same-origin frame, then on the
   shop's own size-guide page (one fetch per product page, without cookies, 3 s at most), then in a
   size chart image: the image's web address, the brand name, the kind of item and the install id go
   to the `read-chart-image` function, which reads the chart with Claude vision, caches it per image
   for everyone, and the result joins the lookup as the shop's size table, marked machine-read.
   Rows the brand page gets visibly wrong are marked suspect in the database and skipped. Charts
   that list garment rather than body measurements get a little ease taken off.
3. Between two sizes, your rule wins (go up, or go down); left to the fabric, rigid fabric rounds
   up and high stretch rounds down. The brand's reputation and your fit preference adjust it, and the
   preference can be set per kind of clothing (bottoms, tops, dresses, coats and jackets).
4. A "runs small / size up" note on the page moves it one full size (or down for "runs large").
   When the page says nothing, buyers' reviews stand in: one vote per review, and a verdict only
   when at least two reviews agree and they are the majority of those that mention fit. A shop's
   own fit bar ("68% say it runs small") counts the same way. Review text is kept out of the page
   text, so a reviewer's "runs small" is never mistaken for the brand's.
   The tally from each page is sent to the chart database keyed by brand and style, and every
   product page asks for the pooled tally of the same style on other shops, so a style's fit
   reputation follows it from Zalando to Net-a-Porter to the brand's own site. Each shop counts
   once, however many people read it. See `store/privacy.html` for exactly what travels.
   When at least three reviewers say their height or shape (Revolve's "About my height" and
   "About my curves" fields, or "I'm 5'4" and 130 lbs" in the text), each review counts by how like
   you its writer is, from your height, your hip minus waist and, when both sides give one, weight.
   That weighted verdict decides on the device; the plain count is still what is sent to the pool.
5. The chosen size is checked area by area against your measurements: the sheet says where it will
   be tight, close, roomy or fine, and adds what reviewers like you say about particular areas
   ("3 reviewers like you found it tight at the hips"). The line names a tight area only.
6. The result maps to the sizes on the page, using the shop's product data for stock. Women's sizes
   from different regions line up through one table (FR/EU = DE, IT = FR + 4, UK = FR − 28,
   US = UK − 4, and the letters XXS to 4XL), so a UK 10 on the page finds the brand's EU 38 or M.
   When "Check this page anyway" in the popup finds no brand or no sizes, it offers "Read this page
   with AI": on that click only, the page title, its headings and the text around the size picker
   (at most 6000 characters, web addresses removed) and the install id go to
   `read-chart-image/product`, which returns the brand, title, kind of item, sizes and fabric.
   Nothing of it is stored.
7. Shoes are sized by foot length alone, typed into the fit profile or taken from a pair you own, on
   the brand's shoe chart or a standard EU one.

The sheet's footer links to the brand page the chart was read from, with the date it was read.

## Layout

| Path | What it is |
|---|---|
| `src/brands.js` | Built-in approximate charts (body measurements per size) for 40 brands, generic charts, and the women's size conversion table (FR/EU, IT, UK, US, DE, letters) |
| `src/charts.js` | Turns the downloaded chart bundle into engine charts: cm, suspect rows dropped, one chart per kind of item |
| `src/charts-store.js`, `src/background.js` | Daily download of charts from the Supabase project into `chrome.storage.local`, and the one-off lookup of a brand with no chart |
| `src/engine.js` | Profile + page → size, reasons, confidence, stock fallback |
| `supabase/` | Schema migrations, the research seed and the script that builds it |
| `supabase/functions/lookup-chart/` | Edge Function that finds a brand's chart when nobody has one yet, stores it as machine-read; deploy steps in its README |
| `supabase/functions/read-chart-image/` | Edge Function that reads a size chart image (cached per image) and, on request, a page's product text, with Claude; deploy steps in its README |
| `src/extract.js` | Reads the product page, finds the size picker and any size table the page prints in its size guide, in a same-origin frame or on the shop's size-guide page, and size chart images |
| `src/guide-table.js` | Turns a printed size table into a chart, or rejects it (model measurements, garment dimensions, delivery tables); the size-guide page fetch |
| `src/content.js`, `src/panel-style.js`, `src/mark.js` | What Sizer draws on shop pages; the mark is inline SVG so shop CSPs cannot block it |
| `ui/` | Popup and fit profile page |
| `store/` | Store listing, privacy policy, Product Hunt kit, image sources and renders |
| `tests/` | Engine tests and a neutral demo product page for visual checks |

## Limits

- A looked-up chart is read by a model and is not checked by a person until someone flips it to
  verified in the dashboard; the sheet says so. A brand nobody can find a chart for falls back to the
  built-in approximation, and the sheet says which it used. Women's charts only so far.
- Clothing is strongest for jeans, trousers and skirts. Tops, dresses and coats use the bust and
  shoulder only when the brand's chart prints them; many built-in charts do not, so those fall back
  to waist and hip. Shoes need a foot length or a pair you own.
- Page reading is heuristic. If a shop changes its markup, `src/extract.js` may need a fix.

## Test and package

    node --test tests/
    python3 tools/serve.py 8766   # demo shop page and store frames, served without caching
                                  # http://localhost:8766/tests/fixture-shop.html?open=why&charts=1
    sh package.sh        # dist/sizer-<version>.zip for the Chrome Web Store
    sh tools/check-migrations.sh   # applies supabase/migrations/*.sql to a throwaway local Postgres,
                                   # one transaction per file, as the Supabase SQL editor runs them
    deno test supabase/functions/  # the lookup-chart and read-chart-image Edge Functions, no network

`tests/fixture-shop.html` is a demo product page with query switches (first run, sold out, open
sheet, no picker, and `?brand=unknown` for the chart lookup, with `&lookup=miss` or `&lookup=slow`)
for checking every state; serve the folder over HTTP to open it.

`tests/shops.html` runs the reader against saved real product pages in `tests/fixtures/shops/`
(Zalando, ASOS, Net-a-Porter, Revolve) and checks brand, sizes, stock, fit notes, reviews, size-guide
tables and the answer. `inline-guide.html` there is synthetic: a fictional brand page that prints
its size table inline, since none of the four real shops carries its chart in the page.
`iframe-guide.html`, `guide-link.html` and `guide-link-page.html` are synthetic too: a guide in a
same-origin frame, and a link to the shop's own size-guide page plus size chart images.
`aria-guide.html` exercises the size-guide finder alone: an ARIA grid in a size-guide dialog, a
captioned table, and tables in a cookie banner and in reviews that must be skipped. Open it at `http://localhost:8766/tests/shops.html` after any change to `src/extract.js`.
To add a shop: open the product page in a browser, save `document.documentElement.outerHTML`
as `tests/fixtures/shops/<shop>.html` (the demo server also accepts `POST /save?name=<shop>`), add
its expectations to `SHOPS` in `tests/shops.html`, and `python3 tools/render-shop.py <shop> <origin>`
builds a copy with Sizer injected at `store/render/<shop>.html` for a look or a store screenshot.
