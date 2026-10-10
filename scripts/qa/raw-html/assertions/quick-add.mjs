// Quick add's "+ Add" in the server HTML (ticket 43; spec module 14; UX-8, SCOPE-3; stories 29,
// 35 and 68):
//
// - Every "+ Add" (data-rf-quick-add) is a link to its product's page, so it works with no
//   script (SCOPE-3), named for its pattern ("Add Adams Parachute"), in a card.
// - A card with "+ Add" has no stock actions row, and no card on a page with "+ Add" has a Quick
//   view button: the switch that renders "+ Add" also takes Quick view off the cards (build
//   pipeline 6.4's Quick view guard).
// - No card sold out in every size (ticket 31's sold-out badge) has "+ Add".
// - No card on a page with "+ Add" has stock's Add to Cart (add_to_cart_url, which adds and opens
//   the cart): a card with no options links to its product page instead (criterion 4). This runs
//   only on a page that has a "+ Add": the server HTML can't tell a listing with the switch on
//   whose cards all lack one (no-options Gear, sold out) from a page with it off, so
//   render/partials/quick-add.test.mjs holds the gate on such a listing.
// - Never on a product page, whose related cards keep their stock actions, and never a panel in
//   the server HTML: quick-add.js builds it on a tap.
//
// With rf_quick_add off no card has "+ Add" and this passes; switch-stock.spec.mjs checks that
// the stock card is back. Channel 1's variation has it off, so its listings bite only under the
// overlay rf_quick_add-on (QA_OVERLAY=rf_quick_add-on npm run qa:raw-html).

import {
    decodeHtml, elementsHtml, findTags, markupOnly, textOf,
} from '../html.mjs';

export const MARKER = 'data-rf-quick-add';
const cardsOf = markup => elementsHtml(markup, 'article', attrs => /(^|\s)card(\s|$)/.test(attrs.class || ''));
const hasClass = (attrs, name) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

export function quickAddProblems(html, { productPage = false } = {}) {
    const markup = markupOnly(html);
    const problems = [];
    const buttons = findTags(markup).filter(tag => MARKER in tag.attrs);
    if (findTags(markup).some(tag => 'data-rf-qa-panel' in tag.attrs)) problems.push('a quick-add panel is in the server HTML; quick-add.js builds it on a tap');
    if (productPage) {
        if (buttons.length) problems.push(`${buttons.length} "+ Add" on a product page: its related cards keep their stock actions`);
        return problems;
    }
    if (!buttons.length) return problems;
    for (const button of buttons) {
        if (button.name !== 'a' || !button.attrs.href || button.attrs.href === '#') problems.push(`"+ Add" for product ${button.attrs[MARKER]} isn't a link to its page, so it is dead without a script (SCOPE-3)`);
    }
    let inCards = 0;
    for (const card of cardsOf(markup)) {
        const [article] = findTags(card, 'article');
        const own = findTags(card).filter(tag => MARKER in tag.attrs);
        const id = article.attrs['data-entity-id'];
        if (findTags(card, 'a').some(tag => tag.attrs['data-button-type'] === 'add-cart' || /cart\.php\?action=add/.test(decodeHtml(tag.attrs.href || '')))) {
            problems.push(`card ${id} has stock's Add to Cart beside "+ Add", which adds and opens the cart: a card with no options links to its page while quick add is on`);
        }
        if (!own.length) continue; // eslint-disable-line no-continue
        inCards += own.length;
        if (own.length > 1) problems.push(`card ${id} has ${own.length} "+ Add"`);
        if (own.some(tag => tag.attrs[MARKER] !== id)) problems.push(`card ${id}'s "+ Add" names another product`);
        const link = elementsHtml(card, 'a', attrs => MARKER in attrs)[0] || '';
        const name = decodeHtml(article.attrs['data-name'] || '').replace(/\s+/g, ' ').trim();
        const words = textOf(link).replace(/\s+/g, ' ').trim();
        if (!name || !words.endsWith(name) || words === name) problems.push(`card ${id}'s "+ Add" reads "${words}", not "Add" and the pattern's name`);
        if (findTags(card, 'div').some(tag => hasClass(tag.attrs, 'rf-card-actions'))) problems.push(`card ${id} has "+ Add" and the stock actions row too`);
        if (findTags(card, 'div').some(tag => hasClass(tag.attrs, 'sold-out-flag-side'))) problems.push(`card ${id} is sold out in every size and has "+ Add"`);
    }
    if (inCards !== buttons.length) problems.push(`${buttons.length - inCards} "+ Add" outside a card`);
    const quickViews = findTags(markup, 'button').filter(tag => hasClass(tag.attrs, 'quickview'));
    if (quickViews.length) problems.push(`${quickViews.length} card Quick view buttons beside "+ Add": with quick add on, no card has Quick view`);
    return problems;
}

export default {
    id: 'quick-add',
    ticket: 43,
    description: 'every "+ Add" a link to its product in a card with no stock actions row, no card Quick view or stock Add to Cart on a page with a "+ Add", none on a sold-out card or a product page, and no panel in the server HTML',
    check(page) {
        return quickAddProblems(page.html, { productPage: page.kind === 'product' });
    },
};
