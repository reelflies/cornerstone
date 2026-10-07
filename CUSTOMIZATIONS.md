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
| Icons | SVG partials in `templates/components/reelflies/icons/`. Don't add to `assets/icons/`, because that regenerates `assets/img/icon-sprite.svg`. |
| Hero widget template and schema (stored in BigCommerce) | `widgets/` |
| Web Page sources: the Policy, Help and Brand pages of one channel (stored in BigCommerce, written through `scripts/store/`; never bundled), and `newsletter.json`, the source of record for the CASL newsletter wording that tickets 24 and 50 copy and pin with a test | `content/pages/<channel>/` ([ticket 22](content/pages/1895766/README.md)) |
| Release, check and generator tooling (never bundled) | `scripts/` |
| Script Manager scripts (stored in BigCommerce, never bundled): each script's source, and the changes file `scripts/store-scripts/build.mjs` makes from it for the store-write helper (ticket 23) | `store-scripts/` |
| Research notes, checklists and their evidence, such as ticket 07's prelaunch probes and [the analytics, email and integrations checklist](research/23-analytics-and-integrations.md) (never bundled) | `research/` |
| Decisions | `docs/adr/` |
| Operator guides, such as [releasing](docs/releasing.md), [guardrails](docs/guardrails.md) and [store writes](docs/store-writes.md) | `docs/` |
| Claude Code permission rules: a draft until Shaun turns them on ([permissions](docs/permissions.md)) | `.claude/` |

- **New theme settings** go in the ReelFlies block of `schema.json`, `schemaTranslations.json` and the `settings` object in `config.json`, in your module's group (below).
- **ReelFlies defaults** may change the *values* of existing `config.json` settings, which is how Theme Styles defaults are set. The `variations` array belongs to ReelFlies.
- **New strings** go under the top-level `reelflies` key in `lang/en.json`, in your module's sub-object.

## Slots for parallel tickets

Ticket 25's scaffold gives each module its own lines in every shared file (`plan/build-pipeline.md`, section 6.1), so tickets built in parallel never edit the same lines, which git would merge as a conflict. Change only your own slot or group, keep the blank lines between them, and on a conflict keep both sides in ticket order.

| File | What each module gets | How a ticket fills it |
|---|---|---|
| `config.json` `settings` | One group per module in ticket order, a blank line between groups, in the ReelFlies block just before the last stock key (`paymentbuttons-provider-sorting`), so every ReelFlies line ends with a comma | Set your group's values (once the block is live, see [Changing a pre-declared value](#changing-a-pre-declared-value)); add a key that section 6.3 doesn't name at the end of your own group |
| `config.json` `variations` | Both variations declare `rf_menu_type_ids` and `rf_menu_species_root_id`, empty. ReelFlies US also sets `rf_ship_free_threshold` to `""` (ticket 39) | Set a variation's own value only where it differs from the base |
| `schema.json` | The ReelFlies group (`i18n.RfReelFlies`), just before the last stock group (`i18n.PaymentButtons`): one heading per settings module, in ticket order, and the two menu-id text settings under the menu heading | Add your settings right after your heading |
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
| 28 | `rf_menu_type_ids`, `rf_menu_species_root_id`, `rf_menu_exclude_ids` (all empty; the menu ids in both variations too) |
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
| `package.json` | `qa:lighthouse` script: runs `scripts/qa/lighthouse.mjs` | Ticket 17's Lighthouse budgets on six URLs (median of 3, mobile, the drop rule), which the host batch runs. It uses upstream's own `lighthouse` devDependency (12.8.1 in the lockfile) and `lighthouse-config.js`, both unchanged, so no dependency is added | 17 |
| `package.json` | `qa:matrix`, `qa:reflow`, `qa:motion`, `qa:focus` and `qa:links` scripts | Ticket 54a's runners in `scripts/qa/`: the switch matrix on W0-8's overlays, reflow at 320, reduced motion, the focus tab-through and the home widget link check ([scripts/qa/README.md](scripts/qa/README.md), "Switch matrix and the extra checks"). None runs in CI or in `qa:prepush` | 54 |
| `assets/js/app.js` | Line 4 imports `theme/reelflies/page-modules`; line 56's `customClasses` is spread from it (was `{}`) | ReelFlies modules load per page template, each its own chunk, never in main.js; several on one template through one composite importer (build pipeline 6.1) | 25 |
| `assets/js/theme/global.js` | Line 16 imports `reelflies/global`; line 31, the end of `onReady`, calls it with the page context | One place where the every-page ReelFlies modules (27, 28, 30, 52) start, after the stock globals | 25 |
| `templates/layout/base.html` | Line 51 includes `components/reelflies/js-settings` at the end of the inject block; line 54 includes `components/reelflies/body-start` right after `<body>`. Ticket 25's skin PR adds `lang="en-CA"` (line 2) and the fonts (line 29), and updates this row | js-settings: the `rf_*` values the theme's JavaScript reads, one slot per switch ticket. body-start: the ReelFlies icon sheet and the shared polite live region, once per page (O22, O24) | 25 |
| `templates/components/common/body.html` | A comment line, then the wrapper's first and last lines pick `<main>` on `pages/home`, `pages/product` and `pages/cart` (`inArray` on `template`), and keep the stock `<div>` on every other template | Those three templates have no `<main>`, and many others carry their own, so an unconditional one would duplicate it (O24; axe `landmark-one-main`, `landmark-no-duplicate-main`). The id and the `.container` inside stay, for the skip link and `product-details.js:582` | 25 |
| `assets/scss/theme.scss` | `@import "reelflies/settings"` after `settings/layouts/layouts` (line 48), and `@import "reelflies/index"` at the end | The ReelFlies style layer (ADR 0001) | 25 |
| `config.json` | `settings`: the ReelFlies block (above), inserted before the last stock key; both variations' `settings` declare the two menu ids, empty, and ReelFlies US sets `rf_ship_free_threshold` to `""`. No stock line changed | Every switch and value section 6.3 names, pre-declared at its owner's default, so parallel tickets each change their own group | 25 |
| `schema.json` | The ReelFlies group (above), inserted before the last stock group. No stock line changed | The menu ids in Theme Styles, and one heading per settings module for its owner to fill | 25 |
| `schemaTranslations.json` | The ReelFlies group's strings, inserted before the last stock key. No stock line changed | stencil-cli refuses a schema string without a translation | 25 |
| `lang/en.json` | The `reelflies` key (above), inserted before the last stock key. No stock line changed | One sub-object per module for its strings | 25 |

New ReelFlies files in upstream folders: `.github/workflows/reelflies-checks.yml`, `.github/workflows/reelflies-baseline-scope.yml` (W0-13), `.gitleaksignore`, `.gitattributes` at the repo root (W0-11: `RELEASES.md` merges as a union, so parallel log branches keep both sides' rows; upstream has no `.gitattributes`), and `RELEASES.md` at the repo root (the release log, written by `scripts/release.sh`, the Switch toggles log, the host batch's Host runs, and the My Themes log of each theme the prune deletes; tickets 05, 15 and 16, W0-3). `stencil bundle` zips only `README.md` and `CHANGELOG.md` from the root's Markdown files, so `RELEASES.md` never ships.

`meta/desktop_bold.png`, `mobile_bold.png`, `desktop_warm.png` and `mobile_warm.png` are now unused but still ship in every bundle (about 6 MB). Delete them, and point the variations at their own screenshots, once the skin has screenshots.

### Expected hooks (not made yet)

From the review's upgrade-safe layering plan and the design session ([ADR 0001](docs/adr/0001-scoped-theme-code.md) expects 25–30 files). Add a row above when each one lands.

- `templates/components/products/card.html` and `options/set-rectangle.html`
- `templates/components/products/product-view.html` and `templates/components/common/responsive-img.html`
- `templates/pages/category.html`
- `templates/components/search/quick-results.html` and `assets/js/theme/global/quick-search.js`
- `assets/js/theme/common/product-details.js` and `assets/js/theme/cart.js`
- `templates/components/common/navigation-menu.html` and `header.html`
- `templates/pages/errors/404.html`

Added by the design session (spec, "Hook count"), with the ticket that adds each:

- `templates/components/common/navigation.html` (27) and `navigation-list.html` (28, 29)
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
