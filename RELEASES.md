# Release log

Every theme push to a storefront goes through `scripts/release.sh` ([docs/releasing.md](docs/releasing.md)), which appends an entry under "Releases" after the push. Don't edit the entries by hand.

## Releases

### 2026-10-06 14:30 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: ReelFlies 6.22.0, uuid `58abad50-a3c0-013f-e2b6-2ec98cc9ce73`
- Commit: `5d0d0cb8ca42405d8555de6a84f20843060d7cde` on `master`
- Bundle: `reelflies-ca-6.22.0-5d0d0cb.zip`, 10,940,174 B, sha256 `367071ace794697e59a36129ba4f958a2d27daf85aa9bf73411d42c6cfc763dc`
- main.js: 245,069 B
- Step 1: first release, replacing Cavio · variation "Natural" (theme 25121d00-dd0c-013d-4919-76cf528056e2)
- rf_* values pushed: none
- New switches: none
- Verify: the live saved settings match config.json
- Operator: Shaun Bathgate

### 2026-10-07 03:07 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: ReelFlies 6.22.0, uuid `174ad580-a42a-013f-3c01-06627e5707c7`
- New uuid: yes; before the push the channel ran theme `58abad50-a3c0-013f-e2b6-2ec98cc9ce73`
- Commit: `a30586f5913f2ae391729c9fe0c05885e8712326` on `master`
- Bundle: `reelflies-ca-6.22.0-a30586f.zip`, 10,938,401 B, sha256 `5ae0f7917aa83549954f5f1c9a58bfe548820e9c6a4df4dd0bac77757c6ed1f2`
- main.js: 245,069 B
- Step 1: no differences from the live saved settings
- Changed in repo: none since `5d0d0cb`, the channel's last release
- rf_* values pushed: none
- New switches: none
- Verify: 1 problem(s): the live theme is "ReelFlies (1)", not "ReelFlies"
- Operator: Shaun Bathgate
- Confirmation: non-interactive (agent), `--confirm-nonprod 1895766`

## Switch toggles

Log every module switch (`rf_*`) toggled in a storefront's Theme Styles here, one row per toggle, in this format. From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through `scripts/release.sh` (SCOPE-3).

After a toggle, change `config.json` to match and commit it. Otherwise the next release stops on the difference (the release guard, ticket 15).

| Date | Channel | Switch | From | To | Who | Reason |
|---|---|---|---|---|---|---|

## My Themes

Every theme the release tooling deletes from My Themes, one row each, written by `scripts/release.sh`'s prune right after the deletion (W0-3, [docs/releasing.md](docs/releasing.md#pruning-my-themes)). The prune runs after each push, and on its own with `--prune-only`. It deletes only themes named ReelFlies that this file records as a release, active on no channel and not flagged `is_active` in My Themes, never the latest or previous release on 1895766 or channel 1, and always keeps the newest three. The commit and zip sha256 are the deleted build's, from its release entry. The operator is `git config user.name`, with "(no terminal)" when the prune ran without one, as an agent's does. Don't edit the rows by hand.

| Time (UTC) | Action | Theme uuid | Name and version | Commit | Zip sha256 | Operator |
|---|---|---|---|---|---|---|
