// Fixture renders of the home page's hook band (ticket 49; spec modules 7 and 22, R1, CD-12,
// SEO-6, UX-16; stories 15 and 16): what the store renders from widgets/hook-sizes/template.html
// with a channel's widget_configuration, and the copy the sync uploads. The gauge is ticket 35's,
// pasted in from widgets/_shared/hook-gauge-band.html, which scripts/hook-gauge/generate.mjs
// writes from the calibration. The element shots at 375 and 1280 are widget-screens.spec.mjs's;
// the band's height, its two phone rows, its targets and its place on the page are
// hook-band-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/hook-sizes.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    decodeHtml, elementsHtml, findTags, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';
import { PLACEMENT_STATUSES, readWidget } from '../../../widgets/source.mjs';
import { gaugeHtml } from '../../../hook-gauge/gauge.mjs';
import { LAYOUTS, hookBox, readCalibration } from '../../../hook-gauge/geometry.mjs';
import { CHART_URL, anchorId } from '../../../hook-gauge/sizes.mjs';

const DIR = path.join(WIDGETS_DIR, 'hook-sizes');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const schema = readFixture(path.join(DIR, 'schema.json'));
// The chart page's size rows as scripts/hook-chart/rows.mjs writes them (ticket 35's fixture run).
const CHART_ROWS = fs.readFileSync(new URL('../partials/hook-chart/rows.html', import.meta.url), 'utf8');
const render = (configuration = {}) => renderWidget('hook-sizes', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
const { lengths } = readCalibration();
const BAND = LAYOUTS.band.rows.flat(); // 2/0, 1/0, 1, 2, 4, 6, then 8 … 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const squash = html => html.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
const gaugeOf = html => elementsHtml(html, 'div', hasClass('rf-hook-gauge'))[0];
// Each hook's link: its attributes, its drawing and its visible text.
const hookLinks = html => elementsHtml(gaugeOf(html), 'a').map(link => ({
    attrs: findTags(link, 'a')[0].attrs,
    svgs: findTags(link, 'svg'),
    text: textOf(link),
}));

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
    assert.equal(channelFile.channel_id, 1895766);
});

test('it is placed in home_below_top_products at sort_order 60, between the Assortments band and About, written inactive first', () => {
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 60 });
    assert.ok(PLACEMENT_STATUSES.includes(status), status);
    for (const name of ['template', 'widget', 'placement']) {
        assert.ok(channelFile.uuids[name] === null || UUID.test(channelFile.uuids[name]), `its ${name} uuid is null or recorded`);
    }
    const about = readFixture(path.join(WIDGETS_DIR, 'about', 'channels', '1895766.json')).placement;
    assert.ok(channelFile.placement.sort_order < about.sort_order, 'before About');
    assert.equal(fixture.page, 'pages/home');
    assert.equal(fixture.region, channelFile.placement.region);
});

test('every schema setting has its value on the channel, its default', () => {
    const settings = schema.flatMap(tab => tab.sections.flatMap(section => section.settings));
    assert.deepEqual(Object.keys(channelFile.configuration).sort(), settings.map(setting => setting.id).sort());
    for (const setting of settings) assert.equal(channelFile.configuration[setting.id], setting.default, setting.id);
});

test('one section, named by its one <h2> "Bigger number, smaller hook.", and no other heading', async () => {
    const html = await render();
    assert.equal(elementsHtml(html, 'section').length, 1);
    const [section] = findTags(html, 'section');
    const h2s = findTags(html, 'h2');
    assert.equal(h2s.length, 1);
    assert.ok(h2s[0].attrs.id);
    assert.equal(section.attrs['aria-labelledby'], h2s[0].attrs.id);
    assert.equal(textOf(elementsHtml(html, 'h2')[0]), 'Bigger number, smaller hook.');
    assert.equal(['h1', 'h3', 'h4'].reduce((count, name) => count + findTags(html, name).length, 0), 0);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the paragraph explains the numbering and ends with "See the full hook size chart", a link to the chart page', async () => {
    const html = await render();
    const [text] = elementsHtml(html, 'p', hasClass('rf-hook-band__text'));
    assert.match(textOf(text), /^A size 20 midge is tiny and a size 2 streamer is long\. Past size 1 the numbers climb again as 1\/0, 2\/0 and up\. See the full hook size chart$/);
    const [link, ...more] = findTags(text, 'a');
    assert.equal(more.length, 0);
    assert.equal(link.attrs.href, '/fly-hook-size-chart/');
    assert.equal(textOf(elementsHtml(text, 'a')[0]), 'See the full hook size chart');
    // The text link and the gauge's links go to the same page: the gauge's come from sizes.mjs.
    assert.equal(channelFile.configuration.chart_url, CHART_URL);
});

test('the gauge: 2/0 to 6, then 8 to 20, each a link to its row on the chart page, named "Size N" (CD-12, SEO-6)', async () => {
    const html = await render();
    const rows = elementsHtml(gaugeOf(html), 'ol', hasClass('rf-hook-gauge__row'));
    assert.deepEqual(rows.map(row => findTags(row, 'li').length), [6, 7]);
    const links = hookLinks(html);
    assert.deepEqual(links.map(({ text }) => text), ['2/0', '1/0', '1', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20']);
    assert.deepEqual(links.map(({ attrs }) => decodeHtml(attrs.href)), BAND.map(size => `/fly-hook-size-chart/#${anchorId(size)}`));
    assert.equal(links[0].attrs.href, '/fly-hook-size-chart/#size-2-0');
    assert.equal(links[12].attrs.href, '/fly-hook-size-chart/#size-20');
    for (const { attrs, text } of links) {
        assert.equal(attrs['aria-label'], `Size ${text}`);
        assert.ok(attrs['aria-label'].includes(text), 'WCAG 2.5.3: the name contains the visible label');
    }
    const [group] = findTags(gaugeOf(html), 'div');
    assert.equal(group.attrs.role, 'group');
    assert.equal(group.attrs['aria-label'], 'Hook sizes 2/0 to 20, drawn to relative scale');
    assert.match(group.attrs.class, /\brf-hook-gauge--band\b/);
});

test('every hook links to an anchor the chart page\'s rows carry (contract 6.9; rows.mjs\'s own output)', async () => {
    const ids = new Set(findTags(CHART_ROWS, 'tr').map(({ attrs }) => attrs.id).filter(Boolean));
    for (const { attrs } of hookLinks(await render())) {
        const { pathname, hash } = new URL(decodeHtml(attrs.href), 'https://reelflies.ca');
        assert.equal(pathname, CHART_URL);
        assert.ok(ids.has(hash.slice(1)), `${hash} is a row on the chart page`);
    }
});

test('it is ticket 35\'s gauge, markup for markup: gaugeHtml(\'band\') with the widget\'s labels (module 22)', async () => {
    const { gauge_label: label, gauge_size_label: sizeLabel } = channelFile.configuration;
    assert.equal(squash(gaugeOf(await render())), squash(gaugeHtml('band', { label, sizeLabel })));
    // Without labels it is the unlabelled gauge, as the partial is.
    assert.equal(squash(gaugeOf(await render({ gauge_label: '', gauge_size_label: '' }))), squash(gaugeHtml('band')));
});

test('each hook is drawn inline to the band\'s scale, hidden from screen readers, with its length for the style layer', async () => {
    const html = await render();
    for (const { svgs, text } of hookLinks(html)) {
        assert.equal(svgs.length, 1, text);
        const [{ attrs }] = svgs;
        assert.equal(attrs['aria-hidden'], 'true', text);
        assert.equal(attrs.focusable, 'false', text);
        assert.equal(Number(attrs.width), hookBox(lengths[text], LAYOUTS.band.k.desktop).width, text);
        assert.equal(attrs.style, `--rf-hook-len: ${lengths[text]};`, text);
    }
    assert.equal(findTags(html, 'use').length + findTags(html, 'img').length, 0, 'no sprite and no image: the band is whole on any channel\'s theme');
    const [group] = findTags(gaugeOf(html), 'div');
    assert.equal(group.attrs.style, '--rf-gauge-k: 3px; --rf-gauge-k-phone: 2.1px; --rf-gauge-k-narrow: 1.7px;');
});

// SEO-6 and UX-16: no hidden "All Flies" category, no "Flies in size N" listing, no facet link.
test('no link goes to a size category, a size listing or a facet URL: every link is the chart page', async () => {
    const html = await render();
    const hrefs = findTags(html, 'a').map(({ attrs }) => decodeHtml(attrs.href));
    assert.equal(hrefs.length, 14, 'the text link and 13 hooks');
    for (const href of hrefs) {
        const url = new URL(href, 'https://reelflies.ca');
        assert.equal(url.pathname, '/fly-hook-size-chart/', href);
        assert.equal(url.search, '', href);
        assert.doesNotMatch(href, /fly-sizes|Fly\+Sizes|_bc_fsnf|all-flies/i);
    }
});

test('the store copy has the gauge pasted in, with no partial left to include', () => {
    const { template, templateName } = readWidget('hook-sizes');
    assert.equal(templateName, 'rf-hook-sizes');
    assert.doesNotMatch(template, /\{\{>/);
    assert.match(template, /<div class="rf-hook-gauge rf-hook-gauge--band"/);
    assert.equal((template.match(/<li class="rf-hook-gauge__item">/g) || []).length, 13);
});

test('the template\'s own markup has no inline style: the only style attributes are the generated gauge\'s scale and lengths', async () => {
    assert.doesNotMatch(fs.readFileSync(path.join(DIR, 'template.html'), 'utf8'), /style=|<style/);
    for (const tag of findTags(await render()).filter(({ attrs }) => 'style' in attrs)) {
        assert.match(tag.attrs.style, /^(--rf-[a-z-]+: [\d.]+(px)?;\s?)+$/, tag.raw);
    }
});

test('the words are escaped, never raw HTML from a field', async () => {
    const html = await render({
        heading: 'Bigger <script>alert(1)</script>', text: '<b>Size</b> & scale', gauge_label: 'Hooks "drawn"', gauge_size_label: '<i>Size</i>',
    });
    assert.equal(findTags(html, 'script').length + findTags(html, 'b').length + findTags(html, 'i').length, 0);
    assert.ok(html.includes('Bigger &lt;script&gt;'));
    assert.match(html, /aria-label="Hooks &quot;drawn&quot;"/);
    assert.match(html, /aria-label="&lt;i&gt;Size&lt;\/i&gt; 14"/);
});

test('no field types a price or a count (HOME-4)', () => {
    for (const [id, value] of Object.entries(channelFile.configuration)) {
        assert.doesNotMatch(value, /\$\s?\d/, `${id}: no price`);
        assert.doesNotMatch(value, /\b\d[\d,]*\s+(patterns|flies|products|species|items)\b/i, `${id}: no count`);
    }
});
