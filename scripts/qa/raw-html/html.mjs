// Helpers for reading server HTML the way a crawler does, without a DOM.
// Assertions in scripts/qa/raw-html/assertions/ use them on page.html.
//
// - findTags(html, name) lists the start tags a browser would turn into elements:
//   anything inside a comment, <script>, <style>, <textarea> or <title> is text,
//   not markup, so it never counts.
// - scriptsOfType(html, type) returns the text of each <script> of that type, such
//   as 'application/ld+json', skipping scripts inside comments.

const ATTRIBUTES = String.raw`((?:[^>"']|"[^"]*"|'[^']*')*)`;
const COMMENT_OR_TEXT_ELEMENT = new RegExp(String.raw`<!--[\s\S]*?-->|<(script|style|textarea|title)\b${ATTRIBUTES}>[\s\S]*?<\/\1\s*>`, 'gi');
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseAttributes(source) {
    const attrs = {};
    for (const [, name, double, single, bare] of source.matchAll(ATTRIBUTE)) {
        const key = name.toLowerCase();
        if (!(key in attrs)) attrs[key] = double ?? single ?? bare ?? '';
    }
    return attrs;
}

// The HTML with comments removed and text-only elements emptied (their tags stay).
export function markupOnly(html) {
    return html.replace(COMMENT_OR_TEXT_ELEMENT, (match, element, attributes) => (element ? `<${element}${attributes}></${element}>` : ''));
}

// Start tags named `name` (any element when name is omitted), as { name, attrs, raw }.
export function findTags(html, name = '[a-z][a-z0-9-]*') {
    const tag = new RegExp(`<(${name})(?=[\\s/>])${ATTRIBUTES}>`, 'gi');
    return [...markupOnly(html).matchAll(tag)].map(([raw, tagName, attributes]) => ({
        name: tagName.toLowerCase(),
        attrs: parseAttributes(attributes),
        raw,
    }));
}

export function scriptsOfType(html, type) {
    const scripts = [];
    const pattern = new RegExp(`<!--[\\s\\S]*?-->|<script\\b${ATTRIBUTES}>([\\s\\S]*?)<\\/script\\s*>`, 'gi');
    for (const [match, attributes, text] of html.matchAll(pattern)) {
        if (!match.startsWith('<!--') && (parseAttributes(attributes).type || '').trim().toLowerCase() === type) {
            scripts.push(text);
        }
    }
    return scripts;
}
