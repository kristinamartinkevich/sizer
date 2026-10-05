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
9. **After approval.** The listing URL is `https://chromewebstore.google.com/detail/sizer/<id>`.
   Put it in `README.md`, the Product Hunt post and the privacy page, then install from the store on
   a clean profile and open a real product page before telling anyone.

Common first-review rejections and how this package avoids them: the single purpose is one sentence;
every permission has a justification; no remote code (the chart bundle is data, not code); the
privacy policy matches what the data disclosure says.

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

WHAT IT READS
• Brand size charts, downloaded daily, with a link to the brand page each one came from and whether a person has checked it
• For a brand with no chart yet, its own published chart, looked up once and labelled as read by machine
• Built-in charts for 40 denim and high-street brands where no downloaded chart exists yet
• Stretch: rigid denim leans up a size, high stretch leans down
• The page’s own fit notes, like “runs small, we recommend sizing up”
• Buyers’ reviews, on this shop and pooled across other shops selling the same style
• Per-size stock from the shop’s product data

YOUR FIT PROFILE
• Bust, waist, hip, shoulder width, arm length, inseam, foot length and height, in cm or inches
• Weight, only to compare you with reviewers; it never picks a size
• Clothes you own, marked a bit tight, just right or a bit loose, with flat-lay measurements if you like
• Whether you like a close fit, a regular fit or a little room, for each kind of clothing
• Whether to go up or down when you fall between two sizes
• Light, dark or system appearance

WORKS ON
Zalando, ASOS, Net-a-Porter, Mytheresa, Farfetch, Revolve, Shopbop, SSENSE, Nordstrom, Zara, Mango, H&M, COS, ARKET, Selfridges, rag & bone and Levi’s. On any other shop, click the Sizer icon and choose “Check this page anyway”.

JEANS, TROUSERS, SKIRTS, DRESSES, TOPS AND SHOES
Sizer is built around women’s sizing. Bottoms are sized on waist and hip; tops, dresses and coats on the bust and shoulders when the brand’s chart prints them. FR, EU, IT, UK, US and letter sizes line up through one table. Shoes are sized from your foot length. Men’s charts are coming.

PRIVATE BY DESIGN
Your measurements and the clothes you own stay in your Chrome profile. There are no accounts, no analytics and no advertising. Sizer sends two anonymous things: a tally of how many reviews on a page said “runs small”, “runs large” or “true to size”, so shoppers on other shops can use it, and, when a brand has no size chart yet, a request to look one up carrying the brand name, the kind of item, the shop’s name and the shop’s own size table if the page prints one. To find that table Sizer may open the shop’s own size-guide page without your cookies, or send a size chart image’s web address with the brand name, kind of item and a random install id so the chart can be read from the picture. If you click “Read this page with AI” on a page Sizer cannot read, it sends the page title, headings and the text around the size picker, up to 6000 characters. No profile, measurement, page address or review text ever leaves your browser. Full policy: https://kristinamartinkevich.github.io/sizer/store/privacy.html

GOOD TO KNOW
Size charts are approximate and brands change them, so check the brand’s guide for important purchases. Sizer is independent and not affiliated with any shop or brand it mentions.

Size finder · size recommendation · what size am I · jeans size · size chart · fit guide · Zalando · ASOS · Net-a-Porter · Revolve · Zara · H&M

**Graphic assets:**
- Icon: `icons/128.png`
- Screenshots (1280×800), in this order: `store/out/screenshot-1.png` (Zalando: fit note read,
  sold out, nearest in stock), `screenshot-2.png` (ASOS: the reasoning sheet), `screenshot-3.png`
  (Net-a-Porter: the answer ringed in the size grid), `screenshot-4.png` (fit profile),
  `screenshot-5.png` (Revolve: sold-out sizes read from the grid). Real pages captured with Sizer
  running, unedited; the description's "not affiliated" line covers the shops' marks.
- Small promo tile (440×280): `store/out/promo-440x280.png`
- Marquee (1400×560): `store/out/marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Shows the shopper which clothing size to buy on a product page, from their own measurements and the product’s size, fit, stock and review information.

**Permission justifications:**
- `storage`: Saves the shopper’s fit profile (measurements, clothes they own, fit preference) in Chrome storage, and caches the downloaded size charts.
- `activeTab`: Lets the shopper run Sizer on a shop that is not in the built-in list, only when they click the Sizer icon.
- `scripting`: Injects Sizer’s page reader into that tab after the shopper clicks “Check this page anyway”.
- `alarms`: Refreshes the downloaded size charts once a day.
- Host permission `https://cqvrdsgutpczbucbpiqa.supabase.co/*`: Downloads the size charts, asks Sizer’s own database to look up the chart of a brand it has none for, and exchanges anonymous review tallies with it.
- Content script matches (the listed fashion shops): Reads product pages to find the brand, sizes, stock, fit notes and reviews, and shows the size under the size picker.

**Remote code:** No. All code ships in the package; the size charts are downloaded as data (JSON).

**Data usage.** Tick **Website content** and nothing else. The honest reason: Sizer sends content from the website to Sizer’s database in two cases, each with the shop’s hostname and a random install id. It derives a count from the review text on the page and sends the count; and when the brand has no chart, it sends the brand name, the kind of item and, if the page prints one, the shop’s size table text, so the chart can be looked up. To find that table it may open the shop’s own size-guide page without your cookies (a request to the shop, nothing kept), or send a size chart image’s web address with the brand name and kind of item so the chart can be read from the picture. On request only (“Read this page with AI”), it sends the page title, headings and the text around the size picker, up to 6000 characters, with web addresses removed. No review text, no page address and nothing personal travels. The fit profile never leaves `chrome.storage.sync`. Leaving every box unticked would contradict the privacy policy, and reviewers check the two against each other.

**Certifications:** tick all three. Sizer does not sell data, does not use it for anything but the size, and does not use it for creditworthiness or lending.

**Privacy policy URL:** `https://kristinamartinkevich.github.io/sizer/store/privacy.html` once Pages is on.
