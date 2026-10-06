#!/usr/bin/env bash
# The only way agents merge a PR into master (W0-13). GitHub Free can't protect master on a
# private repo, so this is the protection: it takes the merge lock, checks the PR on its head
# sha, and only then runs gh pr merge, pinned to that sha.
#
#   scripts/merge.sh <pr>               check everything, then merge and delete the branch
#   scripts/merge.sh --check <pr>       check and report; merges nothing and takes no lock
#   scripts/merge.sh --lock-held <pr>   you already hold ~/reelflies/theme/.locks/merge, and its
#                                       owner.txt names "PR #<pr>"; the lock stays yours to release
#
# It refuses, naming each reason, unless: the PR is open, not a draft and targets master; its
# branch contains master's tip; CI passed on the head sha, "baseline-scope" included; rf/gates,
# rf/standards, rf/spec and rf/skeptic are "success" there (rf/review alone for a docs-only PR),
# plus rf/safety when it touches a guarded path; no review thread is unresolved; and the PR
# body's "Baselines:" line covers every changed baseline. docs/guardrails.md has the details;
# the checks are in scripts/merge.mjs.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

exec node scripts/merge.mjs "$@"
