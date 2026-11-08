// The ReelFlies footer as a crawler gets it (ticket 50, redrawn for the Streamside Stone redesign;
// spec module 20; stories 63, 64 and 65). On every page kind:
//
// - exactly one <footer>, and it is the ReelFlies one (data-rf-foot, components/reelflies/footer.html)
// - the base row (.rf-foot__base): the copyright and trademark line in the words of lang/en.json's
//   reelflies.footer.copyright, and the other storefront as a real link (<a href>), the same for
//   every visitor with no script needed (story 63; R7). The link is one config.json declares,
//   rf_alt_store_url with rf_alt_store_foot as its words, in the base settings or a variation
//   (reelflies.com from the .ca storefronts, reelflies.ca from the .com preview). stencil start
//   strips the channel's own URL from the pages it serves, so a declared URL also matches with
//   its origin gone.
// - the newsletter (form.rf-news), while the store's newsletter box is on: stock's subscribe
//   action, method and nl_email field, and the CASL wording of record as its heading and consent
//   (content/pages/1895766/newsletter.json, ticket 22), the consent tied to the field
// - every <nav> in the footer is labelled by a heading of its own (aria-labelledby, resolving
//   inside the footer) and holds at least one link, and every footer link has a URL: a Fly types
//   column whose menu ids resolved to nothing would stand here as an empty labelled nav
// - each phone link (tel:) dials +1 and ten digits, a North American number (RFC 3966's visual
//   separators allowed), so a number typed in a form the footer can't dial fails here, not silently
// - the social row (ul.rf-foot__social), when the store has links: text links, each with words
//   and an https URL (the home page's sameAs lists the same set: store-schema)
// - no "Powered by" anywhere on the page, and no Brands column (data-section-type footer-brands)
//
// Gone with master's footer: the promise line, the Shop column's declared ids (the redesign's
// lists carry no data-rf-menu-id; footer.test.mjs holds the links themselves) and the stock
// Categories fallback (with no menu ids the Fly types column is left out).
//
// The fixture test (render/partials/footer.test.mjs) holds the copy itself and the columns' links.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

const THEME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const json = file => JSON.parse(fs.readFileSync(path.join(THEME_DIR, file), 'utf8'));
const LANG = json('lang/en.json');
const CONFIG = json('config.json');
const STRINGS = LANG.reelflies.footer;
export const NEWSLETTER = json('content/pages/1895766/newsletter.json');
export const MARKER = 'data-rf-foot';

// The other storefronts the theme declares: each variation's rf_alt_store_url (over the base
// settings) with its rf_alt_store_foot, those with a URL, each pair once.
const settingsOf = [CONFIG.settings, ...(CONFIG.variations || []).map(variation => ({ ...CONFIG.settings, ...variation.settings }))];
export const ALT_STORES = [...new Map(settingsOf
    .filter(settings => String(settings.rf_alt_store_url ?? '').trim())
    .map(settings => ({ url: String(settings.rf_alt_store_url).trim(), text: String(settings.rf_alt_store_foot ?? '').trim() }))
    .map(store => [`${store.url}\n${store.text}`, store])).values()];

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COPYRIGHT = new RegExp(escape(STRINGS.copyright).replace(escape('{year}'), '\\d{4}').replace(escape('{holder}'), '.+?'));
const classed = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const href = tag => decodeHtml(tag.attrs.href || '').trim();

// A tel: link the footer can dial: +1 and ten digits, with RFC 3966's visual separators allowed.
export const dialable = link => /^tel:\+1[\d().-]*$/.test(link) && link.replace(/\D/g, '').length === 11;

// What stencil start serves a declared URL as on the channel whose own URL it is.
const withoutOrigin = url => url.replace(/^https?:\/\/[^/]+/, '');

function baseRowProblems(footer) {
    const base = outerHtml(footer, 'div', classed('rf-foot__base'));
    if (!base) return ['no base row (.rf-foot__base) in the footer'];
    const problems = [];
    if (!COPYRIGHT.test(textOf(base))) problems.push(`the copyright "${STRINGS.copyright}" isn't in the base row`);
    const links = elementsHtml(base, 'a');
    if (!ALT_STORES.length) {
        if (links.length) problems.push(`${links.length} link(s) in the base row, where config.json declares no other storefront (rf_alt_store_url)`);
        return problems;
    }
    if (links.length !== 1) {
        return [...problems, `${links.length ? `${links.length} links` : 'no link'} in the base row, where the other storefront needs one <a href> (rf_alt_store_url)`];
    }
    const [link] = findTags(links[0], 'a');
    const url = href(link);
    const text = textOf(links[0]);
    const declared = ALT_STORES.find(store => (store.url === url || withoutOrigin(store.url) === url) && store.text === text);
    if (!declared) {
        problems.push(`the base row's link "${text}" to ${url || '(no URL)'} isn't an other storefront config.json declares (${ALT_STORES.map(store => `"${store.text}" to ${store.url}`).join('; ')})`);
    }
    return problems;
}

function newsletterProblems(footer) {
    const form = outerHtml(footer, 'form', classed('rf-news'));
    if (!form) return [];
    const problems = [];
    const [{ attrs: formAttrs }] = findTags(form, 'form');
    if (!/\/subscribe\.php$/.test(decodeHtml(formAttrs.action || '').trim())) problems.push(`the newsletter form posts to "${formAttrs.action ?? ''}", not the store's subscribe.php`);
    if ((formAttrs.method || '').toLowerCase() !== 'post') problems.push(`the newsletter form's method is "${formAttrs.method ?? ''}", not post`);
    const inputs = findTags(form, 'input');
    const hidden = Object.fromEntries(inputs.filter(tag => tag.attrs.type === 'hidden').map(tag => [tag.attrs.name, tag.attrs.value]));
    if (hidden.action !== 'subscribe') problems.push('the newsletter form has no hidden action=subscribe, stock subscription-form.html\'s');
    const email = inputs.find(tag => tag.attrs.type === 'email');
    if (!email || email.attrs.name !== 'nl_email') return [...problems, 'the newsletter form has no email field named nl_email'];
    if (!findTags(form, 'label').some(tag => tag.attrs.for && tag.attrs.for === email.attrs.id)) problems.push('the newsletter\'s email field has no <label for> of its own');
    const heading = elementsHtml(form, 'h[1-6]').map(textOf);
    if (!heading.includes(NEWSLETTER.line)) problems.push(`the newsletter's heading isn't the line of record, "${NEWSLETTER.line}" (content/pages/1895766/newsletter.json)`);
    const consent = email.attrs['aria-describedby'] ? outerHtml(form, 'p', attrs => attrs.id === email.attrs['aria-describedby']) : null;
    if (!consent) problems.push('the newsletter\'s email field doesn\'t describe itself by the consent line (aria-describedby)');
    else if (textOf(consent) !== NEWSLETTER.consent) problems.push(`the newsletter's consent isn't the wording of record, "${NEWSLETTER.consent}" (content/pages/1895766/newsletter.json)`);
    return problems;
}

function navProblems(footer) {
    const problems = [];
    const ids = new Set(findTags(footer).map(tag => tag.attrs.id).filter(Boolean));
    elementsHtml(footer, 'nav').forEach(nav => {
        const [{ attrs }] = findTags(nav, 'nav');
        const label = (attrs['aria-labelledby'] || '').trim();
        if (!label || !ids.has(label)) problems.push(`a footer nav isn't labelled by a heading in the footer (aria-labelledby="${label}"): ${nav.slice(0, 80)}`);
        if (!findTags(nav, 'a').length) problems.push(`the footer nav "${label}" has no links`);
    });
    findTags(footer, 'a').filter(tag => !href(tag)).forEach(tag => problems.push(`a footer link with no URL: ${tag.raw}`));
    return problems;
}

function socialProblems(footer) {
    const row = outerHtml(footer, 'ul', classed('rf-foot__social'));
    if (!row) return [];
    const problems = [];
    const links = elementsHtml(row, 'a');
    if (!links.length) problems.push('a social row (ul.rf-foot__social) with no links');
    links.forEach(link => {
        const [tag] = findTags(link, 'a');
        if (!textOf(link)) problems.push(`a social link with no words: ${tag.raw}`);
        if (!/^https:\/\//.test(href(tag))) problems.push(`a social link that isn't https: ${tag.raw}`);
    });
    return problems;
}

export default {
    id: 'rf-footer',
    ticket: 50,
    description: 'the ReelFlies footer once: the copyright and the other storefront\'s link in the base row, the newsletter in the CASL words of record, labelled navs with links, phone links +1 and ten digits, a social row of text links, no "Powered by" and no Brands column',
    check(page) {
        const problems = [];
        const footers = findTags(page.html, 'footer');
        if (footers.length !== 1) problems.push(`${footers.length} <footer> elements`);
        if (/\bpowered by\b/i.test(textOf(page.html))) problems.push('"Powered by" is on the page');
        if (findTags(page.html).some(tag => tag.attrs['data-section-type'] === 'footer-brands')) problems.push('a Brands column (data-section-type="footer-brands") is on the page');

        const footer = outerHtml(page.html, 'footer', attrs => MARKER in attrs);
        if (!footer) return [...problems, `no ReelFlies footer (<footer ${MARKER}>)`];

        findTags(footer, 'a').map(href).filter(link => /^tel:/i.test(link) && !dialable(link))
            .forEach(link => problems.push(`the phone link ${link} isn't tel:+1 and ten digits: the store phone (rf_store_phone, or the store profile's) is in a form the footer can't dial`));
        return [...problems, ...baseRowProblems(footer), ...newsletterProblems(footer), ...navProblems(footer), ...socialProblems(footer)];
    },
};
