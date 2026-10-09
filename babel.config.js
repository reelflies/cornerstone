module.exports = api => {
    const targets = api.env('test') ? { targets: { node: 'current' } } : null;
    return {
        // ReelFlies hook (ticket 41; CUSTOMIZATIONS.md): loose mode alone takes every iterable for an
        // array, so [...nodeList] became [].concat(nodeList), one element. A spread, destructuring or
        // for…of of a NodeList, Set or Map goes through the iterator again; arrays stay loose.
        assumptions: { iterableIsArray: false },
        plugins: [
            '@babel/plugin-syntax-dynamic-import', // add support for dynamic imports (used in app.js)
            'lodash', // Tree-shake lodash
        ],
        presets: [
            ['@babel/preset-env', {
                loose: true, // Enable "loose" transformations for any plugins in this preset that allow them
                modules: 'auto',
                useBuiltIns: 'usage', // Tree-shake babel-polyfill
                ...targets,
            }],
        ],
    };
}
