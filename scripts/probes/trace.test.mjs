import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACE_HOSTS, parseTrace, probeCdnCountry } from './trace.mjs';

const TRACE = [
    'fl=123abc',
    'h=reelflies.ca',
    'ip=203.0.113.9',
    'ts=1760000000.123',
    'visit_scheme=https',
    'uag=curl/8.7.1',
    'colo=YYZ',
    'sliver=none',
    'http=http/2',
    'loc=CA',
    'tls=TLSv1.3',
    'sni=plaintext',
    'warp=off',
    'gateway=off',
    'rbi=off',
    'kex=X25519',
    '',
].join('\n');

test('parseTrace keeps only the host, the colo and the country, never the visitor\'s address', () => {
    const parsed = parseTrace(TRACE);
    assert.deepEqual(parsed, { h: 'reelflies.ca', colo: 'YYZ', loc: 'CA' });
    assert.ok(!JSON.stringify(parsed).includes('203.0.113.9'));
});

test('parseTrace returns no loc for a page that isn\'t a trace', () => {
    assert.deepEqual(parseTrace('<html><body>Coming Soon</body></html>'), {});
});

test('the probe passes only when every host answered 200 with a two-letter loc', () => {
    const ok = probeCdnCountry([
        { host: 'a', status: 200, trace: { loc: 'CA' } },
        { host: 'b', status: 200, trace: { loc: 'US' } },
    ]);
    assert.equal(ok.verdict, 'pass');
    const bad = probeCdnCountry([
        { host: 'a', status: 200, trace: { loc: 'CA' } },
        { host: 'b', status: 404, trace: {} },
    ]);
    assert.equal(bad.verdict, 'fail');
    assert.deepEqual(bad.withoutLoc, ['b']);
});

test('the hosts are the prelaunch host (both names) and the two live sites', () => {
    assert.deepEqual(TRACE_HOSTS.map(({ host }) => host), [
        'reelflies_ca-1895766.mybigcommerce.com',
        'store-8pfqkn26ea-1895766.mybigcommerce.com',
        'reelflies.ca',
        'reelflies.com',
    ]);
});
