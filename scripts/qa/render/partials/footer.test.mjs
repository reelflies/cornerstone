// The ReelFlies footer (ticket 50, redrawn for the Streamside Stone redesign, DESIGN.md "Footer";
// spec module 20; stories 63, 64, 65, 67 and 68), rendered from fixtures after head.html, as a
// page renders it: the footer.html hook, the newsletter with its CASL wording, the store block
// (the logo on its plate, the address and phone from the Store details settings, the social
// links as text), the Fly types, More and Help columns, the base row with the copyright and the
// other storefront, and the order line after it. The raw-HTML assertion rf-footer checks the
// same on every pinned page, and its own test proves it fails on what this test rules out.
//
// Gone with master's footer, so not tested here: the promise line, the Shop column's declared
// ids, the stock Categories fallback, the Contact column's store-profile address, the icon
// social row, the payment icons and the forest ground.
//
//   node --test scripts/qa/render/partials/footer.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import rfFooter from '../../raw-html/assertions/rf-footer.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import {
    readFixture, renderPartial, themeConfig, THEME_DIR,
} from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => readFixture(path.join(HERE, 'footer', `${name}.json`));
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang', 'en.json'), 'utf8'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const NEWSLETTER = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'content', 'pages', '1895766', 'newsletter.json'), 'utf8'));
const YEAR = String(new Date().getFullYear());
const SPRING_BANNER = {
    id: 3, 'banner-name': 'Spring', location: 'bottom', content: '<p>Spring sale</p>',
};
// head.html sets the page variables the Species link and the More column read (rf_species_root,
// rf_type_ids, rf_exclude_ids), so the footer renders after it, as on a page. stencil-paper sets
// `template` to the name it renders, as the store sets it to the page's template, so a case that
// needs a page's name (the cart) renders a stand-in page of that name.
const PAGE = '{{> components/reelflies/head}}{{> components/reelflies/footer}}';

const render = (name, overrides = {}, { template = 'test/footer-page', ...options } = {}) => {
    const context = { ...fixture(name), ...overrides };
    if (overrides.theme_settings) context.theme_settings = { ...fixture(name).theme_settings, ...overrides.theme_settings };
    if (overrides.settings) context.settings = { ...fixture(name).settings, ...overrides.settings };
    return renderPartial(template, context, { ...options, overrides: { [template]: PAGE } });
};

// The parts of the footer, each an element's whole markup.
const classed = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const footerOf = html => outerHtml(html, 'footer');
const column = (html, id) => outerHtml(html, 'nav', attrs => attrs['aria-labelledby'] === id);
const brand = html => outerHtml(html, 'div', classed('rf-foot__brand'));
const base = html => outerHtml(html, 'div', classed('rf-foot__base'));
const news = html => outerHtml(html, 'form', classed('rf-news'));
const links = html => findTags(html, 'a').map(tag => tag.attrs);
const linkTexts = html => elementsHtml(html, 'a').map(textOf);
const page = html => ({
    kind: 'home', key: 'home', path: '/', url: 'http://localhost:3601/', status: 200, html: `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><main class="body" id="main-content"></main>${footerOf(html)}</body></html>`,
});

describe('the footer.html hook', () => {
    it('keeps the bottom banners above the footer and renders the ReelFlies footer, once, with the site seal region inside it', async () => {
        const html = await renderPartial('components/common/footer', {
            ...fixture('tree-4'),
            banners: { bottom: true, bottom_metadata: [SPRING_BANNER] },
        }, { regions: { 'ssl_site_seal--global': '<div data-rf-test-seal></div>' } });
        const footers = findTags(html, 'footer');
        assert.equal(footers.length, 1);
        assert.ok('data-rf-foot' in footers[0].attrs);
        assert.ok(html.indexOf('data-banner-location="bottom"') < html.indexOf('<footer'), 'the banners come first');
        assert.match(footerOf(html), /data-rf-test-seal/);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('is the contentinfo landmark, with one hidden heading for the footer and an h3 over each column, no h1', async () => {
        const html = await render('tree-4');
        const [footer] = findTags(html, 'footer');
        assert.deepEqual(footer.attrs.class.split(/\s+/), ['rf-foot', 'rf-foot--orderline']);
        assert.equal(footer.attrs.role, undefined, '<footer> is the landmark on its own');
        const [h2] = findTags(footerOf(html), 'h2');
        assert.equal(h2.attrs.class, 'is-srOnly');
        assert.equal(textOf(outerHtml(footerOf(html), 'h2')), LANG.footer.title);
        assert.equal(findTags(footerOf(html), 'h1').length, 0);
        const navs = findTags(footerOf(html), 'nav');
        assert.deepEqual(navs.map(tag => tag.attrs['aria-labelledby']), ['rf-foot-types', 'rf-foot-more', 'rf-foot-help']);
        const headings = findTags(footerOf(html), 'h3').map(tag => tag.attrs.id);
        for (const nav of navs) assert.ok(headings.includes(nav.attrs['aria-labelledby']), `${nav.attrs['aria-labelledby']} is an h3 in the footer`);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('is followed by the order line on every page but the cart while rf_order_line is on, and says so itself (rf-foot--orderline)', async () => {
        const home = await render('tree-4', {}, { template: 'pages/home' });
        assert.ok(home.indexOf('<footer') < home.indexOf('<aside class="rf-orderline"'), 'the order line follows the footer');
        assert.match(findTags(home, 'footer')[0].attrs.class, /\brf-foot--orderline\b/);
        const cart = await render('tree-4', {}, { template: 'pages/cart' });
        assert.equal(findTags(cart, 'aside').length, 0);
        assert.doesNotMatch(findTags(cart, 'footer')[0].attrs.class, /orderline/);
        const off = await render('tree-4', { theme_settings: { rf_order_line: false } });
        assert.equal(findTags(off, 'aside').length, 0);
        assert.doesNotMatch(findTags(off, 'footer')[0].attrs.class, /orderline/);
    });

    it('passes the raw-HTML assertion as rendered, on each tree', async () => {
        assert.deepEqual(rfFooter.check(page(await render('tree-4'))), []);
        assert.deepEqual(rfFooter.check(page(await render('tree-1', {}, { variation: 'ReelFlies CA channel 1' }))), []);
        assert.deepEqual(rfFooter.check(page(await render('prelaunch'))), []);
    });
});

describe('the newsletter', () => {
    it('has the CASL line as its visible heading, a label tied to the email field and the consent the field describes itself by, from lang strings', async () => {
        const form = news(await render('tree-4'));
        const [email] = findTags(form, 'input').filter(tag => tag.attrs.type === 'email');
        const [label] = findTags(form, 'label');
        assert.equal(label.attrs.for, email.attrs.id);
        assert.equal(textOf(outerHtml(form, 'label')), 'Email address');
        assert.equal(textOf(outerHtml(form, 'h3')), NEWSLETTER.line);
        assert.equal(email.attrs.name, 'nl_email');
        assert.equal(email.attrs.autocomplete, 'email');
        assert.ok('required' in email.attrs);
        const consent = outerHtml(form, 'p', attrs => attrs.id === email.attrs['aria-describedby']);
        assert.equal(textOf(consent), NEWSLETTER.consent);
        assert.doesNotMatch(form, /store's own newsletter summary/);
    });

    it('posts to the store\'s subscribe action with the stock form\'s fields', async () => {
        const form = news(await render('tree-4'));
        const [{ attrs }] = findTags(form, 'form');
        assert.equal(attrs.action, 'https://reelflies.ca/subscribe.php');
        assert.equal(attrs.method, 'post');
        const hidden = Object.fromEntries(findTags(form, 'input').filter(tag => tag.attrs.type === 'hidden').map(tag => [tag.attrs.name, tag.attrs.value]));
        assert.deepEqual(hidden, { action: 'subscribe', nl_first_name: 'bc', check: '1' });
        assert.equal(findTags(form, 'button').filter(tag => tag.attrs.type === 'submit').length, 1);
    });

    it('mirrors stock subscription-form.html\'s action, method, named fields and email field, so an upstream change to it fails here', async () => {
        const stock = await renderPartial('components/common/subscription-form', fixture('tree-4'));
        const form = news(await render('tree-4'));
        const action = html => {
            const [{ attrs }] = findTags(html, 'form');
            return { action: attrs.action, method: attrs.method };
        };
        const fields = html => findTags(html, 'input').filter(tag => tag.attrs.name).map(({ attrs }) => ({ name: attrs.name, type: attrs.type, value: attrs.value }));
        const email = html => findTags(html, 'input').find(tag => tag.attrs.type === 'email').attrs;
        assert.deepEqual(action(form), action(stock));
        assert.deepEqual(fields(form), fields(stock));
        for (const attribute of ['id', 'autocomplete', 'required']) assert.equal(email(form)[attribute], email(stock)[attribute], attribute);
    });

    it('is left out when the store turns the newsletter box off', async () => {
        const html = await render('tree-4', { settings: { show_newsletter_box: 0 } });
        assert.equal(news(html), null);
        assert.equal(findTags(footerOf(html), 'form').length, 0);
        assert.deepEqual(rfFooter.check(page(html)), []);
    });

    it('copies ticket 22\'s source of record word for word (content/pages/1895766/newsletter.json)', () => {
        assert.equal(LANG.reelflies.footer.newsletter_line, NEWSLETTER.line);
        assert.equal(LANG.reelflies.footer.newsletter_consent, NEWSLETTER.consent);
    });
});

describe('the store block', () => {
    it('draws the store logo on the plate, lazy, with its size and the logo title as its name', async () => {
        const plate = outerHtml(brand(await render('tree-4')), 'span', classed('rf-foot__plate'));
        const [logo] = findTags(plate, 'img');
        assert.equal(logo.attrs.loading, 'lazy');
        assert.equal(logo.attrs.decoding, 'async');
        assert.equal(logo.attrs.width, '133');
        assert.equal(logo.attrs.height, '95');
        assert.equal(logo.attrs.alt, 'ReelFlies.ca');
        assert.match(logo.attrs.src, /\/images\/stencil\/\d+x\d+\/new_logo_for_usa_site/);
    });

    it('shows the logo title as text while the channel has no logo image (ReelFlies_CA today)', async () => {
        const plate = outerHtml(brand(await render('prelaunch')), 'span', classed('rf-foot__plate'));
        assert.equal(findTags(plate, 'img').length, 0);
        assert.equal(textOf(plate), 'ReelFlies.ca');
    });

    it('gives the address from the Store details settings, the legal name after ReelFlies, and walk-ins by appointment', async () => {
        const block = brand(await render('tree-4'));
        assert.match(block, /<address>ReelFlies, Digital Barn Ltd\.<br>93 Broadway St<br>Tillsonburg, ON N4G 3P5<\/address>/);
        assert.match(textOf(block), /Walk-ins by appointment/);
        const { settings } = themeConfig('ReelFlies CA');
        assert.equal(settings.rf_store_street, '93 Broadway St');
    });

    it('leaves the address out when rf_store_street is empty, and keeps the rest', async () => {
        const block = brand(await render('tree-4', { theme_settings: { rf_store_street: ' ' } }));
        assert.equal(findTags(block, 'address').length, 0);
        assert.match(textOf(block), /Walk-ins by appointment/);
    });

    it('shows the store profile\'s phone number and dials rf_store_phone, the same number in international form, toll free', async () => {
        const block = brand(await render('tree-4'));
        const phone = links(block).find(attrs => attrs.href.startsWith('tel:'));
        assert.equal(phone.href, 'tel:+1-866-250-4071');
        assert.ok(linkTexts(block).includes('1 866 250 4071'));
        assert.match(textOf(block), /1 866 250 4071 toll free/);
        assert.equal(phone.href.replace(/\D/g, ''), `1${'1 866 250 4071'.replace(/\D/g, '').replace(/^1/, '')}`, 'one number, two spellings');
    });

    it('dials the store profile\'s number as typed when rf_store_phone is empty, which rf-footer fails: keep rf_store_phone set', async () => {
        const html = await render('tree-4', { theme_settings: { rf_store_phone: '' } });
        assert.equal(links(brand(html)).find(attrs => attrs.href.startsWith('tel:')).href, 'tel:1 866 250 4071');
        assert.match(rfFooter.check(page(html)).join('\n'), /the phone link tel:1 866 250 4071/);
    });

    it('leaves out the phone line when the store profile has no number, and the walk-ins line stays', async () => {
        const block = brand(await render('tree-4', { settings: { phone_number: '' } }));
        assert.ok(!links(block).some(attrs => attrs.href.startsWith('tel:')));
        assert.doesNotMatch(textOf(block), /toll free/);
        assert.match(textOf(block), /Walk-ins by appointment/);
    });

    it('lists the store\'s social links as text, in the store\'s order, X for twitter, each a new-tab-safe link', async () => {
        const row = outerHtml(brand(await render('prelaunch')), 'ul', classed('rf-foot__social'));
        assert.equal(findTags(row, 'ul')[0].attrs['aria-label'], LANG.reelflies.footer.social);
        assert.deepEqual(linkTexts(row), ['Facebook', 'Instagram', 'Pinterest', 'X', 'YouTube']);
        assert.deepEqual(links(row).map(attrs => attrs.href), fixture('prelaunch').social_media.map(link => link.url));
        assert.ok(links(row).every(attrs => attrs.rel === 'noopener'));
        assert.equal(findTags(row, 'svg').length, 0, 'words, not icons');
    });

    it('narrows the social links to rf_store_same_as, and shows no row when the store has none', async () => {
        const kept = outerHtml(brand(await render('prelaunch', { theme_settings: { rf_store_same_as: 'facebook, YouTube' } })), 'ul', classed('rf-foot__social'));
        assert.deepEqual(linkTexts(kept), ['Facebook', 'YouTube']);
        assert.equal(outerHtml(brand(await render('tree-4', { social_media: [] })), 'ul', classed('rf-foot__social')), null);
    });
});

describe('the Fly types column', () => {
    it('lists the six Fly Types in rf_menu_type_ids order, then Flies by Species, never in the store\'s order', async () => {
        const types = column(await render('tree-4'), 'rf-foot-types');
        assert.equal(textOf(outerHtml(types, 'h3')), 'Fly types');
        assert.deepEqual(linkTexts(types), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies', 'Flies by Species']);
        assert.deepEqual(links(types).map(attrs => attrs.href), [
            'https://reelflies.ca/dry-flies/', 'https://reelflies.ca/nymphs/', 'https://reelflies.ca/streamers/', 'https://reelflies.ca/eggs-worms/',
            'https://reelflies.ca/warmwater-flies/', 'https://reelflies.ca/saltwater-flies/', 'https://reelflies.ca/species/',
        ]);
        assert.equal(findTags(types, 'li').length, 7);
    });

    it('finds tree 1\'s Fly Types one level down, in channel 1\'s variation order, with no Species link (ticket 53)', async () => {
        const types = column(await render('tree-1', {}, { variation: 'ReelFlies CA channel 1' }), 'rf-foot-types');
        assert.equal(themeConfig('ReelFlies CA channel 1').settings.rf_menu_type_ids, '298,251,255,272,438');
        assert.deepEqual(linkTexts(types), ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies']);
        assert.equal(findTags(types, 'li').length, 5, 'no empty item for the empty Species id');
    });

    it('lists the Species root alone when only it is set', async () => {
        assert.deepEqual(linkTexts(column(await render('tree-4', { theme_settings: { rf_menu_type_ids: '' } }), 'rf-foot-types')), ['Flies by Species']);
    });

    it('skips an id the channel\'s tree doesn\'t hold, and a stray comma', async () => {
        const types = column(await render('tree-4', { theme_settings: { rf_menu_type_ids: '601,,9999,602,', rf_menu_species_root_id: '' } }), 'rf-foot-types');
        assert.deepEqual(linkTexts(types), ['Dry Flies', 'Nymphs']);
    });

    it('is left out, heading and all, when both menu ids are empty or only spaces, as on ReelFlies_CA today', async () => {
        const empty = { rf_menu_type_ids: '', rf_menu_species_root_id: '' };
        const spaces = { rf_menu_type_ids: ' ', rf_menu_species_root_id: '  ' };
        const pages = await Promise.all([empty, spaces].map(settings => render('tree-4', { theme_settings: settings })));
        pages.forEach(html => {
            assert.equal(column(html, 'rf-foot-types'), null);
            assert.doesNotMatch(textOf(footerOf(html)), /Fly types/);
            assert.deepEqual(rfFooter.check(page(html)), []);
        });
        assert.equal(themeConfig('ReelFlies CA').settings.rf_menu_type_ids, '');
        assert.equal(column(await render('prelaunch'), 'rf-foot-types'), null);
    });
});

describe('the More column', () => {
    it('lists the top-level categories the menus don\'t cover when rf_menu_link_ids is empty, then the hook size chart and the articles', async () => {
        const more = column(await render('tree-4'), 'rf-foot-more');
        assert.equal(textOf(outerHtml(more, 'h3')), 'More');
        assert.deepEqual(linkTexts(more), ['Fly Gear', 'Hook size chart', 'Fly fishing articles']);
        assert.deepEqual(links(more).map(attrs => attrs.href), ['https://reelflies.ca/fly-gear/', '/fly-hook-size-chart/', 'https://reelflies.ca/blog/']);
    });

    it('lists rf_menu_link_ids in their order on channel 1, skipping an id its tree doesn\'t hold', async () => {
        const more = column(await render('tree-1', {}, { variation: 'ReelFlies CA channel 1' }), 'rf-foot-more');
        assert.equal(themeConfig('ReelFlies CA channel 1').settings.rf_menu_link_ids, '399,434,400');
        assert.deepEqual(linkTexts(more), ['Fly Selections & Fly Boxes', 'Fly Gear', 'Hook size chart', 'Fly fishing articles']);
    });

    it('lists every top-level category when no menu id is set, less rf_menu_exclude_ids', async () => {
        const all = column(await render('tree-4', { theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } }), 'rf-foot-more');
        assert.deepEqual(linkTexts(all).slice(0, 8), ['Fly Gear', 'Eggs & Worms', 'Dry Flies', 'Nymphs', 'Flies by Species', 'Streamers', 'Saltwater Flies', 'Warmwater Flies']);
        const less = column(await render('tree-4', { theme_settings: { rf_menu_exclude_ids: '800' } }), 'rf-foot-more');
        assert.deepEqual(linkTexts(less), ['Hook size chart', 'Fly fishing articles']);
    });

    it('leaves out the hook size chart without its URL, and the articles without the blog', async () => {
        const more = column(await render('tree-4', { theme_settings: { rf_hook_chart_url: '' }, settings: { blog_enabled: false } }), 'rf-foot-more');
        assert.deepEqual(linkTexts(more), ['Fly Gear']);
    });
});

describe('the Help column', () => {
    it('lists Shipping & Returns, Help, Contact, About, Privacy and Gift certificates, in that order, from the channel\'s own pages', async () => {
        const help = column(await render('tree-4'), 'rf-foot-help');
        assert.equal(textOf(outerHtml(help, 'h3')), 'Help');
        assert.deepEqual(linkTexts(help), ['Shipping & Returns', 'Help', 'Contact Us', 'About Us', 'Privacy Policy', 'Gift certificates']);
        assert.deepEqual(links(help).map(attrs => attrs.href), [
            'https://reelflies.ca/shipping-returns/', 'https://reelflies.ca/help/', 'https://reelflies.ca/contact-us/',
            'https://reelflies.ca/about-us/', 'https://reelflies.ca/privacy-policy/', 'https://reelflies.ca/giftcertificates.php',
        ]);
    });

    it('takes the Web Page links from the channel\'s own pages, so a page the channel lacks is left out', async () => {
        assert.deepEqual(linkTexts(column(await render('prelaunch'), 'rf-foot-help')), ['Gift certificates']);
    });

    it('leaves out Gift certificates when they are off', async () => {
        const help = column(await render('tree-4', { settings: { gift_certificates_enabled: false } }), 'rf-foot-help');
        assert.deepEqual(linkTexts(help), ['Shipping & Returns', 'Help', 'Contact Us', 'About Us', 'Privacy Policy']);
    });

    it('links Gift certificates once, although channel 1 lists Gift Certificates among its pages too', async () => {
        const help = column(await render('tree-1', {}, { variation: 'ReelFlies CA channel 1' }), 'rf-foot-help');
        assert.equal(linkTexts(help).filter(text => /gift certificates/i.test(text)).length, 1);
        assert.deepEqual(linkTexts(help), ['Shipping & Returns', 'Contact Us', 'About Us', 'Privacy Policy', 'Gift certificates']);
    });
});

describe('the base row', () => {
    it('has the copyright with the legal name and the trademark line, and the other storefront as a real link, for every visitor', async () => {
        const row = base(await render('tree-4'));
        assert.match(textOf(row), new RegExp(`^© ${YEAR} Digital Barn Ltd\\. ReelFlies® is a registered trademark of Digital Barn Ltd\\.`));
        assert.deepEqual(links(row), [{ href: 'https://reelflies.com/' }]);
        assert.deepEqual(linkTexts(row), ['Ordering from outside Canada? Shop ReelFlies.com in US dollars']);
    });

    it('links the .com preview back to reelflies.ca, in Canadian dollars', async () => {
        const row = base(await render('tree-4', {}, { variation: 'ReelFlies US' }));
        assert.deepEqual(links(row), [{ href: 'https://reelflies.ca/' }]);
        assert.deepEqual(linkTexts(row), ['Ordering from Canada? Shop ReelFlies.ca in Canadian dollars']);
    });

    it('shows no other storefront while rf_alt_store_url is empty, and trims the URL it is given', async () => {
        assert.equal(links(base(await render('tree-4', { theme_settings: { rf_alt_store_url: ' ' } }))).length, 0);
        assert.deepEqual(links(base(await render('tree-4', { theme_settings: { rf_alt_store_url: ' https://reelflies.com/ ' } }))), [{ href: 'https://reelflies.com/' }]);
    });

    it('shows the copyright whatever show_copyright_footer says: no template reads that toggle (CUSTOMIZATIONS.md)', async () => {
        assert.match(textOf(base(await render('tree-4', { theme_settings: { show_copyright_footer: false } }))), new RegExp(`© ${YEAR} `));
        const templates = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? templates(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
        assert.deepEqual(templates(path.join(THEME_DIR, 'templates')).filter(file => fs.readFileSync(file, 'utf8').includes('show_copyright_footer')), []);
    });
});

describe('what the footer never shows', () => {
    it('has no "Powered by", no Brands column, no stock Categories column and no payment icons, whatever the settings say', async () => {
        const html = await render('tree-4', {
            theme_settings: {
                show_powered_by: true, shop_by_brand_show_footer: true, show_accept_visa: true, show_accept_mastercard: true,
            },
        });
        assert.doesNotMatch(textOf(html), /powered by/i);
        assert.ok(!findTags(html).some(tag => tag.attrs['data-section-type']));
        assert.ok(!links(html).some(attrs => attrs.href === 'https://reelflies.ca/brands/ReelFlies.html'));
        assert.equal(findTags(html, 'ul').filter(tag => tag.attrs.class === 'footer-payment-icons').length, 0);
        assert.deepEqual(rfFooter.check(page(html)), []);
    });

    it('renders balanced markup on every fixture', async () => {
        const cases = [['tree-4', 'ReelFlies CA'], ['tree-1', 'ReelFlies CA channel 1'], ['prelaunch', 'ReelFlies CA']];
        const pages = await Promise.all(cases.map(([name, variation]) => render(name, {}, { variation })));
        pages.forEach((html, index) => assert.deepEqual(unbalancedTags(html), [], cases[index][0]));
    });
});

describe('the strings and settings', () => {
    it('reads every string from reelflies.footer, but for the footer\'s own stock title and the menus\' hook chart, and each resolves', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates', 'components', 'reelflies', 'footer.html'), 'utf8');
        const keys = [...source.matchAll(/\{\{lang '([^']+)'/g)].map(([, key]) => key);
        assert.deepEqual([...new Set(keys.filter(key => !key.startsWith('reelflies.footer.')))], ['footer.title', 'reelflies.menu.hook_chart']);
        keys.forEach(key => assert.equal(typeof key.split('.').reduce((strings, segment) => strings?.[segment], LANG), 'string', key));
        const footer = LANG.reelflies.footer;
        assert.equal(footer.copyright, '© {year} {holder} ReelFlies® is a registered trademark of Digital Barn Ltd.');
        assert.equal(footer.address_name, 'ReelFlies, {legal}');
        assert.equal(footer.walk_ins, 'Walk-ins by appointment');
        assert.equal(footer.articles, 'Fly fishing articles');
        assert.equal(footer.gift_certificates, 'Gift certificates');
    });

    it('keeps "Powered by" and the Brands column off on every variation, as master did, and gives each an other storefront', () => {
        for (const { name } of CONFIG.variations) {
            const { settings } = themeConfig(name);
            assert.equal(settings.show_powered_by, false, name);
            assert.equal(settings.shop_by_brand_show_footer, false, name);
            assert.ok(String(settings.rf_alt_store_url).trim(), `${name}: rf_alt_store_url`);
            assert.ok(String(settings.rf_alt_store_foot).trim(), `${name}: rf_alt_store_foot`);
        }
    });

    it('keeps the menu ids strings, in the base settings and every variation, as split and trim need', () => {
        for (const { name } of CONFIG.variations) {
            const { settings } = themeConfig(name);
            for (const key of ['rf_menu_type_ids', 'rf_menu_species_root_id', 'rf_menu_link_ids', 'rf_menu_exclude_ids']) assert.equal(typeof settings[key], 'string', `${name}: ${key}`);
        }
    });
});
