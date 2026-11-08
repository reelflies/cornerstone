// The theme's fonts (ticket 25; O02, SEO-13; story 70; spec Testing Decisions, seam 2), as the
// Streamside Stone redesign has them: Archivo, one variable file behind all three cuts
// (assets/scss/reelflies/_fonts.scss), self-hosted and preloaded once from theme assets
// (templates/components/reelflies/head.html); Kalam, small and used once a region, isn't
// preloaded; and nothing asked of Google Fonts. Stock asked Google for Karla and Montserrat on
// every page through getFontsCollection, which now finds no Google font in the settings.
// skin.spec.mjs checks in a browser that the file is fetched once.

import { findTags } from '../html.mjs';

export const FONT_FILE = 'fonts/archivo-latin-var.woff2';
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/i;

const rels = tag => (tag.attrs.rel || '').toLowerCase().split(/\s+/);

export default {
    id: 'rf-fonts',
    ticket: 25,
    description: `Archivo preloaded once from theme assets (${FONT_FILE}), no other font preload, and no Google Fonts`,
    check(page) {
        const problems = [];
        const links = findTags(page.html, 'link');
        const fontPreloads = links.filter(tag => rels(tag).includes('preload') && (tag.attrs.as || '').toLowerCase() === 'font');
        const preloads = fontPreloads.filter(tag => (tag.attrs.href || '').endsWith(FONT_FILE));
        if (preloads.length !== 1) {
            problems.push(`${preloads.length} preloads of ${FONT_FILE}, not 1`);
        } else {
            const [preload] = preloads;
            if (preload.attrs.type !== 'font/woff2') problems.push(`the preload has type="${preload.attrs.type ?? ''}", not "font/woff2"`);
            if (!('crossorigin' in preload.attrs)) problems.push('the preload has no crossorigin, so the font would be fetched twice');
        }
        fontPreloads.filter(tag => !preloads.includes(tag)).forEach(tag => problems.push(`a preload of another font, which only Archivo gets: ${tag.raw.slice(0, 120)}`));
        links.filter(tag => GOOGLE_FONTS.test(tag.attrs.href || '')).forEach(tag => problems.push(`a link to Google Fonts: ${tag.raw.slice(0, 120)}`));
        return problems;
    },
};
