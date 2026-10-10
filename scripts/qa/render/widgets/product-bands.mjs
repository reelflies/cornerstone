// What the two home product bands' render tests share (ticket 48): best-sellers.test.mjs and
// signature-band.test.mjs render widgets/best-sellers and widgets/signature-band from their
// fixtures, and both bands hold widgets/_shared/product-card.html once per pick.
//
// - cardsOf(html): each card the band rendered, in order, as { html, product, link, img, name,
//   amount, unit }: the product id it links (data-rf-product), its <a>, its <img>, and its text.
// - readQuery(widget): the widget's query.graphql, with the variables it declares and the
//   picks it aliases.
// - photoProducts(widget): the product ids in another widget's photo paths (ticket 47's tiles),
//   so a band can't pick a product whose photo the page already shows (home-photo-once).

import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { WIDGETS_DIR, readFixture } from '../render.mjs';

export const PICKS = ['pick1', 'pick2', 'pick3', 'pick4', 'pick5', 'pick6'];
// The fields the card reads from a product node (widgets/_shared/product-card.html).
export const CARD_FIELDS = ['entityId', 'name', 'path', 'inventory { isInStock }', 'prices { price { value currencyCode } }', 'url160: url(width: 160)', 'url320: url(width: 320)', 'url480: url(width: 480)', 'url640: url(width: 640)'];
export const CARD_WIDTHS = [160, 320, 480, 640];

export const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, '\'');
const between = (html, cls) => html.match(new RegExp(`<span class="${cls}">([\\s\\S]*?)</span>`))?.[1];

export function cardsOf(html) {
    return html.split('<li class="rf-product-cards__item">').slice(1).map(part => {
        const card = part.slice(0, part.indexOf('</li>'));
        const [link] = findTags(card, 'a');
        const [img] = findTags(card, 'img');
        return {
            html: card,
            product: Number(link?.attrs['data-rf-product']),
            link,
            img,
            name: text(card.match(/<h3 class="rf-product-card__name">([\s\S]*?)<\/h3>/)?.[1] ?? ''),
            amount: between(card, 'rf-product-card__amount'),
            unit: between(card, 'rf-product-card__unit'),
        };
    });
}

export function readQuery(widget) {
    const query = fs.readFileSync(path.join(WIDGETS_DIR, widget, 'query.graphql'), 'utf8');
    return {
        query,
        variables: [...query.matchAll(/\$(\w+): Int = 0/g)].map(([, name]) => name),
        aliases: Object.fromEntries([...query.matchAll(/(\w+): product\(entityId: \$(\w+)\) \{ \.\.\.RfCardProduct \}/g)].map(([, alias, variable]) => [alias, variable])),
        fragment: query.slice(query.indexOf('fragment RfCardProduct on Product')),
    };
}

export function photoProducts(widget) {
    const { configuration } = readFixture(path.join(WIDGETS_DIR, widget, 'channels', '1895766.json'));
    return Object.values(configuration).flatMap(value => String(value).match(/^products\/(\d+)\//)?.[1] ?? []).map(Number);
}

// A fixture with its query result changed: `change` gets each pick's node (or null) and returns
// the node to use.
export function withPicks(fixture, change) {
    const copy = structuredClone(fixture);
    copy.data.site = Object.fromEntries(Object.entries(copy.data.site).map(([pick, node]) => [pick, change(node, pick)]));
    return copy;
}
