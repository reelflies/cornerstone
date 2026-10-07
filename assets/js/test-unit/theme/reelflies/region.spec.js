import { countryFromTrace, decideRegion, stayValue } from '../../../theme/reelflies/region-decision';

// A real /cdn-cgi/trace body, as Cloudflare sends it (text/plain, one key=value per line).
const trace = loc => [
    'fl=465f12',
    'h=reelflies.ca',
    'ip=203.0.113.7',
    'ts=1791331200.123',
    'visit_scheme=https',
    'uag=Mozilla/5.0',
    'colo=YYZ',
    'sliver=none',
    'http=http/2',
    `loc=${loc}`,
    'tls=TLSv1.3',
    'sni=plaintext',
    'warp=off',
    '',
].join('\n');

// A visitor the prompt is for: the store's CDN says US and the browser is in New York.
// Each hidden case below changes one thing from this visitor.
const visitor = (changes = {}) => ({
    path: '/dry-flies/',
    search: '',
    gpc: undefined,
    dnt: null,
    stay: null,
    now: Date.UTC(2026, 9, 6),
    country: countryFromTrace({ status: 200, body: trace('US') }),
    timeZone: 'America/New_York',
    ...changes,
});

describe('region decision', () => {
    it('shows the prompt to loc=US with America/New_York', () => {
        expect(decideRegion(visitor())).toBe('show');
    });

    it('reads only what it is given: no storage, network, clock or page', () => {
        const reads = [
            jest.spyOn(Storage.prototype, 'getItem'),
            jest.spyOn(Storage.prototype, 'setItem'),
            jest.spyOn(Date, 'now'),
        ];
        window.fetch = jest.fn();
        window.history.replaceState(null, '', '/cart.php?rf_region=in');

        const country = countryFromTrace({ status: 200, body: trace('US') });
        expect(decideRegion(visitor({ country }))).toBe('show');
        expect(decideRegion(visitor({ country: null }))).toBe('lookup');

        reads.forEach(spy => expect(spy).not.toHaveBeenCalled());
        expect(window.fetch).not.toHaveBeenCalled();
        reads.forEach(spy => spy.mockRestore());
        delete window.fetch;
        window.history.replaceState(null, '', '/');
    });

    it('keeps only the country from the trace, never the ip= or uag= lines', () => {
        expect(countryFromTrace({ status: 200, body: trace('US') })).toBe('US');
    });

    it.each([
        ['GB', 'Europe/London'],
        ['AU', 'Australia/Sydney'],
        ['MX', 'America/Mexico_City'],
    ])('shows it to any other country: loc=%s with %s', (loc, timeZone) => {
        const country = countryFromTrace({ status: 200, body: trace(loc) });
        expect(decideRegion(visitor({ country, timeZone }))).toBe('show');
    });

    describe('the time zone never triggers it', () => {
        it('hides it for loc=CA with Europe/London', () => {
            const country = countryFromTrace({ status: 200, body: trace('CA') });
            expect(decideRegion(visitor({ country, timeZone: 'Europe/London' }))).toBe('hide');
        });

        it('hides it for loc=CA with America/New_York (an Ontario PC set to a US region)', () => {
            const country = countryFromTrace({ status: 200, body: trace('CA') });
            expect(decideRegion(visitor({ country }))).toBe('hide');
        });
    });

    describe('any failure of the trace hides it', () => {
        const decideFrom = response => decideRegion(visitor({ country: countryFromTrace(response) }));

        it('hides it for loc=XX (country unknown)', () => {
            expect(decideFrom({ status: 200, body: trace('XX') })).toBe('hide');
        });

        it('hides it for loc=T1 (Tor)', () => {
            expect(decideFrom({ status: 200, body: trace('T1') })).toBe('hide');
        });

        it.each([404, 500, 503, 204, 301])('hides it for a %i response, even one carrying a loc= line', status => {
            expect(decideFrom({ status, body: trace('US') })).toBe('hide');
        });

        it('hides it after a timeout or a network error: the request left no response', () => {
            expect(decideFrom(null)).toBe('hide');
            expect(decideFrom(undefined)).toBe('hide');
        });

        it.each([
            ['an empty body', ''],
            ['no body', undefined],
            ['a body with no loc= line', 'fl=465f12\nh=reelflies.ca\ncolo=YYZ\n'],
            ['an HTML page', '<!DOCTYPE html><html><body><p>loc=US</p></body></html>'],
            ['an empty loc= line', 'h=reelflies.ca\nloc=\n'],
            ['a three-letter code', 'loc=USA\n'],
            ['a code with a digit', 'loc=U5\n'],
            ['a code with spaces inside', 'loc=U S\n'],
            ['a loc key with a prefix', 'xloc=US\n'],
        ])('hides it for an unparseable body: %s', (name, body) => {
            expect(decideFrom({ status: 200, body })).toBe('hide');
        });

        it('reads the loc= line from a body with CRLF line ends', () => {
            expect(decideFrom({ status: 200, body: trace('US').replace(/\n/g, '\r\n') })).toBe('show');
        });
    });

    describe('one /cdn-cgi/trace request per session, and only when it can matter', () => {
        it('asks for the lookup when no country is known yet (nothing in sessionStorage)', () => {
            expect(decideRegion(visitor({ country: null }))).toBe('lookup');
            expect(decideRegion(visitor({ country: undefined }))).toBe('lookup');
        });

        it('decides from the country the session already holds, without asking again', () => {
            expect(decideRegion(visitor({ country: 'US' }))).toBe('show');
            expect(decideRegion(visitor({ country: 'CA' }))).toBe('hide');
        });

        it('hides it after a failed lookup held for the session (\'\'), without asking again', () => {
            expect(decideRegion(visitor({ country: '' }))).toBe('hide');
        });

        it('hides it for a session value it doesn\'t recognise', () => {
            expect(decideRegion(visitor({ country: 'us' }))).toBe('hide');
            expect(decideRegion(visitor({ country: 'XX' }))).toBe('hide');
            expect(decideRegion(visitor({ country: '{"loc":"US"}' }))).toBe('hide');
        });

        it.each([
            ['GPC is on', { gpc: true }],
            ['Do Not Track is on', { dnt: '1' }],
            ['Stay is saved', { stay: stayValue(Date.UTC(2026, 9, 6)) }],
            ['on the cart', { path: '/cart.php' }],
            ['with ?rf_region=in', { search: '?rf_region=in' }],
        ])('makes no request when %s', (name, changes) => {
            expect(decideRegion(visitor({ country: null, ...changes }))).toBe('hide');
        });

        it('makes no request with ?rf_region=out', () => {
            expect(decideRegion(visitor({ country: null, search: '?rf_region=out' }))).toBe('show');
        });

        it('makes no request in a Canadian time zone, which would veto any answer', () => {
            expect(decideRegion(visitor({ country: null, timeZone: 'America/Toronto' }))).toBe('hide');
        });

        it('hides it, with no request, when the browser gives no time zone', () => {
            expect(decideRegion(visitor({ country: null, timeZone: undefined }))).toBe('hide');
            expect(decideRegion(visitor({ country: null, timeZone: '' }))).toBe('hide');
            expect(decideRegion(visitor({ timeZone: '' }))).toBe('hide');
        });
    });

    describe('the QA overrides', () => {
        // A visitor the lookup would hide: in Canada, in Toronto.
        const canadian = changes => visitor({ country: 'CA', timeZone: 'America/Toronto', ...changes });

        it('shows it with ?rf_region=out, whatever the country and time zone', () => {
            expect(decideRegion(canadian({ search: '?rf_region=out' }))).toBe('show');
            expect(decideRegion(canadian({ search: '?sort=featured&rf_region=out&page=2' }))).toBe('show');
        });

        it('shows it with ?rf_region=out before any lookup, and after a failed one', () => {
            expect(decideRegion(visitor({ search: '?rf_region=out', country: null }))).toBe('show');
            expect(decideRegion(visitor({ search: '?rf_region=out', country: '' }))).toBe('show');
        });

        it('hides it with ?rf_region=in, for a visitor it would show to', () => {
            expect(decideRegion(visitor({ search: '?rf_region=in' }))).toBe('hide');
            expect(decideRegion(visitor({ search: '?page=2&rf_region=in' }))).toBe('hide');
        });

        it('ignores any other value or name', () => {
            expect(decideRegion(canadian({ search: '?rf_region=outside' }))).toBe('hide');
            expect(decideRegion(canadian({ search: '?xrf_region=out' }))).toBe('hide');
            expect(decideRegion(visitor({ search: '?rf_region=' }))).toBe('show');
        });

        it('still never shows it on the cart', () => {
            expect(decideRegion(visitor({ search: '?rf_region=out', path: '/cart.php' }))).toBe('hide');
        });

        it('still honours a saved Stay choice, so a reload after Stay doesn\'t show it again', () => {
            const now = Date.UTC(2026, 9, 6);
            expect(decideRegion(visitor({ search: '?rf_region=out', now, stay: stayValue(now) }))).toBe('hide');
        });

        it('still honours GPC and Do Not Track', () => {
            expect(decideRegion(visitor({ search: '?rf_region=out', gpc: true }))).toBe('hide');
            expect(decideRegion(visitor({ search: '?rf_region=out', dnt: '1' }))).toBe('hide');
        });
    });

    describe('never on the cart or checkout', () => {
        it.each([
            '/cart.php',
            '/checkout',
            '/checkout/',
            '/checkout/order-confirmation',
            '/checkout.php',
            '/finishorder.php',
        ])('hides it on %s', path => {
            expect(decideRegion(visitor({ path }))).toBe('hide');
        });

        it.each([
            '/',
            '/dry-flies/',
            '/cart-flies/',
            '/checkout-the-new-patterns/',
            '/elk-hair-caddis-tan/',
        ])('still shows it on %s', path => {
            expect(decideRegion(visitor({ path }))).toBe('show');
        });
    });

    describe('a saved Stay choice hides it for 90 days (localStorage; no cookie is used)', () => {
        const DAY = 24 * 60 * 60 * 1000;
        const now = Date.UTC(2026, 9, 6, 15, 30);
        const stayedAgo = ms => visitor({ now, stay: stayValue(now - ms) });

        it('hides it just after Stay, Escape or close', () => {
            expect(decideRegion(stayedAgo(0))).toBe('hide');
        });

        it('still hides it 89 days later', () => {
            expect(decideRegion(stayedAgo(89 * DAY))).toBe('hide');
        });

        it('shows it again once 90 days have passed', () => {
            expect(decideRegion(stayedAgo(90 * DAY))).toBe('show');
        });

        it('hides it when the saved time is ahead of the clock (the clock was set back)', () => {
            expect(decideRegion(stayedAgo(-3 * DAY))).toBe('hide');
        });

        it('hides it for a saved value it can\'t read, rather than ask again', () => {
            expect(decideRegion(visitor({ stay: 'stay' }))).toBe('hide');
        });

        it('shows it when nothing is saved, or storage couldn\'t be read', () => {
            expect(decideRegion(visitor({ stay: null }))).toBe('show');
            expect(decideRegion(visitor({ stay: undefined }))).toBe('show');
        });
    });

    describe('privacy signals hide it', () => {
        it('hides it when navigator.globalPrivacyControl is true', () => {
            expect(decideRegion(visitor({ gpc: true }))).toBe('hide');
        });

        it('hides it when doNotTrack is \'1\'', () => {
            expect(decideRegion(visitor({ dnt: '1' }))).toBe('hide');
        });

        it.each([
            ['GPC false', { gpc: false }],
            ['doNotTrack \'0\'', { dnt: '0' }],
            ['doNotTrack \'unspecified\'', { dnt: 'unspecified' }],
        ])('still shows it with %s', (name, changes) => {
            expect(decideRegion(visitor(changes))).toBe('show');
        });
    });

    describe('a Canadian time zone vetoes it (a Canadian on a US VPN)', () => {
        it('hides it for loc=US with America/Toronto', () => {
            expect(decideRegion(visitor({ timeZone: 'America/Toronto' }))).toBe('hide');
        });

        // From the reference's zone list (reference.src.html:1370), including the old
        // names that browsers still report (Montreal, Coral_Harbour, Canada/*).
        it.each([
            'America/Vancouver',
            'America/St_Johns',
            'America/Halifax',
            'America/Regina',
            'America/Whitehorse',
            'America/Iqaluit',
            'America/Dawson',
            'America/Dawson_Creek',
            'America/Blanc-Sablon',
            'America/Montreal',
            'America/Coral_Harbour',
            'Canada/Eastern',
            'Canada/Newfoundland',
        ])('hides it for %s', timeZone => {
            expect(decideRegion(visitor({ timeZone }))).toBe('hide');
        });

        it.each([
            'America/Detroit',
            'America/Los_Angeles',
            'America/Anchorage',
            'Europe/London',
            'UTC',
            'America/Torontoish',
            'Europe/America/Toronto',
        ])('doesn\'t veto it for %s', timeZone => {
            expect(decideRegion(visitor({ timeZone }))).toBe('show');
        });
    });
});
