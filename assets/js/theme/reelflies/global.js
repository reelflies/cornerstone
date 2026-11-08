// ReelFlies modules that start on every page. global.js calls reelfliesGlobal(this.context)
// once, after the stock globals, so a module here can take over from the stock code it replaces.
// Each module is its own chunk (scripts/check-bundle.mjs keeps main.js small); one failing, or its
// chunk failing to load, is reported in the console and the others still start.
//
// - menu: the header's mega menus and the phone drawer (menu.js).
// - box: the header's Box count, the order line and its sheet (order-line.js), over the Cart API.
// - search: the suggestions under the header's search field (quick-search.js).
// The words the scripts write (words.js) are set first, from context.rfWords.

import { setWords } from './words';
import { setToken } from './storefront';

export const GLOBAL_MODULES = [
    () => document.querySelector('[data-rf-head]') && import(/* webpackChunkName: "rf-menu" */ './menu').then(module => module.default()),
    context => import(/* webpackChunkName: "rf-order-line" */ './order-line').then(module => module.start(context)),
    context => document.querySelector('[data-rf-search]') && import(/* webpackChunkName: "rf-quick-search" */ './quick-search').then(module => module.start(context)),
];

function reportError(error) {
    // eslint-disable-next-line no-console
    console.error('ReelFlies global module failed', error);
}

export default function reelfliesGlobal(context = {}, modules = GLOBAL_MODULES, onError = reportError) {
    setWords(context.rfWords);
    setToken(context.rfStorefrontToken);
    modules.forEach(start => {
        try {
            const started = start(context);
            if (started && typeof started.catch === 'function') started.catch(onError);
        } catch (error) {
            onError(error);
        }
    });
}
