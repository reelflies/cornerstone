// The home page's product bands in the server HTML (ticket 48; stories 17, 68 and 70; SEO-8,
// HOME-4, CD-8; spec seam 2): best sellers (widgets/best-sellers) and the ReelFlies Signature
// Flies band (widgets/signature-band), each a <section data-rf-band>.
//
// - Each band's heading is an <h2>, and best sellers comes before the Signature band (their
//   placements' sort_order, 20 and 30).
// - A band holds no <button>, form control or "+ Add": quick add stays on listings.
// - Each card (.rf-product-card) is exactly one <a href> to a page, with nothing interactive
//   inside it, and its photo, when it has one, is a real <img> with alt="", src, srcset, sizes,
//   width and height, loading="lazy" and no fetchpriority: both bands sit below the first
//   screen (SEO-8). A lazy-loading library's data-src doesn't count.
// - The Signature band's button is an <a href="/brands/ReelFlies.html"> (ticket 36's listing),
//   never a category, and its label carries no number (HOME-4).
//
// The cards a band renders after its fourth are spares, hidden by the theme's CSS until a pick
// is sold out; they are checked like the rest, since the served page carries them.
//
// Like home-cards-tiles, it checks whatever the page has and passes a page without the bands: it
// never reads the repo's record of the store (build pipeline, section 6.6). Whether the store
// holds what the repo records is widgets-sync.mjs --verify's check, and whether each card's price
// is the product page's is ticket 48's live check, after probe 13 and the apply.

import { elementsHtml, findTags, textOf } from '../html.mjs';
import { linksWithClass } from './home-cards-tiles.mjs';

export const BAND_ATTRIBUTE = 'data-rf-band';
export const BAND_ORDER = ['best-sellers', 'signature'];
export const BRAND_LISTING = '/brands/ReelFlies.html';
const CONTROLS = ['button', 'input', 'select', 'textarea', 'form'];
const INTERACTIVE = ['a', 'button', 'input', 'select', 'textarea', 'details', 'iframe'];

function cardProblems(link, what) {
    const problems = [];
    if (!/^(\/|https?:\/\/)/.test(link.attrs.href || '')) problems.push(`${what} links to "${link.attrs.href ?? ''}", not a page`);
    const nested = findTags(link.inner).filter(tag => INTERACTIVE.includes(tag.name));
    if (nested.length) problems.push(`${what} has ${nested.map(tag => `<${tag.name}>`).join(', ')} inside its link: each card is one link to its product page, with no "+ Add"`);
    const images = findTags(link.inner, 'img');
    if (images.length > 1) problems.push(`${what} has ${images.length} <img> elements, not 1`);
    if (images.length !== 1) return problems;
    const { attrs } = images[0];
    if (attrs.alt !== '') problems.push(`${what}'s <img> needs alt="": the card's name says what it is`);
    for (const name of ['src', 'srcset', 'sizes', 'width', 'height']) if (!attrs[name]) problems.push(`${what}'s <img> has no ${name}`);
    if ('fetchpriority' in attrs) problems.push(`${what}'s <img> has fetchpriority="${attrs.fetchpriority}": both bands sit below the first screen (SEO-8)`);
    if (attrs.loading !== 'lazy') problems.push(`${what}'s <img> isn't loading="lazy": both bands sit below the first screen (SEO-8)`);
    return problems;
}

function signatureButton(band) {
    const [link] = linksWithClass(band, 'rf-signature__button');
    if (!link) return ['the Signature band has no button link (a.rf-signature__button) to the ReelFlies brand listing'];
    const problems = [];
    if (link.attrs.href !== BRAND_LISTING) problems.push(`the Signature band's button links to "${link.attrs.href ?? ''}", not the ReelFlies brand listing ${BRAND_LISTING} (ticket 36)`);
    const label = textOf(link.inner);
    if (/\d/.test(label)) problems.push(`the Signature band's button says "${label}": a label carries no number (HOME-4)`);
    return problems;
}

export function productBandsProblems(html) {
    const bands = elementsHtml(html, 'section', attrs => BAND_ATTRIBUTE in attrs).map(band => ({
        name: findTags(band, 'section')[0].attrs[BAND_ATTRIBUTE],
        html: band,
    }));
    const problems = [];
    const order = bands.map(({ name }) => BAND_ORDER.indexOf(name)).filter(index => index !== -1);
    if (order.some((index, at) => at && index < order[at - 1])) problems.push('the bands are out of order: best sellers comes before the Signature band (placements 20 and 30)');
    for (const band of bands) {
        if (!findTags(band.html, 'h2').length) problems.push(`the ${band.name} band has no <h2>: each band's heading is an H2 (story 68)`);
        const controls = [...new Set(findTags(band.html).filter(tag => CONTROLS.includes(tag.name)).map(tag => tag.name))]
            .filter(name => !linksWithClass(band.html, 'rf-product-card').some(link => findTags(link.inner, name).length));
        if (controls.length) problems.push(`the ${band.name} band has ${controls.map(name => `<${name}>`).join(', ')}: its cards are links only, with no "+ Add"`);
        for (const [index, link] of linksWithClass(band.html, 'rf-product-card').entries()) {
            const name = textOf(link.inner.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '');
            problems.push(...cardProblems(link, `${band.name} card ${index + 1}${name ? ` (${name})` : ''}`));
        }
        if (band.name === 'signature') problems.push(...signatureButton(band.html));
    }
    return problems;
}

export default {
    id: 'home-product-bands',
    ticket: 48,
    description: 'best sellers then the Signature band, when the page has them: each an <h2> and no button or "+ Add"; each card one <a href> with nothing interactive inside and a lazy <img> with alt="", srcset, sizes, width and height and no fetchpriority; the Signature button an <a> to /brands/ReelFlies.html with no number',
    pages: ['home'],
    check(page) {
        return productBandsProblems(page.html);
    },
};
