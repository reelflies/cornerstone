// Quick add on the cards (ticket 43; quick-add-panel.js, started by quick-add.js): what a tap on
// "+ Add" does, on the markup the templates really render.
//
// - The cards are components/products/grid.html round channel 1's search results for "streamer"
//   (scripts/qa/render/partials/card/products.json), with rf_quick_add on, and the products the
//   panel loads are components/reelflies/quick-add-product.html round
//   scripts/qa/render/partials/quick-add/products.json. beforeAll renders them with
//   render.mjs's renderPartial in a child `node` process, as size-filter-stock.spec.js does,
//   because Jest's CommonJS runtime can't load that ES module.
// - The storefront is stood in for: getById answers with those renders, the option change with
//   stock's in_stock_attributes, the add with the cart's item, the Cart API with a cart.
// - jsdom has no <dialog> methods, so show(), showModal() and close() are given the browser's
//   effect on `open` and the close event (Playwright's quick-add.spec.mjs checks the real ones).
// - The live region (ticket 25) is the real one, and its writes are recorded, so "announced
//   once" counts what a screen reader hears.

import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
import utils from '@bigcommerce/stencil-utils';
import {
    HOST, QUICK_ADD, cartLine, confirmation, countCart, flyBrandList, readCartCount, startQuickAdd,
} from '../../../theme/reelflies/quick-add-panel';
import * as cartCount from '../../../theme/reelflies/cart-count';
import * as addWords from '../../../theme/reelflies/add-words';
import { CHANGED_EVENT } from '../../../theme/reelflies/cart-events';
import quickAdd, { TEMPLATE, storefrontDeps } from '../../../theme/reelflies/quick-add';

jest.mock('@bigcommerce/stencil-utils', () => ({
    api: {
        product: { getById: jest.fn() },
        productAttributes: { optionChange: jest.fn() },
        cart: { itemAdd: jest.fn(), getCartQuantity: jest.fn() },
    },
}));

const THEME = path.resolve(__dirname, '../../../../..');
const RENDER = pathToFileURL(path.join(THEME, 'scripts/qa/render/render.mjs')).href;
const MARK = '\n@@rf-rendered@@\n';

function renderAll() {
    const script = `
        import fs from 'fs';
        const { renderPartial } = await import(${JSON.stringify(RENDER)});
        const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
        const { products: cards } = read('scripts/qa/render/partials/card/products.json');
        const { products, urls } = read('scripts/qa/render/partials/quick-add/products.json');
        const out = { products: {} };
        out.grid = await renderPartial('rf-test/grid', { products: cards, settings: {}, theme_settings: { rf_quick_add: true, rf_price_unit_exclude: 'Fly Gear,Fly Selections & Fly Boxes' } }, {
            overrides: { 'rf-test/grid': '<div id="product-listing-container">{{> components/products/grid products=products theme_settings=theme_settings event="list"}}</div>' },
        });
        for (const [name, product] of Object.entries(products)) {
            out.products[product.id] = await renderPartial('components/reelflies/quick-add-product', { product, urls, settings: {}, theme_settings: {} });
        }
        process.stdout.write(${JSON.stringify(MARK)} + JSON.stringify(out));
    `;
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: THEME, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout.slice(stdout.lastIndexOf(MARK) + MARK.length));
}

// Royal Coachman (4831) has several Fly Sizes and Red Devil (4804) is shown in the grid with
// options; the products file gives 4831 four sizes, and the tests point Red Devil's button at the
// others (one size, 6178; Colour and Fly Sizes, 5663; another option, the synthetic 9101).
const SIZES = 4831;
const CONTEXT = {
    rfQuickAdd: true, rfQuickAddClose: 'Close', rfQuickAddFailed: 'We couldn\'t load the sizes.', rfQuickAddPage: 'Go to the product page', rfFlyBrands: 'ReelFlies', urls: { cart: '/cart.php' },
};
const CART = units => [{ lineItems: { physicalItems: [{ productId: 6178, quantity: units, brand: 'ReelFlies' }], digitalItems: [], giftCertificates: [] } }];
const settle = async (times = 4) => {
    for (let i = 0; i < times; i += 1) await new Promise(resolve => { setTimeout(resolve, 0); }); // eslint-disable-line no-await-in-loop
};
// The live region writes a message about 100 ms after it is sent (live-region.js).
const spokenSoon = () => new Promise(resolve => { setTimeout(resolve, 150); });

let rendered;
let controller;
let calls;
let deps;
let spoken;
let phone;

beforeAll(() => {
    rendered = renderAll();
    document.addEventListener(CHANGED_EVENT, event => calls.push(['changed', event.detail]));
    // The browser's <dialog>, as far as these tests need it.
    const proto = window.HTMLDialogElement.prototype;
    proto.show = function show() { this.setAttribute('open', ''); };
    proto.showModal = function showModal() { this.setAttribute('open', ''); this.setAttribute('data-test-modal', ''); };
    proto.close = function close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
    };
});

beforeEach(() => {
    document.body.innerHTML = `<div data-rf-live-region role="status"></div><div class="page">${rendered.grid}</div><a href="/after/" id="after">After</a>`;
    document.documentElement.removeAttribute('data-rf-open');
    calls = [];
    spoken = [];
    phone = false;
    window.matchMedia = query => ({ matches: phone && /not all and \(min-width: 801px\)/.test(query), addEventListener() {}, removeEventListener() {} });
    const region = document.querySelector('[data-rf-live-region]');
    new MutationObserver(() => { if (region.textContent) spoken.push(region.textContent); }).observe(region, { childList: true, characterData: true, subtree: true });
    deps = {
        // size-pills.js's own chunk; Jest loads the module itself.
        loadPills: jest.fn(() => import('../../../theme/reelflies/size-pills')),
        loadProduct: jest.fn(id => (rendered.products[id] ? Promise.resolve(rendered.products[id]) : Promise.reject(new Error('404')))),
        optionChange: jest.fn(() => Promise.resolve({ data: { in_stock_attributes: [301, 303, 304, 401, 501, 502, 503, 504, 601, 602] } })),
        addItem: jest.fn(() => Promise.resolve({ data: { cart_id: 'c1', cart_item: { id: 'i1' } } })),
        readQuantity: jest.fn(() => Promise.resolve(15)),
        notify: jest.fn(units => calls.push(['notify', units])),
        navigate: jest.fn(),
        doFetch: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(CART(15)) })),
    };
});

afterEach(() => {
    if (controller) controller.stop();
    controller = null;
});

const start = (context = CONTEXT) => {
    controller = startQuickAdd(document, context, deps);
    return controller;
};
const buttonFor = id => document.querySelector(`${QUICK_ADD}[data-rf-quick-add="${id}"]`);
// Points Red Devil's "+ Add" at another product, as a card of that product would render it.
const RED_DEVIL = () => document.querySelector('article[data-entity-id="4804"] [data-rf-quick-add]');
const cardFor = id => {
    const link = RED_DEVIL();
    link.setAttribute('data-rf-quick-add', String(id));
    link.closest('article').setAttribute('data-name', `Product ${id}`);
    return link;
};
const tap = async link => {
    link.click();
    await settle(8);
};
const panel = () => document.querySelector('[data-rf-qa-panel]');

describe('"+ Add", once started', () => {
    it('is a button that opens a dialog, on the cards there are and on the cards a refresh brings', async () => {
        start();
        const link = buttonFor(SIZES);
        expect([link.getAttribute('role'), link.getAttribute('aria-haspopup'), link.getAttribute('aria-expanded')]).toEqual(['button', 'dialog', 'false']);
        const listing = document.getElementById('product-listing-container');
        listing.innerHTML = rendered.grid.replace(/^<div id="product-listing-container">|<\/div>$/g, '');
        await settle();
        expect(buttonFor(SIZES)).not.toBe(link);
        expect(buttonFor(SIZES).getAttribute('role')).toBe('button');
        await tap(buttonFor(SIZES));
        expect(panel()).not.toBeNull();
    });

    it('answers Space as a button does', async () => {
        start();
        const link = buttonFor(SIZES);
        link.focus();
        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        link.dispatchEvent(event);
        await settle(8);
        expect(event.defaultPrevented).toBe(true);
        expect(panel()).not.toBeNull();
    });

    it('leaves a click with a modifier to the link, for a new tab', async () => {
        start();
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
        buttonFor(SIZES).dispatchEvent(event);
        await settle();
        expect(event.defaultPrevented).toBe(false);
        expect(deps.loadProduct).not.toHaveBeenCalled();
    });
});

describe('a pattern with several sizes (story 30)', () => {
    it('loads the product, asks stock what is left, and opens the panel in the card with every size and the sold-out ones marked in words', async () => {
        start();
        const link = buttonFor(SIZES);
        link.focus();
        await tap(link);
        expect(deps.loadProduct).toHaveBeenCalledWith(SIZES);
        expect(deps.optionChange).toHaveBeenCalledWith(SIZES, 'product_id=4831');
        const dialog = panel();
        expect(dialog.open).toBe(true);
        expect(link.closest('article').contains(dialog)).toBe(true);
        expect(dialog.getAttribute('aria-label')).toBe('Choose sizes of Royal Coachman Streamer');
        expect(dialog.hasAttribute('aria-labelledby')).toBe(false);
        const pills = Array.from(dialog.querySelectorAll('[data-rf-pills="size"] input[type="radio"]'));
        expect(pills.map(radio => radio.value)).toEqual(['301', '302', '303', '304']);
        expect(pills.map(radio => radio.getAttribute('aria-disabled'))).toEqual([null, 'true', null, null]);
        expect(dialog.querySelector('[data-rf-sold-out-line]').textContent).toBe('Size 8 is sold out.');
        expect(dialog.querySelector('[data-rf-sold-out-tag][hidden]')).not.toBeNull();
        expect(link.getAttribute('aria-expanded')).toBe('true');
        expect(document.documentElement.getAttribute('data-rf-open')).toBe('quick-add');
        expect(document.activeElement).toBe(dialog.querySelector('[data-rf-qa-close]'));
        expect(dialog.querySelector('[data-rf-qa-count]').textContent).toBe('15 flies in your cart.');
        expect(deps.addItem).not.toHaveBeenCalled();
    });

    it('never puts anything straight into the listing, which size-filter.js watches (ticket 33)', async () => {
        start();
        const listing = document.getElementById('product-listing-container');
        const before = Array.from(listing.children);
        await tap(buttonFor(SIZES));
        expect(Array.from(listing.children)).toEqual(before);
    });

    it('hides a size a product rule hides, as the product page does', async () => {
        deps.optionChange.mockResolvedValue({ data: { in_stock_attributes: [301, 302, 303, 304], disabled_option_values: [{ value_id: 304 }] } });
        start();
        await tap(buttonFor(SIZES));
        const hidden = Array.from(panel().querySelectorAll('.form-option-wrapper')).map(wrapper => wrapper.hidden);
        expect(hidden).toEqual([false, false, false, true]);
    });

    it('opens with stock\'s marks on the pills when size-pills.js\'s chunk fails to load, unwatched', async () => {
        deps.loadPills.mockRejectedValue(new Error('ChunkLoadError'));
        start();
        await tap(buttonFor(SIZES));
        expect(panel().querySelector('[data-product-attribute-value="302"]').classList.contains('unavailable')).toBe(true);
        expect(panel().querySelector('[data-rf-pills-watched]')).toBeNull();
    });

    it('marks no size sold out when stock\'s answer fails, rather than not opening', async () => {
        deps.optionChange.mockRejectedValue(new Error('429'));
        start();
        await tap(buttonFor(SIZES));
        expect(panel().querySelectorAll('[aria-disabled="true"]').length).toBe(0);
    });

    it('says the cart is empty, or leaves the count out when the cart can\'t be read', async () => {
        deps.doFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
        start();
        await tap(buttonFor(SIZES));
        expect(panel().querySelector('[data-rf-qa-count]').textContent).toBe('Your cart is empty.');
        controller.close();
        deps.doFetch.mockResolvedValueOnce({ ok: false });
        await tap(buttonFor(SIZES));
        expect(panel().querySelector('[data-rf-qa-count]').textContent).toBe('');
    });
});

describe('the desktop popover (801px and up)', () => {
    it('closes on Escape, with focus back on "+ Add", its pills unwatched and the open flag gone', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        const pills = panel().querySelector('[data-rf-pills="size"]');
        expect(pills.hasAttribute('data-rf-pills-watched')).toBe(true);
        expect(link.closest('.product').classList.contains(HOST)).toBe(true);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(link);
        expect(link.getAttribute('aria-expanded')).toBe('false');
        expect(document.documentElement.hasAttribute('data-rf-open')).toBe(false);
        expect(pills.hasAttribute('data-rf-pills-watched')).toBe(false);
        expect(link.closest('.product').classList.contains(HOST)).toBe(false);
    });

    it('closes when focus moves out of it, leaving focus where it went: a Tab onto the next control, never back on "+ Add"', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        const dialog = panel();
        const next = document.getElementById('after');
        dialog.querySelector('[data-rf-qa-close]').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: next }));
        next.focus();
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(next);
    });

    it('stays open when Shift+Tab takes focus back to its own "+ Add"', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        panel().querySelector('[data-rf-qa-close]').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: link }));
        expect(panel()).not.toBeNull();
    });

    it('closes when focus goes on back past its "+ Add", onto the card\'s title, leaving focus there', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        panel().querySelector('[data-rf-qa-close]').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: link }));
        link.focus();
        expect(panel()).not.toBeNull();
        const title = link.closest('article').querySelector('.card-title a');
        link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: title }));
        title.focus();
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(title);
        expect(link.getAttribute('aria-expanded')).toBe('false');
        expect(document.documentElement.hasAttribute('data-rf-open')).toBe(false);
        expect(link.closest('.product').classList.contains(HOST)).toBe(false);
    });

    it('stays open while focus moves from its "+ Add" into it', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        const close = panel().querySelector('[data-rf-qa-close]');
        link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: close }));
        expect(panel()).not.toBeNull();
    });

    it('closes on a press outside it, with focus back on "+ Add", or on the control pressed', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        document.querySelector('.page').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(link);
        await tap(link);
        document.getElementById('after').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        expect(panel()).toBeNull();
        expect(document.activeElement).not.toBe(link);
    });

    it('closes from Close, and from a second tap on its "+ Add"', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        panel().querySelector('[data-rf-qa-close]').click();
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(link);
        await tap(link);
        link.click();
        expect(panel()).toBeNull();
        expect(deps.loadProduct).toHaveBeenCalledTimes(2);
    });

    it('opens one panel at a time', async () => {
        start();
        const first = buttonFor(SIZES);
        await tap(first);
        const second = cardFor(SIZES);
        await tap(second);
        expect(document.querySelectorAll('[data-rf-qa-panel]').length).toBe(1);
        expect([first.getAttribute('aria-expanded'), second.getAttribute('aria-expanded')]).toEqual(['false', 'true']);
        expect(second.closest('article').contains(panel())).toBe(true);
    });
});

// A tap whose answer comes after a newer tap on another "+ Add" does nothing: the latest tap wins.
// Repro (#84's rf/skeptic): Enter on one card's "+ Add", then on another's while the first load
// is held; a link answers Enter with a click.
describe('a slow tap overtaken by a newer one', () => {
    // The next product load waits until release() is called; the ones after it answer at once.
    const holdNextLoad = ({ fail = false } = {}) => {
        let release;
        deps.loadProduct.mockImplementationOnce(id => new Promise((resolve, reject) => {
            release = () => (fail ? reject(new Error('timeout')) : resolve(rendered.products[id]));
        }));
        return () => release();
    };

    it('never replaces the panel the newer tap opened, nor moves focus or aria-expanded back to itself', async () => {
        const release = holdNextLoad();
        start();
        const slow = buttonFor(SIZES);
        slow.click();
        await settle(8);
        expect(slow.getAttribute('aria-disabled')).toBe('true');
        const later = cardFor(SIZES);
        await tap(later);
        const opened = panel();
        expect(later.closest('article').contains(opened)).toBe(true);
        release();
        await settle(8);
        expect(document.querySelectorAll('[data-rf-qa-panel]').length).toBe(1);
        expect(panel()).toBe(opened);
        expect(document.activeElement).toBe(opened.querySelector('[data-rf-qa-close]'));
        expect([slow.getAttribute('aria-expanded'), later.getAttribute('aria-expanded')]).toEqual(['false', 'true']);
        expect(slow.hasAttribute('aria-disabled')).toBe(false);
        expect(slow.classList.contains('is-busy')).toBe(false);
    });

    it('never leaves the listing for a product page after a newer tap: a 5663-shaped product answering late', async () => {
        const release = holdNextLoad();
        start();
        const slow = cardFor(5663);
        slow.click();
        await settle(8);
        await tap(buttonFor(SIZES));
        release();
        await settle(8);
        expect(deps.navigate).not.toHaveBeenCalled();
        expect(buttonFor(SIZES).closest('article').contains(panel())).toBe(true);
        expect(slow.hasAttribute('aria-disabled')).toBe(false);
    });

    it('never opens its failure panel over the newer one', async () => {
        const release = holdNextLoad({ fail: true });
        start();
        cardFor(1234).click();
        await settle(8);
        await tap(buttonFor(SIZES));
        release();
        await settle(8);
        expect(panel().querySelector('.rf-qa-failed')).toBeNull();
        expect(buttonFor(SIZES).closest('article').contains(panel())).toBe(true);
        await spokenSoon();
        expect(spoken).toEqual([]);
    });

    it('adds nothing when a one-size product answers after a newer tap', async () => {
        const release = holdNextLoad();
        start();
        const slow = cardFor(6178);
        slow.click();
        await settle(8);
        await tap(buttonFor(SIZES));
        release();
        await settle(8);
        expect(deps.addItem).not.toHaveBeenCalled();
        expect(slow.closest('[data-rf-qa-wrap]').querySelector('[data-rf-qa-status]')).toBeNull();
        expect(slow.hasAttribute('aria-disabled')).toBe(false);
    });

    it('checks again after stock\'s answer: overtaken while stock answers, it does nothing', async () => {
        let answer;
        deps.optionChange.mockImplementationOnce(() => new Promise(resolve => { answer = () => resolve({ data: { in_stock_attributes: [401] } }); }));
        start();
        const slow = cardFor(6178);
        slow.click();
        await settle(8);
        expect(deps.optionChange).toHaveBeenCalledTimes(1);
        await tap(buttonFor(SIZES));
        answer();
        await settle(8);
        expect(deps.addItem).not.toHaveBeenCalled();
        expect(buttonFor(SIZES).closest('article').contains(panel())).toBe(true);
        expect(slow.hasAttribute('aria-disabled')).toBe(false);
    });

    it('finishes an add it had already sent, confirmed under its own button, and leaves the newer panel open', async () => {
        let answer;
        deps.addItem.mockImplementationOnce(() => new Promise(resolve => { answer = () => resolve({ data: { cart_item: { id: 'i1' } } }); }));
        start();
        const adding = cardFor(6178);
        adding.click();
        await settle(8);
        expect(deps.addItem).toHaveBeenCalledTimes(1);
        await tap(buttonFor(SIZES));
        answer();
        await settle(8);
        expect(adding.closest('[data-rf-qa-wrap]').querySelector('[data-rf-qa-status]').textContent).toBe('Added 1 × size 10. 15 flies in your cart. View cart');
        expect(calls).toEqual([['notify', 15], ['changed', { source: 'quick-add', productId: 6178 }]]);
        expect(buttonFor(SIZES).closest('article').contains(panel())).toBe(true);
        expect(adding.hasAttribute('aria-disabled')).toBe(false);
    });

    it('still opens when nothing newer was tapped while it loaded', async () => {
        const release = holdNextLoad();
        start();
        const link = buttonFor(SIZES);
        link.click();
        await settle(8);
        expect(panel()).toBeNull();
        release();
        await settle(8);
        expect(link.closest('article').contains(panel())).toBe(true);
        expect(link.hasAttribute('aria-disabled')).toBe(false);
    });

    // The next size-pills.js chunk load waits until the returned function is called.
    const holdNextPills = () => {
        let release;
        deps.loadPills.mockImplementationOnce(() => new Promise(resolve => {
            release = () => resolve(import('../../../theme/reelflies/size-pills'));
        }));
        return () => release();
    };

    it('checks again after the pills\' chunk: overtaken while the chunk loads, it never replaces the newer panel', async () => {
        const release = holdNextPills();
        start();
        const slow = buttonFor(SIZES);
        await tap(slow); // the product and stock have answered; the chunk hasn't
        expect(panel()).toBeNull();
        const later = cardFor(SIZES);
        await tap(later);
        const opened = panel();
        expect(later.closest('article').contains(opened)).toBe(true);
        release();
        await settle(8);
        expect(document.querySelectorAll('[data-rf-qa-panel]').length).toBe(1);
        expect(panel()).toBe(opened);
        expect([slow.getAttribute('aria-expanded'), later.getAttribute('aria-expanded')]).toEqual(['false', 'true']);
    });

    // Repro (#94's rf/skeptic): hold A's load, tap B (its panel opens), press Escape or don't,
    // tap A again while it still loads, then let A answer.
    it('answers a second tap on its "+ Add" while it still loads: after Escape on the newer panel, its own panel opens', async () => {
        const release = holdNextLoad();
        start();
        const slow = buttonFor(SIZES);
        slow.click();
        await settle(8);
        const later = cardFor(SIZES);
        await tap(later);
        expect(later.closest('article').contains(panel())).toBe(true);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(panel()).toBeNull();
        await tap(slow);
        expect(deps.loadProduct).toHaveBeenCalledTimes(2); // the second tap starts no load of its own
        expect(slow.getAttribute('aria-disabled')).toBe('true');
        release();
        await settle(8);
        expect(slow.closest('article').contains(panel())).toBe(true);
        expect([slow.getAttribute('aria-expanded'), later.getAttribute('aria-expanded')]).toEqual(['true', 'false']);
        expect(slow.hasAttribute('aria-disabled')).toBe(false);
    });

    it('answers a second tap on its "+ Add" while it still loads: the newer panel closes at that tap, and its own opens when it answers', async () => {
        const release = holdNextLoad();
        start();
        const slow = buttonFor(SIZES);
        slow.click();
        await settle(8);
        const later = cardFor(SIZES);
        await tap(later);
        expect(later.closest('article').contains(panel())).toBe(true);
        await tap(slow);
        expect(panel()).toBeNull();
        expect(later.getAttribute('aria-expanded')).toBe('false');
        expect(deps.loadProduct).toHaveBeenCalledTimes(2);
        release();
        await settle(8);
        expect(document.querySelectorAll('[data-rf-qa-panel]').length).toBe(1);
        expect(slow.closest('article').contains(panel())).toBe(true);
        expect([slow.getAttribute('aria-expanded'), later.getAttribute('aria-expanded')]).toEqual(['true', 'false']);
    });

    // Repro (#94's round-2 rf/spec and rf/skeptic): with A's and B's loads held, tap A, B, A again
    // and then C, whose panel opens, then let B answer. A re-tap makes A's pending tap the latest
    // again, so C's tap must get a number no other tap has had, or B's late answer counts as C's.
    // A and C are Royal Coachman's card and a copy of Red Devil's; B is Red Devil's, pointed at
    // each shape of product.
    it.each([
        ['several sizes', SIZES],
        ['Colour and Fly Sizes (5663)', 5663],
        ['one size (6178)', 6178],
    ])('never answers after a newer tap that followed a second tap on a loading "+ Add": B with %s', async (shape, id) => {
        const a = buttonFor(SIZES);
        const cell = RED_DEVIL().closest('article').parentElement;
        const copy = cell.cloneNode(true);
        copy.querySelector('article').setAttribute('data-entity-id', '7777');
        cell.after(copy);
        const c = copy.querySelector(QUICK_ADD);
        c.setAttribute('data-rf-quick-add', String(SIZES));
        const b = cardFor(id);
        const releaseA = holdNextLoad();
        const releaseB = holdNextLoad();
        start();
        await tap(a);
        await tap(b);
        await tap(a); // A still loads: no new load, and A's pending tap is the latest again
        expect(deps.loadProduct).toHaveBeenCalledTimes(2);
        await tap(c);
        const opened = panel();
        expect(c.closest('article').contains(opened)).toBe(true);
        expect(opened.contains(document.activeElement)).toBe(true);
        releaseB();
        await settle(8);
        expect(deps.navigate).not.toHaveBeenCalled();
        expect(deps.addItem).not.toHaveBeenCalled();
        expect(document.querySelectorAll('[data-rf-qa-panel]').length).toBe(1);
        expect(panel()).toBe(opened);
        expect(opened.contains(document.activeElement)).toBe(true);
        expect(b.hasAttribute('aria-disabled')).toBe(false);
        expect(b.classList.contains('is-busy')).toBe(false);
        releaseA();
        await settle(8);
        expect(panel()).toBe(opened);
        expect(opened.contains(document.activeElement)).toBe(true);
        expect([a, b, c].map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'true']);
        expect(a.hasAttribute('aria-disabled')).toBe(false);
        expect(deps.loadProduct).toHaveBeenCalledTimes(3);
    });

    it('never clears the busy state of a newer tap on its own "+ Add"', async () => {
        const pillsReady = holdNextPills();
        start();
        const link = buttonFor(SIZES);
        await tap(link); // waiting for the chunk, no longer busy
        expect(panel()).toBeNull();
        expect(link.hasAttribute('aria-disabled')).toBe(false);
        const release = holdNextLoad();
        await tap(link); // a second tap on it, loading
        expect(link.getAttribute('aria-disabled')).toBe('true');
        pillsReady();
        await settle(8);
        expect(panel()).toBeNull();
        expect(link.getAttribute('aria-disabled')).toBe('true');
        expect(link.classList.contains('is-busy')).toBe(true);
        release();
        await settle(8);
        expect(document.querySelectorAll('[data-rf-qa-panel]').length).toBe(1);
        expect(link.closest('article').contains(panel())).toBe(true);
        expect(link.hasAttribute('aria-disabled')).toBe(false);
    });
});

describe('the panel\'s form', () => {
    it('is never submitted, so an implicit submission or ticket 44\'s buttons (type=submit by default) never leave the listing', async () => {
        start();
        await tap(buttonFor(SIZES));
        const form = panel().querySelector('[data-rf-qa-form]');
        const submits = [];
        // Bubble phase on the document: it sees the event after the panel's own listener.
        const record = event => submits.push(event.defaultPrevented);
        document.addEventListener('submit', record);
        const submit = document.createElement('button'); // as ticket 44's "Add 1" would be, with no type
        form.appendChild(submit);
        submit.click();
        const event = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(event);
        document.removeEventListener('submit', record);
        expect(submits).toEqual([true, true]);
        expect(event.defaultPrevented).toBe(true);
        expect(deps.navigate).not.toHaveBeenCalled();
        expect(panel()).not.toBeNull();
    });
});

describe('the phone sheet (below 801px)', () => {
    beforeEach(() => { phone = true; });

    it('is modal, and Tab goes round its controls without leaving it', async () => {
        start();
        await tap(buttonFor(SIZES));
        const dialog = panel();
        expect(dialog.hasAttribute('data-test-modal')).toBe(true);
        const controls = Array.from(dialog.querySelectorAll('a[href], button, input:not([type="hidden"])'));
        const last = controls[controls.length - 1];
        last.focus();
        const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        last.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(controls[0]);
        const back = new KeyboardEvent('keydown', {
            key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
        });
        controls[0].dispatchEvent(back);
        expect(document.activeElement).toBe(last);
    });

    it('closes when the browser closes it on Escape, with focus back on "+ Add"', async () => {
        start();
        const link = buttonFor(SIZES);
        await tap(link);
        panel().close(); // the browser's answer to Escape on a modal dialog
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(link);
        expect(document.documentElement.hasAttribute('data-rf-open')).toBe(false);
    });

    it('closes on a tap on its backdrop', async () => {
        start();
        await tap(buttonFor(SIZES));
        panel().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel()).toBeNull();
    });
});

describe('a pattern with one size (stories 32 and 34)', () => {
    it('adds one fly straight away, confirms it under the button and once in the live region, then tells the header and the page', async () => {
        start();
        const link = cardFor(6178);
        link.focus();
        await tap(link);
        expect(panel()).toBeNull();
        const [form] = deps.addItem.mock.calls[0];
        expect(Array.from(form.entries())).toEqual([['action', 'add'], ['product_id', '6178'], ['attribute[118]', '401'], ['qty[]', '1']]);
        const status = link.closest('[data-rf-qa-wrap]').querySelector('[data-rf-qa-status]');
        expect(status.textContent).toBe('Added 1 × size 10. 15 flies in your cart. View cart');
        expect(status.querySelector('a').getAttribute('href')).toBe('/cart.php');
        await spokenSoon();
        expect(spoken).toEqual(['Added 1 × size 10. 15 flies in your cart.']);
        expect(calls).toEqual([['notify', 15], ['changed', { source: 'quick-add', productId: 6178 }]]);
        expect(link.hasAttribute('aria-disabled')).toBe(false);
        expect(document.activeElement).toBe(link);
    });

    it('takes stock\'s cart summary for the header when the cart can\'t be read', async () => {
        deps.doFetch.mockResolvedValue({ ok: false });
        start();
        await tap(cardFor(6178));
        expect(calls).toEqual([['notify', 15], ['changed', { source: 'quick-add', productId: 6178 }]]);
    });

    it('says a failed add under the button and in the live region, and leaves the button usable', async () => {
        deps.addItem.mockResolvedValue({ data: { error: '<p>We don\'t have enough of that size.</p>' } });
        start();
        const link = cardFor(6178);
        await tap(link);
        const status = link.closest('[data-rf-qa-wrap]').querySelector('[data-rf-qa-status]');
        expect(status.textContent).toBe('We don\'t have enough of that size.');
        expect(status.classList.contains('rf-qa-status--error')).toBe(true);
        await spokenSoon();
        expect(spoken).toEqual(['We don\'t have enough of that size.']);
        expect(link.hasAttribute('aria-disabled')).toBe(false);
        expect(calls).toEqual([]);
        deps.addItem.mockRejectedValue(new Error('offline'));
        await tap(link);
        expect(status.isConnected).toBe(false);
        expect(link.closest('[data-rf-qa-wrap]').querySelector('[data-rf-qa-status]').textContent).toBe('That didn\'t go in your cart. Try again.');
    });

    it('opens the panel instead when stock says the one size is sold out', async () => {
        deps.optionChange.mockResolvedValue({ data: { in_stock_attributes: [] } });
        start();
        await tap(cardFor(6178));
        expect(deps.addItem).not.toHaveBeenCalled();
        expect(panel().querySelectorAll('[aria-disabled="true"]').length).toBe(1);
    });

    it('holds the button while it works, so a second tap adds nothing more', async () => {
        let answer;
        deps.addItem.mockReturnValue(new Promise(resolve => { answer = resolve; }));
        start();
        const link = cardFor(6178);
        link.click();
        await settle(8);
        expect(link.getAttribute('aria-disabled')).toBe('true');
        link.click();
        await settle(8);
        answer({ data: { cart_item: { id: 'i1' } } });
        await settle(8);
        expect(deps.addItem).toHaveBeenCalledTimes(1);
        expect(deps.loadProduct).toHaveBeenCalledTimes(1);
    });
});

describe('any other shape of options', () => {
    it('goes to the product page: Colour and Fly Sizes (5663), and an option that isn\'t Fly Sizes', async () => {
        start();
        for (const id of [5663, 9101]) {
            const link = cardFor(id);
            await tap(link); // eslint-disable-line no-await-in-loop
            expect(deps.navigate).toHaveBeenLastCalledWith(link.href);
        }
        expect(panel()).toBeNull();
        expect(deps.addItem).not.toHaveBeenCalled();
    });
});

describe('a product that fails to load', () => {
    it('opens the panel with the reason and a link to the product page, said in the live region', async () => {
        start();
        const link = cardFor(1234);
        await tap(link);
        const dialog = panel();
        expect(dialog.querySelector('.rf-qa-title').textContent).toBe('Product 1234');
        expect(dialog.getAttribute('aria-labelledby')).toBe('rf-qa-title-1234');
        expect(dialog.querySelector('.rf-qa-failed').textContent).toBe('We couldn\'t load the sizes. Go to the product page');
        expect(dialog.querySelector('.rf-qa-failed a').getAttribute('href')).toBe(link.getAttribute('href'));
        expect(dialog.querySelector('[data-rf-qa-close] .is-srOnly').textContent).toBe('Close');
        expect(link.hasAttribute('aria-disabled')).toBe(false);
        await spokenSoon();
        expect(spoken).toEqual(['We couldn\'t load the sizes.']);
    });

    it('counts an answer that isn\'t the product\'s markup, such as a rate limit\'s page, as a failure', async () => {
        deps.loadProduct.mockResolvedValue('<html><body>Too many requests</body></html>');
        start();
        await tap(buttonFor(SIZES));
        expect(panel().querySelector('.rf-qa-failed')).not.toBeNull();
    });
});

describe('the cart\'s count', () => {
    it('reads the Storefront Cart API and counts by the brand rule', async () => {
        const doFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(CART(3)) }));
        await expect(readCartCount('ReelFlies', doFetch)).resolves.toEqual({ units: 3, products: 1, flies: true });
        expect(doFetch.mock.calls[0][0]).toBe('/api/storefront/carts?include=lineItems.physicalItems.options');
        await expect(readCartCount('Other', doFetch)).resolves.toEqual({ units: 3, products: 1, flies: false });
    });

    it('says flies or items, one or more, and an empty cart', () => {
        const words = {
            cartFly: '# fly in your cart.', cartFlies: '# flies in your cart.', cartItem: '# item in your cart.', cartItems: '# items in your cart.', cartEmpty: 'Your cart is empty.',
        };
        expect(cartLine({ units: 1, flies: true }, words)).toBe('1 fly in your cart.');
        expect(cartLine({ units: 4, flies: false }, words)).toBe('4 items in your cart.');
        expect(cartLine({ units: 0, flies: false }, words)).toBe('Your cart is empty.');
        expect(cartLine(null, words)).toBe('');
    });
});

describe('quick-add.js, the storefront it hands the panel', () => {
    it('loads the product with quick-add-product.html, and passes on only its markup', async () => {
        utils.api.product.getById.mockImplementation((id, params, callback) => callback(null, '<div data-rf-qa-content></div>'));
        await expect(storefrontDeps().loadProduct(4831)).resolves.toBe('<div data-rf-qa-content></div>');
        expect(utils.api.product.getById).toHaveBeenCalledWith(4831, { template: TEMPLATE }, expect.any(Function));
        expect(TEMPLATE).toBe('reelflies/quick-add-product');
        utils.api.product.getById.mockImplementation((id, params, callback) => callback(new Error('offline')));
        await expect(storefrontDeps().loadProduct(4831)).rejects.toThrow('offline');
        utils.api.product.getById.mockImplementation((id, params, callback) => callback(null, { content: 1 }));
        await expect(storefrontDeps().loadProduct(4831)).rejects.toThrow(/no product markup/);
    });

    it('asks stock\'s option change with the form, and takes only an answer with data', async () => {
        utils.api.productAttributes.optionChange.mockImplementation((id, query, callback) => callback(null, { data: { in_stock_attributes: [301] } }));
        await expect(storefrontDeps().optionChange(4831, 'product_id=4831')).resolves.toEqual({ data: { in_stock_attributes: [301] } });
        expect(utils.api.productAttributes.optionChange.mock.calls[0].slice(0, 2)).toEqual([4831, 'product_id=4831']);
        utils.api.productAttributes.optionChange.mockImplementation((id, query, callback) => callback(null, '<html>429</html>'));
        await expect(storefrontDeps().optionChange(4831, 'product_id=4831')).rejects.toThrow();
    });

    it('adds through stock\'s itemAdd, so its analytics hooks still fire, and reads stock\'s cart summary', async () => {
        utils.api.cart.itemAdd.mockImplementation((form, callback) => callback(null, { data: { cart_item: {} } }));
        utils.api.cart.getCartQuantity.mockImplementation((options, callback) => callback(null, 7));
        const form = new FormData();
        await expect(storefrontDeps().addItem(form)).resolves.toEqual({ data: { cart_item: {} } });
        expect(utils.api.cart.itemAdd.mock.calls[0][0]).toBe(form);
        await expect(storefrontDeps().readQuantity()).resolves.toBe(7);
    });

    it('starts nothing when the page says rf_quick_add is off', async () => {
        quickAdd.load({ rfQuickAdd: false });
        document.querySelector(QUICK_ADD).click();
        await settle();
        expect(utils.api.product.getById).not.toHaveBeenCalled();
    });
});

describe('the panel\'s own copies of the brand rule and the confirmation, which keep rf-add-flow\'s chunk to itself', () => {
    const LINES = [
        [],
        [{ productId: 1, quantity: 3, brand: 'ReelFlies' }],
        [{ productId: 1, quantity: 3, brand: 'ReelFlies' }, { productId: 2, quantity: 1, brand: ' Umpqua ' }],
        [{ productId: 1, quantity: 1, brand: null }, { productId: undefined, quantity: 1, brand: null }],
        [{ productId: 1, quantity: '2', brand: 'ReelFlies' }, { productId: 1, quantity: 5, brand: 'ReelFlies' }],
    ];
    const SETTINGS = ['ReelFlies', ' ReelFlies , Umpqua ', '', null, ',,'];

    it('count a cart as cart-count.js does, for every cart and setting', () => {
        for (const setting of SETTINGS) {
            expect(flyBrandList(setting)).toEqual(cartCount.flyBrandList(setting));
            for (const lines of LINES) expect(countCart(lines, flyBrandList(setting))).toEqual(cartCount.countCart(lines, cartCount.flyBrandList(setting)));
        }
    });

    it('confirm an add as add-words.js does', () => {
        const words = {
            added: 'Added {qty} × {choice}.', cartFly: '# fly in your cart.', cartFlies: '# flies in your cart.', cartItem: '# item in your cart.', cartItems: '# items in your cart.',
        };
        for (const count of [null, { units: 1, flies: true }, { units: 15, flies: true }, { units: 1, flies: false }, { units: 4, flies: false }]) {
            expect(confirmation({ qty: 1, choice: 'size 14', count }, words)).toBe(addWords.confirmation({ qty: 1, choice: 'size 14', count }, words));
        }
    });
});
