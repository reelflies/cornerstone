#!/usr/bin/env node
// The Web Page sources for ReelFlies_CA (ticket 22): reads content/pages/1895766/, checks them,
// and turns them into a changes file for the store-write helper (scripts/store/, W0-11). It
// sends nothing to the store and reads no token: the write itself is plan.mjs then apply.mjs.
//
//   node scripts/content/pages.mjs                                     # check the sources; list what waits for Shaun
//   node scripts/content/pages.mjs --changes <out.json>                # also write the requests: a POST of every page
//   node scripts/content/pages.mjs --changes <out.json> --existing <read.json>
//                                                                      # PUT the pages the channel already has
//
// `--existing` takes the channel's own pages as GET /v3/content/pages?channel_id=1895766 answers
// them (`{ "data": [...] }` or the bare array), for example from plan.mjs's snapshot. A page
// whose url matches one there is updated by its id; the rest are created in one POST. A read
// that names any other channel is refused, so a page is never matched across channels.
//
// The source format (content/pages/1895766/README.md):
//
// - pages.json: the channel, then one entry per page with the fields BigCommerce stores (name,
//   type, url, is_visible, sort_order, meta_description, and contact_fields for the contact
//   form), plus what isn't sent: the body's file, where the path comes from (`path`), the
//   status (`draft` or `approved`, with `approved: { by, date }`), and `forShaun`, what he
//   still has to supply or confirm.
// - <file>.html: the page body. A draft opens with the DRAFT banner
//   (`<p class="rf-draft" data-rf-draft="page">`), and every passage that waits for Shaun is
//   `<mark data-rf-draft="<key>">`, one key per forShaun entry.
// - newsletter.json: the CASL newsletter wording, written once here for tickets 24 and 50.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findTags } from '../qa/raw-html/html.mjs';
import { unbalancedTags } from '../qa/render/html-checks.mjs';
import { CHANNEL } from '../store/channel.mjs';
import { isMain } from '../lib/is-main.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAGES_DIR = `content/pages/${CHANNEL}`;

// Web Page types the sources may use: a plain page and the contact form.
const TYPES = ['page', 'contact_form'];
// The fields BigCommerce's contact form offers besides the message (v3 Pages API).
const CONTACT_FIELDS = ['fullname', 'companyname', 'phone', 'orderno', 'rma'];
// The fields sent for each page; the rest of an entry stays in the repo.
const SENT = ['name', 'type', 'url', 'body', 'is_visible', 'sort_order', 'meta_description', 'contact_fields'];
const STATUSES = ['draft', 'approved'];
// Paths a body may link to besides the pages themselves: ticket 35's chart and the Blog.
const OTHER_PATHS = ['/fly-hook-size-chart/', '/blog/'];
const URL_PATH = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const FLY_ONLY = /\bfly[\s-]+only\b/i;
const NOT_IN_BODY = ['script', 'style', 'iframe', 'form', 'object', 'embed'];

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The page's text as a reader sees it: tags and comments gone, entities decoded, spaces folded.
export function textOf(html) {
    const named = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', reg: '®',
    };
    return html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
            if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
            return named[code.toLowerCase()] ?? entity;
        })
        .replace(/\s+/g, ' ')
        .replace(/ ([.,;:!?)])/g, '$1')
        .trim();
}

// Every data-rf-draft key in the markup, in order, comments and scripts aside.
export function draftMarkers(html) {
    return findTags(html).map(tag => tag.attrs['data-rf-draft']).filter(key => key !== undefined);
}

// Every link's href, as written.
export function linksIn(html) {
    return findTags(html, 'a').map(tag => tag.attrs.href).filter(href => href !== undefined);
}

function bodyProblems(item, knownPaths) {
    const where = item.file;
    const problems = unbalancedTags(item.body).map(problem => `${where}: ${problem}`);
    const tags = findTags(item.body);
    if (tags.some(tag => tag.name === 'h1')) problems.push(`${where}: <h1>: the page template already renders the name as the h1`);
    for (const name of NOT_IN_BODY) {
        if (tags.some(tag => tag.name === name)) problems.push(`${where}: <${name}> doesn't belong in a Web Page body`);
    }
    for (const tag of tags) {
        for (const attribute of Object.keys(tag.attrs).filter(key => key === 'style' || key.startsWith('on'))) {
            problems.push(`${where}: ${attribute}= attribute on <${tag.name}>: styles live in the theme, scripts in Script Manager`);
        }
    }
    for (const href of linksIn(item.body)) {
        if (/^mailto:/i.test(href)) {
            problems.push(`${where}: a mailto link: no email address is published until the role address exists (decision 11)`);
        } else if (href.startsWith('/')) {
            const bare = href.replace(/[?#].*$/, '');
            if (!knownPaths.includes(bare)) problems.push(`${where} links to ${href}, which isn't one of these pages, ${OTHER_PATHS.join(' or ')}`);
        } else if (!/^https:\/\/[^/]+/.test(href) && !/^tel:\+\d+$/.test(href)) {
            problems.push(`${where} links to ${href}: a link is a path here, an https:// address or tel:+<digits>`);
        }
    }
    return problems;
}

function markerProblems(item) {
    const where = item.file;
    const problems = [];
    const markers = draftMarkers(item.body);
    const forShaun = Array.isArray(item.forShaun) ? item.forShaun : [];
    if (!Array.isArray(item.forShaun)) problems.push(`${where}: forShaun must be a list (empty when nothing waits)`);
    forShaun.forEach((entry, index) => {
        if (!isObject(entry) || typeof entry.question !== 'string' || !entry.question.trim()) problems.push(`${where}: forShaun entry ${index + 1} has no question`);
    });
    if (item.status === 'approved') {
        if (!isObject(item.approved) || !item.approved.by || !/^\d{4}-\d{2}-\d{2}$/.test(item.approved.date || '')) {
            problems.push(`${where}: an approved page needs approved.by and approved.date (YYYY-MM-DD)`);
        }
        if (markers.length) problems.push(`${where}: an approved page still carries DRAFT markers (${[...new Set(markers)].join(', ')})`);
        if (forShaun.length) problems.push(`${where}: an approved page still has forShaun entries`);
        return problems;
    }
    if (item.approved) problems.push(`${where}: a draft page has an approval: set status to "approved" with it`);
    const [first] = findTags(item.body);
    if (!item.body.trim().startsWith('<p') || first?.name !== 'p' || first.attrs['data-rf-draft'] !== 'page') {
        problems.push(`${where}: a draft page must open with the DRAFT banner, <p class="rf-draft" data-rf-draft="page">`);
    }
    const keys = forShaun.map(entry => entry?.key).filter(Boolean);
    const inBody = new Set(markers.filter(key => key !== 'page'));
    for (const key of inBody) if (!keys.includes(key)) problems.push(`${where}: marker "${key}" has no forShaun entry`);
    for (const key of keys) if (!inBody.has(key)) problems.push(`${where}: forShaun "${key}" has no marker in the body`);
    return problems;
}

function entryProblems(item, index) {
    const where = item.file || `page ${index + 1}`;
    const problems = [];
    if (typeof item.name !== 'string' || !item.name.trim()) problems.push(`${where}: no name`);
    if (!TYPES.includes(item.type)) problems.push(`${where}: type ${JSON.stringify(item.type)} isn't ${TYPES.join(' or ')}`);
    if (typeof item.url !== 'string' || !URL_PATH.test(item.url)) problems.push(`${where}: url ${JSON.stringify(item.url)} isn't a lower-case path like /shipping-returns/`);
    if (typeof item.is_visible !== 'boolean') problems.push(`${where}: is_visible must be true or false`);
    if (!Number.isInteger(item.sort_order) || item.sort_order < 0) problems.push(`${where}: sort_order must be a whole number`);
    if (typeof item.meta_description !== 'string' || !item.meta_description.trim()) {
        problems.push(`${where}: no meta_description`);
    } else if (item.meta_description.length > 160) {
        problems.push(`${where}: meta_description is ${item.meta_description.length} characters; keep it to 160`);
    }
    if (!STATUSES.includes(item.status)) problems.push(`${where}: status ${JSON.stringify(item.status)} isn't ${STATUSES.join(' or ')}`);
    const { path: from } = item;
    if (!isObject(from) || !['live', 'new'].includes(from.kind)) {
        problems.push(`${where}: path.kind must be "live" (the live .ca path, with its evidence) or "new" (with its reason)`);
    } else if (from.kind === 'live') {
        if (from.live !== item.url) problems.push(`${where}: its live path ${from.live} isn't its url ${item.url}: a changed path needs a row in refactor 09's Redirect map`);
        if (!from.evidence) problems.push(`${where}: a live path needs its evidence`);
    } else if (!from.reason) {
        problems.push(`${where}: a new path needs its reason`);
    }
    if (item.type === 'contact_form') {
        const fields = typeof item.contact_fields === 'string' ? item.contact_fields.split(',') : [];
        if (!fields.length) problems.push(`${where}: a contact form lists its contact_fields`);
        for (const field of fields) if (!CONTACT_FIELDS.includes(field)) problems.push(`${where}: contact_fields "${field}" isn't one of ${CONTACT_FIELDS.join(', ')}`);
    } else if ('contact_fields' in item) {
        problems.push(`${where}: only a contact form has contact_fields`);
    }
    return problems;
}

// Every way the sources break the format, or an empty list.
export function pageProblems(site) {
    const problems = [];
    if (site.channel_id !== CHANNEL) problems.push(`pages.json: channel_id ${site.channel_id} isn't ${CHANNEL}: these sources are ReelFlies_CA's`);
    const folder = path.basename(site.dir || '');
    if (folder !== String(CHANNEL)) problems.push(`the folder ${site.dir} isn't ${CHANNEL}'s: content/pages/<channel>/ names the channel its pages are written to`);
    const pages = site.pages || [];
    const knownPaths = [...pages.map(item => item.url), ...OTHER_PATHS];
    for (const field of ['url', 'name']) {
        const seen = new Set();
        for (const item of pages) {
            const value = item[field];
            if (seen.has(value)) problems.push(field === 'url' ? `url ${value} is used twice` : `name "${value}" is used twice`);
            seen.add(value);
        }
    }
    pages.forEach((item, index) => {
        problems.push(...entryProblems(item, index));
        if (typeof item.body !== 'string') {
            problems.push(`${item.file}: no body`);
            return;
        }
        problems.push(...bodyProblems(item, knownPaths), ...markerProblems(item));
        // The entry's own fields (the meta description, forShaun) count as well as the body.
        const entry = JSON.stringify({ ...item, body: undefined });
        const text = `${entry}\n${textOf(item.body)}`;
        if (EMAIL.test(text)) problems.push(`${item.file}: an email address: none is published until the role address exists (decision 11)`);
        if (FLY_ONLY.test(text)) problems.push(`${item.file}: "fly-only": say "fly orders (fly boxes and gear not included)" (UX-12)`);
        if (/hasMerchantReturnPolicy/i.test(`${entry}\n${item.body}`)) problems.push(`${item.file}: hasMerchantReturnPolicy stays out until Shaun confirms a policy (decision 10)`);
    });
    const { newsletter } = site;
    if (!isObject(newsletter) || !newsletter.line || !newsletter.consent) {
        problems.push('newsletter.json: needs the line and the consent wording');
    } else {
        if (!STATUSES.includes(newsletter.status)) problems.push(`newsletter.json: status ${JSON.stringify(newsletter.status)} isn't ${STATUSES.join(' or ')}`);
        if (EMAIL.test(JSON.stringify(newsletter))) problems.push('newsletter.json: an email address: none is published until the role address exists (decision 11)');
        if (FLY_ONLY.test(JSON.stringify(newsletter))) problems.push('newsletter.json: "fly-only" (UX-12)');
    }
    return problems;
}

// The sources in `dir` (relative to the repo root, or absolute), with each body read in.
export function readPages(dir = PAGES_DIR) {
    const full = path.resolve(ROOT, dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(full, 'pages.json'), 'utf8'));
    const pages = manifest.pages.map(item => {
        const file = path.join(full, item.file);
        return { ...item, body: fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined };
    });
    const newsletter = JSON.parse(fs.readFileSync(path.join(full, 'newsletter.json'), 'utf8'));
    return {
        channel_id: manifest.channel_id, dir: path.relative(ROOT, full) || dir, pages, newsletter,
    };
}

// A url as a path: its host and query gone, with one trailing slash.
const pathOf = url => `${String(url).replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '')}/`;

// The requests for scripts/store/plan.mjs: a PUT for each page the channel already has at the
// same url (from `existing`, the channel's GET /v3/content/pages read), then one POST that
// creates the rest. Every body carries channel_id 1895766.
export function pagesToRequests(site, existing = []) {
    const read = Array.isArray(existing) ? existing : existing?.data ?? [];
    for (const item of read) {
        if (item.channel_id !== CHANNEL) throw new Error(`the pages read names channel ${item.channel_id}, not ${CHANNEL}: read them with channel_id=${CHANNEL}`);
    }
    const byPath = new Map(read.map(item => [pathOf(item.url), item]));
    const bodyOf = item => Object.fromEntries([...SENT.filter(key => key in item).map(key => [key, item[key]]), ['channel_id', CHANNEL]]);
    const updates = [];
    const creates = [];
    for (const item of site.pages) {
        const found = byPath.get(pathOf(item.url));
        if (found) {
            updates.push({ method: 'PUT', path: `/v3/content/pages/${found.id}`, body: bodyOf(item) });
        } else {
            creates.push(bodyOf(item));
        }
    }
    return [...updates, ...(creates.length ? [{ method: 'POST', path: '/v3/content/pages', body: creates }] : [])];
}

function main(argv) {
    const args = { changes: null, existing: null, dir: PAGES_DIR };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--changes') args.changes = argv[++i];
        else if (argv[i] === '--existing') args.existing = argv[++i];
        else if (argv[i] === '--dir') args.dir = argv[++i];
        else throw new Error(`unknown argument ${argv[i]} (--changes <out.json>, --existing <read.json>, --dir <folder>)`);
    }
    const site = readPages(args.dir);
    const problems = pageProblems(site);
    for (const item of site.pages) {
        console.log(`${item.status.toUpperCase().padEnd(8)} ${item.url.padEnd(20)} ${item.name} (${item.type})`);
        for (const entry of item.forShaun || []) console.log(`         for Shaun${entry.key ? ` [${entry.key}]` : ''}: ${entry.question}`);
    }
    console.log(`${String(site.newsletter.status).toUpperCase().padEnd(8)} newsletter.json      the CASL newsletter wording (tickets 24 and 50)`);
    for (const entry of site.newsletter.forShaun || []) console.log(`         for Shaun: ${entry.question}`);
    if (problems.length) {
        problems.forEach(problem => console.log(`PROBLEM  ${problem}`));
        process.exitCode = 1;
        return;
    }
    console.log(`ok       ${site.pages.length} pages for channel ${CHANNEL}, no problems`);
    if (args.changes) {
        const existing = args.existing ? JSON.parse(fs.readFileSync(args.existing, 'utf8')) : [];
        const requests = pagesToRequests(site, existing);
        fs.writeFileSync(args.changes, `${JSON.stringify(requests, null, 2)}\n`);
        console.log(`wrote    ${args.changes}: ${requests.map(request => `${request.method} ${request.path}`).join(', ')}`);
        // plan.mjs reads a changes file only from the main clone, a worktree or ~/reelflies/store-snapshots/.
        console.log(`next     node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 22 --changes ${args.changes}`);
    }
}

if (isMain(import.meta.url)) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`ERROR    ${error.message}`);
        process.exitCode = 1;
    }
}
