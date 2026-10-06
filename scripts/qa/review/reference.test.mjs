// The reference screens (scripts/qa/review/reference.mjs; W0-10): which screens of the
// "ReelFlies Hook Gauge" reference page each theme template is compared with, and how the
// page is set before it is shot.
//
//   node --test scripts/qa/review/reference.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    REFERENCE_ANCHORS, REFERENCE_SETTINGS, findReferenceHtml, referenceFor, referenceViewport, wrapReference,
} from './reference.mjs';

describe('the reference anchors', () => {
    it('cover every storefront screen of the reference page', () => {
        const screens = new Set(REFERENCE_ANCHORS.map(anchor => anchor.screen));
        for (const screen of ['home', 'category', 'hook-size-chart', 'flies-by-species', 'product', 'cart']) assert.ok(screens.has(screen), screen);
    });

    it('each have a unique id, a hash route and a label', () => {
        const ids = REFERENCE_ANCHORS.map(anchor => anchor.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const anchor of REFERENCE_ANCHORS) {
            assert.match(anchor.hash, /^#[a-z0-9/-]+$/, anchor.id);
            assert.ok(anchor.label, anchor.id);
        }
    });

    it('match the screens in the reference page itself, when it is on this Mac', { skip: !findReferenceHtml() && 'no reference page here' }, () => {
        const html = fs.readFileSync(findReferenceHtml(), 'utf8');
        const inPage = new Set([...html.matchAll(/data-screen="([^"]+)"/g)].map(match => match[1]));
        inPage.delete('evaluation'); // the design notes, not a storefront screen
        assert.deepEqual([...inPage].sort(), [...new Set(REFERENCE_ANCHORS.map(anchor => anchor.screen))].sort());
    });
});

describe('the reference screen for a theme template', () => {
    it('is the screen of the same name', () => {
        for (const template of ['home', 'product', 'cart', 'brand', 'fly-type', 'species', 'species-hub', 'hook-chart']) assert.equal(referenceFor(template), template);
    });

    it('is the Fly Type page for the stock category template, which ticket 32 turns into one', () => {
        assert.equal(referenceFor('category'), 'fly-type');
    });

    it('is none for the 404 page and for templates the reference doesn\'t draw', () => {
        assert.equal(referenceFor('404'), null);
        assert.equal(referenceFor('contact-us'), null);
    });

    it('goes by the page kind of a kind@name pin (W0-8)', () => {
        assert.equal(referenceFor('product@sold-out'), 'product');
    });
});

describe('setting up the reference page', () => {
    it('uses Onest for headings and leaves the fly-type links row off (W0-10)', () => {
        assert.equal(REFERENCE_SETTINGS.headFace, 'onest');
        assert.equal(REFERENCE_SETTINGS.linksToggle, false);
    });

    it('widens the desktop viewport so the store frame is 1280 px, past the stage\'s gutters', () => {
        assert.deepEqual(referenceViewport(1280), { width: 1312, height: 900 });
        assert.deepEqual(referenceViewport(375), { width: 375, height: 812 });
    });

    it('wraps the page in the publish skeleton, as claude.ai does', () => {
        const wrapped = wrapReference('<title>ReelFlies Hook Gauge</title><div id="frame"></div>');
        assert.match(wrapped, /^<!doctype html>/);
        assert.match(wrapped, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
        assert.match(wrapped, /<body><title>ReelFlies Hook Gauge<\/title><div id="frame"><\/div><\/body><\/html>$/);
    });
});

describe('finding the reference page', () => {
    const tree = () => {
        const top = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-ref-'));
        fs.mkdirSync(path.join(top, 'plan', 'design'), { recursive: true });
        fs.mkdirSync(path.join(top, 'worktrees', 'w0-10-review-page'), { recursive: true });
        fs.writeFileSync(path.join(top, 'plan', 'design', 'reelflies-reference.html'), '<title>x</title>');
        return top;
    };

    it('looks in plan/design above the checkout, from the main clone or a worktree', () => {
        const top = tree();
        const found = path.join(top, 'plan', 'design', 'reelflies-reference.html');
        assert.equal(findReferenceHtml({ env: {}, root: path.join(top, 'worktrees', 'w0-10-review-page') }), found);
        assert.equal(findReferenceHtml({ env: {}, root: path.join(top, 'cornerstone') }), found);
    });

    it('takes QA_REFERENCE_HTML first', () => {
        const top = tree();
        const own = path.join(top, 'own.html');
        fs.writeFileSync(own, '');
        assert.equal(findReferenceHtml({ env: { QA_REFERENCE_HTML: own }, root: top }), own);
    });

    it('finds nothing in CI, where the plan folder isn\'t checked out', () => {
        const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-ref-bare-'));
        assert.equal(findReferenceHtml({ env: {}, root: path.join(bare, 'repo') }), null);
    });

    it('stops on a QA_REFERENCE_HTML that doesn\'t exist, instead of shooting another page', () => {
        assert.throws(() => findReferenceHtml({ env: { QA_REFERENCE_HTML: '/nowhere/ref.html' }, root: '/' }), /QA_REFERENCE_HTML/);
    });
});
