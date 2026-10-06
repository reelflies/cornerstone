#!/usr/bin/env bash
# The only way agents merge a PR into master (W0-13). GitHub Free can't protect master on a
# private repo, so this is the protection: it takes the merge lock, checks the PR on its head
# sha, and only then runs gh pr merge, pinned to that sha.
#
#   ~/reelflies/theme/cornerstone/scripts/merge.sh <pr>               check, then merge and delete the branch
#   ~/reelflies/theme/cornerstone/scripts/merge.sh --check <pr>       check and report; merges nothing, takes no lock
#   ~/reelflies/theme/cornerstone/scripts/merge.sh --lock-held <pr>   you already hold ~/reelflies/theme/.locks/merge,
#                                       and its owner.txt names "PR #<pr>"; the lock stays yours to release
#
# Run it from the main clone. A PR is judged by origin/master's rules, never its own: before
# anything else, this fetches origin/master and refuses unless every file of the merge tooling
# (TOOLING below) in this checkout, committed or not, is byte-identical to origin/master's.
# Until origin/master has scripts/merge.mjs (the W0-13 bootstrap), the checkout's copy applies.
#
# It refuses, naming each reason, unless: the PR is open, not a draft and targets master; its
# branch contains master's tip; CI passed on the head sha, "checks" and "baseline-scope"
# succeeded; rf/gates, rf/standards, rf/spec and rf/skeptic are "success" there (rf/review alone
# for a docs-only PR), plus rf/safety when it touches a guarded path; no review thread is
# unresolved; GitHub lists every file the PR changes; and the PR body's "Baselines:" line covers
# every changed baseline. docs/guardrails.md has the details; the checks are in scripts/merge.mjs.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# merge.mjs, every module it imports, this script and the guarded list. A test keeps this in
# step with merge.mjs's imports (scripts/lib/guarded-paths.test.mjs), and every one is guarded.
TOOLING=(
    scripts/merge.sh
    scripts/merge.mjs
    scripts/check-baseline-scope.mjs
    scripts/guarded-paths.txt
    scripts/lib/gh.mjs
    scripts/lib/guarded-paths.mjs
    scripts/lib/is-main.mjs
    scripts/lib/lock.mjs
)

refuse() {
    printf 'REFUSED  %s\n' "$1" >&2
    echo 'Refused: 1 reason. Nothing was merged.' >&2
    exit 1
}

if ! fetched="$(git fetch -q origin +refs/heads/master:refs/remotes/origin/master 2>&1)"; then
    refuse "couldn't fetch origin master, so merge.sh can't check that it runs master's rules: ${fetched//$'\n'/ }"
fi

if git cat-file -e refs/remotes/origin/master:scripts/merge.mjs 2>/dev/null; then
    differ=()
    for file in "${TOOLING[@]}"; do
        want="$(git rev-parse -q --verify "refs/remotes/origin/master:$file" 2>/dev/null || echo missing)"
        have=missing
        if [ -f "$file" ]; then have="$(git hash-object -- "$file")"; fi
        [ "$want" = "$have" ] || differ+=("$file")
    done
    if [ "${#differ[@]}" -gt 0 ]; then
        refuse "this checkout's merge tooling differs from origin/master's (${differ[*]}), and a PR is judged by master's rules, never its own: run merge.sh from the main clone at origin/master (git -C ~/reelflies/theme/cornerstone pull --ff-only origin master, then ~/reelflies/theme/cornerstone/scripts/merge.sh <pr>)"
    fi
else
    echo "  note     origin/master has no scripts/merge.mjs yet, so this checkout's merge tooling applies (the W0-13 bootstrap)"
fi

exec node scripts/merge.mjs "$@"
