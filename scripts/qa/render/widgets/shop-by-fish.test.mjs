// Fixture renders of the home page's Species section, "Shop by fish" (ticket 49; spec module 7,
// R5, CD-4, CD-6, CD-7, UX-15, HOME-4, SEO-8; story 13): what the store renders from
// widgets/shop-by-fish/template.html with a channel's widget_configuration. The element shots at
// 375 and 1280 are widget-screens.spec.mjs's; the equal columns, the stacking, the scrim's
// contrast and the section's place on the page are home-links-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/shop-by-fish.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { elementsHtml, findTags, textOf } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import {
    THEME_DIR, WIDGETS_DIR, readFixture, renderWidget,
} from '../render.mjs';
import { PLACEMENT_STATUSES } from '../../../widgets/source.mjs';

const DIR = path.join(WIDGETS_DIR, 'shop-by-fish');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const countsFixture = readFixture(path.join(DIR, 'fixtures', 'counts.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const schema = readFixture(path.join(DIR, 'schema.json'));
const render = (configuration = {}, data = fixture.data) => renderWidget('shop-by-fish', { ...fixture, configuration: { ...fixture.configuration, ...configuration }, data });
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const WIDTHS = [400, 800, 1200, 1600];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DRY_BANNER = 'i/dry-flies__36885.original.jpg';

// The reference's data, plan/design/src/store-data.json, in the nearest folder above the checkout
// that has one (~/reelflies/theme for the main clone and every worktree); null where there is
// none, as in CI.
function referenceSpecies() {
    for (let dir = THEME_DIR; ; dir = path.dirname(dir)) {
        const file = path.join(dir, 'plan', 'design', 'src', 'store-data.json');
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).menu.species_panel.species;
        if (path.dirname(dir) === dir) return null;
    }
}
const SPECIES = referenceSpecies();

// The reference's three groups (UX-15; reference.src.html, buildHome), each image a link to its
// largest Species page, and its pills: the eleven Species pages of store-data.json's
// species_panel, in the fixed order (refactor research 01, 4.4), with their root-level tree-4
// paths.
const GROUPS = [
    {
        name: 'Trout, steelhead & salmon', href: '/trout-flies/', cta: 'Shop trout flies', photo: DRY_BANNER, pills: ['Trout Flies', 'Steelhead Flies', 'Atlantic Salmon Flies'],
    },
    {
        name: 'Bass, pike & panfish', href: '/bass-flies/', cta: 'Shop bass flies', photo: 'y/pike-musky__42262.original.jpg', pills: ['Bass Flies', 'Pike & Muskie Flies', 'Panfish Flies', 'Carp Flies'],
    },
    {
        name: 'Saltwater', href: '/bonefish-flies/', cta: 'Shop bonefish flies', photo: 'v/bonefish__38606.original.jpg', pills: ['Bonefish Flies', 'Permit Flies', 'Tarpon, Snook & Redfish Flies', 'Barracuda Flies'],
    },
];
const PATHS = {
    'Trout Flies': '/trout-flies/',
    'Steelhead Flies': '/steelhead-flies/',
    'Atlantic Salmon Flies': '/atlantic-salmon-flies/',
    'Bass Flies': '/bass-flies/',
    'Pike & Muskie Flies': '/pike-muskie-flies/',
    'Panfish Flies': '/panfish-flies/',
    'Carp Flies': '/carp-flies/',
    'Bonefish Flies': '/bonefish-flies/',
    'Permit Flies': '/permit-flies/',
    'Tarpon, Snook & Redfish Flies': '/tarpon-snook-redfish-flies/',
    'Barracuda Flies': '/barracuda-flies/',
};
const GROUP_SIZES = '(max-width: 800px) calc(129vw - 62px), (max-width: 1260px) calc(48vw - 46px), 503px';
const THIRD_SIZES = '(max-width: 800px) calc(300vw - 144px), (max-width: 1260px) calc(100vw - 96px), 1056px';

const groupsOf = html => elementsHtml(html, 'div', attrs => (attrs.class || '').split(/\s+/).includes('rf-species-group'));
const linkOf = group => elementsHtml(group, 'a', attrs => (attrs.class || '').split(/\s+/).includes('rf-species-group__link'));
const pillsOf = html => findTags(html, 'a').filter(tag => (tag.attrs.class || '').split(/\s+/).includes('rf-species-pill'));
const pillTexts = html => elementsHtml(html, 'a', attrs => (attrs.class || '').split(/\s+/).includes('rf-species-pill')).map(textOf);

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
    assert.equal(channelFile.channel_id, 1895766);
});

test('it is placed in home_below_top_products at sort_order 40, after the tiles (10) and 48\'s bands (20, 30), written inactive first', () => {
    // The status isn't pinned to "inactive": the orchestrator's activation, after a release
    // carries _home-links.scss, and an R12 unpublish (ticket 57) each change it in a PR that
    // must pass CI. --verify compares it with the store.
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 40 });
    assert.ok(PLACEMENT_STATUSES.includes(status), status);
    // null until the store makes them; --record fills them in after the orchestrator's apply.
    for (const name of ['template', 'widget', 'placement']) {
        assert.ok(channelFile.uuids[name] === null || UUID.test(channelFile.uuids[name]), `its ${name} uuid is null or recorded`);
    }
    assert.equal(fixture.page, 'pages/home');
    assert.equal(fixture.region, channelFile.placement.region);
});

test('every schema setting has its value on the channel, and nothing else', () => {
    const ids = schema.flatMap(tab => tab.sections.flatMap(section => section.settings.map(setting => setting.id)));
    assert.deepEqual(Object.keys(channelFile.configuration).sort(), [...ids].sort());
    // A setting's default is ReelFlies_CA's value, except where a default would put a channel's
    // own paths on another channel's copy: none here.
    const defaults = Object.fromEntries(schema.flatMap(tab => tab.sections.flatMap(section => section.settings.map(setting => [setting.id, setting.default]))));
    assert.deepEqual(defaults, channelFile.configuration);
});

test('one section, named by its one <h2> "Shop by fish", with an "All species" link to the hub that types no number (HOME-4)', async () => {
    const html = await render();
    const sections = elementsHtml(html, 'section');
    assert.equal(sections.length, 1);
    const [section] = findTags(html, 'section');
    const h2s = findTags(html, 'h2');
    assert.equal(h2s.length, 1);
    assert.equal(textOf(elementsHtml(html, 'h2')[0]), 'Shop by fish');
    assert.equal(section.attrs['aria-labelledby'], h2s[0].attrs.id);
    assert.ok(h2s[0].attrs.id, 'the heading has an id');
    const all = findTags(html, 'a').find(tag => (tag.attrs.class || '').includes('rf-species__all'));
    assert.equal(all.attrs.href, '/species/');
    const allText = textOf(elementsHtml(html, 'a', attrs => (attrs.class || '').includes('rf-species__all'))[0]);
    assert.equal(allText, 'All species');
    assert.doesNotMatch(allText, /\d/);
    assert.equal(findTags(html, 'h1').length, 0);
    assert.deepEqual(unbalancedTags(html), []);
});

test('three equal groups in the reference\'s order, each image one link to its largest Species page, with its name as an <h3> and a visible call to action', async () => {
    const groups = groupsOf(await render());
    assert.equal(groups.length, 3);
    for (const [index, group] of groups.entries()) {
        const { name, href, cta } = GROUPS[index];
        const links = linkOf(group);
        assert.equal(links.length, 1, `${name}: one image link`);
        const [link] = links;
        assert.equal(findTags(link, 'a')[0].attrs.href, href, `${name}: links to its largest Species page`);
        assert.equal(textOf(elementsHtml(link, 'h3')[0]), name);
        assert.equal(textOf(elementsHtml(link, 'span', attrs => (attrs.class || '').includes('rf-species-group__cta'))[0]), cta);
        assert.equal(findTags(link, 'img').length, 1, `${name}: one photo inside the link`);
        assert.equal(findTags(link, 'a').length, 1, `${name}: no link inside the link`);
        assert.equal(findTags(link, 'button').length + findTags(link, 'input').length, 0, `${name}: nothing interactive inside the link`);
    }
});

test('the pills link to all eleven Species pages, three, four and four, at tree 4\'s root-level paths, as store-data.json lists them', async () => {
    const html = await render();
    const groups = groupsOf(html);
    for (const [index, group] of groups.entries()) {
        assert.deepEqual(pillTexts(group), GROUPS[index].pills, GROUPS[index].name);
        assert.deepEqual(pillsOf(group).map(tag => tag.attrs.href), GROUPS[index].pills.map(name => PATHS[name]));
    }
    const all = pillsOf(html);
    assert.equal(all.length, 11);
    assert.equal(new Set(all.map(tag => tag.attrs.href)).size, 11);
    if (SPECIES) {
        // The reference's data, when the plan folder is beside the checkout (it isn't in CI).
        assert.deepEqual(pillTexts(html), SPECIES.map(({ name }) => name));
        assert.deepEqual(all.map(tag => tag.attrs.href), SPECIES.map(({ url }) => url));
    }
    // Never a hidden size category or a "Flies in size N" listing (SEO-6, UX-16).
    for (const tag of findTags(html, 'a')) assert.doesNotMatch(tag.attrs.href, /fly-sizes|size-\d/);
});

test('an empty pill slot renders nothing, so a group can hold one to four Species', async () => {
    const html = await render({ group1_pill4_name: '', group2_pill4_name: '', group2_pill4_url: '' });
    const [first, second] = groupsOf(html);
    assert.equal(findTags(first, 'li').length, 3);
    assert.equal(findTags(second, 'li').length, 3);
    assert.doesNotMatch(html, /<li[^>]*>\s*<\/li>/);
});

test('each photo is a real <img>: alt="", lazy, a srcset from 400w to 1600w, sizes for the width it is drawn at, the file\'s width and height, no fetchpriority', async () => {
    const groups = groupsOf(await render());
    for (const [index, group] of groups.entries()) {
        const { name, photo } = GROUPS[index];
        const [img, ...more] = findTags(group, 'img');
        assert.equal(more.length, 0, `${name}: one image`);
        assert.equal(img.attrs.alt, '', `${name}: decorative, the link's text says where it goes`);
        assert.equal(img.attrs.loading, 'lazy');
        assert.equal(img.attrs.srcset, WIDTHS.map(width => `${BASE}/${width}w/${photo} ${width}w`).join(', '));
        assert.equal(img.attrs.src, `${BASE}/800w/${photo}`);
        assert.equal(img.attrs.sizes, index === 0 ? THIRD_SIZES : GROUP_SIZES);
        assert.equal(img.attrs.width, '1600');
        assert.equal(img.attrs.height, '700');
        assert.ok(!('fetchpriority' in img.attrs), `${name}: the hero's photo is the page's only fetchpriority="high"`);
        assert.ok(!('style' in img.attrs), `${name}: no inline style`);
    }
});

// CD-4: the cold-water group shows the left third of the Dry Flies banner, the page's one
// allowed repeat, marked so home-photo-once leaves it out. Cleared, it is a photo like the
// others, cropped where its focus field says.
test('the cold-water group crops the Dry banner to its left third and marks it data-rf-photo-repeat; the other two are the pike and bonefish frames, unmarked', async () => {
    const [cold, warm, salt] = groupsOf(await render()).map(group => findTags(group, 'img')[0]);
    assert.ok('data-rf-photo-repeat' in cold.attrs);
    assert.match(cold.attrs.class, /\brf-species-group__img--third\b/);
    assert.doesNotMatch(cold.attrs.class, /--x\d/);
    for (const [img, focus] of [[warm, '30'], [salt, '20']]) {
        assert.ok(!('data-rf-photo-repeat' in img.attrs));
        assert.match(img.attrs.class, new RegExp(`\\brf-species-group__img--x${focus}\\b`));
        assert.doesNotMatch(img.attrs.class, /--third/);
    }
    const fresh = findTags(groupsOf(await render({ group1_repeat: false, group1_photo: 'image-manager/rf-cold-water.jpg', group1_focus: '50' }))[0], 'img')[0];
    assert.ok(!('data-rf-photo-repeat' in fresh.attrs), 'a new cold-water frame isn\'t a repeat');
    assert.match(fresh.attrs.class, /\brf-species-group__img--x50\b/);
    assert.equal(fresh.attrs.sizes, GROUP_SIZES);
});

test('no group uses the hero\'s frame, a Fly Type card\'s banner other than the marked crop, or a tile\'s photo (CD-1, CD-4)', () => {
    const others = ['home-lead', 'link-tiles'].flatMap(name => Object.values(readFixture(path.join(WIDGETS_DIR, name, 'channels', '1895766.json')).configuration))
        .filter(value => typeof value === 'string' && /\.(jpe?g|png|webp)$/.test(value));
    const photos = [1, 2, 3].map(n => channelFile.configuration[`group${n}_photo`]);
    assert.equal(new Set(photos).size, 3);
    for (const [index, photo] of photos.entries()) {
        const repeat = channelFile.configuration[`group${index + 1}_repeat`];
        assert.equal(others.includes(photo), repeat, `group ${index + 1}'s photo ${photo}: shown elsewhere exactly when marked as the repeat`);
    }
    assert.equal(photos[0], DRY_BANNER);
});

test('no pill shows a count the query doesn\'t return: today none, since the widget has no query until tree 4 (HOME-4)', async () => {
    const html = await render();
    assert.equal(findTags(html, 'span').filter(tag => (tag.attrs.class || '').includes('rf-species-pill__count')).length, 0);
    assert.doesNotMatch(pillTexts(html).join(' '), /\d/);
});

test('with the query\'s product counts, each pill shows its own, and a Species the query returns no count for shows none', async () => {
    const html = await renderWidget('shop-by-fish', countsFixture);
    assert.equal(countsFixture.shot, false);
    const texts = pillTexts(html);
    assert.equal(texts[0], 'Trout Flies 1600');
    assert.equal(texts[1], 'Steelhead Flies 737');
    // The fixture's route for Atlantic Salmon Flies has no node: a path the channel doesn't have.
    assert.equal(texts[2], 'Atlantic Salmon Flies');
    assert.equal(texts[10], 'Barracuda Flies 25');
    // The counts come from the data, never a field.
    const changed = structuredClone(countsFixture);
    changed.data.site.group1_pill1.node.products.collectionInfo.totalItems = 1612;
    assert.equal(pillTexts(await renderWidget('shop-by-fish', changed))[0], 'Trout Flies 1612');
});

test('channel 1\'s copy carries its own paths and names in the same fields (ticket 53)', async () => {
    const html = await render({ group1_url: '/flies/realistic-trout-flies/', group1_pill1_url: '/steelhead-rainbow-trout/', all_url: '/flies/' });
    const hrefs = findTags(html, 'a').map(tag => tag.attrs.href);
    assert.ok(hrefs.includes('/flies/realistic-trout-flies/'));
    assert.ok(hrefs.includes('/steelhead-rainbow-trout/'));
    assert.ok(hrefs.includes('/flies/'));
});

test('the text is escaped, never raw HTML from a field', async () => {
    const html = await render({ group1_name: 'Trout <script>alert(1)</script>', group2_pill1_name: '<b>Bass</b>' });
    assert.equal(findTags(html, 'script').length + findTags(html, 'b').length, 0);
    assert.ok(html.includes('Trout &lt;script&gt;'));
});

test('no field types a price or a count, and no text field holds a number (HOME-4)', () => {
    const settings = schema.flatMap(tab => tab.sections.flatMap(section => section.settings));
    for (const setting of settings.filter(({ id }) => typeof channelFile.configuration[id] === 'string')) {
        const value = channelFile.configuration[setting.id];
        assert.doesNotMatch(value, /\$\s?\d/, `${setting.id}: no price`);
        if (/_(name|label|cta)$|^heading$/.test(setting.id)) assert.doesNotMatch(value, /\d/, `${setting.id}: no number in "${value}"`);
    }
});

test('the template and its partial use no inline styles: the theme\'s ReelFlies layer styles them (decision 6)', () => {
    for (const file of [path.join(DIR, 'template.html'), path.join(WIDGETS_DIR, '_shared', 'species-group.html')]) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /style=|<style/, file);
    }
});
