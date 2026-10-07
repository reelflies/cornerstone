#!/usr/bin/env bash
# Releases the theme to one storefront channel with one named variation (tickets 05 and 15).
#
#   scripts/release.sh --channel <id> --variation "<name>" [--dry-run] [--first-release] [--accept-live | --overwrite-live] [--confirm-nonprod <id>]
#   scripts/release.sh --prune-only [--dry-run]
#
# Run it bare: before anything else it selects .nvmrc's Node with nvm when the shell has another (W0-1b).
#
#   0 how step 5 is confirmed (typed, or --confirm-nonprod on a non-production target, W0-1) within
#     the release calendar's limits (scripts/release-calendar.json); --confirm-nonprod runs only from
#     master at origin/master's tip (scripts/release-origin.mjs)
#   1 capture the channel's live Theme Styles (read-only) and diff them against config.json and
#     against config.json at the channel's last release in RELEASES.md (W0-2), report the live
#     colours' contrast, then the release guard: rf_* module switches and menu ids
#   2 clean build      3 checks      4 bundle, check the zip, then axe, raw HTML and screenshots
#   5 push (never in a dry run: a dry run prints the push command and the log entry, then stops)
#   6 verify           6b Lighthouse on the prelaunch host (ticket 17): with the operator's preview
#                         cookie it runs the gate; without it, as on an agent's push, the entry
#                         records "pending host batch" for the next host batch (W0-6)
#   7 log the release in RELEASES.md
#   then prune old ReelFlies builds from My Themes (W0-3), logging each deletion in RELEASES.md: a
#   plan only in a dry run, and until a --prune-only has deleted a theme
#
# --prune-only runs the prune on its own, holding the same lock; with --dry-run it deletes nothing
# and records its plan, which a real --prune-only needs (within 60 minutes) and deletes no more than.
#
# docs/releasing.md explains each step, flag and refusal. The node steps are in scripts/release.mjs.
# Every failed step stops the release, and only one release or dry run runs at a time on this Mac.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# .nvmrc's Node, before anything runs node (W0-1b). Agents run the bare commands Claude Code's allow
# rules name, from a login shell on nvm's default Node, and a real release refuses any Node but
# .nvmrc's (release.mjs checkSetup). So when node on PATH isn't .nvmrc's version and nvm is there
# ($NVM_DIR, or ~/.nvm), this asks nvm for .nvmrc's version in a subshell and takes only the PATH it
# makes, once that PATH's node reports the version, printing one line. nvm.sh is sourced with
# --no-use, so it neither switches to its default nor reads this script's arguments (an --install
# among them would install a Node), and `nvm use` never installs one. Otherwise PATH stays as it
# was, and release.mjs refuses a real release on the wrong Node as before.
select_nvmrc_node() {
    local wanted had nvm_sh nvm_path
    [ -f .nvmrc ] || return 0
    wanted="$(tr -d '[:space:]' < .nvmrc)"
    had="$(node --version 2>/dev/null || true)"
    if [ -z "$wanted" ] || [ "$had" = "v$wanted" ]; then return 0; fi
    nvm_sh="${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh"
    [ -f "$nvm_sh" ] || return 0
    # nvm.sh isn't written for set -euo pipefail, so the subshell turns them off. (No quote mark
    # inside $( ): macOS's bash 3.2 misreads one in a comment there.)
    nvm_path="$(
        set +euo pipefail
        . "$nvm_sh" --no-use >/dev/null 2>&1
        nvm use --silent "$wanted" >/dev/null 2>&1 && printf '%s' "$PATH"
    )" || true
    if [ -n "$nvm_path" ] && [ "$(PATH="$nvm_path" && node --version 2>/dev/null || true)" = "v$wanted" ]; then
        PATH="$nvm_path"
        echo "node     v$wanted from .nvmrc, selected with nvm (the shell had ${had:-no node})"
    fi
}
select_nvmrc_node

STATE_DIR=""
LOCK_TAKEN=""
trap 'if [ -n "$LOCK_TAKEN" ]; then node scripts/lib/lock.mjs drop release --pid "$$" || true; fi; if [ -n "$STATE_DIR" ]; then rm -rf "$STATE_DIR"; fi' EXIT

# One release or dry run at a time on this Mac (W0-7): the release lock,
# ~/reelflies/theme/.locks/release, held for this script's pid until it exits. A held lock stops
# this run before anything else, naming its holder and start time; one over 90 minutes old whose
# pid has gone is broken, with a STALE line. scripts/lib/lock.mjs has the rules. It exits 1 when
# another run holds the lock, and 2 when it can't take it at all (RF_LOCK_ROOT outside a test,
# or something at the lock's path that isn't a lock).
lock_status=0
node scripts/lib/lock.mjs take release --pid "$$" --owner "scripts/release.sh $*" || lock_status=$?
if [ "$lock_status" -eq 1 ]; then
    echo "Another release or dry run is running on this Mac, or holds its lock, so nothing ran. Run this again once it has finished." >&2
    echo "If you took this lock by hand under wave 0's rule, remove it first: release.sh takes this lock itself (W0-7)." >&2
    exit 1
elif [ "$lock_status" -ne 0 ]; then
    echo "STOP     the release lock couldn't be taken, so nothing ran (above says why)." >&2
    exit 1
fi
LOCK_TAKEN=1

STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rf-release.XXXXXX")"
export RF_RELEASE_STATE="$STATE_DIR/state.json"

release() { node scripts/release.mjs "$@"; }
step() { printf '\n== %s\n' "$1"; }

# W0-3: --prune-only prunes My Themes and nothing else. Any argument that is the flag, with or
# without a value, sends every argument to `release prune`, which refuses a value and any other
# argument but --dry-run; a release refuses the flag among its own arguments.
prune_only=false
for arg in "$@"; do
    case "$arg" in --prune-only | --prune-only=*) prune_only=true ;; esac
done
if [ "$prune_only" = true ]; then
    release prune "$@"
    exit 0
fi

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
# sends that zip. The release keeps ports 3300 and 3301, whatever QA_PORT the shell has; each gate
# takes a stencil start slot like any other run (W0-7).
step "Step 4 · Storefront gates: axe, raw HTML and screenshots"
QA_PORT=3300 QA_FRESH_SERVER=1 QA_CHANNEL="$(release state channel)" QA_VARIATION="$(release state variation)" npm run qa:prepush

if [ "$dry_run" = true ]; then
    release dry-run-report
    release prune-after-push
    exit 0
fi

# Step 5: show the push summary and ask for the channel id, or, with --confirm-nonprod on a
# non-production target, fetch origin/master and check the flag again against it and today's
# release calendar, and ask nothing (W0-1). Then the gate captures the channel again and checks
# that nothing changed since steps 1 and 4 (scripts/release-checks.mjs pushGate), and the push
# sends exactly the checked zip to one channel with one named variation
# (scripts/release-targets.mjs buildPushArgs). push-args refuses unless the gate passed.
release pre-push
release push-args > "$STATE_DIR/push-args"
push_args=()
while IFS= read -r -d '' arg; do push_args+=("$arg"); done < "$STATE_DIR/push-args"
if [ "${#push_args[@]}" -ne 7 ]; then
    echo "STOP     the push command isn't the expected 7 arguments; nothing was pushed" >&2
    exit 1
fi
# stdin is /dev/null: with -a and -c the push asks nothing, unless My Themes is full, when stencil-cli
# asks which theme(s) to delete. That prompt then fails closed instead of reading an agent's piped
# input or a key pressed at the terminal: the push never deletes a theme (only the prune below does).
npx stencil "${push_args[@]}" </dev/null 2>&1 | release redact

release verify
# Step 6b (ticket 17): Lighthouse needs the theme live, so it runs after the push, and before step 7
# so the entry records the scores and pass or fail. It never stops the release itself (Ctrl-C stops
# only Lighthouse, and if the step fails anyway step 7 records "pending host batch"): the push is
# done, so step 7 must write its entry. A failed gate stops the release once the entry is written,
# before the prune.
release lighthouse || echo "WARNING  step 6b stopped (above), so step 7 records Lighthouse as pending host batch" >&2
release write-log
# W0-3: after the log entry, so the prune counts this release. write-log stops the release when
# verify found a problem, so nothing is pruned then.
release prune-after-push
