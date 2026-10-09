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
// Like every assertion it never reads the channel file (build pipeline, section 6.6): an
// unpublished strip, on no page, passes, so a strip recorded active that shows nowhere is
// widgets-sync.mjs --verify's to catch. A write plan stopped part-way, which leaves the strip on
// some template files only, fails this on every branch until the plan is finished.
//
// The 404 page counts only away from a local stencil start: stencil-cli has no page type for
// pages/errors/* (its server/lib/page-type-util.js), so it never asks the store for that page's
// regions, though the store accepts its placement. On the prelaunch host (QA_BASE_URL, Shaun's
// cookie batch) the 404 page must show the strip like every other.
//
// A pin the store renders with a custom template (pages/custom/*) counts only there too, by its
// key (CUSTOM_TEMPLATE_PINS): stencil start maps no custom file to a page type either, and it
// renders the template only through custom-layouts.json, so the regions it fills come from the
// stock template's placement, not the custom file's (docs/widgets.md, "Custom templates").

import { findTags } from '../html.mjs';

const strips = html => findTags(html, 'div').filter(tag => 'data-rf-strip' in tag.attrs).length;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// The pins rendered with a custom template: ticket 34's Species hub. Wave R1 adds 1895766's
// category@noindex and hook-chart pins here when it pins them.
export const CUSTOM_TEMPLATE_PINS = ['species-hub'];
// A 404 page, or a custom template's pin, rendered by a local stencil start, whose regions for it
// are never the store's.
const localNotFound = page => (page.kind === '404' || CUSTOM_TEMPLATE_PINS.includes(page.key)) && LOCAL_HOSTS.includes(new URL(page.url).hostname);

export default {
    id: 'strip-every-page',
    ticket: 27,
    description: 'the shipping strip at most once on a page, and on every pinned page or on none',
    check(page) {
        const count = strips(page.html);
        return count > 1 ? [`the shipping strip shows ${count} times: a placement per template file shows once on its own page, so two mean a global region shows each placement everywhere (docs/widgets.md)`] : [];
    },
    checkAll(all) {
        const pages = all.filter(page => !localNotFound(page));
        const named = list => list.map(page => `${page.key} ${page.path}`).join(', ');
        const without = pages.filter(page => strips(page.html) === 0);
        if (!without.length || without.length === pages.length) return [];
        const withStrip = pages.filter(page => !without.includes(page)).map(page => page.key).join(', ');
        return [`the shipping strip is on ${withStrip} but not on ${named(without)}: place it on each page's template file (widgets/shipping-strip/channels/<channel>.json, template_files)`];
    },
};
