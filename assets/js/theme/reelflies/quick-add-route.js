// Where a tap on a card's "+ Add" button goes (ticket 43): the size panel, a
// one-fly add, or the product page.
//
// quick-add.js loads the product with stencil-utils `getById` and makes one
// option-change call for stock, then asks this module:
//
// - Fly Sizes is the only option, with several sizes: the panel, one row per
//   size in catalogue order. That is hook order once ticket 18's Fly Sizes job
//   is applied, so nothing is re-sorted here. A size the option-change data
//   leaves out of stock is marked sold out.
// - Fly Sizes is the only option, with one size: add one fly straight away
//   (story 32). If the stock data says that size is sold out, the panel opens
//   instead, so its row says so, rather than an add that would fail.
// - Any other shape goes to the product page: no options (an Assortment with
//   no size option, most Gear), one option that isn't Fly Sizes, or several
//   options, such as product 5663's Colour and Fly Sizes.
//
// `options` is the product context's `product.options`, the keys the stock
// option partials read: [{ id, display_name, values: [{ id, label }] }]. Ids
// may be numbers or the strings a rendered form holds.
// `stock` is the `data` of the option-change response: `in_stock_attributes`
// (the value ids in stock) and `disabled_option_values` ([{ value_id }], the
// values a product rule hides, which the product page hides too). Without
// readable stock data, no size reads as sold out.
//
// It reads only its arguments: no DOM, no requests, and it changes neither.

// The option names that count as the size option, compared ignoring case and
// spacing. Ticket 18's dry run may merge the split names ("Size", "Choose Size")
// into Fly Sizes; until then products using them go to the product page.
export const SIZE_OPTION_NAMES = Object.freeze(['Fly Sizes']);

const normaliseName = name => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '');
const SIZE_NAMES = new Set(SIZE_OPTION_NAMES.map(normaliseName));

function toId(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function toLabel(value) {
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' ? value.trim() : '';
}

function readStock(stock) {
    const inStock = Array.isArray(stock?.in_stock_attributes) ? new Set(stock.in_stock_attributes.map(toId)) : null;
    const hidden = new Set(Array.isArray(stock?.disabled_option_values)
        ? stock.disabled_option_values.map(value => toId(value?.value_id))
        : []);
    return { inStock, hidden };
}

const productPage = reason => ({ route: 'product-page', reason });

export default function quickAddRoute(options, stock) {
    if (!Array.isArray(options) || options.length === 0) return productPage('no-options');
    if (options.length > 1) return productPage('several-options');

    const [option] = options;
    if (!SIZE_NAMES.has(normaliseName(option?.display_name))) return productPage('no-size-option');

    const optionId = toId(option.id);
    const values = optionId && Array.isArray(option.values) ? option.values : [];
    const { inStock, hidden } = readStock(stock);
    const sizes = values
        .map(value => ({ id: toId(value?.id), label: toLabel(value?.label) }))
        .filter(size => size.id && size.label && !hidden.has(size.id))
        .map(size => ({ ...size, soldOut: inStock ? !inStock.has(size.id) : false }));

    if (sizes.length === 0) return productPage('no-sizes');

    const [only] = sizes;
    if (sizes.length === 1 && !only.soldOut) {
        return { route: 'add', optionId, size: { id: only.id, label: only.label } };
    }

    return { route: 'panel', optionId, sizes };
}
