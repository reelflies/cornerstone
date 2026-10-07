// BigCommerce's product export (ticket 18), read into the catalogue jobs' model.
//
//   import { modelFromExport } from './csv.mjs';
//   const model = modelFromExport(fs.readFileSync('~/reelflies/catalog/product_20260907_030303.csv', 'utf8'), { file });
//
// The export is one row per Product, followed by its Variant, Image and Video rows. A Variant's
// Options cell holds one group per option, run together with no separator:
// "Type=Swatch|Name=Colour|Value=Tan[#DDD4BA;#846F36]Type=Rectangle|Name=Fly Sizes|Value=6".
//
// The export has no option or value ids, no value sort order and no default flags, so a model
// read from it can be diffed but never planned: plans are made only from the API (api-read.mjs).
// Its values are in the order the variant rows list them, which is what the earlier counts of
// products "out of hook order" measured (content-manifest.json).

const REQUIRED = ['Item', 'ID', 'Name', 'SKU', 'Options', 'Brand ID', 'Channels', 'Categories', 'Is Visible', 'Sort Order',
    'Internal Image URL (Export)', 'Image Description', 'Image is Thumbnail', 'Image Sort Order'];

// The export's option types, as the API names them.
const TYPES = {
    Rectangle: 'rectangles', Radio: 'radio_buttons', Swatch: 'swatch', Dropdown: 'dropdown',
};

// RFC 4180: quoted fields may hold commas, doubled quotes and line breaks.
export function parseCsv(text) {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quoted) {
            if (char === '"' && source[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && source[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }
    if (quoted) throw new Error('the CSV ends inside an unclosed quote');
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

export function parseOptions(cell) {
    if (!cell) return [];
    return cell.split(/(?=Type=)/).map(group => {
        const match = group.match(/^Type=([^|]*)\|Name=([^|]*)\|Value=(.*)$/s);
        if (!match) throw new Error(`"${group}" isn't an export option (Type=…|Name=…|Value=…)`);
        const [, type, name, value] = match;
        return { type: TYPES[type] || type.toLowerCase(), name, label: value.replace(/\[#[^\]]*\]$/, '') };
    });
}

const ids = cell => (cell ? cell.split(';').map(item => item.trim()).filter(Boolean).map(Number) : []);
const flag = cell => cell.trim().toUpperCase() === 'TRUE';

export function modelFromExport(text, { file = null } = {}) {
    const [header, ...rows] = parseCsv(text);
    const missing = REQUIRED.filter(column => !header.includes(column));
    if (missing.length) throw new Error(`the export is missing the columns ${missing.join(', ')}`);
    const at = Object.fromEntries(header.map((column, index) => [column, index]));
    const products = [];
    let current = null;
    rows.forEach((cells, index) => {
        const cell = column => (cells[at[column]] ?? '').trim();
        const item = cell('Item');
        const where = `row ${index + 2}`;
        if (item === 'Product') {
            current = {
                id: Number(cell('ID')),
                name: cell('Name'),
                sku: cell('SKU'),
                isVisible: flag(cell('Is Visible')),
                channels: ids(cell('Channels')),
                categories: ids(cell('Categories')),
                brandId: Number(cell('Brand ID')) || 0,
                sortOrder: Number(cell('Sort Order')) || 0,
                options: [],
                images: [],
            };
            products.push(current);
            return;
        }
        if (!['Variant', 'Image', 'Video'].includes(item)) {
            if (cells.every(value => value === '')) return;
            throw new Error(`${where}: unknown Item "${item}"`);
        }
        if (!current) throw new Error(`${where}: a ${item} row before any Product row`);
        if (item === 'Variant') {
            for (const { type, name, label } of parseOptions(cell('Options'))) {
                let option = current.options.find(candidate => candidate.displayName === name);
                if (!option) {
                    option = {
                        id: null, displayName: name, type, values: [],
                    };
                    current.options.push(option);
                }
                if (!option.values.some(value => value.label === label)) {
                    option.values.push({
                        id: null, label, sortOrder: option.values.length, isDefault: null,
                    });
                }
            }
        } else if (item === 'Image') {
            current.images.push({
                id: Number(cell('ID')),
                isThumbnail: flag(cell('Image is Thumbnail')),
                description: cells[at['Image Description']] ?? '',
                sortOrder: Number(cell('Image Sort Order')) || 0,
                url: cell('Internal Image URL (Export)'),
                urlTiny: null,
            });
        }
    });
    return {
        source: 'csv', file, products, brands: [], categories: [],
    };
}
