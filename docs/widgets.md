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

Run everything from the main clone, `~/reelflies/theme/cornerstone`, on `master` at `origin/master`'s tip, because the store-write helper writes only from there.

1. **Dry run.**

   ```sh
   node scripts/widgets-sync.mjs --channel 1895766 --ticket 46
   ```

   - `--channel` is required and has no default, so channel 1 is only ever targeted on purpose. Today only ReelFlies_CA (1895766) is a target; ticket 53 adds channel 1, whose writes are Shaun's.
   - It reads the channel's widget templates, widgets and placements with the read-only token (GET only), and saves them to `~/reelflies/store-snapshots/1895766/<object>/<time>-widgets-sync.json`. An object that names any other channel stops the run.
   - It prints the diff against the repo: each object to create, update or leave, with each changed field.
   - It writes the requests to `~/reelflies/store-snapshots/changes/<time>-widgets-1895766-<ticket>.json`. Every request names `channel_id` 1895766. A create of a widget refers to the template created before it in the same plan, and the placement to the widget (`{"$created": n}`).
   - It stops, writing no changes file, when the repo records a uuid the channel doesn't have, or when the channel has an object of the same name that the repo doesn't record (run `--record` first, so nothing is made twice).
2. **Plan, review and apply** with the store-write helper, as its "Next:" line says:

   ```sh
   node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 46 --changes <changes file>
   node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs --dry-run <plan file>
   node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs <plan file>
   ```

   The helper checks the channel again on every request, response and re-read, and logs each write to `~/reelflies/store-snapshots/log.jsonl`, which the orchestrator mirrors into `RELEASES.md`.
3. **Record the uuids.**

   ```sh
   node scripts/widgets-sync.mjs --channel 1895766 --record
   ```

   It reads the channel again (GET only), finds each widget's template and widget by name and its placement by its widget and region, and writes their uuids into `channels/1895766.json`. Commit the file: it is the record of what the store holds, and the raw-HTML check reads it (`home-hero` requires the hero on the home page once its placement is recorded active).
4. **Run the dry run again.** It should print "in step with the repo: nothing to write".

## Options

| Option | What |
|---|---|
| `--widget <name>` | Only that widget (repeatable). |
| `--only content` | Templates and widgets, no placement. Ticket 53 makes the channel-1 widgets this way, and ticket 56 places them in the push session. |
| `--only placement` | Placements only, for widgets already recorded. |
| `--unpublish <name>` | Sets the widget's placement `"inactive"` in its channel file and plans only that status change. This is how a home section is switched off in the no-push window (R12), and the only widget write the release calendar allows from T-14 (ticket 57). Commit the channel file with the apply. |
| `--record` | Reads only, and writes the uuids into the channel files. |

To publish again, set the placement's `status` back to `"active"` in the channel file and sync.

## The hero (`widgets/home-lead`)

- **Placement:** `pages/home`, `home_below_menu`, `sort_order` 0. It is recorded `"inactive"` on 1895766 until ticket 27 makes the logo a `<div>`: with the stock logo `<h1>`, an active hero gives the home page two `<h1>`s, and the `home-one-h1` raw-HTML check fails every gate run. Once 27 has merged, set it `"active"` and sync.
- **Photo:** decision 4's Bass & Pan Fish stone banner, mirrored. Its path is a text field (HOME-2's fallback until ticket 07's probe 13 says whether a template can read an image-manager file name): `image_base` is the CDN base up to `/images/stencil`, and `image_path` the path after the size segment. The srcset is built from both at 320 to 1600 px wide.
  - Today `image_path` is the live category image `s/bass-panfish__24775.original.jpg`, so no upload is needed.
  - Before the Flip, when the category tree changes, put the frame in the Image Manager and set `image_path` to `image-manager/<file>`, so the hero doesn't depend on a category's image (revisitable).
- **Copy:** the H1 and subline are SEO-11's, with decision 14's figures ("nearly 2,000", "$0.75"), rechecked at the T-14 content freeze (HOME-4). The buttons link to `/dry-flies/` and `/species/` on 1895766.
- **Home title and meta description** are channel settings, not widget fields. The title is `content/settings/1895766/storefront-seo.json`, a changes file for the store-write helper. The meta description is a DRAFT until Shaun approves it, so it waits in `content/drafts/1895766/storefront-seo-meta.json`, which isn't a changes file: once he approves it, a PR moves it into one.
