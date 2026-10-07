# Ticket 07 · Prelaunch probes on ReelFlies_CA

Run on 2026-10-06 by the lane G agent, read-only. Ticket: `plan/issues/07-prelaunch-probes.md`.

**Question:** which platform behaviours that the plan depends on actually hold on ReelFlies_CA (1895766) running this Cornerstone fork?

**How it was run:**

- `scripts/probes/run.mjs` ran every probe. Its evidence is in [`07-prelaunch-probes.evidence.json`](07-prelaunch-probes.evidence.json) ("How to rerun" is at the end).
- **The context probes** read `?debug=context` from a local `stencil start` (`scripts/qa/serve.mjs`, port 4400), because the prelaunch host doesn't answer `?debug=context`. They ran once with `-c 1895766 -v 'ReelFlies CA'` and once with `-c 1 -v 'ReelFlies CA'`. Ticket 53's channel-1 variation doesn't exist yet, so channel 1 used `ReelFlies CA`.
- **The API probes** sent GETs only, with the read-only store API token. The token was read through `scripts/lib/store-token.mjs` from the Keychain item `reelflies-bc-read`, and the store helper's read-only client sent the requests (`scripts/store/client.mjs`, `readOnly: true`). Nothing was written to the store, not even a PUT trial for probe 6.
- **The host probes** fetched `/cdn-cgi/trace` and the prelaunch `/blog/` without the preview cookie.
- **What isn't recorded:** pages' contexts (they carry the storefront API token and the visitor's IP address), a trace's `ip=` line, coupon codes, and anything about customers.

**What the store looks like today:**

- **Category trees** (`GET /v3/catalog/trees`):

  | Tree | Name | Channels |
  |---|---|---|
  | 1 | Default catalog tree | 1 |
  | 2 | ReelFlies_com | 1855224 |
  | 3 | ReelFlies_tmp | none |
  | 4 | ReelFlies_CA | 1895766 |

- **Tree 4 exists but has no categories.** HANDOFF says "tree 4 doesn't exist yet". Its id is already 4, which the release guard's menu id check will read.
- **So 1895766's menu is empty.** Probes 1, 3, 4, 8 and 14 ran on channel 1 (tree 1) and are recorded as **provisional (tree 1)**. Wave R1 reruns them on tree 4.

## Results

| # | Probe | Result | Waits for |
|---|---|---|---|
| 1 | Menu images | **Pass**, provisional (tree 1). All 61 menu categories carry `image`, and all 61 have a value. | R1 rerun on tree 4 |
| 2 | Menu depth | **Recorded:** the global depth is 3, and all three channels inherit it. Channel 1 renders 3 levels of a 4-level tree, so the setting caps the global. A per-channel depth wasn't tried (no PUT). | R1 (a depth write on 1895766, through W0-11) |
| 3 | Menu order | **Pass**, provisional (tree 1). All 9 sibling groups follow `sort_order`, then name, and 2 of them had ties for the name to break. | R1 rerun on tree 4 |
| 4 | `custom_fields` on cards | **Pass**, provisional (tree 1), with the stock front matter. A card whose product has a custom field carries it. No "Sold by" field exists yet. | Ticket 18 filling "Sold by"; R2 rerun |
| 5 | Home carousel (informational) | 1895766 returns `carousel` with **0 slides**; channel 1 returns 1. | none |
| 6 | Filter contexts (GET only) | **Partial.** Channel 1855224 already has its own channel-level context, so contexts aren't limited to channel 1. 1895766 has none. The enabled-filters list ignores `channel_id`. Whether a PUT with `channel_id` 1895766 is accepted is untested. | The trial write, in Shaun's approval batch |
| 7 | Flags | `multi_coupon_ui_enabled` is **true** on 1895766 and channel 1. **Semantic search is off:** `semantic_search_enabled` is absent from the context, and the search settings API has no such field. | none |
| 8 | Root roll-up | **Pass**, provisional (tree 1). `listing_mode` is `child_categories` globally, and every channel inherits it. Tree-1 roots with no products of their own list their children's products. | R1 rerun on tree 4 (`/species/` and the Fly Type roots) |
| 9 | Canonical on tree 4 | **Not run.** Tree 4 has no categories. | R1 (refactor 13) |
| 10 | Settings inheritance | **Recorded.** Category, search and inventory settings answer `null` for inherited fields, and 1895766 inherits every field except `product_filtering_enabled`, which reads `false` on every channel. The filters list is store-wide. | none |
| 11 | CDN country | **Pass.** `loc=CA` on the prelaunch host (both names), reelflies.ca and reelflies.com. Each answered 200, even while the prelaunch store answers 503. | none |
| 12 | Free-shipping remaining amount | **Fail**, provisional. No placeholder is documented. The store has no free-shipping promotion, and none of its promotions has a banner. The editor wasn't opened. | Shaun's look at the editor when he creates the promotion |
| 13 | Widget templates | **Not run:** waits for the writer run. | The first W0-11 writer run (Content: modify) |
| 14 | Subcategory images | **Pass**, provisional (tree 1). All 4 subcategories on the probed page carry `image` with a value. | R1 rerun on tree 4 |
| 15 | Blog | **Pass** on 1895766 through local `stencil start`: `/blog/` and all 4 published posts answer 200. The host itself answers 503 without the preview cookie. | The host check, in the next cookie batch (`npm run qa:prelaunch`) |

## Probe by probe

### 1 · Menu images

**Question:** does the Stencil `categories` global carry `image` for menu categories? The desktop banner strips (ticket 29) depend on it.

**Evidence:**

- **Channel 1, tree 1, home page context:** 61 categories over 3 levels. All 61 carry `image`, and all 61 have `image.data`, a CDN URL with the `{:size}` placeholder. For example, Flies (398): `…/images/stencil/{:size}/a/flies__97410.original.jpg`.
- **1895766:** `categories` is empty, so there was nothing to probe.

**Verdict:** **pass, provisional (tree 1).** Tree-4 categories get their images when refactor 13 builds them. Ticket 29 shows a banner only where `image` is set. R1 reruns this probe.

### 2 · Menu depth (recorded only)

**Question:** does Menu Display Depth cap the Stencil `categories` global?

**Evidence:** see [Probes 2 and 8 for refactor 18](#probes-2-and-8-for-refactor-18) below.

**What wasn't tried:** setting `category_tree_depth` per channel on 1895766. Lane G records the depth only.

### 3 · Menu order

**Question:** does the menu follow `sort_order`, then name?

**Evidence:**

- Channel 1's rendered `categories` global was compared with tree 1 from `GET /v3/catalog/trees/categories?tree_id:in=1` (154 rows).
- Each group of siblings in the menu was sorted by `sort_order`, then by name (case-insensitive, `en`), then by id.
- **All 9 groups match.** In 2 of them, siblings share a `sort_order`, so the name rule is exercised too. One example of `sort_order` overriding the alphabet: under Nymphs & Sub Surface Flies, Euro Nymphs comes before Caddis Emerger.
- No rendered category is missing from the tree read.

**Verdict:** **pass, provisional (tree 1).** Ticket 28 can rely on `sort_order` for the grouped menu's order. R1 reruns it on tree 4.

### 4 · `custom_fields` on category cards

**Question:** do category cards carry `custom_fields`? The "/ fly" price label (ticket 31) reads the "Sold by" field from it.

**Evidence:**

- **Every card on every probed page carries the `custom_fields` key.** It is `null` when the product has no custom fields. This is the stock front matter (`category: products: limit:` only); no `custom_fields` option is needed.
- **Only 2 of the store's 2,215 products have any custom field** (`GET /v3/catalog/products?include=custom_fields`, every page): "Colour" on one product and "FLY BOX OPTIONAL" on the other. **No product has a "Sold by" field yet.**
- **With a real value:** product 3875 (Bombers Brown Body White Tail, field "Colour") was found on `/flies/saltwater-warmwater-salmon/atlantic-salmon-flies/`. Its card carried `custom_fields` with "Colour", the same as the API read.

**Verdict:** **pass, provisional (tree 1).** Ticket 31's final rule works once ticket 18 fills "Sold by" (ticket 13's decision). R2 reruns the probe on 1895766's own cards.

### 5 · Home carousel per channel (informational)

**Evidence:**

- **On 1895766,** the home context's `carousel` is `{"slides": [], "swap_frequency": 10000}`: the front matter answers, with no slides.
- **On channel 1,** it holds 1 slide.

**Verdict:** **informational.** Slides are kept per channel, and 1895766 has none. The hero is a Widgets API template either way (ticket 46).

### 6 · Filter contexts (GET only)

**Question:** does a per-channel Product Filtering context work? BigCommerce's guide says the contexts API supports channel 1 only.

**Evidence** (`GET /v3/settings/search/filters/contexts`):

| Read | Contexts returned |
|---|---|
| No `channel_id` | 2: channel 1 at channel level (`category_id` 0), 15 filters, enabled: Other, Fly Sizes; and **channel 1855224 at channel level**, 5 filters, enabled: Other, Category, Price, Fly Sizes |
| `channel_id=1` | channel 1's only |
| `channel_id=1895766` | none |

- **The enabled-filters list** (`GET /v3/settings/search/filters`) reads the same with and without `channel_id`, at every scope, so it is store-wide. It holds 15 filters, of which Other, Category, Rating and Fly Sizes are enabled.

**What this shows:**

- **A non-default channel can carry its own context:** 1855224 has one, so storage isn't limited to channel 1. It was probably set in the control panel.
- **1895766 has none,** so it falls back to the store-wide list.
- **Untested:** whether the API's PUT accepts `channel_id` 1895766. It could reach channel 1 or every channel, so it isn't an agent write.

**Verdict:** **partial.** The recommended route (revisitable) is to set 1895766's filters the way 1855224's were set: Shaun in the control panel, or a trial PUT in his approval batch, with a snapshot of all three channels' contexts before and after. Until then, filtering on 1895766 follows the store-wide list. That matches the interim in the build pipeline's autonomy table: filtering is treated as store-wide.

### 7 · Flags

**Evidence:**

- **`cart.multi_coupon_ui_enabled`** is `true` in the cart page context, on both 1895766 and channel 1. So Cornerstone's enhanced totals layout and coupon pills apply (`templates/components/cart/totals.html`).
- **Semantic search:** the page context has no `semantic_search_enabled` key on 1895766 or channel 1 (home, search and cart pages). So `quick-search.html` renders the classic label and placeholder.
- **The storefront search settings** (`GET /v3/settings/storefront/search`) have no semantic-search field. Their fields are `product_filtering_enabled`, `default_product_sort`, `content_product_sort` and `search_suggest`.

**Verdict:**

- **Multi-coupon UI: on.** Ticket 41 shows the coupon pills, and ticket 24 records the value.
- **Semantic search: off,** and the settings API can't change it. Whether to turn it on is a control-panel choice for ticket 21, if the plan offers it.

### 8 · Root pages roll up (`listing_mode`)

See [Probes 2 and 8 for refactor 18](#probes-2-and-8-for-refactor-18).

### 9 · Canonical on a tree-4 page

**Not run:** tree 4 has no categories yet. It runs in R1, after refactor 13, together with refactor 18's probe 9.

### 10 · Settings inheritance

Each setting was read globally and with `channel_id` 1895766, 1 and 1855224. `null` means the channel inherits the global value (BigCommerce's documented meaning).

| Setting | Global | 1895766 | 1 | 1855224 |
|---|---|---|---|---|
| `storefront/category` `listing_mode` | `child_categories` | inherits | inherits | inherits |
| `storefront/category` `default_product_sort` | `bestselling` | inherits | inherits | inherits |
| `storefront/category` `category_tree_depth` | 3 | inherits | inherits | inherits |
| `storefront/search` `product_filtering_enabled` | `true` | **`false`** | **`false`** | **`false`** |
| `storefront/search` `default_product_sort`, `content_product_sort` | `relevance` | inherits | inherits | inherits |
| `storefront/search` `search_suggest` | `true` | inherits | inherits | inherits |
| `inventory`: all 17 fields | e.g. `product_out_of_stock_behavior` `do_nothing`, `option_out_of_stock_behavior` `label_option`, `stock_level_display` `dont_show`, `hide_in_product_filtering` `true`, `show_backorder_message` `false` | inherits all | inherits all | inherits all |
| `search/filters` (the enabled list) | 15 filters | identical to global | identical | identical |

**Findings:**

- **Null for inherited works,** on the category, search and inventory settings. That is what W0-11's settings proof assumes (`docs/store-writes.md`, "Testing"). These reads can replace its shaped fixtures (`settings-inventory.json`).
- **`product_filtering_enabled` breaks the null rule.** Each channel reads `false`, not `null`, but channel 1's category page renders `category.faceted_search_enabled: true`. So a channel's `false` here doesn't mean filtering is off on that storefront. Ticket 21 and W0-11 shouldn't treat this field's channel value as proof of an override.
- **`search/filters` fails part 1 of ticket 21's three-part test:** the channel read is identical to the global one. So it is store-wide, and W0-11 rightly refuses to write it per channel.
- **1895766 inherits everything else** from the global settings: the category listing, search and inventory behaviour that channel 1 and .com also inherit.

### 11 · CDN country

**Question:** does `/cdn-cgi/trace` return a `loc=` line? The outside-Canada prompt (ticket 52) reads only that line.

| Host | Status | `loc` | colo |
|---|---|---|---|
| reelflies_ca-1895766.mybigcommerce.com (prelaunch) | 200 | CA | YYZ |
| store-8pfqkn26ea-1895766.mybigcommerce.com (prelaunch, secure) | 200 | CA | YYZ |
| reelflies.ca | 200 | CA | YYZ |
| reelflies.com | 200 | CA | YYZ |

- **The trace answers ahead of the store:** the prelaunch host serves it without the preview cookie, while the same host's `/blog/` answers 503 ("Coming Soon").
- **The `loc` is the requester's country.** These runs come from Canada. A non-CA value can't be produced from this Mac, so ticket 52's tests stub the line.

**Verdict:** **pass** on all four hosts.

### 12 · Free-shipping remaining amount

**Question:** does the free-shipping promotion's editor offer a placeholder for the amount left to qualify?

**Evidence:**

- **The Promotions API documents banner `content` as static HTML,** with types `UPSELL`, `ELIGIBLE` and `APPLIED` and four locations. No placeholder is documented ([shipping promotion examples](https://docs.bigcommerce.com/developer/docs/admin/catalog-and-inventory/promotions/examples/shipping)).
- **The store's promotions** (`GET /v3/promotions`; codes not read): 8 promotions.
  - None has a free-shipping action, so no free-shipping promotion exists to inspect.
  - None has a banner (`notifications`).
  - The probe scans any banner for `%%…%%`, `{{…}}` and `{…}` tokens, and found nothing to scan.
- **The editor** is in the control panel, which agents don't open.

**Verdict:** **fail, provisional (revisitable).** Ticket 41 ships its interim: the cart shows the promotion's message with no bar. When Shaun creates the free-shipping promotion (ticket 13's thresholds, ticket 21), one look at its banner field settles it. If a placeholder is offered there, rerun `run.mjs api` and the probe will list it.

### 13 · Widget templates

**Not run.** It needs a write on 1895766: a throwaway widget template, widget and placement, through W0-11's `plan` and `apply` with the writer token. `docs/store-writes.md` records that `DELETE` isn't on W0-11's allowlist yet, so the spike's objects would stay unplaced (`inactive`) until a follow-up adds it.

**Trigger:** the first W0-11 writer run. Ticket 46's widget design waits on its two answers: can a template read an image-manager file name, and can it run `storefront_api_query`?

### 14 · Subcategory images

**Evidence:**

- **Channel 1, tree 1,** on `/flies/realistic-trout-flies/`: 4 subcategories, and all 4 carry `image` with a value.
- **Every menu category in tree 1 also has an image** (probe 1).
- **1895766:** no data, because it has no categories.

**Verdict:** **pass, provisional (tree 1).** Ticket 32's chips show a thumbnail only where one is set. R1 reruns the probe on tree 4.

### 15 · Blog

**Question:** do `/blog/` and every blog post return 200 on the ReelFlies_CA prelaunch host?

**Evidence:**

- **The published posts:** `GET /v2/blog/posts` lists 4, which are also the 4 on `/blog/`'s first page.
- **Local `stencil start -c 1895766`:** `/blog/` and all 4 post paths answer 200. The store renders them for channel 1895766.
- **The home context on 1895766** has `settings.blog_enabled: true`, and `pages` lists "Blog" at `https://reelflies_ca-1895766.mybigcommerce.com/blog/`.
- **Channel 1** answers 200 for the same paths.
- **The prelaunch host without the preview cookie** answers 503 ("Coming Soon"), as every page does.

**Verdict:** **pass** for the store's channel 1895766. **Waiting:** the same check on the host with the preview cookie, which goes in the next cookie batch (`npm run qa:prelaunch`, W0-6). The drawer and footer links in tickets 27, 28 and 50 can point at `/blog/`.

## Probes 2 and 8 for refactor 18

These cover refactor 18's probes 4 (Menu Display Depth) and 5 (root roll-up), so they run once (`plan/build-pipeline.md`, lane G).

### Menu Display Depth (this ticket's probe 2; refactor 18's probe 4)

| | Value |
|---|---|
| `GET /v3/settings/storefront/category` (global) | `category_tree_depth: 3` |
| the same with `channel_id=1895766` | `category_tree_depth: null` (inherits 3) |
| `channel_id=1` | `null` (inherits 3) |
| `channel_id=1855224` | `null` (inherits 3) |
| Tree 1, visible categories under visible parents, by level | 1: 3 · 2: 12 · 3: 46 · **4: 30** |
| Channel 1's rendered `categories` global, by level | 1: 3 · 2: 12 · 3: 46 · **4: none** |

- **The depth caps the Stencil `categories` global.** With depth 3, channel 1 renders exactly levels 1–3 of a 4-level tree. Level-4 categories such as Hare's Ear Nymph (258, under Searching Nymphs) and Stinger Hook Flies (262, under ReelFlies Signature Flies) are left out.
- **ReelFlies_CA inherits depth 3, so three levels are allowed.** This answers refactor 18's probe 4 for the Stencil global. Its GraphQL `categoryTree` half wasn't probed.
- **Not tried:** a per-channel value on 1895766, such as 2, which would let the Species panel show 11 names instead of 28 links without code. The API documents `channel_id` on the PUT and a range of 1–8. The channel read answers `null` for every field, so such a write should pass parts 1 and 2 of W0-11's settings proof: the channel read differs from the global one, and it shows the key.
- **The depth applies to the whole menu,** not only the Species panel: depth 2 would also drop every Fly Type's third level. Ticket 28 decides with that in mind.
- **When to rerun:** R1, once tree 4 has categories, as a W0-11 write on 1895766 with a snapshot, a diff and a log row.

### Root roll-up (this ticket's probe 8; refactor 18's probe 5)

| | Value |
|---|---|
| `listing_mode` (global) | `child_categories` |
| `listing_mode` on 1895766, 1 and 1855224 | `null` (each inherits `child_categories`) |

Channel 1's tree-1 roots, rendered:

| Root | Products assigned directly (`categories:in`) | `category.total_products` on its page | Rolls up |
|---|---|---|---|
| Flies (398) | 67 | 1,978 | (has its own; not a test) |
| Fly Selections & Fly Boxes (399) | **0** | **87** | yes |
| Fly Gear (400) | **0** | **107** | yes |

- **A root with no products of its own lists its children's products,** so it doesn't show Cornerstone's "There are no products listed under this category." alert (`product-listing.html`, `category.js`).
- **1895766 inherits the same `listing_mode`,** so tree 4's `/species/` and Fly Type roots will roll up unless someone sets a channel override.
- **Proven:** one level (root to child), which is the shape refactor 18's probe 5 asks about (a root whose child holds the product). Products sitting only in grandchildren weren't tested separately.
- **Recommendation for refactor 18 (revisitable):** probe 5 needs no throwaway root or product write. Rerun this read and render on tree 4 in R1 instead (`run.mjs context` on 1895766, which records every root it renders).

## Notes for other tickets

- **Orchestrator (HANDOFF):** tree 4 exists. It is id 4, named "ReelFlies_CA", assigned to 1895766, with no categories. Tree 3 "ReelFlies_tmp" has no channel.
- **Ticket 21** (`plan/issues/21-store-settings-reelflies-ca.md`): these are the reads at four scopes (probe 10).
  - `product_filtering_enabled` reads `false` per channel while channel 1 filters.
  - The filters list is store-wide.
  - Inventory is inherited in full.
  - Semantic search isn't an API setting.
  - 1895766 has no filter context (probe 6).
- **W0-11 (`docs/store-writes.md`):** probe 10 confirms null-for-inherited on the category, search and inventory settings, so the fixtures can be recorded from these reads. `search/filters` is identical across scopes and fails part 1.
- **Tickets 24 and 41:**
  - `multi_coupon_ui_enabled` is `true` on 1895766.
  - Probe 12 failed, so ticket 41 ships its interim: the message with no bar.
- **Ticket 28:** the menu follows `sort_order`, then name. Depth 3 is inherited, and the depth setting caps the whole menu, not one panel.
- **Ticket 29:** the menu categories carry `image` (tree 1: 61 of 61 set).
- **Ticket 31:** cards carry `custom_fields` with the stock front matter. "Sold by" doesn't exist yet; only 2 products have any custom field.
- **Ticket 32:** `category.subcategories` carries `image`.
- **Ticket 34:** `/species/` will roll up (`listing_mode` `child_categories`, inherited).
- **Ticket 46:** 1895766 has no carousel slides. Probe 13 waits for the writer run.
- **Ticket 52:** `loc=` is served on every host, ahead of the store's 503.
- **Tickets 27, 28 and 50:** the blog answers 200 on 1895766.

## Defaults taken (each revisitable)

1. **Probe 6's trial PUT isn't sent.** The recommended route for 1895766's filters is Shaun's batch: the control panel as for 1855224, or an approved PUT.
2. **Channel 1 renders with the `ReelFlies CA` variation,** until ticket 53's channel-1 variation exists. The probes read data, not styles, so the variation doesn't change a result.
3. **Probe 4 is judged by a real product's custom field ("Colour"),** because "Sold by" doesn't exist yet.
4. **Probe 3 compares names case-insensitively, in the `en` locale.** Tree 1 has no pair of names that differ only by case, so either reading gives the same result.
5. **Probe 12 is judged from the API documentation and the store's promotions,** without the control-panel editor.
6. **Probe 15 is judged on local `stencil start` for 1895766.** The host check with the cookie is waiting.
7. **Tree-1 results stand in for tree 4 until R1,** marked provisional.

## How to rerun

From a worktree on its assigned port (wave R1 and R2 rerun the tree-4 rows the same way):

```sh
source ~/.nvm/nvm.sh && nvm use 20.18.1
node scripts/probes/run.mjs api --out /tmp/07-api.json          # GETs only, read-only token
QA_PORT=4400 node scripts/qa/serve.mjs                           # in another shell: 1895766; Ctrl-C when done
QA_PORT=4400 node scripts/probes/run.mjs context --api /tmp/07-api.json --out /tmp/07-1895766.json
QA_PORT=4400 QA_CHANNEL=1 node scripts/qa/serve.mjs              # then channel 1
QA_PORT=4400 QA_CHANNEL=1 node scripts/probes/run.mjs context --api /tmp/07-api.json --out /tmp/07-1.json
node scripts/probes/run.mjs hosts --out /tmp/07-hosts.json
```

- **`context`** refuses a server that renders another channel or variation, through `serverProblems`, the same check the gates make.
- **`--category <path>`** probes a chosen category page for probes 4 and 14. Without it, the first second-level menu category with children is used.
