# Release log

Every theme push to a storefront goes through `scripts/release.sh` ([docs/releasing.md](docs/releasing.md)), which appends an entry under "Releases" after the push. Don't edit the entries by hand.

## Releases

## Switch toggles

Log every module switch (`rf_*`) toggled in a storefront's Theme Styles here, one row per toggle, in this format. From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through `scripts/release.sh` (SCOPE-3).

After a toggle, change `config.json` to match and commit it. Otherwise the next release stops on the difference (the release guard, ticket 15).

| Date | Channel | Switch | From | To | Who | Reason |
|---|---|---|---|---|---|---|
