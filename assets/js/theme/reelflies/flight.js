// A fly dropping from its card into the order line (DESIGN.md "Motion": the drop, 420ms), and
// the header count's bump. Drawn only with motion allowed, only from a card on screen, and only
// while the order line is on the page; the change itself never waits for it.

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function bump() {
    const button = document.querySelector('[data-rf-box-btn]');
    if (!button) return;
    button.classList.remove('is-bumped');
    requestAnimationFrame(() => button.classList.add('is-bumped')); // a frame apart, so it restarts
}

export function fly(fromCard, productId) {
    const thumbs = document.querySelector('[data-rf-thumbs]');
    const image = fromCard && fromCard.querySelector('.rf-fly__photo img');
    if (!thumbs || !image || reduced()) return;
    const target = thumbs.querySelector(`[data-rf-thumb="${productId}"]`) || thumbs;
    const a = image.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || a.bottom < 0 || a.top > window.innerHeight || !b.width) return;
    const el = document.createElement('div');
    el.className = 'rf-flight';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    const copy = document.createElement('img');
    copy.src = image.currentSrc || image.src;
    copy.alt = '';
    el.appendChild(copy);
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transformOrigin = '0 0';
        el.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})`;
        el.style.opacity = '0.6';
    }));
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 900);
}
