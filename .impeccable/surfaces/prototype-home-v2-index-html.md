---
version: 1
slug: "prototype-home-v2-index-html"
primary_target: "prototype/home-v2/index.html"
related_targets: ["prototype/home/index.html"]
---

# Home page, v2 (warmed world)

## Scope

A fresh build of the ReelFlies home page on the warmed Streamside Stone world. The brand chart (claude.ai Design System artifact "ReelFlies") is the source of truth for tokens, type, components and voice. Visitor mode: **Persuade**. Built code-led as a standalone prototype in `prototype/home-v2/`. Each region maps to a Stencil component or Page Builder region. v1 in `prototype/home/` stays for comparison.

## Audience, job, action

Same as v1. The audience is anglers on a phone first and Trade second. The job is to find flies by what they are, what they catch or what's hatching, then add several sizes fast. The action is + Add with the size strip on real best sellers on the first screen, plus search.

## What changed from v1, and why

The owner found v1 "a little clinical". The hatch rows read as broken because only the in-season rows were open.

- **Grounds and photos.** The grounds move from cool grey to warm limestone and shale. The stand-in slate photos carry a warm grade until the commissioned shoot replaces them.
- **Mega menu.** A full mega menu replaces the plain "Shop flies" list. It is Cavio-inspired, built from original code. It has:
  - a fly-type rail with subcategories and a photo plate;
  - a species panel;
  - a drill-down drawer on phones.
- **Hatch chart.**
  - Every hatch row is a native disclosure, and the whole row is the target.
  - Each closed row shows thumbnails of the flies inside it and a count.
  - The current month is lit as a band of warm light.
- **Moss band.** A moss species band lays out the flies for the species under the pointer.
- **The tier's hand.** It appears as the tray's bin label, the "Now" mark, one margin note and the sign-off.

## Direction contract

THESIS: Flies laid out on a riverside stone in low, warm light, picked up and added a fly at a time. It refuses the river-lifestyle hero over tiles, and the cool product-on-white grid.

OWN-WORLD:
- **Grounds.** Warm limestone is the working ground. Wet shale carries the hero, the Signature band and the footer, and moss carries the species band.
- **Products.** Product photos sit on paper, as shot.
- **Copper** is for buying only. The halo blue marks water and season.
- **Type.** Archivo comes in three cuts. Kalam is the tier's hand, at most once per region.
- **Light marks state.**

STORY: A first-time angler sees real flies on warm stone, priced per fly, and understands that nearly 2,000 patterns are reachable by what a fly is, what it catches, or what's hatching. They add sizes without leaving the page. A regular restocks best sellers straight off the stone, or opens this month's hatch and takes the flies that match it. Below the fold come the fly types, the hatch chart and hook scale, the species on moss, the house pattern, the selections, and the family shop in Tillsonburg. Trade buyers find Wholesale in the navigation and a trade-account line in the shop story.

FIRST VIEWPORT:
- **Desktop.**
  - A shale utility strip.
  - A sticky limestone header: logo, mega navigation, search, account and box.
  - The hero stone with the H1, the lead and the two named ways in.
  - Six best sellers laid on the stone under a hand-lettered bin label.
- **Phone.** The header has the menu, logo and box, with search full width. Below it come the H1, the ways in as swipe rows, and cards two-up.
- **Both.** The order line is pinned at the foot.

FORM: Streamside Stone, warmed. It is position 6 on the first grounded list; the owner locked it over the re-roll's Hatch Chart (position 3), which joins below the fold as an information band. It is carried from v1 and revised after the owner's "a little clinical" and the approved warm brand chart. seed:72da4e2941f02151.
- **Signature interaction:** + Add lifts the card into raking light and opens the size strip, largest hook first. Each added size counts on its button, a tag in the box is tied on the photo, and the fly drops into the order line. Pointing at a fly type in the mega menu, or a species on the moss, surfaces the flies it covers.
- **Motion:** one settle (shade to light, about 220ms ease-out) and the drop (about 400ms). With reduced motion, every state is instant.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. The owner approved this direction on 2026-11-06 ("That is so much better").

## Decisions recorded at the finish review

- **Phone moss band shows the species list without a fly lay.** On touch there is no pointer to lay a species' flies out, and each species link goes straight to its page with its count. A fixed trout lay would repeat the best sellers directly above it. The lay appears from 1040px, where pointing works.
- **The hatch flies are placeholders the owner will swap for real matches** (owner, 2026-11-06). Rows marked "to try" stay that way until swapped. Each row's flies come from the sample catalogue, chosen where the fly's sizes reach the hatch's hook range:
  - Midges: Mosquito, BH Titanium Red Chironomid, Parachute HiViz Adams.
  - Little black stonefly: Elk Hair Caddis Black, Beadhead Prince Nymph.
  - Sulphur: Beadhead Pheasant Tail, Beadhead Hare's Ear (as nymphs).
  - Hex: Adams Parachute and Royal Wulff, in sizes 6–8.
  - Trico: Parachute HiViz Adams and Adams Dry Fly, at size 20.

  In the store, each hatch should be a curated product list or tag the owner maintains.
- **Lowest price is $0.50** (owner, 2026-11-06), matching the live site. The hero lead says "from $0.50 each".
- **Copper stays on the free-shipping figure and the shipping meter** (owner, 2026-11-06). That also settles the buy colour: copper.

## Unresolved

Carried from v1:
- the commissioned shoot;
- the hatch timing;
- "nearly 2,000" and the $60 threshold;
- whether selections ship without their box.

New:
- the category names in the store are Title Case and the page shows them in sentence case, so renaming the categories in BigCommerce would match it;
- the counts in the mega menu need the Storefront GraphQL `products.collectionInfo.totalItems` per category.
