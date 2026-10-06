// Tests scripts/store/settings-proof.mjs (W0-11): ticket 21's three-part test. Parts 1 and 2 are
// proved by reads before a settings write; part 3 is checked by reads after it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PART3_SCOPES, part3Changes, proveSettingsWrite } from './settings-proof.mjs';
import { loadFixture } from './fixtures/store.mjs';

const inventory = loadFixture('settings-inventory.json');
const prove = (body, channelData = inventory.channel_1895766.data, globalData = inventory.global.data, globalOnly = []) => proveSettingsWrite({
    settingsPath: 'inventory', body, globalData, channelData, globalOnly,
});

test('a key the channel read shows (null: inheriting) on an endpoint that answers per channel is proved', () => {
    const proof = prove({ option_out_of_stock_behavior: 'label_option' });
    assert.equal(proof.proved, true);
    assert.equal(proof.settings, 'inventory');
    assert.equal(proof.part1.proved, true);
    assert.match(proof.part1.evidence, /GET \?channel_id=1895766 answered with its own view/);
    assert.deepEqual(proof.part2.map(({ key, proved }) => [key, proved]), [['option_out_of_stock_behavior', true]]);
    assert.match(proof.part2[0].evidence, /shown as null: 1895766 inherits the global value "do_nothing"/);
});

test('a key the channel already overrides is proved, with its value as evidence', () => {
    const channelData = { ...inventory.channel_1895766.data, stock_level_display: 'show_when_low' };
    const proof = prove({ stock_level_display: 'dont_show' }, channelData);
    assert.equal(proof.proved, true);
    assert.match(proof.part2[0].evidence, /shown with the channel's own value "show_when_low"/);
});

test('part 1 fails when the channel read is the global read: the endpoint may ignore channel_id', () => {
    const proof = prove({ option_out_of_stock_behavior: 'label_option' }, { ...inventory.global.data });
    assert.equal(proof.proved, false);
    assert.equal(proof.part1.proved, false);
    assert.match(proof.part1.evidence, /returned exactly the global settings/);
});

test('part 2 fails for a key the channel read doesn\'t show, a key the global read lacks, or a documented global-only key', () => {
    const { option_out_of_stock_behavior: dropped, ...partial } = inventory.channel_1895766.data;
    assert.equal(dropped, null);
    const missing = prove({ option_out_of_stock_behavior: 'label_option' }, partial);
    assert.equal(missing.proved, false);
    assert.match(missing.part2[0].evidence, /the channel read shows no override field for option_out_of_stock_behavior/);

    const unknown = prove({ no_such_setting: true });
    assert.equal(unknown.proved, false);
    assert.match(unknown.part2[0].evidence, /the global read has no field no_such_setting/);

    const global = prove({ product_filtering_enabled: true }, { product_filtering_enabled: null, a: 1 }, { product_filtering_enabled: false, a: 1 }, ['product_filtering_enabled']);
    assert.equal(global.proved, false);
    assert.match(global.part2[0].evidence, /BigCommerce documents product_filtering_enabled as global-only/);
});

test('an empty channel read proves part 1 but no key: nothing shows an override field', () => {
    const proof = prove({ option_out_of_stock_behavior: 'label_option' }, {});
    assert.equal(proof.part1.proved, true);
    assert.equal(proof.proved, false);
});

test('reads without a data object prove nothing', () => {
    assert.equal(prove({ a: 1 }, null).part1.proved, false);
    assert.equal(prove({ a: 1 }, inventory.channel_1895766.data, []).part1.proved, false);
});

test('part 3: the global value and channels 1 and 1855224 read back unchanged, or the changed keys are named', () => {
    assert.deepEqual(PART3_SCOPES, ['global', '1', '1855224']);
    const before = {
        global: inventory.global.data, 1: inventory.channel_1.data, 1855224: inventory.channel_1855224.data,
    };
    assert.deepEqual(part3Changes(before, structuredClone(before)), []);
    const leaked = structuredClone(before);
    leaked.global.option_out_of_stock_behavior = 'label_option';
    leaked['1855224'].stock_level_display = 'show';
    assert.deepEqual(part3Changes(before, leaked), [
        { scope: 'global', keys: ['option_out_of_stock_behavior'] },
        { scope: '1855224', keys: ['stock_level_display'] },
    ]);
    const gone = structuredClone(before);
    delete gone['1'].out_of_stock_message;
    assert.deepEqual(part3Changes(before, gone), [{ scope: '1', keys: ['out_of_stock_message'] }]);
    assert.deepEqual(part3Changes(before, { ...before, 1: null }), [{ scope: '1', keys: ['(the whole read)'] }]);
});
