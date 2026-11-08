// Quick add's "+ Add" in the server HTML (ticket 43; redesign step 3, the owner's choice of
// 2026-11-07: every size with a quantity beside it; spec module 14; UX-8, SCOPE-3; stories 29, 35
// and 68), on every page. The specimen card (components/reelflies/fly.html, li.rf-fly) carries one
// buy control, .rf-add, and quick-add.js draws the size picker under it on a tap.
//
// - With quick add on, the control is a <button type="button" data-rf-add="sizes"> ("+ Add", the
//   picker) or data-rf-add="one" ("Add 1", one size or no options), aria-expanded="false", its
//   visible word then the pattern's name for screen readers. Beside it the card holds its size
//   panel (data-rf-sizes) and its reserved "In your box" line (data-rf-inbox), both hidden and
//   empty on the server: quick-add.js fills them, so a cached page never shows another shopper's
//   box, and no picker (.rf-pick--panel) is ever in the server HTML.
// - A card sold out in every size (li.rf-fly.is-sold) says so on its line and links to its page
//   instead ("View"); so does every card with the switch off ("Choose a size" or "View"): a link
//   with the card's own URL, never "#".
// - A listing whose row has the Photos / Quick order switch (data-rf-view) has the switch on, so
//   every card on it that isn't sold out has a button: the two follow the same setting.
// - Never a button on a product page, whose related cards link to their page (ticket 43), and no
//   stock card leftovers anywhere: no card Quick view button, no stock Add to Cart link
//   (cart.php?action=add, which adds and opens the cart).
//
// The words are lang/en.json's (reelflies.card). The fixture test (render/partials/
// quick-add.test.mjs) holds the switch's variations and the home page's cards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../html.mjs';

const WORDS = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../lang/en.json'), 'utf8')).reelflies.card;
export const MARKER = 'data-rf-add';
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const has = name => attrs => name in attrs;
const cardsOf = markup => elementsHtml(markup, 'li', attrs => classed('rf-fly')(attrs) && has('data-rf-product')(attrs));
const emptyHidden = (element, name) => {
    const [tag] = findTags(element, name);
    return 'hidden' in tag.attrs && textOf(element) === '' && findTags(element).length === 1;
};

function cardProblems(card, { productPage, switched }) {
    const problems = [];
    const [li] = findTags(card, 'li');
    const id = li.attrs['data-rf-product'];
    const sold = classed('is-sold')(li.attrs);
    const title = outerHtml(card, 'h3', classed('rf-fly__name')) || '';
    const name = textOf(title);
    const url = findTags(title, 'a')[0]?.attrs.href;
    const controls = findTags(card).filter(tag => classed('rf-add')(tag.attrs));
    if (controls.length !== 1) problems.push(`card ${id} has ${controls.length} buy controls (.rf-add), not one`);
    for (const control of controls) {
        const words = textOf(elementsHtml(card, control.name, attrs => classed('rf-add')(attrs))[0] || '').replace(/\s+:/, ':');
        if (MARKER in control.attrs) {
            const mode = control.attrs[MARKER];
            const word = mode === 'one' ? WORDS.add_one : WORDS.add;
            if (control.name !== 'button' || control.attrs.type !== 'button') problems.push(`card ${id}'s "+ Add" isn't a <button type="button">`);
            if (control.attrs['aria-expanded'] !== 'false') problems.push(`card ${id}'s "+ Add" has no aria-expanded="false" for the picker it opens`);
            if (!['sizes', 'one'].includes(mode)) problems.push(`card ${id}'s ${MARKER} is "${mode}", not sizes or one`);
            if (!name || !words.startsWith(word) || !words.endsWith(name) || words === word) problems.push(`card ${id}'s "+ Add" reads "${words}", not "${word}" and the pattern's name`);
            if (sold) problems.push(`card ${id} is sold out and has "+ Add"`);
            if (productPage) problems.push(`card ${id} has "+ Add" on a product page: its related cards link to their page`);
            const panels = elementsHtml(card, 'div', has('data-rf-sizes'));
            if (panels.length !== 1) problems.push(`card ${id} has ${panels.length} size panels (data-rf-sizes), not one for quick-add.js to fill`);
            else if (!emptyHidden(panels[0], 'div')) problems.push(`card ${id}'s size panel isn't empty and hidden: quick-add.js draws the picker on a tap`);
        } else {
            const href = decodeHtml(control.attrs.href || '').trim();
            if (control.name !== 'a' || !href || href === '#') problems.push(`card ${id}'s buy link has no URL, so it is dead without a script (SCOPE-3)`);
            else if (url && href !== decodeHtml(url)) problems.push(`card ${id}'s buy link goes to ${href}, not its page ${decodeHtml(url)}`);
            if (!name || !words.endsWith(name) || ![WORDS.view, WORDS.choose].some(word => words.startsWith(word))) problems.push(`card ${id}'s buy link reads "${words}", not "${WORDS.view}" or "${WORDS.choose}" and the pattern's name`);
            if (switched && !sold && !productPage) problems.push(`card ${id} has no "+ Add" though the listing has the Photos / Quick order switch: both follow rf_quick_add`);
        }
    }
    const lines = elementsHtml(card, 'span', has('data-rf-inbox'));
    if (lines.length !== 1) problems.push(`card ${id} has ${lines.length} reserved "In your box" lines (data-rf-inbox), not one`);
    else if (!emptyHidden(lines[0], 'span')) problems.push(`card ${id}'s "In your box" line isn't empty and hidden: a cached page never shows another shopper's box`);
    if (sold && textOf(outerHtml(card, 'span', classed('rf-fly__sizes')) || '') !== WORDS.sold_out) problems.push(`card ${id} is sold out but its line doesn't say "${WORDS.sold_out}"`);
    return problems;
}

export function quickAddProblems(html, { productPage = false } = {}) {
    const markup = markupOnly(html);
    const problems = [];
    const cards = cardsOf(markup);
    const switches = findTags(markup, 'div').filter(tag => 'data-rf-view' in tag.attrs);
    if (switches.length > 1) problems.push(`${switches.length} Photos / Quick order switches (data-rf-view), not one`);
    for (const card of cards) problems.push(...cardProblems(card, { productPage, switched: switches.length > 0 }));
    const controls = findTags(markup).filter(tag => classed('rf-add')(tag.attrs)).length;
    const inCards = cards.reduce((sum, card) => sum + findTags(card).filter(tag => classed('rf-add')(tag.attrs)).length, 0);
    if (controls !== inCards) problems.push(`${controls - inCards} buy controls (.rf-add) outside a specimen card`);
    if (findTags(markup).some(tag => classed('rf-pick--panel')(tag.attrs))) problems.push('a size picker (.rf-pick--panel) is in the server HTML; quick-add.js draws it on a tap');
    if (cards.length) {
        const quickViews = findTags(markup, 'button').filter(tag => classed('quickview')(tag.attrs));
        if (quickViews.length) problems.push(`${quickViews.length} card Quick view buttons: the specimen card has none`);
        const stockAdds = findTags(markup, 'a').filter(tag => tag.attrs['data-button-type'] === 'add-cart' || /cart\.php\?action=add/.test(decodeHtml(tag.attrs.href || '')));
        if (stockAdds.length) problems.push(`${stockAdds.length} stock Add to Cart links, which add and open the cart: a card buys through its picker or links to its page`);
    }
    return problems;
}

export default {
    id: 'quick-add',
    ticket: 43,
    description: 'every specimen card with one buy control: a "+ Add" or "Add 1" button with its empty size panel and "In your box" line, or a link to its page (sold out, or the switch off); a button on every card of a listing with the Quick order switch; none on a product page; no picker, card Quick view or stock Add to Cart in the server HTML',
    check(page) {
        return quickAddProblems(page.html, { productPage: page.kind === 'product' });
    },
};
