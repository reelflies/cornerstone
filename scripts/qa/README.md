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
| The skin in a browser (ticket 25): focus ring, skip link, landmarks, Onest, reduced motion, reflow, the default product image | `npx playwright test --config scripts/qa/playwright.config.mjs skin.spec` | no | no: run it in each ticket that changes the skin ([The skin](#the-skin-skinspecmjs)) |
| The footer in a browser (ticket 50): the forest ground and its gold ring, the columns stacked at 375 and side by side at 1280, no sideways scroll at 320, axe inside the footer, and no content outside a landmark in it | `npx playwright test --config scripts/qa/playwright.config.mjs footer.spec` | no | no: run it in each ticket that changes the footer ([The skin](#the-skin-skinspecmjs)) |
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
| `QA_VARIATION` | the channel's own: `ReelFlies CA channel 1` on channel 1 (ticket 53), `ReelFlies CA` on every other | Theme variation; it must exist in `config.json`. The default comes from the channel's `variation` in `pages.mjs` (`defaultVariation`); a value you set always wins |
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
  QA_PORT=3400 QA_CHANNEL=1 node scripts/qa/serve.mjs                                     # reelflies.ca's data as "ReelFlies CA channel 1" (read-only)
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
| `store-write` | W0-11's `scripts/store/apply.mjs`, from its first read to its last log row ([store writes](../../docs/store-writes.md)), and ticket 18's `scripts/catalogue/apply.mjs`, from the token prompt to its last log row ([catalogue jobs](../../docs/catalogue-jobs.md)) | 45 min (the default for a lock with no limit of its own) |

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

**The channel-1 fallback.** ReelFlies_CA has no products and no tree-4 categories yet, so its product and category pages 404. Until they exist, `QA_CHANNEL=1` renders this repo's templates with live reelflies.ca data. It is read-only: stencil start passes every request through to the live store, so the gates refuse every write on channel 1 and 1855224 ([Analytics and live-store writes](#analytics-and-live-store-writes-network-guardmjs)). Channel 1 pins its product and category pages, and the pages later tickets pin there: a Web Page, the search results and ticket 51's dead ends.

- **It renders channel 1's own variation,** "ReelFlies CA channel 1" (ticket 53, decision 10's interim name), which holds tree 1's menu ids. `QA_CHANNEL=1` picks it without `QA_VARIATION`, and its baselines are in `baselines/1-reelflies-ca-channel-1/`, with the widget shots in `baselines/widgets/reelflies-ca-channel-1/`. Before ticket 53, channel-1 runs rendered ReelFlies CA into `1-reelflies-ca/`; that set moved, unchanged, and isn't kept.
- If Shaun renames the variation, one PR renames it in `config.json` and `pages.mjs` and moves both baseline folders.

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

- **Page keys** are the spec's template names: `home`, `fly-type`, `species`, `species-hub`, `product`, `cart`, `hook-chart`, `404` and `brand`, plus `category` for the category template (ticket 32's page; the `fly-type` and `species` keys wait for tree 4's pages, refactor 13), `page` for a Web Page, `login` and `create-account` for the sign-in forms (ticket 25), and `search` for the search results (ticket 31). ReelFlies_CA has no Web Page yet, so channel 1 pins one (`/coupon-codes/`, a paragraph of terms). It has no Species root either, so channel 1 pins a stand-in `species-hub` (ticket 34: Saltwater, Warmwater & Salmon, rendered with the hub template through `custom-layouts.json`) until wave R2 pins `/species/` on 1895766, once refactor 14 has placed the products. A channel pins more pages of one kind as `kind@name`, such as `product@5663` or `product@sold-out` ([Render modes](#render-modes-w0-8)).
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

- **`LIVE_DATA`, on every page:** prices, stock and SKU lines, ratings and review counts (ticket 40's star summary and "Reviews (N)" heading among them), sale and sold-out badges, cart counts and totals, pagination, and marketing banners.
- **A channel's `mask`, on one page only:** content that the pin can't hold still, but whose size can't move the page. Channel 1's category pages mask their listing's count (the brand page's row names the page, "Page 1", which holds still, so it isn't masked), its `species-hub` pin its tiles' and grid's counts (`[data-rf-hub-count]`), and the search page masks its result counts (its heading and both tabs, by role, since stock `search.js` swaps the active tab's class). Channel 1's `product@sizes` (Fat Albert, ticket 37) masks its option rows whole (the size pills and each colour swatch), whose sold-out marks follow the live stock, and the size line naming them, so a mark that moves doesn't move the mask, except where a UI state has marked the options `data-rf-qa-state`: its states clear the live marks and set their own, so they're shot unmasked.
- **The boxes a channel holds** (below), so a reviewer sees a mask where the cards were, not an empty space.

**What the screenshots hide** (`screenshotStyle(channel, template)` in `pages.mjs`; W0-5). Each test writes the stylesheet into its output folder (`screenshotStylePath` in `fixtures.mjs`), because `stylePath` reads only from a file.

- **`HIDDEN`, on every page and channel, out of the layout** (`display: none`):
  - **Widgets** (`[data-widget-id]`), from Page Builder or the Widgets API. A widget applied on 1895766, such as the hero (46), the shipping strip (27) or a home section (47–49), would otherwise change every page's height at once, and every gate and the release would fail together. Each widget is checked from its own source instead (W0-9). Channel 1's header widget (108 px at 375 and 27 px at 1280 on 2026-10-08) is out of its shots for the same reason.
    - **The limit:** only the widget is hidden, not the Page Builder layout around it (`[data-layout-id]`, then `[data-sub-layout-container]`, then `[data-sub-layout]`). With Page Builder's default styles those add only side padding, so they are 0 px tall once the widget is hidden, as channel 1's header shows. A layout given top or bottom padding, a margin or a minimum height would still add its height. When 1895766's home widgets went active (2026-10-08) each region measured 0 px. If a later layout adds height, add `[data-layout-id]` to `HIDDEN_FROM_LOAD`, so it is out of the first layout too, not only to `HIDDEN`.
    - **From the first layout, not only at the screenshot** (`HIDDEN_FROM_LOAD`; `hideWidgetsFromLoad` in `fixtures.mjs`, before each page opens): a page laid out with its widgets and then hidden can keep a sub-pixel offset further down. When 1895766's home widgets went active, eight footer lines sat 1px off and the desktop home shot failed on 2,497 pixels, though every widget region measured 0px once hidden (#63). An init script puts the rule on `<html>` before the page's first script or layout, and `screens-selftest.spec.mjs` checks that a page's own script already reads its widget as `display: none`. The cookie banner isn't hidden from load, because `dismissCookieBanner` clicks it first.
  - **The store's cookie banner** (`#consent-manager`), **and the bar it leaves after a choice** (`#consent-manager-update-banner`, "Manage Website Data Collection Preferences"). The bar is 48 px tall at the end of the page, and appears about a second after "Reject all". A shot taken before it appeared made the channel-1 product page fail once at 375 (375x4101 against a 375x4149 baseline), and pass on a rerun.
- **A channel's `hold`, on one page only:** a box whose contents set its height. The stylesheet takes everything inside the box out, and holds the box at the height given, so the page keeps one size whatever the live list holds. Channel 1's product pins hold ticket 39's related patterns grid (`[data-rf-related] .rf-related-grid`, 400 px at both widths, a height neither layout of its four cards has), because the store picks the related products and their titles wrap to one line or two. The heading and the section around the grid stay in the shot; the grid's look is shot from fixed data on ticket 39's fixture page ([The product page](#the-product-page-product-pagespecmjs-product-page-screensspecmjs)). Its search page holds the "Did you mean" panel (`.page-content > .panel`, 360 px), which lists the categories the store finds for the query. Its category pins (`category`, `category@more`, `category@noindex`), its search pin and its brand pin (ticket 36) hold their listing's grid (`#product-listing-container .productGrid`, not quick search's or the cart preview's; 1200 px at both widths, a height no layout of these grids has, so a hold that stops applying fails the shot; a pin whose product count crosses a page, 24 on the category and brand pins and 12 on the search pin, still gains or loses its pager row, which is only masked: a catalogue change, so a re-baseline epoch), because the live reelflies.ca catalogue decides which products they list, and a card's title wraps to one line or two: masked, the grid kept its live size, and on 2026-10-09 the search pin at 375 grew 21 px, one title line, with no theme change. A key may be a selector list, such as `'#tab-related .grid, #tab-similar .grid'`: each box it names is held at the height given. `product@sizes` and `product@reviews` hold the same grid as the product pin, and `product@reviews` (ticket 40) its review list too (`[data-rf-reviews-list]`, 640 px at both widths: its five reviews measured 951 px at 375 and 755 px at 1280 on 2026-10-09), because shoppers add reviews and their texts run to one line or several; the section's heading, its "Write a review" and the pager stay in the shot, and the reviews' look is shot from the fixture page's three sample reviews. The `species-hub` pin holds its grid the same way (`[data-rf-hub-products] .productGrid`, 1200 px: the hub's grid isn't in `#product-listing-container`), and leaves its tiles in the shot.
- `HIDDEN` and `hold` apply to the screenshots only. axe and the raw-HTML check still see the whole page.

**Everything else is diffed:** product cards (photo, name, layout), grids and carousels stay visible, so a change to a card or to a grid's layout fails the run. That includes the details on channel 1's product pages ("About this fly" holds the description): the product pin's description was the same on 2026-10-06 as in the 2026-09-07 product export.

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
| `drawer-open` | the phone menu: ticket 27's Menu button, which drives the stock toggle, opens `#menu`; in ticket 28's grouped drawer the first row's chevron then opens its children in place, so the shot shows one row open. With both menu ids empty it is the stock drawer | `phone-375` | `home` (ReelFlies_CA: the stock fallback until tree 4's ids), `category` (channel 1: the grouped drawer) | 28 |
| `panel-open` | the desktop menu panel: ticket 27's "Shop flies" opens it from the keyboard, on the grouped panel's first Fly Type pane with focus on its rail item (28), once that pane's lazy banner has loaded (29). With both menu ids empty, the stock menu's first sub-menu opens instead, from the keyboard too | `desktop-1280` | `category` (channel 1) | 28 and 29. A Species pane state waits for a pinned page with a Species group (wave R1); until then `rail.spec.mjs` checks that pane on the fixture page |
| `size-default` | Fat Albert with no size chosen and no size sold out: "Fly Sizes: choose one" over the pills. Like the two below, it clears the live stock's marks (the sizes', and the colours' once a size is chosen) after stock has answered and marks the options (`data-rf-qa-state`), so the pin's mask of the live marks leaves them alone | `phone-375`, `desktop-1280` | `product@sizes` (channel 1) | 37 |
| `size-chosen` | Fat Albert with its first size chosen: the ink outline on the tile and the check | `phone-375`, `desktop-1280` | `product@sizes` (channel 1) | 37 |
| `size-sold-out` | Fat Albert with its last two sizes marked sold out as stock's scripts mark them (`unavailable`): struck, aria-disabled, and named in the line. The state marks them itself, so the shot shows the look, not the day's stock | `phone-375`, `desktop-1280` | `product@sizes` (channel 1) | 37 |
| `buy-row-alert` | the buy row with stock's alert showing ("The maximum purchasable quantity is 2", set by the state, not the day's stock): the stepper and the button keep their row and the alert takes the next | `phone-375`, `desktop-1280` | `product@sizes` (channel 1) | 38 |
| `sticky-bar` | the phone's sticky add bar at rest: a Colour and a size chosen (every option's live marks cleared, and the buy row settled) and the main button scrolled past | `phone-375` | `product@sizes` (channel 1) | 38 |
| `sticky-bar-added` | the sticky add bar just after an add from it, "Added 1 × size N" with View cart. The add is answered by the state (page.route), so nothing reaches the store, and `data-rf-bar-ms` holds the look for the shot | `phone-375` | `product@sizes` (channel 1) | 38 |
| `in-cart` | Fat Albert with two of its sizes in the cart: the corner check on each and "In your cart: 3 × size N and 2 × size M." under the pills. The cart is answered by the state (page.route, from the first two sizes the page names), and cart-marks.js reads it again on `rf:cart-changed`; the live sold-out marks are cleared first, as ticket 37's states do. Under `rf_cart_state-off` the page has no line, and the state shows the stock pills | `phone-375`, `desktop-1280` | `product@sizes` (channel 1) | 42 |

Quick add's sheet and popover (ticket 43) have no state here: they are shot open on the fixture page `render/pages/quick-add/` at `phone-375` and `desktop-1280` (`quick-add-screens.spec.mjs`, widget `quick-add`), because channel 1's listing pins hold their grids out of the shots and its variation has quick add off.

- **A state shot** is the viewport as it shows with the state open, because a fixed drawer or sheet covers the viewport rather than the page. A state can ask for `fullPage: true`. It has the page's masks and stylesheet. Its baseline is `<key>~<state>-<project>-<platform>.png`, covered on the `Baselines:` line by its page kind.
- **Each state's `open(page)`** resolves once the state is open, and leaves the pointer off the page, so no hover state shows in the shot. The `product@sizes` states that scroll to the pills or the buy row (`size-default`, `size-sold-out`, `buy-row-alert`, `in-cart`) then bring down whole a product-view control that the window's top edge cuts to less than 24px (`uncutTop`): axe reads one with a close neighbour as too small (target-size), and which one the edge cuts follows the layout above the pills (ticket 42's line put a photo thumbnail there at 375). A ticket that rebuilds the UI points `open` at its own, and may wait for its token in `<html data-rf-open>` (build pipeline, section 6.9). A ticket adds a state in its own slot in the registry, with its pages.
- **axe** allows a known issue in one state only through its `states` (above, "axe"). The stock sub-menu has one, which only the stock fallback still shows (both menu ids empty).
- `drawer-open` and `panel-open` show live data: channel 1's grouped menu lists its live tree-1 categories, as its header already does. A change there moves the state's baseline like the page's, through a re-baseline epoch.

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

- **The overlays today:** `rf_rise-off` (27), `menu-ids-empty` (28's stock fallback) and `species-empty` (28: no Species group), and one per module switch for the switch matrix (ticket 54a): `rf_cart_state-off` (42), `rf_quick_add-off` (43) and `rf_region_prompt-on` (52), plus `rf_quick_add-on` (43), which renders quick add on channel 1, whose variation has it off; and `show_product_reviews-off` (40: Theme Styles' "Show product reviews" off, a stock setting, not a module switch, so not in the matrix), under which the raw-HTML check runs on channel 1's `product@reviews` for ticket 40's criterion 3 and which has no baselines. A module ticket records its overlay's baselines when its module lands; a new switch adds its overlay in the same PR. Ticket 42 recorded `rf_cart_state-off` on both channels: on channel 1 its product pins render without the "In your cart" line, and every listing's cards without their line, which the held grids keep out of the shots; on 1895766, whose pins list no cards yet, it renders as the plain run. Ticket 28 recorded `menu-ids-empty` on channel 1, where it renders the stock menu in place of the grouped one (`baselines/1-reelflies-ca-channel-1/*+menu-ids-empty-*`); on 1895766 both ids are empty already, so it renders as the plain run. `species-empty` renders as the plain run on both channels today (channel 1's Species id is empty, and 1895766 has no ids), so it has no baselines until a channel sets a Species id (wave R1); `render/partials/menu.test.mjs` covers it from fixtures.
- **Only declared settings.** An overlay is refused while `config.json` doesn't declare one of its settings, or when a value has another type than the declared one, because the render would look unchanged and pass for the overlay. Ticket 25's scaffold declares every module switch and both menu ids, so all seven above run; an overlay for a new setting runs once the PR that declares it has landed. A misspelt key in the file, a missing `description` or an empty `settings` is refused too.
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
    "category": {
        "rf-noindex.html": "/flies/realistic-trout-flies/realistic-nymphs/",
        "species-hub.html": "/flies/saltwater-warmwater-salmon/"
    },
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
- It maps ticket 32's `rf-noindex.html` to channel 1's `category@noindex` pin, and ticket 34's `species-hub.html` to channel 1's `species-hub` pin. Ticket 35 adds its own.

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
- **When your module lands, fill in your entry's `markers` or `chunks`, or both, and `stock` if it replaces or guards stock markup.** `switches.test.mjs` fails, naming your switch, while a template reads it and its entry names neither. It also fails a marker or chunk that no template, and no script under `assets/js`, has. A script may write a marker as `data-rf-…` or through `dataset`. `rf_region_prompt`'s marker is already there: the prompt's root, `data-rf-region-prompt`. `rf_cart_state`'s (ticket 42) are the size pills' line, cart tags and corner checks and the card's line (`data-rf-cart-line`, `data-rf-cart-tag`, `data-rf-cart-dot`, `data-rf-cart-card`), and its chunk `rf-cart-state`; it replaces no stock markup, so it names no `stock`.
- **Each switch has an overlay that flips its base value:** `rf_rise-off`, `rf_cart_state-off`, `rf_quick_add-off` and `rf_region_prompt-on` (off everywhere by default). `switches.test.mjs` checks that every switch has one, so a new switch adds its own. A variation that sets a switch the other way needs the overlay that flips it there: "ReelFlies CA channel 1" has `rf_quick_add` off, so channel 1's matrix row renders it on with `rf_quick_add-on` (`switch-matrix.test.mjs`).
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
  | `rf-menu` | grouped menu and phone drawer, and the desktop rail's hover intent, keys and focus | 28 and 29 (1,308 B in 29) | 8,000 B |
  | `rf-size-filter` | the Fly size filter on listings | 33 (1,892 B) | 3,000 B |
  | `rf-size-pills` | the product page's size pills, and Quick view's and the Change dialog's through `pills-in-modal.js` | 37 (1,302 B) | 3,000 B |
  | `rf-add-flow` | the product page's add flow and sticky bar | 38 (6,817 B; 6,914 B after #80) | 7,000 B |
  | `rf-cart-state` | the cart state's marks and lines on the product page and the cards (`cart-marks.js`, with the reader `cart-state.js`) | 42 (1,890 B) | 2,500 B |
  | `rf-quick-add` | quick add on cards: "+ Add" and its panel; it loads `rf-size-pills` for the panel's pills, and imports no module that `rf-add-flow` has to itself, whose chunk is at its budget (a module two chunks share is one webpack concatenates into neither) | 43 (about 7,650 B; measured again in 45) | 15,000 B |
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
- An entry's `templates` are page kinds or `kind@name` pins. Its optional `states` limits it to the page with one of those UI states open; without it, it covers the page in every state. Its optional `overlays` limits it to a run under one of those overlays; without it, it covers runs with and without one (ticket 29).
- **The list holds one entry, with the stock desktop sub-menu open** (`panel-open` on channel 1's category page; W0-8, 2026-10-06): `aria-hidden-focus`. Ticket 28's grouped panel doesn't raise it. It stays for the stock fallback, which channel 1 renders under `QA_OVERLAY=menu-ids-empty`, until no channel pins a category page with empty ids (wave R1). Since ticket 29 it covers that overlay only (`overlays: ['menu-ids-empty']`), so a plain run holds the grouped panel, whose panes ticket 29 switches, to the rule. Its `color-contrast` and `target-size` entries went with ticket 27, whose "Shop flies" panel holds the stock menu and in which neither occurs. The closed stock templates had no serious or critical issues on ReelFlies_CA (home, cart, 404, brand) or on the channel-1 product and category pages on 2026-10-05, and the stock phone menu open (`drawer-open`) has none.
- The moderate issues found were no `<main>` landmark, content outside landmarks, heading order and duplicate landmarks. Ticket 25 gave every template one `<main>`, which `skin.spec.mjs` checks with axe's two landmark rules on every pin. Heading order on the cart page is left for ticket 41, which rebuilds it, and on the search page for tickets 31 (its results grid) and 51 (whose criterion runs axe's heading rules there: `dead-ends.spec.mjs` finds no serious or critical landmark or heading issue on the three dead ends; the stock suggestions panel's `<h5>` Categories and Brands under the page's H1 stay a moderate heading-order issue, ticket 51 adding no heading of its own). Ticket 50's footer is a `<footer role="contentinfo">`, so its content is inside the contentinfo landmark, which `footer.spec.mjs` checks with axe's `region` rule inside the footer. The stock bottom banners above it (`footer.html:1-11`) stay outside it, as the ticket keeps them, and render only when the store sets a bottom banner. Ticket 27's header is the banner landmark, and the shipping strip's region sits in its own labelled region landmark, which `header.spec.mjs` checks with axe's `region` rule.

## Screenshots (`screens.spec.mjs`)

**Baselines:** `scripts/qa/baselines/<channel>-<variation>/<key>[~<state>][+<overlay>]-<project>-<platform>.png` (`baselineName` in `pages.mjs`). For example, `baselines/1895766-reelflies-ca/home-phone-375-darwin.png`, `home~drawer-open-phone-375-darwin.png` for the phone menu open, and `home+rf_rise-off-phone-375-darwin.png` under an overlay.

- The projects are `phone-375` and `desktop-1280`.
- The platform suffix keeps a Mac's font rendering from being compared with Linux's. Baselines are made and checked on the Mac that runs `release.sh`.
- **A missing baseline fails the run.** A plain run never writes one (`updateSnapshots: 'none'` in `playwright.config.mjs`), so no run can make a baseline that later runs pass unreviewed. The failure names the missing file and the command that makes it. A release to a channel or variation without its set stops at the screenshots until the set is made and reviewed.

**How a run works:**

1. Each page scrolls once so lazy images load. A `loading="lazy"` image with no box, such as a closed menu pane's banner (ticket 29), never loads, so the run doesn't wait for it.
2. The store's cookie banner is dismissed by pressing Enter on "Reject all", because it is fixed to the viewport and would cover the template. A click would leave the pointer over whatever the banner covered, and on the desktop product page that opens EasyZoom's hover zoom.
3. A full-page screenshot is compared with the baseline, with `masksFor(channel, template)` masked and `screenshotStyle(channel, template)` applied ("Mask or hide" above).

**The threshold** is in `playwright.config.mjs`. A pixel counts as changed when its colour moves more than 0.2 (Playwright's `threshold`). A run fails when more than 0.2% of the pixels change (`maxDiffPixelRatio`).

**The self-test** (`screens-selftest.spec.mjs`) runs with every `qa:screens`, with the same settings, on a fixed page of coloured blocks. It proves three things:

- An unchanged page passes.
- A 200 × 100 px change fails.
- A 10 × 10 px change passes.

It also checks, on a page of its own, that a widget is already out of the layout when the page's own script first reads it (`hideWidgetsFromLoad`), with a control case that shows it isn't without the helper. And it tries channel 1's product-page stylesheet on a product page in miniature, with no baseline. A shot taken before the cookie bar appears matches one taken after it. A taller widget and taller related cards leave the shot as it was, and the held box measures its height. A change to the description or to the related section's heading still changes the shot.

**Updating baselines:** run `npm run qa:screens -- --update-snapshots`. Then look at every changed PNG before committing it. A diff is the point of the gate: update a baseline only for a change you meant.

**Declaring changed baselines** (W0-13). Every PR body ends with a `Baselines:` line naming the page kinds, overlays and widgets it changes on purpose, for example `Baselines: product, product@sold-out, overlay rf_rise-off`, `Baselines: home, widget home-lead, widget rf-selftest`, or `Baselines: none`. The `baseline-scope` CI check, and `scripts/merge.sh` again before it merges, fail a PR that changes, adds or deletes any PNG here outside them.

- **Page baselines:** the check reads the name as `<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png`, which is the shape `baselineName` gives W0-8's pins, UI states and overlays (`pages.test.mjs` checks each against the check's parser). A UI state's baseline is covered by its page kind, and an overlay's only by `overlay <name>`.
- **Widget shots** (W0-9): the check reads `widgets/<variation>/<widget>-<case>-<project>-<platform>.png`, the name `widget-screens.spec.mjs` gives each fixture's shot (`check-baseline-scope.test.mjs` checks every shot the spec would take, and every committed one). `widget <name>` covers that widget's shots in every case, variation and width. Name several as separate items: `widget home-lead, widget best-sellers`. No page kind or overlay covers a widget shot. Because widget and case names both hold hyphens, a shot that two widgets could own (`rf-hero` and `rf-hero-banner`) needs both declared, so don't name a widget as another's name plus a hyphen.
- **Anything else:** a PNG in any other shape, or a widget shot that no folder in `widgets/`, `render/selftest/widgets/` or `render/pages/` owns, is covered only by a re-baseline epoch (`Baselines: epoch <cause>`), and an epoch PR changes nothing but baselines.

[docs/guardrails.md](../../docs/guardrails.md), "Declaring changed baselines", has the rules.

**When a template ticket lands:**

1. Pin its page in `pages.mjs` under each channel where it renders.
2. Run `npm run qa:screens -- --update-snapshots` (and `QA_CHANNEL=1` if it needs the fallback).
3. Review the new PNGs and commit them with the template.
4. If the page shows new live data, add its selector to `LIVE_DATA`. If part of the page can't be pinned, leave it out for that page only: in its channel's `mask` if its size holds still, or in its channel's `hold` if it can change the page's height.

**Per variation:** run with `QA_VARIATION="ReelFlies US"` to make or check that variation's set. The sets today are ReelFlies CA's on 1895766 and the channel-1 variation's on channel 1 (above), so a release with ReelFlies US fails at the screenshots until its set is made. Both variations still have empty settings, so a US set would be identical.

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
    check(page) {                           // page: { kind, key, path, url, status, html }
        const count = findTags(page.html, 'h1').length;
        return count === 1 ? [] : [`${count} <h1> elements`]; // problems; empty means pass
    },
};
```

**A check across pages:** an assertion may also export `checkAll(pages)`, or only that. The harness runs it once, after every page is fetched, on the pages its `pages` and `notOn` pick that rendered as their template, and reports it under "Every page together". `pages` is a list of the page objects `check` gets, each with its pin's `key` (`kind@name`, or the kind); `checkAll` returns its problems, as `check` does. Ticket 27's `strip-every-page` uses it: the shipping strip on every pinned page or on none. (Build pipeline 6.5 says a ticket adds an assertion without touching the harness; this one hook was added to the harness once, by ticket 27's follow-up, so later cross-page checks need no harness edit either.)

**Helpers in `html.mjs`** read HTML the way a browser builds it:

- `findTags(html, name)` returns start tags with their attributes. Anything inside comments, `<script>`, `<style>`, `<textarea>` and `<title>` doesn't count.
- `findTags(html)`, with no name, returns every start tag, in page order (`one-main`, `rf-icon-sheet` and `rf-live-region` use it).
- `markupOnly(html)` returns the HTML with comments removed and those text-only elements emptied, their tags kept, so a text search sees only markup (`rf-live-region` uses it).
- `scriptsOfType(html, type)` returns script contents, such as JSON-LD.
- `elementsHtml(html, name, test)` returns, from `markupOnly`'s copy (comments gone; `<script>`, `<style>`, `<textarea>` and `<title>` emptied), the markup of each `<name>` element whose attributes pass `test`, counting nested elements of the same name; `outerHtml(html, name, test)` returns the first, or null. `textOf(html)` returns the text with the tags out and white space collapsed, decoding only `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric references (`&nbsp;` stays as written); `decodeHtml(text)` does the same for an attribute's text.

**Tests:** add a fixture page to `raw-html/fixtures/` and a case to `raw-html/raw-html.test.mjs`, or a test file of your own beside it (ticket 25's is `page-frame.test.mjs`), with a failing fixture and a passing one. Or put them in `assertions/<id>.test.mjs` beside the assertion, which keeps a ticket's tests out of the shared file; the loader skips `*.test.mjs`, `home-hero.test.mjs` builds its pages from a widget's render, and `rf-header.test.mjs` from the header's. Every fixture page runs every registered assertion, so a fixture of a whole page carries what every page has: `<html lang="en-CA">`, the en-CA content language, the Onest preload, a favicon link and one `og:image` in the head, the icon sheet and the live region right after `<body>`, the ReelFlies header (its logo `<div>`, its Menu `<button>` and its row) with the strip's region landmark after it, and one `<main>`. CI runs them through `npm run test:scripts`. `raw-html/fetch.test.mjs` checks that the preview cookie reaches `QA_BASE_URL` and never a host a redirect points at.

**The assertions today** judge the page as served. None reads the repo's record of a widget (`widgets/<name>/channels/<channel>.json`), so a widget placed or unpublished on 1895766 never fails the gate on every branch until that file's PR merges (build pipeline, section 6.6). Whether the store holds what the repo records is the sync's check, `widgets-sync.mjs --verify` ([docs/widgets.md](../../docs/widgets.md)).

| Assertion | Ticket | Checks |
|---|---|---|
| `one-canonical` | 16 | exactly one canonical link; not asked of the cart, the 404 page or the sign-in and create-account pages, which have none in stock Cornerstone |
| `json-ld-parses` | 16 | every `application/ld+json` block parses |
| `no-region-prompt` | 16, then 52 | no element carries `data-rf-region-prompt` |
| `one-main` | 25 | exactly one main landmark: a `<main>`, or an element with `role="main"`, counted once. `body.html` makes the wrapper a `<main>` on home, product and cart only |
| `rf-live-region` | 25 | exactly one `data-rf-live-region` element, with `role="status"`, empty in the server HTML |
| `rf-icon-sheet` | 25 | the ReelFlies icon sheet (`data-rf-icons`) once, as the first element in `<body>`, with `aria-hidden="true"` |
| `lang-en-ca` | 25 | `<html lang="en-CA">` and one `content-language` meta element, en-CA (`components/reelflies/head.html`) |
| `rf-fonts` | 25 | one preload of `fonts/onest-latin-var.woff2`, `as="font"`, `type="font/woff2"` and `crossorigin`, and no link to Google Fonts (stock asked it for Karla and Montserrat) |
| `rf-brand-head` | 25 | a favicon link with an href, and exactly one `og:image`: the page's own (a product's), or the ReelFlies default share image |
| `autocomplete` | 25 | on `login` and `create-account` only: the sign-in fields carry `email` and `current-password`, and every store form field its token by `data-field-type` (`TOKENS`). The account and address forms need a signed-in customer, so `render/partials/autocomplete.test.mjs` renders them from fixtures |
| `home-one-h1` | 46 | at most one `<h1>` on the home page (none since ticket 27 made the logo a `<div>`, until the hero is placed), and with the hero on the page, exactly one: the hero's |
| `home-hero` | 46 | when the page has the hero: its `<img>` has a srcset (320w to 1600w), sizes, width and height, and is the page's only `fetchpriority="high"`; its `<h1>` has text; its two buttons are `<a href>`. A page without the hero passes |
| `home-no-carousel` | 46 | no stock carousel (`.heroCarousel`) on the home page |
| `rf-header` | 27 | one ReelFlies `<header data-rf-header>` holding no `<h1>`; the logo a `<div data-rf-logo>` holding one link, and no `.header-logo` an `<h1>`; the Menu control a `<button>` with `aria-expanded` and a visible label; no Compare, Gift Certificates or wish list link in the header row (the phone drawer is ticket 28's) |
| `max-one-h1` | 27 | at most one `<h1>` on every page |
| `strip-region` | 27 | one `header_bottom--global` region, after the header, inside `<div data-rf-strip-region role="region">` with an accessible name; the shipping strip (`data-rf-strip`), when it is there, holds no link. Another channel's widget in the region isn't judged |
| `strip-every-page` | 27 | the shipping strip (`data-rf-strip`) at most once on a page, and, across the run (`checkAll`), on every pinned page or on none, so a template file missing from the strip's `template_files` fails. The 404 page counts only away from a local `stencil start`, which never fills its regions, and so does a pin the store renders with a custom template (`CUSTOM_TEMPLATE_PINS`: `species-hub`); on the prelaunch host they count like every other (`docs/widgets.md`, the strip) |
| `rf-footer` | 50 | exactly one `<footer>`, the ReelFlies one (`data-rf-footer`); the outside-Canada line with a real `<a href="https://reelflies.com/">`; the promise line and the copyright, in `lang/en.json`'s words; no "Powered by" anywhere on the page and no Brands column; and either the Shop column or, with both menu ids empty, the stock Categories column. The Shop list declares the ids it was given (`data-rf-menu-type-ids`, `data-rf-menu-species-root-id`), and its links (`data-rf-menu-id`) must be exactly those, in that order, so an id the channel's tree doesn't hold fails, as does a Shop column with no links (ids of only spaces); and every phone link is `tel:+1` and ten digits, so a store phone typed in a form the footer can't dial fails. Its element readers (`elementsHtml`, `outerHtml`, `textOf`, `decodeHtml`) are `html.mjs`'s, shared with 27's, 28's, 29's, 30's, 33's and 46's assertions |
| `rf-menu-banner` | 29 | the grouped menu's images are only its panes' banners, one at most per pane and before its `<h2>`: `loading="lazy"` (so a phone, the closed panel and a closed pane download nothing), `alt=""`, a srcset of two or more candidates, sizes, a width and a height, and no `fetchpriority`. Pages without the grouped menu pass |
| `rf-menu` | 28 | when the menu ids are set: one grouped `<nav data-rf-menu>` with a name, inside the ReelFlies header, with no stock navigation (`.navPages`), no stock quick-search form and no `data-menu` on its `#menu`; every link has an href and every category link `data-rf-category`; no "All …" or "Shop all" link; each pane hidden, with an id, opened by one `type="button"` with `aria-expanded="false"`, and headed by an `<h2>` holding its one link. With both ids empty the stock navigation renders, and it passes. Which URLs the nav must hold is `menu.spec.mjs`'s curl test, below |
| `rf-search-forms` | 30 | every ReelFlies search form (`data-rf-search-form`) a GET with a real action and one `search_query` field, so Enter works with no script; no stock quick-search hooks and no combobox attributes on its field; each form's name once; the phone search row (`data-rf-phone-search`) after the header, at most once, on home, category and search pages that carry the header's form, and never on product, cart, 404, brand, Web Page, sign-in or chart pages |
| `home-cards-tiles` | 47 | when the page has the Fly Type cards (`.rf-type-card`) or tiles (`.rf-link-tile`): each is one `<a href>` to a page with no link, button or form control inside it, holding one `<img>` with `alt=""`, src, srcset, sizes, width and height; the cards' photos eager with no `fetchpriority`, the tiles' `loading="lazy"`. A page without them passes |
| `home-photo-once` | 47 | no photo twice on the home page: a file is named by its path after the size segment, a `<picture>` and its `<img>` are one photo, and lazy `data-src` counts. An element with `data-rf-photo-repeat` (ticket 49's crop of the Dry banner) isn't counted, nor are ticket 29's menu pane banners (every `data-rf-menu-banner` inside a `div[data-rf-menu-pane]`, with its `<picture>` when it is that `<picture>`'s first `<img>`: from the start tag through the banner, so a second `<img>`, or the rest of a `<picture>` never closed, still counts), the categories' images in the closed menu, the cards' banners among them; a marked banner anywhere else counts |
| `home-link-sections` | 49 | when the page has the Species section (`section.rf-species`) or the About block (`section.rf-about`): one `<h2>` each, which names the section; every photo a lazy `<img>` with a srcset of two or more candidates, sizes, width and height, no `fetchpriority` and no CSS background; each Species group's photo one link to a page holding its `<img>`, its `<h3>` name and a call-to-action `<span>`, with nothing interactive inside, and each pill a link to a page; no link to a hidden size category (`/fly-sizes/`); the photo marked `data-rf-photo-repeat` at least one widget away from every widget that shows it unmarked (the Dry card); and in About, alt text on the photo, a `tel:+1` and ten digits phone link, and no product card or price. A page without them passes |
| `home-no-stock-strips` | 47 | no stock featured, most popular or new products strip on the home page (`config.json` sets the three `homepage_*_count` to 0) |
| `home-nothing-between` | 47 | when the page has both the Fly Type cards (`.rf-type-cards`) and the tiles (`.rf-home-tiles`): nothing between them but end tags and empty `<div>` wrappers (and `<script>`, `<style>` or `<template>`). A widget there (any `data-widget-id` but the tiles' own wrapper), any other element, or any text fails it: a Page Builder widget in `home_below_carousel` or `home_below_featured_products`, one before the tiles in `home_below_top_products` or after the hero in `home_below_menu`, or a store shipping message. The tiles before the cards fail too. A page without both passes |
| `home-product-bands` | 48 | when the page has ticket 48's bands (`section[data-rf-band]`): each band's heading an `<h2>`, best sellers before the Signature band, and no `<button>`, form control or "+ Add" in either; each card (`.rf-product-card`) one `<a href>` to a page with nothing interactive inside, its photo (when it has one) an `<img>` with `alt=""`, src, srcset, sizes, width and height, `loading="lazy"` and no `fetchpriority`; the Signature button an `<a href="/brands/ReelFlies.html">` whose label has no number (HOME-4). The hidden spare cards are checked like the rest. A page without the bands passes |
| `card-images` | 31 | on category, search and brand pages, the cards in the listing's `.productGrid` (in `#product-listing-container`): every product a card, each photo (or the default image) with a real `srcset` (no lazysizes stand-in), `sizes`, a width and a height, never through lazysizes; the first three eager and every later one `loading="lazy"`; one image on the page with `fetchpriority="high"`: the banner's when the page has one (`img.rf-listing-banner`, ticket 32), else the first card's, and no other. A category pin must have a grid; a search or brand page with none passes |
| `category-page` | 32 | on category pins: one listing header holding the page's one H1; its banner, where it has one, eager with `fetchpriority="high"`, a `srcset` of two or more candidates, `sizes`, a width and a height and `alt=""`; every chip a link with an href and the "more" chip hidden in the HTML; the description's rest (`data-rf-description`) after the product grid, and no `<!--more-->` marker in the page |
| `category-robots` | 32 | on category pins: exactly one robots meta, "noindex, follow", on `category@noindex` (the noindex template), and none that says noindex on the others |
| `facet-links` | 33 | on every page: each element with `data-faceted-search-facet` a link with a URL, and each one whose URL carries a filter (any query parameter but `_bc_fsnf`, paging, sorting and the search query) with `_bc_fsnf=1` in it and `nofollow` in its rel (SEO-12, SEO-6). The pager's links and the clear links carry no filter and aren't checked. BigCommerce sends a client it takes for a bot no facet items, but the raw-HTML fetch isn't one (the brand listing's "Which clients get facet items", below): through `stencil start` on channel 1 it bites on the `category` and `brand` pins (seven and ten facet links on 2026-10-09), and on the prelaunch host's pins once they list products with filtering set. `brand-page` fails the brand pin if its facets ever come without items |
| `size-filter` | 33 | on category pins and, since ticket 36, the brand listing's: the Fly Sizes facet as pills (`facet-sizes.html`), not stock's list, with one "What do sizes mean?" link to `/fly-hook-size-chart/` in its block; on the fly pins (`category`, `category@noindex`, `brand`), Fly Sizes among the facets whenever any facet is listed, so a renamed option fails rather than leaving stock's list (`size-facet-name.html`); and no stock no-products alert (`data-no-products-notification`), which `category.js` focuses on load. The raw-HTML fetch gets the facets' items (the brand listing's "Which clients get facet items", below), so the first two bite on channel 1's `category` and `brand` pins, and on the prelaunch host's once filtering is set (ticket 21) |
| `species-hub` | 34 | on species-hub pins: the H1 "Fly Fishing Flies by Species" (`reelflies.hub.heading`) and the tiles inside `<main>`; each tile's name an `<h2>` link with an href, its photo a second link to the same page with `tabindex="-1"` and `aria-hidden="true"`, holding an `<img>` with a real srcset (no lazysizes), sizes, a width and a height; the first two tile photos eager (`EAGER`), every later one `loading="lazy"`, and the first tile's photo the page's one `fetchpriority="high"`; each Fly Type list's links with an href and a name; no "no products" message (stock's alert or `rf-listing-empty`), no `<!--more-->` marker, no robots noindex, and a canonical on the page's own path; the grid, when there is one, after the tiles, at most a page of cards (`categorypage_products_per_page`), every card photo lazy with no `fetchpriority`, and a numbered pager when its count runs past the cards listed; and, on any pin but channel 1's stand-in (`STAND_IN`), what criteria 1 and 2 wait for on prelaunch: the root's intro under the H1, each tile's count and intro, and Fly Type links on some tile (a Menu Display Depth below 3 leaves none) |
| `brand-page` | 36 | on brand pins: one listing header (`listing-header.html`) holding the page's one H1, and no stock brand image (`.brand-image-container`); its banner, where the brand has an image, checked as `category-page` checks a category's (the two share `listingHeaderProblems`); the `brand_below_header` region right after the header, where the intro widget goes; no robots meta that says noindex; and, where the page lists products under the facet nav (`#facetedSearch-navList`), at least one facet link (`facet-links`' `facetAnchors`), so a fetch the store takes for a bot fails rather than leaving `facet-links` and `size-filter` nothing to check. The canonical is the store's (`one-canonical` counts it): `/reelflies-2/`, the brand's own URL, on both channels on 2026-10-09, though 1895766's breadcrumb names the `/brands/ReelFlies.html` alias |
| `size-pills` | 37 | on product pins: the options container visible in the server HTML (no `display:none`); no rectangle option in stock's markup (`rectangle-group-label`, or a `set-rectangle` group without `data-rf-pills`), as after a lost hook; each pill group (`data-rf-pills`) a radiogroup labelled by an id of its own, on one element; and the size group (`data-rf-pills="size"`) with one "Hook size guide" link to `/fly-hook-size-chart/` and, with more than one size, no radio checked. Channel 1's `product@sizes` pin (Fat Albert) is where the last rule bites |
| `product-page` | 39 | on product pins with a product view (the harness's own fixture pages have none): the main image (`img[data-main-image]`) with `fetchpriority="high"`, a real srcset, sizes, a width and a height, never through lazysizes, and the page's only `fetchpriority="high"` (SEO-8); one buy box (`data-rf-product-buy`) holding the H1 and the buy form, its shipping line (`data-rf-ship-line`) with no placeholder ("{", "undefined", "X.XX") and the promise line (`data-rf-promise`) after Add to cart; the details (`data-rf-product-details`) after the buy box, each section with one summary: "About this fly" open when there is one, "Shipping and delivery" closed wherever the buy box has the shipping line, and "Hooks and tying" closed and linking to `/fly-hook-size-chart/` wherever the price says "/ fly"; no weight row (`data-product-weight`); and related patterns, when the product has any, a grid of cards (`data-rf-related`) with no carousel, stock tabs or eager photo |
| `product-reviews` | 40 | on product pins: aggregateRating and review in the Product JSON-LD exactly when the page has the reviews section (`section[data-rf-reviews]`), so stock's JSON-LD on a page that shows no reviews fails (criterion 3: Theme Styles' "Show product reviews" off, with the `show_product_reviews-off` overlay); with the section, reviewCount is its "Reviews (N)" and the JSON-LD has one review for each listed, each `datePublished` an ISO 8601 date; one section at most, `id="product-reviews"`, its `<h2>` "Reviews (N)", at most five reviews (`productpage_reviews_count`), each with an `<h3>` title; the star summary (`data-rf-review-summary`) exactly when there is a section, in the buy box, linking to `#product-reviews` with the section's N; and stock's review form (`#modal-review-form`) on the page exactly when one control opens it (`data-reveal-id="modal-review-form"`), in the section or the no-reviews block (`data-rf-reviews-empty`), so a product with no reviews still offers "Write a review" while the store takes reviews (criterion 2). Two pins are held to their criterion, keyed as `dead-ends` keys `search@none`, so a page that lost its reviews, or its form and button together, fails rather than passing as consistently absent: `product@reviews` (criterion 1) must show the section, so the summary and the JSON-LD's reviews, with "Write a review" in it, and under the `show_product_reviews-off` overlay (`QA_OVERLAY`, criterion 3) no section and the no-reviews block with "Write a review" alone; `product` (criterion 2) no section and the no-reviews block with "Write a review" (should the store's product gain a review, it fails: pin one with none). A page with no product view (the harness's fixture pages) isn't held to either. A block that doesn't parse is `json-ld-parses`' |
| `product-schema` | 40 | on product pins: exactly one Product block in the JSON-LD, with exactly one Offer (one object of `@type` Offer, or a list of one; never none, several or an AggregateOffer) naming its `priceCurrency` and a price (or stock's `minPrice` and `maxPrice`); and the brand marked up exactly when the product view names one (stock's `data-product-brand`), as a Brand of the same name, which ticket 18's job gives in-house flies; and on `product@in-house`, brand "ReelFlies" itself (criterion 7), since the view rule alone passes a fly the job left unbranded (the view and the JSON-LD both read `product.brand`). No channel pins `product@in-house` yet: it waits on ticket 18's brand apply, so today `product-schema` passes only because no pinned product has a brand, and criterion 7 isn't proven live. A page with no product view isn't held to the view's brand; a block that doesn't parse is `json-ld-parses`' |
| `dead-ends` | 51 | on the 404, cart and search pins: exactly one `<h1>`; the 404 page's ReelFlies content (`data-rf-not-found`) inside its `<main>`, with the stock search box (a form with an action); on the empty cart (`data-rf-cart-empty`), no heading that takes focus (stock's `<h3 tabindex="0">`) and one way forward, a link with a URL; a search's help (`data-rf-search-empty`) naming the query as the pin asked for it, as text, never beside stock's own no-match line or tips, and required on `search@none`; and in each, the Fly Type list's links (`data-rf-menu-id`) exactly the ids it declares, in order, with at least one, or no list and no empty `<ul>`. So on prelaunch, once tree 4's ids are set (wave R1), the curl run proves the six Fly Types and Flies by Species are server-rendered links in menu order (story 66) |
| `store-schema` | 40 | on the home page: exactly one WebSite and one OnlineStore block (`components/reelflies/store-schema.html`), naming the same URL, the WebSite published by the store; the store's telephone, the number the footer dials (the store profile's) digit for digit whenever the footer shows one, and every address line; `sameAs` exactly the footer's social row, in order, whenever the footer shows one (both are ReelFlies' social set, `social-keep.html` with `rf_store_same_as`); the free-shipping rule exactly when the store block declares a threshold (`data-rf-ship-free-threshold`, from `rf_ship_free_threshold`): free standard shipping to the store's country on orders from that amount, at a rate of 0, and a threshold that isn't a number fails; no `logo` until ticket 14's master (decision 17). On every page, no `hasMerchantReturnPolicy` until Shaun states a policy (decision 10), and on every page but home no WebSite or OnlineStore block. `render/partials/store-schema.test.mjs` renders the partial for every variation and every optional value, and as `stencil start` serves it with the channel's own URL stripped (the URLs are written `https:\/\/…`, so they stay whole), and with values holding `</script>` or `<!--<script>`, where no raw `<` may reach a block's text (`json-string.html` escapes each one); `render/partials/social-set.test.mjs` holds the footer's social row (`components/reelflies/social-links.html`) to stock `social-links.html` and to `rf_store_same_as`; `store-schema-settings.test.mjs` holds the `rf_store_*` keys, their Theme Styles fields and release rule 1 |
| `quick-add` | 43 | on every page: every "+ Add" (`data-rf-quick-add`) a link to its product's page (SCOPE-3), in a card, named "Add" and the pattern; a card with "+ Add" has no stock actions row, and no card Quick view button or stock Add to Cart (`add_to_cart_url`) is on the page beside one (the Quick view guard; a card with no options links to its page); none on a card sold out in every size or on a product page (the related cards); no panel (`data-rf-qa-panel`) in the server HTML. With `rf_quick_add` off it passes: channel 1's listings bite only under `QA_OVERLAY=rf_quick_add-on` |

**Still to come:**

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

## The skin (`skin.spec.mjs`)

Ticket 25's checks in a browser (spec seam 1; stories 67 to 71), on every page pinned for `QA_CHANNEL`, at 375 and 1280:

- **Focus ring:** one Tab, then focus on the first visible link and the first visible button; each shows the ReelFlies ring (2px solid #23272B, 2px offset, `!important` over the stock #0f7fff, on `:focus-visible` only), or the gold bead #F2C14E when it sits on a forest ground (`.rf-on-dark`), as the footer's do (ticket 50). The phone logo's ring is inset (-2px offset): its link fills the 56px sticky bar, so a ring outside would lose its top edge (#67). A mouse press on each focuses it with no ring. Stock `.button` eases `all` over 0.15s, so the check waits for the ring to settle.
- **Skip link:** the first Tab lands on `.skip-to-main-link`.
- **Landmarks:** axe's `landmark-one-main` and `landmark-no-duplicate-main`, which are moderate, so the axe gate doesn't fail on them.
- **Onest:** `onest-latin-var.woff2` is requested once, nothing goes to Google Fonts for the theme's fonts (the create-account page's reCAPTCHA loads its own Roboto, which is the store's widget), one Onest face is loaded, the body's stack starts `Onest, "Onest Fallback"`, and the root font size is 16px.
- **Reduced motion:** with `prefers-reduced-motion: reduce` emulated, no element or pseudo-element has a transition or animation longer than 0.01ms, where the page without it has the stock 0.15s. jQuery's animations jump too, which Jest checks (`reduced-motion.spec.js`, `global.spec.js`): the theme's jQuery isn't on `window`.
- **Reflow:** home and category pages don't scroll sideways at 320 CSS px wide, or at 640 (a 1280 window at 200% zoom).
- **The default product image:** on channel 1, a product with no photo of its own (`/mustad-9479-salmon-egg-fly-hook-100-pack/`, ticket 14's inventory) shows `img/reelflies/default-product.png`.

```sh
export QA_PORT=3400
npx playwright test --config scripts/qa/playwright.config.mjs skin.spec
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs skin.spec
```

It isn't part of `qa:prepush`, so a release doesn't run it. Ticket 54 folds the focus, reflow and reduced-motion checks into its runner.

`footer.spec.mjs` (ticket 50) runs the same way, on every page pinned for `QA_CHANNEL`: the footer on its forest ground (`footer-backgroundColor`) with the gold ring on a link from the keyboard, its columns stacked at 375 and in one row at 1280, no sideways scroll at 320 with every column inside the viewport, no serious or critical axe issue inside it, and nothing inside it that axe's `region` rule reports as content outside a landmark.

## The header (`header.spec.mjs`)

Ticket 27's checks in a browser (spec modules 2, 4 and 19; stories 4, 9, 57, 67 and 68), on every page pinned for `QA_CHANNEL`, at 375 and 1280:

- **At 1280:** one row holding the logo, "Shop flies", a visible search field, Account and Cart (with Sign out between them when signed in, below), in that order, and no Saved, Compare or Gift Certificates link. "Shop flies" opens `#menu` as a panel under the row (ticket 28's grouped panel, or the stock menu while both menu ids are empty), and Escape closes it with focus back on the button.
- **At 375:** a 56px bar that stays at the top as the page scrolls, with the logo 78px wide inside it (decision 17). Menu is a `<button>` named "Menu" with `aria-expanded`; open, it is named "Close", the drawer shows and `<html data-rf-open>` holds `drawer`; Escape closes it with focus back on the button.
- **Focus:** tabbing through the category pins (home where the channel has none), at both widths, never leaves the focused element under the sticky bar (`tabThrough` and `focusProblems` from `page-checks.mjs`).
- **axe:** no serious or critical issue in the header or the strip's landmark with the drawer or panel closed and open, and no node of axe's `region` rule inside them.
- **No script error:** the stock scripts that bound to the stock header's markup throw nothing. `cart-preview.js`'s dropdown finds nothing; `quick-search.js` finds no form where the grouped drawer renders, and binds to the stock drawer's (`navigation-menu.html:2-4`) in the fallback.
- **Signed in:** Sign out is in the row from 801px, between Account and Cart, and hidden on phones, where the drawer has it (the grouped drawer's footer, or the stock drawer's). No pin is signed in (an account is customer data), so this one test renders the header with a customer on W0-9's fixture page (the shipping strip's, with this checkout's theme CSS); `render/partials/header.test.mjs` checks the markup.
- **The rise ring:** with `rf_rise` on, `rise.js` loads, the ring plays once when the count goes up (`bumpCart`), and not under reduced motion; under `QA_OVERLAY=rf_rise-off` there is no ring and no `rf-rise` chunk.

```sh
export QA_PORT=3500
npx playwright test --config scripts/qa/playwright.config.mjs header.spec
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs header.spec
QA_OVERLAY=rf_rise-off npx playwright test --config scripts/qa/playwright.config.mjs header.spec
```

Like the skin's, it isn't in `qa:prepush`. A ticket that changes the header (28, 29, 30) runs it.

## The menu (`menu.spec.mjs`)

Ticket 28's checks in a browser (spec modules 3 and 4 and seam 2; stories 4, 5, 6, 9, 10, 19, 68 and 72). The menu's rules are `menu-urls.mjs`: the Fly Types in `rf_menu_type_ids` order, found at the top level or one level down; Flies by Species (`rf_menu_species_root_id`) with its children only; then every other top-level category but those in `rf_menu_exclude_ids`, whose children already in the rail stay out of its pane. `render/partials/menu.test.mjs` holds the template to the same rules on tree-4, tree-1 and tree-2 fixtures (tree 2 is .com's, rendered with ReelFlies US's ids for the .com preview, the build pipeline's decision 5).

- **The curl test:** each product and category pin's raw HTML, fetched with no JavaScript, links every URL those rules call for, read from the page's own `?debug=context` (its categories and menu settings; nothing else is kept or printed), as an `<a href>` in the header's `<nav>`, with the rail in that order and the `rf-menu` assertion passing. Channel 1 checks tree 1 with the channel-1 variation's ids now; wave R1 runs it on tree 4 once 1895766 has its ids and pins.
- **At 1280:** "Shop flies" opens the panel on the first Fly Type's pane with focus on its rail item; the rail reads the Fly Types, a divider and Flies by Species where there is one, then More from ReelFlies; the pane's heading is the link, beside the rail, its children in two columns; a rail item shows its own pane alone; no "All …" line; Escape closes it.
- **At 375:** each drawer row is its name as a 48px link and a 48px chevron button named "Show <name>" that opens the children in place and flips `aria-expanded`; `<html data-rf-open>` holds `drawer` while it is open; the footer lists Account, the channel's Shipping & Returns and Contact us pages, the hook size chart, "Fly fishing articles" (with the blog on) and "Call" with the store's number as a `tel:` link.
- **axe:** no serious or critical issue in `#menu` with a row open at 375 and a pane open at 1280.
- **Story 72:** the links in the menu after opening the drawer or the panel and its panes are the server HTML's, unchanged.
- **The fallback:** with both ids empty (1895766 today, or `QA_OVERLAY=menu-ids-empty`), the stock navigation renders in `#menu`, with `data-menu`; with the Species id empty there is no Species group.
- **Tree 4** (six Fly Types, Flies by Species and its 11 names) on W0-9's fixture page, opened by setting the classes and attributes the scripts set: the rail's order at 1280 and the Species pane at 375, with axe, until refactor 13 gives a channel that tree.

```sh
export QA_PORT=3500
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs menu.spec
npx playwright test --config scripts/qa/playwright.config.mjs menu.spec
QA_CHANNEL=1 QA_OVERLAY=menu-ids-empty npx playwright test --config scripts/qa/playwright.config.mjs menu.spec
```

It isn't in `qa:prepush` either; ticket 28 runs it, and any ticket that changes the menu (29, 30). The page baselines with the menu open are the `drawer-open` and `panel-open` states.

## The rail (`rail.spec.mjs`)

Ticket 29's checks in a browser (spec module 3, the behaviour half; UX-2, O08, O09, SEO-3; stories 4, 7, 8, 15 and 16), on the grouped menu of the channel's category pin: channel 1's tree 1 with "ReelFlies CA channel 1" until tree 4. With both menu ids empty (1895766 today) every test skips. `menu.js` holds the behaviour; its timing is Jest's (`assets/js/test-unit/theme/reelflies/menu.spec.js`), including UX-2's diagonal across three rail items with the menu-aim triangle and without it.

- **The diagonal (UX-2):** a straight line from the first Fly Type to its first child, moved in 25 steps over 125, 250, 500 and 1000 ms, keeps that pane open, though it crosses another rail item (Nymphs & Sub Surface Flies on channel 1).
- **Hover and clicks (story 4):** resting on a rail item switches its pane after 300 ms and not before; a click switches at once; a click on the item hover has just opened leaves it open.
- **Keys (story 8):** the arrows (round at the ends), Home and End move along the rail without switching the pane; Enter opens one; Escape closes the panel with focus on "Shop flies"; Shift+Tab from the first rail item to the header row, or Tab out past the rail's foot, closes it.
- **Height (UX-2):** at 1366x657 the whole rail is in the panel, which ends 16px above the viewport's bottom; at 1366x400 the first pane's children run past the panel and the wheel scrolls the panel, not the page. On W0-9's fixture page, tree 4's rail (six Fly Types, Flies by Species, three More) fits 657px under the store's 81px header row.
- **The banner (O09; story 7):** at 1280 each pane whose category has an image in `?debug=context`'s categories shows it, loaded, as a strip 120px tall across the pane's content box and above its heading (Shaun's review-02 answer), with the child links within 200px of the panel's top. The network check reads the banners' files from the served HTML and fails if one is requested at 375 with every drawer row open, at 1280 with the panel closed, or for any pane but the one shown. A banner whose file the page also shows elsewhere (the category page's own header image) is left out of it.
- **The rail's foot** links `/fly-hook-size-chart/` (stories 15 and 16), and axe finds no serious or critical issue in the menu with each pane open.

```sh
export QA_PORT=3500
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs rail.spec
```

## Quick search (`quick-search.spec.mjs`)

Ticket 30's checks in a browser (spec modules 4 and 5; stories 1, 2, 3 and 68), on the pins of `QA_CHANNEL`, at 375 and 1280. Its templates are rendered by `render/partials/quick-search.test.mjs` (with ticket 31's "/ fly" after a row's price); the server HTML is the `rf-search-forms` assertion. The dropdown's logic is Jest's (`assets/js/test-unit/theme/reelflies/quick-search.spec.js`):

- the category matcher, the 400 ms debounce and the stale-answer guard
- the submit rule: a submit drops the search waiting to be sent and closes the results of other words, and a search the shopper has left is dropped too
- showing the held results again on focus, or on an edit back to their words
- asking again after a failure; an answer that isn't the results template, such as a 429, a 5xx or a challenge page, is a failure that leaves nothing on the page, while a search that matches nothing still opens, saying so
- the category rows' arrow tile, the open state, and the Escape order with the phone header's row

In a browser:

- **The dropdown,** on the category pin (home where the channel has none): typing "caddis" into the visible field (the phone row at 375, the header's at 1280) sends one search request, for the whole word, and shows the count heading from the real total, up to 2 categories named "…, category", each with its arrow tile, at most 6 product rows at 375 and 8 at 1280 each with a price, and "See all N results" with the heading's N, in that order. ReelFlies_CA has no products until refactor 14, so the rows and the categories are required on channel 1 only; on 1895766 the heading says nothing matched.
- **The announcement and the open state:** the heading's words go to the shared live region once; `<html data-rf-open>` holds `search` while the dropdown is open; Escape closes it, leaves focus and the text in the field, and clears the token; focus back in the field shows the last results again; focus leaving the form closes it.
- **axe** with the dropdown open: no `aria-allowed-attr` on the field, which carries no combobox attributes, and no serious or critical issue in the form.
- **With JavaScript off,** Enter in the visible field lands on the search page (HTTP 200).
- **The phone search row** at 375 sits right under the 56px bar on the home and category pins and scrolls away with the page; it is hidden at 1280, and absent from every other pin.
- **The phone header's search icon** is the toggle quick-search.js swaps in for the link: it opens the header's form as the bar's second row, focused, and Escape closes it with focus back on the toggle.

```sh
export QA_PORT=3700
npx playwright test --config scripts/qa/playwright.config.mjs quick-search.spec
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs quick-search.spec
```

Like the header's, it isn't in `qa:prepush`. A ticket that changes the header or the search forms runs it.

## The product card (`card.spec.mjs`, `card-screens.spec.mjs`)

Ticket 31's card (`components/reelflies/card.html`, through stock `card.html`'s one-line hook) on every listing. Its markup is rendered by `render/partials/card.test.mjs`, including on a whole search page, where `@root` is empty inside the page's `{{#partial "page"}}` block, so the card takes its settings from its own context; the "/ fly" rule by `render/partials/price-unit.test.mjs`; the photos' loading by the `card-images` assertion.

- **`card-screens.spec.mjs`:** the grid's look, at 375 and 1280, on the fixture page: the real search page, with the facet sidebar the live listings have and the phone header set static for the shot, rendered round the six products of `render/partials/card/products.json` (channel 1's search results for "streamer": flies with and without sizes, a hook pack, a selection, a sold-out fly, a long name), with their own photos from `render/pages/card-grid/fixtures/files/`. The pinned category and search pages hold their live grids out of the shot (`pages.mjs`'s `hold`), so this is where the card's look and the grid's layout are checked. Its baselines are widget baselines (`widgets/<variation>/card-grid-search-…`), declared as `widget card-grid`.
- **`card.spec.mjs`:** on the pins of `QA_CHANNEL` (channel 1's category and search pins; ReelFlies_CA has no products until refactor 14):
  - "/ fly" on the search pin's cards follows the price-unit rule for each product, read from the store's `?debug=context` with the channel's `rf_price_unit_exclude`; the pin must hold a fly and a product under each root the rule leaves out.
  - The stock actions (quick add off, SCOPE-3) are a row under the price at both widths, and Quick view opens from it at 375 as well as 1280.
  - The cards' links on the search pin, against `?debug=context` and by path (stencil start serves the store's links as paths): the name, the photo and Choose options go to the product, and Add to cart's URL adds that product.

```sh
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs card.spec
```

## The Fly Type and Species pages (`category.spec.mjs`, `category-screens.spec.mjs`)

Ticket 32's category page (`components/reelflies/category-page.html`, which `pages/category.html` and the noindex template `pages/custom/category/rf-noindex.html` both render). Its markup is rendered by `render/partials/category.test.mjs` on tree-4-shaped pages (`render/partials/category/pages.json`, with tree 4's categories and menu ids): the banner rule, the description split at `<!--more-->`, the chips, 24 a page and the pager, and the noindex template matching the stock one but for its robots meta. The chips' layout is Jest's (`category-chips.spec.js`). The server HTML is the `category-page` and `category-robots` assertions'.

- **`category-screens.spec.mjs`:** on the fixture page, the real category page round tree-4-shaped data (`render/pages/category-page/`: two Fly Type pages, Dry Flies and Nymphs, whose ten sub-types overflow two rows, and a Species page, with channel 1's own category images), at 375 and 1280, because ReelFlies_CA has no tree-4 categories until refactor 13 and the live grids are held out of the shots (`pages.mjs`'s `hold`). Its baselines are widget baselines (`widgets/<variation>/category-page-<case>-…`), declared as `widget category-page`. It runs the real `category-chips.js` and ticket 33's `size-filter.js` in the page (`render/theme-script.mjs`), and ticket 33 adds its own fixtures and checks (below).
  - each page matches its baseline
  - the banner: eager, `fetchpriority="high"`, 220px tall from 801px with the H1 and the intro on it (each line 4.5:1 or better over its lightest pixel), the photo first on phones
  - the chips: two rows at most, every link in the page, "+N more" at 1280 and "Show all N" at 375, which shows them all and puts focus on the first it showed; thumbnails only where a subcategory has an image
  - laying the chips out moves nothing below them, with and without reduced motion, and no chip stretches past its own height. The clip is checked as still on before the script runs; if the script never runs, the clip lifts after 10s
  - nothing scrolls sideways at 320; the first row of products starts within the first screen at 375x667 and 1366x768; no serious or critical axe issue
- **`category.spec.mjs`:** on channel 1's category pins, at 375 and 1280: the banner on `category` (Realistic Trout Flies, one of the channel's menu ids), and the plain header under `menu-ids-empty`; the plain header on `category@more` (Fly Gear) and `category@noindex` (a sub-type, which `custom-layouts.json` maps to the noindex template), though both have images; the chips against the store's subcategories from `?debug=context`, in two rows at most; no sideways scroll at 320; the first row within the first screen at 1366x768 (the phone fold is the fixture page's: channel 1's own 108px announcement bar sits above its pins).

```sh
npx playwright test --config scripts/qa/playwright.config.mjs category-screens
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs category.spec
```

### The Fly size filter (ticket 33)

The Fly Sizes facet as pills (`components/reelflies/facet-sizes.html`, through stock `facets/multi.html`'s hook), the row above the grid (`listing-top.html`: the count, Filter on phones and stock's sort bar in the reference's look) and the empty states (`listing-empty.html`), on the same fixture page. Its fixtures carry the facet as BigCommerce shapes it, in the API's order: Dry Flies, Nymphs and Trout Flies (fifteen sizes, then "Show more", as ticket 21 sets the facet), and two more, `filtered` (size 14 picked) and `empty` (filters that match nothing). The facet's name is in one place for the templates (`size-facet-name.html`).

- **The templates** are rendered by `render/partials/size-filter.test.mjs`:
  - the pills' anchors untouched: the context's URL with `_bc_fsnf=1`, `rel="nofollow"` and the marker
  - each pill named "Size 14", the selected one current, and no count
  - stock's ids, which `faceted-search.js` finds the list by
  - "What do sizes mean?" linking to the chart
  - every other facet stock
  - the pills' items without stock's `navList-item`, which stock's "Show more" search hides
  - the facet's name the same in the templates, `facet-order.js`, `quick-add-route.js` and the assertion, and a facet under another name left stock
  - the "Show more" list's `data-facet`
  - the count in flies or products, a size among the filters counting as flies when the facet is gone
  - Filter only with a visible facet
  - the listing's sort chosen, and the row and the empty state for another listing's context, as ticket 36's brand listing will include them
  - the empty states taking no focus
  - the whole category page
- **`size-filter.js`** is Jest's (`size-filter.spec.js`):
  - hook order on load, after a refresh and in the "Show more" modal, with no attribute written
  - focus back on the size used, on the sort box, or else on the count, and left alone when it is still on the page
  - the count announced once after a refresh, and not when focus goes to the count, which says it
  - a size picked in "Show more": focus on it in the sidebar, after the modal has closed
  - an element only added to the listing, or added and removed in one task, taken for no refresh
  - Filter opening the facets through stock's toggle, opening Fly Sizes, and moving focus to the first pill
  - `hook-order.js` and `facet-order.js` keep their own specs.
- **`size-filter-stock.spec.js`** (Jest) runs the same module with stock's own `category.js`, `faceted-search.js` and `collapsible.js`, on the sidebar and listing that `renderPartial` renders from the `fly-type` and `filtered` fixtures (in a child `node` process, since Jest can't load `render.mjs`), with phone CSS and a stubbed `api.getPage`: Filter opening the panel and Fly Sizes with either script loaded first; both staying open through stock's whole refresh after a pill, both toggles saying so, focus on the size and the count spoken once; a sort refresh keeping a closed panel closed.
- **`category-screens.spec.mjs`** runs the real module in the page (`render/theme-script.mjs`):
  - the pills in hook order
  - a refresh with focus and the announcement
  - the empty state
  - Filter at 375, and Sort by on the row's right; at 320 the sort box on its own line with its longest option whole, in 16px text
  - "Show more" under the pills, at least 24px tall
  - the listing in its column beside a sidebar that shows nothing (no facet visible, no filter applied), at 1280
  - with the chips' and the fold checks as before
- **The `size-filter` and `facet-links` assertions** check the server HTML.

## The Species hub (`species-hub.spec.mjs`, `species-hub-screens.spec.mjs`)

Ticket 34's hub (`pages/custom/category/species-hub.html`, the custom category template of the Species root, `/species/`), with one tile per Species page (`components/reelflies/category-tile.html`) and its Fly Type links (`category-tile-types.html`), then the grid. Its markup is rendered by `render/partials/species-hub.test.mjs` on the fixture page's tree-4-shaped data: the H1 and the root's intro (the whole description when it has no `<!--more-->`), a tile per Species with its photo or the default image, its count and its intro, the Fly Type links found by id with the root at the top level or one level down (none when the data stops at the Species, a Menu Display Depth of 2), the first two photos eager and the first the page's one high-priority image, the grid with every card lazy and the pager, no grid and no message with no products, and the stock category template's front matter, inject and head block. The server HTML is the `species-hub` assertion's.

- **`species-hub-screens.spec.mjs`** (in `qa:screens`), at 375 and 1280, on the fixture page `render/pages/species-hub/`: the real hub round the root "Flies by Species", its eleven Species pages in tree 4's order with the Species × Fly Type pages refactor research 01 drafts (Trout, Steelhead, Atlantic Salmon, Bass and Pike & Muskie have them), DRAFT intros, channel 1's own category images (three Species have none), and ticket 31's six cards, because ReelFlies_CA has no Species root until refactor 13. Its baselines are widget baselines (`widgets/<variation>/species-hub-tree-4-…`), declared as `widget species-hub`. It checks:
  - the baseline
  - one `<main>` and one `<h1>`, the intro under it, the tiles and the grid inside `<main>`
  - two columns of tiles at 320, 375 and 600, three at 801, 1024 and 1280, each photo 3:2, and each tile as wide as its `sizes` says
  - the eager photos all in the first row and the first screen (375x667, 1280x800), the whole first row on a phone, and the first tile's photo the page's one `fetchpriority="high"`
  - every Fly Type link 24px tall or more, inside its tile, and nothing sideways at 320
  - an intro's paragraphs 8px apart, the root's and a tile's (the fixture's are one paragraph, so the spec adds a second)
  - the grid after the tiles, then the pager, then the description's rest
  - axe
- **`species-hub.spec.mjs`** (runs only when named), on each `species-hub` pin, at 375 and 1280, against the store's own data (`?debug=context`): a tile per subcategory in the store's order, with its name, its link, its photo or the default image and its count; each tile's Fly Type links the subcategory's children in the categories data (none on channel 1's stand-in: its Species-like pages are tree 1's third level, and Menu Display Depth 3 leaves their children out; on any other pin, data with none fails, as a Menu Display Depth below 3); the grid with a page of cards and the numbered pager, and no "no products" message; two columns on phones and three from 801px with the eager photos in the first row; nothing sideways at 320.

```sh
npx playwright test --config scripts/qa/playwright.config.mjs species-hub-screens
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs species-hub.spec
QA_CHANNEL=1895766 npx playwright test --config scripts/qa/playwright.config.mjs species-hub.spec   # wave R2, once /species/ is pinned there
node --test scripts/qa/render/partials/species-hub.test.mjs scripts/qa/raw-html/assertions/species-hub.test.mjs
```

## The ReelFlies brand listing (`brand.spec.mjs`, `brand-screens.spec.mjs`)

Ticket 36's brand page (spec module 12): `pages/brand.html`'s page block is `components/reelflies/brand-page.html`, and stock `brand/product-listing.html`, which stock `brand.js`'s faceted search also renders alone after a filter, a sort or a page link, is `components/reelflies/brand-listing.html`. It is the category page's listing with the brand's own header: ticket 32's `listing-header.html` (the banner when the brand has an image, else the plain header, the brand's name as the H1), the `brand_below_header` region under it for the intro widget, stock's sidebar with ticket 33's pills, ticket 33's row and empty states, the card grid and stock's numbered pager, 24 a page (`brandpage_products_per_page`). A brand's context has no total (BigCommerce gives brand pages none; channel 1, 2026-10-09), so its row names the page instead ("Page 2", from `pagination.brand.current`), never empty while it lists products, since `size-filter.js` focuses or announces it after a refresh (story 68). The `brand_below_content` region sits after `<main>`, which stock `brand.js` empties on every refresh, as the category page's does. The markup is `render/partials/brand.test.mjs`'s (the page and the listing alone, the banner and plain headers, the row's page, the regions, the empty states, the pager, the front matter), and the server HTML is the `brand-page`, `card-images`, `size-filter` and `facet-links` assertions'.

- **The pins:** `/brands/ReelFlies.html`, which the store answers as brand 411 (its own URL, and the canonical, is `/reelflies-2/`). On channel 1 it lists the brand's 2,167 products (2026-10-09), holds its grid as the category pins do, and shows the row's "Page 1"; the brand has an image, so the banner; its sidebar is empty in the shots, as the gates' headless browser gets no facet items (below), while the raw-HTML checks see its ten Fly Sizes pills. On 1895766 the brand has no products until refactor 14, so the shot shows stock's message.
- **`brand-screens.spec.mjs`** (in `qa:screens`), at 375 and 1280, on the fixture page `render/pages/brand-page/`: the real brand page round channel 1's brand context, with nine of the brand's own patterns and their photos and the brand's 16:7 image, in three cases, `banner`, `plain` (no image) and `empty` (filters that match nothing). Its baselines are widget baselines (`widgets/<variation>/brand-page-<case>-…`), declared as `widget brand-page`. It checks:
  - each case's baseline, one H1 in the header and no stock heading
  - the banner: eager, `fetchpriority="high"`, 220px tall from 801px with the H1 on it at 4.5:1 or better, on phones the H1 under the photo; with no image the plain header and the first card the page's one `fetchpriority="high"`
  - ticket 33's pills in hook order from the API's order once `size-filter.js` has run, and Filter on phones; the empty state's message and Clear filters, with focus left alone
  - after a refresh in place, as stock `brand.js` makes one: a page link's sends focus to the row, which names the new page in a box that shows; a size picked at 1280 sends it back to the pill, and the row's page is announced (story 68)
  - the first row within the first screen at 375x667 and whole at 1366x768; nothing sideways at 320; axe
- **`brand.spec.mjs`** (named only), on the live pins, at 375 and 1280: one H1, the brand's name, with the banner or the plain header as the brand's `?debug=context` says; a full page of 24 cards when the brand has a next page, and the numbered pager's `<a href>` links, of which page 2 leads there; nothing sideways at 320; the first row within the first screen at 1366x768. On 1895766: stock's message, with no grid and no pager.
  - **Which clients get facet items.** BigCommerce sends a client it takes for a bot the facets with no items. Through `stencil start` on channel 1 on 2026-10-09 (GET only, each fetch repeated), curl's User-Agent and headless Chromium's (`HeadlessChrome` in its User-Agent or in its `Sec-CH-UA` client hint) got none, while a regular Chrome's, Node's default fetch and the raw-HTML gate's own (`ReelFliesQA/1.0`, `raw-html.mjs`) got the brand's ten Fly Sizes, Realistic Trout Flies' seven and Mustad's three. So the page shots, in headless Chromium, show an empty sidebar on channel 1, which keeps them still, and the raw-HTML gate's `facet-links` and `size-filter` check the server HTML's pills in `qa:prepush` (`brand-page` fails the pin should they ever come without items). The brand's "Other" facet had no items for any client.
  - **The pills, as a regular browser sees them.** This spec's pill tests set a regular Chrome's User-Agent and `Sec-CH-UA` (`test.use`), and check what JavaScript and a refresh do: the pills in hook order once `size-filter.js` has run, every facet link on the page passing `facet-links`' own check, and "What do sizes mean?"; at 1280 a size picked refreshing the listing in place through stock `brand.js` and the brand's listing, with that pill current and focused and the pills still in hook order. Where the brand's facet has no items (1895766) they skip.

```sh
QA_VARIATION="ReelFlies CA" npx playwright test --config scripts/qa/playwright.config.mjs brand-screens
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs brand.spec
node --test scripts/qa/render/partials/brand.test.mjs scripts/qa/raw-html/assertions/brand-page.test.mjs
```

## The hook size chart page (`hook-chart-screens.spec.mjs`)

Ticket 35's page (`pages/custom/page/hook-size-chart.html`, the custom template of the Web Page at `/fly-hook-size-chart/`). Its template is rendered by `render/partials/hook-chart-page.test.mjs`:

- one `<main>` and one `<h1>`
- the page's content split at the rows' start marker, the gauge between the copy and the rows (with no rows yet, the copy alone)
- every gauge size linking to its row
- the rows' facet links as `scripts/hook-chart/rows.mjs` writes them (`_bc_fsnf=1`, `rel="nofollow"`)

The rows' fixture, `render/partials/hook-chart/rows.html`, is a run of the row script on its own fixtures. The same test holds it to the script's output, the fixture page's content to it, and the template's marker to the script's.

- **`hook-chart-screens.spec.mjs`** (in `qa:screens`), at 375 and 1280, on the fixture page `render/pages/hook-chart-page/`: the real chart page round a draft of its copy and those rows, because the Web Page doesn't exist on ReelFlies_CA yet. Its baselines are widget baselines (`widgets/<variation>/hook-chart-page-chart-…`), declared as `widget hook-chart-page`. It checks:
  - the baseline
  - one `<main>` and the H1
  - the gauge between the copy and the rows
  - every hook drawn to one scale (the same px per mm) at 320, 375 and 1280, with no sideways scroll
  - a gauge size landing on its tinted row, clear of the sticky header
  - no sideways scroll at 320
  - axe

```sh
QA_VARIATION="ReelFlies CA" npx playwright test --config scripts/qa/playwright.config.mjs hook-chart-screens
node --test scripts/qa/render/partials/hook-chart-page.test.mjs
```

## The cart (`cart-screens.spec.mjs`)

Ticket 41's cart (spec module 18) on the fixture page: the real cart page rendered round a 12-pattern cart (`render/pages/cart-page/fixtures/twelve.json`, products from the reference page's data with their own photos), and a smaller one with a coupon on every line and a four-figure total (`discounted.json`). A cart on channel 1 would be a live write (W0-6), and ReelFlies_CA has no products until refactor 14. The server groups the lines by pattern; the fixture page loads no theme bundle, so the spec runs the real `cart-groups.js`, which sorts each group's sizes, in it through `render/theme-script.mjs`, which turns listed theme modules into one browser script with the bundle's own Babel options.

- **The look,** at 375 and 1280: each cart without the fixed phone bar, and the bar on its own at 375 (widget baselines, `widget cart-page`).
- **Grouping:** one group per pattern, sizes in hook order once sorted; until then a group of several sizes keeps them out of view, and sorting moves no group and not the summary (CLS); a pattern with sizes priced differently shows each size's unit price; the lines add up to the subtotal.
- **Photos:** each group's 64px photo, linked to the product, at 320, 360, 375, 414 and 1280.
- **Rows and totals (story 71):** in both carts at 320, 359, 360, 375, 390, 400, 414, 419, 420, 430 and 1280 (either side of the 360px tightening and the 420px one-line breakpoint), every row and its controls inside the group, no line total wider than its column, and nothing scrolling sideways. The discounted cart has a coupon on every line, a "Size Assorted" tag and a four-figure total. These checks and the photo checks set their own viewport, so they run in the phone project only.
- **The phone bar:** the total for the flies and Check out; tabbing from the top to the summary's Check out never leaves the focused element under it, and a second test shows that check fails with the page's scroll padding taken away.
- **axe** in the cart.

Its templates are rendered by `render/partials/cart.test.mjs` (the groups, the rows and their stock attributes, the count by the brand rule, the messages, the summary and the stock markup it copies, and the whole cart page); its scripts by Jest (`cart-groups.spec.js`, `cart-guards.spec.js` for the error, refusal, unreadable-answer and network-failure paths, `cart-count.spec.js`, `cart-page.spec.js`, and `cart-coupon.spec.js` for stock `cart.js` opening the coupon field).

```sh
QA_VARIATION="ReelFlies CA" npx playwright test --config scripts/qa/playwright.config.mjs cart-screens
node --test scripts/qa/render/partials/cart.test.mjs scripts/qa/render/theme-script.test.mjs
npx jest assets/js/test-unit/theme/reelflies/cart
```

## The dead ends (`dead-ends.spec.mjs`, `search-empty-screens.spec.mjs`)

Ticket 51's 404 page (`components/reelflies/not-found.html`), empty cart (`cart-empty.html`) and help for a search with no results (`search-empty.html`), each through a hook in its stock page, and the Fly Type links they share (`404-links.html`, through ticket 50's `menu-links.html`). Their markup is rendered by `render/partials/dead-ends.test.mjs` as whole pages (inside a page's `{{#partial "page"}}` block `@root` is empty, so the links read the categories their caller passes), their server HTML is the `dead-ends` assertion's, and their look is the page shots'. The pins: on both channels the 404 page (`404`), the empty cart (`cart`: the gates' browser has no cart, and a GET of `/cart.php` changes nothing) and `search@none`, a search for a word nothing matches. ReelFlies CA's menu ids are empty until wave R1, so 1895766's dead ends have no links; channel 1's carry tree 1's.

- **`dead-ends.spec.mjs`,** on the pins of `QA_CHANNEL`, at 375 and 1280: one main landmark and one H1 after the scripts have run, and no serious or critical issue from axe's landmark and heading rules (story 68); the Fly Type links exactly the channel's menu ids in order, as the store's own categories from `?debug=context` resolve them, or no list with both ids empty; every link in a dead end, the empty cart's way forward among them, answering 200; keyboard focus moving through a dead end's controls and links in page order, and no heading that takes focus (story 67); the search's no-match line naming the query, and a query of markup printed as text, making no element and running no script (the XSS check); nothing scrolling sideways at 320 (story 71).
- **`search-empty-screens.spec.mjs`:** the store answers `search@none` with its own "Did you mean", whose words follow the store's content, so the pins' shots hold that panel (200px, `pages.mjs` `hold`), and the store decides when it suggests, so the help beside a panel with categories, and the same search with no panel, are checked on a fixture page: the real search page rendered round `render/pages/search-empty/fixtures/suggestions.json` ("cadis", "Did you mean caddis", one category, tree 4's menu ids). The page's content matches its baseline at 375 and 1280 (widget baselines, declared as `widget search-empty`); the help shows once, above stock's panel, with the suggestions and without them, and stock's own no-match line and tips don't; the links are bordered pills at least 40px tall and nothing scrolls sideways at 320; axe finds no serious or critical issue.

```sh
npx playwright test --config scripts/qa/playwright.config.mjs dead-ends.spec search-empty-screens
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs dead-ends.spec search-empty-screens
node --test scripts/qa/render/partials/dead-ends.test.mjs scripts/qa/raw-html/assertions/dead-ends.test.mjs
```

The 404 page's note region, `rf_404_note`, renders only what the store places for the channel. `stencil start` never fills a `pages/errors/*` page's regions, so a placed note shows only on the prelaunch host; the fixture render test checks the region with a note and without one.

## The size pills (`size-pills.spec.mjs`)

Ticket 37's pills (`components/reelflies/size-pills.html`, through stock `options/set-rectangle.html`'s hook) and `size-pills.js`, which follows stock's sold-out marks. Stock renders the hook on the product page, in Quick view and in the cart's Change dialog; `pills-in-modal.js` (a global module) loads `size-pills.js` for pills that appear in `#modal`.

- **The templates** are rendered by `render/partials/size-pills.test.mjs`:
  - stock's radios and labels in a radiogroup, with the same attributes as stock's own block (kept unrendered below the hook)
  - a group id from the product and the option, or from the option alone in the Change dialog
  - no size checked on a fresh product view unless it is the only one, while another option keeps its chosen value; in the Change dialog the line's own size stays checked and named
  - the size option found by the Fly size facet's name (`size-facet-name.html`), in any case, and marked `data-rf-pills="size"`
  - "Hook size guide" on the size group only, and stock's "(Required)" kept for screen readers
  - the hidden "(sold out)", and the sold-out line's words on the size group only (another rectangle option has no line)
- **The script** is Jest's (`size-pills.spec.js`, `pills-in-modal.spec.js`): the marks, aria-disabled, the line in the singular or the plural and as stock changes the marks, the chosen size after the label, no radio checked or moved; a line change after the shopper's choice said in the live region, each answer to quick choices said, not the line on load; a group watched once, stopped when told or once it has left the page; the modal's pills watched once they appear, stopped once the modal replaces them, and a failed chunk load reported.
- **The server HTML** is the `size-pills` assertion's: on `product@sizes` (Fat Albert) its multi-size rule bites.
- **The look:** `product@sizes` and its `size-default`, `size-chosen` and `size-sold-out` states, and the product pin.
- **`size-pills.spec.mjs`** runs on channel 1's live product pages, `product` (6178) and Fat Albert (5663, with a Colour in stock swatches):
  - no size checked after scripts run
  - the pills 56x48 at 1280 and at least 44px at 375
  - a chosen pill outlined with the check and no solid fill
  - stock's marks, aria-disabled and the line in step, and still in step as 5663's Colour changes
  - the arrow keys and the focus ring
  - "Hook size guide"
  - at 320, Fat Albert's pills wrapping and nothing sideways

  It runs only when named:

```sh
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs size-pills
node --test scripts/qa/render/partials/size-pills.test.mjs scripts/qa/raw-html/assertions/size-pills.test.mjs
npx jest assets/js/test-unit/theme/reelflies/size-pills
```

## The add flow (`add-flow.spec.mjs`)

Ticket 38's buy row (`components/reelflies/add-to-cart.html`, through stock `add-to-cart.html`'s hook), the sticky add bar (`sticky-add.html`, from `pages/product.html`), and `add-flow.js`, which stock `product-details.js` hands the add's answer to through `add-bridge.js`.

- **The templates** are rendered by `render/partials/add-flow.test.mjs`:
  - stock's ids and attributes, as stock's kept block gives them
  - "Choose a size" or "Add N to cart" on the product page, the size option found by the Fly size facet's name; stock's "Add to Cart" in Quick view and stock's "Pre-Order Now"; the stepper's buttons `type="button"`
  - the product's name for the confirmation, and every word's placeholders whole
  - the stepper's start, under a visible "Quantity"
  - the status line with no role, its alert and check icons, and its text box
  - the sticky bar on the product page only
  - Quick view's reworded heading
- **The script** is Jest's:
  - `add-words.spec.js`: the labels and the confirmation
  - `add-bridge.spec.js`, with no flow loaded (a listing's Quick view, or a failed chunk):
    - a failed add taken (the button usable, the overlay gone, stock's alert) and a good one left to stock
    - a failed option change stopped
  - `add-flow-failed.spec.js` and `page-modules.spec.js`: when the flow's chunk fails to load, the slot's catch loads `add-flow-failed.js` (its own small chunk, `rf-add-flow-failed`, with no budget of its own: about 500 B, loaded only when the flow's fails), which puts stock's "Add to Cart" on the flow's buttons (never a pre-order label) and passes the error on to the loader
  - `add-flow.spec.js`:
    - the guards, on the button's click and before stock's submit: no size, a sold-out size, every size sold out (or out in the Colour chosen), a held choice with no size, a required option left to the browser's check, and the one-size wording
    - stock's hold on a choice it can't sell (`aria-disabled`, and the click saying why)
    - the add's success, error-answer, unreadable-answer and network-failure paths; focus kept; Quick view and a page with no flow left to stock
    - the header told from the cart's read, or from stock's cart summary when that fails, then `rf:cart-changed` after it
    - the confirmation: the choice as it was sent, a swatch named by its title, a product with no options named
    - the status line: a new choice clearing the last message, a pre-order label kept, the text in the template's box, and a failed option change said in its own form
    - stock's quantity limit said in the live region when its alert appears, and not again for each keystroke still over it
    - the bar: its place after a jump; its double tap and a blocked tap forgotten; its added look and its return after 4 s; a failed add, a stopped tap and stock's quantity limit said in the bar (the limit in the live region too) with focus on its button; its label and held look following the main button; focus handed to the main button when it hides
- **`add-flow.spec.mjs`** runs on channel 1's Fat Albert (`product@sizes`, several sizes and a required Colour), and on the `product` pin for its one-size case. The add and the cart's read are answered by the cart route fixtures (`fixtures/cart/routes.mjs`, which tickets 42, 43 and 44 share: `answerCartAdds`, `answerCartRead`, `cartLines`, and ticket 42's `cartOf` for a cart of several lines with their options; `answerCartRead` takes a function too, called at each read, so a test can change the cart between reads), fulfilled or aborted and never passed on, so no cart is made. `answerCartRead` answers only GET; any other method on the Cart API falls back, so the network guard fails a write a test hasn't answered. It checks:
  - "Choose a size" and focus
  - "Add 3 to cart"
  - an add with no modal, announced once, with focus kept and the header's count
  - a size stock can't sell: stock's own sold-out pass, on its option answer fulfilled with the size out of stock, holds the button, and its click says why, announced
  - a size with no Colour left to the browser's check (5663), then one add with both
  - a dropped add and a dropped option change, each announced
  - the sticky bar, `--sticky-h` and tabbing at 375, and a dropped add from the bar said in it
  - axe on the product view with the confirmation showing (the bar at rest is `qa:prepush`'s axe on `product@sizes`)

  It runs only when named. The bar's looks are the `sticky-bar` and `sticky-bar-added` states, and the buy row with stock's alert showing (the stepper and the button keep their row) is `buy-row-alert`.

```sh
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs add-flow.spec
node --test scripts/qa/render/partials/add-flow.test.mjs
npx jest assets/js/test-unit/theme/reelflies/add
```

## The product page (`product-page.spec.mjs`, `product-page-screens.spec.mjs`)

Ticket 39's layout (spec module 15): `pages/product.html` and stock `products/product-view.html`'s hooks, on the product page only (ticket 38's `rf_product_page` flag; Quick view keeps stock's view), with `components/reelflies/product-image.html` (the main image), `product-price-extras.html` and `shipping-line.html` ("/ fly" and the shipping line), `buy-box-end.html` (the promise line and "Save to wish list", with `wishlist-dropdown.html`, stock's dropdown under that label, for a customer with wish lists), `product-details.html` (the `<details>` sections, a fly's by ticket 31's rule in `fly-rule.html`, which `price-unit.html` also reads, then ticket 40's `product-reviews.html`: [The reviews](#the-reviews-reviewsspecmjs)) and `product-related.html` (related patterns: ticket 31's card through `components/products/card`, without `rf_listing`, so the cards' photos are lazy, and ticket 43's "+ Add" guard can tell them from a listing's by that and by `rf_product_page`), styled by `_product.scss`.

- **The templates** are rendered by `render/partials/product-page.test.mjs`, on the fixture page's product (the reference's Adams Parachute, `render/pages/product-page/fixtures/adams.json`):
  - the order: photos, buy box, details; and the buy box's: title, price with "/ fly", shipping line, pills, quantity and button, promise line, "Save to wish list"
  - the main image: eager, `fetchpriority="high"` (the page's only one), srcset 320w to 1520w, the ticket's sizes, `product_size`'s width and height, no lazysizes, the alt from the product's name when the photo has none, and the default image with the same priority; its own thumbnail outlined (`is-active`) as the page loads
  - two review messages in one box above the photos (`data-rf-product-alerts`)
  - the front matter asks for no `similar_by_views`
  - the shipping line: the free-shipping sentence alone while there are no rates, the standard rate and the Expedited "from" price each when set, nothing without a threshold, and never a figure it wasn't given
  - the details: "About this fly" open with the description (left out with none), the other two closed, the threshold's sentence, the chart link, the warranty and a custom-fields tab kept as sections (every child of the wrapper a section, so the first draws the hairline and a product with none draws no lone rule), and ticket 40's reviews after them; no "Shipping and delivery" without a threshold (ReelFlies US); and for gear, an Assortment or a product the rule can't place, "Description" for the first title and no "Hooks and tying"
  - "Save to wish list" as stock's form with one button for a guest, the dropdown's copy for a customer with wish lists (the same label, and its markup held to stock's `wishlist-dropdown.html` but for the label), nothing with wish lists off
  - related patterns: a grid of four cards under "Related patterns", lazy, no fetchpriority, no carousel or tab, nothing without related products
  - no weight row, no share links and no wallet buttons in the buy box; and Quick view still stock's
- **The server HTML** is the `product-page` assertion's.
- **The outline after a variant's photo:** `assets/js/test-unit/theme/product/image-gallery.spec.js` (Jest) holds stock `image-gallery.js`'s constructor hook: the main image's tile, outlined from the start, is outlined again when the main photo comes back after a variant's (`setAlternateImage`, then `restoreImage`); a clicked tile keeps its outline the same way, and with no tile outlined (Quick view) nothing is.
- **The look:** the pins' page shots (`product`, `product@sizes` and its states), with the related grid held (`pages.mjs`), and **`product-page-screens.spec.mjs`** (in `qa:screens`), on the fixture page: the real product page round the reference's product, with its own photos (`render/pages/product-page/fixtures/files/`), at 375 and 1280, and at 1280 scrolled until the buy box is held at the top of the window beside the details (story 36). Its baselines are widget baselines (`widgets/<variation>/product-page-adams-…`, and `…-adams-scrolled-desktop-1280-…`), declared as `widget product-page`. The fixture page loads no theme script, so it shows the layout as the server and the stylesheet give it.
- **`product-page.spec.mjs`** runs on channel 1's product pins (6178 and Fat Albert), at 375 and 1280:
  - the order at both widths, and the buy box left-aligned on phones
  - at 1280 the details 20px under the photos, and still 20px with "About this fly" taken out and the buy box made 600px taller (the grid's details row takes the extra height)
  - the buy box held 24px from the top of the window at 1280 as the page scrolls past the details, all of it in view (the window at the top and after scrolling are attached to the report); it holds only on a window at least 700px tall, so a tall buy box never hides its own end on a short one
  - the main image the page's only `fetchpriority="high"`, loaded from its srcset, and one thumbnail outlined as the page loads
  - on `/realistic-hopper-assortment/` (15 photos, so stock's carousel runs): the thumbnail row the same height before the carousel starts (the theme's scripts blocked) and after, and nothing below it moved
  - "About this fly" open; "Shipping and delivery" and "Hooks and tying" opening and closing with Enter and Space; the chart link
  - the shipping line under the price and the promise line under Add to cart; on Fat Albert the promise in the same place once a Colour and a size make the form valid, and on the pin (its one size checked from the start) too: stock's `toggleWalletButtonsVisibility` then shows the wallet box with an inline `display: block`, and while the store sends no wallet buttons the empty box still takes no row
  - "Save to wish list" for a guest: the store's own `wishlist.php` sends a guest to sign in (a read); the save itself, a POST, is answered here as the store answers a guest, and lands on the sign-in page
  - no weight row, no wallet buttons, no share links in the buy box
  - related patterns: four cards, one row at 1280 and two across at 375, no carousel or tab, lazy photos
  - Quick view from a related card: stock's product view
  - nothing sideways at 320, and axe on the product view and the related grid with every section open, on each pin (in the `phone-375` project only: both projects set 320)

  It runs only when named:

```sh
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs product-page.spec
npx playwright test --config scripts/qa/playwright.config.mjs product-page-screens
node --test scripts/qa/render/partials/product-page.test.mjs scripts/qa/raw-html/assertions/product-page.test.mjs
```

## Quick add (`quick-add.spec.mjs`, `quick-add-screens.spec.mjs`)

Ticket 43's "+ Add" on listing cards (`components/reelflies/quick-add-button.html`, from the card's extras slot, with `quick-add-gate.html` deciding which cards get it) and its size panel (`quick-add-product.html`, which getById renders, in a `<dialog>` that `quick-add-panel.js` builds). `rf_quick_add` is on in ReelFlies CA and off in "ReelFlies CA channel 1", so channel 1's plain runs render the stock card, and its quick-add runs use `QA_OVERLAY=rf_quick_add-on`.

- **The templates** are rendered by `render/partials/quick-add.test.mjs`: "+ Add" on exactly the cards that get it, as a link to the product named "Add" and the pattern; no stock actions row beside it and no Quick view on any card while the switch is on; a card with no options (42 CH Bow River Streamers, 5879) linking to its product page, "View" and its name, where stock's Add to Cart would add and open the cart (stock's again with the switch off and on the product page); the stock card with it off, and in the channel-1 variation; the same on ticket 34's Species hub, whose grid renders the card itself and passes quick add's own flag `rf_quick_add_card` (not `rf_listing`, so its card photos all stay lazy); none outside a listing grid or on the product page; the product's options as JSON, its pills with a group id of their own and no size chosen, the heading, the dialog's name ("Choose sizes of Royal Coachman Streamer"), Close, the footer and the words; and the words `js-settings.html` passes.
- **The server HTML** is the `quick-add` assertion's (its tests include the Species hub's page).
- **The script** is Jest's (`quick-add.spec.js`, on the templates' real renders, made in a child `node` process): the button's role and Space; a click with a modifier left to the link; the panel in the card with the sold-out sizes marked, focus on Close, the open flag and the cart's count; Escape, Close, a second tap, a press outside, focus leaving the popover, and Shift+Tab on past its "+ Add"; the sheet's Tab wrap and the browser's close; one size added, confirmed under the button and once in the live region, then the header's `cart-quantity-update` and `rf:cart-changed` `{ source: 'quick-add' }`; a failed add; 5663 and another option (a synthetic product, 9101) to the product page; a product that fails to load; nothing added straight into the listing (ticket 33); and the brand rule's and the confirmation's copies held to `cart-count.js` and `add-words.js`. `page-modules.spec.js` checks that the slot starts quick add on every listing template while `rf_quick_add` is on, even with no "+ Add" in the first render (a facet change or the pager brings them), never with it off, and reports a failure.
- **`quick-add-screens.spec.mjs`** (in `qa:screens`) opens Royal Coachman Streamer's panel on the fixture page `render/pages/quick-add/` (a Fly Type page with quick add on in both gated variations), with the real script and stand-ins for the storefront: the sheet at 375 and the popover at 1280 against their baselines (widget baselines, declared as `widget quick-add`); "+ Add" the card's width at 375 and its words' at 1280, with its focus ring inside it (the grid cell clips the card); the sheet modal with Tab kept inside, room for the first pill's ring in its scrolling sizes, and Escape back on "+ Add"; the popover closed by a Tab out, with focus on the next card's control, and by Shift+Tab on past "+ Add"; axe in the open panel.
- **`quick-add.spec.mjs`** runs on channel 1's live listings, only when named. With quick add off (the plain run) it checks the stock card, Quick view and no chunk. With it on (`QA_OVERLAY=rf_quick_add-on`) it checks, on the category, search, brand and Species-hub pins each channel has: "+ Add" on the cards `?debug=context` says get it, and their widths, with no Quick view and no stock Add to Cart; Royal Coachman's panel (4831: every size in the store's order, the sold-out ones from stock's real answer, axe on the page, the sheet's and the popover's keyboard); Monster Streamer Rainbow Pike Fly's one size (5142), with the add and the cart's read answered by the cart route fixtures; Fat Albert to its page; "+ Add" opening the panel after the listing renders again, and on page 2 on a card with several Fly Sizes; the chunk on every listing pin and on no other; and, with scripts off, the link.

```sh
QA_CHANNEL=1 QA_OVERLAY=rf_quick_add-on npx playwright test --config scripts/qa/playwright.config.mjs quick-add.spec
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs quick-add.spec
npx playwright test --config scripts/qa/playwright.config.mjs quick-add-screens
node --test scripts/qa/render/partials/quick-add.test.mjs scripts/qa/raw-html/assertions/quick-add.test.mjs scripts/qa/quick-add-switch.test.mjs
npx jest assets/js/test-unit/theme/reelflies/quick-add
```

## The reviews (`reviews.spec.mjs`)

Ticket 40 (spec modules 15 and 23; R11, SEO-5; stories 47 and 75), on the product page only (ticket 38's `rf_product_page` flag; Quick view keeps stock's rating row):

- **The templates:** `components/reelflies/product-reviews.html` in ticket 39's slot under the details (the section: "Reviews (N)", "Write a review", the newest five reviews, each an `<h3>` title with its stars, and stock's pager when there are more; or, with none, "No reviews yet for this fly." and "Write a review"), `review-summary.html` under the price (from `product-price-extras.html`: the stars and "N reviews", linking to `#product-reviews`), `review-write.html` (the one button that opens stock's review form, `products/modals/writeReview.html`, which the section's partial includes once) and `stars.html` (the icon sheet's `star`), styled by `_reviews.scss`. The section, the summary and stock `schema.html`'s aggregateRating and review follow one rule: the store's review setting, Theme Styles' and reviews on the page. Hooks: stock `products/product-view.html` (no stock rating row on the product page), `pages/product.html` (stock's own list skipped) and `products/schema.html` (the rule, and `datePublished` as an ISO date); CUSTOMIZATIONS.md has each.
- **Rendered** by `render/partials/product-reviews.test.mjs`, on the fixture page's product, whose three reviews are samples: the section's heading, reviews, stars and pager; "Write a review" once, with stock's form once; the summary's place, link and count, and Quick view's stock row; no reviews, the store's setting off and the theme's off; and the JSON-LD's aggregateRating, reviews and ISO dates only with the section, one Offer, and the brand.
- **The server HTML:** the `product-reviews` and `product-schema` assertions, in `qa:prepush` on every product pin, with each criterion's pin held to it: `product@reviews` must show its reviews (criterion 1) and `product` its no-reviews block (criterion 2). They skip on 1895766 until it pins products (refactor 14), so criteria 1, 2, 3, 5's product parts and 9 are met on channel 1, with their rerun on 1895766's product pins at wave R2. Criterion 7 waits on ticket 18's brand apply: then a channel pins an in-house fly as `product@in-house`, on which `product-schema` requires brand "ReelFlies". Criterion 3 runs the raw-HTML check under the `show_product_reviews-off` overlay on channel 1, where `product@reviews` must then show no section, mark up no aggregateRating and offer "Write a review" alone:

```sh
QA_PORT=<your port> QA_CHANNEL=1 QA_OVERLAY=show_product_reviews-off npm run qa:raw-html
```

- **The look:** channel 1's `product@reviews` page shots (its review list held, its counts masked), the product pins' (the no-reviews block), and the fixture page's (`product-page-screens.spec.mjs`), which now has the summary and the section with its three samples.
- **`reviews.spec.mjs`** runs on channel 1's `product@reviews` (`/beadhead-copper-john-copper/`, ten reviews) and the product pin (none), at 375 and 1280: the summary under the price, whose link takes the window to "Reviews (N)" with the same N; at most five reviews, each titled with its stars, and the pager when there are more, under the details and beside the buy box from 801px; "Write a review" opening stock's form, focus inside it, and Escape closing it with focus back on the button (nothing is submitted: a review is a live write); the product pin with no section or summary and its own "Write a review"; and nothing sideways at 320, with axe on the summary, the section, the no-reviews block and the open form. It runs only when named:

```sh
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs reviews.spec
node --test scripts/qa/render/partials/product-reviews.test.mjs scripts/qa/raw-html/assertions/product-reviews.test.mjs scripts/qa/raw-html/assertions/product-schema.test.mjs
```

## Cart state (`cart-state.spec.mjs`, `cart-state-screens.spec.mjs`)

Ticket 42's cart state (spec module 17; R4, O13, O15, UX-10, UX-18), on while `rf_cart_state` is on: the reader `cart-state.js` (build pipeline 6.9's `readCart()`, which ticket 44's quick add reuses whichever way the switch is set), and `cart-marks.js`, which `page-modules.js` loads as `rf-cart-state` on the product page and the listings. It reads the Storefront Cart API once as the page loads, and again after each `rf:cart-changed`, and fills what the templates keep for it: a corner check on each size in the cart, "(3 in cart)" in the size's name and "In your cart: 3 × size 14 and 3 × size 16." under the pills (`size-pills.html`, on the product page only), and "6 in cart" on each card, a link to the product page (`card-cart-state.html`, ticket 31's extras slot).

- **The templates** are rendered by `render/partials/cart-state.test.mjs`: the switch's variable from `js-settings.html` (the pills render with their option as context, where `theme_settings` can't be reached), each pill's hidden tag and corner check, the line under the sold-out line with its words, nothing on another option, in Quick view or in the Change dialog, the line once on the whole product page, the card's slot under the price, and the stock markup with the switch off.
- **The scripts** are Jest's: `cart-state.spec.js` (the mapping from Cart API fixtures to option value ids: two sizes of one pattern, 5663 with Colour and Fly Sizes, an Assortment with no options, an empty cart; and the read's failures), `cart-marks.spec.js` (the marks, the line's words, the card's total, one read for the page, the read after a change and after a change during a read, a failed read showing nothing, the cards a facet change brings, the back-forward cache) and `cart-state-slots.spec.js` (the two slots load nothing with the switch off).
- **The switch:** `cart-state-switch.test.mjs` (the Theme Styles checkbox, the release guard on both channels, the first channel-1 push, and the switch matrix's `rf_cart_state off` row).
- **The look:** the `in-cart` state on `product@sizes` (above, "UI states"), and **`cart-state-screens.spec.mjs`** (in `qa:screens`), on the fixture page `render/pages/cart-state/` (ticket 31's six cards on the real search page, with `cart-marks.js` run in it through `render/theme-script.mjs` and a fixed cart): "6 in cart" and "1 in cart" under their prices at 375 and 1280, no card moved when the lines fill in, the line's look, and axe. Its baselines are widget baselines (`widgets/<variation>/cart-state-cards-…`), declared as `widget cart-state`. The channel-1 listing pins hold their grids out of their shots, so this is where the card's line is seen.
- **`cart-state.spec.mjs`** runs on channel 1's `product@sizes` (Fat Albert) and category pins, with the cart's read and the add answered by the cart route fixtures (`cartOf`, with the sizes' option value ids and a card's product read from the page):
  - 3 × a size: its corner check alone, "(3 in cart)" in its radio's accessible name, the line, and the check on the pill's corner
  - adding 2 more through ticket 38's add flow: 5, without a reload
  - 6 of a pattern across two sizes: "6 in cart" on its card, a link to its product page
  - on each pin, the read held until the page has settled: one read as the page loads, nothing moved by its answer, no layout shift from it, and CLS 0.05 or less (story 70; ticket 17's Lighthouse run with items in the cart waits for real carts, decision 1)
  - under `QA_OVERLAY=rf_cart_state-off`: no read of `/api/storefront/carts` as the page loads, none of the markers and no `rf-cart-state` chunk (story 73)

  It runs only when named:

```sh
QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs cart-state.spec
QA_CHANNEL=1 QA_OVERLAY=rf_cart_state-off npx playwright test --config scripts/qa/playwright.config.mjs cart-state.spec
npx playwright test --config scripts/qa/playwright.config.mjs cart-state-screens
node --test scripts/qa/render/partials/cart-state.test.mjs scripts/qa/cart-state-switch.test.mjs
npx jest assets/js/test-unit/theme/reelflies/cart-
```

## Fixture renders (`render/`)

The fixture renderer (W0-9) renders a ReelFlies partial, or a widget, from fixture JSON instead of store data. So a template can be tested before the store has its data: ReelFlies_CA has no tree-4 categories until refactor 13, but the Species pages, the hub, the chips, the description split and the hook chart rows can be tested now. And a widget is checked from its source, not from what the store shows. Tickets 32, 34, 35, 36 and 46–49 use it.

| File | What |
|---|---|
| `render/render.mjs` | `renderPartial` and `renderWidget`, `readFixture`, `widgetCases`, `themeConfig`. A Jest spec can use it through a child `node` process (ticket 33's `size-filter-stock.spec.js`) |
| `render/html-checks.mjs` | `unbalancedTags(html)`: elements closed in the wrong place, closed with nothing open, or never closed |
| `render/widget-page.mjs` | the fixture page a widget shot is taken on |
| `render/theme-script.mjs` | `themeScript(names, run)`: listed theme modules as one browser script for a fixture page, which loads no bundle (ticket 41's `cart-screens.spec.mjs`, and `size-filter.js` in ticket 33's `category-screens.spec.mjs`), built with the Babel options babel-loader resolves (`bundleBabelOptions()`: `webpack.common.js`'s merged with `babel.config.js`), through `fixtureBabelOptions()`, loose mode and its assumptions included, so a module that breaks only in the bundle's build breaks there too. Its test also holds those options and `babel.config.js` to spreading a NodeList, a Set and a Map whole |
| `render/home-page.mjs` | the whole home page with every widget a channel places on `pages/home`, each from a fixture, in its region and placement order: `homeCases`, `renderHomePage` and `openHomePage` (ticket 47; `home-widgets-screens.spec.mjs` and ticket 48's `home-bands-screens.spec.mjs`, below) |
| `render/widgets/product-bands.mjs` | what ticket 48's two band render tests share: `cardsOf` (each product card a band rendered), `readQuery` (a band's `query.graphql`), `photoProducts` (the product ids in another widget's photo paths) and `withPicks` (a fixture with its query result changed) |
| `render/photo-contrast.mjs` | `worstContrastOverPhoto(page, selector)`: a line of text against the lightest pixel behind it, for text on a scrim over a photo, which axe can't judge (the hero's and the cards', tickets 46 and 47) |
| `widget-screens.spec.mjs` | the widget element shots |
| `render/pages/<name>/` | fixture pages: a real page template rendered round an empty widget from fixed data, each shot by its own `*-screens.spec.mjs` (ticket 31's `card-grid`, by `card-screens.spec.mjs`; ticket 32's `category-page`, by `category-screens.spec.mjs`; ticket 34's `species-hub`, by `species-hub-screens.spec.mjs`; ticket 35's `hook-chart-page`, by `hook-chart-screens.spec.mjs`; ticket 36's `brand-page`, by `brand-screens.spec.mjs`; ticket 41's `cart-page`, by `cart-screens.spec.mjs`; ticket 39's `product-page`, by `product-page-screens.spec.mjs`; ticket 43's `quick-add`, by `quick-add-screens.spec.mjs`; ticket 42's `cart-state`, by `cart-state-screens.spec.mjs`; "Fixture pages" below) |
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

**The widget folder** (W0-9 sets this layout; ticket 46's sync, `scripts/widgets-sync.mjs`, reads `template.html`, `schema.json`, `query.graphql` and `channels/`, and ignores `fixtures/`; [docs/widgets.md](../../docs/widgets.md)):

| Path | What |
|---|---|
| `widgets/<name>/template.html` | the widget template |
| `widgets/<name>/fixtures/<case>.json` | its fixtures |
| `widgets/<name>/fixtures/files/` | the images its fixture data points at |
| `widgets/_shared/<partial>.html` | markup two widgets share (ticket 48's product card), or that one widget repeats (ticket 47's `type-card`, three times in `home-lead`, and `link-tile`, six times in `link-tiles`), included as `{{> _shared/<partial> key=value …}}`. A store widget template can't include partials, and the store's Handlebars 3 can't define inline ones, so the sync pastes each call's body in place before upload ([docs/widgets.md](../../docs/widgets.md#what-the-store-gets), "What the store gets"). |
| `widgets/<name>/schema.json` | its Page Builder schema (ticket 46) |
| `widgets/<name>/query.graphql` | optional: its `storefront_api_query` |
| `widgets/<name>/channels/<channel>.json` | the widget on one channel: its `widget_configuration`, placement and recorded uuids. A shot fixture should carry its channel's configuration, as `home-lead`'s does (`render/widgets/home-lead.test.mjs` checks it). |

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
- `"chrome": true` (optional) renders the theme's header and footer round the page, as `layout/base.html` does, for a widget in a header or footer region such as `header_bottom--global` (ticket 27's shipping strip), or for a fixture page whose spec measures the page as a shopper sees it (ticket 31's card grid, ticket 32's category page: the first row of products under the header; ticket 41's cart page: the phone bar against the page). The phone header is sticky, so in an element shot lower down it can lie over the widget: such a spec sets `[data-rf-header]` static before the shot (`card-screens.spec.mjs`, `category-screens.spec.mjs`, `cart-screens.spec.mjs`).

`renderWidget(name, fixture, { root })` resolves to the template's output, for render tests under `node --test` (Jest ignores `scripts/`). It renders with the store's engine for widget templates, Handlebars 3 (`scripts/widgets/engine.mjs`: the store saves them as `handlebars_v3`, and the Widgets API takes no engine), not `config.json`'s v4, so `../` inside `{{#if}}` renders here as on the store, and a Handlebars 4 form such as `{{#*inline}}` fails here as it would there. `_shared` partials are registered as partials, as in the files; the widget sync's tests render the pasted store copy beside them. For example, ticket 48's "a changed price in the fixture changes the rendered price" is a `renderWidget` call with the price changed (`render.test.mjs` has the same test on a test widget). Put a widget's render tests in `scripts/qa/render/widgets/<name>.test.mjs`. A widget that shows products also asserts `typedValuesIn(name)` is empty there: the typed-value lint (`scripts/widgets/typed-values.mjs`; [docs/widgets.md](../../docs/widgets.md#what-the-store-gets)), which covers the widgets in its `PRODUCT_BANDS` list.

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
- **Baselines:** `baselines/widgets/<variation>/<widget>-<case>-<project>-<platform>.png`, for example `baselines/widgets/reelflies-ca/home-lead-default-phone-375-darwin.png`. A missing baseline fails, as for pages. Make or update them with `npx playwright test --config scripts/qa/playwright.config.mjs widget-screens --update-snapshots`, under the stencil lock, then look at each PNG. Do it for every variation the gates render: that command makes ReelFlies CA's, and `QA_VARIATION="ReelFlies CA channel 1"` before it makes the set every `QA_CHANNEL=1` run checks (ticket 53). `widget-baselines.test.mjs` fails `npm run test:scripts`, and so CI, when a shot fixture has no baseline in either set. That rewrites widget baselines only: `npm run qa:screens -- --update-snapshots` would also rewrite every page baseline that has drifted, which a widget PR must never do (section 6.6). The PR's `Baselines:` line names them as `widget <name>` (section 6.6 of the build pipeline).
- **What the page doesn't show:** layout containers Page Builder may add round a placement, the theme's scripts (lazysizes, carousels), and the header and footer's own data (menus, logo, cart count), which a `chrome` page renders from an empty context. The review page shows the live home page with its widgets (W0-10).

**The self-test** is the widget `rf-selftest`, in `render/selftest/widgets/`, outside `widgets/` so no sync ever uploads it. Its baselines are checked like any widget's, and four more tests prove that:

- the theme CSS, with the variation's settings, styles the widget (its `.button--primary` has the variation's `button--primary-backgroundColor`)
- a changed widget (a new background) fails its baseline
- a request outside the fixture (a photo on reelflies.ca) is blocked and fails the shot
- a fixture file that isn't there fails the shot

A theme change that restyles buttons or headings changes the self-test's baselines too: update them in the same commit and name `widget rf-selftest` on the `Baselines:` line.

**Fixture pages** (`render/pages/<name>/`, from ticket 31) are widget folders whose fixture renders a real page template round an empty widget (`"page"`, with the page's context in `"page_context"`), so a spec can shoot what that page shows from fixed data, where the live page is masked or the store has no such page yet. `widget-page.mjs` exports the folder as `PAGE_FIXTURES`, and nothing syncs it. `widget-screens.spec.mjs` doesn't shoot them: each has its own `*-screens.spec.mjs` (`card-grid`'s is `card-screens.spec.mjs`, `category-page`'s `category-screens.spec.mjs`, `species-hub`'s `species-hub-screens.spec.mjs`, `hook-chart-page`'s `hook-chart-screens.spec.mjs`, `brand-page`'s `brand-screens.spec.mjs`, `cart-page`'s `cart-screens.spec.mjs`, `product-page`'s `product-page-screens.spec.mjs`, `quick-add`'s `quick-add-screens.spec.mjs`), which shoots its cases, and its baselines take the widget shots' names and rules, declared as `widget <name>`. The baseline-scope check reads each folder's name as an owner, and `widget-baselines.test.mjs` and `check-baseline-scope.test.mjs` count every case, so a fixture page's cases are all shot cases.

### Widget layout specs

A widget whose layout makes promises a shot can't prove has its own Playwright spec on the same fixture page (`openWidget` in `render/widget-page.mjs`), named `<widget>-screens.spec.mjs` so `qa:screens` runs it. `home-lead-screens.spec.mjs` (ticket 46) checks the hero:

- 300 px tall or less at 801, 1024 and 1280 px, with its text inside it and the photo filling it (CD-1)
- on phones, the text below the photo, and the photo cropped to 16:10
- the photo loaded from its srcset, the page's one `fetchpriority="high"`, and mirrored
- its text 4.5:1 or better over the scrim and the photo on desktop, at 801 and 1280 px. The text is made transparent, each line box is shot, and the lightest pixel behind it is read back through a canvas; each ratio is a test annotation.
- ticket 25's focus ring on both buttons from the keyboard: #23272B on phones, where they sit on the white page, and the gold bead from 801px, where they sit on the scrim, each 3:1 or better against every pixel round it (read the same way, with the ring hidden)
- no serious or critical axe issues in the widget

`shipping-strip-screens.spec.mjs` (ticket 27) checks the shipping strip on its fixture page, with the theme's header round it (`"chrome": true`): it sits after the header inside the "Shipping and prices" region landmark, shows the long line from 801px and the short one on phones, holds no link, scrolls away under the 56px sticky phone bar, and has no serious or critical axe issue and nothing outside a landmark.

`home-widgets-screens.spec.mjs` (ticket 47) checks what only the whole home page shows. `render/home-page.mjs` renders `templates/pages/home.html` with the theme's header and footer, and every widget whose `channels/1895766.json` places it on `pages/home`, each from a fixture, in its region in placement order (the hero and the cards in `home_below_menu`; the tiles in `home_below_top_products`, then ticket 49's Species section and About block, whatever their placement's status, so a widget written inactive is checked before it goes live). Requests are answered as for an element shot, from the widgets' `fixtures/files/`. It checks:

- at 1280, all six Fly Types (the three cards and the first three tiles) end within the first 1,600px (HOME-3), with the square crops and again with ticket 14's 4:5 frames (`home-lead`'s `frames` fixture, stand-in files); three cards across, the tiles in one row, and nothing between them
- at 375 and 320, the cards stacked 16:10, the tiles in two columns of three rows, and `document.scrollingElement.scrollWidth` equal to the viewport's width (story 71)
- every photo the page renders loaded, none twice (a photo marked `data-rf-photo-repeat` or a menu pane banner isn't counted, as in `home-photo-once`; a product band's hidden spare card isn't a photo on the page), the hero's the one `fetchpriority="high"`, the cards' eager and the tiles' lazy
- each card's label, name and count 4.5:1 or better over its scrim and photo at 320, 375, 801, 1024 and 1280 (the `counts` fixture), read through the pixels as for the hero (`render/photo-contrast.mjs`)
- each card's text block inside the card at 320, 375, 801, 1024 and 1280, with the `counts` fixture and again with a name that wraps, and the card never shorter than its photo's shape
- each card and tile one link with nothing focusable inside, showing ticket 25's ring from the keyboard
- no serious or critical axe issues in the widgets

`home-bands-screens.spec.mjs` (ticket 48) checks ticket 48's two product bands on the same home page, with every other widget 1895766 places there (`openHomePage` waits only for the images the page renders: a band's spare cards stay hidden, their lazy photos never loaded):

- at 1280, best sellers as one row of four cards inside the container, and the Signature band with its copy left of four cards in one row, on a forest ground that reaches both edges of the window (two pixels read from a screenshot), with no sideways scroll
- at 375 and 320, both bands as 2x2 grids, the Signature copy above its cards, the forest ground edge to edge, and no sideways scroll (CD-8, story 71)
- width by width (320 to 800 in the phone project, 801 to 1440 in the desktop one, with each breakpoint's edges): no card's name cut by its clamp, in two lines at most, or three on a Signature plate on phones; and each shown photo's `sizes` attribute declaring the width it renders at, within 2.5% (each attribute's matching entry measured as a CSS width in the page)
- each band shows its first four cards, its two spares hidden with their photos never fetched; with best sellers' `sold-out` fixture (one pick sold out in every size, one missing) both spares move up, in order
- switching either band off (its widget left out of the region, as an unpublished placement renders nothing) takes exactly the band's box and the space above it out of `home_below_top_products`, and best sellers' `empty` fixture (no picks on the channel) hides the band as completely as switching it off. Screenshots of the region with each band on and off, at both widths, are attached to the report
- the bands' headings are H2s after the Fly Type cards' H2s, and each band's four card names H3s under it (story 68)
- every shown card and the Signature button show ticket 25's ring from the keyboard: #23272B on white, the gold bead on the forest ground
- no serious or critical axe issues in the bands

`home-links-screens.spec.mjs` (ticket 49) checks ticket 49's sections on the same whole home page (`render/home-page.mjs`), the Species section ("Shop by fish") and the About block:

- at 1280, the three Species groups side by side with equal widths and photo heights (within 1px), each photo 16:10; at 1024 and 801 one photo height a row too, though group 1's name wraps there
- at 375 and 320, the groups stacked, each photo 16:9 or taller for its text, every pill inside the viewport, and `document.scrollingElement.scrollWidth` equal to the viewport's width
- the cold-water photo drawn three times as wide as its box from its left edge (the Dry banner's left third), marked `data-rf-photo-repeat`, at least one widget after the Dry card's; the other two whole-height crops
- every photo in both loaded, lazy, with no `fetchpriority`
- each group's name 4.5:1 or better over its scrim and photo at 320, 375, 801, 1024 and 1280 (`render/photo-contrast.mjs`)
- the About block an even split from 801px with the 4:3, 16px-radius photo left of the text, stacked on phones with the photo first; Tillsonburg and the toll-free number in it, and no price
- one `<h2>` in each section, in page order, and no heading level skipped on the page
- unpublishing either widget (rendering the page without it) leaves no gap: nothing before it moves, and the footer moves up by exactly its height
- each group's photo one link with nothing focusable inside, ticket 25's ring on every link in both sections from the keyboard, and every pill 40px tall
- no serious or critical axe issues in the two sections

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
- **Channel 1** is live reelflies.ca on tree 1 (ticket 53, Option A). It lists home, the Dry Flies Fly Type page (`/flies/dry-flies/`), product 6178 with Fly Sizes (the gates' channel-1 pin, and ticket 11's old-theme page), the empty cart and the same "adams" search, all held to the full budget. Tree 1 has no Species page until the Flip, so `species` waits with that reason.
  - `release.sh`'s step 6b never runs this list: the gate runs on prelaunch.
  - Ticket 56 runs it on live reelflies.ca after the channel-1 push session, with `QA_BASE_URL=https://reelflies.ca QA_CHANNEL=1 npm run qa:lighthouse` (below, "Another host").
- `"budget": "self"` holds a page to no budget, only to its own last accepted run. The home page has it until tickets 46–49 populate it (SEO-8); ticket 49 deletes the line.

**How it runs:**

- The repo's `lighthouse-config.js`, the official release's: Lighthouse's defaults, so mobile emulation and simulated slow 4G. Lighthouse 12.8.1 runs in Playwright's Chromium, build 1217, headless, so the gates and Lighthouse use one browser.
- Each run starts from a cleared cache and cleared origin storage (Lighthouse's own reset), so it measures a first visit, as SEO-13 asks for CLS.
- **The analytics tags are blocked**, through `blockedUrlPatterns` from `lighthouseBlockedUrlPatterns()` ([Analytics and live-store writes](#analytics-and-live-store-writes-network-guardmjs)). Every result records "analytics blocked". A run fails when a request to a listed host completed anyway. `QA_ANALYTICS=allow` loads the tags, on the prelaunch host only and before the Flip, as information: such a run is never compared with or added to the history.
- **A run Lighthouse can't finish** (a 5xx, a page that never paints, a protocol error) is run once more, with a `RETRY` line, as the gates ask a 5xx again (W0-4). A second failure fails that URL, naming Lighthouse's error, and the other URLs are still measured.
- Lighthouse only loads pages: it clicks nothing and sends no form. It can block URLs but not methods, so it has no write guard like the Playwright gates' (W0-6). Before a live channel's list is added, check that those pages send no write while they load.
  - **Channel 1's list was checked on 2026-10-07** (ticket 53), on a local `stencil start -c 1` of "ReelFlies CA channel 1" through the gates' network guard. The only request that wasn't a GET was the product page's `POST /remote/v1/product-attributes/6178`, a listed read-only POST (`read-only-posts.mjs`: it reads the price and stock of the chosen options).
  - On the live host, ticket 11's preflight of home and the product page (Hero-2024) found one more: Cloudflare's bot-detection beacon, `POST /cdn-cgi/challenge-platform/h/…`, which goes to Cloudflare's edge, not to the store.
  - Ticket 56 checks again on live reelflies.ca, with the fork, before its run.

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
- `home-lead-screens.spec.mjs` and `shipping-strip-screens.spec.mjs` run with `qa:screens` too, for the same reason.
- `home-widgets-screens.spec.mjs` runs with `qa:screens` too, for the same reason, and so does `home-links-screens.spec.mjs` (ticket 49).
- `home-bands-screens.spec.mjs` (ticket 48) runs with `qa:screens` too, for the same reason.
- `card-screens.spec.mjs` (ticket 31) runs with `qa:screens` too, for the same reason; `card.spec.mjs` runs only when named, like the specs below.
- `category-screens.spec.mjs` (ticket 32) runs with `qa:screens` too; `category.spec.mjs` runs only when named.
- `species-hub-screens.spec.mjs` (ticket 34) runs with `qa:screens` too; `species-hub.spec.mjs` runs only when named.
- `hook-chart-screens.spec.mjs` (ticket 35) runs with `qa:screens` too.
- `cart-screens.spec.mjs` (ticket 41) runs with `qa:screens` too, for the same reason.
- `product-page-screens.spec.mjs` (ticket 39) runs with `qa:screens` too; `product-page.spec.mjs` runs only when named.
- `search-empty-screens.spec.mjs` (ticket 51) runs with `qa:screens` too, for the same reason; `dead-ends.spec.mjs` runs only when named, like the specs below.
- `quick-add-screens.spec.mjs` (ticket 43) runs with `qa:screens` too; `quick-add.spec.mjs` runs only when named, and waits for its script with `chunkLoaded`.
- `cart-state-screens.spec.mjs` (ticket 42) runs with `qa:screens` too; `cart-state.spec.mjs` runs only when named.
- `header.spec.mjs` (ticket 27), `menu.spec.mjs` (ticket 28), `rail.spec.mjs` (ticket 29), `quick-search.spec.mjs` (ticket 30), `size-pills.spec.mjs` (ticket 37) and `add-flow.spec.mjs` (ticket 38) run only when named, like `skin.spec.mjs`: no npm script's filter matches them. The first three, `size-pills.spec.mjs` and `add-flow.spec.mjs` wait for their scripts with `chunkLoaded` from `states.mjs`; `quick-search.spec.mjs` waits until quick-search.js has added each search form's dropdown.
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
- `screens-reference.spec.mjs` runs with `qa:screens`, because its name matches the filter, and never fails it. `review-live.spec.mjs`, `skin.spec.mjs` and `footer.spec.mjs` run only when named, as `header.spec.mjs`, `menu.spec.mjs`, `rail.spec.mjs` and `quick-search.spec.mjs` do (above). None of these eight is a gate. `review/manifest-reporter.test.mjs` checks the first two against `package.json`'s filters.
- Playwright writes its report, traces and failed diffs to `scripts/qa/results/`, which is ignored by git. The manifest reporter writes `results/manifest.json` there too, and the review pages go to `results/review/`. A run with `QA_PREVIEW_COOKIE` writes no traces, so the cookie never lands there.
