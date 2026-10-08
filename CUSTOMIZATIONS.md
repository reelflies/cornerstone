# ReelFlies customisations

This repo is Cornerstone (`upstream`, bigcommerce/cornerstone) plus ReelFlies code. The rules come from [ADR 0001](docs/adr/0001-scoped-theme-code.md). This file is the register of every upstream file ReelFlies has changed. Update it in the same PR as the change.

## Where ReelFlies code goes

| What | Folder |
|---|---|
| JavaScript modules | `assets/js/theme/reelflies/`: per-template modules in `page-modules.js` (which `app.js` spreads into `customClasses`), every-page modules in `reelflies/global.js` (which `global.js` starts), each a dynamic import |
| Unit tests | `assets/js/test-unit/theme/reelflies/` |
| Template partials | `templates/components/reelflies/` |
| Custom page templates (for example the Species hub) | `templates/pages/custom/` |
| Styles | `assets/scss/reelflies/`: `_settings.scss` is imported after the settings in `theme.scss`, and `_index.scss` at the end of it |
| Fonts and images | `assets/fonts/` (Onest, self-hosted, with its licence `OFL.txt`) and `assets/img/reelflies/` (the default product, brand and share images) |
| Icons | SVG partials in `templates/components/reelflies/icons/`. Don't add to `assets/icons/`, because that regenerates `assets/img/icon-sprite.svg`. |
| Widgets API templates, schemas and per-channel files (stored in BigCommerce), synced by `scripts/widgets-sync.mjs` ([widgets](docs/widgets.md)) | `widgets/` |
| Web Page sources: the Policy, Help and Brand pages of one channel (stored in BigCommerce, written through `scripts/store/`; never bundled), and `newsletter.json`, the source of record for the CASL newsletter wording that tickets 24 and 50 copy and pin with a test | `content/pages/<channel>/` ([ticket 22](content/pages/1895766/README.md)) |
| Store settings changes files, which the store-write helper plans and applies: lifted writes on ReelFlies_CA, and Shaun's store-wide batch (ticket 21; never bundled) | `store-settings/1895766/`, `store-settings/store-wide/` |
| Store content kept as changes files for the store-write helper, such as a channel's SEO settings (ticket 46) | `content/settings/<channel>/` |
| Copy that waits for Shaun's approval, which is never a changes file, so the store-write routine can't publish it (ticket 46) | `content/drafts/<channel>/` |
| Release, check and generator tooling (never bundled) | `scripts/` |
| Script Manager scripts (stored in BigCommerce, never bundled): each script's source, and the changes file `scripts/store-scripts/build.mjs` makes from it for the store-write helper (ticket 23) | `store-scripts/` |
| Research notes, checklists and their evidence, such as ticket 07's prelaunch probes, [the store settings checklist](research/21-store-settings.md) and [the analytics, email and integrations checklist](research/23-analytics-and-integrations.md) (never bundled) | `research/` |
| Decisions | `docs/adr/` |
| Operator guides, such as [releasing](docs/releasing.md), [guardrails](docs/guardrails.md), [store writes](docs/store-writes.md), [catalogue jobs](docs/catalogue-jobs.md) and [widgets](docs/widgets.md) | `docs/` |
| Claude Code permission rules: a draft until Shaun turns them on ([permissions](docs/permissions.md)) | `.claude/` |

- **New theme settings** go in the ReelFlies block of `schema.json`, `schemaTranslations.json` and the `settings` object in `config.json`, in your module's group (below).
- **ReelFlies defaults** may change the *values* of existing `config.json` settings, which is how Theme Styles defaults are set. The `variations` array belongs to ReelFlies.
- **New strings** go under the top-level `reelflies` key in `lang/en.json`, in your module's sub-object.

## Slots for parallel tickets

Ticket 25's scaffold gives each module its own lines in every shared file (`plan/build-pipeline.md`, section 6.1), so tickets built in parallel never edit the same lines, which git would merge as a conflict. Change only your own slot or group, keep the blank lines between them, and on a conflict keep both sides in ticket order.

| File | What each module gets | How a ticket fills it |
|---|---|---|
| `config.json` `settings` | One group per module in ticket order, a blank line between groups, in the ReelFlies block just before the last stock key (`paymentbuttons-provider-sorting`), so every ReelFlies line ends with a comma | Set your group's values (once the block is live, see [Changing a pre-declared value](#changing-a-pre-declared-value)); add a key that section 6.3 doesn't name at the end of your own group |
| `config.json` `variations` | Every variation declares `rf_menu_type_ids` and `rf_menu_species_root_id`: empty in ReelFlies CA until wave R1 (tree 4), tree 2's Fly Type ids (Flies (447)'s children) in ReelFlies US for the .com preview (ticket 28, the build pipeline's decision 5), and tree 1's in ReelFlies CA channel 1 (ticket 53). They are strings: paper's `trim` reads a number as empty. ReelFlies US also sets `rf_ship_free_threshold` to `""` (ticket 39) | Set a variation's own value only where it differs from the base |
| `schema.json` | The ReelFlies group (`i18n.RfReelFlies`), just before the last stock group (`i18n.PaymentButtons`): one heading per settings module, in ticket order, and the two menu-id text settings under the menu heading (ticket 28 adds `rf_menu_exclude_ids` after them) | Add your settings right after your heading |
| `schemaTranslations.json` | The `i18n.Rf…` strings (`default` only), just before the last stock key, grouped by module | Add your strings at the end of your module's group |
| `lang/en.json` | The `reelflies` key, just before the last stock key (`consent_manager`): one sub-object per module, each opening with `"_slot": ""` | Add your strings inside your sub-object, after the placeholder |
| `assets/scss/reelflies/_index.scss` | One commented-out import per module, in ticket order, with its ticket number | Uncomment your line and add your partial beside it |
| `assets/js/theme/reelflies/page-modules.js` | One commented slot per module in each template's array (product, listing, cart, page); custom templates map to their base kind's array | Replace your slot line with your loader, `() => import(/* webpackChunkName: "rf-…" */ './…')` |
| `assets/js/theme/reelflies/global.js` | One slot each for 27, 28, 30 and 52 | Replace your slot line with a function of the page context |
| `templates/components/reelflies/js-settings.html` | One slot per switch ticket (27, 31, 39, 40, 42, 43, 52) | Replace your slot line with your `{{~inject 'rf…' theme_settings.rf_…}}` lines |
| `templates/components/reelflies/icons.html` | The icon sheet's include list, alphabetical | Add `icons/<name>.html` and one line in alphabetical order; draw it with `{{> components/reelflies/icon name='<name>'}}` |

The settings groups and their documented defaults (section 6.3). A pre-declared switch with no module behind it does nothing; the release guard lists it once as a new switch at the first push after the scaffold.

| Ticket | Keys (default) |
|---|---|
| 27 | `rf_rise` (true) |
| 28 | `rf_menu_type_ids`, `rf_menu_species_root_id`, `rf_menu_exclude_ids` (all empty; the menu ids in ReelFlies CA too until wave R1, tree 2's ids in ReelFlies US for the .com preview, decision 5, and tree 1's ids in ReelFlies CA channel 1, ticket 53). The grouped menu (`components/reelflies/menu.html`) renders when either menu id is set, and the stock navigation when both are empty. `rf_menu_exclude_ids` lists top-level category ids to leave out of "More from ReelFlies"; ticket 28 gave it its Theme Styles field, so it can be set live before `config.json` follows (below) |
| 31 | `rf_price_unit_exclude` (empty) |
| 39 | `rf_ship_free_threshold` ("60" in base for Canada, decision 2; `""` in ReelFlies US, because .com stays on its flat rate with no threshold, 39's owner decision), `rf_ship_standard_rate` and `rf_ship_expedited_from` (empty until Shaun gives the rates, decision 12) |
| 40 | `rf_store_same_as` (empty); 40 adds its other `rf_store_*` keys after it |
| 42 | `rf_cart_state` (true) |
| 43 | `rf_quick_add` (true) |
| 52 | `rf_region_prompt` (false) |

`scripts/qa/scaffold.test.mjs` holds these conventions, not the values (only the four switches must stay booleans), and runs the release guard and step 1's diff on the block (spec seam 5).

### Changing a pre-declared value

The release guard's rule 1 covers every `rf_*` key except the two menu ids, values as well as switches ([releasing](docs/releasing.md#the-release-guard)). So once ticket 25's push has put the block live on 1895766, a `config.json` change to any pre-declared key stops every release of `master` with "No flag overrides this", until the live value matches. That includes the value keys `rf_menu_exclude_ids`, `rf_price_unit_exclude`, `rf_ship_*` and `rf_store_same_as`, and a key you add yourself, from its own first push on.

- **Until the release lane gives values step 1's three-way rule,** as the menu ids have (asked for on PR #29; a todo test in `scaffold.test.mjs` holds the behaviour it should have):
  1. The value is set in Theme Styles on 1895766 first, and logged under "Switch toggles" in `RELEASES.md`. Agents have no route for that edit, so ask the orchestrator to put it in Shaun's batch.
  2. Then `config.json` changes to match. Don't merge that change before the live value matches: merged first, it stops the next release of `master` for every ticket. Until then, mark the criterion that needs the value waiting, with that trigger.
- **The switches** stay under rule 1 for good: toggle them in Theme Styles, log the toggle, then change `config.json` ([switch toggles](docs/releasing.md#switch-toggles)).

## Never

- Edit the folders `config.json` lists as `read_only_files`:
  - `assets/scss/settings/{citadel,foundation,normalize,vendor}`
  - `assets/scss/components/{citadel,foundation,vendor}`
  - `assets/scss/vendor`
- Edit or regenerate `assets/img/icon-sprite.svg`.
- Auto-format an upstream file (prettier, `eslint --fix`, `stylelint --fix`). Only the hook lines may change.
- Delete an upstream schema entry. Hide it instead, if a setting must not be used.
- Put a token or key in a theme setting. `templates/pages/account/add-payment-method.html:31` exposes all of them to the page's JavaScript.

## Upstream files changed

| File | Change | Why | Ticket |
|---|---|---|---|
| `.gitignore` | ReelFlies block appended at the end | Ignore Stencil CLI output and pulled live configs | 01 |
| `webpack.common.js` | `BundleAnalyzerPlugin` runs only when `ANALYZE` is set | Stop writing a ~423 KB `report.html` into `assets/dist` on every build | 01 |
| `package.json`, `package-lock.json` | `@bigcommerce/stencil-cli` 9.1.0 as an exact devDependency | Pin the CLI; 9.2 and later need Node 24, and `.nvmrc` pins 20.18.1 | 01 |
| `package.json` | `test:scripts` script: runs `scripts/test-scripts.mjs` | Unit tests for the release and QA tooling run with `node --test`, in CI too | 05, 15, 16 |
| `jest.config.js` | `testPathIgnorePatterns` ignores `scripts/` (plus Jest's default `/node_modules/`) | Jest 30's default `testMatch` also matches `*.test.mjs` and `*.spec.mjs`, so it tried to run the `node --test` and Playwright files under `scripts/` and failed to parse them | 15 |
| `.github/workflows/pull_request_review.yml` | Deleted | Replaced by `reelflies-checks.yml`; it installed an unpinned stencil-cli | 06 |
| `.github/CODEOWNERS` | Deleted | It named `@bigcommerce/team-trac` | 06 |
| `config.json` | `variations`: Light, Bold and Warm replaced by "ReelFlies CA" and "ReelFlies US", both with empty settings for now and Light's screenshots as placeholders | One thin variation per storefront, so releases push and activate by name; shared values stay in `settings` | 04 |
| `config.json` | `name`: "Cornerstone" becomes "ReelFlies"; `version` still tracks the Cornerstone release (6.22.0) | My Themes already holds the Marketplace "Cornerstone"; a second theme of the same name would be easy to pick by mistake. The version follows upstream, so upgrades merge without a conflict on that line | 05 |
| `assets/js/theme/global.js` | Lines 12 and 26: imports and starts `reelflies/lazy-quick-view` instead of `global/quick-view` | Quick view, ProductDetails and reviews load on the first Quick view click, as `theme-bundle.chunk.quick-view.js` plus three chunks shared with the page classes (about 64 KB raw and 21 KB gzip in all). That takes main.js from 307,607 B to under the 300 KiB limit | 16 |
| `package.json`, `package-lock.json` | `@playwright/test` 1.59.1 and `@axe-core/playwright` 4.10.2 as exact devDependencies; `qa:axe`, `qa:screens`, `qa:quick-view`, `qa:raw-html` and `qa:prepush` scripts | The storefront gates in `scripts/qa/`. Playwright 1.59.1 uses Chromium build 1217; `@axe-core/playwright` 4.10.2 uses the axe-core 4.10.3 already in the lockfile, the same engine as Lighthouse's audit | 16 |
| `package.json` | `qa:prelaunch` script: runs `scripts/qa/prelaunch.mjs` | The host batch: the storefront gates against the prelaunch host once per checkpoint, with the analytics tags blocked and the results filed by theme uuid (W0-6) | 16 |
| `package.json` | `qa:lighthouse` script: runs `scripts/qa/lighthouse.mjs` | Ticket 17's Lighthouse budgets on six URLs (median of 3, mobile, the drop rule), which the host batch and `release.sh`'s step 6b run. It uses upstream's own `lighthouse` devDependency (12.8.1 in the lockfile) and `lighthouse-config.js`, both unchanged, so no dependency is added | 17 |
| `package.json` | `widgets:sync` script: runs `scripts/widgets-sync.mjs` | The widget sync: home content as code, synced to one channel at a time through the store-write helper ([widgets](docs/widgets.md)) | 46 |
| `config.json` | `homepage_show_carousel`: `true` becomes `false` in the base settings | The hero widget (`widgets/home-lead`) is the home page's lead, so the stock carousel never renders under it (O21); every variation inherits it, and the `home-no-carousel` raw-HTML check holds it | 46 |
| `package.json` | `qa:matrix`, `qa:reflow`, `qa:motion`, `qa:focus` and `qa:links` scripts | Ticket 54a's runners in `scripts/qa/`: the switch matrix on W0-8's overlays, reflow at 320, reduced motion, the focus tab-through and the home widget link check ([scripts/qa/README.md](scripts/qa/README.md), "Switch matrix and the extra checks"). None runs in CI or in `qa:prepush` | 54 |
| `assets/js/app.js` | Line 4 imports `theme/reelflies/page-modules`; line 56's `customClasses` is spread from it (was `{}`) | ReelFlies modules load per page template, each its own chunk, never in main.js; several on one template through one composite importer (build pipeline 6.1) | 25 |
| `assets/js/theme/global.js` | Line 16 imports `reelflies/global`; line 31, the end of `onReady`, calls it with the page context | One place where the every-page ReelFlies modules (27, 28, 30, 52) start, after the stock globals | 25 |
| `templates/layout/base.html` | Line 2: `lang="en-CA"` (stock printed the store's `locale_name`). Line 29: `getFontsCollection` with `font-display='swap'` (stock `block`). Line 31: `theme-bundle.font.js` replaced by an include of `components/reelflies/head`. Line 51 includes `components/reelflies/js-settings` at the end of the inject block; line 54 includes `components/reelflies/body-start` right after `<body>` | lang: Canadian English on every page (spec module 25). Fonts: Onest is self-hosted and named `Onest_400` and `Onest_600`, with no `Google_` prefix, so `getFontsCollection` finds no Google font and renders nothing, and `font.js`, which reads its Google Fonts link and throws without one, has nothing to do (a Google font picked in Theme Styles still loads, with swap). head: Onest's preload, the en-CA content language and the default share image. js-settings: the `rf_*` values the theme's JavaScript reads, one slot per switch ticket. body-start: the ReelFlies icon sheet and the shared polite live region, once per page (O22, O24) | 25 |
| `templates/components/common/body.html` | A comment line that also sets `rf_main_templates` (`assignVar`), then the wrapper's first and last lines pick `<main>` on those templates (`inArray` on `template`) and keep the stock `<div>` on every other: home, product and cart, then the 23 other base-layout templates with no `<main>` of their own (the account pages, sign-in, create account, forgotten and new password, blog post, sitemap, subscribed, unsubscribe and hibernation) | Those templates have no `<main>`, and the rest carry their own, so an unconditional one would duplicate it (O24; axe `landmark-one-main`, `landmark-no-duplicate-main`). The id and the `.container` inside stay, for the skip link and `product-details.js:582`. `render/partials/body.test.mjs` lists the templates from `templates/pages/` itself, so a template that loses or gains a `<main>` upstream fails the test | 25 |
| `assets/scss/theme.scss` | `@import "reelflies/settings"` after `settings/layouts/layouts` (line 48), and `@import "reelflies/index"` at the end | The ReelFlies style layer (ADR 0001) | 25 |
| `config.json` | `settings`: the ReelFlies block (above), inserted before the last stock key; both variations' `settings` declare the two menu ids, empty, and ReelFlies US sets `rf_ship_free_threshold` to `""`. No stock line changed | Every switch and value section 6.3 names, pre-declared at its owner's default, so parallel tickets each change their own group | 25 |
| `schema.json` | The ReelFlies group (above), inserted before the last stock group. No stock line changed | The menu ids in Theme Styles, and one heading per settings module for its owner to fill | 25 |
| `schemaTranslations.json` | The ReelFlies group's strings, inserted before the last stock key. No stock line changed | stencil-cli refuses a schema string without a translation | 25 |
| `lang/en.json` | The `reelflies` key (above), inserted before the last stock key. No stock line changed | One sub-object per module for its strings | 25 |
| `assets/scss/optimized-checkout.scss` | One line after the disclaimer: `@import "reelflies/fonts"` | The checkout's font keys are Onest too (`Onest_600`, `Onest_400`, `Onest_500`), and the checkout reads only this stylesheet, so it needs the `@font-face` that loads Onest from theme assets | 25 |
| `templates/components/common/forms/text.html`, `select.html`, `selectortext.html` | One line in the input or select tag: `{{> components/reelflies/autocomplete}}` | The autocomplete token for each store form field, by its `private_id` (WCAG 1.3.5 and 3.3.8; accessibility item 9). These partials build the create-account, account and address-book forms | 25 |
| `templates/components/common/forms/password.html` | `autocomplete="off"` becomes `{{> components/reelflies/autocomplete otherwise='off'}}` | `new-password` on the password and confirmation fields, `current-password` on the account page's current password; any other password field keeps `off` | 25 |
| `templates/pages/auth/login.html` | The two inputs: `autocomplete="email"` on the email (stock had none), `current-password` on the password (stock `off`) | The sign-in form's autocomplete tokens (WCAG 1.3.5) | 25 |
| `config.json` | `settings` values only, no key added or removed: the palette (96 colour keys; spec, "Look"), `body-font` and `headings-font` `Onest_400` and `Onest_600`, the seven `optimizedCheckout-*-font` keys Onest, `optimizedCheckout-formField-placeholderColor`, `fontSize-root` 16, `shop_by_price_visibility` false, and `default_image_product` and `default_image_brand` pointing at `img/reelflies/` | The ReelFlies look as Theme Styles defaults, shared by both variations (O01, story 77). A theme push carries them through the release's three-way diff (W0-2), with no `--overwrite-live` | 25 |
| `schema.json` | Three options inserted at the start of each of the nine font pickers (`body-font`, `headings-font` and the seven `optimizedCheckout-*-font`): Onest, Onest Medium and Onest SemiBold, `Onest_400` to `Onest_600`. No stock line changed | Theme Styles shows the self-hosted Onest the settings now name | 25 |
| `schemaTranslations.json` | `i18n.RfOnest`, `i18n.RfOnestMedium` and `i18n.RfOnestSemiBold`, in the ReelFlies group right after `i18n.RfReelFlies` | Their labels | 25 |
| `lang/en.json` | Canadian terms in 12 stock keys: `cart.shipping_estimator.select_a_state` "Province/territory", `.suburb_city` "City", `.zip_postal_code` "Postal code", `.empty_province_error`; `account.payment_methods.billing_address_labels.suburb_city` "City", `.state_province` "Province/Territory", `.choose_state` "Choose a Province or Territory", `.zip_postcode` "Postal Code"; `forms.payment_methods.city` "City", `.state` "Province/Territory", `.postal_code` "Postal Code"; `errors.state_error` "…provinces and territories" | Canadian spelling and terms in shopper-facing strings (spec module 25). The rest of the file already used them, or uses -ize spellings Canadian English shares. An upstream merge that changes one of these keys re-applies the wording here. The store's own address field labels (Suburb/City, State/Province, Zip/Postcode) are store settings, not theme strings | 25 |
| `config.json` | `settings` values only, no key added or removed: 37 `optimizedCheckout-*` colour keys, so the checkout button is the buy colour #5D705C with a white label (#4F5F4E hover, #435242 active), the text ink #212721 and dun #5A645A, the field and Edit-button borders edge #879186, the dividers #E3E8E2 and the chosen rows tile #F1F3F0, the focus colour the #23272B ring, links ink with dun on hover, and errors #B42318. Not changed: the logo, where `optimizedCheckout-show-logo` stays `none`, so the checkout shows the channel's store logo, the 133x95 PNG, until ticket 14's master (decision 17); and, waiting for Shaun's answers, the checkout background (the header colour, the page colour and the image), the `show_accept_*` icons, `show_quick_payment_buttons` and the `paymentbuttons-*` wallet buttons | Optimized One-Page Checkout is branded through these settings only (spec, Out of Scope), and stock Cornerstone's are greys and blues off the palette (decision 6; O01, story 77). Each key follows the storefront key it matches, which `scripts/qa/checkout-settings.test.mjs` holds; `check-contrast.mjs` checks 16 more checkout pairs. The cart's coupon, gift certificate and shipping estimate links read `optimizedCheckout-link-color` too (`_cart.scss`), so they turn ink. A push carries the values through the three-way diff (W0-2) | 24 |
| `config.json` | `variations`: a third, "ReelFlies CA channel 1" (decision 10's interim name), after the other two so their positions, which `stencil start` names them by, stay. Its `settings` hold only tree 1's menu ids: `rf_menu_type_ids` "298,251,255,272,438" (Dry Flies, Nymphs & Sub Surface Flies, Streamers & Buggers, Saltwater, Warmwater & Salmon, and Realistic Trout Flies, one level under Flies) and `rf_menu_species_root_id` empty, because tree 1 has no Species root. Light's screenshots as placeholders, like the others. No stock line changed | Channel 1 (live reelflies.ca) runs tree 1 until the Flip, so under Option A it needs its own menu ids (ticket 53; BUILD-2). Only ticket 53's guarded channel-1 target takes the variation, typed by Shaun at his own terminal and never by an agent ([releasing](docs/releasing.md#channel-1-live-reelfliesca-the-guarded-target)): ticket 56 pushes it after Shaun approves it and its ids. Channel-1 gate runs render it, into `scripts/qa/baselines/1-reelflies-ca-channel-1/` (`scripts/qa/channel-1-variation.test.mjs`) | 53 |
| `templates/components/common/header.html` | Lines 13–33, the stock `<header>` (the "Toggle menu" link, the `navigation.html` include, the logo as an `<h1>` on the home page, `#menu` with `navigation-menu.html`, `header_navigation_bottom--global`) and the `header_bottom--global` region, become one include of `components/reelflies/header`. The skip link, the top banners and the `header_bottom` region stay | The one-row header (spec modules 2 and 4; O04, O05): the logo a link in a `<div>` on every page, so each page has one `<h1>` (story 68); Menu a real `<button>` for stock `mobile-menu-toggle.js`, reading Menu or Close; "Shop flies", the search form, Account (and Sign out when signed in, stock's `navigation.html:77`) and Cart, with no Compare, Gift Certificates or Saved; the rise ring behind `rf_rise`; and `header_bottom--global` after `</header>` inside a labelled region landmark, where the shipping strip widget sits. `#menu` and the stock `navigation-menu.html` stay inside the header for the phone drawer and the desktop panel until ticket 28 (since ticket 28, only while both menu ids are empty; with either set, `#menu` holds the grouped menu, with no `data-menu`), so the phone drawer still shows the stock quick-search form ("Search the store", which stock `quick-search.js` still binds to), the currency row ("Currency: CAD"), Gift Certificates, and sign in or register, or Sign out (`.navPages-list--user`, hidden from 801px). `navigation.html` is no longer included, so it needs no hook (ticket 26's finding 5); what it held leaves the desktop row (its quick-search dropdown, Compare, Gift Certificates, sign in and register, store credit, and the currency, language and channel selectors), and `cart-preview.js`'s preview dropdown, which bound to it, finds nothing and does nothing; `header.spec.mjs` checks that no stock script throws | 27 |

New ReelFlies files in upstream folders: `.github/workflows/reelflies-checks.yml`, `.github/workflows/reelflies-baseline-scope.yml` (W0-13), `.gitleaksignore`, `.gitattributes` at the repo root (W0-11: `RELEASES.md` merges as a union, so parallel log branches keep both sides' rows; upstream has no `.gitattributes`), and `RELEASES.md` at the repo root (the release log, written by `scripts/release.sh`, the Switch toggles log, the host batch's Host runs, and the My Themes log of each theme the prune deletes; tickets 05, 15 and 16, W0-3). `stencil bundle` zips only `README.md` and `CHANGELOG.md` from the root's Markdown files, so `RELEASES.md` never ships.

`meta/desktop_bold.png`, `mobile_bold.png`, `desktop_warm.png` and `mobile_warm.png` are now unused but still ship in every bundle (about 6 MB). Delete them, and point the variations at their own screenshots, once the skin has screenshots.

### Expected hooks (not made yet)

From the review's upgrade-safe layering plan and the design session ([ADR 0001](docs/adr/0001-scoped-theme-code.md) expects 25–30 files). Add a row above when each one lands.

- `templates/components/products/card.html` and `options/set-rectangle.html`
- `templates/components/products/product-view.html` and `templates/components/common/responsive-img.html`
- `templates/pages/category.html`
- `assets/js/theme/common/product-details.js` and `assets/js/theme/cart.js`
- `templates/pages/errors/404.html`

Added by the design session (spec, "Hook count"), with the ticket that adds each:

- Ticket 27 needed no hook in `navigation.html`: its header no longer includes it. Ticket 28 needed none in `navigation-menu.html` or `navigation-list.html`: ticket 27's `components/reelflies/header.html` renders the grouped menu (`components/reelflies/menu.html`) in `#menu` when a menu id is set, and includes the stock `navigation-menu.html`, unchanged, when both are empty (the fallback). Ticket 29 builds on the grouped menu, so it shouldn't need them either.
- Ticket 30 needed no hook in `templates/components/common/quick-search.html`, `components/search/quick-results.html` or `assets/js/theme/global/quick-search.js`, which the review expected: ticket 27's header carries the ReelFlies search form (`components/reelflies/search-form.html`), which stock `quick-search.js` doesn't bind, and quick search renders its own `components/reelflies/quick-results.html` through the search API. The stock three stay for the stock navigation's form (`nav-menu-quick-search`), which renders only in ticket 28's fallback, when both menu ids are empty.
- `templates/components/category/sidebar.html` (32) and `faceted-search/facets/multi.html` (33)
- `templates/components/products/description-tabs.html` and `tabs.html` (39)
- `templates/pages/cart.html`, `templates/components/cart/totals.html` and `cart/status-messages.html` (41)
- `templates/components/common/footer.html` (50)
- `templates/components/products/schema.html` (40)

## Upgrading to a new Cornerstone release

1. `git fetch upstream --tags`, then fast-forward `vendor/cornerstone` to the new tag and push it.
2. Branch `upgrade/<tag>` from `master` and merge `vendor/cornerstone` into it.
3. Resolve conflicts. They should only be at the files listed above.
   - For `package-lock.json`, take upstream's version and re-run `npm install --save-dev --save-exact @bigcommerce/stencil-cli@9.1.0`, then `npm install --save-dev --save-exact @playwright/test@1.59.1 @axe-core/playwright@4.10.2`.
   - If upstream has moved `.nvmrc`, check that the pinned stencil-cli still supports that Node version.
4. Open a PR. CI runs the checks.
5. Run `npm run qa:screens`, which starts `npx stencil start -c 1895766` (ReelFlies_CA) itself, and `QA_CHANNEL=1 npm run qa:screens` for the product and category pages until ReelFlies_CA has them. A failed diff shows what the merge changed: fix it, or update the baseline only for a change you meant ([scripts/qa/README.md](scripts/qa/README.md)).
6. Merge to `master`.
