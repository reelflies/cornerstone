// One <h1> on the home page, the stone's (redesign step 2; ticket 46's rule, story 68).
//
// The redesign's header never makes the logo an <h1> (components/reelflies/header.html), and
// every page's own heading is its only one. On the home page that is the stone's title
// (section.rf-stone, components/reelflies/home.html), so the page has exactly one <h1>, inside
// the stone. Ticket 27's every-page rule, no page with more than one <h1>, is max-one-h1's.

import { findTags } from '../html.mjs';
import { STONE_CLASS, stoneHtml } from './home-hero.mjs';

export function oneH1Problems(html) {
    const count = findTags(html, 'h1').length;
    if (count !== 1) return [`the home page has ${count} <h1> elements, not 1: the stone's heading is the page's only one`];
    const stone = stoneHtml(html);
    if (!stone || findTags(stone, 'h1').length !== 1) return [`the home page's one <h1> isn't in the stone (section.${STONE_CLASS}): the stone's heading is the page's`];
    return [];
}

export default {
    id: 'home-one-h1',
    ticket: 46,
    description: `exactly one <h1> on the home page, the stone's (section.${STONE_CLASS})`,
    pages: ['home'],
    check(page) {
        return oneH1Problems(page.html);
    },
};
