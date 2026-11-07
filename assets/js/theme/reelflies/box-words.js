// What the box holds, in words: "15 flies, 6 patterns", "3 items" or "Your box is empty", by
// the brand rule (cart-count.js: flies and patterns only when every line is a fly brand's).

import * as box from './box';
import { countCart } from './cart-count';
import { counted, word } from './words';

export function boxWords(flyBrands) {
    const lines = box.lines().map(line => ({ productId: line.productId, quantity: line.quantity, brand: line.brand }));
    const count = countCart(lines, flyBrands);
    if (!count.units) return word('box_empty');
    if (count.flies) return `${counted(count.units, 'fly', 'flies')}, ${counted(count.products, 'pattern', 'patterns')}`;
    return counted(count.units, 'item', 'items');
}
