// The screenshot manifest, scripts/qa/results/manifest.json (W0-10): what every screenshot
// run shot, for the review-page generator (review.mjs).
//
// A spec describes each shot as an annotation on its test (shotAnnotation), and the
// manifest reporter (manifest-reporter.mjs) adds the test's status and writes them all
// once the run ends. Runs add up: a run replaces the entries it shot again (same entryKey)
// and keeps the rest, so `npm run qa:screens` and `QA_CHANNEL=1 npm run qa:screens` fill
// one manifest. scripts/qa/results/ is ignored by git.
//
// An entry:
//   kind       'theme' (a page baseline), 'reference' (a reference screen) or 'live' (a
//              review render with nothing hidden and no baseline: the live home page with
//              its widgets, and every page pinned for reelflies.com)
//   page, path the pinned page key and its path (theme, live)
//   anchor     the reference anchor (reference; reference.mjs)
//   project, width            the Playwright project and its viewport width
//   channel, variation        what rendered it (theme, live)
//   overlay, state            W0-8's overlay or UI state, or null
//   baseline   the baseline PNG, relative to the repo (theme)
//   image      the PNG shot, relative to the repo (reference, live); null for a reference
//              screen that couldn't be shot, with `problem` saying why
//   reference  the anchor of the reference screen it is compared with, or null (theme, live)
//   status     the test's status; actual: a copy of the render when it failed its baseline;
//              error: the first line of a failed test's error
//   ranAt, commit, dirty      when, and from which checkout state
//
// QA_MANIFEST names another manifest file, such as the host batch's in its results folder
// (prelaunch.mjs). Paths in it stay relative to the checkout that ran them. W0-8's overlay
// runs need none: only their stencil start runs in a throwaway worktree, and they record into
// the checkout's own manifest.

import fs from 'fs';
import path from 'path';
import { ROOT, referenceFor } from './reference.mjs';

export const MANIFEST_VERSION = 1;
export const MANIFEST = path.join(ROOT, 'scripts', 'qa', 'results', 'manifest.json');
export const SHOT_ANNOTATION = 'rf-review-shot';
export const manifestFile = (env = process.env) => (env.QA_MANIFEST ? path.resolve(env.QA_MANIFEST) : MANIFEST);
export const COM_CHANNEL = '1855224';

const relative = file => path.relative(ROOT, file).split(path.sep).join('/');

// The entry for one page baseline, from inside its screenshot test.
export function themeShot({
    template, pagePath, baseline, testInfo, channel, variation, overlay = null, state = null,
}) {
    return {
        kind: 'theme',
        page: template,
        path: pagePath,
        project: testInfo.project.name,
        width: testInfo.project.use.viewport.width,
        channel: String(channel),
        variation,
        overlay,
        state,
        baseline: relative(baseline),
        reference: referenceFor(template),
    };
}

// The entry for one review render (review-live.spec.mjs): the page as it renders, nothing
// hidden, compared with no baseline.
export function liveShot({
    template, pagePath, image, testInfo, channel, variation,
}) {
    return {
        kind: 'live',
        page: template,
        path: pagePath,
        project: testInfo.project.name,
        width: testInfo.project.use.viewport.width,
        channel: String(channel),
        variation,
        overlay: null,
        state: null,
        image: relative(image),
        reference: referenceFor(template),
    };
}

// The pages a channel's review renders cover: every pinned page on reelflies.com (section 5
// of a checkpoint page; .com has no baselines), and the home page elsewhere (section 6).
export const reviewRenderPages = (channel, pages) => (String(channel) === COM_CHANNEL
    ? Object.keys(pages)
    : Object.keys(pages).filter(template => template === 'home'));

export const shotAnnotation = entry => ({ type: SHOT_ANNOTATION, description: JSON.stringify(entry) });

// The first line of a failed test's error, for the review page's run notes: no colour codes,
// and nothing in `redact` (the preview cookie).
function firstErrorLine(result, redact) {
    const error = result.errors?.[0] || result.error;
    if (!error?.message) return null;
    let line = String(error.message).replace(/\u001b\[[0-9;]*m/g, '').split('\n').map(text => text.trim()).find(Boolean) || null; // eslint-disable-line no-control-regex
    for (const secret of redact.filter(Boolean)) line = line && line.split(secret).join('…');
    return line && line.length > 300 ? `${line.slice(0, 299)}…` : line;
}

// The entries a finished test leaves, from its annotations, with its status. A failed
// screenshot comparison attaches the render as "<name>-actual.png".
export function entriesFromResult(result, { redact = [] } = {}) {
    const actual = (result.attachments || []).find(({ name, path: file }) => file && /-actual\.png$/.test(name));
    const error = result.status === 'passed' ? null : firstErrorLine(result, redact);
    return (result.annotations || [])
        .filter(({ type }) => type === SHOT_ANNOTATION)
        .map(({ description }) => ({
            ...JSON.parse(description),
            status: result.status,
            actual: result.status === 'passed' ? null : (actual?.path || null),
            error,
        }));
}

export const entryKey = entry => [
    entry.kind, entry.channel ?? '', entry.variation ?? '', entry.overlay ?? '', entry.state ?? '', entry.page ?? entry.anchor ?? '', entry.project,
].join('|');

export const emptyManifest = () => ({ version: MANIFEST_VERSION, updated: null, entries: [] });

export function mergeManifest(manifest, entries, { now = new Date().toISOString(), commit = null, dirty = null } = {}) {
    const byKey = new Map((manifest?.entries || []).map(entry => [entryKey(entry), entry]));
    for (const entry of entries) {
        byKey.set(entryKey(entry), {
            ...entry, ranAt: now, commit, dirty,
        });
    }
    const sorted = [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : Number(a > b))).map(([, entry]) => entry);
    return { version: MANIFEST_VERSION, updated: now, entries: sorted };
}

export function readManifest(file = MANIFEST) {
    if (!fs.existsSync(file)) return emptyManifest();
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${file} isn't valid JSON (${error.message}); delete it and run the screenshots again`);
    }
    if (manifest?.version !== MANIFEST_VERSION || !Array.isArray(manifest.entries)) {
        throw new Error(`${file} isn't a version ${MANIFEST_VERSION} screenshot manifest (it says version ${manifest?.version}); delete it and run the screenshots again`);
    }
    return manifest;
}

// Written whole and renamed into place, so a reader never sees half a file.
export function writeManifest(file, manifest) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(temporary, file);
}
