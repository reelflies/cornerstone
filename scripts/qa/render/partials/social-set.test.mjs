// ReelFlies' social set (ticket 40, with ticket 50's footer): the footer's social row and the
// home page's sameAs list the same links, the store's social links that rf_store_same_as keeps
// (components/reelflies/social-keep.html, the one rule both read). Empty, it keeps every link the
// store sets. The Streamside Stone redesign draws the row as a line of text links
// (components/reelflies/social-links.html, ul.rf-foot__social), not stock's icon row, so master's
// "renders exactly what stock renders" parity check is gone; the set rule stands.
//
//   node --test scripts/qa/render/partials/social-set.test.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, scriptsOfType, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { readFixture, renderPartial } from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The store's five links on 1895766, as ticket 50's prelaunch fixture holds them.
const PRELAUNCH = readFixture(path.join(HERE, 'footer', 'prelaunch.json'));
const LINKS = PRELAUNCH.social_media;
const HOME = readFixture(path.join(HERE, 'store-schema', 'home.json'));

const row = (filter, socialMedia = LINKS) => renderPartial('components/reelflies/social-links', {
    social_media: socialMedia,
    rf_filter: filter,
});
const hrefs = html => findTags(html, 'a').map(tag => tag.attrs.href);
const names = html => elementsHtml(html, 'a').map(textOf);
const list = html => outerHtml(html, 'ul', attrs => (attrs.class || '').split(/\s+/).includes('rf-foot__social'));

describe('the footer\'s social row', () => {
    it('with rf_store_same_as empty, lists every link the store sets, in its order, as text links in one labelled list', async () => {
        const html = await row('');
        assert.deepEqual(hrefs(html), LINKS.map(link => link.url));
        assert.deepEqual(names(html), ['Facebook', 'Instagram', 'Pinterest', 'X', 'YouTube']);
        const [ul] = findTags(html, 'ul');
        assert.equal(ul.attrs['aria-label'], 'ReelFlies on social media');
        assert.equal(findTags(html, 'li').length, 5);
        assert.ok(findTags(html, 'a').every(tag => tag.attrs.rel === 'noopener'));
        assert.equal(findTags(html, 'svg').length, 0, 'words, not icons: the names need no icon sheet');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('keeps only the networks rf_store_same_as names, in the store\'s order, in any case and with spaces', async () => {
        const html = await row(' YouTube, facebook ,Instagram ');
        assert.deepEqual(hrefs(html), [
            'https://www.facebook.com/reelflies.ca/',
            'https://www.instagram.com/reelflies/',
            'https://www.youtube.com/user/reelflies01',
        ]);
        assert.deepEqual(names(html), ['Facebook', 'Instagram', 'YouTube']);
    });

    it('names X as "x" or as the store\'s "twitter", and shows it as X', async () => {
        const filters = ['x', 'Twitter'];
        const rows = await Promise.all(filters.map(filter => row(filter)));
        rows.forEach((html, index) => {
            assert.deepEqual(hrefs(html), ['https://twitter.com/reelfliescanada'], filters[index]);
            assert.deepEqual(names(html), ['X'], filters[index]);
        });
    });

    it('keeps every link when rf_store_same_as names nothing (only commas or spaces)', async () => {
        assert.deepEqual(hrefs(await row(' , ,')), LINKS.map(link => link.url));
    });

    it('renders no list at all when the set keeps no link, or the store has none, and skips a link with no URL', async () => {
        assert.equal(list(await row('flickr')), null);
        assert.equal((await row('', [])).trim(), '');
        assert.equal((await renderPartial('components/reelflies/social-links', { rf_filter: '' })).trim(), '', 'no social_media at all');
        const blank = [{ url: '  ', display_name: 'pinterest' }, ...LINKS.slice(0, 1)];
        assert.deepEqual(hrefs(await row('', blank)), [LINKS[0].url]);
        assert.equal((await row('pinterest', blank)).trim(), '', 'a kept link with no URL is no row');
    });
});

describe('the ReelFlies footer and the store schema', () => {
    const footer = settings => renderPartial('components/reelflies/footer', {
        ...PRELAUNCH,
        theme_settings: { ...PRELAUNCH.theme_settings, ...settings },
    });
    const sameAs = async settings => {
        const html = await renderPartial('components/reelflies/store-schema', { ...HOME, theme_settings: settings });
        return scriptsOfType(html, 'application/ld+json').map(block => JSON.parse(block)).find(block => block['@type'] === 'OnlineStore').sameAs;
    };

    it('renders the footer\'s row through the social set, in the brand column, so rf_store_same_as narrows it', async () => {
        const social = html => hrefs(list(outerHtml(html, 'div', attrs => (attrs.class || '').split(/\s+/).includes('rf-foot__brand'))) || '');
        assert.deepEqual(social(await footer({ rf_store_same_as: '' })), LINKS.map(link => link.url));
        assert.deepEqual(social(await footer({ rf_store_same_as: 'facebook,instagram,youtube' })), [
            'https://www.facebook.com/reelflies.ca/',
            'https://www.instagram.com/reelflies/',
            'https://www.youtube.com/user/reelflies01',
        ]);
    });

    it('lists the same links in the footer\'s row and in the home page\'s sameAs, for each rf_store_same_as', async () => {
        const filters = ['', 'facebook,instagram,youtube', 'x, YouTube', ' , '];
        const pairs = await Promise.all(filters.map(async filter => [await sameAs({ rf_store_same_as: filter }), hrefs(await row(filter, HOME.social_media))]));
        pairs.forEach(([schema, footerRow], index) => assert.deepEqual(schema, footerRow, `rf_store_same_as "${filters[index]}"`));
        assert.equal(await sameAs({ rf_store_same_as: 'flickr' }), undefined);
        assert.equal(list(await row('flickr', HOME.social_media)), null);
    });
});
