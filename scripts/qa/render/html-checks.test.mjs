// Tests for scripts/qa/render/html-checks.mjs (W0-9).
//
//   node --test scripts/qa/render/html-checks.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unbalancedTags } from './html-checks.mjs';

describe('unbalancedTags', () => {
    it('passes balanced markup, void elements and self-closing tags', () => {
        assert.deepEqual(unbalancedTags('<div><p>One<br>two</p><img src="a.png" alt=""><svg><use href="#i"/></svg><input></div>'), []);
    });

    it('ignores tags inside comments, scripts, styles and attribute values', () => {
        assert.deepEqual(unbalancedTags('<div><!-- <p> --><script>"<p>"</script><style>a::after{content:"<b>"}</style><a title="<i>">x</a></div>'), []);
    });

    it('reports an element that is never closed', () => {
        assert.deepEqual(unbalancedTags('<div><p>One</div>'), ['</div> closes <p>, which is still open']);
    });

    it('reports a closing tag with nothing open to close', () => {
        assert.deepEqual(unbalancedTags('</p><p>Two</p>'), ['</p> closes nothing']);
    });

    it('reports what is left open at the end', () => {
        assert.deepEqual(unbalancedTags('<section><p>One</p>'), ['<section> is never closed']);
    });

    it('matches tag names in any case', () => {
        assert.deepEqual(unbalancedTags('<DIV><P>a</p></Div>'), []);
    });
});
