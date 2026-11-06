# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: anglers buying flies on a phone.** A typical order is about 12 patterns at about 3 flies per size, placed mostly on a phone. Two kinds of angler drive most decisions:
  - **Returning customers** restocking the patterns they always fish. They want best sellers near the top and a fast way to add several sizes of one pattern.
  - **Newer anglers** who don't yet know the Fly Type names or how hook sizes work (a bigger number means a smaller hook). They need a clear place to start, a route from "I fish for steelhead" to the right flies, and a hook size chart.
- **Secondary: Trade buyers.** Fishing guides, fly shops, outfitters and lodges that buy flies to resell or to use with clients. They use the same storefront and checkout as everyone else. Customer-group pricing is out of scope.
- **Visitors outside Canada.** ReelFlies.com serves everyone outside Canada, in US dollars. On ReelFlies.ca such a visitor sees a small card, dismissible, that points to the same page on ReelFlies.com. They are never redirected.
- **The owner (Shaun).** Runs the store from the BigCommerce control panel and Theme Styles. Approves every claim, figure and store-wide write. Needs each feature switchable without a theme push, and needs the category rankings that carry the business to survive the Flip.

## Product Purpose

ReelFlies sells fly-fishing flies online, along with Assortments (many flies sold as one item) and Gear (fly boxes, tying materials, hooks, tools, accessories, clothing). One BigCommerce store runs two public storefronts: ReelFlies.ca for Canada in CAD, and ReelFlies.com for everyone else in USD.

This theme is the rebuilt storefront for both. ReelFlies.ca hadn't been redesigned in years. Its text and buttons failed contrast, its "Flies" menu held 59 links, a multi-size order meant a product page and a modal for every pattern, species were hard to find, and its home page measured LCP 7.3 s and CLS 0.739 in a throttled lab run. The rebuild aims to be quiet and modern, built around the fly photography, and fast to buy from on a phone.

Success means:
- A dozen patterns in several sizes go into the cart quickly on a phone, and never in a size the shopper didn't pick.
- Category rankings hold through the Flip.
- The pages meet their gates on mobile: Lighthouse performance 90 or more, LCP 2.5 s or less, CLS 0.05 or less, TBT 200 ms or less, accessibility 100. Field web vitals in GA4 get reviewed after the Flip.

## Positioning

The owner confirmed all four of these (2026-11-05):

- **Range.** Nearly 2,000 hand-tied patterns, shoppable by Fly Type (how the fly is built and fished) and by Species (the fish it's tied to catch). New patterns and variations are added all the time.
- **Craft.** Many of the flies are tied locally in Canada, on branded hooks from Mustad, Daiichi, Maruto, Dai-Riki, Kamasan and VMC. They're trade-grade: ReelFlies wholesales flies to many well-known Canadian tackle shops.
- **Who.** A 100% Canadian, family-run online fly shop, established in 2003. It's a division and brand of Digital Barn Ltd. The shop and offices are at 93 Broadway St, Tillsonburg, Ontario, with walk-ins by appointment. It's headed by Steve B (President), who has over 40 years of fly fishing experience.
- **Value.** Some of the best-value premium flies in North America. They're priced per fly, so an order mixes patterns and sizes a few flies at a time.

## Operating Context

- **Channels** (terms from `~/reelflies/CONTEXT.md`):
  - **ReelFlies** (channel 1, tree 1) is today's live reelflies.ca.
  - **ReelFlies_CA** (1895766, tree 4) is the prelaunch storefront. It becomes reelflies.ca at the Flip.
  - **ReelFlies_com** (1855224) is live reelflies.com, on its own theme until it moves onto this fork.
  - The catalogue and store-wide settings are shared by all three. Theme Styles variations "ReelFlies CA", "ReelFlies CA channel 1" and "ReelFlies US" hold what differs.
- **How shoppers buy:**
  1. Browse by Fly Type or by Species, or search by pattern name.
  2. Filter by fly size, in hook order.
  3. Add several sizes of a pattern from the card (quick add) or from the product page's size pills.
  4. Review a cart grouped by pattern and counted in flies and patterns.
  5. Check out through BigCommerce's Optimized One-Page Checkout.
- **Shipping (ReelFlies.ca):** "Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included." The free-shipping message comes from the promotion itself. ReelFlies.com sets no threshold.
- **Content around the catalogue:**
  - Web Pages: the Policy, Brand and Help pages, and Resources such as the hook size chart at `/fly-hook-size-chart/`, all listed on the Learn hub.
  - The Species hub at `/species/`.
  - A separate blog.
- **Launch: Option A.**
  1. The finished theme goes onto live channel 1 at least 4 weeks before the Flip.
  2. The Flip then changes only the channel, the tree, the URLs and the Redirects. The provisional Flip date is Tue 2027-02-16.
  3. Code freeze is at T-21. The content and catalogue freeze is at T-14, when hreflang v1 also goes live. From T-14 to T+30 no theme is pushed except P1 fixes.
- **How the work runs:**
  - Agents build in waves, and the owner reviews each wave on a review page with screenshots at 375 and 1280, set beside the reference design and the .com preview.
  - Releases go through `scripts/release.sh` only. Each one targets a single channel with a named variation.
  - Store writes get a snapshot, a diff and a log entry.
  - Store-wide, catalogue, promotion and .com writes need the owner's go-ahead (`HANDOFF.md`, "Rules for every session").

## Capabilities and Constraints

- **Base:** a fork of Cornerstone 6.22 that tracks upstream release tags. ReelFlies code lives only in its own folders, and upstream files change only through hooks registered in `CUSTOMIZATIONS.md` (ADR 0001). The look is set by Theme Styles plus one small ReelFlies style layer, so that Cornerstone upgrades stay cheap.
- **Redesign (owner, 2026-11-05):** a complete brand and website redesign is under way. It replaces ticket 12's "ReelFlies Hook Gauge" look (Onest, sage and forest) with a new visual world, and keeps the trout-oval mark.
  - **Scope.** Everything except the logo can be rebuilt. The one hard requirement is that it works on BigCommerce.
  - **Base.** Cornerstone stays the base theme, because it follows BigCommerce's best practices. The rebuild is fresh on Cornerstone, not a port of this fork's current skin.
  - **Goals.** A fully revitalised site that meets SEO best practice and improves UX.
  - **Cavio.** The Cavio theme's mega menu is a quality the owner likes and wants as a reference. Cavio's markup and SCSS can't be reused without Lone Star's permission (HANDOFF), so the menu is designed fresh.
  - **Order of work.** First a brand chart (logo use, palette, type, photography, components), then pages, starting from the home page prototype in `prototype/home/`. DESIGN.md records the world.
- **Search is business-critical:**
  - Every menu and facet link is server-rendered.
  - Each page has exactly one canonical, its own. There are never cross-domain canonicals.
  - hreflang pairs (en-CA, en-US) are written into the sitemaps, outside the theme.
  - Structured data covers the store, products, offers and reviews. Reviews are marked up only where they're shown.
- **Nothing changes by location** except the outside-Canada card. It never redirects anyone and never changes prices, canonicals or hreflang.
- **Switches:** quick add, cart state, the outside-Canada prompt and the rise ring each have a server-side theme setting. With a setting off, the stock markup renders. The release guard stops any push that would change a switch.
- **Budgets:** main.js 300 KiB or less, the menu script 8 KB gzip, quick add 15 KB gzip. Each page has one eager main image.
- **Buying rules:**
  - No size is preselected. Add to cart reads "Choose a size" until the shopper picks one.
  - Prices show per fly. Assortments and hook packs need a "sold by" unit so they don't read "/ fly".
  - Fly selections note that the fly box isn't included.
- **Out of scope:** French for Quebec, customer-group pricing, a header Species Finder, a checkout redesign (branding goes through settings only), new photography (owner work), load-more, backorders and an "Also in" line. The last few are revisited at the day-30 review after the Flip.
- **Privacy:** order data holds personal data. Use per-product aggregates only (`product_metrics.csv`), and never output anything about customers.
- **Terminology:** follow `~/reelflies/CONTEXT.md`. That means Channel, Tree, Flip, Fly Type, Species, Species page, Placement, Assortment (not "kit" or "bundle"), Gear (not "accessories" as the umbrella), Trade buyer (not "wholesale" or "B2B"), Resource, Learn hub, and Cancellation, Claim and Return as distinct terms.
- **Open owner decisions** (each uses a default until the owner decides):
  - **Pattern count.** Default: "nearly 2,000". The export has about 1,900 single-fly patterns, while the live site says 2,100+. (The lowest price is settled: from $0.50, per the owner on 2026-11-06.)
  - **Free-shipping thresholds** in CAD and USD. Default: $60 CAD on fly orders.
  - **Shipping rates** (decision 12): the Canada standard rate and the Expedited "from" price. Until then the line shows the free-shipping sentence alone.
  - **Role email** (decision 11). Until then: the contact form and the phone number.
  - **A specific replace-or-refund policy.** None beyond the promise line until the owner confirms one.
  - **The Flip date**, which is provisional.

## Brand Commitments

- **Name and mark:**
  - ReelFlies® is a registered trademark of Digital Barn Ltd. The store names are ReelFlies.ca and ReelFlies.com.
  - Keep the existing logo mark: no rebrand. A vector redraw of the same mark is allowed.
- **Photography:** the fly photography stays exactly as shot, on white. Nothing is placed over the logo baked into the bottom-left corner of product photos.
- **Voice:**
  - Plain and factual, in the owner's words where they exist, with Canadian spelling.
  - Counts are in flies and patterns ("38 flies, 12 patterns").
  - The promise line is "We stand behind every fly we sell."
  - The sign-off is "Tight lines from us all at ReelFlies®."
- **Copy discipline:** the owner's facts only. Every number, claim, quote and policy needs the owner's confirmation before it ships.

## Evidence on Hand

- **Catalogue:**
  - About 2,135 Live products, 2,101 of them under the ReelFlies brand. ReelFlies Signature patterns number 355.
  - Product export: `~/reelflies/catalog/product_20260907_030303.csv`.
- **Photography and assets:**
  - Product photos are on white. About 76% of thumbnails carry a faint oval watermark. 80 Live products have no white-ground photo: 48 flies, mostly classic salmon patterns on black, and 32 Mustad hook packs.
  - Category banners are 1600x700. The shop-front photo is 600x450, and a larger original is wanted.
  - The logo is a 133x95 PNG only. No master file has been supplied.
  - The files are in `plan/design/assets/` and `assets/img/reelflies/`.
  - An in-house photographer can shoot river and lifestyle photography, and every banner photo can be replaced (owner, 2026-11-05).
- **Copy:**
  - Drafts of the About, Contact, Help, Shipping & Returns, Privacy and Coupon codes pages, awaiting the owner's approval: `content/pages/1895766/`.
  - The CASL newsletter wording: `content/pages/1895766/newsletter.json`.
- **Reviews:** product reviews from the store's review app, shown only on products that have them. Customer comments are on the ReelFlies Facebook page, linked rather than quoted.
- **Absences that must not be filled in:**
  - No customer testimonial or quote has written permission. That includes the mention of The New Fly Fisher.
  - No quoted line from Steve B is on file.
  - "Canada's largest and most popular" and "award-winning" are unconfirmed. Don't use them.
  - No shipping-rate figures, no role email address, and no replace-or-refund policy beyond the promise line.
  - No camera originals or portrait frames are known to exist.

## Product Principles

1. **The multi-size order is the core job.** Every screen should make adding a dozen patterns in several sizes faster on a phone, and none should ever add a size the shopper didn't choose.
2. **The flies are the show.** The photography leads, as shot. The interface stays quiet around it.
3. **Two ways in, one catalogue.** Every fly can be reached by what it is (Fly Type) or by what it catches (Species), and newer anglers get the help they need (hook sizes, where to start) without slowing down the regulars.
4. **Rankings and trust are not traded for features.** Links stay crawlable, nobody is redirected by location, claims stay confirmed, and any switchable feature can go off without a push.
5. **Stay close to Cornerstone.** Prefer settings and registered hooks to rewrites, so upgrades and fixes stay cheap.

## Accessibility & Inclusion

- WCAG AA is the floor, including white labels on buy buttons. Lighthouse accessibility is 100, and axe reports no serious or critical issues. The contrast check runs on every pulled config.
- Keyboard users can work the menu with the arrow keys, Enter and Escape, and focus returns to the menu button. A visible focus ring shows everywhere, and focus is never hidden under the sticky header or bars.
- Screen readers get landmarks, ordered headings and announced status messages, and every add or quantity change is announced.
- Reduced motion turns animations off.
- Nothing is cut off or scrolls sideways at 320px or at 200% zoom.
- Size pills are at least 44px, and phone drawer rows are 48px.
- Manual QA before the freeze covers a keyboard pass, VoiceOver, NVDA and TalkBack, and ticket 55's device list.
- The storefront is in English only. French for Quebec is out of scope.
