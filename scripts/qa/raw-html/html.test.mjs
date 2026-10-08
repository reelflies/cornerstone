// Tests the element readers in html.mjs that the raw-HTML assertions and the fixture renders share:
// elementsHtml and outerHtml (an element's whole markup), textOf (its text) and decodeHtml (an
// attribute's text). Tickets 27, 28, 33 and 50 each had a copy until ticket 50's review.
//
//   node --test scripts/qa/raw-html/html.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, outerHtml, textOf,
} from './html.mjs';

describe('elementsHtml and outerHtml', () => {
    const html = '<div a><div b><div></div></div><p>x</p></div><div c></div>';

    it('finds an element\'s whole markup, nested elements of the same name included', () => {
        assert.equal(outerHtml(html, 'div', attrs => 'b' in attrs), '<div b><div></div></div>');
        assert.equal(outerHtml(html, 'div', attrs => 'a' in attrs), '<div a><div b><div></div></div><p>x</p></div>');
        assert.equal(outerHtml(html, 'p'), '<p>x</p>');
    });

    it('lists every match in page order, an outer element before the ones inside it', () => {
        assert.deepEqual(elementsHtml(html, 'div').map(element => element.slice(0, 7)), ['<div a>', '<div b>', '<div></', '<div c>']);
        assert.deepEqual(elementsHtml('<a href="/1">one</a> <a>two</a>', 'a', attrs => 'href' in attrs), ['<a href="/1">one</a>']);
    });

    it('matches the name whatever its case, and not a longer name that starts with it', () => {
        assert.equal(outerHtml('<NAV x><nav></nav></NAV>', 'nav', attrs => 'x' in attrs), '<NAV x><nav></nav></NAV>');
        assert.deepEqual(elementsHtml('<details><summary>s</summary></details>', 'detail'), []);
    });

    it('returns null when nothing matches, and the rest of the markup for an element never closed', () => {
        assert.equal(outerHtml(html, 'div', attrs => 'z' in attrs), null);
        assert.equal(outerHtml('<p>before</p><div open><div></div>after', 'div', attrs => 'open' in attrs), '<div open><div></div>after');
    });

    it('takes a void element as its tag alone', () => {
        assert.deepEqual(elementsHtml('<p><input name="a"><input name="b"/></p>', 'input'), ['<input name="a">', '<input name="b"/>']);
    });

    it('ignores comments and the text of script, style, textarea and title, as findTags does', () => {
        assert.deepEqual(elementsHtml('<!-- <div x></div> --><script>"<div y></div>"</script><div z></div>', 'div'), ['<div z></div>']);
    });

    it('reads the same as ticket 27\'s elementSource, which now uses it', async () => {
        const { elementSource } = await import('./assertions/rf-header.mjs');
        assert.equal(elementSource, outerHtml);
    });
});

describe('textOf', () => {
    it('reads text as a browser shows it: tags out, entities decoded, white space collapsed', () => {
        assert.equal(textOf('<p>Shipping &amp; Returns <br> &#x3D; <span>and\n  more</span></p>'), 'Shipping & Returns = and more');
        assert.equal(textOf('<p>a<!-- b --><script>c</script>d</p>'), 'a d');
    });
});

describe('decodeHtml', () => {
    it('decodes the character references Handlebars writes into attributes (moved from ticket 33\'s facet-links test)', () => {
        assert.equal(decodeHtml('?_bc_fsnf&#x3D;1&amp;Fly+Sizes&#x3D;2%2F0'), '?_bc_fsnf=1&Fly+Sizes=2%2F0');
        assert.equal(decodeHtml('&quot;&#x27;&#x60;&lt;&gt;&#61;&apos;&#X3d;'), '"\'`<>=\'=');
    });

    it('leaves text without references, and references it doesn\'t know, as they are', () => {
        assert.equal(decodeHtml('/flies/dry-flies/?page=2'), '/flies/dry-flies/?page=2');
        assert.equal(decodeHtml('a &copy; b &#xZZ; &#x110000;'), 'a &copy; b &#xZZ; &#x110000;');
    });
});
