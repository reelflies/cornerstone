import pageModules, {
    composite, customClassesFor, TEMPLATES,
} from '../../../theme/reelflies/page-modules';

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
