// The home page's hatch chart and hook scale as served (redesign step 2, DESIGN.md "Hatch Chart"
// and "Hook Scale"; the rules of ticket 49's hook band carried over: spec modules 7 and 22, R1,
// CD-12, SEO-6, UX-16; stories 15, 16 and 68): section.rf-hatch, components/reelflies/hatch-chart.html.
//
// - The section is #hatch (the Species menu's hatch card links to it), carries data-rf-hatch and is
//   named by its one <h2>, which holds the month ([data-rf-now-month]) the server rendered; the
//   "on the water" line ([data-rf-now-list]) has text. home.js moves both if the page was cached in
//   another month.
// - The chart ([data-rf-hatch-chart]) says the current month in its style (--rf-now, 0 to 11); the
//   month heads are twelve [data-rf-m], 0 to 11, one lit (is-now, the --rf-now month), each with
//   the data-rf-now-label home.js writes the "Now" mark from.
// - Each row (li.rf-hatch__row) has its name, its months as data-rf-runs (a-b, or a-b,c-d for a
//   hatch that comes back), a track (role="img" with an aria-label saying its season) of twelve
//   months, and, when it has flies, is a <details> with a <summary>, so it opens with no
//   JavaScript; its links go to pages, never a hidden size category (SEO-6). Its flies are cards,
//   home-product-bands'.
// - The hook scale (.rf-hooks): an <h3>, and every size from 2/0 to 24 in order (CD-12's two rows
//   became one scale, 14 hooks), each an inline <svg> hidden from screen readers (the icon
//   sheet's hook, drawn once in the page) with its size as text and a screen-reader word. With the
//   chart page set (rf_hook_chart_url, the a.rf-more link in .rf-hooks__text), each size links to
//   its row there (#size-2-0 … #size-24) and no link in the scale goes anywhere else, so none to a
//   size category, a size listing or a facet URL (SEO-6, UX-16); with it empty, a size is a plain
//   item.
//
// Whether each anchor exists on the chart page is a check of that page (chart-gauge.html).

import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

export const SIZES = ['2/0', '1/0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'];
export const anchorOf = size => `size-${size.replace('/', '-')}`;
const MONTHS = Array.from({ length: 12 }, (_, index) => String(index));
const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();
const isPage = url => /^(\/|https?:\/\/)/.test(url);
const SIZE_LINK = /\/fly-sizes\//;

// A link's path and fragment, ignoring the host (a store may write its own host before the path).
const pageOf = url => {
    try {
        const { pathname, hash } = new URL(url, 'https://storefront.invalid');
        return { pathname, hash };
    } catch {
        return { pathname: url, hash: '' };
    }
};

function headingProblems(section, name) {
    const h2s = findTags(section, 'h2');
    if (h2s.length !== 1) return [`${name} has ${h2s.length} <h2> elements: it has exactly one`];
    const [open] = findTags(section, 'section');
    const label = open?.attrs['aria-labelledby'];
    if (!label || label !== h2s[0].attrs.id) return [`${name} is labelled by "${label ?? ''}", not by its <h2>`];
    return [];
}

function monthsProblems(chart, name, now) {
    const months = outerHtml(chart, 'div', hasClass('rf-months'));
    if (!months) return [`${name} has no month heads (.rf-months)`];
    const problems = [];
    const cells = findTags(months, 'span').filter(tag => 'data-rf-m' in tag.attrs);
    if (cells.map(tag => tag.attrs['data-rf-m']).join() !== MONTHS.join()) problems.push(`${name}'s month heads are data-rf-m ${cells.map(tag => tag.attrs['data-rf-m']).join(', ')}: twelve, 0 to 11`);
    const lit = cells.filter(tag => hasClass('is-now')(tag.attrs));
    if (lit.length !== 1 || (now && lit[0].attrs['data-rf-m'] !== now)) problems.push(`${name} lights ${lit.length} month head(s) (${lit.map(tag => tag.attrs['data-rf-m']).join(', ')}): one, the --rf-now month ${now ?? ''}`);
    if (cells.some(tag => !(tag.attrs['data-rf-now-label'] || '').trim())) problems.push(`${name}'s month heads carry no data-rf-now-label: home.js writes the "Now" mark from it`);
    return problems;
}

function rowProblems(row, index) {
    const title = textOf(elementsHtml(row, 'span', hasClass('rf-hatch__title'))[0] || '');
    const what = `row ${index + 1}${title ? ` (${title})` : ''}`;
    const [open] = findTags(row, 'li');
    const problems = [];
    if (!title) problems.push(`${what} has no name (.rf-hatch__title)`);
    if (!/^\d+-\d+(,\d+-\d+)?$/.test(open.attrs['data-rf-runs'] || '')) problems.push(`${what}'s data-rf-runs is "${open.attrs['data-rf-runs'] ?? ''}", not its months as a-b or a-b,c-d: home.js lights a row from it`);
    const track = outerHtml(row, 'span', hasClass('rf-track'));
    if (!track) problems.push(`${what} has no track (.rf-track)`);
    else {
        const [trackOpen] = findTags(track, 'span');
        if (trackOpen.attrs.role !== 'img' || !(trackOpen.attrs['aria-label'] || '').trim()) problems.push(`${what}'s track isn't role="img" with an aria-label saying its season`);
        const months = findTags(track, 'span').filter(tag => 'data-rf-m' in tag.attrs);
        if (months.length !== 12) problems.push(`${what}'s track has ${months.length} months, not 12`);
    }
    if (outerHtml(row, 'div', hasClass('rf-hatch__flies')) && !(findTags(row, 'details').length && findTags(row, 'summary').length)) {
        problems.push(`${what} has flies but isn't a <details> with a <summary>: a row opens on its flies without JavaScript`);
    }
    for (const link of findTags(row, 'a')) {
        if (!isPage(href(link))) problems.push(`${what} links to "${href(link)}", not a page`);
        else if (SIZE_LINK.test(href(link))) problems.push(`${what} links to ${href(link)}, a hidden size category (SEO-6)`);
    }
    return problems;
}

function chartProblems(section) {
    const name = 'the hatch chart';
    const problems = headingProblems(section, name);
    const [open] = findTags(section, 'section');
    if (open.attrs.id !== 'hatch') problems.push(`${name} is id="${open.attrs.id ?? ''}", not "hatch": the Species menu's hatch card links to #hatch`);
    if (!('data-rf-hatch' in open.attrs)) problems.push(`${name} has no data-rf-hatch: home.js finds it by that`);
    const [h2] = elementsHtml(section, 'h2');
    if (!textOf(elementsHtml(h2 || '', 'span', attrs => 'data-rf-now-month' in attrs)[0] || '')) problems.push(`${name}'s heading has no month ([data-rf-now-month] with text): the server's, which home.js moves if the page was cached`);
    if (!textOf(elementsHtml(section, 'p', attrs => 'data-rf-now-list' in attrs)[0] || '')) problems.push(`${name} has no "on the water" line ([data-rf-now-list] with text)`);
    const chart = outerHtml(section, 'div', attrs => 'data-rf-hatch-chart' in attrs);
    if (!chart) return [...problems, `${name} has no chart ([data-rf-hatch-chart])`];
    const [chartOpen] = findTags(chart, 'div');
    const now = /--rf-now:\s*(\d+)/.exec(chartOpen.attrs.style || '')?.[1];
    if (!now || Number(now) > 11) problems.push(`${name}'s chart has no --rf-now month (0 to 11) in its style: the current month's column`);
    problems.push(...monthsProblems(chart, name, now));
    const rows = elementsHtml(chart, 'li', hasClass('rf-hatch__row'));
    if (!rows.length) problems.push(`${name} has no rows (li.rf-hatch__row)`);
    rows.forEach((row, index) => problems.push(...rowProblems(row, index)));
    return problems;
}

function scaleProblems(section) {
    const name = 'the hook scale';
    const scale = outerHtml(section, 'div', hasClass('rf-hooks'));
    if (!scale) return [`${name} (.rf-hooks) is missing from the hatch chart`];
    const problems = [];
    if (!textOf(elementsHtml(scale, 'h3')[0] || '')) problems.push(`${name} has no <h3> heading`);
    const chartLinks = elementsHtml(outerHtml(scale, 'div', hasClass('rf-hooks__text')) || '', 'a', hasClass('rf-more'));
    const chartUrl = chartLinks.length ? href(findTags(chartLinks[0], 'a')[0]) : null;
    if (chartLinks.length > 1) problems.push(`${name} has ${chartLinks.length} chart links (a.rf-more): one`);
    if (chartUrl !== null && !isPage(chartUrl)) problems.push(`${name}'s chart link goes to "${chartUrl}", not a page`);
    const list = outerHtml(scale, 'ol', hasClass('rf-hookstep'));
    if (!list) return [...problems, `${name} has no steps (ol.rf-hookstep)`];
    const steps = elementsHtml(list, 'li');
    const sizes = steps.map(step => textOf(elementsHtml(step, 'span', hasClass('rf-num'))[0] || ''));
    if (sizes.join() !== SIZES.join()) problems.push(`${name} shows ${sizes.join(', ')}: it shows ${SIZES.join(', ')}, in that order`);
    steps.forEach((step, index) => {
        const size = sizes[index];
        const hook = `${name}'s hook ${size || `${index + 1}`}`;
        const svgs = findTags(step, 'svg');
        if (svgs.length !== 1) problems.push(`${hook} has ${svgs.length} <svg> hooks, not 1`);
        else if (svgs[0].attrs['aria-hidden'] !== 'true') problems.push(`${hook} draws its hook without aria-hidden="true": the size text carries it`);
        if (!textOf(elementsHtml(step, 'span', hasClass('is-srOnly'))[0] || '')) problems.push(`${hook} has no screen-reader word saying it is a hook size`);
        const links = findTags(step, 'a');
        if (chartUrl !== null) {
            if (links.length !== 1) problems.push(`${hook} has ${links.length} links, not 1: with the chart page set, each size links to its row`);
            else if (SIZES.includes(size)) {
                const got = pageOf(href(links[0]));
                const chart = pageOf(chartUrl);
                if (got.pathname !== chart.pathname || got.hash !== `#${anchorOf(size)}`) problems.push(`${hook} links to ${href(links[0])}, not its row ${chart.pathname}#${anchorOf(size)}`);
            }
        } else if (links.length) problems.push(`${hook} is a link with no chart page set (no a.rf-more in .rf-hooks__text): with rf_hook_chart_url empty, a size is a plain item`);
    });
    if (chartUrl !== null) {
        for (const link of findTags(scale, 'a')) {
            if (pageOf(href(link)).pathname !== pageOf(chartUrl).pathname) problems.push(`${name} links to ${href(link)}: every link in it goes to the chart page, ${chartUrl} (SEO-6, UX-16)`);
        }
    }
    return problems;
}

export function hookBandProblems(html) {
    return elementsHtml(html, 'section', hasClass('rf-hatch')).flatMap(section => [...chartProblems(section), ...scaleProblems(section)]);
}

export default {
    id: 'home-hook-band',
    ticket: 49,
    description: 'the hatch chart (#hatch, data-rf-hatch): one <h2> with the server\'s month, the "on the water" line, --rf-now and twelve month heads with one lit, each row named with its runs, a labelled track and a <details> when it has flies, no link to a size category; and the hook scale: an <h3>, every size from 2/0 to 24 as an inline <svg> hidden from screen readers with its size as text, each a link to its row on the chart page when one is set, and no link anywhere else',
    pages: ['home'],
    check(page) {
        return hookBandProblems(page.html);
    },
};
