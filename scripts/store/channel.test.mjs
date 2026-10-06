// Tests scripts/store/channel.mjs (W0-11): every write names channel 1895766, and a response that
// names another channel stops the run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './allowlist.mjs';
import {
    CHANNEL, channelsNamed, requestChannelProblems, responseChannelProblems,
} from './channel.mjs';

const UUID = '2dfeb50e-5f8c-4df2-8525-a338091eed32';
const problems = request => requestChannelProblems(request, classify(request, { mode: 'lifted' }));

test('the one channel is ReelFlies_CA, 1895766', () => {
    assert.equal(CHANNEL, 1895766);
});

test('every create and update body carries channel_id 1895766, as a number', () => {
    const bodies = [
        ['POST', '/v3/content/widget-templates'],
        ['PUT', `/v3/content/widget-templates/${UUID}`],
        ['POST', '/v3/content/widgets'],
        ['PUT', `/v3/content/widgets/${UUID}`],
        ['POST', '/v3/content/placements'],
        ['PUT', `/v3/content/placements/${UUID}`],
        ['PUT', '/v3/content/pages/42'],
        ['POST', '/v3/content/scripts'],
        ['PUT', `/v3/content/scripts/${UUID}`],
    ];
    for (const [method, path] of bodies) {
        const extra = path.includes('scripts') && method === 'POST' ? { enabled: false } : {};
        assert.deepEqual(problems({ method, path, body: { channel_id: 1895766, ...extra } }), [], `${method} ${path}`);
        assert.match(problems({ method, path, body: { name: 'x', ...extra } })[0], /has no channel_id: every write names 1895766/, `${method} ${path}`);
        assert.match(problems({ method, path, body: { channel_id: 1, ...extra } })[0], /channel_id 1 isn't 1895766/);
        assert.match(problems({ method, path, body: { channel_id: 1855224, ...extra } })[0], /channel_id 1855224 isn't 1895766/);
        assert.match(problems({ method, path, body: { channel_id: '1895766', ...extra } })[0], /channel_id "1895766" isn't 1895766/);
    }
});

test('each item of an array body carries it: Web Pages and template associations', () => {
    const page = name => ({ channel_id: 1895766, name, type: 'page' });
    assert.deepEqual(problems({ method: 'POST', path: '/v3/content/pages', body: [page('a'), page('b')] }), []);
    const [only] = problems({ method: 'POST', path: '/v3/content/pages', body: [page('a'), { name: 'b', type: 'page' }] });
    assert.match(only, /item 2 has no channel_id/);
    const association = channel => ({
        channel_id: channel, entity_type: 'page', entity_id: 4, file_name: 'hook-size-chart.html',
    });
    assert.deepEqual(problems({ method: 'PUT', path: '/v3/storefront/custom-template-associations', body: [association(1895766)] }), []);
    assert.match(problems({ method: 'PUT', path: '/v3/storefront/custom-template-associations', body: [association(1895766), association(1)] })[0], /item 2's channel_id 1 isn't 1895766/);
});

test('a channel named anywhere else in a body must be 1895766 too', () => {
    const result = problems({ method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766, widget_configuration: { channels: [1] } } });
    assert.match(result[0], /names channel 1 inside the body/);
});

test('a settings write names the channel in its query, and only there', () => {
    const settings = query => ({
        method: 'PUT', path: '/v3/settings/storefront/category', query, body: { listing_mode: 'child_categories' },
    });
    assert.deepEqual(problems(settings({ channel_id: 1895766 })), []);
    assert.deepEqual(problems(settings({ channel_id: '1895766' })), []);
    assert.match(problems(settings({}))[0], /no channel_id in the query: a settings write without one changes the global value/);
    assert.match(problems(settings({ channel_id: 1 }))[0], /channel_id 1 isn't 1895766/);
    assert.match(problems(settings({ channel_id: '1895766,1' }))[0], /isn't 1895766/);
    assert.match(problems(settings({ channel_id: 1895766, 'channel_id:in': '1' }))[0], /only channel_id in the query/);
});

test('a settings body that names another channel anywhere is refused, even with the right query', () => {
    const settings = body => ({
        method: 'PUT', path: '/v3/settings/storefront/seo', query: { channel_id: 1895766 }, body,
    });
    assert.match(problems(settings({ meta_keywords: 'flies', extra: { channel_id: 1 } }))[0], /PUT \/v3\/settings\/storefront\/seo names channel 1 inside the body: only 1895766 may be named/);
    assert.match(problems(settings({ page_title: 'x', channels: [{ id: 1855224 }] }))[0], /names channel 1855224 inside the body/);
    assert.deepEqual(problems(settings({ page_title: 'x', extra: { channel_ids: [1895766] } })), []);
});

test('channelsNamed finds channel_id, channel_ids and channels at any depth, and ignores text', () => {
    assert.deepEqual(channelsNamed({
        data: [
            { channel_id: 1895766, template: 'channel_id: 1' },
            { nested: { channel_ids: [1, 1855224] } },
            { channels: [{ id: 7 }, { channel_id: 8 }, 9] },
        ],
    }).sort((a, b) => a - b), [1, 7, 8, 9, 1855224, 1895766]);
});

test('a response naming another channel is a problem, and an entity response must name 1895766', () => {
    assert.deepEqual(responseChannelProblems({ data: { uuid: UUID, channel_id: 1895766 } }, { requireOnData: true }), []);
    assert.match(responseChannelProblems({ data: { uuid: UUID, channel_id: 1 } })[0], /the response names channel 1, not 1895766/);
    assert.match(responseChannelProblems({ data: [{ channel_id: 1895766 }, { channel_id: 1855224 }] })[0], /names channel 1855224/);
    assert.match(responseChannelProblems({ data: { uuid: UUID } }, { requireOnData: true })[0], /doesn't name channel 1895766/);
    assert.match(responseChannelProblems({ data: [] }, { requireOnData: true })[0], /no data to check/);
    assert.match(responseChannelProblems({ data: { channel_id: null } })[0], /names channel null/);
    // Settings responses carry no channel at all, and that's fine when nothing requires one.
    assert.deepEqual(responseChannelProblems({ data: { listing_mode: 'child_categories' }, meta: {} }), []);
});
