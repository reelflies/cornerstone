// Tests for ticket 25's page-frame assertions (spec Testing Decisions, seam 2), as the Streamside
// Stone redesign renders the frame: exactly one <main>, the shared live region empty in the
// server HTML (header.html, after the phone drawer), and the icon sheet (svg.rf-icon-sheet) once,
// before the first icon drawn from it, holding every icon the page draws. The fixture page is a
// Web Page in the redesign's skin (fixtures/page-frame.html, modelled on the dev server's
// /about-us/ of 2026-11-08). CI runs them through `npm run test:scripts`.
//
//   node --test scripts/qa/raw-html/page-frame.test.mjs

import fs from 'fs';
import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../raw-html.mjs';

const FIXTURES = path.resolve('scripts/qa/raw-html/fixtures');
const page = (html, kind = 'page') => ({
    kind, key: kind, path: '/about-us/', url: 'http://localhost:3301/about-us/', status: kind === '404' ? 404 : 200, html,
});
const FRAME = fs.readFileSync(path.join(FIXTURES, 'page-frame.html'), 'utf8');
const SHEET = /<svg class="rf-icon-sheet"[^>]*>[\s\S]*?<\/svg>\n/;
const REGION = '<div class="is-srOnly" role="status" aria-live="polite" aria-atomic="true" data-rf-live-region></div>';

let assertions;
before(async () => {
    assertions = await loadAssertions();
});

const result = (html, id, kind) => checkPage(page(html, kind), assertions).find(entry => entry.id === id);
const failed = html => checkPage(page(html), assertions).filter(entry => entry.status === 'fail').map(entry => entry.id);
const fails = (html, id, pattern) => {
    const { status, problems } = result(html, id);
    assert.equal(status, 'fail', `${id} fails`);
    assert.match(problems.join('\n'), pattern);
};

describe('the page-frame assertions', () => {
    it('are registered', () => {
        const ids = assertions.map(assertion => assertion.id);
        for (const id of ['one-main', 'rf-live-region', 'rf-icon-sheet']) assert.ok(ids.includes(id), `${id} is registered`);
    });

    it('pass a page with one <main>, the empty live region after the drawer and the icon sheet at the top of the header', () => {
        assert.deepEqual(failed(FRAME), []);
    });

    it('apply to every page kind, the 404 page included', () => {
        for (const kind of ['home', 'product', 'category', 'brand', 'cart', 'search', 'page', '404']) {
            for (const id of ['one-main', 'rf-live-region', 'rf-icon-sheet']) {
                assert.equal(result(FRAME, id, kind).status, 'pass', `${id} on ${kind}`);
            }
        }
    });
});

describe('one-main', () => {
    it('fails a page with no <main>, as stock home, product and cart pages were', () => {
        fails(FRAME.replace('<main class="body"', '<div class="body"').replace('</main>', '</div>'), 'one-main', /0 main landmarks/);
    });

    it('fails a page with two, as an unconditional <main> round a template with its own would make', () => {
        const html = FRAME.replace('<article class="rf-prose">', '<main class="page"><article class="rf-prose">').replace('</article>', '</article></main>');
        fails(html, 'one-main', /2 main landmarks/);
    });

    it('counts role="main" as a main landmark, once per element', () => {
        assert.equal(result(FRAME.replace('<main class="body"', '<main role="main" class="body"'), 'one-main').status, 'pass');
        fails(FRAME.replace('<header class="rf-head"', '<header role="main" class="rf-head"'), 'one-main', /2 main landmarks/);
    });

    it('ignores <main> in comments and scripts', () => {
        // The fixture has one in a comment and one in a script string.
        assert.equal(result(FRAME, 'one-main').status, 'pass');
    });
});

describe('rf-live-region', () => {
    it('fails a page without the region', () => {
        fails(FRAME.replace(REGION, ''), 'rf-live-region', /no live region/);
    });

    it('fails a page with two', () => {
        fails(FRAME.replace(REGION, REGION + REGION), 'rf-live-region', /2 live regions/);
    });

    it('fails a region that isn\'t empty in the server HTML, because a screen reader reads it at load', () => {
        fails(FRAME.replace(REGION, REGION.replace('></div>', '>3 results</div>')), 'rf-live-region', /isn't empty/);
    });

    it('fails a region without role="status"', () => {
        fails(FRAME.replace(REGION, REGION.replace(' role="status"', '')), 'rf-live-region', /role="status"/);
    });

    it('ignores the region\'s marker in a script string', () => {
        // The fixture's head has one in a script.
        assert.equal(result(FRAME, 'rf-live-region').status, 'pass');
    });
});

describe('rf-icon-sheet', () => {
    const sheet = () => FRAME.match(SHEET)[0];

    it('fails a page without the sheet', () => {
        fails(FRAME.replace(SHEET, ''), 'rf-icon-sheet', /no ReelFlies icon sheet/);
    });

    it('fails a page with the sheet twice', () => {
        fails(FRAME.replace(sheet(), sheet() + sheet()), 'rf-icon-sheet', /2 ReelFlies icon sheets/);
    });

    it('fails a sheet that comes after an icon drawn from it, or sits outside <body>', () => {
        fails(FRAME.replace(sheet(), '').replace('<footer', `${sheet()}<footer`), 'rf-icon-sheet', /is drawn before the sheet/);
        fails(FRAME.replace(sheet(), '').replace('</head>', `${sheet()}</head>`), 'rf-icon-sheet', /isn't in <body>/);
    });

    it('fails a sheet that screen readers or the keyboard could reach', () => {
        fails(FRAME.replace(' aria-hidden="true" focusable="false">\n    <symbol', '>\n    <symbol'), 'rf-icon-sheet', /aria-hidden="true"[\s\S]*focusable="false"/);
    });

    it('fails a page that draws an icon the sheet doesn\'t hold, naming it', () => {
        fails(FRAME.replace('#rf-i-menu', '#rf-i-hamburger'), 'rf-icon-sheet', /doesn't hold: rf-i-hamburger/);
    });

    it('fails an empty sheet', () => {
        fails(FRAME.replace(SHEET, '<svg class="rf-icon-sheet" width="0" height="0" aria-hidden="true" focusable="false"></svg>\n'), 'rf-icon-sheet', /holds no <symbol>/);
    });
});
