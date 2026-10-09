# Widgets: home content as code

The home page's sections are Widgets API templates kept in this repo (ADR 0001), and synced to one channel at a time by `scripts/widgets-sync.mjs` (ticket 46). The first is the hero, `widgets/home-lead`, which ticket 47's three Fly Type cards share; ticket 47 adds the tiles (`widgets/link-tiles`), tickets 48 and 49 the bands, ticket 27 the shipping strip, and ticket 53 the channel-1 copies.

The sync never writes to the store itself. It reads the channel with GETs only and writes a changes file; the store-write helper (`scripts/store/`, W0-11, [store-writes.md](store-writes.md)) makes every write, with its snapshot, diff, channel check and log row.

## A widget's files

| Path | What |
|---|---|
| `widgets/<name>/template.html` | The template, uploaded as the widget template `rf-<name>`. It reads its `widget_configuration` at the top level and its query's result as `_.data`. It may include `widgets/_shared/` partials, which the sync pastes in place (a store template can't include partials). What the store gets is below. |
| `widgets/<name>/schema.json` | Its Page Builder schema: an array with one `tab`, holding sections of settings. |
| `widgets/<name>/query.graphql` | Optional: its `storefront_api_query`. |
| `widgets/<name>/channels/<channel>.json` | The widget on one channel: `channel_id`, its `configuration` (every schema setting's value there, and nothing else), its `placement` (`template_file`, `region`, `sort_order`, `status`) and the `uuids` the store gave its template, widget and placement (`null` until it makes them). A widget on several pages names `template_files`, a list, instead of `template_file`, and records `uuids.placements`, a uuid (or `null`) per template file: one placement each, with the same region, order and status (the strip, below). |
| `widgets/<name>/fixtures/` | Its fixture renders and element shots (W0-9, [scripts/qa/README.md](../scripts/qa/README.md#widgets)). Never synced. Each shot fixture's baselines are made for every variation the gates render, ReelFlies CA and ReelFlies CA channel 1 (`QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs widget-screens -g 'widget <name>' --update-snapshots` for each), because a `QA_CHANNEL=1` run shoots every widget too; `scripts/qa/widget-baselines.test.mjs` fails CI when one is missing. |

Styles go in the theme's ReelFlies layer, with `rf-` classes and no inline CSS (build pipeline, decision 6), so every channel's copy looks the same. They go in the partial your ticket's own slot line in `assets/scss/reelflies/_index.scss` names (ticket 25's scaffold): uncomment the line and add the partial beside it, under the slot's name, whatever your widgets are called (CUSTOMIZATIONS.md, "Slots for parallel tickets"). 46's line, `@import "home-lead"; // 46 home hero`, imports `_home-lead.scss`; 47's, `@import "home-tiles"; // 47 home category cards and tiles`, imports `_home-tiles.scss`, which holds both its widgets' styles: the cards in `home-lead` and the tiles in `link-tiles`. A slot holds one import (`scripts/qa/scaffold.test.mjs`), so when your slot already imports another partial of your ticket's, import the widget's partial at the end of that one, as ticket 27's `_header.scss` imports `_shipping-strip.scss`.

Words and links are widget fields, never typed into the template, so a channel's copy can differ: channel 1 carries tree-1 paths (ticket 53).

### What the store gets

- **The store renders widget templates with Handlebars 3.** It saves each one with `"template_engine": "handlebars_v3"`, and the Widgets API takes no engine: its reference lists `template_engine` in responses only (create takes `name`, `template`, `schema`, `storefront_api_query` and `channel_id`; update adds `create_new_version`). So the fixture renderer renders widgets with Handlebars 3 too, Paper's own build of it (`scripts/widgets/engine.mjs`), and render tests and widget shots render as the store does. Theme pages and partials stay on `config.json`'s `handlebars_v4`.
  - **`../` inside `{{#if}}` or `{{#unless}}` goes one level further up than in v4,** because Handlebars 3 counts the block as a level: with `{ heading: "Hi", show: true }`, `{{#if show}}{{../heading}}{{/if}}` renders `Hi` in v3 and nothing in v4. Inside `{{#each}}`, `{{#if name}}{{../label}}{{/if}}` reads the item's `label` in v3 and the outer one in v4. Write for v3; a fixture render shows it.
  - **Handlebars 4's own forms don't parse:** `{{#*inline}}`, decorators (`{{* …}}`) and `{{#> partial}}` blocks. The sync refuses a template Handlebars 3 can't parse, naming the file and its line.
  - **The sync stops** when a recorded template on the channel reports any other engine, so a change on the store's side shows up in the next dry run or `--verify`. `--unpublish` still goes ahead.
- **Comments are emptied.** Each Handlebars comment reaches the store as `{{!}}`, keeping its `~` flags (`emptyComments` in `scripts/widgets/source.mjs`).
  - Handlebars' own parser finds the comments and only their text changes, so the store copy renders as the file does. The sync checks this by parsing the result again.
  - It refuses a template whose comments Handlebars places wrongly; a U+2028 or U+2029 character can cause that.
  - The store refused the hero's first upload, whose comment named `<width>`, `<path>` and `<channel>`, as "not valid HTML". Most likely it reads comment text when it checks a template's HTML.
  - Because every comment is emptied before anything else reads the template, a note may name tags or partials, in a template or a `_shared` partial.
- **`_shared` partials are pasted in place** (`scripts/widgets/paste.mjs`), because a store template can't include partials and Handlebars 3 can't define inline ones. Each call, `{{> _shared/<partial> key=value …}}`, is replaced by the partial's body:
  - The body is printed from Handlebars 3's parse of the partial file, as it renders on its own: its standalone lines and `~` already applied, its comments gone, and empty `{{!}}` comments before each block tag and round the body, so no whitespace rule changes where it lands.
  - Each hash argument is replaced by its value where the body reads it, because Handlebars renders a partial with the hash laid over the caller's context, and the pasted body sits in that context. A string or number read as `{{key}}` becomes its text, escaped as `{{key}}` would escape it.
  - A call alone on its line: Handlebars drops the line break after it and keeps its indent once (Paper compiles with `preventIndent`). The copy keeps that line break and drops the one the partial file ends with, so end a partial with markup and a line break, or call it inside a line (`<li>{{> _shared/card product=node}}</li>`).
  - Refused, naming the file:
    - `../` in a partial or in a hash value
    - a hash argument read inside a block other than `{{#if}}` or `{{#unless}}`, or used as a block (`{{#key}}`)
    - a hash argument with a helper's name, or a block param in the partial with a hash argument's name or a name a hash value reads
    - `this` in a partial called with hash arguments
    - a name in the partial that is a block param where it is called (a partial can't see the caller's block params; its pasted body would)
    - a literal hash argument read with a path after it (`{{key.x}}`), or printed when it isn't a string or a number
    - a context argument (`{{> _shared/x foo}}`), a dynamic partial, or a partial inside a partial
    - an escaped `\{{`, and a partial Handlebars 3 can't parse
  - An error in a partial names the partial's file, with its own line numbers.
  - The sync checks each paste on Handlebars 3's parse trees: the printed body parses to the partial's own tree, and the copy to the template's tree with each call's output in its place. The cases are in `scripts/widgets/paste.test.mjs`.
- **Void elements close.** Write `<img … />`, `<br />` and the like, as BigCommerce's own examples do, because the store doesn't document its check. The test reads each tag as the HTML tokenizer does: `/>` counts only after a quote, whitespace or the bare tag name, so `<img src=x/>` and `<br/ >` aren't closed.
- **The tests check it.** `scripts/widgets/source.test.mjs` checks every widget. Each needs at least one fixture. Its store copy keeps no comment text, closes every void element, parses with Handlebars 3, and renders as its files do with each fixture, both rendered with the store's engine.
- **The store adds `"_": { "id": <the widget's uuid> }`** to each widget's `widget_configuration`, which a template reads as `{{_.id}}`. The sync leaves it out when it compares, and refuses a schema setting whose id is `_`.

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

   It reads the channel again (GET only), finds each widget's template and widget by name and each placement by its widget, template file and region, and writes their uuids into `channels/1895766.json`. A widget on several template files gets one uuid per file in `uuids.placements`, and the run prints "placements N of M recorded", naming any template file with none yet.
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
| `--unpublish <name>` | Sets the widget's placement `"inactive"` in its channel file, in the worktree, and plans only that status change (one request for every placement of the widget on the channel that is still active, recorded in the channel file or not, so a template file listed before its placement is written, or one placed but not recorded, never stops the off switch). This is how a home section is switched off in the no-push window (R12), and the only widget write the release calendar allows from T-14 (ticket 57). Apply it, `--verify`, then open the PR with the channel file. |
| `--record` | Reads only, and writes the uuids into the channel files. |
| `--verify` | Reads only, and exits 1 unless the channel holds what the repo records. Takes no `--ticket`. |

To publish again, set the placement's `status` back to `"active"` in the channel file, in a worktree, and sync.

## The hero (`widgets/home-lead`)

- **Placement:** `pages/home`, `home_below_menu`, `sort_order` 0, `"active"` on 1895766 since checkpoint 02 (2026-10-08 23:04 UTC, plan `00ab227c`), once the release of `ec525dbe` carried 27 and `_home-lead.scss` (ReelFlies (3), theme `3ed5e690`). The stock logo was the home page's `<h1>` (`header.html:19-22`) until ticket 27 made it a `<div>`, so an active hero on a theme older than 27 gives the page two.
- **How it went active** (checkpoint 02, 2026-10-08), in the order it needed:
  1. Ticket 27 merged (#53), so the stock logo was a `<div>` and home had no `<h1>` while the hero was inactive, which `home-one-h1` allows.
  2. The checkpoint-02 release of `ec525dbe` put 27 and `_home-lead.scss` live on 1895766. Before that, the prelaunch home page would have shown two `<h1>`s, or a hero without its styles, and so would Page Builder's preview.
  3. The placement was set `"active"` in a worktree, then synced, planned (`00ab227c`), applied and `--verify`'d, with the strip and the tiles in the same step; #62 carries the channel files.
  4. Checked: the hero is 300px tall at 1280 on a render of 1895766's live data (CD-1), the page has one `<h1>`, and every widget region measures 0px in the page shots. The desktop home shot still moved by a 1px re-flow inside the footer, because the shots hid widgets only at the screenshot, after the page had laid them out; #64 hides them from the page's first layout (`HIDDEN_FROM_LOAD`), and the baselines pass unchanged. A later widget write that moves a page shot points at the harness first, not at a re-baseline. The raw-HTML check passes with the hero active (`home-hero`, `home-one-h1`). Page Builder's preview is left to Shaun, on review-02.
  - A branch older than 27 now has two `<h1>`s on home, the stock logo's and the hero's, and `home-one-h1` fails it. It rebases onto `master`, which it has to do before merging anyway.
- **Photo:** decision 4's Bass & Pan Fish stone banner, mirrored. Its path is a text field (HOME-2's fallback until ticket 07's probe 13 says whether a template can read an image-manager file name): `image_base` is the CDN base up to `/images/stencil`, and `image_path` the path after the size segment. The srcset is built from both at 320 to 1600 px wide.
  - Today `image_path` is the live category image `s/bass-panfish__24775.original.jpg`, so no upload is needed.
  - Before the Flip, when the category tree changes, put the frame in the Image Manager and set `image_path` to `image-manager/<file>`, so the hero doesn't depend on a category's image (revisitable). Ticket 57's checks carry it, with refactor 13's tree change as the trigger.
- **Copy:** the H1 and subline are SEO-11's, with decision 14's figures ("nearly 2,000", "$0.75"), rechecked at the T-14 content freeze (HOME-4; ticket 57), in the subline and the meta description alike.
- **Buttons:** `/dry-flies/` and `/species/` on 1895766. Both are tree-4 pages: tree 4 has no categories until refactor 13 (`research/07-prelaunch-probes.md`), and `/species/` is ticket 34's hub. Until then both links answer 404 on 1895766, so a link check on the home page (ticket 54's link-200 spec) expects that until refactor 13 and ticket 34.
- **Home title and meta description** are channel settings, not widget fields. The title is `content/settings/1895766/storefront-seo.json`, a changes file for the store-write helper. The meta description is a DRAFT until Shaun approves it, so it waits in `content/drafts/1895766/storefront-seo-meta.json`, which isn't a changes file: once he approves it, a PR moves it into one.

## The shipping strip (`widgets/shipping-strip`)

Ticket 27's widget (spec module 2, O04): the shipping promise under the header on every page, and nothing else. There is no link to ReelFlies.com: that is ticket 52's prompt and ticket 50's footer.

- **Placement:** `header_bottom--global`, `sort_order` 0, `"active"` on 1895766, **once per template file** that renders the header: 41 placements, listed in `template_files`.
  - **Why one per template file:** a placement in a global region still names a template file. BigCommerce's docs say it then shows on every page that has the region, but the store's own region answer (`renderedRegionsByPageType`, which `stencil start` pastes in) gave the first placement, on `pages/home`, to HOME alone: cart, brand, sign-in, search and sitemap came back empty (#62's rf/skeptic). A second placement on `pages/cart` (2026-10-09, plan `78d5173a`) put the strip on the cart and left the home page with one copy, so a global region acts per template file in practice. The rest followed in plan `62d9a411`.
  - **The list** is every theme template that renders `layout/base`, except `pages/unavailable/hibernation` (a closed store makes no shipping promise) and the stored payment-method pages (`pages/account/add-payment-method`, `edit-payment-method`, `payment-methods`), which the API refuses: "422 template_file: unsupported template file", as its documented list suggests. `shipping-strip.test.mjs` compares the list with `templates/pages/`, so **a ticket that adds a custom template** (`pages/custom/<kind>/<file>`, such as ticket 35's chart page) adds it to `template_files` and syncs it.
  - **The check:** the raw-HTML assertion `strip-every-page` fails a page with two strips, and a run where the strip is on some pinned pages but not all. It judges the pages as served, so an unpublished strip (on none) passes. On a local `stencil start` it leaves out the 404 page: stencil-cli has no page type for `pages/errors/*` and never fills its regions, though the store takes its placement. On the prelaunch host (`QA_BASE_URL`, Shaun's cookie batch) the 404 page counts like every other, and that run closes ticket 27's every-page criterion.
    - **A write plan that stops part-way** (a refused request, as the trial plan `78d5173a` did) leaves the strip on some template files only, and then this check fails on every branch and in the release until the plan is finished. Finish or undo a stopped strip plan before anything else runs the gates.
    - **What it can't see:** a strip the channel file records active but that shows on no page, because it was unpublished or deleted outside the sync (in Page Builder, say), passes, as an unpublish does. `widgets-sync.mjs --verify` is what catches that; no gate runs it, so run it before a checkpoint's review page (ticket 27's "while recorded active" wording, met this way on purpose: build pipeline 6.6 keeps the gates off the channel files).
    - **Custom templates:** `stencil start` maps no `pages/custom/*` file to a page type either, so it fills none of the regions of a pinned page the store gives a custom template. Such a pin fails `strip-every-page` as the 404 page would locally: leave it out of local runs as the 404 page is (`localNotFound` in `strip-every-page.mjs`, by its pin's key), and let the host run count it. With only the local `custom-layouts.json` mapping, the stock template's placement shows the strip, so the comparison in `shipping-strip.test.mjs` is the only local check that the custom file is listed.
  - **Unpublish** sets every placement of the strip inactive in one plan (`--unpublish shipping-strip`), recorded or not.
  - **A placement the channel file doesn't record** (a second one on a listed template file, or one on a file the list leaves out) stops the sync and fails `--verify`, which names it: delete it in the control panel (the store-write helper can't delete), or list its template file and `--record`.
- **Where the theme puts it:** `components/reelflies/header.html` renders `header_bottom--global` after `</header>`, inside `<div data-rf-strip-region role="region" aria-label="Shipping and prices">` (the name is the lang string `reelflies.header.strip_label`). So the widget carries no landmark of its own, it isn't content outside a landmark (axe `region`), and on phones it scrolls away under the 56px sticky bar. The raw-HTML assertion `strip-region` holds the landmark on every page, and fails a strip (`data-rf-strip`) that holds a link.
- **Styles:** `assets/scss/reelflies/_shipping-strip.scss`, imported at the end of `_header.scss` (ticket 27's one slot in `_index.scss`, above), so it lines up with the header row through `$rf-header-max`: the long line from 801px, the short one on phones. The truck is drawn in the template, not taken from the theme's icon sheet, so the strip is whole on any channel's theme.
- **Copy:** two fields, `long_text` and `short_text`: "Prices in Canadian dollars. Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included." and "Free standard shipping on fly orders over $60". The words are ticket 13's decision 2, as ticket 27's owner-decisions comment has them; Shaun added the reference's "Prices in Canadian dollars." lead on review-02 (written in plan `78d5173a`). A change is a field edit in `channels/1895766.json` (and the fixture and schema default, which `shipping-strip.test.mjs` holds to it), not a template change.
  - From 801px to about 840px the long line wraps; `text-wrap: balance` makes it two even lines rather than one word alone on the second.
  - The $60 is copy. A widget can't read `rf_ship_free_threshold` (ticket 39's setting), so a new threshold changes both.
  - The $99 courier offer isn't mentioned (ticket 13: open; interim, it doesn't carry over).
- **The first write** was the orchestrator's after wave 2 (2026-10-08; the routine above, with `--ticket 27 --widget shipping-strip`): plan `6a53f3f4` created the template `rf-shipping-strip`, its widget and its placement, inactive; `--record` and `--verify` followed, and PR #60 carried the channel file.
- **It went active with the hero** (plan `62c84e87`, #62), after the checkpoint-02 release put ticket 27 live: before that, the prelaunch theme had no landmark round the region and no strip styles, so the store would have shown the bare text under the old header.
- **Channel 1:** ticket 53 makes its copy with `--only content`, and ticket 56 places it in the push session. Its copy needs the same template files, one placement each, every one a channel-1 write for Shaun's approval: channel 1's own global widgets are Page Builder layouts with an empty `template_file`, which the API can't make. Channel 1 already has a widget of its own in `header_bottom--global` (an announcement bar from the live theme), which renders inside the same landmark on channel-1 gate runs; replacing it is ticket 53's.
- **Checks:** `scripts/qa/render/widgets/shipping-strip.test.mjs` (the fields, no link, no `<use>` of the icon sheet, the landmark on its fixture page), its element shots in both gated variations (`widget-screens.spec.mjs`), and `shipping-strip-screens.spec.mjs` (one line at a time, scrolling away under the phone bar, axe), all on its fixture page with the theme's header round it (`"chrome": true`).

## The cards (in `widgets/home-lead`)

Ticket 47's three big Fly Type cards: Dry Flies, Nymphs and Streamers, right after the hero in the same template (HOME-2), so they share its placement and go active with it. Each is `widgets/_shared/type-card.html`, pasted in by the sync.

- **Markup:** each card is one `<a>` holding the photo (`alt=""`), the label (CD-2: "On the surface", "Below the surface", "Stripped and swung"), the Fly Type name as an `<h2>` (no section heading sits between the hero's H1 and the cards, so the outline skips no level; SEO-8 asked for h3), the count when the query returns one, and the call to action as a `<span>`.
- **Fields:** per card `card<n>_label`, `_name`, `_url`, `_cta`, `_banner`, `_frame` and `_focus`; shared `cards_label` (the list's name for screen readers), `card_count_suffix` ("patterns"), and the files' own sizes, `card_banner_width` and `_height` (1600x700) and `card_frame_width` and `_height` (1600x2000). The CDN base is the hero's `image_base`.
- **Photos** (SEO-8, HOME-1, CD-6): real `<img>` elements with a srcset at 400w to 1600w, sizes, width and height, eager and with no `fetchpriority` (the hero's is the page's only one).
  - **Interim** (ticket 14, option d): each card's own category banner, `i/dry-flies__36885`, `n/nymphs-sub-surface__11277` and `l/streamers-buggers__88399` (`.original.jpg`), cropped by CSS: 16:10 on phones, square from 801px. `card<n>_focus` (a select, 0% to 100% in steps of 5) is where the crop sits, from the left: Dry 75%, Nymphs 5%, Streamers 10%, the reference's art direction. It becomes a class, `rf-type-card__img--x<n>`, never inline CSS.
  - **How they're served differs from the ticket's words** (revisitable): the ticket asks for a srcset from `/images/stencil/{w}w/image-manager/<file>` and for the phones' 16:10 crops through `<picture>` media sources. The cards instead take the live category banners as they are and crop them with `object-fit: cover` at every width, so phones have no source of their own. The art direction is the same: route (d)'s crop spec is "where each card's flies sit", and phones use 16:10 crops of the full banner, "so they need no new file" (ticket 14, lines 16 and 119). The cost: a square desktop card downloads the whole 1600x700 banner, 100–171 KB at 1600w, where a 700x700 file would be smaller.
  - **Before the Flip, move the banners to the Image Manager** (revisitable), as for the hero's frame: they are tree-1 category images, so refactor 13's tree change or the Flip could change or drop them, and the cards' photos would break with no check pointing at them. Put the three files in the Image Manager and set `card<n>_banner` to `image-manager/<file>`. Ticket 57's checks carry it, with refactor 13's tree change as the trigger, beside the hero's.
  - **sizes** gives the width the banner is drawn at, not the card's: cropped by `object-fit: cover`, a 1600x700 banner is drawn 2.29 times as wide as its box is tall, so a 347px square card at 1280 draws it about 794px wide, and a 2x screen takes the 1600w file (CD-2's "about a 1.08x upscale at 2x"). The ticket's `33vw` would have picked the 1200w file there, a 1.46x upscale.
  - **Final** (HOME-1): when ticket 14's vertical 1600x2000 stone frames arrive, put each in the Image Manager and set `card<n>_frame` to `image-manager/<file>`. A `<picture>` source then serves the frame from 801px, the card takes the 4:5 shape there, and phones keep the 16:10 banner. If none arrive, the square crops stay.
  - The cards use the three Fly Type banners and no other photo; the hero's is the Bass & Pan Fish frame (decision 4). Ticket 49's left-third crop of the Dry banner is the one allowed repeat, a section or more away from the Dry card, and carries `data-rf-photo-repeat` (`home-photo-once`). Ticket 29's menu pane banners are their categories' images, which for the Fly Types are these same banners, in the closed desktop menu; `home-photo-once` leaves out every `data-rf-menu-banner` inside a `div[data-rf-menu-pane]`, whatever it shows (with its `<picture>` if it has one), and counts one anywhere else. If a tree-4 pane ever shows the hero's frame (a category image too), it goes uncounted the same way: wave R1 checks the panes' images.
- **Count** (HOME-4): "N patterns" shows only when the widget's storefront query returns a product count for the card's link. No field holds a typed number. The template reads `_.data.site.card1` to `card3`, each a route's node. **The widget has no query yet:** ReelFlies_CA has no tree-4 categories until refactor 13, so no route would answer, and the store's handling of an empty mapped variable is untested. Once tree 4 exists, add `widgets/home-lead/query.graphql` and the schema's hidden mapping in one PR (revisitable):

  ```graphql
  query HomeLeadCounts($card1Path: String!, $card2Path: String!, $card3Path: String!) {
    site {
      card1: route(path: $card1Path) { node { ... on Category { products { collectionInfo { totalItems } } } } }
      card2: route(path: $card2Path) { node { ... on Category { products { collectionInfo { totalItems } } } } }
      card3: route(path: $card3Path) { node { ... on Category { products { collectionInfo { totalItems } } } } }
    }
  }
  ```

  The mapping is a `hidden` element with one `graphQl` setting whose `typeMeta.mappings` read `card1_url` to `card3_url` as `String!`. Check then whether the count includes subcategories' products (a parent with none of its own would show nothing, which HOME-4 allows), and that a count of 1,000 or more reads well (the template prints the number as the store gives it).
- **Scrim** (CD-6): neutral #1C1D1F at 0.8 behind every line of the text block, fading to clear over the 48px above the text (32px on phones), so the photo shows above it. CD-6's fixed 0 at 42% of the card would leave the label over the bare photo on a square crop, whose text block is nearly half its height (about 3:1 in the first measurement). `home-widgets-screens.spec.mjs` reads the lightest pixel behind each line.
  - **On phones the text block is most of the card** (revisitable; Shaun judges it from the 375 screens on the review page, with and without counts). At 375 it is 165px of a 204px card without a count: the 0.8 band covers about 65% of the card, the fade the next 32px, and the top 39px are clear. With a count it is 190px of 204px, and only the top 14px are clear. So the phone cards read darker than the reference's, whose labels are hard to read over the bright stone.
- **The card grows to fit its text** and is never cut off, as the hero: it keeps its photo's shape (16:10 on phones, square or 4:5 from 801px) unless the text needs more height, such as a count at 320px (the Dry and Nymphs cards go from 170px to 188px), a name that wraps (channel 1's tree-1 names, ticket 53) or text-only zoom. The shape is a spacer in the card's one grid cell, and the photo fills the card. On desktop the three cards in a row stay one height. `home-widgets-screens.spec.mjs` checks that the text block stays inside the card at 320, 375, 801, 1024 and 1280, with counts and with a two-line name.
- **Links:** `/dry-flies/`, `/nymphs/` and `/streamers/`, the approved tree's paths (`plan/design/src/store-data.json`, `menu`, until refactor 06's `new-tree.json`). They answer 404 on 1895766 until refactor 13 builds tree 4; ticket 54's link check expects that until then.

## The tiles (`widgets/link-tiles`)

Ticket 47's row of six bordered tiles (R5, CD-11, UX-14), so with the three cards all six Fly Types sit in the first two desktop screens (HOME-3).

- **Placement:** `pages/home`, `home_below_top_products`, `sort_order` 10, the first in that region (build pipeline 6.5). Nothing renders between the cards and the tiles: the stock carousel is off (46), and so are the featured, most popular and new products strips (below). On the served page, `home-nothing-between` fails anything else that lands there: a Page Builder widget in `home_below_carousel` or `home_below_featured_products`, one placed before the tiles in their region or after the hero in its, or a store shipping message (`home.html` prints them between the two). So on 1895766, place other home widgets after `sort_order` 10 in `home_below_top_products`, and leave the two regions between empty.
- **`"active"` on 1895766 since checkpoint 02** (plan `63892ba4`), with the hero, once a release carried 27 and 47. It was first written inactive (plan `c89f5701`, PR #60), because tiles placed before a release carries `_home-tiles.scss` would show unstyled on the prelaunch home page and in Page Builder's preview.
- **Tiles,** in order: Eggs & Worms (`/eggs-worms/`), Warmwater Flies (`/warmwater-flies/`), Saltwater Flies (`/saltwater-flies/`), Flies by Species (`/species/`, ticket 34's hub), Fly Selections & Assortments (`/fly-selections-assortments/`) and Fly Gear (`/fly-gear/`), each `tile<n>_name`, `_url` and `_photo`.
- **Photos:** the reference's picks, each product's default image (white, 1024x683, 3:2): 5101 Glo Bug Pink, 5300 Monster Streamer, 3857 Crazy Charlie Pink, 5490 Green Machine, 5445 the 30-nymph Selection and 4398 the fly box, as `products/<id>/<image id>/<file>` paths after the size segment. Lazy, with a srcset at 160w to 640w, sizes, width and height, and `alt=""`. They switch to stone crops only if a frame is free under the one-slot rule, and never the bass frame on the Warmwater tile (ticket 13, item 4).
- **Layout:** two columns on phones, three from 801px and six from 1261px, never a sideways scroller (UX-3, HOME-3). A white photo in a 3:2 box (`object-fit: contain`) with a 1px #DDE2DC border and a 12px radius, then the name with a CSS chevron. Product cards elsewhere stay borderless.

## The stock home strips

`homepage_featured_products_count`, `homepage_top_products_count` and `homepage_new_products_count` are 0 ("Disable") in `config.json`'s base settings, so every variation, ticket 53's channel-1 one included, inherits them and the store sends `home.html` no products for its stock strips. Best sellers come from ticket 48's widget. `home-no-stock-strips` checks the page.
