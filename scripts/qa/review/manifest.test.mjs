// The screenshot manifest (scripts/qa/review/manifest.mjs; W0-10): every screenshot run
// records what it shot in scripts/qa/results/manifest.json, which the review-page
// generator reads.
//
//   node --test scripts/qa/review/manifest.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MANIFEST_VERSION, SHOT_ANNOTATION, entriesFromResult, entryKey, mergeManifest, readManifest,
    shotAnnotation, themeShot, writeManifest,
} from './manifest.mjs';

const home375 = {
    kind: 'theme',
    page: 'home',
    path: '/',
    project: 'phone-375',
    width: 375,
    channel: '1895766',
    variation: 'ReelFlies CA',
    overlay: null,
    state: null,
    baseline: 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png',
    reference: 'home',
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rf-manifest-'));

describe('a theme shot', () => {
    const testInfo = { project: { name: 'phone-375', use: { viewport: { width: 375, height: 812 } } } };

    it('records the page, width, channel, variation, overlay or state, baseline and reference anchor', () => {
        const entry = themeShot({
            template: 'home', pagePath: '/', baseline: path.resolve('scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png'), testInfo, channel: '1895766', variation: 'ReelFlies CA',
        });
        assert.deepEqual(entry, home375);
    });

    it('names no reference screen for a template the reference doesn\'t draw', () => {
        const entry = themeShot({
            template: '404', pagePath: '/rf-qa-missing-page/', baseline: path.resolve('scripts/qa/baselines/x/404.png'), testInfo, channel: '1895766', variation: 'ReelFlies CA',
        });
        assert.equal(entry.reference, null);
    });

    it('maps the stock category template to the Fly Type reference screen', () => {
        const entry = themeShot({
            template: 'category', pagePath: '/flies/', baseline: path.resolve('b.png'), testInfo, channel: '1', variation: 'ReelFlies CA',
        });
        assert.equal(entry.reference, 'fly-type');
    });

    it('travels to the reporter as an annotation the HTML report can show', () => {
        const annotation = shotAnnotation(home375);
        assert.equal(annotation.type, SHOT_ANNOTATION);
        assert.deepEqual(JSON.parse(annotation.description), home375);
    });
});

describe('the entries a finished test leaves', () => {
    const result = (status, attachments = []) => ({
        status,
        annotations: [{ type: 'skip' }, shotAnnotation(home375)],
        attachments,
    });

    it('carry the test\'s status', () => {
        const [entry] = entriesFromResult(result('passed'));
        assert.equal(entry.status, 'passed');
        assert.equal(entry.actual, null);
        assert.equal(entry.page, 'home');
    });

    it('point at the actual render when the shot differs from its baseline', () => {
        const actual = path.resolve('scripts/qa/results/output/x/home-actual.png');
        const [entry] = entriesFromResult(result('failed', [
            { name: 'home-expected.png', path: path.resolve('expected.png'), contentType: 'image/png' },
            { name: 'home-actual.png', path: actual, contentType: 'image/png' },
        ]));
        assert.equal(entry.status, 'failed');
        assert.equal(entry.actual, actual);
    });

    it('ignore tests that shot nothing for the review', () => {
        assert.deepEqual(entriesFromResult({ status: 'passed', annotations: [], attachments: [] }), []);
    });
});

describe('merging a run into the manifest', () => {
    const now = '2026-10-06T12:00:00.000Z';

    it('keys an entry by kind, channel, variation, overlay, state, page and project', () => {
        assert.notEqual(entryKey(home375), entryKey({ ...home375, project: 'desktop-1280' }));
        assert.notEqual(entryKey(home375), entryKey({ ...home375, channel: '1' }));
        assert.notEqual(entryKey(home375), entryKey({ ...home375, overlay: 'rf_rise-off' }));
        assert.notEqual(entryKey(home375), entryKey({ ...home375, state: 'drawer-open' }));
        assert.notEqual(entryKey(home375), entryKey({ ...home375, variation: 'ReelFlies US' }));
        assert.equal(entryKey(home375), entryKey({ ...home375, status: 'failed' }));
        assert.notEqual(
            entryKey({ kind: 'reference', anchor: 'home', project: 'phone-375' }),
            entryKey({ kind: 'reference', anchor: 'cart', project: 'phone-375' }),
        );
    });

    it('replaces the same shot from an earlier run and keeps every other one', () => {
        const before = mergeManifest(null, [{ ...home375, status: 'failed' }, { ...home375, channel: '1', page: 'product' }], { now: '2026-10-05T00:00:00.000Z' });
        const after = mergeManifest(before, [{ ...home375, status: 'passed' }], { now });
        assert.equal(after.version, MANIFEST_VERSION);
        assert.equal(after.updated, now);
        assert.equal(after.entries.length, 2);
        assert.equal(after.entries.find(entry => entry.channel === '1895766').status, 'passed');
        assert.ok(after.entries.find(entry => entry.page === 'product'));
    });

    it('stamps each new entry with the run\'s time and commit', () => {
        const merged = mergeManifest(null, [home375], { now, commit: 'abc1234', dirty: true });
        assert.equal(merged.entries[0].ranAt, now);
        assert.equal(merged.entries[0].commit, 'abc1234');
        assert.equal(merged.entries[0].dirty, true);
    });

    it('sorts entries so the file diffs cleanly between runs', () => {
        const merged = mergeManifest(null, [{ ...home375, project: 'phone-375' }, { ...home375, project: 'desktop-1280' }, { ...home375, channel: '1' }], { now });
        assert.deepEqual(merged.entries.map(entryKey), merged.entries.map(entryKey).sort());
    });
});

describe('the manifest file', () => {
    it('reads as an empty manifest when no run has written it yet', () => {
        assert.deepEqual(readManifest(path.join(tmp(), 'manifest.json')).entries, []);
    });

    it('round-trips, and leaves no temporary file behind', () => {
        const dir = tmp();
        const file = path.join(dir, 'results', 'manifest.json');
        const manifest = mergeManifest(null, [home375], { now: '2026-10-06T12:00:00.000Z' });
        writeManifest(file, manifest);
        assert.deepEqual(readManifest(file), manifest);
        assert.deepEqual(fs.readdirSync(path.dirname(file)), ['manifest.json']);
    });

    it('names the file when it isn\'t a manifest', () => {
        const file = path.join(tmp(), 'manifest.json');
        fs.writeFileSync(file, '{"version": 99, "entries": []}');
        assert.throws(() => readManifest(file), new RegExp(`${file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}.*version 99`));
        fs.writeFileSync(file, 'not json');
        assert.throws(() => readManifest(file), /isn't valid JSON/);
    });
});
