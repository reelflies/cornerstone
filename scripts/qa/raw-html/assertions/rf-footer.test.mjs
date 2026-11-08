// Tests the footer's raw-HTML assertion (ticket 50, redrawn for the Streamside Stone redesign):
// rf-footer, on pages built from the footer's own render and on pages broken one way at a time,
// so each rule is shown to fail. The footer renders after head.html, as a page does, so the page
// variables the Species link and the More column read are set.
//
//   node --test scripts/qa/raw-html/assertions/rf-footer.test.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssertions } from '../../raw-html.mjs';
import { readFixture, renderPartial } from '../../render/render.mjs';
import { outerHtml } from '../html.mjs';
import rfFooter, { ALT_STORES, NEWSLETTER, dialable } from './rf-footer.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../render/partials/footer');
const WITH_HEAD = { 'test/footer-page': '{{> components/reelflies/head}}{{> components/reelflies/footer}}' };

// The footer alone, as footer.html renders it after head.html.
const footer = async (name = 'tree-4', themeSettings = {}, options = {}) => {
    const context = readFixture(path.join(FIXTURES, `${name}.json`));
    context.theme_settings = { ...context.theme_settings, ...themeSettings };
    return outerHtml(await renderPartial('test/footer-page', context, { ...options, overrides: WITH_HEAD }), 'footer');
};
const frame = body => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><header class="rf-head"></header><main class="body" id="main-content"></main>${body}</body></html>`;
const page = (body, kind = 'home') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3601/', status: 200, html: frame(body),
});
const problems = body => rfFooter.check(page(body));

describe('rf-footer', () => {
    it('is registered, and runs on every page kind', async () => {
        assert.ok((await loadAssertions()).some(assertion => assertion.id === 'rf-footer'));
        assert.equal(rfFooter.pages, undefined);
        assert.equal(rfFooter.notOn, undefined);
    });

    it('passes the footer as rendered: tree 4, channel 1\'s tree 1, and the prelaunch channel with no categories', async () => {
        assert.deepEqual(problems(await footer('tree-4')), []);
        assert.deepEqual(problems(await footer('tree-1', {}, { variation: 'ReelFlies CA channel 1' })), []);
        assert.deepEqual(problems(await footer('prelaunch')), []);
        assert.deepEqual(problems(await footer('tree-4', { rf_menu_type_ids: '', rf_menu_species_root_id: '' })), [], 'no Fly types column, and nothing fails');
        assert.deepEqual(problems(await footer('tree-4', {}, { variation: 'ReelFlies US' })), [], 'the .com preview links to reelflies.ca');
    });

    it('fails a page without the ReelFlies footer, or with two footers', async () => {
        assert.match(problems('<footer class="footer"></footer>').join('\n'), /no ReelFlies footer/);
        const html = await footer();
        assert.match(problems(html + html).join('\n'), /2 <footer> elements/);
    });

    it('knows the other storefronts config.json declares: reelflies.com from the .ca variations, reelflies.ca from the .com preview', () => {
        assert.deepEqual(ALT_STORES.map(store => store.url).sort(), ['https://reelflies.ca/', 'https://reelflies.com/']);
        assert.ok(ALT_STORES.every(store => store.text));
    });

    it('fails when the other storefront\'s link isn\'t a real link to a declared storefront, in its declared words', async () => {
        const html = await footer();
        assert.match(html, /<a href="https:\/\/reelflies\.com\/">Ordering from outside Canada\? Shop ReelFlies\.com in US dollars<\/a>/);
        assert.match(problems(html.replace('href="https://reelflies.com/"', 'href="#"')).join('\n'), /isn't an other storefront config\.json declares/);
        assert.match(problems(html.replace('<a href="https://reelflies.com/">', '<button>').replace('in US dollars</a>', 'in US dollars</button>')).join('\n'), /no link in the base row/);
        assert.match(problems(html.replace('Ordering from outside Canada?', 'Outside Canada?')).join('\n'), /isn't an other storefront config\.json declares/);
        assert.match(problems(html.replace('<div class="rf-wrap rf-foot__base">', '<div class="rf-wrap rf-foot__base"><p><a href="https://reelflies.com/">Shop ReelFlies.com</a></p>')).join('\n'), /2 links in the base row/);
        assert.match(problems(html.replace(/<div class="rf-wrap rf-foot__base">[\s\S]*?<\/div>/, '')).join('\n'), /no base row/);
    });

    it('accepts the declared URL with its origin stripped, as stencil start serves a channel\'s own URL', async () => {
        const html = await footer('tree-4', {}, { variation: 'ReelFlies US' });
        assert.deepEqual(problems(html.replace('href="https://reelflies.ca/"', 'href="/"')), []);
    });

    it('fails without the copyright line', async () => {
        const html = await footer();
        assert.match(problems(html.replace(/© \d{4} /, '© ')).join('\n'), /the copyright/);
        assert.match(problems(html.replace('registered trademark', 'trademark')).join('\n'), /the copyright/);
    });

    it('fails "Powered by" anywhere on the page, and a Brands column', async () => {
        const html = await footer();
        assert.match(problems(`${html}<p class="powered-by">Powered by <a href="https://www.bigcommerce.com">BigCommerce</a></p>`).join('\n'), /"Powered by"/);
        assert.match(problems(`<article data-section-type="footer-brands"></article>${html}`).join('\n'), /a Brands column/);
    });

    it('fails a newsletter form that strays from stock\'s subscribe action and fields, or from the CASL wording of record', async () => {
        const html = await footer();
        assert.match(html, /action="https:\/\/reelflies\.ca\/subscribe\.php" method="post"/);
        assert.match(problems(html.replace('action="https://reelflies.ca/subscribe.php"', 'action="https://reelflies.ca/newsletter/"')).join('\n'), /not the store's subscribe\.php/);
        assert.match(problems(html.replace('method="post"', 'method="get"')).join('\n'), /method is "get"/);
        assert.match(problems(html.replace('name="nl_email"', 'name="email"')).join('\n'), /no email field named nl_email/);
        assert.match(problems(html.replace('<input type="hidden" name="action" value="subscribe">', '')).join('\n'), /no hidden action=subscribe/);
        assert.match(problems(html.replace(NEWSLETTER.line, 'Sign up for our newsletter.')).join('\n'), /heading isn't the line of record/);
        assert.match(problems(html.replace(NEWSLETTER.consent, 'You can unsubscribe at any time.')).join('\n'), /consent isn't the wording of record/);
        assert.match(problems(html.replace(' aria-describedby="rf-news-consent"', '')).join('\n'), /aria-describedby/);
        assert.match(problems(html.replace('<label class="is-srOnly" for="nl_email">', '<label class="is-srOnly">')).join('\n'), /no <label for>/);
        assert.deepEqual(problems(html.replace(/<div class="rf-wrap rf-foot__news">[\s\S]*?<\/form>\s*<\/div>/, '')), [], 'no form (the store\'s newsletter box off) is no problem');
    });

    it('fails a footer nav with no heading of its own, or with no links, and any footer link with no URL', async () => {
        const html = await footer();
        assert.match(problems(html.replace(' aria-labelledby="rf-foot-help"', '')).join('\n'), /nav isn't labelled by a heading in the footer \(aria-labelledby=""\)/);
        assert.match(problems(html.replace('aria-labelledby="rf-foot-help"', 'aria-labelledby="rf-elsewhere"')).join('\n'), /aria-labelledby="rf-elsewhere"/);
        const emptied = html.replace(/(<nav aria-labelledby="rf-foot-types"><h3 id="rf-foot-types">[^<]*<\/h3><ul>)[\s\S]*?(<\/ul><\/nav>)/, '$1$2');
        assert.match(problems(emptied).join('\n'), /the footer nav "rf-foot-types" has no links/);
        assert.match(problems(html.replace('<a href="https://reelflies.ca/fly-gear/">', '<a href="">')).join('\n'), /a footer link with no URL/);
    });

    it('dials +1 and ten digits, with RFC 3966\'s separators, and nothing else', () => {
        for (const link of ['tel:+18662504071', 'tel:+1-866-250-4071', 'tel:+1(866)250-4071', 'tel:+1.866.250.4071']) assert.ok(dialable(link), link);
        for (const link of ['tel:1 866 250 4071', 'tel:++18662504071', 'tel:+(519)842-5555', 'tel:+18662504071ext.2', 'tel:+5198425555', 'tel:+1 866 250 4071', 'tel:']) assert.ok(!dialable(link), link);
    });

    it('fails a phone link that isn\'t tel:+1 and ten digits, as the footer dials when rf_store_phone is empty and the store profile\'s number stands in', async () => {
        const html = await footer();
        assert.match(html, /href="tel:\+1-866-250-4071"/);
        for (const href of ['tel:++18662504071', 'tel:+18662504071ext.2', 'tel:+5198425555', 'tel:']) {
            assert.match(problems(html.replace('href="tel:+1-866-250-4071"', `href="${href}"`)).join('\n'), /the phone link/, href);
        }
        const fallback = await footer('tree-4', { rf_store_phone: '' });
        assert.match(fallback, /href="tel:1 866 250 4071"/, 'the store profile\'s number, spaces and all');
        assert.match(problems(fallback).join('\n'), /the phone link tel:1 866 250 4071 isn't tel:\+1 and ten digits/);
    });

    it('fails a social link with no words or without https', async () => {
        const html = await footer();
        assert.match(html, /<ul class="rf-foot__social"/);
        assert.match(problems(html.replace('rel="noopener">Facebook</a>', 'rel="noopener"></a>')).join('\n'), /a social link with no words/);
        assert.match(problems(html.replace('href="https://www.facebook.com/reelflies.ca/"', 'href="http://www.facebook.com/reelflies.ca/"')).join('\n'), /a social link that isn't https/);
        assert.match(problems(html.replace(/(<ul class="rf-foot__social"[^>]*>)[\s\S]*?(<\/ul>)/, '$1$2')).join('\n'), /a social row \(ul\.rf-foot__social\) with no links/);
    });
});
