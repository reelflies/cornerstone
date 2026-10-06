// Tests scripts/lib/store-token.mjs (W0-11) with a stubbed Keychain: no test reads a real token,
// and none runs `security`.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    KEYCHAIN_ACCOUNT, TOKENS, keychainArgs, readStoreToken,
} from './store-token.mjs';

const FAKE = 'faketoken0123456789abcdefghijkl';
const STORE_SCRIPT = fileURLToPath(new URL('../store/apply.mjs', import.meta.url));
const OTHER_SCRIPT = fileURLToPath(new URL('../release.mjs', import.meta.url));

// A stand-in for `security`, recording each call.
function keychain(answers = {}) {
    const calls = [];
    const security = args => {
        calls.push(args);
        const service = args[args.indexOf('-s') + 1];
        if (!(service in answers)) return { status: 44, stdout: '', stderr: 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n' };
        const answer = answers[service];
        return typeof answer === 'string' ? { status: 0, stdout: `${answer}\n`, stderr: '' } : answer;
    };
    return { security, calls };
}

// The tooling check (scripts/store/tooling.mjs) has its own tests; here it passes unless a test
// says otherwise.
const options = (extra = {}) => ({
    env: {}, platform: 'darwin', mainScript: STORE_SCRIPT, toolingProblem: () => null, ...extra,
});

test('the two tokens: an environment variable each, then a Keychain item each, under account "reelflies"', () => {
    assert.equal(KEYCHAIN_ACCOUNT, 'reelflies');
    assert.deepEqual(TOKENS.read, {
        env: 'RF_BC_READ_TOKEN', aliases: ['RF_BC_API_TOKEN'], service: 'reelflies-bc-read', what: 'the read-only store API token',
    });
    assert.deepEqual(TOKENS.write, { env: 'RF_BC_WRITE_TOKEN', service: 'reelflies-bc-write', what: 'the writer store API token' });
    assert.deepEqual(keychainArgs('reelflies-bc-write'), ['find-generic-password', '-a', 'reelflies', '-s', 'reelflies-bc-write', '-w']);
});

test('the environment comes first, and the Keychain is then never asked', () => {
    const stub = keychain({ 'reelflies-bc-read': 'keychaintoken0123456789abcdef' });
    const result = readStoreToken('read', options({ env: { RF_BC_READ_TOKEN: FAKE }, security: stub.security }));
    assert.deepEqual(result, { token: FAKE, source: '$RF_BC_READ_TOKEN' });
    assert.deepEqual(stub.calls, []);
});

test('without the variable, the Keychain item is read, and its trailing newline dropped', () => {
    const stub = keychain({ 'reelflies-bc-write': FAKE });
    const result = readStoreToken('write', options({ security: stub.security }));
    assert.deepEqual(result, { token: FAKE, source: 'Keychain item "reelflies-bc-write" (account "reelflies")' });
    assert.deepEqual(stub.calls, [['find-generic-password', '-a', 'reelflies', '-s', 'reelflies-bc-write', '-w']]);
});

test('an empty variable counts as unset', () => {
    const stub = keychain({ 'reelflies-bc-read': FAKE });
    assert.equal(readStoreToken('read', options({ env: { RF_BC_READ_TOKEN: '' }, security: stub.security })).token, FAKE);
});

test('a missing Keychain item says how Shaun adds it, without asking for the token in a chat', () => {
    const stub = keychain({});
    assert.throws(() => readStoreToken('write', options({ security: stub.security })), error => {
        assert.match(error.message, /no RF_BC_WRITE_TOKEN in the environment and no Keychain item "reelflies-bc-write" for account "reelflies"/);
        assert.match(error.message, /security add-generic-password -a reelflies -s reelflies-bc-write -w/);
        assert.match(error.message, /never in a chat/);
        return true;
    });
});

test('another Keychain failure names its exit code, never the output', () => {
    const stub = keychain({ 'reelflies-bc-read': { status: 51, stdout: FAKE, stderr: 'security: user interaction is not allowed.\n' } });
    assert.throws(() => readStoreToken('read', options({ security: stub.security })), error => {
        assert.match(error.message, /the Keychain didn't give "reelflies-bc-read" \(security exited 51: security: user interaction is not allowed\.\)/);
        assert.ok(!error.message.includes(FAKE));
        return true;
    });
});

test('a token that isn\'t one line of printable text is refused, and never echoed', () => {
    for (const bad of ['two\nlines', 'has space in it', 'short']) {
        assert.throws(() => readStoreToken('read', options({ env: { RF_BC_READ_TOKEN: bad } })), error => {
            assert.match(error.message, /\$RF_BC_READ_TOKEN doesn't look like a store API token/);
            assert.ok(!error.message.includes(bad));
            return true;
        });
    }
});

test('off macOS, with no variable, the loader says there is no Keychain to read', () => {
    const stub = keychain({ 'reelflies-bc-read': FAKE });
    assert.throws(() => readStoreToken('read', options({ platform: 'linux', security: stub.security })), /no RF_BC_READ_TOKEN in the environment, and no macOS Keychain on linux/);
    assert.deepEqual(stub.calls, []);
});

test('the writer token is read only by the store helper: any other script is refused before any read', () => {
    const stub = keychain({ 'reelflies-bc-write': FAKE });
    for (const mainScript of [OTHER_SCRIPT, undefined, '']) {
        assert.throws(
            () => readStoreToken('write', options({ mainScript, env: { RF_BC_WRITE_TOKEN: FAKE }, security: stub.security })),
            /the writer token is read only by the store helper, scripts\/store\/ \(W0-11\)/,
        );
    }
    assert.deepEqual(stub.calls, []);
    // A path that climbs out of scripts/store/ doesn't count as inside it.
    const climbing = `${fileURLToPath(new URL('../store/', import.meta.url))}../release.mjs`;
    assert.throws(() => readStoreToken('write', options({ mainScript: climbing, env: { RF_BC_WRITE_TOKEN: FAKE } })), /read only by the store helper/);
    // The read-only token has no such limit: the release guard reads it too.
    assert.equal(readStoreToken('read', options({ mainScript: OTHER_SCRIPT, env: { RF_BC_READ_TOKEN: FAKE } })).token, FAKE);
});

test('the writer token goes only to store tooling identical to origin/master\'s: otherwise neither the variable nor the Keychain is read', () => {
    const stub = keychain({ 'reelflies-bc-write': FAKE });
    const problem = 'this checkout\'s store tooling differs from origin/master\'s (scripts/store/allowlist.mjs), and a store write runs only master\'s reviewed rules';
    for (const env of [{ RF_BC_WRITE_TOKEN: FAKE }, {}]) {
        assert.throws(() => readStoreToken('write', options({ env, security: stub.security, toolingProblem: () => problem })), error => {
            assert.equal(error.message, problem);
            return true;
        });
    }
    assert.deepEqual(stub.calls, []);
    // The read-only token is never held to it: plans read anywhere, and so will the release guard.
    const unasked = () => { throw new Error('the tooling check ran for the read token'); };
    assert.equal(readStoreToken('read', options({ env: { RF_BC_READ_TOKEN: FAKE }, toolingProblem: unasked })).token, FAKE);
});

test('the read token also answers to RF_BC_API_TOKEN, the name the release guard uses (W0-12: the same account)', () => {
    const stub = keychain({ 'reelflies-bc-read': 'keychaintoken0123456789abcdef', 'reelflies-bc-write': FAKE });
    const other = 'apitoken0123456789abcdefghijklm';
    assert.deepEqual(readStoreToken('read', options({ env: { RF_BC_API_TOKEN: other }, security: stub.security })), { token: other, source: '$RF_BC_API_TOKEN' });
    assert.equal(readStoreToken('read', options({ env: { RF_BC_READ_TOKEN: FAKE, RF_BC_API_TOKEN: other }, security: stub.security })).token, FAKE, 'RF_BC_READ_TOKEN comes first');
    assert.deepEqual(stub.calls, [], 'an exported RF_BC_API_TOKEN is never skipped for the Keychain');
    // The writer token never takes it.
    assert.equal(readStoreToken('write', options({ env: { RF_BC_API_TOKEN: other }, security: stub.security })).token, FAKE);
});

test('only the two kinds exist', () => {
    assert.throws(() => readStoreToken('admin', options()), /"admin" isn't a store token kind \(read, write\)/);
});

test('under node --test the real Keychain is never read: a test that forgot its token variable is refused', () => {
    // A stand-in `security` first on PATH, so even a broken loader can't reach the real Keychain.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-store-token-'));
    after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const marker = path.join(dir, 'security-ran');
    fs.writeFileSync(path.join(dir, 'security'), `#!/bin/sh\ntouch '${marker}'\necho ${FAKE}\n`, { mode: 0o755 });
    const loader = new URL('./store-token.mjs', import.meta.url).href;
    const script = `import { readStoreToken } from '${loader}';
try { readStoreToken('read', { env: { NODE_TEST_CONTEXT: 'child-v8' }, platform: 'darwin' }); console.log('READ'); }
catch (error) { console.log(\`REFUSED \${error.message}\`); }`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8', env: { PATH: dir, NODE_TEST_CONTEXT: 'child-v8', HOME: dir },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^REFUSED under node --test the store tokens come from the environment only: the Keychain is never read/);
    assert.ok(!fs.existsSync(marker), 'security never ran');
});
