// What the review page reads from git (scripts/qa/review/git.mjs; W0-10): the checkpoint
// tags, the baselines changed since the last one, and the ticket each change belongs to.
//
//   node --test scripts/qa/review/git.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    changedBaselines, checkpointTags, headInfo, latestCheckpoint, mergedSince, nextCheckpointName, parseBaselinePath, showFile, tagCommit, ticketsOf,
} from './git.mjs';

describe('the ticket a commit belongs to', () => {
    it('comes from the house title, "(ticket NN)" or "(W0-n)"', () => {
        assert.deepEqual(ticketsOf('Hide widget regions in page baselines (ticket 16)'), ['16']);
        assert.deepEqual(ticketsOf('Add the review-page generator (W0-10)'), ['W0-10']);
        assert.deepEqual(ticketsOf('Build the size pills (tickets 37 and 38)'), ['37', '38']);
        assert.deepEqual(ticketsOf('Skin tokens (ticket 25, W0-8)'), ['25', 'W0-8']);
        assert.deepEqual(ticketsOf('Pad a short number (ticket 5)'), ['05']);
    });

    it('is none when the title names none', () => {
        assert.deepEqual(ticketsOf('Merge pull request #12 from reelflies/t25/skin'), []);
        assert.deepEqual(ticketsOf('Fix a typo'), []);
    });
});

describe('checkpoint names', () => {
    it('start at review-00 and count up from the newest tag', () => {
        assert.equal(nextCheckpointName([]), 'review-00');
        assert.equal(nextCheckpointName(['review-00']), 'review-01');
        assert.equal(nextCheckpointName(['review-09', 'review-10', 'review-02']), 'review-11');
    });

    it('take the newest tag as the last checkpoint', () => {
        assert.equal(latestCheckpoint([]), null);
        assert.equal(latestCheckpoint(['review-02', 'review-10', 'review-09']), 'review-10');
    });
});

describe('a baseline\'s path', () => {
    it('names its channel, variation set, page and width', () => {
        assert.deepEqual(parseBaselinePath('scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png'), {
            set: '1895766-reelflies-ca', channel: '1895766', page: 'home', project: 'phone-375', width: 375, platform: 'darwin',
        });
        assert.deepEqual(parseBaselinePath('scripts/qa/baselines/1-reelflies-ca/product@sold-out-desktop-1280-darwin.png'), {
            set: '1-reelflies-ca', channel: '1', page: 'product@sold-out', project: 'desktop-1280', width: 1280, platform: 'darwin',
        });
    });

    it('is null for files that aren\'t page baselines', () => {
        assert.equal(parseBaselinePath('scripts/qa/baselines/selftest/blocks-phone-375-darwin.png').channel, null);
        assert.equal(parseBaselinePath('scripts/qa/README.md'), null);
    });
});

describe('a repository with checkpoints', () => {
    let repo;
    const run = (...args) => {
        const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
    };
    const write = (file, content) => {
        fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        fs.writeFileSync(path.join(repo, file), content);
    };
    const commit = message => {
        run('add', '-A');
        run('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-q', '-m', message);
        return run('rev-parse', 'HEAD');
    };
    const HOME = 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';
    const CART = 'scripts/qa/baselines/1895766-reelflies-ca/cart-phone-375-darwin.png';
    const PRODUCT = 'scripts/qa/baselines/1-reelflies-ca/product-desktop-1280-darwin.png';
    let skinSha;
    let epochSha;

    before(() => {
        repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-review-git-'));
        run('init', '-q', '-b', 'master');
        write(HOME, 'home v1');
        write(CART, 'cart v1');
        write('README.md', 'x');
        commit('Stock baselines (ticket 16)');
        run('tag', 'review-00');
        write(HOME, 'home v2');
        write('README.md', 'y');
        skinSha = commit('Skin the header (ticket 25)');
        write(PRODUCT, 'product v1');
        commit('Pin a stable product (W0-5)');
        write(CART, 'cart v2');
        epochSha = commit('Re-baseline epoch: the hero widget on 1895766');
        run('rm', '-q', CART);
        commit('Drop the cart pin (ticket 41)');
    });

    it('lists its checkpoint tags', () => {
        assert.deepEqual(checkpointTags({ cwd: repo }), ['review-00']);
    });

    it('lists each baseline changed since the checkpoint, with the commits that changed it', () => {
        const changes = changedBaselines({ since: 'review-00', cwd: repo });
        assert.deepEqual(changes.map(change => [change.path, change.status]), [
            [PRODUCT, 'A'],
            [CART, 'D'],
            [HOME, 'M'],
        ]);
        const home = changes.find(change => change.path === HOME);
        assert.deepEqual(home.commits.map(({ sha, subject }) => [sha, subject]), [[skinSha, 'Skin the header (ticket 25)']]);
        const cart = changes.find(change => change.path === CART);
        assert.deepEqual(cart.commits.map(({ sha }) => sha).slice(1), [epochSha]);
        assert.equal(cart.before.ref, 'review-00');
        assert.equal(cart.after, null);
        assert.equal(home.after.ref, 'HEAD');
    });

    it('reads a baseline as it was at a ref', () => {
        assert.equal(showFile('review-00', HOME, { cwd: repo }).toString(), 'home v1');
        assert.equal(showFile('HEAD', HOME, { cwd: repo }).toString(), 'home v2');
        assert.equal(showFile('review-00', PRODUCT, { cwd: repo }), null);
    });

    it('compares a working tree with a base, new untracked baselines included (PR mode)', () => {
        write(HOME, 'home v3, not committed');
        write('scripts/qa/baselines/1895766-reelflies-ca/brand-phone-375-darwin.png', 'new');
        try {
            const changes = changedBaselines({ since: 'HEAD', until: null, cwd: repo });
            assert.deepEqual(changes.map(change => [change.path, change.status]), [
                ['scripts/qa/baselines/1895766-reelflies-ca/brand-phone-375-darwin.png', 'A'],
                [HOME, 'M'],
            ]);
            assert.equal(changes[1].after.ref, null);
        } finally {
            run('checkout', '-q', '--', HOME);
            fs.rmSync(path.join(repo, 'scripts/qa/baselines/1895766-reelflies-ca/brand-phone-375-darwin.png'));
        }
    });

    it('gives each commit the baseline\'s status in it, oldest change last', () => {
        const cart = changedBaselines({ since: 'review-00', cwd: repo }).find(change => change.path === CART);
        assert.deepEqual(cart.commits.map(({ status }) => status), ['D', 'M']);
    });

    it('finds the commit a checkpoint tag is on, and nothing for a tag that isn\'t there', () => {
        assert.equal(tagCommit('review-00', { cwd: repo }), run('rev-list', '-n', '1', 'review-00'));
        assert.equal(tagCommit('review-07', { cwd: repo }), null);
    });

    it('describes the head it renders', () => {
        const head = headInfo({ cwd: repo });
        assert.match(head.sha, /^[0-9a-f]{40}$/);
        assert.equal(head.short, head.sha.slice(0, 8));
        assert.equal(head.branch, 'master');
        assert.equal(head.dirty, false);
    });
});

describe('a repository whose tickets merge through PRs', () => {
    let repo;
    const run = (...args) => {
        const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
    };
    const write = (file, content) => {
        fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        fs.writeFileSync(path.join(repo, file), content);
    };
    const commit = (...messages) => {
        run('add', '-A');
        run('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-q', ...messages.flatMap(message => ['-m', message]));
        return run('rev-parse', 'HEAD');
    };
    // A branch with one commit, merged as GitHub's merge button does it.
    const pr = (number, branch, file, content, messages, title) => {
        run('checkout', '-q', '-b', branch);
        write(file, content);
        const sha = commit(...messages);
        run('checkout', '-q', 'master');
        run('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'merge', '-q', '--no-ff', branch, '-m', `Merge pull request #${number} from reelflies/${branch}`, '-m', title);
        return sha;
    };
    const HOME = 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';
    const shas = {};

    before(() => {
        repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-review-merges-'));
        run('init', '-q', '-b', 'master');
        write(HOME, 'home v1');
        commit('Stock baselines (ticket 16)');
        run('tag', 'review-00');
        shas.skin = pr(20, 't25/skin', HOME, 'home v2', ['Skin the header (ticket 25)'], 'Skin foundation');
        shas.epoch = pr(21, 'epoch/hero', HOME, 'home v3', ['Re-baseline the home page', 'Baselines: epoch The hero widget applied on 1895766 (ticket 46)'], 'Re-baseline epoch: the hero widget');
        shas.header = pr(22, 't27/header', HOME, 'home v4', ['Build the shipping strip (ticket 27)'], 'Header and shipping strip');
        pr(23, 't17/lighthouse', 'scripts/lighthouse.mjs', 'x', ['Add the Lighthouse budgets (ticket 17)'], 'Lighthouse budgets');
        write('README.md', 'a direct fix');
        commit('Fix a typo in the README (W0-13)');
    });

    it('lists a baseline\'s commits in the order they landed, each with its message body', () => {
        const [home] = changedBaselines({ since: 'review-00', cwd: repo });
        assert.deepEqual(home.commits.map(({ sha }) => sha), [shas.header, shas.epoch, shas.skin]);
        assert.match(home.commits[1].body, /^Baselines: epoch The hero widget applied on 1895766 \(ticket 46\)$/m);
        assert.deepEqual(home.commits.map(({ status }) => status), ['M', 'M', 'M']);
    });

    it('lists everything merged since a checkpoint, oldest first, with the tickets its commits name', () => {
        const merged = mergedSince({ since: 'review-00', cwd: repo });
        assert.deepEqual(merged.map(({ pr: number, title, tickets }) => [number, title, tickets]), [
            ['20', 'Skin foundation', ['25']],
            ['21', 'Re-baseline epoch: the hero widget', []],
            ['22', 'Header and shipping strip', ['27']],
            ['23', 'Lighthouse budgets', ['17']],
            [null, 'Fix a typo in the README (W0-13)', ['W0-13']],
        ]);
        assert.match(merged[0].sha, /^[0-9a-f]{40}$/);
    });

    it('lists nothing merged when the checkpoint is the head', () => {
        assert.deepEqual(mergedSince({ since: 'HEAD', cwd: repo }), []);
    });
});
