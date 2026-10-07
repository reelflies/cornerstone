// The hook sizes the hook size chart shows (ticket 35), shared by the gauge partial, which
// ticket 49's home band also uses, and the chart page's size rows (scripts/hook-chart/).
//
// - CHART_SIZES: 6/0, the biggest hook, down to 1/0, then 1, 2, 4 … 24 (spec module 22; the
//   hook order of ticket 18's Fly Sizes job and of ticket 33's facet sorter).
// - CHART_URL: the hook size chart Resource's path, which the home band's links and the rows'
//   page lookup share.
// - anchorId(size): each row's id, the contract with ticket 49 (build pipeline 6.9):
//   size-6-0 … size-1-0, then size-1 … size-24.
// - facetParam(size): the Fly Sizes facet in BigCommerce's own URL form (SEO-6), with ticket
//   18's names for the aught sizes, for example Fly+Sizes=2%2F0.
// - normalizeSize(value): a catalogue value in chart spelling. Before ticket 18's rename the
//   aught values read "1-0" … "6-0", so both spellings are read.

export const CHART_SIZES = Object.freeze([
    '6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '1', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24',
]);

export const CHART_URL = '/fly-hook-size-chart/';

// The product option, and the facet it becomes on category pages.
export const FACET_NAME = 'Fly Sizes';

const CHART = new Set(CHART_SIZES);
const AUGHT = /^([1-9][0-9]?)\s*[/-]\s*0$/;
const NUMBER = /^[1-9][0-9]?$/;

export const isChartSize = size => CHART.has(size);

// The hook size a catalogue value names, as the chart writes it ('2/0', '14'), or null when the
// value isn't a hook size. A size the chart has no row for ('26', '3') is still returned, so a
// run can report it.
export function normalizeSize(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim().replace(/^#\s*/, '');
    const aught = text.match(AUGHT);
    if (aught) return `${aught[1]}/0`;
    return NUMBER.test(text) ? text : null;
}

export function anchorId(size) {
    if (!isChartSize(size)) throw new Error(`${size} isn't a chart size (${CHART_SIZES.join(', ')})`);
    return `size-${size.replace('/', '-')}`;
}

// application/x-www-form-urlencoded, as the facet links BigCommerce builds: a space is "+",
// and the "/" of an aught size is %2F.
const formEncode = text => encodeURIComponent(text).replace(/%20/g, '+');

export const facetParam = size => `${formEncode(FACET_NAME)}=${formEncode(size)}`;
