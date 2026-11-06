"""Render the ReelFlies home page prototype to index.html.

Static, server-style HTML from products.json and categories.json, the way a
Stencil template renders it; app.js only enhances it. Run: python3 build.py
"""
import html
import json
import pathlib

HERE = pathlib.Path(__file__).parent
PRODUCTS = json.loads((HERE / "products.json").read_text())
CATS = json.loads((HERE / "categories.json").read_text())
BY_ID = {p["id"]: p for p in PRODUCTS}

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
NOW = 10  # November; app.js moves the lit month to today's on load

# General hatch timing for Ontario trout streams (months 0-11, inclusive
# ranges). Owner to check before launch: every river runs its own clock.
HATCHES = [
    ("Midges", "Chironomidae", "18–24", [(0, 11)], ["4001", "5118"], "/dry-flies/midge-dry-flies/"),
    ("Little black stonefly", "Capniidae", "14–18", [(1, 3)], [], "/nymphs/stonefly-nymphs/"),
    ("Blue-winged olive", "Baetis", "16–20", [(3, 5), (8, 10)], ["4333", "4754"], "/dry-flies/mayfly-dry-flies/"),
    ("Hendrickson", "Ephemerella subvaria", "12–14", [(3, 4)], ["4675", "4877"], "/dry-flies/mayfly-dry-flies/"),
    ("Caddis", "Brachycentrus, Hydropsyche", "14–18", [(4, 8)], ["5835", "4941", "5558", "3899"], "/dry-flies/caddis-dry-flies/"),
    ("March brown", "Maccaffertium vicarium", "10–12", [(4, 5)], ["4368", "4675"], "/dry-flies/mayfly-dry-flies/"),
    ("Sulphur", "Ephemerella invaria", "14–18", [(4, 6)], [], "/dry-flies/mayfly-dry-flies/"),
    ("Hex", "Hexagenia limbata", "6–8", [(5, 6)], [], "/dry-flies/mayfly-dry-flies/"),
    ("Trico", "Tricorythodes", "20–24", [(6, 8)], [], "/dry-flies/mayfly-dry-flies/"),
    ("Hoppers & terrestrials", "grasshoppers, ants, beetles", "8–14", [(6, 8)], ["5663", "6178"], "/dry-flies/hoppers-terrestrials/"),
]

BEST = ["4877", "4507", "5835", "4754", "4979", "5865"]
SELECTIONS = ["3886", "5445", "3870", "4251"]
TYPE_SLUG = {"Dry Flies": "dry-flies", "Nymphs": "nymphs", "Streamers": "streamers",
             "Eggs & Worms": "eggs-worms", "Warmwater Flies": "warmwater-flies",
             "Saltwater Flies": "saltwater-flies"}
TYPE_SHORT = {"Warmwater Flies": "Warmwater", "Saltwater Flies": "Saltwater"}
TYPE_PHOTO = {"Dry Flies": "fly-type-dry-flies", "Nymphs": "fly-type-nymphs-sub-surface",
              "Streamers": "fly-type-streamers-buggers", "Warmwater Flies": "species-bass-panfish",
              "Saltwater Flies": "species-bonefish-permit"}
SPECIES_HERO = [("Trout Flies", "trout"), ("Steelhead Flies", "steelhead"), ("Bass Flies", "bass"),
                ("Pike & Muskie Flies", "pike-muskie"), ("Atlantic Salmon Flies", "atlantic-salmon"),
                ("Bonefish Flies", "bonefish")]
SPECIES_THUMB = {"Trout Flies": "4877", "Steelhead Flies": "4797", "Atlantic Salmon Flies": "5490",
                 "Bass Flies": "5837", "Pike & Muskie Flies": "5300", "Bonefish Flies": "3857"}

e = html.escape


def money(v):
    return f"${v:,.2f}"


def size_range(p):
    s = p["sizes"]
    if not s:
        return ""
    if len(s) == 1:
        return f"Size {s[0]}"
    return f"Sizes {s[0]}–{s[-1]}"


def icon(name, cls="icon"):
    return f'<svg class="{cls}" aria-hidden="true" focusable="false"><use href="#i-{name}"/></svg>'


def fly_card(p, eager=False, size="sm"):
    """One specimen card: the photo as shot, name, price per fly, + Add."""
    unit = "fly" if p["unit"] == "fly" else "set"
    loading = 'fetchpriority="high"' if eager else 'loading="lazy"'
    single = len(p["sizes"]) == 1
    label = "Add 1" if (single or unit == "set") else "+ Add"
    sizes = size_range(p)
    sizes_html = f'<p class="fly__sizes">{e(sizes)}</p>' if sizes else ""
    sig = '<p class="fly__sig">ReelFlies Signature</p>' if p.get("signature") else ""
    return f"""<li class="fly fly--{size}" data-id="{p['id']}">
  <article class="fly__card">
    <a class="fly__photo" href="{p['url']}" tabindex="-1" aria-hidden="true"><img src="img/products/{p['img']}" width="720" height="480" alt="" {loading} decoding="async"></a>
    <div class="fly__body">
      <h3 class="fly__name"><a href="{p['url']}">{e(p['name'])}</a></h3>
      <div class="fly__buy">
        <div class="fly__meta"><p class="fly__price"><span class="num">{money(p['price'])}</span> <span class="fly__unit">/ {unit}</span></p>{sizes_html}{sig}</div>
        <button class="add" type="button" data-add aria-expanded="false">{label}<span class="visually-hidden">: {e(p['name'])}</span></button>
      </div>
      <p class="fly__inbox" data-inbox hidden></p>
    </div>
    <div class="fly__sizes-panel" data-sizes hidden></div>
  </article>
</li>"""


def hero_ways():
    types = "".join(
        f'<li><a class="way" href="{f["url"]}" data-way="type:{TYPE_SLUG[f["name"]]}" data-way-name="{e(f["name"])}" data-way-count="{f["count"]}">'
        f'{e(TYPE_SHORT.get(f["name"], f["name"]))} <span class="way__n num">{f["count"]}</span></a></li>'
        for f in CATS["flyTypes"])
    sp = {s["name"]: s for s in CATS["species"]}
    species = "".join(
        f'<li><a class="way" href="{sp[n]["url"]}" data-way="species:{slug}" data-way-name="{e(n)}" data-way-count="{sp[n]["approx_live_products"]}">'
        f'{e(n.replace(" Flies", ""))} <span class="way__n num">{sp[n]["approx_live_products"]:,}</span></a></li>'
        for n, slug in SPECIES_HERO)
    species += '<li><a class="way way--all" href="/species/">All 11 species</a></li>'
    return f"""<div class="ways">
          <div class="ways__group">
            <h2 class="ways__title">What it is</h2>
            <ul class="ways__list">{types}</ul>
          </div>
          <div class="ways__group">
            <h2 class="ways__title">What it catches</h2>
            <ul class="ways__list">{species}</ul>
          </div>
        </div>"""


def fly_type_plates():
    out_big, out_small = [], []
    for f in CATS["flyTypes"]:
        kids = sorted(f["children"], key=lambda c: -c["count"])[:4]
        kids_html = "".join(f'<li><a href="{c["url"]}">{e(c["name"])}</a></li>' for c in kids)
        photo = TYPE_PHOTO.get(f["name"])
        name = e(f["name"])
        if f["name"] in ("Dry Flies", "Nymphs", "Streamers"):
            out_big.append(f"""<li class="plate">
            <a class="plate__photo" href="{f['url']}">
              <img src="img/stone/{photo}-800.jpg" srcset="img/stone/{photo}-800.jpg 800w, img/stone/{photo}-1600.jpg 1600w" sizes="(min-width: 1100px) 300px, (min-width: 640px) 33vw, 100vw" width="1600" height="700" alt="" loading="lazy" decoding="async">
              <span class="plate__name">{name}</span>
              <span class="plate__n"><span class="num">{f['count']}</span> patterns</span>
            </a>
            <ul class="plate__kids">{kids_html}<li><a href="{f['url']}">All {name.lower()}</a></li></ul>
          </li>""")
        else:
            if photo:
                thumb = f'<img src="img/stone/{photo}-800.jpg" width="800" height="350" alt="" loading="lazy" decoding="async">'
            else:
                thumb = f'<span class="row-plate__specimen"><img src="img/products/{BY_ID["5101"]["img"]}" width="720" height="480" alt="" loading="lazy" decoding="async"></span>'
            out_small.append(f"""<li class="row-plate">
            <a class="row-plate__link" href="{f['url']}"><span class="row-plate__thumb">{thumb}</span><span class="row-plate__name">{name}</span><span class="row-plate__n"><span class="num">{f['count']}</span> patterns</span></a>
            <ul class="row-plate__kids">{kids_html}</ul>
          </li>""")
    return "".join(out_big), "".join(out_small)


def species_list():
    rows = []
    for s in CATS["species"]:
        rows.append(f"""<li><a class="sp" href="{s['url']}"><span class="sp__name">{e(s['name'].replace(' Flies', ''))}</span><span class="sp__n"><span class="num">{s['approx_live_products']:,}</span> patterns</span>{icon('arrow', 'icon sp__go')}</a></li>""")
    return "".join(rows)


def in_season(ranges, m):
    return any(a <= m <= b for a, b in ranges)


def season_words(ranges):
    return " and ".join(f"{MONTHS[a]} to {MONTHS[b]}" if a != b else MONTHS[a] for a, b in ranges) if ranges != [(0, 11)] else "all year"


def hatch_rows():
    rows = []
    for i, (name, latin, sizes, ranges, flies, url) in enumerate(HATCHES):
        cells = "".join(
            f'<span class="track__m{" is-on" if in_season(ranges, m) else ""}{" is-now" if m == NOW else ""}" data-m="{m}" data-label="{MONTHS[m][0]}"></span>'
            for m in range(12))
        now = in_season(ranges, NOW)
        months_attr = ",".join(f"{a}-{b}" for a, b in ranges)
        if flies:
            cards = "".join(fly_card(BY_ID[f]) for f in flies)
            match = f"""<button class="hatch__toggle" type="button" aria-expanded="{'true' if now else 'false'}" aria-controls="hatch-flies-{i}" data-hatch-toggle>Match it <span class="num">({len(flies)})</span>{icon('chevron', 'icon hatch__chev')}</button>"""
            panel = f"""<div class="hatch__flies" id="hatch-flies-{i}" {'' if now else 'hidden'}><ul class="flies flies--row">{cards}</ul><a class="more" href="{url}">More to match it</a></div>"""
        else:
            match = f'<a class="hatch__link" href="{url}">Shop to match it{icon("arrow")}</a>'
            panel = ""
        rows.append(f"""<li class="hatch__row{' is-now' if now else ''}" data-months="{months_attr}">
            <div class="hatch__name"><h3>{e(name)}</h3><p class="hatch__latin" lang="la">{e(latin)}</p></div>
            <p class="hatch__sizes"><span class="hatch__sizes-label">Hooks</span> <span class="num">{sizes}</span></p>
            <div class="track" role="img" aria-label="{e(name)}: {season_words(ranges)}">{cells}</div>
            <div class="hatch__act">{match}</div>
            {panel}
          </li>""")
    return "".join(rows)


def hook_steps():
    sizes = ["2/0", "1/0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"]
    out = []
    for i, s in enumerate(sizes):
        h = round(76 - i * (76 - 14) / (len(sizes) - 1))
        slug = s.replace("/", "-")
        out.append(f'<li><a href="/fly-hook-size-chart/#size-{slug}" style="--h:{h}px"><svg class="hook" viewBox="0 0 34 60" aria-hidden="true" focusable="false"><use href="#i-hook"/></svg><span class="num">{s}</span><span class="visually-hidden"> hook size</span></a></li>')
    return "".join(out)


SPRITE = """<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.75" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-box" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 11h18M9 7V5h6v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.6 3.5h2.6l1.4 4-2 1.4a11 11 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>
  <symbol id="i-hook" viewBox="0 0 34 60"><circle cx="26" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="2.4" vector-effect="non-scaling-stroke"/><path d="M26 9.6V42a11 11 0 0 1-22 0v-9l4.5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></symbol>
</svg>"""


def shop_menu():
    def group(title, items):
        lis = "".join(f'<li><a href="{u}">{e(n)}</a> <span class="num">{c:,}</span></li>' for n, u, c in items)
        return f'<div class="menu__group"><h2 class="menu__title">{title}</h2><ul>{lis}</ul></div>'
    types = [(f["name"], f["url"], f["count"]) for f in CATS["flyTypes"]]
    species = [(s["name"], s["url"], s["approx_live_products"]) for s in CATS["species"]]
    more = [(m["name"], m["url"], m["approx_live_products"]) for m in CATS["more"]]
    return group("Fly types", types) + group("Flies by species", species) + group("More from ReelFlies", more)


def main():
    best_cards = "".join(fly_card(BY_ID[i], eager=(n < 3)) for n, i in enumerate(BEST))
    big, small = fly_type_plates()
    sel_cards = "".join(fly_card(BY_ID[i], size="md") for i in SELECTIONS)
    sig = BY_ID["3899"]
    month_heads = "".join(f'<span class="months__m{" is-now" if m == NOW else ""}" data-m="{m}"><abbr title="{MONTHS[m]}">{MONTHS[m][:3]}</abbr></span>' for m in range(12))
    catalogue = json.dumps({"products": PRODUCTS, "flyTypes": [{"name": f["name"], "slug": TYPE_SLUG[f["name"]], "url": f["url"], "count": f["count"], "children": f["children"]} for f in CATS["flyTypes"]],
                            "species": CATS["species"], "more": CATS["more"], "best": BEST}, separators=(",", ":"))

    page = TEMPLATE.format(
        sprite=SPRITE, menu=shop_menu(), ways=hero_ways(), best=best_cards,
        plates_big=big, plates_small=small, species=species_list(),
        months=month_heads, hatch=hatch_rows(), now_month=MONTHS[NOW],
        hooks=hook_steps(), sig_card=fly_card(sig, size="lg"),
        selections=sel_cards, catalogue=catalogue.replace("</", "<\\/"),
        icon_search=icon("search"), icon_user=icon("user"), icon_box=icon("box"),
        icon_chev=icon("chevron"), icon_close=icon("close"), icon_arrow=icon("arrow"),
        icon_phone=icon("phone"),
    )
    (HERE / "index.html").write_text(page)
    print("wrote index.html", len(page), "bytes")


TEMPLATE = """<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ReelFlies.ca: nearly 2,000 hand-tied fly patterns, sold by the fly</title>
<meta name="description" content="Hand-tied fly fishing flies from a family fly shop in Tillsonburg, Ontario. Nearly 2,000 patterns, priced per fly, by fly type or by the fish you're after.">
<meta name="theme-color" content="#21282D">
<link rel="preload" href="fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" as="image" href="img/stone/hero-stone-1600.jpg" media="(min-width: 1040px)" fetchpriority="high">
<link rel="preload" as="image" href="img/stone/hero-stone-portrait.jpg" media="(max-width: 1039px)" fetchpriority="high">
<link rel="stylesheet" href="styles.css">
</head>
<body>
{sprite}
<a class="skip" href="#main">Skip to content</a>

<!-- Stencil: components/header (logo, Shop flies menu from the category tree, quick search, account, cart count from the Cart API) -->
<header class="masthead">
  <div class="masthead__bar">
    <a class="brand" href="/"><img src="img/brand/reelflies-logo.png" width="133" height="95" alt="ReelFlies home"></a>
    <button class="shop-btn" type="button" aria-expanded="false" aria-controls="shop-menu" data-menu-btn><span class="shop-btn__wide">Shop flies</span><span class="shop-btn__narrow">Menu</span>{icon_chev}</button>
    <form class="search" role="search" action="/search.php" method="get" data-search>
      <label class="visually-hidden" for="q">Search flies</label>
      <input id="q" name="search_query" type="search" placeholder="Search patterns, like caddis or size 16" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="q-list" aria-autocomplete="list">
      <button class="search__go" type="submit">{icon_search}<span class="visually-hidden">Search</span></button>
      <div class="suggest" data-suggest hidden>
        <ul class="suggest__list" id="q-list" role="listbox" aria-label="Suggestions"></ul>
        <a class="suggest__all" href="/search.php" data-suggest-all>See all results</a>
      </div>
    </form>
    <a class="masthead__link" href="/account.php">{icon_user}<span class="masthead__label">Account</span></a>
    <button class="cart-btn" type="button" aria-controls="box" aria-expanded="false" data-box-btn>{icon_box}<span class="masthead__label">Box</span><span class="cart-btn__count num" data-count>0</span><span class="visually-hidden" data-count-label>flies in your box</span></button>
  </div>
  <nav class="menu" id="shop-menu" aria-label="Shop flies" hidden data-menu>
    <div class="menu__inner">{menu}</div>
  </nav>
</header>

<main id="main">

  <!-- Stencil: pages/home.html region "home_stone": a Page Builder image (the commissioned riverbank stone) under a theme section; best sellers from front matter products.top_sellers -->
  <section class="stone" aria-labelledby="stone-title">
    <picture class="stone__photo">
      <source media="(max-width: 1039px)" srcset="img/stone/hero-stone-portrait.jpg" width="700" height="1600">
      <img src="img/stone/hero-stone-1600.jpg" width="1600" height="700" alt="" fetchpriority="high" decoding="async">
    </picture>
    <div class="stone__inner">
      <div class="stone__lead">
        <h1 id="stone-title">Nearly 2,000 patterns, sold by the fly.</h1>
        <p class="stone__line">Hand-tied flies from <span class="num">$0.75</span> each, so you buy exactly the sizes you fish.<span class="stone__more"> Many are tied right here in Canada, on Mustad, Daiichi and other branded hooks.</span></p>
        {ways}
      </div>
      <div class="stone__lay">
        <div class="lay__head">
          <h2 class="lay__title" data-lay-title>Best sellers</h2>
          <a class="lay__all" href="/best-sellers/" data-lay-all>See all{icon_arrow}</a>
        </div>
        <ul class="flies flies--stone" data-lay>{best}</ul>
      </div>
    </div>
  </section>

  <!-- Stencil: the category tree, rendered server-side (every link crawlable) -->
  <section class="twoways" aria-labelledby="twoways-title">
    <div class="wrap">
      <header class="sec-head">
        <h2 id="twoways-title">Every fly, two ways in</h2>
        <p>By what the fly is and how it fishes, or by the fish you're after.</p>
      </header>
      <div class="twoways__grid">
        <div class="twoways__types">
          <h3 class="twoways__sub">Fly types</h3>
          <ul class="plates">{plates_big}</ul>
          <ul class="row-plates">{plates_small}</ul>
        </div>
        <div class="twoways__species">
          <h3 class="twoways__sub">Species</h3>
          <ul class="sp-list">{species}</ul>
        </div>
      </div>
    </div>
  </section>

  <!-- Stencil: a Resource Web Page's chart, placed by a Page Builder widget; matching flies by product id through the Storefront GraphQL API -->
  <section class="hatch" aria-labelledby="hatch-title">
    <div class="wrap">
      <header class="sec-head sec-head--split">
        <h2 id="hatch-title">On the water in <span data-now-month>{now_month}</span></h2>
        <p>General timing for Ontario trout streams. Every river keeps its own clock, so treat it as a starting point and match what you see.</p>
      </header>
      <div class="hatch__chart">
        <div class="months" aria-hidden="true"><span class="months__pad"></span>{months}<span class="months__pad"></span></div>
        <ol class="hatch__rows">{hatch}</ol>
      </div>
    </div>
  </section>

  <section class="hooks" aria-labelledby="hooks-title">
    <div class="wrap hooks__grid">
      <div class="hooks__text">
        <h2 id="hooks-title">Bigger number, smaller hook.</h2>
        <p>Hook sizes run backwards: a size 18 midge is tiny, a size 2 streamer is big, and the aughts (1/0, 2/0) go bigger still. Most trout flies sit between 10 and 20.</p>
        <a class="more" href="/fly-hook-size-chart/">Hook size chart{icon_arrow}</a>
      </div>
      <ol class="hookstep">{hooks}</ol>
    </div>
  </section>

  <section class="signature" aria-labelledby="sig-title">
    <div class="wrap signature__grid">
      <div class="signature__text">
        <h2 id="sig-title">Tied for ReelFlies</h2>
        <p>355 Signature patterns of our own, each one also filed under its fly type. The Psycho Caddis is one of them: our take on the elk hair caddis, with black hackle and orange rubber legs.</p>
        <a class="more more--on-dark" href="/reelflies-signature-flies/">All Signature flies{icon_arrow}</a>
      </div>
      <ul class="flies flies--feature">{sig_card}</ul>
    </div>
  </section>

  <section class="selections" aria-labelledby="sel-title">
    <div class="wrap">
      <header class="sec-head sec-head--split">
        <h2 id="sel-title">Selections: a mix of patterns, one price</h2>
        <p>Ready-made sets for a day on the water or a box that needs filling. The flies ship loose; the fly box in a photo isn't included.</p>
      </header>
      <ul class="flies flies--grid">{selections}</ul>
      <a class="more" href="/fly-selections-assortments/">All 58 selections{icon_arrow}</a>
    </div>
  </section>

  <section class="shop" aria-labelledby="shop-title">
    <div class="wrap shop__grid">
      <figure class="shop__photo">
        <img src="img/brand/shop-front.jpg" width="600" height="450" alt="The ReelFlies shop on Broadway in Tillsonburg, Ontario: a dark painted storefront with the trout logo in the window" loading="lazy" decoding="async">
      </figure>
      <div class="shop__text">
        <h2 id="shop-title">A family fly shop on Broadway in Tillsonburg</h2>
        <p>ReelFlies has been 100% Canadian and family-run since 2003. We're led by fly fishers and headed by Steve B, who has over 40 years of fly fishing behind him.</p>
        <ul class="facts">
          <li><span class="facts__k">Range</span> Nearly 2,000 hand-tied patterns, with new ones added all the time.</li>
          <li><span class="facts__k">Hooks</span> Many tied locally, on hooks from Mustad, Daiichi, Maruto, Dai-Riki, Kamasan and VMC.</li>
          <li><span class="facts__k">Trade</span> We wholesale flies to many well-known tackle shops in Canada.</li>
        </ul>
        <p class="promise">We stand behind every fly we sell.</p>
        <p class="shop__call">{icon_phone}<span>Questions about flies, sizes or an order? Call us toll free at <a href="tel:+18662504071">1 866 250 4071</a>. Walk-ins by appointment.</span></p>
        <p class="signoff">Tight lines from us all at ReelFlies®.</p>
      </div>
    </div>
  </section>

</main>

<!-- Stencil: components/footer -->
<footer class="foot">
  <div class="wrap foot__grid">
    <nav aria-labelledby="f-types"><h2 id="f-types">Fly types</h2><ul>
      <li><a href="/dry-flies/">Dry Flies</a></li><li><a href="/nymphs/">Nymphs</a></li><li><a href="/streamers/">Streamers</a></li><li><a href="/eggs-worms/">Eggs &amp; Worms</a></li><li><a href="/warmwater-flies/">Warmwater Flies</a></li><li><a href="/saltwater-flies/">Saltwater Flies</a></li><li><a href="/species/">Flies by species</a></li>
    </ul></nav>
    <nav aria-labelledby="f-more"><h2 id="f-more">More</h2><ul>
      <li><a href="/fly-selections-assortments/">Selections &amp; Assortments</a></li><li><a href="/reelflies-signature-flies/">Signature Flies</a></li><li><a href="/fly-gear/">Fly Gear</a></li><li><a href="/clearance-flies/">Clearance</a></li><li><a href="/fly-hook-size-chart/">Hook size chart</a></li><li><a href="/learn/">Learn</a></li>
    </ul></nav>
    <nav aria-labelledby="f-help"><h2 id="f-help">Help</h2><ul>
      <li><a href="/shipping-returns/">Shipping &amp; Returns</a></li><li><a href="/help/">Help &amp; FAQ</a></li><li><a href="/contact-us/">Contact us</a></li><li><a href="/about-us/">About ReelFlies</a></li><li><a href="/privacy-policy/">Privacy</a></li>
    </ul></nav>
    <div class="foot__contact"><h2>Visit or call</h2>
      <address>ReelFlies, Digital Barn Ltd.<br>93 Broadway St<br>Tillsonburg, ON N4G 3P5</address>
      <p><a href="tel:+18662504071">1 866 250 4071</a> toll free<br>Walk-ins by appointment</p>
    </div>
    <form class="news" action="/subscribe.php" method="post" data-news>
      <h2>Newsletter</h2>
      <p>A few emails a year about new patterns and ReelFlies sales.</p>
      <label class="visually-hidden" for="news-email">Email address</label>
      <div class="news__row"><input id="news-email" name="nl_email" type="email" autocomplete="email" placeholder="you@example.com" required><button type="submit">Subscribe</button></div>
      <p class="news__fine">By subscribing you agree to receive email from ReelFlies. You can unsubscribe at any time.</p>
    </form>
  </div>
  <div class="wrap foot__base">
    <p>© 2026 Digital Barn Ltd. ReelFlies® is a registered trademark of Digital Barn Ltd.</p>
    <p><a href="https://reelflies.com/">Ordering from outside Canada? Shop ReelFlies.com in US dollars</a></p>
  </div>
</footer>

<!-- Stencil: theme layer over the Cart API (/api/storefront/carts); the box sheet is the cart preview -->
<aside class="orderline" aria-label="Your box" data-orderline>
  <div class="box" id="box" hidden data-box>
    <div class="box__head"><h2>Your box</h2><button class="box__close" type="button" data-box-close>{icon_close}<span class="visually-hidden">Close your box</span></button></div>
    <div class="box__body" data-box-body></div>
  </div>
  <div class="orderline__bar">
    <button class="orderline__toggle" type="button" aria-expanded="false" aria-controls="box" data-box-btn>
      <span class="orderline__thumbs" data-thumbs aria-hidden="true"></span>
      <span class="orderline__sum" data-sum>Your box is empty</span>
    </button>
    <p class="orderline__ship" data-ship>Free standard shipping in Canada on fly orders over <span class="num">$60</span>.</p>
    <a class="buy orderline__checkout" href="/checkout" data-checkout aria-disabled="true">Check out <span class="num" data-total></span></a>
  </div>
</aside>
<p class="visually-hidden" role="status" aria-live="polite" data-status></p>

<script type="application/json" id="catalogue">{catalogue}</script>
<script src="app.js" defer></script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
