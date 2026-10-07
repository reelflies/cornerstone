// Tests the channel settings kept as changes files under content/settings/<channel>/ (ticket 46):
// each is a request the store-write helper (W0-11) accepts as a lifted write on ReelFlies_CA,
// and ReelFlies_CA's home title and meta description say what SEO-11 and O21 ask for.
//
//   node --test scripts/content-settings.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseCalendar, phaseOn } from './lib/release-calendar.mjs';
import { checkRequests } from './store/plan.mjs';

const DIR = path.resolve('content/settings');
const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).flatMap(channel => fs.readdirSync(path.join(DIR, channel)).map(file => path.join(DIR, channel, file))) : [];

test('every settings changes file is a lifted write on its own channel, which the store-write helper accepts', () => {
    assert.ok(files.length > 0);
    for (const file of files) {
        const { requests } = JSON.parse(fs.readFileSync(file, 'utf8'));
        const channel = Number(path.basename(path.dirname(file)));
        assert.equal(channel, 1895766, `${file}: only ReelFlies_CA's settings are lifted writes`);
        assert.ok(requests.every(request => request.query.channel_id === channel), file);
        assert.doesNotThrow(() => checkRequests(requests, { mode: 'lifted', phase: unset }), file);
    }
});

test('ReelFlies_CA\'s home title is SEO-11\'s, and its meta description fits a search result', () => {
    const { requests: [seo] } = JSON.parse(fs.readFileSync(path.join(DIR, '1895766', 'storefront-seo.json'), 'utf8'));
    assert.equal(seo.path, '/v3/settings/storefront/seo');
    assert.equal(seo.body.page_title, 'ReelFlies.ca | Hand-Tied Fly Fishing Flies, Canada\'s Online Fly Shop');
    assert.ok(seo.body.meta_description.length <= 160, `${seo.body.meta_description.length} characters`);
    assert.match(seo.body.meta_description, /nearly 2,000 patterns from \$0\.75 a fly/, 'the figures decision 14 set, rechecked at the T-14 content freeze');
    assert.deepEqual(Object.keys(seo.body).sort(), ['meta_description', 'page_title']);
});
