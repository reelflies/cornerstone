// Validates a theme config against stencil-cli's theme config schema (ticket 05, step 3).
//
//   import { validateThemeConfig } from './release-schema.mjs';
//   node scripts/release.mjs validate-config
//
// `stencil bundle` validates config.json against the looser private-theme schema, so a variation
// missing a required field (demo_url, for one) bundles without error. This checks the full
// lib/schemas/themeConfig.json with the ajv that stencil-cli itself resolves (ajv 6), and the
// same options its bundle validator uses.

import fs from 'fs';
import { createRequire } from 'module';

const STENCIL_CLI = new URL('../node_modules/@bigcommerce/stencil-cli/', import.meta.url);

let validator;

function loadValidator() {
    if (!validator) {
        const Ajv = createRequire(new URL('package.json', STENCIL_CLI))('ajv');
        const schema = JSON.parse(fs.readFileSync(new URL('lib/schemas/themeConfig.json', STENCIL_CLI), 'utf8'));
        validator = new Ajv({ schemaId: 'auto', allErrors: true }).compile(schema);
    }
    return validator;
}

// Returns one line per error, empty when the config is valid.
export function validateThemeConfig(config) {
    const validate = loadValidator();
    if (validate(config)) return [];
    return validate.errors.map(error => `config${error.dataPath} ${error.message}`);
}
