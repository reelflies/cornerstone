// The hook size chart's gauge, templates/components/reelflies/chart-gauge.html, rendered as
// stencil start renders it (W0-9's fixture renderer): every size 6/0 to 24 as the authored hook
// (components/reelflies/hook.html) at its calibrated length, each linking to its row on the
// chart page. Ticket 35, spec module 22, stories 15 and 16; redesign step 3. Master's two-layout
// hook-gauge.html is gone: the home band's gauge went with ticket 49's widget, so the band layout,
// the labels passed in and the inline-SVG geometry are no longer tested here.
//
//   node --test scripts/qa/render/partials/hook-gauge.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { CHART_SIZES, anchorId } from '../../../hook-gauge/sizes.mjs';
import { readCalibration } from '../../../hook-gauge/geometry.mjs';

const PARTIAL = 'components/reelflies/chart-gauge';
const HOOK = 'components/reelflies/hook';
const CALLER = 'rf-test/hook-caller';
const { lengths } = readCalibration();
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies;
const render = (context = {}) => renderPartial(PARTIAL, context);
// hook.html through a caller, so a test can set the page variable rf_hook_chart first.
const hook = (hash, before = '') => renderPartial(CALLER, {}, { overrides: { [CALLER]: `${before}{{> ${HOOK} ${hash}}}` } });
const items = html => elementsHtml(html, 'li');
const sizeOf = item => textOf(outerHtml(item, 'span', attrs => /(^|\s)rf-num(\s|$)/.test(attrs.class || '')));

describe('the chart gauge (components/reelflies/chart-gauge.html)', () => {
    it('is a figure holding one ordered list of every size 6/0 to 24, largest first, with the drawing\'s label and its caption', async () => {
        const html = await render();
        const [figure] = findTags(html, 'figure');
        assert.match(figure.attrs.class, /(^|\s)rf-gauge(\s|$)/);
        const lists = findTags(html, 'ol');
        assert.equal(lists.length, 1);
        assert.equal(lists[0].attrs['aria-label'], LANG.chart.gauge_label);
        assert.deepEqual(items(html).map(sizeOf), CHART_SIZES);
        assert.equal(textOf(outerHtml(html, 'figcaption')), LANG.chart.gauge_caption);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('links each size to its row on the same page, #size-6-0 to #size-24', async () => {
        const links = findTags(await render(), 'a');
        assert.deepEqual(links.map(link => link.attrs.href), CHART_SIZES.map(size => `#${anchorId(size)}`));
    });

    it('gives each hook its calibrated length as --rf-len, which the style layer draws at one scale', async () => {
        for (const item of items(await render())) {
            const [li] = findTags(item, 'li');
            assert.equal(li.attrs.style, `--rf-len: ${lengths[sizeOf(item)]}`, sizeOf(item));
        }
    });

    it('draws each hook from the icon sheet, hidden from screen readers, with the size and "hook size" as the link\'s text', async () => {
        for (const item of items(await render())) {
            const svgs = findTags(item, 'svg');
            assert.equal(svgs.length, 1, sizeOf(item));
            assert.equal(svgs[0].attrs.class, 'rf-hook');
            assert.equal(svgs[0].attrs['aria-hidden'], 'true');
            assert.equal(svgs[0].attrs.focusable, 'false');
            assert.deepEqual(findTags(item, 'use').map(use => use.attrs.href), ['#rf-i-hook']);
            assert.equal(textOf(outerHtml(item, 'a')), `${sizeOf(item)} ${LANG.home.hook_size}`);
        }
        assert.equal(findTags(await render(), 'img').length, 0);
    });

    it('has no gaps and no repeats: 19 sizes, 19 links, 19 hooks', async () => {
        const html = await render();
        assert.equal(items(html).length, 19);
        assert.equal(findTags(html, 'a').length, 19);
        assert.equal(findTags(html, 'svg').length, 19);
        assert.equal(new Set(findTags(html, 'a').map(link => link.attrs.href)).size, 19);
    });
});

describe('one hook (components/reelflies/hook.html)', () => {
    it('on the chart page (here) links to the row on the same page and carries its length', async () => {
        const html = await hook("size='24' slug='24' len=5 here=1");
        assert.equal(findTags(html, 'li')[0].attrs.style, '--rf-len: 5');
        assert.equal(findTags(html, 'a')[0].attrs.href, '#size-24');
        assert.equal(findTags(html, 'svg')[0].attrs.style, undefined, 'the chart sizes the hook from --rf-len');
    });

    it('on the home page\'s scale links to the chart page\'s row while the page variable rf_hook_chart is set, at the height it is given', async () => {
        const html = await hook("size='2/0' slug='2-0' h=64", "{{assignVar 'rf_hook_chart' '/fly-hook-size-chart/'}}");
        assert.equal(findTags(html, 'a')[0].attrs.href, '/fly-hook-size-chart/#size-2-0');
        assert.equal(findTags(html, 'svg')[0].attrs.style, 'height:64px');
        assert.equal(findTags(html, 'li')[0].attrs.style, undefined);
    });

    it('is a plain item, no link, when the chart page has no address', async () => {
        const html = await hook("size='14' slug='14' h=20");
        assert.equal(findTags(html, 'a').length, 0);
        assert.equal(textOf(outerHtml(html, 'span')), `14 ${LANG.home.hook_size}`);
        assert.deepEqual(unbalancedTags(html), []);
    });
});
