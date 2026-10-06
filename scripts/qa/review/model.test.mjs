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
// The pins the model checks shots against, fixed here so a change to scripts/qa/pages.mjs
// doesn't move these tests.
const PINNED = {
    1895766: { pages: { home: '/', 404: '/rf-qa-missing-page/' } },
    1: { pages: { product: '/p/', category: '/c/' } },
    1855224: { pages: { home: '/' } },
};
const model = (overrides = {}) => buildCheckpointModel({
    name: 'review-00', since: null, head: HEAD, manifest, changes: [], input: {}, generatedAt: '2026-10-06T12:00:00.000Z', pinned: PINNED, ...overrides,
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

    it('shows .com\'s review renders, which have no baselines, in section 5 beside the reference, and never as the live home page', () => {
        const comLive = (width, page = 'home') => ({
            kind: 'live', page, path: '/', project: width === 375 ? 'phone-375' : 'desktop-1280', width, channel: '1855224', variation: 'ReelFlies US', image: `scripts/qa/results/live/1855224-reelflies-us/${page}-${width}.png`, status: 'passed', commit: HEAD.sha,
        });
        const built = model({ manifest: { version: 1, entries: [...manifest.entries, comLive(375), comLive(1280)] } });
        assert.deepEqual(built.liveHome.shots, []);
        const [row] = built.com.templates;
        assert.equal(row.page, 'home');
        assert.equal(row.channelName, 'reelflies.com (local render)');
        assert.deepEqual(row.widths.map(({ theme: shot }) => shot.image.path), ['scripts/qa/results/live/1855224-reelflies-us/home-375.png', 'scripts/qa/results/live/1855224-reelflies-us/home-1280.png']);
        assert.deepEqual(row.widths[0].reference.image, { kind: 'file', path: 'scripts/qa/results/reference/home-phone-375.png' });
    });

    it('leaves out shots of pages that are no longer pinned, and says so', () => {
        const old = theme('1', 'old-category', 375);
        const built = model({ manifest: { version: 1, entries: [...manifest.entries, old, { ...old, commit: 'f00d' }] } });
        assert.ok(!built.templates.some(({ page }) => page === 'old-category'));
        assert.ok(built.notes.some(note => /no longer pins.*old-category/.test(note)), built.notes.join('\n'));
        assert.ok(!built.notes.some(note => /ran on f00d/.test(note)), built.notes.join('\n'));
    });

    it('says which reference screens weren\'t shot, and why, without failing anything', () => {
        const problem = 'the reference page has no #linksToggle control any more';
        const entries = [...manifest.entries.filter(({ kind, anchor }) => kind !== 'reference' || anchor !== 'home'),
            { ...reference('home', 375), image: null, problem }, { ...reference('home', 1280), image: null, problem }];
        const built = model({ manifest: { version: 1, entries } });
        assert.equal(built.templates[0].widths[0].reference, null);
        assert.ok(built.notes.some(note => note.includes('Home at 375 and 1280') && note.includes(problem)), built.notes.join('\n'));
    });

    it('calls a failed shot with no render a failure, not a mismatch, with its error', () => {
        const failed = theme('1895766', 'home', 375, { status: 'failed', actual: null, error: 'the home page / returned HTTP 502, not 200' });
        const { templates, notes } = model({ manifest: { version: 1, entries: [failed] } });
        assert.equal(templates[0].widths[0].theme.mismatch, false);
        assert.equal(templates[0].widths[0].theme.error, 'the home page / returned HTTP 502, not 200');
        assert.ok(notes.some(note => /home at 375 failed in the last run before its screenshot was compared: the home page \/ returned HTTP 502/.test(note)), notes.join('\n'));
        assert.ok(!notes.some(note => /didn't match/.test(note)), notes.join('\n'));
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

    it('groups changed baselines by ticket, with its wave', () => {
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

    // Epochs land on master and every open ticket rebases onto them and re-records its own
    // baselines (build pipeline 6.6), so one baseline often changes under a ticket, then an
    // epoch, then another ticket, inside one checkpoint.
    describe('when a ticket, an epoch and another ticket change the same baseline', () => {
        const T25 = 'a25'.padEnd(40, '0');
        const EPOCH = 'bbbbbbb'.padEnd(40, '0');
        const T27 = 'c27'.padEnd(40, '0');
        const sequence = change(HOME, 'M', [
            { sha: T27, subject: 'Build the shipping strip (ticket 27)', status: 'M' },
            { sha: EPOCH, subject: 'Re-baseline home after the hero widget', status: 'M' },
            { sha: T25, subject: 'Skin the header (ticket 25)', status: 'M' },
        ]);
        const built = model({
            since: 'review-00',
            changes: [sequence],
            input: { epochs: [{ commit: 'bbbbbbb', cause: 'The hero widget applied on 1895766 (ticket 46)' }], tickets: { 25: { wave: '1' }, 27: { wave: '2' } } },
        });
        const card = ticket => built.changes.groups.find(group => group.ticket === ticket).items[0];

        it('shows each change as its own before and after, filed under its owner', () => {
            assert.deepEqual(built.changes.groups.map(({ ticket, items }) => [ticket, items.length]), [['25', 1], ['27', 1]]);
            assert.deepEqual(built.changes.epochs.map(({ cause, items }) => [cause, items.length]), [['The hero widget applied on 1895766 (ticket 46)', 1]]);
        });

        it('chains the sides: the checkpoint to 25, 25 to the epoch, the epoch to the head', () => {
            const epoch = built.changes.epochs[0].items[0];
            assert.deepEqual([card('25').before, card('25').after], [{ kind: 'git', ref: 'review-00', path: HOME }, { kind: 'git', ref: T25, path: HOME }]);
            assert.deepEqual([epoch.before, epoch.after], [{ kind: 'git', ref: T25, path: HOME }, { kind: 'git', ref: EPOCH, path: HOME }]);
            assert.deepEqual([card('27').before, card('27').after], [{ kind: 'git', ref: EPOCH, path: HOME }, { kind: 'git', ref: 'HEAD', path: HOME }]);
            assert.deepEqual([card('25').beforeLabel, card('25').afterLabel], [null, T25.slice(0, 8)]);
            assert.deepEqual([card('27').beforeLabel, card('27').afterLabel], [EPOCH.slice(0, 8), null]);
            assert.deepEqual([card('25').part, card('27').part, epoch.part, epoch.parts], [1, 3, 2, 3]);
            assert.deepEqual(epoch.commits.map(({ sha }) => sha), [EPOCH]);
        });

        it('takes an epoch from a "Baselines: epoch <cause>" line in its commit message', () => {
            const declared = change(HOME, 'M', [
                { sha: T27, subject: 'Build the shipping strip (ticket 27)' },
                { sha: EPOCH, subject: 'Re-baseline the home page', body: 'Why.\n\nBaselines: epoch The aught rename (ticket 18)' },
            ]);
            const { changes: { epochs, groups } } = model({ since: 'review-00', changes: [declared] });
            assert.deepEqual(epochs.map(({ cause }) => cause), ['The aught rename (ticket 18)']);
            assert.deepEqual(groups.map(({ ticket }) => ticket), ['27']);
        });

        it('says when a listed epoch changed no baseline in the range', () => {
            const { notes } = model({ since: 'review-00', changes: [sequence], input: { epochs: [{ commit: 'ddd0000', cause: 'A Web Page' }] } });
            assert.ok(notes.some(note => /ddd0000.*A Web Page.*no baseline/.test(note)), notes.join('\n'));
        });
    });

    it('fills a missing first side when the baseline is new, and a missing last side when it was removed', () => {
        const added = change(CART, 'A', [{ sha: 'b2'.padEnd(40, '0'), subject: 'Restyle the cart (ticket 41)', status: 'M' }, { sha: 'b1'.padEnd(40, '0'), subject: 'Pin the cart (ticket 41)', status: 'A' }]);
        const removed = change(HOME, 'D', [{ sha: 'd2'.padEnd(40, '0'), subject: 'Drop the pin (ticket 30)', status: 'D' }, { sha: 'd1'.padEnd(40, '0'), subject: 'Restyle (ticket 25)', status: 'M' }]);
        const built = model({ since: 'review-00', changes: [added, removed] });
        const items = built.changes.groups.flatMap(group => group.items.map(item => [group.ticket, item.before?.ref ?? null, item.after?.ref ?? null]));
        assert.deepEqual(items, [['25', 'review-00', 'd1'.padEnd(40, '0')], ['30', 'd1'.padEnd(40, '0'), null], ['41', null, 'HEAD']]);
    });
});

describe('the tickets a checkpoint covers', () => {
    const merged = [
        {
            sha: '1'.repeat(40), pr: '20', title: 'Skin foundation', tickets: ['25'],
        },
        {
            sha: '2'.repeat(40), pr: '23', title: 'Lighthouse budgets', tickets: ['17'],
        },
        {
            sha: '3'.repeat(40), pr: '24', title: 'Review page fixes', tickets: ['W0-10'],
        },
        {
            sha: '4'.repeat(40), pr: '25', title: 'Release log', tickets: [],
        },
    ];

    it('list every PR merged since the last checkpoint, baselines or not, by ticket with its wave', () => {
        const built = model({ since: 'review-00', merged, input: { tickets: { 25: { wave: '1', title: 'Skin foundation' }, 17: { wave: '1' } } } });
        assert.equal(built.merged.count, 4);
        assert.deepEqual(built.merged.groups.map(({ ticket, wave, merges }) => [ticket, wave, merges.map(({ pr }) => pr)]), [
            ['W0-10', '0', ['24']], ['17', '1', ['23']], ['25', '1', ['20']], [null, null, ['25']],
        ]);
    });

    it('say which tickets the notes give no wave for', () => {
        const { notes } = model({
            since: 'review-00',
            merged,
            changes: [{
                path: 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png', status: 'M', commits: [{ sha: 'e'.repeat(40), subject: 'Strip (ticket 27)' }], before: { ref: 'review-00', path: 'x' }, after: { ref: 'HEAD', path: 'x' },
            }],
            input: { tickets: { 25: { wave: '1' } } },
        });
        const note = notes.find(text => /^No wave is given/.test(text));
        assert.match(note, /for tickets 17 and 27 in the checkpoint notes/);
        assert.doesNotMatch(note, /W0-10|\b25\b/);
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
