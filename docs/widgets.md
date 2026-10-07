# Widgets: home content as code

The home page's sections are Widgets API templates kept in this repo (ADR 0001), and synced to one channel at a time by `scripts/widgets-sync.mjs` (ticket 46). The first is the hero, `widgets/home-lead`. Tickets 47–49 add the cards, tiles and bands, ticket 27 the shipping strip, and ticket 53 the channel-1 copies.

The sync never writes to the store itself. It reads the channel with GETs only and writes a changes file; the store-write helper (`scripts/store/`, W0-11, [store-writes.md](store-writes.md)) makes every write, with its snapshot, diff, channel check and log row.

## A widget's files

| Path | What |
|---|---|
| `widgets/<name>/template.html` | The template, uploaded as the widget template `rf-<name>`. It reads its `widget_configuration` at the top level and its query's result as `_.data`. It may include `widgets/_shared/` partials, which the sync inlines (a store template can't include partials). |
| `widgets/<name>/schema.json` | Its Page Builder schema: an array with one `tab`, holding sections of settings. |
| `widgets/<name>/query.graphql` | Optional: its `storefront_api_query`. |
| `widgets/<name>/channels/<channel>.json` | The widget on one channel: `channel_id`, its `configuration` (every schema setting's value there, and nothing else), its `placement` (`template_file`, `region`, `sort_order`, `status`) and the `uuids` the store gave its template, widget and placement (`null` until it makes them). |
| `widgets/<name>/fixtures/` | Its fixture renders and element shots (W0-9, [scripts/qa/README.md](../scripts/qa/README.md#widgets)). Never synced. |

Styles go in the theme's ReelFlies layer, `assets/scss/reelflies/_<name>.scss`, with `rf-` classes and no inline CSS (build pipeline, decision 6), so every channel's copy looks the same.

Words and links are widget fields, never typed into the template, so a channel's copy can differ: channel 1 carries tree-1 paths (ticket 53).

## The routine

The sync runs in a worktree, and the store-write helper from the main clone:

- **The sync in a worktree** branched from `origin/master` (`~/reelflies/theme/worktrees/<branch>`, as for any ticket). `--record` and `--unpublish` rewrite the tracked `widgets/<name>/channels/<channel>.json`, and a PR carries that change. Run in the main clone, they would leave `master` dirty, which merges and a real release refuse, and nothing is ever committed on `master` itself. The sync reads with the read-only token and writes its changes files under `~/reelflies/store-snapshots/`, so it runs from any checkout.
- **`plan.mjs` and `apply.mjs` by the main clone's full path,** on `master` at `origin/master`'s tip, because the helper writes only with `origin/master`'s rules ([store-writes.md](store-writes.md)). They take the changes file the sync wrote.

1. **Dry run,** in the worktree.

   ```sh
   node scripts/widgets-sync.mjs --channel 1895766 --ticket 46
   ```

   - `--channel` is required and has no default, so channel 1 is only ever targeted on purpose. Today only ReelFlies_CA (1895766) is a target; ticket 53 adds channel 1, whose writes are Shaun's.
   - It reads the channel's widget templates, widgets and placements with the read-only token (GET only), and saves them to `~/reelflies/store-snapshots/1895766/<object>/<time>-widgets-sync.json`. An object that names any other channel stops the run.
   - It prints the diff against the repo: each object to create, update or leave, with each changed field.
   - It writes the requests to `~/reelflies/store-snapshots/changes/<time>-widgets-1895766-<ticket>.json`. Every request names `channel_id` 1895766. A create of a widget refers to the template created before it in the same plan, and the placement to the widget (`{"$created": n}`).
   - It stops, writing no changes file, when the repo records a uuid the channel doesn't have, or when the channel has an object of the same name that the repo doesn't record (run `--record` first, so nothing is made twice).
2. **Plan, review and apply** with the store-write helper, from the main clone, as the dry run's "Next:" line says:

   ```sh
   node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 46 --changes <changes file>
   node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs --dry-run <plan file>
   node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs <plan file>
   ```

   The helper checks the channel again on every request, response and re-read, and logs each write to `~/reelflies/store-snapshots/log.jsonl`, which the orchestrator mirrors into `RELEASES.md`.
3. **Record the uuids,** in the worktree, after an apply that created anything.

   ```sh
   node scripts/widgets-sync.mjs --channel 1895766 --record
   ```

   It reads the channel again (GET only), finds each widget's template and widget by name and its placement by its widget and region, and writes their uuids into `channels/1895766.json`.
4. **Verify,** in the worktree.

   ```sh
   node scripts/widgets-sync.mjs --channel 1895766 --verify
   ```

   It reads the channel again (GET only) and exits 1, printing the diff and writing nothing, unless the channel holds exactly what the repo records: every template, widget, configuration and placement, with each placement's status. So it is the check that an apply took, a placement made active or an unpublish included.
5. **Open a PR with the channel files,** naming the apply's log rows. The files are the record of what the store holds.

The raw-HTML gates never read the channel files. They check a widget's markup wherever a page has it (`home-hero`, `home-one-h1`; [scripts/qa/README.md](../scripts/qa/README.md#raw-html-raw-htmlmjs)), so an apply never fails the gates on `master` and every open branch while its PR waits for review (build pipeline, section 6.6). `--verify` is where the store is compared with the repo.

## Options

| Option | What |
|---|---|
| `--widget <name>` | Only that widget (repeatable). |
| `--only content` | Templates and widgets, no placement. Ticket 53 makes the channel-1 widgets this way, and ticket 56 places them in the push session. |
| `--only placement` | Placements only, for widgets already recorded. |
| `--unpublish <name>` | Sets the widget's placement `"inactive"` in its channel file, in the worktree, and plans only that status change. This is how a home section is switched off in the no-push window (R12), and the only widget write the release calendar allows from T-14 (ticket 57). Apply it, `--verify`, then open the PR with the channel file. |
| `--record` | Reads only, and writes the uuids into the channel files. |
| `--verify` | Reads only, and exits 1 unless the channel holds what the repo records. Takes no `--ticket`. |

To publish again, set the placement's `status` back to `"active"` in the channel file, in a worktree, and sync.

## The hero (`widgets/home-lead`)

- **Placement:** `pages/home`, `home_below_menu`, `sort_order` 0, recorded `"inactive"` on 1895766 for now. The stock logo is the home page's `<h1>` (`header.html:19-22`) until ticket 27 makes it a `<div>`, so an active hero would give the page two.
- **When it goes active,** in this order:
  1. Ticket 27 merges. Its branch has no `<h1>` on home while the hero is inactive, which `home-one-h1` allows.
  2. A release carrying 27 and `_home-lead.scss` is live on 1895766 (a checkpoint release, or one mid-wave). Before that, the prelaunch home page would show two `<h1>`s, or a hero without its styles, and so would Page Builder's preview.
  3. Set the placement `"active"` in a worktree, then sync, plan, apply and `--verify`, and open the PR with the channel file (the routine above).
  4. Check, and note on the review page: the hero is 300px tall or less at 1280 on the prelaunch home page and in Page Builder's preview (CD-1), its region adds 0px to the page shots (W0-5; if it doesn't, add `[data-layout-id]` to `HIDDEN` in `pages.mjs`), and the raw-HTML check passes on `master` (`home-hero` and `home-one-h1` now check the hero).
  - A branch older than 27 then has two `<h1>`s on home, the stock logo's and the hero's, and `home-one-h1` fails it. It rebases onto `master`, which it has to do before merging anyway.
- **Photo:** decision 4's Bass & Pan Fish stone banner, mirrored. Its path is a text field (HOME-2's fallback until ticket 07's probe 13 says whether a template can read an image-manager file name): `image_base` is the CDN base up to `/images/stencil`, and `image_path` the path after the size segment. The srcset is built from both at 320 to 1600 px wide.
  - Today `image_path` is the live category image `s/bass-panfish__24775.original.jpg`, so no upload is needed.
  - Before the Flip, when the category tree changes, put the frame in the Image Manager and set `image_path` to `image-manager/<file>`, so the hero doesn't depend on a category's image (revisitable). Ticket 57's checks carry it, with refactor 13's tree change as the trigger.
- **Copy:** the H1 and subline are SEO-11's, with decision 14's figures ("nearly 2,000", "$0.75"), rechecked at the T-14 content freeze (HOME-4; ticket 57), in the subline and the meta description alike.
- **Buttons:** `/dry-flies/` and `/species/` on 1895766. Both are tree-4 pages: tree 4 has no categories until refactor 13 (`research/07-prelaunch-probes.md`), and `/species/` is ticket 34's hub. Until then both links answer 404 on 1895766, so a link check on the home page (ticket 54's link-200 spec) expects that until refactor 13 and ticket 34.
- **Home title and meta description** are channel settings, not widget fields. The title is `content/settings/1895766/storefront-seo.json`, a changes file for the store-write helper. The meta description is a DRAFT until Shaun approves it, so it waits in `content/drafts/1895766/storefront-seo-meta.json`, which isn't a changes file: once he approves it, a PR moves it into one.
