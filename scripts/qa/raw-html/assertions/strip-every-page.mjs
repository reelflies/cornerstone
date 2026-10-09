// The shipping strip on every page or on none (ticket 27's follow-up; spec module 2, O04).
//
// The store shows a placement in a global region on its own template file's page only (#62's
// rf/skeptic: its renderedRegionsByPageType gave the strip to HOME alone), so the strip is placed
// once per template file that renders the header (widgets/shipping-strip/channels/<channel>.json,
// template_files). This checks the pages as served:
// - check: a page shows the strip once at most. Two copies would mean the store does show a
//   global region's placements on every page, so each page gets all of them.
// - checkAll: the strip is on every pinned page that rendered, or on none. Some only means a
//   template file is missing from the list.
//
// Like every assertion it never reads the channel file, so unpublishing the strip (on no page)
// passes, and a write on 1895766 never fails an open branch's gate (build pipeline, section 6.6).
//
// Not on the 404 kind: stencil start has no page type for pages/errors/* (stencil-cli's
// server/lib/page-type-util.js), so it never asks the store for that page's regions and the strip
// can't show there locally, though the store accepts its placement. The prelaunch host check
// (ticket 27) covers it.

import { findTags } from '../html.mjs';

const strips = html => findTags(html, 'div').filter(tag => 'data-rf-strip' in tag.attrs).length;

export default {
    id: 'strip-every-page',
    ticket: 27,
    description: 'the shipping strip at most once on a page, and on every pinned page or on none',
    notOn: ['404'],
    check(page) {
        const count = strips(page.html);
        return count > 1 ? [`the shipping strip shows ${count} times: a placement per template file shows once on its own page, so two mean a global region shows each placement everywhere (docs/widgets.md)`] : [];
    },
    checkAll(pages) {
        const named = list => list.map(page => `${page.key} ${page.path}`).join(', ');
        const without = pages.filter(page => strips(page.html) === 0);
        if (!without.length || without.length === pages.length) return [];
        const withStrip = pages.filter(page => !without.includes(page)).map(page => page.key).join(', ');
        return [`the shipping strip is on ${withStrip} but not on ${named(without)}: place it on each page's template file (widgets/shipping-strip/channels/<channel>.json, template_files)`];
    },
};
