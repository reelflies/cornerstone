// Tests the channel settings kept as changes files under content/settings/<channel>/ (ticket 46):
// each is a request the store-write helper (W0-11) accepts as a lifted write on ReelFlies_CA,
// and ReelFlies_CA's home title says what SEO-11 and O21 ask for. Copy Shaun hasn't approved
// waits in content/drafts/, which is never a changes file, so the routine can't publish it.
//
//   node --test scripts/content-settings.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseCalendar, phaseOn } from './lib/release-calendar.mjs';
import { checkRequests } from './store/plan.mjs';

const DIR = path.resolve('content/settings');
const DRAFTS = path.resolve('content/drafts');
const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');
const filesIn = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).flatMap(channel => fs.readdirSync(path.join(dir, channel)).map(file => path.join(dir, channel, file))) : []);
const files = filesIn(DIR);

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

test('ReelFlies_CA\'s home title is SEO-11\'s, and goes out on its own', () => {
    const { requests } = JSON.parse(fs.readFileSync(path.join(DIR, '1895766', 'storefront-seo.json'), 'utf8'));
    assert.equal(requests.length, 1);
    const [seo] = requests;
    assert.equal(seo.path, '/v3/settings/storefront/seo');
    assert.deepEqual(seo.body, { page_title: 'ReelFlies.ca | Hand-Tied Fly Fishing Flies, Canada\'s Online Fly Shop' });
});

test('no changes file carries the meta description until Shaun approves it', () => {
    for (const file of files) {
        const { requests } = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const request of requests) assert.ok(!('meta_description' in (request.body || {})), `${file} would publish the DRAFT meta description`);
    }
});

test('the DRAFT meta description waits in content/drafts/, which the store-write helper refuses as a changes file', () => {
    const file = path.join(DRAFTS, '1895766', 'storefront-seo-meta.json');
    const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.requests, undefined, 'a draft is never a changes file');
    assert.throws(() => checkRequests(draft.requests, { mode: 'lifted', phase: unset }), /a plan needs 1 to/);
    assert.equal(draft.setting, '/v3/settings/storefront/seo?channel_id=1895766 meta_description');
    assert.ok(draft.value.length <= 160, `${draft.value.length} characters`);
    assert.match(draft.value, /nearly 2,000 patterns from \$0\.75 a fly/, 'the figures decision 14 set, rechecked at the T-14 content freeze');
    for (const other of filesIn(DRAFTS)) assert.equal(JSON.parse(fs.readFileSync(other, 'utf8')).requests, undefined, other);
});
