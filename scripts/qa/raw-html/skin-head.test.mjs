// Tests for ticket 25's skin assertions (spec Testing Decisions, seam 2): Canadian English
// (lang-en-ca), the self-hosted font (rf-fonts), the favicon and share image (rf-brand-head) and
// the autocomplete tokens (autocomplete). CI runs them through `npm run test:scripts`.
//
//   node --test scripts/qa/raw-html/skin-head.test.mjs

import fs from 'fs';
import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../raw-html.mjs';
import { TOKENS } from './assertions/autocomplete.mjs';

const FIXTURES = path.resolve('scripts/qa/raw-html/fixtures');
const FRAME = fs.readFileSync(path.join(FIXTURES, 'page-frame.html'), 'utf8');
const PRODUCT = fs.readFileSync(path.join(FIXTURES, 'good-product.html'), 'utf8');
const page = (html, kind = 'home') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3701/', status: kind === '404' ? 404 : 200, html,
});
const PRELOAD = '<link rel="preload" href="/stencil/00000000-0000-0000-0000-000000000001/fonts/onest-latin-var.woff2" as="font" type="font/woff2" crossorigin>';
const LANGUAGE = '<meta http-equiv="content-language" content="en-CA">';
const SHARE = '<meta property="og:image" content="/stencil/00000000-0000-0000-0000-000000000001/img/reelflies/social-default.jpg">';
const FAVICON = '<link href="https://cdn11.bigcommerce.com/s-8pfqkn26ea/product_images/favicon.png" rel="shortcut icon">';

let assertions;
before(async () => {
    assertions = await loadAssertions();
});

const result = (html, id, kind) => checkPage(page(html, kind), assertions).find(entry => entry.id === id);
const failed = (html, kind) => checkPage(page(html, kind), assertions).filter(entry => entry.status === 'fail').map(entry => entry.id);
const fails = (html, id, pattern, kind) => {
    const { status, problems } = result(html, id, kind);
    assert.equal(status, 'fail', `${id} fails`);
    assert.match(problems.join('\n'), pattern);
};

describe('ticket 25\'s head assertions', () => {
    it('are registered', () => {
        const ids = assertions.map(assertion => assertion.id);
        for (const id of ['lang-en-ca', 'rf-fonts', 'rf-brand-head', 'autocomplete']) assert.ok(ids.includes(id), `${id} is registered`);
    });

    it('pass the fixture home page and product page', () => {
        assert.deepEqual(failed(FRAME), []);
        assert.deepEqual(failed(PRODUCT, 'product'), []);
    });
});

describe('lang-en-ca', () => {
    it('fails the stock <html lang>, which printed the store\'s locale', () => {
        fails(FRAME.replace('lang="en-CA"', 'lang="en"'), 'lang-en-ca', /<html lang="en">, not "en-CA"/);
    });

    it('fails a page without the en-CA content language, or with another one', () => {
        fails(FRAME.replace(LANGUAGE, ''), 'lang-en-ca', /0 content-language meta elements/);
        fails(FRAME.replace(LANGUAGE, LANGUAGE.replace('en-CA', 'en-US')), 'lang-en-ca', /content language is "en-US"/);
    });

    it('applies to every page kind, the 404 page included', () => {
        for (const kind of ['home', 'product', 'category', 'brand', 'cart', '404', 'login']) assert.equal(result(FRAME, 'lang-en-ca', kind).status, 'pass', kind);
    });
});

describe('rf-fonts', () => {
    it('fails a page without the Onest preload, or with it twice', () => {
        fails(FRAME.replace(PRELOAD, ''), 'rf-fonts', /0 preloads of fonts\/onest-latin-var\.woff2/);
        fails(FRAME.replace(PRELOAD, PRELOAD + PRELOAD), 'rf-fonts', /2 preloads/);
    });

    it('fails a preload without crossorigin, which the browser would fetch a second time for the @font-face', () => {
        fails(FRAME.replace(' crossorigin>', '>'), 'rf-fonts', /no crossorigin/);
    });

    it('fails a preload that isn\'t a woff2 font', () => {
        fails(FRAME.replace('as="font"', 'as="style"'), 'rf-fonts', /as="style", not "font"/);
        fails(FRAME.replace('type="font/woff2"', 'type="font/woff"'), 'rf-fonts', /type="font\/woff", not "font\/woff2"/);
    });

    it('fails any request to Google Fonts, as stock made for Karla and Montserrat', () => {
        const google = '<link href="https://fonts.googleapis.com/css?family=Karla:400%7CMontserrat:400,700,500&display=block" rel="stylesheet">';
        fails(FRAME.replace(PRELOAD, PRELOAD + google), 'rf-fonts', /a link to Google Fonts: .*Karla/);
        const preconnect = '<link rel="dns-prefetch preconnect" href="https://fonts.gstatic.com/" crossorigin>';
        fails(FRAME.replace(PRELOAD, PRELOAD + preconnect), 'rf-fonts', /a link to Google Fonts: .*gstatic/);
    });

    it('ignores a Google Fonts link in a comment or a script', () => {
        const html = FRAME.replace(PRELOAD, `${PRELOAD}<!-- <link href="https://fonts.googleapis.com/css?family=Karla" rel="stylesheet"> -->`);
        assert.equal(result(html, 'rf-fonts').status, 'pass');
    });
});

describe('rf-brand-head', () => {
    it('fails a page without a favicon link, or with an empty one', () => {
        fails(FRAME.replace(FAVICON, ''), 'rf-brand-head', /no favicon link/);
        fails(FRAME.replace(FAVICON, '<link href="" rel="shortcut icon">'), 'rf-brand-head', /a favicon link with no href/);
    });

    it('takes rel="icon" as a favicon too', () => {
        assert.equal(result(FRAME.replace(FAVICON, '<link rel="icon" href="/favicon.png">'), 'rf-brand-head').status, 'pass');
    });

    it('fails a page with no share image, and one with two', () => {
        fails(FRAME.replace(SHARE, ''), 'rf-brand-head', /0 og:image meta elements, not 1/);
        fails(PRODUCT.replace(PRELOAD, PRELOAD + SHARE), 'rf-brand-head', /2 og:image meta elements, not 1/);
    });
});

describe('autocomplete', () => {
    const field = (privateId, autocomplete) => `<input type="text" class="form-input" data-field-type="${privateId}"${autocomplete === undefined ? '' : ` autocomplete="${autocomplete}"`}>`;
    const form = fields => FRAME.replace('<div class="container">', `<div class="container"><form class="form">${fields.join('')}</form>`);
    const login = (email, pass) => form([
        `<input class="form-input" name="login_email" id="login_email" type="email"${email ? ` autocomplete="${email}"` : ''}>`,
        `<input class="form-input" id="login_pass" type="password" name="login_pass" autocomplete="${pass}">`,
    ]);

    it('applies to the sign-in and create-account pages only', () => {
        assert.equal(result(FRAME, 'autocomplete', 'home').status, 'skip');
        assert.equal(result(form([field('FirstName')]), 'autocomplete', 'product').status, 'skip');
    });

    it('passes the sign-in form with email and current-password', () => {
        assert.equal(result(login('email', 'current-password'), 'autocomplete', 'login').status, 'pass');
    });

    it('fails the stock sign-in form: no token on the email, and autocomplete="off" on the password', () => {
        const { status, problems } = result(login(null, 'off'), 'autocomplete', 'login');
        assert.equal(status, 'fail');
        assert.deepEqual(problems, ['login_email has autocomplete="", not "email"', 'login_pass has autocomplete="off", not "current-password"']);
    });

    it('passes a create-account form whose every store field carries its token', () => {
        const fields = Object.entries(TOKENS).map(([privateId, token]) => field(privateId, token));
        assert.equal(result(form([...fields, field('ReceiveMarketingEmails')]), 'autocomplete', 'create-account').status, 'pass');
    });

    it('fails a store field with a missing or wrong token, naming it', () => {
        fails(form([field('Zip')]), 'autocomplete', /the Zip field has autocomplete="", not "postal-code"/, 'create-account');
        fails(form([field('Password', 'off')]), 'autocomplete', /the Password field has autocomplete="off", not "new-password"/, 'create-account');
    });

    it('fails a create-account page with no store fields to check', () => {
        fails(FRAME, 'autocomplete', /no store form fields/, 'create-account');
    });
});
