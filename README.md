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
On Vinted item pages (all 22 country sites, matched one by one as `https://www.vinted.<tld>/items/*`)
the answer appears under the listing's details; see "On Vinted" below.

## What appears on a product page

- **The line** under the size picker: your size, a one-line reason ("No stretch, sized up") and
  **Why this size**. The matching option in the shop's picker gets a ring.
- **Sold out:** the line names the nearest sizes in stock and how many sizes off they are, and
  rings them dashed.
- **Rough guess:** with thin information the line goes dashed and says what would firm it up.
- **First run:** with no sizes saved, the line offers **Add your sizes** instead of guessing.
- **The sheet:** the full reasoning, what Sizer read on the page, and a confidence meter.
- **The pill:** a bottom-right fallback when there is no picker to attach to.
- **Did it fit?** Coming back to a product sized on an earlier visit, the line says so and the sheet
  opens with the question.

## The popup and the side panel

- **The popup** shows the size for the current tab, and a week after a product was sized asks
  "Did it fit?": did you buy it, which size, too small, right or too big, and optionally where.
- **The side panel** (**Open side panel** in the popup) shows the current tab's full reasoning, the
  recent sizings with the same questions (an early answer is welcome), and, on Vinted listings, the
  slot the Vinted tools fill (`#vinted-slot` in `ui/sidepanel.html`; `ui/sidepanel.js` calls
  `globalThis.SizerVintedPanel.mount(slot, { tab, url })` when that exists).
- **An answer** to "Did it fit?" joins the pieces you own in your fit profile, so the next sizes learn from it, and is
  sent anonymously to `report_fit_outcome` (migration 0008): the brand and style name, the kind of
  item, the shop's hostname, the size you bought, the size Sizer suggested, the verdict (too small,
  right or too big), the areas you picked, the chart tier, whether the suggestion already used other buyers' answers
  (`learned_step`) and the install id. No measurements, no
  profile, no page address. An answer that cannot be sent waits in local storage for the next day.
  The recent sizings themselves (the last 50 from 60 days) never leave the browser.

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
   When neither the page, the reviews nor what others say online about the item (step 5) has moved
   the size, what Sizer users who bought the brand reported decides instead: the `brand_fit` view counts "did it fit?" answers per brand and
   kind of clothing where the size bought was the size Sizer suggested and that suggestion carried
   no learned step, one vote per install, shows them only from ten installs, and comes down with the
   daily charts. A clear majority moves the size one step and is named in the sheet ("12 Sizer users
   who bought this brand say it runs small"). The step is added on top of the brand's researched
   reputation and the fabric lean, because the answers it learns from were given to suggestions that
   already carried both; and since answers to a suggestion that already carried the step are not
   counted, a step cannot vote itself away.
5. Once the first answer is on the page (and any chart lookup has settled), Sizer asks the
   `fit-dossier` function once per item what others say about the fit online. The request carries
   the item key (brand and style name), the brand name, the style name, the kind of item, the shop's
   hostname, the install id and the page's anonymous review counts (small, large, true to size, and
   areas reviewers call tight, loose, long or short); never the profile, the page address or review
   text. The sheet says "Checking what others say about the fit" until it lands. The function
   searches the web with Claude and caches the dossier per item for everyone for 30 days; the
   browser keeps it 30 days, or 7 days when nothing was found, and errors are not kept. On the
   device, a "runs small" or "runs large" with strength 0.6 or more moves the size one step, but
   only when neither the page's note nor the reviews have already decided (true to size included).
   Its areas join the areas below ("Others online find it tight at the hips") and its sources are
   listed as links under the reasons.
6. The chosen size is checked area by area against your measurements: the sheet says where it will
   be tight, close, roomy or fine, and adds what reviewers like you say about particular areas
   ("3 reviewers like you found it tight at the hips"). The line names a tight area only.
7. The result maps to the sizes on the page, using the shop's product data for stock. Women's sizes
   from different regions line up through one table (FR/EU = DE, IT = FR + 4, UK = FR − 28,
   US = UK − 4, and the letters XXS to 4XL), so a UK 10 on the page finds the brand's EU 38 or M.
   When "Check this page anyway" in the popup finds no brand or no sizes, it offers "Read this page
   with AI": on that click only, the page title, its headings and the text around the size picker
   (at most 6000 characters, web addresses removed) and the install id go to
   `read-chart-image/product`, which returns the brand, title, kind of item, sizes and fabric.
   Nothing of it is stored.
8. Shoes are sized by foot length alone, typed into the fit profile or taken from a pair you own, on
   the brand's shoe chart or a standard EU one.

The sheet's footer links to the brand page the chart was read from, with the date it was read.

## On Vinted

`src/vinted-page.js` reads the listing (JSON-LD first, then the details rows by itemprop, test id or
label text): brand, size label, category path (which gives the kind of item), condition,
description and photo addresses. `src/vinted.js` does the rest on the device:

- **Measurements the seller wrote** ("aisselle à aisselle 48 cm", "pit to pit 19 in", "Bundweite",
  in FR/EN/DE/ES/IT/NL/PL) are compared with the nearest piece you own of the same kind that has
  flat-lay measurements, else with your body measurements plus ease. The line says **Your size**,
  **Too small for you** or **Roomy on you**, and the sheet says where and by how much.
- **No measurements:** the label size is placed on the brand's chart by the engine
  (`placeLabel`), flagged "Label only, the seller has not measured it", with the brand's tendency
  and the pooled review verdict listed as brand-level knowledge.
- **Ask the seller to measure** copies a short message in the listing's language (fr, en, de, es,
  it, nl, pl; others get English) asking only for what the description leaves out. Sizer never
  sends anything on Vinted.
- **Read measurements from the photos**, on that click only: the web addresses of up to four of the
  listing's photos (Vinted image hosts only), the kind of item and the install id go to
  `read-chart-image/measurements`, which reads any tape measure in them with Claude vision and
  returns flat widths and lengths in cm. Not cached, nothing of it stored; it shares the daily caps
  and the ledger with the other reads. Values read this way are labelled "read from a photo".

## Layout

| Path | What it is |
|---|---|
| `src/brands.js` | Built-in approximate charts (body measurements per size) for 40 brands, generic charts, and the women's size conversion table (FR/EU, IT, UK, US, DE, letters) |
| `src/charts.js` | Turns the downloaded chart bundle into engine charts: cm, suspect rows dropped, one chart per kind of item |
| `src/charts-store.js`, `src/background.js` | Daily download of charts from the Supabase project into `chrome.storage.local`, the one-off lookup of a brand with no chart, and the per-item fit-dossier request |
| `src/engine.js` | Profile + page → size, reasons, confidence, stock fallback |
| `supabase/` | Schema migrations, the research seed and the script that builds it |
| `supabase/functions/lookup-chart/` | Edge Function that finds a brand's chart when nobody has one yet, stores it as machine-read; deploy steps in its README |
| `supabase/functions/fit-dossier/` | Edge Function that gathers what others say about an item's fit online, sources checked against real search results, cached per item for everyone; deploy steps in its README |
| `supabase/functions/read-chart-image/` | Edge Function that reads a size chart image (cached per image) and, on request, a page's product text or a Vinted listing's photo measurements, with Claude; deploy steps in its README |
| `src/extract.js` | Reads the product page, finds the size picker and any size table the page prints in its size guide, in a same-origin frame or on the shop's size-guide page, and size chart images |
| `src/guide-table.js` | Turns a printed size table into a chart, or rejects it (model measurements, garment dimensions, delivery tables); the size-guide page fetch |
| `src/content.js`, `src/panel-style.js`, `src/mark.js` | What Sizer draws on shop pages; the mark is inline SVG so shop CSPs cannot block it |
| `src/vinted.js`, `src/vinted-page.js` | Vinted: measurements from the description, the comparison, the label-only answer and the seller message (pure); the listing reader and the line (DOM) |
| `src/sheet.js` | The reasoning sheet's content, shared by the sheet on the page and the side panel |
| `src/feedback.js`, `src/fit-question.js` | Recent sizings, the "did it fit?" timing, what an answer becomes (a piece you own, an anonymous outcome), and the question itself |
| `ui/` | Popup, side panel and fit profile page |
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
`vinted-measured.html` and `vinted-label.html` are synthetic Vinted-like listings: one with JSON-LD,
test-id rows and the seller's measurements, one with itemprop and label-text details and the label
size alone.
`aria-guide.html` exercises the size-guide finder alone: an ARIA grid in a size-guide dialog, a
captioned table, and tables in a cookie banner and in reviews that must be skipped. Open it at `http://localhost:8766/tests/shops.html` after any change to `src/extract.js`.
To add a shop: open the product page in a browser, save `document.documentElement.outerHTML`
as `tests/fixtures/shops/<shop>.html` (the demo server also accepts `POST /save?name=<shop>`), add
its expectations to `SHOPS` in `tests/shops.html`, and `python3 tools/render-shop.py <shop> <origin>`
builds a copy with Sizer injected at `store/render/<shop>.html` for a look or a store screenshot.
