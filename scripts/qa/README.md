# Storefront quality gates

The checks every theme change is held to (ticket 16; spec "Testing Decisions", seams 1 to 3). Lighthouse is ticket 17's and joins this folder.

| Gate | Command | Runs in CI | Runs before each push |
|---|---|---|---|
| Bundle limits | `node scripts/check-bundle.mjs <bundle.zip>` | yes | yes (release.sh) |
| Unit tests for this tooling | `npm run test:scripts` | yes | yes (release.sh) |
| axe | `npm run qa:axe` | no | yes (release.sh, through `qa:prepush`) |
| Raw HTML (curl) | `npm run qa:raw-html` | no | yes (release.sh, through `qa:prepush`) |
| Screenshot diffs | `npm run qa:screens` | no | yes (release.sh, through `qa:prepush`); also after each upstream merge, and in each template ticket |
| Quick view | `npm run qa:quick-view` | no | no |

CI has no store credentials, so anything that renders the storefront runs locally or from `release.sh`. `npm run qa:prepush` (`prepush.mjs`) runs axe, the raw-HTML check and the screenshot diffs, in that order. It runs all three even when one fails, exits non-zero if any failed, and ends with each gate's result.

`release.sh` runs it in step 4 on the release's channel and variation (`QA_CHANNEL` and `QA_VARIATION`), with `QA_FRESH_SERVER=1`, after `check-bundle.mjs` and before the dry-run exit and the push. So a serious or critical axe issue, a failed raw-HTML check, a screenshot diff or a missing baseline stops a release, and every gate runs on a stencil start of the commit being pushed ("Reuse" below). It must stay after the bundle check, for the reason in "Fresh start" below; `scripts/release-sh.test.mjs` checks the order.

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
| `QA_FRESH_SERVER` | none | `1` (`release.sh` sets it): never reuse a running server. Each gate starts its own, and the run stops if anything already answers on 3300 or 3301. |

Without `QA_BASE_URL`, each gate uses `npx stencil start -c $QA_CHANNEL -v "$QA_VARIATION" -p 3300` (`scripts/qa/storefront.mjs`):

- **Ports.** Browsersync takes 3300 and the stencil server 3301. The gates talk to 3301, so Browsersync's injected script, its overlay and its websocket stay out of the results.
- **Reuse.** A server already on 3301 is reused, but only if it renders `QA_CHANNEL` and `QA_VARIATION`. Both are read from `?debug=context`: `settings.channel_id`, and `settings.theme_config_id`, which stencil start sets from the variation's position in `config.json`. Otherwise the run stops at once, so one set's screenshots can never be compared with, or written as, another's.
  - The same check runs on every server a gate starts, before its first page.
  - `?debug=context` is asked again after a 5xx or a 429, as a pinned page is (below). If it still doesn't answer with the page context, the run stops and names the status it ended on.
- **No reuse with `QA_FRESH_SERVER=1`.** A server already running could come from another checkout, worktree or branch, even with the right channel and variation, and the gates would then pass on code other than the commit being pushed. So nothing is reused: each gate starts its own server from this checkout. If anything already answers on 3300 or 3301, the run stops before starting one, names the port, and says to stop that server first. `qa:prepush` checks once before the first gate, and each gate checks again for itself (`serverPlan` in `storefront.mjs`; the Playwright config checks before its `webServer` starts).
- **Fresh start.** A fresh server starts from an empty `assets/dist` and is ready once its webpack dev build is served. The gates stop the server again when they finish, with its whole process group. With `QA_FRESH_SERVER=1`, `qa:prepush` then waits until 3300 and 3301 are free (up to 15 s) before the next gate starts, and fails the gate if they aren't.
  - **The dev build stays in `assets/dist`.** That is about 2 MB of scripts with their sources inlined as source maps, and upstream's clean step never removes them. `stencil bundle` zips all of `assets/`, and so does `stencil push` without `-f`, which bundles again.
  - **So after a gate run, run `rm -rf assets/dist` before you bundle or push by hand.** `check-bundle.mjs` fails a zip that ships dev-build scripts.
  - **`release.sh` pushes exactly the zip it checked** (`stencil push -f <zip>`), so gates run after `check-bundle.mjs` can't change what ships. Keep both true if the order in `release.sh` changes.

**The channel-1 fallback.** ReelFlies_CA has no products and no tree-4 categories yet, so its product and category pages 404. Until they exist, `QA_CHANNEL=1` renders this repo's templates with live reelflies.ca data. It is read-only: stencil start only reads from the store. Channel 1 has only a product page and a category page pinned.

## Pinned pages and live data

`scripts/qa/pages.mjs` is the one place that says which page each gate visits, per channel:

- **Page keys** are the spec's template names: `home`, `fly-type`, `species`, `species-hub`, `product`, `cart`, `hook-chart`, `404` and `brand`, plus `category` for the stock category template until ticket 32.
- **Test products are pinned** by URL. Pick ones that will stay in the catalogue.
- **Every pinned page must answer as its template:** HTTP 404 for `404`, and 200 for every other page. Otherwise axe, the screenshots and the raw-HTML check fail the page instead of checking an error page. A renamed product or a mistyped pin shows up as that failure.
- **A 5xx or a 429 is asked again** (`retry.mjs`, W0-4). Each retry prints a `RETRY` line first, so a run that passed after one shows it.
  - **A 5xx, once more.** stencil start proxies each page to the store, and a dropped upstream connection (`AxiosError: stream has been aborted` in its log) can make one request answer 500. A page that answers 5xx is opened again about 2 s later (`RETRY_DELAY_MS`). A second 5xx fails.
  - **A 429, up to three times.** Parallel agents proxy many pages to the live stores at once, so a store can limit them. A page that answers 429 is opened again once its `Retry-After` has passed, or after 2, 4 and 8 s when it sends none (`RATE_LIMIT_DELAYS_MS`). A fourth 429 fails.
  - **Behind a local stencil start, the 429 retries mostly don't reach the store.** The backoff works in full only on `QA_BASE_URL` runs, which see the store's answers directly.
    - stencil-cli keeps the store's answer to each page for 15 s (its cache, on unless `stencil start --no-cache`), and that includes a 429. The 2, 4 and 8 s retries come 2, 6 and 14 s after the first answer, so each gets the same 429 back from the cache. Only a `Retry-After` that carries the waits past 15 s gets a new answer from the store.
    - A 429 on stencil-cli's second request for a page (its data request) reaches the gates as a 500, so it gets the single 5xx retry, which the cache answers the same way.
    - So locally, the protection against rate limits is running fewer gates at once (W0-7's cap on `stencil start`s), not the retries.
  - **At most 30 s of waiting per request** (`MAX_WAIT_MS`), after a 429 or a 5xx. A wait that would go past that isn't waited for: that answer fails at once, with a `WARNING` line that says why. Only a long `Retry-After` can get there, since the schedule alone waits 16 s at most. A Playwright test has 90 s in all, and a store that asks for longer is saying to run the gates later.
  - **A `Retry-After` is read** as whole seconds or as an HTTP date (`Tue, 06 Oct 2026 10:00:07 GMT`). Anything else counts as no `Retry-After`, so the 2, 4 and 8 s schedule applies.
  - **Every other status is the page's real answer** and is never asked again: a 4xx, or a 200 where a 404 belongs.
  - The same policy covers the axe and screenshot pages (`fixtures.mjs`), the raw-HTML pages (`raw-html.mjs`) and the server check (`?debug=context`, `storefront.mjs`).
- **`notPinnedYet`** is for a product or category page that a channel can't pin yet, with the reason. See "Raw HTML" below.

When a page is pinned for a channel, axe, the screenshots and the raw-HTML check all cover it on the next run.

**Mask or hide.** A screenshot can leave live content out of the comparison in two ways, and they differ in what happens to the page's size:

- **A mask** paints a box over the element after layout, so the page keeps its size. Use it for content whose pixels change but whose size holds still: a price, a stock line, a badge, a cart count.
- **Hiding** takes the content out of the layout through a stylesheet the screenshot applies (`toHaveScreenshot`'s `stylePath`), so it can't change the page's size. Use it for content that can change a page's height: a widget someone applies, a live list whose card titles wrap to more or fewer lines, or a bar the store adds after the page has loaded. A mask can't help there, because a full-page shot of a different height fails, however much of it is masked.

**What the screenshots mask** (`masksFor(channel, template)`):

- **`LIVE_DATA`, on every page:** prices, stock and SKU lines, ratings and review counts, sale and sold-out badges, cart counts and totals, pagination, and marketing banners.
- **A channel's `mask`, on one page only:** content that the pin can't hold still, but whose size can't move the page. Channel 1's category page masks its whole `.productGrid`, because the live reelflies.ca catalogue decides which products it lists.
- **The boxes a channel holds** (below), so a reviewer sees a mask where the cards were, not an empty space.

**What the screenshots hide** (`screenshotStyle(channel, template)` in `pages.mjs`; W0-5). Each test writes the stylesheet into its output folder (`screenshotStylePath` in `fixtures.mjs`), because `stylePath` reads only from a file.

- **`HIDDEN`, on every page and channel, out of the layout** (`display: none`):
  - **Widgets** (`[data-widget-id]`), from Page Builder or the Widgets API. A widget applied on 1895766, such as the hero (46), the shipping strip (27) or a home section (47–49), would otherwise change every page's height at once, and every gate and the release would fail together. Each widget is checked from its own source instead (W0-9). Channel 1's header widget (81 px at 375) is out of its shots for the same reason.
  - **The store's cookie banner** (`#consent-manager`), **and the bar it leaves after a choice** (`#consent-manager-update-banner`, "Manage Website Data Collection Preferences"). The bar is 48 px tall at the end of the page, and appears about a second after "Reject all". A shot taken before it appeared made the channel-1 product page fail once at 375 (375x4101 against a 375x4149 baseline), and pass on a rerun.
- **A channel's `hold`, on one page only:** a box whose contents set its height. The stylesheet takes everything inside the box out, and holds the box at the height given, so the page keeps one size whatever the live list holds. Channel 1's product page holds its related products' carousels (`#tab-related .productCarousel` and `#tab-similar .productCarousel`, 320 px). Their heading and the section around them stay in the shot, because ticket 39 replaces the carousel with a grid and ticket 40 adds the reviews below it. Ticket 39 points `hold` at its grid.
- `HIDDEN` and `hold` apply to the screenshots only. axe and the raw-HTML check still see the whole page.

**Everything else is diffed:** product cards (photo, name, layout), grids and carousels stay visible, so a change to a card or to a grid's layout fails the run. That includes the description on channel 1's product page: its pin's description was the same on 2026-10-06 as in the 2026-09-07 product export.

**To get a listing's cards into a baseline** (for example ticket 31's category grid, or ticket 48's home bands), the listing must hold still:

- Pin a page whose products don't change: a dedicated test category on ReelFlies_CA, or a fixed sort such as `?sort=alphaasc` on a category nobody edits.
- Then drop that page's entry from its channel's `mask` or `hold`, if it has one.
- Never mask or hide cards globally. If a card shows a new live value, add just that value's selector to `LIVE_DATA`.
- **For channel 1's product pin,** the steadiest choice is a product whose related products are set by hand, because automatic ones change when a product with a similar name is added. Channel 1's related lists can't be told apart from the storefront: the product's `related_products` in the catalogue API is `[-1]` when they are automatic. Changing a product's related products is a catalogue write, so it isn't done for the gates.

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
- **A missing baseline fails the run.** A plain run never writes one (`updateSnapshots: 'none'` in `playwright.config.mjs`), so no run can make a baseline that later runs pass unreviewed. The failure names the missing file and the command that makes it. A release to a channel or variation without its set stops at the screenshots until the set is made and reviewed.

**How a run works:**

1. Each page scrolls once so lazy images load.
2. The store's cookie banner is dismissed by pressing Enter on "Reject all", because it is fixed to the viewport and would cover the template. A click would leave the pointer over whatever the banner covered, and on the desktop product page that opens EasyZoom's hover zoom.
3. A full-page screenshot is compared with the baseline, with `masksFor(channel, template)` masked and `screenshotStyle(channel, template)` applied ("Mask or hide" above).

**The threshold** is in `playwright.config.mjs`. A pixel counts as changed when its colour moves more than 0.2 (Playwright's `threshold`). A run fails when more than 0.2% of the pixels change (`maxDiffPixelRatio`).

**The self-test** (`screens-selftest.spec.mjs`) runs with every `qa:screens`, with the same settings, on a fixed page of coloured blocks. It proves three things:

- An unchanged page passes.
- A 200 × 100 px change fails.
- A 10 × 10 px change passes.

It also tries channel 1's product-page stylesheet on a product page in miniature, with no baseline. A shot taken before the cookie bar appears matches one taken after it. A taller widget and taller related cards leave the shot as it was, and the held box measures its height. A change to the description or to the related section's heading still changes the shot.

**Updating baselines:** run `npm run qa:screens -- --update-snapshots`. Then look at every changed PNG before committing it. A diff is the point of the gate: update a baseline only for a change you meant.

**When a template ticket lands:**

1. Pin its page in `pages.mjs` under each channel where it renders.
2. Run `npm run qa:screens -- --update-snapshots` (and `QA_CHANNEL=1` if it needs the fallback).
3. Review the new PNGs and commit them with the template.
4. If the page shows new live data, add its selector to `LIVE_DATA`. If part of the page can't be pinned, leave it out for that page only: in its channel's `mask` if its size holds still, or in its channel's `hold` if it can change the page's height.

**Per variation:** run with `QA_VARIATION="ReelFlies US"` to make or check that variation's set. Only the ReelFlies CA sets exist today, so a release with ReelFlies US fails at the screenshots until its set is made. Both variations still have empty settings, so a US set would be identical.

**After an upstream merge**, run `npm run qa:screens` and `QA_CHANNEL=1 npm run qa:screens`, as in CUSTOMIZATIONS.md, "Upgrading".

## Raw HTML (`raw-html.mjs`)

This is spec seam 2: what a crawler gets, with no JavaScript.

- It fetches every page pinned for the channel in `pages.mjs`, with `Accept-Language: en-CA`; stencil start's renderer fails without it.
- It runs every registered assertion on each page. An assertion's `pages` and `notOn` pick the page kinds it applies to.
- A page that doesn't answer as its template fails: 404 for `404`, and 200 for every other page. A 5xx or a 429 is fetched again first, as in "Pinned pages and live data".
- **A product and a category page are required** (`RAW_HTML_REQUIRED`), because spec seam 2 checks those two. A channel without one fails, unless its `notPinnedYet` gives the reason, which is reported as a warning on every run. ReelFlies_CA has no products or tree-4 categories until refactor tickets 13 and 14. When they land, pin both and delete its `notPinnedYet`; a run warns while an entry is left over.
- **To check a new page kind** (for example the Fly Type page for ticket 40, or the cart for ticket 52), pin it in `CHANNELS`. Then name it in the assertion's `pages`, if the assertion applies only to some kinds.

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
| `one-canonical` | 16 | exactly one canonical link; not asked of the cart or the 404 page, which have none in stock Cornerstone |
| `json-ld-parses` | 16 | every `application/ld+json` block parses |
| `no-region-prompt` | 16, then 52 | no element carries `data-rf-region-prompt` |

**Still to come:**

- one `<h1>` (ticket 27)
- the tree-4 nav links in the header `<nav>` (28)
- facet links with `_bc_fsnf=1` and `rel="nofollow"` (33)
- the structured data's contents (40). The home page is already fetched wherever it is pinned.
- the prompt's copy (52)

**The outside-Canada prompt marker** is the attribute `data-rf-region-prompt`. Ticket 52 puts it on the prompt's root element, which is only ever created in the browser. A string in a script that builds the card isn't markup and doesn't count.

**Usage:**

```sh
npm run qa:raw-html                                       # ReelFlies_CA through stencil start
QA_CHANNEL=1 npm run qa:raw-html                          # product and category, read-only fallback
QA_BASE_URL=https://<prelaunch host> QA_PREVIEW_COOKIE='<name>=<value>' npm run qa:raw-html
```

It exits 1 on a failed check, and 2 when the storefront can't be reached or, with `QA_FRESH_SERVER=1`, when something already answers on 3300 or 3301.

**Not run on prelaunch yet.** The product and category runs so far were on channel 1 through `stencil start -c 1`. The prelaunch run needs the preview cookie (ticket 11) and ReelFlies_CA's product and category pins (refactor tickets 13 and 14).

## Quick view (`quick-view.spec.mjs`)

On desktop, on the pinned category page, it checks that:

- `theme-bundle.chunk.quick-view.js` isn't requested when the page loads
- the first Quick view click opens the clicked product and loads the chunk once
- a second Quick view loads nothing more

It needs a category page with products, so run it with `QA_CHANNEL=1` until ReelFlies_CA has one. The behaviour behind it is unit-tested in `assets/js/test-unit/theme/reelflies/lazy-quick-view.spec.js`.

## Which runner picks up what

- Playwright runs `scripts/qa/*.spec.mjs` with this folder's config.
- `harness-selftest.spec.mjs` runs with `qa:axe`, `qa:screens` and `qa:quick-view`, on pages it serves itself. It proves that a pinned page answering with the wrong status fails the run without being asked again, that one answering 5xx twice or 429 four times fails, and that dismissing the cookie banner leaves nothing hovered. Its 5xx and 429 retry cases answer the pinned 404 page (or the channel's first page) with a 500, or a 429 with `Retry-After: 1`, once and then let the request through, so the second answer is the storefront's real one.
- `retry.test.mjs` covers the retry policy itself (the waits, `Retry-After` and the 30 s limit), `storefront.test.mjs` the server check's retries, and `raw-html/fetch.test.mjs` the raw-HTML fetch's.
- `npm run test:scripts` runs every `scripts/**/*.test.mjs` with `node --test`.
- Jest runs `assets/js/test-unit/`. `jest.config.js` ignores `scripts/`, because Jest 30 would otherwise match `*.test.mjs` and `*.spec.mjs` too.
- Playwright writes its report, traces and failed diffs to `scripts/qa/results/`, which is ignored by git. A run with `QA_PREVIEW_COOKIE` writes no traces, so the cookie never lands there.
