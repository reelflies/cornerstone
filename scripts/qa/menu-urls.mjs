// What the grouped menu must hold, worked out from a page's own data (ticket 28; spec module 3,
// "Menu data"; BUILD-2). templates/components/reelflies/menu.html renders these rules on the
// server; this is the same rules in JavaScript, so a test can say which links the menu must
// carry without reading the template:
//
// - the render tests compare the menu rendered from a fixture with menuGroups(fixture)
// - menu.spec.mjs, the "curl" test, fetches a pinned page's raw HTML and its ?debug=context, and
//   checks that every URL expectedUrls(context) names is an <a href> in the header's <nav>
//
// The rules:
// - Grouped only when rf_menu_type_ids or rf_menu_species_root_id is set. With both empty the
//   stock navigation renders (the fallback), and there is nothing to expect here.
// - Fly types: each id in rf_menu_type_ids, in that order, looked for among the top-level
//   categories and one level down (tree 1's Fly-Type-like categories sit under Flies, 398). An
//   id the tree doesn't hold renders nothing; the release guard refuses one before a push.
// - Flies by Species: the category rf_menu_species_root_id names, found the same way, with its
//   children only (decision 3: the 11 Species names, never their Fly Type pages).
// - More from ReelFlies: every other top-level category, in the categories data's order, except
//   those in rf_menu_exclude_ids. Its children already in the rail (a Fly Type or the Species
//   root) are left out of its pane, and a category left with no children is a plain link: on
//   tree 1, Flies (398), whose children are the Fly Types.
// - A pane lists a category's children only, never their children.
//
// Ids are compared as trimmed strings: the context gives them as strings ("298"), the settings
// as a comma-separated list that may hold spaces or stray commas.

export const ID_SETTINGS = ['rf_menu_type_ids', 'rf_menu_species_root_id', 'rf_menu_exclude_ids'];

export function parseIds(value) {
    if (value === undefined || value === null) return [];
    return String(value).split(',').map(id => id.trim()).filter(Boolean);
}

const sameId = (category, id) => String(category.id).trim() === String(id).trim();

// The category with this id, at the top level or one level down, or null.
export function findCategory(categories, id) {
    for (const top of categories || []) {
        if (sameId(top, id)) return top;
        const child = (top.children || []).find(candidate => sameId(candidate, id));
        if (child) return child;
    }
    return null;
}

// The template's test, {{#or (trim rf_menu_type_ids) (trim rf_menu_species_root_id)}}: either
// setting holds anything but spaces.
const filled = value => value !== undefined && value !== null && String(value).trim() !== '';

export function isGrouped(settings = {}) {
    return filled(settings.rf_menu_type_ids) || filled(settings.rf_menu_species_root_id);
}

// { grouped, types, species, more }: the categories in each group, in rail order. Each More
// entry is { category, children }, children being the ones its pane lists (none: a plain link).
export function menuGroups(categories = [], settings = {}) {
    if (!isGrouped(settings)) {
        return {
            grouped: false, types: [], species: null, more: [],
        };
    }
    const typeIds = parseIds(settings.rf_menu_type_ids);
    const [speciesId] = parseIds(settings.rf_menu_species_root_id);
    const excluded = parseIds(settings.rf_menu_exclude_ids);
    const inRail = category => typeIds.some(id => sameId(category, id)) || (speciesId !== undefined && sameId(category, speciesId));
    const types = typeIds.map(id => findCategory(categories, id)).filter(Boolean);
    const species = speciesId === undefined ? null : findCategory(categories, speciesId);
    const more = categories
        .filter(top => !inRail(top) && !excluded.some(id => sameId(top, id)))
        .map(category => ({ category, children: (category.children || []).filter(child => !inRail(child)) }));
    return {
        grouped: true, types, species, more,
    };
}

// The names down the rail, in order: the Fly Types, Flies by Species, then More from ReelFlies.
export function railNames(groups) {
    return [
        ...groups.types.map(category => category.name),
        ...(groups.species ? [groups.species.name] : []),
        ...groups.more.map(({ category }) => category.name),
    ];
}

// Every URL the grouped nav must link, in rail order, each once: every Fly Type and its
// children, the Species root and its children, and every More category and the children its
// pane lists. Empty when the menu isn't grouped.
export function expectedUrls(categories = [], settings = {}) {
    const groups = menuGroups(categories, settings);
    const urls = [];
    const add = url => {
        if (url && !urls.includes(url)) urls.push(url);
    };
    const withChildren = (category, children = category.children || []) => {
        add(category.url);
        children.forEach(child => add(child.url));
    };
    groups.types.forEach(category => withChildren(category));
    if (groups.species) withChildren(groups.species);
    groups.more.forEach(({ category, children }) => withChildren(category, children));
    return urls;
}
