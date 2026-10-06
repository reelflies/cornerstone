// The review page's HTML (scripts/qa/review/render.mjs; W0-10). The orchestrator publishes
// a checkpoint page as a private claude.ai artifact, so the page follows the artifact page
// contract: content only (claude.ai wraps it in its own document), a title in the first
// 8 KB, colours as tokens with a dark theme, and nothing loaded from outside but Google Fonts.
//
//   node --test scripts/qa/review/render.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckpointModel, buildPrModel } from './model.mjs';
import { renderReviewPage, wrapDocument } from './render.mjs';

const HEAD = {
    sha: 'e48d369a0000000000000000000000000000beef', short: 'e48d369a', branch: 'master', dirty: false,
};
const shot = (page, width, extra = {}) => ({
    kind: 'theme',
    page,
    path: '/',
    project: width === 375 ? 'phone-375' : 'desktop-1280',
    width,
    channel: '1895766',
    variation: 'ReelFlies CA',
    overlay: null,
    state: null,
    baseline: `scripts/qa/baselines/1895766-reelflies-ca/${page}-${width}.png`,
    reference: page === '404' ? null : page,
    status: 'passed',
    commit: HEAD.sha,
    ...extra,
});
const ref = (anchor, width) => ({
    kind: 'reference', anchor, project: width === 375 ? 'phone-375' : 'desktop-1280', width, image: `ref/${anchor}-${width}.png`, status: 'passed',
});
const manifest = {
    version: 1,
    entries: [shot('home', 375), shot('home', 1280), shot('404', 375), ref('home', 375), ref('home', 1280), ref('cart', 375)],
};
const href = image => `images/${image.path.replace(/\W+/g, '-')}.webp`;
const PINNED = { 1895766: { pages: { home: '/', 404: '/rf-qa-missing-page/' } }, 1855224: { pages: { home: '/' } } };
const page = (input = {}, extra = {}) => renderReviewPage(buildCheckpointModel({
    name: 'review-00', since: null, head: HEAD, manifest, changes: [], input, generatedAt: '2026-10-06T12:00:00.000Z', pinned: PINNED, ...extra,
}), { href });
const HOME = 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';

describe('a checkpoint page', () => {
    it('has the seven sections in the order W0-10 sets', () => {
        const html = page();
        const order = ['id="for-shaun"', 'id="defaults"', 'id="templates"', 'id="before-after"', 'id="com"', 'id="live-home"', 'id="waiting"'];
        const at = order.map(marker => html.indexOf(marker));
        assert.ok(at.every(index => index > 0), `missing: ${order.filter((marker, i) => at[i] < 0).join(', ')}`);
        assert.deepEqual([...at].sort((a, b) => a - b), at);
    });

    it('is named by its checkpoint in a <title> within the first 8 KB, and is content only', () => {
        const html = page();
        assert.match(html.slice(0, 8192), /<title>ReelFlies review-00<\/title>/);
        assert.doesNotMatch(html, /<!doctype|<html|<head>|<body/i);
    });

    it('sets every colour as a token, with a dark theme for both ways the viewer can ask for one', () => {
        const html = page();
        assert.match(html, /:root\s*{[^}]*--bg:/);
        assert.match(html, /@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)/);
        assert.match(html, /:root\[data-theme="dark"\]/);
        assert.match(html, /body\s*{[^}]*background:\s*var\(--bg\)/);
    });

    it('loads nothing from outside but Google Fonts', () => {
        const html = page();
        const external = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map(match => match[1]);
        assert.deepEqual(external.filter(url => !/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(url)), []);
        assert.doesNotMatch(html, /<script[^>]+src=/);
    });

    it('shows each template beside its reference screen through the image hrefs it is given', () => {
        const html = page();
        assert.match(html, /src="images\/scripts-qa-baselines-1895766-reelflies-ca-home-375-png\.webp"/);
        assert.match(html, /src="images\/ref-home-375-png\.webp"/);
    });

    it('says "No reference screen" for the 404 page', () => {
        assert.match(page(), /No reference screen/);
    });

    it('says when a section has nothing in it', () => {
        const html = page();
        assert.match(html, /id="for-shaun"[\s\S]*Nothing is waiting for you/);
        assert.match(html, /id="before-after"[\s\S]*first checkpoint/i);
    });

    it('escapes the notes it is given', () => {
        const html = page({ defaults: [{ ticket: 'W0-10', text: '<script>alert(1)</script> & more' }] });
        assert.doesNotMatch(html, /<script>alert/);
        assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; more/);
    });

    it('marks every default as revisitable', () => {
        assert.match(page({ defaults: [{ ticket: 'W0-10', text: 'Onest headings' }] }), /Revisitable/);
    });

    it('names the commit it was made from', () => {
        assert.match(page(), /e48d369a/);
    });

    it('lists every PR merged since the last checkpoint, by ticket with its wave', () => {
        const html = page({ tickets: { 25: { wave: '1', title: 'Skin foundation' } } }, {
            since: 'review-00',
            merged: [{
                sha: 'a'.repeat(40), pr: '20', title: 'Skin the header', tickets: ['25'],
            }, {
                sha: 'b'.repeat(40), pr: '23', title: 'Lighthouse <budgets>', tickets: ['17'],
            }],
        });
        const masthead = html.slice(0, html.indexOf('id="for-shaun"'));
        assert.match(masthead, /<summary>2 PRs merged since review-00, for 2 tickets<\/summary>/);
        const direct = page({}, {
            since: 'review-00',
            merged: [{
                sha: 'c'.repeat(40), pr: null, title: 'Fix a typo (W0-13)', tickets: ['W0-13'],
            }],
        });
        assert.match(direct, /<summary>1 direct commit merged since review-00, for 1 ticket<\/summary>/);
        assert.match(direct, /<code>cccccccc<\/code> Fix a typo/);
        assert.match(masthead, /Ticket 25[\s\S]*Skin foundation[\s\S]*Wave 1[\s\S]*#20<\/code> Skin the header/);
        assert.match(masthead, /Lighthouse &lt;budgets&gt;/);
    });

    it('shows a baseline that several owners changed as one before and after each, labelled by commit', () => {
        const T25 = 'a25'.padEnd(40, '0');
        const html = page({ epochs: [{ commit: 'bbbbbbb', cause: 'The hero widget' }] }, {
            since: 'review-00',
            changes: [{
                path: HOME,
                status: 'M',
                commits: [{ sha: 'bbbbbbb'.padEnd(40, '0'), subject: 'Re-baseline', status: 'M' }, { sha: T25, subject: 'Skin (ticket 25)', status: 'M' }],
                before: { ref: 'review-00', path: HOME },
                after: { ref: 'HEAD', path: HOME },
            }],
        });
        assert.match(html, /Ticket 25[\s\S]*Change 1 of 2[\s\S]*<b>Before<\/b> review-00[\s\S]*<b>After<\/b> a2500000/);
        assert.match(html, /Re-baseline epochs[\s\S]*The hero widget[\s\S]*Change 2 of 2[\s\S]*<b>Before<\/b> a2500000[\s\S]*<b>After<\/b> e48d369a/);
    });

    it('calls a failed shot with no render a failure, and one with a render a difference', () => {
        const failing = (actual, error) => ({ version: 1, entries: [shot('home', 375, { status: 'failed', actual, error })] });
        assert.match(page({}, { manifest: failing(null, 'HTTP 502') }), /chip fail">failed in the last run</);
        assert.match(page({}, { manifest: failing('scripts/qa/results/manifest-actual/home.png') }), /chip fail">differs from its baseline</);
    });

    it('says how to make the .com renders when there are none', () => {
        const html = page();
        const com = html.slice(html.indexOf('id="com"'), html.indexOf('id="live-home"'));
        assert.match(com, /QA_CHANNEL=1855224 QA_VARIATION='ReelFlies US' npx playwright test --config scripts\/qa\/playwright\.config\.mjs review-live/);
        assert.match(com, /once W0-6 has landed/);
    });
});

describe('a local preview', () => {
    it('wraps the page in the same document claude.ai adds when it publishes', () => {
        const doc = wrapDocument('<title>x</title><p>y</p>');
        assert.match(doc, /^<!doctype html>\n<html lang="en">/);
        assert.match(doc, /viewport-fit=cover/);
        assert.match(doc, /<body>\n<title>x<\/title><p>y<\/p>\n<\/body>/);
    });
});

describe('a PR page', () => {
    const prPage = changes => renderReviewPage(buildPrModel({
        pr: {
            label: 'PR #12', branch: 't25/skin', base: 'origin/master', mergeBase: 'abc12345',
        },
        head: HEAD,
        manifest,
        changes,
        generatedAt: '2026-10-06T12:00:00.000Z',
    }), { href });

    it('says it is local and never published', () => {
        const html = prPage([]);
        assert.match(html, /<title>ReelFlies PR #12 baselines<\/title>/);
        assert.match(html, /never published/i);
        assert.match(html, /changes no baseline/);
    });

    it('shows each changed baseline before, after and beside its reference screen', () => {
        const html = prPage([{
            path: 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png', status: 'M', commits: [], before: { ref: 'abc12345', path: 'p' }, after: { ref: null, path: 'p' },
        }]);
        assert.match(html, />Before</);
        assert.match(html, />After</);
        assert.match(html, />Reference</);
    });
});
