# Product Hunt launch kit

Launch **after** the Chrome Web Store listing is approved, so the link works on launch day.
Schedule it for 12:01 am Pacific (launch days run midnight to midnight PT). Tuesday to Thursday
are the busiest days; a Sunday launch faces less competition and suits a solo maker.

## Post

**Name:** Sizer

**Tagline** (60 characters max):
Your size, right under the size picker, on any shop

**Link:** the Chrome Web Store URL once approved

**Topics:** Chrome Extensions · Fashion · E-Commerce · Shopping

**Description** (260 characters max):
A Chrome extension that tells you which clothing size to buy, right under the shop’s size picker. It reads the brand’s own chart, the stretch, the fit notes, the stock and what buyers said in reviews across shops, and shows its reasoning. Free, no account.

**Gallery** (in this order):
1. `store/out/marquee-1400x560.png`
2. `store/out/screenshot-1.png`: Zalando, rag & bone jeans. The shop's own "runs small" note read, size 28 sold out, the nearest sizes in stock named
3. `store/out/screenshot-2.png`: ASOS, Levi's 501. The reasoning sheet, with ASOS's returns-data note turned into "one size down"
4. `store/out/screenshot-3.png`: Net-a-Porter, AGOLDE. The answer ringed in the shop's own size grid
5. `store/out/screenshot-4.png`: the fit profile

All shop screenshots are real product pages captured on 5 October 2026 with Sizer running; nothing
on them is edited. The listing says Sizer is not affiliated with the shops.

**Thumbnail:** `store/out/thumbnail-240.png`

**Pricing:** Free

## Maker’s first comment

Draft. Add a line or two of your own story at the top; it is the part people respond to.

Hi Product Hunt, I’m Kristina.

Buying jeans online usually means guessing. Every brand cuts differently, the useful information like “no stretch” or “runs small” is buried in the product details, and the reviews that would tell you are on a different shop.

So I built Sizer. You tell it your measurements, or a few things you own and how they fit. On a product page it reads the brand’s size chart, the fabric, the fit notes, the stock and the reviews, and puts your size right under the size picker.

A few things I cared about:
• It shows its working. Every answer has a plain-English reason, like “Buyers say it runs small, sized up”.
• It reads reviews across shops. If a style runs small on Zalando, you hear about it on Net-a-Porter.
• If your size is sold out, it says which sizes are in stock and how far off they are.
• It is honest when unsure. Thin information gets a “rough guess” label and a note on what would firm it up.
• It prefers the brand’s own chart over the shop’s generic one. If no shopper has needed a brand before, it looks up the brand’s published chart once, labels it as read by machine, and every shopper after you gets it.
• Your measurements never leave your browser. No account, no analytics. It sends only anonymous things: a count of what reviews said, and, for a brand it has no chart for, the brand name, the kind of item and the shop’s name.

It is strongest for women’s jeans, trousers and skirts today, with shoes by foot length. I would love to know which brands and shops to add next.

## Replies you will need

- **"How is this different from True Fit?"** True Fit is a widget the retailer buys, so it only exists on shops that paid, and it needs an account. Sizer is yours, works on any shop, and reads reviews, which none of the retailer tools do.
- **"How accurate is it?"** As accurate as the brand’s chart plus the page. It links to the chart it used and labels a thin answer a rough guess. I am not publishing a returns percentage because nobody in this market audits theirs.
- **"Men’s?"** Charts are women’s today. Men’s denim is next on the list.
- **"Does it work on [shop]?"** Click the icon and “Check this page anyway”. Tell me the shop and I will add it to the built-in list.

## Before you schedule

- [ ] Chrome Web Store listing approved and public
- [ ] Install from the store on a clean profile and check a live product page
- [ ] Supabase migration 0003 applied, so the pooled reviews line works on launch day
- [ ] Supabase migrations 0004 and 0005 applied in the SQL editor, so looked-up charts have a home
- [ ] `ANTHROPIC_API_KEY` set with `supabase secrets set`, and the function deployed with
      `supabase functions deploy lookup-chart --project-ref cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api`
- [ ] Open a product from a brand with no chart and confirm the sheet says “chart read by machine” with the brand’s link
- [ ] Line up a few people to try it on launch morning, and reply to every comment within the hour
