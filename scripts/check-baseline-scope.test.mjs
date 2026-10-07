import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SELFTEST_WIDGETS_DIR, WIDGETS_DIR, checkScope, knownWidgets, parseBaselinePath, parseDeclaration,
} from './check-baseline-scope.mjs';
import { WIDGETS_DIR as RENDER_WIDGETS_DIR, widgetCases } from './qa/render/render.mjs';
import { SELFTEST_WIDGETS } from './qa/render/widget-page.mjs';
import { ROOT, slug } from './qa/storefront.mjs';

const B = 'scripts/qa/baselines';
const png = (set, name) => `${B}/${set}/${name}`;

// --- The Baselines: line ------------------------------------------------------------------

test('the Baselines line names page kinds, pins and overlays', () => {
    assert.deepEqual(parseDeclaration('What and why.\n\nBaselines: product, product@sold-out, overlay rf_rise-off\n'), {
        type: 'list',
        line: 'Baselines: product, product@sold-out, overlay rf_rise-off',
        items: [
            {
                kind: 'product', pin: null, overlay: null, widget: null,
            },
            {
                kind: 'product', pin: 'sold-out', overlay: null, widget: null,
            },
            {
                kind: null, pin: null, overlay: 'rf_rise-off', widget: null,
            },
        ],
    });
});

test('the Baselines line names widgets, several on one line, beside page kinds', () => {
    assert.deepEqual(parseDeclaration('Baselines: home, widget home-lead, widget rf-selftest').items, [
        {
            kind: 'home', pin: null, overlay: null, widget: null,
        },
        {
            kind: null, pin: null, overlay: null, widget: 'home-lead',
        },
        {
            kind: null, pin: null, overlay: null, widget: 'rf-selftest',
        },
    ]);
});

test('"none" and "epoch <cause>" stand alone', () => {
    assert.deepEqual(parseDeclaration('Baselines: none'), { type: 'none', line: 'Baselines: none' });
    assert.deepEqual(parseDeclaration('Baselines: epoch 18\'s apply renamed the aught sizes'), {
        type: 'epoch', line: 'Baselines: epoch 18\'s apply renamed the aught sizes', cause: '18\'s apply renamed the aught sizes',
    });
});

test('the line may be bold or a list item, and its label is matched at the start of a line only', () => {
    assert.equal(parseDeclaration('**Baselines:** home').type, 'list');
    assert.equal(parseDeclaration('- Baselines: none').type, 'none');
    assert.equal(parseDeclaration('  * **Baselines:** none').type, 'none');
    assert.equal(parseDeclaration('The PR body ends with a "Baselines:" line.'), null);
    assert.equal(parseDeclaration(''), null);
    assert.equal(parseDeclaration(null), null);
});

test('a malformed line is refused with its reason', () => {
    const bad = [
        ['Baselines:', /names nothing/],
        ['Baselines: epoch', /cause/],
        ['Baselines: none, home', /"none" stands alone/],
        ['Baselines: home, epoch store write', /"epoch" stands alone/],
        ['Baselines: Product Page', /"Product Page"/],
        ['Baselines: overlay', /overlay needs a name/],
        ['Baselines: home\n\nBaselines: cart', /more than one/],
        ['Baselines: widget', /widget needs its name/],
        ['Baselines: widget home-lead best-sellers', /one widget per item.*"widget home-lead, widget best-sellers"/],
        ['Baselines: widget home.lead', /"widget home\.lead": a widget's name is its folder/],
        ['Baselines: widget _shared', /widgets\/_shared\/ holds shared partials/],
        ['Baselines: widgets home-lead', /isn't a page kind, kind@pin, "overlay <name>" or "widget <name>"/],
    ];
    for (const [body, reason] of bad) assert.throws(() => parseDeclaration(body), reason, body);
});

// --- Baseline file names ------------------------------------------------------------------

test('a baseline name is <kind>[@pin][~state][+overlay]-<project>-<platform>.png in one set folder', () => {
    assert.deepEqual(parseBaselinePath(png('1895766-reelflies-ca', 'home-phone-375-darwin.png')), {
        set: '1895766-reelflies-ca', kind: 'home', pin: null, state: null, overlay: null, project: 'phone-375', platform: 'darwin',
    });
    assert.deepEqual(parseBaselinePath(png('1-reelflies-ca-channel-1', 'product@sold-out~drawer+rf_rise-off-desktop-1280-darwin.png')), {
        set: '1-reelflies-ca-channel-1', kind: 'product', pin: 'sold-out', state: 'drawer', overlay: 'rf_rise-off', project: 'desktop-1280', platform: 'darwin',
    });
    assert.equal(parseBaselinePath(png('1-reelflies-ca', 'species-hub-phone-375-linux.png')).kind, 'species-hub');
    assert.equal(parseBaselinePath(png('1-reelflies-ca', '404-phone-375-darwin.png')).kind, '404');
    assert.equal(parseBaselinePath(png('selftest', 'blocks-desktop-1280-darwin.png')).kind, 'blocks');
});

test('a name or folder outside that shape is unrecognised, never guessed', () => {
    assert.equal(parseBaselinePath(png('1-reelflies-ca/overlays/rf_rise-off', 'home-phone-375-darwin.png')), null);
    assert.equal(parseBaselinePath(`${B}/home-phone-375-darwin.png`), null);
    assert.equal(parseBaselinePath(png('1-reelflies-ca', 'home.png')), null);
    assert.equal(parseBaselinePath(png('1-reelflies-ca', 'Home-phone-375-darwin.png')), null);
});

// --- Widget shots (W0-9) ------------------------------------------------------------------

const widgetShot = (variation, name) => `${B}/widgets/${variation}/${name}`;

test('a widget shot is widgets/<variation>/<widget>-<case>-<project>-<platform>.png, read with the widgets that exist', () => {
    assert.deepEqual(parseBaselinePath(widgetShot('reelflies-ca', 'rf-selftest-default-phone-375-darwin.png'), { widgets: ['rf-selftest', 'home-lead'] }), {
        set: 'widgets',
        variation: 'reelflies-ca',
        shot: 'rf-selftest-default',
        owners: [{ widget: 'rf-selftest', case: 'default' }],
        project: 'phone-375',
        platform: 'darwin',
    });
    const hookSizes = parseBaselinePath(widgetShot('reelflies-ca-channel-1', 'hook-sizes-size-12-desktop-1280-darwin.png'), { widgets: ['hook-sizes'] });
    assert.deepEqual([hookSizes.variation, hookSizes.owners, hookSizes.project], ['reelflies-ca-channel-1', [{ widget: 'hook-sizes', case: 'size-12' }], 'desktop-1280']);
});

test('a widget shot names every widget it could belong to, and none when no widget has its name', () => {
    const file = widgetShot('reelflies-ca', 'rf-hero-banner-default-phone-375-darwin.png');
    assert.deepEqual(parseBaselinePath(file, { widgets: ['rf-hero', 'rf-hero-banner', 'rf-he'] }).owners, [
        { widget: 'rf-hero', case: 'banner-default' },
        { widget: 'rf-hero-banner', case: 'default' },
    ]);
    assert.deepEqual(parseBaselinePath(file, { widgets: ['home-lead'] }).owners, []);
    assert.deepEqual(parseBaselinePath(file).owners, [], 'with no widgets given, nothing owns it');
    assert.deepEqual(parseBaselinePath(widgetShot('reelflies-ca', 'rf-hero-phone-375-darwin.png'), { widgets: ['rf-hero'] }).owners, [], 'a shot names a fixture case after its widget');
    assert.deepEqual(parseBaselinePath(widgetShot('reelflies-ca', 'rf-hero--phone-375-darwin.png'), { widgets: ['rf-hero'] }).owners, [], 'an empty case is no case');
    assert.deepEqual(parseBaselinePath(widgetShot('reelflies-ca', 'RF-Hero-default-phone-375-darwin.png'), { widgets: ['rf-hero'] }).owners, [], 'a widget in another case is another name');
});

test('a widget shot outside that shape is unrecognised, and widgets/ holds nothing else', () => {
    const widgets = { widgets: ['rf-selftest'] };
    assert.equal(parseBaselinePath(png('widgets', 'rf-selftest-default-phone-375-darwin.png'), widgets), null, 'no variation folder');
    assert.equal(parseBaselinePath(png('widgets', 'home-phone-375-darwin.png'), widgets), null, 'widgets/ isn\'t a page set');
    assert.equal(parseBaselinePath(png('Widgets', 'home-phone-375-darwin.png'), widgets), null, 'nor in another case');
    assert.equal(parseBaselinePath(widgetShot('ReelFlies CA', 'rf-selftest-default-phone-375-darwin.png'), widgets), null, 'the variation folder is its slug');
    assert.equal(parseBaselinePath(widgetShot('reelflies-ca/x', 'rf-selftest-default-phone-375-darwin.png'), widgets), null);
    assert.equal(parseBaselinePath(widgetShot('reelflies-ca', 'rf-selftest-default.png'), widgets), null);
    assert.equal(parseBaselinePath(widgetShot('reelflies-ca', 'rf-selftest-default-phone-375-darwin.PNG'), widgets), null);
    assert.equal(parseBaselinePath(`${B}/Widgets/reelflies-ca/rf-selftest-default-phone-375-darwin.png`, widgets), null);
});

// --- The check ----------------------------------------------------------------------------

const HOME = png('1895766-reelflies-ca', 'home-phone-375-darwin.png');
const PRODUCT = png('1-reelflies-ca', 'product-desktop-1280-darwin.png');
const PRODUCT_DRAWER = png('1-reelflies-ca', 'product~drawer-phone-375-darwin.png');
const SOLD_OUT = png('1-reelflies-ca', 'product@sold-out-phone-375-darwin.png');
const HOME_OVERLAY = png('1895766-reelflies-ca', 'home+rf_rise-off-phone-375-darwin.png');
const PRODUCT_OVERLAY = png('1-reelflies-ca', 'product+rf_rise-off-phone-375-darwin.png');
const ODD = png('1-reelflies-ca/overlays/x', 'home-phone-375-darwin.png');

const outside = result => result.files.filter(file => !file.covered).map(file => file.file);

test('a PR that changes no baseline passes with or without the line', () => {
    assert.equal(checkScope({ body: 'No line here.', files: ['assets/js/app.js', 'meta/desktop_light.png'] }).ok, true);
    assert.equal(checkScope({ body: 'Baselines: none', files: ['assets/js/app.js'] }).ok, true);
});

test('a changed baseline with no Baselines line fails', () => {
    const result = checkScope({ body: 'What and why.', files: [HOME] });
    assert.equal(result.ok, false);
    assert.match(result.error, /no "Baselines:" line/);
});

test('"none" fails any changed baseline', () => {
    const result = checkScope({ body: 'Baselines: none', files: [HOME, 'assets/js/app.js'] });
    assert.equal(result.ok, false);
    assert.deepEqual(outside(result), [HOME]);
});

test('a kind covers its plain pin on every channel and in every UI state, but not other pins or overlays', () => {
    const result = checkScope({ body: 'Baselines: product', files: [PRODUCT, PRODUCT_DRAWER, SOLD_OUT, PRODUCT_OVERLAY, HOME] });
    assert.equal(result.ok, false);
    assert.deepEqual(outside(result), [SOLD_OUT, PRODUCT_OVERLAY, HOME]);
});

test('kind@pin covers that pin only, and an overlay covers every kind under it', () => {
    const result = checkScope({ body: 'Baselines: product@sold-out, overlay rf_rise-off', files: [SOLD_OUT, HOME_OVERLAY, PRODUCT_OVERLAY, PRODUCT] });
    assert.deepEqual(outside(result), [PRODUCT]);
    assert.equal(checkScope({ body: 'Baselines: product, product@sold-out, overlay rf_rise-off', files: [SOLD_OUT, HOME_OVERLAY, PRODUCT_OVERLAY, PRODUCT] }).ok, true);
});

test('an unrecognised baseline path fails unless the PR is a re-baseline epoch', () => {
    assert.deepEqual(outside(checkScope({ body: 'Baselines: home', files: [ODD] })), [ODD]);
    const epoch = checkScope({ body: 'Baselines: epoch live drift on channel 1 product page', files: [ODD, HOME, SOLD_OUT] });
    assert.equal(epoch.ok, true);
    assert.equal(epoch.declaration.type, 'epoch');
});

test('an epoch covers baselines only in a PR that changes nothing but baselines', () => {
    const mixed = checkScope({ body: 'Baselines: epoch 18\'s apply', files: [HOME, 'assets/js/theme/reelflies/header.js', 'scripts/qa/pages.mjs'] });
    assert.equal(mixed.ok, false);
    assert.match(mixed.error, /epoch.*change baselines only.*assets\/js\/theme\/reelflies\/header\.js, scripts\/qa\/pages\.mjs/);
    assert.deepEqual(outside(mixed), [HOME]);
    const codeOnly = checkScope({ body: 'Baselines: epoch nothing', files: ['assets/js/app.js'] });
    assert.equal(codeOnly.ok, false, 'an epoch line on a PR with no baseline is a misuse too');
});

test('a baseline path in another case still counts, and only an epoch covers it', () => {
    const upper = 'Scripts/QA/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';
    const shouting = png('1895766-reelflies-ca', 'home-phone-375-darwin.PNG');
    const none = checkScope({ body: 'Baselines: none', files: [upper, shouting] });
    assert.equal(none.ok, false);
    assert.deepEqual(outside(none), [upper, shouting]);
    assert.deepEqual(outside(checkScope({ body: 'Baselines: home', files: [upper, shouting] })), [upper, shouting]);
    assert.equal(checkScope({ body: 'Baselines: epoch case', files: [upper, shouting] }).ok, true);
});

const WIDGETS = ['home-lead', 'rf-hero', 'rf-hero-banner', 'rf-selftest'];
const SELFTEST_PHONE = widgetShot('reelflies-ca', 'rf-selftest-default-phone-375-darwin.png');
const SELFTEST_DESKTOP = widgetShot('reelflies-ca', 'rf-selftest-default-desktop-1280-darwin.png');
const SELFTEST_US = widgetShot('reelflies-us', 'rf-selftest-sold-out-phone-375-darwin.png');
const HOME_LEAD = widgetShot('reelflies-ca', 'home-lead-default-phone-375-darwin.png');
const HERO = widgetShot('reelflies-ca', 'rf-hero-default-phone-375-darwin.png');
const HERO_BANNER = widgetShot('reelflies-ca', 'rf-hero-banner-default-phone-375-darwin.png');
const reasonFor = (result, file) => result.files.find(each => each.file === file).reason;

test('"widget <name>" covers that widget\'s shots in every fixture case, width and variation, and no other widget\'s', () => {
    const result = checkScope({ body: 'Baselines: widget rf-selftest', files: [SELFTEST_PHONE, SELFTEST_DESKTOP, SELFTEST_US, HOME_LEAD], widgets: WIDGETS });
    assert.equal(result.ok, false);
    assert.deepEqual(outside(result), [HOME_LEAD]);
    assert.match(reasonFor(result, HOME_LEAD), /widget home-lead isn't declared/);
    assert.match(reasonFor(result, SELFTEST_US), /widget rf-selftest, fixture sold-out, variation reelflies-us/);
    assert.equal(checkScope({ body: 'Baselines: widget rf-selftest, widget home-lead', files: [SELFTEST_PHONE, SELFTEST_US, HOME_LEAD], widgets: WIDGETS }).ok, true);
});

test('page kinds, pins, overlays and "none" never cover a widget shot, and a widget never covers a page baseline', () => {
    for (const body of ['Baselines: home, rf-selftest, rf-selftest@default, overlay rf_rise-off', 'Baselines: none', 'What and why.']) {
        assert.deepEqual(outside(checkScope({ body, files: [SELFTEST_PHONE], widgets: WIDGETS })), [SELFTEST_PHONE], body);
    }
    assert.deepEqual(outside(checkScope({ body: 'Baselines: widget home, widget home-lead', files: [HOME, HOME_LEAD], widgets: WIDGETS })), [HOME]);
});

test('a shot two widgets could own is covered only when both are declared', () => {
    const one = checkScope({ body: 'Baselines: widget rf-hero', files: [HERO, HERO_BANNER], widgets: WIDGETS });
    assert.deepEqual(outside(one), [HERO_BANNER], 'rf-hero alone must not cover rf-hero-banner\'s shot');
    assert.match(reasonFor(one, HERO_BANNER), /widget rf-hero's banner-default or widget rf-hero-banner's default.*widget rf-hero-banner isn't declared/);
    const other = checkScope({ body: 'Baselines: widget rf-hero-banner', files: [HERO_BANNER], widgets: WIDGETS });
    assert.deepEqual(outside(other), [HERO_BANNER]);
    assert.match(reasonFor(other, HERO_BANNER), /widget rf-hero isn't declared/);
    assert.equal(checkScope({ body: 'Baselines: widget rf-hero, widget rf-hero-banner', files: [HERO, HERO_BANNER], widgets: WIDGETS }).ok, true);
});

test('a widget shot no widget owns, or in another shape, is covered only by an epoch', () => {
    const stray = widgetShot('reelflies-ca', 'gone-band-default-phone-375-darwin.png');
    const odd = png('widgets', 'rf-selftest-default-phone-375-darwin.png');
    const result = checkScope({ body: 'Baselines: widget gone-band, widget rf-selftest', files: [stray, odd], widgets: WIDGETS });
    assert.deepEqual(outside(result), [stray, odd]);
    assert.match(reasonFor(result, stray), /no widget folder.*gone-band-default.*only an epoch covers it/);
    assert.equal(checkScope({ body: 'Baselines: epoch the widget shots moved', files: [stray, odd, HOME_LEAD], widgets: WIDGETS }).ok, true);
});

// --- Which widgets exist ------------------------------------------------------------------

const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const tempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-scope-'));
    tempDirs.push(dir);
    return dir;
};

test('the widgets are the folders in widgets/ and the self-test folder, and any this PR adds or deletes', () => {
    const root = tempDir();
    for (const dir of ['widgets/home-lead/fixtures', 'widgets/_shared', 'scripts/qa/render/selftest/widgets/rf-selftest']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'widgets/README.md'), 'not a widget');
    const files = [
        'widgets/best-sellers/template.html', // added or deleted by the PR
        'Widgets/Signature-band/fixtures/default.json', // the Mac's file system ignores case
        'scripts/qa/render/selftest/widgets/rf-other/template.html',
        'widgets/_shared/product-card.html',
        'widgets/notes.md',
        'scripts/qa/baselines/widgets/reelflies-ca/x-default-phone-375-darwin.png',
    ];
    assert.deepEqual(knownWidgets(files, root), ['Signature-band', 'best-sellers', 'home-lead', 'rf-other', 'rf-selftest']);
    assert.deepEqual(knownWidgets([], tempDir()), [], 'a checkout with no widgets/ folder has none');
});

test('by default the check reads this checkout\'s widgets, and the widgets the PR\'s own files name', () => {
    assert.equal(checkScope({ body: 'Baselines: widget rf-selftest', files: [SELFTEST_PHONE, SELFTEST_DESKTOP] }).ok, true, 'the self-test widget is in this checkout');
    const added = widgetShot('reelflies-ca', 'brand-new-band-default-phone-375-darwin.png');
    const files = ['widgets/brand-new-band/template.html', 'widgets/brand-new-band/fixtures/default.json', added];
    assert.equal(checkScope({ body: 'Baselines: widget brand-new-band', files }).ok, true);
    const undeclared = checkScope({ body: 'Baselines: widget brand-new', files });
    assert.deepEqual(outside(undeclared), [added]);
    assert.match(reasonFor(undeclared, added), /widget brand-new-band isn't declared/);
});

// The shots W0-9 writes: widget-screens.spec.mjs's shotName, ['widgets', slug(variation),
// `${widget}-${case}.png`], through playwright.config.mjs's snapshotPathTemplate,
// '{testDir}/baselines/{arg}-{projectName}-{platform}{ext}', at its two projects.
const PROJECTS = ['phone-375', 'desktop-1280'];
const VARIATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).variations.map(variation => variation.name);

test('the check looks for widgets where the fixture renderer finds them', () => {
    assert.equal(path.resolve(ROOT, WIDGETS_DIR), RENDER_WIDGETS_DIR);
    assert.equal(path.resolve(ROOT, SELFTEST_WIDGETS_DIR), SELFTEST_WIDGETS);
});

test('every widget shot the spec takes, in every variation, is read as its own widget\'s and covered by "widget <name>"', () => {
    const cases = widgetCases([RENDER_WIDGETS_DIR, SELFTEST_WIDGETS]).filter(({ shot }) => shot);
    assert.ok(cases.some(({ widget }) => widget === 'rf-selftest'), 'the self-test widget has a shot');
    const widgets = knownWidgets();
    for (const variation of VARIATIONS) {
        for (const { widget, name } of cases) {
            for (const project of PROJECTS) {
                const file = `${B}/widgets/${slug(variation)}/${widget}-${name}-${project}-darwin.png`;
                const parsed = parseBaselinePath(file, { widgets });
                assert.ok(parsed, `${file} is a widget shot the check reads`);
                assert.deepEqual(parsed.owners, [{ widget, case: name }], file);
                assert.equal(parsed.project, project);
                assert.ok(checkScope({ body: `Baselines: widget ${widget}`, files: [file] }).ok, file);
            }
        }
    }
});

test('every committed widget baseline has one owner, and only its widget covers it', () => {
    const dir = path.join(ROOT, B, 'widgets');
    const committed = fs.readdirSync(dir, { recursive: true }).filter(name => name.endsWith('.png')).map(name => `${B}/widgets/${name.split(path.sep).join('/')}`);
    assert.ok(committed.length >= 2, 'the self-test widget\'s baselines are committed');
    for (const file of committed) {
        const { owners } = parseBaselinePath(file, { widgets: knownWidgets() }) ?? {};
        assert.equal(owners?.length, 1, `${file} has one owner`);
        assert.ok(checkScope({ body: `Baselines: widget ${owners[0].widget}`, files: [file] }).ok, file);
        assert.ok(!checkScope({ body: 'Baselines: home, product, overlay rf_rise-off', files: [file] }).ok, file);
    }
});

test('a malformed line fails the check with its reason', () => {
    const result = checkScope({ body: 'Baselines: none, home', files: [] });
    assert.equal(result.ok, false);
    assert.match(result.error, /"none" stands alone/);
});

test('only PNGs under scripts/qa/baselines/ count', () => {
    const result = checkScope({ body: 'Baselines: none', files: ['meta/mobile_light.png', `${B}/README.md`, 'scripts/qa/results/x.png'] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.files, []);
});

// --- The command, as CI runs it -----------------------------------------------------------

const SCRIPT = fileURLToPath(new URL('./check-baseline-scope.mjs', import.meta.url));

function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
}

// A repo with a base commit and a head commit that changes one baseline and deletes another.
function repo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-scope-'));
    tempDirs.push(dir);
    git(dir, 'init', '-q', '-b', 'master');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'test');
    const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
    };
    write(HOME, 'a');
    write(PRODUCT, 'b');
    write('README.md', 'x');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(HOME, 'changed');
    fs.rmSync(path.join(dir, PRODUCT));
    write('README.md', 'y');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'head');
    return { dir, base, head: git(dir, 'rev-parse', 'HEAD') };
}

const run = (cwd, args, body) => spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, PR_BODY: body },
});

test('the command diffs base...head, counts a deleted baseline, and fails outside the declared kinds', () => {
    const { dir, base, head } = repo();
    const fail = run(dir, ['--base', base, '--head', head], 'Baselines: home');
    assert.equal(fail.status, 1, fail.stdout + fail.stderr);
    assert.match(fail.stdout, /OUTSIDE\s+scripts\/qa\/baselines\/1-reelflies-ca\/product-desktop-1280-darwin\.png/);
    assert.match(fail.stdout, /ok\s+scripts\/qa\/baselines\/1895766-reelflies-ca\/home-phone-375-darwin\.png/);

    const pass = run(dir, ['--base', base, '--head', head], 'Baselines: home, product');
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /PASS/);
});

test('the command reads a changed widget shot as its widget\'s, from this checkout\'s widgets', () => {
    const { dir, base } = repo();
    fs.mkdirSync(path.dirname(path.join(dir, SELFTEST_PHONE)), { recursive: true });
    fs.writeFileSync(path.join(dir, SELFTEST_PHONE), 'a changed shot');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'widget');
    const head = git(dir, 'rev-parse', 'HEAD');

    const fail = run(dir, ['--base', base, '--head', head], 'Baselines: home, product, rf-selftest');
    assert.equal(fail.status, 1, fail.stdout + fail.stderr);
    assert.match(fail.stdout, /OUTSIDE\s+scripts\/qa\/baselines\/widgets\/reelflies-ca\/rf-selftest-default-phone-375-darwin\.png\s+\(widget rf-selftest isn't declared\)/);

    const pass = run(dir, ['--base', base, '--head', head], 'Baselines: home, product, widget rf-selftest');
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /ok\s+scripts\/qa\/baselines\/widgets\/reelflies-ca\/rf-selftest-default-phone-375-darwin\.png\s+\(widget rf-selftest, fixture default, variation reelflies-ca\)/);
});

test('the command reads the body from --body-file and the files from --files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-scope-'));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'body.md'), 'Baselines: none\n');
    fs.writeFileSync(path.join(dir, 'files.txt'), `${HOME}\nassets/js/app.js\n`);
    const result = spawnSync(process.execPath, [SCRIPT, '--body-file', path.join(dir, 'body.md'), '--files', path.join(dir, 'files.txt')], { encoding: 'utf8', env: { ...process.env, PR_BODY: '' } });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /OUTSIDE/);
});

test('the command refuses to run without a file list or a body source', () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, PR_BODY: '' } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--base and --head, or --files/);
});
