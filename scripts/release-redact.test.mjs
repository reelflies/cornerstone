import test from 'node:test';
import assert from 'node:assert/strict';
import { redact } from './release-redact.mjs';

// What stencil-cli 9.1.0 prints for a failed request (lib/cliCommon.js printNetworkError).
const failedPush = `AxiosError: Request failed with status code 403
  config: {
    headers: Object [AxiosHeaders] {
      'x-auth-client': 'stencil-cli',
      'x-auth-token': 'not-a-real-token'
    },
    url: 'https://api.bigcommerce.com/stores/hash/v3/themes'
  }`;

test('a known secret is replaced wherever it appears', () => {
    const output = redact('token=not-a-real-token and again not-a-real-token', ['not-a-real-token']);
    assert.equal(output, 'token=[redacted] and again [redacted]');
});

test('an x-auth-token header value is replaced even when the secret is not known', () => {
    const output = redact(failedPush, []);
    assert.doesNotMatch(output, /not-a-real-token/);
    assert.match(output, /'x-auth-token': '\[redacted\]'/);
    assert.match(output, /'x-auth-client': 'stencil-cli'/);
});

test('ordinary push output is unchanged', () => {
    const line = 'ok -- Stencil Push Finished. Variation ID: 0a1b2c3d-0000-0000-0000-000000000000';
    assert.equal(redact(line, ['not-a-real-token', '', undefined]), line);
});
