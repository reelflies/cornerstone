// Tests the home page's carousel assertion (ticket 46): home-no-carousel, on a home page with
// and without the stock carousel partial, and config.json's homepage_show_carousel.
//
//   node --test scripts/qa/raw-html/assertions/home-no-carousel.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial, themeConfig } from '../../render/render.mjs';
import { loadAssertions } from '../../raw-html.mjs';
import noCarousel from './home-no-carousel.mjs';

const homePage = (extra = '') => ({
    kind: 'home',
    key: 'home',
    path: '/',
    url: 'http://localhost:3301/',
    status: 200,
    html: `<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header></header><div class="body" id="main-content"><div data-content-region="home_below_menu"></div>${extra}<div data-content-region="home_below_carousel"></div><div class="container"></div></div></body></html>`,
});

test('it is registered for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-no-carousel'));
    assert.deepEqual(noCarousel.pages, ['home']);
});

test('the stock carousel fails the home page, and a page without it passes', async () => {
    const carousel = await renderPartial('components/carousel', {
        arrows: true,
        play_pause_button: true,
        carousel: {
            swap_frequency: 5000,
            slides: [{
                heading: 'Spring flies', text: 'New patterns', button_text: 'Shop', url: '/dry-flies/', alt_text: '', image: 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/original/carousel/1/slide.jpg', stencil_image: { data: 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/{:size}/carousel/1/slide.jpg', alt: '' },
            }],
        },
    });
    assert.deepEqual(noCarousel.check(homePage()), []);
    assert.match(noCarousel.check(homePage(carousel)).join('\n'), /renders the stock carousel: <section class="heroCarousel"/);
});

test('config.json turns the carousel off in the base settings, and no variation turns it back on', () => {
    for (const variation of ['ReelFlies CA', 'ReelFlies US']) {
        assert.equal(themeConfig(variation).settings.homepage_show_carousel, false, variation);
    }
});
