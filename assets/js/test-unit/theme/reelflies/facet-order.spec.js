import orderFacets, { FLY_SIZES_LISTS, facetLabel, orderFacetList } from '../../../theme/reelflies/facet-order';

// The facet markup as stock templates/components/faceted-search/facets/multi.html renders it:
// the title, the product count in a span, and the close icon. Hrefs are the facet context's
// own URLs, with the _bc_fsnf=1 marker robots.txt blocks (SEO-12).
const facetHref = (facet, value) => `/flies/dry-flies/?_bc_fsnf=1&${encodeURIComponent(facet).replace(/%20/g, '+')}=${encodeURIComponent(value)}`;

const multiItem = (facet, value, count) => `
    <li class="navList-item">
        <a
            href="${facetHref(facet, value)}"
            class="navList-action navList-action--checkbox"
            rel="nofollow"
            data-faceted-search-facet>
            ${value}
            <span>(${count})</span>

            <span class="navList-action-close" aria-hidden="true">
                <svg class="icon"><use href="#icon-close"/></svg>
            </span>
        </a>
    </li>`;

const multiList = (facet, values) => `
    <ul id="facetedSearch-navList--${facet.toLowerCase().replace(/ /g, '-')}" data-facet="${facet}" class="navList" data-has-more-results="false">
        ${values.map((value, index) => multiItem(facet, value, 40 - index)).join('')}
    </ul>`;

// The "Show more" modal list, as stock show-more-facets.html renders it (no data-facet).
const showMoreList = values => `
    <ul class="navList facetedSearch-optionColumns">
        ${values.map((value, index) => `
            <li class="navList-item">
                <a href="${facetHref('Fly Sizes', value)}" class="navList-action" rel="nofollow" data-id="${index}" data-faceted-search-facet>
                    ${value}
                    <span>(${index + 1})</span>
                </a>
            </li>`).join('')}
    </ul>`;

const SHUFFLED = ['14', '1', '2/0', '24', '6', '4/0', '10', '1/0', '20', '2', '6/0', '16', '8', '3/0', '22', '12', '5/0', '4', '18'];
const HOOK_ORDER = ['6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '1', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'];

const render = html => {
    document.body.innerHTML = html;
    return document.body.firstElementChild;
};
const labels = list => Array.from(list.querySelectorAll('li')).map(facetLabel);
const anchors = root => Array.from(root.querySelectorAll('a[data-faceted-search-facet]'));
const watch = root => {
    const observer = new MutationObserver(() => {});
    observer.observe(root, {
        subtree: true, childList: true, attributes: true, characterData: true,
    });
    return observer;
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('facetLabel', () => {
    it('reads the facet value from stock markup, without the product count or the close icon', () => {
        const list = render(multiList('Fly Sizes', ['2/0', '14']));
        expect(labels(list)).toEqual(['2/0', '14']);
    });

    it('still reads the value when a restyle wraps it in its own element', () => {
        const list = render('<ul><li><a href="/x/?_bc_fsnf=1&Fly+Sizes=16" data-faceted-search-facet><span class="pill">16</span> <span>(3)</span></a></li></ul>');
        expect(facetLabel(list.firstElementChild)).toBe('16');
    });
});

describe('orderFacetList', () => {
    it('sorts a shuffled Fly Sizes list into hook order: 6/0 … 1/0, then 1, 2, 4 … 24', () => {
        const list = render(multiList('Fly Sizes', SHUFFLED));
        expect(orderFacetList(list)).toBe(true);
        expect(labels(list)).toEqual(HOOK_ORDER);
    });

    it('sorts the catalogue\'s spelling of aught sizes (1-0 … 6-0) the same way', () => {
        const list = render(multiList('Fly Sizes', ['12', '1-0', '6-0', '2', '3-0']));
        orderFacetList(list);
        expect(labels(list)).toEqual(['6-0', '3-0', '1-0', '2', '12']);
    });

    it('keeps values it doesn\'t recognise after the known sizes, in the API\'s order', () => {
        const list = render(multiList('Fly Sizes', ['Assorted', '14', 'Mixed', '2/0', 'Small']));
        orderFacetList(list);
        expect(labels(list)).toEqual(['2/0', '14', 'Assorted', 'Mixed', 'Small']);
    });

    it('leaves every href unchanged: each anchor moves with its own <li>, and no attribute is written', () => {
        const list = render(multiList('Fly Sizes', SHUFFLED));
        const before = new Map(anchors(list).map(anchor => [anchor, anchor.getAttribute('href')]));
        const observer = watch(list);

        orderFacetList(list);

        const records = observer.takeRecords();
        observer.disconnect();
        expect(records.filter(record => record.type !== 'childList')).toEqual([]);
        expect(records.every(record => record.target === list)).toBe(true);
        const after = anchors(list);
        expect(after).toHaveLength(before.size);
        after.forEach(anchor => {
            expect(before.has(anchor)).toBe(true);
            expect(anchor.getAttribute('href')).toBe(before.get(anchor));
            expect(anchor.getAttribute('href')).toBe(facetHref('Fly Sizes', facetLabel(anchor.closest('li'))));
            expect(anchor.getAttribute('rel')).toBe('nofollow');
        });
    });

    it('changes nothing when the list is already in hook order', () => {
        const list = render(multiList('Fly Sizes', HOOK_ORDER));
        const observer = watch(list);
        expect(orderFacetList(list)).toBe(false);
        expect(observer.takeRecords()).toEqual([]);
        observer.disconnect();
    });

    it('sorts the "Show more" list, which stock renders without data-facet', () => {
        const list = render(showMoreList(['16', '2/0', '12', '1']));
        orderFacetList(list);
        expect(labels(list)).toEqual(['2/0', '1', '12', '16']);
    });

    it('keeps focus on the pill the shopper is on when the list is reordered', () => {
        const list = render(multiList('Fly Sizes', ['14', '2/0', '12']));
        const pill = anchors(list)[0];
        pill.focus();
        orderFacetList(list);
        expect(labels(list)).toEqual(['2/0', '12', '14']);
        expect(document.activeElement).toBe(pill);
    });

    it('returns false for an empty list', () => {
        expect(orderFacetList(render('<ul data-facet="Fly Sizes"></ul>'))).toBe(false);
    });
});

describe('orderFacets', () => {
    const sidebar = () => render(`<div id="facetedSearch">
        ${multiList('Fly Sizes', ['14', '2/0', '12'])}
        ${multiList('Hook Count', ['12', '6', '24'])}
        ${multiList('Brand', ['Umpqua', 'ReelFlies'])}
    </div>`);

    it('sorts only the Fly Sizes lists by default, and leaves every other facet in the API\'s order', () => {
        const root = sidebar();
        expect(orderFacets(root)).toBe(1);
        expect(labels(root.querySelector(FLY_SIZES_LISTS))).toEqual(['2/0', '12', '14']);
        expect(labels(root.querySelector('[data-facet="Hook Count"]'))).toEqual(['12', '6', '24']);
        expect(labels(root.querySelector('[data-facet="Brand"]'))).toEqual(['Umpqua', 'ReelFlies']);
    });

    it('searches the whole document when no root is given, and takes another selector for other lists', () => {
        sidebar();
        expect(orderFacets()).toBe(1);
        expect(orderFacets(document, '.facetedSearch-optionColumns')).toBe(0);
        const modal = document.createElement('div');
        modal.innerHTML = showMoreList(['16', '2/0']);
        document.body.appendChild(modal);
        expect(orderFacets(document, '.facetedSearch-optionColumns')).toBe(1);
        expect(labels(modal.firstElementChild)).toEqual(['2/0', '16']);
    });

    it('is safe to run again after a refresh: a sorted page needs no change', () => {
        const root = sidebar();
        orderFacets(root);
        expect(orderFacets(root)).toBe(0);
    });
});
