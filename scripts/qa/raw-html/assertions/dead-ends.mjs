// The three dead ends as a crawler gets them (ticket 51; spec module 24; O20, O24; stories 66 and
// 68): the 404 page, the empty cart and a search with no results.
//
// - Each has exactly one <h1> (one-main already holds the one main landmark): stock's 404
//   heading and its focusable empty-cart <h3> are gone, and the ReelFlies heading or line takes
//   their place.
// - The 404 page: the ReelFlies block (data-rf-not-found) inside the <main>, with the stock search
//   box, a form to the search page.
// - The empty cart (a cart pin with data-rf-cart-empty): no heading that takes focus, and the way
//   forward, "Shop dry flies" or "Continue shopping", a link with a URL.
// - A search with no results: the help (data-rf-search-empty), with the no-match line naming the
//   query as the pin asked for it, as text; on search@none, the pin that asks for a word nothing
//   matches, the help must be there. Stock's own no-match line and tips never show beside it.
// - The Fly Type links (404-links.html), wherever a dead end has them: the list declares the ids
//   it was given (data-rf-menu-type-ids, data-rf-menu-species-root-id), and its links
//   (data-rf-menu-id) must be exactly those ids, in that order, with at least one, as rf-footer
//   holds the footer's Shop column. So on prelaunch, once tree 4's ids are set (wave R1), the curl
//   run proves the six Fly Types and Flies by Species are server-rendered links in menu order
//   (story 66). With both ids empty there is no list, and no empty <ul> in the dead end.
//
// The fixture test (render/partials/dead-ends.test.mjs) holds the copy, the order and the escaping.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

const LANG = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../lang/en.json'), 'utf8'));
const STOCK_TIPS = LANG.forms.search.suggestions.title;
const STOCK_NO_MATCH = LANG.forms.search.no_match;
const EMPTY_SEARCH_PIN = 'search@none';

const idList = value => decodeHtml(value || '').split(',').map(id => id.trim()).filter(Boolean);
const block = (html, attr) => outerHtml(html, 'div', attrs => attr in attrs) || outerHtml(html, 'section', attrs => attr in attrs);

// The links list in one dead end: exactly the declared ids, in order, at least one; or no list
// and no empty <ul> at all.
export function linkProblems(deadEnd, where) {
    const list = outerHtml(deadEnd, 'ul', attrs => 'data-rf-dead-end-links' in attrs);
    if (!list) {
        const lists = elementsHtml(deadEnd, 'ul', () => true).filter(ul => !findTags(ul, 'li').length);
        return lists.length ? [`an empty list in the ${where}`] : [];
    }
    const [tag] = findTags(list);
    const expected = [...idList(tag.attrs['data-rf-menu-type-ids']), ...idList(tag.attrs['data-rf-menu-species-root-id'])];
    const anchors = findTags(list, 'a');
    const got = anchors.map(anchor => anchor.attrs['data-rf-menu-id'] ?? '?');
    const problems = [];
    if (!anchors.length) problems.push(`the ${where}'s Fly Type list has no links: the menu ids resolve to nothing (only commas, or no id the channel's tree holds)`);
    if (got.join() !== expected.join()) problems.push(`the ${where}'s Fly Type links are ${got.join(', ') || 'none'}, not the ids declared, ${expected.join(', ')}: an id the channel's tree doesn't hold, or links out of order (data-rf-menu-id)`);
    anchors.filter(anchor => !decodeHtml(anchor.attrs.href || '').trim()).forEach(anchor => problems.push(`a Fly Type link with no URL in the ${where}: ${anchor.raw}`));
    return problems;
}

function oneH1(page) {
    const count = findTags(page.html, 'h1').length;
    return count === 1 ? [] : [`${count} <h1> elements, not exactly 1`];
}

function notFound(page) {
    const main = elementsHtml(page.html, 'main', () => true)[0] || '';
    const deadEnd = block(main, 'data-rf-not-found');
    if (!deadEnd) return ['no ReelFlies 404 content (data-rf-not-found) inside the <main>'];
    const problems = [];
    if (!findTags(deadEnd, 'form').some(form => decodeHtml(form.attrs.action || '').trim())) problems.push('no search box (a form with an action) in the 404 content');
    return [...problems, ...linkProblems(deadEnd, '404 page')];
}

function cart(page) {
    const deadEnd = block(page.html, 'data-rf-cart-empty');
    if (!deadEnd) return [];
    const problems = [];
    findTags(page.html).filter(tag => /^h[1-6]$/.test(tag.name) && 'tabindex' in tag.attrs && tag.attrs.tabindex.trim() !== '-1')
        .forEach(tag => problems.push(`a heading that takes focus on the empty cart: ${tag.raw}`));
    const shop = findTags(deadEnd, 'a').filter(tag => 'data-rf-cart-empty-shop' in tag.attrs);
    if (shop.length !== 1 || !decodeHtml(shop[0].attrs.href || '').trim()) problems.push('the empty cart has no way forward: one link with a URL ("Shop dry flies", or "Continue shopping")');
    return [...problems, ...linkProblems(deadEnd, 'empty cart')];
}

function search(page) {
    const deadEnd = block(page.html, 'data-rf-search-empty');
    const problems = [];
    const text = textOf(page.html);
    if (!deadEnd) {
        if (page.key === EMPTY_SEARCH_PIN) problems.push(`no help for a search with no results (data-rf-search-empty) on ${EMPTY_SEARCH_PIN}, the pin that asks for a word nothing matches`);
        return problems;
    }
    const query = new URL(page.url || page.path, 'http://localhost/').searchParams.get('search_query') || '';
    const line = textOf(outerHtml(deadEnd, 'p', attrs => 'data-rf-search-empty-line' in attrs) || '');
    if (query && !line.includes(`“${query.trim()}”`)) problems.push(`the no-match line "${line}" doesn't name the query "${query}" as text`);
    if (text.includes(STOCK_TIPS)) problems.push(`stock's tips ("${STOCK_TIPS}") show beside the ReelFlies help`);
    if (text.includes(STOCK_NO_MATCH)) problems.push(`stock's no-match line ("${STOCK_NO_MATCH}") shows beside the ReelFlies help`);
    return [...problems, ...linkProblems(deadEnd, 'search help')];
}

const BY_KIND = { 404: notFound, cart, search };

export default {
    id: 'dead-ends',
    ticket: 51,
    description: 'the 404 page, the empty cart and a search with no results: one <h1> each, the 404 content with its search box, no focusable heading and a way forward on the empty cart, the search help naming the query (required on search@none), and their Fly Type links exactly the declared menu ids, in order, or no list',
    pages: ['404', 'cart', 'search'],
    check(page) {
        return [...oneH1(page), ...BY_KIND[page.kind](page)];
    },
};
