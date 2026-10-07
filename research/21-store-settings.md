# Store settings for ReelFlies_CA (ticket 21)

The one checklist of control-panel and API settings that the theme depends on for ReelFlies_CA (channel 1895766). Theme settings in `config.json` aren't here: they ship through `scripts/release.sh`. Refactor 07 keeps the category settings, such as Menu Display Depth.

First written 2026-10-06 from the read-only reads below. Each row says where the setting lives, what the reads show, the target, who changes it, and what it waits on. Every default taken here is revisitable.

## How a setting changes

- **Read first.** `node scripts/settings/read.mjs` reads every setting below that the API exposes, globally and for channels 1 (reelflies.ca), 1855224 (reelflies.com) and 1895766. It uses the read-only token and sends GETs only. The raw reads stay outside git, in `~/reelflies/store-snapshots/store-wide/<object>/<time>-read-21.json`. It prints the report quoted under [Reads](#reads).
- **Lifted writes** (on 1895766 only) are the settings that pass the three-part test (`plan/build-pipeline.md`, section 5):
  1. The endpoint takes `channel_id`.
  2. A read with `channel_id=1895766` shows an override field.
  3. After the write, the global value and channels 1 and 1855224 read back unchanged.

  An agent plans and applies them through the store-write helper, from the changes files in `store-settings/1895766/` ([docs/store-writes.md](../docs/store-writes.md)). Each write gets a snapshot, a diff and a log row, and is shown on the next review page (Shaun's grant of 2026-10-06).
- **Shaun's batch** holds everything store-wide, every promotion, and anything the helper never writes. His approval pages are `plan/approvals/21-*.md` in the plan folder (`~/reelflies/theme/plan/`), outside this repo.
  - A store-wide setting or a promotion is planned with `plan.mjs --approved` from `store-settings/store-wide/`, and Shaun applies it at his own terminal with `apply.mjs --approved`. The same day, .com and channel 1 get a smoke test.
  - A changes file that still waits for something keeps its request under `draft_requests` with a `_waiting` note. `plan.mjs` reads only `requests`, so it refuses the file until the draft is filled and moved there.
  - Control-panel items have no API the helper may use. Shaun sets them by hand, and the next read records the result.
- `scripts/settings/changes.test.mjs` applies the two `1895766/` files through the helper's plan and apply, plans the store-wide filter list and its undo in approved mode, and checks that the waiting promotion is refused. It uses the store's own answers, recorded in `scripts/settings/fixtures/recorded-2026-10-06.json`.

## The checklist

Values are from the reads of 2026-10-06 (below). They ran at 03:31 UTC on 2026-10-07, which was still 2026-10-06 in Toronto, the local day the plan and its files use. "Inherits" means 1895766 shows `null` and takes the global value.

| # | Setting | Where | Scope, by the reads | On 1895766 now | Target | Route | Status |
|---|---|---|---|---|---|---|---|
| 1 | Product Filtering on | `storefront/search` `product_filtering_enabled` | Global-only (BigCommerce documents it; each channel reads `false`, which the storefront ignores: .com shows facets) | On (global `true`) | On | None | Done: no write needed |
| 2 | Product Filtering's filters: Fly Sizes first and open, 15 values, sorted by option value; Category, Price and Brand hidden | Choice 2: a channel-wide 1895766 context (`search/filters/contexts`, category 0). Choice 1: the store's default list (`search/filters`) | Per channel: channels 1 and 1855224 each have their own channel-wide context (category 0), and 1895766 has none (row 3). **Choice 2, a 1895766 context, reaches 1895766 only.** By BigCommerce's guide it sets category pages, and by the render below a channel-wide context also sets that channel's brand pages. So it is expected to set 1895766's Fly Type pages and its brand listing. Only 1895766's search results stay on the default list (the guide; the render can't show search facets). reelflies.ca and reelflies.com don't change. **Choice 1, the default list,** reaches every page on 1895766. It doesn't reach the live sites' category pages (their contexts) or, by the render, their brand pages. **It may reach the search-results pages on reelflies.ca and reelflies.com** (the guide). If so, they lose the Category facet, and Fly Sizes moves first with 15 values by option value. Its only gain over choice 2 is 1895766's search results | Default list: Other, Category (15), Rating, Fly Sizes (10, A–Z, open); Brand and Price hidden. Only Price and Other are *available* on 1895766, because it has no products yet | The list in `store-settings/store-wide/product-filtering.json`, the same for either choice (`items_to_show` sent as the documented strings) | **Choice 2 (recommended): the ticket's route,** "per channel only if probe 6 finds per-channel filter contexts". Shaun sets ReelFlies_CA's list in the control panel's Product Filtering page, picking the ReelFlies_CA storefront, the way the live channels' lists were set. No agent tool writes contexts (W0-11 follow-up (c)). It reaches neither live site, so it isn't a store-wide approval. **Choice 1: a departure from the ticket's route.** Shaun's batch: plan `2026-10-07T05-14-39.818Z-21.json`, sha256 `041d02cc…` (it supersedes `e143f200…`), with its undo, `store-settings/store-wide/product-filtering.restore.json`. Approval page: `plan/approvals/21-product-filtering.md` in the plan folder | Waiting: his choice (wave 1 batch). Choice 1 would be applied in wave 3. The checks of the Fly Type page and the brand listing wait for refactor 14 (products on 1895766) |
| 3 | Probe 6: per-channel filter contexts | `search/filters/contexts` | Contexts exist for channels 1 and 1855224 (`category_id` 0), none for 1895766. So probe 6 finds per-channel contexts, and ticket 21's route is per channel (row 2, choice 2). BigCommerce's guide: contexts apply to category pages. The render below: on this store a channel-wide context also sets that channel's brand pages | None | Recorded | Read only. Shaun's ReelFlies_CA list (row 2, choice 2) also serves as probe 6's trial write: the next read shows whether the control panel made a category-0 context for 1895766 (ticket 07) | Done: read |
| 4 | Search settings 1895766 inherits | `storefront/search` | Channel-scoped (parts 1 and 2 proved) | Inherits: sort by relevance, search suggestions on | Recorded | None | Done |
| 5 | Semantic search | Control panel only (no API) | Not in the settings API | Off: probe 7 found no `semantic_search_enabled` in the page context on 1895766 or channel 1, and no such field in the search settings (`research/07-prelaunch-probes.md`, PR #28) | On or off, after Shaun compares results for common pattern names | Shaun, control panel | Waiting: Shaun's comparison. Interim: off |
| 6 | Fully sold-out products stay listed (decision 1) | `inventory` `product_out_of_stock_behavior` | Channel-scoped (parts 1 and 2 proved by plan.mjs on the store) | Inherits `do_nothing` | `do_nothing`, set on 1895766 so a store-wide change can't reach it. A behaviour-neutral pin of decision 1's value, not a change of that decision: `hide_product_and_accessible` is never set, so the recount ticket 13 asks for before a write that hides products isn't needed | Lifted: `store-settings/1895766/inventory.json`, the plan in row 8 | Met today by inheritance. Planned: the apply waits for the orchestrator's go. If the re-read after it shows `null`, the store keeps no override equal to the global value, and this row says so |
| 7 | Sold-out sizes shown and marked | `inventory` `option_out_of_stock_behavior` | Channel-scoped (parts 1 and 2 proved by plan.mjs on the store) | Inherits `label_option`, the global value | `label_option`, set on 1895766 as the ticket asks, so a store-wide change can't turn off the labels 37 and 43 depend on | Lifted: `store-settings/1895766/inventory.json`, the plan in row 8 | Met today by inheritance. Planned, as row 6. The page check waits for refactor 14 |
| 8 | Stock level shown only when low | `inventory` `stock_level_display` | Channel-scoped (parts 1 and 2 proved by plan.mjs on the store) | Inherits `dont_show` | `show_when_low` | Lifted: `store-settings/1895766/inventory.json` (rows 6 to 8 in one PUT), plan `2026-10-07T05-14-25.169Z-21.json`, sha256 `eb786fef…`, which supersedes `9613d229…` | Planned. The apply waits for the orchestrator's go (no writes yet) |
| 9 | A plain out-of-stock message | `inventory` `default_out_of_stock_message` | Channel-scoped | Inherits "Out of stock" | "Out of stock" | None | Done |
| 10 | Product reviews on; only past customers; the review-request email | Control panel only (the product review settings); no REST API | Store-wide (native reviews are shared by .ca and .com) | Not readable by API | All on (decision 5) | Shaun's batch, control panel (approval page: `plan/approvals/21-control-panel.md`) | Waiting: his approval |
| 11 | reCAPTCHA on the review and contact forms | Control panel only (the security settings) | Store-wide | Not readable by API | On | Shaun's batch, control panel | Waiting: his approval |
| 12 | Free-shipping promotion: CAD $60 on fly orders, fly boxes and gear not included | `/v3/promotions` | A store-level object. An empty `channels` list reaches every channel, and currency `*` reaches .com | None exists. All 8 promotions on the store target every channel | `store-settings/store-wide/free-shipping-promotion.json`: channel 1895766 only, CAD, UPSELL wording from ticket 13. Its request is under `draft_requests`, so `plan.mjs` refuses it until both ids are filled | Shaun's batch: `plan.mjs --approved`, then his apply (approval page: `plan/approvals/21-free-shipping-promotion.md`) | Waiting: the tree-4 Fly Type ids (refactor 13) and the Canada shipping zone's id (a read with the Store logistics scope, or Shaun), then his approval |
| 13 | $99 courier offer | `/v3/promotions` | — | None | Not carried over (interim) | Shaun decides | Open for Shaun |
| 14 | Featured promotions (at most 5, shared with .com) | Promotions | — | None featured beyond free shipping (ticket 13) | None | — | Done: nothing to set |
| 15 | The store's existing promotions | `/v3/promotions` | All 8 target every channel, 1895766 included. Four are enabled coupons: Black Friday and Cyber Monday Sale (CAD), and Canada Day 2026 and Realistic Fly Sale (`*`, so .com too) | — | Recorded | Shaun's to change | Recorded for ticket 55's test orders |
| 16a | Shipping methods on 1895766 match channel 1's | `/v2/shipping/zones` | Store-level zones, so 1895766 is expected to share channel 1's methods already. The read-only account has no Store logistics scope, so this wasn't read | Not read | Channel 1's methods | A read of the zones with the Store logistics scope (read only); a difference goes to Shaun | Waiting: that read. It doesn't need decision 12's figures (ticket 13's comment) |
| 16b | The standard rate below $60 and the tracked Expedited "from" price | The zones' methods (16a) | Store-level | Not read | Decision 12's figures | Shaun (figures, decision 12) | Waiting: the figures. Interim: the stock estimator |
| 17 | CAD only, no currency switcher | `/v3/channels/1895766/currency-assignments` | 1895766 only. The helper never writes `/v3/channels` | **CAD default, CAD and USD enabled** | CAD only | Shaun's batch, control panel (ReelFlies_CA's currency settings). A deviation from `plan/build-pipeline.md` section 4, whose row 21 lists CAD only as the agent's own: W0-11's never list holds `/v3/channels` | Waiting: his approval. Until then a switcher can show on 1895766 |
| 18 | Never currency-by-country (GEO-1 e) | Control panel | Store-wide | Not readable by API | Off | Shaun confirms with the control-panel batch | Waiting: his check |
| 19 | Gift certificates on | Control panel (the gift certificate settings). The API lists certificates with names and emails, so it is never read | Store-wide | Not read | On | Shaun confirms with the control-panel batch | Waiting: his check |
| 20 | Channel 1's accounts sign in on 1895766 | `/v3/customers/settings/channels/1895766` `allow_global_logins`. The name is confirmed in BigCommerce's docs. No agent account has the Customers scope, and the helper never writes Customers | 1895766 only | Not readable | `true` | Shaun's batch, control panel | Waiting: his approval (ticket 55's channel-1 login test) |
| 21 | Security headers on 1895766, HSTS at the Flip | `storefront/security` | Channel-scoped (parts 1 and 2 proved) | Inherits: HTTPS on, HSTS on with max-age 0, X-Frame-Options off, CSP off | X-Frame-Options SAMEORIGIN. HSTS, CSP and HTTPS stay inherited until ticket 57 sets HSTS at the Flip | Lifted: `store-settings/1895766/security.json` | Drafted. The apply waits for a Page Builder check with it on, then the orchestrator's go |
| 22 | Image sizes | Theme settings: `productgallery_size` 600x400 (31), `product_size` 760x507 (39) | Theme Styles, per push | — | Recorded | `release.sh`'s re-pull confirms them after the first push carrying them | Waiting: tickets 31 and 39 |
| 23 | Menu Display Depth | `storefront/category` `category_tree_depth` | Channel-scoped | Inherits 3, so it meets ticket 34's "3 or more" | Refactor 07's | — | Recorded |
| 24 | Category listing sort | `storefront/category` `default_product_sort` | Channel-scoped | Inherits best selling | Recorded | — | Recorded |

## Acceptance criteria

| Criterion | Status |
|---|---|
| Fly Sizes first, open, up to 15 values; no Category, Price or Brand facet; probe 6 and the .com check recorded | Waiting: Shaun's choice on row 2 (recommended: the ReelFlies_CA list, the ticket's per-channel route), and products on 1895766 (refactor 14) for the page check. Probe 6's reads are recorded (row 3). The .com check is in the approval page's same-day steps: a read that .com's own list is unchanged, and for choice 1 its category, brand and search-results pages, before and after |
| A sold-out size still shows, marked sold out | Setting met (row 7: `label_option` inherited). The page check waits for refactor 14 |
| A fully sold-out product appears on its listing, and its URL answers | Setting met (row 6). The page check waits for refactor 14 |
| A review from an account with no past order is refused; reCAPTCHA shows on the review and contact forms | Waiting: rows 10 and 11 (Shaun's control-panel batch). The test review is Shaun's own step: it creates a customer record, which no agent touches |
| The promotion's UPSELL and APPLIED messages; a Gear-only cart doesn't qualify; a .com cart isn't discounted | Waiting: row 12 (refactor 13's ids, the zone id, Shaun's approval), then ticket 41's cart |
| The cart estimator returns ticket 13's standard rate for a Canadian postal code | Waiting: decision 12's figures (row 16b), the zones read (row 16a), and products on 1895766 (refactor 14) |
| CAD only, with no currency switcher; a gift certificate can be bought | Not met: USD is enabled on 1895766 (row 17). Waiting: Shaun's control-panel batch (rows 17 and 19) |
| Every write has a snapshot, a diff and a log row (Shaun's approval for store-wide ones), and store-wide writes a same-day smoke test | Waiting: none written yet. The plans hold the snapshots and diffs. Writes are logged below as they happen |

## Writes

None yet. Each lifted write adds a row here from `~/reelflies/store-snapshots/log.jsonl` (`node scripts/store/log.mjs --since <date>`). Each store-wide write also adds its same-day .com and channel 1 smoke test.

| Date | Setting | Scope | Plan sha256 | Log rows | Smoke test |
|---|---|---|---|---|---|

## Live facets on brand and search pages (read-only render)

Row 2's reach. The method: `scripts/qa/serve.mjs` (a stencil start) on channel 1 (variation "ReelFlies CA") and on 1855224 ("ReelFlies US"), then a GET of each page with `?debug=context` (and an `Accept-Language` header, which stencil start needs), reading the listing's `facets`. GETs only: stencil start passes them to the live store. Values don't come with the context, only each facet's settings. There were two runs:

- **First run:** 2026-10-06 (05:00 UTC on 2026-10-07), both channels, `QA_PORT=4600`. Its paths weren't recorded.
- **Second run:** channel 1 only, 2026-10-07 (08:48 UTC), `QA_PORT=4200`, with the paths below. It found the same facets as the first run. The same run on 1855224 was refused by Claude Code's permission check ("[Production Reads]"), so .com's rows are the first run's, without paths.

The ReelFlies brand page on reelflies.ca is `/reelflies-2/`, from the site's own `/brands/` list. `/brands/ReelFlies.html` is ticket 36's planned path on 1895766 (`scripts/qa/pages.mjs`), not a live-site path.

| Site | Page | Facets in the context |
|---|---|---|
| reelflies.ca (1) | Brands ReelFlies (`/reelflies-2/`) and Mustad (`/mustad-1/`) | Other (collapsed); Fly Sizes (open, alphabetical). Channel 1's context, whose only enabled filters are those two. The default list would add Category and Rating |
| reelflies.com (1855224) | Brands ReelFlies and Mustad (first run) | Other (collapsed); Category (open, 15, A–Z); Price (open); Fly Sizes (open, 10, A–Z). .com's context. The default list hides Price |
| reelflies.ca | Search results (`/search.php?search_query=adams`, `/search.php?search_query=dry+fly`) | None: the context's `facets` list is empty |
| reelflies.com | Search results ("adams", "dry fly"; first run) | None |
| reelflies.ca | Categories Dry Flies (`/flies/dry-flies/`) and Realistic Trout Flies (`/flies/realistic-trout-flies/`); the first run also read the leaf Classic Dry Flies | None: the context's `facets` list is empty, though the live category pages show facets |
| reelflies.com | Category Dry Flies (first run) | None |

So brand pages on both live sites follow their own channel's context, and the default list doesn't reach them. A channel-wide context for 1895766 is expected to do the same for its brand listing (row 2, choice 2). The render can't show search-results or category facets. For those, BigCommerce's guide stands: category pages follow the context, and search results use the default list. That is why choice 1 may reach the live sites' search results and choice 2 can't. If Shaun picks choice 1, the approval page's same-day steps record a live search-results page on both sites before the apply and check it after.

## Reads

### Reads, 2026-10-07T03:31:58.121Z (read-only token, GET only)

33 reads, 0 failed. Snapshot sha256 7eee9386fa7b5ca148bd892c311b4bab2250c97b67144237e40f33dd9688d255.
- `~/reelflies/store-snapshots/store-wide/settings-inventory/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-storefront-search/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-storefront-product/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-storefront-category/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-storefront-security/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-search-filters/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-search-filters-contexts/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/settings-search-filters-available/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/channels-currency-assignments/2026-10-07T03-31-58.121Z-read-21.json`
- `~/reelflies/store-snapshots/store-wide/promotions/2026-10-07T03-31-58.121Z-read-21.json`

#### `/v3/settings/inventory`

| Key | global | channel 1 | 1855224 | 1895766 | Parts 1 and 2 for 1895766 |
|---|---|---|---|---|---|
| `product_out_of_stock_behavior` | "do_nothing" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "do_nothing" |
| `option_out_of_stock_behavior` | "label_option" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "label_option" |
| `update_stock_behavior` | "order_placed" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "order_placed" |
| `edit_order_stock_adjustment` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `refund_order_stock_adjustment` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `stock_level_display` | "dont_show" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "dont_show" |
| `default_out_of_stock_message` | "Out of stock" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "Out of stock" |
| `hide_in_product_filtering` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `show_pre_order_stock_levels` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_out_of_stock_message` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `show_quantity_on_backorder` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_quantity_on_hand` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_backorder_message` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_backorder_availability_prompt` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `backorder_availability_prompt` | "More available for backorder" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "More available for backorder" |
| `show_default_shipping_expectation_prompt` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `default_shipping_expectation_prompt` | "We ship available items right away, and backordered items as…" (85 characters, sha256 c8433a5d) | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "We ship available items right away, and backordered items as soon as they're in stock" |

#### `/v3/settings/storefront/search`

| Key | global | channel 1 | 1855224 | 1895766 | Parts 1 and 2 for 1895766 |
|---|---|---|---|---|---|
| `product_filtering_enabled` | true | false | false | false | store-wide: BigCommerce documents product_filtering_enabled as global-only |
| `default_product_sort` | "relevance" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "relevance" |
| `content_product_sort` | "relevance" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "relevance" |
| `search_suggest` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |

#### `/v3/settings/storefront/product`

| Key | global | channel 1 | 1855224 | 1895766 | Parts 1 and 2 for 1895766 |
|---|---|---|---|---|---|
| `show_product_price` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `show_product_sku` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `show_product_weight` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_product_brand` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_product_shipping` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |
| `show_product_rating` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `show_add_to_cart_link` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `default_preorder_message` | "Expected release date is %%DATE%%" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "Expected release date is %%DATE%%" |
| `show_breadcrumbs_product_pages` | "show_one" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "show_one" |
| `show_add_to_cart_qty_box` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `show_add_to_wishlist` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `hide_price_from_guests` | false | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value false |

#### `/v3/settings/storefront/category`

| Key | global | channel 1 | 1855224 | 1895766 | Parts 1 and 2 for 1895766 |
|---|---|---|---|---|---|
| `listing_mode` | "child_categories" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "child_categories" |
| `default_product_sort` | "bestselling" | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value "bestselling" |
| `category_tree_depth` | 3 | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value 3 |

#### `/v3/settings/storefront/security`

| Key | global | channel 1 | 1855224 | 1895766 | Parts 1 and 2 for 1895766 |
|---|---|---|---|---|---|
| `sitewide_https_enabled` | true | inherits | inherits | inherits | channel: shown as null: 1895766 inherits the global value true |
| `csp_header` | {"enabled":false,"header_value":""} | {"enabled":null,"header_value":null} | {"enabled":null,"header_value":null} | {"enabled":null,"header_value":null} | channel: shown with the channel's own value {"enabled":null,"header_value":null} (the global value is {"enabled":false,"header_value":""}) |
| `x_frame_options_header` | {"enabled":false,"setting":"deny","allowed_url":""} | {"enabled":null,"setting":null,"allowed_url":null} | {"enabled":null,"setting":null,"allowed_url":null} | {"enabled":null,"setting":null,"allowed_url":null} | channel: shown with the channel's own value {"enabled":null,"setting":null,"allowed_url":null} (the global value is {"enabled":false,"setting":"deny","allowed_url":""}) |
| `hsts` | {"enabled":true,"include_subdomains":false,"include_preload"… (92 characters of JSON, sha256 e2ff235d) | {"enabled":null,"include_subdomains":null,"include_preload":null,"max_age":null} | {"enabled":null,"include_subdomains":null,"include_preload":null,"max_age":null} | {"enabled":null,"include_subdomains":null,"include_preload":null,"max_age":null} | channel: shown with the channel's own value {"enabled":null,"include_subdomains":null,"include_preload":null,"max_age":null} (the global value is {"enabled":true,"include_subdomains":false,"include_preload":false,"max_age":"zero_seconds"}) |

#### Product Filtering: the enabled filters (store-wide, `/v3/settings/search/filters`)

| # | Filter | Type | Id | Enabled | Collapsed | Items shown | Sorted by |
|---|---|---|---|---|---|---|---|
| 1 | Other | other | `Ym9vbA==` | true | true |  |  |
| 2 | Category | category | `Y2F0ZWdvcnk=` | true | false | 15 |  |
| 3 | Brand | brand | `YnJhbmQ=` | false | false | 10 | "alpha" |
| 4 | Price | price | `cHJpY2U=` | false | false |  |  |
| 5 | Rating | rating | `cmF0aW5n` | true | true |  |  |
| 6 | Fly Sizes | product | `Rmx5IFNpemVz` | true | false | 10 | "alpha" |
| 7 | Choose Foam Style | product | `Q2hvb3NlIEZvYW0gU3R5bGU=` | false | false | 10 | "alpha" |
| 8 | Color | product | `Q29sb3I=` | false | false | 10 | "alpha" |
| 9 | Colour | product | `Q29sb3Vy` | false | false | 10 | "alpha" |
| 10 | choose leader weight | product | `Y2hvb3NlIGxlYWRlciB3ZWlnaHQ=` | false | false | 10 | "alpha" |
| 11 | Strike Indicator Colour | product | `U3RyaWtlIEluZGljYXRvciBDb2xvdXI=` | false | false | 10 | "alpha" |
| 12 | Size | product | `U2l6ZQ==` | false | false | 10 | "alpha" |
| 13 | Choose Size | product | `Q2hvb3NlIFNpemU=` | false | false | 10 | "alpha" |
| 14 | Yarn Indicator Colour | product | `WWFybiBJbmRpY2F0b3IgQ29sb3Vy` | false | false | 10 | "alpha" |
| 15 | FLY BOX OPTIONAL | product | `RkxZIEJPWCBPUFRJT05BTA==` | false | false | 10 | "alpha" |

#### Product Filtering: contextual overrides (probe 6's reads, `/v3/settings/search/filters/contexts`)

| Scope | What it answered |
|---|---|
| global | channel 1, category 0: Other, Category, Brand, Price, Rating, Fly Sizes, Choose Foam Style, Color, Colour, choose leader weight, Strike Indicator Colour, Size, Choose Size, Yarn Indicator Colour, FLY BOX OPTIONAL; channel 1855224, category 0: Other, Category, Brand, Price, Fly Sizes |
| 1 | channel 1, category 0: Other, Category, Brand, Price, Rating, Fly Sizes, Choose Foam Style, Color, Colour, choose leader weight, Strike Indicator Colour, Size, Choose Size, Yarn Indicator Colour, FLY BOX OPTIONAL |
| 1855224 | channel 1855224, category 0: Other, Category, Brand, Price, Fly Sizes |
| 1895766 | no contextual overrides |

#### Product Filtering: available filters (`/v3/settings/search/filters/available`)

| Scope | What it answered |
|---|---|
| global | Category (category, `Y2F0ZWdvcnk=`), Brand (brand, `YnJhbmQ=`), Rating (rating, `cmF0aW5n`), Price (price, `cHJpY2U=`), Fly Sizes (product, `Rmx5IFNpemVz`), Color (product, `Q29sb3I=`), Colour (product, `Q29sb3Vy`), choose leader weight (product, `Y2hvb3NlIGxlYWRlciB3ZWlnaHQ=`), Choose Foam Style (product, `Q2hvb3NlIEZvYW0gU3R5bGU=`), Size (product, `U2l6ZQ==`), Choose Size (product, `Q2hvb3NlIFNpemU=`), Strike Indicator Colour (product, `U3RyaWtlIEluZGljYXRvciBDb2xvdXI=`), Yarn Indicator Colour (product, `WWFybiBJbmRpY2F0b3IgQ29sb3Vy`), FLY BOX OPTIONAL (product, `RkxZIEJPWCBPUFRJT05BTA==`), Other (other, `Ym9vbA==`) |
| 1 | Category (category, `Y2F0ZWdvcnk=`), Brand (brand, `YnJhbmQ=`), Rating (rating, `cmF0aW5n`), Price (price, `cHJpY2U=`), Fly Sizes (product, `Rmx5IFNpemVz`), Color (product, `Q29sb3I=`), Colour (product, `Q29sb3Vy`), choose leader weight (product, `Y2hvb3NlIGxlYWRlciB3ZWlnaHQ=`), Choose Foam Style (product, `Q2hvb3NlIEZvYW0gU3R5bGU=`), Size (product, `U2l6ZQ==`), Strike Indicator Colour (product, `U3RyaWtlIEluZGljYXRvciBDb2xvdXI=`), Choose Size (product, `Q2hvb3NlIFNpemU=`), Yarn Indicator Colour (product, `WWFybiBJbmRpY2F0b3IgQ29sb3Vy`), FLY BOX OPTIONAL (product, `RkxZIEJPWCBPUFRJT05BTA==`), Other (other, `Ym9vbA==`) |
| 1855224 | Category (category, `Y2F0ZWdvcnk=`), Brand (brand, `YnJhbmQ=`), Rating (rating, `cmF0aW5n`), Price (price, `cHJpY2U=`), Fly Sizes (product, `Rmx5IFNpemVz`), Colour (product, `Q29sb3Vy`), Color (product, `Q29sb3I=`), choose leader weight (product, `Y2hvb3NlIGxlYWRlciB3ZWlnaHQ=`), Choose Foam Style (product, `Q2hvb3NlIEZvYW0gU3R5bGU=`), Choose Size (product, `Q2hvb3NlIFNpemU=`), Strike Indicator Colour (product, `U3RyaWtlIEluZGljYXRvciBDb2xvdXI=`), Yarn Indicator Colour (product, `WWFybiBJbmRpY2F0b3IgQ29sb3Vy`), Size (product, `U2l6ZQ==`), FLY BOX OPTIONAL (product, `RkxZIEJPWCBPUFRJT05BTA==`), Other (other, `Ym9vbA==`) |
| 1895766 | Price (price, `cHJpY2U=`), Other (other, `Ym9vbA==`) |

#### Currencies per channel (`/v3/channels/<id>/currency-assignments`)

| Channel | Default | Enabled |
|---|---|---|
| 1 | CAD | CAD |
| 1855224 | USD | USD |
| 1895766 | CAD | CAD, USD |

#### Promotions (store-wide, `/v3/promotions`)

| Id | Name | Status | Redemption | Currency | Channels | Actions |
|---|---|---|---|---|---|---|
| 2 | Black Friday 2024 Door Crashers 30 Off | DISABLED | AUTOMATIC | CAD | all channels | cart_items |
| 3 | Black Friday 25 Off Items | DISABLED | AUTOMATIC | CAD | all channels | cart_items |
| 4 | Black Friday | ENABLED | COUPON | CAD | all channels | cart_items |
| 5 | Cyber Monday Sale | ENABLED | COUPON | CAD | all channels | cart_items |
| 6 | Canada Day | DISABLED | AUTOMATIC | * | all channels | cart_items |
| 8 | Canada Day 2026 | ENABLED | COUPON | * | all channels | cart_value |
| 9 | Realistic Fly Sale | DISABLED | AUTOMATIC | * | all channels | cart_items |
| 10 | Realistic Fly Sale | ENABLED | COUPON | * | all channels | cart_items |

