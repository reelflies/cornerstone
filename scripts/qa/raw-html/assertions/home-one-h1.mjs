// One <h1> on the home page, and the hero's once it is there (ticket 46; story 68).
//
// - With the hero (widgets/home-lead) on the page: exactly one <h1>, the hero's heading. The
//   stock logo is an <h1> on the home page (header.html:19-22), so the hero goes active on
//   1895766 only once ticket 27 has made the logo a <div> and a release carrying it is live
//   (docs/widgets.md). A branch older than 27 then sees two, and rebases.
// - Without it: at most one. That is the stock logo today, and none on ticket 27's branch
//   before the hero is placed.
//
// It judges only the page, never the store's record of the hero, so placing, unpublishing or
// publishing the hero again on 1895766 doesn't fail every open branch's gate until the channel
// file catches up (build pipeline, section 6.6). Whether the store holds what the repo records
// is the sync's check: node scripts/widgets-sync.mjs --channel <id> --verify.
//
// Ticket 27 adds the every-page rule (no page with more than one <h1>, and the logo never in one).

import { findTags } from '../html.mjs';
import { HERO_CLASS, heroHtml } from './home-hero.mjs';

const ONLY_THE_HERO = 'with the hero on it, the hero\'s heading is the only <h1>';

export function oneH1Problems(html) {
    const count = findTags(html, 'h1').length;
    const hero = heroHtml(html);
    if (!hero) return count <= 1 ? [] : [`the home page has ${count} <h1> elements, not at most 1`];
    if (count !== 1) return [`the home page has ${count} <h1> elements, not 1: ${ONLY_THE_HERO}`];
    if (findTags(hero, 'h1').length !== 1) return ['the home page\'s one <h1> isn\'t in the hero: with the hero on it, the hero\'s heading is the <h1>'];
    return [];
}

export default {
    id: 'home-one-h1',
    ticket: 46,
    description: `at most one <h1> on the home page, and with the hero (.${HERO_CLASS}) on it, exactly one: the hero's`,
    pages: ['home'],
    check(page) {
        return oneH1Problems(page.html);
    },
};
