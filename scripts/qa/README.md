# Storefront quality gates

The checks every theme change is held to (ticket 16; spec "Testing Decisions", seams 1 to 3), and ticket 17's Lighthouse budgets.

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
| Lighthouse budgets (ticket 17) | `npm run qa:lighthouse` | no | after each push to prelaunch, with the operator's preview cookie (`release.sh` step 6b); without it the entry records "pending host batch", and the host batch runs it ([Lighthouse](#lighthouse-lighthousemjs)) |
| Host batch on the prelaunch host | `npm run qa:prelaunch` | no | no: once per checkpoint, in the operator's shell with the preview cookie ([Host batch](#host-batch-qaprelaunch)) |
| UI states (drawer, panel) and kind@name pins | with `qa:axe` and `qa:screens` | no | yes (release.sh, through `qa:prepush`) |
| Overlays | `QA_OVERLAY=<name> npm run qa:screens` (and `qa:axe`, `qa:raw-html`) | no | no: refused with `QA_FRESH_SERVER=1` ([Render modes](#render-modes-w0-8)) |
| Switch matrix: every pinned page with each module switch on and off (ticket 54a) | `npm run qa:matrix` | no | no: ticket 54's full pass, and each switch ticket for its own switch ([Switch matrix](#switch-matrix-and-the-extra-checks-ticket-54a)) |
| Reflow at 320, reduced motion, the focus tab-through (ticket 54a) | `npm run qa:reflow`, `qa:motion`, `qa:focus` | no | no: in the switch matrix and ticket 54's full pass |
| Home widget links answer 200 (ticket 54a) | `npm run qa:links` | no | no: ticket 54's full pass |

CI has no store credentials, so anything that renders the storefront runs locally or from `release.sh`. Every browser gate blocks the analytics tags, and on a live channel refuses every write ([Analytics and live-store writes](#analytics-and-live-store-writes-network-guardmjs)). `npm run qa:prepush` (`prepush.mjs`) runs axe, the raw-HTML check and the screenshot diffs, in that order. It runs all three even when one fails, exits non-zero if any failed, and ends with each gate's result.

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
| `QA_PORT` | `3300` | Browsersync's port; the stencil server takes the next one. Each agent's worktree runs on the pair the orchestrator assigns (3400, 3500 and so on), so parallel runs never share ports. `release.sh` always uses 3300. An overlay run takes `QA_PORT` + 10 and the port after it. See [Parallel runs](#parallel-runs). |
| `QA_ANALYTICS` | none (blocked) | `allow` lets the analytics tags load, on the prelaunch host only and only before the Flip (`scripts/release-calendar.json`); anything else is refused before the run starts. See [Analytics and live-store writes](#analytics-and-live-store-writes-network-guardmjs). |
| `QA_OVERLAY` | none | Render with an overlay from `scripts/qa/overlays/`, in a throwaway worktree, on `QA_PORT` + 10 ([Render modes](#render-modes-w0-8)). Refused with `QA_FRESH_SERVER=1` and `QA_BASE_URL`. |
| `QA_SCRATCH_DIR` | the system temp folder | Where an overlay's throwaway worktree goes |
| `RF_TICKET` | the branch | The ticket the run's locks name, for anyone waiting on them. |
| `QA_REFERENCE_HTML` | none | The reference page the review pages' reference screens are shot from, instead of `plan/design/reelflies-reference.html` above the checkout ("Review pages") |
| `QA_MANIFEST` | `scripts/qa/results/manifest.json` | The screenshot manifest a run writes, for example the host batch's in its `QA_RESULTS_DIR` ("Review pages") |
| `QA_RESULTS_DIR` | none | Set by the host batch to `scripts/qa/results/host/<uuid>/`, the folder a gate files its results in. Ticket 17's Lighthouse runner files its own in `lighthouse/` inside it. `release.sh`'s step 6b sets it too, to the pushed theme's folder. |
| `QA_RELEASE_COMMIT` | none | The pushed commit's full sha, set by `release.sh`'s step 6b, which runs Lighthouse before step 7 writes the push's `RELEASES.md` entry. The Lighthouse runner names the build by it instead of by the uuid's entry. Anything but a full sha is ignored. The host batch never passes one on from the shell: it names the build by the uuid's entry. |

**The preview cookie** is a control-panel login, so set it only in your own shell, where it isn't shown or kept in history, and never in a file or a chat (ticket 16):

```sh
read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE    # paste name=value; name2=value2, then Return
```

Without `QA_BASE_URL`, each gate uses `npx stencil start -c $QA_CHANNEL -v "$QA_VARIATION" -p $QA_PORT` (`scripts/qa/storefront.mjs`), after `node scripts/qa/custom-layouts.mjs`, which puts the committed custom layouts into `config.stencil.json` ([Render modes](#render-modes-w0-8)):

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
- **An overlay run takes the pair 10 above** (3410 and 3411 for a worktree on 3400), with its own port lock, so it never reuses or blocks the worktree's plain runs ([Render modes](#render-modes-w0-8)).
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
| `release` | `scripts/release.sh`, for the whole release, dry run or `--prune-only` ([releasing](../../docs/releasing.md)) | 90 min |
| `merge` | W0-13's `scripts/merge.sh` | 15 min |
| `stencil-1` … `stencil-3` | a gate run, while its `stencil start` runs | 30 min |
| `port-<n>` | a gate run on the ports `n` and `n + 1` | 30 min |
| `store-write` | W0-11's `scripts/store/apply.mjs`, from its first read to its last log row ([store writes](../../docs/store-writes.md)) | 45 min (the default for a lock with no limit of its own) |

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

**The channel-1 fallback.** ReelFlies_CA has no products and no tree-4 categories yet, so its product and category pages 404. Until they exist, `QA_CHANNEL=1` renders this repo's templates with live reelflies.ca data. It is read-only: stencil start passes every request through to the live store, so the gates refuse every write on channel 1 and 1855224 ([Analytics and live-store writes](#analytics-and-live-store-writes-network-guardmjs)). Channel 1 has only a product page and a category page pinned.

## Analytics and live-store writes (`network-guard.mjs`)

Every Playwright gate opens its pages through `fixtures.mjs`, which puts a guard on each test's browser context (`context.route`) before the test opens a page (W0-6). It does two things.

**It blocks the analytics tags,** on every channel and host:

- **Why:** the prelaunch host and the live stores load GA4 `G-BQ4RFFK3KW`, which reports into live reelflies.ca, Universal Analytics `UA-1225874-8`, the Meta Pixel `2233770690192958` and Omnisend. A gate's page views would count as visits. A local `stencil start` serves none of these tags today, but a store setting can add one at any time.
- **The list** is `analytics-hosts.mjs`, `ANALYTICS_HOSTS`, with what each entry is for:
  - Google: `googletagmanager.com`, `google-analytics.com`, `analytics.google.com` and `doubleclick.net`. That includes the legacy UA endpoints (`analytics.js`, `ga.js`, `/collect`, `/r/collect`)
  - Meta: `connect.facebook.net`, and `facebook.com/tr`
  - Omnisend: `omnisnippet1.com`, `omnisrc.com`, `soundestlink.com`, `omnisendlink.com` and `omnisend.com`
  - BigCommerce's own visitor beacon (`bes.gcp.data.bigcommerce.com`) and its data-layer events (`microapps.bigcommerce.com/bodl-events`)
- An entry matches its host and every subdomain, never a look-alike host. An entry with a path matches only that path and the paths below it. A blocked request is aborted (`net::ERR_BLOCKED_BY_CLIENT`) and never leaves the Mac.
- **Ticket 17's Lighthouse runner** passes the same list as `blockedUrlPatterns`: `lighthouseBlockedUrlPatterns()`.
- **Every result records it.** Each test carries the annotation "analytics blocked: yes" or "no", and the number of analytics requests it blocked. The run prints an `ANALYTICS` line before its first test, and the host batch puts it in its row.
- **A blocked run can't quietly send one.** If a request to a listed host completes while the tags are blocked, the test fails at teardown, naming it. Only a route ahead of the guard, such as a test's own mock of that URL, could let one through.
- **`QA_ANALYTICS=allow`** lets the tags load, but only on the prelaunch host (`QA_BASE_URL=https://reelflies_ca-1895766.mybigcommerce.com`), where a GA4 hostname filter can keep the run out of the reports.
  - It is refused on a local `stencil start`, on reelflies.ca, on reelflies.com and on any other host, before the run starts.
  - It is also refused from the Flip on. The Flip date comes from W0-13's release calendar (`scripts/release-calendar.json`, read with `scripts/lib/release-calendar.mjs`), by the date in Toronto, where the store is. A calendar that is missing or malformed stops the run, so a typo never reads as "no Flip". After the Flip the prelaunch host is live reelflies.ca, and no filter can tell a run from a real visit.
  - The budgets and the drop rule stay on blocked runs, so they compare like with like (ticket 17). The host batch adds one run with the tags loaded, for information, once ticket 08 records the filter.
- The raw-HTML check runs no JavaScript, so no tag loads there, and its output says so.

**On a live channel it refuses writes:**

- **When:** `QA_CHANNEL` is `1` (reelflies.ca) or `1855224` (reelflies.com), or `QA_BASE_URL` is any host but the prelaunch host. From the Flip date in the release calendar, every channel counts as live, 1895766 included, because it is then live reelflies.ca.
- **Why:** `stencil start -c 1` and `-c 1855224` pass every request through to the live store. Mocking cart endpoints one by one fails open: one missed endpoint (`/remote/v1/cart/add`, `/api/storefront/carts`, a request queue, the card's "Add to cart" link) would make a real guest cart on a live site.
- **What counts as a write:**
  - every request that isn't a GET, HEAD or OPTIONS
  - **the GETs that change something** (`GET_WRITES` in `read-only-posts.mjs`), on any host, as a HEAD too. BigCommerce adds to the cart on a GET: the stock card's, list item's and compare page's "Add to cart" is a link to `/cart.php?action=add&product_id=N`. So is `action=buy`, and so are the cart page's "Remove" links for coupons, gift certificates and gift wrapping. Any `/cart.php` with an `action`, any `/remote/v1/cart/…`, any `/wishlist.php` with an `action`, and `/login.php?action=logout` count. `/cart.php` without an action, and `/api/storefront/carts`, stay reads.
- **What happens:** each write is aborted (`net::ERR_ACCESS_DENIED`), so it never reaches the store, and recorded. A clicked "Add to cart" link is refused the same way. At teardown the test fails, naming the method and URL of each write. The run prints a `WRITES` line, and each test carries a "writes refused" annotation.
- **Playwright's request API is guarded too.** The `request` fixture, `context.request`, `page.request` and `route.fetch()` never pass through `context.route`. So the guard checks each of their calls before it is sent. A write it would refuse throws, naming it, and also fails the test at teardown. A call to an analytics host throws while the tags are blocked. The gates answer the consent POST themselves only for a page; through the request API it is refused. Every call goes through Playwright's internal `APIRequestContext._innerFetch`, which the pinned Playwright 1.59.1 has. A Playwright without it stops every run until `guardRequestContext` is updated, and `harness-selftest.spec.mjs` checks the hook on each run. A test never makes its own `playwright.request.newContext()`, which nothing guards.
- **The exceptions,** both in `read-only-posts.mjs` and only on the storefront under test:
  - **`READ_ONLY_POSTS` go through:** `POST /remote/v1/product-attributes/<id>` (the price and stock for the options chosen on a product page or in Quick view), and a storefront GraphQL `POST /graphql` whose body is plain queries with no `mutation` anywhere in it.
  - **`LOCAL_ANSWERS` are answered by the gates themselves:** `POST /api/storefront/consent`, which "Reject all" on the cookie banner sends (`dismissCookieBanner`). The banner hides whatever the answer, so it gets a 204 and the choice never reaches a live store. A test that sent it carries a "writes answered by the gates" annotation.
  - **A request a test mocks itself** (`page.route`, or a `context.route` added in the test) is answered by its mock and never reaches the guard. A test's route may only `route.fulfill()`, `route.abort()` or `route.fallback()`, which hands the request back to the guard. **Never `route.continue()`:** it sends the request straight to the network, past the guard, and nothing records it. `route.fetch()` is guarded (above).
- **Adding a read-only POST:** add it to `READ_ONLY_POSTS` with the reason it changes nothing, and a case to `read-only-posts.test.mjs`. Otherwise mock the request in the test.
- **On ReelFlies_CA** (1895766, through `stencil start` or the prelaunch host) nothing is refused before the Flip, because the prelaunch store isn't live yet. Real adds there wait for refactor 14's products.
- **A self-test can only tighten it.** `test.use({ qaChannel: '1' })` lets a self-test act as channel 1 on a 1895766 run. On a run whose `QA_CHANNEL` is live, every test stays guarded as that channel, whatever its `qaChannel` says.
- **Service workers are blocked** in the gates (`serviceWorkers: 'block'`), because a request a service worker answers never reaches `context.route`. The store registers none.

**The proof:**

- `harness-selftest.spec.mjs` runs with `qa:axe`, `qa:screens`, `qa:quick-view`, `qa:reflow`, `qa:motion` and `qa:focus`, and in every row of `qa:matrix`. In a context of its own, whose first route answers everything itself so no request leaves the Mac, it shows:
  - a request to every host on the list is aborted, an image, a script, a fetch and a beacon among them
  - every cart write is refused on channel 1, the GETs that add to the cart and a `\u`-escaped GraphQL mutation included, and the guard names each one
  - the stock card's "Add to cart" link, clicked, is refused
  - writes through `page.request`, `context.request` and a test route's `route.fetch()` are refused before they are sent, and a read through `page.request` is sent
  - the read-only POSTs go through, and the consent POST gets the gates' own answer
  - a test's own mock answers a write
  - an analytics request that a route ahead of the guard let through is caught
  - writes go through on ReelFlies_CA
- More tests use the fixture itself: every gate test blocks the tags and records it; a test on channel 1 that posts to the cart fails at teardown; the `request` fixture and `page.request` are guarded; and a test that asks to be guarded as 1895766 stays live on a live run. Their writes go only to `http://rf-qa-selftest.test`, which never resolves, so even a broken guard sends nothing to a store.
- `analytics-hosts.test.mjs`, `read-only-posts.test.mjs` and `network-guard.test.mjs` check the list against the tags reelflies.ca loads, the Lighthouse patterns, `QA_ANALYTICS`, and each allowed, answered and refused request.

## Pinned pages and live data

`scripts/qa/pages.mjs` is the one place that says which page each gate visits, per channel:

- **Page keys** are the spec's template names: `home`, `fly-type`, `species`, `species-hub`, `product`, `cart`, `hook-chart`, `404` and `brand`, plus `category` for the stock category template until ticket 32. A channel pins more pages of one kind as `kind@name`, such as `product@5663` or `product@sold-out` ([Render modes](#render-modes-w0-8)).
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

## Render modes (W0-8)

`stencil start` reads only `config.json`, and a theme has at most four variations, three of them taken (CA, US and ticket 53's channel-1 variation). Tickets 27, 28, 42, 43, 52 and 54 need renders with a switch off or the menu ids empty, tickets 32, 34 and 35 need custom templates, and tickets 37–44 need more than one product or listing pin. These four modes give each of them once. Each has its own tests in `pages.test.mjs` and `playwright-config.test.mjs`, with more in `overlays.test.mjs`, `custom-layouts.test.mjs`, `storefront.test.mjs` and `raw-html/raw-html.test.mjs`.

### Several pins per page kind (`pages.mjs`)

A channel's `pages` keys are a kind, or `kind@name` for another pin of the same kind:

```js
pages: {
    product: '/realistic-flying-hot-butt-hopper-brown/',
    'product@5663': '/fat-albert/',                 // a second product pin
    'product@sold-out': '/a-product-sold-out-in-every-size/',
},
```

- **By kind:** the status the page must answer (`404@x` answers 404), the raw-HTML assertions (`pages: ['product']` covers every product pin), `RAW_HTML_REQUIRED` and `notPinnedYet` (a `product@x` pin counts as the product page), the axe allowlist's `templates`, and the reference screen it is shown beside.
- **By the whole key:** its baseline (`product@sold-out-phone-375-darwin.png`), a channel's `mask` and `hold` (`mask: { category: [...] }` masks the plain `category` pin only, so a stable `category@alpha` beside it keeps its cards), and a UI state's `pages`.
- A raw-HTML assertion may also name one pin: `pages: ['product@sold-out']`, or `notOn: ['product@sold-out']`.
- Add pins and their `mask` or `hold` lines only, as section 6.5 of the build pipeline says, and declare them on the `Baselines:` line as `product@sold-out`.

### UI states (`states.mjs`)

The screenshots and axe open each state in `UI_STATES` on the pins it names, at the projects it names, and check the page with it open as well as closed. The registry is its own module, imported by `screens.spec.mjs` and `axe.spec.mjs`, because `node --test` can't import a spec.

| State | Opens | At | On | Owner |
|---|---|---|---|---|
| `drawer-open` | the phone menu: stock Cornerstone's Menu toggle and `#menu` today | `phone-375` | `home` (ReelFlies_CA) | 28 points it at the grouped drawer |
| `panel-open` | the desktop menu panel: stock Cornerstone's sub-menu of the first top-level category today, opened from the keyboard | `desktop-1280` | `category` (channel 1) | 28 points it at the "Shop flies" panel |
| `sheet-open` | a slot for the quick-add sheet and popover | | | 43 adds it |

- **A state shot** is the viewport as it shows with the state open, because a fixed drawer or sheet covers the viewport rather than the page. A state can ask for `fullPage: true`. It has the page's masks and stylesheet. Its baseline is `<key>~<state>-<project>-<platform>.png`, covered on the `Baselines:` line by its page kind.
- **Each state's `open(page)`** resolves once the state is open, and leaves the pointer off the page, so no hover state shows in the shot. A ticket that rebuilds the UI points `open` at its own, and may wait for its token in `<html data-rf-open>` (build pipeline, section 6.9). A ticket adds a state in its own slot in the registry, with its pages.
- **axe** allows a known issue in one state only through its `states` (above, "axe"). The stock sub-menu has three, which ticket 28 removes.
- `drawer-open` and `panel-open` show live data: channel 1's sub-menu lists its live tree-1 categories, as its header already does. A change there moves the state's baseline like the page's, through a re-baseline epoch.

### Overlays (`overlays/`, `overlays.mjs`)

An overlay is a JSON patch of `config.json`'s settings, in `scripts/qa/overlays/<name>.json`:

```json
{
    "description": "The rise ring switched off: the cart count as stock, with no ring markup and no rise script (ticket 27)",
    "ticket": "27",
    "settings": { "rf_rise": false }
}
```

```sh
export QA_PORT=3400                              # the worktree's own pair
QA_OVERLAY=rf_rise-off npm run qa:screens        # renders on 3410 and 3411
QA_OVERLAY=rf_rise-off npm run qa:axe
QA_OVERLAY=rf_rise-off npm run qa:raw-html
QA_OVERLAY=rf_rise-off node scripts/qa/serve.mjs # by hand
```

- **The overlays today:** `rf_rise-off` (27), `menu-ids-empty` (28's stock fallback) and `species-empty` (28: no Species group), and one per module switch for the switch matrix (ticket 54a): `rf_cart_state-off` (42), `rf_quick_add-off` (43) and `rf_region_prompt-on` (52). A module ticket records its overlay's baselines when its module lands; a new switch adds its overlay in the same PR.
- **Only declared settings.** An overlay is refused while `config.json` doesn't declare one of its settings, or when a value has another type than the declared one, because the render would look unchanged and pass for the overlay. Ticket 25's scaffold declares every module switch and both menu ids, so all six above run; an overlay for a new setting runs once the PR that declares it has landed. A misspelt key in the file, a missing `description` or an empty `settings` is refused too.
- **The patch** sets each value in the base settings and in every variation's, so it renders whatever `QA_VARIATION` is. It also sets `rf_qa_overlay` to the overlay's name. `?debug=context` shows it in `theme_settings`, and the gates check it: an overlay run trusts only a server that renders its overlay, and a plain run never trusts one that renders any overlay.
- **A throwaway git worktree.** The run makes a worktree of the checkout's working tree as it is, uncommitted and untracked changes included, through a temporary index (the checkout's index, branch and files stay as they were). It goes in `QA_SCRATCH_DIR`, or the system temp folder, as `rf-qa-overlay-<port>-<overlay>-…`. Its `node_modules`, `secrets.stencil.json` and `config.stencil.json` are links to the checkout's own, never copies. Only its `stencil start` runs there: Playwright, the specs, the baselines and the manifest stay in the checkout. It is removed when the run ends, also on Ctrl-C, `SIGTERM` or `SIGHUP`. One a killed run left on the same port is removed, with a `STALE` line, by the next overlay run on that port, which holds the port lock. It is found by its name among the repo's worktrees, whatever `QA_SCRATCH_DIR` either run had, and a worktree on a branch is never removed, whatever its folder is called.
- **Its own ports and server.** An overlay run takes `QA_PORT` + 10 and the port after it, with that pair's lock and a stencil start slot, and never reuses a running server.
- **Never from the main clone,** whose `node_modules` the release's `npm ci` replaces mid-run. The checkout must have its own `node_modules` (a link out of the worktree is refused), and `secrets.stencil.json` and `config.stencil.json` (linked or copied; the run never reads the secrets file).
- **Never in a release.** An overlay is refused with `QA_FRESH_SERVER=1`, which `release.sh` sets, and with `QA_BASE_URL`, whose host renders its own `config.json`.
- **Baselines** carry the overlay's name: `home+rf_rise-off-phone-375-darwin.png`, and `home~drawer-open+rf_rise-off-phone-375-darwin.png` for a state under it. Record them with `QA_OVERLAY=<name> npx playwright test --config scripts/qa/playwright.config.mjs screens.spec --update-snapshots=missing`, which writes only the missing files and fails each test it writes one for (Playwright's "writing actual"); run it again to see them pass. Declare them as `overlay <name>`. The widget shots and the reference screens skip under an overlay, because they don't render from the server.

### Custom layouts (`custom-layouts.json`, `custom-layouts.mjs`)

On the store, a custom template is chosen by a template association, which belongs to the uploaded theme. `stencil start` renders `templates/pages/custom/<type>/<file>` for a URL only when `config.stencil.json`'s `customLayouts` maps the file to that URL. So the mappings the gates need are committed in `scripts/qa/custom-layouts.json`:

```json
{
    "brand": {},
    "category": { "rf-noindex.html": "/flies/realistic-trout-flies/realistic-nymphs/" },
    "page": { "hook-size-chart.html": ["/fly-hook-size-chart/"] },
    "product": {}
}
```

- **Every `stencil start` the gates make** runs `node scripts/qa/custom-layouts.mjs` first, in the folder it starts in, the checkout or an overlay's worktree. That merges the committed mappings into that folder's `config.stencil.json`, the run's copy. So does `serve.mjs`.
- **The committed mappings come first,** so they win: stencil-cli takes the first file that maps a URL. A mapping made by hand is kept after them, with a `WARNING` line, because no other checkout renders with it. One for a URL the committed file maps is dropped.
- **A link is replaced by a copy before it changes,** with a `COPY` line, so the main clone's `config.stencil.json` never changes through a worktree's link. Nothing is written while the file already has the mappings, so a link stays a link until the committed file maps something.
- **From the main clone,** the release's gates included ([docs/releasing.md](../../docs/releasing.md), step 4) and the orchestrator's checkpoint runs, `config.stencil.json` is a file, not a link. So once the committed file maps something, the step writes `master`'s mappings into the main clone's own `config.stencil.json`. That is intended: the release renders the custom-template pins. A worktree whose `config.stencil.json` links to that file then reads `master`'s mappings too. One its branch doesn't commit yet gets a `WARNING` and is kept, as a hand-made mapping is, until the branch is rebased onto `origin/master`.
- **A problem stops the start** before anything is written: a type other than `brand`, `category`, `page` and `product` (stencil-cli's), a template that doesn't exist, a URL that isn't a path on the store, or one URL mapped to two files.
- The page must exist on the store as that type, such as a category on channel 1 or a Web Page on 1895766. Pin it in `pages.mjs` (for example `category@noindex`), and add the mapping in the same PR as the template.
- `stencil start` reads `config.stencil.json` once, when it starts, so stop a running server after changing `custom-layouts.json`. A plain run reuses a running server.
- The file maps nothing today. Tickets 32, 34 and 35 add theirs.

## Switch matrix and the extra checks (ticket 54a)

Ticket 54's full pass on prelaunch (54b, after refactor 14) needs checks the release's gates don't run: every pinned page with each module switch on and off, reflow at 320, reduced motion, a focus tab-through, and the home widget links. Ticket 54a builds them now, so each module ticket can run them on its own switch as it lands.

None of them runs in CI or in `qa:prepush`. They are for the full pass, the module tickets and the checkpoints, and the reduced-motion check fails on stock Cornerstone until ticket 25's skin adds its reset (revisitable).

### The module switches (`switches.mjs`)

The module switches are config.json's boolean `rf_*` settings: `rf_rise` (27), `rf_cart_state` (42), `rf_quick_add` (43) and `rf_region_prompt` (52). `SWITCHES` has one entry per switch, in ticket order with a blank line between entries, so each ticket changes only its own lines:

| Key | What |
|---|---|
| `ticket`, `module` | who owns the switch, and what it switches |
| `markers` | the `data-rf-*` attributes the module's markup carries. With the switch off, no element on the page may carry one. |
| `chunks` | the `webpackChunkName` of each script the module loads, such as `rf-quick-add`. With the switch off, the page may not load one. |
| `stock` (optional) | the stock markup the module replaces or guards, as page kind → CSS selectors. With the switch off, each must match on every pin of that kind, so a module that changes stock markup while off fails even with its markers and chunks gone. Quick add (43), for example, would name the stock card's Quick view button (`card.html:80-84`) on the kinds that list cards. |
| `query` (optional) | `{ show, hide }`: the QA overrides of a module its switch alone doesn't show on the runner. Only `rf_region_prompt` has them: `rf_region=out` and `rf_region=in` (ticket 52). See [A module that waits for a QA override](#a-module-that-waits-for-a-qa-override-switch-queryspecmjs). |
| `notOn` (optional, with `query`) | the page kinds the module never shows on, even with `show`: the prompt's is `cart` |

- **A switch is in the matrix once a template reads it** (`theme_settings.<switch>`, outside a Handlebars comment). Until then its module hasn't landed: the scaffold pre-declares every switch, and flipping one that nothing reads renders the same page.
- **When your module lands, fill in your entry's `markers` or `chunks`, or both, and `stock` if it replaces or guards stock markup.** `switches.test.mjs` fails, naming your switch, while a template reads it and its entry names neither. It also fails a marker or chunk that no template, and no script under `assets/js`, has. A script may write a marker as `data-rf-…` or through `dataset`. `rf_region_prompt`'s marker is already there: the prompt's root, `data-rf-region-prompt`.
- **Each switch has an overlay that flips its base value:** `rf_rise-off`, `rf_cart_state-off`, `rf_quick_add-off` and `rf_region_prompt-on` (off everywhere by default). `switches.test.mjs` checks that every switch has one, so a new switch adds its own.
- **Record your overlay's baselines with your module,** as for any overlay ([Render modes](#render-modes-w0-8)). The matrix's screenshot gate fails a row whose overlay has none.

### The switch matrix (`switch-matrix.mjs`)

```sh
export QA_PORT=4300            # the worktree's own pair; the overlay rows take 4310 and 4311
npm run qa:matrix -- --list    # the plan only: which rows, and which switches wait
npm run qa:matrix              # every row
```

- **The rows:** the plain run, with every switch at its value for `QA_VARIATION`, then one row per landed switch. Each of those renders with the overlay that sets its switch the other way and changes nothing else, so each switch is seen on and off.
- **A switch that no template reads** is listed under "Not in the matrix yet", with its ticket, and doesn't fail the run: a switchable module that isn't ready ships switched off (ticket 10's rule).
- **What fails the plan:** a landed switch with no overlay to flip it (the line names the file to add), and a boolean `rf_*` setting with no entry in `SWITCHES`.
- **What each row runs.** Each command starts its own stencil start: an overlay never reuses one, and the plain row reuses only a server that renders it.
  1. Playwright with the matrix's specs (`MATRIX_SPECS`): the screenshot diffs, axe, `switch-stock` and `switch-query` (below), reflow, reduced motion, focus, and the network guard's self-test. The filters are anchored to each file's name, so the widget shots, the screenshot self-test and the reference screens don't run. Each spec is a gate of its own: the run writes a JSON report to `results/matrix/<row>.json` (`RF_QA_JSON_REPORT`, which `playwright.config.mjs` adds beside its own reporters), and the matrix reads each spec's result from it.
  2. The raw-HTML check, on the plain paths: the server HTML never holds a module that is only made in the browser, whatever the query.
- **A row with `rf_region_prompt` on opens every page with `?rf_region=out`,** and makes the first interaction the prompt waits for, so its screenshots, axe, reflow, motion and focus see the card ([below](#a-module-that-waits-for-a-qa-override-switch-queryspecmjs)). The plan prints it beside the row: `rf_region_prompt on  the overlay rf_region_prompt-on, every page opened with ?rf_region=out`, and `summary.json` keeps each row's `query`.
- **The output:** the plan, then one line per gate per row (`ok` or `FAIL`, with the first failures under it), then the verdict. Every row runs, whatever the rows before it did.
  - It exits 1 if a gate failed or the plan has a problem, and 2 if it couldn't start.
  - `results/matrix/summary.json` keeps the plan and each gate's result, for ticket 54b's report.
  - Each row's screenshots go into the screenshot manifest under their overlay's name, for the review pages.
- **It refuses** `QA_OVERLAY` (it sets that itself, row by row), `QA_BASE_URL` and `QA_FRESH_SERVER=1`: an overlay renders only on a local stencil start, and never in a release.
- **One switch by hand:** `QA_OVERLAY=rf_quick_add-off npx playwright test --config scripts/qa/playwright.config.mjs switch-stock`, and `npm run qa:screens`, `qa:axe` and the rest with the same `QA_OVERLAY`.

**Stock markup with a switch off** (`switch-stock.spec.mjs`; stories 35 and 73). On every pinned page, at 375 and 1280, once the page has loaded, no element carries a marker of a switch that is off in the run, the page requested no chunk of one, and each `stock` selector its entry names for the page's kind matches.

- The run's switches are config.json's for `QA_VARIATION`, with `QA_OVERLAY`'s on top. So the plain run checks what its variation turns off (`rf_region_prompt` in ReelFlies CA), and each matrix row checks the switch its overlay turns off.
- A test whose switched-off modules name no markers, chunks or stock markup yet is skipped, with the reason.
- **What it doesn't prove alone:** that the rest of the page is stock. The off row's screenshots do that, against baselines its module ticket records, so a reviewer compares those PNGs with `master`'s plain ones from before the module's PR; `stock` makes the part that matters most a check.

### A module that waits for a QA override (`switch-query.spec.mjs`)

Ticket 52's outside-Canada prompt shows only to a visitor outside Canada, and only after their first scroll, tap or key press. The runner's time zone is `America/Toronto` (`playwright.config.mjs`), which ticket 52 counts as a veto, and no pin carries `?rf_region=`. So with its switch on and nothing else, every page would render as the plain row and pass without the card. Its `SWITCHES` entry names its QA overrides (`query`), and:

- **A run with a switch on that has a `query`** (the matrix's `rf_region_prompt on` row, or `QA_OVERLAY=rf_region_prompt-on`) opens every pin with the `show` override, `?rf_region=out` (`SWITCH_QUERY` and `pinPath` in `fixtures.mjs`). After the page settles, `storefrontPage` presses Shift, the first interaction (it moves no focus, scrolls nothing and fires on a page too short to scroll), and waits up to 5 s for the card (`firstInteraction` in `page-checks.mjs`). Every other run opens and settles its pages exactly as before, so no plain baseline changes.
- **`switch-query.spec.mjs`** checks both overrides on every pin, at 375 and 1280:
  - `show`: the card is on the page after the first interaction, and on the cart (`notOn`) it isn't. If the card didn't show, this gate says so, because the row's other gates then never saw it.
  - `hide` (`?rf_region=in`): after the first interaction and 2 s more, nothing carries `data-rf-region-prompt`, though the switch is on.
- On a run with no such switch on it is skipped, with the reason: every run until ticket 52 lands.
- The raw-HTML check stays on the plain paths. The card is only ever made in the browser, and its `prompt absent` assertion holds the server HTML.
- **By hand:** `QA_OVERLAY=rf_region_prompt-on npx playwright test --config scripts/qa/playwright.config.mjs switch-query`.

### Reflow, reduced motion and focus

Each is a thin spec over `page-checks.mjs`. `page-checks.test.mjs` proves each check on fixture pages in Chromium, with a failing fixture beside each passing one. Each spec covers the pinned pages of `QA_CHANNEL`, kind@name pins included, and renders with `QA_OVERLAY` when it is set. None takes a screenshot or has a baseline.

| Check | Command | What fails | On |
|---|---|---|---|
| Reflow at 320 (story 71) | `npm run qa:reflow` | The page is wider than the viewport at 320 x 568, so it scrolls sideways. The failure names the outermost boxes past the edge that no ancestor clips: a carousel's track, which its frame clips, doesn't count. | Every pin, as a phone (`phone-375`'s mobile emulation) and as a desktop browser zoomed to 400% (`desktop-1280`), which is WCAG 1.4.10's case |
| Reduced motion (story 69) | `npm run qa:motion` | With `prefers-reduced-motion: reduce` emulated: an animation still running after the cart count goes up, which is when the rise ring plays (ticket 27). Or any transition or animation an element, `::before` or `::after` declares, or smooth scrolling. Both count only above 10 ms (`MOTION_LIMIT_MS`), because a reset usually sets 0.01 ms. | Every pin, at 375 and 1280 |
| Focus tab-through (story 67) | `npm run qa:focus` | Tabbing from the top of the page to the end (250 Tabs at most), a focused element whose centre, by `elementFromPoint`, is under a fixed or sticky box that doesn't hold it: the sticky header, the sticky bars (38, 41) or the prompt card (52), which shows only on a run with `rf_region_prompt` on ([above](#a-module-that-waits-for-a-qa-override-switch-queryspecmjs)). | The product and cart pins, at 375 |

- **Reduced motion fails on stock Cornerstone, on every page.** It has no reset, and its buttons, links and menus declare transitions. Ticket 25's skin adds "a global reduced-motion reset" (spec module 1), and each failure says so.
- **The cart count goes up the way an add sends it** (build pipeline, section 6.9): the stock `cart-quantity-update` on `<body>`, then `rf:cart-changed` on `document`. Nothing reaches the store.
  - **jQuery isn't global in this build.** `webpack.common.js` aliases `jquery` to `jquery.min.js`, and its `expose-loader` rule matches only `jquery.js`, so `window.$` is never set. So on the storefront the check can't send the stock event with a count. It makes the change the stock handler makes instead (`cart-preview.js`): the `.cart-quantity` text goes up by one and gets `countPill--positive`. Then it sends `rf:cart-changed`. The test's "cart count" annotation says which way it went.
  - **So a rise ring (ticket 27) is checked here only if it plays on one of those:** `rf:cart-changed`, or a change to the count. One that listens only to the stock jQuery event isn't seen.
- **The tab-through notes, without failing,** a focused element with no visible box, one whose centre is off screen, and one that another element (not fixed or sticky) lies over. Those are for ticket 55's keyboard pass.

### Home widget links (`widget-links.mjs`)

```sh
export QA_PORT=4300 && npm run qa:links                                           # through a local stencil start
QA_BASE_URL=https://reelflies_ca-1895766.mybigcommerce.com npm run qa:links    # the prelaunch host, with QA_PREVIEW_COOKIE read first
```

This is ticket 54's "every link in the home widgets returns 200 with no redirect", which tickets 47 to 49 leave to 54.

- It fetches the channel's home pin with no JavaScript, as `qa:raw-html` does, and finds every `<a href>` inside an element with `data-widget-id`, which is how Page Builder and the Widgets API render a widget. Links in comments and scripts don't count.
- It fetches each link to the storefront once, with a GET that follows no redirect. A link passes only on 200: a 301 fails, naming where it points.
- A link to the store's own host counts as the storefront's. A local run reads that host from `?debug=context`, and fetches the path through its own server.
- **Not fetched, and listed:**
  - another host, as a `WARNING`, so a link from prelaunch to live reelflies.ca shows
  - a link that changes the cart or the session on a GET (`GET_WRITES` in `read-only-posts.mjs`), as a `WARNING`
  - a link within the page, and `mailto:`, `tel:` and `javascript:` links
- **A home page with no widget yet passes, with a `WARNING`.** The widgets are tickets 46 to 49's.
- The preview cookie goes only to `QA_BASE_URL`'s host. It exits 1 when a link or the home page failed, and 2 when the storefront can't be reached.

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
- An entry's `templates` are page kinds or `kind@name` pins. Its optional `states` limits it to the page with one of those UI states open; without it, it covers the page in every state.
- **The list holds three entries, all with the stock desktop sub-menu open** (`panel-open` on channel 1's category page; W0-8, 2026-10-06): `aria-hidden-focus`, `color-contrast` and `target-size`. Ticket 28 replaces the sub-menu with its panel and removes them. The closed stock templates had no serious or critical issues on ReelFlies_CA (home, cart, 404, brand) or on the channel-1 product and category pages on 2026-10-05, and the stock phone menu open (`drawer-open`) has none.
- The moderate issues found (no `<main>` landmark, content outside landmarks, heading order, duplicate landmarks) are ticket 25's.

## Screenshots (`screens.spec.mjs`)

**Baselines:** `scripts/qa/baselines/<channel>-<variation>/<key>[~<state>][+<overlay>]-<project>-<platform>.png` (`baselineName` in `pages.mjs`). For example, `baselines/1895766-reelflies-ca/home-phone-375-darwin.png`, `home~drawer-open-phone-375-darwin.png` for the phone menu open, and `home+rf_rise-off-phone-375-darwin.png` under an overlay.

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

**Declaring changed baselines** (W0-13). Every PR body ends with a `Baselines:` line naming the page kinds, overlays and widgets it changes on purpose, for example `Baselines: product, product@sold-out, overlay rf_rise-off`, `Baselines: home, widget home-lead, widget rf-selftest`, or `Baselines: none`. The `baseline-scope` CI check, and `scripts/merge.sh` again before it merges, fail a PR that changes, adds or deletes any PNG here outside them.

- **Page baselines:** the check reads the name as `<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png`, which is the shape `baselineName` gives W0-8's pins, UI states and overlays (`pages.test.mjs` checks each against the check's parser). A UI state's baseline is covered by its page kind, and an overlay's only by `overlay <name>`.
- **Widget shots** (W0-9): the check reads `widgets/<variation>/<widget>-<case>-<project>-<platform>.png`, the name `widget-screens.spec.mjs` gives each fixture's shot (`check-baseline-scope.test.mjs` checks every shot the spec would take, and every committed one). `widget <name>` covers that widget's shots in every case, variation and width. Name several as separate items: `widget home-lead, widget best-sellers`. No page kind or overlay covers a widget shot. Because widget and case names both hold hyphens, a shot that two widgets could own (`rf-hero` and `rf-hero-banner`) needs both declared, so don't name a widget as another's name plus a hyphen.
- **Anything else:** a PNG in any other shape, or a widget shot that no folder in `widgets/` or `render/selftest/widgets/` owns, is covered only by a re-baseline epoch (`Baselines: epoch <cause>`), and an epoch PR changes nothing but baselines.

[docs/guardrails.md](../../docs/guardrails.md), "Declaring changed baselines", has the rules.

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
- It runs every registered assertion on each page. An assertion's `pages` and `notOn` pick the page kinds it applies to: a kind covers every pin of it, and a `kind@name` names one pin.
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
- `findTags(html)`, with no name, returns every start tag, in page order (`one-main`, `rf-icon-sheet` and `rf-live-region` use it).
- `markupOnly(html)` returns the HTML with comments removed and those text-only elements emptied, their tags kept, so a text search sees only markup (`rf-live-region` uses it).
- `scriptsOfType(html, type)` returns script contents, such as JSON-LD.

**Tests:** add a fixture page to `raw-html/fixtures/` and a case to `raw-html/raw-html.test.mjs`, or a test file of your own beside it (ticket 25's is `page-frame.test.mjs`), with a failing fixture and a passing one. Every fixture page runs every registered assertion, so a fixture of a whole page carries what every page has: the icon sheet and the live region right after `<body>`, and one `<main>`. CI runs them through `npm run test:scripts`. `raw-html/fetch.test.mjs` checks that the preview cookie reaches `QA_BASE_URL` and never a host a redirect points at.

**The assertions today:**

| Assertion | Ticket | Checks |
|---|---|---|
| `one-canonical` | 16 | exactly one canonical link; not asked of the cart or the 404 page, which have none in stock Cornerstone |
| `json-ld-parses` | 16 | every `application/ld+json` block parses |
| `no-region-prompt` | 16, then 52 | no element carries `data-rf-region-prompt` |
| `one-main` | 25 | exactly one main landmark: a `<main>`, or an element with `role="main"`, counted once. `body.html` makes the wrapper a `<main>` on home, product and cart only |
| `rf-live-region` | 25 | exactly one `data-rf-live-region` element, with `role="status"`, empty in the server HTML |
| `rf-icon-sheet` | 25 | the ReelFlies icon sheet (`data-rf-icons`) once, as the first element in `<body>`, with `aria-hidden="true"` |

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
- **W0-8's overlay runs** record into the same manifest, with the overlay's name in each entry. Only the overlay's `stencil start` runs in its throwaway worktree: Playwright, the baselines and the manifest stay in the ticket's checkout, so nothing needs copying back. UI state shots carry the state's name the same way.

**The reference screens.** `screens-reference.spec.mjs` runs with every `npm run qa:screens`. It shoots each storefront screen of the reference design, `plan/design/reelflies-reference.html`, at 375 and 1280 into `results/reference/`:

- The page's Options are set first: "Heading face" Onest, the fly-type links row off, sage buy buttons, a visitor in Canada and no build notes (`REFERENCE_SETTINGS` in `review/reference.mjs`).
- Each shot is the store frame alone, 1280 px wide on desktop and 375 on a phone.
- The anchors are `home`, `fly-type` (Dry Flies), `species` (Trout Flies), `species-hub`, `hook-chart`, `product` (4877, Adams Parachute), `cart` and `brand` (`REFERENCE_ANCHORS`). A template is compared with the anchor of the same name. The stock `category` template is compared with `fly-type`, which ticket 32 turns it into, and `404` has no reference screen.
- The page is found in `plan/design/` above the checkout, from the main clone or any worktree, or at `QA_REFERENCE_HTML`. Where it isn't (CI, another machine), the spec is skipped.
- **It can't fail the run.** `qa:screens` is the release's screenshot gate, and the reference page changes outside git, so nothing here is a baseline or a gate. A screen it can't shoot (an Option control gone, a hash route that no longer shows its screen, a `QA_REFERENCE_HTML` that isn't there, or its 120 s running out) is recorded in the manifest with the problem. The review page then says which screens weren't shot and why. `review/reference-run.test.mjs` proves it on a broken page.

**Review renders** (`review-live.spec.mjs`) are pages shot as they render, with nothing masked and no baseline. No `qa:*` script runs them:

- **ReelFlies_CA's home page with its widgets,** for section 6. Page baselines hide widget regions, so this is where they show.
- **Every page pinned for reelflies.com (1855224),** for section 5. .com has no baselines, so these are its renders. `pages.mjs` pins its home page; pin a product and a category there too. The gates refuse writes and block analytics there (W0-6).

```sh
npx playwright test --config scripts/qa/playwright.config.mjs review-live    # ReelFlies_CA's home page, this checkout through stencil start
QA_CHANNEL=1855224 QA_VARIATION='ReelFlies US' npx playwright test --config scripts/qa/playwright.config.mjs review-live    # .com
```

The prelaunch host's own build can be shot too. Its pages load GA4, which reports into live reelflies.ca, so the gates block the tags there as everywhere (W0-6). Read the cookie as in "The storefront the gates test", then run `QA_BASE_URL=https://<prelaunch host> npx playwright test --config scripts/qa/playwright.config.mjs review-live`.

**A checkpoint page,** from a clean `master`, holding the stencil lock for the runs:

```sh
rm -f scripts/qa/results/manifest.json   # start from this commit's shots only
npm run qa:screens                       # ReelFlies_CA, with the reference screens
QA_CHANNEL=1 npm run qa:screens          # channel 1's product and category
npx playwright test --config scripts/qa/playwright.config.mjs review-live
QA_CHANNEL=1855224 QA_VARIATION='ReelFlies US' npx playwright test --config scripts/qa/playwright.config.mjs review-live
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

## Lighthouse (`lighthouse.mjs`)

Ticket 17's speed and accessibility budgets: mobile Lighthouse, three runs of each URL, and the median of each metric held to the budgets and to the drop rule (spec "Testing Decisions", seam 3; stories 68, 70, 72 and 78).

```sh
export QA_PORT=4100 && npm run qa:lighthouse                           # a local stencil start of this checkout
npm run qa:prelaunch                                                   # the host batch runs it on the prelaunch host
QA_BASE_URL=https://reelflies_ca-1895766.mybigcommerce.com npm run qa:lighthouse   # by hand, with QA_PREVIEW_COOKIE read first
```

**The URLs** are in `lighthouse-urls.json`, one list per channel, covering six page kinds: `home`, `species`, `fly-type`, `product` (one with Fly Sizes), `cart` and `search`. A key is a kind, or `kind@name` for a second page of one kind, as in `pages.mjs`.

- A kind a channel can't list yet goes in its `notPinnedYet` with the reason, which every run prints. ReelFlies_CA lists home, the empty cart and a search for "adams" today; the Species and Fly Type pages wait for refactor 13 and the product page for refactor 14. A kind with neither a URL nor a reason fails the run.
- Ticket 53 adds channel 1's tree-1 list (Option A).
- `"budget": "self"` holds a page to no budget, only to its own last accepted run. The home page has it until tickets 46–49 populate it (SEO-8); ticket 49 deletes the line.

**How it runs:**

- The repo's `lighthouse-config.js`, the official release's: Lighthouse's defaults, so mobile emulation and simulated slow 4G. Lighthouse 12.8.1 runs in Playwright's Chromium, build 1217, headless, so the gates and Lighthouse use one browser.
- Each run starts from a cleared cache and cleared origin storage (Lighthouse's own reset), so it measures a first visit, as SEO-13 asks for CLS.
- **The analytics tags are blocked**, through `blockedUrlPatterns` from `lighthouseBlockedUrlPatterns()` ([Analytics and live-store writes](#analytics-and-live-store-writes-network-guardmjs)). Every result records "analytics blocked". A run fails when a request to a listed host completed anyway. `QA_ANALYTICS=allow` loads the tags, on the prelaunch host only and before the Flip, as information: such a run is never compared with or added to the history.
- **A run Lighthouse can't finish** (a 5xx, a page that never paints, a protocol error) is run once more, with a `RETRY` line, as the gates ask a 5xx again (W0-4). A second failure fails that URL, naming Lighthouse's error, and the other URLs are still measured.
- Lighthouse only loads pages: it clicks nothing and sends no form. It can block URLs but not methods, so it has no write guard like the Playwright gates' (W0-6). Before a live channel's list is added (ticket 53), check in a report's network requests that those pages send no write while they load.

**Where it runs:**

- **No `QA_BASE_URL`:** a local `stencil start` of this checkout (`useStorefront` in `storefront.mjs`), with its port lock and a slot like any gate, on `QA_PORT`. A stencil start serves the webpack dev build, unminified and with its sources inlined as source maps ("Fresh start" above), so **locally only accessibility and CLS are judged**. Performance, LCP and TBT are measured and reported, but say little about the build that ships. A local run never reads or writes the history.
- **`QA_BASE_URL` set to the prelaunch host:** the build ReelFlies_CA runs, which is what the budgets are for. It needs `QA_PREVIEW_COOKIE` (read as in "The storefront the gates test"). The cookie goes into the browser's cookie jar for the prelaunch host alone, so no other host the page loads from ever gets it, and the browser's profile is a temporary folder removed when the run ends or is stopped. It is never printed and never in a report. Without the cookie the run stops at once: an agent's push records "Lighthouse: pending host batch", and the next host batch measures that build (W0-6). Agents have no cookie, so prelaunch runs are Shaun's host batch.
- **Another host** (for ticket 56, live reelflies.ca) needs `QA_CHANNEL` to say which channel it serves. The preview cookie is never sent there.

**The budgets,** on each URL's median of three runs: performance 90 or more, LCP 2.5 s or less, CLS 0.05 or less, TBT 200 ms or less, accessibility 100. Each metric takes its own median. A failure names the URL and the metric, and for accessibility the audits that cost points:

```text
FAIL     search `/search.php?search_query=adams`: accessibility 99, below the budget of 100 (heading-order)
FAIL     search `/search.php?search_query=adams`: CLS 0.096, over the budget of 0.050
```

Stock Cornerstone fails these today on a local stencil start: `heading-order` on the cart and search pages, and CLS on the search page (2026-10-06). Ticket 25 owns heading order.

**The drop rule:** a performance median more than 5 points below the URL's last accepted run fails it. Only like is compared with like: runs on a host with the tags blocked.

- **The history** is `lighthouse-history.json`: each channel's URLs, each with its accepted runs (time, source, theme uuid, the build's commit from `RELEASES.md`, the medians), newest last. A malformed file stops the run, so a typo can't switch the rule off.
- **A run is accepted,** and each URL's medians become its new comparison point, only when a host run with the tags blocked passes every judged budget and the drop rule. A failed run leaves the history as it was.
- **Ticket 11's baseline** goes in with `--baseline`, which records each URL's medians whatever the budgets say. Then the first run compares with it. If no baseline was taken before ticket 25's push, the rule starts from the first accepted run after it (build pipeline, wave 1).

  ```sh
  QA_BASE_URL=https://reelflies_ca-1895766.mybigcommerce.com npm run qa:lighthouse -- --baseline 'ticket 11'
  ```

- A run that changes the history says so. Commit the file through the next release-log PR, with the host batch's `RELEASES.md` rows (build pipeline, section 6.5).

**Results:**

- On a host, under the theme uuid the run reads from the store (GET only, `release-capture.mjs`) before and after the runs: `results/host/<uuid>/lighthouse/`, or `lighthouse/` in the host batch's `QA_RESULTS_DIR`. If the active theme changed meanwhile, the run fails, because its results would mix two builds. Locally, under the commit: `results/local/<sha>[-dirty]/lighthouse/`.
- Each run's JSON and HTML report (`cart-2.report.html`), and `summary.json`: each run's metrics and Lighthouse's CPU benchmark, the medians, the comparison point, the problems and notes, "analytics blocked", the Lighthouse and Chromium versions, and whether the run was accepted.
- `lighthouseReleaseLines(summary)` gives the lines a `RELEASES.md` entry records under its Lighthouse line: each URL's five metrics with its JS and CSS bytes (as ticket 11 records them), the kinds not measured yet, and each problem. The runner writes them into `summary.json` as `releaseLines`. The host batch writes them into the entry ([Host batch](#host-batch-qaprelaunch)), and so does `release.sh`'s step 6b, which reads them from `summary.json`, because release tooling never imports this QA code.

It exits 0 when every judged budget and the drop rule passed, 1 when one failed or a URL couldn't be measured, and 2 when it stopped before measuring.

**The `release.sh` hook (step 6b).** After each push to prelaunch, between verify and the log entry, the release runs this gate on the prelaunch host when `QA_PREVIEW_COOKIE` is in the operator's shell, and the entry records pass or fail with these lines. Without the cookie, as on every agent's push, or when the run measured no URL (a stale cookie gets the 503 maintenance page), the entry records `- Lighthouse: pending host batch`, which the next host batch of that uuid fills in. From the Flip it records "skipped": whether a P1 fix runs the gate is Shaun's open question, and until he answers no run after the Flip is accepted. The hook decides all of this, not the runner; its rules are in [releasing](../../docs/releasing.md#lighthouse-after-the-push-step-6b).

## Host batch (`qa:prelaunch`)

`npm run qa:prelaunch` (`prelaunch.mjs`, W0-6) runs the gates against the prelaunch host, which serves the build ReelFlies_CA actually runs. Shaun runs it once per checkpoint, in his own shell, because the host needs his preview cookie (the cookie routine, build pipeline W0-12):

```sh
read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE    # paste name=value; name2=value2, then Return
npm run qa:prelaunch
```

1. **No cookie, no run.** Without `QA_PREVIEW_COOKIE`, or with one that isn't `name=value` pairs, it stops at once and says so. It never prints the cookie, and the gates keep no trace while it is set. It also stops if `QA_BASE_URL` names another host, or `QA_CHANNEL` another channel.
2. **The build first.** It reads the theme active on 1895766 through the store API, GET only, with the token from `stencil init` (`release-capture.mjs`). If the theme can't be read, nothing runs. It files every result under that theme's uuid, in `scripts/qa/results/host/<uuid>/`:
   - `summary.json`
   - each gate's log (`axe.log`, `raw-html.log`, `screenshots.log`)
   - Playwright's reports and output (`axe-report/`, `screenshots-output/` and so on)
   - the screenshot manifest
3. **The gates.** axe, the raw-HTML check and the screenshots, the same three as `qa:prepush`, on every page pinned for 1895766. They run as the variation the host runs, with the analytics tags blocked whatever `QA_ANALYTICS` says.
   - Then ticket 17's Lighthouse (`npm run qa:lighthouse`, [Lighthouse](#lighthouse-lighthousemjs)), which files its reports and `summary.json` in the uuid's `lighthouse/` folder. Its budgets and drop rule count like any gate's.
   - Once ticket 08 records Shaun's GA4 hostname filter, set `GA4_HOSTNAME_FILTER_SINCE` in `prelaunch.mjs` to its date. Each batch then adds one Lighthouse run with the tags loaded (`QA_ANALYTICS=allow`). It is information only: it never fails the batch, and the budgets stay on the blocked runs. Its results go in `tags-loaded/` inside the uuid's folder (its `QA_RESULTS_DIR`), so they never overwrite the blocked run's.
4. **The same build throughout.** It reads the active theme again after the gates, and fails if it changed, because the results would then mix two builds.
5. **The log.** It appends a row to the "Host runs" section of `RELEASES.md`, which it creates before "Switch toggles" the first time: the date, the theme uuid, the build's commit (from the uuid's newest release entry, or "not in RELEASES.md"), the gates, pass or fail, "analytics blocked", and the commit the gates ran from. "Analytics blocked" is "yes", or, once the tags-loaded run runs, "yes, in the gates it counts; tags loaded in Lighthouse with the tags loaded (information)". `summary.json` records the same. The release's own gates run on a local `stencil start`; these rows are the record that the build ReelFlies_CA actually runs passed on the host.
   - Once Lighthouse ran, it also fills in that release entry's `- Lighthouse: pending host batch` with pass or fail, and under it each URL's medians, the kinds not measured yet and every problem, from the run's `summary.json` (`lighthouseReleaseLines`). That is the line a push made without the cookie records (`release.sh`'s step 6b, ticket 17), and the batch fills in exactly that line, which it takes from the release tooling (`release-lighthouse.mjs`). So ticket 56 can see that the exact build it pushes passed on prelaunch.
     - The entry is the uuid's newest one whose own `- Theme:` line names it; a uuid in any other line of an entry doesn't count.
     - The lines go in as step 6b writes them (`safeLines`): one line each, indented, with every line end and control character folded and the cookie taken out.
     - A run that measured no URL (no summary of this batch's run, or every page failed to load, as with a stale or expired cookie, which gets the 503 maintenance page) leaves the line pending, with a `WARNING`, because a fail filled in then could never be corrected. The batch itself still fails.
   - An accepted Lighthouse run also adds to `scripts/qa/lighthouse-history.json`. Commit it with the `RELEASES.md` change.
   - The orchestrator commits the change through the next release-log PR (build pipeline, section 6.5).

It exits 0 when every counted gate passed, 1 when one failed or the theme changed, and 2 when it stopped before the first gate. It takes no lock: it starts no `stencil start`.

## Which runner picks up what

- Playwright runs `scripts/qa/*.spec.mjs` with this folder's config.
- `harness-selftest.spec.mjs` runs with `qa:axe`, `qa:screens`, `qa:quick-view`, `qa:reflow`, `qa:motion` and `qa:focus`, and in every row of `qa:matrix`, on pages it serves itself. It proves that a pinned page answering with the wrong status fails the run without being asked again, that one answering 5xx twice or 429 four times fails, and that dismissing the cookie banner leaves nothing hovered. Its 5xx and 429 retry cases answer the pinned 404 page (or the channel's first page) with a 500, or a 429 with `Retry-After: 1`, once and then let the request through, so the second answer is the storefront's real one.
- `widget-screens.spec.mjs` runs with `qa:screens`, because the script's `screens` filter matches its name.
- `retry.test.mjs` covers the retry policy itself (the waits, `Retry-After` and the 30 s limit), `storefront.test.mjs` the server check's retries, and `raw-html/fetch.test.mjs` the raw-HTML fetch's.
- `storefront.test.mjs` also covers `QA_PORT`, the start log's name, the locks a gate holds (and the ports checked again after a slot wait), trusting only the server a gate started, and stopping that server when the gate is stopped by a signal. `playwright-config.test.mjs` covers that the config reads `QA_PORT` and holds the locks only in the runner, `prepush.test.mjs` what `qa:prepush` checks before its first gate, `serve.test.mjs` the locks around a `stencil start` by hand, and `scripts/lib/lock.test.mjs` the locks themselves: the stale rules, waiting, the three slots across processes, the signals, `RF_LOCK_ROOT`, and the command line `release.sh` uses.
- `pages.test.mjs` covers W0-8's pins, baseline names (against the baseline-scope check's parser), UI states, overlays and custom layouts; `overlays.test.mjs` the overlay files, the patch and the throwaway worktree (in git repos of its own); `custom-layouts.test.mjs` the merge into `config.stencil.json`; `playwright-config.test.mjs` the overlay's refusals, ports and folder, and the custom-layouts step before `stencil start`; `storefront.test.mjs` the overlay marker check, and that only an overlay run's own worktree moves a `stencil start` out of the checkout (an `RF_QA_THEME_DIR` left in the shell never does; `prepush.test.mjs` too).
- `analytics-hosts.test.mjs`, `read-only-posts.test.mjs` and `network-guard.test.mjs` cover the network guard (W0-6), and `harness-selftest.spec.mjs` proves it in a browser. `prelaunch.test.mjs` covers the host batch: the cookie check, the uuid folder, the gates and their environment, the `RELEASES.md` row, Lighthouse and its medians in the release entry (the entry read by its own Theme line, the lines folded and redacted, and the line left pending by a run that measured nothing), and that the cookie is never printed.
- `lighthouse-rules.test.mjs` covers ticket 17's rules on real Lighthouse results (`lighthouse-fixtures/`): the metrics, the median of three, the budgets, the drop rule, the URL lists and the history. `lighthouse.test.mjs` covers the run around them with stand-ins for Lighthouse, the browser, the storefront and the store.
- `npm run test:scripts` runs every `scripts/**/*.test.mjs` with `node --test`, the fixture renders included.
- `scaffold.test.mjs` holds ticket 25's shared-file slots (build pipeline 6.1; CUSTOMIZATIONS.md, "Slots for parallel tickets"): the ReelFlies settings block, schema group and lang slots, the style layer's imports, the slots in `page-modules.js`, `reelflies/global.js` and `js-settings.html`, and the hooks in `base.html`, `app.js` and `global.js`. It also runs the release guard and step 1's diff on the block (spec seam 5): the first push, a switch toggled live, and a value changed after the scaffold's push (refused by rule 1 until the release lane gives values the three-way rule, which a todo test holds). `render/partials/body.test.mjs` and `reelflies-frame.test.mjs` render the `<main>` hook, the icon sheet, the icon partial, `body-start.html` and `js-settings.html`.
- `switches.test.mjs` covers ticket 54a's switch registry: the switches against config.json, which switches a template reads, the overlay that flips each, and the markers and chunks a landed module names. `switch-matrix.test.mjs` covers the matrix's plan, its Playwright filters, how it reads each row's JSON report, what it runs for a row and what it prints. `page-checks.test.mjs` proves the reflow, reduced-motion and focus checks in Chromium (skipped in CI, which has none), and `widget-links.test.mjs` the widget link check against a server of its own.
- `reflow.spec.mjs`, `reduced-motion.spec.mjs`, `focus.spec.mjs` and `switch-stock.spec.mjs` run through `qa:reflow`, `qa:motion`, `qa:focus` and the switch matrix, never through `qa:axe`, `qa:screens` or `qa:prepush`, whose filters don't match them.
- Jest runs `assets/js/test-unit/`. `jest.config.js` ignores `scripts/`, because Jest 30 would otherwise match `*.test.mjs` and `*.spec.mjs` too.
- `screens-reference.spec.mjs` runs with `qa:screens`, because its name matches the filter, and never fails it. `review-live.spec.mjs` runs only when named. Neither is a gate. `review/manifest-reporter.test.mjs` checks both against `package.json`'s filters.
- Playwright writes its report, traces and failed diffs to `scripts/qa/results/`, which is ignored by git. The manifest reporter writes `results/manifest.json` there too, and the review pages go to `results/review/`. A run with `QA_PREVIEW_COOKIE` writes no traces, so the cookie never lands there.
