module.exports = api => {
    const targets = api.env('test') ? { targets: { node: 'current' } } : null;
    return {
        // ReelFlies hook (ticket 41; CUSTOMIZATIONS.md): loose mode alone takes every iterable
        // for an array, so [...nodeList] became [].concat(nodeList), one element. Now a spread,
        // destructuring or for…of goes through the iterator helper, an array's too. babel-loader
        // merges this file into webpack.common.js's options, so the bundle has it as well.
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
