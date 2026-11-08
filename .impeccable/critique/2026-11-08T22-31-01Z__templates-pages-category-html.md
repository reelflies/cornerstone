---
target: "the buying path: category, quick add / quick order, product size picker, the box, cart"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/rook/reelflies/theme/cornerstone/templates/pages/category.html"
target_fingerprint: "sha256:dfa3e533c5be4ca8146c58de05bfa3f54878b57fed8d957b9c16c6fb209670e5"
target_path: /Users/rook/reelflies/theme/cornerstone/templates/pages/category.html
timestamp: 2026-11-08T22-31-01Z
slug: templates-pages-category-html
---
Method: dual-agent (A: design review sub-agent · B: detector and browser-evidence sub-agent), run in parallel and isolated; the parent synthesised after both returned. The parent had the earlier audit's detector output in its context before synthesis. Target: the buying path, category → quick add / quick order → product page size picker → the box (order line and sheet) → cart, on the channel-1 dev server at 390×844 and 1280×800, Cart API mocked.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Every change turns copper, updates the card line, the bar and the header badge, and is announced; the bar's count was cut on phones ("12 flies, 4 pa…"). Fixed. |
| 2 | Match system / real world | 3 | Flies, patterns, "/ fly", "Your box"; "389 products" leaks where the voice says patterns (the Fly Sizes facet is absent on channel 1). |
| 3 | User control and freedom | 3 | Done, ×, Escape and the scrim close the picker; 0 or − removes; no undo after "taken out". |
| 4 | Consistency and standards | 3 | Steppers were 44px in the pickers and the cart but 36px in the box sheet. Fixed. "Check out $8.55" on the bar, "Check out" alone in the sheet. |
| 5 | Error prevention | 3 | Nothing preselected, numeric inputmode, letters stripped, 0–999 clamp, a refusal reverts the field. |
| 6 | Recognition rather than recall | 3 | Quantities visible in every field, cards wear the copper ring; the header "Box" is icon and badge only on phones; a two-up card collapses "3 × 12, 3 × 14, 3 × 16" to "9 in your box". |
| 7 | Flexibility and efficiency | 3 | Three add routes, typed numbers, arrow keys, a remembered view; no size filter on this channel, so finding is rigid. |
| 8 | Aesthetic and minimalist design | 3 | Quiet and photo-led; the phone listing spends 533px before the first card and the first "+ Add" sits 19px under the bar on first paint. |
| 9 | Error recovery | 3 | "Couldn't change Adams Parachute Dry Fly, size 8. There are only 120 of this item in stock." in red at the picker's foot, field restored. |
| 10 | Help and documentation | 2 | Inline hints are good; the one deep link, "What do sizes mean?", leads to /fly-hook-size-chart/, which is 404 on this channel. |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** authored for this shop; an unrelated store could not use it unchanged. "$0.95 / fly" on every card, counts in "6 flies, 1 pattern", a quantity beside every hook size with "Largest hook first." and hook-order step bars, "Size 20 is sold out.", quick order's hook numbers over 52×44 fields with sold-out sizes struck through, "Your box", copper held for buying, "Search caddis, size 16…", and the empty box's "Most orders start with a dozen dry flies or nymphs in two or three sizes." Generic residue: stock's nine-option sort list, the stock coupon and totals block, the promotion's grey message box, and "389 products".

**Deterministic scan:** 3 findings per viewport over the three pages (detect-390x844.json, detect-1280x800.json under scratchpad/critique/B/): cream-palette ×3 (the limestone ground, rgb(233,228,219) = limestone-100, the recorded page ground: false positive against the brief), skipped-heading ×1 (stock's hidden write-review modal, h2 → h6: stock markup, not rendered until opened), straggler ×1 at 390 ("fishing." alone; fixed the same day with a balanced intro). The detector and the review agree on nothing else; the review found what the detector cannot: the truncated count, the 36px steppers, the missing facet, the dead help link, the stale card lines.

**Visual overlays:** skipped; no human-visible browser tab in this autonomous run.

## Overall Impression

The buying mechanics are the strongest thing on the site: one stepper per size, reused on the card, the page, quick order and the cart, nothing chosen for the shopper, and a pinned register that counts in flies and patterns. The valleys sit at the confidence moments on phones: the count was cut, the first buy control hides under the bar on first paint, and the two things that help a newer angler (the size filter and the hook-size link) aren't there on this channel. The single biggest opportunity is the channel itself: turn the Fly Sizes facet on and publish the hook-size chart, and steps 2 and 10 of the path exist.

## What's Working

- **The size picker:** 44px rows, condensed 19px hook numbers, a stepper per size, nothing preselected, one control on card, page, quick order and cart; copy in the shop's voice.
- **The order line and sheet:** a pinned tally in flies and patterns with a live editable preview, the shipping meter and "$51.45 more for free standard shipping in Canada."; Escape and focus handled.
- **Quick order:** a real order sheet, hook numbers above 52×44 fields, dashed sold-out slots, typed numbers straight into the box, the view remembered.

## Priority Issues

1. **[P1] Step 2 of the path is missing on channel 1.** /flies/dry-flies/ renders no Fly Sizes facet: no Filter button, no size cells, no "What do sizes mean?", and the count falls to "389 products". Why: "Filter by fly size, in hook order" is how a restocker narrows 389 patterns. Fix: expose Fly Sizes in channel 1's Product Filtering (store setting, owner); the theme's "patterns" wording follows the facet. Command: none in the theme; `/impeccable clarify` for the wording once the facet is on.
2. **[P1] The hook-size help is a dead link.** The picker's "What do sizes mean?" goes to /fly-hook-size-chart/, which is 404 on this channel (the page is an owner item). Fix: create the page (store write), and add the inline gloss "Bigger number, smaller hook." to the picker's foot so help never depends on a link. Command: `/impeccable clarify`.
3. **[P1] The bar's count truncated on phones.** "9 flies, 2 patte…" at 390, "Your box is e…" at 320. Fixed: two balanced lines under 640px, no thumbnails at 320.
4. **[P2] Box sheet steppers were 36px** against the 44px floor. Fixed: 44px, with a two-row line at 320.
5. **[P2] The first buy control sits under the bar on first paint.** At 390×844 the first row's "+ Add" (755–799) is cut 19px by the bar (top 780); on the product page the size-8 stepper likewise. Fix: put Sort beside the count instead of on its own 44px line; on the product page step the title down or move the thumbnails below the picker. Command: `/impeccable layout`.
6. **[P2] Card lines went stale after quick order.** A change typed while Photos was hidden left "In your box: 3 × 14, 2 × 14, 1 …" cut. Fixed: the grid re-measures its lines when Photos returns.

## Persona Red Flags

- **Casey (distracted mobile):** the register is in the thumb zone but its count was cut (fixed); the view switch and sort are at the top; the product page's picker starts at 744px, so buying needs a scroll; "In your box" confirms 437px below the tap; a remembered quick order view greets a returning Casey with a spreadsheet and no photos.
- **Riley (stress tester):** letters stripped, 0 removes with "taken out", 500 refused and reverted; the red refusal persists until the next change; multi-size cart rows stay invisible up to 5s if the script fails; the stale card line (fixed).
- **Jordan (first-timer):** bare "8, 10, 12…" rows with 6–12px step bars that don't read as a scale; "Largest hook first." vanishes whenever a size is sold out; the card's sheet has no size help at all; the page's help link 404s; the header "Box" has no word on phones.
- **Returning restocker (12 patterns × 3 per size, on a phone):** no size filter to narrow; quick order rows are 146–215px tall, so 12 patterns is about 2,000px of scroll and a tap per field; cards collapse to "9 in your box"; 36 steppers in a 684px sheet; the full cart sits behind the quiet "Your whole box, with coupons and shipping".

## Minor Observations

"Check out" without its total in the sheet and the cart summary; the desktop picker panel covers the card below it entirely; 3px step bars are faint (the hook glyphs at 16px would teach more); the empty cart on desktop is bare above the footer; the two-option product's card ("Fat Albert") has an empty reserved size line; stock's hidden "MSRP: Was: Now:" spans sit in the price row; the strip drops "standard" from the shipping promise.

## Questions to Consider

1. If the order line is the register, why does it show the distance to free shipping only above 640px, when the phone shopper weighing one more pattern to clear $60 needs it most?
2. Is a column of seven zeros the most honest "nothing chosen", or could the shop's typical buy appear as a ghost note ("most take 3 of 14 and 16") without choosing for anyone?
3. Should quick order be the default for a signed-in returning customer and Photos for a first visit, and should "Check out" skip the grouped cart for a 40-line order?
