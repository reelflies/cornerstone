// Tests scripts/release-themes.mjs (W0-3) with a stand-in for stencil-cli's theme API client: no
// test reaches the store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { listStorefrontChannels, readMyThemes, themeDeleter } from './release-themes.mjs';

const API = { accessToken: 'faketoken0123456789abcdef', apiHost: 'https://api.bigcommerce.com', storeHash: 'abc123' };
const THEMES = [{ uuid: 'aaaa', name: 'ReelFlies' }, { uuid: 'bbbb', name: 'Hero-2024-2.9.5-US' }];

// The client's GET functions, recording each call; `deleteThemeById` and `activateThemeByVariationId`
// fail the test if they are called while reading.
function client({ sites = [{ channel_id: 1 }, { channel_id: 1855224 }, { channel_id: 1895766 }], active = {}, failChannel = null } = {}) {
    const calls = [];
    return {
        calls,
        getThemes: async api => {
            calls.push(['getThemes', api.storeHash]);
            return THEMES;
        },
        getStoreChannels: async api => {
            calls.push(['getStoreChannels', api.storeHash]);
            return sites;
        },
        getChannelActiveTheme: async ({ channelId, accessToken }) => {
            calls.push(['getChannelActiveTheme', channelId]);
            assert.equal(accessToken, API.accessToken);
            if (channelId === failChannel) throw new Error(`Could not fetch active theme details for channel ${channelId}: Request failed with status code 404`);
            return { active_theme_uuid: active[channelId] ?? 'bbbb' };
        },
        deleteThemeById: async ({ themeId }) => {
            calls.push(['deleteThemeById', themeId]);
        },
        activateThemeByVariationId: () => assert.fail('never activates'),
        postTheme: () => assert.fail('never uploads'),
    };
}

test('W0-3: reading My Themes is GETs only: the themes, every storefront channel and every site\'s, and each one\'s active theme', async () => {
    const stub = client({ sites: [{ channel_id: 1895766 }, { channel_id: 2000001 }], active: { 1895766: 'aaaa' } });
    const result = await readMyThemes({
        client: stub, api: API, knownChannels: [1, 1855224, 1895766], listChannels: async () => [1, 1895766, 2000002],
    });
    assert.deepEqual(result, {
        themes: THEMES,
        channels: [1, 1855224, 1895766, 2000001, 2000002],
        activeByChannel: {
            1: 'bbbb', 1855224: 'bbbb', 1895766: 'aaaa', 2000001: 'bbbb', 2000002: 'bbbb',
        },
    });
    assert.deepEqual(stub.calls.map(([name]) => name).filter((name, index, all) => all.indexOf(name) === index), ['getThemes', 'getStoreChannels', 'getChannelActiveTheme']);
});

// GET /v3/channels?type:in=storefront, in pages, as the API pages them.
function channelPages(pages) {
    const sent = [];
    const request = async (url, init) => {
        sent.push([url, init.method, init.headers['X-Auth-Token']]);
        const page = Number(new URL(url).searchParams.get('page'));
        const data = pages[page - 1].map(id => ({ id, type: 'storefront' }));
        return { ok: true, json: async () => ({ data, meta: { pagination: { current_page: page, total_pages: pages.length } } }) };
    };
    return { sent, request };
}

test('W0-3: every storefront channel is listed, with or without a site, on every page, with GETs only', async () => {
    const { sent, request } = channelPages([[1, 1855224], [1895766]]);
    assert.deepEqual(await listStorefrontChannels({ api: API, request }), [1, 1855224, 1895766]);
    assert.deepEqual(sent, [
        ['https://api.bigcommerce.com/stores/abc123/v3/channels?type:in=storefront&limit=250&page=1', 'GET', API.accessToken],
        ['https://api.bigcommerce.com/stores/abc123/v3/channels?type:in=storefront&limit=250&page=2', 'GET', API.accessToken],
    ]);
});

test('W0-3: a channel list the store refuses stops the read, naming the status and never the token', async () => {
    const request = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
    await assert.rejects(listStorefrontChannels({ api: API, request }), error => {
        assert.match(error.message, /GET \/v3\/channels\?type:in=storefront answered 403 Forbidden/);
        assert.ok(!error.message.includes(API.accessToken));
        return true;
    });
    const stub = client();
    const refused = async () => { throw new Error('GET /v3/channels?type:in=storefront answered 403 Forbidden'); };
    await assert.rejects(readMyThemes({
        client: stub, api: API, knownChannels: [1], listChannels: refused,
    }), /403/);
    assert.ok(!stub.calls.some(([name]) => name === 'getChannelActiveTheme'), 'no channel is read once the list fails');
});

test('W0-3: a channel whose active theme can\'t be read stops the read, so the prune never guesses a theme is unused', async () => {
    const listChannels = async () => [];
    await assert.rejects(readMyThemes({
        client: client({ failChannel: 1855224 }), api: API, knownChannels: [1], listChannels,
    }), /channel 1855224/);
    const blank = client();
    blank.getChannelActiveTheme = async () => ({});
    await assert.rejects(readMyThemes({
        client: blank, api: API, knownChannels: [], listChannels,
    }), /no active theme uuid for channel 1/);
    const noSites = client();
    noSites.getStoreChannels = async () => { throw new Error('Could not fetch a list of the store channels: Request failed with status code 403'); };
    await assert.rejects(readMyThemes({
        client: noSites, api: API, knownChannels: [1], listChannels,
    }), /list of the store channels/);
});

test('W0-3: the deleter deletes one theme by its uuid, and nothing else', async () => {
    const stub = client();
    await themeDeleter({ client: stub, api: API })('aaaa');
    assert.deepEqual(stub.calls, [['deleteThemeById', 'aaaa']]);
    assert.throws(() => themeDeleter({ client: stub, api: API })(''), /a theme uuid/);
});
