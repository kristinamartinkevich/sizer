# Chrome Web Store listing

Upload `dist/sizer-1.0.0.zip` (built by `sh package.sh`).

## Store listing tab

**Name:** Sizer

**Summary** (132 characters max):
Your size on clothing product pages, worked out from your measurements, clothes you own and the item’s fit notes.

**Category:** Shopping · **Language:** English

**Description:**

Sizer puts your size right under the size picker on clothing product pages.

Tell it your measurements, or a few things you already own and how they fit. On a product page, Sizer reads the brand, the fabric and the fit notes, then tells you which size to pick, and why.

What it reads
• The brand’s size chart, for 40 denim and high-street brands
• Stretch: no-stretch denim leans up, high-stretch leans down
• The page’s own fit notes, like “runs small, we recommend sizing up”
• Which sizes are in stock

What you see
• Your size, under the shop’s size picker, with the matching option marked
• A one-line reason, like “No stretch, sized up”
• If your size is sold out, the nearest sizes in stock and how far off they are
• Every answer shows its working: open “Why this size” for the full reasoning

Your fit profile
• Waist, hip and inseam, in cm or inches
• Clothes you own, marked a bit tight, just right or a bit loose
• Whether you like a close fit, a regular fit or a little room

Works on Zalando, ASOS, Net-a-Porter, Mytheresa, Farfetch, Revolve, Shopbop, SSENSE, Nordstrom, Zara, Mango, H&M, COS and ARKET. On other shops, click the Sizer icon and choose “Check this page anyway”.

Private by design: your measurements stay in your Chrome profile. Sizer has no servers, no accounts and no tracking.

Good to know: size charts are approximate and brands change them, so check the brand’s guide for important purchases. Sizer is built around women’s waist and hip sizing, so it’s strongest for jeans, trousers and skirts.

Sizer is independent and not affiliated with any shop or brand it mentions.

**Graphic assets:**
- Icon: `icons/128.png`
- Screenshots (1280×800): `store/out/screenshot-1.png` to `screenshot-4.png`
- Small promo tile (440×280): `store/out/promo-440x280.png`
- Marquee (1400×560): `store/out/marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Shows the shopper which clothing size to buy on a product page, based on their own measurements and the product’s size and fit information.

**Permission justifications:**
- `storage`: Saves the shopper’s fit profile (measurements, clothes they own, fit preference) in Chrome storage.
- `activeTab`: Lets the shopper run Sizer on a shop that isn’t in the built-in list, only when they click the Sizer icon.
- `scripting`: Injects Sizer’s page reader into that tab after the shopper clicks “Check this page anyway”.
- Host permissions (content script matches): Reads product pages on the listed fashion shops to find the brand, sizes, stock and fit notes, and shows the size under the size picker.

**Remote code:** No, all code is in the package.

**Data usage:** Sizer does not collect or transmit any user data. The fit profile is kept in `chrome.storage.sync` in the user’s own Chrome profile and never sent to the developer or any third party. Leave every data type unchecked.

**Privacy policy URL:** Optional, since no user data is collected. If you want one, host `store/privacy.html` and paste its URL.
