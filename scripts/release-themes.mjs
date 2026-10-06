// W0-3: My Themes through stencil-cli's theme API client, for the prune. scripts/release-prune.mjs
// decides what goes; this module reads the store and deletes, and scripts/release.mjs runs them.
//
//   import { readMyThemes, themeDeleter } from './release-themes.mjs';
//   const { client, api } = await stencilApi();                       // release-capture.mjs
//   const { themes, channels, activeByChannel } = await readMyThemes({ client, api, knownChannels });
//   await themeDeleter({ client, api })(uuid);                        // a real prune only
//
// Reading is GETs only: GET /v3/themes, the store's channels (stencil-cli's getStoreChannels: GET
// /v3/sites and /v3/channels) and GET /v3/channels/<id>/active-theme for every one of them and every
// channel the caller knows. A channel whose active theme can't be read stops the read, so the
// prune never guesses that a theme is unused. DELETE /v3/themes/<uuid> is the only write, through
// themeDeleter; nothing here activates or uploads a theme. Errors carry stencil-cli's message,
// never the request, which holds the token.

export async function readMyThemes({ client, api, knownChannels = [] }) {
    const themes = await client.getThemes(api);
    const sites = await client.getStoreChannels(api);
    const channels = [...new Set([...sites.map(site => Number(site.channel_id)), ...knownChannels.map(Number)])]
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
    const activeByChannel = {};
    for (const channelId of channels) {
        // One channel at a time keeps the store's rate limit out of it; there are three or four.
        // eslint-disable-next-line no-await-in-loop
        const active = await client.getChannelActiveTheme({ ...api, channelId });
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
        return client.deleteThemeById({ ...api, themeId });
    };
}
