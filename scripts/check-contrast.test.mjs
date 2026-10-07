// Tests for scripts/check-contrast.mjs (ticket 06; ticket 25's skin; spec Testing Decisions,
// seam 3). CI runs them through `npm run test:scripts`.
//
//   node --test scripts/check-contrast.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FOCUS_RING, FOCUS_RING_DARK, FOREST, KNOWN_FAILURES, PAIRS, checkContrast, contrast,
} from './check-contrast.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-contrast.mjs');
const CONFIG = path.join(ROOT, 'config.json');
const SETTINGS_SCSS = fs.readFileSync(path.join(ROOT, 'assets/scss/reelflies/_settings.scss'), 'utf8');

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });

const temps = [];
after(() => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
function configWith(settings, variationSettings = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-contrast-'));
    temps.push(dir);
    const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    Object.assign(config.settings, settings);
    config.variations.forEach(variation => Object.assign(variation.settings, variationSettings));
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify(config));
    return file;
}

// A SCSS colour variable's literal value in _settings.scss.
const scssColour = name => {
    const match = new RegExp(`^\\$${name}:\\s*(#[0-9a-f]{6});`, 'im').exec(SETTINGS_SCSS);
    return match && match[1].toLowerCase();
};

describe('config.json on the ReelFlies palette (ticket 25)', () => {
    it('passes every pair on both variations, with no allowances left', () => {
        assert.deepEqual(KNOWN_FAILURES, {});
        const result = run('config.json');
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, new RegExp(`ReelFlies CA: ${PAIRS.length}/${PAIRS.length} pass`));
        assert.match(result.stdout, new RegExp(`ReelFlies US: ${PAIRS.length}/${PAIRS.length} pass`));
        assert.doesNotMatch(result.stdout, /known|FAIL|FIXED/);
    });

    it('checks the pairs Cornerstone Light failed, which the palette now clears', () => {
        const ids = PAIRS.map(([id]) => id);
        for (const id of ['submenu-hover', 'quick-search-secondary', 'sale-badge', 'sold-out-badge', 'order-status-label', 'play-pause-text', 'blockquote-cite', 'checkout-placeholder']) {
            assert.ok(ids.includes(id), `${id} is still checked`);
        }
    });
});

describe('the focus rings', () => {
    it('checks the ReelFlies ring, the one _settings.scss draws, against the page', () => {
        assert.equal(FOCUS_RING, scssColour('rf-focus-ring'), 'FOCUS_RING is _settings.scss\'s $rf-focus-ring');
        assert.notEqual(FOCUS_RING, '#0f7fff', 'the stock ring is gone');
        const pair = PAIRS.find(([id]) => id === 'focus-ring');
        assert.deepEqual(pair.slice(1), [FOCUS_RING, 'body-bg', 3]);
    });

    it('checks the gold bead ring against the forest ground it is drawn on', () => {
        assert.equal(FOCUS_RING_DARK, scssColour('rf-focus-ring-dark'));
        assert.equal(FOREST, scssColour('rf-forest'));
        const pair = PAIRS.find(([id]) => id === 'focus-ring-on-forest');
        assert.deepEqual(pair.slice(1), [FOCUS_RING_DARK, FOREST, 3]);
        assert.ok(contrast(hex(FOCUS_RING_DARK), hex(FOREST)) >= 3);
    });
});

describe('a failing pair', () => {
    it('fails the check, now that no variation has allowances', () => {
        const file = configWith({ 'navPages-color-hover': '#999999' });
        const result = run(file);
        assert.equal(result.status, 1);
        assert.match(result.stdout, /FAIL {5}submenu-hover: #999999 on #f1f3f0/);
    });

    it('fails a buy button whose white label drops below AA, as the stock sage #7B8E7A would', () => {
        const file = configWith({ 'button--primary-backgroundColor': '#7b8e7a' });
        const result = run(file);
        assert.equal(result.status, 1);
        assert.match(result.stdout, /FAIL {5}button-primary: #ffffff on #7b8e7a is 3\.50:1/);
    });

    it('is counted by checkContrast, which release.mjs reports on the live capture', () => {
        const file = configWith({}, { 'color-textBase': '#bbbbbb' });
        const log = console.log;
        console.log = () => {};
        try {
            assert.deepEqual(checkContrast(file), { unexpected: 4, unreadable: 0 }); // body-text and quick-search-text, on both variations
        } finally {
            console.log = log;
        }
    });
});
