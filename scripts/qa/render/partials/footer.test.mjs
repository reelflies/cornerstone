// The ReelFlies footer (ticket 50; spec module 20; stories 63, 64, 65, 67 and 68), rendered from
// fixtures: the footer.html hook, the Shop column from the menu ids (and the stock Categories
// column when both are empty), Help, Contact with the social row, the newsletter with its CASL
// wording, and the base row. The raw-HTML assertion rf-footer checks the same on every pinned
// page, and its own test proves it fails on what this test rules out.
//
//   node --test scripts/qa/render/partials/footer.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import rfFooter, { elementsHtml, outerHtml, textOf } from '../../raw-html/assertions/rf-footer.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import {
    readFixture, renderPartial, themeConfig, THEME_DIR,
} from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => readFixture(path.join(HERE, 'footer', `${name}.json`));
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang', 'en.json'), 'utf8'));
const NEWSLETTER = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'content', 'pages', '1895766', 'newsletter.json'), 'utf8'));
const YEAR = String(new Date().getFullYear());
const SPRING_BANNER = {
    id: 3, 'banner-name': 'Spring', location: 'bottom', content: '<p>Spring sale</p>',
};

const render = (name, overrides = {}, options = {}) => {
    const context = { ...fixture(name), ...overrides };
    if (overrides.theme_settings) context.theme_settings = { ...fixture(name).theme_settings, ...overrides.theme_settings };
    if (overrides.settings) context.settings = { ...fixture(name).settings, ...overrides.settings };
    return renderPartial('components/reelflies/footer', context, options);
};

// The parts of the footer, each an element's whole markup.
const part = (html, attribute) => outerHtml(html, tag => attribute in tag.attrs);
const column = (html, heading) => elementsHtml(html, tag => tag.name === 'article').find(article => textOf(article).startsWith(heading)) ?? null;
const links = html => findTags(html, 'a').map(tag => tag.attrs);
const linkTexts = html => elementsHtml(html, tag => tag.name === 'a').map(textOf);
const page = html => ({
    kind: 'home', key: 'home', path: '/', url: 'http://localhost:3601/', status: 200, html: `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><div class="body" id="main-content"></div>${html}</body></html>`,
});

describe('the footer.html hook', () => {
    it('keeps the bottom banners above the footer and renders the ReelFlies footer, once, with the site seal region inside it', async () => {
        const html = await renderPartial('components/common/footer', {
            ...fixture('tree-4'),
            banners: { bottom: true, bottom_metadata: [SPRING_BANNER] },
        }, { regions: { 'ssl_site_seal--global': '<div data-rf-test-seal></div>' } });
        const footers = findTags(html, 'footer');
        assert.equal(footers.length, 1);
        assert.ok('data-rf-footer' in footers[0].attrs);
        assert.ok(html.indexOf('data-banner-location="bottom"') < html.indexOf('<footer'), 'the banners come first');
        assert.match(part(html, 'data-rf-footer'), /data-rf-test-seal/);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('is the contentinfo landmark on the forest ground, with the gold focus ring (.rf-on-dark)', async () => {
        const [footer] = findTags(await render('tree-4'), 'footer');
        assert.equal(footer.attrs.role, 'contentinfo');
        assert.deepEqual(footer.attrs.class.split(/\s+/), ['footer', 'rf-footer', 'rf-on-dark']);
    });
});

describe('the Shop column', () => {
    it('lists the six Fly Types in rf_menu_type_ids order, then Flies by Species, never in the store\'s order', async () => {
        const html = await render('tree-4');
        const shop = part(html, 'data-rf-footer-shop');
        assert.deepEqual(linkTexts(shop), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies', 'Flies by Species']);
        assert.deepEqual(links(shop).map(attrs => attrs['data-rf-menu-id']), ['601', '602', '603', '604', '605', '606', '700']);
        assert.equal(links(shop)[6].href, 'https://reelflies.ca/species/');
        assert.equal(findTags(shop, 'li').length, 7);
        assert.equal(part(html, 'data-rf-footer-categories'), null, 'no stock Categories column beside it');
        assert.deepEqual(rfFooter.check(page(html)), []);
    });

    it('declares the ids it was given, which the raw-HTML check holds the links to', async () => {
        const [list] = findTags(part(await render('tree-4'), 'data-rf-footer-shop'), 'ul');
        assert.equal(list.attrs['data-rf-menu-type-ids'], '601, 602,603,604 ,605,606');
        assert.equal(list.attrs['data-rf-menu-species-root-id'], '700');
    });

    it('finds tree 1\'s Fly Types one level down, in channel 1\'s variation order, with no Species link (ticket 53)', async () => {
        const html = await render('tree-1', {}, { variation: 'ReelFlies CA channel 1' });
        const shop = part(html, 'data-rf-footer-shop');
        assert.equal(themeConfig('ReelFlies CA channel 1').settings.rf_menu_type_ids, '298,251,255,272,438');
        assert.deepEqual(linkTexts(shop), ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies']);
        assert.equal(findTags(shop, 'li').length, 5, 'no empty item for the empty Species id');
        assert.deepEqual(rfFooter.check(page(html)), []);
    });

    it('lists the Species root alone when only it is set', async () => {
        const shop = part(await render('tree-4', { theme_settings: { rf_menu_type_ids: '' } }), 'data-rf-footer-shop');
        assert.deepEqual(linkTexts(shop), ['Flies by Species']);
    });

    it('skips an id the channel\'s tree doesn\'t hold, and a stray comma', async () => {
        const shop = part(await render('tree-4', { theme_settings: { rf_menu_type_ids: '601,,9999,602,', rf_menu_species_root_id: '' } }), 'data-rf-footer-shop');
        assert.deepEqual(linkTexts(shop), ['Dry Flies', 'Nymphs']);
    });

    it('falls back to the stock Categories column, every top-level category, when both ids are empty', async () => {
        const html = await render('tree-4', { theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } });
        assert.equal(part(html, 'data-rf-footer-shop'), null);
        const stock = part(html, 'data-rf-footer-categories');
        assert.deepEqual(linkTexts(stock), ['Fly Gear', 'Eggs & Worms', 'Dry Flies', 'Nymphs', 'Flies by Species', 'Streamers', 'Saltwater Flies', 'Warmwater Flies']);
        assert.match(textOf(column(html, LANG.footer.categories)), new RegExp(`^${LANG.footer.categories}`));
        assert.deepEqual(unbalancedTags(html), []);
        assert.deepEqual(rfFooter.check(page(html)), []);
    });

    it('falls back on ReelFlies_CA today, which has no categories, and nothing breaks', async () => {
        const html = await render('prelaunch');
        assert.equal(themeConfig('ReelFlies CA').settings.rf_menu_type_ids, '');
        assert.equal(part(html, 'data-rf-footer-shop'), null);
        assert.notEqual(part(html, 'data-rf-footer-categories'), null);
        assert.deepEqual(unbalancedTags(html), []);
        assert.deepEqual(rfFooter.check(page(html)), []);
    });
});

describe('the Help column', () => {
    it('lists Shipping & Returns, the hook size chart, Fly fishing articles, Contact, About, Privacy and Gift Certificates, in that order', async () => {
        const help = column(await render('tree-4'), 'Help');
        assert.deepEqual(linkTexts(help), ['Shipping & Returns', 'Hook size chart', 'Fly fishing articles', 'Contact Us', 'About Us', 'Privacy Policy', 'Gift Certificates']);
        assert.deepEqual(links(help).map(attrs => attrs.href), [
            'https://reelflies.ca/shipping-returns/', '/fly-hook-size-chart/', '/blog/', 'https://reelflies.ca/contact-us/',
            'https://reelflies.ca/about-us/', 'https://reelflies.ca/privacy-policy/', 'https://reelflies.ca/giftcertificates.php',
        ]);
    });

    it('takes the Web Page links from the channel\'s own pages, so a page the channel lacks is left out', async () => {
        const help = column(await render('prelaunch'), 'Help');
        assert.deepEqual(linkTexts(help), ['Hook size chart', 'Fly fishing articles', 'Gift Certificates']);
    });

    it('leaves out the articles link without the blog, and Gift Certificates when they are off', async () => {
        const help = column(await render('tree-4', { settings: { blog_enabled: false, gift_certificates_enabled: false } }), 'Help');
        assert.deepEqual(linkTexts(help), ['Shipping & Returns', 'Hook size chart', 'Contact Us', 'About Us', 'Privacy Policy']);
    });

    it('links each Web Page once, although channel 1 lists Gift Certificates among its pages too', async () => {
        const help = column(await render('tree-1', {}, { variation: 'ReelFlies CA channel 1' }), 'Help');
        assert.equal(linkTexts(help).filter(text => text === 'Gift Certificates').length, 1);
        assert.equal(linkTexts(help).length, 7);
    });
});

describe('the Contact column', () => {
    it('shows the store profile\'s address and phone number, with a tel: link, and walk-ins by appointment', async () => {
        const contact = column(await render('tree-4'), 'Contact');
        assert.match(contact, /<address[^>]*>Digital Barn Ltd\.<br>\s*93 Broadway St\.<br>\s*Tillsonburg, ON N4G 3P5<\/address>/);
        const phone = links(contact).find(attrs => attrs.href.startsWith('tel:'));
        assert.equal(phone.href, 'tel:+18662504071');
        assert.ok(linkTexts(contact).includes('1 866 250 4071'));
        assert.match(textOf(contact), /Walk-ins by appointment/);
    });

    it('leaves out the address and the phone link when the store profile has none', async () => {
        const contact = column(await render('tree-4', { settings: { address: '', phone_number: '' } }), 'Contact');
        assert.equal(findTags(contact, 'address').length, 0);
        assert.ok(!links(contact).some(attrs => attrs.href.startsWith('tel:')));
        assert.match(textOf(contact), /Walk-ins by appointment/);
    });

    it('shows the social row under it with Cornerstone\'s social links, each with an accessible name', async () => {
        const contact = column(await render('tree-4'), 'Contact');
        const social = links(contact).filter(attrs => /facebook|instagram|youtube/.test(attrs.href));
        assert.deepEqual(social.map(attrs => attrs.title), ['Facebook', 'Instagram', 'Youtube']);
        assert.deepEqual(findTags(contact, 'span').filter(tag => tag.attrs.class === 'aria-description--hidden').length, 3);
        assert.match(contact, /<span class="aria-description--hidden">Facebook<\/span>/);
    });

    it('drops the social row when social_icon_placement_bottom is bottom_none', async () => {
        const contact = column(await render('tree-4', { theme_settings: { social_icon_placement_bottom: 'bottom_none' } }), 'Contact');
        assert.ok(!links(contact).some(attrs => /facebook/.test(attrs.href)));
    });
});

describe('the Newsletter column', () => {
    it('has a visible label tied to the email field, the line above it and the CASL consent below it, from lang strings', async () => {
        const newsletter = column(await render('tree-4'), 'Newsletter');
        const [label] = findTags(newsletter, 'label');
        const [email] = findTags(newsletter, 'input').filter(tag => tag.attrs.type === 'email');
        assert.equal(label.attrs.for, email.attrs.id);
        assert.doesNotMatch(label.attrs.class || '', /srOnly|u-hiddenVisually/);
        assert.equal(textOf(outerHtml(newsletter, tag => tag.name === 'label')), 'Email address');
        assert.equal(email.attrs.name, 'nl_email');
        assert.equal(email.attrs.autocomplete, 'email');
        assert.ok('required' in email.attrs);
        const consent = outerHtml(newsletter, tag => tag.attrs.id === email.attrs['aria-describedby']);
        assert.equal(textOf(consent), NEWSLETTER.consent);
        assert.match(textOf(newsletter), new RegExp(NEWSLETTER.line.replace(/\./g, '\\.')));
        assert.doesNotMatch(newsletter, /store's own newsletter summary/);
    });

    it('posts to the store\'s subscribe action with the stock form\'s fields', async () => {
        const newsletter = column(await render('tree-4'), 'Newsletter');
        const [form] = findTags(newsletter, 'form');
        assert.equal(form.attrs.action, 'https://reelflies.ca/subscribe.php');
        assert.equal(form.attrs.method, 'post');
        const hidden = Object.fromEntries(findTags(newsletter, 'input').filter(tag => tag.attrs.type === 'hidden').map(tag => [tag.attrs.name, tag.attrs.value]));
        assert.deepEqual(hidden, { action: 'subscribe', nl_first_name: 'bc', check: '1' });
        assert.equal(findTags(newsletter, 'button').filter(tag => tag.attrs.type === 'submit').length, 1);
    });

    it('is left out when the store turns the newsletter box off', async () => {
        const html = await render('tree-4', { settings: { show_newsletter_box: 0 } });
        assert.equal(column(html, 'Newsletter'), null);
        assert.equal(findTags(html, 'form').length, 0);
    });

    it('copies ticket 22\'s source of record word for word (content/pages/1895766/newsletter.json)', () => {
        assert.equal(LANG.reelflies.footer.newsletter_line, NEWSLETTER.line);
        assert.equal(LANG.reelflies.footer.newsletter_consent, NEWSLETTER.consent);
    });
});

describe('the base row', () => {
    it('has the promise line, the copyright and the outside-Canada link, a real link to reelflies.com', async () => {
        const base = part(await render('tree-4'), 'data-rf-footer-base');
        const text = textOf(base);
        assert.match(text, /We stand behind every fly we sell\./);
        assert.match(text, new RegExp(`© ${YEAR} ReelFlies\\.ca\\. ReelFlies® is a registered trademark of Digital Barn Ltd\\.`));
        assert.match(text, /Ordering from outside Canada\? Shop at ReelFlies\.com/);
        const com = links(base).filter(attrs => attrs.href === 'https://reelflies.com/');
        assert.equal(com.length, 1);
        assert.ok('data-rf-com-link' in com[0], 'ticket 52\'s handler finds it by data-rf-com-link');
    });

    it('shows no payment icons while ticket 24 has none turned on, and Cornerstone\'s icons once it does', async () => {
        assert.equal(findTags(await render('tree-4'), 'ul').filter(tag => tag.attrs.class === 'footer-payment-icons').length, 0);
        const html = await render('tree-4', { theme_settings: { show_accept_visa: true, show_accept_mastercard: true, show_accept_amex: true } });
        assert.notEqual(outerHtml(html, tag => tag.attrs.class === 'footer-payment-icons'), null);
        // Read from the raw HTML: outerHtml leaves <title> text out, as a crawler's markup view does.
        const icons = html.slice(html.indexOf('footer-payment-icons'), html.lastIndexOf('</ul>'));
        assert.deepEqual([...icons.matchAll(/<title>([^<]+)<\/title>/g)].map(([, title]) => title), ['American Express', 'Mastercard', 'Visa']);
        assert.ok(html.indexOf('footer-payment-icons') > html.indexOf('data-rf-footer-base'), 'in the base row');
    });
});

describe('what the footer never shows', () => {
    it('has no "Powered by" and no Brands column, whatever the settings say', async () => {
        const html = await render('tree-4', { theme_settings: { show_powered_by: true, shop_by_brand_show_footer: true } });
        assert.doesNotMatch(textOf(html), /powered by/i);
        assert.ok(!findTags(html).some(tag => tag.attrs['data-section-type'] === 'footer-brands'));
        assert.ok(!links(html).some(attrs => attrs.href === 'https://reelflies.ca/brands/ReelFlies.html'));
    });

    it('renders balanced markup, with h2 column headings', async () => {
        const html = await render('tree-4');
        assert.deepEqual(unbalancedTags(html), []);
        assert.deepEqual(findTags(html, 'h2').length, 4);
        assert.equal(findTags(html, 'h1').length + findTags(html, 'h3').length, 0);
    });
});

describe('the strings and settings', () => {
    it('keeps every footer string under reelflies.footer, after the slot', () => {
        const footer = LANG.reelflies.footer;
        assert.equal(Object.keys(footer)[0], '_slot');
        assert.equal(footer.promise, 'We stand behind every fly we sell.');
        assert.equal(footer.copyright, '© {year} ReelFlies.ca. ReelFlies® is a registered trademark of Digital Barn Ltd.');
        assert.equal(footer.outside_canada, 'Ordering from outside Canada?');
        assert.equal(footer.outside_canada_link, 'Shop at ReelFlies.com');
        assert.equal(footer.walk_ins, 'Walk-ins by appointment');
        assert.equal(footer.articles, 'Fly fishing articles');
    });

    it('turns off "Powered by" and the Brands column, turns the social row on, and sets the forest ground, on every variation', () => {
        for (const { name } of JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8')).variations) {
            const { settings } = themeConfig(name);
            assert.equal(settings.show_powered_by, false, name);
            assert.equal(settings.shop_by_brand_show_footer, false, name);
            assert.equal(settings.social_icon_placement_bottom, 'bottom_left', name);
            assert.equal(settings['footer-backgroundColor'], '#2f382f', name);
        }
    });
});
