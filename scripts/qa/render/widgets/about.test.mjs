// Fixture renders of the home page's About block (ticket 49; spec module 7, R5, CD-9, SEO-8;
// story 65): what the store renders from widgets/about/template.html with a channel's
// widget_configuration. The element shots at 375 and 1280 are widget-screens.spec.mjs's; the
// even split, the stacking and the block's place on the page are home-links-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/about.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { elementsHtml, findTags, textOf } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';
import { PLACEMENT_STATUSES } from '../../../widgets/source.mjs';

const DIR = path.join(WIDGETS_DIR, 'about');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const schema = readFixture(path.join(DIR, 'schema.json'));
const strip = readFixture(path.join(WIDGETS_DIR, 'shipping-strip', 'channels', '1895766.json')).configuration;
const render = (configuration = {}) => renderWidget('about', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const PHOTO = 'image-manager/shop-front-pic-2000dpi-reelflies2-thumb.jpg';
const WIDTHS = [320, 480, 640, 960, 1280];
const SIZES = '(max-width: 800px) calc(100vw - 48px), (max-width: 1260px) calc(48vw - 24px), 524px';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const facts = html => elementsHtml(html, 'li', hasClass('rf-about__fact'));

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
    assert.equal(channelFile.channel_id, 1895766);
});

test('it is placed in home_below_top_products at sort_order 70, the last of ticket 49\'s slots, written inactive first', () => {
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 70 });
    assert.ok(PLACEMENT_STATUSES.includes(status), status);
    for (const name of ['template', 'widget', 'placement']) {
        assert.ok(channelFile.uuids[name] === null || UUID.test(channelFile.uuids[name]), `its ${name} uuid is null or recorded`);
    }
    assert.equal(fixture.page, 'pages/home');
    assert.equal(fixture.region, channelFile.placement.region);
});

test('every schema setting has its value on the channel, and only the DRAFT note differs from its default, which is empty for any other channel\'s copy', () => {
    const settings = schema.flatMap(tab => tab.sections.flatMap(section => section.settings));
    assert.deepEqual(Object.keys(channelFile.configuration).sort(), settings.map(setting => setting.id).sort());
    const differs = settings.filter(setting => setting.default !== channelFile.configuration[setting.id]).map(setting => setting.id);
    assert.deepEqual(differs, ['draft_note']);
    assert.equal(settings.find(setting => setting.id === 'draft_note').default, '');
    assert.match(channelFile.configuration.draft_note, /^DRAFT\b/);
});

test('one section, named by its one <h2> "100% Canadian and family-run since 2003"', async () => {
    const html = await render();
    assert.equal(elementsHtml(html, 'section').length, 1);
    const [section] = findTags(html, 'section');
    const h2s = findTags(html, 'h2');
    assert.equal(h2s.length, 1);
    assert.ok(h2s[0].attrs.id);
    assert.equal(section.attrs['aria-labelledby'], h2s[0].attrs.id);
    assert.equal(textOf(elementsHtml(html, 'h2')[0]), '100% Canadian and family-run since 2003');
    assert.equal(findTags(html, 'h1').length + findTags(html, 'h3').length, 0);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the shop-front photo is a real <img> with its alt text, lazy, a srcset to 1280w, sizes, the file\'s width and height, no fetchpriority (SEO-8)', async () => {
    const [img, ...more] = findTags(await render(), 'img');
    assert.equal(more.length, 0);
    assert.equal(img.attrs.alt, 'The ReelFlies shop front on Broadway Street in Tillsonburg, Ontario');
    assert.equal(img.attrs.loading, 'lazy');
    assert.equal(img.attrs.src, `${BASE}/640w/${PHOTO}`);
    assert.equal(img.attrs.srcset, WIDTHS.map(width => `${BASE}/${width}w/${PHOTO} ${width}w`).join(', '));
    assert.equal(img.attrs.sizes, SIZES);
    assert.equal(img.attrs.width, '600');
    assert.equal(img.attrs.height, '450');
    assert.ok(!('fetchpriority' in img.attrs));
    assert.ok(!('style' in img.attrs));
});

test('the text: two sentences naming Tillsonburg, three trust facts, the "About ReelFlies" link and the "Tight lines" sign-off', async () => {
    const html = await render();
    const text = textOf(elementsHtml(html, 'p', hasClass('rf-about__text'))[0]);
    assert.match(text, /^Every fly is tied by hand on branded hooks/);
    assert.match(text, /Walk-ins are welcome by appointment\.$/);
    assert.equal(text.split(/(?<=\.)\s+/).length, 2, 'two sentences');
    assert.match(text, /Tillsonburg, Ontario/);
    assert.equal(facts(html).length, 3);
    const about = findTags(html, 'a').find(tag => hasClass('rf-about__link')(tag.attrs));
    assert.equal(about.attrs.href, '/about-us/');
    assert.equal(textOf(elementsHtml(html, 'a', hasClass('rf-about__link'))[0]), 'About ReelFlies');
    assert.equal(textOf(elementsHtml(html, 'p', hasClass('rf-about__signoff'))[0]), 'Tight lines from us all at ReelFlies.');
});

test('the shipping fact is the strip\'s own sentence, so the two never drift apart (ticket 13, decision 2; ticket 21\'s promotion)', async () => {
    const [shipping] = facts(await render());
    const sentence = textOf(shipping);
    assert.equal(sentence, 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.');
    assert.ok(strip.long_text.endsWith(sentence), `the strip's long line, "${strip.long_text}", ends with it`);
    assert.equal(textOf(elementsHtml(shipping, 'strong')[0]), 'Free standard shipping');
    // The $99 courier offer doesn't carry over (ticket 13, open): only free standard shipping.
    assert.doesNotMatch(await render(), /\$99|courier/i);
});

test('the promise and the toll-free number: "We stand behind every fly we sell." with no terms, and a tel: link', async () => {
    const [, promise, phone] = facts(await render());
    assert.equal(textOf(promise), 'We stand behind every fly we sell.');
    assert.equal(textOf(phone), 'Questions? Call toll-free 1 866 250 4071');
    const [tel, ...more] = findTags(phone, 'a');
    assert.equal(more.length, 0);
    assert.equal(tel.attrs.href, 'tel:+18662504071');
    assert.equal(textOf(elementsHtml(phone, 'a')[0]), '1 866 250 4071');
});

test('each fact\'s icon is drawn in the template, decorative and hidden from screen readers, not from the theme\'s icon sheet', async () => {
    for (const fact of facts(await render())) {
        const [svg, ...more] = findTags(fact, 'svg');
        assert.equal(more.length, 0);
        assert.equal(svg.attrs['aria-hidden'], 'true');
        assert.equal(svg.attrs.focusable, 'false');
        assert.equal(findTags(fact, 'use').length, 0, 'no <use> of the theme\'s sheet: the block is whole on any channel\'s theme');
    }
});

test('no product card or price in the block (CD-9)', async () => {
    const html = await render();
    for (const tag of findTags(html)) {
        assert.ok(!('data-product-id' in tag.attrs), tag.raw);
        assert.doesNotMatch(tag.attrs.class || '', /\bcard\b|price/, tag.raw);
    }
    assert.equal(findTags(html, 'form').length + findTags(html, 'button').length, 0);
    assert.doesNotMatch(textOf(html), /\$\d+\.\d{2}/);
});

test('the DRAFT note shows only while the field holds one, marked data-rf-draft', async () => {
    const drafted = await render();
    const [note] = findTags(drafted, 'p').filter(tag => 'data-rf-draft' in tag.attrs);
    assert.ok(note, 'ReelFlies_CA\'s copy shows its DRAFT note');
    assert.match(textOf(elementsHtml(drafted, 'p', attrs => 'data-rf-draft' in attrs)[0]), /^DRAFT/);
    const approved = await render({ draft_note: '' });
    assert.equal(findTags(approved, 'p').filter(tag => 'data-rf-draft' in tag.attrs).length, 0);
    assert.doesNotMatch(approved, /DRAFT/);
});

// The attribution is a <figcaption>, never a <footer>: rf-footer allows the page one, the theme's.
test('no Steve B line until Shaun approves one; set, it is a <blockquote> in a <figure> with its attribution', async () => {
    assert.equal(findTags(await render(), 'blockquote').length + findTags(await render(), 'figure').length, 0);
    const html = await render({ quote: 'Tie it right and it will last the season.', quote_by: 'Steve B, President' });
    const [figure] = elementsHtml(html, 'figure');
    assert.equal(textOf(elementsHtml(figure, 'blockquote')[0]), 'Tie it right and it will last the season.');
    assert.equal(textOf(elementsHtml(figure, 'figcaption')[0]), 'Steve B, President');
    assert.equal(findTags(html, 'footer').length, 0);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the text is escaped, never raw HTML from a field', async () => {
    const html = await render({ heading: '100% <script>alert(1)</script>', fact_ship_text: '<b>in Canada</b>' });
    assert.equal(findTags(html, 'script').length + findTags(html, 'b').length, 0);
    assert.ok(html.includes('100% &lt;script&gt;'));
});

test('no field types a product price or a count (HOME-4)', () => {
    for (const [id, value] of Object.entries(channelFile.configuration).filter(([, text]) => typeof text === 'string')) {
        assert.doesNotMatch(value, /\$\s?\d+\.\d{2}/, `${id}: no price`);
        assert.doesNotMatch(value, /\b\d[\d,]*\s+(patterns|flies|products|species|items)\b/i, `${id}: no count`);
    }
});

test('the template uses no inline styles: the theme\'s ReelFlies layer styles it (decision 6)', () => {
    assert.doesNotMatch(fs.readFileSync(path.join(DIR, 'template.html'), 'utf8'), /style=|<style/);
});
