// A stencil start that is already running is reused by the gates only when it renders the
// channel and the variation the run is for (scripts/qa/storefront.mjs), so one set's
// screenshots are never compared with, or written as, another's.
//
//   node --test scripts/qa/storefront.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wrongServer } from './storefront.mjs';

const config = { variations: [{ name: 'ReelFlies CA' }, { name: 'ReelFlies US' }] };
// What `?debug=context` shows: stencil start sets settings.theme_config_id to a uuid of the
// variation's position in config.json, counted from 1.
const served = (channel, position) => ({
    settings: { channel_id: channel, theme_config_id: `00000000-0000-0000-0000-${String(position).padStart(12, '0')}` },
});

describe('reusing a running stencil start', () => {
    it('is allowed when it renders the run\'s channel and variation', () => {
        assert.deepEqual(wrongServer(served(1895766, 1), { channel: '1895766', variation: 'ReelFlies CA', config }), []);
        assert.deepEqual(wrongServer(served(1, 2), { channel: '1', variation: 'ReelFlies US', config }), []);
    });

    it('is refused when it renders another channel', () => {
        const problems = wrongServer(served(1, 1), { channel: '1895766', variation: 'ReelFlies CA', config });
        assert.deepEqual(problems, ['renders channel 1, not QA_CHANNEL 1895766']);
    });

    it('is refused when it renders another variation of the same channel', () => {
        const problems = wrongServer(served(1895766, 2), { channel: '1895766', variation: 'ReelFlies CA', config });
        assert.deepEqual(problems, ['renders the variation "ReelFlies US", not QA_VARIATION "ReelFlies CA"']);
    });

    it('is refused when it doesn\'t say which variation it renders', () => {
        const problems = wrongServer({ settings: { channel_id: 1895766 } }, { channel: '1895766', variation: 'ReelFlies CA', config });
        assert.deepEqual(problems, ['renders an unknown variation (theme_config_id undefined), not QA_VARIATION "ReelFlies CA"']);
    });
});
