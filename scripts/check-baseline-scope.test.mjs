import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScope, parseBaselinePath, parseDeclaration } from './check-baseline-scope.mjs';

const B = 'scripts/qa/baselines';
const png = (set, name) => `${B}/${set}/${name}`;

// --- The Baselines: line ------------------------------------------------------------------

test('the Baselines line names page kinds, pins and overlays', () => {
    assert.deepEqual(parseDeclaration('What and why.\n\nBaselines: product, product@sold-out, overlay rf_rise-off\n'), {
        type: 'list',
        line: 'Baselines: product, product@sold-out, overlay rf_rise-off',
        items: [
            { kind: 'product', pin: null, overlay: null },
            { kind: 'product', pin: 'sold-out', overlay: null },
            { kind: null, pin: null, overlay: 'rf_rise-off' },
        ],
    });
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
const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

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
