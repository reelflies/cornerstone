# Guardrails

Agents merge their own PRs and push to ReelFlies_CA (HANDOFF, "Rules for every session"). The org stays on GitHub Free, which can't protect `master` on a private repo, so these rules are enforced by tooling in this repo (W0-13 in `plan/build-pipeline.md`), not by agents behaving well.

| What | Where | What it stops |
|---|---|---|
| The merge script | `scripts/merge.sh`, run from the main clone | A merge without green CI, the gate and sign-off statuses on the head sha, an up-to-date branch, resolved review threads and a declared baseline scope, or judged by any rules but `master`'s |
| Commit statuses | `scripts/status.mjs` | A sign-off that isn't tied to the exact sha it reviewed |
| Guarded paths | `scripts/guarded-paths.txt` | A change to the release, store, merge or permission tooling, the release log, the calendar, CI, the secret scan's config or the documents that steer agents without an extra safety review (`rf/safety`) |
| The baseline-scope check | `scripts/check-baseline-scope.mjs`, `.github/workflows/reelflies-baseline-scope.yml` | A screenshot baseline changed outside the kinds the PR declares |
| The release calendar | `scripts/release-calendar.json`, `scripts/lib/release-calendar.mjs` | Pushes and widget edits during the freezes (read by W0-1 and W0-11) |
| The store-write helper | `scripts/store/`, `scripts/lib/store-token.mjs`, [store-writes.md](store-writes.md) | A store write that skips the snapshot, the diff or the log row, names a channel other than 1895766, hits an endpoint off the allowlist, edits a widget from T-14 or writes anything but an unpublish from the Flip, runs rules other than `origin/master`'s, or is a store-wide write not typed by Shaun at his terminal |
| The catalogue apply | `scripts/catalogue/apply*`, `scripts/catalogue/fixtures/`, [catalogue-jobs.md](catalogue-jobs.md) | A catalogue write (ticket 18) not confirmed by Shaun at his terminal with a token he made, run by rules other than `origin/master`'s, sent from a stale plan or one made for another store, outside the four catalogue PUTs, or moving a size label onto another value id; or a restore that no apply logged, or that puts back a field its plan never wrote |
| Claude Code permission rules (a draft until Shaun turns them on) | `.claude/settings.draft.json`, [permissions.md](permissions.md) | A bare `stencil push`, a raw `gh pr merge`, a non-GET `curl` to the store API, reading a token |

All of it is tested offline by `npm run test:scripts`, with a stubbed `gh`.

## Merging: `scripts/merge.sh`

```sh
~/reelflies/theme/cornerstone/scripts/merge.sh 12              # check everything, then merge and delete the branch
~/reelflies/theme/cornerstone/scripts/merge.sh --check 12      # check and report only; merges nothing and takes no lock
~/reelflies/theme/cornerstone/scripts/merge.sh --lock-held 12  # you already hold the merge lock (below)
```

It is the only way agents merge. Never run `gh pr merge`, `gh api …/pulls/<n>/merge` or `git push` to `master`; the permission rules deny all three once they are on.

**Run it from the main clone,** `~/reelflies/theme/cornerstone`, on `master`, by that full path (the permission rules pre-approve only that copy). A PR is judged by `master`'s rules, never by its own: before anything else, merge.sh fetches `origin/master` and refuses unless every file of the merge tooling in the checkout it runs from is byte-identical to `origin/master`'s, uncommitted edits included. The tooling is `merge.sh`, `merge.mjs` and every module it imports, and `scripts/guarded-paths.txt`, listed as `TOOLING` in `merge.sh`, where a test keeps the list in step with `merge.mjs`'s imports. So a PR that changes the merge tooling can't merge itself from its own worktree, and a main clone behind `origin/master` is told to `git pull --ff-only` first. A PR worktree rebased onto `origin/master` whose PR doesn't touch the tooling passes this check too, but the main clone is the habit to keep. The one exception was the W0-13 bootstrap: while `origin/master` had no `scripts/merge.mjs`, the checkout's own copy applied.

**What it checks,** all on the PR's head sha. Each failure is a `REFUSED` line naming its reason, and all of them are listed at once:

1. The PR is open, not a draft, targets `master`, and its branch is in this repo (not a fork).
2. The branch contains `master`'s tip. If `master` has moved, rebase onto `origin/master`, rerun the gates and get the sign-offs again on the new head (`plan/build-pipeline.md`, section 6.7).
3. CI: at least one check ran, and both `checks` (`reelflies-checks.yml`) and `baseline-scope` finished as success. Any other check may also finish neutral or skipped; a required one that was skipped or neutral refuses. Only the newest run of each check counts, as in GitHub's checks view, so a `baseline-scope` run that failed before a body edit fixed the `Baselines:` line doesn't block the merge once the rerun passes.
4. The statuses below are `success`. Any other status that is pending, failed or errored also refuses.
5. No review thread is unresolved, and no reviewer has requested changes.
6. GitHub listed every file the PR changes. Its files API stops at 3000, so merge.sh compares the list with the PR's `changedFiles` and refuses a PR of 3000 files or more: a guarded path or a baseline past the cut would go unseen.
7. The PR body's `Baselines:` line covers every changed baseline. CI checks this too; merge.sh checks it again on the current body and files, so a body edited after CI ran can't slip through.

**Then** it runs `gh pr merge <n> -R reelflies/reelflies-cornerstone --merge --delete-branch --match-head-commit <sha>`. GitHub refuses the merge if anyone pushed to the branch after the checks ran. With `-R`, gh deletes only the remote branch; remove your worktree yourself.

**The merge lock** is `~/reelflies/theme/.locks/merge`, taken with an atomic `mkdir` (`scripts/lib/lock.mjs`). merge.sh takes it before reading anything and releases it when it finishes, fails or is interrupted. Only one merge runs at a time.

- If another holder has it, merge.sh refuses and names the holder from `owner.txt`. Wait and rerun.
- A lock is stale when its `owner.txt` is more than 45 minutes old and the pid it names (if any) isn't running. merge.sh breaks a stale lock with a `STALE` line naming the old holder. It never breaks a lock whose holder is still running.
- A stale lock is broken by renaming it aside, which is atomic, and checking that what moved is still the lock judged stale. Of two processes breaking the same lock, only one ends up holding it; the other puts back the lock it moved and refuses. Releasing removes only the lock that run took.
- `RF_LOCK_ROOT` moves the locks for tests, and only under `node --test`. On a real run it is refused, so a stray export can't give one merge a private lock.
- If you took the lock by hand to rebase and merge in one go, write `PR #<n>` in its `owner.txt` and run `~/reelflies/theme/cornerstone/scripts/merge.sh --lock-held <n>`. merge.sh checks that the lock exists and names that PR, and leaves it for you to release.

## Commit statuses: `scripts/status.mjs`

```sh
node ~/reelflies/theme/cornerstone/scripts/status.mjs --pr 12 --sha <full head sha> --context rf/spec --state success \
  --description "Spec: 9 met, 2 waiting (refactor 14)" \
  --url https://github.com/reelflies/reelflies-cornerstone/pull/12#issuecomment-123
```

| Context | Posted by | Needed by merge.sh |
|---|---|---|
| `rf/gates` | the author, after the gates (section 7, step 5), with the gate summary | every PR except docs-only |
| `rf/standards`, `rf/spec`, `rf/skeptic` | the three review agents the orchestrator spawns (step 6) | every PR except docs-only |
| `rf/review` | the one review agent of a docs-only PR | a docs-only PR: every changed file is Markdown or under `docs/`, and none is a `CLAUDE.md` or `AGENTS.md`, which steer agents |
| `rf/safety` | a safety-review agent the orchestrator spawns | a PR that touches a guarded path, in addition to the others |

- The state is `success`, `failure`, `error` or `pending`.
- The description is the gate summary or the verdict. GitHub allows 140 characters, so a longer one is cut with an ellipsis; the full text goes in the PR comment, which `--url` links to.
- The sha must be the PR's head now. status.mjs refuses an older one, because a sign-off on it would cover code that is no longer the PR.
- `--dry-run` prints the call and posts nothing.
- A new push makes every status stale: each one is on the old sha, and merge.sh reads the new one.

## Guarded paths and `rf/safety`

`scripts/guarded-paths.txt` lists the paths a PR may change only with an extra safety review. Shaun's answer of 2026-10-06 lets agents merge these PRs too, so a guarded path doesn't stop a merge: it adds `rf/safety` to the statuses merge.sh needs. The list covers:

- the release tooling and every module it imports (bar `check-contrast.mjs`, below), and `RELEASES.md`, which it reads to tell this fork's theme uuids apart, which W0-3's prune ranks by, and where the prune logs each deletion
- `scripts/store/`, the store token loader, the catalogue apply step, and the in-memory catalogue its tests trust (`scripts/catalogue/fixtures/`, which holds nothing else)
- the merge tooling and every module `merge.mjs` imports, `status.mjs`, the baseline-scope check and the list itself
- the release calendar
- `.claude/`, the permission test, the root `CLAUDE.md` and `AGENTS.md`, and the documents agents and Shaun act on: `docs/guardrails.md`, `docs/permissions.md` (its probes are run by Shaun), `docs/releasing.md`, `docs/store-writes.md` and `docs/catalogue-jobs.md` (the catalogue write, and the token he makes for it)
- `.github/`, `scripts/test-scripts.mjs` (which picks the script tests CI runs), and `.gitleaks.toml` and `.gitleaksignore`, which gitleaks reads from the repo by itself, so either could switch the secret scan off
- `.gitattributes`, because an attribute can change how a guarded file merges (`RELEASES.md merge=union`, W0-11) or hide its diff from a reviewer (`-diff`, `linguist-generated`)

How it matches:

- One repo-relative path per line. A trailing slash guards everything under a folder. `*` matches within one path segment, and a pattern that matches a folder guards what is in it.
- Matching ignores case, because the Mac's file system does: a PR adding `.Claude/settings.json` or `Scripts/store/x.mjs` lands in the guarded folder when it is checked out here.
- A rename counts under both names, so moving a file out of a guarded folder still needs `rf/safety`.
- merge.sh runs only with `origin/master`'s copy of the list and of the code that reads it (above), and also reads `master`'s list through the API, so a PR can't unguard a path by editing its own copy or the matcher. The list is itself guarded.
- A release-log PR touches only `RELEASES.md`, so it needs `rf/review` and `rf/safety`. The safety review checks each entry against `release.sh`'s own output.
- **The safety review** reads the whole diff of the guarded files and asks: does this widen what agents can do on the store, in GitHub or on this Mac? Does it weaken a check, a refusal, a lock or a test? Could it reach channel 1 or 1855224, a store-wide setting, the catalogue, a promotion, or a token? A "yes" is a finding, unless the ticket or Shaun's 2026-10-06 grant asks for exactly that.

### What isn't guarded, on purpose (revisitable)

The guard covers the code and data that decide what merges, what is pushed where, and what is written to the store. It doesn't cover every file that runs during a merge or a release: `release.sh` also runs `npm ci`, the webpack build, Jest and the gates, so guarding all of it would guard most of the repo. These stay open, and the four normal sign-offs review them:

- `scripts/check-contrast.mjs` and `scripts/check-bundle.mjs`: gates on colours and bundle size that decide no channel or target. Tickets 25 and 50 own the contrast check.
- The catalogue dry run (`scripts/catalogue/` bar `apply*` and `fixtures/`, its sample export in `dry-run-fixtures/` included): it only proposes. Every plan it makes is checked by the guarded `apply-rules.mjs` when it is written and again when Shaun applies it, and the diff he approves is derived by apply from the store, never from the plan. A test keeps these files open and the apply files guarded.
- `package.json` and `package-lock.json`: W0-6, 17, 46 and 54 add scripts, and dependency bumps change the lockfile (section 6.4 of the plan). A change to `test:scripts`, `qa:prepush` or the stencil-cli pin is a finding for the standards review.
- `scripts/qa/`: the gates lane (W0-4 to W0-8) and every template ticket edit it.
- A `gitleaks:allow` comment, which gitleaks honours in any file. The skeptic treats one as a finding.

## Declaring changed baselines

Every PR body ends with a `Baselines:` line (section 6.6 of the plan):

```text
Baselines: none
Baselines: product, product@sold-out, overlay rf_rise-off
Baselines: epoch 18's apply renamed the aught sizes
```

- A **page kind** (`home`, `product`, `species-hub` …) covers that kind's plain pin on every channel and at every width, including its UI states (W0-8).
- **`kind@pin`** covers that pin only (W0-8's several pins per kind).
- **`overlay <name>`** covers every baseline rendered under that overlay.
- **`epoch <cause>`** covers every baseline, and only in a PR that changes nothing but files under `scripts/qa/baselines/`: the orchestrator's re-baseline epoch PRs. A PR that also changes anything else and declares an epoch fails.
- **`none`** covers nothing.
- One line per body. It may be bold or a list item, and must start the line.

The check reads each PNG's name as `scripts/qa/baselines/<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png`. A PNG in any other shape, including the folder or the extension in another case, is covered only by an epoch, so a new naming scheme can't slip past the check. A changed, added, deleted or renamed PNG all count. A PR that changes no baseline passes without the line, but the runbook still asks for `Baselines: none`.

The check runs in CI as its own workflow, on every push and on every edit of the PR body, so fixing the line reruns it. Run it locally with:

```sh
PR_BODY="$(gh pr view 12 -R reelflies/reelflies-cornerstone --json body -q .body)" \
  node scripts/check-baseline-scope.mjs --base origin/master --head HEAD
```

## The release calendar

`scripts/release-calendar.json` holds the Flip date:

```json
{ "flip": null, "status": "provisional", "source": "ticket 10: Flip date after ticket 26" }
```

- `flip` is a date (`YYYY-MM-DD`) or `null`. `status` is `provisional` or `set`. `source` names the ticket 10 comment that gave the date. Any other key, or a date that doesn't exist, is refused, so a typo can't read as "no Flip date".
- The orchestrator writes the provisional date (lane G's Flip window, then ticket 26's re-estimate), and Shaun sets the real one in ticket 10. The file is guarded, so each change gets a safety review.
- A provisional date limits exactly as a set one does. With no date, nothing is limited.

`scripts/lib/release-calendar.mjs` works out the milestones and today's phase. Today is the date in Toronto, and a phase starts at midnight there on its milestone.

| Phase | From | `confirmNonprod` (W0-1) | `pairedChannel1Release` (W0-1) | `widgetEdits` (W0-11) | `nonP1Tickets` (orchestrator) |
|---|---|---|---|---|---|
| `unset` | no Flip date | allowed | no | all | yes |
| `build` | before T-35 | allowed | no | all | yes |
| `T-35` | code complete | allowed | no | all | yes |
| `T-28` | channel-1 push (ticket 56) | allowed | yes | all | yes |
| `T-21` | code freeze (ticket 57) | refused | yes | all | no |
| `T-14` | content freeze, hreflang v1 | refused | yes | unpublish-only | no |
| `T-0` | the Flip | refused | no | unpublish-only | no |
| `T+30` | the day-30 review | refused | no | unpublish-only | no |

The limits only tighten. After the Flip, 1895766 is live reelflies.ca, so agent pushes there stay refused. Lifting any limit after T+30 is a code change for ticket 58.

```sh
node scripts/lib/release-calendar.mjs                 # today's phase and the milestones
node scripts/lib/release-calendar.mjs --date 2027-02-10 --json
```

```js
import { readCalendar, phaseOn, describePhase } from './lib/release-calendar.mjs';
const phase = phaseOn(readCalendar()); // or phaseOn(calendar, 'YYYY-MM-DD') in a test
if (!phase.limits.confirmNonprod) throw new Error(`--confirm-nonprod is refused: ${describePhase(phase)}`);
```

A test passes its own calendar object to `phaseOn` (or a fixture file to `readCalendar(path)`), never by editing the real file. A test-only override of the file must be refused on a real run, as `RF_RELEASE_CONFIG` is.

## Permission rules

The Claude Code rules are drafted in `.claude/settings.draft.json`, which Claude Code doesn't read. Shaun turns them on; [permissions.md](permissions.md) says how, and how to prove each rule fires. They pre-approve only the main clone's `merge.sh`, `status.mjs`, store helper and `release.sh` (plus a `release.sh … --dry-run` in any checkout), so run those by their full path in `~/reelflies/theme/cornerstone`.
