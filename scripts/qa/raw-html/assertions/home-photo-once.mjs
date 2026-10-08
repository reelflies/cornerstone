// No photo twice on the home page (ticket 47; CD-1, CD-4, O23): the hero's frame, each card's
// banner and each tile's product photo appear once. A <picture> and its <img> are one photo,
// whatever sizes their srcsets list.
//
// - A file is named by its path after the store's size segment (/images/stencil/<size>/), so the
//   320w and 1600w copies of one file are the same photo, and its query string is dropped. Any
//   other URL is named by its path.
// - It reads src, srcset and a lazy-loading library's data-src and data-srcset, on each <img> and
//   on the <source> elements of its <picture>.
// - The one allowed repeat is ticket 49's crop of the Dry Flies banner, a section or more away
//   from the Dry card: the element that repeats a photo on purpose carries
//   data-rf-photo-repeat, and isn't counted.
// - Ticket 29's pane banners (data-rf-menu-banner inside a data-rf-menu-pane) aren't counted
//   either. Each is its pane's category image, which is the card's banner for a Fly Type, but
//   they are the menu's: lazy, in closed panes, desktop only. A marked <img> anywhere else counts.
//
// Like home-hero, it judges the page as served, whatever widgets it has.

import { elementsHtml, findTags, markupOnly } from '../html.mjs';

export const REPEAT_ATTRIBUTE = 'data-rf-photo-repeat';
export const MENU_BANNER_ATTRIBUTE = 'data-rf-menu-banner';
export const MENU_PANE_ATTRIBUTE = 'data-rf-menu-pane';
const SIZE_SEGMENT = /\/images\/stencil\/[^/]+\//;

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

// The markup with each menu pane's banners taken out, so only the menu's own copies go: a marked
// <img>, with the <picture> round it and its <source> elements when it has one. Replacements are
// functions, so a "$&" in a pane's text is text, not a replacement pattern.
const isBanner = tag => MENU_BANNER_ATTRIBUTE in tag.attrs;
function withoutPaneBanners(html) {
    let markup = markupOnly(html);
    for (const pane of elementsHtml(markup, 'div', attrs => MENU_PANE_ATTRIBUTE in attrs)) {
        let kept = pane;
        for (const picture of elementsHtml(pane, 'picture')) {
            if (findTags(picture, 'img').some(isBanner)) kept = kept.replace(picture, () => '');
        }
        for (const tag of findTags(kept, 'img').filter(isBanner)) kept = kept.replace(tag.raw, () => '');
        markup = markup.replace(pane, () => kept);
    }
    return markup;
}

// Every photo on the page, as { keys, raw, repeat }: each <img> with the <source> elements of the
// <picture> it closes, in page order. A menu pane's banner is left out.
export function photosOn(html) {
    const photos = [];
    let sources = [];
    let inPicture = false;
    for (const tag of findTags(withoutPaneBanners(html), 'picture|source|img')) {
        if (tag.name === 'picture') {
            inPicture = true;
            sources = [];
        } else if (tag.name === 'source') {
            if (inPicture) sources.push(tag);
        } else {
            const tags = inPicture ? [...sources, tag] : [tag];
            photos.push({
                keys: [...new Set(tags.flatMap(({ attrs }) => urlsIn(attrs)).map(photoKey))],
                raw: tag.raw,
                repeat: tags.some(({ attrs }) => REPEAT_ATTRIBUTE in attrs),
            });
            inPicture = false;
            sources = [];
        }
    }
    return photos;
}

export function repeatedPhotos(html) {
    const seen = new Map();
    const problems = [];
    for (const photo of photosOn(html).filter(({ repeat }) => !repeat)) {
        for (const key of photo.keys) {
            if (seen.has(key)) problems.push(`the photo ${key} appears twice on the home page: ${seen.get(key).slice(0, 90)} and ${photo.raw.slice(0, 90)}`);
            else seen.set(key, photo.raw);
        }
    }
    return problems;
}

export default {
    id: 'home-photo-once',
    ticket: 47,
    description: `no photo appears twice on the home page (a <picture> and its <img> are one photo; an element with ${REPEAT_ATTRIBUTE} is ticket 49's allowed crop; ticket 29's ${MENU_BANNER_ATTRIBUTE} banners inside a ${MENU_PANE_ATTRIBUTE} are the menu's)`,
    pages: ['home'],
    check(page) {
        return repeatedPhotos(page.html);
    },
};
