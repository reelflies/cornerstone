// What ReelFlies adds to every page's <head> (ticket 25, as the Streamside Stone redesign has it):
// components/reelflies/head.html, which layout/base.html includes in place of stock's
// theme-bundle.font.js, and base.html's own hooks (<html lang="en-CA">, getFontsCollection with
// swap). Onest gave way to Archivo, one variable file behind all three cuts, and the default share
// image came back in step 4. The raw-HTML check runs the same rules on the served pages
// (lang-en-ca, rf-fonts, rf-brand-head).
//
//   node --test scripts/qa/render/partials/head.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { FONT_FILE } from '../../raw-html/assertions/rf-fonts.mjs';
import { DEFAULT_SHARE_IMAGE } from '../../raw-html/assertions/rf-brand-head.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial, THEME_DIR } from '../render.mjs';

const PRODUCT_META = '<meta property="og:type" content="product" /><meta property="og:image" content="https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/500x659/products/6178/hopper.jpg" />';
const render = (metaTags = '', settings = {}) => renderPartial('components/reelflies/head', { head: { meta_tags: metaTags }, settings });
const metas = (html, attr, value) => findTags(html, 'meta').filter(tag => tag.attrs[attr] === value);

describe('components/reelflies/head', () => {
    it('says the content language is en-CA', async () => {
        const html = await render();
        assert.deepEqual(metas(html, 'http-equiv', 'content-language').map(tag => tag.attrs.content), ['en-CA']);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('preloads Archivo, once, from theme assets, as a CORS font, at the URL the @font-face asks for', async () => {
        const html = await render();
        const [preload, ...more] = findTags(html, 'link').filter(tag => tag.attrs.rel === 'preload');
        assert.equal(more.length, 0, 'one preload: Kalam is small and appears once a region');
        assert.equal(preload.attrs.as, 'font');
        assert.equal(preload.attrs.type, 'font/woff2');
        assert.ok('crossorigin' in preload.attrs);
        // The cdn helper names the file under the theme's version folder, where the CSS's
        // url("../fonts/…") lands from css/theme-<id>.css.
        assert.equal(FONT_FILE, 'fonts/archivo-latin-var.woff2');
        assert.equal(preload.attrs.href, `/stencil/00000000-0000-0000-0000-000000000001/${FONT_FILE}`);
        const fonts = fs.readFileSync(path.join(THEME_DIR, 'assets/scss/reelflies/_fonts.scss'), 'utf8');
        assert.match(fonts, /\$rf-archivo-src: url\("\.\.\/fonts\/archivo-latin-var\.woff2"\) format\("woff2"\);/);
        assert.equal((fonts.match(/src: \$rf-archivo-src;/g) || []).length, 3, 'the three cuts share the file');
        assert.ok(fs.existsSync(path.join(THEME_DIR, 'assets', FONT_FILE)));
    });

    it('serves the preload from the store CDN on the store', async () => {
        const html = await render('', { cdn_url: 'https://cdn11.bigcommerce.com/s-8pfqkn26ea', theme_version_id: 'v1' });
        const [preload] = findTags(html, 'link');
        assert.equal(preload.attrs.href, `https://cdn11.bigcommerce.com/s-8pfqkn26ea/stencil/v1/${FONT_FILE}`);
    });

    it('gives a page with no image of its own the ReelFlies share image, 1200 by 630', async () => {
        const html = await render('<meta name="description" content="Hand-tied flies">');
        const images = metas(html, 'property', 'og:image');
        assert.equal(images.length, 1);
        assert.ok(images[0].attrs.content.endsWith(`/${DEFAULT_SHARE_IMAGE}`), images[0].attrs.content);
        assert.equal(metas(html, 'property', 'og:image:width')[0].attrs.content, '1200');
        assert.equal(metas(html, 'property', 'og:image:height')[0].attrs.content, '630');
        assert.ok(fs.existsSync(path.join(THEME_DIR, 'assets', DEFAULT_SHARE_IMAGE)));
    });

    it('adds no second image to a page the store already gives one, such as a product', async () => {
        const html = await render(PRODUCT_META);
        assert.equal(metas(html, 'property', 'og:image').length, 0);
        assert.equal(metas(html, 'property', 'og:image:width').length, 0);
    });

    it('renders nothing but head elements: its page variables and injects leave no markup', async () => {
        const html = await render();
        assert.deepEqual([...new Set(findTags(html).map(tag => tag.name))].sort(), ['link', 'meta']);
        assert.equal(html.replace(/<(meta|link)\b[^>]*>/g, '').trim(), '');
    });
});

describe('layout/base.html\'s head hooks', () => {
    const base = fs.readFileSync(path.join(THEME_DIR, 'templates/layout/base.html'), 'utf8');

    it('prints <html lang="en-CA">, not the store locale', () => {
        assert.match(base, /^<!DOCTYPE html>\n<html class="no-js" lang="en-CA">/);
        assert.doesNotMatch(base, /\{\{\s*locale_name\s*\}\}/);
    });

    it('asks getFontsCollection for swap, and no longer loads theme-bundle.font.js, which needs a Google Fonts link', () => {
        assert.match(base, /\{\{getFontsCollection font-display='swap'\}\}/);
        assert.doesNotMatch(base, /<script[^>]*theme-bundle\.font\.js/);
        assert.equal(base.split('{{> components/reelflies/head}}').length - 1, 1);
        assert.ok(base.indexOf('{{> components/reelflies/head}}') < base.indexOf("{{{stylesheet '/assets/css/theme.css'}}}"), 'the preload comes before the stylesheet');
    });
});
