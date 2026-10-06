// Tests for the fixture renderer (scripts/qa/render/render.mjs, W0-9): ReelFlies partials and
// widget templates rendered from fixture JSON through stencil-paper and
// stencil-paper-handlebars, as stencil start renders them. CI runs them through
// `npm run test:scripts`; they need no store, no browser and no compiled CSS.
//
//   node --test scripts/qa/render/render.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../raw-html/html.mjs';
import { unbalancedTags } from './html-checks.mjs';
import {
    DEFAULT_VARIATION, THEME_DIR, WIDGET_ID, readFixture, renderPartial, renderWidget, themeConfig, widgetCases,
} from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const TEMPLATES = path.join(FIXTURES, 'templates');
const WIDGETS = path.join(FIXTURES, 'widgets');
const fixture = name => readFixture(path.join(FIXTURES, name));
const partial = (name, context, options = {}) => renderPartial(`components/reelflies/${name}`, context, { templates: [TEMPLATES], ...options });
const textOf = (html, className) => html.match(new RegExp(`class="${className}"[^>]*>([\\s\\S]*?)</`))?.[1];

const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

// A theme folder with its own config.json, for the settings tests.
function themeWith(config) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-render-'));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
    fs.cpSync(path.join(THEME_DIR, 'lang'), path.join(dir, 'lang'), { recursive: true });
    fs.symlinkSync(path.join(THEME_DIR, 'templates'), path.join(dir, 'templates'), 'dir');
    return dir;
}

describe('a ReelFlies partial rendered from fixture JSON', () => {
    it('reads the fixture data and the theme settings', async () => {
        const html = await partial('rf-render-card', fixture('card.json'));
        assert.equal(textOf(html, 'rf-render-card__name'), 'Parachute Adams');
        assert.equal(textOf(html, 'rf-render-card__price'), '$0.95');
        assert.equal(textOf(html, 'rf-render-card__size'), themeConfig(DEFAULT_VARIATION).settings.productgallery_size);
        assert.match(html, /data-product-id="5663"/);
    });

    it('includes the stock partials it calls, from the theme\'s templates/', async () => {
        const html = await partial('rf-render-card', fixture('card.json'));
        const [image] = findTags(html, 'img');
        assert.ok(image, 'components/common/responsive-img rendered an <img>');
        assert.equal(image.attrs.alt, 'Parachute Adams dry fly');
        assert.match(image.attrs['data-srcset'], /\/images\/stencil\/2560w\/products\/5663\/20001\/parachute-adams\.jpg 2560w/);
        // lazyload_mode is lazyload+lqip in config.json, so the partial adds the lazyload class and an 80w LQIP.
        assert.match(image.attrs.class, /\blazyload\b.*\brf-render-card__image\b/);
        assert.match(image.attrs.srcset, /\/80w\//);
    });

    it('leaves the markup balanced', async () => {
        assert.deepEqual(unbalancedTags(await partial('rf-render-card', fixture('card.json'))), []);
    });

    it('fails, naming the partial and where it looked, when an included partial exists nowhere', async () => {
        await assert.rejects(partial('rf-render-missing-partial', {}), error => {
            assert.match(error.message, /components\/reelflies\/rf-render-nowhere/);
            assert.match(error.message, /fixtures\/templates/);
            assert.match(error.message, /templates/);
            return true;
        });
    });

    it('fails, naming the template, when the partial itself is missing', async () => {
        await assert.rejects(partial('rf-render-not-there', {}), /components\/reelflies\/rf-render-not-there/);
    });

    it('finds a template in the theme\'s templates/ when no fixture folder has it', async () => {
        const html = await renderPartial('components/common/responsive-img', { image: fixture('card.json').product.image }, { templates: [TEMPLATES] });
        assert.match(html, /<img /);
    });
});

describe('the whitelisted helpers', () => {
    let html;
    it('render', async () => {
        html = await partial('rf-render-helpers', fixture('helpers.json'));
    });

    it('split and trim: the description splits at <!--more-->, and each part is trimmed', () => {
        // The parts hold markup, so read the whole line.
        assert.equal(html.match(/<p class="split">(.*)<\/p>/)[1], '[<p>Flies that float.</p>][<p>How to pick one.</p>]');
        assert.equal(textOf(html, 'trim'), '[Elk Hair Caddis]');
    });

    it('inArray: takes the block when the value is in the array, and the else block when it isn\'t', () => {
        assert.equal(textOf(html, 'in-array'), 'has b, no z');
    });

    it('assignVar and getVar: a value set in one partial is read in another during the same render', () => {
        assert.equal(textOf(html, 'flag'), 'banner 1');
    });

    it('assignVar and getVar: each render starts with no variables, as each page request does', async () => {
        assert.equal(textOf(await partial('rf-render-flag', {}), 'flag'), 'no banner');
    });

    it('getImageSrcset: a srcset from the sizes given, and the default sizes up to the image\'s width', () => {
        const [sized, defaults] = findTags(html, 'img');
        const url = size => `https://cdn11.bigcommerce.com/s-fixture/images/stencil/${size}/products/5663/20001/parachute-adams.jpg`;
        assert.equal(sized.attrs.src, url('320w'));
        assert.equal(sized.attrs.srcset, `${url('320w')} 1x, ${url('640w')} 2x`);
        // The image is 700 px wide, so the default sizes stop at 640w and add 700w.
        assert.equal(defaults.attrs.srcset, ['80w', '160w', '320w', '640w', '700w'].map(size => `${url(size)} ${size}`).join(', '));
    });

    it('lang: strings come from the theme\'s lang/en.json', () => {
        assert.equal(textOf(html, 'lang'), 'Oops! Something went wrong.');
    });

    it('a helper the store doesn\'t have fails the render instead of rendering nothing', async () => {
        await assert.rejects(partial('rf-render-unknown-helper', fixture('card.json')), error => {
            assert.match(error.message, /\bshout\b/);
            assert.match(error.message, /components\/reelflies\/rf-render-unknown-helper/);
            return true;
        });
    });

    it('a misspelled helper called with hash arguments only fails the render too', async () => {
        await assert.rejects(partial('rf-render-unknown-hash-helper', {}), error => {
            assert.match(error.message, /\{\{regoin\}\}/);
            assert.match(error.message, /components\/reelflies\/rf-render-unknown-hash-helper/);
            return true;
        });
    });

    it('a plain {{name}} that matches nothing still renders empty: that is a missing value, not a helper', async () => {
        const name = 'components/reelflies/rf-render-missing-value';
        assert.equal(await renderPartial(name, {}, { overrides: { [name]: '<p>[{{no_such_value}}]</p>' } }), '<p>[]</p>');
    });

    it('with strict: false, an unknown helper renders nothing, as on the store', async () => {
        const rendered = await partial('rf-render-unknown-helper', fixture('card.json'), { strict: false });
        assert.match(rendered, /<p><\/p>/);
        assert.match(await partial('rf-render-unknown-hash-helper', {}, { strict: false }), /<p><\/p>/);
    });
});

describe('the theme settings', () => {
    it('are config.json\'s settings with the variation\'s on top, as stencil start merges them', () => {
        const dir = themeWith({
            template_engine: 'handlebars_v4',
            settings: { productgallery_size: '500x659', lazyload_mode: 'lazyload+lqip' },
            variations: [{ name: 'One', settings: {} }, { name: 'Two', settings: { productgallery_size: '300x300' } }],
        });
        assert.equal(themeConfig('One', dir).settings.productgallery_size, '500x659');
        assert.equal(themeConfig('Two', dir).settings.productgallery_size, '300x300');
        assert.equal(themeConfig('Two', dir).settings.lazyload_mode, 'lazyload+lqip');
        assert.equal(themeConfig('Two', dir).variationIndex, 1);
    });

    it('come from the variation a render asks for', async () => {
        const dir = themeWith({
            template_engine: 'handlebars_v4',
            settings: { productgallery_size: '500x659', lazyload_mode: 'disabled' },
            variations: [{ name: 'One', settings: {} }, { name: 'Two', settings: { productgallery_size: '300x300' } }],
        });
        const html = await partial('rf-render-card', fixture('card.json'), { themeDir: dir, variation: 'Two' });
        assert.equal(textOf(html, 'rf-render-card__size'), '300x300');
    });

    it('take a fixture\'s theme_settings over them, key by key, for a render with a switch on or off', async () => {
        const html = await partial('rf-render-card', { ...fixture('card.json'), theme_settings: { productgallery_size: '999x999' } });
        assert.equal(textOf(html, 'rf-render-card__size'), '999x999');
        const [image] = findTags(html, 'img');
        assert.match(image.attrs.class, /\blazyload\b/, 'the other settings are still config.json\'s');
    });

    it('fail on a variation config.json doesn\'t have, naming the ones it has', () => {
        assert.throws(() => themeConfig('ReelFlies Mars'), /"ReelFlies Mars".*ReelFlies CA/);
    });
});

describe('a widget template rendered from fixture JSON', () => {
    const band = (data = fixture('widgets/rf-render-band/fixtures/two-in-stock.json')) => renderWidget('rf-render-band', data, { root: WIDGETS });

    it('reads widget_configuration at the top level and the GraphQL result as _.data', async () => {
        const html = await band();
        assert.match(html, /<h2>Best sellers<\/h2>/);
        assert.match(html, /Parachute Adams/);
        assert.match(html, /Elk Hair Caddis/);
    });

    it('gives _.id the fixture widget id, so a shot is the same every run', async () => {
        assert.ok((await band()).includes(`rf-render-band--${WIDGET_ID}`));
    });

    it('includes partials shared between widgets from widgets/_shared/', async () => {
        assert.match(await band(), /<span class="rf-render-band__price">0\.95 CAD<\/span>/);
    });

    it('follows the data: a changed price changes the render, and a product sold out in every size is left out', async () => {
        const data = fixture('widgets/rf-render-band/fixtures/two-in-stock.json');
        data.data.site.products.edges[0].node.prices.price.value = 1.25;
        const html = await band(data);
        assert.match(html, /Parachute Adams <span class="rf-render-band__price">1\.25 CAD/);
        assert.doesNotMatch(html, /Royal Wulff/);
    });

    it('fails on a widget that has no template.html, naming the folder', async () => {
        await assert.rejects(renderWidget('rf-render-nothing', {}, { root: WIDGETS }), /rf-render-nothing\/template\.html/);
    });
});

describe('a widget template\'s helpers', () => {
    // A widgets folder holding one widget, `w`, with this template.
    const widgetWith = source => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widgets-'));
        tempDirs.push(root);
        fs.mkdirSync(path.join(root, 'w'));
        fs.writeFileSync(path.join(root, 'w/template.html'), source);
        return root;
    };
    const render = (source, options = {}) => renderWidget('w', { configuration: { name: 'Parachute Adams' } }, { root: widgetWith(source), ...options });

    it('fail the render on a helper the store doesn\'t have, naming the helper and the template', async () => {
        await assert.rejects(render('<p>{{shout name}}</p>'), error => {
            assert.match(error.message, /\{\{shout\}\}/);
            assert.match(error.message, /w\/template\.html/);
            return true;
        });
    });

    it('fail the render on a misspelled helper called with hash arguments only', async () => {
        await assert.rejects(render('<p>{{regoin name="home_below_menu"}}</p>'), /\{\{regoin\}\}/);
    });

    for (const [helper, call] of [
        ['lang', '{{lang "common.error"}}'],
        ['langJson', '{{{langJson "common"}}}'],
        ['inject', '{{inject "name" name}}'],
        ['jsContext', '{{jsContext}}'],
        ['region', '{{{region name="home_below_menu"}}}'],
    ]) {
        it(`fail the render on ${helper}, which reads the theme's page context that a widget template doesn't get`, async () => {
            await assert.rejects(render(`<p>${call}</p>`), error => {
                assert.match(error.message, new RegExp(`\\{\\{${helper}\\}\\}`));
                assert.match(error.message, /widget_configuration/);
                assert.match(error.message, /w\/template\.html/);
                return true;
            });
        });
    }

    it('render a plain {{name}} that matches nothing as empty', async () => {
        assert.equal(await render('<p>[{{no_such_value}}]</p>'), '<p>[]</p>');
    });

    it('with strict: false, render as stencil-paper-handlebars does: unknown helpers and lang as nothing', async () => {
        assert.equal(await render('<p>{{shout name}}</p><p>{{regoin name="x"}}</p><p>{{lang "common.error"}}</p>', { strict: false }), '<p></p><p></p><p></p>');
    });
});

describe('the widget fixtures', () => {
    it('are found under each widget\'s fixtures/ folder, and _shared/ is not a widget', () => {
        const cases = widgetCases([WIDGETS]);
        assert.deepEqual(cases.map(({ widget, name }) => `${widget}/${name}`), ['rf-render-band/render-only', 'rf-render-band/two-in-stock']);
        const [renderOnly, twoInStock] = cases;
        assert.equal(renderOnly.shot, false);
        assert.equal(twoInStock.shot, true);
        assert.equal(twoInStock.fixture.region, 'home_below_top_products');
        assert.equal(twoInStock.root, WIDGETS);
    });

    it('are none when the widgets folder doesn\'t exist yet', () => {
        assert.deepEqual(widgetCases([path.join(FIXTURES, 'no-such-folder')]), []);
    });

    it('fail when a fixture for a shot doesn\'t say which page and region it sits in', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widgets-'));
        tempDirs.push(root);
        fs.mkdirSync(path.join(root, 'hero/fixtures'), { recursive: true });
        fs.writeFileSync(path.join(root, 'hero/template.html'), '<p>{{text}}</p>');
        fs.writeFileSync(path.join(root, 'hero/fixtures/default.json'), JSON.stringify({ configuration: { text: 'hi' } }));
        assert.throws(() => widgetCases([root]), /hero\/fixtures\/default\.json.*"page".*"region"/);
    });

    it('fail when "page_context" isn\'t an object or "chrome" isn\'t true or false', () => {
        const where = { page: 'pages/home', region: 'home_below_menu' };
        for (const [bad, message] of [
            [{ page_context: [] }, /hero\/fixtures\/default\.json.*"page_context"/],
            [{ page_context: 'cart' }, /hero\/fixtures\/default\.json.*"page_context"/],
            [{ chrome: 'yes' }, /hero\/fixtures\/default\.json.*"chrome"/],
        ]) {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widgets-'));
            tempDirs.push(root);
            fs.mkdirSync(path.join(root, 'hero/fixtures'), { recursive: true });
            fs.writeFileSync(path.join(root, 'hero/template.html'), '<p>{{text}}</p>');
            fs.writeFileSync(path.join(root, 'hero/fixtures/default.json'), JSON.stringify({ ...where, ...bad }));
            assert.throws(() => widgetCases([root]), message, JSON.stringify(bad));
        }
    });
});
