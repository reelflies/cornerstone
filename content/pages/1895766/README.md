# Web Pages for ReelFlies_CA (channel 1895766)

The Policy pages, the Help page and the Brand pages that ReelFlies_CA needs before the Flip (ticket 22). Web Pages belong to one channel, so the live reelflies.ca pages don't carry over on their own. They live here as repo sources and reach the store only through the store-write helper ([store writes](../../../docs/store-writes.md)). `stencil bundle` doesn't zip `content/`, so none of this ships in the theme.

| File | What |
|---|---|
| `pages.json` | The channel, then one entry per page: the fields BigCommerce stores (`name`, `type`, `url`, `is_visible`, `sort_order`, `meta_description`, and `contact_fields` for the contact form), plus what stays in the repo: the body's `file`, where the path comes from (`path`), the `status` and `forShaun` |
| `shipping-returns.html` | Shipping & Returns, a Policy page: decision 2's free-shipping wording, the delivery options, and Cancellation, Claim and Return in CONTEXT.md's terms |
| `privacy-policy.html` | Privacy Policy, a Policy page: the policy live on reelflies.ca at `/privacy-policy/` (last updated June 2026), with the CASL sign-up text, the outside-Canada sentence (GEO-1 f, ticket 52) and decision 11's contact |
| `help.html` | Help, a new Help page: common ordering questions, pointing to Shipping & Returns and the hook size chart |
| `about-us.html` | About Us, a Brand page: the live About text without the privacy policy appended to it |
| `contact-us.html` | Contact Us, a Brand page: the contact form, the phone number and the address, with no email address (decision 11) |
| `newsletter.json` | The CASL newsletter wording, written once here. Ticket 50 renders it in the footer from lang strings, and ticket 24 uses it beside the checkout checkbox |

## Paths

Each page keeps the live reelflies.ca path, so old links keep working at the Flip: `/about-us/`, `/shipping-returns/`, `/contact-us/` and `/privacy-policy/` are channel 1's Web Pages 5, 2, 4 and 8 (read with `stencil start -c 1 ?debug=context`, 2026-10-06). `/help/` is new, so no old path needs a Redirect. A path that changes needs a row in refactor 09's Redirect map, and its entry says so (`path.kind`).

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
- On top of the format, the test checks ticket 22's criteria that the sources can meet: the free-shipping wording, the three CONTEXT.md terms, the promise line with no return window, the CASL wording and the outside-Canada sentence on the Privacy page, About without the privacy policy, Help's links, and Contact's phone number and address.

## Writing them to the store

Ticket 22's first PR writes nothing. Web Pages on 1895766 are lifted writes (decision 4), so the sync is the routine in [store writes](../../../docs/store-writes.md), from the main clone at `origin/master`:

```sh
node scripts/content/pages.mjs --changes ~/reelflies/store-snapshots/changes-22.json \
  --existing <the channel's GET /v3/content/pages?channel_id=1895766 read>    # PUT what exists, POST the rest
node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 22 --changes ~/reelflies/store-snapshots/changes-22.json
node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs --dry-run <plan file>
node ~/reelflies/theme/cornerstone/scripts/store/apply.mjs <plan file>
```

- `--existing` matches the channel's own pages by url and refuses a read that names any other channel. Without it every page is a create.
- `plan.mjs` reads a changes file only from the main clone, a worktree or `~/reelflies/store-snapshots/`.
- Drafts may go to prelaunch, which answers the public with 503. Every write gets a snapshot, a diff and a log row, shown on the next review page.

## Channel 1 (Option A)

Live reelflies.ca already has its privacy text on its own Web Page, `/privacy-policy/` (id 8), and an older copy appended to About Us (id 5). Before ticket 56's push puts the outside-Canada prompt on channel 1, the approved sentence goes into channel 1's `/privacy-policy/`. That write is Shaun's (ticket 03 item 7), and its sources don't live here: this folder is 1895766's only.
