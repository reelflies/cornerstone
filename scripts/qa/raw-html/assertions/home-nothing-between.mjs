// Nothing renders between the Fly Type cards and the tiles on the home page (ticket 47; R5,
// HOME-3): the cards end widgets/home-lead in home_below_menu, and the tiles open
// widgets/link-tiles, first in home_below_top_products. Between them the served page has more
// than the fixture page's screenshots show: the rest of home_below_menu, home.html's
// home_below_carousel and home_below_featured_products regions, the store's shipping messages
// and the stock strips (home-no-stock-strips). So a Page Builder widget dropped in any of those
// regions, one placed before the tiles in theirs, or a shipping message would push the tiles down
// and pass every other gate (rf/skeptic on #52).
//
// - Only markup that shows nothing may sit there: end tags, and <div>s (the regions' and the
//   widgets' wrappers, the theme's containers) that are no widget's own and hold no text.
//   <script>, <style> and <template> show nothing either.
// - The tiles' own widget wrapper, the last data-widget-id before them, is theirs.
// - A page without both passes: the widgets aren't placed yet, or are inactive.

import { findTags, markupOnly } from '../html.mjs';

const START = cls => new RegExp(`<[a-z][a-z0-9-]*\\b(?:[^>"']|"[^"]*"|'[^']*')*\\bclass="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"[^>]*>`, 'i');
const CARDS = START('rf-type-cards');
const TILES = START('rf-home-tiles');
const SHOWS_NOTHING = new Set(['div', 'script', 'style', 'template']);
const WHERE = 'between the Fly Type cards and the tiles';

const textOf = html => markupOnly(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

export function betweenCardsAndTiles(source) {
    const html = markupOnly(source);
    const cards = html.match(CARDS);
    const tiles = html.match(TILES);
    if (!cards || !tiles) return [];
    const cardsEnd = html.indexOf('</ul>', cards.index);
    if (tiles.index < cards.index) return ['the tiles (.rf-home-tiles) come before the Fly Type cards (.rf-type-cards) on the home page'];
    let between = html.slice(cardsEnd + '</ul>'.length, tiles.index);
    const wrappers = [...between.matchAll(/<div\b(?:[^>"']|"[^"]*"|'[^']*')*\sdata-widget-id\b/gi)];
    if (wrappers.length) between = between.slice(0, wrappers.at(-1).index);
    const problems = findTags(between).flatMap(tag => {
        if ('data-widget-id' in tag.attrs) return [`a widget sits ${WHERE}: ${tag.raw.slice(0, 120)}`];
        return SHOWS_NOTHING.has(tag.name) ? [] : [`<${tag.name}> renders ${WHERE}: ${tag.raw.slice(0, 120)}`];
    });
    const text = textOf(between);
    if (text) problems.push(`text renders ${WHERE}: "${text.slice(0, 120)}"`);
    return problems;
}

export default {
    id: 'home-nothing-between',
    ticket: 47,
    description: 'nothing renders between the home page\'s Fly Type cards and its tiles: no widget, no element but an empty wrapper, and no text',
    pages: ['home'],
    check(page) {
        return betweenCardsAndTiles(page.html);
    },
};
