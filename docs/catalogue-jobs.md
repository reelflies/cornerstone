# Catalogue jobs

Ticket 18's jobs put the catalogue into the shape the theme expects: Fly Sizes renamed to 1/0 … 6/0 and in hook order, no size preselected on a multi-size product, the ReelFlies brand on in-house products, white-ground thumbnails, and a description (alt text) on every product image. The catalogue is shared by every channel, so a catalogue write also changes live reelflies.ca and reelflies.com. That makes every write Shaun's: he approves each job's diff, and he applies it himself, at his own terminal (HANDOFF, "Rules for every session"; build pipeline decision 11).

**What keeps agents from this write** is the token, not the terminal. apply asks for a terminal, a pasted token and a typed sha256, but a pseudo-terminal can answer both prompts, so that check is a tripwire. The limit is that no token an agent can reach has Products: modify: the Keychain's read-only account can't write, and the writer account lacks the catalogue scopes (decision 11). Shaun makes a Products: modify token for each run and revokes it when the run ends.

The code is in `scripts/catalogue/`:

| Part | Files | Who runs it |
|---|---|---|
| The dry runs | `dry-run.mjs`, `jobs.mjs`, `csv.mjs`, `api-read.mjs`, `images.mjs`, `plans.mjs`, `report.mjs` | agents. GETs only: the export, the store API with the read-only token, and the public CDN for the photos. |
| Apply and restore | `apply.mjs`, `apply-rules.mjs`, `apply-tooling.mjs` (guarded: `scripts/catalogue/apply*`, with this guide and `scripts/catalogue/fixtures/`) | Shaun, at his terminal, with a token only he makes. Agents run only `--check`, which sends GETs. |

## The dry run

```sh
node scripts/catalogue/dry-run.mjs --api \
  --csv ~/reelflies/catalog/product_20260907_030303.csv \
  --sales ~/reelflies/report/data/product_metrics.csv \
  --out ~/reelflies/theme/plan/approvals
```

- `--api` reads every product with its options and images, the channel assignments, the brands and tree 1's categories, with the read-only token (`scripts/lib/store-token.mjs`) and a client that refuses anything but GET. The store answers 10 products a page when options are included, so the read takes about 230 requests. The read is kept as a snapshot in `~/reelflies/catalog/snapshots/`.
- `--csv` reads the product export. It has no option, value or brand ids, so it gives diffs but never a plan. With `--api` as well, each report shows both counts side by side.
- The photos' grounds are read from each image's 44 x 58 rendition on the public CDN, judged by its border (white, black or other), and cached in `~/reelflies/catalog/image-cache/`. `--images skip` leaves them unread.
- `--sales` ranks the re-export list for ticket 14. Only the `id` and `units_365` columns are read: per-product aggregates, nothing about customers.
- `--brand-copy <file>` gives ticket 14's page title and meta description for the ReelFlies brand. `--size-fixes <file>` gives Shaun's labels for sizes the job can't place (`{"4506": {"32": "4", "33": "6"}}`). `--signature-brand "<name>"` is the brand job's option B: once Shaun has made that brand, the dry run plans it on the Signature set, and plans ticket 14's page title and meta description on it rather than on the ReelFlies brand. `--brand-products <ids>` adds the other in-house products Shaun names (`101,102`) to the brand set; one that isn't Live, or isn't in the read, is listed and left out.
- **The brand's URL** comes from the store: the read keeps each brand's `custom_url`, and the brand pages print it. The ReelFlies brand's listing is at `/reelflies-2/`, which the store made from its name (not customized), not the `/brands/ReelFlies.html` that spec module 12 and tickets 36 and 48 name. No job changes a URL: setting `custom_url` would be a store-wide catalogue write, and isn't on the list below.
- Every line it prints goes through `release-redact.mjs` once the read token is in hand, its `STOP` line included. If `jpeg-js` (which the repo has only through lighthouse) is missing, it stops before reading a photo: run `npm ci`, or pass `--images skip`.

For each job it writes `18-<job>.md` and `18-<job>.csv` to `--out`, plus `18-catalogue-batch.md`, the page Shaun reads first, and `18-reexport-for-14.csv`. Each job with a change from an API read also gets a plan file in `~/reelflies/catalog/plans/`: the exact requests, each with the read it was planned against, and a digest. Its sha256 is on the batch page.

## What a plan may write

`apply-rules.mjs` holds the list. Only these PUTs, with no query:

| Write | Fields |
|---|---|
| `PUT /v3/catalog/products/<id>/options/<id>` | `display_name`; `option_values`, the whole list, every value by id with `label`, `sort_order` and `is_default` (BigCommerce may delete a value left out, so apply refuses a list whose ids aren't exactly the store's) |
| `PUT /v3/catalog/products/<id>` | `brand_id`, `categories` |
| `PUT /v3/catalog/products/<id>/images/<id>` | `is_thumbnail` (true only), `description` |
| `PUT /v3/catalog/brands/<id>` | `page_title`, `meta_description` |

Nothing else: no POST or DELETE, no variants, prices, inventory, categories or channels. So uploading ticket 14's re-exported photos (an image create) isn't built: when the files arrive, that one write is added here in its own PR, with `rf/safety`.

A plan names the store it was made for, and writes each object once. For an option it sends exactly the value ids its `before` read holds, gives each value its own `sort_order`, and never puts one value's label on another value id or two values under one label: a value id carries its variants' SKU, price and stock, so a label moved to another id would sell another variant under that size. (6-0 and 6/0 count as one label for this.) It makes at most one image per product the thumbnail, because a second would clear the first, and may only add categories, never drop one. A restore may write back what the snapshot read, empty values and any categories list included; a plan may not.

The diff names each option value by its id, in the order the store shows them, so a reorder, a rename and a relabel each read differently:

```text
product 3888, option 26910: order 6 #15476, 8 #15477, 4 #15478 -> 4 #15478, 6 #15476, 8 #15477
product 101, option 50: order 4 #11, 2 #12, 6-0 #13 -> 6/0 #13, 2 #12, 4 #11; value 13 "6-0" -> "6/0"
product 103, option 60: default none -> 2/0 #9
```

A request may carry `prior: { job, before }`: it is planned on the result of another job's plan. The single-size and multi-size default jobs are planned on the Fly Sizes job's result for the options both write, because both send an option's whole value list. Until the Fly Sizes plan is applied, the store reads as `prior.before`, and apply refuses the later plan, writing nothing; it stays valid as approved.

## Applying (Shaun)

From the main clone at `origin/master`, in his own terminal:

```sh
cd ~/reelflies/theme/cornerstone && git pull --ff-only origin master
node scripts/catalogue/apply.mjs <plan file> --product <id>              # the restore trial, once: one product
node scripts/catalogue/apply.mjs --restore <before-snapshot> --product <id>
node scripts/catalogue/apply.mjs <plan file>                             # the whole plan
```

In order, a run:

1. refuses without a terminal, and while `~/reelflies/store-snapshots/LOCKED` exists (the store helper's lock, [store-writes.md](store-writes.md)). It prints the release calendar's phase; from T-14 it also prints a warning, because the jobs were meant to run before the content and catalogue freeze. The warning doesn't stop the run: Shaun's typed sha256 does that.
2. reads the plan (only from `~/reelflies/catalog/plans/`), checks its digest and every request against the rules above, and prints the exact requests (all of them go to a file beside the snapshots)
3. refuses unless this checkout's store and catalogue tooling are byte-identical to `origin/master`'s (`apply-tooling.mjs`), and unless the plan names this store
4. asks for a token at a hidden prompt. Shaun makes it with Products: modify when he applies, and revokes it when the run ends; it is used for that run and never stored. Then it takes the `store-write` lock, so no store or catalogue write runs beside it.
5. reads every object the plan writes, fresh, 10 products a request. If any changed since the dry run, it refuses the whole plan and writes nothing: an agent runs the dry run again and the new diff comes back for approval. If the plan is planned on another job's plan that isn't applied yet, it refuses it the same way, and the plan stays valid. A request whose change the store already reads as planned (from an earlier, interrupted run of the same plan) is skipped.
6. prints the diff it derived from that read, never the plan's own copy, and asks Shaun to type the first 8 characters of the plan's sha256
7. writes the before-snapshot to `~/reelflies/catalog/snapshots/`, naming the store, then sends the requests in batches of 50. Each request gets an intent row in `~/reelflies/store-snapshots/log.jsonl` before it is sent (channel `store-wide`, mode `approved`, ticket 18) and a result row after its batch is read back. A 429 is waited out. Nothing more is sent after an answer that isn't a success (the store refused it, or it may have landed): what was sent is read back and logged, and the run stops. A request that doesn't read back as planned is logged as failed, and the run stops after its batch. If a re-read itself fails, each write it covered is logged as stopped. A rerun of the same plan skips what landed.
8. writes the after-snapshot, and prints the restore command and the same-day smoke tests.

**Restoring** runs the same steps from a before-snapshot (only from `~/reelflies/catalog/snapshots/`), the store check included: a snapshot taken on another store, or naming none, is refused. The go-ahead is the start of the snapshot's sha256. The snapshot must be one an apply wrote: `log.jsonl` must hold that apply's ticket-18 intent rows under the snapshot's sha256, those rows must name the plan the snapshot names, and the snapshot must hold every write they name. That plan must still be in `~/reelflies/catalog/plans/` or `superseded/` and send every request the snapshot holds, so a restore puts back only fields an approved plan wrote. Each object the apply sent goes back to what the snapshot read; one it never sent is listed and left alone. If someone changed any of the objects again since the apply, the whole restore is refused and nothing is sent: restore the other products one at a time with `--product`, and check the changed ones by hand. A thumbnail is restored by making the old thumbnail the thumbnail again.

**The restore trial** (ticket 18's criterion): apply the first plan to one product, restore it, and check it reads as it began. The plan stays valid, because the restore puts the product back where the plan expects it.

**The order.** Each plan is applied as approved, with the sha256 Shaun approved: no fresh dry run between jobs. Fly Sizes goes first; the single-size and multi-size defaults are planned on its result, so apply refuses them until it is applied. The other jobs write other objects or other fields of the same ones (the option names only the name, the category only the categories, the brand only the brand, thumbnails and alt text different fields of an image), so their order doesn't matter. The brand fields come once ticket 14's copy is in.

**Stale plans.** Before each apply an agent runs `--check` on the plan. Only a plan that `--check` reports stale (someone changed one of its objects since the dry run) is planned again, and its new diff and sha256 go back to Shaun for approval.

## Checking (agents)

```sh
node ~/reelflies/theme/cornerstone/scripts/catalogue/apply.mjs --check <plan file> [--product <id>]
```

GETs only, with the read-only token, from any checkout. It refuses a plan made for another store before it reads anything. It says how many requests already read as planned, how many aren't written yet, how many wait for the plan they are planned on, and which objects changed since the plan, and exits 1 only if any did. Agents run it before a plan goes on a review page, before each apply, and after Shaun applies one: that is the read-only smoke check.

## After each apply, the same day

- On reelflies.com and live reelflies.ca: a product page the run changed renders its sizes, and adds to the cart. Record it, dated, in a ticket 18 comment, beside Shaun's approval of the plan. (Ticket 18 names `research/18-catalogue-jobs/` for these records; the comments, the approval pages in `plan/approvals/18-*` and the snapshots in `~/reelflies/catalog/` hold them instead, a revisitable default.)
- Shaun revokes the Products: modify token.
- `--check` on the plan: every request reads as planned.
- After the Fly Sizes and multi-size default applies, an agent also reruns the dry run over the whole catalogue, because `--check` reads only the plan's own objects: `node scripts/catalogue/dry-run.mjs --api --jobs fly-sizes,default-sizes --images skip --out <a scratch folder>` (GETs only). For criterion 1 it records "renamed 0, reordered 0, multi-size defaults 0" in ticket 18, with 4506 (sizes 32 and 33) the only exception until criterion 2 is settled.
- The orchestrator opens a re-baseline epoch for the page kinds the job moved (build pipeline section 6.6).

## Tests

`npm run test:scripts` runs the catalogue tests with no token and no network. The apply tests use an in-memory catalogue (`scripts/catalogue/fixtures/catalogue-store.mjs`, guarded; the folder holds nothing else) that keeps the effect of each write, so a test applies a plan to one product, restores it and checks the product reads as it began. Each of apply's refusals before the token prompt (no terminal, `LOCKED`, the tooling, the store, for a plan and for a snapshot) and the typed go-ahead is tested through `prepareWrite` and `confirmSourceSha`. The dry run's tests read a small sample export in `scripts/catalogue/dry-run-fixtures/`, which stays open like the dry run. `RF_CATALOGUE_ROOT` moves the plans and snapshots, and works only under `node --test`.
