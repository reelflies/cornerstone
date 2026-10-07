// Fly Sizes labels (ticket 18): the catalogue writes plain hook numbers ('2' … '24') and aught
// sizes with a hyphen ('1-0' … '6-0'). The Fly Sizes job renames the aught sizes to 1/0 … 6/0 and
// puts every product's values in hook order: the largest hook first, 6/0 … 1/0, then 1, 2, 4 … 24
// (plan/design/assets/content-manifest.json, size_option.hook_order).
//
// This is tooling for the catalogue job. The theme's own sorter is ticket 33's hook-order.js.

const AUGHT = /^(\d{1,2})\s*[-/]\s*0$/;
const NUMBER = /^\d{1,2}$/;

// { kind: 'aught' | 'number', n } or null for a label that isn't a hook size.
export function parseHookSize(label) {
    const text = String(label ?? '').trim();
    const aught = text.match(AUGHT);
    if (aught && Number(aught[1]) > 0) return { kind: 'aught', n: Number(aught[1]) };
    if (NUMBER.test(text) && Number(text) > 0) return { kind: 'number', n: Number(text) };
    return null;
}

// '2-0' becomes '2/0'. Anything else is returned as it is.
export function hookLabel(label) {
    const size = parseHookSize(label);
    return size && size.kind === 'aught' ? `${size.n}/0` : label;
}

// Sort key: 6/0 is -6, 1/0 is -1, then the hook numbers themselves.
const hookKey = size => (size.kind === 'aught' ? -size.n : size.n);

// A comparator for labels that are hook sizes. Labels it can't read sort after the sizes and
// keep their relative order (Array.prototype.sort is stable).
export function compareHook(a, b) {
    const left = parseHookSize(a);
    const right = parseHookSize(b);
    if (left && right) return hookKey(left) - hookKey(right);
    if (left) return -1;
    if (right) return 1;
    return 0;
}

export const hookOrder = labels => [...labels].sort(compareHook);

// A size no fly hook comes in: an odd number above 1, or a number past 28. The export's 32 and 33
// on "Cray Fish Selection - 8 Flies" are the known cases (research.json; the Fly Sizes note).
export function isSuspectSize(label) {
    const size = parseHookSize(label);
    if (!size || size.kind === 'aught') return false;
    return size.n > 28 || (size.n > 1 && size.n % 2 === 1);
}
