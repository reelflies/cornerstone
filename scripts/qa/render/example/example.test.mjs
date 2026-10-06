// The worked example in scripts/qa/README.md ("Fixture renders"): a partial tested from fixture
// JSON, with two fixtures that pass and one that fails. Copy this file next to your own
// partial's fixtures and change the names. CI runs it through `npm run test:scripts`.
//
//   node --test scripts/qa/render/example/example.test.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { readFixture, renderPartial } from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// A real partial lives in the theme's templates/, which the renderer always searches, so it
// needs no `templates` option. This example lives outside the theme, so it names its folder.
const render = name => renderPartial('components/reelflies/example-intro', readFixture(path.join(HERE, 'fixtures', name)), {
    templates: [path.join(HERE, 'templates')],
});
const inner = (html, className) => html.match(new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`))?.[1].trim();

describe('the example intro', () => {
    it('puts the part before <!--more--> under the H1, and the rest below', async () => {
        const html = await render('marker.json');
        assert.equal(findTags(html, 'h1').length, 1);
        assert.equal(inner(html, 'rf-example-intro__lead'), '<p>Flies that float on the surface, tied by hand.</p>');
        assert.equal(inner(html, 'rf-example-intro__more'), '<p>Match the hatch: pick the size of the insects on the water.</p>');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('without the marker, shows the H1 alone and puts the whole description below', async () => {
        const html = await render('no-marker.json');
        assert.equal(inner(html, 'rf-example-intro__lead'), undefined);
        assert.equal(inner(html, 'rf-example-intro__more'), '<p>Flies that float on the surface, tied by hand.</p>');
        assert.deepEqual(unbalancedTags(html), []);
    });

    // The failing fixture. The store's editor can save the marker inside its own paragraph,
    // and a split there leaves the lead's <p> open and closes it again below the grid. The
    // check catches it; this test proves it does, so the check can't quietly stop working.
    it('fails the markup check when the marker was saved inside a paragraph', async () => {
        assert.deepEqual(unbalancedTags(await render('marker-in-paragraph.json')), [
            '</div> closes <p>, which is still open',
            '</p> closes nothing',
        ]);
    });
});
