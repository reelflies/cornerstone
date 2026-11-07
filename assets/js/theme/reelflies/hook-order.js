// Hook order for fly sizes: the biggest hook first (ticket 33; shared with ticket 41's cart).
//
// Aught sizes come first, 6/0 down to 1/0, then plain hook numbers, 1, 2, 4 and up in number
// order. It is the order ticket 18 gives the Fly Sizes option values and the home band's rows
// use (content-manifest size_option.hook_order; CD-12).
//
// - Aught sizes are read in both spellings, the catalogue's 1-0 and 1/0 from ticket 18's
//   rename, so the order holds before and after that job runs.
// - Any other label (empty, "Assorted", "#14", "Size 14") is not a hook size. Lists keep such
//   values after the known sizes, in the order they came.

const AUGHT = /^([1-9]\d*)\s*[/-]\s*0$/;
const PLAIN = /^[1-9]\d*$/;

// A number that sorts in hook order (6/0 is -6, 1/0 is -1, size 14 is 14), or null when the
// label isn't a hook size.
export function hookRank(label) {
    const text = String(label ?? '').trim();
    const aught = AUGHT.exec(text);
    if (aught) return -Number(aught[1]);
    return PLAIN.test(text) ? Number(text) : null;
}

// A comparator for size labels: known sizes in hook order, then unknown values, which compare
// equal to each other.
export function compareHookSizes(a, b) {
    const x = hookRank(a);
    const y = hookRank(b);
    if (x === null || y === null) return (x === null) - (y === null);
    return x - y;
}

// A new array of `items` in hook order, reading each item's size with `labelOf`. Items that
// tie (unknown values, or two spellings of one size) keep the order they came in, whatever
// the browser's sort does with ties.
export function sortByHookOrder(items, labelOf = item => item) {
    return items
        .map((item, index) => ({ item, index, label: labelOf(item) }))
        .sort((a, b) => compareHookSizes(a.label, b.label) || a.index - b.index)
        .map(({ item }) => item);
}
