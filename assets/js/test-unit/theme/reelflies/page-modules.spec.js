import pageModules, {
    composite, customClassesFor, TEMPLATES,
} from '../../../theme/reelflies/page-modules';

// Quick add's chunk (ticket 43), as its slot imports it: only whether it is started, and with what.
jest.mock('../../../theme/reelflies/quick-add', () => ({ __esModule: true, default: { load: jest.fn() } }));

// A module as a dynamic import resolves: its default export has load(context), as the stock
// page classes do.
const moduleNamed = (name, calls) => ({
    default: {
        load(context) {
            calls.push([name, context]);
        },
    },
});

describe('page modules', () => {
    const context = { template: 'pages/product', themeSettings: {} };
    let calls;
    let errors;
    const onError = error => errors.push(error.message);

    beforeEach(() => {
        calls = [];
        errors = [];
    });

    describe('composite', () => {
        it('loads every module of a template and starts each with the page context, in order', async () => {
            const importer = composite([
                () => Promise.resolve(moduleNamed('size-pills', calls)),
                () => Promise.resolve(moduleNamed('add-flow', calls)),
            ], onError);

            const imported = await importer();
            imported.default.load(context);

            expect(calls).toEqual([['size-pills', context], ['add-flow', context]]);
            expect(errors).toEqual([]);
        });

        it('does not start anything before app.js calls load', async () => {
            await composite([() => Promise.resolve(moduleNamed('size-pills', calls))], onError)();

            expect(calls).toEqual([]);
        });

        it('starts the other modules when one chunk fails to load, and reports the failure', async () => {
            const imported = await composite([
                () => Promise.reject(new Error('Loading chunk rf-size-pills failed')),
                () => Promise.resolve(moduleNamed('add-flow', calls)),
            ], onError)();
            imported.default.load(context);

            expect(calls).toEqual([['add-flow', context]]);
            expect(errors).toEqual(['Loading chunk rf-size-pills failed']);
        });

        it('starts the other modules when one throws, and reports it', async () => {
            const broken = { default: { load() { throw new Error('size pills broke'); } } };
            const imported = await composite([
                () => Promise.resolve(broken),
                () => Promise.resolve(moduleNamed('add-flow', calls)),
            ], onError)();
            imported.default.load(context);

            expect(calls).toEqual([['add-flow', context]]);
            expect(errors).toEqual(['size pills broke']);
        });

        it('reports a loader that throws instead of returning a promise', async () => {
            const imported = await composite([
                () => { throw new Error('bad loader'); },
                () => Promise.resolve(moduleNamed('add-flow', calls)),
            ], onError)();
            imported.default.load(context);

            expect(calls).toEqual([['add-flow', context]]);
            expect(errors).toEqual(['bad loader']);
        });
    });

    describe('customClassesFor', () => {
        it('registers only the templates that have a module, so the others run exactly as stock', async () => {
            const classes = customClassesFor({
                'pages/product': [() => Promise.resolve(moduleNamed('size-pills', calls))],
                'pages/cart': [],
            }, onError);

            expect(Object.keys(classes)).toEqual(['pages/product']);

            const imported = await classes['pages/product']();
            imported.default.load(context);
            expect(calls).toEqual([['size-pills', context]]);
        });
    });

    describe('the templates', () => {
        it('give each template an array of module loaders', () => {
            Object.values(TEMPLATES).forEach(loaders => {
                expect(Array.isArray(loaders)).toBe(true);
                loaders.forEach(loader => expect(typeof loader).toBe('function'));
            });
        });

        it('cover the stock templates the modules load on', () => {
            ['pages/product', 'pages/category', 'pages/brand', 'pages/search', 'pages/cart', 'pages/page']
                .forEach(template => expect(TEMPLATES).toHaveProperty([template]));
        });

        it('map the custom templates to their base kind\'s array, because context.template names the custom file', () => {
            expect(TEMPLATES['pages/custom/category/rf-noindex']).toBe(TEMPLATES['pages/category']);
            expect(TEMPLATES['pages/custom/category/species-hub']).toBe(TEMPLATES['pages/category']);
            expect(TEMPLATES['pages/custom/page/hook-size-chart']).toBe(TEMPLATES['pages/page']);
        });

        it('share one listing array between category, brand and search pages', () => {
            expect(TEMPLATES['pages/brand']).toBe(TEMPLATES['pages/category']);
            expect(TEMPLATES['pages/search']).toBe(TEMPLATES['pages/category']);
        });

        it('register, as app.js\'s customClasses, exactly the templates whose array has a loader', () => {
            const withLoaders = Object.keys(TEMPLATES).filter(template => TEMPLATES[template].length);

            expect(Object.keys(pageModules).sort()).toEqual(withLoaders.sort());
            Object.values(pageModules).forEach(importer => expect(typeof importer).toBe('function'));
        });
    });
});

describe('the product page\'s add-flow slot (ticket 38)', () => {
    afterEach(() => {
        jest.dontMock('../../../theme/reelflies/add-flow');
        jest.resetModules();
    });

    it('when the flow\'s chunk fails to load, puts stock\'s "Add to Cart" on the flow\'s buttons, then passes the failure on to be reported', async () => {
        jest.resetModules();
        jest.doMock('../../../theme/reelflies/add-flow', () => { throw new Error('ChunkLoadError'); });
        const { TEMPLATES: templates } = await import('../../../theme/reelflies/page-modules');
        document.body.innerHTML = '<div data-rf-add data-rf-stock-label="Add to Cart"><input id="form-action-addToCart" value="Choose a size"></div>';
        const slot = templates['pages/product'].find(load => String(load).includes('add-flow'));
        await expect(slot()).rejects.toThrow('ChunkLoadError');
        expect(document.getElementById('form-action-addToCart').value).toBe('Add to Cart');
    });
});

describe('the listings\' quick-add slot (ticket 43)', () => {
    const slot = () => TEMPLATES['pages/category'].find(load => String(load).includes('quick-add'));
    // The mock the slot's import gets: the add-flow test above resets the module registry.
    let quickAdd;

    beforeEach(async () => {
        quickAdd = await import('../../../theme/reelflies/quick-add');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('starts nothing with rf_quick_add off, so its chunk never loads', async () => {
        document.body.innerHTML = '<article class="card"><a href="/x/" data-rf-quick-add="1">Add</a></article>';
        const module = await Promise.resolve().then(slot());
        await module.default.load({ rfQuickAdd: false });
        expect(quickAdd.default.load).not.toHaveBeenCalled();
    });

    it('starts quick add with rf_quick_add on, even on a listing whose first render has no "+ Add", for the cards a facet change or the pager brings', async () => {
        document.body.innerHTML = '<div id="product-listing-container"><article class="card"><a href="/x/">View</a></article></div>';
        const context = { rfQuickAdd: true, template: 'pages/search' };
        const module = await Promise.resolve().then(slot());
        await module.default.load(context);
        expect(quickAdd.default.load).toHaveBeenCalledWith(context);
    });

    it('reports quick add failing to load or to start, and leaves the page as it is', async () => {
        const report = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('quick add broke');
        quickAdd.default.load.mockImplementationOnce(() => { throw error; });
        const module = await Promise.resolve().then(slot());
        await expect(module.default.load({ rfQuickAdd: true })).resolves.toBeUndefined();
        expect(report).toHaveBeenCalledWith('ReelFlies page module failed', error);
        report.mockRestore();
    });

    it('is in every listing template, and never on product, cart or page', () => {
        ['pages/search', 'pages/brand', 'pages/custom/category/rf-noindex', 'pages/custom/category/species-hub']
            .forEach(template => expect(TEMPLATES[template]).toContain(slot()));
        ['pages/product', 'pages/cart', 'pages/page'].forEach(template => expect(TEMPLATES[template]).not.toContain(slot()));
    });
});
