// The ReelFlies page frame from ticket 25's scaffold (build pipeline 6.1, 6.2): the icon sheet
// and the shared live region that every page gets right after <body>
// (components/reelflies/body-start.html), the icon partial, and js-settings.html, which
// base.html includes once inside its inject block.
//
//   node --test scripts/qa/render/partials/reelflies-frame.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial, THEME_DIR } from '../render.mjs';

const TEMPLATES = path.join(THEME_DIR, 'templates');
const CALLERS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reelflies-frame', 'templates');
const ICONS_DIR = path.join(TEMPLATES, 'components/reelflies/icons');
// Ticket 25's six (O22): search, bag, account, truck, check and phone.
const FOUNDATION_ICONS = ['account', 'bag', 'check', 'phone', 'search', 'truck'];

const iconFiles = () => fs.readdirSync(ICONS_DIR).filter(name => name.endsWith('.html')).map(name => name.slice(0, -'.html'.length)).sort();
const templateFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return templateFiles(entryPath);
    return entry.name.endsWith('.html') ? [entryPath] : [];
});

describe('body-start', () => {
    it('renders the icon sheet, then the live region, and nothing else', async () => {
        const html = await renderPartial('components/reelflies/body-start');
        const top = findTags(html).filter(tag => ['svg', 'div'].includes(tag.name));
        assert.deepEqual(top.map(tag => tag.name), ['svg', 'div']);
        assert.ok('data-rf-icons' in top[0].attrs);
        assert.ok('data-rf-live-region' in top[1].attrs);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('renders the live region empty, polite and visually hidden', async () => {
        const html = await renderPartial('components/reelflies/body-start');
        const region = findTags(html, 'div').find(tag => 'data-rf-live-region' in tag.attrs);
        assert.equal(region.attrs.role, 'status');
        assert.equal(region.attrs['aria-live'], 'polite');
        assert.equal(region.attrs.class, 'is-srOnly');
        assert.match(html, /data-rf-live-region><\/div>/);
    });
});

describe('the icon sheet', () => {
    it('is hidden from screen readers and from the layout', async () => {
        const html = await renderPartial('components/reelflies/icons');
        const [sheet] = findTags(html, 'svg');
        assert.equal(sheet.attrs['aria-hidden'], 'true');
        assert.equal(sheet.attrs.focusable, 'false');
        assert.match(sheet.attrs.class, /\bu-hiddenVisually\b/);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('holds ticket 25\'s six icons as 24px symbols', async () => {
        const html = await renderPartial('components/reelflies/icons');
        const symbols = findTags(html, 'symbol');
        for (const name of FOUNDATION_ICONS) {
            const symbol = symbols.find(tag => tag.attrs.id === `rf-icon-${name}`);
            assert.ok(symbol, `rf-icon-${name} is in the sheet`);
            assert.equal(symbol.attrs.viewbox, '0 0 24 24');
        }
    });

    it('includes every file in icons/, each holding one symbol named after it', async () => {
        const html = await renderPartial('components/reelflies/icons');
        const ids = findTags(html, 'symbol').map(tag => tag.attrs.id).sort();
        assert.deepEqual(ids, iconFiles().map(name => `rf-icon-${name}`));
        for (const name of iconFiles()) {
            const file = fs.readFileSync(path.join(ICONS_DIR, `${name}.html`), 'utf8');
            assert.equal(findTags(file, 'symbol').length, 1, `icons/${name}.html holds one symbol`);
        }
    });
});

describe('the icon partial', () => {
    it('draws a 1.6px line icon from the sheet, hidden from screen readers', async () => {
        // A test-only template that uses the partial as a theme template would.
        const used = await renderPartial('components/reelflies/test-icon-caller', {}, { templates: [CALLERS] });
        const [svg] = findTags(used, 'svg');
        assert.equal(svg.attrs['aria-hidden'], 'true');
        assert.equal(svg.attrs.focusable, 'false');
        assert.equal(svg.attrs.class, 'rf-icon rf-cart-icon');
        assert.equal(svg.attrs.fill, 'none');
        assert.equal(svg.attrs.stroke, 'currentColor');
        assert.equal(svg.attrs['stroke-width'], '1.6');
        assert.equal(findTags(used, 'use')[0].attrs.href, '#rf-icon-bag');
        assert.deepEqual(unbalancedTags(used), []);
    });

    it('is only ever asked for an icon the sheet has', () => {
        const use = /\{\{>\s*components\/reelflies\/icon\s+name=(['"])([^'"]+)\1/g;
        for (const file of templateFiles(TEMPLATES)) {
            for (const [, , name] of fs.readFileSync(file, 'utf8').matchAll(use)) {
                assert.ok(iconFiles().includes(name), `${path.relative(THEME_DIR, file)} asks for icon "${name}", which isn't in components/reelflies/icons/`);
            }
        }
    });
});

describe('js-settings', () => {
    it('renders no markup, only the values it injects into the page context', async () => {
        const html = await renderPartial('components/reelflies/js-settings');
        assert.equal(html.trim(), '');
    });
});
