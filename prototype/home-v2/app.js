/* ReelFlies home prototype v2: behaviour over server-rendered markup.
   The box stands in for the Cart API (/api/storefront/carts) and persists
   in localStorage; every other piece maps to stock BigCommerce data. */
(() => {
  'use strict';

  const doc = document;
  const cat = JSON.parse(doc.getElementById('catalogue').textContent);
  const byId = new Map(cat.products.map((p) => [p.id, p]));
  const FREE_SHIP = 60;
  const HOOK_ORDER = ['6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'];
  const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => Array.from(el.querySelectorAll(sel));
  const money = (v) => '$' + v.toFixed(2);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const statusEl = $('[data-status]');
  const say = (msg) => { statusEl.textContent = ''; requestAnimationFrame(() => { statusEl.textContent = msg; }); };

  /* ---------- The box (cart stand-in) ---------- */
  const KEY = 'rf-prototype-box';
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (v && v.lines && Array.isArray(v.order)) {
        v.order = v.order.filter((id) => byId.has(id) && v.lines[id]);
        return v;
      }
    } catch (err) { /* private mode or cleared storage: start empty */ }
    return { lines: {}, order: [] };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(box)); } catch (err) { /* not persisted */ } }
  let box = load();

  const qty = (id, size) => (box.lines[id] && box.lines[id][size]) || 0;
  const qtyAll = (id) => Object.values(box.lines[id] || {}).reduce((a, b) => a + b, 0);

  function totals() {
    let units = 0; let total = 0; let allFlies = true;
    for (const id of box.order) {
      const p = byId.get(id); const n = qtyAll(id);
      units += n; total += n * p.price;
      if (p.unit !== 'fly') allFlies = false;
    }
    return { units, total, patterns: box.order.length, allFlies };
  }

  function countWords(t) {
    if (!t.units) return 'Your box is empty';
    if (t.allFlies) return `${t.units} ${t.units === 1 ? 'fly' : 'flies'}, ${t.patterns} ${t.patterns === 1 ? 'pattern' : 'patterns'}`;
    return `${t.units} ${t.units === 1 ? 'item' : 'items'}`;
  }

  function change(id, size, delta, source) {
    const p = byId.get(id);
    if (!p) return;
    const before = qty(id, size);
    const after = Math.max(0, before + delta);
    if (after === before) return;
    box.lines[id] = box.lines[id] || {};
    if (after) box.lines[id][size] = after; else delete box.lines[id][size];
    if (!Object.keys(box.lines[id]).length) { delete box.lines[id]; box.order = box.order.filter((x) => x !== id); }
    else if (!box.order.includes(id)) box.order.push(id);
    save();
    const added = delta > 0;
    render({ newId: added && before === 0 && qtyAll(id) === after ? id : null });
    const t = totals();
    const what = p.sizes.length ? `size ${size} ${p.name}` : p.name;
    say(`${added ? 'Added' : 'Removed'} 1 × ${what}. ${countWords(t)} in your box.`);
    if (added) { fly(source, id); bump(); }
  }

  /* ---------- Cards ---------- */
  function sizeRange(p) {
    if (!p.sizes.length) return '';
    return p.sizes.length === 1 ? `Size ${p.sizes[0]}` : `Sizes ${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}`;
  }

  function cardHTML(p, extra = '') {
    const unit = p.unit === 'fly' ? 'fly' : 'set';
    const single = p.sizes.length === 1 || unit === 'set';
    const sizes = sizeRange(p);
    return `<li class="fly fly--sm ${extra}" data-id="${p.id}">
  <article class="fly__card">
    <a class="fly__photo" href="${p.url}" tabindex="-1" aria-hidden="true"><img src="img/products/${p.img}" width="720" height="480" alt="" decoding="async"></a>
    <div class="fly__body">
      <h3 class="fly__name"><a href="${p.url}">${esc(p.name)}</a></h3>
      <div class="fly__buy">
        <div class="fly__meta"><p class="fly__price"><span class="num">${money(p.price)}</span> <span class="fly__unit">/ ${unit}</span></p><p class="fly__line"><span class="fly__sizes">${sizes}</span><span class="fly__inbox" data-inbox hidden></span></p></div>
        <button class="add" type="button" data-add aria-expanded="false">${single ? 'Add 1' : '+ Add'}<span class="visually-hidden">: ${esc(p.name)}</span></button>
      </div>
    </div>
    <div class="fly__sizes-panel" data-sizes hidden></div>
  </article>
</li>`;
  }

  function stepFor(size) {
    const i = HOOK_ORDER.indexOf(size);
    return i < 0 ? 0.5 : 1 - (i / (HOOK_ORDER.length - 1)) * 0.82;
  }

  function stripHTML(p) {
    const cells = p.sizes.map((s) => {
      const q = qty(p.id, s);
      const out = p.soldOut.includes(s);
      if (out) {
        return `<li class="sz"><button class="sz__btn" type="button" disabled aria-label="Size ${s}, sold out"><span class="sz__step" style="--k:${stepFor(s)}"></span><span>${s}</span></button></li>`;
      }
      return `<li class="sz"><button class="sz__btn${q ? ' has-count' : ''}" type="button" data-size="${s}" aria-label="Add one, size ${s}${q ? `, ${q} in your box` : ''}"><span class="sz__step" style="--k:${stepFor(s)}"></span><span>${s}</span>${q ? `<span class="sz__count">${q}</span>` : ''}</button>${q ? `<button class="sz__minus" type="button" data-minus="${s}" aria-label="Remove one, size ${s}">−1</button>` : ''}</li>`;
    }).join('');
    const sold = p.soldOut.length ? `<span>${p.soldOut.length === 1 ? `Size ${p.soldOut[0]} is` : `Sizes ${p.soldOut.join(', ')} are`} sold out.</span>` : '<span>Largest hook first.</span>';
    return `<p class="sizes__hint" id="hint-${p.id}">Choose a size to add one. Choose it again for more.</p>
<ol class="sizes__strip" aria-describedby="hint-${p.id}">${cells}</ol>
<div class="sizes__foot">${sold}<button class="sizes__done" type="button" data-done>Done</button></div>`;
  }

  function syncCard(li) {
    const p = byId.get(li.dataset.id);
    if (!p) return;
    const n = qtyAll(p.id);
    li.classList.toggle('is-in', n > 0);
    const tag = $('[data-inbox]', li);
    if (n) {
      const parts = p.sizes.length ? Object.entries(box.lines[p.id]).sort((a, b) => HOOK_ORDER.indexOf(a[0]) - HOOK_ORDER.indexOf(b[0])).map(([s, q]) => `${q} × ${s}`).join(', ') : '';
      // the line is reserved on every card, so this never moves the layout. Say which sizes are in the box
      // in the longest form the line holds: full, then compact, then the count alone.
      const line = $('.fly__line', li);
      const lines = Object.entries(box.lines[p.id] || {}).sort((a, b) => HOOK_ORDER.indexOf(a[0]) - HOOK_ORDER.indexOf(b[0]));
      const forms = p.sizes.length > 1
        ? [`In your box: ${parts}`, `In box: ${lines.map(([s, q]) => (q > 1 ? `${s} ×${q}` : s)).join(', ')}`, `${n} in your box`]
        : [`${n} in your box`];
      tag.hidden = false;
      for (const text of forms) {
        tag.textContent = text;
        if (line.scrollWidth <= line.clientWidth + 1) break;
      }
      tag.title = p.sizes.length > 1 ? `In your box: ${parts}` : '';
    } else tag.hidden = true;
    const panel = $('[data-sizes]', li);
    if (!panel.hidden) {
      const focusedSize = doc.activeElement && li.contains(doc.activeElement) ? (doc.activeElement.dataset.size || doc.activeElement.dataset.minus) : null;
      const wasMinus = doc.activeElement && doc.activeElement.dataset && doc.activeElement.dataset.minus;
      panel.innerHTML = stripHTML(p);
      if (focusedSize) {
        const target = (wasMinus && $(`[data-minus="${CSS.escape(focusedSize)}"]`, panel)) || $(`[data-size="${CSS.escape(focusedSize)}"]`, panel);
        if (target) target.focus();
      }
    }
  }

  function openSizes(li, open) {
    const p = byId.get(li.dataset.id);
    const panel = $('[data-sizes]', li);
    const btn = $('[data-add]', li);
    if (open) {
      $$('.fly.is-open').forEach((other) => { if (other !== li) openSizes(other, false); });
      panel.innerHTML = stripHTML(p);
      panel.hidden = false;
      // keep the strip on screen: near the right edge it opens leftwards
      panel.classList.remove('is-flip');
      if (panel.getBoundingClientRect().right > doc.documentElement.clientWidth - 8) panel.classList.add('is-flip');
      li.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      const first = $('.sz__btn:not(:disabled)', panel);
      if (first) first.focus();
    } else {
      panel.hidden = true;
      li.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  doc.addEventListener('click', (ev) => {
    const addBtn = ev.target.closest('[data-add]');
    if (addBtn) {
      const li = addBtn.closest('.fly');
      const p = byId.get(li.dataset.id);
      if (p.sizes.length > 1) openSizes(li, !li.classList.contains('is-open'));
      else change(p.id, p.sizes[0] || '', 1, li);
      return;
    }
    const sz = ev.target.closest('[data-size]');
    if (sz) { const li = sz.closest('.fly'); change(li.dataset.id, sz.dataset.size, 1, li); return; }
    const minus = ev.target.closest('[data-minus]');
    if (minus) { const li = minus.closest('.fly'); change(li.dataset.id, minus.dataset.minus, -1, li); return; }
    const done = ev.target.closest('[data-done]');
    if (done) { const li = done.closest('.fly'); openSizes(li, false); $('[data-add]', li).focus(); }
  });

  doc.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const li = ev.target.closest && ev.target.closest('.fly.is-open');
    if (li) { openSizes(li, false); $('[data-add]', li).focus(); }
  });

  /* ---------- The order line, the box sheet and the header count ---------- */
  const thumbs = $('[data-thumbs]');
  const sumEl = $('[data-sum]');
  const shipEl = $('[data-ship]');
  const checkout = $('[data-checkout]');
  const totalEl = $('[data-total]');
  const countEl = $('[data-count]');
  const countLabel = $('[data-count-label]');
  const cartBtn = $('.cart-btn');
  const boxEl = $('[data-box]');
  const boxBody = $('[data-box-body]');

  function shipWords(t) {
    if (!t.units) return 'Free standard shipping in Canada on fly orders over <span class="num">$60</span>.';
    if (t.total >= FREE_SHIP) return '<strong>Free standard shipping</strong> in Canada on this fly order.';
    return `<strong class="num">${money(FREE_SHIP - t.total)}</strong> more for free standard shipping in Canada.`;
  }

  function render(opts = {}) {
    const t = totals();
    // header count
    countEl.textContent = t.units;
    countLabel.textContent = t.allFlies ? `${t.units === 1 ? 'fly' : 'flies'} in your box` : 'items in your box';
    cartBtn.classList.toggle('has-flies', t.units > 0);
    // order line
    const recent = box.order.slice(-4);
    thumbs.innerHTML = recent.map((id) => `<span class="orderline__thumb${id === opts.newId ? ' is-new' : ''}" data-thumb="${id}"><img src="img/products/${byId.get(id).img}" alt=""></span>`).join('');
    sumEl.textContent = countWords(t);
    shipEl.innerHTML = shipWords(t);
    checkout.setAttribute('aria-disabled', t.units ? 'false' : 'true');
    totalEl.textContent = t.units ? money(t.total) : '';
    // cards
    $$('.fly').forEach(syncCard);
    // box sheet
    if (!boxEl.hidden) renderBox();
  }

  function renderBox() {
    const t = totals();
    if (!t.units) {
      boxBody.innerHTML = '<p class="box__empty">Nothing in your box yet. Tap + Add on any fly to start.</p>';
      return;
    }
    const groups = box.order.map((id) => {
      const p = byId.get(id);
      const sizes = Object.keys(box.lines[id]).sort((a, b) => HOOK_ORDER.indexOf(a) - HOOK_ORDER.indexOf(b));
      const lines = sizes.map((s) => {
        const q = box.lines[id][s];
        const label = s ? `Size ${s}` : (p.unit === 'fly' ? 'One size' : 'Set');
        return `<div class="box__line"><span class="box__size">${label}</span>
<span class="stepper" role="group" aria-label="${esc(p.name)}, ${label}"><button type="button" data-box-step="-1" data-id="${id}" data-s="${s}" aria-label="Remove one">−</button><output aria-live="off">${q}</output><button type="button" data-box-step="1" data-id="${id}" data-s="${s}" aria-label="Add one">+</button></span>
<span class="box__lt num">${money(q * p.price)}</span></div>`;
      }).join('');
      return `<div class="box__pattern"><img src="img/products/${p.img}" alt=""><div><p class="box__pname">${esc(p.name)}</p><div class="box__lines">${lines}</div></div></div>`;
    }).join('');
    const pct = Math.min(100, (t.total / FREE_SHIP) * 100);
    boxBody.innerHTML = `${groups}
<p class="box__total"><span>${countWords(t)}</span><span class="num">${money(t.total)}</span></p>
<div class="box__meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
<p class="box__ship">${shipWords(t)} Fly boxes and gear not included.</p>
<a class="buy box__go" href="/checkout">Check out</a>`;
  }

  boxBody.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-box-step]');
    if (!b) return;
    const id = b.dataset.id; const s = b.dataset.s; const d = Number(b.dataset.boxStep);
    change(id, s, d, null);
    const again = $(`[data-box-step="${d}"][data-id="${id}"][data-s="${CSS.escape(s)}"]`, boxBody);
    if (again) again.focus(); else $('.box__head h2', boxEl).focus();
  });

  let boxOpener = null;
  function setBox(open, opener) {
    boxEl.hidden = !open;
    $$('[data-box-btn]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
    if (open) {
      boxOpener = opener || null;
      renderBox();
      const h = $('.box__head h2', boxEl); h.tabIndex = -1; h.focus();
    } else if (boxOpener) { boxOpener.focus(); boxOpener = null; }
  }
  $$('[data-box-btn]').forEach((b) => b.addEventListener('click', () => setBox(boxEl.hidden, b)));
  $('[data-box-close]').addEventListener('click', () => setBox(false));
  boxEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setBox(false); });

  function bump() {
    cartBtn.classList.remove('is-bumped');
    void cartBtn.offsetWidth;
    cartBtn.classList.add('is-bumped');
  }

  // a fly dropping from the stone into the order line
  function fly(sourceLi, id) {
    if (!sourceLi || !motionOK()) return;
    const img = $('.fly__photo img', sourceLi);
    const target = $(`[data-thumb="${id}"]`, thumbs) || thumbs;
    if (!img || !target) return;
    const a = img.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || a.bottom < 0 || a.top > innerHeight) return;
    const el = doc.createElement('div');
    el.className = 'flight';
    el.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    el.innerHTML = `<img src="${img.currentSrc || img.src}" alt="">`;
    doc.body.appendChild(el);
    const sx = b.width / a.width; const sy = b.height / a.height;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${sx}, ${sy})`;
      el.style.opacity = '0.6';
    }));
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- Ways in: a name surfaces the flies it covers ---------- */
  const lay = $('[data-lay]');
  const layTitle = $('[data-lay-title]');
  const layAll = $('[data-lay-all]');
  let current = 'best';
  let pending = 0;

  function setLay(key, link) {
    if (key === current) return;
    current = key;
    let list; let title; let href; let allText;
    if (key === 'best') {
      list = cat.best.map((id) => byId.get(id));
      title = 'Best sellers'; href = '/best-sellers/'; allText = 'See all';
    } else {
      const [kind, slug] = key.split(':');
      list = cat.products
        .filter((p) => p.unit === 'fly' && (kind === 'type' ? p.types.includes(slug) : p.species.includes(slug)))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 6);
      title = link.dataset.wayName;
      href = link.getAttribute('href');
      allText = `All ${Number(link.dataset.wayCount).toLocaleString('en-CA')}`;
    }
    $$('.way.is-lit').forEach((w) => w.classList.remove('is-lit'));
    if (link) link.classList.add('is-lit');
    const swap = () => {
      lay.innerHTML = list.map((p) => cardHTML(p, motionOK() ? 'is-arriving' : '')).join('');
      layTitle.innerHTML = key === 'best' ? title : `${esc(title)} <button class="lay__back" type="button" data-lay-back>Best sellers</button>`;
      $('span', layAll).textContent = allText;
      layAll.setAttribute('href', href);
      $$('.fly', lay).forEach(syncCard);
    };
    if (motionOK()) { $$('.fly', lay).forEach((li) => li.classList.add('is-shade')); setTimeout(swap, 160); } else swap();
  }

  $$('[data-way]').forEach((link) => {
    const key = link.dataset.way;
    link.addEventListener('pointerenter', () => {
      if (!canHover.matches) return;
      clearTimeout(pending);
      pending = setTimeout(() => setLay(key, link), 140);
    });
    link.addEventListener('pointerleave', () => clearTimeout(pending));
    link.addEventListener('focus', () => { clearTimeout(pending); setLay(key, link); });
  });
  layTitle.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-lay-back]')) return;
    setLay('best', null);
    say('Showing best sellers.');
    layTitle.tabIndex = -1; layTitle.focus();
  });

  /* ---------- Mega menu (desktop) ---------- */
  const scrim = $('[data-mega-scrim]');
  const megaItems = $$('[data-mega]');
  let openItem = null;
  let hoverTimer = 0;
  function setMega(item, open) {
    const btn = $('.nav__btn', item);
    const panel = $('[data-mega-panel]', item);
    if (open) {
      if (openItem && openItem !== item) setMega(openItem, false);
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      scrim.hidden = false;
      openItem = item;
    } else {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (openItem === item) { openItem = null; scrim.hidden = true; }
    }
  }
  megaItems.forEach((item) => {
    const btn = $('.nav__btn', item);
    btn.addEventListener('click', () => setMega(item, btn.getAttribute('aria-expanded') !== 'true'));
    item.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => setMega(item, true), openItem ? 0 : 120);
    });
    item.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => setMega(item, false), 260);
    });
    item.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && openItem === item) { setMega(item, false); btn.focus(); }
    });
    item.addEventListener('focusout', (ev) => {
      if (openItem === item && !item.contains(ev.relatedTarget)) setMega(item, false);
    });
  });
  scrim.addEventListener('click', () => { if (openItem) setMega(openItem, false); });
  $$('[data-mega-close]').forEach((a) => a.addEventListener('click', () => { if (openItem) setMega(openItem, false); }));

  // the fly-type rail: pointing at or focusing a type shows its branch
  $$('[data-pane-for]').forEach((link) => {
    const show = () => {
      const slug = link.dataset.paneFor;
      $$('[data-pane-for]').forEach((l) => l.classList.toggle('is-active', l === link));
      $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== slug; });
    };
    let t = 0;
    link.addEventListener('pointerenter', () => { clearTimeout(t); t = setTimeout(show, 70); });
    link.addEventListener('pointerleave', () => clearTimeout(t));
    link.addEventListener('focus', show);
  });

  /* ---------- Drawer (phone and tablet) ---------- */
  const drawerEl = $('[data-drawer]');
  const drawerBtn = $('[data-drawer-btn]');
  function setDrawer(open) {
    drawerEl.hidden = !open;
    drawerBtn.setAttribute('aria-expanded', String(open));
    doc.body.style.overflow = open ? 'hidden' : '';
    if (open) $('.drawer__close', drawerEl).focus(); else drawerBtn.focus();
  }
  drawerBtn.addEventListener('click', () => setDrawer(true));
  $$('[data-drawer-close]', drawerEl).forEach((b) => b.addEventListener('click', () => setDrawer(false)));
  drawerEl.addEventListener('click', (ev) => { if (ev.target === drawerEl) setDrawer(false); });
  drawerEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { setDrawer(false); return; }
    if (ev.key !== 'Tab') return;
    const focusables = $$('a[href], button, summary', drawerEl).filter((el) => el.offsetParent !== null);
    const first = focusables[0]; const last = focusables[focusables.length - 1];
    if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  /* ---------- Species: a fish lays out a few of its flies on the moss ---------- */
  const spLay = $('[data-sp-lay]');
  const spTitle = $('[data-sp-title]');
  const spAll = $('[data-sp-all]');
  let spCurrent = 'trout';
  let spTimer = 0;
  function setSpecies(link) {
    const slug = link.dataset.sp;
    if (!slug || slug === spCurrent) return;
    const list = cat.products.filter((p) => p.unit === 'fly' && p.species.includes(slug)).sort((a, b) => a.rank - b.rank).slice(0, 3);
    if (!list.length) return;
    spCurrent = slug;
    $$('.sp.is-lit').forEach((x) => x.classList.remove('is-lit'));
    link.classList.add('is-lit');
    const swap = () => {
      spLay.innerHTML = list.map((p) => cardHTML(p, motionOK() ? 'is-arriving' : '')).join('');
      spTitle.textContent = link.dataset.spName;
      $('span', spAll).textContent = `All ${Number(link.dataset.spCount).toLocaleString('en-CA')}`;
      spAll.setAttribute('href', link.getAttribute('href'));
      $$('.fly', spLay).forEach(syncCard);
    };
    if (motionOK()) { $$('.fly', spLay).forEach((li) => li.classList.add('is-shade')); setTimeout(swap, 160); } else swap();
  }
  $$('[data-sp]').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (!canHover.matches) return;
      clearTimeout(spTimer);
      spTimer = setTimeout(() => setSpecies(link), 140);
    });
    link.addEventListener('pointerleave', () => clearTimeout(spTimer));
    link.addEventListener('focus', () => setSpecies(link));
  });

  /* ---------- Quick search ---------- */
  const form = $('[data-search]');
  const input = $('#q');
  const panel = $('[data-suggest]');
  const listEl = $('#q-list');
  const allLink = $('[data-suggest-all]');
  const categories = [
    ...cat.flyTypes.flatMap((c) => [{ name: c.name, url: c.url, count: c.count }, ...c.children]),
    ...cat.species.map((s) => ({ name: s.name, url: s.url, count: s.approx_live_products })),
    ...cat.more.map((m) => ({ name: m.name, url: m.url, count: m.approx_live_products })),
  ];
  let active = -1;

  function mark(text, words) {
    let out = esc(text);
    for (const w of words) {
      if (!w) continue;
      out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
    }
    return out;
  }

  function suggest() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { hideSuggest(); return; }
    const sizeMatch = q.match(/(?:^|\s)(?:size|sz|#)\s*(\d{1,2}(?:\/0)?)\b/);
    const words = q.replace(/(?:size|sz|#)\s*\d{1,2}(?:\/0)?/, '').split(/\s+/).filter(Boolean);
    const cats = words.length ? categories.filter((c) => words.every((w) => c.name.toLowerCase().includes(w))).slice(0, 4) : [];
    let prods = cat.products.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
    if (sizeMatch) prods = prods.filter((p) => p.sizes.includes(sizeMatch[1]) && !p.soldOut.includes(sizeMatch[1]));
    prods = prods.sort((a, b) => a.rank - b.rank).slice(0, 5);
    let html = '';
    let i = 0;
    if (cats.length) {
      html += '<li class="suggest__group" role="presentation">Categories</li>';
      html += cats.map((c) => `<li class="suggest__opt suggest__opt--cat" role="option" id="opt-${i++}" data-href="${c.url}" aria-selected="false"><span>${mark(c.name, words)}</span><span class="suggest__meta num">${c.count.toLocaleString('en-CA')}</span></li>`).join('');
    }
    if (prods.length) {
      html += `<li class="suggest__group" role="presentation">${sizeMatch ? `Flies in stock in size ${esc(sizeMatch[1])}` : 'Flies'}</li>`;
      html += prods.map((p) => `<li class="suggest__opt" role="option" id="opt-${i++}" data-href="${p.url}" aria-selected="false"><img src="img/products/${p.img}" alt=""><span>${mark(p.name, words)}</span><span class="suggest__meta"><span class="num">${money(p.price)}</span> / ${p.unit}</span></li>`).join('');
    }
    if (!html) html = `<li class="suggest__none" role="presentation">No patterns match “${esc(input.value.trim())}”. Try a fly name, a fish or a hook size.</li>`;
    listEl.innerHTML = html;
    allLink.textContent = `See all results for “${input.value.trim()}”`;
    allLink.href = `/search.php?search_query=${encodeURIComponent(input.value.trim())}`;
    active = -1;
    input.removeAttribute('aria-activedescendant');
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function hideSuggest() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function move(d) {
    const opts = $$('.suggest__opt', listEl);
    if (!opts.length) return;
    active = (active + d + opts.length) % opts.length;
    opts.forEach((o, n) => o.setAttribute('aria-selected', String(n === active)));
    input.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  }
  let t0 = 0;
  input.addEventListener('input', () => { clearTimeout(t0); t0 = setTimeout(suggest, 80); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) suggest(); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (panel.hidden) suggest(); move(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
    else if (ev.key === 'Escape') { if (!panel.hidden) { ev.preventDefault(); hideSuggest(); } }
    else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      const opt = $$('.suggest__opt', listEl)[active];
      if (opt) location.href = opt.dataset.href;
    }
  });
  listEl.addEventListener('mousedown', (ev) => ev.preventDefault());
  listEl.addEventListener('click', (ev) => { const o = ev.target.closest('.suggest__opt'); if (o) location.href = o.dataset.href; });
  doc.addEventListener('click', (ev) => { if (!form.contains(ev.target)) hideSuggest(); });

  /* ---------- Hatch chart: light today's month, open what's on the water ---------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const m = new Date().getMonth();
  const rendered = $$('.months__m').findIndex((x) => x.classList.contains('is-now'));
  if (m !== rendered) {
    const chart = $('.hatch__chart');
    if (chart) chart.style.setProperty('--now', m);
    $$('[data-now-month]').forEach((el) => { el.textContent = MONTHS[m]; });
    const onNow = cat.hatches.filter((h) => h.months.some(([a, b]) => m >= a && m <= b)).map((h) => h.name);
    const words = onNow.map((n, i) => (i === 0 ? n : n.toLowerCase()));
    const sentence = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] || 'Quiet water');
    $$('[data-now-list]').forEach((el) => { el.textContent = el.closest('.mega') ? `${sentence}.` : sentence; });
    $$('.months__m').forEach((x) => x.classList.toggle('is-now', Number(x.dataset.m) === m));
    $$('.hatch__row').forEach((row) => {
      const on = row.dataset.months.split(',').some((r) => { const [a, b] = r.split('-').map(Number); return m >= a && m <= b; });
      row.classList.toggle('is-now', on);
      $$('.track__m', row).forEach((c) => c.classList.toggle('is-now', Number(c.dataset.m) === m));
      const d = $('details', row);
      if (d) d.open = on;
    });
  }

  /* ---------- Newsletter ---------- */
  const news = $('[data-news]');
  news.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!news.reportValidity()) return;
    let done = $('.news__done', news);
    if (!done) { done = doc.createElement('p'); done.className = 'news__done'; done.setAttribute('role', 'status'); news.appendChild(done); }
    done.textContent = 'Thanks. You’re on the list.';
  });

  render();
})();
