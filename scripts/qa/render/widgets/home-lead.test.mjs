// Fixture renders of the home lead, the photo hero (ticket 46; spec module 6, O21): what the
// store renders from widgets/home-lead/template.html with a channel's widget_configuration.
// The element shots at 375 and 1280 are widget-screens.spec.mjs's, and the layout checks
// (300px cap, text below the photo on phones, contrast over the scrim) home-lead-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/home-lead.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';

const DIR = path.join(WIDGETS_DIR, 'home-lead');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const render = (configuration = {}) => renderWidget('home-lead', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
const WIDTHS = [320, 480, 640, 960, 1280, 1600];
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const FILE = 's/bass-panfish__24775.original.jpg';
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const inner = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(([, body]) => text(body));

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
});

test('the H1 is the configured heading, and the hero\'s only heading', async () => {
    const html = await render();
    assert.deepEqual(inner(html, 'h1'), ['Hand-tied fly fishing flies, sold one at a time.']);
    assert.equal(findTags(html, 'h2').length + findTags(html, 'h3').length, 0);
    assert.deepEqual(inner(html, 'p'), ['Nearly 2,000 patterns from $0.75 a fly, tied by hand and shipped across Canada from our family shop in Tillsonburg, Ontario, since 2003.']);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the photo is a real <img> with a srcset, sizes, width and height, eager and fetchpriority="high"', async () => {
    const [img, ...more] = findTags(await render(), 'img');
    assert.equal(more.length, 0, 'one image');
    assert.equal(img.attrs.srcset, WIDTHS.map(width => `${BASE}/${width}w/${FILE} ${width}w`).join(', '));
    assert.equal(img.attrs.src, `${BASE}/1280w/${FILE}`);
    assert.equal(img.attrs.sizes, '(min-width: 1284px) 1200px, 100vw');
    assert.equal(img.attrs.width, '1600');
    assert.equal(img.attrs.height, '700');
    assert.equal(img.attrs.fetchpriority, 'high');
    assert.equal(img.attrs.alt, '', 'decorative: the H1 says what the page is');
    assert.ok(!('loading' in img.attrs), 'eager');
});

test('an image-manager file builds the same srcset (HOME-2: the path is a text field)', async () => {
    const [img] = findTags(await render({ image_path: 'image-manager/rf-hero-bass.jpg' }), 'img');
    assert.equal(img.attrs.srcset.split(', ')[0], `${BASE}/320w/image-manager/rf-hero-bass.jpg 320w`);
});

test('the photo is mirrored only when the field says so', async () => {
    const mirrored = findTags(await render(), 'img')[0].attrs.class;
    assert.equal(mirrored, 'rf-hero__img rf-hero__img--mirror');
    const plain = findTags(await render({ image_mirror: false }), 'img')[0].attrs.class;
    assert.equal(plain, 'rf-hero__img');
});

test('both buttons are links to real pages, from the widget\'s fields, and nothing is a <button>', async () => {
    const html = await render();
    assert.deepEqual(findTags(html, 'a').map(tag => tag.attrs.href), ['/dry-flies/', '/species/']);
    assert.deepEqual(inner(html, 'a'), ['Shop dry flies', 'Shop by fish']);
    assert.equal(findTags(html, 'button').length, 0);
    // Channel 1's copy carries tree-1 paths in the same fields (ticket 53).
    const tree1 = await render({ primary_url: '/flies/dry-flies/', secondary_url: '/flies/' });
    assert.deepEqual(findTags(tree1, 'a').map(tag => tag.attrs.href), ['/flies/dry-flies/', '/flies/']);
});

test('the copy is escaped, never raw HTML from a field', async () => {
    const html = await render({ heading: 'Flies <script>alert(1)</script> & more' });
    assert.equal(findTags(html, 'script').length, 0);
    assert.ok(html.includes('Flies &lt;script&gt;'));
});

test('the template uses no inline styles: the theme\'s ReelFlies layer styles it (decision 6)', () => {
    const source = fs.readFileSync(path.join(DIR, 'template.html'), 'utf8');
    assert.doesNotMatch(source, /style=|<style/);
});
