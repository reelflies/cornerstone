# ReelFlies customisations

This repo is Cornerstone (`upstream`, bigcommerce/cornerstone) plus ReelFlies code. The rules come from [ADR 0001](docs/adr/0001-scoped-theme-code.md). This file is the register of every upstream file ReelFlies has changed. Update it in the same PR as the change.

## Where ReelFlies code goes

| What | Folder |
|---|---|
| JavaScript modules | `assets/js/theme/reelflies/`, registered through `app.js` `customClasses` or a dynamic import |
| Unit tests | `assets/js/test-unit/theme/reelflies/` |
| Template partials | `templates/components/reelflies/` |
| Custom page templates (for example the Species hub) | `templates/pages/custom/` |
| Styles | `assets/scss/reelflies/`: `_settings.scss` is imported after the settings in `theme.scss`, and `_index.scss` at the end of it |
| Icons | SVG partials in `templates/components/reelflies/icons/`. Don't add to `assets/icons/`, because that regenerates `assets/img/icon-sprite.svg`. |
| Hero widget template and schema (stored in BigCommerce) | `widgets/` |
| Release, check and generator tooling (never bundled) | `scripts/` |
| Research notes and their evidence, such as ticket 07's prelaunch probes (never bundled) | `research/` |
| Decisions | `docs/adr/` |
| Operator guides, such as [releasing](docs/releasing.md), [guardrails](docs/guardrails.md), [store writes](docs/store-writes.md) and [catalogue jobs](docs/catalogue-jobs.md) | `docs/` |
| Claude Code permission rules: a draft until Shaun turns them on ([permissions](docs/permissions.md)) | `.claude/` |

- **New theme settings** go in one block at the end of `schema.json`, `schemaTranslations.json` and the `settings` object in `config.json`.
- **ReelFlies defaults** may change the *values* of existing `config.json` settings, which is how Theme Styles defaults are set. The `variations` array belongs to ReelFlies.
- **New strings** go under a top-level `reelflies` key in `lang/en.json`.

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
| `assets/js/theme/global.js` | Lines 12 and 25: imports and starts `reelflies/lazy-quick-view` instead of `global/quick-view` | Quick view, ProductDetails and reviews load on the first Quick view click, as `theme-bundle.chunk.quick-view.js` plus three chunks shared with the page classes (about 64 KB raw and 21 KB gzip in all). That takes main.js from 307,607 B to under the 300 KiB limit | 16 |
| `package.json`, `package-lock.json` | `@playwright/test` 1.59.1 and `@axe-core/playwright` 4.10.2 as exact devDependencies; `qa:axe`, `qa:screens`, `qa:quick-view`, `qa:raw-html` and `qa:prepush` scripts | The storefront gates in `scripts/qa/`. Playwright 1.59.1 uses Chromium build 1217; `@axe-core/playwright` 4.10.2 uses the axe-core 4.10.3 already in the lockfile, the same engine as Lighthouse's audit | 16 |
| `package.json` | `qa:prelaunch` script: runs `scripts/qa/prelaunch.mjs` | The host batch: the storefront gates against the prelaunch host once per checkpoint, with the analytics tags blocked and the results filed by theme uuid (W0-6) | 16 |

New ReelFlies files in upstream folders: `.github/workflows/reelflies-checks.yml`, `.github/workflows/reelflies-baseline-scope.yml` (W0-13), `.gitleaksignore`, `.gitattributes` at the repo root (W0-11: `RELEASES.md` merges as a union, so parallel log branches keep both sides' rows; upstream has no `.gitattributes`), and `RELEASES.md` at the repo root (the release log, written by `scripts/release.sh`, the Switch toggles log, the host batch's Host runs, and the My Themes log of each theme the prune deletes; tickets 05, 15 and 16, W0-3). `stencil bundle` zips only `README.md` and `CHANGELOG.md` from the root's Markdown files, so `RELEASES.md` never ships.

`meta/desktop_bold.png`, `mobile_bold.png`, `desktop_warm.png` and `mobile_warm.png` are now unused but still ship in every bundle (about 6 MB). Delete them, and point the variations at their own screenshots, once the skin has screenshots.

### Expected hooks (not made yet)

From the review's upgrade-safe layering plan and the design session ([ADR 0001](docs/adr/0001-scoped-theme-code.md) expects 25–30 files). Add a row above when each one lands.

- `assets/scss/theme.scss`: two imports, `reelflies/settings` after line 47 and `reelflies/index` at the end (line 79)
- `assets/js/app.js`: `customClasses` registrations
- `templates/components/products/card.html` and `options/set-rectangle.html`
- `templates/components/products/product-view.html` and `templates/components/common/responsive-img.html`
- `templates/pages/category.html`
- `templates/components/search/quick-results.html` and `assets/js/theme/global/quick-search.js`
- `templates/layout/base.html`
- `assets/js/theme/common/product-details.js` and `assets/js/theme/cart.js`
- `templates/components/common/navigation-menu.html` and `header.html`
- `templates/pages/errors/404.html`
- `config.json`, `schema.json`, `schemaTranslations.json` and `lang/en.json`: the blocks described above

Added by the design session (spec, "Hook count"), with the ticket that adds each:

- `templates/components/common/navigation.html` (27) and `navigation-list.html` (28, 29)
- `templates/components/category/sidebar.html` (32) and `faceted-search/facets/multi.html` (33)
- `templates/components/products/description-tabs.html` and `tabs.html` (39)
- `templates/pages/cart.html`, `templates/components/cart/totals.html` and `cart/status-messages.html` (41)
- `templates/components/common/footer.html` (50)
- `templates/components/products/schema.html` (40)
- `templates/layout/base.html`: `lang="en-CA"`, `<main>`, the shared live region and fonts (25)

## Upgrading to a new Cornerstone release

1. `git fetch upstream --tags`, then fast-forward `vendor/cornerstone` to the new tag and push it.
2. Branch `upgrade/<tag>` from `master` and merge `vendor/cornerstone` into it.
3. Resolve conflicts. They should only be at the files listed above.
   - For `package-lock.json`, take upstream's version and re-run `npm install --save-dev --save-exact @bigcommerce/stencil-cli@9.1.0`, then `npm install --save-dev --save-exact @playwright/test@1.59.1 @axe-core/playwright@4.10.2`.
   - If upstream has moved `.nvmrc`, check that the pinned stencil-cli still supports that Node version.
4. Open a PR. CI runs the checks.
5. Run `npm run qa:screens`, which starts `npx stencil start -c 1895766` (ReelFlies_CA) itself, and `QA_CHANNEL=1 npm run qa:screens` for the product and category pages until ReelFlies_CA has them. A failed diff shows what the merge changed: fix it, or update the baseline only for a change you meant ([scripts/qa/README.md](scripts/qa/README.md)).
6. Merge to `master`.
