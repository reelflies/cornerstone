# Storefront quality gates

The checks every theme change is held to (ticket 16; spec "Testing Decisions", seams 1 to 3). Lighthouse is ticket 17's and joins this folder.

| Gate | Command | Runs in CI | Runs before each push |
|---|---|---|---|
| Bundle limits | `node scripts/check-bundle.mjs <bundle.zip>` | yes | yes (release.sh) |
| Unit tests for this tooling | `npm run test:scripts` | yes | yes (release.sh) |
| axe | `npm run qa:axe` | no | not yet: `release.sh` doesn't run `qa:prepush` (below) |
| Raw HTML (curl) | `npm run qa:raw-html` | no | not yet: `release.sh` doesn't run `qa:prepush` (below) |
| Screenshot diffs | `npm run qa:screens` | no | no: after each upstream merge, and in each template ticket |
| Quick view | `npm run qa:quick-view` | no | no |

CI has no store credentials, so anything that renders the storefront runs locally or from `release.sh`. `npm run qa:prepush` runs axe and then the raw-HTML check, runs both even when the first fails, and exits non-zero if either failed.

**Not wired yet.** Ticket 05's `release.sh` (branch `release/script`) doesn't call `qa:prepush`, so axe and the raw-HTML check don't stop a release yet. Until it does, run `npm run qa:prepush` by hand before a release. The line goes in step 4 of `release.sh`, after `node scripts/check-bundle.mjs "$zip"` and before the dry-run exit and `release pre-push`:

```sh
npm run qa:prepush   # set -e stops the release on any serious or critical axe issue or failed raw-HTML check
```

It must come after the bundle check, for the reason in "Fresh start" below.

## Setup

- `npm ci`, then `npx stencil init` once (the token stays in `secrets.stencil.json`).
- Playwright is pinned at 1.59.1, which uses Chromium build 1217. If it isn't in `~/Library/Caches/ms-playwright`, run `npx playwright install chromium`.

## The storefront the gates test

| Variable | Default | Meaning |
|---|---|---|
| `QA_CHANNEL` | `1895766` | Channel to render (ReelFlies_CA) |
| `QA_VARIATION` | `ReelFlies CA` | Theme variation; it must exist in `config.json` |
| `QA_BASE_URL` | none | Test this host (for example the prelaunch host) instead of a local `stencil start` |
| `QA_PREVIEW_COOKIE` | none | Cookie for the prelaunch host, as `name=value; name2=value2`. It goes only to `QA_BASE_URL` and is never printed. A run that sends it keeps no Playwright traces, because a trace records every request's Cookie header. |

Without `QA_BASE_URL`, each gate uses `npx stencil start -c $QA_CHANNEL -v "$QA_VARIATION" -p 3300` (`scripts/qa/storefront.mjs`):

- **Ports.** Browsersync takes 3300 and the stencil server 3301. The gates talk to 3301, so Browsersync's injected script, its overlay and its websocket stay out of the results.
- **Reuse.** A server already on 3301 is reused, but only if it renders `QA_CHANNEL` (read from `?debug=context`). Otherwise the run stops, so one channel's screenshots can never be compared with, or written as, another's.
- **Fresh start.** A fresh server starts from an empty `assets/dist` and is ready once its webpack dev build is served. The gates stop the server again when they finish.
  - **The dev build stays in `assets/dist`.** That is about 2 MB of scripts with their sources inlined as source maps, and upstream's clean step never removes them. `stencil bundle` zips all of `assets/`, and so does `stencil push` without `-f`, which bundles again.
  - **So after a gate run, run `rm -rf assets/dist` before you bundle or push by hand.** `check-bundle.mjs` fails a zip that ships dev-build scripts.
  - **`release.sh` pushes exactly the zip it checked** (`stencil push -f <zip>`), so gates run after `check-bundle.mjs` can't change what ships. Keep both true when wiring in `qa:prepush`.

**The channel-1 fallback.** ReelFlies_CA has no products and no tree-4 categories yet, so its product and category pages 404. Until they exist, `QA_CHANNEL=1` renders this repo's templates with live reelflies.ca data. It is read-only: stencil start only reads from the store. Channel 1 has only a product page and a category page pinned.

## Pinned pages and live data

`scripts/qa/pages.mjs` is the one place that says which page each gate visits, per channel:

- **Page keys** are the spec's template names: `home`, `fly-type`, `species`, `species-hub`, `product`, `cart`, `hook-chart`, `404` and `brand`, plus `category` for the stock category template until ticket 32.
- **Test products are pinned** by URL. Pick ones that will stay in the catalogue.
- **`LIVE_DATA`** lists the selectors that screenshots mask: prices, stock and SKU lines, ratings, cart counts and totals, product grids and carousels, pagination, marketing banners and widgets. Masking them means a price or catalogue change doesn't fail a diff.

When a page is added for a channel, axe and the screenshots cover it on the next run. The raw-HTML check fetches the `RAW_HTML_PAGES` kinds: home, product and category.

## Bundle limits (`scripts/check-bundle.mjs`)

- **main.js:** `theme-bundle.main.js` fails above 307,200 B (300 KiB) raw. It was 307,607 B in stock 6.22. Ticket 16 moved Quick view, with ProductDetails and reviews, out of main.js. It loads on the first Quick view click as `theme-bundle.chunk.quick-view.js` (1,420 B) plus three chunks it shares with the page classes (311, 668 and 354). Together they are 64,303 B raw and 20,832 B gzip (2026-10-05 build). A page that has already loaded a shared chunk fetches less.
- **ReelFlies chunks:** each fails above its gzip limit, and only once it is built. A module gets its chunk name from the comment in its dynamic import. webpack names the file `theme-bundle.chunk.<name>.js`.
  - **The limit covers everything the import loads.** webpack's splitChunks moves code an import shares with other chunks into numbered chunks, and the same first use fetches them. The check finds each `import()` of the chunk in the build, adds the gzip size of the named file and of every chunk loaded with it, and reports each file's share.
  - A shared chunk the page may have loaded already still counts, so the figure can be high but never low. When two imports load the chunk differently, the larger total counts.
  - A built chunk that no import in the build loads fails, because its cost can't be measured.

  ```js
  import(/* webpackChunkName: "rf-menu" */ './reelflies/menu')
  ```

  | Chunk name | What | Ticket | gzip limit |
  |---|---|---|---|
  | `rf-menu` | grouped menu and phone drawer | 28 (measured in 29) | 8,000 B |
  | `rf-quick-add` | quick add on cards | 43 (measured in 45) | 15,000 B |
  | `rf-region-prompt` | outside-Canada prompt | 52 | 1,000 B |

  KB is read conservatively as 1,000 B. A new ReelFlies chunk with a budget adds a line to `CHUNK_GZIP_LIMITS`, and a test to `check-bundle.test.mjs`.
- **The ReelFlies CSS layer:** reported against the design's estimate of about 12,000 B, warning only, until ticket 26's spike sets a real figure.
  - It is measured by compiling `theme.scss` with stencil-cli's own compiler twice: as it is, and without its `@import "reelflies/..."` lines.
  - Until ticket 25 adds those imports, it reports that there is no layer yet.
- **The zip's contents:** it fails on the bundle analyser's `report.html`, on a secrets file, and on any `assets/dist` script with an inline source map, which only a dev build (such as the one a QA gate's `stencil start` leaves) has.
- **Usage:** `node scripts/check-bundle.mjs <bundle.zip> [--dist <dir>]`. `--dist` defaults to `assets/dist`.

## axe (`axe.spec.mjs`)

Every pinned page, at 375 and 1280, runs with the tags WCAG 2.0–2.2 A and AA plus best practices. Any serious or critical issue fails the run.

**The allowlist** is `axe-known-issues.mjs`, which mirrors `KNOWN_FAILURES` in `check-contrast.mjs`:

- Each entry names the axe rule, the templates it's allowed on, the ticket that fixes it, and why.
- A known issue is reported as an annotation and doesn't fail the run.
- A listed issue that no longer occurs is reported as fixed, so the entry can be removed.
- **The list is empty.** The stock templates had no serious or critical issues on ReelFlies_CA (home, cart, 404, brand) or on the channel-1 product and category pages on 2026-10-05.
- The moderate issues found (no `<main>` landmark, content outside landmarks, heading order, duplicate landmarks) are ticket 25's.

## Screenshots (`screens.spec.mjs`)

**Baselines:** `scripts/qa/baselines/<channel>-<variation>/<template>-<project>-<platform>.png`. For example, `baselines/1895766-reelflies-ca/home-phone-375-darwin.png`.

- The projects are `phone-375` and `desktop-1280`.
- The platform suffix keeps a Mac's font rendering from being compared with Linux's. Baselines are made and checked on the Mac that runs `release.sh`.

**How a run works:**

1. Each page scrolls once so lazy images load.
2. The store's cookie banner is dismissed ("Reject all"), because it is fixed to the viewport and would cover the template.
3. A full-page screenshot is compared with the baseline, with `LIVE_DATA` masked.

**The threshold** is in `playwright.config.mjs`. A pixel counts as changed when its colour moves more than 0.2 (Playwright's `threshold`). A run fails when more than 0.2% of the pixels change (`maxDiffPixelRatio`).

**The self-test** (`screens-selftest.spec.mjs`) runs with every `qa:screens`, with the same settings, on a fixed page of coloured blocks. It proves three things:

- An unchanged page passes.
- A 200 × 100 px change fails.
- A 10 × 10 px change passes.

**Updating baselines:** run `npm run qa:screens -- --update-snapshots`. Then look at every changed PNG before committing it. A diff is the point of the gate: update a baseline only for a change you meant.

**When a template ticket lands:**

1. Pin its page in `pages.mjs` under each channel where it renders.
2. Run `npm run qa:screens -- --update-snapshots` (and `QA_CHANNEL=1` if it needs the fallback).
3. Review the new PNGs and commit them with the template.
4. If the page shows new live data, add its selector to `LIVE_DATA`.

**Per variation:** run with `QA_VARIATION="ReelFlies US"` to make or check that variation's set. Only the ReelFlies CA sets exist today. Both variations still have empty settings, so a US set would be identical.

**After an upstream merge**, run `npm run qa:screens` and `QA_CHANNEL=1 npm run qa:screens`, as in CUSTOMIZATIONS.md, "Upgrading".

## Raw HTML (`raw-html.mjs`)

This is spec seam 2: what a crawler gets, with no JavaScript.

- It fetches the pinned home, product and category pages with `Accept-Language: en-CA`; stencil start's renderer fails without it.
- It runs every registered assertion on each page.
- A page that doesn't return 200 fails.
- A page kind with no pinned page is reported as a warning and isn't checked.

**The assertion registry** is the folder `scripts/qa/raw-html/assertions/`. Every `.mjs` file in it except `*.test.mjs` is loaded, so a ticket adds an assertion by adding a file, without touching the harness:

```js
// scripts/qa/raw-html/assertions/one-h1.mjs
import { findTags } from '../html.mjs';

export default {
    id: 'one-h1',
    ticket: 27,
    description: 'exactly one <h1>',
    pages: ['home', 'product', 'category'], // optional: only these page kinds
    notOn: ['cart'],                        // optional: never these page kinds
    check(page) {                           // page: { kind, path, url, status, html }
        const count = findTags(page.html, 'h1').length;
        return count === 1 ? [] : [`${count} <h1> elements`]; // problems; empty means pass
    },
};
```

**Helpers in `html.mjs`** read HTML the way a browser builds it:

- `findTags(html, name)` returns start tags with their attributes. Anything inside comments, `<script>`, `<style>`, `<textarea>` and `<title>` doesn't count.
- `scriptsOfType(html, type)` returns script contents, such as JSON-LD.

**Tests:** add a fixture page to `raw-html/fixtures/` and a case to `raw-html/raw-html.test.mjs`, with a failing fixture and a passing one. CI runs them through `npm run test:scripts`. `raw-html/fetch.test.mjs` checks that the preview cookie reaches `QA_BASE_URL` and never a host a redirect points at.

**The assertions today:**

| Assertion | Ticket | Checks |
|---|---|---|
| `one-canonical` | 16 | exactly one canonical link; not asked of the cart or 404 |
| `json-ld-parses` | 16 | every `application/ld+json` block parses |
| `no-region-prompt` | 16, then 52 | no element carries `data-rf-region-prompt` |

**Still to come:**

- one `<h1>` (ticket 27)
- the tree-4 nav links in the header `<nav>` (28)
- facet links with `_bc_fsnf=1` and `rel="nofollow"` (33)
- the structured data's contents, and the home page (40)
- the prompt's copy (52)

**The outside-Canada prompt marker** is the attribute `data-rf-region-prompt`. Ticket 52 puts it on the prompt's root element, which is only ever created in the browser. A string in a script that builds the card isn't markup and doesn't count.

**Usage:**

```sh
npm run qa:raw-html                                       # ReelFlies_CA through stencil start
QA_CHANNEL=1 npm run qa:raw-html                          # product and category, read-only fallback
QA_BASE_URL=https://<prelaunch host> QA_PREVIEW_COOKIE='<name>=<value>' npm run qa:raw-html
```

It exits 1 on a failed check and 2 when the storefront can't be reached.

## Quick view (`quick-view.spec.mjs`)

On desktop, on the pinned category page, it checks that:

- `theme-bundle.chunk.quick-view.js` isn't requested when the page loads
- the first Quick view click opens the clicked product and loads the chunk once
- a second Quick view loads nothing more

It needs a category page with products, so run it with `QA_CHANNEL=1` until ReelFlies_CA has one. The behaviour behind it is unit-tested in `assets/js/test-unit/theme/reelflies/lazy-quick-view.spec.js`.

## Which runner picks up what

- Playwright runs `scripts/qa/*.spec.mjs` with this folder's config.
- `npm run test:scripts` runs every `scripts/**/*.test.mjs` with `node --test`.
- Jest runs `assets/js/test-unit/`. `jest.config.js` ignores `scripts/`, because Jest 30 would otherwise match `*.test.mjs` and `*.spec.mjs` too.
- Playwright writes its report, traces and failed diffs to `scripts/qa/results/`, which is ignored by git. A run with `QA_PREVIEW_COOKIE` writes no traces, so the cookie never lands there.
