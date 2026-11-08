// The ReelFlies page frame (ticket 25's scaffold, build pipeline 6.1 and 6.2, as the Streamside
// Stone redesign draws it): the icon sheet (components/reelflies/icons.html, inline symbols that
// header.html renders first), the icon partial that draws from it, the one polite live region
// after the phone drawer in header.html, and head.html's injects, which fill the page context
// the scripts read (master's js-settings.html is gone).
//
//   node --test scripts/qa/render/partials/reelflies-frame.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import rfIconSheet from '../../raw-html/assertions/rf-icon-sheet.mjs';
import rfLiveRegion from '../../raw-html/assertions/rf-live-region.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { readFixture, renderPartial, THEME_DIR } from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(THEME_DIR, 'templates');
const SCRIPTS = path.join(THEME_DIR, 'assets/js/theme/reelflies');
const CALLERS = path.join(HERE, 'reelflies-frame', 'templates');
const ICONS = fs.readFileSync(path.join(TEMPLATES, 'components/reelflies/icons.html'), 'utf8');
// The header's own icons, which every page draws.
const HEADER_ICONS = ['menu', 'chevron', 'arrow', 'search', 'user', 'box', 'close', 'phone'];

const symbolIds = () => findTags(ICONS, 'symbol').map(tag => tag.attrs.id);
const sheetIcons = () => symbolIds().map(id => id.replace(/^rf-i-/, ''));
const files = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(entryPath, ext);
    return entry.name.endsWith(ext) ? [entryPath] : [];
});
// The header as a page renders it: tree 4's categories and store data, with the URLs it links.
const headerContext = () => {
    const context = readFixture(path.join(HERE, 'footer', 'tree-4.json'));
    return {
        ...context,
        urls: {
            ...context.urls, cart: '/cart.php', search: '/search.php', auth: { login: '/login.php' }, account: { index: '/account.php' },
        },
    };
};
const page = html => ({
    kind: 'home', key: 'home', path: '/', url: 'http://localhost:3601/', status: 200, html: `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body>${html}<main class="body" id="main-content"></main></body></html>`,
});

describe('the icon sheet', () => {
    it('is one svg.rf-icon-sheet that takes no room and is hidden from screen readers and the keyboard', async () => {
        const html = await renderPartial('components/reelflies/icons');
        const svgs = findTags(html, 'svg');
        assert.equal(svgs.length, 1);
        const [sheet] = svgs;
        assert.equal(sheet.attrs.class, 'rf-icon-sheet');
        assert.equal(sheet.attrs.width, '0');
        assert.equal(sheet.attrs.height, '0');
        assert.equal(sheet.attrs['aria-hidden'], 'true');
        assert.equal(sheet.attrs.focusable, 'false');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('holds the header\'s icons, each symbol named rf-i-<name> on the 24px grid, the hook on its own 32x64 grid', () => {
        const symbols = findTags(ICONS, 'symbol');
        for (const name of HEADER_ICONS) assert.ok(symbolIds().includes(`rf-i-${name}`), `rf-i-${name} is in the sheet`);
        for (const symbol of symbols) {
            assert.match(symbol.attrs.id, /^rf-i-[a-z-]+$/);
            assert.equal(symbol.attrs.viewbox, symbol.attrs.id === 'rf-i-hook' ? '0 0 32 64' : '0 0 24 24', symbol.attrs.id);
        }
        assert.equal(new Set(symbolIds()).size, symbols.length, 'each name once');
    });

    it('draws every stroke in currentColor, so an icon takes the colour of the text beside it', () => {
        const strokes = [...ICONS.matchAll(/stroke="([^"]+)"/g)].map(([, value]) => value);
        const fills = [...ICONS.matchAll(/fill="([^"]+)"/g)].map(([, value]) => value);
        assert.ok(strokes.length > 0);
        assert.deepEqual([...new Set([...strokes, ...fills])].sort(), ['currentColor', 'none']);
    });
});

describe('the icon partial', () => {
    it('draws an icon from the sheet, hidden from screen readers, with the caller\'s class', async () => {
        // A test-only template that uses the partial as a theme template would.
        const used = await renderPartial('components/reelflies/test-icon-caller', {}, { templates: [CALLERS] });
        const [svg] = findTags(used, 'svg');
        assert.equal(svg.attrs['aria-hidden'], 'true');
        assert.equal(svg.attrs.focusable, 'false');
        assert.equal(svg.attrs.class, 'rf-icon rf-cart-icon');
        assert.equal(findTags(used, 'use')[0].attrs.href, '#rf-i-box');
        assert.equal(findTags(await renderPartial('components/reelflies/icon', { name: 'arrow' }), 'svg')[0].attrs.class, 'rf-icon', 'no extra class without one');
        assert.deepEqual(unbalancedTags(used), []);
    });

    it('is only ever asked, by a template, for an icon the sheet has', () => {
        const use = /\{\{>\s*components\/reelflies\/icon\s+name=(['"])([^'"]+)\1/g;
        let asked = 0;
        for (const file of files(TEMPLATES, '.html')) {
            for (const [, , name] of fs.readFileSync(file, 'utf8').matchAll(use)) {
                asked += 1;
                assert.ok(sheetIcons().includes(name), `${path.relative(THEME_DIR, file)} asks for icon "${name}", which isn't in components/reelflies/icons.html`);
            }
        }
        assert.ok(asked > 10, 'the templates draw icons');
    });

    it('is only ever asked, by a script, for an icon the sheet has', () => {
        // The scripts that draw markup keep a copy of the partial, `icon(name)`, and call it by name.
        let asked = 0;
        const drawing = files(SCRIPTS, '.js').map(file => ({ file, source: fs.readFileSync(file, 'utf8') })).filter(({ source }) => /const icon = name =>/.test(source));
        for (const { file, source } of drawing) {
            assert.match(source, /<use href="#rf-i-\$\{name\}"><\/use>/, `${path.relative(THEME_DIR, file)} draws from the sheet`);
            for (const [, name] of source.matchAll(/\bicon\('([a-z-]+)'\)/g)) {
                asked += 1;
                assert.ok(sheetIcons().includes(name), `${path.relative(THEME_DIR, file)} asks for icon "${name}", which isn't in components/reelflies/icons.html`);
            }
        }
        assert.ok(drawing.length > 0 && asked > 0, 'the scripts draw icons');
    });
});

describe('header.html\'s frame', () => {
    it('renders the sheet first, then the strip, the header, the scrim and the drawer, and the live region last', async () => {
        const html = await renderPartial('components/reelflies/header', headerContext());
        const first = tag => (tag.attrs.class || '').split(/\s+/)[0];
        const top = findTags(html).filter(tag => ['svg', 'div', 'header'].includes(tag.name) && (['rf-icon-sheet', 'rf-strip', 'rf-head', 'rf-mega-scrim', 'rf-drawer'].includes(first(tag)) || 'data-rf-live-region' in tag.attrs));
        assert.deepEqual(top.map(first), ['rf-icon-sheet', 'rf-strip', 'rf-head', 'rf-mega-scrim', 'rf-drawer', 'is-srOnly']);
        assert.ok('data-rf-live-region' in top[top.length - 1].attrs);
        assert.equal(findTags(html, 'svg').filter(tag => tag.attrs.class === 'rf-icon-sheet').length, 1);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('renders the live region empty, polite, atomic and visually hidden, as the raw-HTML check asks', async () => {
        const html = await renderPartial('components/reelflies/header', headerContext());
        const region = findTags(html, 'div').find(tag => 'data-rf-live-region' in tag.attrs);
        assert.equal(region.attrs.role, 'status');
        assert.equal(region.attrs['aria-live'], 'polite');
        assert.equal(region.attrs['aria-atomic'], 'true');
        assert.equal(region.attrs.class, 'is-srOnly');
        assert.match(html, /data-rf-live-region><\/div>/);
        assert.deepEqual(rfLiveRegion.check(page(html)), []);
    });

    it('puts the sheet after the stock skip link and before the first icon, holding every icon the header draws', async () => {
        const html = await renderPartial('components/common/header', headerContext());
        assert.ok(html.indexOf('skip-to-main-link') < html.indexOf('rf-icon-sheet'), 'the skip link stays first');
        assert.deepEqual(rfIconSheet.check(page(html)), []);
        const drawn = [...new Set(findTags(html, 'use').map(tag => tag.attrs.href.replace('#rf-i-', '')))].sort();
        assert.deepEqual(drawn, [...HEADER_ICONS].sort());
    });
});

describe('head.html\'s injects, in place of js-settings', () => {
    const CONTEXT = { settings: { money: { currency_token: '$' }, storefront_api: { token: 'public-token' }, channel_id: 1 }, head: { meta_tags: '' } };
    const injected = async (context = CONTEXT) => {
        const html = await renderPartial('components/reelflies/test-head-context', context, { templates: [CALLERS] });
        // base.html prints jsContext as a JavaScript string literal of the JSON.
        return JSON.parse(JSON.parse(html.match(/<script data-rf-test-context>([\s\S]*?)<\/script>/)[1]));
    };

    it('renders only head elements: the content language, the font preload and the share image', async () => {
        const html = await renderPartial('components/reelflies/head', CONTEXT);
        assert.deepEqual([...new Set(findTags(html).map(tag => tag.name))].sort(), ['link', 'meta']);
        assert.equal(html.replace(/<(meta|link)\b[^>]*>/g, '').trim(), '', 'nothing but the elements');
    });

    it('gives the scripts the switches, the Storefront API token, the channel, the money token, the hook chart and the words', async () => {
        const context = await injected();
        assert.equal(context.rfQuickAdd, true);
        assert.equal(context.rfCartState, true);
        assert.equal(context.rfFlyBrands, 'ReelFlies');
        assert.equal(context.rfFreeShipping, '60');
        assert.equal(context.rfMoney, '$');
        assert.equal(context.rfStorefrontToken, 'public-token');
        assert.equal(context.rfChannelId, 1);
        assert.equal(context.rfHookChart, '/fly-hook-size-chart/');
        // langJson hands the scripts stencil-utils' Lang structure: the strings keyed by their full
        // path under `translations`, with the locale each came from.
        const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang', 'en.json'), 'utf8'));
        const words = JSON.parse(context.rfWords);
        assert.equal(words.locale, 'en');
        assert.deepEqual(words.translations, Object.fromEntries(Object.entries(lang.reelflies.js).map(([key, value]) => [`reelflies.js.${key}`, value])));
    });

    it('follows the variation: the .com preview has no free-shipping threshold', async () => {
        const html = await renderPartial('components/reelflies/test-head-context', CONTEXT, { templates: [CALLERS], variation: 'ReelFlies US' });
        const context = JSON.parse(JSON.parse(html.match(/<script data-rf-test-context>([\s\S]*?)<\/script>/)[1]));
        assert.equal(context.rfFreeShipping, '');
    });

    it('has retired js-settings.html and body-start.html: no file, and no template includes them', () => {
        for (const name of ['js-settings', 'body-start']) {
            assert.ok(!fs.existsSync(path.join(TEMPLATES, 'components/reelflies', `${name}.html`)), `${name}.html is gone`);
            for (const file of files(TEMPLATES, '.html')) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), new RegExp(`components/reelflies/${name}\\b`), path.relative(THEME_DIR, file));
        }
    });
});
