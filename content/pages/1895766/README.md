# Web Pages for ReelFlies_CA (channel 1895766)

The Policy pages, the Help page and the Brand pages that ReelFlies_CA needs before the Flip (ticket 22), and the CASL newsletter wording's source of record. Web Pages belong to one channel, so the live reelflies.ca pages don't carry over on their own. They live here as repo sources and reach the store only through the store-write helper ([store writes](../../../docs/store-writes.md)). `stencil bundle` doesn't zip `content/`, so none of this ships in the theme.

| File | What |
|---|---|
| `pages.json` | The channel, then one entry per page: the fields BigCommerce stores (`name`, `type`, `url`, `is_visible`, `sort_order`, `meta_description`, and `contact_fields` for the contact form), plus what stays in the repo: the body's `file`, where the path comes from (`path`), the `status` and `forShaun` |
| `shipping-returns.html` | Shipping & Returns, a Policy page: decision 2's free-shipping wording, the delivery options, and Cancellation, Claim and Return in CONTEXT.md's terms |
| `privacy-policy.html` | Privacy Policy, a Policy page: the policy live on reelflies.ca at `/privacy-policy/` (last updated June 2026), with the CASL sign-up text, the outside-Canada sentence (GEO-1 f, ticket 52) and decision 11's contact |
| `help.html` | Help, a new Help page: common ordering questions, pointing to Shipping & Returns and the hook size chart |
| `about-us.html` | About Us, a Brand page: condensed from the live About text, without the privacy policy appended to it. The claims and customer mentions ticket 14 holds are left out, and `forShaun` lists every live passage left out or shortened |
| `contact-us.html` | Contact Us, a Brand page: the contact form, the phone number and the address, with no email address (decision 11) |
| `coupon-codes.html` | Coupon Codes: the coupon terms live at `/coupon-codes/`, carried over so the path keeps working at the Flip (a revisitable default; Shaun may Redirect or drop it instead) |
| `newsletter.json` | **The source of record for the CASL newsletter wording,** for the whole theme. See below. |

## The CASL newsletter wording: `newsletter.json`

`newsletter.json` holds the newsletter's two sentences (`line`, the line above the box, and `consent`, below it) and their approval. It is the one source of record for that wording, for the whole theme, not one channel's Web Page: it sits in this folder only because the Privacy page quotes it, and `pages.test.mjs` checks that quote word for word.

- **Ticket 50** copies the two sentences into its `reelflies.footer` lang strings, and **ticket 24** uses `consent` beside the checkout checkbox. Each adds a test that reads this file and fails if its own copy differs, so a change here can't leave a stale copy in `lang/en.json` or the checkout settings.
- To change the wording, change it here first, then the copies their tests point to.

## Paths

Each page keeps the live reelflies.ca path, so old links keep working at the Flip: `/about-us/`, `/shipping-returns/`, `/contact-us/`, `/privacy-policy/` and `/coupon-codes/` are channel 1's Web Pages 5, 2, 4, 8 and 7 (read with `stencil start -c 1 ?debug=context`, 2026-10-06). `/help/` is new, so no old path needs a Redirect. A path that changes needs a row in refactor 09's Redirect map, and its entry says so (`path.kind`).

## DRAFT until Shaun approves

Shaun writes or approves every page's text, the CASL wording and the privacy sentence (ticket 22's HITL line). Until he does:

- the entry's `status` is `draft`, and its body opens with the banner `<p class="rf-draft" data-rf-draft="page">`, so the page reads DRAFT on prelaunch
- every passage that waits for his figures or his confirmation is `<mark data-rf-draft="<key>">`, and `forShaun` has an entry with that key and the question. Entries without a key are questions about the page as a whole.

`node scripts/content/pages.mjs` lists every question. To approve a page, fill in or confirm each marked passage, remove the banner and the markers, empty `forShaun`, and set `"status": "approved"` with `"approved": { "by": "Shaun", "date": "YYYY-MM-DD" }`.

## The rules

`scripts/content/pages.test.mjs` checks them in CI (`npm run test:scripts`), and `node scripts/content/pages.mjs` prints any problem:

- The folder and `channel_id` are 1895766. Paths are lower-case and unique, and a live path equals the page's url.
- A body is a Web Page body: balanced tags, no `<h1>` (the page template renders the name as the h1), no scripts, styles, frames or forms, and no `style=` or `on…=` attributes.
- Links go to these pages, `/fly-hook-size-chart/` (ticket 35), `/blog/`, an `https://` address or `tel:+…`.
- No email address and no `mailto:` anywhere, until the role address exists (decision 11).
- No "fly-only" (UX-12), and no `hasMerchantReturnPolicy` (decision 10).
- A draft has its banner, and its markers and `forShaun` keys match. An approved page has neither.
- On top of the format, the test checks ticket 22's criteria that the sources can meet: the free-shipping wording, the three CONTEXT.md terms, the promise line with no return window, the CASL wording and the outside-Canada sentence on the Privacy page, About without the privacy policy or ticket 14's held claims, Help's links and its Assortment wording, and Contact's phone number and address.
- Every rule has a test that fails without it.

## Writing them to the store

Ticket 22's first PR writes nothing. Web Pages on 1895766 are lifted writes (decision 4), so the sync is the routine in [store writes](../../../docs/store-writes.md), from the main clone at `origin/master`.

**First, tell the orchestrator.** With `is_visible: true`, every page joins Cornerstone's `{{#each pages}}` lists, in the header navigation (`templates/components/common/navigation-menu.html:17`, as `hide_content_navigation` is false) and the footer (`templates/components/common/footer.html:28`). So the write changes the header and footer of every page on 1895766, which makes it a re-baseline epoch (`plan/build-pipeline.md` 6.6). The orchestrator picks the time and opens the epoch PR after it.

```sh
# 1. Read the channel's pages. A plan of creates snapshots 1895766's whole page list (GETs only); it is never applied.
node scripts/content/pages.mjs --changes ~/reelflies/store-snapshots/changes-22-read.json    # warns: no --existing
node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 22 --changes ~/reelflies/store-snapshots/changes-22-read.json
# 2. PUT the pages the channel already has, POST the rest, from that snapshot file.
node scripts/content/pages.mjs --changes ~/reelflies/store-snapshots/changes-22.json \
  --existing ~/reelflies/store-snapshots/1895766/pages/<time>-plan.json
# 3. Plan, dry run, write.
node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 22 --changes ~/reelflies/store-snapshots/changes-22.json
node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs --dry-run <plan file>
node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs <plan file>
```

- `--existing` takes the snapshot file step 1 wrote (it uses only its `GET /v3/content/pages?channel_id=1895766` read), the API's `{ "data": [...] }` answer, or the bare array. It matches the channel's own pages by url. It refuses any other shape, a snapshot of another channel or object, and any page that names another channel, rather than read them as a channel with no pages.
- Without `--existing` every page is a create, and the command warns: a page 1895766 already has at the same url would be made twice. `plan.mjs` flags a create only when a page of the same name exists.
- `plan.mjs` reads a changes file only from the main clone, a worktree or `~/reelflies/store-snapshots/`.
- Drafts may go to prelaunch, which answers the public with 503. Every write gets a snapshot, a diff and a log row, shown on the next review page.

## Channel 1 (Option A)

Live reelflies.ca already has its privacy text on its own Web Page, `/privacy-policy/` (id 8), and an older copy appended to About Us (id 5). Before ticket 56's push puts the outside-Canada prompt on channel 1, the approved sentence goes into channel 1's `/privacy-policy/`. Its sources don't live here: this folder is 1895766's only.

- **The agent's part:** once Shaun approves the sentence, the agent reads channel 1's `/privacy-policy/` (id 8) and About Us (id 5) GET-only, drafts the diff for each (the sentence added to id 8; the older February 17, 2026 copy taken off id 5), and puts both in Shaun's approval batch before ticket 56.
- **Shaun's part:** the write itself (ticket 03 item 7). The store-write helper writes only to 1895766.
