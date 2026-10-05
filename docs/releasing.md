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

It writes only the gitignored capture (`config.ca.live.json`) and bundle zip.

## Real release

```sh
scripts/release.sh --channel 1895766 --variation 'ReelFlies CA'
```

| Step | What it does | It stops when |
|---|---|---|
| 1. Capture and diff | Reads the channel's active theme and saved Theme Styles with stencil-cli's own API client (GET only). Writes `config.<slug>.live.json` and diffs it against `config.json`'s settings for the variation (base settings, with the variation's settings on top). | A live value differs, the channel runs another theme, or My Themes is full. See [When step 1 stops](#when-step-1-stops). |
| Release guard | Checks the module switches (`rf_*`) and the menu category ids. See [The release guard](#the-release-guard). | A switch differs from the live theme or exists only there, or a set menu id isn't in the channel's category tree. |
| 2. Clean build | `rm -rf assets/dist`, then `npm ci`. Upstream's webpack clean step never deletes anything, so stale chunks would otherwise ship. | `npm ci` fails. |
| 3. Checks | Jest, `npm run test:scripts`, ESLint, Stylelint, the contrast check, and `config.json` against stencil-cli's full theme config schema. `stencil bundle` uses a looser schema, so it accepts a variation without `demo_url`. | Any check fails. |
| 4. Bundle | `npx stencil bundle --name reelflies-<slug>-<version>-<commit>`, which runs the production webpack build, then `scripts/check-bundle.mjs`. | The zip has forbidden files, or `config.json` is over the upload limit. |
| 5. Push | Captures the channel again and shows the push summary, then asks you to type the channel id. Then runs `npx stencil push -f <zip> -a '<variation>' -c <channel>`, which pushes the zip that was checked. | The live theme or its Theme Styles changed since step 1, My Themes is full, or you typed anything but the channel id. |
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

### Release targets

The targets are in `scripts/release-targets.mjs`. Any channel that isn't listed there is refused.

| Channel | Storefront | Variations | Capture file |
|---|---|---|---|
| 1895766 | ReelFlies_CA (prelaunch) | ReelFlies CA | `config.ca.live.json` |

- **Channel 1 (live reelflies.ca)** is refused. It is pushed only through ticket 53's guarded channel-1 target, which will add its own entry.
- **Channel 1855224 (reelflies.com)** is refused. .com stays on its own theme until it moves to the fork, which is out of scope.

## When step 1 stops

- **The channel runs another theme.** ReelFlies_CA runs Cavio until the first push. A diff against another theme means nothing, so the release stops.
  - Rerun with `--first-release` to replace that theme. The release reports the theme being replaced, which keeps its own Theme Styles in My Themes.
  - `--first-release` is refused on a channel that already runs this fork, because it would skip the diff.
- **A live value differs from `config.json`.** The release lists each changed or live-only key with both values. Settings that only `config.json` has are new, so they pass. The `rf_*` module switches are the release guard's, so step 1 skips them. The two menu ids aren't switches, so step 1 checks them like any other setting. Rerun with one of:
  - `--accept-live`, which copies the live values of every differing key, `rf_*` included, into the variation's `settings` in `config.json`, keeping its formatting, then stops. Review the change with `git diff config.json`, commit it, and rerun. In a dry run it shows the values and writes nothing.
  - `--overwrite-live`, which lists the keys and asks you to type the channel id, then lets the push overwrite them. The overwritten keys go into the `RELEASES.md` entry. A dry run lists them and asks nothing.
- **The channel has unpublished Theme Styles edits** (its saved configuration differs from the published one). The release names the keys and diffs against the saved settings, which a push overwrites too. The release guard checks the `rf_*` switches against both. The push summary and the `RELEASES.md` entry name the keys.
- **My Themes holds 20 themes.** Delete one by hand in the control panel (Storefront > My Themes). The release never uses `stencil push -d`. A dry run only warns.

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
- `release-sh.test.mjs` runs `scripts/release.sh` itself. It covers every refusal, step 1's stops and the guard, using three test-only overrides:
  - `RF_RELEASE_CONFIG=<file>` is a theme config to use instead of `config.json`. The run stops before the clean build.
  - `RF_RELEASE_LIVE_FIXTURE=<file>` is a capture to use instead of the store.
  - `RF_RELEASE_TREE_FIXTURE=<file>` is a JSON array of the channel's category ids, to use instead of the catalogue API.
- All three overrides need `--dry-run`, so a real push always reads the live store.
