// The Fly size filter's behaviour (ticket 33; size-filter.js): hook order on load, after a refresh
// and in the "Show more" modal; the count announced and focus put back after a refresh; Filter
// opening the facets through stock's toggle. Stock faceted-search.js and collapsible.js aren't
// loaded: the page stands in for what they render, and a refresh is what category.js's callback
// does, the listing's children and then the sidebar's replaced in one task.

const SHUFFLED = ['14', '1', '2/0', '24', '6', '1/0', '10'];
const HOOK_ORDER = ['2/0', '1/0', '1', '6', '10', '14', '24'];
const href = (size, selected = []) => `/flies/dry-flies/?_bc_fsnf=1&Fly+Sizes=${[...selected, size].map(encodeURIComponent).join('&Fly+Sizes=')}`;

// The sidebar as stock index.html and components/reelflies/facet-sizes.html render it.
const sidebar = ({ sizes = SHUFFLED, selected = [], open = false } = {}) => `
    <div id="facetedSearch">
        <a href="#facetedSearch-navList" role="button" class="facetedSearch-toggle toggleLink" data-collapsible>Browse by Fly Sizes</a>
        <div id="facetedSearch-navList" class="facetedSearch-navList${open ? ' is-open' : ''}">
            <div class="accordion-block rf-size-facet">
                <h2 class="accordion-heading"><button type="button" class="accordion-navigation toggleLink" data-collapsible="#facetedSearch-content--fly-sizes">Fly Sizes</button></h2>
                <div id="facetedSearch-content--fly-sizes" class="accordion-content">
                    <ul id="facetedSearch-navList--fly-sizes" data-facet="Fly Sizes" class="navList rf-size-pills">
                        ${sizes.map(size => `<li class="navList-item"><a href="${href(size, selected)}" class="navList-action rf-size-pill${selected.includes(size) ? ' is-selected' : ''}" rel="nofollow" aria-label="Size ${size}" data-faceted-search-facet>${size}</a></li>`).join('')}
                    </ul>
                    <p class="rf-size-help"><a href="/fly-hook-size-chart/">What do sizes mean?</a></p>
                </div>
            </div>
        </div>
    </div>`;

// The listing as listing-top.html and stock's grid render it, or the empty state.
const listing = ({ count = '48 flies', empty = false } = {}) => `
    <div class="rf-list-top">
        <p class="rf-list-count" data-rf-list-count tabindex="-1">${count}</p>
        <div class="rf-list-tools">
            <button type="button" class="rf-filter-button" aria-controls="facetedSearch-navList" aria-expanded="false" data-rf-filter-button>Filter</button>
            ${empty ? '' : '<form class="actionBar" data-sort-by="product"><select name="sort"><option>Featured</option><option>Newest</option></select></form>'}
        </div>
    </div>
    ${empty ? '<p class="rf-listing-empty"><a href="/flies/dry-flies/?_bc_fsnf=1" rel="nofollow" data-faceted-search-facet>Clear filters</a></p>' : '<ul class="productGrid"><li>Adams</li></ul>'}`;

const PAGE = `<div class="page">
    <aside class="page-sidebar" id="faceted-search-container">${sidebar()}</aside>
    <main class="page-content" id="product-listing-container">${listing()}</main>
</div>
<div id="modal" class="modal"><div class="modal-content"></div></div>`;

const sizes = root => [...root.querySelectorAll('[data-facet="Fly Sizes"] li')].map(item => item.textContent.replace(/\(\d+\)/, '').trim());
const anchorsBySize = root => Object.fromEntries([...root.querySelectorAll('[data-facet="Fly Sizes"] a')].map(anchor => [anchor.textContent.trim(), anchor.getAttribute('href')]));
const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const refresh = ({ listingOptions, sidebarOptions }) => {
    document.getElementById('product-listing-container').innerHTML = listing(listingOptions);
    document.getElementById('faceted-search-container').innerHTML = sidebar(sidebarOptions);
};

let announce;
let sizeFilter;

beforeEach(async () => {
    jest.resetModules();
    jest.doMock('../../../theme/reelflies/live-region', () => ({ announce: jest.fn() }));
    ({ announce } = await import('../../../theme/reelflies/live-region'));
    sizeFilter = (await import('../../../theme/reelflies/size-filter')).default;
    document.body.innerHTML = PAGE;
});

describe('hook order (R2; story 23)', () => {
    it('puts the Fly Sizes pills in hook order on load, every href unchanged (SEO-6)', () => {
        const hrefs = anchorsBySize(document);
        sizeFilter.load({}, document);
        expect(sizes(document)).toEqual(HOOK_ORDER);
        expect(anchorsBySize(document)).toEqual(hrefs);
    });

    it('writes no facet attribute: nothing but the pills\' order changes in the sidebar', async () => {
        const observer = new MutationObserver(() => {});
        observer.observe(document.getElementById('faceted-search-container'), { subtree: true, attributes: true, characterData: true });
        sizeFilter.load({}, document);
        expect(observer.takeRecords()).toEqual([]);
    });

    it('puts them in hook order again after a refresh, whatever order the API sends', async () => {
        sizeFilter.load({}, document);
        refresh({ sidebarOptions: { sizes: ['24', '6', '2/0', '1'], selected: ['6'] } });
        await settle();
        expect(sizes(document)).toEqual(['2/0', '1', '6', '24']);
    });

    it('puts the "Show more" list in hook order when the modal fills', async () => {
        sizeFilter.load({}, document);
        document.querySelector('#modal .modal-content').innerHTML = `<ul class="navList facetedSearch-optionColumns" data-facet="Fly Sizes">
            ${SHUFFLED.map(size => `<li class="navList-item"><a href="${href(size)}" class="navList-action" rel="nofollow" data-faceted-search-facet>${size} <span>(3)</span></a></li>`).join('')}
        </ul>`;
        await settle();
        expect(sizes(document.getElementById('modal'))).toEqual(HOOK_ORDER);
    });
});

describe('after a refresh (story 68)', () => {
    it('announces the listing\'s count once', async () => {
        sizeFilter.load({}, document);
        refresh({ listingOptions: { count: '12 flies' }, sidebarOptions: { selected: ['14'] } });
        await settle();
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith('12 flies', document);
    });

    it('puts focus back on the size the shopper used, in its new place', async () => {
        sizeFilter.load({}, document);
        const pill = [...document.querySelectorAll('.rf-size-pill')].find(anchor => anchor.textContent === '14');
        pill.focus();
        pill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        refresh({ listingOptions: { count: '12 flies' }, sidebarOptions: { selected: ['14'] } });
        await settle();
        expect(document.activeElement.textContent).toBe('14');
        expect(document.activeElement.closest('[data-facet="Fly Sizes"]')).not.toBeNull();
    });

    it('puts focus back on the sort box after a sort', async () => {
        sizeFilter.load({}, document);
        document.querySelector('[data-sort-by] select').dispatchEvent(new Event('change', { bubbles: true }));
        refresh({});
        await settle();
        expect(document.activeElement).toBe(document.querySelector('[data-sort-by] select'));
    });

    it('puts focus on the count when the control used is gone, such as Clear filters, and announces the empty state', async () => {
        sizeFilter.load({}, document);
        refresh({ listingOptions: { count: 'No flies match these filters', empty: true }, sidebarOptions: { selected: ['14'] } });
        await settle();
        expect(announce).toHaveBeenLastCalledWith('No flies match these filters', document);
        document.querySelector('.rf-listing-empty a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        refresh({});
        await settle();
        expect(document.activeElement).toBe(document.querySelector('[data-rf-list-count]'));
    });

    it('leaves focus alone when it is still somewhere on the page', async () => {
        document.body.insertAdjacentHTML('afterbegin', '<input id="search">');
        sizeFilter.load({}, document);
        document.getElementById('search').focus();
        refresh({});
        await settle();
        expect(document.activeElement).toBe(document.getElementById('search'));
    });
});

describe('Filter, on phones', () => {
    // Stock's collapsible: a click on a toggle opens or closes its target, and the toggle's class
    // follows (collapsible.js). Stock closes every facet when the panel starts hidden.
    const onClick = event => {
        const toggle = event.target.closest('[data-collapsible]');
        if (!toggle) return;
        event.preventDefault();
        const target = document.querySelector(toggle.getAttribute('data-collapsible') || toggle.getAttribute('href'));
        toggle.classList.toggle('is-open', target.classList.toggle('is-open'));
    };
    const collapsible = () => document.addEventListener('click', onClick);
    afterEach(() => document.removeEventListener('click', onClick));

    it('opens the facets through stock\'s toggle, says so, opens Fly Sizes if stock closed it, and moves focus to the first pill', () => {
        collapsible();
        sizeFilter.load({}, document);
        const button = document.querySelector('[data-rf-filter-button]');
        button.click();
        expect(document.getElementById('facetedSearch-navList').classList.contains('is-open')).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById('facetedSearch-content--fly-sizes').classList.contains('is-open')).toBe(true);
        expect(document.activeElement).toBe(document.querySelector('.rf-size-pill'));
        expect(document.activeElement.textContent).toBe('2/0');
    });

    it('closes them again, and after a refresh the new Filter button says whether they are open', async () => {
        collapsible();
        sizeFilter.load({}, document);
        document.querySelector('[data-rf-filter-button]').click();
        document.querySelector('[data-rf-filter-button]').click();
        expect(document.querySelector('[data-rf-filter-button]').getAttribute('aria-expanded')).toBe('false');
        refresh({ sidebarOptions: { open: true } });
        await settle();
        expect(document.querySelector('[data-rf-filter-button]').getAttribute('aria-expanded')).toBe('true');
    });

    it('does nothing on a page without the module\'s listing', () => {
        document.body.innerHTML = '<p>No listing here</p>';
        expect(() => sizeFilter.load({}, document)).not.toThrow();
    });
});
