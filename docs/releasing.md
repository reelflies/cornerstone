# Releasing the theme

Every theme push to a storefront goes through `scripts/release.sh` (ticket 05). A release targets one channel with one named variation. It never deletes a theme and never pushes to all channels.

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
- **A live value differs from `config.json`.** The release lists each changed or live-only key with both values. Settings that only `config.json` has are new, so they pass. Rerun with one of:
  - `--accept-live`, which copies the live values into the variation's `settings` in `config.json`, keeping its formatting, then stops. Review the change with `git diff config.json`, commit it, and rerun. In a dry run it shows the values and writes nothing.
  - `--overwrite-live`, which lists the keys and asks you to type the channel id, then lets the push overwrite them. The overwritten keys go into the `RELEASES.md` entry. A dry run lists them and asks nothing.
- **The channel has unpublished Theme Styles edits** (its saved configuration differs from the published one). The release says so and diffs against the saved settings, which a push overwrites too.
- **My Themes holds 20 themes.** Delete one by hand in the control panel (Storefront > My Themes). The release never uses `stencil push -d`. A dry run only warns.

## Safety notes

- **Why not `stencil pull`:** it crashes when `config.json` has no variation named like the live one (Cavio's "Natural"), and it silently skips live keys that `config.json` lacks. The capture in `scripts/release-capture.mjs` has neither problem.
- **Tokens:** when a request fails, stencil-cli 9.1.0 prints the whole request, including its `x-auth-token` header. The release pipes the push through a filter that replaces known tokens and any `x-auth-token` value with `[redacted]`. Values of settings named like credentials (`token`, `secret`, `password`, `api key`) are hidden in the release's output.
- **The capture file** `config.<slug>.live.json` is gitignored. Cavio's capture holds a non-empty `instagram-access-token`, so never commit or share it.
- **If the push seems to hang,** stencil-cli is probably waiting at its theme-deletion prompt, which means My Themes filled up after the release checked it. Press Ctrl-C and prune My Themes by hand.

## Tests

The release's tests are `scripts/release-*.test.mjs`. `npm run test:scripts` runs them, in CI too, with no store credentials.

- `release-sh.test.mjs` runs `scripts/release.sh` itself. It covers every refusal and step 1's stops, using two test-only overrides:
  - `RF_RELEASE_CONFIG=<file>` is a theme config to use instead of `config.json`. The run stops before the clean build.
  - `RF_RELEASE_LIVE_FIXTURE=<file>` is a capture to use instead of the store.
- Both overrides need `--dry-run`, so a real push always captures the live theme.
