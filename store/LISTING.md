# Chrome Web Store listing

## How to publish, start to finish

1. **Developer account.** Sign in at https://chrome.google.com/webstore/devconsole with the Google
   account you want to own the extension, pay the one-time $5 registration fee, and verify the
   account email. This needs your sign-in and card, so it is yours to do.
2. **Host the privacy policy.** It is required now that the review tally and chart lookups leave the browser. Easiest:
   repo Settings → Pages → deploy from `main`, folder `/` (root). The policy is then at
   `https://kristinamartinkevich.github.io/sizer/store/privacy.html`. Takes about a minute to go live.
3. **Build the package.** `sh package.sh` writes `dist/sizer-<version>.zip`. Bump `version` in
   `manifest.json` before every later upload; the store refuses a repeat version.
4. **New item.** Dashboard → **New item** → upload the zip. Chrome reads name, version, icons and
   permissions from the manifest.
5. **Store listing tab.** Paste the summary, description and category below. Upload the screenshots,
   small promo tile and marquee from `store/out/`. Set the language to English.
6. **Privacy practices tab.** Paste the single purpose, the permission justifications and the data
   disclosure below, then the privacy policy URL from step 2, and tick the three certifications.
7. **Distribution tab.** Visibility **Public**, all regions, free.
8. **Submit for review.** Save draft → **Submit for review**. Leave "publish automatically after
   review" ticked. Reviews take a few hours to a few days; a first submission with host permissions
   usually lands at the slow end. You get an email either way, and a rejection names the policy.
9. **After approval.** The listing is live at
   https://chromewebstore.google.com/detail/cgindocdpbnlbkcimegofgphpobmfinm (approved 2026-10-06).
   Put it in `README.md`, the Product Hunt post and the privacy page, then install from the store on
   a clean profile and open a real product page before telling anyone.

Common first-review rejections and how this package avoids them: the single purpose is one sentence;
every permission has a justification; no remote code (the chart bundle is data, not code); the
privacy policy matches what the data disclosure says. The 1.1.0 submission was rejected on
2026-10-05 for "excessive keywords" (Spam and Placement, "Yellow Argon"): the description listed
seventeen shops by name and ended in a keyword line. Keep shop names out of the description except
where one is the feature (Vinted), and never add a keyword line.

## Store listing tab

**Name:** Sizer – Clothing Size Finder

The console takes the title and the summary from the package (`name` and `description` in
`manifest.json`), so both live there. Search on the store matches the name first; "clothing size
finder" and "what size am I" are the two phrases people type, and the dash form keeps "Sizer" as
the brand.

**Summary** (132 characters max, shown in search results):
Find your clothing size on any shop. Reads the brand’s size chart, stretch, fit notes, stock and buyers’ reviews. Jeans to shoes.

**Category:** Shopping · **Language:** English

**Description:**

Sizer is a clothing size finder for Chrome. It puts your size right under the size picker on product pages, and shows why.

Tell it your measurements, or a few things you already own and how they fit, and it works out your size for every brand. On a product page it reads the brand’s size chart, the fabric’s stretch, the page’s fit notes, which sizes are in stock, and what buyers said in the reviews.

WHAT YOU SEE
• Your size, under the shop’s size picker, with the matching option marked
• A one-line reason: “No stretch, sized up” or “Buyers say it runs small, sized up”
• If your size is sold out, the nearest sizes in stock and how far off they are
• Open “Why this size” for the full reasoning and exactly what Sizer read on the page
• On Vinted, Depop, Poshmark and eBay, whether a second-hand piece fits you, from the seller’s measurements or the size on the label

WHAT IT READS
• Brand size charts, downloaded daily, with a link to the brand page each one came from and whether a person has checked it
• The shop’s own size guide, when the page prints it as a table
• Built-in charts for 40 denim and high-street brands where no downloaded chart exists yet
• Stretch: rigid denim leans up a size, high stretch leans down
• The page’s own fit notes, like “runs small, we recommend sizing up”
• Buyers’ reviews, on this shop and pooled across other shops selling the same style
• Per-size stock from the shop’s product data
• What Sizer users who bought the brand said about the fit, once ten of them have answered

YOUR FIT PROFILE
• Bust, waist, hip, shoulder width, arm length, inseam, foot length and height, in cm or inches
• Weight, only to compare you with reviewers; it never picks a size
• Clothes you own, marked a bit tight, just right or a bit loose, with flat-lay measurements if you like
• Whether you like a close fit, a regular fit or a little room, for each kind of clothing
• Whether to go up or down when you fall between two sizes
• Light, dark or system appearance

AFTER YOU BUY
• A week later, “Did it fit?” in the popup and the side panel; your answer becomes a piece you own, so your next sizes learn from it
• A side panel with the full reasoning for the page you are on and your recent sizings

WORKS ON
The large fashion shops in the UK, Europe and the US, clothing on Amazon, Vinted item pages in every country Vinted serves, and Depop, Poshmark and eBay listings. On any other shop, click the Sizer icon and choose “Check this page anyway”.

SECOND-HAND ON VINTED, DEPOP, POSHMARK AND EBAY
A listing has one size and no reviews, so Sizer reads the measurements the seller wrote (“pit to pit 48 cm”, “aisselle à aisselle”, “Bundweite”, in seven languages) and compares them with the pieces you own, or with your measurements. With no measurements it places the size on the label on the brand’s chart and says it is the label only. “Ask the seller to measure” copies a short, polite message in the listing’s language asking for exactly what is missing; Sizer never sends anything for you.

JEANS, TROUSERS, SKIRTS, DRESSES, TOPS AND SHOES
Sizer is built around women’s sizing. Bottoms are sized on waist and hip; tops, dresses and coats on the bust and shoulders when the brand’s chart prints them. FR, EU, IT, UK, US and letter sizes line up through one table. Shoes are sized from your foot length. A men’s item, whoever wears it, goes on a standard men’s chart: letters by chest and waist, jeans by waist, tailoring by chest, and men’s US shoe sizes. Shirts sized by collar are not sized yet.

PRIVATE BY DESIGN
Your measurements and the clothes you own stay in your Chrome profile. There are no accounts, no analytics and no advertising. Sizer uses no AI and sends only anonymous things: a tally of how many reviews on a page said “runs small”, “runs large” or “true to size”, with the brand and style name, the shop’s name and a random install id, so shoppers on other shops can use it. When you answer “Did it fit?” a week after a product was sized, the answer becomes a piece you own in your profile and is sent anonymously: the brand and style name, the kind of item, the shop’s name, the size you bought, the size Sizer suggested, too small, right or too big, the areas you picked, the chart tier, whether the suggestion already used other buyers’ answers, and the install id. Answers are shared only as counts per brand, one per install, from ten installs. No profile, measurement, page address or review text ever leaves your browser. Full policy: https://kristinamartinkevich.github.io/sizer/store/privacy.html

GOOD TO KNOW
Size charts are approximate and brands change them, so check the brand’s guide for important purchases. Sizer is independent and not affiliated with any shop or brand it mentions.

**Graphic assets:**
- Icon: `icons/128.png`
- Screenshots (1280×800), in this order: `store/out/screenshot-1.png` (Zalando: "Order one size. Not
  two.", the fit note read, sold out, nearest in stock), `screenshot-2.png` (ASOS: the reasoning
  sheet), `screenshot-3.png` (Everlane: the answer marked in the size grid, sold out, nearest in stock), `screenshot-4.png`
  (Vinted: the seller's measurements against a pair you own), `screenshot-5.png` (fit profile: shops
  Sizer was checked on, free, no account, profile stays in the browser). Shots 1 to 4 are a headline
  beside a browser window showing a real page with Sizer running, zoomed onto the product details and
  framed below the shop's header on purpose so no shop logo appears; the large card over the window is
  Sizer's own answer copied from that page and magnified, never retyped. The description's "not
  affiliated" line covers the shop names in the text and on shot 5. Rebuild them with
  `store/frames.html?n=1..5` at 1280×800 after `tools/render-shop.py` (the Vinted and Everlane pages
  render from captures kept out of the repo: the Vinted one carries a seller's listing, and
  Net-a-Porter, the earlier grid shot, now refuses its stylesheets to a saved copy).
- Small promo tile (440×280): `store/out/promo-440x280.png`
- Marquee (1400×560): `store/out/marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Shows the shopper which clothing size to buy on a product page, from their own measurements and the product’s size, fit, stock and review information.

**Permission justifications:**
- `storage`: Saves the shopper’s fit profile (measurements, clothes they own, fit preference) in Chrome storage, caches the downloaded size charts, and keeps the list of recently sized products so Sizer can ask whether they fitted.
- `activeTab`: Lets the shopper run Sizer on a shop that is not in the built-in list, only when they click the Sizer icon.
- `scripting`: Injects Sizer’s page reader into that tab after the shopper clicks “Check this page anyway”.
- `alarms`: Refreshes the downloaded size charts once a day, and retries a “did it fit?” answer that could not be sent.
- `sidePanel`: Shows Sizer’s full reasoning for the current page and the shopper’s recent sizings, with their “did it fit?” questions, in Chrome’s side panel when the shopper opens it.
- Host permission `https://cqvrdsgutpczbucbpiqa.supabase.co/*`: Downloads the size charts, exchanges anonymous review tallies with Sizer’s own database, and sends the shopper’s anonymous “did it fit?” answers.
- Content script matches (the listed fashion shops, and Amazon product pages `https://www.amazon.*/*dp/*` and `/gp/product/*` on 10 country sites, each listed: com, co.uk, de, fr, it, es, ca, com.au, nl, ie): Reads product pages to find the brand, sizes, stock, fit notes and reviews, and shows the size under the size picker. On Amazon, which sells every kind of product on these pages, it shows nothing where the options are not clothing sizes.
- Content script matches `https://www.vinted.*/items/*` (Vinted item pages on its 23 country sites, each listed: fr, de, co.uk, es, it, nl, be, pl, lt, cz, at, lu, pt, se, fi, dk, sk, hu, ro, hr, ie, gr, com), `https://www.depop.com/products/*`, `https://poshmark.com/listing/*` and `https://www.ebay.*/itm/*` (single listings on Depop and Poshmark, and eBay item pages on 13 country sites, each listed: co.uk, com, de, fr, it, es, ie, com.au, ca, at, nl, ch, pl; read the same way): Reads the listing’s brand, size label, category, condition, description and photo addresses to compare the seller’s measurements with the shopper’s, shows the answer under the listing’s details, and copies a message to the seller to the clipboard on click. It never sends anything on these sites.

**Remote code:** No. All code ships in the package; the size charts are downloaded as data (JSON).

**Data usage.** Tick **Website content** and nothing else. The honest reason: Sizer derives a count from the review text on the page (runs small, runs large, true to size) and sends the count with the brand and style name, the shop’s hostname and a random install id. Its AI features (the brand chart lookup, the size chart picture reader, the online fit summary, “Read this page with AI” and the Vinted photo reader) are switched off since 1.1.4 and send nothing. When the shopper answers “Did it fit?”, it sends the brand and style name, the kind of item, the shop’s hostname, the size bought, the size Sizer suggested, the verdict and the areas picked, with the chart tier, whether the suggestion already used other buyers’ answers, and the install id; that is the shopper’s own answer, not website content, and carries nothing personal. No review text, no page address and nothing personal travels. The fit profile never leaves `chrome.storage.sync`. Leaving every box unticked would contradict the privacy policy, and reviewers check the two against each other.

**Certifications:** tick all three. Sizer does not sell data, does not use it for anything but the size, and does not use it for creditworthiness or lending.

**Privacy policy URL:** `https://kristinamartinkevich.github.io/sizer/store/privacy.html` once Pages is on.
