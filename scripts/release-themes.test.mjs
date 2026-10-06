// Tests scripts/release-themes.mjs (W0-3) with a stand-in for stencil-cli's theme API client: no
// test reaches the store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readMyThemes, themeDeleter } from './release-themes.mjs';

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

test('W0-3: reading My Themes is GETs only: the themes, the store\'s channels, and the active theme of every channel', async () => {
    const stub = client({ sites: [{ channel_id: 1895766 }, { channel_id: 2000001 }], active: { 1895766: 'aaaa' } });
    const result = await readMyThemes({ client: stub, api: API, knownChannels: [1, 1855224, 1895766] });
    assert.deepEqual(result, {
        themes: THEMES,
        channels: [1, 1855224, 1895766, 2000001],
        activeByChannel: {
            1: 'bbbb', 1855224: 'bbbb', 1895766: 'aaaa', 2000001: 'bbbb',
        },
    });
    assert.deepEqual(stub.calls.map(([name]) => name).filter((name, index, all) => all.indexOf(name) === index), ['getThemes', 'getStoreChannels', 'getChannelActiveTheme']);
});

test('W0-3: a channel whose active theme can\'t be read stops the read, so the prune never guesses a theme is unused', async () => {
    await assert.rejects(readMyThemes({ client: client({ failChannel: 1855224 }), api: API, knownChannels: [1] }), /channel 1855224/);
    const blank = client();
    blank.getChannelActiveTheme = async () => ({});
    await assert.rejects(readMyThemes({ client: blank, api: API, knownChannels: [] }), /no active theme uuid for channel 1/);
    const noSites = client();
    noSites.getStoreChannels = async () => { throw new Error('Could not fetch a list of the store channels: Request failed with status code 403'); };
    await assert.rejects(readMyThemes({ client: noSites, api: API, knownChannels: [1] }), /list of the store channels/);
});

test('W0-3: the deleter deletes one theme by its uuid, and nothing else', async () => {
    const stub = client();
    await themeDeleter({ client: stub, api: API })('aaaa');
    assert.deepEqual(stub.calls, [['deleteThemeById', 'aaaa']]);
    assert.throws(() => themeDeleter({ client: stub, api: API })(''), /a theme uuid/);
});
