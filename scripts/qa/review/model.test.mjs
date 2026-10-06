// What a review page holds (scripts/qa/review/model.mjs; W0-10), built from the screenshot
// manifest, the baselines git says changed, and the orchestrator's checkpoint notes.
//
//   node --test scripts/qa/review/model.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckpointModel, buildPrModel, validateInput } from './model.mjs';

const HEAD = {
    sha: 'e48d369a0000000000000000000000000000beef', short: 'e48d369a', branch: 'master', dirty: false,
};
const theme = (channel, page, width, extra = {}) => ({
    kind: 'theme',
    page,
    path: `/${page}/`,
    project: width === 375 ? 'phone-375' : 'desktop-1280',
    width,
    channel,
    variation: 'ReelFlies CA',
    overlay: null,
    state: null,
    baseline: `scripts/qa/baselines/${channel}-reelflies-ca/${page}-${width === 375 ? 'phone-375' : 'desktop-1280'}-darwin.png`,
    reference: { 404: null, category: 'fly-type' }[page] ?? (page === '404' ? null : page),
    status: 'passed',
    actual: null,
    commit: HEAD.sha,
    dirty: false,
    ...extra,
});
const reference = (anchor, width) => ({
    kind: 'reference',
    anchor,
    project: width === 375 ? 'phone-375' : 'desktop-1280',
    width,
    image: `scripts/qa/results/reference/${anchor}-${width === 375 ? 'phone-375' : 'desktop-1280'}.png`,
    status: 'passed',
});
const both = (make, ...args) => [make(...args, 375), make(...args, 1280)];
const manifest = {
    version: 1,
    entries: [
        ...both(theme, '1895766', 'home'),
        ...both(theme, '1895766', '404'),
        ...both(theme, '1', 'product'),
        ...both(theme, '1', 'category'),
        ...['home', 'fly-type', 'species', 'species-hub', 'hook-chart', 'product', 'cart', 'brand'].flatMap(anchor => both(reference, anchor)),
    ],
};
const model = (overrides = {}) => buildCheckpointModel({
    name: 'review-00', since: null, head: HEAD, manifest, changes: [], input: {}, generatedAt: '2026-10-06T12:00:00.000Z', ...overrides,
});

describe('a checkpoint page', () => {
    it('lists each template beside its reference screen, ReelFlies_CA first', () => {
        const { templates } = model();
        assert.deepEqual(templates.map(({ channel, page }) => `${channel} ${page}`), ['1895766 home', '1895766 404', '1 category', '1 product']);
        const home = templates[0];
        assert.equal(home.reference.id, 'home');
        assert.deepEqual(home.widths.map(({ width }) => width), [375, 1280]);
        assert.deepEqual(home.widths[0].theme.image, { kind: 'file', path: 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png' });
        assert.deepEqual(home.widths[0].reference.image, { kind: 'file', path: 'scripts/qa/results/reference/home-phone-375.png' });
    });

    it('says when a template has no reference screen', () => {
        const notFound = model().templates.find(({ page }) => page === '404');
        assert.equal(notFound.reference, null);
        assert.equal(notFound.widths[0].reference, null);
    });

    it('shows the stock category page beside the Fly Type reference screen', () => {
        assert.equal(model().templates.find(({ page }) => page === 'category').reference.id, 'fly-type');
    });

    it('lists the reference screens no template renders yet', () => {
        assert.deepEqual(model().referenceOnly.map(({ id }) => id), ['species', 'species-hub', 'hook-chart', 'cart', 'brand']);
    });

    it('shows today\'s render beside a baseline it no longer matches, and says so', () => {
        const failed = theme('1895766', 'home', 375, { status: 'failed', actual: 'scripts/qa/results/manifest-actual/home.png' });
        const { templates, notes } = model({ manifest: { version: 1, entries: [failed] } });
        assert.equal(templates[0].widths[0].theme.status, 'failed');
        assert.deepEqual(templates[0].widths[0].theme.actual, { kind: 'file', path: 'scripts/qa/results/manifest-actual/home.png' });
        assert.ok(notes.some(note => /home at 375 .*didn't match its baseline/.test(note)), notes.join('\n'));
    });

    it('warns about shots taken from another commit or a dirty checkout', () => {
        const stale = theme('1895766', 'home', 375, { commit: 'abc', dirty: true });
        const { notes } = model({ manifest: { version: 1, entries: [stale] } });
        assert.ok(notes.some(note => /ran on abc, not e48d369a/.test(note)), notes.join('\n'));
        assert.ok(notes.some(note => /uncommitted changes/.test(note)), notes.join('\n'));
    });

    it('warns when no reference screens were shot', () => {
        const { notes } = model({ manifest: { version: 1, entries: [theme('1895766', 'home', 375)] } });
        assert.ok(notes.some(note => /no reference screens/i.test(note)), notes.join('\n'));
    });

    it('puts .com renders and the live home page in their own sections', () => {
        const com = theme('1855224', 'home', 1280, { variation: 'ReelFlies US' });
        const live = {
            kind: 'live', page: 'home', path: '/', project: 'desktop-1280', width: 1280, channel: '1895766', variation: 'ReelFlies CA', image: 'scripts/qa/results/live/home.png', status: 'passed',
        };
        const built = model({ manifest: { version: 1, entries: [...manifest.entries, com, live] }, input: { com: { uuid: '58abad50-1111', commit: '5d0d0cb8' } } });
        assert.ok(!built.templates.some(({ channel }) => channel === '1855224'));
        assert.deepEqual(built.com.templates.map(({ page }) => page), ['home']);
        assert.equal(built.com.uuid, '58abad50-1111');
        assert.deepEqual(built.liveHome.shots.map(({ width }) => width), [1280]);
    });
});

describe('the before-and-after section', () => {
    const change = (path, status, commits, extra = {}) => ({
        path,
        status,
        commits,
        before: status === 'A' ? null : { ref: 'review-00', path },
        after: status === 'D' ? null : { ref: 'HEAD', path },
        ...extra,
    });
    const HOME = 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';
    const CART = 'scripts/qa/baselines/1895766-reelflies-ca/cart-desktop-1280-darwin.png';
    const PRODUCT = 'scripts/qa/baselines/1-reelflies-ca/product-phone-375-darwin.png';
    const changes = [
        change(HOME, 'M', [{ sha: 'aaa', subject: 'Skin the header (ticket 25)' }]),
        change(PRODUCT, 'M', [{ sha: 'bbb', subject: 'Size pills (ticket 37)' }, { sha: 'ccc', subject: 'Skin (ticket 25)' }]),
        change(CART, 'M', [{ sha: 'ddd1234', subject: 'Re-baseline epoch: hero widget' }]),
    ];

    it('is marked as the first checkpoint when there is nothing before it', () => {
        assert.equal(model().changes.first, true);
    });

    it('groups changed baselines by the ticket of their newest commit, with its wave', () => {
        const built = model({
            since: 'review-00', changes, input: { tickets: { 25: { wave: '1', title: 'Skin foundation' }, 37: { wave: '3' } } },
        });
        assert.equal(built.changes.first, false);
        assert.deepEqual(built.changes.groups.map(({ ticket, wave }) => [ticket, wave]), [['25', '1'], ['37', '3']]);
        const [item] = built.changes.groups[0].items;
        assert.equal(item.page, 'home');
        assert.equal(item.width, 375);
        assert.deepEqual(item.before, { kind: 'git', ref: 'review-00', path: HOME });
        assert.deepEqual(item.reference, { kind: 'file', path: 'scripts/qa/results/reference/home-phone-375.png' });
    });

    it('lists re-baseline epochs apart, with their cause', () => {
        const built = model({ since: 'review-00', changes, input: { epochs: [{ commit: 'ddd1234', cause: 'The hero widget applied on 1895766 (ticket 46)' }] } });
        assert.ok(!built.changes.groups.some(group => group.items.some(item => item.path === CART)));
        assert.deepEqual(built.changes.epochs.map(({ cause }) => cause), ['The hero widget applied on 1895766 (ticket 46)']);
        assert.equal(built.changes.epochs[0].items[0].path, CART);
    });

    it('treats a commit titled as an epoch as one even when the notes don\'t list it', () => {
        const built = model({ since: 'review-00', changes });
        assert.deepEqual(built.changes.epochs.map(({ cause }) => cause), ['Re-baseline epoch: hero widget']);
    });

    it('files a change whose commits name no ticket under "no ticket"', () => {
        const built = model({ since: 'review-00', changes: [change(HOME, 'M', [{ sha: 'eee', subject: 'Fix a typo' }])] });
        assert.deepEqual(built.changes.groups.map(({ ticket }) => ticket), [null]);
    });
});

describe('the orchestrator\'s checkpoint notes', () => {
    it('fill the "for Shaun", defaults and waiting sections, in order', () => {
        const built = model({
            input: {
                title: 'Wave 0: the stock before set',
                forShaun: { access: [{ what: 'The prelaunch preview cookie', why: 'Host runs', ticket: '11' }] },
                defaults: [{ ticket: 'W0-10', text: 'Reference screens use Onest' }],
                waiting: [{ ticket: '16', criterion: 'AC6', trigger: 'refactor 13 and 14' }],
            },
        });
        assert.equal(built.title, 'Wave 0: the stock before set');
        assert.equal(built.forShaun.access[0].ticket, '11');
        assert.deepEqual(built.forShaun.approvals, []);
        assert.equal(built.defaults[0].text, 'Reference screens use Onest');
        assert.equal(built.waiting[0].trigger, 'refactor 13 and 14');
    });

    it('are checked, so a typo doesn\'t quietly drop a section', () => {
        assert.deepEqual(validateInput({}), []);
        assert.deepEqual(validateInput({ defualts: [] }), ['unknown key "defualts"']);
        assert.deepEqual(validateInput({ defaults: {} }), ['"defaults" must be a list']);
        assert.deepEqual(validateInput({ forShaun: { approval: [] } }), ['unknown key "forShaun.approval"']);
        assert.deepEqual(validateInput({ waiting: [{ ticket: 16 }] }), []);
        assert.deepEqual(validateInput([]), ['the checkpoint notes must be a JSON object']);
    });
});

describe('a PR page', () => {
    it('holds each changed baseline before and after, beside its reference screen', () => {
        const pr = buildPrModel({
            pr: { label: 'PR #12', base: 'origin/master', mergeBase: 'abc' },
            head: HEAD,
            manifest,
            changes: [{
                path: 'scripts/qa/baselines/1-reelflies-ca/category-desktop-1280-darwin.png', status: 'M', commits: [], before: { ref: 'abc', path: 'x' }, after: { ref: null, path: 'x' },
            }],
            generatedAt: '2026-10-06T12:00:00.000Z',
        });
        assert.equal(pr.mode, 'pr');
        assert.equal(pr.items.length, 1);
        assert.equal(pr.items[0].page, 'category');
        assert.deepEqual(pr.items[0].after, { kind: 'file', path: 'x' });
        assert.deepEqual(pr.items[0].reference, { kind: 'file', path: 'scripts/qa/results/reference/fly-type-desktop-1280.png' });
    });
});
