// Tests the footer's raw-HTML assertion (ticket 50): rf-footer, on pages built from the footer's
// own render and on pages broken one way at a time, so each rule is shown to fail.
//
//   node --test scripts/qa/raw-html/assertions/rf-footer.test.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssertions } from '../../raw-html.mjs';
import { readFixture, renderPartial } from '../../render/render.mjs';
import { elementsHtml, textOf } from '../html.mjs';
import rfFooter from './rf-footer.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../render/partials/footer');

const footer = (name = 'tree-4', themeSettings = {}) => {
    const context = readFixture(path.join(FIXTURES, `${name}.json`));
    context.theme_settings = { ...context.theme_settings, ...themeSettings };
    return renderPartial('components/reelflies/footer', context);
};
const frame = body => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><header></header><div class="body" id="main-content"></div>${body}</body></html>`;
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

    it('passes the footer as rendered, with the Shop column and with the stock fallback', async () => {
        assert.deepEqual(problems(await footer('tree-4')), []);
        assert.deepEqual(problems(await footer('prelaunch')), []);
        assert.deepEqual(problems(await footer('tree-4', { rf_menu_type_ids: '', rf_menu_species_root_id: '' })), []);
    });

    it('fails a page without the ReelFlies footer, or with two footers', async () => {
        assert.match(problems('<footer class="footer"></footer>').join('\n'), /no ReelFlies footer/);
        const html = await footer();
        assert.match(problems(html + html).join('\n'), /2 <footer> elements/);
    });

    it('fails when the outside-Canada link isn\'t a real link to https://reelflies.com/', async () => {
        const html = await footer();
        assert.match(problems(html.replace('href="https://reelflies.com/"', 'href="#"')).join('\n'), /no link to https:\/\/reelflies\.com\//);
        assert.match(problems(html.replace(/<a\b([^>]*)href="https:\/\/reelflies\.com\/"([^>]*)>/, '<button$1$2>').replace('ReelFlies.com</a>', 'ReelFlies.com</button>')).join('\n'), /no link to https:\/\/reelflies\.com\//);
        assert.match(problems(html.replace('Ordering from outside Canada?', 'Outside Canada?')).join('\n'), /the outside-Canada line/);
    });

    it('fails without the promise line or the copyright', async () => {
        const html = await footer();
        assert.match(problems(html.replace('We stand behind every fly we sell.', '')).join('\n'), /the promise line/);
        assert.match(problems(html.replace(/© \d{4} ReelFlies\.ca\./, '© ReelFlies.')).join('\n'), /the copyright/);
    });

    it('fails "Powered by" anywhere on the page, and a Brands column', async () => {
        const html = await footer();
        assert.match(problems(`${html}<p class="powered-by">Powered by <a href="https://www.bigcommerce.com">BigCommerce</a></p>`).join('\n'), /"Powered by"/);
        assert.match(problems(`<article data-section-type="footer-brands"></article>${html}`).join('\n'), /a Brands column/);
    });

    it('fails Shop links that aren\'t the declared ids in their order, or an id that didn\'t resolve', async () => {
        const html = await footer();
        const swapped = html.replace('data-rf-menu-type-ids="601, 602,603,604 ,605,606"', 'data-rf-menu-type-ids="602,601,603,604,605,606"');
        assert.match(problems(swapped).join('\n'), /the Shop links are 601, 602, 603, 604, 605, 606, 700, not the ids declared, 602, 601, 603, 604, 605, 606, 700/);
        const missing = html.replace('data-rf-menu-species-root-id="700"', 'data-rf-menu-species-root-id="777"');
        assert.match(problems(missing).join('\n'), /not the ids declared, 601, 602, 603, 604, 605, 606, 777/);
    });

    it('fails a Shop column with no links, as menu ids of only spaces would give it', async () => {
        const html = await footer();
        const empty = html.replace(/(<ul[^>]*data-rf-footer-shop[^>]*>)[\s\S]*?(<\/ul>)/, '$1$2')
            .replace(/data-rf-menu-type-ids="[^"]*"/, 'data-rf-menu-type-ids=" "')
            .replace(/data-rf-menu-species-root-id="[^"]*"/, 'data-rf-menu-species-root-id=" "');
        assert.match(problems(empty).join('\n'), /a Shop column with no links/);
    });

    it('fails a phone link that isn\'t tel:+1 and ten digits, which a store phone in another form would give', async () => {
        const html = await footer();
        assert.match(html, /href="tel:\+18662504071"/);
        for (const href of ['tel:++18662504071', 'tel:+(519)842-5555', 'tel:+18662504071ext.2', 'tel:+5198425555', 'tel:']) {
            assert.match(problems(html.replace('href="tel:+18662504071"', `href="${href}"`)).join('\n'), /the phone link/, href);
        }
    });

    it('fails a page with both the Shop column and the stock Categories column, or with neither', async () => {
        const shop = await footer();
        const stock = await footer('tree-4', { rf_menu_type_ids: '', rf_menu_species_root_id: '' });
        const stockColumn = elementsHtml(stock, 'article').find(article => textOf(article).startsWith('Categories'));
        assert.match(problems(shop.replace('<article', `${stockColumn}<article`)).join('\n'), /both the Shop column and the stock Categories column/);
        assert.match(problems(stock.replace(stockColumn, '')).join('\n'), /neither the Shop column nor the stock Categories column/);
    });
});
