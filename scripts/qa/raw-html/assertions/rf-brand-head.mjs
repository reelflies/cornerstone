// The brand assets in the head (ticket 25; spec module 1; spec Testing Decisions, seam 2):
// - a favicon link. The file is the store's, set in the control panel (today the ReelFlies logo
//   at 32x32), so this checks the link is there, not the picture.
// - exactly one og:image: the page's own (a product's), or else the ReelFlies default share
//   image that templates/components/reelflies/head.html adds.

import { findTags } from '../html.mjs';

export const DEFAULT_SHARE_IMAGE = 'img/reelflies/social-default.jpg';

export default {
    id: 'rf-brand-head',
    ticket: 25,
    description: `a favicon link, and one og:image (the page's own, or ${DEFAULT_SHARE_IMAGE})`,
    check(page) {
        const problems = [];
        const icons = findTags(page.html, 'link').filter(tag => (tag.attrs.rel || '').toLowerCase().split(/\s+/).includes('icon'));
        if (icons.length === 0) problems.push('no favicon link (<link rel="icon"> or rel="shortcut icon")');
        icons.filter(tag => !(tag.attrs.href || '').trim()).forEach(tag => problems.push(`a favicon link with no href: ${tag.raw}`));

        const images = findTags(page.html, 'meta').filter(tag => tag.attrs.property === 'og:image');
        if (images.length !== 1) problems.push(`${images.length} og:image meta elements, not 1`);
        else if (!(images[0].attrs.content || '').trim()) problems.push('an og:image with no content');
        return problems;
    },
};
