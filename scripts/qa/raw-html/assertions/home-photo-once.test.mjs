// Tests the home page's photo-once assertion (redesign step 2; ticket 47's rule), home-photo-once,
// on the redesign's home page rendered from fixed data (../home-fixture.mjs): a fly once per
// band, the page's own photographs and the plates once, and what is left out on purpose (a hatch
// row's thumbnails, the header's menu panes, the logos).
//
//   node --test scripts/qa/raw-html/assertions/home-photo-once.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { CDN, homePage } from '../home-fixture.mjs';
import photoOnce, {
    MENU_PANE_ATTRIBUTE, THUMBS_CLASS, photoKey, photosOn, repeatedPhotos,
} from './home-photo-once.mjs';
import { cards, productBands } from './home-product-bands.mjs';
import { elementsHtml, findTags } from '../html.mjs';

const page = await homePage();
const failures = fixture => checkPage(fixture, [photoOnce]).filter(result => result.status === 'fail');
const firstCard = html => cards(html)[0];

test('it is registered, for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-photo-once'));
    assert.deepEqual(photoOnce.pages, ['home']);
});

test('the home page as the theme renders it passes, with the header\'s panes and both logos round it', async () => {
    assert.deepEqual(repeatedPhotos(page.html), []);
    assert.deepEqual(failures(page), []);
    const chrome = await homePage({ chrome: true });
    assert.ok(findTags(chrome.html).filter(tag => MENU_PANE_ATTRIBUTE in tag.attrs).length >= 5, 'the menu panes are on the page');
    assert.ok(chrome.html.includes('rf-mega__plate'), 'the panes show the Fly Types\' images again');
    assert.deepEqual(repeatedPhotos(chrome.html), []);
});

test('a photo is named by its path after the store\'s size segment, without its query', () => {
    assert.equal(photoKey(`${CDN}/360w/products/4877/1/adams.jpg?c=2`), 'products/4877/1/adams.jpg');
    assert.equal(photoKey(`${CDN}/160w/products/4877/1/adams.jpg`), 'products/4877/1/adams.jpg');
    assert.equal(photoKey('/stencil/0000/img/reelflies/stone/hero-stone-1600.jpg'), '/stencil/0000/img/reelflies/stone/hero-stone-1600.jpg');
    assert.equal(photoKey('not a url'), '/not%20a%20url');
});

test('a <picture> and its <img> are one photo', () => {
    const [stone] = photosOn(page.html);
    assert.deepEqual(stone.keys.map(key => key.replace(/^.*\//, '')), ['hero-stone-portrait.jpg', 'hero-stone-1600.jpg']);
    assert.match(stone.raw, /^<img class="rf-graded"/);
});

test('a fly laid twice in one band fails, naming the band', () => {
    const card = firstCard(page.html);
    const twice = { ...page, html: page.html.replace(card, () => `${card}${card}`) };
    const problems = repeatedPhotos(twice.html);
    assert.deepEqual(problems.filter(problem => problem.startsWith('product')), ['product 4877 is laid twice in the stone\'s lay: a fly is photographed once per band']);
    assert.match(problems.join('\n'), /the photo products\/4877\/1\/adams-parachute-dry-fly\.jpg appears twice in the stone's lay/);
    assert.equal(failures(twice).length, 1);
});

test('a fly in several bands is by design: a best seller in a hatch row, the Adams in three rows, the Signature fly in the caddis row', () => {
    const ids = band => cards(band.html).map(card => findTags(card, 'li')[0].attrs['data-rf-product']);
    const bands = productBands(page.html);
    const inRows = id => bands.filter(band => band.name.endsWith(' row') && ids(band).includes(id)).map(({ name }) => name);
    assert.ok(ids(bands[0]).includes('4507'), 'the Prince Nymph is a best seller');
    assert.deepEqual(inRows('4507'), ['the Little black stonefly row']);
    assert.equal(inRows('4675').length, 3, inRows('4675').join(', '));
    assert.ok(ids(bands.find(({ name }) => name === 'the Signature band')).includes('3899'));
    assert.deepEqual(inRows('3899'), ['the Caddis row']);
    assert.deepEqual(repeatedPhotos(page.html), []);
});

test('a hatch row\'s thumbnails are its cards\' photos again, as the summary\'s cue, and aren\'t counted', () => {
    const [row] = elementsHtml(page.html, 'li', attrs => (attrs.class || '').split(/\s+/).includes('rf-hatch__row'));
    const [thumbs] = elementsHtml(row, 'span', attrs => (attrs.class || '').split(/\s+/).includes(THUMBS_CLASS));
    const thumbKeys = photosOn(thumbs).flatMap(photo => photo.keys);
    assert.equal(thumbKeys.length, 3);
    const cardKeys = cards(row).flatMap(card => photosOn(card).flatMap(photo => photo.keys));
    for (const key of thumbKeys) assert.ok(cardKeys.includes(key), key);
    assert.deepEqual(repeatedPhotos(page.html), []);
});

test('a plate\'s photo shown twice fails, and so does one of the page\'s own photographs', () => {
    const plates = { ...page, html: page.html.replace(/n\/nymphs\.jpg/g, 'i/dry-flies.jpg') };
    const problems = repeatedPhotos(plates.html);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /^the photo i\/dry-flies\.jpg appears twice on the home page: <img src="[^"]*dry-flies\.jpg"/);
    const signature = { ...page, html: page.html.replace(/fly-type-dry-flies-800\.jpg/g, 'hero-stone-1600.jpg') };
    assert.match(repeatedPhotos(signature.html).join('\n'), /hero-stone-1600\.jpg appears twice on the home page/);
});

test('the description names what is left out: a row\'s thumbnails and the header\'s panes', () => {
    assert.match(photoOnce.description, new RegExp(THUMBS_CLASS));
    assert.match(photoOnce.description, new RegExp(`\\[${MENU_PANE_ATTRIBUTE}\\]`));
});
