# Store writes

Every write to the store through its API goes through the store-write helper, `scripts/store/` (W0-11 in `plan/build-pipeline.md`). A store API token can't be limited to one channel, so the helper holds the limits itself: it writes only to ReelFlies_CA (1895766), only to the endpoints on its allowlist, and only after a snapshot (GET), a diff and a log row.

Under Shaun's grant of 2026-10-06 (HANDOFF, "Rules for every session"), agents may make these writes on 1895766 without asking. Each is shown on the next review page. Store-wide settings and promotions are Shaun's, through [approved mode](#approved-mode-shauns-store-wide-writes).

The helper is new, so **its first real write runs dry first,** as each risky first does (Shaun's answers of 2026-10-06):

1. `plan.mjs`, which sends GETs only
2. `apply.mjs --dry-run`, which runs every check of apply's own with the writer token and sends nothing
3. `apply.mjs`, for real

All three outputs go on the next review page. Nothing waits for Shaun. Until that first write, the helper has run only on the fixtures in its tests.

## The routine

```sh
node scripts/store/plan.mjs --ticket 46 --changes widgets/home-lead/changes.json             # GETs only
node scripts/store/apply.mjs --dry-run ~/reelflies/store-snapshots/plans/<time>-46.json       # every check, nothing sent
node scripts/store/apply.mjs ~/reelflies/store-snapshots/plans/<time>-46.json                 # the writes
```

1. **Write the changes file:** a JSON array of requests, or `{"requests": [...]}`. Each request is `{"method": "POST" or "PUT", "path": "/v3/…", "query": {...}, "body": ...}`.
2. **Plan.** `plan.mjs` checks every request, takes the snapshot with GETs only, and writes the plan file, then prints:
   - the diff
   - the proof for each settings write
   - the snapshot files
   - the plan file and its sha256
3. **Review the diff.** Put it in the PR body or the ticket comment.
4. **Apply.** `apply.mjs` takes a fresh snapshot and refuses if anything changed since the plan. It derives the diff again from that read, prints it, then sends exactly the plan's requests, in order, and re-reads each object it wrote. `--dry-run` stops after the diff, having sent and logged nothing.

**Run them from the main clone at `origin/master`,** by their full path (`node ~/reelflies/theme/cornerstone/scripts/store/…`). The permission rules pre-approve only that copy ([permissions.md](permissions.md)). And only `origin/master`'s rules write:

- Before the writer token is read, `scripts/store/tooling.mjs` fetches `origin/master`. It refuses unless every file under `scripts/store/` (committed or not, tracked or not), every module the commands import from outside it, and `scripts/release-calendar.json` are byte-identical to `origin/master`'s, naming each file that differs. `merge.sh` holds merges to its own tooling the same way.
- So a stale worktree, or a ticket branch with its own allowlist or sync script, can't write. Pull first: `git -C ~/reelflies/theme/cornerstone pull --ff-only origin master`.
- `apply --approved` checks the same before it asks for a token.
- `plan.mjs` with the read-only token sends GETs only, so it runs from any checkout. A plan that reads template associations takes the writer token, so it is checked too.

One apply runs at a time: it holds the `store-write` lock (`scripts/lib/lock.mjs`) from its first read to its last log row. A second apply refuses, naming the holder.

A create may take the uuid of a template or widget made earlier in the same plan, so a widget and its placement go in one plan. The value is `{"$created": <index>}`, where indexes count from 0:

```json
[
  { "method": "POST", "path": "/v3/content/widget-templates", "body": { "channel_id": 1895766, "name": "rf-home-lead", "template": "…" } },
  { "method": "POST", "path": "/v3/content/widgets", "body": { "channel_id": 1895766, "name": "Home lead", "widget_template_uuid": { "$created": 0 }, "widget_configuration": {} } },
  { "method": "POST", "path": "/v3/content/placements", "body": { "channel_id": 1895766, "widget_uuid": { "$created": 1 }, "template_file": "pages/home", "region": "home_below_menu", "status": "inactive" } }
]
```

Only `widget_template_uuid` (from a widget template create) and `widget_uuid` (from a widget create) take a reference.

## What may be written

The list is `scripts/store/allowlist.mjs`. Anything not on it is refused.

| Writes | Endpoints | Rules |
|---|---|---|
| Widget templates, widgets, placements | `POST /v3/content/{widget-templates,widgets,placements}`, `PUT …/<uuid>` | From T-14, only unpublishing: a placement `PUT` with only `"status": "inactive"` (ticket 57) |
| Web Pages | `POST /v3/content/pages` (an object or an array), `PUT /v3/content/pages/<id>` | |
| Script Manager scripts | `POST /v3/content/scripts`, `PUT /v3/content/scripts/<uuid>` | Created with `"enabled": false`. An update never enables one, and never touches a script that is enabled on the store. |
| Custom template associations | `PUT /v3/storefront/custom-template-associations` (an array) | `entity_type` is product, category, brand or page |
| Channel settings | `PUT /v3/settings/<path>?channel_id=1895766` for `inventory`, `storefront/category`, `storefront/search`, `storefront/product`, `storefront/security`, `storefront/seo`, `storefront/robotstxt`, `store/profile`, `logo` | Only after ticket 21's three-part test (below). `product_filtering_enabled`, `store_address_type` and `store_country` are global-only, so they are always refused. |

The never list is checked first, in both modes:

- Customers
- Orders
- the catalogue (products, categories, brands, options, price lists, inventory adjustments, catalogue settings)
- themes and channels (activation, deletion, uploads, channel status)
- the storefront's status
- checkout, carts and payments
- promotions, except in approved mode

`DELETE` isn't on the list yet: no ticket needs one, and a `DELETE` carries no `channel_id` to check. Add it, with a channel proved from the snapshot, when a ticket does.

The custom template association reads need the Themes scope, which only the writer account has (W0-12). So a plan that touches associations reads them with the writer token, still GET only.

## The channel check

- Every widget, template, placement, page and script body carries `"channel_id": 1895766`, as a number, on each item of an array body. Without it, BigCommerce puts the object on the store's first channel, which is live reelflies.ca.
- A settings write carries `channel_id=1895766` in its query and nowhere else. Without it, the write changes the global value.
- A body that names any other channel, anywhere (`channel_id`, `channel_ids`, `channels`), is refused.
- A response or a re-read that names any other channel stops the run:
  - Before a write (in a plan's or an apply's snapshot), nothing has been written yet.
  - After a write, the helper also writes `LOCKED` (below).
- An updated object must already belong to 1895766: its snapshot read must say so.

## Settings: ticket 21's three-part test

A settings write is lifted only when all three hold (build pipeline, section 5):

1. The endpoint takes `channel_id`.
2. A GET with `channel_id=1895766` shows an override field.
3. After the write, the global value and channels 1 and 1855224 read back unchanged.

**Parts 1 and 2 are proved by reads, before anything is written.** `plan.mjs` proves them and records the proof in the plan. `apply.mjs` proves them again from its own fresh reads, and refuses a plan that carries no proof.

- **Part 1:** the read with `channel_id=1895766` answers with a data object that isn't the global read's. An identical answer could mean the endpoint ignores `channel_id`, so it proves nothing.
- **Part 2:** for each key written, the channel read shows the field:
  - `null` means the channel inherits the global value, and the field takes an override.
  - A value means the channel already overrides it.
  - A key the channel read doesn't show is refused, and so is a key the global read lacks.
  - An empty channel read (`{}`) proves part 1 but no key, so on such an endpoint the write goes in Shaun's batch. This is revisitable once ticket 07's probe 10 shows what the store returns.

**Part 3 is checked after every settings write that was sent,** whatever it answered, even none: a `PUT` that times out may still have landed. The helper reads 1895766, the global value and channels 1 and 1855224, each on its own and each GET tried up to 3 times.

- **If any of them changed,** it:
  1. puts back the snapshot's values at once:
     - first 1895766's whole read: BigCommerce resets a channel's override only when every field is sent, with `null` where the channel inherited. Its `PUT` is the kind that just leaked, so it goes before the live channels' restore.
     - then the changed keys of the global value, and the whole read of each live channel that changed
  2. reads all four again, to check the restore held
  3. stops, and writes `~/reelflies/store-snapshots/LOCKED`
- **If any of them still can't be read,** part 3 is unproved. It stops with a `stopped` result row and writes `LOCKED`. A scope it couldn't read is never written blind.
- **If the write failed and part 3 held** (the store refused it, say), the run stops as `failed`, with no lock.

Restoring is itself a store-wide write, but it only puts back values it read.

## LOCKED

`~/reelflies/store-snapshots/LOCKED` is written when:

- part 3 failed, or couldn't be read after a settings write
- a write's response, or its re-read, named another channel
- a script read back enabled after a write

It records:

- the reason, the plan, the ticket and the request
- what changed, and any scope that couldn't be read
- each restore and whether it held

While the file exists, every `apply` refuses, approved mode included, and `plan.mjs` warns. **Only Shaun removes the file,** once he has checked the store.

**The review page puts the failure first.** The orchestrator checks for `LOCKED` before each checkpoint and puts its reason, and whether the restore held, at the top of the checkpoint notes' "For Shaun" section. The review page (W0-10) doesn't read the file itself yet; that is a W0-10 follow-up.

## Snapshots, plans and the log

Everything is outside git, so an abandoned PR can't lose the record of a real store write:

| What | Where |
|---|---|
| Snapshots | `~/reelflies/store-snapshots/<channel>/<object>/<time>-<label>.json`. `plan`, `before-<plan sha>` and `after-<plan sha>`, one file per object. Approved writes go under `store-wide/`. |
| Plans | `~/reelflies/store-snapshots/plans/<time>-<ticket>.json`, or `--out` |
| The log | `~/reelflies/store-snapshots/log.jsonl` |

**The plan file** holds:

- the exact requests
- the snapshot's sha256, and each read's
- the proofs and the diff
- a digest over all of it

`apply` refuses a plan whose digest doesn't match, which catches a plan edited after `plan.mjs` made it. Anyone could recompute a digest, so `apply` trusts nothing else in the file either:

- It checks every request again, takes its own snapshot, and proves every setting again from its own reads.
- It derives the diff, the list of writes and the proofs again from that snapshot, and refuses a plan whose own copies differ. So the diff a reviewer read can't hide a write.
- It prints only the diff it derived, never the file's.
- The plan's ticket must be a ticket name (`46`, `W0-11`), because it labels the log rows. Nothing can prove it is the right one.

**The log** gets an intent row before each request, written to disk before the request is sent, and a result row after it.

- Each row holds the date, channel, object, id, action, snapshot sha256, ticket and operator, then the mode, the plan's sha256 and the request's index, method and path.
- A result row adds the HTTP status, the outcome (`ok`, `failed` or `stopped`), the re-read's sha256 and a message.
- A restore after a failed part 3 logs its own rows, with action `restore` and the scope it put back as the channel.

The operator is `RF_OPERATOR`, or `<user> on <branch>`.

**The orchestrator mirrors new rows** into the "Store writes" section of `RELEASES.md`, through each release-log PR:

```sh
node scripts/store/log.mjs --since 2026-10-06   # the table's rows, one per request
```

The root `.gitattributes` sets `RELEASES.md merge=union`, so rebasing a log branch keeps both sides' rows.

## The release calendar

Plan and apply both read `scripts/release-calendar.json` through `scripts/lib/release-calendar.mjs` (W0-13), each on its own day. From T-14, and after the Flip, they refuse:

- new widget templates, widgets and placements
- every widget content edit

Unpublishing a widget is still allowed: a placement `PUT` with only `"status": "inactive"` (and its `channel_id`).

**From the Flip (T-0),** 1895766 is live reelflies.ca, so every other lifted write is refused too: pages, scripts, associations and settings. Writes to the live .ca store are Shaun's (HANDOFF), so they stay refused until he says otherwise (ticket 58). This default is revisitable. Before the Flip, pages, scripts, associations and settings follow their own rules. Shaun's approved writes aren't limited by the calendar.

## Tokens

`scripts/lib/store-token.mjs` reads the environment first, then the macOS Keychain (decision 2):

| Token | Environment | Keychain item (account `reelflies`) | Used by |
|---|---|---|---|
| Read-only | `RF_BC_READ_TOKEN`, then `RF_BC_API_TOKEN` (the name the release guard uses: W0-12 makes it the same token) | `reelflies-bc-read` | `plan.mjs`; the release guard, once the release lane points it here |
| Writer | `RF_BC_WRITE_TOKEN` | `reelflies-bc-write` | `apply.mjs`, and `plan.mjs` for template association reads. The loader refuses it to any script outside `scripts/store/`, and to a checkout whose store tooling isn't `origin/master`'s. |

- **Shaun adds each item in his own terminal.** `security add-generic-password -a reelflies -s reelflies-bc-write -w` prompts for the token. Never paste one in a chat or a file.
- **The loader runs `security find-generic-password` itself.** Agents never run it by hand, and the drafted permission rules deny it once Shaun turns them on.
- **Nothing is printed with a token in it.** Output goes through `release-redact.mjs`.
- **The store hash** comes from `config.stencil.json`'s store URL, through stencil-cli, or from `RF_BC_STORE_HASH`. `apply` refuses a plan made for another store.

## Approved mode: Shaun's store-wide writes

Store-wide settings and promotions also reach .com and channel 1, so they are Shaun's (decision 11). He approves the plan on a review page, then applies it himself:

```sh
node scripts/store/plan.mjs --ticket 21 --changes store-wide.json --approved   # an agent may prepare it
node scripts/store/apply.mjs --approved <plan file>                             # Shaun, at his terminal
```

- **The plan:**
  - covers `PUT /v3/settings/<path>` with no `channel_id` (the settings above, plus `search/filters`), and `POST /v3/promotions` or `PUT /v3/promotions/<id>`
  - reads the global value and channels 1, 1855224 and 1895766
  - shows all four in the diff
- **It runs only at a terminal,** in this order:
  1. It prints the exact requests: method, path, query and body.
  2. It asks Shaun to paste a token at a hidden prompt. The token is used for that run and never stored. He creates it with Products, Marketing and Information & Settings: modify, and can revoke it afterwards.
  3. It takes the fresh snapshot and prints the diff it derived from it.
  4. It asks him to type the first 8 characters of the plan's sha256 as his go-ahead. A wrong answer stops it, and isn't repeated back.

  An agent's shell isn't a terminal, so an agent can't run approved mode (as with `release.sh`).
- **It keeps the snapshot, the log and the re-reads.** Part 3 is reported, not enforced, because the write is meant to reach .com and channel 1.
- **It ends with the same-day smoke tests** for .com, channel 1 and 1895766.
- **Each mode refuses the other's plans:**
  - A plain `apply` refuses an approved plan.
  - `--approved` refuses a lifted one.

## Testing

`npm run test:scripts` runs the helper's tests with no token and no network. They answer from `scripts/store/fixtures/`.

**The fixtures aren't recordings yet.** They are shaped on BigCommerce's documented responses, because no store API token exists. Recording them waits for W0-12's read-only token and the first dry `plan.mjs` on 1895766. Its snapshot files then replace `settings-inventory.json` and `widgets.json` with the store's real answers. The settings proof matters most: it depends on the store answering `null` for an inherited field (ticket 07's probe 10).

**The test seams fail closed:**

- `RF_STORE_ROOT` moves the snapshots, plans and log, and `RF_STORE_FIXTURES` swaps the network for a route file. Both work only under `node --test`, and a real run refuses them.
- Under `node --test` the commands refuse the network unless a route file is given, and the token loader never reads the real Keychain. A test gives a token variable, or a stand-in for `security`.
- `RF_LOCK_ROOT` moves the store-write lock, as it does the other locks.
- The tests that run the commands as far as the writer token run them from a scratch clone whose origin is a local bare repo (`fixtures/checkout.mjs`), so the tooling check never reaches GitHub.
