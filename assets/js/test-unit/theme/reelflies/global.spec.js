import $ from 'jquery';
import reelfliesGlobal, { GLOBAL_MODULES } from '../../../theme/reelflies/global';

const settle = () => new Promise(resolve => {
    setTimeout(resolve, 0);
});

describe('ReelFlies global modules', () => {
    const context = { themeSettings: {}, template: 'pages/home' };
    let started;
    let errors;
    const onError = error => errors.push(error.message);

    beforeEach(() => {
        started = [];
        errors = [];
    });

    it('registers modules as functions of the page context', () => {
        expect(Array.isArray(GLOBAL_MODULES)).toBe(true);
        GLOBAL_MODULES.forEach(start => expect(typeof start).toBe('function'));
    });

    it('starts every registered module with the page context, in order', () => {
        reelfliesGlobal(context, [
            ctx => started.push(['rise', ctx]),
            ctx => started.push(['menu', ctx]),
        ], onError);

        expect(started).toEqual([['rise', context], ['menu', context]]);
        expect(errors).toEqual([]);
    });

    it('starts the rest when one module throws, and reports it', () => {
        reelfliesGlobal(context, [
            () => { throw new Error('rise broke'); },
            ctx => started.push(['menu', ctx]),
        ], onError);

        expect(started).toEqual([['menu', context]]);
        expect(errors).toEqual(['rise broke']);
    });

    it('reports a module whose chunk fails to load', async () => {
        reelfliesGlobal(context, [
            () => Promise.reject(new Error('Loading chunk rf-region-prompt failed')),
            ctx => started.push(['menu', ctx]),
        ], onError);
        await settle();

        expect(started).toEqual([['menu', context]]);
        expect(errors).toEqual(['Loading chunk rf-region-prompt failed']);
    });

    it('runs the registered modules by default, without throwing', () => {
        expect(() => reelfliesGlobal(context)).not.toThrow();
    });

    it('makes jQuery animations follow prefers-reduced-motion before starting the modules (ticket 25)', () => {
        const { matchMedia } = window;
        window.matchMedia = query => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener() {} });
        try {
            reelfliesGlobal(context, [() => started.push($.fx.off)], onError);
            expect(started).toEqual([true]);
            expect(errors).toEqual([]);
        } finally {
            window.matchMedia = matchMedia;
            $.fx.off = false;
        }
    });
});
