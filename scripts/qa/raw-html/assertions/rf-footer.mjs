// The ReelFlies footer as a crawler gets it (ticket 50; spec module 20; stories 63, 64 and 65).
// On every page kind:
//
// - exactly one <footer>, and it is the ReelFlies one (data-rf-footer)
// - the outside-Canada line with a real link (<a href>) to https://reelflies.com/, the same for
//   every visitor, with no script needed (story 63; R7)
// - the promise line and the copyright, in the words of lang/en.json's reelflies.footer
// - no "Powered by" anywhere on the page, and no Brands column (data-section-type footer-brands)
// - either the Shop column or, with both menu ids empty, the stock Categories column, never both
//   and never neither. The Shop list declares the ids it was given (data-rf-menu-type-ids and
//   data-rf-menu-species-root-id), and its links (data-rf-menu-id) must be exactly those ids, in
//   that order: an id that the channel's tree doesn't hold, which menu-links.html skips, fails here
//   (story 64; BUILD-2). So on prelaunch, once tree 4's ids are set (wave R1), the curl run proves
//   the six Fly Types and Flies by Species are server-rendered links in rf_menu_type_ids order.
//
// The fixture test (render/partials/footer.test.mjs) holds the copy itself and the columns' links.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

const LANG = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../lang/en.json'), 'utf8'));
const STRINGS = LANG.reelflies.footer;
export const COM_URL = 'https://reelflies.com/';

const idList = value => decodeHtml(value || '').split(',').map(id => id.trim()).filter(Boolean);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COPYRIGHT = new RegExp(escape(STRINGS.copyright).replace(escape('{year}'), '\\d{4}'));

function shopProblems(footer) {
    const shop = outerHtml(footer, 'ul', attrs => 'data-rf-footer-shop' in attrs);
    const stock = findTags(footer).some(tag => 'data-rf-footer-categories' in tag.attrs);
    if (shop && stock) return ['the footer has both the Shop column and the stock Categories column'];
    if (!shop && !stock) return ['the footer has neither the Shop column nor the stock Categories column'];
    if (!shop) return [];
    const [list] = findTags(shop);
    const expected = [...idList(list.attrs['data-rf-menu-type-ids']), ...idList(list.attrs['data-rf-menu-species-root-id'])];
    const anchors = findTags(shop, 'a');
    const got = anchors.map(tag => tag.attrs['data-rf-menu-id'] ?? '?');
    const problems = [];
    if (got.join() !== expected.join()) problems.push(`the Shop links are ${got.join(', ')}, not the ids declared, ${expected.join(', ')}: an id the channel's tree doesn't hold, or links out of order (data-rf-menu-id)`);
    anchors.filter(tag => !decodeHtml(tag.attrs.href || '').trim()).forEach(tag => problems.push(`a Shop link with no URL: ${tag.raw}`));
    return problems;
}

export default {
    id: 'rf-footer',
    ticket: 50,
    description: 'the ReelFlies footer once: the outside-Canada link to reelflies.com, the promise and copyright, the Shop column (ids in order) or the stock Categories column, no "Powered by" and no Brands column',
    check(page) {
        const problems = [];
        const footers = findTags(page.html, 'footer');
        if (footers.length !== 1) problems.push(`${footers.length} <footer> elements`);
        if (/\bpowered by\b/i.test(textOf(page.html))) problems.push('"Powered by" is on the page');
        if (findTags(page.html).some(tag => tag.attrs['data-section-type'] === 'footer-brands')) problems.push('a Brands column (data-section-type="footer-brands") is on the page');

        const footer = outerHtml(page.html, 'footer', attrs => 'data-rf-footer' in attrs);
        if (!footer) return [...problems, 'no ReelFlies footer (<footer data-rf-footer>)'];

        const text = textOf(footer);
        const com = elementsHtml(footer, 'a', attrs => decodeHtml(attrs.href || '').trim() === COM_URL);
        if (com.length !== 1) problems.push(`${com.length ? `${com.length} links` : 'no link'} to ${COM_URL} in the footer, where the outside-Canada line needs one <a href>`);
        if (!text.includes(`${STRINGS.outside_canada} ${STRINGS.outside_canada_link}`) || (com.length && textOf(com[0]) !== STRINGS.outside_canada_link)) {
            problems.push(`the outside-Canada line "${STRINGS.outside_canada} ${STRINGS.outside_canada_link}" isn't in the footer, with the link on its last words`);
        }
        if (!text.includes(STRINGS.promise)) problems.push(`the promise line "${STRINGS.promise}" isn't in the footer`);
        if (!COPYRIGHT.test(text)) problems.push(`the copyright "${STRINGS.copyright}" isn't in the footer`);
        return [...problems, ...shopProblems(footer)];
    },
};
