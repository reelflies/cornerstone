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

export const GLOBAL_MODULES = [
    // 27 header: rise ring

    // 28 grouped menu and phone drawer

    // 30 quick search

    // 52 outside-Canada prompt
];

function reportError(error) {
    // eslint-disable-next-line no-console
    console.error('ReelFlies global module failed', error);
}

export default function reelfliesGlobal(context, modules = GLOBAL_MODULES, onError = reportError) {
    modules.forEach(start => {
        try {
            const started = start(context);
            if (started && typeof started.catch === 'function') started.catch(onError);
        } catch (error) {
            onError(error);
        }
    });
}
