# Competition

Researched 5 October 2026. Two markets sell "your size": tools the retailer embeds and pays for, and
tools the shopper installs. Sizer is in the second, which is nearly empty.

## Retailer-side vendors (the shopper never chooses these)

| Vendor | Asks the shopper | Learns from | Reach | Price | Claim |
|---|---|---|---|---|---|
| True Fit | age, gender, brands and sizes owned, fit preference | purchase and return outcomes, 100 m+ shoppers | 91k brands; PacSun, Lands' End, ASICS | $1,000/mo on Shopify, enterprise quote | "up to 50 % less size bracketing"; Moosejaw 24 % fewer size returns |
| Fit Analytics (Fit Finder) | height, weight, age, fit preference | purchase, return, body and garment data | 250+ partners; Zara, ASOS, Hugo Boss, Uniqlo | quote only | 2–4 % lower return rate |
| Bold Metrics | 4–6 inputs (height, weight, age, shape) | anthropometric "digital twin" | Gap Inc., New Balance, Canada Goose | subscription, unpublished | 32 % fewer returns on average |
| Virtusize | a garment you own, or measurements | garment specs, 250k fit profiles | 500+ brands; Adidas, Levi's, Ralph Lauren | from $39/mo | 20 % fewer returns |
| Sizebay | height, weight, age | estimated body measurements | 1,000 customers, Brazil-led | unpublished | sessions convert 50–150 % better |
| MySize / Naiz Fit | gender, height, weight, birth year, optional photo | body model | 70 brands; Levi's, Speedo, Desigual | quote | "65 % fewer size returns" |
| Perfitly | measurements or photos, 3D avatar | avatar fit check | a handful of small brands | unpublished | returns 28 % to 10 % (Otero) |
| Zalando (in-house) | past orders and feedback, optional two photos | returns across the platform | Zalando only, 70 % of assortment | free | prevented 8 % of size returns in 2025 |
| ASOS Fit Assistant | order history, optional height and weight | Fit Analytics model | ASOS only | free | none published |

Sources: truefit.com/fit-intelligence-spec, apps.shopify.com/truefit, info.truefit.com/moosejaw-case-study,
fitanalytics.com, boldmetrics.com/press, virtusize.com/partners, sizebay.com/en, mysizeid.com,
perfitly.com/press, corporate.zalando.com/en/technology/how-zalando-uses-technology-help-customers-find-right-size.

What they share:

- Every one asks height, weight, age and a fit preference. Only True Fit and Virtusize ask what you own.
- Only True Fit, Fit Analytics, Zalando and ASOS learn from returns. None say they read reviews.
- Every accuracy number is vendor-reported. No third-party audit or published hit rate exists for any of them.
- Only True Fit keeps a profile that follows the shopper between retailers. Everyone else is a per-store session.
- Coverage is the retailer's choice: the widget only exists where the retailer bought it, and only for
  the products the retailer loaded garment data for (Zalando covers 70 % of its own catalogue).
- The 2026 move is agentic commerce: True Fit ships an MCP layer, Bold Metrics an "Agentic Sizing
  Protocol" inside Gemini with Gap, Fit Analytics an AI shopping assistant.
- Shoppers' complaints, where found, are that the widget recommends a size they know is wrong, that it
  nags for sign-up, and (Zalando Trustpilot) a suspicion that it recommends what is in stock.

## Shopper-side extensions (Sizer's actual shelf)

| Extension | Users | Rating | Updated | Asks for | Decides by | Where it works |
|---|---|---|---|---|---|---|
| ABODY.AI | 151 | 4.6 (9) | Sep 2026 | typed measurements or QR sync from a body-scan app ($9.99/mo) | reads the store's chart, per-zone fit notes | "most stores", English pages |
| SizeAssistant | 197 | 5.0 (1) | Jun 2024 | measurements | overlays them on Shein's per-item chart | Shein women's only |
| FitYou | 76 | 4.8 (5) | Dec 2024 | measurements, account, paid after a month | highlights your numbers on table charts, no recommendation | table charts for tops and dresses |
| FitMatch | 0 | none | Jul 2026 | measurements | store chart, else AI estimate from photos and model reference, with a confidence score | any shop |
| MySizer | 7 | 5.0 (1) | Sep 2026 | account, measurements or full-body photo | brand converter, "500+ brands" | popup only |
| WeSize | 7 | none | Jan 2026 | measurements | analyses the page's chart | any shop |
| Comfort Fit | 7 | none | Jan 2026 | flat-lay measurements of clothes you own | compares to store charts | Amazon, Uniqlo, "10+" |
| Sizeme overlay | 9 | none | Oct 2025 | 12 measurements | nothing; a floating card of your numbers | any shop |
| fAIshion.AI | 880 | 4.7 (18) | Jul 2026 | photo for try-on | try-on first, sizing by chart and fabric second | any shop |

Delisted in 2025–2026: Leonardo (64 users, policy violation), Fytted (160), Size Guarantee, Size Wise,
SizeUp Apparel. "Apisizely", "SizeFinder", "Fitsize" and "Bodi" from the AI overview do not exist on
the Web Store. Sources: chromewebstore.google.com listings and extpose.com mirrors, 5 Oct 2026.

What this shelf looks like:

- The biggest pure sizing extension has 197 users. Most have under 10. Half of the 2026 launches are
  already delisted. ABODY's rating is eight five-star reviews posted in one week in June 2023.
- All of them are chart-versus-measurements. Not one reads a fit note, a review, stock, or stretch.
- Three of nine do not recommend at all; they draw your numbers on the chart and leave the decision to you.
- Two declare to the Web Store that they collect personal data and location while claiming "local only".
- The common complaints: "doesn't work on all sites", "sometimes it gets it very wrong", crashes other
  pages, timeouts, no idea what a measurement field means.

## Where Sizer stands

Sizer does the five things the shelf does not, and two things the retailer vendors do not.

| | Sizer | Best extension | Best retailer vendor |
|---|---|---|---|
| Sizes from clothes you own, not a tape | yes | Comfort Fit (flat-lay) | True Fit, Virtusize |
| Verified chart per brand, suspect rows skipped | yes | none (FitMatch scores confidence) | all, but only where bought |
| Reads the page's fit note and stretch | yes | none | Fit Analytics (garment data) |
| Reads buyers' reviews, pooled across shops | yes | none | none |
| Names the nearest size in stock when sold out | yes | none | none |
| Works on every shop, chosen by the shopper | yes | ABODY, FitMatch | never |
| Learns from your returns | no | none | True Fit, Fit Analytics, Zalando |
| Shoes | foot length | none | Virtusize, Sizebay |
| Nothing about you leaves the browser | all but an anonymous review tally | Sizeme, Leonardo | no; account or session on their servers |

The honest gap is returns. True Fit's model is trained on what people kept. Sizer's nearest
substitute is the post-purchase "did it fit?" prompt, which turns the shopper's own outcomes into
calibration without a retailer in the loop.

## What to say in the store listing

- "Works on any shop, not only the ones that bought a fit widget." Every retailer vendor is invisible
  on the next tab over.
- "Reads what buyers said, on this shop and the others." Nobody else does.
- "Tells you what to buy when your size is gone." Nobody else does.
- "From the jeans you already own." The only measurement most people know is a size that fits.
- Do not claim a return-reduction percentage. The whole market's numbers are self-reported and a
  single-person extension cannot audit one; the gap is a credibility advantage, not a weakness.

## Watch

- fAIshion.AI is the only extension with real distribution (880 users) and is adding sizing to try-on.
- FitMatch's photo-plus-model-reference estimate is the one idea on the shelf worth copying for brands
  without a chart.
- True Fit's MCP and Bold Metrics' agent protocol mean "what size am I" is about to be answered inside
  shopping agents. An extension that pools reviews and stock is a data source those agents lack.
