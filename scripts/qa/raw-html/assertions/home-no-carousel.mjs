// No stock carousel on the home page (ticket 46; O21). The hero (widgets/home-lead) is the home
// page's lead, so config.json sets homepage_show_carousel to false in the base settings, which
// every variation inherits, and stencil fetches no slides. This checks the page itself, so a
// variation or a Theme Styles edit that turns the carousel back on fails the run.

import { findTags } from '../html.mjs';

export default {
    id: 'home-no-carousel',
    ticket: 46,
    description: 'no stock carousel (.heroCarousel) on the home page',
    pages: ['home'],
    check(page) {
        return findTags(page.html)
            .filter(tag => (tag.attrs.class || '').split(/\s+/).includes('heroCarousel'))
            .map(tag => `the home page renders the stock carousel: ${tag.raw.slice(0, 80)}`);
    },
};
