// No photo twice on the home page (redesign step 2; ticket 47's rule, CD-1, CD-4, O23), band by
// band:
//
// - The page's own photographs (the stone's, the Signature band's, the shop's) and the Fly Type
//   plates' each appear once across the home's bands.
// - A fly is photographed once per band: on the stone, in a hatch row, in the Signature band or
//   among the Selections, no product id and no photo appears twice. A fly in several bands is by
//   design (a best seller that matches a hatch; the Signature fly in the caddis row; the Adams in
//   three hatches), and so are a hatch row's thumbnails (.rf-hatch__thumbs, the summary's cue:
//   the same flies the row opens on), which aren't counted.
// - Only the home's bands are read (section.rf-stone to section.rf-shop, home-product-bands'
//   homeSections). The header's menu panes ([data-rf-pane]) show the Fly Types' images again,
//   lazy, in closed panels, and the header and the footer both show the logo: they are the
//   shell's, on every page, not the home's.
// - A file is named by its path after the store's size segment (/images/stencil/<size>/), so the
//   160w and 360w copies of one file are the same photo, and its query string is dropped. Any
//   other URL is named by its path. A <picture>'s <source> elements and its <img> are one photo,
//   and a lazy-loading library's data-src and data-srcset are read too.

import { elementsHtml, findTags } from '../html.mjs';
import { cards, homeSections, productBands } from './home-product-bands.mjs';

export const MENU_PANE_ATTRIBUTE = 'data-rf-pane';
export const THUMBS_CLASS = 'rf-hatch__thumbs';
const SIZE_SEGMENT = /\/images\/stencil\/[^/]+\//;
const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);

// The photo a URL shows: its path after the size segment, or its whole path.
export function photoKey(url) {
    let parsed;
    try {
        parsed = new URL(url, 'https://store.invalid');
    } catch {
        return url;
    }
    const match = parsed.pathname.match(SIZE_SEGMENT);
    return match ? parsed.pathname.slice(match.index + match[0].length) : parsed.pathname;
}

const urlsIn = attrs => [attrs.src, attrs['data-src'], ...[attrs.srcset, attrs['data-srcset']]
    .flatMap(set => (set || '').split(',').map(item => item.trim().split(/\s+/)[0]))]
    .filter(url => url && !url.startsWith('data:'));

// Every photo in the markup, as { keys, raw }: each <img> with the <source> elements of the
// <picture> it closes, in order.
export function photosOn(html) {
    const photos = [];
    let sources = [];
    let inPicture = false;
    for (const tag of findTags(html, 'picture|source|img')) {
        if (tag.name === 'picture') {
            inPicture = true;
            sources = [];
        } else if (tag.name === 'source') {
            if (inPicture) sources.push(tag);
        } else {
            const tags = inPicture ? [...sources, tag] : [tag];
            photos.push({ keys: [...new Set(tags.flatMap(({ attrs }) => urlsIn(attrs)).map(photoKey))], raw: tag.raw });
            inPicture = false;
            sources = [];
        }
    }
    return photos;
}

// The markup with each of `parts` (elementsHtml results of it) taken out. Replacements are
// functions, so a "$&" in the markup is text, not a replacement pattern.
const without = (html, parts) => parts.reduce((kept, part) => kept.replace(part, () => ''), html);

// The photos shown more than once in the markup, as { key, first, second }.
function repeats(html) {
    const seen = new Map();
    const found = [];
    for (const photo of photosOn(html)) {
        for (const key of photo.keys) {
            if (seen.has(key)) found.push({ key, first: seen.get(key), second: photo.raw });
            else seen.set(key, photo.raw);
        }
    }
    return found;
}

const shown = (first, second) => `${first.slice(0, 90)} and ${second.slice(0, 90)}`;

export function repeatedPhotos(html) {
    const problems = [];
    for (const band of productBands(html)) {
        const markup = without(band.html, elementsHtml(band.html, 'span', hasClass(THUMBS_CLASS)));
        const seen = new Set();
        for (const id of cards(markup).map(card => findTags(card, 'li')[0].attrs['data-rf-product'])) {
            if (seen.has(id)) problems.push(`product ${id} is laid twice in ${band.name}: a fly is photographed once per band`);
            seen.add(id);
        }
        for (const { key, first, second } of repeats(markup)) problems.push(`the photo ${key} appears twice in ${band.name}: ${shown(first, second)}`);
    }
    // The rest of the home: its own photographs and the plates, with every card and every hatch
    // row's thumbnails taken out.
    const home = homeSections(html).map(section => section.html).join('\n');
    const rest = without(without(home, cards(home)), elementsHtml(home, 'span', hasClass(THUMBS_CLASS)));
    for (const { key, first, second } of repeats(rest)) problems.push(`the photo ${key} appears twice on the home page: ${shown(first, second)}`);
    return problems;
}

export default {
    id: 'home-photo-once',
    ticket: 47,
    description: `no photo twice on the home page: the page's own photographs and the plates once across its bands, and a fly once per band (the stone's lay, a hatch row, the Signature band, the Selections); a <picture> and its <img> are one photo, a hatch row's .${THUMBS_CLASS} cue isn't counted, and the header's menu panes ([${MENU_PANE_ATTRIBUTE}]) and logos are the shell's, outside the bands`,
    pages: ['home'],
    check(page) {
        return repeatedPhotos(page.html);
    },
};
