// templates/components/reelflies/hook-gauge.html rendered as stencil start renders it (W0-9's
// fixture renderer): the 6/0 to 24 gauge on the hook size chart page, and the home band's
// 2/0 to 20 layout that ticket 49 uses (CD-12). Ticket 35, spec module 22, stories 15 and 16.
//
//   node --test scripts/qa/render/partials/hook-gauge.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';
import { CHART_SIZES, anchorId } from '../../../hook-gauge/sizes.mjs';
import { LAYOUTS, hookBox, readCalibration } from '../../../hook-gauge/geometry.mjs';
import { gaugeHtml } from '../../../hook-gauge/gauge.mjs';

const PARTIAL = 'components/reelflies/hook-gauge';
const { lengths } = readCalibration();
const render = (context = {}) => renderPartial(PARTIAL, context);
// Each <a> with what it holds.
const links = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    attrs: findTags(`<a${attributes}>`, 'a')[0].attrs,
    svgs: findTags(inner, 'svg'),
    text: inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim(),
}));
const rows = html => [...html.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/g)].map(([, inner]) => findTags(inner, 'li').length);
const squash = html => html.replace(/\s+/g, ' ').replace(/> </g, '><').trim();

describe('the hook gauge partial', () => {
    it('renders the chart gauge by default: every size 6/0 to 24 once, in two rows, linking to its row (story 16)', async () => {
        const html = await render();
        assert.deepEqual(rows(html), LAYOUTS.chart.rows.map(row => row.length));
        const found = links(html);
        assert.deepEqual(found.map(({ text }) => text), CHART_SIZES);
        assert.deepEqual(found.map(({ attrs }) => attrs.href), CHART_SIZES.map(size => `#${anchorId(size)}`));
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('draws each hook as inline SVG, hidden from screen readers, so the size text carries the information', async () => {
        const html = await render();
        for (const { svgs, text } of links(html)) {
            assert.equal(svgs.length, 1, text);
            const [{ attrs }] = svgs;
            assert.equal(attrs['aria-hidden'], 'true', text);
            assert.equal(attrs.focusable, 'false', text);
            assert.equal(attrs.viewbox, '0 3 100 50', text);
        }
        assert.equal(findTags(html, 'use').length, 0, 'no <use>: the partial needs no sprite on the page');
        assert.equal(findTags(html, 'img').length, 0);
    });

    it('draws the hooks to scale at the chart\'s desktop scale, with the length and scales for the style layer', async () => {
        const html = await render();
        const [wrapper] = findTags(html, 'div');
        assert.match(wrapper.attrs.style, new RegExp(`--rf-gauge-k: ${LAYOUTS.chart.k.desktop}px; --rf-gauge-k-phone: ${LAYOUTS.chart.k.phone}px;`));
        links(html).forEach(({ svgs: [{ attrs }], text }) => {
            const box = hookBox(lengths[text], LAYOUTS.chart.k.desktop);
            assert.equal(Number(attrs.width), box.width, text);
            assert.equal(Number(attrs.height), box.height, text);
            assert.equal(attrs.style, `--rf-hook-len: ${lengths[text]};`, text);
        });
    });

    it('without labels, adds no group role and no aria-label, so each link is named by its visible size', async () => {
        const html = await render();
        assert.equal(findTags(html, 'div')[0].attrs.role, undefined);
        assert.ok(links(html).every(({ attrs }) => !('aria-label' in attrs)));
    });

    it('with labels, gives the drawing a short text alternative and each link "Size 6/0", which keeps its visible text', async () => {
        const html = await render({ gauge_label: 'Hook sizes from 6/0, the largest, to 24, the smallest', gauge_size_label: 'Size' });
        const [wrapper] = findTags(html, 'div');
        assert.equal(wrapper.attrs.role, 'group');
        assert.equal(wrapper.attrs['aria-label'], 'Hook sizes from 6/0, the largest, to 24, the smallest');
        for (const { attrs, text } of links(html)) {
            assert.equal(attrs['aria-label'], `Size ${text}`);
            assert.ok(attrs['aria-label'].includes(text), 'WCAG 2.5.3: the name contains the visible label');
        }
    });

    it('escapes the labels it is given', async () => {
        const html = await render({ gauge_label: 'Hooks "to scale" & more', gauge_size_label: '<b>Size</b>' });
        assert.match(html, /aria-label="Hooks &quot;to scale&quot; &amp; more"/);
        assert.match(html, /aria-label="&lt;b&gt;Size&lt;\/b&gt; 6\/0"/);
        assert.equal(findTags(html, 'b').length, 0);
    });

    it('renders the home band\'s layout for ticket 49: 2/0 to 6, then 8 to 20, linking to the chart page\'s rows (CD-12)', async () => {
        const html = await render({ gauge_layout: 'band' });
        assert.deepEqual(rows(html), [6, 7]);
        const found = links(html);
        assert.deepEqual(found.map(({ text }) => text), LAYOUTS.band.rows.flat());
        assert.deepEqual(found.map(({ attrs }) => attrs.href), LAYOUTS.band.rows.flat().map(size => `/fly-hook-size-chart/#${anchorId(size)}`));
        assert.match(findTags(html, 'div')[0].attrs.class, /\brf-hook-gauge--band\b/);
        found.forEach(({ svgs: [{ attrs }], text }) => assert.equal(Number(attrs.width), hookBox(lengths[text], LAYOUTS.band.k.desktop).width, text));
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('renders the chart layout for any other gauge_layout value', async () => {
        assert.equal(await render({ gauge_layout: 'chart' }), await render());
        assert.equal(await render({ gauge_layout: 'Band' }), await render());
    });

    it('is the markup gaugeHtml() builds, so ticket 49\'s sync can render the band without the theme', async () => {
        // Every character Handlebars escapes, so the literal labels must be escaped the same way.
        const strings = { label: 'Hook sizes & "scale" <drawn> = Shaun\'s `gauge`', sizeLabel: 'Size' };
        const layouts = ['chart', 'band'];
        const rendered = await Promise.all(layouts.map(layout => render({ gauge_layout: layout, gauge_label: strings.label, gauge_size_label: strings.sizeLabel })));
        layouts.forEach((layout, i) => assert.equal(squash(gaugeHtml(layout, strings)), squash(rendered[i]), layout));
        assert.equal(squash(gaugeHtml('chart')), squash(await render()));
        assert.throws(() => gaugeHtml('poster'), /unknown gauge layout "poster" \(chart, band\)/);
    });
});
