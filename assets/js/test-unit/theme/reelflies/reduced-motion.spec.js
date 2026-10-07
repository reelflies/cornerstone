import $ from 'jquery';
import followReducedMotion, { REDUCED_MOTION_QUERY } from '../../../theme/reelflies/reduced-motion';

// A stand-in for window.matchMedia: one query list whose `matches` the test flips.
function mediaStub(matches) {
    const listeners = [];
    const list = {
        matches,
        media: REDUCED_MOTION_QUERY,
        addEventListener: (type, listener) => type === 'change' && listeners.push(listener),
        set(next) {
            list.matches = next;
            listeners.forEach(listener => listener({ matches: next, media: REDUCED_MOTION_QUERY }));
        },
    };
    return { list, matchMedia: query => (query === REDUCED_MOTION_QUERY ? list : { matches: false, addEventListener() {} }) };
}

describe('reduced motion for jQuery animations', () => {
    afterEach(() => {
        $.fx.off = false;
    });

    it('asks for prefers-reduced-motion: reduce', () => {
        expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    });

    it('makes jQuery animations jump to their end when the visitor prefers reduced motion', () => {
        const { matchMedia } = mediaStub(true);
        followReducedMotion({ matchMedia }, $);
        expect($.fx.off).toBe(true);

        const box = $('<div style="height: 10px"></div>').appendTo(document.body);
        box.animate({ height: 100 }, 400);
        expect(box[0].style.height).toBe('100px');
        box.remove();
    });

    it('leaves them running otherwise', () => {
        const { matchMedia } = mediaStub(false);
        followReducedMotion({ matchMedia }, $);
        expect($.fx.off).toBe(false);
    });

    it('follows the setting when it changes while the page is open', () => {
        const { list, matchMedia } = mediaStub(false);
        followReducedMotion({ matchMedia }, $);
        list.set(true);
        expect($.fx.off).toBe(true);
        list.set(false);
        expect($.fx.off).toBe(false);
    });

    it('does nothing in a browser without matchMedia', () => {
        expect(() => followReducedMotion({}, $)).not.toThrow();
        expect($.fx.off).toBe(false);
    });
});
