# Releasing the theme

Every theme push to a storefront goes through `scripts/release.sh` (tickets 05 and 15). A release targets one channel with one named variation, and never pushes to all channels. The push never deletes a theme: after it, the release prunes old ReelFlies builds from My Themes under fixed rules, logging each deletion ([Pruning My Themes](#pruning-my-themes), W0-3).

Every `stencil push` creates a theme whose Theme Styles start from `config.json` (stencil-cli `lib/stencil-push.utils.js`). Live Theme Styles edits that aren't in `config.json` are lost, so the release captures and diffs them first.

## Before you start

- Node 20.18.1, from `.nvmrc`, which `release.sh` selects itself (W0-1b), so run it bare: no `source ~/.nvm/nvm.sh && nvm use 20.18.1` in front.
  - When `node` on PATH is another version (nvm's default, 20.20.0, in a login shell on this Mac), it asks nvm (`$NVM_DIR`, or `~/.nvm`) for `.nvmrc`'s version before anything runs, and prints one line: `node     v20.18.1 from .nvmrc, selected with nvm (the shell had v20.20.0)`. With the right Node already on PATH it prints nothing and leaves nvm alone.
  - It never installs a Node. Without nvm, or with nvm but not 20.18.1, PATH stays as it was, and a real release refuses any other version, as before (a dry run warns).
- Run `npx stencil init` once. It writes `config.stencil.json` and `secrets.stencil.json`, which are gitignored.
  - A dry run works with the "local development only" Stencil-CLI token.
  - A real push needs a token at the "publish theme" level.
- A real release needs a clean, committed tree, and records the commit's full sha. A dry run may run on a dirty tree: it warns, and the bundle name ends in `-dirty`.
- A real push needs Shaun's go-ahead (HANDOFF, "Rules for every session"), except an agent's push to 1895766 with `--confirm-nonprod` from `master` at `origin/master`'s tip, which his answers of 2026-10-06 allow within the limits in [Agent pushes](#agent-pushes---confirm-nonprod).

## Dry run

```sh
scripts/release.sh --channel 1895766 --variation 'ReelFlies CA' --dry-run
```

A dry run does every step except the push, then prints:

- the push summary
- the exact push command
- the `RELEASES.md` entry it would write
- the prune's plan: which ReelFlies builds in My Themes a prune would delete now, and why each other one stays ([Pruning My Themes](#pruning-my-themes)). It reads My Themes and every channel's active theme with GETs only, and deletes nothing.

A dry run writes nothing that git tracks, but it isn't read-only for the checkout:

- It deletes and rebuilds `assets/dist`, and reinstalls `node_modules` with `npm ci`, like a real release (step 2).
- It writes the gitignored capture (`config.ca.live.json`) and the bundle zip.
- The storefront gates start `stencil start` up to three times (axe, the raw-HTML check and the screenshots), always on ports 3300 and 3301 whatever `QA_PORT` your shell has, and leave its dev build in `assets/dist`. The zip was checked before that, and the push sends that zip.
- The gates refuse to reuse a running `stencil start`, so ports 3300 and 3301 must be free. If a `stencil start` is already running there, step 4 stops.
- Each gate takes a `stencil start` slot like any other run, so it waits while three other runs on the Mac have one up ([scripts/qa/README.md](../scripts/qa/README.md#parallel-runs), "Parallel runs").

So stop any `stencil start` on 3300 first, and don't run a release while another build is using the same checkout.

## One release at a time

Only one release, dry run or [`--prune-only`](#pruning-my-themes) runs at a time on this Mac (W0-7, W0-3). Before anything else, `release.sh` takes the release lock, `~/reelflies/theme/.locks/release`, for its own pid, and drops it when it exits, however it ends.

- **A second release, dry run or `--prune-only` stops at once**, before any check, naming the holder (its command line and ticket, its pid and host) and the time it started. Run it again once that one has finished.
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
| 5. Push | Shows the push summary and asks you to type the channel id; with [`--confirm-nonprod`](#agent-pushes---confirm-nonprod) it asks nothing, and instead fetches `origin/master` again and checks the flag again against it, the target and today's [release calendar](#the-release-calendar). Only then does it capture the channel again and check that nothing changed since steps 1 and 4: the commit and the tree, the zip's size and sha256, the live theme and variation, and the saved and published Theme Styles. A switch toggled while the prompt waited is caught there. Then it runs `npx stencil push -f <zip> -a '<variation>' -c <channel>`, which pushes the zip that was checked. The push reads its stdin from `/dev/null`, so stencil-cli's own prompt, which asks which themes to delete when My Themes is full, fails closed instead of reading piped input or a key press. | You type anything but the channel id or close stdin (Ctrl-D), stdin isn't a terminal and there is no `--confirm-nonprod`, the calendar refuses the flag by now, `origin` can't be fetched or `origin/master` changed the release tooling or the calendar since the release started (with the flag), something listed here changed since step 1 or 4, or My Themes is full. |
| 6. Verify | Captures again. Checks that the channel runs the new theme with the target variation, and that its saved Theme Styles equal `config.json`'s. | Never: it reports problems, and the release exits non-zero after step 7. The theme is already live, so fix forward. |
| 6b. Lighthouse | Ticket 17's gate on the prelaunch host: with `QA_PREVIEW_COOKIE` in the operator's shell, `npm run qa:lighthouse` measures the build just pushed; without it, as on every agent's push, the entry records `pending host batch`. See [Lighthouse after the push](#lighthouse-after-the-push-step-6b). | Never: the push is done and the entry not yet written. A failed gate stops the release after step 7, before the prune. |
| 7. Log | Appends an entry to `RELEASES.md`. Commit it. | — |
| Then: prune | Prunes old ReelFlies builds from My Themes, after the entry, so the prune counts this release ([Pruning My Themes](#pruning-my-themes), W0-3). Until a `--prune-only` has deleted a theme, and whenever the pushed commit isn't judged by `origin/master`'s rules, the checkout isn't at that commit, or anything but new lines in `RELEASES.md` is uncommitted, it only shows its plan. Each deletion is logged in `RELEASES.md`'s "My Themes" section. | Reading My Themes or a channel's active theme fails, or a deletion, its log row or the read of My Themes after it fails. The push is done and logged by then: commit `RELEASES.md`, then run `--prune-only`. Verify's problems stop the release at step 7, so nothing is pruned then. |

The `RELEASES.md` entry records:

- the time (UTC), the channel and the variation
- the theme's uuid, name and version, and whether the push made a new theme uuid or a new version of the theme the channel ran just before it (`New uuid`, decision 9; W0-1)
- the commit sha and branch
- the bundle file, its size and sha256, and the size of `main.js`
- step 1's outcome and verify's result
- the settings `config.json` changed since the channel's last release, with that release's commit ("Changed in repo"), or why there was nothing to compare with
- every `rf_*` value pushed, and the new switches
- the operator (`git config user.name`), and beside it how step 5 was confirmed: `Confirmation: channel id typed at the terminal`, or `Confirmation: non-interactive (agent)` with the flag (W0-1)
- from T-28 until the Flip, on a non-production target: `Paired channel-1 release: pending`, which the review page lists for Shaun ([the release calendar](#the-release-calendar))
- Lighthouse (ticket 17), after the verify line: `pass` or `fail` with each URL's medians under it, `pending host batch`, or why the gate was skipped ([Lighthouse after the push](#lighthouse-after-the-push-step-6b))

The push summary also says how step 5 is confirmed, gives the release calendar's line (the Flip date, whether it is provisional or set, and today's phase), and says what step 6b will do about Lighthouse.

## Lighthouse after the push (step 6b)

Ticket 17's Lighthouse gate needs the theme live on a host, so it can't run before the push. Before the Flip, prelaunch (1895766) is its test bed: after verify and before the `RELEASES.md` entry, `release.sh` runs `release.mjs lighthouse` (`scripts/release-lighthouse.mjs`), and the entry records the result. The budgets, the drop rule and the runner are in [scripts/qa/README.md](../scripts/qa/README.md#lighthouse-lighthousemjs).

| When | What step 6b does | The entry's line |
|---|---|---|
| `QA_PREVIEW_COOKIE` is in the operator's shell, as `name=value; name2=value2` | `npm run qa:lighthouse` on the prelaunch host, three mobile runs of each URL with the analytics tags blocked, filed under the pushed theme's uuid in `scripts/qa/results/host/<uuid>/lighthouse/` | `- Lighthouse: pass` or `fail`, with the time, "analytics blocked: yes", whether the run was accepted, the results folder, and each URL's medians, the kinds not measured yet and each problem under it |
| No cookie, as on every agent's push (the cookie lives only in Shaun's shell, W0-6), or one that isn't `name=value` pairs | nothing | `- Lighthouse: pending host batch`. The next host batch of that uuid (`npm run qa:prelaunch`) measures the build and fills the line in |
| Verify found a problem, or read no theme uuid | nothing: the build isn't confirmed | `- Lighthouse: pending host batch` |
| The run was stopped (Ctrl-C, or its 30-minute limit), couldn't start, measured nothing, or its `summary.json` isn't this run's, on the prelaunch host, of the pushed uuid, with the tags blocked | it ran, but nothing usable came of it | `- Lighthouse: pending host batch` |
| From the Flip (calendar phase `T-0` or `T+30`) | nothing | `- Lighthouse: skipped: …`. 1895766 is then live reelflies.ca, and whether a P1 fix runs the gate is Shaun's open question (ticket 17). Until he answers, it is skipped, so no run after the Flip is ever accepted |
| A channel other than 1895766 (ticket 53's channel-1 target) | nothing | `- Lighthouse: not run: …`. Ticket 56 reads the 1895766 entry of the commit it pushes |

- **A real release with the cookie:** read it in your own shell before you run the release, and never in a file or a chat: `read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE`. The release's output never shows it: the runner's output passes through the same filter as the push's, with the cookie whole and each of its values added to the secrets.
- **The run gets only what it needs.** Its environment is the shell's without any `QA_` or `RF_QA_` variable except the cookie, plus the prelaunch host, channel 1895766, the variation, the uuid's results folder and `QA_RELEASE_COMMIT` (the pushed commit, which `RELEASES.md` records only at step 7). So an overlay, a results folder or `QA_ANALYTICS=allow` left in the shell can't change what is measured or where it is filed.
- **It never stops the release itself.** The push is done and the entry not yet written, so whatever goes wrong in step 6b is recorded as `pending host batch`, and step 7 still writes the entry. Ctrl-C while Lighthouse runs stops Lighthouse, not the release. Past 30 minutes the run is stopped.
- **A failed gate** (a budget, the drop rule, a URL that couldn't be measured, an analytics request that got through) is recorded as `fail`, and the release stops with exit 1 once step 7 has written the entry, as for verify's problems, so the prune doesn't run after it. The build doesn't move on to channel 1 (ticket 56). Fix forward, or roll back to the previous release's theme; commit `RELEASES.md`, then prune with `--prune-only` from the main clone.
- **An accepted run** writes `scripts/qa/lighthouse-history.json` in the checkout, and the release says so. Commit it with `RELEASES.md` through the release-log PR. Until it is committed, the prune after that push only shows its plan, because the checkout has an uncommitted change besides `RELEASES.md` (revisitable).
- **What the lines can be.** The runner is QA code, which isn't guarded, so the release reads its `summary.json` rather than import it, and writes each of its lines into the entry as an indented list item of one line, at most 40 of them. No line from the runner can read as one of the entry's own lines (`- Theme:`, `- Commit:`, an entry heading), which step 1 and the prune parse.
- **A dry run** runs no Lighthouse (it pushes nothing, and the prelaunch host still serves the last build). Its push summary says what step 6b would do, and its entry says "measured on the prelaunch host after the push" or `pending host batch`.

## Refusals

The release refuses these before any network call or build, with a one-line reason:

- no `--channel`, `--channel` given twice, or a list of channels (commas or spaces)
- `-allc`, `--all-channels`, `-a`, `-c`, `-d`, `--delete`, or any other unknown flag
- `--upload-only`: there is no upload mode ([Pruning My Themes](#no-upload-mode))
- `--prune-only` with any argument but `--dry-run`, or with a value ([Pruning My Themes](#pruning-my-themes))
- no `--variation`, an empty one, or one given twice
- a variation that isn't in `config.json`
- a channel that isn't a release target, or a variation that the channel doesn't take
- `--accept-live` together with `--overwrite-live`, or either one with `--first-release`
- `--confirm-nonprod` with no channel id, given twice, naming another channel than `--channel`, or together with `--overwrite-live` or `--first-release`; on a production target or a channel that isn't a target; or while the release calendar refuses it ([Agent pushes](#agent-pushes---confirm-nonprod))
- a release calendar that can't be read or isn't valid, with or without `--confirm-nonprod`, so a typo never reads as "no Flip date"
- for a real release: a dirty tree, the wrong Node version, or a test-only `RF_RELEASE_*` override (the calendar's `RF_RELEASE_CALENDAR_FIXTURE` and `RF_RELEASE_DATE` too)
- for a real release with `--confirm-nonprod`: a checkout that isn't `master` at `origin/master`'s tip, freshly fetched, or a fetch that fails ([Agent pushes](#agent-pushes---confirm-nonprod)); a dry run warns instead
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
  - on a real release, unless the checkout is `master` at `origin/master`'s tip (below)
- **Without the flag** nothing changes: step 5 asks for the typed channel id, and no terminal still stops the release. `--overwrite-live`'s own prompt in step 1 is always typed.
- **It runs only from `master` at `origin/master`'s tip.** The flag is judged by the calendar and the targets in the checkout that runs the release, so a stale checkout would be judged by stale rules: a main clone that hasn't pulled the calendar PR, or ticket 57's Flip-day `production: true`, would push past the code freeze or the Flip with no one typing. So, as `merge.sh` does for merges, the release judges an agent push by `origin/master`'s rules (`scripts/release-origin.mjs`):
  - Before step 1, it fetches `origin`'s `master` (into `origin/master` only; the checkout isn't touched) and refuses the flag unless the checkout is on `master` and `HEAD` is `origin/master`'s tip. An agent push therefore sends merged code only. A fetch that fails refuses the flag too.
  - Step 5 fetches again, because another PR can merge while the release builds. If `origin/master` has moved on, the push still sends the commit the release checked, but only if that commit is in `origin/master`'s history and none of the release tooling or the calendar changed since: `release.sh`, `release-calendar.json`, `release.mjs` and every module it imports (`RELEASE_TOOLING`, which a test keeps in step with the imports). Otherwise it stops before the capture, and nothing is pushed: pull and rerun.
  - A dry run with the flag fetches and checks the same way, but only warns, saying a real release stops there. A dry run on the test-only overrides stays offline and compares with `origin/master` as last fetched.
  - So run agent pushes from the main clone, `~/reelflies/theme/cornerstone`, on `master` after `git pull --ff-only origin master`. A typed push isn't checked: the person at the terminal decides what goes out.
- **Step 5 checks the flag again** with today's calendar and the target in `release-targets.mjs`, not with the state file that steps 1 to 4 wrote, so a release whose build ran past midnight into T-21 stops before the push.
- **The log:** the `RELEASES.md` entry says `Confirmation: non-interactive (agent)` beside the operator.
- **The first real agent push carries no theme change.** It pushes `master` as it is, before ticket 25's push, so the first push without the typed prompt and the first repeat push of the same name and version aren't tried together with W0-2's first real use and 25's changes.
  - The orchestrator runs it dry with `--confirm-nonprod 1895766`, then for real, and puts both outputs on the next review page. It doesn't wait for Shaun (his answers of 2026-10-06 in `plan/build-pipeline.md`).
  - Its `RELEASES.md` entry's `New uuid` line records whether the push made a new theme uuid or a new version of the theme the channel ran before it (decision 9). It compares step 5's capture with verify's.
  - The review page asks Shaun whether that uuid previews on ReelFlies.com (1855224), and with which variation. The entry is written at the push, before he answers, so the orchestrator records his answer as a dated comment on ticket 05, where W0-3 reads it: if it previews there, W0-3 needs no upload mode.
  - If Claude Code's auto mode still blocks the command, Shaun runs that checkpoint's push in his terminal.

**How an agent runs it.** Make one Bash call that holds exactly one of these commands, by the main clone's full path, with nothing before or after it:

```sh
/Users/rook/reelflies/theme/cornerstone/scripts/release.sh --channel 1895766 --variation 'ReelFlies CA' --confirm-nonprod 1895766
/Users/rook/reelflies/theme/cornerstone/scripts/release.sh --prune-only
```

- Shaun's Claude Code allow rules name these exact commands, spelled this way or from `~/reelflies/theme/cornerstone/…`, and Claude Code matches a rule against the whole command. So add nothing: no `source ~/.nvm/nvm.sh && nvm use …` (`release.sh` selects `.nvmrc`'s Node itself, [Before you start](#before-you-start)), no `cd … &&`, and no variable assignment, pipe or redirect. Before W0-1b agents put the nvm prefix in front, and Claude Code judged the compound command instead of matching the rule: it denied the push as a production deploy and the prune as a deletion of unverifiable scope.
- Use the full path, not a `cd` to the main clone in one call and the relative command in the next. `release.sh` moves to its own checkout's root, so the full path runs the main clone's copy from any working folder. A subagent's working folder goes back to where the subagent started after every Bash call, so the `cd` is gone by the next call. The relative command then finds no `release.sh` there, or, in a subagent started in a PR worktree, runs that worktree's copy, which Shaun's rules for the relative spelling also let through without a prompt.

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
- **My Themes holds 20 themes.** Run `scripts/release.sh --prune-only --dry-run`, then without `--dry-run` within the hour ([Pruning My Themes](#pruning-my-themes)), or delete a theme by hand in the control panel (Storefront > My Themes). The prune after a push can't help here, because step 1 stops before the push. The release never uses `stencil push -d`. A dry run only warns.

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

- These calls need the read-only store API token, with **Products: read-only** (`store_v2_products_read_only`). The Stencil-CLI token can't read the catalogue.
- The guard reads it through W0-11's loader, `scripts/lib/store-token.mjs` ([store writes](store-writes.md)), as the store helper's plans do: `RF_BC_READ_TOKEN`, then `RF_BC_API_TOKEN`, then the Keychain item `reelflies-bc-read` (account `reelflies`), which Shaun adds at W0-12. An exported variable is never skipped for the Keychain, so a token exported for one release still wins.
- Without the token, the release stops, naming the scope and where the loader looked. Never write a token into a file in the repo or paste it into a chat.

The guard prints every `rf_*` value to be pushed and each new switch. The push summary and the `RELEASES.md` entry repeat them.

### Switch toggles

`RELEASES.md` has a "Switch toggles" section with a fixed table: date, channel, switch, from, to, who and reason. Log every switch toggled in a storefront's Theme Styles there.

- From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through the release (SCOPE-3). Tickets 57 and 58 run that window.
- After a toggle, change `config.json` to match and commit it. Otherwise the next release stops on the difference.

## Pruning My Themes

My Themes holds at most 20 themes, and a push to 1895766 that makes a new theme uuid adds a "ReelFlies" build to it. Themes are store-level, so that build is also the one in My Themes for the reelflies.com review. The prune deletes old ReelFlies builds under the rules in HANDOFF ("Rules for every session"), W0-3 in `plan/build-pipeline.md`. It runs after each push (above), and on its own:

```sh
scripts/release.sh --prune-only --dry-run    # the plan: what it would delete and why the rest stays; GETs only
scripts/release.sh --prune-only              # deletes the plan's themes, logging each in RELEASES.md
```

`--prune-only` takes no other argument but `--dry-run`: My Themes is store-wide, so it names no channel or variation. It holds the release lock, so it never runs beside a release, a dry run or another prune.

**What it reads, all GETs:** My Themes (`GET /v3/themes`), then the active theme (`GET /v3/channels/<id>/active-theme`) of every storefront channel, with or without a site (`GET /v3/channels?type:in=storefront`, every page), of every site's channel (stencil-cli's `getStoreChannels`), and of channels 1, 1855224 and 1895766 and every channel `RELEASES.md` names, whether or not the store lists them. Any read that fails stops the prune before anything is deleted: it never guesses that a theme is unused. It uses the Stencil-CLI token from `secrets.stencil.json`, as the release does.

**What it deletes.** A theme is deleted only when every rule lets it go (`scripts/release-prune.mjs`, with the reasons it prints for each theme):

- Its name in My Themes is exactly `ReelFlies`. No other theme is ever a candidate: not Hero-2024, Cavio or the Marketplace Cornerstone, whatever `RELEASES.md` says.
- `RELEASES.md` records its uuid as a release (a "Releases" entry's `Theme:` line). An unknown ReelFlies uuid stays.
- It is active on no channel, by those reads.
- My Themes doesn't flag it `is_active`. That flag is the store's own "active somewhere" signal. On 2026-10-05 (`plan/reference/theme-configs-2026-10-05/themes.json`) it was `true` on exactly the three themes a channel ran: Hero-2024-2.9.5-US on 1 and 1855224, Cavio on 1895766, and the private Cavio copy on 1861300, a channel with no site that the channel reads of that day missed. Every older Hero build showed `false` (they show `true` under `is_private`, a different column). So a flagged theme stays even when no channel read shows it running. Revisitable, on evidence such as a dry run showing a flagged ReelFlies build that no channel runs: the plan shows the flag on every theme, so a dry run also shows whether a theme no channel runs any more (Cavio `25121d00` since 2026-10-06) is still flagged. The store also refuses to delete a theme that is active on a channel.
- It isn't the rollback: the latest or the previous release on 1895766 or channel 1 by `RELEASES.md`, or the theme either ran before its latest release (an entry's `New uuid: yes; before the push the channel ran theme …`).
- It isn't one of the newest three ReelFlies builds in My Themes, ranked by their newest entry's time in `RELEASES.md` (the file's order for two in the same minute, as for [the three-way diff](#the-three-way-diff)), never by name, version or the store's `updated_at`. Every build is "ReelFlies" 6.22.0 today, so only the uuid tells them apart (decision 9).

The plan names the theme each channel runs, then lists every ReelFlies theme with "keep" or "delete" and its reasons, then the other themes, which it never touches, each with its uuid and the `is_active` flag. On 2026-10-06 it found a fourth storefront channel, 1861300, with no site, so the store's site list alone would have missed it.

**Deleting.** A real prune deletes the plan's themes one at a time, oldest first, with `DELETE /v3/themes/<uuid>`, which the store refuses for a theme active on a channel. Right after each deletion it adds a row to `RELEASES.md`'s "My Themes" section: the time (UTC), the action (`deleted (--prune-only)` or `deleted (prune after a release)`), the theme's uuid, name and version, the commit and zip sha256 of its release entry, and the operator (`git config user.name`, with "(no terminal)" when stdin isn't one, as in an agent's run: in the main clone both are "Shaun Bathgate"). Then it reads My Themes again.

- **The first failure stops the run,** and the rows already written stay: a deletion the store refuses, or a row that can't be written. For the latter the stop names the uuid the store deleted and the row it couldn't write, so you can add it by hand.
- **The read after it** names any theme still listed. If that read fails, the stop says so, and the rows are still written.
- Every stop says how many deletions are logged. Commit the rows through a `release/log-…` PR, as for a release entry, and name any stop in it.

A dry run makes no deleter at all, and writes nothing to `RELEASES.md`.

**Where a real prune runs from.** Deleting a theme can't be undone, so the rules that decide are always `origin/master`'s:

- A real `--prune-only` runs only from `master` at `origin/master`'s tip, freshly fetched, with nothing uncommitted but new lines in `RELEASES.md` (a release's entry waiting for its PR, or the prune's own rows). A changed or removed line of `RELEASES.md` is refused (`git diff --numstat HEAD`): an entry's time moved, say, would change the ranking or the rollback. Anywhere else it is refused before the store is read. Run it from the main clone after `git pull --ff-only origin master`. A dry run warns instead, and on the test-only overrides doesn't fetch.
- The prune after a push deletes only when the pushed commit is still judged by `origin/master`'s rules (`release-origin.mjs` `stepFiveOrigin`: in `origin/master`'s history, with no release tooling changed since), the checkout is still at that commit, and nothing but new lines in `RELEASES.md` is uncommitted. So a hand-written state file on a branch or an edited checkout can't make it delete. Otherwise it shows its plan and says to run `--prune-only` from the main clone.

**Every real `--prune-only` runs dry first, and the tooling enforces it** (Shaun's answers of 2026-10-06 in `plan/build-pipeline.md`: the first theme prune runs dry before it runs for real):

- A `--prune-only --dry-run` records its plan (the uuids it would delete, the commit and the time) in the checkout's git folder, as `rf-prune-dry-run.json` (`git rev-parse --git-path rf-prune-dry-run.json`), outside the tree, so the checkout stays clean.
- A real `--prune-only` is refused before it reads the store unless that record is there, from a dry run of the store (not the test fixture), at the same commit, less than 60 minutes old. It uses the record up, so each dry run serves one real run.
- Once it has its plan, it stops before the first deletion unless it deletes exactly what the dry run planned. A plan that deletes nothing needs no match.
- Until `RELEASES.md`'s "My Themes" section logs a deletion, the prune after a push only shows its plan. So the first deletion is always a `--prune-only`, shown dry first. From then on, the prune after each push deletes too, without a dry run of its own.

Whoever runs a real `--prune-only` puts its output and its dry run's on the next review page (the orchestrator, per the runbook). A real `--prune-only` that finds nothing to delete logs nothing, so the prune after a push stays a plan until a `--prune-only` has deleted a theme: with one ReelFlies build in My Themes today, that is a few pushes away.

**Permission rules.** The drafted Claude Code rules ([permissions.md](permissions.md)) pre-approve `scripts/release.sh … --dry-run` from any checkout, so `--prune-only --dry-run` runs anywhere without a prompt; a real `--prune-only` is pre-approved only as the main clone's `release.sh`, by its full path, and asks first anywhere else. Shaun's allow rules also name an agent's real prune exactly: run it as [How an agent runs it](#agent-pushes---confirm-nonprod) says, as the main clone's `release.sh` by its full path, in one Bash call with nothing added (no nvm prefix, no `cd`).

### No upload mode

W0-3 adds `scripts/release.sh --upload-only` (uploading the newest 1895766 release's exact zip to My Themes for the reelflies.com review) only if that push's uuid doesn't preview on reelflies.com. Themes are store-level, so the push already puts the build in My Themes. W0-1's watched push checks it, and the orchestrator records Shaun's answer on ticket 05. Until then `--upload-only` is refused, and each 1895766 push's uuid is the .com review build, named on the review page with its commit and push time. If the upload mode is ever built, its uploads are logged in the same "My Themes" section.

## Safety notes

- **Why not `stencil pull`:** it crashes when `config.json` has no variation named like the live one (Cavio's "Natural"), and it silently skips live keys that `config.json` lacks. The capture in `scripts/release-capture.mjs` has neither problem.
- **Tokens:** when a request fails, stencil-cli 9.1.0 prints the whole request, including its `x-auth-token` header. The release pipes the push through a filter that replaces the Stencil-CLI token, `RF_BC_API_TOKEN`, `RF_BC_READ_TOKEN` and any `x-auth-token` value with `[redacted]`. Values of settings named like credentials (`token`, `secret`, `password`, `api key`) are hidden in the release's output.
  - The prune never prints a store error whole. `release-themes.mjs` turns every store call's error into a new one naming the call, with only its message and the token taken out (axios's error carries the request, header and all). The prune's stops pass through the same filter, and any other error in it becomes a stop with its message only.
  - The guard's catalogue errors are filtered with its read-only token, which may come from the Keychain.
  - The prune's and the guard's `fetch` calls refuse redirects (`redirect: 'error'`), because `fetch` would send the `X-Auth-Token` header on to another origin.
- **The capture file** `config.<slug>.live.json` is gitignored. Cavio's capture holds a non-empty `instagram-access-token`, so never commit or share it.
- **If the push seems to hang,** stencil-cli is probably waiting at its theme-deletion prompt, which means My Themes filled up after the release checked it. Press Ctrl-C, then run `scripts/release.sh --prune-only --dry-run` and `--prune-only`, or delete a theme by hand.

## Tests

The release's tests are `scripts/release-*.test.mjs`. `npm run test:scripts` runs them, in CI too, with no store credentials.

- `release-guard.test.mjs` covers the four refusals of the spec's seam 5 (more than one channel, no named variation, a switch difference, and a set-but-missing menu id) and each case of the guard's two rules.
- `release-checks.test.mjs` covers the stops that only a real release reaches, which a dry run can't: the Node version and dirty-tree refusals, the My Themes cap, the typed channel id (a wrong answer, a closed stdin, no terminal), and step 5's gate (a switch toggled or a draft published while the prompt waits, another theme, a new commit, a changed or missing zip). For W0-1 it covers each of `--confirm-nonprod`'s refusals with a calendar for every phase, channels 1 and 1855224 refused by id even in an entry that says `production: false`, the Flip lock on 1895766, the paired channel-1 release, and step 5 with the flag: no prompt, `origin/master` checked first and the calendar again, and the gate still run in full.
- `release-origin.test.mjs` covers the origin check on temp clones of a local bare origin (`release-origin-fixture.mjs`): a branch, a detached `HEAD`, a `master` behind or ahead of `origin/master`, a failed fetch, and at step 5 a merge outside the release tooling (passes), a calendar or target change (stops) and a rewritten `origin/master` (stops). It also keeps `RELEASE_TOOLING` in step with `release.mjs`'s imports.
- `release-lighthouse.test.mjs` covers step 6b's rules (ticket 17): when the gate runs, is pending, is skipped or doesn't run, the run's environment, what a `summary.json` must be before it counts, pass and fail, the entry's lines (the pending line exactly the host batch's), the lines from the runner kept to indented one-line items, the stop after step 7, and the child process: its output with the secrets taken out, its time limit, and Ctrl-C stopping it rather than the release. `release-log.test.mjs` covers the Lighthouse line in the entry and the push summary, and that a forged line from the runner adds no released theme. `release-sh.test.mjs` runs `release.mjs lighthouse` with a fake `npm` first on `PATH`: without the cookie nothing runs; with it, the runner's arguments and environment, pass, fail (then step 7 writes the entry and stops), a run that measured nothing or another build, the Flip, a verify problem, an unreadable state, and Ctrl-C sent to the step, which still exits 0. It also checks that `release.sh` calls the step between verify and step 7, and only after a real push.
- `release-args.test.mjs` covers what the arguments parse to, `--confirm-nonprod` included, and `release-targets.test.mjs` that every target declares `production` and its confirmation modes, a production one typed only, and that 1895766 is the only target that takes the flag.
- `release-diff.test.mjs` covers the three-way diff's cases, and `release-log.test.mjs` reading the channel's last release back from `RELEASES.md` and the "Changed in repo" lines. For W0-3 it covers the builds each entry records and the "My Themes" rows: their format, where they go, and that the repo's `RELEASES.md` keeps passing once it logs deletions and a section follows them.
- `release-prune.test.mjs` covers the prune's selection on recorded Themes API shapes (W0-3): only themes named ReelFlies, the newest three kept, two builds with the same name and version told apart by uuid and ranked by `RELEASES.md` (an older entry a union merge left further down included), a uuid pushed twice, a theme active on any channel or flagged `is_active`, an unrecorded uuid, the rollback on 1895766 and channel 1, and a plan missing a channel's read. With a stubbed store it covers the deletions: oldest first, a row after each, a failure stopping the rest, a row that can't be written, a theme still listed after its deletion, and a failed read after it, with no error carrying the token out. It covers the stop's text, the `RELEASES.md` edits a real prune allows, and the dry run's record: a missing, fixture, stale or other-commit record, and a plan that differs. It also checks that neither prune module activates or uploads a theme.
- `release-themes.test.mjs` covers the store reads with a stand-in for stencil-cli's client and for `fetch`: GETs only, every storefront channel on every page, every site's channel, each one's active theme, and any read that fails stopping the read. Every store call's error comes back naming the call, with only its message and no token, and `fetch` refuses redirects.
- `release-sh.test.mjs` runs `scripts/release.sh` itself, in dry runs. It covers the release lock (a held lock, a lock taken by hand, a stale lock, and the lock dropped at the end), the argument refusals, step 1's stops (two-way and three-way), the live contrast report, the guard, and `--confirm-nonprod` on a calendar date in every phase. It also runs step 5 (`release.mjs pre-push`) in a clone of a local bare origin with no stencil config, where any capture fails at once, to show the typed prompt still stops without a terminal, that step 5 checks the flag again from the code, that it ignores the calendar overrides, and that it stops when a calendar change merged on `origin/master` while the release ran, or the fetch fails. It runs `release.mjs prepare` as a real release in such clones too, to show that `--confirm-nonprod` is refused on a branch, on a `master` behind `origin/master` and when the fetch fails, that a typed release isn't checked, and that a dry run only warns. Step 7 (`release.mjs write-log`) runs in an empty folder to show the `New uuid` line. For W0-3 it runs `--prune-only`'s refusals, a dry `--prune-only` on fixtures that deletes nothing and records its plan in the git folder, a real one refused on a branch, behind `origin/master`, with uncommitted changes or a changed line of `RELEASES.md`, and without a dry run of the store (the record used up once it passes), and the prune after a push: a plan only in a dry run, until a deletion is logged, off `origin/master`'s history, away from the pushed commit, and with uncommitted changes. It checks that the push reads its stdin from `/dev/null`, and that stencil-cli's theme-deletion prompt then exits without an answer. For W0-1b it runs `release.sh` from a shell whose `node` is another version than `.nvmrc`'s, in a temp checkout whose uncommitted scripts stop a real release at its setup checks, before step 1. With a fake nvm whose nvm.sh trips `set -u` and `set -e`, `release.mjs` (and `--prune-only`) runs on `.nvmrc`'s Node and the Node refusal no longer fires. Without nvm, or with nvm lacking the version or failing after it changed PATH, PATH is left alone and the refusal fires as before. nvm.sh is sourced only with `--no-use`, never with the release's arguments, and nothing but `nvm use` is called. With the right Node on PATH, nvm isn't touched. Every other run sets `NVM_DIR` to a folder with no nvm.sh, so no test uses the developer's nvm. Its runs take the release lock in a folder of their own (`RF_LOCK_ROOT`, which only `node --test` may set), and use eight test-only overrides:
  - `RF_RELEASE_CONFIG=<file>` is a theme config to use instead of `config.json`. The run stops before the clean build.
  - `RF_RELEASE_LIVE_FIXTURE=<file>` is a capture to use instead of the store.
  - `RF_RELEASE_TREE_FIXTURE=<file>` is a JSON array of the channel's category ids, to use instead of the catalogue API.
  - `RF_RELEASE_LOG_FIXTURE=<file>` is a release log to read instead of `RELEASES.md`, for the channel's last release, the themes the release pushed and the prune's ranking. Step 7 and a real prune always write `RELEASES.md`.
  - `RF_RELEASE_BASE_FIXTURE=<file>` is a theme config to use as `config.json` at the last release's commit, instead of reading it with git.
  - `RF_RELEASE_CALENDAR_FIXTURE=<file>` is a release calendar to read instead of `scripts/release-calendar.json` (W0-1).
  - `RF_RELEASE_DATE=<YYYY-MM-DD>` is today's date for the calendar, instead of today in Toronto (W0-1).
  - `RF_RELEASE_THEMES_FIXTURE=<file>` is My Themes and every channel's active theme, `{ "themes": [...], "activeByChannel": { "<channel>": "<uuid>" } }`, for the prune, instead of the store (W0-3).
- All eight overrides need `--dry-run`, so a real push or prune always reads the live store, `RELEASES.md`, git and the committed calendar. Step 5 never reads the calendar overrides, and a test runs it with both set to show it.
