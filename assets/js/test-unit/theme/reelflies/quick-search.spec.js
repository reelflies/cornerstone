import startQuickSearch, {
    DEBOUNCE_MS, MIN_LENGTH, OPEN_TOKEN, bindQuickSearch, matchCategories, navCategories, searchUrl, words,
} from '../../../theme/reelflies/quick-search';
import { isOpen } from '../../../theme/reelflies/open-state';

// Quick search (ticket 30; spec module 5; stories 2, 3 and 68): the suggestions under each
// ReelFlies search form. The category matcher reads the names out of the nav, the request goes
// out once, 400 ms after the last keystroke, and the dropdown shows the count heading, up to two
// categories, the product rows and "See all", announcing the total once.

// What components/reelflies/quick-results.html renders, as the search API returns it.
function results({ total = 3, query = 'caddis', rows = 3 } = {}) {
    const heading = total ? `${total} results for “${query}”` : `No results for “${query}”`;
    const items = Array.from({ length: rows }, (_, i) => `<li class="rf-qs-product"><a class="rf-qs-link" href="/fly-${i}/"><span class="rf-qs-name">Fly ${i}</span><span class="rf-qs-price">$0.95</span></a></li>`).join('');
    return `<div class="rf-qs-results" data-rf-qs-results data-rf-qs-total="${total}" data-rf-qs-category-label="category">
        <p class="rf-qs-heading" data-rf-qs-heading>${heading}</p>
        <template data-rf-qs-category-tile><span class="rf-qs-thumb rf-qs-thumb--category"><svg class="rf-icon rf-qs-category-chev" aria-hidden="true" focusable="false"><use href="#rf-icon-chevron-down"></use></svg></span></template>
        <ul class="rf-qs-categories" data-rf-qs-categories hidden></ul>
        ${total ? `<ul class="rf-qs-products">${items}</ul><a class="rf-qs-all" href="/search.php" data-rf-qs-all>See all ${total} results</a>` : ''}
    </div>`;
}

const NAV = `
    <nav class="navPages">
        <ul class="navPages-list">
            <li class="navPages-item"><a class="navPages-action has-subMenu" href="/flies/">Flies</a>
                <div class="navPage-subMenu"><ul class="navPage-subMenu-list">
                    <li><a class="navPage-subMenu-action navPages-action" href="/flies/" aria-label="All Flies">All Flies</a></li>
                    <li><a class="navPage-subMenu-action navPages-action" href="/flies/dry-flies/">Dry Flies</a>
                        <ul class="navPage-childList">
                            <li><a class="navPage-childList-action navPages-action" href="/flies/dry-flies/caddis-dry-flies/">Caddis Dry Flies</a></li>
                            <li><a class="navPage-childList-action navPages-action" href="/flies/dry-flies/attractors-stimulators/">Attractors &amp; Stimulators</a></li>
                        </ul>
                    </li>
                    <li><a class="navPage-subMenu-action navPages-action" href="/flies/nymphs/">Nymphs</a>
                        <ul class="navPage-childList">
                            <li><a class="navPage-childList-action navPages-action" href="/flies/nymphs/caddis-larva/">Caddis Emerger, Larva &amp; Pupa</a></li>
                            <li><a class="navPage-childList-action navPages-action" href="/flies/nymphs/caddis-pupa/">Caddis Pupa</a></li>
                        </ul>
                    </li>
                    <li><a class="navPage-childList-action navPages-action" href="/flies/clearance/">**Clearance Flies**</a></li>
                </ul></div>
            </li>
            <li class="navPages-item navPages-item-page"><a class="navPages-action" href="/shipping/">Shipping Dry Info</a></li>
        </ul>
        <ul class="navPages-list navPages-list--user">
            <li class="navPages-item"><a class="navPages-action" href="/giftcertificates.php">Gift Certificates</a></li>
            <li class="navPages-item"><a class="navPages-action has-subMenu" href="#">Currency: CAD</a></li>
        </ul>
    </nav>`;

function page({ nav = NAV } = {}) {
    document.body.innerHTML = `
        <header data-rf-header>
            <form class="rf-search-form" role="search" action="/search.php" method="get" data-rf-search-form="header">
                <label for="rf-search-header">Search flies</label>
                <input id="rf-search-header" name="search_query" type="search">
                <button type="submit">Search</button>
            </form>
            <div id="menu">${nav}</div>
        </header>
        <form class="rf-search-form" role="search" action="/search.php" method="get" data-rf-search-form="phone">
            <input id="rf-search-phone" name="search_query" type="search">
            <button type="submit">Search</button>
        </form>
        <main><a href="/elsewhere/">Elsewhere</a></main>`;
    return {
        form: document.querySelector('[data-rf-search-form="header"]'),
        input: document.getElementById('rf-search-header'),
        phoneForm: document.querySelector('[data-rf-search-form="phone"]'),
        phoneInput: document.getElementById('rf-search-phone'),
        outside: document.querySelector('main a'),
    };
}

function type(input, value) {
    input.value = value; // eslint-disable-line no-param-reassign
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

// A real keydown can be cancelled; the dropdown's Escape cancels it to tell the header's toggle.
const key = (target, name) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

// Lets the request's promise and the render after it run, under fake timers.
async function settle() {
    for (let i = 0; i < 5; i += 1) await Promise.resolve(); // eslint-disable-line no-await-in-loop
}

describe('words', () => {
    it('lower-cases a name and splits it on anything but letters and digits', () => {
        expect(words('Caddis Emerger, Larva & Pupa')).toEqual(['caddis', 'emerger', 'larva', 'pupa']);
        expect(words('**Clearance Flies**')).toEqual(['clearance', 'flies']);
        expect(words('  ')).toEqual([]);
    });

    it('folds accents, so "eclosion" finds "Éclosion"', () => {
        expect(words('Éclosion Émergente')).toEqual(['eclosion', 'emergente']);
    });
});

describe('navCategories', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('reads every category link marked data-rf-category, in nav order (build pipeline 6.9)', () => {
        page({
            nav: `<nav><a data-rf-category href="/dry-flies/">Dry Flies</a>
                <a data-rf-category href="/dry-flies/caddis/"> Caddis Dry Flies </a>
                <a class="navPages-action" href="/fly-gear/">Fly Gear</a></nav>`,
        });
        expect(navCategories()).toEqual([
            { name: 'Dry Flies', url: '/dry-flies/' },
            { name: 'Caddis Dry Flies', url: '/dry-flies/caddis/' },
        ]);
    });

    it('falls back to the stock nav\'s .navPages-action links, once per URL, without pages or the account links', () => {
        page();
        expect(navCategories()).toEqual([
            { name: 'Flies', url: '/flies/' },
            { name: 'Dry Flies', url: '/flies/dry-flies/' },
            { name: 'Caddis Dry Flies', url: '/flies/dry-flies/caddis-dry-flies/' },
            { name: 'Attractors & Stimulators', url: '/flies/dry-flies/attractors-stimulators/' },
            { name: 'Nymphs', url: '/flies/nymphs/' },
            { name: 'Caddis Emerger, Larva & Pupa', url: '/flies/nymphs/caddis-larva/' },
            { name: 'Caddis Pupa', url: '/flies/nymphs/caddis-pupa/' },
            { name: '**Clearance Flies**', url: '/flies/clearance/' },
        ]);
    });

    it('reads nothing from a page with no nav', () => {
        document.body.innerHTML = '<main></main>';
        expect(navCategories()).toEqual([]);
    });
});

describe('matchCategories', () => {
    const list = [
        { name: 'Flies', url: '/flies/' },
        { name: 'Dry Flies', url: '/flies/dry-flies/' },
        { name: 'Caddis Dry Flies', url: '/flies/dry-flies/caddis-dry-flies/' },
        { name: 'Attractors & Stimulators', url: '/flies/dry-flies/attractors-stimulators/' },
        { name: 'Caddis Emerger, Larva & Pupa', url: '/flies/nymphs/caddis-larva/' },
        { name: 'Caddis Pupa', url: '/flies/nymphs/caddis-pupa/' },
        { name: 'Pheasant Tails', url: '/flies/nymphs/pheasant-tails/' },
    ];

    it('returns at most 2 names, in nav order', () => {
        expect(matchCategories('caddis', list).map(c => c.name)).toEqual(['Caddis Dry Flies', 'Caddis Emerger, Larva & Pupa']);
    });

    it('ignores case and word order', () => {
        expect(matchCategories('DRY caddis', list).map(c => c.name)).toEqual(['Caddis Dry Flies']);
        expect(matchCategories('pupa CADDIS', list).map(c => c.name)).toEqual(['Caddis Pupa', 'Caddis Emerger, Larva & Pupa']);
    });

    it('matches each word as the start of a word in the name, so "ant" doesn\'t find "Pheasant"', () => {
        expect(matchCategories('ant', list)).toEqual([]);
        expect(matchCategories('stim', list).map(c => c.name)).toEqual(['Attractors & Stimulators']);
    });

    it('puts a name the query matches whole first', () => {
        expect(matchCategories('caddis pupa', list).map(c => c.name)).toEqual(['Caddis Pupa', 'Caddis Emerger, Larva & Pupa']);
    });

    it('needs every word to match, and returns nothing for an empty query', () => {
        expect(matchCategories('elk hair caddis', list)).toEqual([]);
        expect(matchCategories('   ', list)).toEqual([]);
    });

    it('takes a smaller limit', () => {
        expect(matchCategories('caddis', list, 1)).toHaveLength(1);
    });
});

describe('searchUrl', () => {
    it('adds the query to the form\'s action, encoded once', () => {
        expect(searchUrl('/search.php', 'bh & "leech"')).toBe('/search.php?search_query=bh%20%26%20%22leech%22');
        expect(searchUrl('https://reelflies.ca/search.php', 'elk hair')).toBe('https://reelflies.ca/search.php?search_query=elk%20hair');
    });
});

describe('the dropdown', () => {
    let quick;
    let request;
    let announce;
    let els;

    beforeEach(() => {
        jest.useFakeTimers();
        els = page();
        request = jest.fn(query => Promise.resolve(results({ query })));
        announce = jest.fn();
        quick = bindQuickSearch(els.form, { request, announce, categories: () => navCategories() });
    });

    afterEach(() => {
        quick.stop();
        jest.useRealTimers();
        document.documentElement.removeAttribute('data-rf-open');
        document.body.innerHTML = '';
    });

    const dropdown = () => els.form.querySelector('[data-rf-qs]');

    it('sends the request once, 400 ms after the last keystroke (story 2)', () => {
        expect(DEBOUNCE_MS).toBe(400);
        ['cad', 'cadd', 'caddi', 'caddis'].forEach(value => {
            type(els.input, value);
            jest.advanceTimersByTime(100);
        });
        expect(request).not.toHaveBeenCalled();
        jest.advanceTimersByTime(DEBOUNCE_MS - 101);
        expect(request).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(request).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith('caddis');
        jest.advanceTimersByTime(5000);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('sends nothing below 3 characters, as stock (quick-search.js:70-73)', () => {
        expect(MIN_LENGTH).toBe(3);
        type(els.input, 'ca');
        jest.advanceTimersByTime(1000);
        type(els.input, ' c  ');
        jest.advanceTimersByTime(1000);
        expect(request).not.toHaveBeenCalled();
    });

    it('shows the count heading, then up to 2 categories, then the products and "See all"', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();

        const box = dropdown();
        expect(box.hidden).toBe(false);
        const order = [...box.querySelectorAll('[data-rf-qs-heading], [data-rf-qs-categories], .rf-qs-products, [data-rf-qs-all]')]
            .map(element => element.className);
        expect(order).toEqual(['rf-qs-heading', 'rf-qs-categories', 'rf-qs-products', 'rf-qs-all']);

        const categories = box.querySelector('[data-rf-qs-categories]');
        expect(categories.hidden).toBe(false);
        const links = [...categories.querySelectorAll('a')];
        expect(links.map(link => link.getAttribute('href'))).toEqual(['/flies/dry-flies/caddis-dry-flies/', '/flies/nymphs/caddis-larva/']);
        expect(links.map(link => link.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Caddis Dry Flies, category', 'Caddis Emerger, Larva & Pupa, category']);
        expect(links[0].querySelector('.rf-qs-kind').textContent.trim()).toBe(', category');

        expect(box.querySelector('[data-rf-qs-all]').getAttribute('href')).toBe('/search.php?search_query=caddis');
    });

    // The reference's category row: an arrow tile in the thumbnail column, then the name and the
    // muted word (rf/skeptic round 1, minor 3).
    it('starts each category row with a copy of the results\' arrow tile, leaving its name alone', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        const links = [...dropdown().querySelectorAll('[data-rf-qs-categories] a')];
        expect(links).toHaveLength(2);
        links.forEach(link => {
            const tile = link.firstElementChild;
            expect(tile.classList.contains('rf-qs-thumb--category')).toBe(true);
            expect(tile.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
            expect(tile.textContent).toBe('');
        });
        expect(links[0].textContent.replace(/\s+/g, ' ').trim()).toBe('Caddis Dry Flies, category');
        expect(links[0].querySelector('.rf-qs-category-text .rf-qs-kind')).not.toBe(null);
        expect(links[0].querySelector('.rf-qs-category-text').textContent).toBe('Caddis Dry Flies, category');
    });

    it('still lists the categories when the results carry no tile', async () => {
        request.mockImplementation(query => Promise.resolve(results({ query }).replace(/<template[\s\S]*?<\/template>/, '')));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        const links = [...dropdown().querySelectorAll('[data-rf-qs-categories] a')];
        expect(links.map(link => link.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Caddis Dry Flies, category', 'Caddis Emerger, Larva & Pupa, category']);
        expect(dropdown().querySelector('.rf-qs-thumb--category')).toBe(null);
    });

    it('writes category names as text, never as markup', async () => {
        quick.stop();
        els = page({ nav: '<nav><a data-rf-category href="/x/">Caddis &lt;img src=x onerror=alert(1)&gt;</a></nav>' });
        quick = bindQuickSearch(els.form, { request, announce, categories: () => navCategories() });
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        const link = dropdown().querySelector('[data-rf-qs-categories] a');
        expect(link.querySelector('img')).toBe(null);
        expect(link.textContent).toContain('Caddis <img src=x onerror=alert(1)>');
    });

    it('hides the categories list when no category matches', async () => {
        type(els.input, 'elk hair caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().querySelector('[data-rf-qs-categories]').hidden).toBe(true);
        expect(dropdown().querySelectorAll('[data-rf-qs-categories] li')).toHaveLength(0);
    });

    it('announces the total once, through the shared live region, with the heading\'s words (story 68)', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith('3 results for “caddis”');

        // The same query again (a trailing space) is not a new search, and isn't announced again.
        type(els.input, 'caddis ');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(request).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledTimes(1);
    });

    it('says nothing matched, with no rows and no "See all"', async () => {
        request.mockImplementation(query => Promise.resolve(results({ total: 0, rows: 0, query })));
        type(els.input, 'zzzz');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().querySelector('[data-rf-qs-heading]').textContent).toBe('No results for “zzzz”');
        expect(dropdown().querySelector('[data-rf-qs-all]')).toBe(null);
        expect(announce).toHaveBeenCalledWith('No results for “zzzz”');
    });

    it('drops an answer that comes back after the query changed', async () => {
        let answerFirst;
        request.mockImplementationOnce(() => new Promise(resolve => { answerFirst = resolve; }));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        type(els.input, 'nymph');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        answerFirst(results({ query: 'caddis', total: 9 }));
        await settle();
        expect(dropdown().querySelector('[data-rf-qs-heading]').textContent).toBe('3 results for “nymph”');
        expect(announce).toHaveBeenCalledTimes(1);
    });

    it('closes quietly when the request fails', async () => {
        request.mockImplementation(() => Promise.reject(new Error('offline')));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().hidden).toBe(true);
        expect(announce).not.toHaveBeenCalled();
        expect(isOpen(OPEN_TOKEN)).toBe(false);
    });

    // A flaky phone connection shouldn't leave the field quiet (rf/skeptic round 1, minor 2).
    it('asks again for the same words after a failed search', async () => {
        request.mockImplementationOnce(() => Promise.reject(new Error('offline')));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().hidden).toBe(true);

        type(els.input, 'caddis ');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(request).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenLastCalledWith('caddis');
        expect(dropdown().hidden).toBe(false);
        expect(announce).toHaveBeenCalledTimes(1);
    });

    // stencil-utils resolves any answer it gets, so a 429, a 5xx or a challenge page arrives as
    // HTML with no results in it (rf/skeptic on f4773362, minor 2).
    it('treats an answer with no results in it as a failed search: nothing of it reaches the page, and the same words are asked again', async () => {
        const errorPage = '<!doctype html><html><head><title>429 Too Many Requests</title><style>body { display: none }</style></head>'
            + '<body><h1>Too Many Requests</h1><img src="/challenge.png" alt=""></body></html>';
        request.mockImplementationOnce(() => Promise.resolve(errorPage));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().hidden).toBe(true);
        expect(dropdown().childElementCount).toBe(0);
        expect(document.body.querySelector('style, img')).toBe(null);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(announce).not.toHaveBeenCalled();

        type(els.input, 'caddis ');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(request).toHaveBeenCalledTimes(2);
        expect(dropdown().hidden).toBe(false);
        expect(announce).toHaveBeenCalledWith('3 results for “caddis”');
    });

    it('keeps the results on show when a newer search\'s answer holds none, and puts only the results in the dropdown', async () => {
        request.mockImplementationOnce(query => Promise.resolve(`<style>.rf-qs { color: red }</style>${results({ query })}<script>window.rfLeak = 1</script>`));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().querySelectorAll(':scope > *')).toHaveLength(1);
        expect(dropdown().firstElementChild.hasAttribute('data-rf-qs-results')).toBe(true);
        expect(document.body.querySelector('style, script')).toBe(null);

        request.mockImplementationOnce(() => Promise.resolve('<h1>Service Unavailable</h1>'));
        type(els.input, 'caddis pupa');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().hidden).toBe(true);
        type(els.input, 'caddis');
        expect(dropdown().hidden).toBe(false);
        expect(dropdown().querySelector('[data-rf-qs-heading]').textContent).toBe('3 results for “caddis”');
    });

    it('sets the open state while open, and clears it when it closes (GEO-3)', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(isOpen(OPEN_TOKEN)).toBe(true);
        expect(document.documentElement.getAttribute('data-rf-open')).toBe('search');

        type(els.input, 'ca');
        expect(dropdown().hidden).toBe(true);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(document.documentElement.hasAttribute('data-rf-open')).toBe(false);
    });

    it('leaves other overlays\' tokens alone', async () => {
        document.documentElement.setAttribute('data-rf-open', 'drawer');
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(document.documentElement.getAttribute('data-rf-open')).toBe('drawer search');
        key(els.input, 'Escape');
        expect(document.documentElement.getAttribute('data-rf-open')).toBe('drawer');
    });

    it('closes on Escape, with focus back in the field', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        dropdown().querySelector('.rf-qs-link').focus();
        key(document.activeElement, 'Escape');
        expect(dropdown().hidden).toBe(true);
        expect(document.activeElement).toBe(els.input);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
    });

    it('closes on a click or focus outside its form, and stays open for one inside', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        dropdown().querySelector('.rf-qs-link').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dropdown().hidden).toBe(false);
        els.outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dropdown().hidden).toBe(true);

        type(els.input, 'caddis pupa');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(dropdown().hidden).toBe(false);
        els.outside.focus();
        expect(dropdown().hidden).toBe(true);
    });

    // A search still waiting when the shopper leaves the field is dropped: no dropdown opens, no
    // open state is set and nothing is announced (rf/skeptic round 1, minor 1).
    it('drops a search still waiting for its 400 ms when focus or a click goes outside the form', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS - 100);
        els.outside.focus();
        els.outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        jest.advanceTimersByTime(1000);
        await settle();
        expect(request).not.toHaveBeenCalled();
        expect(dropdown().hidden).toBe(true);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(announce).not.toHaveBeenCalled();
    });

    it('drops the answer to a search sent before focus or a click went outside the form', async () => {
        let answer;
        request.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        expect(request).toHaveBeenCalledTimes(1);
        els.outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        answer(results({ query: 'caddis' }));
        await settle();
        expect(dropdown().hidden).toBe(true);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(announce).not.toHaveBeenCalled();
    });

    it('drops a waiting search on Escape, and asks again when the same words are typed', async () => {
        let answer;
        request.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        key(els.input, 'Escape');
        answer(results({ query: 'caddis' }));
        await settle();
        expect(dropdown().hidden).toBe(true);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(announce).not.toHaveBeenCalled();

        type(els.input, 'caddis ');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(request).toHaveBeenCalledTimes(2);
        expect(dropdown().hidden).toBe(false);
        expect(announce).toHaveBeenCalledTimes(1);
    });

    // Editing back to the words on show, after Escape or a click outside dropped a newer search,
    // shows their results again (rf/standards and rf/skeptic on f4773362, minor 1).
    it('opens the last results again when the words are edited back to them, without a new request or announcement', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        type(els.input, 'caddis p');
        key(els.input, 'Escape');
        expect(dropdown().hidden).toBe(true);

        type(els.input, 'caddis');
        expect(dropdown().hidden).toBe(false);
        expect(isOpen(OPEN_TOKEN)).toBe(true);
        expect(dropdown().querySelector('[data-rf-qs-heading]').textContent).toBe('3 results for “caddis”');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(request).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledTimes(1);

        type(els.input, 'caddis la');
        els.outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dropdown().hidden).toBe(true);
        type(els.input, 'caddis');
        expect(dropdown().hidden).toBe(false);
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('opens again on focus with the last results, without a new request or announcement', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        els.outside.focus();
        els.input.focus();
        expect(dropdown().hidden).toBe(false);
        expect(isOpen(OPEN_TOKEN)).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledTimes(1);
    });

    it('gives the input no combobox attributes: the simple model (critique, aria-allowed-attr)', async () => {
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        ['role', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete', 'aria-owns'].forEach(attr => {
            expect(els.input.hasAttribute(attr)).toBe(false);
        });
    });

    it('lets a real submit through to the search page, and stops an empty one', () => {
        const submit = () => {
            const event = new Event('submit', { bubbles: true, cancelable: true });
            els.form.dispatchEvent(event);
            return event.defaultPrevented;
        };
        type(els.input, 'caddis');
        expect(submit()).toBe(false);
        type(els.input, '   ');
        expect(submit()).toBe(true);
        expect(document.activeElement).toBe(els.input);
    });

    // The page is on its way to the search page: a late answer opens and says nothing over it
    // (rf/skeptic on f4773362, minor 3).
    it('drops a search on its way, or still waiting for its 400 ms, when the form is submitted', async () => {
        const submit = () => els.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        let answer;
        request.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        expect(request).toHaveBeenCalledTimes(1);
        submit();
        answer(results({ query: 'caddis' }));
        await settle();
        expect(dropdown().hidden).toBe(true);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(announce).not.toHaveBeenCalled();

        type(els.input, 'nymph');
        jest.advanceTimersByTime(DEBOUNCE_MS - 1);
        submit();
        jest.advanceTimersByTime(1000);
        await settle();
        expect(request).toHaveBeenCalledTimes(1);
        expect(dropdown().hidden).toBe(true);
    });

    it('stops listening when stopped', () => {
        quick.stop();
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        expect(request).not.toHaveBeenCalled();
        quick = { stop() {} };
    });
});

describe('startQuickSearch', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        document.documentElement.removeAttribute('data-rf-open');
        document.body.innerHTML = '';
    });

    it('binds every ReelFlies search form on the page, and only one dropdown is open at a time', async () => {
        const els = page();
        const request = jest.fn(query => Promise.resolve(results({ query })));
        const started = startQuickSearch({}, { request, announce: () => {} });
        expect(started.forms).toHaveLength(2);

        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        type(els.phoneInput, 'nymph');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        expect(els.form.querySelector('[data-rf-qs]').hidden).toBe(true);
        expect(els.phoneForm.querySelector('[data-rf-qs]').hidden).toBe(false);
        expect(document.documentElement.getAttribute('data-rf-open')).toBe('search');
        started.stop();
    });

    it('leaves the stock quick-search form alone', () => {
        document.body.innerHTML = '<form data-quick-search-form><input data-search-quick></form>';
        const started = startQuickSearch({}, { request: jest.fn(), announce: () => {} });
        expect(started.forms).toHaveLength(0);
        started.stop();
    });
});

describe('the phone header\'s search toggle', () => {
    function header() {
        document.body.innerHTML = `
            <header data-rf-header>
                <form class="rf-search-form rf-header-search" id="rf-search-form-header" action="/search.php" method="get" data-rf-search-form="header">
                    <input id="rf-search-header" name="search_query" type="search">
                </form>
                <nav>
                    <a class="rf-header-search-link" href="/search.php" data-rf-search-link>Search</a>
                    <button class="rf-header-search-toggle" type="button" aria-expanded="false" aria-controls="rf-search-form-header" hidden data-rf-search-toggle>Search</button>
                </nav>
            </header>
            <main><a href="/elsewhere/">Elsewhere</a></main>`;
        return {
            header: document.querySelector('[data-rf-header]'),
            link: document.querySelector('[data-rf-search-link]'),
            toggle: document.querySelector('[data-rf-search-toggle]'),
            input: document.getElementById('rf-search-header'),
        };
    }

    let started;
    afterEach(() => {
        if (started) started.stop();
        started = null;
        document.documentElement.removeAttribute('data-rf-open');
        document.body.innerHTML = '';
    });

    it('swaps the search link for the toggle button once the script runs (the link is the no-script path)', () => {
        const els = header();
        started = startQuickSearch({}, { request: jest.fn(), announce: () => {} });
        expect(els.link.hidden).toBe(true);
        expect(els.toggle.hidden).toBe(false);
    });

    it('opens the header\'s form as the bar\'s second row and focuses the field, and closes it again', () => {
        const els = header();
        started = startQuickSearch({}, { request: jest.fn(), announce: () => {} });
        els.toggle.click();
        expect(els.toggle.getAttribute('aria-expanded')).toBe('true');
        expect(els.header.classList.contains('rf-is-search-open')).toBe(true);
        expect(document.activeElement).toBe(els.input);
        els.toggle.click();
        expect(els.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(els.header.classList.contains('rf-is-search-open')).toBe(false);
    });

    // The forms are bound before the toggle, so the dropdown's Escape runs first and marks the
    // event used (rf/standards round 1, minor 4).
    it('takes the first Escape for the dropdown open in the row, and the second for the row', async () => {
        jest.useFakeTimers();
        const els = header();
        const request = jest.fn(query => Promise.resolve(results({ query })));
        started = startQuickSearch({}, { request, announce: () => {} });
        els.toggle.click();
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        await settle();
        const box = document.querySelector('[data-rf-qs]');
        expect(box.hidden).toBe(false);

        key(els.input, 'Escape');
        expect(box.hidden).toBe(true);
        expect(els.header.classList.contains('rf-is-search-open')).toBe(true);
        expect(els.toggle.getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(els.input);

        key(els.input, 'Escape');
        expect(els.header.classList.contains('rf-is-search-open')).toBe(false);
        expect(els.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(els.toggle);
        jest.useRealTimers();
    });

    it('opens no dropdown in the row after the toggle has closed it, when the answer comes late', async () => {
        jest.useFakeTimers();
        const els = header();
        let answer;
        const request = jest.fn(() => new Promise(resolve => { answer = resolve; }));
        const announce = jest.fn();
        started = startQuickSearch({}, { request, announce });
        els.toggle.click();
        type(els.input, 'caddis');
        jest.advanceTimersByTime(DEBOUNCE_MS);
        els.toggle.click();
        expect(els.header.classList.contains('rf-is-search-open')).toBe(false);
        answer(results({ query: 'caddis' }));
        await settle();
        expect(document.querySelector('[data-rf-qs]').hidden).toBe(true);
        expect(isOpen(OPEN_TOKEN)).toBe(false);
        expect(announce).not.toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('closes the row on Escape from the field, with focus back on the toggle', () => {
        const els = header();
        started = startQuickSearch({}, { request: jest.fn(), announce: () => {} });
        els.toggle.click();
        key(els.input, 'Escape');
        expect(els.header.classList.contains('rf-is-search-open')).toBe(false);
        expect(els.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(els.toggle);
    });
});
