// W0-3: My Themes through stencil-cli's theme API client, for the prune. scripts/release-prune.mjs
// decides what goes; this module reads the store and deletes, and scripts/release.mjs runs them.
//
//   import { readMyThemes, themeDeleter, themeReader } from './release-themes.mjs';
//   const { client, api } = await stencilApi();                       // release-capture.mjs
//   const { themes, channels, activeByChannel } = await readMyThemes({ client, api, knownChannels });
//   await themeDeleter({ client, api })(uuid);                        // a real prune only
//   const themes = await themeReader({ client, api })();              // My Themes again, after it
//
// Reading is GETs only: GET /v3/themes; every storefront channel, with or without a site (GET
// /v3/channels?type:in=storefront, every page); every site's channel (stencil-cli's
// getStoreChannels); and GET /v3/channels/<id>/active-theme for each of them and every channel the
// caller knows. Any read that fails stops the read, so the prune never guesses that a theme is
// unused. DELETE /v3/themes/<uuid> is the only write, through themeDeleter; nothing here activates
// or uploads a theme.
//
// Every store call's error comes back as a new Error naming the call, with only the original
// message, the token taken out of it (storeCall): stencil-cli's client rejects with axios's error,
// whose config and request hold the token in a header, and Node prints all of that for an error
// nobody catches. fetch never follows a redirect (redirect: 'error'), because it would send the
// X-Auth-Token header on to another origin.

import { redact } from './release-redact.mjs';

const PAGE_SIZE = 250;

async function storeCall(what, api, call) {
    try {
        return await call();
    } catch (error) {
        throw new Error(`${what} failed: ${redact(String((error && error.message) || error), [api.accessToken])}`);
    }
}

// Every storefront channel's id. `request` is fetch, or a stand-in in the tests.
export async function listStorefrontChannels({ api, request = fetch }) {
    const ids = [];
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
        const url = `${api.apiHost}/stores/${api.storeHash}/v3/channels?type:in=storefront&limit=${PAGE_SIZE}&page=${page}`;
        // Pages are read one after another, because each one says how many there are.
        // eslint-disable-next-line no-await-in-loop
        const response = await storeCall('GET /v3/channels?type:in=storefront', api, () => request(url, {
            method: 'GET', headers: { 'X-Auth-Token': api.accessToken, Accept: 'application/json' }, redirect: 'error',
        }));
        if (!response.ok) throw new Error(`GET /v3/channels?type:in=storefront answered ${response.status} ${response.statusText}`);
        // eslint-disable-next-line no-await-in-loop
        const body = await response.json();
        ids.push(...(body.data || []).map(channel => Number(channel.id)));
        pages = (body.meta && body.meta.pagination && body.meta.pagination.total_pages) || 1;
    }
    return ids;
}

// My Themes (GET /v3/themes): the first read, and the one after a real prune's deletions.
export function themeReader({ client, api }) {
    return () => storeCall('GET /v3/themes', api, () => client.getThemes(api));
}

export async function readMyThemes({
    client, api, knownChannels = [], listChannels = () => listStorefrontChannels({ api }),
}) {
    const themes = await themeReader({ client, api })();
    const storefronts = await listChannels();
    const sites = await storeCall('the store\'s channels (stencil-cli\'s getStoreChannels)', api, () => client.getStoreChannels(api));
    const channels = [...new Set([...storefronts, ...sites.map(site => Number(site.channel_id)), ...knownChannels.map(Number)])]
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
    const activeByChannel = {};
    for (const channelId of channels) {
        // One channel at a time keeps the store's rate limit out of it; there are three or four.
        // eslint-disable-next-line no-await-in-loop
        const active = await storeCall(`GET /v3/channels/${channelId}/active-theme`, api, () => client.getChannelActiveTheme({ ...api, channelId }));
        if (!active || !active.active_theme_uuid) throw new Error(`no active theme uuid for channel ${channelId}, so the prune can't tell what is unused`);
        activeByChannel[channelId] = active.active_theme_uuid;
    }
    return { themes, channels, activeByChannel };
}

// Deletes one theme by its uuid (DELETE /v3/themes/<uuid>). The store refuses a theme that is
// active on a channel, and the prune never asks for one.
export function themeDeleter({ client, api }) {
    return themeId => {
        if (!themeId) throw new Error('the deleter needs a theme uuid');
        return storeCall(`DELETE /v3/themes/${themeId}`, api, () => client.deleteThemeById({ ...api, themeId }));
    };
}
