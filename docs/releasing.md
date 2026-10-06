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
| 1. Capture and diff | Reads the channel's active theme and saved Theme Styles with stencil-cli's own API client (GET only). Writes `config.<slug>.live.json` and diffs it against `config.json`'s settings for the variation (base settings, with the variation's settings on top), and against the settings the channel's last release pushed: `config.json` at the commit of its newest `RELEASES.md` entry. See [The three-way diff](#the-three-way-diff). Then reports the live colours' contrast; see [The live contrast report](#the-live-contrast-report). | A live value differs from both `config.json` and the last release (a control-panel edit), the channel runs another theme, or My Themes is full. With no earlier release on the channel, any live difference stops it. See [When step 1 stops](#when-step-1-stops). The contrast report only warns. |
| Release guard | Checks the module switches (`rf_*`) and the menu category ids. See [The release guard](#the-release-guard). | A switch differs from the live theme or exists only there, or a set menu id isn't in the channel's category tree. |
| 2. Clean build | `rm -rf assets/dist`, then `npm ci`. Upstream's webpack clean step never deletes anything, so stale chunks would otherwise ship. | `npm ci` fails. |
| 3. Checks | Jest, `npm run test:scripts`, ESLint, Stylelint, the contrast check, and `config.json` against stencil-cli's full theme config schema. `stencil bundle` uses a looser schema, so it accepts a variation without `demo_url`. | Any check fails. |
| 4. Bundle and storefront gates | `npx stencil bundle --name reelflies-<slug>-<version>-<commit>`, which runs the production webpack build, then `scripts/check-bundle.mjs`. Then `npm run qa:prepush` on a local `stencil start` of the target channel and variation: axe, the raw-HTML check and the screenshot diffs ([scripts/qa/README.md](../scripts/qa/README.md)). It runs with `QA_FRESH_SERVER=1`, so each gate starts its own `stencil start` and never checks a server left running from another checkout or an older build. | The zip has forbidden files, is over a size limit, or `config.json` is over the upload limit; axe finds a serious or critical issue; a raw-HTML assertion fails; a screenshot differs from its baseline, or the channel and variation have no baseline for a template; a `stencil start` is already running. |
| 5. Push | Shows the push summary and asks you to type the channel id; with [`--confirm-nonprod`](#agent-pushes---confirm-nonprod) it asks nothing, and checks the flag again against the target and today's [release calendar](#the-release-calendar) instead. Only then does it capture the channel again and check that nothing changed since steps 1 and 4: the commit and the tree, the zip's size and sha256, the live theme and variation, and the saved and published Theme Styles. A switch toggled while the prompt waited is caught there. Then it runs `npx stencil push -f <zip> -a '<variation>' -c <channel>`, which pushes the zip that was checked. The push reads its stdin from `/dev/null`, so stencil-cli's own prompt, which asks which themes to delete when My Themes is full, fails closed instead of reading piped input or a key press. | You type anything but the channel id or close stdin (Ctrl-D), stdin isn't a terminal and there is no `--confirm-nonprod`, the calendar refuses the flag by now, something listed here changed since step 1 or 4, or My Themes is full. |
| 6. Verify | Captures again. Checks that the channel runs the new theme with the target variation, and that its saved Theme Styles equal `config.json`'s. | Never: it reports problems, and the release exits non-zero after step 7. The theme is already live, so fix forward. |
| 7. Log | Appends an entry to `RELEASES.md`. Commit it. | — |

The `RELEASES.md` entry records:

- the time (UTC), the channel and the variation
- the theme's uuid, name and version
- the commit sha and branch
- the bundle file, its size and sha256, and the size of `main.js`
- step 1's outcome and verify's result
- the settings `config.json` changed since the channel's last release, with that release's commit ("Changed in repo"), or why there was nothing to compare with
- every `rf_*` value pushed, and the new switches
- the operator (`git config user.name`), and beside it how step 5 was confirmed: `Confirmation: channel id typed at the terminal`, or `Confirmation: non-interactive (agent)` with the flag (W0-1)
- from T-28 until the Flip, on a non-production target: `Paired channel-1 release: pending`, which the review page lists for Shaun ([the release calendar](#the-release-calendar))

The push summary also says how step 5 is confirmed, and gives the release calendar's line: the Flip date, whether it is provisional or set, and today's phase.

## Refusals

The release refuses these before any network call or build, with a one-line reason:

- no `--channel`, `--channel` given twice, or a list of channels (commas or spaces)
- `-allc`, `--all-channels`, `-a`, `-c`, `-d`, `--delete`, or any other unknown flag
- no `--variation`, an empty one, or one given twice
- a variation that isn't in `config.json`
- a channel that isn't a release target, or a variation that the channel doesn't take
- `--accept-live` together with `--overwrite-live`, or either one with `--first-release`
- `--confirm-nonprod` with no channel id, given twice, naming another channel than `--channel`, or together with `--overwrite-live` or `--first-release`; on a production target or a channel that isn't a target; or while the release calendar refuses it ([Agent pushes](#agent-pushes---confirm-nonprod))
- a release calendar that can't be read or isn't valid, with or without `--confirm-nonprod`, so a typo never reads as "no Flip date"
- for a real release: a dirty tree, the wrong Node version, or a test-only `RF_RELEASE_*` override (the calendar's `RF_RELEASE_CALENDAR_FIXTURE` and `RF_RELEASE_DATE` too)
- another release or dry run holding the release lock ([One release at a time](#one-release-at-a-time)); this is checked first, before the arguments

### Release targets

The targets are in `scripts/release-targets.mjs`. Any channel that isn't listed there is refused.

| Channel | Storefront | Variations | Capture file | Production | Step 5's confirmation |
|---|---|---|---|---|---|
| 1895766 | ReelFlies_CA (prelaunch) | ReelFlies CA | `config.ca.live.json` | no, until the Flip | typed, or `--confirm-nonprod 1895766` |

- Each target declares `production` and its `confirmation` modes. A production target is typed only, and a target that doesn't declare `production: false` counts as production.
- Channels 1 and 1855224 are typed only by their id, whatever their entry declares (`LIVE_CHANNELS` in `release-checks.mjs`). So a channel-1 entry copied from 1895766's by mistake, with `production: false`, still refuses `--confirm-nonprod`. A test also holds the targets that take the flag to exactly 1895766.
- 1895766 also declares `liveFromFlip`: it becomes live reelflies.ca at the Flip, so `--confirm-nonprod` is refused there from the Flip whatever its `production` value. Ticket 57 marks it `production: true` on Flip day, which ends agent pushes there twice over.

- **Channel 1 (live reelflies.ca)** is refused. It is pushed only through ticket 53's guarded channel-1 target, which will add its own entry, `production: true` and typed only.
- **Channel 1855224 (reelflies.com)** is refused. .com stays on its own theme until it moves to the fork, which is out of scope.

## Agent pushes: `--confirm-nonprod`

```sh
scripts/release.sh --channel 1895766 --variation 'ReelFlies CA' --dry-run --confirm-nonprod 1895766
scripts/release.sh --channel 1895766 --variation 'ReelFlies CA' --confirm-nonprod 1895766
```

Step 5 asks a person to type the channel id, and stops when stdin isn't a terminal, so an agent can't answer it (Claude Code's auto mode blocks that). Agents may push to 1895766 while it is prelaunch (HANDOFF, "Rules for every session"), so W0-1 gives them a confirmation of their own instead of a way round the prompt: `--confirm-nonprod <channel>` replaces the typed channel id at step 5, and only there.

- **It is taken only when** the target is non-production and lists the non-interactive mode (today only 1895766), and the flag's value equals `--channel`. Everything else in the release runs as without it: step 1's diff, the guard, the clean build, the checks, the bundle, the storefront gates, and step 5's re-capture and checks of the commit, the tree, the zip's sha256, the live theme and variation, and the saved and published Theme Styles.
- **It is refused** before anything runs:
  - on channels 1 and 1855224 by their id, whatever `release-targets.mjs` declares, and on any other production target, so channel 1 keeps its typed prompt today and after ticket 53
  - on a channel that isn't a target (1855224)
  - with `--overwrite-live` or `--first-release`, because those choices stay with a person
  - while the release calendar refuses it (below)
- **Without the flag** nothing changes: step 5 asks for the typed channel id, and no terminal still stops the release. `--overwrite-live`'s own prompt in step 1 is always typed.
- **Step 5 checks the flag again** with today's calendar and the target in `release-targets.mjs`, not with the state file that steps 1 to 4 wrote, so a release whose build ran past midnight into T-21 stops before the push.
- **The log:** the `RELEASES.md` entry says `Confirmation: non-interactive (agent)` beside the operator.
- **The first real agent push is watched** (W0-12): it pushes `master` with no theme change, with Shaun watching, to prove auto mode lets the command run. Until then, Shaun runs real pushes in his terminal.

### The release calendar

`scripts/release-calendar.json` and `scripts/lib/release-calendar.mjs` (W0-13, [guardrails](guardrails.md#the-release-calendar)) set the Flip date and today's phase, in Toronto. Every release reads them before step 1, prints the `calendar` line, and puts it in the push summary, which says whether the date is provisional or set. A provisional date limits exactly as a set one.

| Phase | `--confirm-nonprod` | Paired channel-1 release |
|---|---|---|
| no Flip date (`unset`) | allowed: nothing is limited | no |
| before T-28 (`build`, `T-35`) | allowed | no |
| from T-28 (channel-1 parity, ticket 56) | allowed | pending, for every push to a non-production target |
| from T-21 (code freeze, ticket 57) | refused: every push is typed by Shaun | pending |
| from T-14 (content freeze) | refused | pending |
| from T-0 (the Flip) and T+30 | refused, and refused again on 1895766 because it is live reelflies.ca | no |

- **The paired channel-1 release:** from T-28 until the Flip, channel 1 runs the same build as 1895766 (ticket 56:37). Each push to 1895766 then adds `Paired channel-1 release: pending` to its `RELEASES.md` entry, and the review page lists it for Shaun, who pushes the same commit to channel 1 through ticket 53's target. Typed pushes get the row too: from T-21 every push is typed, and its P1 fix belongs on channel 1 as well.
- **A calendar that can't be read** (a typo, an unknown key, a date that doesn't exist) refuses every release, typed or not.

## When step 1 stops

- **The channel runs another theme.** ReelFlies_CA runs Cavio until the first push. A diff against another theme means nothing, so the release stops.
  - The channel runs this fork when its live variation is one of `config.json`'s, or when a `RELEASES.md` entry records a push of its theme's uuid. The theme's name doesn't count, so renaming the theme in `config.json` doesn't turn the next release into a first release.
  - Rerun with `--first-release` to replace that theme. The release reports the theme being replaced, which keeps its own Theme Styles in My Themes.
  - `--first-release` is refused on a channel that already runs this fork, because it would skip the diff.
- **A live value was edited in the control panel.** Under [the three-way diff](#the-three-way-diff), that is a live value that differs from `config.json` and from the channel's last release. With no last release to compare with, it is any live value that differs from `config.json`. The release lists each changed or live-only key with its live and `config.json` values, plus the last released value and the published value when they help. Settings that only `config.json` has are new, so they pass. The `rf_*` module switches are the release guard's, so step 1 skips them. The two menu ids aren't switches, so step 1 checks them like any other setting. Rerun with one of:
  - `--accept-live`, which copies the live values into the variation's `settings` in `config.json`, keeping its formatting, then stops. It takes every differing key, `rf_*` included, except the ones `config.json` changed since the last release: taking those would undo the repo's own change. Review the change with `git diff config.json`, commit it, and rerun. In a dry run it shows the values and writes nothing.
  - `--overwrite-live`, which lists the edited keys and asks you to type the channel id, then lets the push overwrite them. The overwritten keys go into the `RELEASES.md` entry. A dry run lists them and asks nothing.
- **The channel has unpublished Theme Styles edits** (its saved configuration differs from the published one). The release names the keys and diffs against the saved settings, which a push overwrites too. The release guard checks the `rf_*` switches against both. The push summary and the `RELEASES.md` entry name the keys.
- **My Themes holds 20 themes.** Delete one by hand in the control panel (Storefront > My Themes). The release never uses `stencil push -d`. A dry run only warns.

### The three-way diff

Step 1 compares three versions of each setting (W0-2): the live saved value (and its published value), `config.json` now, and `config.json` at the commit of the channel's newest `RELEASES.md` entry, for that entry's variation. The newest entry is the latest by its time, whatever its place in the file.

| Live value | `config.json` now | Step 1 |
|---|---|---|
| equals `config.json` | — | No difference. |
| equals the last released value, saved and published | changed since the last release, or removed | Passes as **in repo**: the repo changed the key, and the push carries the change. The push summary and the `RELEASES.md` entry ("Changed in repo") list it. |
| differs from the last released value | unchanged since the last release | **Stops:** a control-panel edit, as before. |
| differs from the last released value | also changed, to another value | **Stops**, naming all three values. |
| missing | has the key | Passes as a new setting, as before. |

- **Why it is safe:** every live value the push replaces either equals `config.json`'s or is in git at the last release's commit. A value that is only on the store, such as an edit in Theme Styles, still stops the release.
- **The published value counts too.** While the channel has unpublished Theme Styles edits, a key passes as "in repo" only when its published value also equals the last released one. Otherwise the push would replace what shoppers see without anyone deciding to.
- **The `rf_*` switches** keep the release guard's rule 1, which compares with `config.json` only: a switch changed in the repo still stops at the guard, whatever the last release had. Toggle switches in Theme Styles and log them.
- **The menu ids** follow the three-way rule, so ids that `config.json` sets after a release with empty ids (wave R1's tree-4 ids) pass step 1, and the guard then checks them against the channel's category tree.
- **When there is nothing to compare with,** step 1 compares two ways, as it did before W0-2, and prints why on its `base` line:
  - `RELEASES.md` records no release on the channel
  - the entry's commit can't be read (`git show <commit>:config.json` fails, for example on a branch that no longer exists)
  - the entry's variation isn't in that commit's `config.json`
- **Commit each release's `RELEASES.md` entry before the next release.** Step 1 reads `RELEASES.md` from the checkout. If the newest release isn't logged there yet, it compares with an older release, and the keys the unlogged release changed stop step 1.
- **A channel that runs a theme other than the last release's** (a rollback in My Themes, say) gets a NOTE, and step 1 still compares with the last release, which stays safe: a value it didn't push stops step 1.
- **A first release** (`--first-release`) runs no diff, so it reads no last release.

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
- A live menu id that differs from `config.json`, or exists only on the live theme, is step 1's, like any other Theme Styles setting. It passes when `config.json` changed it since the channel's last release and the live id is still the released one ([the three-way diff](#the-three-way-diff)). Otherwise it stops step 1 as a control-panel edit: clear it with `--accept-live` or `--overwrite-live`.

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
- `release-checks.test.mjs` covers the stops that only a real release reaches, which a dry run can't: the Node version and dirty-tree refusals, the My Themes cap, the typed channel id (a wrong answer, a closed stdin, no terminal), and step 5's gate (a switch toggled or a draft published while the prompt waits, another theme, a new commit, a changed or missing zip). For W0-1 it covers each of `--confirm-nonprod`'s refusals with a calendar for every phase, the Flip lock on 1895766, the paired channel-1 release, and step 5 with the flag: no prompt, the calendar checked again, and the gate still run in full.
- `release-args.test.mjs` covers what the arguments parse to, `--confirm-nonprod` included, and `release-targets.test.mjs` that every target declares `production` and its confirmation modes, a production one typed only.
- `release-diff.test.mjs` covers the three-way diff's cases, and `release-log.test.mjs` reading the channel's last release back from `RELEASES.md` and the "Changed in repo" lines.
- `release-sh.test.mjs` runs `scripts/release.sh` itself, in dry runs. It covers the release lock (a held lock, a lock taken by hand, a stale lock, and the lock dropped at the end), the argument refusals, step 1's stops (two-way and three-way), the live contrast report, the guard, and `--confirm-nonprod` on a calendar date in every phase. It also runs step 5 (`release.mjs pre-push`) in an empty folder, where any capture fails at once, to show the typed prompt still stops without a terminal and that step 5 checks the flag again from the code. Its runs take the release lock in a folder of their own (`RF_LOCK_ROOT`, which only `node --test` may set), and use seven test-only overrides:
  - `RF_RELEASE_CONFIG=<file>` is a theme config to use instead of `config.json`. The run stops before the clean build.
  - `RF_RELEASE_LIVE_FIXTURE=<file>` is a capture to use instead of the store.
  - `RF_RELEASE_TREE_FIXTURE=<file>` is a JSON array of the channel's category ids, to use instead of the catalogue API.
  - `RF_RELEASE_LOG_FIXTURE=<file>` is a release log to read instead of `RELEASES.md`, for the channel's last release and the themes the release pushed. Step 7 always writes `RELEASES.md`.
  - `RF_RELEASE_BASE_FIXTURE=<file>` is a theme config to use as `config.json` at the last release's commit, instead of reading it with git.
  - `RF_RELEASE_CALENDAR_FIXTURE=<file>` is a release calendar to read instead of `scripts/release-calendar.json` (W0-1).
  - `RF_RELEASE_DATE=<YYYY-MM-DD>` is today's date for the calendar, instead of today in Toronto (W0-1).
- All seven overrides need `--dry-run`, so a real push always reads the live store, `RELEASES.md`, git and the committed calendar. Step 5 never reads the calendar overrides.
