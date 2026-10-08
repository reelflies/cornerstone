// Fixture renders of the shipping strip (ticket 27; spec module 2, O04): what the store renders
// from widgets/shipping-strip/template.html with a channel's widget_configuration. Its element
// shots at 375 and 1280 are widget-screens.spec.mjs's, and its place under the header (the
// labelled landmark, scrolling away under the phone bar) shipping-strip-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/shipping-strip.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { stripRegionProblems } from '../../raw-html/assertions/strip-region.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import {
    WIDGETS_DIR, readFixture, renderWidget, widgetCases,
} from '../render.mjs';
import { renderWidgetPage } from '../widget-page.mjs';

const DIR = path.join(WIDGETS_DIR, 'shipping-strip');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const schema = readFixture(path.join(DIR, 'schema.json'));
const render = (configuration = {}) => renderWidget('shipping-strip', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const lines = html => [...html.matchAll(/<p class="([^"]+)">([\s\S]*?)<\/p>/g)].map(([, cls, body]) => [cls, text(body)]);

// Ticket 13's decision 2, as ticket 27's owner-decisions comment words it.
const LONG = 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.';
const SHORT = 'Free standard shipping on fly orders over $60';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
});

test('the channel file places it on 1895766 in header_bottom--global, the region every page has, active, with the uuids its first write made', () => {
    assert.equal(channelFile.channel_id, 1895766);
    // A global region still names a template; the widget shows on every page that has the region.
    // Active since the checkpoint-02 release carried 27's landmark and styles.
    assert.deepEqual(channelFile.placement, {
        template_file: 'pages/home', region: 'header_bottom--global', sort_order: 0, status: 'active',
    });
    // Recorded by --record after the first write (2026-10-08, plan 6a53f3f4).
    for (const name of ['template', 'widget', 'placement']) assert.match(channelFile.uuids[name], UUID, `its ${name} is recorded`);
    assert.equal(fixture.region, 'header_bottom--global');
    assert.equal(fixture.chrome, true, 'its fixture page renders the theme\'s header round it');
});

test('the schema\'s defaults are the channel\'s copy', () => {
    const settings = schema.flatMap(tab => tab.sections.flatMap(section => section.settings));
    assert.deepEqual(Object.fromEntries(settings.map(setting => [setting.id, setting.default])), channelFile.configuration);
});

test('renders the shipping promise from its fields: the long line and the short one', async () => {
    const html = await render();
    assert.deepEqual(lines(html), [
        ['rf-strip-line rf-strip-line--long', LONG],
        ['rf-strip-line rf-strip-line--short', SHORT],
    ]);
    assert.deepEqual(unbalancedTags(html), []);
});

test('holds nothing but the promise: no link, no button, no ReelFlies.com', async () => {
    const html = await render();
    assert.equal(findTags(html, 'a').length, 0);
    assert.equal(findTags(html, 'button').length, 0);
    assert.doesNotMatch(html, /reelflies\.com/i);
});

test('draws its truck itself, hidden from screen readers', async () => {
    const svgs = findTags(await render(), 'svg');
    assert.equal(svgs.length, 2);
    for (const svg of svgs) {
        assert.equal(svg.attrs['aria-hidden'], 'true');
        assert.equal(svg.attrs.width, '20', 'sized even before the theme\'s CSS reaches it');
        assert.ok(!findTags(svg.raw, 'use').length);
    }
    assert.equal(findTags(await render(), 'use').length, 0, 'no <use> of the theme\'s icon sheet, which another channel\'s theme hasn\'t got');
});

test('escapes its copy, never raw HTML from a field', async () => {
    const html = await render({ short_text: 'Free <a href="https://reelflies.com/">shipping</a>' });
    assert.equal(findTags(html, 'a').length, 0);
    assert.ok(html.includes('Free &lt;a href'));
});

test('uses no inline styles: the theme\'s ReelFlies layer styles it (decision 6)', () => {
    const source = fs.readFileSync(path.join(DIR, 'template.html'), 'utf8');
    assert.doesNotMatch(source, /style=|<style/);
});

test('sits after the header, inside the "Shipping and prices" landmark, on its fixture page', async () => {
    const html = await renderWidgetPage(widgetCases([WIDGETS_DIR]).find(({ widget, name }) => widget === 'shipping-strip' && name === 'default'));
    assert.deepEqual(stripRegionProblems(html), []);
    assert.ok(html.indexOf('</header>') < html.indexOf('data-rf-strip'));
});

test('the strip-region check fails a strip with a link to ReelFlies.com', async () => {
    const strip = (await render()).replace('</p>\n    </div>', '<a href="https://reelflies.com/">Shop in USD</a></p>\n    </div>');
    const page = `<header data-rf-header></header><div class="rf-strip-region" role="region" aria-label="Shipping and prices" data-rf-strip-region><div data-content-region="header_bottom--global"><div data-widget-id="w">${strip}</div></div></div>`;
    assert.match(stripRegionProblems(page).join('\n'), /holds a link \(https:\/\/reelflies\.com\/\)/);
});
