// Tests scripts/release-themes.mjs (W0-3) with a stand-in for stencil-cli's theme API client: no
// test reaches the store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import {
    listStorefrontChannels, readMyThemes, themeDeleter, themeReader,
} from './release-themes.mjs';

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
        sent.push([url, init.method, init.headers['X-Auth-Token'], init.redirect]);
        const page = Number(new URL(url).searchParams.get('page'));
        const data = pages[page - 1].map(id => ({ id, type: 'storefront' }));
        return { ok: true, json: async () => ({ data, meta: { pagination: { current_page: page, total_pages: pages.length } } }) };
    };
    return { sent, request };
}

test('W0-3: every storefront channel is listed, with or without a site, on every page, with GETs only', async () => {
    const { sent, request } = channelPages([[1, 1855224], [1895766]]);
    assert.deepEqual(await listStorefrontChannels({ api: API, request }), [1, 1855224, 1895766]);
    // redirect: 'error', because fetch would follow a redirect off the API's origin with the
    // X-Auth-Token header still on (it drops only Authorization).
    assert.deepEqual(sent, [
        ['https://api.bigcommerce.com/stores/abc123/v3/channels?type:in=storefront&limit=250&page=1', 'GET', API.accessToken, 'error'],
        ['https://api.bigcommerce.com/stores/abc123/v3/channels?type:in=storefront&limit=250&page=2', 'GET', API.accessToken, 'error'],
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

// stencil-cli's client rejects with axios's error, whose config and request hold the Stencil-CLI
// token in a header. Node prints all of that for an error nobody catches.
function axiosError(message) {
    const config = { method: 'get', headers: { Accept: 'application/json', 'x-auth-token': API.accessToken } };
    return Object.assign(new Error(message), {
        name: 'AxiosError', code: 'ERR_BAD_RESPONSE', config, request: { _header: `x-auth-token: ${API.accessToken}\r\n` }, response: { status: 502, config },
    });
}

// Asserts the call rejects with a plain Error naming `what`, whose message, cause and everything
// Node would print hold no token.
async function rejectsWithoutToken(promise, what) {
    await assert.rejects(promise, error => {
        assert.match(error.message, what);
        assert.equal(error.cause, undefined);
        assert.ok(!inspect(error, { depth: 10, showHidden: true }).includes(API.accessToken), inspect(error));
        return true;
    });
}

test('W0-3: every store call\'s error comes back as a new Error naming the call, with only the message: never axios\'s error, which holds the token', async () => {
    const failing = name => {
        const stub = client();
        stub[name] = async () => { throw axiosError('Request failed with status code 502'); };
        return stub;
    };
    const listChannels = async () => [];
    await rejectsWithoutToken(readMyThemes({
        client: failing('getThemes'), api: API, knownChannels: [1], listChannels,
    }), /^GET \/v3\/themes failed: Request failed with status code 502$/);
    await rejectsWithoutToken(readMyThemes({
        client: failing('getStoreChannels'), api: API, knownChannels: [1], listChannels,
    }), /^the store's channels \(stencil-cli's getStoreChannels\) failed: Request failed with status code 502$/);
    await rejectsWithoutToken(readMyThemes({
        client: failing('getChannelActiveTheme'), api: API, knownChannels: [1], listChannels,
    }), /^GET \/v3\/channels\/1\/active-theme failed: Request failed with status code 502$/);
    // The re-read after a real prune's deletions, and the deletion itself.
    await rejectsWithoutToken(themeReader({ client: failing('getThemes'), api: API })(), /^GET \/v3\/themes failed: Request failed/);
    await rejectsWithoutToken(themeDeleter({ client: failing('deleteThemeById'), api: API })('aaaa'), /^DELETE \/v3\/themes\/aaaa failed: Request failed/);
    // A message that names the token itself loses it.
    const named = client();
    named.getThemes = async () => { throw axiosError(`refused x-auth-token ${API.accessToken}`); };
    await rejectsWithoutToken(themeReader({ client: named, api: API })(), /^GET \/v3\/themes failed: refused x-auth-token \[redacted\]$/);
    // fetch's own failure (a dropped connection, or a redirect it refused) is wrapped too.
    const dropped = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: new Error('redirect mode is set to error') }); };
    await rejectsWithoutToken(listStorefrontChannels({ api: API, request: dropped }), /^GET \/v3\/channels\?type:in=storefront failed: fetch failed$/);
});

test('W0-3: the re-read of My Themes is a GET of the themes and nothing else', async () => {
    const stub = client();
    assert.deepEqual(await themeReader({ client: stub, api: API })(), THEMES);
    assert.deepEqual(stub.calls, [['getThemes', 'abc123']]);
});
