import {
    ATTRIBUTE, isOpen, markClosed, markOpen, openOverlays,
} from '../../../theme/reelflies/open-state';

describe('open state', () => {
    const html = document.documentElement;

    afterEach(() => {
        html.removeAttribute(ATTRIBUTE);
    });

    it('writes each open overlay as a token in data-rf-open on <html>', () => {
        markOpen('drawer');
        markOpen('quick-add');

        expect(ATTRIBUTE).toBe('data-rf-open');
        expect(html.getAttribute('data-rf-open')).toBe('drawer quick-add');
        expect(openOverlays()).toEqual(['drawer', 'quick-add']);
    });

    it('removes only the closing module\'s own token', () => {
        markOpen('drawer');
        markOpen('search');
        markClosed('drawer');

        expect(html.getAttribute('data-rf-open')).toBe('search');
        expect(isOpen('search')).toBe(true);
        expect(isOpen('drawer')).toBe(false);
    });

    it('removes the attribute once nothing is open, so [data-rf-open] means "something is open"', () => {
        markOpen('search');
        markClosed('search');

        expect(html.hasAttribute('data-rf-open')).toBe(false);
        expect(isOpen()).toBe(false);
    });

    it('keeps one token when a module opens twice, and ignores closing what isn\'t open', () => {
        markOpen('drawer');
        markOpen('drawer');
        markClosed('quick-add');

        expect(html.getAttribute('data-rf-open')).toBe('drawer');
        expect(isOpen()).toBe(true);
    });

    it('keeps tokens another script wrote, and tidies stray spaces', () => {
        html.setAttribute('data-rf-open', '  region  drawer ');
        markOpen('search');

        expect(openOverlays()).toEqual(['region', 'drawer', 'search']);
        expect(html.getAttribute('data-rf-open')).toBe('region drawer search');
    });

    it('refuses a token that isn\'t one lower-case word', () => {
        expect(() => markOpen('quick add')).toThrow(TypeError);
        expect(() => markOpen('')).toThrow(TypeError);
        expect(() => markClosed('Drawer')).toThrow(TypeError);
        expect(html.hasAttribute('data-rf-open')).toBe(false);
    });

    it('works on another root, for tests and frames', () => {
        const root = document.createElement('div');
        markOpen('drawer', root);

        expect(root.getAttribute('data-rf-open')).toBe('drawer');
        expect(html.hasAttribute('data-rf-open')).toBe(false);
    });
});
