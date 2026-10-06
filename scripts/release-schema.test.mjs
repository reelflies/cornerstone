import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateThemeConfig } from './release-schema.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

test('today\'s config.json passes stencil-cli\'s theme config schema', () => {
    assert.deepEqual(validateThemeConfig(config), []);
});

test('a variation without demo_url fails, although stencil bundle accepts it', () => {
    const broken = structuredClone(config);
    delete broken.variations[1].meta.demo_url;
    assert.deepEqual(validateThemeConfig(broken), ['config.variations[1].meta should have required property \'demo_url\'']);
});

test('more than four variations fail', () => {
    const crowded = structuredClone(config);
    crowded.variations = [...config.variations, ...config.variations, config.variations[0]];
    assert.match(validateThemeConfig(crowded).join('\n'), /variations should NOT have more than 4 items/);
});
