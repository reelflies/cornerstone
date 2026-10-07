// Probe 11: does /cdn-cgi/trace return a `loc=` line on the prelaunch host and on the live sites?
// The outside-Canada prompt (ticket 52) reads only that line.
//
// A trace also prints the caller's IP address (`ip=`), so parseTrace keeps only the host, the colo
// and the country, and nothing else is printed or written.

export const TRACE_HOSTS = [
    { host: 'reelflies_ca-1895766.mybigcommerce.com', what: 'ReelFlies_CA prelaunch host (1895766)' },
    { host: 'store-8pfqkn26ea-1895766.mybigcommerce.com', what: 'ReelFlies_CA secure host (1895766)' },
    { host: 'reelflies.ca', what: 'live reelflies.ca (channel 1)' },
    { host: 'reelflies.com', what: 'live reelflies.com (1855224)' },
];

const KEPT = new Set(['h', 'colo', 'loc']);

export function parseTrace(text) {
    const kept = {};
    String(text).split('\n').forEach(line => {
        const match = /^([a-z_]+)=(.*)$/.exec(line.trim());
        if (match && KEPT.has(match[1])) [, , kept[match[1]]] = match;
    });
    return kept;
}

// `results`: [{ host, status, trace }]. Passes when every host answered 200 with a loc.
export function probeCdnCountry(results) {
    const withoutLoc = results.filter(({ status, trace }) => status !== 200 || !/^[A-Z]{2}$/.test(trace.loc || '')).map(({ host }) => host);
    return { verdict: withoutLoc.length ? 'fail' : 'pass', withoutLoc };
}
