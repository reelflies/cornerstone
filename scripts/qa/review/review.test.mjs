// The review-page generator end to end (scripts/qa/review/review.mjs; W0-10), on a scratch
// repository. RF_REVIEW_ENCODER=copy keeps the screenshots as PNGs, so this runs in CI,
// which has no browser; images.test.mjs covers the real encoder.
//
//   node --test scripts/qa/review/review.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = path.resolve('scripts/qa/review/review.mjs');
const PNG = fs.readFileSync(path.resolve('scripts/qa/baselines/selftest/blocks-phone-375-darwin.png'));
const HOME = 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';
const NOT_FOUND = 'scripts/qa/baselines/1895766-reelflies-ca/404-phone-375-darwin.png';

let repo;
const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
};
const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
};
const commit = message => {
    git('add', '-A');
    git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-q', '-m', message);
};
const review = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, '--root', repo, ...args], {
    encoding: 'utf8', env: { ...process.env, RF_REVIEW_ENCODER: 'copy', ...env },
});
const out = name => path.join(repo, 'scripts/qa/results/review', name);
const shot = (page, baseline, reference) => ({
    kind: 'theme', page, path: '/', project: 'phone-375', width: 375, channel: '1895766', variation: 'ReelFlies CA', overlay: null, state: null, baseline, reference, status: 'passed', actual: null,
});

before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-review-cli-'));
    git('init', '-q', '-b', 'master');
    write('.gitignore', 'scripts/qa/results/\n');
    write(HOME, PNG);
    write(NOT_FOUND, PNG);
    commit('Stock baselines (ticket 16)');
    write('scripts/qa/results/reference/home-phone-375.png', Buffer.concat([PNG, Buffer.from('reference')]));
    write('scripts/qa/results/manifest.json', JSON.stringify({
        version: 1,
        updated: '2026-10-06T12:00:00.000Z',
        entries: [
            { ...shot('home', HOME, 'home'), commit: git('rev-parse', 'HEAD') },
            { ...shot('404', NOT_FOUND, null), commit: git('rev-parse', 'HEAD') },
            {
                kind: 'reference', anchor: 'home', screen: 'home', hash: '#home', project: 'phone-375', width: 375, image: 'scripts/qa/results/reference/home-phone-375.png', status: 'passed',
            },
        ],
    }));
    write('notes.json', JSON.stringify({ title: 'Wave 0: the stock before set', defaults: [{ ticket: 'W0-10', text: 'Onest headings on the reference' }] }));
});

describe('the first checkpoint', () => {
    it('writes review-00, its local preview and its images, and says where', () => {
        const run = review(['--input', path.join(repo, 'notes.json')]);
        assert.equal(run.status, 0, run.stderr + run.stdout);
        const html = fs.readFileSync(path.join(out('review-00'), 'index.html'), 'utf8');
        assert.match(html, /<title>ReelFlies review-00<\/title>/);
        assert.match(html, /Wave 0: the stock before set/);
        assert.match(html, /first checkpoint/i);
        assert.match(fs.readFileSync(path.join(out('review-00'), 'preview.html'), 'utf8'), /^<!doctype html>/);
        const images = fs.readdirSync(path.join(out('review-00'), 'images'));
        assert.equal(images.length, 2); // home and its reference; the 404's baseline is the same PNG, stored once
        for (const image of images) assert.match(html, new RegExp(`src="images/${image.replace('.', '\\.')}"`));
        assert.match(run.stdout, /review-00[/\\]index\.html/);
        assert.match(run.stdout, /under the 16,000,000 B limit/);
    });

    it('can put the images inside the page instead', () => {
        const run = review(['--name', 'review-00', '--out', out('inline'), '--inline']);
        assert.equal(run.status, 0, run.stderr + run.stdout);
        const html = fs.readFileSync(path.join(out('inline'), 'index.html'), 'utf8');
        assert.match(html, /src="data:image\/png;base64,/);
        assert.equal(fs.existsSync(path.join(out('inline'), 'images')), false);
    });
});

describe('a later checkpoint', () => {
    it('is numbered after the last tag and shows each changed baseline before and after, by ticket', () => {
        git('tag', 'review-00');
        write(HOME, Buffer.concat([PNG, Buffer.from('changed')]));
        commit('Skin the header (ticket 25)');
        const run = review([]);
        assert.equal(run.status, 0, run.stderr + run.stdout);
        const html = fs.readFileSync(path.join(out('review-01'), 'index.html'), 'utf8');
        assert.match(html, /since review-00/);
        assert.match(html, /Ticket 25/);
        assert.match(html, />Before</);
        assert.match(html, />After</);
        assert.match(html, /<summary>1 direct commit merged since review-00, for 1 ticket<\/summary>/);
        assert.match(run.stdout, /then tag the checkpoint: git tag review-01 /);
    });

    it('regenerates a tagged checkpoint only from the commit its tag is on', () => {
        const run = review(['--name', 'review-00']);
        assert.equal(run.status, 2, run.stderr + run.stdout);
        assert.match(run.stderr, /review-00 is tagged at [0-9a-f]{8}, and this checkout is at [0-9a-f]{8}/);
        assert.match(run.stderr, /--root/);
    });

    it('regenerates a tagged checkpoint from its tag\'s commit, covering the range up to its tag, with no tag to cut', () => {
        git('checkout', '-q', 'review-00');
        try {
            const run = review(['--name', 'review-00']);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.doesNotMatch(run.stdout, /git tag review-00/);
            assert.match(run.stdout, /review-00 is already tagged at [0-9a-f]{8}: republish it in place/);
        } finally {
            git('checkout', '-q', 'master');
        }
    });
});

describe('PR mode', () => {
    it('writes a local side-by-side page of the working tree\'s changed baselines against the base', () => {
        write(NOT_FOUND, Buffer.concat([PNG, Buffer.from('pr change')]));
        try {
            const run = review(['--pr', '12', '--base', 'master']);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            const html = fs.readFileSync(path.join(out('pr-12'), 'index.html'), 'utf8');
            assert.match(html, /never published/i);
            assert.match(html, /404/);
            assert.match(run.stdout, /pr-12[/\\]index\.html/);
        } finally {
            git('checkout', '-q', '--', NOT_FOUND);
        }
    });
});

describe('refusals', () => {
    it('stops when no screenshot run has written the manifest', () => {
        const run = review(['--manifest', path.join(repo, 'nowhere.json')]);
        assert.equal(run.status, 1);
        assert.match(run.stderr, /no screenshot manifest.*npm run qa:screens/is);
    });

    it('stops on checkpoint notes with a mistyped section', () => {
        write('bad.json', JSON.stringify({ defualts: [] }));
        const run = review(['--input', path.join(repo, 'bad.json')]);
        assert.equal(run.status, 2);
        assert.match(run.stderr, /unknown key "defualts"/);
    });

    it('stops on an option it doesn\'t know', () => {
        const run = review(['--publish']);
        assert.equal(run.status, 2);
        assert.match(run.stderr, /--publish/);
    });
});
