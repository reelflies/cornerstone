#!/usr/bin/env bash
# Releases the theme to one storefront channel with one named variation (tickets 05 and 15).
#
#   scripts/release.sh --channel <id> --variation "<name>" [--dry-run] [--first-release] [--accept-live | --overwrite-live]
#
#   1 capture the channel's live Theme Styles (read-only) and diff them against config.json,
#     report the live colours' contrast, then the release guard: rf_* module switches and menu ids
#   2 clean build      3 checks      4 bundle, check the zip, then axe, raw HTML and screenshots
#   5 push (never in a dry run: a dry run prints the push command and the log entry, then stops)
#   6 verify           7 log the release in RELEASES.md
#
# docs/releasing.md explains each step, flag and refusal. The node steps are in scripts/release.mjs.
# Every failed step stops the release.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rf-release.XXXXXX")"
trap 'rm -rf "$STATE_DIR"' EXIT
export RF_RELEASE_STATE="$STATE_DIR/state.json"

release() { node scripts/release.mjs "$@"; }
step() { printf '\n== %s\n' "$1"; }

# Refusals (before any network call or build), step 1 (capture and diff, then a report of the
# live colours' contrast), then the release guard.
release prepare "$@"

if [ "$(release state stopBeforeBuild)" = true ]; then
    echo "Fixture run (RF_RELEASE_CONFIG): stopped before the clean build, which would use config.json."
    exit 0
fi
dry_run="$(release state dryRun)"
if [ "$dry_run" != true ] && [ "$dry_run" != false ]; then
    echo "STOP     scripts/release.mjs recorded no release state (dryRun is \"$dry_run\"), so its checks didn't run: nothing was built or pushed" >&2
    exit 1
fi
bundle_name="$(release state bundleName)"
zip="$bundle_name.zip"

step "Step 2 · Clean build"
# Upstream's webpack clean step never deletes anything, so stale chunks would ship.
rm -rf assets/dist
unset ANALYZE # the bundle analyser writes report.html into assets/dist
npm ci
# stencil bundle (step 4) runs the production webpack build itself.

step "Step 3 · Checks"
npx jest
npm run test:scripts
npx eslint --ext .js,.mjs assets/js scripts
npm run stylelint
node scripts/check-contrast.mjs config.json
release validate-config

step "Step 4 · Bundle"
rm -f "$zip"
npx stencil bundle --name "$bundle_name"
node scripts/check-bundle.mjs "$zip"
release bundle-info "$zip"

# axe, the raw-HTML check and the screenshot diffs (scripts/qa, ticket 16), each on a local
# stencil start of the target. QA_FRESH_SERVER=1 starts a new one each time and stops if one is
# already running, so no gate checks a server left running on another checkout or an older build.
# stencil start's dev build replaces assets/dist, so this runs after the zip is checked; the push
# sends that zip.
step "Step 4 · Storefront gates: axe, raw HTML and screenshots"
QA_FRESH_SERVER=1 QA_CHANNEL="$(release state channel)" QA_VARIATION="$(release state variation)" npm run qa:prepush

if [ "$dry_run" = true ]; then
    release dry-run-report
    exit 0
fi

# Step 5: show the push summary and ask for the channel id. Then the gate captures the channel
# again and checks that nothing changed since steps 1 and 4 (scripts/release-checks.mjs pushGate),
# and the push sends exactly the checked zip to one channel with one named variation
# (scripts/release-targets.mjs buildPushArgs). push-args refuses unless the gate passed.
release pre-push
release push-args > "$STATE_DIR/push-args"
push_args=()
while IFS= read -r -d '' arg; do push_args+=("$arg"); done < "$STATE_DIR/push-args"
if [ "${#push_args[@]}" -ne 7 ]; then
    echo "STOP     the push command isn't the expected 7 arguments; nothing was pushed" >&2
    exit 1
fi
npx stencil "${push_args[@]}" 2>&1 | release redact

release verify
release write-log
