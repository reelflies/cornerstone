// The category page (ticket 32; spec modules 8 and 11; O10, R13, UX-5, UX-7, CD-10; stories 21,
// 22, 26, 27 and 76; redesign step 3): pages/category.html and pages/custom/category/rf-noindex.html
// both render components/reelflies/category-page.html in their hero block. Its head is
// listing-head.html: the stone (the category's banner under the scrim) where category-banner-rule.html
// allows, the plain limestone head elsewhere, each with the breadcrumbs, the one H1, the
// description's intro (description-part.html) and the subcategories as chips (category-chips.html);
// then the listing (listing-body.html) and the rest of the description under "About …". The pages
// are tree-4-shaped (category/pages.json), with tree 4's categories and menu ids (menu/tree-4.json)
// and ticket 31's six cards.
//
// Gone with master's listing-header.html, and not tested: the chips' 72x48 thumbnails (the store's
// category images are 16:7 banners) and the two sizes attributes for cards beside or without the
// facet sidebar (one sizes string now, measured for the grid at every width).
//
//   node --test scripts/qa/render/partials/category.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, scriptsOfType, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const read = file => JSON.parse(fs.readFileSync(path.join(HERE, file), 'utf8'));
const tree4 = read('menu/tree-4.json');
const { products } = read('card/products.json');
const { pages } = read('category/pages.json');
const FACETS = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/pages/category-page/fixtures/fly-type.json'), 'utf8')).page_context.category.facets;
const SIZES = '(min-width: 1280px) 250px, (min-width: 1040px) 230px, (min-width: 640px) 31vw, 46vw';

// A category page on tree 4's data: `key` names a page in category/pages.json; `category` lays
// fields over its category, `categories` replaces the categories data, and `regions` fills the
// Page Builder regions.
const render = (key, {
    theme = {}, template = 'pages/category', category = {}, categories = tree4.categories, regions,
} = {}) => renderPartial(template, {
    page_type: 'category',
    breadcrumbs: pages[key].breadcrumbs,
    category: { ...pages[key].category, products, ...category },
    categories,
    pagination: {
        category: {
            links: [{ url: '?page=1', number: 1 }, { url: '?page=2', number: 2 }],
            current: 1,
            next: '?page=2',
            start: 1,
            end: 24,
            total: 48,
        },
    },
    settings: {},
    theme_settings: { ...tree4.theme_settings, ...theme },
}, regions ? { regions } : {});
// The listing with the Fly Sizes facet, so the sidebar renders beside the grid.
const faceted = { faceted_search_enabled: true, facets: FACETS, selected: { items: [], remove_all_url: '' } };

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const head = html => outerHtml(html, 'div', hasClass('rf-list-head'));
const banner = html => findTags(outerHtml(head(html) || '', 'div', hasClass('rf-list-head__photo')) || '', 'img')[0];
const intro = html => outerHtml(head(html) || '', 'div', hasClass('rf-list-head__intro'));
const about = html => outerHtml(html, 'section', hasClass('rf-list-about'));
const rest = html => outerHtml(html, 'div', attrs => 'data-rf-description' in attrs);
const chips = html => outerHtml(html, 'ul', attrs => 'data-rf-chips' in attrs);
const chipLinks = html => findTags(chips(html) || '', 'a');
const cardImages = html => elementsHtml(html, 'article', hasClass('rf-fly__card')).map(card => findTags(card, 'img')[0]);
const highPriority = html => findTags(html, 'img').filter(img => img.attrs.fetchpriority === 'high');

describe('the head (listing-head.html, by category-banner-rule.html)', () => {
    it('gives a top-level Fly Type with an image the stone: its banner eager, high priority, with srcset, sizes and dimensions, and the H1 and intro on it (story 21)', async () => {
        const html = await render('fly-type');
        assert.match(findTags(head(html), 'div')[0].attrs.class, /(^|\s)rf-list-head--stone(\s|$)/);
        const img = banner(html);
        assert.ok(img, 'a banner image');
        assert.equal(img.attrs.loading, undefined, 'eager');
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.match(img.attrs.srcset, /640w.*1600w/);
        assert.equal(img.attrs.sizes, '100vw');
        assert.equal(img.attrs.width, '1600');
        assert.equal(img.attrs.height, '700');
        assert.equal(img.attrs.alt, '', 'the H1 on it names the category');
        assert.match(img.attrs.src, /\/stencil\/\d+w\/i\/dry-flies__36885\.original\.jpg/);
        assert.match(img.attrs.class, /(^|\s)rf-graded(\s|$)/, 'the warm grade');
        assert.equal(textOf(outerHtml(head(html), 'h1')), 'Dry Flies');
        assert.match(textOf(intro(html)), /float on the surface/);
    });

    it('leaves the page one H1 and one high-priority image, the banner\'s: the first card gives it up (ticket 31\'s rf_banner)', async () => {
        const html = await render('fly-type');
        assert.equal(findTags(html, 'h1').length, 1);
        assert.equal(highPriority(html).length, 1);
        assert.equal(highPriority(html)[0].raw, banner(html).raw);
        assert.equal(cardImages(html)[0].attrs.fetchpriority, undefined);
        assert.equal(cardImages(html)[0].attrs.loading, undefined, 'the first row stays eager');
    });

    it('gives a Species page, a child of rf_menu_species_root_id, the stone (story 27)', async () => {
        const img = banner(await render('species'));
        assert.ok(img, 'a banner image');
        assert.equal(img.attrs.fetchpriority, 'high');
    });

    it('finds the Species root one level down too, as the menu does', async () => {
        const species = tree4.categories.find(category => String(category.id) === '520');
        const nested = [{
            id: '900', name: 'Flies', url: '/flies/', children: [species],
        }, ...tree4.categories.filter(category => category !== species)];
        assert.ok(banner(await render('species', { categories: nested })));
    });

    for (const [key, what] of [['sub-type', 'a Fly Type sub-type'], ['species-type', 'a Species × Fly Type page'], ['more', 'a More from ReelFlies category']]) {
        it(`gives ${what} the plain head, though it has an image, and leaves high priority to the first card (O10)`, async () => {
            const html = await render(key);
            assert.ok(head(html), 'a head');
            assert.match(findTags(head(html), 'div')[0].attrs.class, /(^|\s)rf-list-head--plain(\s|$)/);
            assert.equal(banner(html), undefined, 'no banner image');
            assert.equal(findTags(head(html), 'img').length, 0);
            assert.equal(findTags(html, 'h1').length, 1);
            assert.equal(cardImages(html)[0].attrs.fetchpriority, 'high');
            assert.equal(highPriority(html).length, 1);
        });
    }

    it('gives a Fly Type with no image the plain head', async () => {
        assert.equal(banner(await render('fly-type', { category: { image: null } })), undefined);
    });

    it('gives every page the plain head while the menu ids are empty (ReelFlies CA until wave R1)', async () => {
        for (const key of ['fly-type', 'species']) {
            assert.equal(banner(await render(key, { theme: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } })), undefined, key); // eslint-disable-line no-await-in-loop
        }
    });

    it('reads ids with spaces round the commas, as the menu does', async () => {
        assert.ok(banner(await render('fly-type', { theme: { rf_menu_type_ids: '503, 501 ,502' } })));
    });

    it('holds the breadcrumbs, with their BreadcrumbList, before the H1, and is a <div> inside the page\'s one <main>', async () => {
        const html = await render('fly-type');
        const h = head(html);
        assert.equal(findTags(h, 'nav').filter(nav => nav.attrs['aria-label'] === 'Breadcrumb').length, 1);
        assert.ok(h.indexOf('class="breadcrumbs"') < h.indexOf('<h1'), 'the breadcrumbs first');
        assert.equal(findTags(html, 'header').filter(tag => hasClass('rf-list-head')(tag.attrs)).length, 0);
        const lists = scriptsOfType(html, 'application/ld+json').map(text => JSON.parse(text)).filter(data => data['@type'] === 'BreadcrumbList');
        assert.equal(lists.length, 1);
        assert.deepEqual(lists[0].itemListElement.map(item => item.item.name), pages['fly-type'].breadcrumbs.map(crumb => crumb.name));
        assert.equal(findTags(html, 'main').length, 1);
        assert.ok(outerHtml(html, 'main').includes(h), 'the head is in <main>');
    });

    it('is followed by the category_below_header region, as stock placed it, then the listing', async () => {
        const html = await render('fly-type', { regions: { category_below_header: '<p data-rf-test-intro>Intro</p>', category_below_content: '<p data-rf-test-below>Below</p>' } });
        // The head holds the breadcrumbs' JSON-LD, which the helpers read as text, so place it
        // in the markup they return.
        const markup = markupOnly(html);
        const after = markup.slice(markup.indexOf(head(html)) + head(html).length);
        assert.match(after, /^\s*<div data-content-region="category_below_header"><p data-rf-test-intro>Intro<\/p><\/div>\s*<div class="rf-list/);
        assert.ok(html.indexOf('data-rf-test-below') > html.indexOf('data-rf-grid'), 'category_below_content after the listing');
        assert.ok(html.indexOf('data-rf-test-below') < html.indexOf('rf-list-about'), 'and before the rest of the description');
    });
});

describe('the description, split at <!--more--> (O10; story 21)', () => {
    it('puts the part before the marker under the H1, and the rest after the grid under "About {name}"', async () => {
        const html = await render('fly-type');
        assert.match(textOf(intro(html)), /float on the surface/);
        assert.doesNotMatch(textOf(head(html)), /About dry flies/);
        assert.match(textOf(rest(html)), /About dry flies.*sizes 12 to 18/);
        assert.doesNotMatch(textOf(rest(html)), /float on the surface/);
        assert.equal(textOf(outerHtml(about(html), 'h2')), 'About Dry Flies');
        assert.ok(html.indexOf('data-rf-description') > html.indexOf('data-rf-grid'), 'the rest follows the grid');
        assert.equal(html.match(/<!--more-->/g), null, 'the marker itself is never printed');
    });

    it('splits a marker in its own paragraph, <p><!--more--></p>, the same, with both halves balanced', async () => {
        const html = await render('species');
        assert.equal(textOf(intro(html)), 'Every fly we tie for trout, from size 22 midges to articulated streamers.');
        assert.equal(textOf(rest(html)), 'Narrow by fly type, then by hook size.');
        assert.deepEqual(unbalancedTags(head(html)), []);
        assert.deepEqual(unbalancedTags(about(html)), []);
    });

    it('puts a description with no marker after the grid, whole, and the head shows the H1 alone (the owner, 2026-11-07: the first flies stay on a phone\'s first screen)', async () => {
        const html = await render('sub-type');
        assert.equal(intro(html), null);
        assert.equal(textOf(head(html)).replace(/^Home Dry Flies Caddis Dry Flies /, ''), 'Caddis Dry Flies Elk Hair Caddis 9 Show all 1', 'the breadcrumbs, the H1 and the chips');
        assert.equal(textOf(rest(html)), 'Elk hair, X-caddis and CDC patterns for the evening hatch.');
    });

    it('wraps the rest once, and prints no section when the marker ends the description', async () => {
        assert.equal(findTags(await render('fly-type'), 'div').filter(tag => 'data-rf-description' in tag.attrs).length, 1);
        const only = await render('fly-type', { category: { description: '<p>Only an intro.</p><!--more-->' } });
        assert.equal(rest(only), null);
        assert.equal(about(only), null);
        assert.equal(textOf(intro(only)), 'Only an intro.');
    });

    it('prints neither part for an empty description', async () => {
        const html = await render('more');
        assert.equal(intro(html), null);
        assert.equal(about(html), null);
        assert.equal(textOf(outerHtml(head(html), 'h1')), 'Fly Gear');
    });

    it('balances the whole page', async () => {
        for (const key of Object.keys(pages)) assert.deepEqual(unbalancedTags(await render(key)), [], key); // eslint-disable-line no-await-in-loop
    });
});

describe('the chips (category-chips.html; UX-5, CD-10; stories 22 and 27)', () => {
    it('link every subcategory, in the store\'s order, all in the HTML, with its count while counts are on', async () => {
        const html = await render('fly-type');
        assert.deepEqual(chipLinks(html).map(link => link.attrs.href), pages['fly-type'].category.subcategories.map(sub => sub.url));
        const names = elementsHtml(chips(html), 'span', hasClass('rf-chip__name')).map(textOf);
        assert.deepEqual(names, pages['fly-type'].category.subcategories.map(sub => sub.name.replace('&amp;', '&')));
        const counts = elementsHtml(chips(html), 'span', hasClass('rf-chip__n')).map(textOf);
        assert.deepEqual(counts, pages['fly-type'].category.subcategories.map(sub => String(sub.product_count)));
        assert.equal(elementsHtml(chips(await render('fly-type', { theme: { rf_counts: false } })), 'span', hasClass('rf-chip__n')).length, 0, 'counts off: no counts');
        assert.equal(findTags(chips(html), 'img').length, 0, 'no thumbnails');
    });

    it('sit on the stone on a banner page and on the light elsewhere', async () => {
        assert.match(findTags(chips(await render('fly-type')), 'ul')[0].attrs.class, /(^|\s)rf-chips--stone(\s|$)/);
        assert.match(findTags(chips(await render('sub-type')), 'ul')[0].attrs.class, /(^|\s)rf-chips--light(\s|$)/);
        assert.equal(findTags(chips(await render('fly-type')), 'ul')[0].attrs['aria-label'], 'Dry Flies categories');
    });

    it('end with the "more" chip, hidden until the script needs it, with both of its labels', async () => {
        const list = chips(await render('fly-type'));
        const more = outerHtml(list, 'li', attrs => 'data-rf-chips-more' in attrs);
        assert.ok('hidden' in findTags(more, 'li')[0].attrs, 'hidden');
        const [button] = findTags(more, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs['data-rf-more-label'], '+# more');
        assert.match(textOf(more), /Show all 8/);
        assert.ok(list.lastIndexOf('data-rf-chips-more') > list.lastIndexOf('rf-chip__name'), 'the last item');
        assert.equal(findTags(list, 'li').length, pages['fly-type'].category.subcategories.length + 1);
    });

    it('list a Species page\'s Species × Fly Type pages (story 27)', async () => {
        const list = chips(await render('species'));
        assert.deepEqual(elementsHtml(list, 'span', hasClass('rf-chip__name')).map(textOf), pages.species.category.subcategories.map(sub => sub.name));
    });

    it('render nothing for a category with no subcategories', async () => {
        assert.equal(chips(await render('species-type')), null);
    });

    it('replace the stock sidebar\'s subcategory list: the only navList left is a facet\'s', async () => {
        const html = await render('fly-type', { category: faceted });
        const navLists = findTags(html, 'ul').filter(ul => hasClass('navList')(ul.attrs));
        assert.ok(navLists.length > 0, 'the facet list renders');
        navLists.forEach(ul => assert.ok('data-facet' in ul.attrs, ul.raw));
        assert.equal(findTags(await render('fly-type'), 'ul').filter(ul => hasClass('navList')(ul.attrs)).length, 0, 'no facets: no list at all');
    });
});

describe('the listing (listing-body.html)', () => {
    it('puts the facets in an <aside> beside the grid when the category has a visible facet, and takes the full width when it has none', async () => {
        const beside = await render('fly-type', { category: faceted });
        const list = findTags(beside, 'div').find(tag => hasClass('rf-list')(tag.attrs));
        assert.match(list.attrs.class, /(^|\s)rf-list--side(\s|$)/);
        // The order line is an <aside> too: count the facets' by its id.
        const sidebars = html => findTags(html, 'aside').filter(tag => tag.attrs.id === 'faceted-search-container');
        assert.equal(sidebars(beside).length, 1);
        assert.match(sidebars(beside)[0].attrs.class, /(^|\s)rf-list__side(\s|$)/);
        assert.equal(findTags(beside).find(tag => tag.attrs.id === 'product-listing-container').name, 'div');
        const alone = await render('fly-type');
        assert.doesNotMatch(findTags(alone, 'div').find(tag => hasClass('rf-list')(tag.attrs)).attrs.class, /rf-list--side/);
        assert.equal(sidebars(alone).length, 0);
        assert.equal(sidebars(await render('fly-type', { category: { ...faceted, facets: FACETS.map(facet => ({ ...facet, visible: false })) } })).length, 0, 'a hidden facet: no sidebar');
    });

    it('is a <div>, never a <section>, so the facets\' <aside> stays a top-level landmark (step 4)', async () => {
        const html = await render('fly-type', { category: faceted });
        assert.equal(findTags(html, 'section').filter(tag => hasClass('rf-list')(tag.attrs)).length, 0);
        assert.equal(findTags(html, 'div').filter(tag => hasClass('rf-list')(tag.attrs)).length, 1);
    });

    it('sizes every card\'s photo for the grid, beside the facets or not, and on a refresh rendered alone', async () => {
        for (const html of [await render('fly-type', { category: faceted }), await render('fly-type')]) {
            cardImages(html).forEach(img => assert.equal(img.attrs.sizes, SIZES));
        }
        // Stock faceted search re-renders components/category/product-listing as its own
        // template (category.js), where @root holds the category.
        const refresh = await renderPartial('components/category/product-listing', {
            category: { ...pages['fly-type'].category, products, ...faceted },
            pagination: { category: { links: [], current: 1 } },
            settings: {},
            theme_settings: { product_list_display_mode: 'grid' },
        });
        assert.equal(cardImages(refresh).length, products.length);
        cardImages(refresh).forEach(img => assert.equal(img.attrs.sizes, SIZES));
    });
});

describe('24 per page and the pager (UX-7; story 26)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
    const schema = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'schema.json'), 'utf8'));
    const field = id => schema.flatMap(group => group.settings || []).find(setting => setting.id === id);

    it('lists 24 on category and brand pages, an option the settings now offer', () => {
        for (const id of ['categorypage_products_per_page', 'brandpage_products_per_page']) {
            assert.equal(config.settings[id], 24, id);
            assert.ok(field(id).options.some(option => option.value === 24), `${id} offers 24`);
        }
    });

    it('reads the setting in all three category templates\' front matter', () => {
        for (const file of ['templates/pages/category.html', 'templates/pages/custom/category/rf-noindex.html', 'templates/pages/custom/category/species-hub.html']) {
            const source = fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
            assert.match(source, /^---\ncategory:\n {4}products:\n {8}limit: \{\{theme_settings\.categorypage_products_per_page\}\}\n---/, file);
        }
    });

    it('keeps the stock numbered pager of <a href> links, after the grid', async () => {
        const html = await render('fly-type');
        const pager = outerHtml(html, 'nav', hasClass('pagination'));
        assert.deepEqual(findTags(pager, 'a').map(link => decodeHtml(link.attrs.href)), ['?page=1', '?page=2', '?page=2']);
        assert.ok(html.indexOf(pager) > html.indexOf('data-rf-grid'));
    });
});

describe('the noindex template (pages/custom/category/rf-noindex.html; R13, SEO-10; story 76)', () => {
    const robots = html => findTags(html, 'meta').filter(meta => (meta.attrs.name || '').toLowerCase() === 'robots');

    it('has exactly one robots meta, "noindex, follow", and is otherwise the stock template\'s page', async () => {
        const noindex = await render('sub-type', { template: 'pages/custom/category/rf-noindex' });
        const stock = await render('sub-type');
        assert.deepEqual(robots(noindex).map(meta => meta.attrs.content), ['noindex, follow']);
        // The page's script context names its template, as every custom template's does.
        const same = noindex.replace(/\s*<meta name="robots" content="noindex, follow">/, '').replaceAll('pages/custom/category/rf-noindex', 'pages/category');
        const squash = html => html.replace(/\s+/g, ' ');
        assert.equal(squash(same), squash(stock));
    });

    it('leaves the stock template with no robots meta', async () => {
        assert.deepEqual(robots(await render('fly-type')), []);
    });

    it('keeps the stock template\'s front matter, inject and head block, in step', () => {
        const source = name => fs.readFileSync(path.join(THEME_DIR, 'templates', `${name}.html`), 'utf8');
        const parts = text => ({
            front: text.match(/^---\n[\s\S]*?\n---\n/)[0],
            inject: text.match(/\{\{inject "categoryProductsPerPage"[^}]*\}\}/)[0],
            links: text.match(/\{\{#if pagination\.category\.previous\}\}[\s\S]*?\{\{\/if\}\}\n\s*\{\{#if pagination\.category\.next\}\}[\s\S]*?\{\{\/if\}\}/)[0].replace(/\s+/g, ' '),
        });
        assert.deepEqual(parts(source('pages/custom/category/rf-noindex')), parts(source('pages/category')));
        assert.match(source('pages/custom/category/rf-noindex'), /\{\{#partial "hero"\}\}\s*\{\{> components\/reelflies\/category-page\}\}\s*\{\{\/partial\}\}/);
    });
});
