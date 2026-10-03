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
2. Those measurements are placed on the product brand's chart.
3. Rigid fabric rounds up when you fall between sizes, high stretch rounds down, and the brand's
   reputation and your fit preference adjust it.
4. A "runs small / size up" note on the page moves it one full size (or down for "runs large").
5. The result maps to the sizes on the page, using the shop's product data for stock.

## Layout

| Path | What it is |
|---|---|
| `src/brands.js` | Size charts (body measurements per size) for 40 brands, plus generic charts |
| `src/engine.js` | Profile + page → size, reasons, confidence, stock fallback |
| `src/extract.js` | Reads the product page and finds the size picker |
| `src/content.js`, `src/panel-style.js` | What Sizer draws on shop pages |
| `ui/` | Popup and fit profile page |
| `store/` | Store listing, privacy policy, Product Hunt kit, image sources and renders |
| `tests/` | Engine tests and a neutral demo product page for visual checks |

## Limits

- Charts are approximate and women's only. Check them against each brand's current guide.
- Sizing runs on waist and hip, so it's strongest for jeans, trousers and skirts.
- Page reading is heuristic. If a shop changes its markup, `src/extract.js` may need a fix.

## Test and package

    node --test tests/
    sh package.sh        # dist/sizer-<version>.zip for the Chrome Web Store

`tests/fixture-shop.html` is a demo product page with query switches (first run, sold out, open
sheet, no picker) for checking every state; serve the folder over HTTP to open it.
