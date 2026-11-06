"""Render the ReelFlies home page prototype, v2 (the warmed world), to index.html.

Static, server-style HTML from products.json and categories.json, the way a
Stencil template renders it; app.js only enhances it. Run: python3 -I build.py
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
    ("Midges", "Chironomidae", "18–24", [(0, 11)], ["4001", "5118", "5608"], "/dry-flies/midge-dry-flies/", "Midge dry flies"),
    ("Little black stonefly", "Capniidae", "14–18", [(1, 3)], ["4941", "4507"], "/nymphs/stonefly-nymphs/", "Stonefly nymphs"),
    ("Blue-winged olive", "Baetis", "16–20", [(3, 5), (8, 10)], ["4333", "4754"], "/dry-flies/mayfly-dry-flies/", "Mayfly dry flies"),
    ("Hendrickson", "Ephemerella subvaria", "12–14", [(3, 4)], ["4675", "4877"], "/dry-flies/mayfly-dry-flies/", "Mayfly dry flies"),
    ("Caddis", "Brachycentrus, Hydropsyche", "14–18", [(4, 8)], ["5835", "4941", "5558", "3899"], "/dry-flies/caddis-dry-flies/", "Caddis dry flies"),
    ("March brown", "Maccaffertium vicarium", "10–12", [(4, 5)], ["4368", "4675"], "/dry-flies/mayfly-dry-flies/", "Mayfly dry flies"),
    ("Sulphur", "Ephemerella invaria", "14–18", [(4, 6)], ["4754", "5745"], "/nymphs/mayfly-nymphs/", "Mayfly nymphs"),
    ("Hex", "Hexagenia limbata", "6–8", [(5, 6)], ["4877", "4979"], "/dry-flies/mayfly-dry-flies/", "Mayfly dry flies"),
    ("Trico", "Tricorythodes", "20–24", [(6, 8)], ["5608", "4675"], "/dry-flies/mayfly-dry-flies/", "Mayfly dry flies"),
    ("Hoppers and terrestrials", "grasshoppers, ants, beetles", "8–14", [(6, 8)], ["5663", "6178"], "/dry-flies/hoppers-terrestrials/", "Hoppers & terrestrials"),
]

# Hatches whose flies are placeholders until the owner swaps in real matches.
# To swap: change the product ids above, drop the name from this set, rebuild.
TO_TRY = {"Little black stonefly", "Sulphur", "Hex", "Trico"}

BEST = ["4877", "4507", "5835", "4754", "4979", "5865"]
SELECTIONS = ["3886", "5445", "3870", "4251"]
TYPE_SLUG = {"Dry Flies": "dry-flies", "Nymphs": "nymphs", "Streamers": "streamers",
             "Eggs & Worms": "eggs-worms", "Warmwater Flies": "warmwater-flies",
             "Saltwater Flies": "saltwater-flies"}
TYPE_SHORT = {"Warmwater Flies": "Warmwater", "Saltwater Flies": "Saltwater"}
TYPE_PHOTO = {"Dry Flies": "fly-type-dry-flies", "Nymphs": "fly-type-nymphs-sub-surface",
              "Streamers": "fly-type-streamers-buggers", "Warmwater Flies": "species-bass-panfish",
              "Saltwater Flies": "species-bonefish-permit"}
EGG_FLIES = ["5101", "4576"]  # Eggs & Worms has no stone plate yet: its flies on paper stand in
SPECIES_HERO = [("Trout Flies", "trout"), ("Steelhead Flies", "steelhead"), ("Bass Flies", "bass"),
                ("Pike & Muskie Flies", "pike-muskie"), ("Atlantic Salmon Flies", "atlantic-salmon")]
SPECIES_SLUG = {"Trout Flies": "trout", "Steelhead Flies": "steelhead", "Atlantic Salmon Flies": "atlantic-salmon",
                "Bass Flies": "bass", "Pike & Muskie Flies": "pike-muskie", "Bonefish Flies": "bonefish"}
SALTWATER = {"Bonefish Flies", "Permit Flies", "Tarpon, Snook & Redfish Flies", "Barracuda Flies"}
PROPER = {"reelflies": "ReelFlies", "atlantic": "Atlantic", "san": "San", "juan": "Juan",
          "euro": "Euro", "canada": "Canada", "muskie": "muskie"}

e = html.escape


def sentence(name):
    """Category names are Title Case in the store; the brand sets them in sentence case."""
    words = name.split(" ")
    out = []
    for i, w in enumerate(words):
        low = w.lower()
        if low in PROPER:
            out.append(PROPER[low])
        elif i == 0:
            out.append(w[:1].upper() + w[1:].lower())
        else:
            out.append(low)
    return " ".join(out)


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


def species_name(s):
    return sentence(s["name"].replace(" Flies", ""))


def fly_card(p, eager=False, size="sm"):
    """One specimen card: the photo as shot, name, price per fly, + Add."""
    unit = "fly" if p["unit"] == "fly" else "set"
    loading = 'fetchpriority="high"' if eager else 'loading="lazy"'
    single = len(p["sizes"]) == 1
    label = "Add 1" if (single or unit == "set") else "+ Add"
    sizes = size_range(p)
    sizes_html = f'<p class="fly__line"><span class="fly__sizes">{e(sizes)}</span><span class="fly__inbox" data-inbox hidden></span></p>'
    return f"""<li class="fly fly--{size}" data-id="{p['id']}">
  <article class="fly__card">
    <a class="fly__photo" href="{p['url']}" tabindex="-1" aria-hidden="true"><img src="img/products/{p['img']}" width="720" height="480" alt="" {loading} decoding="async"></a>
    <div class="fly__body">
      <h3 class="fly__name"><a href="{p['url']}">{e(p['name'])}</a></h3>
      <div class="fly__buy">
        <div class="fly__meta"><p class="fly__price"><span class="num">{money(p['price'])}</span> <span class="fly__unit">/ {unit}</span></p>{sizes_html}</div>
        <button class="add" type="button" data-add aria-expanded="false">{label}<span class="visually-hidden">: {e(p['name'])}</span></button>
      </div>
    </div>
    <div class="fly__sizes-panel" data-sizes hidden></div>
  </article>
</li>"""


# ---------------------------------------------------------------- header

def mega_flies():
    rail, panes = [], []
    for n, f in enumerate(CATS["flyTypes"]):
        slug = TYPE_SLUG[f["name"]]
        name = sentence(f["name"])
        rail.append(f'<li><a class="mega__type{" is-active" if n == 0 else ""}" href="{f["url"]}" data-pane-for="{slug}">'
                    f'<span>{e(name)}</span><span class="mega__n num">{f["count"]}</span>{icon("arrow", "icon mega__go")}</a></li>')
        kids = "".join(f'<li><a href="{c["url"]}">{e(sentence(c["name"]))} <span class="num">{c["count"]}</span></a></li>'
                       for c in sorted(f["children"], key=lambda c: -c["count"]))
        photo = TYPE_PHOTO.get(f["name"])
        if photo:
            plate = f'<img class="graded" src="img/stone/{photo}-800.jpg" width="800" height="350" alt="" loading="lazy" decoding="async">'
            plate_cls = "mega__plate"
        else:
            plate = "".join(f'<img src="img/products/{BY_ID[i]["img"]}" width="720" height="480" alt="" loading="lazy" decoding="async">' for i in EGG_FLIES)
            plate_cls = "mega__plate mega__plate--paper"
        panes.append(f"""<div class="mega__pane" data-pane="{slug}"{'' if n == 0 else ' hidden'}>
            <div class="mega__kids-wrap">
              <p class="mega__head"><a href="{f['url']}">{e(name)}</a> <span><span class="num">{f['count']}</span> patterns</span></p>
              <ul class="mega__kids">{kids}</ul>
            </div>
            <a class="{plate_cls}" href="{f['url']}" tabindex="-1" aria-hidden="true">{plate}<span class="mega__plate-name">All {e(name.lower())}</span></a>
          </div>""")
    more = "".join(f'<li><a href="{m["url"]}">{e(sentence(m["name"]))} <span class="num">{m["approx_live_products"]}</span></a></li>' for m in CATS["more"] if m["name"] != "Fly Gear")
    more += '<li><a href="/fly-hook-size-chart/">Hook size chart</a></li>'
    return f"""<div class="mega" id="mega-flies" data-mega-panel hidden>
        <div class="mega__inner mega__inner--flies">
          <ul class="mega__rail">{''.join(rail)}</ul>
          <div class="mega__panes">{''.join(panes)}</div>
        </div>
        <div class="mega__more"><div class="mega__more-inner"><p>Also</p><ul>{more}</ul></div></div>
      </div>"""


def mega_species():
    fresh = [s for s in CATS["species"] if s["name"] not in SALTWATER]
    salt = [s for s in CATS["species"] if s["name"] in SALTWATER]

    def lis(group):
        return "".join(f'<li><a href="{s["url"]}"><span>{e(species_name(s))}</span><span class="num">{s["approx_live_products"]:,}</span></a></li>' for s in group)
    in_now = [h[0] for h in HATCHES if in_season(h[3], NOW)]
    return f"""<div class="mega" id="mega-species" data-mega-panel hidden>
        <div class="mega__inner mega__inner--species">
          <div class="mega__sp"><p class="mega__group">Freshwater</p><ul class="mega__splist">{lis(fresh)}</ul></div>
          <div class="mega__sp"><p class="mega__group">Saltwater</p><ul class="mega__splist">{lis(salt)}</ul></div>
          <a class="mega__hatch" href="#hatch" data-mega-close>
            <span class="mega__hatch-title">On the water in <span data-now-month>{MONTHS[NOW]}</span></span>
            <span class="mega__hatch-line" data-now-list>{e(words_list(in_now))}.</span>
            <span class="mega__hatch-go">The hatch chart{icon("arrow")}</span>
          </a>
        </div>
      </div>"""


def drawer():
    types = "".join(f"""<li><details class="drawer__sub"><summary><span>{e(sentence(f['name']))}</span> <span class="num">{f['count']}</span>{icon('chevron', 'icon drawer__chev')}</summary>
          <ul>{''.join(f'<li><a href="{c["url"]}">{e(sentence(c["name"]))}</a></li>' for c in sorted(f['children'], key=lambda c: -c['count']))}<li><a class="drawer__all" href="{f['url']}">All {e(sentence(f['name']).lower())}</a></li></ul></details></li>"""
                    for f in CATS["flyTypes"])
    species = "".join(f'<li><a href="{s["url"]}">{e(species_name(s))} <span class="num">{s["approx_live_products"]:,}</span></a></li>' for s in CATS["species"])
    return f"""<div class="drawer" id="drawer" hidden data-drawer>
  <div class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <div class="drawer__head"><p class="drawer__title" id="drawer-title">Menu</p><button class="drawer__close" type="button" data-drawer-close>{icon('close')}<span class="visually-hidden">Close menu</span></button></div>
    <nav aria-label="Main">
      <details class="drawer__group" open><summary>Flies{icon('chevron', 'icon drawer__chev')}</summary><ul class="drawer__list">{types}</ul></details>
      <details class="drawer__group"><summary>Species{icon('chevron', 'icon drawer__chev')}</summary><ul class="drawer__list drawer__list--plain">{species}</ul></details>
      <ul class="drawer__links">
        <li><a href="/fly-selections-assortments/">Selections</a></li>
        <li><a href="/reelflies-signature-flies/">Signature flies</a></li>
        <li><a href="#hatch" data-drawer-close>Hatch chart</a></li>
        <li><a href="/fly-gear/">Gear</a></li>
        <li><a href="/learn/">Learn</a></li>
        <li><a href="/account.php">Account</a></li>
        <li><a href="/contact-us/">Wholesale</a></li>
      </ul>
    </nav>
    <p class="drawer__call">{icon('phone')}<span>Questions? Call <a href="tel:+18662504071">1 866 250 4071</a></span></p>
  </div>
</div>"""


# ---------------------------------------------------------------- hero

def hero_ways():
    types = "".join(
        f'<li><a class="way" href="{f["url"]}" data-way="type:{TYPE_SLUG[f["name"]]}" data-way-name="{e(sentence(TYPE_SHORT.get(f["name"], f["name"])))}" data-way-count="{f["count"]}">'
        f'{e(sentence(TYPE_SHORT.get(f["name"], f["name"])))} <span class="way__n num">{f["count"]}</span></a></li>'
        for f in CATS["flyTypes"])
    sp = {s["name"]: s for s in CATS["species"]}
    species = "".join(
        f'<li><a class="way" href="{sp[n]["url"]}" data-way="species:{slug}" data-way-name="{e(species_name(sp[n]))} flies" data-way-count="{sp[n]["approx_live_products"]}">'
        f'{e(species_name(sp[n]))} <span class="way__n num">{sp[n]["approx_live_products"]:,}</span></a></li>'
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


# ---------------------------------------------------------------- fly types

def fly_type_plates():
    big, small = [], []
    order = sorted(CATS["flyTypes"], key=lambda f: -f["count"])
    for f in order:
        name = sentence(f["name"])
        kids = sorted(f["children"], key=lambda c: -c["count"])
        photo = TYPE_PHOTO.get(f["name"])
        if f["name"] in ("Dry Flies", "Nymphs", "Streamers"):
            kids_html = "".join(f'<li><a href="{c["url"]}">{e(sentence(c["name"]))}</a></li>' for c in kids[:5])
            big.append(f"""<li class="plate">
            <a class="plate__photo" href="{f['url']}">
              <img class="graded" src="img/stone/{photo}-800.jpg" srcset="img/stone/{photo}-800.jpg 800w, img/stone/{photo}-1600.jpg 1600w" sizes="(min-width: 1040px) 420px, (min-width: 640px) 50vw, 100vw" width="1600" height="700" alt="" loading="lazy" decoding="async">
              <span class="plate__label"><span class="plate__name">{e(name)}</span><span class="plate__n"><span class="num">{f['count']}</span> patterns</span></span>
            </a>
            <ul class="plate__kids">{kids_html}<li><a class="plate__all" href="{f['url']}">All {e(name.lower())}{icon('arrow')}</a></li></ul>
          </li>""")
        else:
            kids_html = "".join(f'<li><a href="{c["url"]}">{e(sentence(c["name"]))}</a></li>' for c in kids[:3])
            if photo:
                thumb = f'<img class="graded" src="img/stone/{photo}-800.jpg" width="800" height="350" alt="" loading="lazy" decoding="async">'
                tcls = "row-plate__thumb"
            else:
                thumb = "".join(f'<img src="img/products/{BY_ID[i]["img"]}" width="720" height="480" alt="" loading="lazy" decoding="async">' for i in EGG_FLIES)
                tcls = "row-plate__thumb row-plate__thumb--paper"
            small.append(f"""<li class="row-plate">
            <a class="row-plate__link" href="{f['url']}"><span class="{tcls}">{thumb}</span><span class="row-plate__words"><span class="row-plate__name">{e(name)}</span><span class="row-plate__n"><span class="num">{f['count']}</span> patterns</span></span>{icon('arrow', 'icon row-plate__go')}</a>
            <ul class="row-plate__kids">{kids_html}</ul>
          </li>""")
    return "".join(big), "".join(small)


# ---------------------------------------------------------------- hatch chart

def in_season(ranges, m):
    return any(a <= m <= b for a, b in ranges)


def season_words(ranges):
    if ranges == [(0, 11)]:
        return "all year"
    return " and ".join(f"{MONTHS[a]} to {MONTHS[b]}" if a != b else MONTHS[a] for a, b in ranges)


def words_list(items):
    items = [i[:1].upper() + i[1:].lower() if n == 0 else i.lower() for n, i in enumerate(items)]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def hatch_rows():
    rows = []
    for i, (name, latin, sizes, ranges, flies, url, url_name) in enumerate(HATCHES):
        cells = []
        for m in range(12):
            on = in_season(ranges, m)
            prev_on = in_season(ranges, (m - 1) % 12) and m != 0
            next_on = in_season(ranges, (m + 1) % 12) and m != 11
            cls = "track__m"
            if on:
                cls += " is-on"
                if not prev_on:
                    cls += " is-start"
                if not next_on:
                    cls += " is-end"
            if m == NOW:
                cls += " is-now"
            cells.append(f'<span class="{cls}" data-m="{m}"></span>')
        now = in_season(ranges, NOW)
        months_attr = ",".join(f"{a}-{b}" for a, b in ranges)
        head = f"""<span class="hatch__name"><span class="hatch__title">{e(name)}</span><span class="hatch__latin" lang="la">{e(latin)}</span></span>
            <span class="hatch__sizes"><span class="hatch__k">Hooks</span> <span class="num">{sizes}</span></span>
            <span class="track" role="img" aria-label="On the water {season_words(ranges)}">{''.join(cells)}</span>"""
        if flies:
            thumbs = "".join(f'<img src="img/products/{BY_ID[f]["img"]}" width="720" height="480" alt="" loading="lazy" decoding="async">' for f in flies[:3])
            cards = "".join(fly_card(BY_ID[f]) for f in flies)
            n = len(flies)
            rows.append(f"""<li class="hatch__row{' is-now' if now else ''}" data-months="{months_attr}">
          <details class="hatch__d"{' open' if now else ''}>
            <summary class="hatch__sum">
            {head}
            <span class="hatch__cue"><span class="hatch__thumbs" aria-hidden="true">{thumbs}</span><span class="hatch__count"><span class="num">{n}</span> {'fly' if n == 1 else 'flies'}<span class="hatch__long"> {'to try' if name in TO_TRY else 'to match it'}</span></span>{icon('chevron', 'icon hatch__chev')}</span>
            </summary>
            <div class="hatch__flies"><ul class="flies flies--row">{cards}</ul><a class="more" href="{url}">More {e(url_name.lower())}{icon('arrow')}</a></div>
          </details>
        </li>""")
        else:
            rows.append(f"""<li class="hatch__row hatch__row--link{' is-now' if now else ''}" data-months="{months_attr}">
          <a class="hatch__sum" href="{url}">
            {head}
            <span class="hatch__cue hatch__cue--link"><span class="hatch__count">{e(url_name)}</span>{icon('arrow', 'icon hatch__chev')}</span>
          </a>
        </li>""")
    return "".join(rows)


def hook_steps():
    sizes = ["2/0", "1/0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"]
    out = []
    for i, s in enumerate(sizes):
        h = round(64 - i * (64 - 12) / (len(sizes) - 1))
        slug = s.replace("/", "-")
        out.append(f'<li><a href="/fly-hook-size-chart/#size-{slug}"><svg class="hook" viewBox="0 0 32 64" style="height:{h}px" aria-hidden="true" focusable="false"><use href="#i-hook"/></svg><span class="num">{s}</span><span class="visually-hidden"> hook size</span></a></li>')
    return "".join(out)


# ---------------------------------------------------------------- species

def species_band():
    fresh = [s for s in CATS["species"] if s["name"] not in SALTWATER]
    salt = [s for s in CATS["species"] if s["name"] in SALTWATER]

    def lis(group):
        out = []
        for s in group:
            slug = SPECIES_SLUG.get(s["name"], "")
            data = f' data-sp="{slug}" data-sp-name="{e(species_name(s))} flies" data-sp-count="{s["approx_live_products"]}"' if slug else ""
            out.append(f'<li><a class="sp{" is-lit" if slug == "trout" else ""}" href="{s["url"]}"{data}><span class="sp__name">{e(species_name(s))}</span><span class="sp__n"><span class="num">{s["approx_live_products"]:,}</span> patterns</span></a></li>')
        return "".join(out)
    trout = sorted([p for p in PRODUCTS if p["unit"] == "fly" and "trout" in p["species"] and p["id"] not in BEST], key=lambda p: p["rank"])[:3]
    cards = "".join(fly_card(p) for p in trout)
    return lis(fresh), lis(salt), cards


SPRITE = """<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.75" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-box" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 11h18M9 7V5h6v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.6 3.5h2.6l1.4 4-2 1.4a11 11 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>
  <symbol id="i-hook" viewBox="0 0 32 64"><circle cx="22" cy="6" r="3.8" fill="none" stroke="currentColor" stroke-width="2.2" vector-effect="non-scaling-stroke"/><path d="M22 9.8V42a9 9 0 0 1-18 0V26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="M4.4 31l4.4 5.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></symbol>
</svg>"""


def main():
    best_cards = "".join(fly_card(BY_ID[i], eager=(n < 3)) for n, i in enumerate(BEST))
    big, small = fly_type_plates()
    sel_cards = "".join(fly_card(BY_ID[i], size="md") for i in SELECTIONS)
    sig = BY_ID["3899"]
    month_heads = "".join(f'<span class="months__m{" is-now" if m == NOW else ""}" data-m="{m}"><abbr title="{MONTHS[m]}">{MONTHS[m][:3]}</abbr></span>' for m in range(12))
    in_now = [h[0] for h in HATCHES if in_season(h[3], NOW)]
    sp_fresh, sp_salt, sp_cards = species_band()
    catalogue = json.dumps({"products": PRODUCTS,
                            "flyTypes": [{"name": sentence(f["name"]), "slug": TYPE_SLUG[f["name"]], "url": f["url"], "count": f["count"],
                                          "children": [{**c, "name": sentence(c["name"])} for c in f["children"]]} for f in CATS["flyTypes"]],
                            "species": [{**s, "name": sentence(s["name"])} for s in CATS["species"]],
                            "more": [{**m, "name": sentence(m["name"])} for m in CATS["more"]],
                            "best": BEST,
                            "hatches": [{"name": h[0], "months": h[3]} for h in HATCHES]}, separators=(",", ":"))

    page = TEMPLATE.format(
        sprite=SPRITE, mega_flies=mega_flies(), mega_species=mega_species(), drawer=drawer(),
        ways=hero_ways(), best=best_cards, plates_big=big, plates_small=small,
        months=month_heads, hatch=hatch_rows(), now_month=MONTHS[NOW], now_index=NOW, now_list=e(words_list(in_now)),
        hooks=hook_steps(), sig_card=fly_card(sig, size="lg"),
        sp_fresh=sp_fresh, sp_salt=sp_salt, sp_cards=sp_cards,
        selections=sel_cards, catalogue=catalogue.replace("</", "<\\/"),
        icon_search=icon("search"), icon_user=icon("user"), icon_box=icon("box"), icon_menu=icon("menu"),
        icon_chev=icon("chevron", "icon nav__chev"), icon_close=icon("close"), icon_arrow=icon("arrow"),
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
<meta name="description" content="Hand-tied fly fishing flies from a family fly shop in Tillsonburg, Ontario. Nearly 2,000 patterns, priced per fly, by fly type, by the fish you're after, or by what's hatching this month.">
<meta name="theme-color" content="#29241f">
<link rel="preload" href="fonts/ArchivoExpanded-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/Archivo-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" as="image" href="img/stone/hero-stone-1600.jpg" media="(min-width: 1040px)" fetchpriority="high">
<link rel="preload" as="image" href="img/stone/hero-stone-portrait.jpg" media="(max-width: 1039px)" fetchpriority="high">
<link rel="stylesheet" href="styles.css">
</head>
<body>
{sprite}
<a class="skip" href="#main">Skip to content</a>

<!-- Stencil: components/common/utility-strip (theme settings text; the phone number from store settings) -->
<div class="strip">
  <div class="strip__inner">
    <p>Free shipping in Canada on fly orders over <span class="num">$60</span></p>
    <p class="strip__mid">100% Canadian, family-run since <span class="num">2003</span></p>
    <p class="strip__end"><a href="tel:+18662504071">{icon_phone}<span class="num">1 866 250 4071</span></a><a href="https://reelflies.com/">Shopping from the US? ReelFlies.com</a></p>
  </div>
</div>

<!-- Stencil: components/common/header + navigation (the category tree, depth 2, rendered on the server) -->
<header class="head" data-head>
  <div class="head__bar">
    <button class="head__menu" type="button" aria-expanded="false" aria-controls="drawer" data-drawer-btn>{icon_menu}<span class="visually-hidden">Menu</span></button>
    <a class="brand" href="/"><img src="img/brand/reelflies-logo.png" width="133" height="95" alt="ReelFlies home"></a>
    <nav class="nav" aria-label="Main">
      <ul class="nav__list">
        <li class="nav__item" data-mega><button class="nav__btn" type="button" aria-expanded="false" aria-controls="mega-flies">Flies{icon_chev}</button>{mega_flies}</li>
        <li class="nav__item" data-mega><button class="nav__btn" type="button" aria-expanded="false" aria-controls="mega-species">Species{icon_chev}</button>{mega_species}</li>
        <li class="nav__item"><a class="nav__btn" href="/fly-selections-assortments/">Selections</a></li>
        <li class="nav__item"><a class="nav__btn" href="/reelflies-signature-flies/">Signature flies</a></li>
        <li class="nav__item"><a class="nav__btn" href="#hatch">Hatch chart</a></li>
        <li class="nav__item"><a class="nav__btn" href="/fly-gear/">Gear</a></li>
        <li class="nav__item nav__item--aside"><a class="nav__btn" href="/contact-us/">Wholesale</a></li>
      </ul>
    </nav>
    <form class="search" role="search" action="/search.php" method="get" data-search>
      <label class="visually-hidden" for="q">Search flies</label>
      {icon_search}
      <input id="q" name="search_query" type="search" placeholder="Search caddis, size 16…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="q-list" aria-autocomplete="list">
      <button class="search__go" type="submit">Search</button>
      <div class="suggest" data-suggest hidden>
        <ul class="suggest__list" id="q-list" role="listbox" aria-label="Suggestions"></ul>
        <a class="suggest__all" href="/search.php" data-suggest-all>See all results</a>
      </div>
    </form>
    <a class="head__link" href="/account.php">{icon_user}<span class="head__label">Account</span></a>
    <button class="cart-btn" type="button" aria-controls="box" aria-expanded="false" data-box-btn>{icon_box}<span class="head__label">Box</span><span class="cart-btn__count num" data-count>0</span><span class="visually-hidden" data-count-label>flies in your box</span></button>
  </div>
</header>
<div class="mega-scrim" data-mega-scrim hidden></div>
{drawer}

<main id="main">

  <!-- Stencil: pages/home.html region "home_stone": a Page Builder image (the commissioned riverbank stone); best sellers from front matter products.top_sellers -->
  <section class="stone" aria-labelledby="stone-title">
    <picture class="stone__photo">
      <source media="(max-width: 1039px)" srcset="img/stone/hero-stone-portrait.jpg" width="700" height="1600">
      <img class="graded" src="img/stone/hero-stone-1600.jpg" width="1600" height="700" alt="" fetchpriority="high" decoding="async">
    </picture>
    <div class="stone__inner">
      <div class="stone__lead">
        <h1 id="stone-title">Nearly 2,000 patterns, sold by the fly.</h1>
        <p class="stone__line">Hand-tied flies from <span class="num">$0.50</span> each, so you buy exactly the sizes you fish. Many are tied right here in Canada.</p>
        {ways}
      </div>
      <div class="stone__lay">
        <div class="lay__head">
          <h2 class="lay__label" data-lay-title>Best sellers</h2>
          <a class="lay__all" href="/best-sellers/" data-lay-all><span>See all</span>{icon_arrow}</a>
        </div>
        <ul class="flies flies--stone" data-lay>{best}</ul>
      </div>
    </div>
  </section>

  <!-- Stencil: the fly-type branch of the category tree, rendered on the server (every link crawlable); plates are category images -->
  <section class="types" aria-labelledby="types-title">
    <div class="wrap">
      <header class="sec-head">
        <h2 id="types-title">Shop by fly type</h2>
        <p>Every fly is filed by what it is and how it fishes: on top, under the surface, or stripped back through the current.</p>
      </header>
      <ul class="plates">{plates_big}</ul>
      <ul class="row-plates">{plates_small}</ul>
    </div>
  </section>

  <!-- Stencil: a Web Page's chart, placed by a Page Builder widget; matching flies by product id through the Storefront GraphQL API -->
  <section class="hatch" id="hatch" aria-labelledby="hatch-title">
    <div class="wrap hatch__grid">
      <header class="hatch__intro">
        <h2 id="hatch-title">On the water in <span data-now-month>{now_month}</span></h2>
        <p class="hatch__now"><span data-now-list>{now_list}</span>.</p>
        <p>General timing for Ontario trout streams. Every river keeps its own clock, so treat it as a starting point and match what you see.</p>
        <p class="hatch__how">Open any hatch to see the flies that match it, in the hook sizes it calls for.</p>
      </header>
      <div class="hatch__chart" style="--now: {now_index}">
        <div class="months" aria-hidden="true"><span class="months__pad"></span><span class="months__track">{months}</span><span class="months__pad months__pad--end"></span></div>
        <ol class="hatch__rows" data-hatch-rows>{hatch}</ol>
      </div>
    </div>
    <div class="wrap hooks">
      <div class="hooks__text">
        <h3>Bigger number, smaller hook.</h3>
        <p>Hook sizes run backwards: a size 18 midge is tiny, a size 2 streamer is big, and the aughts (1/0, 2/0) go bigger still. Most trout flies sit between 10 and 20.</p>
        <a class="more" href="/fly-hook-size-chart/">Hook size chart{icon_arrow}</a>
      </div>
      <ol class="hookstep">{hooks}</ol>
    </div>
  </section>

  <!-- Stencil: the species branch of the category tree; the laid-out flies from GraphQL by category -->
  <section class="species" aria-labelledby="species-title">
    <div class="wrap species__grid">
      <div class="species__text">
        <h2 id="species-title">What are you fishing for?</h2>
        <p>Every fly is also filed by the fish it's tied for. Point at a fish to see a few of its flies.</p>
        <div class="species__groups">
          <div><h3 class="species__group">Freshwater</h3><ul class="sp-list">{sp_fresh}</ul></div>
          <div><h3 class="species__group">Saltwater</h3><ul class="sp-list">{sp_salt}</ul></div>
        </div>
      </div>
      <div class="species__lay">
        <div class="lay__head lay__head--moss">
          <p class="species__lay-title" data-sp-title>Trout flies</p>
          <a class="lay__all" href="/trout-flies/" data-sp-all><span>All 1,600</span>{icon_arrow}</a>
        </div>
        <ul class="flies flies--moss" data-sp-lay>{sp_cards}</ul>
      </div>
    </div>
  </section>

  <section class="signature" aria-labelledby="sig-title">
    <img class="signature__photo graded" src="img/stone/fly-type-dry-flies-1600.jpg" width="1600" height="700" alt="" loading="lazy" decoding="async">
    <div class="wrap signature__grid">
      <div class="signature__text">
        <h2 id="sig-title">Tied for ReelFlies</h2>
        <p>355 Signature patterns of our own, each one also filed under its fly type. The Psycho Caddis is one of them, with black hackle and orange rubber legs.</p>
        <a class="more more--on-dark" href="/reelflies-signature-flies/">All Signature flies{icon_arrow}</a>
      </div>
      <div class="signature__lay">
        <p class="signature__note" aria-hidden="true">Our take on the elk hair caddis<svg viewBox="0 0 90 60" class="signature__arrow"><path d="M4 8c22 2 46 10 60 30 4 6 7 11 8 16M58 44l14 11 4-17"/></svg></p>
        <ul class="flies flies--feature">{sig_card}</ul>
      </div>
    </div>
  </section>

  <section class="selections" aria-labelledby="sel-title">
    <div class="wrap">
      <header class="sec-head sec-head--split">
        <h2 id="sel-title">Selections: a mix of patterns, one price</h2>
        <p>Ready-made sets for a day on the water or a box that needs filling. The flies ship loose; a fly box in a photo isn't included.</p>
      </header>
      <ul class="flies flies--grid">{selections}</ul>
      <a class="more" href="/fly-selections-assortments/">All 58 selections{icon_arrow}</a>
    </div>
  </section>

  <section class="shop" aria-labelledby="shop-title">
    <div class="wrap shop__grid">
      <figure class="shop__photo">
        <img src="img/brand/shop-front.jpg" width="600" height="450" alt="The ReelFlies shop on Broadway in Tillsonburg, Ontario: a dark painted storefront with the trout logo in the window" loading="lazy" decoding="async">
        <figcaption>93 Broadway, Tillsonburg, Ontario</figcaption>
      </figure>
      <div class="shop__text">
        <h2 id="shop-title">A family fly shop on Broadway in Tillsonburg</h2>
        <p class="shop__lead">ReelFlies has been 100% Canadian and family-run since 2003. We're led by fly fishers and headed by Steve B, who has over 40 years of fly fishing behind him.</p>
        <dl class="facts">
          <div><dt>The range</dt><dd>Nearly 2,000 hand-tied patterns, with new ones added all the time.</dd></div>
          <div><dt>The hooks</dt><dd>Many tied locally, on hooks from Mustad, Daiichi, Maruto, Dai-Riki, Kamasan and VMC.</dd></div>
          <div><dt>For tackle shops</dt><dd>We wholesale flies to many well-known tackle shops in Canada. <a href="/contact-us/">Ask about a trade account</a>.</dd></div>
        </dl>
        <p class="promise">We stand behind every fly we sell.</p>
        <p class="shop__call">{icon_phone}<span>Questions about flies, sizes or an order? Call us toll free at <a href="tel:+18662504071">1 866 250 4071</a>. Walk-ins by appointment.</span></p>
        <p class="signoff">Tight lines from us all at ReelFlies®</p>
      </div>
    </div>
  </section>

</main>

<!-- Stencil: components/common/footer -->
<footer class="foot">
  <div class="wrap foot__news">
    <form class="news" action="/subscribe.php" method="post" data-news>
      <h2>New patterns and the odd sale, a few emails a year.</h2>
      <label class="visually-hidden" for="news-email">Email address</label>
      <div class="news__row"><input id="news-email" name="nl_email" type="email" autocomplete="email" placeholder="you@example.com" required><button type="submit">Subscribe</button></div>
      <p class="news__fine">You can unsubscribe at any time.</p>
    </form>
  </div>
  <div class="wrap foot__grid">
    <div class="foot__brand"><span class="foot__plate"><img src="img/brand/reelflies-logo.png" width="133" height="95" alt="ReelFlies"></span>
      <address>ReelFlies, Digital Barn Ltd.<br>93 Broadway St<br>Tillsonburg, ON N4G 3P5</address>
      <p><a href="tel:+18662504071">1 866 250 4071</a> toll free<br>Walk-ins by appointment</p>
    </div>
    <nav aria-labelledby="f-types"><h2 id="f-types">Fly types</h2><ul>
      <li><a href="/dry-flies/">Dry flies</a></li><li><a href="/nymphs/">Nymphs</a></li><li><a href="/streamers/">Streamers</a></li><li><a href="/eggs-worms/">Eggs &amp; worms</a></li><li><a href="/warmwater-flies/">Warmwater flies</a></li><li><a href="/saltwater-flies/">Saltwater flies</a></li><li><a href="/species/">Flies by species</a></li>
    </ul></nav>
    <nav aria-labelledby="f-more"><h2 id="f-more">More</h2><ul>
      <li><a href="/fly-selections-assortments/">Selections &amp; assortments</a></li><li><a href="/reelflies-signature-flies/">Signature flies</a></li><li><a href="/fly-gear/">Fly gear</a></li><li><a href="/clearance-flies/">Clearance</a></li><li><a href="/fly-hook-size-chart/">Hook size chart</a></li><li><a href="/learn/">Learn</a></li>
    </ul></nav>
    <nav aria-labelledby="f-help"><h2 id="f-help">Help</h2><ul>
      <li><a href="/shipping-returns/">Shipping &amp; returns</a></li><li><a href="/help/">Help &amp; FAQ</a></li><li><a href="/contact-us/">Contact us</a></li><li><a href="/about-us/">About ReelFlies</a></li><li><a href="/privacy-policy/">Privacy</a></li>
    </ul></nav>
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
