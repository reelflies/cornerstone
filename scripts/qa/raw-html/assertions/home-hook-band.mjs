// The home page's hook band as served (ticket 49; spec modules 7 and 22, R1, CD-12, SEO-6, UX-16;
// stories 15, 16 and 68): widgets/hook-sizes, section.rf-hook-band, wherever the page has it. A
// page without it passes, as the widget goes up inactive, an R12 unpublish takes it away, and
// Shaun may drop it (ticket 13, item 9).
//
// - The band is named by its one <h2> (aria-labelledby), so its heading is the page outline's.
// - Its gauge (div.rf-hook-gauge--band, ticket 35's, pasted in by the sync) is server-rendered:
//   two rows, 2/0 to 6 then 8 to 20 (CD-12), each size a link to its own row on the chart page,
//   /fly-hook-size-chart/#size-2-0 … #size-20 (build pipeline contract 6.9), holding its hook as
//   inline <svg> hidden from screen readers (no sprite, no image) and its size as text.
// - Every link in the band goes to the chart page: never to a hidden size category, a "Flies in
//   size N" listing or a hand-built facet URL (SEO-6, UX-16). The chart page's rows carry the
//   facet links, with _bc_fsnf=1 and rel="nofollow" (ticket 35).
// - Beside the gauge, a text link to the chart page ("See the full hook size chart").
//
// Whether each anchor exists on the chart page is a check of that page, not of this one: it waits
// for the chart page and its rows on the channel (docs/widgets.md, "The hook band").

import {
    decodeHtml, elementsHtml, findTags, textOf,
} from '../html.mjs';
import { LAYOUTS } from '../../../hook-gauge/geometry.mjs';
import { CHART_URL, anchorId } from '../../../hook-gauge/sizes.mjs';

const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();
const ROWS = LAYOUTS.band.rows;
const SIZES = ROWS.flat();
const NAME = 'the hook band';
const INSIDE = /^(a|button|input|select|textarea|img|picture|iframe|object|embed)$/;

// A link's path and query, ignoring the host (a store may write its own host before the path).
const pageOf = url => {
    try {
        const { pathname, search } = new URL(url, 'https://storefront.invalid');
        return { pathname, search };
    } catch {
        return { pathname: url, search: '' };
    }
};
const isChartPage = url => {
    const { pathname, search } = pageOf(url);
    return pathname === CHART_URL && search === '';
};

function headingProblems(section, name) {
    const h2s = findTags(section, 'h2');
    if (h2s.length !== 1) return [`${name} has ${h2s.length} <h2> elements: it has exactly one`];
    const [open] = findTags(section, 'section');
    const label = open?.attrs['aria-labelledby'];
    if (!label || label !== h2s[0].attrs.id) return [`${name} is labelled by "${label ?? ''}", not by its <h2>`];
    return [];
}

function gaugeProblems(gauge) {
    const problems = [];
    const rows = elementsHtml(gauge, 'ol', hasClass('rf-hook-gauge__row'));
    const counts = rows.map(row => findTags(row, 'li').length);
    if (counts.join() !== ROWS.map(row => row.length).join()) {
        problems.push(`${NAME}'s gauge has ${rows.length} rows of ${counts.join(', ')} hooks: it has two, ${ROWS.map(row => `${row[0]} to ${row[row.length - 1]}`).join(' then ')}`);
    }
    const links = elementsHtml(gauge, 'a');
    const sizes = links.map(link => textOf(elementsHtml(link, 'span', hasClass('rf-hook-gauge__size'))[0] || link));
    if (sizes.join() !== SIZES.join()) problems.push(`${NAME}'s gauge shows ${sizes.join(', ')}: it shows ${SIZES.join(', ')}, in that order`);
    links.forEach((link, index) => {
        const size = sizes[index];
        const hook = `${NAME}'s hook ${size}`;
        const [open, ...inside] = findTags(link);
        if (SIZES.includes(size)) {
            const row = `${CHART_URL}#${anchorId(size)}`;
            const { pathname } = pageOf(href(open));
            const fragment = href(open).split('#')[1];
            if (pathname !== CHART_URL || fragment !== anchorId(size)) problems.push(`${hook} links to ${href(open)}, not its row ${row}`);
        }
        const svgs = findTags(link, 'svg');
        if (svgs.length !== 1) {
            problems.push(`${hook} has no inline <svg> hook`);
        } else {
            if (svgs[0].attrs['aria-hidden'] !== 'true') problems.push(`${hook} draws its hook without aria-hidden="true": the size text carries it`);
            if (findTags(link, 'use').length) problems.push(`${hook} draws its hook from a sprite (<use>): it is drawn inline, whole on any theme`);
        }
        for (const tag of inside.filter(item => INSIDE.test(item.name) || 'tabindex' in item.attrs)) {
            problems.push(`${hook} has <${tag.name}> inside its link: only its drawing and its size`);
        }
    });
    return problems;
}

function bandProblems(section) {
    const title = textOf(elementsHtml(section, 'h2')[0] || '');
    const problems = headingProblems(section, `${NAME}${title ? ` (${title})` : ''}`);
    const [gauge] = elementsHtml(section, 'div', hasClass('rf-hook-gauge--band'));
    if (!gauge) problems.push(`${NAME} has no gauge (div.rf-hook-gauge--band)`);
    else problems.push(...gaugeProblems(gauge));
    // SEO-6, UX-16: the chart page and nothing else.
    for (const link of findTags(section, 'a')) {
        if (!isChartPage(href(link))) problems.push(`${NAME} links to ${href(link)}: every link in it goes to the chart page, ${CHART_URL} (SEO-6, UX-16)`);
    }
    const outside = gauge ? section.replace(gauge, '') : section;
    if (!findTags(outside, 'a').some(link => isChartPage(href(link)) && !href(link).includes('#'))) {
        problems.push(`${NAME} has no text link to the chart page outside its gauge`);
    }
    return problems;
}

export function hookBandProblems(html) {
    return elementsHtml(html, 'section', hasClass('rf-hook-band')).flatMap(bandProblems);
}

export default {
    id: 'home-hook-band',
    ticket: 49,
    description: 'the hook band, where the page has it: one <h2>; its gauge server-rendered in two rows, 2/0 to 6 then 8 to 20, each size a link to its row on /fly-hook-size-chart/ (#size-N) holding an inline <svg> hidden from screen readers; a text link to the chart page; and no link anywhere else, so none to a size category, listing or facet URL',
    pages: ['home'],
    check(page) {
        return hookBandProblems(page.html);
    },
};
