// The utility strip on every page or on none (ticket 27's follow-up; spec module 2, O04), for
// the redesign's strip (components/reelflies/strip.html, a labelled region the header's hook
// renders above the header on every page; Streamside Stone step 2 retired the shipping-strip
// widget and its global region). This checks the pages as served:
// - check: a page shows the strip once at most. Two copies would mean a template includes the
//   header's hook twice, or a custom template renders its own strip beside the hook's.
// - checkAll: the strip is on every pinned page that rendered, or on none (the theme setting
//   that hides it is one switch for the whole storefront). Some only means a template file is
//   missing the header's hook, so its page has no strip, and no header either.
//
// Every page counts, the 404 page and custom templates included: the strip is the theme's, not
// a store placement, so a local stencil start renders it exactly as the store does.

import { findTags } from '../html.mjs';

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const strips = html => findTags(html, 'div').filter(tag => hasClass('rf-strip')(tag.attrs) && tag.attrs.role === 'region').length;

export default {
    id: 'strip-every-page',
    ticket: 27,
    description: 'the utility strip at most once on a page, and on every pinned page or on none',
    check(page) {
        const count = strips(page.html);
        return count > 1 ? [`the utility strip shows ${count} times: the header's hook renders it once, so two mean a template includes the hook twice or draws its own (components/reelflies/strip.html)`] : [];
    },
    checkAll(all) {
        const named = list => list.map(page => `${page.key} ${page.path}`).join(', ');
        const without = all.filter(page => strips(page.html) === 0);
        if (!without.length || without.length === all.length) return [];
        const withStrip = all.filter(page => !without.includes(page)).map(page => page.key).join(', ');
        return [`the utility strip is on ${withStrip} but not on ${named(without)}: every page template renders the header's hook (components/common/header.html), which draws it`];
    },
};
