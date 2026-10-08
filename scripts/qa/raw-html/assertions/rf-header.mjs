// The ReelFlies header in the server HTML (ticket 27; spec module 2, stories 4, 9 and 68), on
// every page: components/reelflies/header.html, which components/common/header.html includes in
// place of the stock <header>.
//
// - One <header data-rf-header>, holding no <h1>.
// - The logo is a <div data-rf-logo> holding one link, and no element with the stock logo's class
//   (.header-logo) is an <h1>. Stock made the logo the home page's <h1> (header.html:19-22), which
//   gives home two once ticket 46's hero is placed.
// - The Menu control is a <button> with aria-expanded and a visible label (stock had a link
//   reading "Toggle menu").
// - The header row links to no Compare, Gift Certificates or wish list page (stock O04; UX-20).
//   The phone drawer (#menu) is ticket 28's, so only the row is read.
//
// elementSource and headerRowSource are shared with this ticket's tests and the header's render
// tests, and elementSource with ticket 28's rf-menu assertion and menu render test. New readers
// import outerHtml from html.mjs.

import { findTags, outerHtml } from '../html.mjs';

const STOCK_ONLY_LINKS = /(^|\/)(compare(\/|$|\?)|giftcertificates\.php|wishlist\.php)/i;

// The outer markup of the first <name> element whose attributes pass `test`, or null: html.mjs's
// outerHtml, which counts nested elements of the same name, so a <div> holding <div>s comes back
// whole. The name stays for this ticket's and ticket 28's callers.
export const elementSource = outerHtml;

// The header's one row (data-rf-header-row): the logo, Menu, "Shop flies", search, Account, Cart.
export const headerRowSource = html => elementSource(html, 'div', attrs => 'data-rf-header-row' in attrs);

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function headerProblems(html) {
    const headers = findTags(html, 'header').filter(tag => 'data-rf-header' in tag.attrs);
    if (headers.length !== 1) return [`${headers.length} ReelFlies headers (<header data-rf-header>), not 1: components/common/header.html includes components/reelflies/header`];
    const problems = [];
    const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);

    const headings = findTags(header, 'h1').length;
    if (headings) problems.push(`the header holds ${headings} <h1>: the page's own heading is its only <h1>`);
    const logoHeadings = findTags(html, 'h1').filter(tag => /(^|\s)header-logo(\s|$)/.test(tag.attrs.class || '')).length;
    if (logoHeadings) problems.push(`${logoHeadings} <h1 class="header-logo">: the logo is never a heading`);

    const logos = findTags(html).filter(tag => 'data-rf-logo' in tag.attrs);
    if (logos.length !== 1) {
        problems.push(`${logos.length} logos (data-rf-logo), not 1`);
    } else if (logos[0].name !== 'div') {
        problems.push(`the logo is a <${logos[0].name}>, not a <div>`);
    } else {
        const links = findTags(elementSource(html, 'div', attrs => 'data-rf-logo' in attrs), 'a').filter(tag => tag.attrs.href);
        if (links.length !== 1) problems.push(`the logo's <div> holds ${links.length} links, not 1`);
    }

    const toggles = findTags(header).filter(tag => 'data-mobile-menu-toggle' in tag.attrs);
    if (toggles.length !== 1) {
        problems.push(`${toggles.length} Menu controls (data-mobile-menu-toggle) in the header, not 1`);
    } else if (toggles[0].name !== 'button') {
        problems.push(`the Menu control is a <${toggles[0].name}>, not a <button>`);
    } else {
        if (!('aria-expanded' in toggles[0].attrs)) problems.push('the Menu button has no aria-expanded');
        if (!text(elementSource(header, 'button', attrs => 'data-mobile-menu-toggle' in attrs))) problems.push('the Menu button has no visible label');
    }

    const row = headerRowSource(header);
    if (!row) {
        problems.push('the header has no row (data-rf-header-row)');
    } else {
        const stockOnly = findTags(row, 'a').map(tag => tag.attrs.href || '').filter(href => STOCK_ONLY_LINKS.test(href));
        if (stockOnly.length) problems.push(`the header row links to ${stockOnly.join(', ')}: Compare, Gift Certificates and wish lists aren't in the header`);
    }
    return problems;
}

export default {
    id: 'rf-header',
    ticket: 27,
    description: 'one ReelFlies <header> with no <h1>: the logo a link in a <div>, Menu a <button> with aria-expanded and a label, and no Compare, Gift Certificates or wish list link in its row',
    check(page) {
        return headerProblems(page.html);
    },
};
