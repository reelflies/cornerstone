// The store copy of a widget template that calls widgets/_shared/ partials (ticket 46).
//
//   import { pasteShared } from './widgets/paste.mjs';
//   const stored = pasteShared(template, { root });   // the template, each _shared call pasted
//
// The store renders widget templates with Handlebars 3 (engine.mjs). A store template can't
// include partials, and Handlebars 3 can't define inline ones, so each call,
// {{> _shared/<partial> key=value …}}, is replaced by the partial's body:
//
// - The body is printed from Handlebars 3's own parse of the partial file, as Handlebars renders
//   that file on its own: every standalone line and ~ already applied to the text, no comments,
//   no ~, and an empty comment {{!}} before each block's {{#…}}, {{else}} and {{/…}}, so no tag
//   in it stands alone on a line wherever it lands. Two more empty comments stand on each side,
//   where the call stood, so the template's own tags see what they saw beside the call.
// - Each hash argument is replaced by its value where the body reads it. Handlebars renders a
//   partial with the hash laid over the caller's context, and the pasted body sits in that
//   context, so a read of any other name is the same.
// - A call alone on its line: Handlebars drops the line break after it, and Paper compiles with
//   preventIndent, so its indent stays as text, once. The copy keeps that line break and drops
//   the one the partial ends with instead.
// - What can't be pasted exactly is refused, naming the file (paste.test.mjs, REFUSED).
// - Two checks, on Handlebars 3's parse trees, with comments and the way text is split ignored:
//   the printed body parses to the partial's own tree, and the copy parses to the template's tree
//   with each call's output in its place.
//
// A template that calls no _shared partial is returned as it is, byte for byte.

import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';
import { Handlebars3, STORE_ENGINE, helperNames } from './engine.mjs';

const GUARD = '{{!}}';
const LINE_BREAK = /\r\n?|\n/g;
const SHARED_NAME = /^_shared\/[a-z0-9][a-z0-9-]*$/;
// A path segment Handlebars 3 reads as an ID as written; anything else is written [segment].
const SEGMENT = /^[^\s!"#%-,./;->@[-^`{-~]+$/;
const KEYWORD = /^(?:true|false|null|undefined|else|as|this)$|^-?\d/;

const relative = (root, file) => path.join('widgets', path.relative(root, file));

// make(), with any error it throws prefixed by `where`.
const naming = (where, make) => {
    try {
        return make();
    } catch (error) {
        throw new Error(`${where}: ${error.message}`);
    }
};

// Handlebars 3's parse tree of `source`, with its whitespace control applied, as the store parses it.
export function parseForStore(source) {
    try {
        return Handlebars3.parse(source);
    } catch (error) {
        throw new Error(`Handlebars 3, the store's engine (${STORE_ENGINE}), can't parse it: ${error.message}`);
    }
}

// Handlebars 3's scopedId: a path written from this or ".", which is never a helper.
const isScoped = node => /^\.|this\b/.test(node.original);

// Every path an expression reads: itself, or a subexpression's helper name, params and hash values.
const pathsIn = node => {
    if (node.type === 'PathExpression') return [node];
    if (node.type !== 'SubExpression') return [];
    return [node.path, ...node.params, ...(node.hash?.pairs || []).map(pair => pair.value)].flatMap(pathsIn);
};

// ---------------------------------------------------------------------------------------------
// Shapes: a parse tree as Handlebars renders it. Comments are dropped and neighbouring text
// joined, so two trees with the same shape render the same.

function shape(node, replace = new Map()) {
    const call = item => ({
        path: shape(item.path), params: item.params.map(param => shape(param)), hash: item.hash ? item.hash.pairs.map(pair => [pair.key, shape(pair.value)]) : [],
    });
    switch (node.type) {
    case 'Program': {
        const body = [];
        for (const child of node.body) {
            for (const item of replace.get(child) || [child]) {
                if (item.type !== 'CommentStatement') {
                    const shaped = shape(item, replace);
                    const last = body[body.length - 1];
                    if (shaped.type === 'ContentStatement' && last?.type === 'ContentStatement') last.value += shaped.value;
                    else body.push(shaped);
                }
            }
        }
        return { type: 'Program', blockParams: node.blockParams || null, body: body.filter(item => item.type !== 'ContentStatement' || item.value !== '') };
    }
    case 'ContentStatement': return { type: node.type, value: node.value };
    case 'MustacheStatement': return { type: node.type, escaped: Boolean(node.escaped), ...call(node) };
    case 'BlockStatement':
        return {
            type: node.type, ...call(node), program: node.program ? shape(node.program, replace) : null, inverse: node.inverse ? shape(node.inverse, replace) : null,
        };
    case 'PartialStatement':
        return {
            type: node.type, name: shape(node.name), params: node.params.map(param => shape(param)), hash: node.hash ? node.hash.pairs.map(pair => [pair.key, shape(pair.value)]) : [], indent: node.indent || '',
        };
    case 'SubExpression': return { type: node.type, ...call(node) };
    case 'PathExpression':
        return {
            type: node.type, data: Boolean(node.data), depth: node.depth, parts: node.parts, scoped: isScoped(node),
        };
    default: return { type: node.type, value: node.value };
    }
}

// ---------------------------------------------------------------------------------------------
// Printing a partial's parse tree back as Handlebars 3 source. `context`:
//   where     the partial's file, for errors
//   mapping   hash argument name -> its value's node (empty when printed as the file alone)
//   scope     'root' where the partial's context is the call's (its top level, {{#if}} and
//             {{#unless}}), or the block that changes it
//   own       the partial's block params in scope
//   caller    the template's block params in scope at the call
//   callerSide  true when printing a hash value: the template's own expression, unchecked
//
// The printer's functions call each other, as the tree nests: an expression holds calls, and a
// block holds programs.
/* eslint-disable no-use-before-define */

const refuse = message => {
    throw new Error(message);
};

function segment(part) {
    if (SEGMENT.test(part) && !KEYWORD.test(part)) return part;
    if (part.includes(']')) refuse(`the path segment ${JSON.stringify(part)} holds "]", so it can't be written back`);
    return `[${part}]`;
}

function pathText({
    data, depth, parts, scoped,
}) {
    const segments = parts.map(segment);
    if (data) return `@${segments.join('.')}`;
    // A ../ path is scoped already (Handlebars' scopedId matches its leading ".").
    if (depth > 0) return segments.length ? `${'../'.repeat(depth)}${segments.join('.')}` : `${'../'.repeat(depth - 1)}..`;
    return scoped ? ['this', ...segments].join('.') : segments.join('.');
}

const pathOf = node => ({
    data: Boolean(node.data), depth: node.depth, parts: node.parts, scoped: isScoped(node),
});

function literalText(node) {
    switch (node.type) {
    case 'StringLiteral':
        if (node.value.includes('\\')) refuse(`the string ${JSON.stringify(node.value)} holds a backslash, so it can't be written back`);
        if (!node.value.includes('"')) return `"${node.value}"`;
        return node.value.includes('\'') ? `"${node.value.replace(/"/g, '\\"')}"` : `'${node.value}'`;
    case 'NumberLiteral': return String(node.original);
    case 'BooleanLiteral': return String(node.value);
    case 'UndefinedLiteral': return 'undefined';
    case 'NullLiteral': return 'null';
    default: return refuse(`a ${node.type} can't be written back`);
    }
}

// The hash argument a path reads, or null.
const hashKey = (node, context) => (node.type === 'PathExpression' && !context.callerSide && !node.data && node.depth === 0 && node.parts.length
    && context.mapping.has(node.parts[0]) && !context.own.has(node.parts[0]) ? node.parts[0] : null);

function checkPath(node, context) {
    if (context.callerSide) return;
    const text = pathText(pathOf(node));
    if (node.depth > 0) refuse(`{{${text}}} reads ../, which resolves differently once the body sits in the template (Handlebars 3 counts each {{#if}} as a level): pass what it reads as a hash argument`);
    if (!node.data && !node.parts.length && context.mapping.size && context.scope === 'root') {
        refuse('it reads this, which is the template\'s context once pasted, not that context with the hash arguments laid over it: read each hash argument by its name');
    }
    const [head] = node.parts;
    if (!node.data && !isScoped(node) && head !== undefined && context.caller.has(head) && !context.own.has(head)) {
        refuse(`it reads "${head}", which is a block param of the template where it is called: a partial can't see the caller's block params, but its pasted body would. Rename it, or pass it as a hash argument`);
    }
}

// An expression: `position` is 'head' (a mustache's own path), 'helper' (a helper's name, called
// with arguments), 'block' (a block's path) or 'param'.
function printExpression(node, context, position) {
    if (node.type === 'SubExpression') return `(${printCall(node, context, 'helper')})`;
    if (node.type !== 'PathExpression') return literalText(node);
    checkPath(node, context);
    const key = position === 'helper' ? null : hashKey(node, context);
    if (key === null) return pathText(pathOf(node));
    if (context.scope !== 'root') refuse(`it reads the hash argument "${key}" inside {{#${context.scope}}}, where the context is no longer the call's: read it outside the block, or inside {{#if}} or {{#unless}}`);
    if (position === 'block') refuse(`it reads the hash argument "${key}" as a block ({{#${key}}}): use {{#if}} or {{#each}} with it`);
    const value = context.mapping.get(key);
    const rest = node.parts.slice(1);
    // The value reads its names where the call stands; pasted inside the partial's {{#if … as |x|}},
    // a name x would read that block param instead (one {{#if}} never fills).
    const shadowed = pathsIn(value).find(item => !item.data && item.depth === 0 && !isScoped(item) && context.own.has(item.parts[0]));
    if (shadowed) refuse(`the hash argument "${key}" reads "${shadowed.parts[0]}", which is a block param of the partial where it reads "${key}": rename the block param`);
    if (value.type === 'PathExpression') {
        const mapped = { ...pathOf(value), parts: [...value.parts, ...rest] };
        if (position === 'head' && !mapped.data && !mapped.scoped && mapped.parts.length === 1 && helperNames().has(mapped.parts[0])) {
            refuse(`{{${key}}} would become {{${mapped.parts[0]}}}, which calls the helper ${mapped.parts[0]}: pass a longer path, or this.${mapped.parts[0]}`);
        }
        return pathText(mapped);
    }
    if (rest.length) refuse(`the hash argument "${key}" is a ${value.type === 'SubExpression' ? 'subexpression' : 'literal'}, so ${pathText(pathOf(node))} has nothing to read after it`);
    if (value.type === 'SubExpression') {
        if (position === 'head') refuse(`the hash argument "${key}" is a subexpression, which {{${key}}} can't print once pasted: print it inside the template instead`);
        return printExpression(value, { callerSide: true }, 'param');
    }
    return literalText(value);
}

function printCall(node, context, position) {
    const params = node.params.map(param => ` ${printExpression(param, context, 'param')}`).join('');
    const hash = node.hash ? node.hash.pairs.map(pair => ` ${pair.key}=${printExpression(pair.value, context, 'param')}`).join('') : '';
    return `${printExpression(node.path, context, position)}${params}${hash}`;
}

function printMustache(node, context) {
    const [open, close] = node.escaped ? ['{{', '}}'] : ['{{{', '}}}'];
    const bare = !node.params.length && !node.hash;
    const key = bare ? hashKey(node.path, context) : null;
    const value = key === null ? null : context.mapping.get(key);
    if (context.scope === 'root' && value && ['StringLiteral', 'NumberLiteral'].includes(value.type)) {
        checkPath(node.path, context);
        if (node.path.parts.length > 1) refuse(`the hash argument "${key}" is a literal, so ${pathText(pathOf(node.path))} has nothing to read after it`);
        const text = String(value.type === 'NumberLiteral' ? value.original : value.value);
        const printed = node.escaped ? Handlebars3.Utils.escapeExpression(text) : text;
        if (printed.includes('{{') || printed.endsWith('\\')) refuse(`the hash argument "${key}" is the literal ${JSON.stringify(text)}, which would become a tag once pasted`);
        return printed;
    }
    if (context.scope === 'root' && value && !['PathExpression', 'SubExpression'].includes(value.type)) {
        refuse(`the hash argument "${key}" is the literal ${literalText(value)}, which {{${key}}} can't print once pasted: use it inside {{#if}}, or pass a string`);
    }
    return `${open}${printCall(node, context, bare ? 'head' : 'helper')}${close}`;
}

// A block's params: its program's, or its inverse's for a {{^…}} block with no program.
const blockParamsOf = node => (node.program ? node.program.blockParams : node.inverse?.blockParams) || [];

const isIfOrUnless = node => node.type === 'PathExpression' && !node.data && node.depth === 0 && !isScoped(node)
    && node.parts.length === 1 && ['if', 'unless'].includes(node.parts[0]);

function printBlock(node, context) {
    const blockParams = blockParamsOf(node);
    blockParams.filter(name => context.mapping.has(name)).forEach(name => refuse(`its block param "${name}" has the name of a hash argument`));
    const inner = {
        ...context,
        scope: isIfOrUnless(node.path) ? context.scope : pathText(pathOf(node.path)),
        own: new Set([...context.own, ...blockParams]),
    };
    const open = `${printCall(node, context, 'block')}${blockParams.length ? ` as |${blockParams.join(' ')}|` : ''}`;
    const close = `${GUARD}{{/${printExpression(node.path, context, 'block')}}}`;
    if (!node.program) return `${GUARD}{{^${open}}}${printProgram(node.inverse, inner)}${close}`;
    const inverse = node.inverse ? `${GUARD}{{else}}${printProgram(node.inverse, inner)}` : '';
    return `${GUARD}{{#${open}}}${printProgram(node.program, inner)}${inverse}${close}`;
}

function printStatement(node, context) {
    switch (node.type) {
    case 'ContentStatement':
        if (node.value.includes('{{')) refuse('it has an escaped {{ (\\{{ or a raw block), which would become a tag once pasted');
        if (node.value.endsWith('\\')) refuse('it has a backslash just before a tag, which would escape the tag once pasted');
        return node.value;
    case 'CommentStatement': return '';
    case 'MustacheStatement': return printMustache(node, context);
    case 'BlockStatement': return printBlock(node, context);
    case 'PartialStatement': return refuse(`it calls {{> ${node.name.original}}}: _shared partials are pasted one level deep`);
    default: return refuse(`it has a ${node.type}, which a store widget template can't have`);
    }
}

function printProgram(program, context) {
    return program.body.map(node => printStatement(node, context)).join('');
}
/* eslint-enable no-use-before-define */

// ---------------------------------------------------------------------------------------------
// The template's side.

// Each partial call in the template's tree, with what Handlebars' whitespace control saw round it.
function findCalls(program, isRoot, blockParams, calls) {
    program.body.forEach((node, index) => {
        if (node.type === 'PartialStatement') {
            calls.push({
                node, body: program.body, index, isRoot, blockParams,
            });
        } else if (node.type === 'BlockStatement') {
            const inner = new Set([...blockParams, ...blockParamsOf(node)]);
            if (node.program) findCalls(node.program, false, inner, calls);
            if (node.inverse) findCalls(node.inverse, false, inner, calls);
        }
    });
    return calls;
}

// Handlebars 3's own test for a standalone tag (compiler/whitespace-control.js), on its
// neighbours' text as written.
function isPrevWhitespace(body, i, isRoot) {
    const prev = body[i - 1];
    if (!prev) return isRoot;
    return prev.type === 'ContentStatement' && (body[i - 2] || !isRoot ? /\r?\n\s*?$/ : /(^|\r?\n)\s*?$/).test(prev.original);
}

function isNextWhitespace(body, i, isRoot) {
    const next = body[i + 1];
    if (!next) return isRoot;
    return next.type === 'ContentStatement' && (body[i + 2] || !isRoot ? /^\s*?\r?\n/ : /^\s*?(\r?\n|$)/).test(next.original);
}

function readPartial(name, root, cache) {
    if (!cache.has(name)) {
        const file = path.join(root, `${name}.html`);
        const where = relative(root, file);
        if (!SHARED_NAME.test(name) || !fs.existsSync(file)) throw new Error(`${where} doesn't exist (called as {{> ${name}}})`);
        cache.set(name, naming(where, () => {
            const tree = parseForStore(fs.readFileSync(file, 'utf8'));
            const printed = printProgram(tree, {
                mapping: new Map(), scope: 'root', own: new Set(), caller: new Set(),
            });
            if (!isDeepStrictEqual(shape(parseForStore(printed)), shape(tree))) refuse('its body can\'t be printed back so that Handlebars 3 renders it as the file');
            return { where, tree };
        }));
    }
    return cache.get(name);
}

// The call's partial, printed for it: its hash arguments mapped.
function printFor(call, source, root, cache) {
    const { node } = call;
    if (node.name.type === 'SubExpression') refuse(`${source} is a dynamic partial: a store widget can only paste a _shared partial named as written`);
    const name = String(node.name.original);
    if (!name.startsWith('_shared/')) refuse(`a store widget can't include the theme partial ${name}: only widgets/_shared/ partials are pasted`);
    const partial = readPartial(name, root, cache);
    if (node.params.length) refuse(`${source} passes a context: pass what the partial reads as hash arguments (key=value) instead`);
    const mapping = new Map();
    for (const { key, value } of node.hash?.pairs || []) {
        if (helperNames().has(key)) refuse(`${source}: the hash argument "${key}" has the name of a helper, so {{${key}}} would call the helper: rename it`);
        if (pathsIn(value).some(item => item.depth > 0)) {
            refuse(`${source}: its hash argument ${key}=${printExpression(value, { callerSide: true }, 'param')} reads ../, which resolves differently once the partial's body sits in its blocks: pass a path without ../`);
        }
        mapping.set(key, value);
    }
    return naming(partial.where, () => printProgram(partial.tree, {
        mapping, scope: 'root', own: new Set(), caller: call.blockParams,
    }));
}

// Offsets in `source` from Handlebars' line and column: its lexer breaks lines at \r\n, \r and \n.
function offsets(source) {
    const lineStarts = [0, ...[...source.matchAll(LINE_BREAK)].map(found => found.index + found[0].length)];
    return ({ line, column }) => lineStarts[line - 1] + column;
}

// The template with the given calls pasted, and the shape it must parse to.
function paste(source, tree, calls, root, cache) {
    const offset = offsets(source);
    const edits = [];
    const replace = new Map();
    for (const call of calls) {
        const { node } = call;
        const start = offset(node.loc.start);
        let end = offset(node.loc.end);
        const text = source.slice(start, end);
        if (!/^\{\{~?>[\s\S]*\}\}$/.test(text)) {
            refuse(`Handlebars places a partial call at line ${node.loc.start.line}, column ${node.loc.start.column} where there is none. A U+2028 or U+2029 character upsets its count of lines: replace it with a space or a line break`);
        }
        const where = `${text} (line ${node.loc.start.line})`;
        let printed = printFor(call, where, root, cache);
        const parsed = parseForStore(printed);
        replace.set(node, [{ type: 'ContentStatement', value: node.indent || '' }, ...parsed.body]);
        if (!node.strip.close && isPrevWhitespace(call.body, call.index, call.isRoot) && isNextWhitespace(call.body, call.index, call.isRoot)) {
            const [, spaces, lineBreak] = source.slice(end).match(/^([ \t]*)(\r?\n)?/);
            end += spaces.length;
            if (lineBreak) {
                const last = shape(parsed).body.at(-1);
                if (last?.type !== 'ContentStatement' || !last.value.endsWith(lineBreak)) {
                    refuse(`${where} stands alone on its line, so Handlebars drops the line break after it. The store's copy drops the line break the partial ends with instead, and ${relative(root, path.join(root, `${node.name.original}.html`))} doesn't end with one of its own (it ends with a tag, or renders nothing): end it with markup and a line break, or call it inside a line`);
                }
                printed = printed.slice(0, -lineBreak.length);
            }
        }
        edits.push({
            start, end, text: `{{${node.strip.open ? '~' : ''}!}}${GUARD}${printed}${GUARD}{{!${node.strip.close ? '~' : ''}}}`,
        });
    }
    const pasted = edits.sort((a, b) => b.start - a.start).reduce((text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`, source);
    return { pasted, expected: shape(tree, replace) };
}

export function pasteShared(source, { root }) {
    const tree = parseForStore(source);
    const calls = findCalls(tree, true, new Set(), []);
    if (!calls.length) return source;
    const cache = new Map();
    const { pasted, expected } = paste(source, tree, calls, root, cache);
    if (isDeepStrictEqual(shape(parseForStore(pasted)), expected)) return pasted;
    // Name the calls that, pasted alone, change how the template's own whitespace is read.
    const offset = offsets(source);
    const culprits = calls.filter(call => {
        const one = paste(source, tree, [call], root, cache);
        return !isDeepStrictEqual(shape(parseForStore(one.pasted)), one.expected);
    }).map(({ node }) => `${source.slice(offset(node.loc.start), offset(node.loc.end))} (line ${node.loc.start.line})`);
    return refuse(`pasting ${culprits.length ? culprits.join(', ') : 'its _shared partials'} would change how Handlebars reads the whitespace round the call, so the store's copy wouldn't render as the files do: call it inside a line, such as <li>{{> …}}</li>`);
}
