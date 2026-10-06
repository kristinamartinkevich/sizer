# Launch kit: Product Hunt and LinkedIn

Sizer is live on the Chrome Web Store:
https://chromewebstore.google.com/detail/cgindocdpbnlbkcimegofgphpobmfinm

Both posts go out from your own accounts. Schedule Product Hunt for 12:01 am Pacific (launch days
run midnight to midnight PT, which is 8:01 am in London). Tuesday to Thursday are the busiest days; a
Sunday launch faces less competition and suits a solo maker. Post on LinkedIn the same morning and
point people at the Product Hunt page.

## Product Hunt post

**Name:** Sizer

**Tagline** (60 characters max):
Your size, right under the size picker, on any shop

**Link:** https://chromewebstore.google.com/detail/cgindocdpbnlbkcimegofgphpobmfinm

**Topics:** Chrome Extensions · Fashion · E-Commerce · Shopping

**Description** (260 characters max):
A Chrome extension that tells you which clothing size to buy, right under the shop’s size picker. It reads the brand’s own chart, the stretch, the fit notes, the stock and what buyers said in reviews across shops, and shows its reasoning. Free, no account.

**Thumbnail:** `store/out/thumbnail-240.png` (the chrome S on graphite; rebuild with
`store/frames.html?kind=thumb` at 240×240)

**Gallery** (Product Hunt shows 1270×760; the 1280×800 shots fit with no crop worth noticing), in
this order:
1. `store/out/screenshot-1.png`: Zalando. The shop’s own “runs small” note read, the size sold out, the nearest sizes in stock named
2. `store/out/screenshot-2.png`: ASOS. The “Why this size” sheet with the full reasoning
3. `store/out/screenshot-3.png`: Net-a-Porter. The answer marked in the shop’s own size grid
4. `store/out/screenshot-4.png`: Vinted. A seller’s measurements checked against a pair you own
5. `store/out/screenshot-5.png`: the fit profile

The shop shots are real product pages with Sizer running, framed below each shop’s header so no
shop logo appears. Leave the marquee out: at 1400×560 Product Hunt letterboxes it.

**Pricing:** Free

## Maker’s first comment

Add a line or two of your own at the top, like the last pair of jeans you sent back. It is the part
people respond to.

Hi Product Hunt, I’m Kristina.

Buying clothes online usually means guessing. Every brand cuts differently, the useful details like “no stretch” or “runs small” are buried in the product page, and the reviews that would tell you are on a different shop.

So I built Sizer. You tell it your measurements, or a few things you own and how they fit. On a product page it reads the brand’s size chart, the fabric, the fit notes, the stock and the reviews, and puts your size right under the size picker.

What I cared about:
• It shows its working. Every answer has a plain reason, like “Buyers say it runs small, sized up”.
• It reads reviews across shops. If a style runs small on one shop, you hear about it on another.
• If your size is sold out, it says which sizes are in stock and how far off they are.
• It says when it is unsure. A thin answer is labelled a rough guess, with what would firm it up.
• It works on Vinted. It compares the seller’s measurements with clothes you own, and one click copies a polite message asking the seller for what is missing.
• Your measurements stay in your browser. No account, no analytics, no ads. What it does send is anonymous and listed in the privacy policy.

It is strongest for women’s jeans, trousers and skirts today, with tops, dresses and shoes too. I would love to know which brands and shops to add next.

## Replies you will need

- **"How is this different from True Fit?"** True Fit is a widget the retailer buys, so it only exists on shops that paid, and it needs an account. Sizer is yours, works across shops, and reads reviews, which none of the retailer tools do.
- **"How accurate is it?"** As accurate as the brand’s chart plus the page. It links to the chart it used and labels a thin answer a rough guess. I am not publishing a returns percentage because nobody in this market audits theirs.
- **"Men’s?"** Charts are women’s today. Men’s denim is next.
- **"Does it work on [shop]?"** Click the Sizer icon and “Check this page anyway”. Tell me the shop and I will add it to the built-in list.
- **"What data does it send?"** Nothing personal. Your measurements and clothes never leave your browser; the policy lists every anonymous request, field by field.
- **"Safari or Firefox?"** Chrome only for now, which covers Edge, Brave and Arc too.

## LinkedIn post

Post it as text with one image (`store/out/screenshot-1.png`). LinkedIn shows fewer people a post
with a link in it, so put the Product Hunt link in the first comment and say so in the last line.

> I built a Chrome extension, and today it’s on Product Hunt.
>
> It’s called Sizer, and it answers the question I ask every time I buy clothes online: which size?
>
> Every brand cuts differently. The details that settle it, like “no stretch” or “runs small”, are buried halfway down the product page, and the reviews that would tell you are on another shop. So most of us order two sizes and send one back.
>
> Sizer reads all of that for you. Tell it your measurements, or a few things you own and how they fit. On a product page it reads the brand’s size chart, the fabric, the fit notes, the stock and the reviews, and puts your size right under the size picker, with the reason in one line.
>
> It works on the big fashion shops in the UK, Europe and the US, and on Vinted, where it checks the seller’s measurements against clothes you already wear.
>
> It’s free, there’s no account, and your measurements never leave your browser.
>
> If you shop online, I’d love you to try it and tell me where it gets your size wrong. Link in the first comment.

**First comment:**
> On Product Hunt today: [your Product Hunt post link]. Or straight from the Chrome Web Store: https://chromewebstore.google.com/detail/cgindocdpbnlbkcimegofgphpobmfinm

## Before you schedule

- [x] Chrome Web Store listing approved and public
- [x] Supabase migrations 0001 to 0008 applied
- [ ] Install from the store on a clean profile and check a live product page
- [ ] `ANTHROPIC_API_KEY` set in Supabase (Edge Functions → Secrets). Until it is, the brand chart
      lookup, the size chart picture reader, “Read this page with AI”, “Read measurements from the
      photos” and the online fit summary all fail, and the listing promises them
- [ ] lookup-chart deployed with
      `supabase functions deploy lookup-chart --project-ref cqvrdsgutpczbucbpiqa --no-verify-jwt --use-api`
- [ ] Open a product from a brand with no chart and confirm the sheet says “chart read by machine” with the brand’s link
- [ ] Both PRs merged, so the hosted privacy policy matches what 1.1.1 sends (the store and the
      Product Hunt replies both point at it)
- [ ] Line up a few people to try it on launch morning, and reply to every comment within the hour
