# Sizer

A Chrome extension that shows your size on a clothing product page. It works it out from
sizes you already know (for example Zara EU 38, denim waist 27), the brand's size chart,
and the fit notes on the page ("no stretch", "runs small, size up", elastane %).

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Click the Sizer icon, then **Edit my sizes** to set up your fit profile:
   - **Measurements**: waist, hip and (optionally) inseam, in cm or inches.
   - **Clothes you own**: brand, label size, and whether each piece is a bit tight, just right or a bit loose.
   - **Fit preference**: close, regular or a little room.

   The panel on the right shows your estimated measurements and your size in eight brands as you type.
   If you give both waist and hip, those win, and Sizer flags any clothes that disagree with them.

A "Your size" pill appears on product pages at Zalando, Zara, ASOS, Net-a-Porter, Mytheresa,
Farfetch, Revolve, Shopbop, SSENSE, Nordstrom and some brand sites. On any other shop, click the
Sizer icon and choose **Show my size on this page**.

## How it decides

1. Your measurements are used as given. Otherwise the clothes you own become body measurements through each brand's chart, nudged for pieces you marked tight or loose.
2. Those measurements are placed on the target brand's chart.
3. Adjustments: rigid fabric leans up, high stretch leans down, brand fit reputation, your fit preference.
4. A "runs small / size up" (or "runs large") note on the page moves it one full size.
5. The result maps to the sizes on the page, and Sizer flags it if that size is sold out.

Every step is listed under **Why** in the panel.

## Limits

- Charts in `src/brands.js` are approximate and women's only. Check them against each brand's current guide.
- Sizing is built around waist and hip, so it's strongest for jeans, trousers and skirts.
- Page reading is heuristic. Shops change their markup, so a page can need a fix in `src/extract.js`.

## Test

    node --test tests/
