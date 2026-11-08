// The ReelFlies header in the server HTML (ticket 27; spec module 2, stories 4, 9 and 68; redrawn
// for Streamside Stone, DESIGN.md "Navigation"), on every page: components/reelflies/header.html,
// which components/common/header.html includes in place of the stock <header>.
//
// - One <header data-rf-head>, holding no <h1>. Stock made the logo the home page's <h1>
//   (header.html:19-22), which gave home two once the hero was placed.
// - The logo is one link, <a class="rf-brand" href>, with a name: its image's alt, or the store's
//   name as text when the store has no logo image.
// - The Menu control (data-rf-drawer-open) is a <button type="button"> with aria-expanded="false"
//   and aria-controls naming the drawer (data-rf-drawer), and a label (stock had a link reading
//   "Toggle menu").
// - One named <nav> in the header (the drawer's is outside it), one search form with
//   role="search" (data-rf-search), and the Box link (data-rf-box-btn) with the count order-line.js
//   fills (data-rf-count).
// - No Compare, Gift Certificates or wish list link anywhere in the header (stock O04; UX-20), and
//   none of the stock header's navigation (.navPages, the "Toggle menu" link) beside it.
//
// Retired with the redesign: the logo's <div data-rf-logo> (now a.rf-brand), the stock toggle
// (data-mobile-menu-toggle) and the one-row wrapper (data-rf-header-row).
//
// elementSource is html.mjs's outerHtml under the name this ticket's tests and the menu tests
// import; headerSource is the header's markup. New readers import outerHtml from html.mjs.

import { findTags, outerHtml, textOf } from '../html.mjs';

const STOCK_ONLY_LINKS = /(^|\/)(compare(\/|$|\?)|giftcertificates\.php|wishlist\.php)/i;
const hasClass = (name, attrs) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

// The outer markup of the first <name> element whose attributes pass `test`, or null: html.mjs's
// outerHtml, which counts nested elements of the same name, so a <div> holding <div>s comes back
// whole. The name stays for this ticket's and ticket 28's callers.
export const elementSource = outerHtml;

// The ReelFlies header's markup (<header data-rf-head>), or null.
export const headerSource = html => outerHtml(html, 'header', attrs => 'data-rf-head' in attrs);

export function headerProblems(html) {
    const headers = findTags(html, 'header').filter(tag => 'data-rf-head' in tag.attrs);
    if (headers.length !== 1) return [`${headers.length} ReelFlies headers (<header data-rf-head>), not 1: components/common/header.html includes components/reelflies/header`];
    const problems = [];
    const header = headerSource(html);

    const headings = findTags(header, 'h1').length;
    if (headings) problems.push(`the header holds ${headings} <h1>: the page's own heading is its only <h1>`);

    const brands = findTags(header).filter(tag => hasClass('rf-brand', tag.attrs));
    if (brands.length !== 1) {
        problems.push(`${brands.length} logos (.rf-brand), not 1`);
    } else if (brands[0].name !== 'a') {
        problems.push(`the logo is a <${brands[0].name}>, not a link home`);
    } else if (!brands[0].attrs.href) {
        problems.push('the logo link has no href');
    } else {
        const brand = outerHtml(header, 'a', attrs => hasClass('rf-brand', attrs));
        const imgs = findTags(brand, 'img');
        if (imgs.length > 1) problems.push(`the logo link holds ${imgs.length} images, not 1`);
        const name = imgs.length ? (imgs[0].attrs.alt || '').trim() : textOf(brand);
        if (!name) problems.push('the logo link has no name: its image\'s alt, or the store\'s name as text');
    }

    const toggles = findTags(header).filter(tag => 'data-rf-drawer-open' in tag.attrs);
    if (toggles.length !== 1) {
        problems.push(`${toggles.length} Menu controls (data-rf-drawer-open) in the header, not 1`);
    } else if (toggles[0].name !== 'button') {
        problems.push(`the Menu control is a <${toggles[0].name}>, not a <button>`);
    } else {
        const [toggle] = toggles;
        if (toggle.attrs.type !== 'button') problems.push('the Menu button isn\'t type="button"');
        if (toggle.attrs['aria-expanded'] !== 'false') problems.push(`the Menu button has aria-expanded "${toggle.attrs['aria-expanded'] ?? ''}", not "false"`);
        const controls = toggle.attrs['aria-controls'];
        if (!controls) {
            problems.push('the Menu button has no aria-controls');
        } else {
            const target = findTags(html).find(tag => tag.attrs.id === controls);
            if (!target) problems.push(`the Menu button controls "${controls}", which isn't on the page`);
            else if (!('data-rf-drawer' in target.attrs)) problems.push(`the Menu button controls "${controls}", which isn't the drawer (data-rf-drawer)`);
        }
        if (!textOf(outerHtml(header, 'button', attrs => 'data-rf-drawer-open' in attrs))) problems.push('the Menu button has no label');
    }

    const navs = findTags(header, 'nav');
    if (navs.length !== 1) problems.push(`${navs.length} <nav> in the header, not 1`);
    else if (!(navs[0].attrs['aria-label'] || '').trim()) problems.push('the header\'s <nav> has no aria-label');

    const forms = findTags(header, 'form').filter(tag => 'data-rf-search' in tag.attrs);
    if (forms.length !== 1) problems.push(`${forms.length} search forms (form[data-rf-search]) in the header, not 1`);
    else if (forms[0].attrs.role !== 'search') problems.push('the header\'s search form has no role="search"');

    const boxes = findTags(header).filter(tag => 'data-rf-box-btn' in tag.attrs);
    if (boxes.length !== 1) {
        problems.push(`${boxes.length} Box links (data-rf-box-btn) in the header, not 1`);
    } else {
        if (boxes[0].name !== 'a' || !boxes[0].attrs.href) problems.push('the Box isn\'t a link with an href: it goes to the cart without JavaScript');
        const box = outerHtml(header, boxes[0].name, attrs => 'data-rf-box-btn' in attrs);
        if (!findTags(box).some(tag => 'data-rf-count' in tag.attrs)) problems.push('the Box link has no count (data-rf-count) for order-line.js to fill');
    }

    const stockOnly = findTags(header, 'a').map(tag => tag.attrs.href || '').filter(href => STOCK_ONLY_LINKS.test(href));
    if (stockOnly.length) problems.push(`the header links to ${stockOnly.join(', ')}: Compare, Gift Certificates and wish lists aren't in the header`);
    const stock = findTags(html).filter(tag => hasClass('navPages', tag.attrs) || hasClass('mobileMenu-toggle', tag.attrs) || 'data-mobile-menu-toggle' in tag.attrs);
    if (stock.length) problems.push(`the stock header's navigation renders beside the ReelFlies one (${stock.length} element(s): .navPages or the "Toggle menu" link)`);
    return problems;
}

export default {
    id: 'rf-header',
    ticket: 27,
    description: 'one ReelFlies <header> with no <h1>: the logo one link with a name, Menu a <button> with aria-expanded, aria-controls to the drawer and a label, one named <nav>, one search form, the Box link with its count, and no Compare, Gift Certificates, wish list or stock navigation',
    check(page) {
        return headerProblems(page.html);
    },
};
