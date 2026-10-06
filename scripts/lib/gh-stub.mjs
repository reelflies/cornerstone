// A stand-in for the GitHub CLI, for the tests of scripts/merge.sh and scripts/status.mjs
// (W0-13). It answers from a fixture file and logs every call, so the tests run offline and
// can prove what would have been sent. It is test-only: nothing outside *.test.mjs imports it.
//
//   const gh = makeGhStub(dir);         // writes dir/gh and puts nothing on PATH by itself
//   gh.write(fixture);                  // what each call answers (see FIXTURE below)
//   spawnSync(..., { env: { ...gh.env, PATH: `${dir}:${process.env.PATH}` } });
//   gh.calls();                         // [['pr', 'view', '12', '-R', ...], ...]
//
// The stub refuses, as a failed call, any `gh pr` command without -R
// reelflies/reelflies-cornerstone and any `gh api repos/...` path for another repo: a bare
// gh resolves to upstream bigcommerce/cornerstone.

import fs from 'node:fs';
import path from 'node:path';

const STUB = `#!/usr/bin/env node
const fs = require('fs');
const REPO = 'reelflies/reelflies-cornerstone';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RF_GH_STUB_LOG, JSON.stringify(args) + '\\n');
const fx = JSON.parse(fs.readFileSync(process.env.RF_GH_STUB, 'utf8'));
// A pipe write is asynchronous on macOS, and exit would cut a long answer short, so write it all first.
const out = value => {
    const data = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    for (let at = 0; at < data.length;) {
        try { at += fs.writeSync(1, data, at); } catch (error) { if (error.code !== 'EAGAIN') throw error; }
    }
    process.exit(0);
};
const fail = (message, code = 1) => { process.stderr.write(message + '\\n'); process.exit(code); };
const flag = (...names) => { const i = args.findIndex(a => names.includes(a)); return i < 0 ? undefined : args[i + 1]; };

if (args[0] === 'pr') {
    if (flag('-R', '--repo') !== REPO) fail('stub gh: a pr command without -R ' + REPO + ' resolves to upstream bigcommerce/cornerstone');
    if (args[1] === 'view') {
        if (!fx.pr) fail('GraphQL: Could not resolve to a PullRequest with the number of ' + args[2] + '.');
        out(fx.pr);
    }
    if (args[1] === 'merge') {
        if (fx.mergeError) fail(fx.mergeError);
        out('Merged pull request #' + args[2] + '\\n');
    }
    fail('stub gh: unexpected pr command ' + args.join(' '));
}

if (args[0] === 'api') {
    const endpoint = args.slice(1).find(a => !a.startsWith('-') && (a.startsWith('repos/') || a === 'graphql'));
    if (!endpoint) fail('stub gh: no endpoint in ' + args.join(' '));
    if (endpoint.startsWith('repos/') && !endpoint.startsWith('repos/' + REPO + '/')) fail('stub gh: ' + endpoint + ' is not ' + REPO);
    if (endpoint === 'graphql') {
        out({ data: { repository: { pullRequest: { reviewThreads: { nodes: fx.threads || [], pageInfo: { hasNextPage: Boolean(fx.moreThreads) } } } } } });
    }
    if (/\\/compare\\//.test(endpoint)) out(fx.compare);
    if (/\\/pulls\\/\\d+\\/files/.test(endpoint)) out(args.includes('--slurp') ? [fx.files] : fx.files);
    if (/\\/commits\\/[0-9a-f]+\\/check-runs/.test(endpoint)) out({ total_count: (fx.checkRuns || []).length, check_runs: fx.checkRuns || [] });
    if (/\\/commits\\/[0-9a-f]+\\/status(\\?|$)/.test(endpoint)) out({ statuses: fx.statuses || [] });
    if (/\\/statuses\\/[0-9a-f]+$/.test(endpoint)) {
        if (fx.statusError) fail(fx.statusError);
        out({ state: flag('-f') });
    }
    if (/\\/contents\\/scripts\\/guarded-paths\\.txt/.test(endpoint)) {
        if (fx.masterGuarded === null || fx.masterGuarded === undefined) fail('gh: Not Found (HTTP 404)');
        if (fx.masterGuarded === 500) fail('gh: Server Error (HTTP 500)');
        out(fx.masterGuarded);
    }
    fail('stub gh: unexpected api call ' + args.join(' '));
}

fail('stub gh: unexpected command ' + args.join(' '));
`;

export function makeGhStub(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const bin = path.join(dir, 'gh');
    const fixturePath = path.join(dir, 'gh-fixture.json');
    const logPath = path.join(dir, 'gh-calls.jsonl');
    fs.writeFileSync(bin, STUB, { mode: 0o755 });
    fs.writeFileSync(logPath, '');
    return {
        dir,
        env: { RF_GH_STUB: fixturePath, RF_GH_STUB_LOG: logPath },
        write(fixture) {
            fs.writeFileSync(fixturePath, JSON.stringify(fixture));
            fs.writeFileSync(logPath, '');
        },
        calls() {
            return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
        },
    };
}
