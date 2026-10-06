# Claude Code permission rules

W0-13 drafts Claude Code permission rules for every agent session on the theme. They are a **draft**: they live in `.claude/settings.draft.json`, which Claude Code never reads. Changes to permission settings are Shaun's to accept (W0-12), so no agent turns them on.

The rules are a tripwire, not a sandbox. Claude Code matches a Bash rule against the command's text, so a determined or confused agent can phrase a command around one. The real limits are the token scopes, the macOS Keychain, the guarded paths and `scripts/merge.sh` ([guardrails.md](guardrails.md)).

## What they do

**Deny** (58 rules, in these groups):

| Group | Examples it stops | Why |
|---|---|---|
| A bare stencil push or release | `npx stencil push -a -c 1`, `stencil push`, `npx @bigcommerce/stencil-cli push`, `npm exec stencil push`, `node_modules/.bin/stencil push`, `npx stencil release` | The publish token in `secrets.stencil.json` makes a bare push work on any channel. Pushes go through `scripts/release.sh` only. |
| A raw merge | `gh pr merge …`, `gh -R … pr merge …`, `gh api …/pulls/12/merge`, `git push origin master`, `git push origin HEAD:master` | Agents merge only through `scripts/merge.sh`, which checks CI, the sign-offs and the baselines first. |
| A non-GET `curl` to the store API | `-X`, `--request`, `-d`, `--data…`, `--json`, `-F`, `--form`, `-T` or `--upload-file`, before or after an `api.bigcommerce.com` URL | Store writes go through W0-11's `scripts/store/` helper, which snapshots, diffs, checks the channel and logs. |
| The Keychain | `security find-generic-password`, `find-internet-password`, `dump-keychain` | The writer token lives there (decision 2), and only the helper reads it. |
| Token files and private data, from the shell | `cat`, `head`, `tail`, `less` or `cp` of `secrets.stencil.json`, `~/reelflies/.env` or `~/.config/reelflies/` | HANDOFF's private-files rule. |
| The same, from Claude's file tools | `Read` of any `secrets.stencil.json`, `~/.config/reelflies/`, `~/reelflies/.env`, `report/data/orders_cache.json` or a `pull.log` | As above. Read rules also cover Grep and Glob. |

**Allow** (no prompt): `scripts/release.sh`, `scripts/merge.sh`, `node scripts/store/…` and `node scripts/status.mjs`. A deny rule always wins over an allow rule.

**Beyond the plan's list,** each one revisitable: `stencil release`, `gh api …/merge` and pushes to `master` (other ways round merge.sh), `find-internet-password` and `dump-keychain`, the shell readers, `orders_cache.json` and `pull.log`, and the `status.mjs` allow rule (reviewers post statuses on every PR).

**Known false positive:** a GET written with an explicit `-X GET` is denied too. Write a GET without `-X`.

`scripts/claude-permissions.test.mjs` matches every rule the way Claude Code documents it (`*` matches any characters; Read rules are gitignore-style paths), and proves that each deny rule fires on a probe and that none catches the commands agents need every day: `stencil bundle` and `start`, `gh pr view` and `create`, pushing a ticket branch, a GET to the store API, symlinking `secrets.stencil.json` into a worktree, and reading `config.stencil.json`.

## Turning them on

Settings load when a session starts, so do this between sessions.

1. **In the repo, so every worktree has them.** In a PR, rename the draft:

   ```sh
   git mv .claude/settings.draft.json .claude/settings.json
   ```

   `scripts/claude-permissions.test.mjs` then tests `settings.json` instead. `.claude/` is a guarded path, so the PR needs `rf/safety` as well as the usual sign-offs. Worktrees made from `master` after it merges have the rules; older ones get them when they rebase.

2. **In `~/reelflies/theme`, for sessions started there** (the orchestrator, and any session in `plan/`). If `~/reelflies/theme/.claude/settings.json` doesn't exist:

   ```sh
   mkdir -p ~/reelflies/theme/.claude
   cp ~/reelflies/theme/cornerstone/.claude/settings.json ~/reelflies/theme/.claude/settings.json
   ```

   If it exists, add the two lists to it:

   ```sh
   cd ~/reelflies/theme/.claude
   jq -s '.[1].permissions as $new
     | .[0]
     | .permissions.allow = (((.permissions.allow // []) + $new.allow) | unique)
     | .permissions.deny  = (((.permissions.deny  // []) + $new.deny)  | unique)' \
     settings.json ~/reelflies/theme/cornerstone/.claude/settings.json > settings.new.json \
     && mv settings.new.json settings.json
   ```

3. **Optionally, for every session on this Mac,** add the same lists to `~/.claude/settings.json`. Nothing in them matters outside ReelFlies, except that every bare `stencil push` is denied.

4. **Check them,** in a new session started in a worktree:
   - Run `/permissions` and look for the deny and allow lists.
   - Make the decoys the probes read. They hold nothing:

     ```sh
     mkdir -p ~/reelflies/rf-deny-probe/reelflies ~/.config/reelflies
     echo '{}' > ~/reelflies/rf-deny-probe/secrets.stencil.json
     echo 'decoy' > ~/reelflies/rf-deny-probe/reelflies/.env
     echo 'decoy' > ~/reelflies/rf-deny-probe/pull.log
     echo 'decoy' > ~/.config/reelflies/rf-deny-probe.txt
     ```

   - Ask Claude to run each probe below, one at a time. Every one must come back denied by a permission rule. Each probe is harmless even if a rule failed to fire: help text, a dry run, a request sent to a closed port on this Mac, a Keychain item that doesn't exist, or a decoy file.

     | Group | Probe |
     |---|---|
     | stencil push | `npx stencil push --help` |
     | stencil release | `npx stencil release --help` |
     | raw merge | `gh pr merge --help` |
     | merge through the API | `gh api --method GET repos/reelflies/reelflies-cornerstone/pulls/1/merge` |
     | push to master | `git push --dry-run origin HEAD:master` |
     | non-GET curl | `curl -X POST --connect-to ::127.0.0.1:9 --max-time 2 https://api.bigcommerce.com/rf-deny-probe` |
     | body after the URL | `curl --connect-to ::127.0.0.1:9 --max-time 2 https://api.bigcommerce.com/rf-deny-probe -d x=1` |
     | Keychain | `security find-generic-password -s rf-deny-probe` |
     | token file, shell | `cat ~/reelflies/rf-deny-probe/secrets.stencil.json` |
     | .env, shell | `cat ~/reelflies/rf-deny-probe/reelflies/.env` |
     | token folder, shell | `cat ~/.config/reelflies/rf-deny-probe.txt` |
     | token file, Read tool | read `~/reelflies/rf-deny-probe/secrets.stencil.json` |
     | token folder, Read tool | read `~/.config/reelflies/rf-deny-probe.txt` |
     | pull.log, Read tool | read `~/reelflies/rf-deny-probe/pull.log` |

   - Then ask it to run `scripts/merge.sh --check 1`, which should run without a prompt (it refuses PR #1, which is merged).
   - Don't probe the exact-path Read rules (`~/reelflies/.env` and `orders_cache.json`) with the real files. `/permissions` showing them is the check.
   - Delete the decoys: `rm -r ~/reelflies/rf-deny-probe ~/.config/reelflies/rf-deny-probe.txt`.

5. **Record the result** (which probes were denied, and the Claude Code version) on the next review page. That closes W0-13's "each deny rule is shown to fire" criterion, which the emulated test covers until then.

## When a rule gets in the way

An agent whose command is denied records it and stops that step; it never phrases the command around the rule (HANDOFF). If the rule is wrong, change it in a PR to `.claude/settings.json`, with a probe for the new case in `scripts/claude-permissions.test.mjs`, and copy the change to `~/reelflies/theme/.claude/settings.json`.
