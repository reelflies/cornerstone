// W0-1: an agent push (--confirm-nonprod) runs only from master at origin/master's tip, so the
// calendar and targets that judge it are origin/master's, never a stale checkout's (rf/safety and
// rf/skeptic on PR #18). Each test runs git on a temp clone of a bare origin
// (release-origin-fixture.mjs), offline.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    checkoutProblems, gitIn, ORIGIN_MASTER, readCheckout, RELEASE_TOOLING, stepFiveOrigin,
} from './release-origin.mjs';
import { originRepo } from './release-origin-fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const repos = [];
after(() => repos.forEach(repo => repo.remove()));
const fixture = files => {
    const repo = originRepo(files);
    repos.push(repo);
    return repo;
};
const short = sha => sha.slice(0, 7);
const CALENDAR = { 'scripts/release-calendar.json': '{"flip": null, "status": "provisional", "source": "test"}\n', 'README.md': 'test\n' };

// --- Before step 1: master at origin/master's tip ----------------------------------------------

test('checkoutProblems: master at origin/master\'s tip has none', () => {
    assert.deepEqual(checkoutProblems({
        fetchError: null, branch: 'master', head: 'a'.repeat(40), originMaster: 'a'.repeat(40),
    }), []);
});

test('checkoutProblems: another branch, a detached HEAD, another commit, no origin/master or a failed fetch each refuse', () => {
    const sha = 'a'.repeat(40);
    const other = 'b'.repeat(40);
    assert.deepEqual(checkoutProblems({
        fetchError: null, branch: 't99/old-ticket', head: sha, originMaster: sha,
    }), ['this checkout is on branch t99/old-ticket, not master: run the release from the main clone, on master']);
    assert.deepEqual(checkoutProblems({
        fetchError: null, branch: 'HEAD', head: sha, originMaster: sha,
    }), ['this checkout is on a detached HEAD, not master: run the release from the main clone, on master']);
    assert.deepEqual(checkoutProblems({
        fetchError: null, branch: 'master', head: sha, originMaster: other,
    }), ['HEAD aaaaaaa isn\'t origin/master\'s tip bbbbbbb: git pull --ff-only origin master, then rerun']);
    assert.deepEqual(checkoutProblems({
        fetchError: null, branch: 'master', head: sha, originMaster: null,
    }), ['there is no origin/master to compare with']);
    assert.deepEqual(checkoutProblems({
        fetchError: 'fatal: unable to access', branch: 'master', head: sha, originMaster: sha,
    }), ['couldn\'t fetch origin\'s master (fatal: unable to access), so this release can\'t check that it runs origin/master\'s calendar and targets']);
});

test('readCheckout fetches origin\'s master into origin/master and reads the branch and both commits', () => {
    const repo = fixture();
    const checkout = readCheckout({ git: gitIn(repo.clone), fetch: true });
    assert.deepEqual(checkout, {
        fetchError: null, branch: 'master', head: repo.head, originMaster: repo.head,
    });
    assert.deepEqual(checkoutProblems(checkout), []);
});

test('a master behind origin/master is refused once the fetch shows the merge it hasn\'t pulled', () => {
    const repo = fixture();
    const merged = repo.mergeOnOrigin({ 'scripts/release-calendar.json': '{"flip": "2026-10-27", "status": "set", "source": "test"}\n' });
    assert.deepEqual(checkoutProblems(readCheckout({ git: gitIn(repo.clone), fetch: false })), [], 'without the fetch, the stale clone looks current');
    const checkout = readCheckout({ git: gitIn(repo.clone), fetch: true });
    assert.equal(checkout.originMaster, merged);
    assert.deepEqual(checkoutProblems(checkout), [`HEAD ${short(repo.head)} isn't origin/master's tip ${short(merged)}: git pull --ff-only origin master, then rerun`]);
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.head, 'the fetch moves only origin/master, never the checkout');
});

test('a branch other than master is refused, even at origin/master\'s tip', () => {
    const repo = fixture();
    repo.git('switch', '-q', '-c', 't99/old-ticket');
    assert.deepEqual(checkoutProblems(readCheckout({ git: gitIn(repo.clone), fetch: true })), ['this checkout is on branch t99/old-ticket, not master: run the release from the main clone, on master']);
    repo.git('switch', '-q', '--detach', 'master');
    assert.deepEqual(checkoutProblems(readCheckout({ git: gitIn(repo.clone), fetch: true })), ['this checkout is on a detached HEAD, not master: run the release from the main clone, on master']);
});

test('a master with a commit origin doesn\'t have is refused: an agent push sends only what is merged', () => {
    const repo = fixture();
    fs.writeFileSync(path.join(repo.clone, 'README.md'), 'not merged\n');
    repo.git('commit', '-q', '-am', 'local only');
    const checkout = readCheckout({ git: gitIn(repo.clone), fetch: true });
    assert.match(checkoutProblems(checkout)[0], new RegExp(`^HEAD ${short(checkout.head)} isn't origin/master's tip ${short(repo.head)}`));
});

test('a fetch that fails is refused, naming git\'s reason', () => {
    const repo = fixture();
    repo.git('remote', 'set-url', 'origin', path.join(repo.root, 'missing.git'));
    const checkout = readCheckout({ git: gitIn(repo.clone), fetch: true });
    assert.ok(checkout.fetchError, 'the fetch failed');
    const problems = checkoutProblems(checkout);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^couldn't fetch origin's master \(.*missing\.git.*\), so this release can't check/);
});

test('outside a git repository nothing can be read, and the check refuses', () => {
    const dir = fs.mkdtempSync(path.join(fixture().root, 'not-a-repo-'));
    const checkout = readCheckout({ git: gitIn(dir), fetch: false });
    assert.equal(checkout.head, null);
    assert.ok(checkoutProblems(checkout).length > 0);
});

// --- Step 5: origin/master may move on while the release builds ---------------------------------

test('step 5: origin/master still at the commit prepare checked passes', () => {
    const repo = fixture(CALENDAR);
    assert.deepEqual(stepFiveOrigin({ git: gitIn(repo.clone), sha: repo.head }), {
        problems: [], note: `${short(repo.head)} is still origin/master's tip`,
    });
});

test('step 5: a merge that changes none of the release tooling passes, and the push sends the commit prepare checked', () => {
    const repo = fixture(CALENDAR);
    const merged = repo.mergeOnOrigin({ 'templates/pages/home.html': 'home\n', 'README.md': 'later\n' });
    assert.deepEqual(stepFiveOrigin({ git: gitIn(repo.clone), sha: repo.head }), {
        problems: [],
        note: `origin/master moved on to ${short(merged)} while this release ran, but changed none of the release tooling or the calendar, so the push sends ${short(repo.head)} as checked`,
    });
});

test('step 5: a calendar or target change merged while the release ran stops the push, naming the files', () => {
    for (const file of ['scripts/release-calendar.json', 'scripts/release-targets.mjs', 'scripts/release-checks.mjs']) {
        const repo = fixture(CALENDAR);
        const merged = repo.mergeOnOrigin({ [file]: 'changed\n' });
        const { problems, note } = stepFiveOrigin({ git: gitIn(repo.clone), sha: repo.head });
        assert.equal(note, null);
        assert.deepEqual(problems, [`origin/master moved on to ${short(merged)} while this release ran, and changed the release tooling or the calendar since ${short(repo.head)} (${file}): pull and rerun the release`]);
    }
});

test('step 5: a commit that is no longer in origin/master\'s history stops the push', () => {
    const repo = fixture(CALENDAR);
    const rewritten = repo.rewriteOrigin(CALENDAR);
    assert.deepEqual(stepFiveOrigin({ git: gitIn(repo.clone), sha: repo.head }).problems, [
        `${short(repo.head)} is no longer in origin/master's history (its tip is ${short(rewritten)})`,
    ]);
});

test('step 5: a fetch that fails stops the push', () => {
    const repo = fixture(CALENDAR);
    repo.git('remote', 'set-url', 'origin', path.join(repo.root, 'missing.git'));
    const { problems } = stepFiveOrigin({ git: gitIn(repo.clone), sha: repo.head });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^couldn't fetch origin's master again \(.*missing\.git.*\)/);
});

test('the fetch updates only origin/master, as merge.sh\'s does', () => {
    assert.equal(ORIGIN_MASTER, 'refs/remotes/origin/master');
    const merge = fs.readFileSync(path.join(ROOT, 'scripts/merge.sh'), 'utf8');
    assert.match(merge, /git fetch -q origin \+refs\/heads\/master:refs\/remotes\/origin\/master/);
});

// --- What step 5 compares ---------------------------------------------------------------------

// The local modules a script imports, and theirs, as repo-relative paths (as guarded-paths.test.mjs).
function importClosure(entries) {
    const seen = new Set();
    const visit = file => {
        if (seen.has(file)) return;
        seen.add(file);
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const [, spec] of text.matchAll(/^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"](\.\.?\/[^'"]+)['"]/gm)) {
            visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
        }
    };
    entries.forEach(visit);
    return [...seen];
}

test('RELEASE_TOOLING is release.sh, the calendar, release.mjs and every module it imports', () => {
    const expected = [...importClosure(['scripts/release.mjs']), 'scripts/release.sh', 'scripts/release-calendar.json'].sort();
    assert.deepEqual([...RELEASE_TOOLING].sort(), expected);
    assert.ok(RELEASE_TOOLING.includes('scripts/release-origin.mjs'), 'and this check itself');
    for (const file of RELEASE_TOOLING) assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} exists`);
});
