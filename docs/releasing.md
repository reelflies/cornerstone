# Releasing the theme

Every theme push to a storefront goes through `scripts/release.sh` (tickets 05 and 15). A release targets one channel with one named variation. It never deletes a theme and never pushes to all channels.

Every `stencil push` creates a theme whose Theme Styles start from `config.json` (stencil-cli `lib/stencil-push.utils.js`). Live Theme Styles edits that aren't in `config.json` are lost, so the release captures and diffs them first.

## Before you start

- Use Node 20.18.1: `source ~/.nvm/nvm.sh && nvm use 20.18.1`. A real release refuses any other version.
- Run `npx stencil init` once. It writes `config.stencil.json` and `secrets.stencil.json`, which are gitignored.
  - A dry run works with the "local development only" Stencil-CLI token.
  - A real push needs a token at the "publish theme" level.
- A real release needs a clean, committed tree, and records the commit's full sha. A dry run may run on a dirty tree: it warns, and the bundle name ends in `-dirty`.
- A real push needs Shaun's go-ahead (HANDOFF, "Read-only on BigCommerce until Shaun approves").

## Dry run

```sh
scripts/release.sh --channel 1895766 --variation 'ReelFlies CA' --dry-run
```

A dry run does every step except the push, then prints:

- the push summary
- the exact push command
- the `RELEASES.md` entry it would write

A dry run writes nothing that git tracks, but it isn't read-only for the checkout:

- It deletes and rebuilds `assets/dist`, and reinstalls `node_modules` with `npm ci`, like a real release (step 2).
- It writes the gitignored capture (`config.ca.live.json`) and the bundle zip.
- The storefront gates start `stencil start` up to three times (axe, the raw-HTML check and the screenshots), always on ports 3300 and 3301 whatever `QA_PORT` your shell has, and leave its dev build in `assets/dist`. The zip was checked before that, and the push sends that zip.
- The gates refuse to reuse a running `stencil start`, so ports 3300 and 3301 must be free. If a `stencil start` is already running there, step 4 stops.
- Each gate takes a `stencil start` slot like any other run, so it waits while three other runs on the Mac have one up ([scripts/qa/README.md](../scripts/qa/README.md#parallel-runs), "Parallel runs").

So stop any `stencil start` on 3300 first, and don't run a release while another build is using the same checkout.

## One release at a time

Only one release or dry run runs at a time on this Mac (W0-7). Before anything else, `release.sh` takes the release lock, `~/reelflies/theme/.locks/release`, for its own pid, and drops it when it exits, however it ends.

- **A second release or dry run stops at once**, before any check, naming the holder (its command line and ticket, its pid and host) and the time it started. Run it again once that one has finished.
- **A stale lock is broken:** one over 90 minutes old whose pid isn't running any more. The release prints a `STALE` line naming the old holder and goes on. A lock whose holder still runs is never broken, however old.
- **Don't take the lock by hand** around `release.sh`, as wave 0's agents did: the release would find it held and stop, naming you. A lock written by hand (an `owner.txt` with no pid) goes stale only after 90 minutes.
- **`RF_LOCK_ROOT` is for the tests only.** A real release or dry run with it set stops before anything runs and says to unset it, so every run on the Mac shares the one lock and the gates' slots.
- The lock and its rules are in `scripts/lib/lock.mjs`, shared with the gates' slots and W0-13's merge lock.

## Real release

```sh
scripts/release.sh --channel 1895766 --variation 'ReelFlies CA'
```

| Step | What it does | It stops when |
|---|---|---|
| 1. Capture and diff | Reads the channel's active theme and saved Theme Styles with stencil-cli's own API client (GET only). Writes `config.<slug>.live.json` and diffs it against `config.json`'s settings for the variation (base settings, with the variation's settings on top). Then reports the live colours' contrast; see [The live contrast report](#the-live-contrast-report). | A live value differs, the channel runs another theme, or My Themes is full. See [When step 1 stops](#when-step-1-stops). The contrast report only warns. |
| Release guard | Checks the module switches (`rf_*`) and the menu category ids. See [The release guard](#the-release-guard). | A switch differs from the live theme or exists only there, or a set menu id isn't in the channel's category tree. |
| 2. Clean build | `rm -rf assets/dist`, then `npm ci`. Upstream's webpack clean step never deletes anything, so stale chunks would otherwise ship. | `npm ci` fails. |
| 3. Checks | Jest, `npm run test:scripts`, ESLint, Stylelint, the contrast check, and `config.json` against stencil-cli's full theme config schema. `stencil bundle` uses a looser schema, so it accepts a variation without `demo_url`. | Any check fails. |
| 4. Bundle and storefront gates | `npx stencil bundle --name reelflies-<slug>-<version>-<commit>`, which runs the production webpack build, then `scripts/check-bundle.mjs`. Then `npm run qa:prepush` on a local `stencil start` of the target channel and variation: axe, the raw-HTML check and the screenshot diffs ([scripts/qa/README.md](../scripts/qa/README.md)). It runs with `QA_FRESH_SERVER=1`, so each gate starts its own `stencil start` and never checks a server left running from another checkout or an older build. | The zip has forbidden files, is over a size limit, or `config.json` is over the upload limit; axe finds a serious or critical issue; a raw-HTML assertion fails; a screenshot differs from its baseline, or the channel and variation have no baseline for a template; a `stencil start` is already running. |
| 5. Push | Shows the push summary and asks you to type the channel id. Only then does it capture the channel again and check that nothing changed since steps 1 and 4: the commit and the tree, the zip's size and sha256, the live theme and variation, and the saved and published Theme Styles. A switch toggled while the prompt waited is caught there. Then it runs `npx stencil push -f <zip> -a '<variation>' -c <channel>`, which pushes the zip that was checked. | You type anything but the channel id or close stdin (Ctrl-D), something listed here changed since step 1 or 4, or My Themes is full. |
| 6. Verify | Captures again. Checks that the channel runs the new theme with the target variation, and that its saved Theme Styles equal `config.json`'s. | Never: it reports problems, and the release exits non-zero after step 7. The theme is already live, so fix forward. |
| 7. Log | Appends an entry to `RELEASES.md`. Commit it. | — |

The `RELEASES.md` entry records:

- the time (UTC), the channel and the variation
- the theme's uuid, name and version
- the commit sha and branch
- the bundle file, its size and sha256, and the size of `main.js`
- step 1's outcome and verify's result
- every `rf_*` value pushed, and the new switches
- the operator (`git config user.name`)

## Refusals

The release refuses these before any network call or build, with a one-line reason:

- no `--channel`, `--channel` given twice, or a list of channels (commas or spaces)
- `-allc`, `--all-channels`, `-a`, `-c`, `-d`, `--delete`, or any other unknown flag
- no `--variation`, an empty one, or one given twice
- a variation that isn't in `config.json`
- a channel that isn't a release target, or a variation that the channel doesn't take
- `--accept-live` together with `--overwrite-live`, or either one with `--first-release`
- for a real release: a dirty tree, the wrong Node version, or a test-only `RF_RELEASE_*` override
- another release or dry run holding the release lock ([One release at a time](#one-release-at-a-time)); this is checked first, before the arguments

### Release targets

The targets are in `scripts/release-targets.mjs`. Any channel that isn't listed there is refused.

| Channel | Storefront | Variations | Capture file |
|---|---|---|---|
| 1895766 | ReelFlies_CA (prelaunch) | ReelFlies CA | `config.ca.live.json` |

- **Channel 1 (live reelflies.ca)** is refused. It is pushed only through ticket 53's guarded channel-1 target, which will add its own entry.
- **Channel 1855224 (reelflies.com)** is refused. .com stays on its own theme until it moves to the fork, which is out of scope.

## When step 1 stops

- **The channel runs another theme.** ReelFlies_CA runs Cavio until the first push. A diff against another theme means nothing, so the release stops.
  - The channel runs this fork when its live variation is one of `config.json`'s, or when a `RELEASES.md` entry records a push of its theme's uuid. The theme's name doesn't count, so renaming the theme in `config.json` doesn't turn the next release into a first release.
  - Rerun with `--first-release` to replace that theme. The release reports the theme being replaced, which keeps its own Theme Styles in My Themes.
  - `--first-release` is refused on a channel that already runs this fork, because it would skip the diff.
- **A live value differs from `config.json`.** The release lists each changed or live-only key with both values. Settings that only `config.json` has are new, so they pass. The `rf_*` module switches are the release guard's, so step 1 skips them. The two menu ids aren't switches, so step 1 checks them like any other setting. Rerun with one of:
  - `--accept-live`, which copies the live values of every differing key, `rf_*` included, into the variation's `settings` in `config.json`, keeping its formatting, then stops. Review the change with `git diff config.json`, commit it, and rerun. In a dry run it shows the values and writes nothing.
  - `--overwrite-live`, which lists the keys and asks you to type the channel id, then lets the push overwrite them. The overwritten keys go into the `RELEASES.md` entry. A dry run lists them and asks nothing.
- **The channel has unpublished Theme Styles edits** (its saved configuration differs from the published one). The release names the keys and diffs against the saved settings, which a push overwrites too. The release guard checks the `rf_*` switches against both. The push summary and the `RELEASES.md` entry name the keys.
- **My Themes holds 20 themes.** Delete one by hand in the control panel (Storefront > My Themes). The release never uses `stencil push -d`. A dry run only warns.

## The live contrast report

Once step 1 passes on a channel that runs this fork, the release runs the contrast check (`scripts/check-contrast.mjs`) on the capture, `config.<slug>.live.json`, which has a theme config's shape so the check can read it (spec seam 3, ticket 06). It is a report, not a stop:

- A pair below WCAG contrast is listed, followed by a warning, and the release goes on. `KNOWN_FAILURES` applies by variation name, as it does to `config.json`.
- The push replaces the live colours with `config.json`'s, and step 3 runs the same check on `config.json` and stops on a failure. A stop here would only ever block a release that fixes a live failure, such as `--overwrite-live` over a Theme Styles edit that broke contrast.
- If step 1 listed a failing live colour, `--accept-live` would copy it into `config.json`, where step 3 stops on it.
- On a first release the channel runs another theme, whose colours say nothing about this one. The release prints one line saying they aren't checked.

## The release guard

The release guard (ticket 15, `scripts/release-guard.mjs`) runs after step 1 and before the clean build, so a failure stops the release before anything is bundled or pushed. It takes any channel and variation, so ticket 53's channel-1 target can reuse it unchanged.

**Rule 1, module switches.** This covers every `rf_*` key except the two menu ids. Per-variation values with the prefix, such as ticket 39's shipping figures, get the same protection.

- A live value that differs from `config.json` stops the release, naming the key and both values. No flag overrides it. Either set the switch back in Theme Styles, or change `config.json` to match, commit, and rerun.
- A key only in `config.json` passes, because it is a module's first release. The push summary lists it as a "new switch".
- A key only on the live theme stops the release, because removing a switch must be deliberate.
- While a switch has an unpublished draft, the guard checks the published value (what shoppers see) too. A published value that differs from `config.json` stops the release even when the draft matches, because the push would change what shoppers see. Publish the draft, or set the draft and `config.json` to the published value.

**Rule 2, menu ids.** This covers `rf_menu_type_ids` (comma-separated) and `rf_menu_species_root_id`.

- An empty id passes, because the menu then falls back to the stock markup. This keeps prelaunch pushes working before tree 4 exists.
- A set id that isn't in the target channel's category tree stops the release, naming the id. One bad id in `rf_menu_type_ids` stops the whole push.
- A live menu id that differs from `config.json`, or exists only on the live theme, stops step 1 like any other Theme Styles edit. Clear it with `--accept-live` or `--overwrite-live`.

**The token for rule 2.** When a menu id is set, the release reads the channel's category tree with two read-only calls: `GET /v3/catalog/trees?channel_id:in=<channel>`, then every page of `GET /v3/catalog/trees/categories?tree_id:in=<tree>`.

- These calls need `RF_BC_API_TOKEN`: a store API token with **Products: read-only** (`store_v2_products_read_only`), created under Settings > Store-level API accounts. The Stencil-CLI token can't read the catalogue.
- Without the token, the release stops and names the scope it needs. Export the token in your shell for the release only, and never write it into a file in the repo.

The guard prints every `rf_*` value to be pushed and each new switch. The push summary and the `RELEASES.md` entry repeat them.

### Switch toggles

`RELEASES.md` has a "Switch toggles" section with a fixed table: date, channel, switch, from, to, who and reason. Log every switch toggled in a storefront's Theme Styles there.

- From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through the release (SCOPE-3). Tickets 57 and 58 run that window.
- After a toggle, change `config.json` to match and commit it. Otherwise the next release stops on the difference.

## Safety notes

- **Why not `stencil pull`:** it crashes when `config.json` has no variation named like the live one (Cavio's "Natural"), and it silently skips live keys that `config.json` lacks. The capture in `scripts/release-capture.mjs` has neither problem.
- **Tokens:** when a request fails, stencil-cli 9.1.0 prints the whole request, including its `x-auth-token` header. The release pipes the push through a filter that replaces the Stencil-CLI token, `RF_BC_API_TOKEN` and any `x-auth-token` value with `[redacted]`. Values of settings named like credentials (`token`, `secret`, `password`, `api key`) are hidden in the release's output.
- **The capture file** `config.<slug>.live.json` is gitignored. Cavio's capture holds a non-empty `instagram-access-token`, so never commit or share it.
- **If the push seems to hang,** stencil-cli is probably waiting at its theme-deletion prompt, which means My Themes filled up after the release checked it. Press Ctrl-C and prune My Themes by hand.

## Tests

The release's tests are `scripts/release-*.test.mjs`. `npm run test:scripts` runs them, in CI too, with no store credentials.

- `release-guard.test.mjs` covers the four refusals of the spec's seam 5 (more than one channel, no named variation, a switch difference, and a set-but-missing menu id) and each case of the guard's two rules.
- `release-checks.test.mjs` covers the stops that only a real release reaches, which a dry run can't: the Node version and dirty-tree refusals, the My Themes cap, the typed channel id (a wrong answer, a closed stdin, no terminal), and step 5's gate (a switch toggled or a draft published while the prompt waits, another theme, a new commit, a changed or missing zip).
- `release-sh.test.mjs` runs `scripts/release.sh` itself, in dry runs. It covers the release lock (a held lock, a lock taken by hand, a stale lock, and the lock dropped at the end), the argument refusals, step 1's stops, the live contrast report and the guard. Its runs take the release lock in a folder of their own (`RF_LOCK_ROOT`, which only `node --test` may set), and use three test-only overrides:
  - `RF_RELEASE_CONFIG=<file>` is a theme config to use instead of `config.json`. The run stops before the clean build.
  - `RF_RELEASE_LIVE_FIXTURE=<file>` is a capture to use instead of the store.
  - `RF_RELEASE_TREE_FIXTURE=<file>` is a JSON array of the channel's category ids, to use instead of the catalogue API.
- All three overrides need `--dry-run`, so a real push always reads the live store.
