// The release guard (ticket 15) and the four refusals of spec seam 5. Offline: fixture settings
// and fixture category id lists, no store credentials. release-sh.test.mjs runs the same cases
// through scripts/release.sh.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReleaseArgs } from './release-args.mjs';
import { checkRelease, menuIdsSet } from './release-guard.mjs';
import { buildPushArgs } from './release-targets.mjs';

const CHANNEL = 1895766;
const TREE = [23, 24, 25, 40, 41];
const BASE = { 'body-bg': '#ffffff', rf_menu_type_ids: '', rf_menu_species_root_id: '' };

const guard = ({
    repo = {}, live = {}, categoryIds = TREE, channelId = CHANNEL,
} = {}) => checkRelease({
    repoSettings: { ...BASE, ...repo },
    liveSettings: { ...BASE, ...live },
    channelId,
    categoryIds,
});

// --- Spec seam 5: the release refuses ---

test('more than one channel refuses', () => {
    assert.throws(() => parseReleaseArgs(['--channel', '1895766', '--channel', '1', '--variation', 'ReelFlies CA']), /one channel per release/);
    assert.throws(() => parseReleaseArgs(['--channel', '1895766,1', '--variation', 'ReelFlies CA']), /one channel per release/);
    assert.throws(() => parseReleaseArgs(['--channel', '1895766', '--variation', 'ReelFlies CA', '-allc']), /all channels/);
    assert.throws(() => buildPushArgs({ zip: 'x.zip', variation: 'ReelFlies CA', channel: [CHANNEL, 1] }), /exactly one channel/);
});

test('no named variation refuses', () => {
    assert.throws(() => parseReleaseArgs(['--channel', '1895766']), /name the variation/);
    assert.throws(() => parseReleaseArgs(['--channel', '1895766', '--variation', '']), /--variation is empty/);
    assert.throws(() => parseReleaseArgs(['--channel', '1895766', '-a']), /--variation/);
});

test('switch difference refuses', () => {
    const result = guard({ repo: { rf_quick_add: true }, live: { rf_quick_add: false } });
    assert.equal(result.pass, false);
    assert.equal(result.reasons.length, 1);
    assert.match(result.reasons[0], /^rf_quick_add: live false, config\.json true\. No flag overrides this/);
});

test('set-but-missing menu id refuses', () => {
    const result = guard({ repo: { rf_menu_species_root_id: '99' } });
    assert.equal(result.pass, false);
    assert.deepEqual(result.reasons, [`rf_menu_species_root_id: category 99 isn't in channel ${CHANNEL}'s category tree`]);
});

// --- Rule 1, module switches ---

test('today\'s config.json (no rf_* switches, empty menu ids) passes', () => {
    const result = guard();
    assert.equal(result.pass, true);
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(result.newSwitches, []);
});

test('equal switches pass, and every rf_* value to be pushed is listed', () => {
    const result = guard({ repo: { rf_quick_add: true, rf_rise: false }, live: { rf_quick_add: true, rf_rise: false } });
    assert.equal(result.pass, true);
    assert.deepEqual(result.values, [
        { key: 'rf_menu_species_root_id', value: '' },
        { key: 'rf_menu_type_ids', value: '' },
        { key: 'rf_quick_add', value: true },
        { key: 'rf_rise', value: false },
    ]);
});

test('a switch only in config.json passes as a new switch: a module\'s first release', () => {
    const result = guard({ repo: { rf_cart_state: true } });
    assert.equal(result.pass, true);
    assert.deepEqual(result.newSwitches, ['rf_cart_state']);
});

test('a switch only on the live side refuses, because removing a switch must be deliberate', () => {
    const result = guard({ live: { rf_region_prompt: true } });
    assert.equal(result.pass, false);
    assert.match(result.reasons[0], /^rf_region_prompt is only on the live theme \(true\): removing a switch must be deliberate/);
});

test('any rf_* value is protected, not only on/off switches', () => {
    const result = guard({ repo: { rf_free_shipping_cad: '75' }, live: { rf_free_shipping_cad: '100' } });
    assert.match(result.reasons[0], /^rf_free_shipping_cad: live "100", config\.json "75"/);
});

test('every switch difference is its own reason', () => {
    const result = guard({ repo: { rf_quick_add: true, rf_rise: true }, live: { rf_quick_add: false, rf_rise: false } });
    assert.deepEqual(result.reasons.map(reason => reason.split(':')[0]), ['rf_quick_add', 'rf_rise']);
});

// --- Rule 2, menu ids ---

test('empty menu ids pass without reading the category tree, because the menu falls back to stock', () => {
    assert.equal(menuIdsSet({ ...BASE }), false);
    assert.equal(menuIdsSet({ 'body-bg': '#fff' }), false);
    assert.equal(guard({ categoryIds: null }).pass, true);
});

test('set menu ids that are in the channel\'s tree pass', () => {
    const settings = { rf_menu_type_ids: '23, 24,25', rf_menu_species_root_id: 40 };
    assert.equal(menuIdsSet({ ...BASE, ...settings }), true);
    assert.equal(guard({ repo: settings, live: settings }).pass, true);
});

test('one missing id in rf_menu_type_ids fails the whole push, naming that id', () => {
    const result = guard({ repo: { rf_menu_type_ids: '23,77,24' } });
    assert.equal(result.pass, false);
    assert.deepEqual(result.reasons, [`rf_menu_type_ids: category 77 isn't in channel ${CHANNEL}'s category tree`]);
});

test('a menu id that is not a number fails', () => {
    assert.deepEqual(guard({ repo: { rf_menu_type_ids: '23,abc' } }).reasons, ['rf_menu_type_ids: "abc" isn\'t a category id']);
});

test('set menu ids without the channel\'s category ids fail', () => {
    assert.match(guard({ repo: { rf_menu_species_root_id: '40' }, categoryIds: null }).reasons[0], /category tree wasn't read/);
});

test('menu ids aren\'t switches: a live value that differs is left to step 1, which stops on it', () => {
    const result = guard({ repo: { rf_menu_type_ids: '23' }, live: { rf_menu_type_ids: '24' } });
    assert.equal(result.pass, true);
    assert.deepEqual(result.reasons, []);
});

test('the guard runs unchanged for another channel and its tree', () => {
    const result = guard({ repo: { rf_menu_species_root_id: '23' }, channelId: 1, categoryIds: [5, 6] });
    assert.deepEqual(result.reasons, ['rf_menu_species_root_id: category 23 isn\'t in channel 1\'s category tree']);
});
