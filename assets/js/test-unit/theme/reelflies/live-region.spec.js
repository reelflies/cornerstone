import {
    announce, ANNOUNCE_DELAY_MS, liveRegion, REGION_SELECTOR,
} from '../../../theme/reelflies/live-region';

// The region as base.html renders it (templates/components/reelflies/body-start.html).
const SERVER_REGION = '<div class="is-srOnly" role="status" aria-live="polite" aria-atomic="true" data-rf-live-region></div>';

// The text each change put into the region, in order: what a screen reader announces. Mutation
// records can arrive batched, so this reads every record's added text, then any still queued.
const addedText = records => records
    .flatMap(record => [...record.addedNodes].map(node => node.textContent))
    .filter(Boolean);

describe('live region', () => {
    let region;
    let observer;
    let changes;

    const heard = () => [...changes, ...addedText(observer.takeRecords())];

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = SERVER_REGION;
        region = document.querySelector(REGION_SELECTOR);
        changes = [];
        observer = new MutationObserver(records => changes.push(...addedText(records)));
        observer.observe(region, { childList: true, characterData: true, subtree: true });
    });

    afterEach(() => {
        observer.disconnect();
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    it('uses the region the server rendered, which is empty at load', () => {
        expect(liveRegion()).toBe(region);
        expect(region.textContent).toBe('');
        expect(region.getAttribute('role')).toBe('status');
    });

    it('puts a message in the region', () => {
        announce('3 results for parachute adams');
        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);

        expect(region.textContent).toBe('3 results for parachute adams');
        expect(heard()).toEqual(['3 results for parachute adams']);
    });

    it('announces the same message twice when it is sent twice', () => {
        announce('Added to cart.');
        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);
        announce('Added to cart.');

        // Cleared first, so the second message is a change a screen reader announces.
        expect(region.textContent).toBe('');

        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);

        expect(region.textContent).toBe('Added to cart.');
        expect(heard()).toEqual(['Added to cart.', 'Added to cart.']);
    });

    it('replaces a message that is still waiting with the newer one', () => {
        announce('12 results');
        announce('4 results');
        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);

        expect(heard()).toEqual(['4 results']);
    });

    it('clears the region for an empty message, and announces nothing', () => {
        announce('Size 14 is sold out.');
        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);
        announce('  ');
        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);

        expect(region.textContent).toBe('');
        expect(heard()).toEqual(['Size 14 is sold out.']);
    });

    it('writes text, never markup', () => {
        announce('<img src=x onerror=alert(1)>');
        jest.advanceTimersByTime(ANNOUNCE_DELAY_MS);

        expect(region.children).toHaveLength(0);
        expect(region.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('makes one hidden polite region when a page has none, and reuses it', () => {
        document.body.innerHTML = '';
        const made = liveRegion();

        expect(made.getAttribute('role')).toBe('status');
        expect(made.getAttribute('aria-live')).toBe('polite');
        expect(made.classList.contains('is-srOnly')).toBe(true);
        expect(liveRegion()).toBe(made);
        expect(document.querySelectorAll(REGION_SELECTOR)).toHaveLength(1);
    });
});
