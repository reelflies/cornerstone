// Helpers for reading server HTML the way a crawler does, without a DOM.
// Assertions in scripts/qa/raw-html/assertions/ use them on page.html.
//
// - findTags(html, name) lists the start tags a browser would turn into elements:
//   anything inside a comment, <script>, <style>, <textarea> or <title> is text,
//   not markup, so it never counts.
// - scriptsOfType(html, type) returns the text of each <script> of that type, such
//   as 'application/ld+json', skipping scripts inside comments.
// - elementsHtml(html, name, test) and outerHtml(html, name, test) return an element's
//   whole markup; textOf(html) its text as a browser shows it; decodeHtml(text) an
//   attribute's text. Tickets 27, 28, 33 and 50 share them (ticket 50's review).

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

const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'',
};

// An attribute's text as a browser reads it: Handlebars writes = as &#x3D; and & as &amp;.
export function decodeHtml(text) {
    return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-z]+));/g, (reference, decimal, hex, name) => {
        if (!decimal && !hex) return NAMED[name] ?? reference;
        const code = parseInt(decimal || hex, decimal ? 10 : 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : reference;
    });
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// The whole markup of each <name> element whose attributes pass `test`, from its start tag to
// its matching end tag, in page order (an outer element before the ones inside it). Only tags of
// that name are counted, so a <div> inside a <div> doesn't end it. An element never closed runs
// to the end of the markup; a void element is its tag alone. Comments and text-only elements are
// emptied first (markupOnly), as findTags does.
export function elementsHtml(html, name, test = () => true) {
    const markup = markupOnly(html);
    const tags = new RegExp(`<(/?)(${name})(?=[\\s/>])${ATTRIBUTES}>`, 'gi');
    const isVoid = VOID.has(name.toLowerCase());
    const found = [];
    const open = [];
    for (const match of markup.matchAll(tags)) {
        const [whole, closing, , attributes] = match;
        if (isVoid) {
            if (!closing && test(parseAttributes(attributes))) found.push({ start: match.index, html: whole });
        } else if (!closing) {
            open.push({ start: match.index, wanted: test(parseAttributes(attributes)) });
        } else if (open.length) {
            const element = open.pop();
            if (element.wanted) found.push({ start: element.start, html: markup.slice(element.start, match.index + whole.length) });
        }
    }
    open.filter(element => element.wanted).forEach(element => found.push({ start: element.start, html: markup.slice(element.start) }));
    return found.sort((a, b) => a.start - b.start).map(element => element.html);
}

// The first of them, or null.
export const outerHtml = (html, name, test = () => true) => elementsHtml(html, name, test)[0] ?? null;

// Text as a browser shows it: tags out, entities decoded, white space collapsed.
export const textOf = html => decodeHtml(markupOnly(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
