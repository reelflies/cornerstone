// Checks for rendered markup, for fixture-render tests (W0-9; scripts/qa/README.md, "Fixture
// renders"). Markup is read as in scripts/qa/raw-html/html.mjs: anything inside a comment,
// <script>, <style>, <textarea> or <title> is text, not markup.
//
// - unbalancedTags(html) lists every element that is closed in the wrong place, closed when
//   nothing is open, or never closed. It asks for explicit closing tags, which is stricter
//   than a browser: HTML lets a <p> or an <li> close itself, but a ReelFlies template always
//   closes them, so a missing one means a template, or a split, went wrong.

import { markupOnly } from '../raw-html/html.mjs';

// Elements that never have a closing tag (HTML's void elements).
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// A start or end tag. Quoted attribute values may hold ">", and a "/" right before ">" makes
// a self-closing tag (SVG's <use/>, <path/>).
const TAG = /<(\/?)([a-z][a-z0-9-]*)(?:\s(?:[^>"'/]|"[^"]*"|'[^']*'|\/(?!>))*)?(\/?)>/gi;

export function unbalancedTags(html) {
    const open = [];
    const problems = [];
    for (const [, closing, rawName, selfClosing] of markupOnly(html).matchAll(TAG)) {
        const name = rawName.toLowerCase();
        if (!closing) {
            if (!VOID.has(name) && !selfClosing) open.push(name);
        } else if (open[open.length - 1] === name) {
            open.pop();
        } else if (open.includes(name)) {
            // Close what is still open inside it, as a browser does, and report the first.
            problems.push(`</${name}> closes <${open[open.length - 1]}>, which is still open`);
            open.length = open.lastIndexOf(name);
        } else {
            problems.push(`</${name}> closes nothing`);
        }
    }
    return [...problems, ...open.reverse().map(name => `<${name}> is never closed`)];
}
