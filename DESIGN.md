---
name: ReelFlies
description: Hand-tied flies laid out on a riverside stone in low, warm light, picked up and added a fly at a time.
colors:
  shale-950: "#1c1916"
  shale-900: "#29241f"
  shale-800: "#38312a"
  shale-600: "#5c5349"
  shale-400: "#958a7d"
  mist: "#ebe4d8"
  limestone-300: "#cdc5b7"
  limestone-200: "#ddd6ca"
  limestone-100: "#e9e4db"
  paper: "#ffffff"
  ink: "#1c1916"
  ink-muted: "#564d43"
  edge: "#776c60"
  moss-700: "#3b4628"
  lichen: "#d7dbb4"
  halo: "#2e6385"
  copper: "#9c4a22"
  copper-deep: "#833d1b"
  copper-lit: "#e39a6c"
  on-copper: "#ffffff"
  light-warm: "#ffe9c9"
typography:
  display:
    fontFamily: "Archivo Expanded, Archivo Expanded Fallback, Arial Black, Arial, sans-serif"
    fontSize: "clamp(38px, 3.4vw + 19px, 68px)"
    fontWeight: 820
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo Expanded, Archivo Expanded Fallback, Arial Black, Arial, sans-serif"
    fontSize: "clamp(28px, 1.9vw + 13px, 44px)"
    fontWeight: 780
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Archivo Expanded, Archivo Expanded Fallback, Arial Black, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 760
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "Archivo, Archivo Fallback, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  body:
    fontFamily: "Archivo, Archivo Fallback, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: "Archivo, Archivo Fallback, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0em"
  caption:
    fontFamily: "Archivo, Archivo Fallback, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
  price:
    fontFamily: "Archivo Condensed, Archivo Condensed Fallback, Arial Narrow, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "'tnum' 1, 'lnum' 1"
  size:
    fontFamily: "Archivo Condensed, Archivo Condensed Fallback, Arial Narrow, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "'tnum' 1, 'lnum' 1"
  count:
    fontFamily: "Archivo Condensed, Archivo Condensed Fallback, Arial Narrow, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.2
    fontFeature: "'tnum' 1, 'lnum' 1"
  note:
    fontFamily: "Kalam, Bradley Hand, cursive"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
  signoff:
    fontFamily: "Kalam, Bradley Hand, cursive"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  sm: "2px"
  md: "4px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-6: "24px"
  space-8: "32px"
  space-12: "48px"
  space-16: "64px"
  space-24: "96px"
components:
  button-buy:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.on-copper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-buy-hover:
    backgroundColor: "{colors.copper-deep}"
    textColor: "{colors.on-copper}"
  button-buy-in-hand:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-buy-disabled:
    backgroundColor: "{colors.shale-800}"
    textColor: "{colors.shale-400}"
  button-search:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
  button-subscribe-on-shale:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.shale-950}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  way-pill:
    backgroundColor: "rgba(28, 25, 22, 0.42)"
    textColor: "{colors.mist}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  way-pill-lit:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  specimen-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 8px 12px"
  size-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.size}"
    rounded: "{rounded.md}"
    height: "54px"
  size-count-badge:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.on-copper}"
    rounded: "{rounded.pill}"
    height: "22px"
  count-badge:
    backgroundColor: "{colors.limestone-300}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "24px"
  count-badge-filled:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.on-copper}"
  input-search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 92px 0 44px"
    height: "46px"
  input-on-shale:
    backgroundColor: "{colors.shale-900}"
    textColor: "{colors.mist}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "48px"
  utility-strip:
    backgroundColor: "{colors.shale-950}"
    textColor: "{colors.mist}"
    typography: "{typography.caption}"
    height: "36px"
  nav-row:
    backgroundColor: "{colors.limestone-100}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "52px"
  mega-menu:
    backgroundColor: "{colors.limestone-100}"
    textColor: "{colors.ink}"
    padding: "32px 48px"
  drawer-panel:
    backgroundColor: "{colors.limestone-100}"
    textColor: "{colors.ink}"
    width: "min(420px, 90vw)"
  bin-label:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.note}"
    rounded: "{rounded.sm}"
    padding: "5px 14px 6px"
  hatch-month-on:
    backgroundColor: "{colors.halo}"
    height: "18px"
  species-band:
    backgroundColor: "{colors.moss-700}"
    textColor: "{colors.mist}"
    padding: "96px 48px"
  order-line:
    backgroundColor: "{colors.shale-950}"
    textColor: "{colors.mist}"
    height: "64px"
  box-sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px 16px 24px"
    width: "420px"
---

# Design System: ReelFlies

## Overview

**Creative North Star: "The Streamside Stone, warmed"**

The shop is a riverside stone in low, warm light, with real flies laid out on it. Wet shale carries the photographed bands and the frame around them, dry limestone is the working ground where reading and choosing happen, and moss is a third field for the species. Every fly sits as photographed on its own white paper card, like a specimen set down by hand. The ground is quiet and warm so the flies carry the colour; the one metal in the system, beadhead copper, appears only where flies go into the box or money changes hands.

Light, not colour, carries state. There is one light, low and warm, from the upper left. A card at rest is seated on the stone; under the pointer it lifts; picked up (its size strip open) it catches the raking light, with a lit edge, a warm pool on the stone and a long shadow thrown down and to the right; once its fly is in the box it keeps a copper-lit ring and says what is in the box on a line that was reserved for it all along. On the hatch chart the current month is a column of the same warm light. Motion is one short settle and one drop; with reduced motion every state is simply there.

The density is that of a working shop, not a gallery: prices, sizes and counts are always visible, in a condensed numeral that reads like a hook-size stamp. Archivo does the work in three cuts; the fly tier's hand, Kalam, appears at most once in a region, as a bin label, a season mark, a margin note or the sign-off.

**Key Characteristics:**
- Three grounds: wet shale (photographed stone, strip, footer, order line), dry limestone (working bands), moss (species). Paper only under products.
- One buy colour, beadhead copper, held for buying and for what has been bought.
- Archivo in three cuts: Expanded for headings, Archivo for text and controls, Condensed for every number. Kalam as the tier's hand, once per region.
- State shown by light: seated at rest, lifted on point, light-edge and rake in hand, copper-lit ring once in the box.
- Product photography as shot, on white, never tinted or covered.
- Small, honest corners (4px) on cards, buttons, fields and plates; full pills only for ways in, toggles and counts.

## Colors

A warm mineral palette in three grounds (shale, limestone, moss) with paper for products, one copper reserved for buying, one halo blue for water and season, and one warm light.

### Primary
- **Beadhead Copper** (`copper`): every buy action and every figure that counts what is being bought: + Add, Add to cart, Check out, the header box count once flies are in it, the box total, the per-size count badges and outlines in the size strip, the in-box line on a card, and the shipping meter's fill in the box sheet. Labels on it are `on-copper` (AA at button size).
- **Deep Copper** (`copper-deep`): hover and press for copper fills only.
- **Lit Copper** (`copper-lit`): copper seen on shale or as light: the 2px ring around a card whose fly is in the box, and buy figures on the order line, including the distance to free shipping. Never a fill, never body text.

**Owner decision (2026-11-06).** Copper is the buy colour, and it covers the free-shipping figure and the shipping meter's fill.

### Secondary
- **Brook-trout Halo** (`halo`): water and season data only: the in-season months on the hatch chart, and the text caret in fields.

### Tertiary
- **Low Warm Light** (`light-warm`): the raking light itself: the lit edge and pool around the card in hand, the current-month column and ring on the hatch chart, and matched text in search suggestions. Never a fill for text.

### Neutral: wet shale
- **Riverbed Shale** (`shale-950`): the utility strip, the footer and the pinned order line; the darkest ground.
- **Wet Shale** (`shale-900`): the ground under photographed stone (hero, house-pattern band, plates) and the base of every stone scrim; fields on shale.
- **Shaded Shale** (`shale-800`): rules inside the footer, the disabled checkout, hover on the ink Search button.
- **Shale Rule** (`shale-600`): outlines and underlines on shale (newsletter field, the empty order-line slot). Decorative only.
- **Weathered Shale** (`shale-400`): muted text on shale (fine print, shipping sentence, footer column heads), the size-strip step bars, sold-out size numbers, the disabled checkout label.
- **Mist** (`mist`): text, icons and focus rings on shale, moss and scrimmed photographs.

### Neutral: dry limestone and paper
- **Limestone** (`limestone-100`): the page ground, the header, the mega menu and the drawer.
- **Dry Limestone** (`limestone-200`): the alternate band (hatch chart, shop story), the mega menu's "Also" row, opened drawer groups, hover ground on limestone.
- **Limestone Rule** (`limestone-300`): hairlines and row rules on limestone; the empty box count; muted counts on shale pills. Never text on light grounds.
- **Specimen Paper** (`paper`): specimen cards, size cells, fields, the box sheet, the bin label, the logo plate: every surface that holds a product photo shot on white.
- **Ink** (`ink`): text on limestone and paper; focus rings on light grounds; the Search button and the + Add of the card in hand; the hatch chevrons.
- **Ink Muted** (`ink-muted`): secondary text, units ("/ fly"), sizes, hints, counts and Latin names.
- **Edge** (`edge`): control borders on light grounds (search field, size cells, steppers, outline pills) and quiet underlines.

### Neutral: moss
- **Moss** (`moss-700`): the species band.
- **Lichen** (`lichen`): secondary text and rules on moss; the newsletter confirmation; text selection everywhere.

### Named Rules
**The Copper Is For Buying Rule.** Copper marks an action that puts flies in the box or spends money, or a figure that counts what is in the box. Links, headings, navigation, active filters, the Search button, Subscribe and decoration never take it.

**The Three Grounds Rule.** Shale is photographed stone or the frame around it; limestone is where reading and choosing happen; moss is the species field. A new section picks one of these; paper is never a page ground and no fourth ground is invented.

**The Scrim Rule.** Text on a stone photograph sits over a scrim of shale (left-to-right on wide screens, top-to-bottom when stacked), lit by a faint warm radial from the upper left, so it holds 4.5:1 on any frame the photographer delivers.

**The Halo Rule.** Halo blue means water and time. It never marks a link, a selection or a buy.

## Typography

**Display Font:** Archivo Expanded (with Arial Black, Arial)
**Body Font:** Archivo (with Arial)
**Label/Mono Font:** Archivo Condensed with tabular lining figures (with Arial Narrow), for numerals; Kalam (with Bradley Hand, cursive) as the tier's hand

**Character:** Four self-hosted OFL families shipped with the theme, three of them cuts of Archivo from one variable file (weight 100–900, width 62–125): Expanded fixes the width at 118, Condensed at 76. Each Archivo stack starts its fallback with a size-matched Arial face (Archivo Fallback, Archivo Expanded Fallback, Archivo Condensed Fallback, measured in `assets/scss/reelflies/_fonts.scss`), so nothing moves when Archivo arrives. Expanded and heavy it is broad and outdoorsy, like lettering on a tackle box; condensed it is a hook-size stamp; at normal width it simply reads. Kalam is a fly tier's marker on a bin.

### Hierarchy
- **Display** (820, fluid 38–68px, 0.98): the one page headline, held to about 13ch. On phones under 640px it steps down to 32px so the first two cards stay in view.
- **Headline** (780, fluid 28–44px, 1.04): section headings, balanced wrap; newsletter heading one step down (760, 22–30px).
- **Title** (760, 19–26px, 1.15): plate names, mega-menu pane heads, species names, row-plate names, the box and drawer headings, the hook-scale heading.
- **Lead** (400, 18px, 1.5): the line under the page headline and band intros (17px on section heads).
- **Body** (400, 16px, 1.55): running copy, capped near 34–44rem.
- **Label** (650, 15px): product names, buttons (700), pills, nav and menu links, drawer rows (700, 18px). Sentence case, no tracking.
- **Caption** (400, 13px): sizes, hints, units, fine print, Latin names (italic). Nothing below 13px.
- **Price / Size / Count** (Archivo Condensed, 700 18px / 700 17px / 650 14–15px, tabular): every price, hook size, count and month.
- **Note / Signoff** (Kalam 700 19–22px / 400 26px): bin labels, the "Now" mark, one margin note, the sign-off.

### Named Rules
**The Cut Carries the Role Rule.** Expanded is for headings and names that act as headings. Controls and product names stay in Archivo even inside expanded contexts. Numbers are always Condensed. Hierarchy never comes from a fourth face.

**The One Hand Per Region Rule.** Kalam appears at most once in a region, for a bin label, a season mark, a margin note or the sign-off, set slightly askew (−1.5° to −4°). It never carries a price, a button, a size a shopper picks from, a heading or anything needed to buy.

**The Sentence Case Rule.** Headings, labels, buttons and group titles are sentence case at normal tracking. Nothing is set in tracked capitals.

## Layout

A centred column of at most 1344px with a gutter of 16px on phones, 24px from 640px and 48px from 1040px; bands run full bleed and alternate limestone, dry limestone, shale and moss. Section padding is `space-16` on phones and `space-24` from 1040px. Grids are fractional (5/7, 6/6, 3.2/8.8, 4/8) and collapse to one column on narrow screens.

- **Breakpoints:** 640px (header goes to one row, stone cards three up, way lists wrap instead of scrolling), 900px (utility strip links, hatch rows on one line, split section heads, footer grid, Signature note beside its card), 1040px (two-row header with the nav row pinned, stone and species split, laid cards, utility strip's middle line).
- **Header:** on phones the menu button, logo, Account and Box share a row and search runs full width beneath. From 1040px the header is two rows (76px brand row with logo, search, Account and Box; 52px nav row) and only the nav row stays pinned as the page scrolls; scroll padding keeps focus clear of it.
- **The order line** is fixed at the foot (64px); the body pads its foot by the same height so nothing hides beneath it.
- **On phones** way lists become single swipe rows bleeding to the screen edge, labelled at the left; the hero stack is tightened so the first two cards and their + Add sit above the order line at 390×844; buy rows stack with a full-width + Add.
- **Touch:** every pill, nav row and control is at least 44px; size cells are 54px tall.

**The Laid, Not Filed Rule.** From 1040px, specimen cards on stone and on moss are each nudged a few pixels off the grid (up to 5px across, 10px down) so they read as set down by hand. Reading order never changes, and cards on limestone sit on a true grid.

**The Reserved Line Rule.** Every specimen card carries one line under its price, holding the size range or, once added, what is in the box. Adding a fly never moves the layout (measured layout shift on add: 0).

## Elevation & Depth

Depth is physical and lit from one side. Shadows are warm-black, never blue or grey glows, and their size says how close a thing is to the hand. On limestone, depth drops to a plain hairline shadow.

### Shadow Vocabulary
- **Seat** (`box-shadow: 0 18px 30px rgba(18,14,10,0.38), 0 2px 4px rgba(18,14,10,0.3)`): a card resting on stone or moss; the bin label.
- **Lift** (`box-shadow: 0 24px 40px rgba(18,14,10,0.44), 0 4px 8px rgba(18,14,10,0.3)`): a card on stone or moss under the pointer (with a 3px rise); the box sheet, the drawer panel and a fly in flight.
- **Rake** (`box-shadow: 26px 34px 44px rgba(18,14,10,0.5), 8px 10px 12px rgba(18,14,10,0.28)`): the card in hand's long shadow, and the open size strip beneath it.
- **Light edge** (`box-shadow: -4px -4px 0 0 #ffe9c9, -12px -14px 30px -4px rgba(255,228,192,0.6)`): the card in hand's lit upper-left edge; always paired with Rake.
- **Plain** (`box-shadow: 0 1px 2px rgba(28,25,22,0.12)`): cards on limestone, photo plates, the active mega-menu rail item.
- **Drop** (`box-shadow: 0 22px 40px -12px rgba(18,14,10,0.32), 0 2px 6px rgba(18,14,10,0.1)`): the mega menu, search suggestions and the shop photograph.
- **Float** (`box-shadow: 0 -8px 28px rgba(18,14,10,0.24)`): the order line over the page.

### Named Rules
**The Light Marks State Rule.** At rest a card is seated; pointing lifts it; the card in hand takes the light edge and rake, moves 4px left and 6px up, and casts a warm radial pool on the stone behind its upper left; a fly in the box keeps a 2px copper-lit ring in every one of those states. While the stone re-lays for another way in, cards fade back and the new ones arrive in a short stagger. No other device signals card state.

**The One Light Rule.** The lit edge, the warm pool and the scrim's warm radial always come from the upper left, and shadows fall to the lower right. The hard light edge exists only on the card in hand; only one card is in hand at a time.

## Shapes

Corners are small and honest: 4px (`rounded.md`) on cards, buttons, fields, size cells, plates, the box sheet and hatch rows; 2px (`rounded.sm`) on thumbnails, the bin label and small controls nested inside other things. Full pills (`rounded.pill`) are kept for ways in, toggles (Done, the stone's back control), count badges, the hatch chevrons and the ends of each hatch track. The "all" link at the end of a way list is the same pill with a dashed outline. Borders are 1px hairlines; nav items take a 3px ink underline that grows from the left.

**The Square Buy Rule.** Buy buttons are 4px rectangles, never pills, so the copper action never reads as a filter.

## Components

### Buttons
- **Shape:** gently squared (4px), 40px tall (44px on phones and in the order line, 48px full width in the box sheet), 14px side padding, 700 15px Archivo label.
- **Buy:** copper ground, `on-copper` label: "+ Add", "Add to cart", "Check out" with its total in condensed numerals.
- **Hover / Press:** deep copper on hover; a 1px drop on press. While its card is in hand, + Add turns ink. Disabled checkout (an empty box) turns shaded shale with a weathered label and stops taking clicks.
- **Search:** an ink button inside the right edge of the search field, 2px corners, hovering to shaded shale.
- **Subscribe (on shale):** mist ground, riverbed label, hovering to paper.
- **Text actions:** underlined links in label weight with an `edge` underline that darkens on hover and an arrow that slides 3px ("See all", "All 1,600", "Hook size chart").

### Chips
- **Ways in (on stone):** translucent shale ground, mist label, a 42% mist outline and a condensed count in `limestone-300`. Hover and the lit way flip to paper with ink text; lighting a way re-lays the stone with that category's flies, and clicking still goes to the category. Grouped under plain labels ("What it is", "What it catches").
- **Toggles (on light ground):** transparent with an `edge` outline, 36px, turning ink-outlined on hover.

### Cards / Containers
- **Specimen card:** paper, 4px corners, 8px padding (12px below). The product photo fills the top at its native 3:2, as shot. Below: product name (label), price in condensed numerals with "/ fly" in ink-muted, the reserved line, and + Add at the right (full width below on phones).
- **In-box line:** copper, 650, 13px. It says which sizes are in the box in the longest form the reserved line holds: "In your box: 1 × 12, 2 × 14", then "In box: 12, 14 ×2", then "2 in your box". The full form stays in the title.
- **On stone and moss:** seated, with the full light vocabulary (see Elevation). **On limestone** (selections grid, hatch rows): plain shadow and the copper-lit ring when in the box.
- **Plates:** fly-type photographs at 16:9 with 4px corners, a bottom shale fade, the name in Expanded 780 and a condensed count in mist; a 3% zoom on hover. Sub-links sit below the plate, not on it. Row plates pair a 112px thumbnail (88px on phones) with an Expanded name and an arrow.

### Inputs / Fields
- **Search:** paper, 1px `edge` outline, 4px corners, 46px tall, search icon inset left and the ink Search button inset right. Focus is a 2px ink outline offset 1px. Suggestions open as a paper sheet with Drop shadow: group titles in caption weight 650, 48×32 photo thumbnails, matched text on low warm light, limestone hover rows.
- **On shale** (newsletter): wet-shale field, `shale-600` outline, mist text and caret, 48px.
- **Focus everywhere:** a 2px ink outline offset 3px on light grounds; mist on shale, moss, the utility strip and the order line; back to ink on paper cards inside dark bands.

### Navigation
- **Utility strip:** riverbed shale, 36px, 13px mist text: the shipping promise at the left, the family line in the middle from 1040px, phone number and the US shop link at the right from 900px.
- **Header:** limestone with a limestone-rule underline. The logo raster is multiplied onto the limestone so its white ground disappears (44px tall, 52px from 1040px).
- **Nav row (from 1040px):** label-weight items, a 3px ink underline that grows from the left on hover and when a menu is open, a chevron that turns 180°. Wholesale sits alone at the right in ink-muted.
- **Mega menu:** full width under the header on limestone with Drop shadow and a 32% shale scrim over the page. Flies: a 272px rail of fly types (the active one on paper with Plain shadow and an arrow), a two-column list of subcategories with condensed counts on limestone rules, and a graded stone plate named in mist; a dry-limestone "Also" row beneath. Species: grouped lists of species in 700 17px with counts, and a dry-limestone hatch-chart card.
- **Phone drawer:** a limestone panel from the left (up to 420px, 90vw) over a 45% shale scrim, with an Expanded "Menu" heading. Top groups are 56px rows in 700 18px; fly types open as 52px dry-limestone rows with condensed counts and chevrons; their children are 44px limestone rows ending in an underlined "All …" link. The phone number sits at the foot.
- **Footer:** riverbed shale; newsletter row, the logo on a paper plate, column heads in 650 14px weathered shale, mist links that underline on hover, fine print in weathered shale above a shaded-shale rule.

### Size Strip (signature)
Opens under the card in hand, over what is below it, on paper with the Rake shadow. Sizes run largest hook first. Each size is a 54px paper cell with the hook number in condensed 700 and a 3px step bar above it whose height steps with the hook's place in the full hook order. Choosing a size adds one fly: the cell takes a copper outline and bar, a copper count badge sits on its corner, and a "−1" appears beneath. Sold-out sizes are dashed, struck through, pale on limestone, and named in the foot ("Sizes 8, 16, 18 are sold out."). Every cell keeps room for its "−1", so the strip never changes shape as flies go in. A caption hint above and a Done pill below; Escape closes it.

### Order Line (signature)
Riverbed shale bar pinned at the foot with Float shadow: overlapping 44×32 thumbnails of added flies (a dashed `shale-600` slot when empty), the count in flies and patterns underlined, the distance to free shipping in weathered shale with its figure in copper-lit (hidden under 640px), and the copper checkout with its total. A newly added fly drops from its card into the bar; the header box count turns copper and bumps. Activating the count opens the box sheet above the bar: paper with Lift shadow, patterns with 64×43 thumbnails and per-size steppers in hook order, the total in copper numerals, a 6px shipping meter on dry limestone with a copper fill, and a full-width checkout.

### Hatch Chart
A dry-limestone band. The intro (heading, this month's hatches in 650 19px, a general-timing note) is sticky beside the chart from 1040px. Every hatch row is a native disclosure and the whole row is the target: name with Latin name in italic caption, "Hooks" with the range in condensed numerals, a twelve-month track of 18px cells (empty cells 45% white, in-season cells `halo`, pill-rounded at each run's ends), and a cue of overlapping fly thumbnails, an underlined count ("3 flies to match it") and an ink round chevron. Rows lighten to translucent white on hover and when open; opened rows show off-stone specimen cards and a "More …" link. The current month is a column of low warm light through every row, its cell ringed in light and ink, its header label in ink 800 on the light, and the Kalam "Now" above it.

### Hook Scale
Hook sizes from 2/0 to 24 in hook order, each drawn as one authored SVG hook (eye, shank, bend, point, barb) in `currentColor` at its relative size, with the size in condensed numerals beneath; seven to a row on phones, fourteen from 900px.

### Species Band (moss)
A moss band: the Expanded heading in mist, a lichen intro, species grouped under lichen labels ("Freshwater", "Saltwater") as Expanded 760 19px names with condensed counts over 24% lichen rules, underlining on hover and when lit. From 1040px, pointing at a species lays three of its flies on the moss beside the list, seated and laid, under a Kalam title and an "All …" link. On phones the band shows the list only; each species links straight to its page.

### Hand Notes
- **Bin label:** a paper tag in Kalam 700 22px, 2px corners, Seat shadow, rotated −2°, naming the lay on the stone ("Best sellers"); on moss the lay title is the same hand straight on the ground.
- **Season mark:** the "Now" above the current month on the hatch chart (Kalam 700 19px, −4°).
- **Margin note:** one note in mist on the house-pattern band, rotated −4°, with a hand-drawn arrow (mist, 2.4px round stroke) to its card; on screens under 900px it sits above the card without the arrow.
- **Sign-off:** "Tight lines from us all at ReelFlies®" in Kalam 400 26px, −1.5°, at the end of the shop story.

### Logo
The trout-oval raster is the only fixed asset. On limestone it is multiplied onto the ground; on shale, moss or a photograph it sits on a paper plate (footer, 48px); never under 40px tall, never recoloured or redrawn.

### Motion
One settle (220ms, `cubic-bezier(0.16, 1, 0.3, 1)`) for shade, light, lift, underlines, arrows and chevrons; arrivals on the stone in 380ms with a 40ms stagger; one drop (420ms) for a fly travelling to the order line; the drawer slides in over 260ms. With reduced motion, durations collapse to 1ms and the flying fly is not drawn.

### Region mapping (BigCommerce Stencil)
The base is Cornerstone 6.22, rebuilt fresh rather than ported from the old skin. ReelFlies code lives in its own folders and touches upstream files only through hooks listed in `CUSTOMIZATIONS.md` (ADR 0001). As built (step 2):
- **Utility strip:** `components/reelflies/strip.html`: the free-shipping figure from `rf_ship_free_threshold`, the phone number from the store profile, the other storefront from `rf_alt_store_*`.
- **Header, nav, mega menu and drawer:** `components/reelflies/header.html` and `drawer.html`, in place of the stock header. Every link is server-rendered from the `categories` data by the ids in the Menu settings (Fly Types, Species root, plain links, the "Also" row), so the channel's Menu Display Depth is 3.
- **The stone:** `components/reelflies/home.html`; the photograph is a theme asset (`assets/img/reelflies/stone/`, a crop of the store's own slate banner until the commissioned shoot) and the one eager, high-priority image. Best sellers from front matter `products.top_sellers`, their sizes and stock from the page's GraphQL front matter. A way in re-lays the stone with that category's best sellers through the Storefront GraphQL API (search, best selling).
- **Fly-type plates and species band:** the same category data; plates use each category's own image. The species lay's flies come through the Storefront GraphQL API, from 1040px.
- **Hatch chart:** theme data (`components/reelflies/hatches.html`: names, Latin names, hook ranges, months), each row's flies and "More" category as Theme Styles settings the owner edits without a push, read by the home page's GraphQL front matter. (A Page Builder widget would let the owner edit the timing too; it needs a widget template written to the store.)
- **Footer:** `components/reelflies/footer.html`, in place of the stock footer; the newsletter carries the CASL wording of record (`content/pages/1895766/newsletter.json`).
- **Order line and box sheet:** `components/reelflies/order-line.html` over the Cart API (`/api/storefront/carts`, `box.js`): changes show at once and are sent one at a time; the sheet is the cart preview, and the cart page has no order line.

## Do's and Don'ts

### Do:
- **Do** show product photos exactly as shot, on white, at their native 3:2, inside a paper specimen card.
- **Do** keep the bottom-left corner of every product photo clear: no badge, label or control over the baked-in logo.
- **Do** set every price, count, size, hook number and month in Archivo Condensed with tabular figures.
- **Do** reserve the in-box line on every card so adding never moves the layout.
- **Do** put text on stone photography only over the shale scrim, and leave the stone uncovered where no text is needed.
- **Do** treat the warm `.graded` filter on the stand-in slate photographs as temporary: it comes off when the commissioned warm-light shoot replaces them, and it is never applied to product photos.
- **Do** give every lit, lifted or dropping state an instant equivalent under reduced motion.
- **Do** keep every touch target at least 44px on phones.

### Don't:
- **Don't** use copper for anything that is not buying or a count of what is being bought. The distance to free shipping counts; a sale badge or a promo banner does not.
- **Don't** add a fourth type family, set headings in text width, or set controls in Expanded.
- **Don't** use Kalam more than once in a region, or for prices, buttons, pickable sizes, headings or anything needed to buy.
- **Don't** make buy buttons pills, or give way pills square corners.
- **Don't** place type, gradients, filters or controls over a product photo.
- **Don't** use the light edge or warm pool on anything but the one card in hand.
- **Don't** use paper as a page ground, or put the logo directly on shale, moss or a photograph.
- **Don't** set labels or group titles in tracked capitals.
- **Don't** nudge cards off the grid anywhere but on stone and moss.
