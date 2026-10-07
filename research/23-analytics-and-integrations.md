# Analytics, email and integrations on ReelFlies_CA (ticket 23)

The checklist for ticket 23: what is connected to ReelFlies_CA (channel 1895766) today, what each acceptance criterion still needs, and who does it. Written 2026-10-06 from read-only reads only: no store writes were made. Revised 2026-10-07 after PR #35's reviews.

- **The reads:** `node scripts/integrations/read.mjs` (GET only, read-only token), at 2026-10-07T04:04:53Z. The raw reads, with each template's body, are outside git at `~/reelflies/store-snapshots/store-wide/integrations/2026-10-07T04-04-53.104Z-read-23.json`. API secrets, coupon codes and send counts are never kept.
- **The script budget:** `node scripts/integrations/script-budget.mjs https://reelflies.ca/` at 2026-10-07T04:08:23Z. It reads the page's HTML and the script files it names, and runs none of them, so no tag fired and no visit was counted. The prelaunch host needs Shaun's preview cookie, so 1895766's own page waits for him (below).
- **The web-vitals script:** `store-scripts/` (source, tests and the changes file), not yet created on the store.

## The checklist

| # | Item | Where it lives | Scope | Now (read 2026-10-07) | Target | Who | Status |
|---|---|---|---|---|---|---|---|
| 1 | GA4 on 1895766 | Data Solutions: web analytics provider "Google Analytics 4" | global; every channel inherits it | `G-BQ4RFFK3KW` on, set globally. 1895766, 1 and 1855224 all inherit it (`channel_id` 0 in each channel's read) | the .ca measurement id on 1895766, so the numbers carry on across the Flip | Shaun confirms in DebugView | **waiting** (DebugView; criterion 1) |
| 2 | GA4 open point (a): .com in the .ca stream | the same provider | global | .com (1855224) inherits the global `G-BQ4RFFK3KW`, so it reports into the .ca stream | interim: one property, segmented by hostname (build pipeline section 5) | Shaun | **open**, interim in force |
| 3 | GA4 open point (b): prelaunch and test hosts filtered out | GA4 Admin: data streams, data filters | the property | no filter | an internal-traffic data filter (below) | Shaun | **open**; web-vitals stays disabled until it exists |
| 4 | GA4 ecommerce events | BigCommerce's GA4 snippet subscribes to the data layer (`subscribeOnBodlEvents`) | global | data layer on (ticket 08); `data_tag_enabled` reads false on every provider | page view, add to cart and purchase once each in DebugView | Shaun; ticket 55's test order | **waiting** (refactor 14 for products on 1895766) |
| 5 | GA4 annotations | GA4 Admin: annotations | the property | none known | one per dated event, list below | Shaun in GA4; the orchestrator puts the list in `RELEASES.md` | **waiting** |
| 6 | Web-vitals field data | Script Manager on 1895766 | channel | built: `store-scripts/1895766/web-vitals.json`, not created | created disabled, enabled once (b) has its filter | an agent creates it disabled (W0-11, lifted) once this PR merges, on the orchestrator's go; Shaun enables it | **built;** the disabled create doesn't wait for (b); enabling does |
| 7 | GA4 custom definitions for the web-vitals parameters | GA4 Admin: custom definitions | the property | none | `metric_rating` and `metric_navigation_type` as event-scoped dimensions; `metric_value` as a custom metric | Shaun | **waiting** (with 6) |
| 8 | Legacy Universal Analytics `UA-1225874-8` | Data Solutions: the "Google Analytics" provider | global | on, consent-tagged (analytics). **The same provider's code also holds Omnisend's order-attribution snippet (`SOUNDEST-V6-1`)** | UA removed (it stopped collecting in 2023), the Omnisend snippet kept until Omnisend confirms how it attributes orders | Shaun (a store-wide write), ticket 08 | **open** (ticket 08) |
| 9 | Meta Pixel `2233770690192958` | Data Solutions: the "Facebook Pixel" provider | global | on; its inline snippet carries **no consent tag** in the HTML, and loads `fbevents.js` | PageView, AddToCart and Purchase once each in Test Events, from 1895766; AddToCart once per add on channel 1 too | Shaun | **waiting** (criterion 2; refactor 14) |
| 10 | Omnisend on 1895766 | the Omnisend app; Script Manager | channel | not known: the API can't list control-panel scripts. On channel 1, two Omnisend launchers load (below) | footer signup and checkout subscribers reach Omnisend with consent; a test order shows | Shaun | **waiting** (criterion 3) |
| 11 | Omnisend coupon codes on 1895766 | Omnisend; BigCommerce coupons | channel | not checked | they work on 1895766 | ticket 24 assigns them | ticket 24 |
| 12 | Abandoned-cart email owner | native: Marketing > Abandoned cart emails; or Omnisend | native: global, channels inherit | **native is off:** 3 global templates, none active; 1 and 1895766 use the global ones (`use_global` true) | exactly one active for 1895766 | Shaun chooses; interim below | **waiting** (criterion 4) |
| 13 | Transactional email branding | Storefront > Email templates | global (no channel has its own templates) | not checked yet. The stored read holds every template's body, so whether each uses the store-logo variable, and which colours it hard-codes, can be read from it without a store call (revisitable, next agent on ticket 23) | the logo (the 133x95 PNG until ticket 14's master) and colours | Shaun (the templates are store-wide) | **waiting** |
| 14 | Transactional email links | the 15 email templates and 3 abandoned-cart templates | global | **every link is a template variable, a BigCommerce asset or page path, or bigcommerce.com:** none needs a fix (table below) | links point at reelflies.ca after the Flip | recorded here; ticket 57 checks on Flip day | **done** for BigCommerce's 18 templates. Criterion 9 is only partly met: Omnisend's emails (15) wait on Shaun |
| 15 | Omnisend email links | Omnisend's flows and campaigns | Omnisend | not readable here | every link on reelflies.ca after the Flip | Shaun lists them (below) | **waiting** |
| 16 | Review app | none | | native reviews (ticket 13 decision 5, default). Still open from the owner comment: is a review app running on channel 1 today? Channel 1's home page loads no review-app script, but its product pages weren't read | | Shaun answers (his checks, below) | **not applicable** for now |
| 17 | Script Manager list for 1895766 | Storefront > Script Manager | channel | the Scripts API lists only the scripts the calling account created: 0 for the read-only account | every script in the footer, async, consent-tagged, within the budget. The one deliberate exception: ReelFlies' web-vitals script is inline, which the API loads only as "default", never async (revisitable) | Shaun's list, or the budget tool with the cookie | **waiting** (criterion 6) |
| 18 | Third-party budget | | | Script Manager scripts on channel 1: about 33 KB gzip. Everything third-party, the Data Solutions tags included: about 447 KB gzip (below) | 150 KB gzip for Script Manager scripts | Shaun approves the tidy-up | **waiting** (17) |
| 19 | Site verification tags | Data Solutions: "Site Verification Tags" | global | one meta tag (Pinterest), on | keep | | no action |

## GA4: the facts

- **One measurement id, set globally.** The "Google Analytics 4" provider holds `G-BQ4RFFK3KW` at the global scope, and every channel reads it back with `channel_id` 0, which is how BigCommerce marks an inherited value. So 1895766 loads the .ca id unless a channel override is added. This confirms Shaun's "I have added the GA4 analytics token globally to all reelflies sites" by API. The page source of prelaunch still needs his cookie, so DebugView (criterion 1) is the proof on 1895766 itself.
- **BigCommerce's GA4 snippet** (read from reelflies.ca's HTML) injects `gtag.js?id=G-BQ4RFFK3KW`, sets Consent Mode defaults to denied, and subscribes GA4 to the data layer's events (`subscribeOnBodlEvents`), which is where add to cart and purchase come from. It keeps its `gtag` function inside its own scope: only `window.dataLayer` is global.
- **`window.gtag` exists today only because of the legacy UA snippet** in the "Google Analytics" provider, which is consent-tagged and which ticket 08 removes. Anything that sends to GA4 must not rely on `window.gtag`. The web-vitals script falls back to pushing onto `window.dataLayer` the way `gtag()` does, as an arguments object. Ticket 52's `rf_region_go` contract (build pipeline 6.9, "sent only when `window.gtag` exists") needs the same fallback, or it sends nothing once UA is gone.
- **`data_tag_enabled` reads false on every provider,** GA4 included. The API reference doesn't say what it changes. Criterion 1's DebugView check shows whether add to cart and purchase arrive.
- **The legacy provider is more than UA.** Its code holds the UA gtag snippet and Omnisend's `SOUNDEST-V6-1` order attribution, which hooks the legacy `pageTracker._addTrans` / `_trackTrans` calls on the order confirmation to credit orders to Omnisend. So removing the provider, or clearing its code, removes Omnisend's attribution too. Ticket 08's "remove UA only after Omnisend confirms how it attributes orders" is exactly this. When it goes, delete the UA lines and keep the `SOUNDEST` block until Omnisend says it is unused.
- **Weight:** GA4's `gtag.js` is 164,088 B gzip, UA's is 135,452 B. They are separate downloads.

## The two open GA4 points

**(a) Should .com keep reporting into the .ca stream?**

- **What runs now:** yes. .com inherits the global provider.
- **Interim (build pipeline section 5):** one property, segmented by hostname. Reports for one site filter on hostname (`reelflies.ca`, `www.reelflies.ca`, `reelflies.com`).
- **To give .com its own id:** a channel-level override of the GA4 provider on 1855224. That is a write to .com, so it is Shaun's, with a snapshot and a diff.

**(b) Filter prelaunch and local test hosts out of reports**

- **GA4 has no hostname data filter.** Its data filters are "internal traffic" (by the `traffic_type` parameter, which an IP rule sets) and "developer traffic" (debug mode).
- **Recommended:** in the web data stream's tag settings, define internal traffic by the office's public IP address, then add an "Internal traffic" data filter set to Exclude. Put it in Testing first, check the "Test data filter name" dimension, then make it Active. A filter changes data from then on, and can't be undone for data already processed.
  - The prelaunch host answers only with Shaun's preview cookie, so its traffic is his own, and the tags-loaded Lighthouse runs (W0-6, ticket 17) run from the same Mac and network. The IP rule covers both.
  - **The IP rule covers the office network only.** A prelaunch page opened from another network, such as ticket 55's real-device passes on mobile data, still reaches the reports. Add each tester's network to the rule, or filter reports by hostname as a backstop. That is Shaun's call; the default is revisitable.
  - Local `stencil start` serves no tags, and every gate run blocks the analytics hosts anyway (W0-6).
- **How criteria 1 and 5 are checked under the filter:** in **DebugView**, through Tag Assistant (tagassistant.google.com, connected to the prelaunch page in a browser that has the preview cookie), **while the filter is still in Testing.** In Testing, matching events are only labelled, so they still show. Once it is Active, events from the office's IP are dropped before DebugView too. So run the checks, then make the filter Active. A later recheck (ticket 55's test orders) switches it back to Testing for the session, or runs from a network outside the IP rule.
  - **Accept analytics cookies in the consent banner first.** Cookie consent is on: GA4's Consent Mode defaults to denied, and the web-vitals script's consent category is analytics, so without consent it never loads and the check fails with no clear reason.
- **Interim until Shaun sets it:** analytics stays blocked in every gate (W0-6), and the web-vitals script stays disabled. Creating it disabled doesn't wait for the filter: an agent does that once this PR merges, on the orchestrator's go. Only enabling it waits. Once he sets the filter, ticket 08 records the date and `GA4_HOSTNAME_FILTER_SINCE` in `scripts/qa/prelaunch.mjs` takes it (W0-6's tags-loaded run).

## GA4 annotations

GA4 annotations are added by Shaun (Admin > Annotations). The list belongs in `RELEASES.md`, which only the release tooling and the orchestrator write, so it is listed here for the orchestrator to copy.

| Date | Event | Happened? |
|---|---|---|
| 2026-10-06 | GA4 `G-BQ4RFFK3KW` added to every ReelFlies site (global provider) | yes |
| 2026-10-06 | First ReelFlies theme on ReelFlies_CA (prelaunch only, not public) | yes; optional, since prelaunch isn't public |
| when Shaun sets it | GA4 internal-traffic filter active (point b) | not yet |
| when enabled | web-vitals field data on 1895766 | not yet |
| T-28 | ReelFlies theme pushed to channel 1, live reelflies.ca (ticket 56) | not yet |
| T-21 | code freeze | not yet |
| T-14 | hreflang v1 live; content and catalogue freeze | not yet |
| T-0 | the Flip | not yet |
| each date | a switchable module turned on (ticket 58) | not yet |
| when done | UA `UA-1225874-8` removed (ticket 08) | not yet |

## Third-party scripts and the budget

The budget (research.json, performance budget) is "a third-party **Script Manager** budget: footer, async, consent-tagged, 150 KB gzip or less". The Data Solutions tags (GA4, UA, the Meta Pixel) aren't Script Manager scripts, so this checklist reads the budget as Script Manager scripts only, and records the Data Solutions tags beside it. GA4's `gtag.js` alone is 164 KB gzip, so a budget that counted it could never pass.

**Live reelflies.ca (channel 1, the old theme),** 2026-10-07. The Data Solutions tags are global, so 1895766 loads the same ones; its Script Manager scripts are its own.

| Script | Where it comes from | In | Loads | Consent tag | gzip |
|---|---|---|---|---|---|
| `gtag.js?id=G-BQ4RFFK3KW` (GA4) | Data Solutions, GA4 provider (injected by its inline snippet) | head | injected, async | none in the HTML; Consent Mode defaults to denied | 164,088 B |
| `gtag.js?id=UA-1225874-8` (UA) | Data Solutions, "Google Analytics" provider | head | async | analytics (`data-bc-cookie-consent="3"`) | 135,452 B |
| `fbevents.js` (Meta Pixel) | Data Solutions, "Facebook Pixel" provider (injected) | head | injected, async | **none** | 112,681 B |
| Omnisend launcher, `omnisnippet1.com` (`SOUNDEST-V6-SM`) | Script Manager, by its marker and consent tag (to be confirmed by Shaun's list); injected by its snippet | body | injected | functional (`"2"`) | 15,821 B |
| Omnisend launcher, `omnisrc.com` (`SOUNDEST-V6-2-S`) | Script Manager, by its consent tag (to be confirmed by Shaun's list); injected by an older snippet | body | injected | functional (`"2"`) | 15,821 B |
| six inline snippets (gtag set-ups, Omnisend, Meta) | the above | head and body | inline | as above | 3,141 B |
| **Everything third-party** | | | | | **447,004 B** |
| **Script Manager scripts only** (both Omnisend launchers and their snippets) | | | | | **about 33,000 B** |

- **The tidy-up, for Shaun** (each is a store write he approves; channel 1's are his anyway):
  1. Remove UA from the "Google Analytics" provider, keeping Omnisend's `SOUNDEST-V6-1` block (ticket 08). That saves 135 KB gzip on every page of every site.
  2. Remove one of the two Omnisend launchers. They are the same 56 KB file from two hosts; `SOUNDEST-V6-2-S` (`omnisrc.com`) looks like the older install. Ask Omnisend which one its current app uses.
  3. Decide whether the Meta Pixel should wait for consent. Its snippet loads before any consent choice today.
- **1895766's own list:** the Scripts API can't list control-panel scripts. Shaun reads Storefront > Script Manager with 1895766 selected, or runs the budget tool with his preview cookie:

  ```sh
  read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE
  node scripts/integrations/script-budget.mjs https://reelflies_ca-1895766.mybigcommerce.com/
  ```

  The cookie goes to the prelaunch page only, never to a script's host or through a redirect, and is never printed (`script-budget.test.mjs` checks all three).

  **Its verdict isn't criterion 6's.** The tool's "within" or "over", and its exit code, judge every third-party script on the page, the Data Solutions tags included, so it says "over" (exit 1) while GA4 and the Meta Pixel load. Judge criterion 6 from the Script Manager rows and Shaun's control-panel list. Also, when reading its table:
  - It doesn't mark which rows are Script Manager scripts. Use the consent tags and markers above.
  - Once the web-vitals script is enabled, the tool labels it "Google tag (gtag)", because the glue calls `gtag`. It is ReelFlies' Script Manager script, 3,631 B gzip.
  - It counts only Google's, Meta's and Omnisend's inline snippets as third party. Another vendor's inline snippet shows as the store's, and neither it nor the file it injects is measured. Nor is a script served from the store's WebDAV folder (`cdn*.bigcommerce.com/s-*/content/`), which shows as BigCommerce's. Measure any such row by hand.

  A Script Manager column and subtotal, the web-vitals label, and other vendors' snippets are a revisitable follow-up for the next agent on ticket 23, before Shaun's run (PR #35, "Review findings").
- The web-vitals script adds 3,631 B gzip (its own budget is 4,096 B).

## Email templates and their links

Read 2026-10-07 with `scripts/integrations/read.mjs`. **No channel has templates of its own:** channels 1 and 1895766 both use the 15 global templates, and the abandoned-cart templates are global too (`use_global` true on both). So 1895766's emails are the global ones, and their branding is a store-wide change.

**Every link is fine after the Flip.** Each one is a template variable (`{{ store.path }}`, `{{ order.account_order_status_url }}`, `{{ notification.checkout_link }}` and so on), which BigCommerce fills from the channel's own site URL, or a file on the store's image or CDN folder, or BigCommerce's own `account.php` page, or the "Powered by BigCommerce" link. None is hard-coded to the prelaunch host, a tree-1 path or reelflies.com.

| Template | Subject | Links | By kind |
|---|---|---|---|
| abandoned_cart_email | (none) | 2 | variable 1, external 1 |
| account_details_changed_email | Your {{ store.domain_name }} account details have changed | 0 | none |
| account_reset_password_email | Password change request for {{ store.name }} | 1 | variable 1 |
| combined_order_status_email | Your {{ store.name }} Order Has Been Updated (#{{ order.id }}) | 6 | variable 5, external 1 |
| createaccount_email | Thanks for Registering at {{ store.name }} | 4 | variable 3, external 1 |
| createguestaccount_email | Welcome to {{ store.name }} | 3 | variable 2, external 1 |
| giftcertificate_email | {{ certificate.from_name }} has sent you a gift certificate for {{ store.name }} | 2 | variable 1, external 1 |
| invoice_email (the order confirmation) | Your {{ store.name }} Order Confirmation (#{{ order.id }}) | 7 | variable-asset 3, variable 3, external 1 |
| ordermessage_notification | (none) | 3 | variable 2, external 1 |
| passwordless_login_email | {{ store.name }} - Log in to your account | 3 | variable 2, external 1 |
| product_review_email | Invitation to Review Products You've Recently Purchased | 4 | variable 3, external 1 |
| return_confirmation_email | Your Return Request on {{ store.name }} | 4 | variable-asset 1, variable-platform 1, variable 1, external 1 |
| return_statuschange_email | Return Status Update on {{ store.name }} | 3 | variable-platform 1, variable 1, external 1 |
| order_ready_for_pickup | {{{ lang 'subject' store=store.name }}} | 8 | variable 5, variable-asset 3 |
| guest_order_access_email | {{{ lang 'subject' order_id=order.id }}} | 7 | variable 4, variable-asset 3 |
| abandoned cart #1, #2, #3 (all inactive) | Complete your purchase at {{{ store.name }}}... | 7 each | variable 6, external 1 |

- "external" is `http://www.bigcommerce.com/` in every case, the "Powered by BigCommerce" footer.
- **What makes them right after the Flip** is 1895766's site URL becoming `https://reelflies.ca`, which ticket 57 changes on Flip day. The read-only account can't read site URLs (`/v3/channels/<id>/site` answered 403: it lacks the Sites & Routes scope), so ticket 57's Flip-day check reads it in the control panel, or the account gets Sites & Routes: read-only.
- **Rerun:** `node scripts/integrations/read.mjs` prints this table again, with any link that needs a look in a "To look at" column: the prelaunch host, a hard-coded reelflies.ca path, a variable followed by a page path, reelflies.com, or a relative link.
  - **What a rerun doesn't flag yet** (revisitable, for the next agent on ticket 23 before ticket 57's Flip-day rerun): it reads only quoted `href` and `src` values, so an unquoted link, a `background` attribute or a CSS `url()` isn't listed at all; a page path after a variable host (`https://{{store.domain_name}}/fly-tying/`) passes as external; and a link that starts with `{{`, such as a block helper around a hard-coded host, passes as a variable. Today's 18 templates hold 78 links, all quoted, and none of these shapes, so the table above stands.

**Omnisend's emails (Shaun):** list each active flow and campaign template (welcome, abandoned cart, order follow-up and any others) with its links. A link is fine if it is built from Omnisend's store or product variables. Fix any link hard-coded to `reelflies_ca-1895766.mybigcommerce.com` or to a reelflies.ca category path, which the Flip changes. Record the list in ticket 23's comments.

## The abandoned-cart owner

- **Native now:** off. The three global templates (1, 2 and 3) are all inactive, and channels 1 and 1895766 use them.
- **Default taken (revisitable):** Omnisend owns abandoned-cart email, and native stays off, as the store has it today. Exactly one is then active, if Omnisend's abandoned-cart flow is on for the store that serves 1895766.
- **Shaun:** confirm Omnisend's abandoned-cart flow is on and sees 1895766's carts, or say "native", and then the native templates are turned on and Omnisend's flow off. Record the choice in ticket 23.

## The web-vitals script

- **What it sends:** one GA4 event per report, named `LCP`, `INP` or `CLS`, with `value` (the delta), `metric_id`, `metric_value`, `metric_delta`, `metric_rating` and `metric_navigation_type`, as the web-vitals README gives for GA4. LCP is reported once the visitor first clicks or types, or leaves; INP and CLS when the page is hidden.
- **How it sends:** through `window.gtag` if there is one, else onto `window.dataLayer` as `gtag()` would (BigCommerce's GA4 snippet). It carries no measurement id.
- **What it is:** web-vitals 6.2.2 (Apache-2.0), vendored and pinned by sha256, plus a short glue, in one inline `<script>` of 9,868 characters and 3,631 B gzip.
- **Script Manager settings:** footer, `script_tag` (the API requires load method "default" for an inline script, so "async" doesn't apply; it runs after the page's content and does its work in performance observers), storefront pages only, consent category analytics, created disabled, `auto_uninstall` false.
  - So it is the one script on 1895766 that can't meet criterion 6's "async". That is deliberate and revisitable: the alternative, a `src` script with async from a file in the store's WebDAV folder, needs a write outside decision 4.
- **Tests:** `scripts/store-scripts/web-vitals.test.mjs` (glue, payload, W0-11's checks), `web-vitals-browser.test.mjs` (the built script in Chromium sends LCP, INP and CLS through a global gtag and through the data layer) and `lint.test.mjs` (the glue under the repo's ESLint config).
- **Creating it** is a lifted write (decision 4) through `scripts/store/`, as `store-scripts/README.md` shows. Creating it disabled changes nothing on the storefront, so it doesn't wait for point (b): once this PR merges, on the orchestrator's go, an agent runs the plan, `apply --dry-run` (W0-11's first write runs dry first) and `apply` from the main clone.
- **Enabling it is Shaun's,** in Storefront > Script Manager, once point (b)'s filter exists. Then he checks criterion 5 in DebugView while the filter is in Testing: open a prelaunch page through Tag Assistant, **accept analytics cookies in the consent banner**, click something, switch tabs, and look for `LCP`, `INP` and `CLS` events with `metric_value`.
- **Field data comes only from visitors who accept analytics cookies,** because the script's consent category is analytics.
- **Reading it after the Flip** (ticket 58): GA4's custom definitions (item 7), then an exploration of the 75th percentile of `metric_value` per event name, or the BigQuery export (web.dev, "Measure and debug performance with Google Analytics 4 and BigQuery"). The targets are INP 200 ms or less and CLS 0.1 or less.

## Shaun's checks before the T-21 freeze

1. **GA4 DebugView (criterion 1):** through Tag Assistant on the prelaunch host, with point (b)'s filter in Testing and analytics cookies accepted in the consent banner, a page view, an add to cart and a purchase from 1895766, each once. The add to cart and purchase need products on 1895766 (refactor 14) and a test order (ticket 55).
2. **Meta Test Events (criterion 2):** the same three from 1895766, with AddToCart once per add. Also add one item to a cart on live reelflies.ca (the old theme) and record whether AddToCart fires once: ticket 08's double-firing check. That is a write on channel 1, so it is his.
3. **Omnisend (criterion 3):** a test subscriber from the footer signup on 1895766 with consent recorded, and the test order.
4. **Abandoned cart (criterion 4):** the owner, above.
5. **Web-vitals (criterion 5):** above, with analytics cookies accepted.
6. **Script Manager (criterion 6):** the list for 1895766, and the tidy-up.
7. **Annotations (criterion 7):** the rows above that have happened.
8. **Omnisend's email links (criterion 9):** the list under "Omnisend's emails", above.
9. **Review app on channel 1 (the owner comment's open question):** is one running on reelflies.ca today? If it is, say whether 1895766 should have it too. Until he answers, reviews are native and there is nothing to connect.

## Criteria

| Criterion | Status |
|---|---|
| GA4 DebugView: page view, add to cart and purchase from 1895766, each once | **Waiting:** Shaun's DebugView check; products on 1895766 (refactor 14) and ticket 55's test order. The API confirms 1895766 inherits `G-BQ4RFFK3KW` |
| Meta Test Events: the same three, AddToCart once per add | **Waiting:** Shaun; refactor 14 |
| Omnisend: a test subscriber with consent, and a test order | **Waiting:** Shaun connects Omnisend to 1895766 |
| Exactly one abandoned-cart email active for 1895766, Shaun's choice recorded | **Waiting:** native is off (0 of 3 active); default Omnisend, for Shaun to confirm |
| A web-vitals event with LCP, INP and CLS values arrives in GA4 from a prelaunch page view | **Waiting:** built and tested. Next, the disabled create through W0-11, once this PR merges and on the orchestrator's go (it doesn't wait for point (b)). Then Shaun enables it once point (b)'s filter exists, and checks DebugView with analytics cookies accepted |
| The Script Manager list for 1895766 recorded, every script footer, async, consent-tagged, within 150 KB gzip | **Waiting:** Shaun's control-panel list or the budget tool with the cookie. Channel 1 is measured above. ReelFlies' web-vitals script is the one deliberate non-async entry: inline, which the API loads only as "default" (revisitable) |
| A GA4 annotation for every dated event so far, the list in `RELEASES.md` | **Waiting:** Shaun adds the annotations; the orchestrator copies the list above |
| A review app's reviews on a test product | **Not applicable:** native reviews (ticket 13 decision 5) |
| The list of emails and links recorded; ticket 57 asked for the Flip-day check | **Partly met; waiting** (trigger: Shaun lists Omnisend's flows and campaigns with their links). BigCommerce's 18 templates are listed above, and ticket 57 already holds the Flip-day email check (57:44); the PR asks the orchestrator to add the site-URL note |
| All checked before the T-21 code freeze | **Waiting** |

## Defaults taken (each revisitable)

1. **GA4 stream:** the .ca id on 1895766, as the global provider already sets it (the ticket's first option). Point (a)'s interim: one property, segmented by hostname.
2. **Point (b):** an IP-based internal-traffic data filter; the DebugView checks run while it is in Testing, then it goes Active.
3. **Abandoned-cart owner:** Omnisend, with native off as today.
4. **The third-party budget** counts Script Manager scripts only, as research.json words it. The Data Solutions tags are recorded beside it.
5. **Web-vitals:** web-vitals 6.2.2 (the newest release two weeks old; 6.2.3 was a day old), vendored rather than loaded from a CDN, so it adds no host; the standard build, not the attribution build; Google's GA4 event shape plus `metric_rating` and `metric_navigation_type`; storefront pages only; `auto_uninstall` false, so it outlives a replaced writer account; through `window.gtag`, else GA4's data layer.
6. **Email links:** a variable base followed by a store asset folder or BigCommerce's own `account.php`, `login.php` or `cart.php` page passes, since the Flip doesn't move them.
