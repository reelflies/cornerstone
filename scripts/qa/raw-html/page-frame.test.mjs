// Tests for ticket 25's page-frame assertions (spec Testing Decisions, seam 2): exactly one
// <main>, the shared live region empty in the server HTML, and the icon sheet first in <body>.
// CI runs them through `npm run test:scripts`.
//
//   node --test scripts/qa/raw-html/page-frame.test.mjs

import fs from 'fs';
import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../raw-html.mjs';

const FIXTURES = path.resolve('scripts/qa/raw-html/fixtures');
const page = (html, kind = 'home') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3301/', status: kind === '404' ? 404 : 200, html,
});
const FRAME = fs.readFileSync(path.join(FIXTURES, 'page-frame.html'), 'utf8');
const SHEET = /<svg class="rf-icons[^>]*>[\s\S]*?<\/svg>\n\s*/;
const REGION = '<div class="is-srOnly" role="status" aria-live="polite" aria-atomic="true" data-rf-live-region></div>';

let assertions;
before(async () => {
    assertions = await loadAssertions();
});

const result = (html, id, kind) => checkPage(page(html, kind), assertions).find(entry => entry.id === id);
const failed = html => checkPage(page(html), assertions).filter(entry => entry.status === 'fail').map(entry => entry.id);

describe('the page-frame assertions', () => {
    it('are registered', () => {
        const ids = assertions.map(assertion => assertion.id);
        for (const id of ['one-main', 'rf-live-region', 'rf-icon-sheet']) assert.ok(ids.includes(id), `${id} is registered`);
    });

    it('pass a page with one <main>, the empty live region and the icon sheet first in <body>', () => {
        assert.deepEqual(failed(FRAME), []);
    });

    it('apply to every page kind, the 404 page included', () => {
        for (const kind of ['home', 'product', 'category', 'brand', 'cart', '404']) {
            for (const id of ['one-main', 'rf-live-region', 'rf-icon-sheet']) {
                assert.equal(result(FRAME, id, kind).status, 'pass', `${id} on ${kind}`);
            }
        }
    });
});

describe('one-main', () => {
    it('fails a page with no <main>, as stock home, product and cart pages were', () => {
        const html = FRAME.replace('<main class="body"', '<div class="body"').replace('</main>', '</div>');
        const { status, problems } = result(html, 'one-main');
        assert.equal(status, 'fail');
        assert.match(problems[0], /0 main landmarks/);
    });

    it('fails a page with two, as an unconditional <main> round a template with its own would make', () => {
        const html = FRAME.replace('<div class="container">', '<div class="container"><main class="page">').replace('</div>\n        </main>', '</main></div>\n        </main>');
        const { status, problems } = result(html, 'one-main');
        assert.equal(status, 'fail');
        assert.match(problems[0], /2 main landmarks/);
    });

    it('counts role="main" as a main landmark, once per element', () => {
        assert.equal(result(FRAME.replace('<main class="body"', '<main role="main" class="body"'), 'one-main').status, 'pass');
        assert.equal(result(FRAME.replace('<header class="header"', '<header role="main" class="header"'), 'one-main').status, 'fail');
    });

    it('ignores <main> in comments and scripts', () => {
        // The fixture has one in a comment and one in a script string.
        assert.equal(result(FRAME, 'one-main').status, 'pass');
    });
});

describe('rf-live-region', () => {
    it('fails a page without the region', () => {
        const { status, problems } = result(FRAME.replace(REGION, ''), 'rf-live-region');
        assert.equal(status, 'fail');
        assert.match(problems[0], /no live region/);
    });

    it('fails a page with two', () => {
        const { status, problems } = result(FRAME.replace(REGION, REGION + REGION), 'rf-live-region');
        assert.equal(status, 'fail');
        assert.match(problems[0], /2 live regions/);
    });

    it('fails a region that isn\'t empty in the server HTML, because a screen reader reads it at load', () => {
        const { status, problems } = result(FRAME.replace(REGION, REGION.replace('></div>', '>3 results</div>')), 'rf-live-region');
        assert.equal(status, 'fail');
        assert.match(problems[0], /isn't empty/);
    });

    it('fails a region without role="status"', () => {
        const { status, problems } = result(FRAME.replace(REGION, REGION.replace(' role="status"', '')), 'rf-live-region');
        assert.equal(status, 'fail');
        assert.match(problems[0], /role="status"/);
    });
});

describe('rf-icon-sheet', () => {
    it('fails a page without the sheet', () => {
        const { status, problems } = result(FRAME.replace(SHEET, ''), 'rf-icon-sheet');
        assert.equal(status, 'fail');
        assert.match(problems[0], /no ReelFlies icon sheet/);
    });

    it('fails a page with the sheet twice', () => {
        const sheet = FRAME.match(SHEET)[0];
        const { status, problems } = result(FRAME.replace(sheet, sheet + sheet), 'rf-icon-sheet');
        assert.equal(status, 'fail');
        assert.match(problems[0], /2 ReelFlies icon sheets/);
    });

    it('fails a sheet that isn\'t the first element in <body>', () => {
        const sheet = FRAME.match(SHEET)[0];
        const html = FRAME.replace(sheet, '').replace('<footer', `${sheet}<footer`);
        const { status, problems } = result(html, 'rf-icon-sheet');
        assert.equal(status, 'fail');
        assert.match(problems[0], /first element in <body>/);
    });

    it('fails a sheet that screen readers could reach', () => {
        const { status, problems } = result(FRAME.replace(' aria-hidden="true" focusable="false">', '>'), 'rf-icon-sheet');
        assert.equal(status, 'fail');
        assert.match(problems[0], /aria-hidden="true"/);
    });
});
