// The category page (ticket 32; spec modules 8 and 11; O10, R13, UX-5, UX-7, CD-10; stories 21,
// 22, 26, 27 and 76): pages/category.html and pages/custom/category/rf-noindex.html both render
// components/reelflies/category-page.html, whose header is listing-header.html and whose
// subcategories are category-chips.html. The pages are tree-4-shaped (category/pages.json), with
// tree 4's categories and menu ids (menu/tree-4.json) and ticket 31's six cards.
//
//   node --test scripts/qa/render/partials/category.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const read = file => JSON.parse(fs.readFileSync(path.join(HERE, file), 'utf8'));
const tree4 = read('menu/tree-4.json');
const { products } = read('card/products.json');
const { pages } = read('category/pages.json');

// A category page on tree 4's data: `key` names a page in category/pages.json; `category` lays
// fields over its category, and `categories` replaces the categories data.
const render = (key, {
    theme = {}, template = 'pages/category', category = {}, categories = tree4.categories,
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
});

const header = html => outerHtml(html, 'div', attrs => /(^|\s)rf-listing-header(\s|$)/.test(attrs.class || ''));
const banner = html => findTags(header(html) || '', 'img')[0];
const rest = html => outerHtml(html, 'div', attrs => attrs['data-rf-description'] !== undefined);
const chipLinks = html => findTags(outerHtml(html, 'ul', attrs => attrs['data-rf-chips'] !== undefined) || '', 'a');
const cardImages = html => elementsHtml(html, 'article', attrs => /(^|\s)card(\s|$)/.test(attrs.class || '')).map(card => findTags(card, 'img')[0]);
const highPriority = html => findTags(html, 'img').filter(img => img.attrs.fetchpriority === 'high');

describe('the header (listing-header.html)', () => {
    it('gives a top-level Fly Type with an image the banner: eager, high priority, with srcset, sizes and dimensions, and the H1 and intro on it (story 21)', async () => {
        const html = await render('fly-type');
        const img = banner(html);
        assert.ok(img, 'a banner image');
        assert.equal(img.attrs.loading, undefined, 'eager');
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.match(img.attrs.srcset, /480w.*1600w/);
        assert.ok(img.attrs.sizes, 'sizes');
        assert.equal(img.attrs.width, '1600');
        assert.equal(img.attrs.height, '700');
        assert.equal(img.attrs.alt, '', 'the H1 on it names the category');
        assert.match(img.attrs.src, /\/stencil\/\d+w\/i\/dry-flies__36885\.original\.jpg/);
        const copy = outerHtml(header(html), 'div', attrs => /(^|\s)rf-listing-copy(\s|$)/.test(attrs.class || ''));
        assert.equal(textOf(outerHtml(copy, 'h1')), 'Dry Flies');
        assert.match(textOf(copy), /float on the surface/);
    });

    it('leaves the page one H1 and one high-priority image, the banner\'s: the first card gives it up (ticket 31\'s rf_banner)', async () => {
        const html = await render('fly-type');
        assert.equal(findTags(html, 'h1').length, 1);
        assert.equal(highPriority(html).length, 1);
        assert.equal(cardImages(html)[0].attrs.fetchpriority, undefined);
        assert.equal(cardImages(html)[0].attrs.loading, undefined, 'the first row stays eager');
    });

    it('gives a Species page, a child of rf_menu_species_root_id, the banner (story 27)', async () => {
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
        it(`gives ${what} the plain header, though it has an image, and leaves high priority to the first card (O10)`, async () => {
            const html = await render(key);
            assert.ok(header(html), 'a header');
            assert.equal(banner(html), undefined, 'no banner image');
            assert.equal(findTags(html, 'h1').length, 1);
            assert.equal(cardImages(html)[0].attrs.fetchpriority, 'high');
            assert.equal(highPriority(html).length, 1);
        });
    }

    it('gives a Fly Type with no image the plain header', async () => {
        assert.equal(banner(await render('fly-type', { category: { image: null } })), undefined);
    });

    it('gives every page the plain header while the menu ids are empty (ReelFlies CA until wave R1)', async () => {
        for (const key of ['fly-type', 'species']) {
            assert.equal(banner(await render(key, { theme: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } })), undefined, key); // eslint-disable-line no-await-in-loop
        }
    });

    it('reads ids with spaces round the commas, as the menu does', async () => {
        assert.ok(banner(await render('fly-type', { theme: { rf_menu_type_ids: '503, 501 ,502' } })));
    });
});

describe('the description, split at <!--more--> (O10; story 21)', () => {
    it('puts the part before the marker under the H1, and the rest after the product grid', async () => {
        const html = await render('fly-type');
        assert.match(textOf(header(html)), /float on the surface/);
        assert.doesNotMatch(textOf(header(html)), /About dry flies/);
        assert.match(textOf(rest(html)), /About dry flies.*sizes 12 to 18/);
        assert.doesNotMatch(textOf(rest(html)), /float on the surface/);
        assert.ok(html.indexOf('data-rf-description') > html.indexOf('productGrid'), 'the rest follows the grid');
        assert.equal(html.match(/<!--more-->/g), null, 'the marker itself is never printed');
    });

    it('splits a marker in its own paragraph, <p><!--more--></p>, the same, with both halves balanced', async () => {
        const html = await render('species');
        assert.equal(textOf(outerHtml(header(html), 'div', attrs => /rf-listing-intro/.test(attrs.class || ''))), 'Every fly we tie for trout, from size 22 midges to articulated streamers.');
        assert.equal(textOf(rest(html)), 'Narrow by fly type, then by hook size.');
        assert.deepEqual(unbalancedTags(header(html)), []);
        assert.deepEqual(unbalancedTags(rest(html)), []);
    });

    it('puts a description with no marker after the grid, whole, and the header shows the H1 alone', async () => {
        const html = await render('sub-type');
        assert.equal(textOf(header(html)), 'Caddis Dry Flies');
        assert.equal(textOf(rest(html)), 'Elk hair, X-caddis and CDC patterns for the evening hatch.');
    });

    it('prints neither part for an empty description', async () => {
        const html = await render('more');
        assert.equal(textOf(header(html)), 'Fly Gear');
        assert.equal(rest(html), null);
    });

    it('balances the whole page', async () => {
        for (const key of Object.keys(pages)) assert.deepEqual(unbalancedTags(await render(key)), [], key); // eslint-disable-line no-await-in-loop
    });
});

describe('the chips (category-chips.html; UX-5, CD-10; stories 22 and 27)', () => {
    it('link every subcategory, in the store\'s order, all in the HTML', async () => {
        const links = chipLinks(await render('fly-type'));
        assert.deepEqual(links.map(link => link.attrs.href), pages['fly-type'].category.subcategories.map(sub => sub.url));
    });

    it('show a 72x48 thumbnail only where the subcategory has its own image (ticket 07\'s probe 14)', async () => {
        const list = outerHtml(await render('fly-type'), 'ul', attrs => attrs['data-rf-chips'] !== undefined);
        const items = elementsHtml(list, 'li', attrs => /rf-chips-item/.test(attrs.class || '') && attrs['data-rf-chips-more'] === undefined);
        const thumbs = items.map(item => findTags(item, 'img')[0]);
        assert.deepEqual(thumbs.map(Boolean), pages['fly-type'].category.subcategories.map(sub => Boolean(sub.image)));
        for (const img of thumbs.filter(Boolean)) {
            assert.equal(img.attrs.width, '72');
            assert.equal(img.attrs.height, '48');
            assert.equal(img.attrs.alt, '', 'the chip\'s name says it');
            assert.equal(img.attrs.loading, 'lazy');
            assert.match(img.attrs.srcset, / 1x, .* 2x$/);
        }
    });

    it('end with the "more" chip, hidden until the script needs it, with both of its labels', async () => {
        const list = outerHtml(await render('fly-type'), 'ul', attrs => attrs['data-rf-chips'] !== undefined);
        const more = outerHtml(list, 'li', attrs => attrs['data-rf-chips-more'] !== undefined);
        assert.ok(findTags(more, 'li')[0].attrs.hidden !== undefined, 'hidden');
        const [button] = findTags(more, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs['data-rf-more-label'], '+# more');
        assert.match(textOf(more), /Show all 8/);
        assert.ok(list.lastIndexOf('data-rf-chips-more') > list.lastIndexOf('rf-chip-name'), 'the last item');
    });

    it('list a Species page\'s Species × Fly Type pages (story 27)', async () => {
        const list = outerHtml(await render('species'), 'ul', attrs => attrs['data-rf-chips'] !== undefined);
        assert.deepEqual(elementsHtml(list, 'a').map(textOf), pages.species.category.subcategories.map(sub => sub.name));
    });

    it('render nothing for a category with no subcategories', async () => {
        assert.equal(outerHtml(await render('species-type'), 'ul', attrs => attrs['data-rf-chips'] !== undefined), null);
    });

    it('replace the stock sidebar\'s subcategory list', async () => {
        const html = await render('fly-type', { category: { faceted_search_enabled: true, facets: [] } });
        assert.equal(findTags(html, 'ul').filter(ul => /(^|\s)navList(\s|$)/.test(ul.attrs.class || '')).length, 0);
    });
});

describe('the cards beside the facet sidebar (#68\'s rf/skeptic)', () => {
    it('size the photos for the narrower column when the sidebar renders, and for the full width when it doesn\'t', async () => {
        const beside = cardImages(await render('fly-type', { category: { faceted_search_enabled: true, facets: [] } }));
        const alone = cardImages(await render('fly-type'));
        beside.forEach(img => assert.equal(img.attrs.sizes, '(min-width: 1136px) 258px, (min-width: 801px) calc(23.8vw - 13px), calc(50vw - 24px)'));
        alone.forEach(img => assert.equal(img.attrs.sizes, '(min-width: 801px) 346px, calc(50vw - 24px)'));
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

    it('reads the setting in both category templates\' front matter', () => {
        for (const file of ['templates/pages/category.html', 'templates/pages/custom/category/rf-noindex.html']) {
            const source = fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
            assert.match(source, /^---\ncategory:\n {4}products:\n {8}limit: \{\{theme_settings\.categorypage_products_per_page\}\}\n---/, file);
        }
    });

    it('keeps the stock numbered pager of <a href> links', async () => {
        const pager = outerHtml(await render('fly-type'), 'nav', attrs => /pagination/.test(attrs.class || ''));
        assert.deepEqual(findTags(pager, 'a').map(link => decodeHtml(link.attrs.href)), ['?page=1', '?page=2', '?page=2']);
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
});
