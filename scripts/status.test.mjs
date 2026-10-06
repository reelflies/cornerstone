// Tests scripts/status.mjs offline, against a stubbed gh (W0-13).

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGhStub } from './lib/gh-stub.mjs';

const SCRIPT = fileURLToPath(new URL('./status.mjs', import.meta.url));
const REPO = 'reelflies/reelflies-cornerstone';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const URL_OK = `https://github.com/${REPO}/pull/12#issuecomment-42`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-status-test-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const gh = makeGhStub(path.join(root, 'bin'));

const fixture = (head = SHA) => ({ pr: { number: 12, headRefOid: head, state: 'OPEN' } });

function run(args, fx = fixture()) {
    gh.write(fx);
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...gh.env, PATH: `${gh.dir}${path.delimiter}${process.env.PATH}` },
    });
    return {
        status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`, calls: gh.calls(),
    };
}

const args = (overrides = {}) => Object.entries({
    '--pr': '12', '--sha': SHA, '--context': 'rf/spec', '--state': 'success', '--description': 'Spec: 9 met, 2 waiting', '--url': URL_OK, ...overrides,
}).flatMap(([flag, value]) => (value === undefined ? [] : [flag, value]));

const posted = calls => calls.find(call => call[0] === 'api' && call.some(arg => /\/statuses\//.test(arg)));
const field = (call, name) => call[call.findIndex((arg, i) => call[i - 1] === '-f' && arg.startsWith(`${name}=`))]?.slice(name.length + 1);

test('status.mjs posts the status on the sha, with its description and link', () => {
    const result = run(args());
    assert.equal(result.status, 0, result.output);
    const call = posted(result.calls);
    assert.ok(call, JSON.stringify(result.calls));
    assert.ok(call.includes(`repos/${REPO}/statuses/${SHA}`));
    assert.equal(call[call.indexOf('--method') + 1], 'POST');
    assert.equal(field(call, 'state'), 'success');
    assert.equal(field(call, 'context'), 'rf/spec');
    assert.equal(field(call, 'description'), 'Spec: 9 met, 2 waiting');
    assert.equal(field(call, 'target_url'), URL_OK);
    assert.match(result.stdout, /rf\/spec success on 0123456/);
    const view = result.calls.find(c => c[0] === 'pr' && c[1] === 'view');
    assert.equal(view[view.indexOf('-R') + 1], REPO);
});

test('every sign-off context is accepted, rf/safety included', () => {
    for (const context of ['rf/gates', 'rf/standards', 'rf/spec', 'rf/skeptic', 'rf/review', 'rf/safety']) {
        const result = run(args({ '--context': context }));
        assert.equal(result.status, 0, `${context}: ${result.output}`);
    }
});

test('a long description is cut to GitHub\'s 140 characters, with a note', () => {
    const long = `Gates: ${'x'.repeat(200)}`;
    const result = run(args({ '--description': long }));
    assert.equal(result.status, 0, result.output);
    const description = field(posted(result.calls), 'description');
    assert.equal([...description].length, 140);
    assert.ok(description.endsWith('…'));
    assert.match(result.stderr, /cut to 140/);
});

test('--dry-run prints the call and posts nothing', () => {
    const result = run([...args(), '--dry-run']);
    assert.equal(result.status, 0, result.output);
    assert.equal(posted(result.calls), undefined);
    assert.match(result.stdout, /would post rf\/spec success on 0123456/);
});

const refusals = [
    ['an unknown context', { '--context': 'ci/build' }, /context must be one of rf\/gates, rf\/standards, rf\/spec, rf\/skeptic, rf\/review, rf\/safety/],
    ['an unknown state', { '--state': 'passed' }, /state must be one of success, failure, error, pending/],
    ['a short sha', { '--sha': '0123456' }, /full 40-character sha/],
    ['no sha', { '--sha': undefined }, /--sha/],
    ['no PR', { '--pr': undefined }, /--pr/],
    ['no description', { '--description': '' }, /--description/],
    ['no link', { '--url': undefined }, /--url/],
    ['a link outside the repo', { '--url': 'https://example.com/pull/12' }, /link must be on https:\/\/github\.com\/reelflies\/reelflies-cornerstone\//],
];

for (const [name, overrides, reason] of refusals) {
    test(`status.mjs refuses ${name}, before calling GitHub`, () => {
        const result = run(args(overrides));
        assert.equal(result.status, 2, result.output);
        assert.match(result.stderr, reason);
        assert.deepEqual(result.calls, []);
    });
}

test('status.mjs refuses a sha that is no longer the PR\'s head', () => {
    const result = run(args(), fixture('fedcba9876543210fedcba9876543210fedcba98'));
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /0123456 isn't the head of PR #12 \(fedcba9 is\)/);
    assert.equal(posted(result.calls), undefined);
});

test('a failed post fails the run', () => {
    const result = run(args(), { ...fixture(), statusError: 'gh: Resource not accessible (HTTP 403)' });
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /HTTP 403/);
});
