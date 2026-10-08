// ReelFlies modules that start on every page (build pipeline, section 6.1). global.js calls
// reelfliesGlobal(this.context) once, after the stock globals have started, so a module here can
// take over from the stock code it replaces.
//
// How a ticket adds its module: replace its own slot line below with one entry, a function of the
// page context. Keep main.js small (scripts/check-bundle.mjs): a module that isn't needed on every
// page load, or sits behind a switch, imports its own chunk from the entry, for example
//
//     context => context.rfRegionPrompt && import(/* webpackChunkName: "rf-region-prompt" */ './region')
//         .then(module => module.default(context)),
//
// - Change only your own slot line; the blank lines keep parallel tickets' edits apart.
// - One module failing, or its chunk failing to load, is reported in the console; the others
//   still start.
// - Before them, ticket 25's reduced-motion setting for jQuery's animations (reduced-motion.js).

import $ from 'jquery';
import followReducedMotion from './reduced-motion';

export const GLOBAL_MODULES = [
    // 27 header: Escape and "Shop flies" (header.js), and the rise ring behind rf_rise (rise.js)
    () => import(/* webpackChunkName: "rf-header" */ './header').then(module => module.default()),
    context => context.rfRise && import(/* webpackChunkName: "rf-rise" */ './rise').then(module => module.default(context)),

    // 28 grouped menu and phone drawer: the rows' and the rail's panes (menu.js), only where the grouped menu renders
    () => document.querySelector('[data-rf-menu]') && import(/* webpackChunkName: "rf-menu" */ './menu').then(module => module.default()),

    // 30 quick search: the dropdown under each ReelFlies search form, and the phone header's search toggle
    context => import(/* webpackChunkName: "rf-quick-search" */ './quick-search').then(module => module.default(context)),

    // 52 outside-Canada prompt
];

function reportError(error) {
    // eslint-disable-next-line no-console
    console.error('ReelFlies global module failed', error);
}

export default function reelfliesGlobal(context, modules = GLOBAL_MODULES, onError = reportError) {
    try {
        followReducedMotion(window, $);
    } catch (error) {
        onError(error);
    }
    modules.forEach(start => {
        try {
            const started = start(context);
            if (started && typeof started.catch === 'function') started.catch(onError);
        } catch (error) {
            onError(error);
        }
    });
}
