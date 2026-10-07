# Catalogue jobs

Ticket 18's jobs put the catalogue into the shape the theme expects: Fly Sizes renamed to 1/0 … 6/0 and in hook order, no size preselected on a multi-size product, the ReelFlies brand on in-house products, white-ground thumbnails, and a description (alt text) on every product image. The catalogue is shared by every channel, so a catalogue write also changes live reelflies.ca and reelflies.com. That makes every write Shaun's: he approves each job's diff, and he applies it himself, at his own terminal (HANDOFF, "Rules for every session"; build pipeline decision 11).

The code is in `scripts/catalogue/`:

| Part | Files | Who runs it |
|---|---|---|
| The dry runs | `dry-run.mjs`, `jobs.mjs`, `csv.mjs`, `api-read.mjs`, `images.mjs`, `plans.mjs`, `report.mjs` | agents. GETs only: the export, the store API with the read-only token, and the public CDN for the photos. |
| Apply and restore | `apply.mjs`, `apply-rules.mjs`, `apply-tooling.mjs` (guarded: `scripts/catalogue/apply*`) | Shaun, at his terminal. Agents run only `--check`, which sends GETs. |

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
- `--brand-copy <file>` gives ticket 14's page title and meta description for the ReelFlies brand. `--size-fixes <file>` gives Shaun's labels for sizes the job can't place (`{"4506": {"32": "4", "33": "6"}}`).

For each job it writes `18-<job>.md` and `18-<job>.csv` to `--out`, plus `18-catalogue-batch.md`, the page Shaun reads first, and `18-reexport-for-14.csv`. Each job with a change from an API read also gets a plan file in `~/reelflies/catalog/plans/`: the exact requests, each with the read it was planned against, and a digest. Its sha256 is on the batch page.

## What a plan may write

`apply-rules.mjs` holds the list. Only these PUTs, with no query:

| Write | Fields |
|---|---|
| `PUT /v3/catalog/products/<id>/options/<id>` | `display_name`; `option_values`, the whole list, every value by id with `label`, `sort_order` and `is_default` (BigCommerce may delete a value left out, so apply refuses a list whose ids aren't exactly the store's) |
| `PUT /v3/catalog/products/<id>` | `brand_id`, `categories` |
| `PUT /v3/catalog/products/<id>/images/<id>` | `is_thumbnail` (true only), `description` |
| `PUT /v3/catalog/brands/<id>` | `page_title`, `meta_description` |

Nothing else: no POST or DELETE, no variants, prices, inventory, categories or channels. A plan writes each object once. A restore may write back an empty value the snapshot read (an empty description, no brand); a plan may not.

## Applying (Shaun)

From the main clone at `origin/master`, in his own terminal:

```sh
cd ~/reelflies/theme/cornerstone && git pull --ff-only origin master
node scripts/catalogue/apply.mjs <plan file> --product <id>              # the restore trial, once: one product
node scripts/catalogue/apply.mjs --restore <before-snapshot> --product <id>
node scripts/catalogue/apply.mjs <plan file>                             # the whole plan
```

In order, a run:

1. refuses without a terminal, and while `~/reelflies/store-snapshots/LOCKED` exists (the store helper's lock, [store-writes.md](store-writes.md))
2. reads the plan (only from `~/reelflies/catalog/plans/`), checks its digest and every request, and prints the exact requests (all of them go to a file beside the snapshots)
3. refuses unless this checkout's store and catalogue tooling are byte-identical to `origin/master`'s (`apply-tooling.mjs`), and unless the plan was made for this store
4. asks for a token at a hidden prompt. Shaun makes it with Products: modify when he applies, and can revoke it afterwards; it is used for that run and never stored. Then it takes the `store-write` lock, so no store or catalogue write runs beside it.
5. reads every object the plan writes, fresh, 10 products a request. If any changed since the dry run, it refuses the whole plan and writes nothing: an agent runs the dry run again and the new diff comes back for approval. A request the store already reads as planned (from an earlier, interrupted run of the same plan) is skipped.
6. prints the diff it derived from that read, never the plan's own copy, and asks Shaun to type the first 8 characters of the plan's sha256
7. writes the before-snapshot to `~/reelflies/catalog/snapshots/`, then sends the requests in batches of 50. Each request gets an intent row in `~/reelflies/store-snapshots/log.jsonl` before it is sent (channel `store-wide`, mode `approved`, ticket 18) and a result row after its batch is read back. A 429 is waited out. Nothing more is sent after an answer that isn't a success (the store refused it, or it may have landed): what was sent is read back and logged, and the run stops. A request that doesn't read back as planned is logged as failed, and the run stops after its batch. If a re-read itself fails, each write it covered is logged as stopped. A rerun of the same plan skips what landed.
8. writes the after-snapshot, and prints the restore command and the same-day smoke tests.

**Restoring** runs the same steps from a before-snapshot (only from `~/reelflies/catalog/snapshots/`), and the go-ahead is the start of the snapshot's sha256. Each object goes back to what the snapshot read. An object someone changed again since the apply is refused, not overwritten. A thumbnail is restored by making the old thumbnail the thumbnail again.

**The restore trial** (ticket 18's criterion): apply the first plan to one product, restore it, and check it reads as it began. The plan stays valid, because the restore puts the product back where the plan expects it.

**The order,** each from a fresh dry run once the one before is applied: Fly Sizes, then default sizes and single-size defaults (they write the same options, so an older plan is refused as stale), then the option names and the category if chosen, then the brand, then thumbnails and alt text (the same images), then the brand fields once ticket 14's copy is in.

## Checking (agents)

```sh
node ~/reelflies/theme/cornerstone/scripts/catalogue/apply.mjs --check <plan file> [--product <id>]
```

GETs only, with the read-only token, from any checkout. It says how many requests already read as planned, how many aren't written yet, and which objects changed since the plan, and exits 1 if any did. Agents run it before a plan goes on a review page, and after Shaun applies one: that is the read-only smoke check.

## After each apply, the same day

- On reelflies.com and live reelflies.ca: a product page the run changed renders its sizes, and adds to the cart. Record it, dated, in ticket 18.
- `--check` on the plan: every request reads as planned.
- The orchestrator opens a re-baseline epoch for the page kinds the job moved (build pipeline section 6.6).

## Tests

`npm run test:scripts` runs the catalogue tests with no token and no network. The apply tests use an in-memory catalogue (`scripts/catalogue/fixtures/catalogue-store.mjs`) that keeps the effect of each write, so a test applies a plan to one product, restores it and checks the product reads as it began. `RF_CATALOGUE_ROOT` moves the plans and snapshots, and works only under `node --test`.
