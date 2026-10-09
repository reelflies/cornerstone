// The add flow's words (ticket 38; spec module 15; O14, UX-10; stories 37, 39, 41, 42 and 43):
// what the button, the sticky bar and the status line say. Pure, so Jest tests them alone; the
// words themselves come from lang/en.json through the template's data attributes, each with #
// (or {name}) where a value goes.

// "Choose a size" until a size is chosen on a product that needs one; then "Add 3 to cart".
export function buttonLabel({ needsSize, chosen, qty }, words) {
    if (needsSize && !chosen) return words.choose;
    return words.add.replace('#', qty);
}

// The sticky bar at rest: "Size 14, 3 flies" or "No size chosen" on a product with sizes, flies
// being what has sizes; "Quantity 3" on one without.
export function stickyText({ needsSize, chosen, qty }, words) {
    if (!needsSize) return words.quantity.replace('#', qty);
    if (!chosen) return words.noSize;
    const flies = (qty === 1 ? words.one : words.many).replace('#', qty);
    return words.sizeAnd.replace('{size}', chosen).replace('{flies}', flies);
}

// "Added 3 × size 14. 15 flies in your cart." The choice is the chosen values ("size 14", or
// "size 14, Olive"); with none, the product's name. The count follows cart-count.js's rule.
export function confirmation({ qty, choice, count }, words) {
    const added = words.added.replace('{qty}', qty).replace('{choice}', choice);
    if (!count) return added;
    const one = count.units === 1;
    const flies = one ? words.cartFly : words.cartFlies;
    const items = one ? words.cartItem : words.cartItems;
    return `${added} ${(count.flies ? flies : items).replace('#', count.units)}`;
}
