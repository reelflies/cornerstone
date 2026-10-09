// ReelFlies' social set (ticket 40, with ticket 50's footer): the footer's social row and the
// home page's sameAs list the same links, the store's social links that rf_store_same_as keeps
// (components/reelflies/social-keep.html, the one rule both read). Empty, it keeps every link the
// store sets, and the row is exactly stock components/common/social-links.html's markup.
//
//   node --test scripts/qa/render/partials/social-set.test.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, outerHtml } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { readFixture, renderPartial } from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The store's five links on 1895766, as ticket 50's prelaunch fixture holds them.
const PRELAUNCH = readFixture(path.join(HERE, 'footer', 'prelaunch.json'));
const LINKS = PRELAUNCH.social_media;

const row = (filter, socialMedia = LINKS) => renderPartial('components/reelflies/social-links', {
    social_media: socialMedia,
    rf_filter: filter,
});
const stockRow = (socialMedia = LINKS) => renderPartial('components/common/social-links', { social_media: socialMedia });
const hrefs = html => findTags(html, 'a').map(tag => tag.attrs.href);
// The markup with the white space between tags gone and runs of white space as one space: the
// two partials indent differently, and the row's items are flex items, so that never shows.
const squeeze = html => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

describe('the footer\'s social row', () => {
    it('with rf_store_same_as empty, renders exactly stock social-links.html: every link the store sets, in its order', async () => {
        const html = await row('');
        assert.equal(squeeze(html), squeeze(await stockRow()));
        assert.deepEqual(hrefs(html), LINKS.map(link => link.url));
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('keeps only the networks rf_store_same_as names, in the store\'s order, in any case and with spaces', async () => {
        const html = await row(' YouTube, facebook ,Instagram ');
        assert.deepEqual(hrefs(html), [
            'https://www.facebook.com/reelflies.ca/',
            'https://www.instagram.com/reelflies/',
            'https://www.youtube.com/user/reelflies01',
        ]);
        const kept = LINKS.filter(link => ['facebook', 'instagram', 'youtube'].includes(link.display_name));
        assert.equal(squeeze(html), squeeze(await stockRow(kept)), 'each kept link as stock renders it');
    });

    it('names X as "x" or as the store\'s "twitter", and renders it as stock does, as X', async () => {
        const filters = ['x', 'Twitter'];
        const rows = await Promise.all(filters.map(filter => row(filter)));
        rows.forEach((html, index) => {
            assert.deepEqual(hrefs(html), ['https://twitter.com/reelfliescanada'], filters[index]);
            assert.equal(findTags(html, 'a')[0].attrs.title, 'X', filters[index]);
        });
    });

    it('keeps every link when rf_store_same_as names nothing (only commas or spaces)', async () => {
        assert.deepEqual(hrefs(await row(' , ,')), LINKS.map(link => link.url));
    });

    it('renders no list at all when the set keeps no link, or the store has none, as stock does with none', async () => {
        assert.equal(outerHtml(await row('flickr'), 'ul', () => true), null);
        assert.equal((await row('', [])).trim(), '');
        assert.equal((await stockRow([])).trim(), '');
    });
});

describe('the ReelFlies footer', () => {
    it('renders its social row through the social set, so rf_store_same_as narrows it', async () => {
        const footer = settings => renderPartial('components/reelflies/footer', {
            ...PRELAUNCH,
            theme_settings: { ...PRELAUNCH.theme_settings, ...settings },
        });
        const social = html => hrefs(outerHtml(html, 'div', attrs => (attrs.class || '').split(/\s+/).includes('rf-footer__social')) || '');
        assert.deepEqual(social(await footer({ rf_store_same_as: '' })), LINKS.map(link => link.url));
        assert.deepEqual(social(await footer({ rf_store_same_as: 'facebook,instagram,youtube' })), [
            'https://www.facebook.com/reelflies.ca/',
            'https://www.instagram.com/reelflies/',
            'https://www.youtube.com/user/reelflies01',
        ]);
    });
});
