// The checks behind ticket 54a's reflow, reduced-motion and focus specs (reflow.spec.mjs,
// reduced-motion.spec.mjs, focus.spec.mjs). page-checks.test.mjs proves each on fixture pages,
// failing and passing.
//
// - inPage({ check, ...options }) runs in the page, through page.evaluate, so it carries every
//   helper it needs and reads nothing from this module:
//     overflow     the page's width against the viewport's, and the outermost boxes past its
//                  right edge that no ancestor clips (spec story 71)
//     motion       every transition and animation the page's styles declare for an element or
//                  its ::before and ::after, longer than limitMs, and smooth scrolling (story 69)
//     animations   every animation running now (CSS animations and transitions, and script
//                  animations through element.animate), longer than limitMs
//     bumpCart     sends what an add sends when the cart count goes up (build pipeline 6.9): the
//                  stock cart-quantity-update on <body> through jQuery, then rf:cart-changed on
//                  document. Cornerstone's build keeps jQuery out of window (webpack.common.js
//                  aliases jquery to jquery.min.js, which its expose-loader rule never matches), so
//                  then it makes the change the stock handler makes (cart-preview.js): the count's
//                  text and countPill--positive. It writes nothing to the store.
//     focus        the focused element, and what elementFromPoint finds at its centre (story 67)
// - tabThrough(page) presses Tab from the top of the page until focus leaves the page or comes
//   back, and records the focus check at each step.
// - overflowProblems, motionProblems and focusProblems turn the results into a spec's failures;
//   focusNotes into its notes.

/* eslint-env browser */ // inPage, and the callbacks settle and tabThrough pass to page.evaluate, run in the page

// A transition or an animation of this length or shorter counts as no motion: a global reset
// usually sets 0.01 ms, so that transitionend and animationend still fire. Revisitable.
export const MOTION_LIMIT_MS = 10;
// The most Tabs one tab-through presses. A stock product page on channel 1 has about 150
// focusable elements at 375, header and footer included.
export const MAX_TABS = 250;

export function inPage({ check, limitMs = 10 }) {
    const describe = element => {
        if (!element || element.nodeType !== 1) return 'nothing';
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = Array.from(element.classList).slice(0, 2).map(name => `.${name}`).join('');
        const label = (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (label) return `${tag}${id}${classes} "${label}"`;
        // A link with no text, such as an icon or a logo, by where it goes.
        const href = tag === 'a' && element.getAttribute('href');
        return `${tag}${id}${classes}${href ? `[href="${href.slice(0, 60)}"]` : ''}`;
    };
    // Shorter, so that the same rule on many elements reads as one group.
    const kindOf = element => `${element.tagName.toLowerCase()}${element.classList.length ? `.${element.classList[0]}` : ''}`;
    const ms = value => {
        const text = String(value).trim();
        return text.endsWith('ms') ? parseFloat(text) : parseFloat(text) * 1000;
    };
    const list = value => String(value).split(',').map(part => part.trim());

    const checks = {
        overflow() {
            const root = document.documentElement;
            const width = root.clientWidth;
            const scrollWidth = Math.max(root.scrollWidth, document.body ? document.body.scrollWidth : 0);
            const offenders = [];
            if (scrollWidth <= width) return { width, scrollWidth, offenders };
            const past = rect => rect.right > width + 0.5;
            // An ancestor that clips its overflow (a carousel, a scroller) and itself fits.
            const clipped = element => {
                for (let node = element.parentElement; node && node !== document.body && node !== root; node = node.parentElement) {
                    if (getComputedStyle(node).overflowX !== 'visible' && !past(node.getBoundingClientRect())) return true;
                }
                return false;
            };
            for (const element of document.body.querySelectorAll('*')) {
                const rect = element.getBoundingClientRect();
                const parent = element.parentElement;
                const outermost = !parent || parent === document.body || !past(parent.getBoundingClientRect());
                if (rect.width > 0 && rect.height > 0 && past(rect) && outermost && !clipped(element)) {
                    offenders.push({ element: describe(element), right: Math.round(rect.right + window.scrollX) });
                    if (offenders.length >= 5) break;
                }
            }
            return { width, scrollWidth, offenders };
        },

        motion() {
            const found = [];
            for (const element of [document.documentElement, document.body]) {
                if (element && getComputedStyle(element).scrollBehavior === 'smooth') {
                    found.push({
                        element: element.tagName.toLowerCase(), kind: 'scroll-behavior', what: 'smooth', durationMs: null,
                    });
                }
            }
            for (const element of document.querySelectorAll('*')) {
                for (const pseudo of [null, '::before', '::after']) {
                    const style = getComputedStyle(element, pseudo);
                    if (!pseudo || !['none', 'normal'].includes(style.content)) {
                        const where = `${kindOf(element)}${pseudo || ''}`;
                        const durations = list(style.transitionDuration);
                        list(style.transitionProperty).forEach((property, index) => {
                            const durationMs = ms(durations[index % durations.length]);
                            if (property !== 'none' && durationMs > limitMs) {
                                found.push({
                                    element: where, kind: 'transition', what: property, durationMs,
                                });
                            }
                        });
                        const animationDurations = list(style.animationDuration);
                        list(style.animationName).forEach((name, index) => {
                            const durationMs = ms(animationDurations[index % animationDurations.length]);
                            if (name !== 'none' && durationMs > limitMs) {
                                found.push({
                                    element: where, kind: 'animation', what: name, durationMs,
                                });
                            }
                        });
                    }
                }
            }
            return found;
        },

        animations() {
            return document.getAnimations()
                .filter(animation => animation.playState === 'running')
                .map(animation => {
                    const effect = animation.effect;
                    const duration = effect && effect.getComputedTiming ? effect.getComputedTiming().activeDuration : Infinity;
                    return {
                        element: effect && effect.target ? `${describe(effect.target)}${effect.pseudoElement || ''}` : 'no element',
                        kind: animation.constructor.name,
                        what: animation.transitionProperty || animation.animationName || animation.id || 'a script animation',
                        duration,
                    };
                })
                .filter(({ duration }) => !(duration <= limitMs))
                .map(({ duration, ...rest }) => ({ ...rest, durationMs: Number.isFinite(duration) ? Math.round(duration) : 'infinite' }));
        },

        bumpCart() {
            const counters = document.querySelectorAll('.cart-quantity');
            const from = counters.length ? parseInt(counters[0].textContent, 10) || 0 : 0;
            const to = from + 1;
            const jquery = window.$ || window.jQuery;
            let via = 'event only';
            if (typeof jquery === 'function') {
                jquery('body').trigger('cart-quantity-update', to);
                via = 'jquery';
            } else if (counters.length) {
                counters.forEach(counter => {
                    counter.textContent = String(to); // eslint-disable-line no-param-reassign
                    counter.classList.add('countPill--positive');
                });
                via = 'count';
            }
            document.dispatchEvent(new CustomEvent('rf:cart-changed', { detail: { source: 'qa', productId: 0 } }));
            return { from, to, via };
        },

        focus() {
            const active = document.activeElement;
            if (!active || active === document.body || active === document.documentElement) return { kind: 'none' };
            window.rfQaFocusSeen = window.rfQaFocusSeen || new WeakSet();
            const repeat = window.rfQaFocusSeen.has(active);
            window.rfQaFocusSeen.add(active);
            const base = { element: describe(active), repeat };
            const rect = active.getBoundingClientRect();
            if (rect.width * rect.height <= 1) return { ...base, kind: 'hidden' };
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return { ...base, kind: 'offscreen' };
            const hit = document.elementFromPoint(x, y);
            if (!hit || hit === active || active.contains(hit)) return { ...base, kind: 'ok' };
            for (let node = hit; node && node !== document.documentElement; node = node.parentElement) {
                const { position } = getComputedStyle(node);
                if ((position === 'fixed' || position === 'sticky') && !node.contains(active)) {
                    return {
                        ...base, kind: 'covered', by: describe(node), hit: describe(hit),
                    };
                }
            }
            return { ...base, kind: 'other', hit: describe(hit) };
        },
    };
    return checks[check]();
}

// Waits until the page has drawn and its scroll position has held still for two frames (a
// smooth scroll after a Tab), or about two seconds have passed.
export async function settle(page) {
    await page.evaluate(() => new Promise(resolve => {
        let last = '';
        let still = 0;
        let frames = 0;
        const tick = () => {
            const now = `${window.scrollX},${window.scrollY}`;
            still = now === last ? still + 1 : 0;
            last = now;
            frames += 1;
            if (still >= 2 || frames > 120) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
}

// Presses Tab from the top of the page, as a keyboard user who has just arrived, until focus
// leaves the page, comes back to an element it has been on, or maxTabs is reached. Resolves to
// { steps, end }: each step is the focus check after one Tab, with its number.
export async function tabThrough(page, { maxTabs = MAX_TABS } = {}) {
    // Sequential focus starts after whatever has focus (the cookie banner's button, which is
    // gone, say), so it starts from an unfocusable mark at the top of <body>, removed again
    // after the first Tab.
    await page.evaluate(() => {
        window.scrollTo(0, 0);
        const mark = document.createElement('span');
        mark.tabIndex = -1;
        mark.dataset.rfQaFocusStart = '';
        document.body.prepend(mark);
        mark.focus({ preventScroll: true });
    });
    const steps = [];
    for (let step = 1; step <= maxTabs; step += 1) {
        await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
        if (step === 1) await page.evaluate(() => document.querySelector('[data-rf-qa-focus-start]')?.remove()); // eslint-disable-line no-await-in-loop
        await settle(page); // eslint-disable-line no-await-in-loop
        const result = await page.evaluate(inPage, { check: 'focus' }); // eslint-disable-line no-await-in-loop
        if (result.kind === 'none') return { steps, end: `focus left the page after ${step - 1} Tab(s)` };
        if (result.repeat) return { steps, end: `focus came back to ${result.element} after ${step - 1} Tab(s)` };
        steps.push({ step, ...result });
    }
    return { steps, end: `stopped after ${maxTabs} Tabs` };
}

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// How bumpCart made the count go up, for the reduced-motion test's annotation.
export function describeBump({ from, to, via }) {
    if (via === 'jquery') return `${from} to ${to}, through the stock cart-quantity-update (jQuery), then rf:cart-changed`;
    if (via === 'count') return `${from} to ${to}, by changing .cart-quantity as the stock handler does (jQuery isn't global), then rf:cart-changed`;
    return 'no cart count on the page; rf:cart-changed only';
}

export function overflowProblems({ width, scrollWidth, offenders }) {
    if (scrollWidth <= width) return [];
    const boxes = offenders.map(({ element, right }) => `${element} (right edge at ${right} px)`).join('; ');
    return [`the page is ${scrollWidth} px wide at ${width} px, so it scrolls sideways${boxes ? `; the outermost boxes past the edge: ${boxes}` : ''}`];
}

const duration = durationMs => (durationMs === null ? '' : ` (${durationMs === 'infinite' ? 'infinite' : `${Math.round(durationMs)} ms`})`);

// The running animations, then the declared motion grouped by what repeats, at most `max` groups.
export function motionProblems({ running, declared }, { max = 10 } = {}) {
    const problems = [];
    if (running.length) {
        const list = running.map(({
            element, kind, what, durationMs,
        }) => `${element} ${kind} ${what}${duration(durationMs)}`).join('; ');
        problems.push(`${count(running.length, 'animation')} ${running.length === 1 ? 'runs' : 'run'} under reduced motion: ${list}`);
    }
    if (declared.length) {
        const groups = new Map();
        for (const {
            element, kind, what, durationMs,
        } of declared) {
            const key = `${element} ${kind} ${what}${duration(durationMs)}`;
            groups.set(key, (groups.get(key) || 0) + 1);
        }
        const sorted = [...groups].sort((a, b) => b[1] - a[1]);
        const shown = sorted.slice(0, max).map(([key, n]) => (n > 1 ? `${key} ×${n}` : key));
        const rest = sorted.length - shown.length;
        problems.push(`${count(declared.length, 'declaration')} would move under reduced motion, in ${count(groups.size, 'group')} (ticket 25's global reduced-motion reset turns them off): ${shown.join('; ')}${rest ? `; and ${count(rest, 'more group')}` : ''}`);
    }
    return problems;
}

export const focusProblems = steps => steps.filter(({ kind }) => kind === 'covered')
    .map(({
        step, element, by, hit,
    }) => `Tab ${step}: ${element} is covered by ${by} (elementFromPoint at its centre hit ${hit})`);

const NOTES = {
    hidden: ['had no visible box', ({ element }) => element],
    offscreen: ['had its centre outside the viewport', ({ element }) => element],
    other: ['had another element over its centre (not fixed or sticky)', ({ element, hit }) => `${element} under ${hit}`],
};

// What the tab-through saw but doesn't fail: the ticket asks only about fixed and sticky boxes.
export function focusNotes(steps, { max = 5 } = {}) {
    return Object.entries(NOTES).flatMap(([kind, [what, show]]) => {
        const found = steps.filter(step => step.kind === kind);
        if (!found.length) return [];
        const examples = found.slice(0, max).map(show).join('; ');
        return [`${count(found.length, 'focused element')} ${what}: ${examples}${found.length > max ? '; …' : ''}`];
    });
}
