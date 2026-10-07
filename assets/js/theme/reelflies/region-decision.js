// Decides whether the outside-Canada prompt shows (ticket 52; spec module 21, GEO-1).
//
// A pure module: it reads nothing from the page, storage, the network or the clock.
// The prompt's wiring (region.js) passes in what it read and acts on the answer:
//
//   decideRegion({
//       path,      // location.pathname
//       search,    // location.search
//       gpc,       // navigator.globalPrivacyControl
//       dnt,       // navigator.doNotTrack
//       stay,      // the saved Stay choice from localStorage, or null (also when storage throws)
//       now,       // Date.now()
//       country,   // the session's country from sessionStorage, or null before the lookup
//       timeZone,  // Intl.DateTimeFormat().resolvedOptions().timeZone
//   })  // 'show' | 'hide' | 'lookup'
//
// - 'lookup' means: make the one /cdn-cgi/trace request, keep countryFromTrace()'s result
//   in sessionStorage for the session (a failure is kept too, as ''), and decide again.
//   It is asked only when the answer could be 'show', so a Canadian time zone, GPC, Do Not
//   Track, a saved Stay, the cart or ?rf_region=in never sends the request.
// - The country triggers the prompt, and a Canadian time zone can only veto it.
// - Any failure means hidden: no response or a non-200 one, no usable loc= line, loc=XX
//   or T1, no time zone, or a session value it doesn't recognise.
// - ?rf_region=out and ?rf_region=in replace the lookup, for QA. The cart, a saved Stay
//   and the privacy signals still hide the prompt.
// - Stay, Escape and close save stayValue(Date.now()). It hides the prompt for 90 days;
//   a saved value it can't read counts as Stay.

const CART_OR_CHECKOUT = /^\/(cart\.php|checkout(\.php)?|finishorder\.php)(\/|$)/;

// The reference's zone list (plan/design/src/reference.src.html:1370), with the old names
// browsers still report (Montreal, Coral_Harbour, Canada/*).
const CANADIAN_TIME_ZONE = /^(Canada\/|America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Regina|Halifax|St_Johns|Moncton|Glace_Bay|Goose_Bay|Whitehorse|Yellowknife|Iqaluit|Dawson|Dawson_Creek|Creston|Fort_Nelson|Cambridge_Bay|Rankin_Inlet|Resolute|Inuvik|Atikokan|Swift_Current|Blanc-Sablon|Rainy_River|Thunder_Bay|Nipigon|Pangnirtung|Coral_Harbour)$)/;

const STAY_MS = 90 * 24 * 60 * 60 * 1000;

// Cloudflare's loc is an ISO 3166 code, XX when it doesn't know and T1 for Tor.
const knownCountry = code => /^[A-Z]{2}$/.test(code) && code !== 'XX';

const stayed = (value, now) => value != null && (!/^\d+$/.test(value) || now - value < STAY_MS);

export const stayValue = now => String(now);

// The country from the trace response, { status, body }, or null when the request failed
// or timed out. Only the loc= line is read; '' means no usable answer.
export function countryFromTrace(response) {
    const line = response && response.status === 200 && /^loc=(.*?)\r?$/m.exec(response.body);
    return line && knownCountry(line[1]) ? line[1] : '';
}

export function decideRegion(visitor) {
    const { country, timeZone } = visitor;
    if (CART_OR_CHECKOUT.test(visitor.path)) return 'hide';
    if (visitor.gpc === true || visitor.dnt === '1') return 'hide';
    if (stayed(visitor.stay, visitor.now)) return 'hide';
    const override = /[?&]rf_region=(in|out)(&|$)/.exec(visitor.search);
    if (override) return override[1] === 'out' ? 'show' : 'hide';
    if (!timeZone || CANADIAN_TIME_ZONE.test(timeZone)) return 'hide';
    if (country == null) return 'lookup';
    return knownCountry(country) && country !== 'CA' ? 'show' : 'hide';
}
