# Script Manager scripts

Scripts that ReelFlies adds to a storefront through Script Manager, kept here so they are reviewed, tested and rebuilt like theme code. They load from the store, not from the theme, so a change needs no theme push. Nothing in this folder is bundled into the theme.

| Script | Source | Changes file (what W0-11 plans from) | Ticket |
|---|---|---|---|
| web-vitals field data: LCP, INP and CLS from real visitors, sent to GA4 as events | `web-vitals/rf-web-vitals.js`, with web-vitals 6.2.2 vendored in `web-vitals/vendor/` (Apache-2.0) | `1895766/web-vitals.json` | 23 |

## Rebuilding

The changes file is generated. Never edit it by hand:

```sh
node scripts/store-scripts/build.mjs           # rewrites store-scripts/1895766/web-vitals.json
node scripts/store-scripts/build.mjs --check   # exits 1 if it is stale; the tests run this too
```

`scripts/store-scripts/web-vitals.test.mjs` checks the glue, the vendored file's hash, the one-tag inline script, its size (4 KB gzip at most, inside the 150 KB third-party budget), and that the changes file passes W0-11's checks as a lifted write. `web-vitals-browser.test.mjs` runs the built script in Chromium and checks that LCP, INP and CLS reach a stand-in `gtag`. It is skipped where Playwright's Chromium isn't installed, as in CI.

## Re-vendoring web-vitals

1. `npm pack web-vitals@<version>` in a scratch folder, and check its integrity against `npm view web-vitals@<version> dist.integrity`.
2. Copy `package/dist/web-vitals.iife.js` without its last line (the `//# sourceMappingURL` comment) to `web-vitals/vendor/web-vitals-<version>.iife.js`, and `package/LICENSE` over `web-vitals/vendor/LICENSE`. Delete the old file.
3. Update `VENDOR` in `scripts/store-scripts/build.mjs`: the version, the file, its sha256 (`shasum -a 256`) and the npm integrity. Check the release notes for a change to the callbacks or the metric's fields.
4. Rebuild, run both tests, and plan an update of the script (below).

## Creating or updating it on ReelFlies_CA

Through the store-write helper only ([docs/store-writes.md](../docs/store-writes.md)). Scripts are a lifted write on 1895766 (decision 4), and the helper creates them disabled and never enables one:

```sh
node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 23 --changes ~/reelflies/theme/cornerstone/store-scripts/1895766/web-vitals.json
node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs --dry-run <plan>
node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs <plan>
```

- The Scripts API lists only the scripts the calling API account created, so the writer account sees its own scripts and nothing added in the control panel. An update is a `PUT /v3/content/scripts/<uuid>` with the uuid the create returned, recorded in `log.jsonl`.
- **Enabling it is Shaun's,** in the control panel (Storefront > Script Manager), once GA4 open point (b) has its filter. The checklist is `research/23-analytics-and-integrations.md`.
