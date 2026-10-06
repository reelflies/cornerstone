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
| Fixture renders of partials and widgets | `npm run test:scripts` | yes | yes (release.sh) |
| Widget element shots | `npm run qa:screens`, with the page shots | no | yes (release.sh, through `qa:prepush`) |

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
| `QA_FRESH_SERVER` | none | `1` (`release.sh` sets it): never reuse a running server. Each gate starts its own, and the run stops if anything already answers on its ports. |
| `QA_PORT` | `3300` | Browsersync's port; the stencil server takes the next one. Each agent's worktree runs on the pair the orchestrator assigns (3400, 3500 and so on), so parallel runs never share ports. `release.sh` always uses 3300. See [Parallel runs](#parallel-runs). |
| `RF_TICKET` | the branch | The ticket the run's locks name, for anyone waiting on them. |
| `QA_REFERENCE_HTML` | none | The reference page the review pages' reference screens are shot from, instead of `plan/design/reelflies-reference.html` above the checkout ("Review pages") |
| `QA_MANIFEST` | `scripts/qa/results/manifest.json` | The screenshot manifest a run writes, for example a ticket worktree's from W0-8's overlay worktree ("Review pages") |

**The preview cookie** is a control-panel login, so set it only in your own shell, where it isn't shown or kept in history, and never in a file or a chat (ticket 16):

```sh
read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE    # paste name=value; name2=value2, then Return
```

Without `QA_BASE_URL`, each gate uses `npx stencil start -c $QA_CHANNEL -v "$QA_VARIATION" -p $QA_PORT` (`scripts/qa/storefront.mjs`):

- **Ports.** Browsersync takes `QA_PORT` (3300 by default) and the stencil server the next port (3301). The gates talk to the stencil server, so Browsersync's injected script, its overlay and its websocket stay out of the results.
- **Locks.** Before it uses a local server, a gate takes its port pair's lock, and a stencil start slot if it starts the server. See [Parallel runs](#parallel-runs).
- **Reuse.** A server already on the stencil server's port is reused, but only if it renders `QA_CHANNEL` and `QA_VARIATION`. Both are read from `?debug=context`: `settings.channel_id`, and `settings.theme_config_id`, which stencil start sets from the variation's position in `config.json`. Otherwise the run stops at once, so one set's screenshots can never be compared with, or written as, another's.
  - The same check runs on every server a gate starts, before its first page.
  - `?debug=context` is asked again after a 5xx or a 429, as a pinned page is (below). If it still doesn't answer with the page context, the run stops and names the status it ended on.
- **No reuse with `QA_FRESH_SERVER=1`.** A server already running could come from another checkout, worktree or branch, even with the right channel and variation, and the gates would then pass on code other than the commit being pushed. So nothing is reused: each gate starts its own server from this checkout. If anything already answers on its two ports, the run stops before starting one, names the port, and says to stop that server first. A gate run on the same ports in another checkout isn't such a server: the run waits for its port lock instead. `qa:prepush` checks once before the first gate, and each gate checks again for itself (`serverPlan` in `storefront.mjs`; the Playwright config checks before its `webServer` starts).
- **Fresh start.** A fresh server starts from an empty `assets/dist` and is ready once its webpack dev build is served. The gates stop the server again when they finish, with its whole process group. With `QA_FRESH_SERVER=1`, `qa:prepush` then waits until both ports are free (up to 15 s) before the next gate starts, and fails the gate if they aren't.
  - **The dev build stays in `assets/dist`.** That is about 2 MB of scripts with their sources inlined as source maps, and upstream's clean step never removes them. `stencil bundle` zips all of `assets/`, and so does `stencil push` without `-f`, which bundles again.
  - **So after a gate run, run `rm -rf assets/dist` before you bundle or push by hand.** `check-bundle.mjs` fails a zip that ships dev-build scripts.
  - **`release.sh` pushes exactly the zip it checked** (`stencil push -f <zip>`), so gates run after `check-bundle.mjs` can't change what ships. Keep both true if the order in `release.sh` changes.

## Parallel runs

Agents build tickets in parallel, each in its own worktree, and each worktree's gates start their own `stencil start`s (W0-7). Each `stencil start` runs a webpack dev build and proxies every page to the live stores. So:

- **A port pair per worktree.** The orchestrator gives each worktree a `QA_PORT`, 3400, 3500 and so on, and its gates use that port and the next one. Set it in the worktree's shell before any `npm run qa:*`:

  ```sh
  export QA_PORT=3400   # Browsersync on 3400, the stencil server on 3401
  npm run qa:prepush
  ```

  The Playwright config and `raw-html.mjs` read the same variable. The start log is named by the port: `$TMPDIR/rf-qa-stencil-start-<port>.log`. A run in a linked worktree without `QA_PORT` prints a `WARNING` line, because it would use the release's 3300.
- **Its port pair's lock.** Each gate run holds `~/reelflies/theme/.locks/port-<QA_PORT>` while it runs. A second run on the same ports, from any checkout, waits for it with a `WAIT` line naming the holder, instead of failing on a busy port or reusing a server that another checkout started.
- **At most three `stencil start`s on the Mac.** A gate takes a slot, `~/reelflies/theme/.locks/stencil-1` to `stencil-3`, before it starts its server, and waits while all three are taken (a `WAIT` line names the holders, and a `SLOT` line says which slot it got). A gate that reuses a running server takes no slot. The release takes slots like any other run: each of its three gates takes one.
- **The ports are checked again once a gate has its slot,** because the wait can last minutes and a server that takes no lock (a worktree from before W0-7) can come up on them meanwhile. With `QA_FRESH_SERVER=1` the run then stops, as it would have before the wait. And a gate trusts only the `stencil start` it started: if that one exits before it is ready, the gate fails, even when something else answers on its port.
- **A `stencil start` by hand** goes through `node scripts/qa/serve.mjs`, so it counts toward the three too. It takes the port lock and a slot, waits for them like a gate, refuses while anything answers on its ports, and runs `stencil start` until Ctrl-C, which stops the server and releases both:

  ```sh
  QA_PORT=3400 node scripts/qa/serve.mjs                                                  # ReelFlies_CA
  QA_PORT=3400 QA_CHANNEL=1855224 QA_VARIATION="ReelFlies US" node scripts/qa/serve.mjs   # .com's data (read-only)
  ```

  Like the gates, it leaves its dev build in `assets/dist`. A bare `npx stencil start` takes no slot, so don't run one in a worktree made after W0-7.
- **Waits** last up to 40 minutes, longer than a slot's or a port's 30-minute limit, so a lock whose holder died goes stale and is broken while the run waits. After that the run fails, naming the holders.
- **Both locks are released when the gate ends,** also when it exits early, and when it is stopped by Ctrl-C (`SIGINT`), `SIGTERM` (a kill, or a tool's timeout) or `SIGHUP` (a closed terminal). A `stencil start` the gate started is stopped with it. Only `SIGKILL`, which can't be caught, leaves the locks until they are stale.

**The locks** are folders under `~/reelflies/theme/.locks/`, taken with an atomic `mkdir` by `scripts/lib/lock.mjs`. `RF_LOCK_ROOT` moves them for the tests, and only under `node --test`: a real run refuses it, so no release or gate can take a lock or a slot that other runs don't see.

| Lock | Held by | Stale after |
|---|---|---|
| `release` | `scripts/release.sh`, for the whole release or dry run ([releasing](../../docs/releasing.md)) | 90 min |
| `merge` | W0-13's `scripts/merge.sh` | 15 min |
| `stencil-1` … `stencil-3` | a gate run, while its `stencil start` runs | 30 min |
| `port-<n>` | a gate run on the ports `n` and `n + 1` | 30 min |

- Each holds `owner.json` (owner, ticket, pid, host and start time) and `owner.txt` with the same facts as lines.
- **Stale:** a lock older than its limit whose pid isn't running is broken, with a `STALE` line naming the old holder. A lock whose holder still runs is never broken, however old.
- The pid is checked whatever host the lock names: the folders are on this Mac's own disk, and macOS can rename the host from the network mid-run.
- A lock with no pid to check (written by hand) goes stale on age alone, after its limit or 45 minutes, whichever is longer.
- Breaking a stale lock removes only a lock folder (its owner files, then the folder). Anything else at a lock's path is left alone, and the run stops naming it.
- To see who holds what: `cat ~/reelflies/theme/.locks/*/owner.txt`.

**From wave 0's interim lock to these.** Until W0-7, every `stencil start` used 3300 and 3301, so agents held one hand-made lock, `~/reelflies/theme/.locks/stencil`, around any `stencil start`, `npm run qa:*` or `release.sh` run. Worktrees made from `master` after W0-7 don't need it:

1. **Worktrees made, or rebased onto `master`, after W0-7:** run with the `QA_PORT` the orchestrator assigned, and take no lock by hand. The gates take their port lock and slots themselves, and so does `serve.mjs` for a `stencil start` by hand.
2. **Anything still on 3300 and 3301** (`release.sh`, and any worktree from before W0-7) keeps taking `.locks/stencil` by hand, as in wave 0, while any worktree from before W0-7 is still in use. Those worktrees take no port lock or slot, so the hand lock is all that keeps them apart from the release, and until they are gone a fourth `stencil start` can run beside the three slots.
3. **The release lock is now `release.sh`'s own.** Don't take `~/reelflies/theme/.locks/release` by hand around `release.sh` any more: it would find the lock held and stop, naming you.
4. **Once no worktree from before W0-7 is left,** nothing takes `.locks/stencil` any more, and the orchestrator deletes it.

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
    - **The limit:** only the widget is hidden, not the Page Builder layout around it (`[data-layout-id]`, then `[data-sub-layout-container]`, then `[data-sub-layout]`). With Page Builder's default styles those add only side padding, so they are 0 px tall once the widget is hidden, as channel 1's header shows. A layout given top or bottom padding, a margin or a minimum height would still add its height. When the first widget is applied on 1895766 (ticket 46), check that its region adds 0 px to the shots. If it doesn't, add `[data-layout-id]` to `HIDDEN`.
  - **The store's cookie banner** (`#consent-manager`), **and the bar it leaves after a choice** (`#consent-manager-update-banner`, "Manage Website Data Collection Preferences"). The bar is 48 px tall at the end of the page, and appears about a second after "Reject all". A shot taken before it appeared made the channel-1 product page fail once at 375 (375x4101 against a 375x4149 baseline), and pass on a rerun.
- **A channel's `hold`, on one page only:** a box whose contents set its height. The stylesheet takes everything inside the box out, and holds the box at the height given, so the page keeps one size whatever the live list holds. Channel 1's product page holds its related products' carousels (`#tab-related .productCarousel` and `#tab-similar .productCarousel`, 320 px). Their heading and the section around them stay in the shot, because ticket 39 replaces the carousel with a grid and ticket 40 adds the reviews below it. Ticket 39 points `hold` at its grid. A key may be a selector list, such as `'#tab-related .grid, #tab-similar .grid'`: each box it names is held at the height given.
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

**Declaring changed baselines** (W0-13). Every PR body ends with a `Baselines:` line naming the page kinds and overlays it changes on purpose, for example `Baselines: product, product@sold-out, overlay rf_rise-off`, or `Baselines: none`. The `baseline-scope` CI check, and `scripts/merge.sh` again before it merges, fail a PR that changes, adds or deletes any PNG here outside them. The check reads a baseline's name as `<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png`, so W0-8's pins, UI states and overlays must keep that shape; a PNG in any other shape is covered only by a re-baseline epoch (`Baselines: epoch <cause>`), and an epoch PR changes nothing but baselines. [docs/guardrails.md](../../docs/guardrails.md), "Declaring changed baselines", has the rules.

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
QA_BASE_URL=https://<prelaunch host> npm run qa:raw-html    # with QA_PREVIEW_COOKIE read as above
```

It exits 1 on a failed check, and 2 when the storefront can't be reached or, with `QA_FRESH_SERVER=1`, when something already answers on `QA_PORT` or the port after it.

**Not run on prelaunch yet.** The product and category runs so far were on channel 1 through `stencil start -c 1`. The prelaunch run needs the preview cookie (ticket 11) and ReelFlies_CA's product and category pins (refactor tickets 13 and 14).

## Fixture renders (`render/`)

The fixture renderer (W0-9) renders a ReelFlies partial, or a widget, from fixture JSON instead of store data. So a template can be tested before the store has its data: ReelFlies_CA has no tree-4 categories until refactor 13, but the Species pages, the hub, the chips, the description split and the hook chart rows can be tested now. And a widget is checked from its source, not from what the store shows. Tickets 32, 34, 35, 36 and 46–49 use it.

| File | What |
|---|---|
| `render/render.mjs` | `renderPartial` and `renderWidget`, `readFixture`, `widgetCases`, `themeConfig` |
| `render/html-checks.mjs` | `unbalancedTags(html)`: elements closed in the wrong place, closed with nothing open, or never closed |
| `render/widget-page.mjs` | the fixture page a widget shot is taken on |
| `widget-screens.spec.mjs` | the widget element shots |
| `render/example/` | the worked example below |

### Partials

`renderPartial(name, context, options)` renders a theme template with `context` as its store data, and resolves to the HTML. It renders the way `stencil start` does:

- through `@bigcommerce/stencil-paper` and the `@bigcommerce/stencil-paper-handlebars` 6.5.1 it wraps, the versions stencil-cli 9.1.0 pins, with config.json's `handlebars_v4`
- with every partial the template includes, found by stencil-cli's own patterns: first in the `templates` folders the test passes, then in the theme's `templates/`
- with `theme_settings` from config.json, the variation's settings on top, as stencil start merges them, and the strings in `lang/`
- with a fresh renderer each time, so `assignVar` and `getVar` start empty, as each page request does

**The fixture** is the store data, shaped as `?debug=context` shows it on a real page, for example `{ "category": { "name": …, "description": …, "subcategories": [ … ] } }`. Two keys are laid over the defaults, key by key:

- `theme_settings`, to render with a setting changed, such as a switch off or `rf_menu_type_ids` set
- `settings`, the store's site settings

**Options:** `variation` (default `ReelFlies CA`), `templates` (folders searched before `templates/`, for partials that exist only for a test), `regions` (region name to HTML) and `strict`.

**Helpers.** Every helper the store whitelists works as it does there. `render.test.mjs` proves the ones ReelFlies partials rely on: `split`, `inArray`, `trim`, `assignVar`, `getVar` and `getImageSrcset`, plus `lang`.

**A helper the store doesn't have fails the render.** The store renders `{{shout name}}` as nothing, so a typo, or a helper outside the whitelist, would pass every test. The renderer fails instead, naming the helper and the template, whether the call has arguments or hash arguments only (`{{{regoin name="…"}}}`). `strict: false` renders it as the store does. A plain `{{name}}` that matches nothing still renders empty: that is a missing value, not a helper.

**Reading the output:** `findTags` from `raw-html/html.mjs` lists tags with their attributes, and `unbalancedTags` from `render/html-checks.mjs` checks the markup. `unbalancedTags` asks for explicit closing tags, which is stricter than a browser.

**Where a ticket's tests go:** `scripts/qa/render/partials/<partial>.test.mjs`, with its fixtures in `scripts/qa/render/partials/<partial>/`. A real partial is in the theme's `templates/`, which is always searched, so it needs no `templates` option. Adding them touches nothing in the harness.

### Widgets

**The widget folder** (W0-9 sets this layout; ticket 46's sync reads `template.html` and ignores `fixtures/`):

| Path | What |
|---|---|
| `widgets/<name>/template.html` | the widget template |
| `widgets/<name>/fixtures/<case>.json` | its fixtures |
| `widgets/<name>/fixtures/files/` | the images its fixture data points at |
| `widgets/_shared/<partial>.html` | markup two widgets share (ticket 48's product card), included as `{{> _shared/<partial>}}`. A store widget template can't include partials, so the sync must inline these before upload. |

Ticket 46 adds the schema, the query and `channels/<channel>.json` beside `template.html`.

**A widget fixture:**

```json
{
    "description": "The hero with the bass banner and both buttons.",
    "page": "pages/home",
    "region": "home_below_menu",
    "configuration": { "heading": "Hand-tied fly fishing flies, sold one at a time." },
    "data": { "site": { "product": { "name": "Parachute Adams" } } }
}
```

- `configuration` is the widget's `widget_configuration`. The template reads its keys at the top level, as on the store.
- `data` is the `storefront_api_query` result, which the template reads as `_.data`. Save a real response and keep its URLs: shots answer store CDN image URLs from `fixtures/files/` (below).
- `_.id` is a fixed id, so a shot is the same on every run.
- `page` and `region` say where the widget sits. A fixture for render tests only sets `"shot": false` instead.
- `page_context` (optional) is the page's own store data, shaped as `?debug=context` shows it, for a region inside a condition. `cart.html` renders `cart_below_totals` only when the cart has items, so a widget there needs `"page_context": { "cart": { "quantity": 1, "items": [ … ] } }`. The page's `template` is always `page`, as on the store.
- `"chrome": true` (optional) renders the theme's header and footer round the page, as `layout/base.html` does, for a widget in a header or footer region such as `header_bottom--global` (ticket 27's shipping strip). Use it only there: the phone header is fixed, so it could cover a widget lower down.

`renderWidget(name, fixture, { root })` resolves to the template's output, for render tests under `node --test` (Jest ignores `scripts/`). For example, ticket 48's "a changed price in the fixture changes the rendered price" is a `renderWidget` call with the price changed (`render.test.mjs` has the same test on a test widget). Put a widget's render tests in `scripts/qa/render/widgets/<name>.test.mjs`.

**A widget template gets no page context.** Besides the unknown helpers above, `renderWidget` fails on `lang`, `langJson`, `inject`, `jsContext` and `region`, which read the theme's lang strings, the page's jsContext and its regions. Put a widget's text in its `widget_configuration`. `strict: false` renders them as stencil-paper-handlebars does: `lang` as nothing, and `jsContext` as the renderer's own. This is a revisitable default: BigCommerce doesn't document which helpers its widget renderer has.

### Widget element shots (`widget-screens.spec.mjs`)

Page baselines hide widget regions ("What the screenshots hide" above), because a widget placed on the store would change every page's height. Each widget is checked here instead, from its source, so its baseline changes in the same commit as its template, or as the theme CSS it uses, and never with the store's state.

- **Which fixtures:** every `widgets/<name>/fixtures/<case>.json` without `"shot": false`, at 375 and 1280, for `QA_VARIATION`.
- **When:** its name ends in "screens", so `npm run qa:screens`, and so `qa:prepush` and `release.sh`, run it with the page shots, with the same thresholds. To run only the widget shots: `npx playwright test --config scripts/qa/playwright.config.mjs widget-screens`. Both start the storefront server as `qa:screens` does, although the widget shots don't use it.
- **The page:** the fixture's page template, rendered inside the theme's own `components/common/body` (`render/widget-layout.html` stands in for `layout/base.html`). So the widget sits in the same boxes as on the storefront: `home_below_menu` outside `.container`, `home_below_top_products` inside `.container .main.full`. The store's wrapper goes round it (`data-widget-id`, `data-placement-id`, `data-placement-status`). The page loads the theme's Google Fonts and `theme.css`, compiled from this checkout for the variation with stencil-cli's compiler and engine, as stencil start compiles it. It has no scripts, and no header or footer unless the fixture sets `"chrome": true`.
- **No request reaches the store.** The page is on a made-up origin, and Playwright answers each request itself:
  - the page and the compiled CSS
  - the theme's `assets/`, for the CSS's relative URLs
  - any other path on that origin, and any `cdn*.bigcommerce.com` URL, with the file of the same name in the widget's `fixtures/files/`, whatever its size segment. So `…/images/stencil/320w/…/fly.jpg` and `…/1280w/…/fly.jpg` both get `fixtures/files/fly.jpg`.
  - Google Fonts load as on the storefront. Anything else is blocked.

  A blocked request, or a file that isn't in `fixtures/files/`, fails the shot and is named.
- **Baselines:** `baselines/widgets/<variation>/<widget>-<case>-<project>-<platform>.png`, for example `baselines/widgets/reelflies-ca/home-lead-default-phone-375-darwin.png`. A missing baseline fails, as for pages. Make or update them with `npx playwright test --config scripts/qa/playwright.config.mjs widget-screens --update-snapshots`, under the stencil lock, then look at each PNG. That rewrites widget baselines only: `npm run qa:screens -- --update-snapshots` would also rewrite every page baseline that has drifted, which a widget PR must never do (section 6.6). The PR's `Baselines:` line names them as `widget <name>` (section 6.6 of the build pipeline).
- **What the page doesn't show:** layout containers Page Builder may add round a placement, the theme's scripts (lazysizes, carousels), and the header and footer's own data (menus, logo, cart count), which a `chrome` page renders from an empty context. The review page shows the live home page with its widgets (W0-10).

**The self-test** is the widget `rf-selftest`, in `render/selftest/widgets/`, outside `widgets/` so no sync ever uploads it. Its baselines are checked like any widget's, and four more tests prove that:

- the theme CSS, with the variation's settings, styles the widget (its `.button--primary` has the variation's `button--primary-backgroundColor`)
- a changed widget (a new background) fails its baseline
- a request outside the fixture (a photo on reelflies.ca) is blocked and fails the shot
- a fixture file that isn't there fails the shot

A theme change that restyles buttons or headings changes the self-test's baselines too: update them in the same commit and name `widget rf-selftest` on the `Baselines:` line.

### Worked example

`render/example/` tests a partial from fixture JSON, with two fixtures that pass and one that fails. Copy it for your own partial.

- **The partial,** `example/templates/components/reelflies/example-intro.html`, splits a category description at `<!--more-->` with `split` and `trim`, as ticket 32's intro does. The part before the marker sits under the H1, and the rest goes below. Without the marker, the whole description goes below.
- **The fixtures,** in `example/fixtures/`:
  - `marker.json` and `no-marker.json` pass.
  - `marker-in-paragraph.json` is the failing fixture. The store's editor can save the marker inside its own paragraph (`<p><!--more--></p>`), and the split then leaves the lead's `<p>` open and closes it again below. Ticket 32's split has to allow for it.
- **The test,** `example/example.test.mjs`:

  ```js
  const render = name => renderPartial('components/reelflies/example-intro', readFixture(path.join(HERE, 'fixtures', name)), {
      templates: [path.join(HERE, 'templates')], // only because this example lives outside templates/
  });

  it('puts the part before <!--more--> under the H1, and the rest below', async () => {
      const html = await render('marker.json');
      assert.equal(findTags(html, 'h1').length, 1);
      assert.equal(inner(html, 'rf-example-intro__lead'), '<p>Flies that float on the surface, tied by hand.</p>');
      assert.deepEqual(unbalancedTags(html), []);
  });

  it('fails the markup check when the marker was saved inside a paragraph', async () => {
      assert.deepEqual(unbalancedTags(await render('marker-in-paragraph.json')), [
          '</div> closes <p>, which is still open',
          '</p> closes nothing',
      ]);
  });
  ```

  The last test asserts that the failing fixture fails, so the check can't quietly stop working.
- **Run it:** `node --test scripts/qa/render/example/example.test.mjs`. CI runs it, with every other `*.test.mjs`, through `npm run test:scripts`.

## Quick view (`quick-view.spec.mjs`)

On desktop, on the pinned category page, it checks that:

- `theme-bundle.chunk.quick-view.js` isn't requested when the page loads
- the first Quick view click opens the clicked product and loads the chunk once
- a second Quick view loads nothing more

It needs a category page with products, so run it with `QA_CHANNEL=1` until ReelFlies_CA has one. The behaviour behind it is unit-tested in `assets/js/test-unit/theme/reelflies/lazy-quick-view.spec.js`.

## Review pages (`review/`)

Review is per wave, through rolling checkpoints (W0-10 in `plan/build-pipeline.md`). The generator writes a local page with its images. It never publishes anything and never tags: the orchestrator publishes each checkpoint page as a private claude.ai artifact, keeps its source in `plan/reviews/review-NN/`, and cuts the checkpoint tag.

**The manifest.** Every screenshot run records what it shot in `scripts/qa/results/manifest.json` (ignored by git), or in the file `QA_MANIFEST` names:

- `screens.spec.mjs` annotates each template shot (`shotAnnotation(themeShot(…))`), and the manifest reporter (`review/manifest-reporter.mjs`, in `playwright.config.mjs`) writes the entries with each test's status when the run ends. A run that annotates nothing, such as axe, leaves the file as it was.
- Each entry has the page, path, width, channel, variation, overlay or state (W0-8 fills these), baseline path and reference anchor, plus the status, the commit and when it ran. A failed shot keeps a copy of its render in `manifest-actual/` beside the manifest, because the next run empties Playwright's output folder, and the first line of its error.
- Runs add up: a run replaces the entries it shot again and keeps the rest, so the ReelFlies_CA run and the `QA_CHANNEL=1` run fill one manifest. The generator leaves out shots of pages `pages.mjs` no longer pins, and says so. A checkpoint starts from an empty manifest (below).
- **W0-8's overlay runs** happen in a throwaway worktree. Point `QA_MANIFEST` at the ticket worktree's manifest. Paths in it stay relative to the checkout that ran them, which a worktree of the same repo lays out the same way, so copy the overlay's baselines back to the same paths, as committing them needs anyway.

**The reference screens.** `screens-reference.spec.mjs` runs with every `npm run qa:screens`. It shoots each storefront screen of the reference design, `plan/design/reelflies-reference.html`, at 375 and 1280 into `results/reference/`:

- The page's Options are set first: "Heading face" Onest, the fly-type links row off, sage buy buttons, a visitor in Canada and no build notes (`REFERENCE_SETTINGS` in `review/reference.mjs`).
- Each shot is the store frame alone, 1280 px wide on desktop and 375 on a phone.
- The anchors are `home`, `fly-type` (Dry Flies), `species` (Trout Flies), `species-hub`, `hook-chart`, `product` (4877, Adams Parachute), `cart` and `brand` (`REFERENCE_ANCHORS`). A template is compared with the anchor of the same name. The stock `category` template is compared with `fly-type`, which ticket 32 turns it into, and `404` has no reference screen.
- The page is found in `plan/design/` above the checkout, from the main clone or any worktree, or at `QA_REFERENCE_HTML`. Where it isn't (CI, another machine), the spec is skipped.
- **It can't fail the run.** `qa:screens` is the release's screenshot gate, and the reference page changes outside git, so nothing here is a baseline or a gate. A screen it can't shoot (an Option control gone, a hash route that no longer shows its screen, a `QA_REFERENCE_HTML` that isn't there, or its 120 s running out) is recorded in the manifest with the problem. The review page then says which screens weren't shot and why. `review/reference-run.test.mjs` proves it on a broken page.

**Review renders** (`review-live.spec.mjs`) are pages shot as they render, with nothing masked and no baseline. No `qa:*` script runs them:

- **ReelFlies_CA's home page with its widgets,** for section 6. Page baselines hide widget regions, so this is where they show.
- **Every page pinned for reelflies.com (1855224),** for section 5. .com has no baselines, so these are its renders. `pages.mjs` pins its home page; pin a product and a category there too. Run it only once W0-6 has landed, which refuses writes and blocks analytics on live channels.

```sh
npx playwright test --config scripts/qa/playwright.config.mjs review-live    # ReelFlies_CA's home page, this checkout through stencil start
QA_CHANNEL=1855224 QA_VARIATION='ReelFlies US' npx playwright test --config scripts/qa/playwright.config.mjs review-live    # .com, after W0-6
```

The prelaunch host's own build can be shot too, but only after W0-6: its pages load GA4, which reports into live reelflies.ca. Read the cookie as in "The storefront the gates test", then run `QA_BASE_URL=https://<prelaunch host> npx playwright test --config scripts/qa/playwright.config.mjs review-live`.

**A checkpoint page,** from a clean `master`, holding the stencil lock for the runs:

```sh
rm -f scripts/qa/results/manifest.json   # start from this commit's shots only
npm run qa:screens                       # ReelFlies_CA, with the reference screens
QA_CHANNEL=1 npm run qa:screens          # channel 1's product and category
npx playwright test --config scripts/qa/playwright.config.mjs review-live
QA_CHANNEL=1855224 QA_VARIATION='ReelFlies US' npx playwright test --config scripts/qa/playwright.config.mjs review-live    # after W0-6
rm -rf assets/dist
node scripts/qa/review/review.mjs --input <notes.json>
```

- **Name and range.** It names the page after the newest `review-NN` tag (`review-00` when there is none). It covers everything merged from that tag to `HEAD`, and every baseline changed in that range. `--since <tag>` or `--since none` sets the range by hand.
- **Regenerating a page** that is already tagged (`--name review-NN`) works only from the commit its tag is on, and covers the range up to the tag. From anywhere else it stops. Check the tag out in a worktree, run the screenshots there, and point `--root` at it. It prints no tag command then: republish the page in place.
- **Output.** `results/review/<name>/index.html` is the page to publish, with its `images/` folder. `preview.html` is the same page inside the document claude.ai adds, to view it locally. `--inline` puts the images inside `index.html` instead, as `data:` URIs.
- **Images** are re-encoded in Playwright's Chromium as WebP at about 200 KB each (JPEG for a page taller than WebP's 16,383 px). The run fails if the page and its images come to more than 16,000,000 B, the artifact limit.
- **When it finishes,** it prints the tag command for the orchestrator: `git tag review-NN <sha> && git push origin review-NN`.

At the top, the page lists every PR merged since the last checkpoint (and any commit made on `master` directly), by ticket with its wave, whether or not it changed a baseline. The tickets come from its commits' titles, and the wave from the notes' `tickets` map (wave 0 for a `W0-n` item). A run note names each ticket the map has no wave for. The sections follow, in this order:

1. For Shaun: approvals waiting, each with its diff; paired channel-1 releases pending; tokens and cookie sessions needed; DRAFT copy.
2. The defaults taken since the last checkpoint, each marked revisitable, with its ticket and wave.
3. Each template at 375 and 1280 beside its reference screen, or "No reference screen". Reference screens no template renders yet follow.
4. Before and after for every baseline changed since the last checkpoint tag, grouped by the ticket named in its commits' titles.
   - **A baseline that several owners changed in turn** (a ticket, then an epoch, then another ticket, as rebasing onto an epoch makes it) gets one before-and-after per owner, each from where the one before it left the file. So it shows under each ticket and under the epoch.
   - **Re-baseline epochs are listed apart, with their cause.** An epoch commit is one the notes list under `epochs`, one whose message has a `Baselines: epoch <cause>` line (put it in the commit as well as the PR body), or one whose title says "epoch". A run note names a listed epoch that changed no baseline in the range.
5. reelflies.com: the build's uuid for the My Themes preview, and the .com review renders, each beside its reference screen.
6. The live home page on 1895766, with its widgets.
7. Criteria waiting on refactor 13 or 14, a token, the cookie or an approval.

**The checkpoint notes** (`--input`) hold what git and the manifest can't know. Every key is optional, and a misspelt key stops the run:

```json
{
  "title": "Wave 1: the skin and the scaffold",
  "intro": "One paragraph under the title. `Backticks` mark commands and paths.",
  "date": "2026-10-20",
  "forShaun": {
    "approvals": [{ "ticket": "18", "title": "The Fly Sizes catalogue fix", "detail": "…", "diff": "- old\n+ new" }],
    "pairedReleases": [{ "uuid": "…", "commit": "…", "note": "…" }],
    "access": [{ "ticket": "11", "what": "The prelaunch preview cookie", "why": "…" }],
    "draftCopy": [{ "ticket": "22", "where": "Shipping policy page", "text": "…" }]
  },
  "defaults": [{ "ticket": "25", "text": "…" }],
  "tickets": { "25": { "wave": "1", "title": "Skin foundation" } },
  "epochs": [{ "commit": "abc1234", "cause": "The hero widget applied on 1895766 (ticket 46)" }],
  "com": { "uuid": "…", "commit": "…", "pushedAt": "…", "note": "…" },
  "liveHome": { "note": "…" },
  "waiting": [{ "ticket": "16", "criterion": "…", "trigger": "refactor 13 and 14" }]
}
```

**PR mode,** for the skeptic (section 7, step 6 of the build pipeline). In the ticket's worktree, after its screenshot run:

```sh
node scripts/qa/review/review.mjs --pr <number> [--base origin/master]
```

It writes `results/review/pr-<number>/` with each baseline the working tree changes against its merge base with `--base` (new, untracked baselines too), before and after, beside its reference screen. The page says it is local only, and it is never published.

## Which runner picks up what

- Playwright runs `scripts/qa/*.spec.mjs` with this folder's config.
- `harness-selftest.spec.mjs` runs with `qa:axe`, `qa:screens` and `qa:quick-view`, on pages it serves itself. It proves that a pinned page answering with the wrong status fails the run without being asked again, that one answering 5xx twice or 429 four times fails, and that dismissing the cookie banner leaves nothing hovered. Its 5xx and 429 retry cases answer the pinned 404 page (or the channel's first page) with a 500, or a 429 with `Retry-After: 1`, once and then let the request through, so the second answer is the storefront's real one.
- `widget-screens.spec.mjs` runs with `qa:screens`, because the script's `screens` filter matches its name.
- `retry.test.mjs` covers the retry policy itself (the waits, `Retry-After` and the 30 s limit), `storefront.test.mjs` the server check's retries, and `raw-html/fetch.test.mjs` the raw-HTML fetch's.
- `storefront.test.mjs` also covers `QA_PORT`, the start log's name, the locks a gate holds (and the ports checked again after a slot wait), trusting only the server a gate started, and stopping that server when the gate is stopped by a signal. `playwright-config.test.mjs` covers that the config reads `QA_PORT` and holds the locks only in the runner, `prepush.test.mjs` what `qa:prepush` checks before its first gate, `serve.test.mjs` the locks around a `stencil start` by hand, and `scripts/lib/lock.test.mjs` the locks themselves: the stale rules, waiting, the three slots across processes, the signals, `RF_LOCK_ROOT`, and the command line `release.sh` uses.
- `npm run test:scripts` runs every `scripts/**/*.test.mjs` with `node --test`, the fixture renders included.
- Jest runs `assets/js/test-unit/`. `jest.config.js` ignores `scripts/`, because Jest 30 would otherwise match `*.test.mjs` and `*.spec.mjs` too.
- `screens-reference.spec.mjs` runs with `qa:screens`, because its name matches the filter, and never fails it. `review-live.spec.mjs` runs only when named. Neither is a gate. `review/manifest-reporter.test.mjs` checks both against `package.json`'s filters.
- Playwright writes its report, traces and failed diffs to `scripts/qa/results/`, which is ignored by git. The manifest reporter writes `results/manifest.json` there too, and the review pages go to `results/review/`. A run with `QA_PREVIEW_COOKIE` writes no traces, so the cookie never lands there.
