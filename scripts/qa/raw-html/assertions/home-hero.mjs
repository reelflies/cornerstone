// The home page's hero in the server HTML (ticket 46; stories 11 and 70; spec seam 2): the photo
// is a real <img> with a srcset, sizes, width and height, the page's only fetchpriority="high"
// image; the H1 is the hero's heading; and both buttons are <a href> links.
//
// The hero is a widget (widgets/home-lead), placed on the store by scripts/widgets-sync.mjs, so
// whether the page must have it comes from the channel's file, widgets/home-lead/channels/
// <channel>.json, which records the placement once it is applied:
//
// - placement recorded and "active": the page must have the hero
// - placement recorded and "inactive" (unpublished, R12): the page must not have it
// - nothing recorded yet, or no file for the channel: the hero is checked if the page has it
//
// So the check follows the repo's record of the store, and a hero that went missing from the
// store, or an unpublish that didn't take, fails the run.

import fs from 'fs';
import path from 'path';
import { QA_CHANNEL, ROOT } from '../../storefront.mjs';
import { findTags, markupOnly } from '../html.mjs';

export const WIDGET = 'home-lead';
export const HERO_CLASS = 'rf-hero';
const WIDTHS = [320, 480, 640, 960, 1280, 1600];

// What the channel's file says about the hero: 'active', 'inactive', 'unplaced' or 'no-file'.
export function heroExpectation(channel = QA_CHANNEL, widgetsDir = path.join(ROOT, 'widgets')) {
    const file = path.join(widgetsDir, WIDGET, 'channels', `${channel}.json`);
    if (!fs.existsSync(file)) return 'no-file';
    const { placement, uuids } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!uuids || !uuids.placement) return 'unplaced';
    return placement.status === 'active' ? 'active' : 'inactive';
}

const classes = tag => (tag.attrs.class || '').split(/\s+/);

// The outer HTML of the first <div> with the class, counting nested divs, or null. Comments
// and the text of scripts and styles don't count, as for findTags.
export function heroHtml(source) {
    const html = markupOnly(source);
    const start = html.search(new RegExp(`<div\\b[^>]*\\bclass="(?:[^"]*\\s)?${HERO_CLASS}(?:\\s[^"]*)?"`));
    if (start === -1) return null;
    const tags = /<div\b[^>]*>|<\/div\s*>/gi;
    tags.lastIndex = start;
    let depth = 0;
    for (let match = tags.exec(html); match; match = tags.exec(html)) {
        depth += match[0][1] === '/' ? -1 : 1;
        if (depth === 0) return html.slice(start, tags.lastIndex);
    }
    return html.slice(start);
}

const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export function heroProblems(html, expectation) {
    const hero = heroHtml(html);
    const where = `widgets/${WIDGET}/channels/${QA_CHANNEL}.json`;
    if (!hero) {
        return expectation === 'active' ? [`${where} records the hero placed and active, and the home page has no .${HERO_CLASS}`] : [];
    }
    if (expectation === 'inactive') return [`${where} records the hero unpublished (inactive), and the home page still has it`];

    const problems = [];
    const images = findTags(hero, 'img');
    if (images.length !== 1) problems.push(`the hero has ${images.length} <img> elements, not 1`);
    const [img] = images;
    if (img) {
        const { attrs } = img;
        const listed = (attrs.srcset || '').split(',').map(item => item.trim().split(/\s+/)[1]).filter(Boolean);
        const missing = WIDTHS.filter(width => !listed.includes(`${width}w`));
        if (missing.length) problems.push(`the hero <img> srcset has no ${missing.map(width => `${width}w`).join(', ')}`);
        for (const name of ['sizes', 'width', 'height']) if (!attrs[name]) problems.push(`the hero <img> has no ${name}`);
        if (attrs.fetchpriority !== 'high') problems.push('the hero <img> isn\'t fetchpriority="high"');
        if (attrs.loading === 'lazy') problems.push('the hero <img> is lazy; it must load eagerly');
    }
    const high = findTags(html).filter(tag => (tag.attrs.fetchpriority || '').toLowerCase() === 'high');
    if (high.length !== 1) problems.push(`the page has ${high.length} fetchpriority="high" elements, not 1 (the hero's photo)`);
    const headings = [...hero.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map(([, body]) => text(body));
    if (headings.length !== 1 || !headings[0]) problems.push(`the hero has ${headings.length} <h1> with text, not 1`);
    const links = findTags(hero, 'a').filter(tag => classes(tag).some(name => name.startsWith('rf-hero__button')));
    const real = links.filter(tag => /^(\/|https?:\/\/)/.test(tag.attrs.href || ''));
    if (real.length !== 2) problems.push(`the hero has ${real.length} button links with a real href, not 2`);
    if (findTags(hero, 'button').length) problems.push('the hero has a <button>: its calls to action are links (UX-3)');
    return problems;
}

export default {
    id: 'home-hero',
    ticket: 46,
    description: 'the hero: a real <img> with srcset, sizes, width and height, the only fetchpriority="high"; the H1; two <a href> buttons (when widgets/home-lead records it placed)',
    pages: ['home'],
    check(page) {
        return heroProblems(page.html, heroExpectation());
    },
};
