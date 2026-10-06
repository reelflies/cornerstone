// Overlays (scripts/qa/overlays.mjs, W0-8): a JSON patch of config.json's settings, rendered
// by a stencil start in a throwaway git worktree, so the ticket's own checkout and every other
// run never see it.
//
// - An overlay file says what it renders and which settings it changes, and nothing else. A
//   setting config.json doesn't declare, or a value of another type, is refused: the render
//   would look unchanged and pass for the overlay.
// - The patch goes into the base settings and every variation's, with a marker setting the
//   gates read back from `?debug=context`.
// - The throwaway worktree holds this checkout's working tree as it is, uncommitted and
//   untracked changes included, with the overlay applied. Its node_modules,
//   secrets.stencil.json and config.stencil.json are links to this checkout's own (never
//   copies, and node_modules never the main clone's). Removing it leaves every link target as
//   it was.
// - It is refused from the main clone, whose node_modules the release's npm ci replaces
//   mid-run, and with QA_FRESH_SERVER=1 or QA_BASE_URL.
// - A worktree a stopped run left on the same port is removed first, whichever scratch folder
//   it is in, and a worktree on a branch never is.
//
// Each case works in a git repo of its own in the temp folder; the secrets file there is a
// stand-in, and nothing here reads the real one.
//
//   node --test scripts/qa/overlays.test.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    OVERLAY_MARKER, applyOverlay, createOverlayCheckout, isLinkedWorktree, listOverlays, overlayEnvProblem, overlayProblems,
    overlaysDir, readOverlay, validateOverlay,
} from './overlays.mjs';

const temps = [];
after(() => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const tempDir = prefix => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    temps.push(dir);
    return dir;
};

const git = (cwd, ...args) => {
    const result = spawnSync('git', args, {
        cwd,
        encoding: 'utf8',
        env: {
            ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
        },
    });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
};

const CONFIG = {
    name: 'Test',
    settings: { rf_rise: true, rf_menu_type_ids: '298,301', show_powered_by: true },
    variations: [
        { name: 'ReelFlies CA', settings: {} },
        { name: 'ReelFlies CA channel 1', settings: { rf_menu_type_ids: '12,13' } },
    ],
};
const OVERLAY = {
    name: 'rf_rise-off', description: 'The rise ring switched off (ticket 27)', ticket: '27', settings: { rf_rise: false },
};

// A main clone with one commit and a linked worktree of it, as the orchestrator makes them:
// npm ci'd node_modules of its own, and secrets.stencil.json and config.stencil.json links to
// the main clone's. Returns { main, checkout, scratch }.
function repo() {
    const base = tempDir('rf-overlay-repo-');
    const main = path.join(base, 'main');
    fs.mkdirSync(path.join(main, 'templates'), { recursive: true });
    git(main, 'init', '-q', '-b', 'master');
    fs.writeFileSync(path.join(main, 'config.json'), `${JSON.stringify(CONFIG, null, 4)}\n`);
    fs.writeFileSync(path.join(main, 'templates', 'page.html'), '<p>committed</p>\n');
    fs.writeFileSync(path.join(main, '.gitignore'), 'node_modules/\nsecrets.stencil.json\nconfig.stencil.json\nassets/dist\n');
    git(main, 'add', '-A');
    git(main, 'commit', '-q', '-m', 'first');
    fs.writeFileSync(path.join(main, 'secrets.stencil.json'), '{"accessToken": "stand-in, not a token"}\n');
    fs.writeFileSync(path.join(main, 'config.stencil.json'), `${JSON.stringify({
        normalStoreUrl: 'https://store.example',
        port: 3000,
        customLayouts: {
            brand: {}, category: {}, page: {}, product: {},
        },
    })}\n`);
    fs.mkdirSync(path.join(main, 'node_modules', '.bin'), { recursive: true });

    const checkout = path.join(base, 'w0-8');
    git(main, 'worktree', 'add', '-q', checkout, '-b', 'w0/8-test');
    fs.symlinkSync(path.join(main, 'secrets.stencil.json'), path.join(checkout, 'secrets.stencil.json'));
    fs.symlinkSync(path.join(main, 'config.stencil.json'), path.join(checkout, 'config.stencil.json'));
    fs.mkdirSync(path.join(checkout, 'node_modules', 'jquery'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'node_modules', 'jquery', 'index.js'), '// the checkout\'s own\n');
    return { main, checkout, scratch: tempDir('rf-overlay-scratch-') };
}

const registered = main => git(main, 'worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length));
const quiet = () => {};

describe('an overlay file', () => {
    it('says what it renders and patches settings, and nothing else', () => {
        assert.deepEqual(validateOverlay('rf_rise-off', { description: 'Off', ticket: '27', settings: { rf_rise: false } }), {
            name: 'rf_rise-off', description: 'Off', ticket: '27', settings: { rf_rise: false },
        });
    });

    it('is refused when it misspells a key, says nothing, changes nothing or has a name a baseline can\'t carry', () => {
        assert.throws(() => validateOverlay('x', { description: 'x', setings: { a: 1 } }), /unknown key "setings"/);
        assert.throws(() => validateOverlay('x', { settings: { a: 1 } }), /needs a "description"/);
        assert.throws(() => validateOverlay('x', { description: 'x', settings: {} }), /changes no setting/);
        assert.throws(() => validateOverlay('x', { description: 'x', settings: [] }), /changes no setting/);
        assert.throws(() => validateOverlay('rise off', { description: 'x', settings: { a: 1 } }), /isn't an overlay name/);
        assert.throws(() => validateOverlay('x', { description: 'x', settings: { [OVERLAY_MARKER]: 'y' } }), new RegExp(`sets ${OVERLAY_MARKER}`));
    });

    it('is read from scripts/qa/overlays/ by name, and an unknown name lists the ones there are', () => {
        assert.equal(readOverlay('rf_rise-off').name, 'rf_rise-off');
        assert.throws(() => readOverlay('rf-rise-off'), /isn't an overlay in scripts\/qa\/overlays\/ \(.*rf_rise-off.*\)/);
        assert.ok(listOverlays().includes('menu-ids-empty'));
    });

    it('reads overlays from RF_QA_OVERLAYS_DIR only under node --test', () => {
        assert.equal(overlaysDir({ RF_QA_OVERLAYS_DIR: '/tmp/x', NODE_TEST_CONTEXT: 'child' }), '/tmp/x');
        assert.throws(() => overlaysDir({ RF_QA_OVERLAYS_DIR: '/tmp/x' }), /test seam/);
    });
});

describe('applying an overlay to config.json', () => {
    it('refuses a setting config.json doesn\'t declare, because the render would look unchanged', () => {
        const problems = overlayProblems({ ...OVERLAY, settings: { rf_cart_state: false } }, CONFIG);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /config\.json declares no "rf_cart_state" setting/);
    });

    it('refuses a value of another type than the declared one', () => {
        assert.match(overlayProblems({ ...OVERLAY, settings: { rf_rise: 'false' } }, CONFIG)[0], /"rf_rise" is a boolean in config\.json, and the overlay rf_rise-off sets a string/);
        assert.deepEqual(overlayProblems(OVERLAY, CONFIG), []);
    });

    it('sets the values in the base settings and in every variation, and marks the render', () => {
        const patched = applyOverlay(CONFIG, { ...OVERLAY, settings: { rf_rise: false, rf_menu_type_ids: '' } });
        assert.equal(patched.settings.rf_rise, false);
        assert.equal(patched.settings.rf_menu_type_ids, '');
        assert.equal(patched.settings[OVERLAY_MARKER], 'rf_rise-off');
        for (const variation of patched.variations) {
            assert.equal(variation.settings.rf_rise, false, variation.name);
            assert.equal(variation.settings.rf_menu_type_ids, '', variation.name);
        }
        assert.equal(CONFIG.variations[1].settings.rf_menu_type_ids, '12,13', 'the input is left as it was');
        assert.equal(patched.settings.show_powered_by, true, 'the rest stays');
    });
});

describe('when an overlay may run', () => {
    it('never with QA_FRESH_SERVER=1, so a release never renders one', () => {
        assert.match(overlayEnvProblem({ QA_OVERLAY: 'rf_rise-off', QA_FRESH_SERVER: '1' }), /QA_FRESH_SERVER=1.*release never renders an overlay/);
    });

    it('never on QA_BASE_URL, whose config.json the overlay can\'t change', () => {
        assert.match(overlayEnvProblem({ QA_OVERLAY: 'rf_rise-off', QA_BASE_URL: 'https://prelaunch.example' }), /only a local stencil start/);
    });

    it('on a local stencil start, or not at all', () => {
        assert.equal(overlayEnvProblem({ QA_OVERLAY: 'rf_rise-off' }), null);
        assert.equal(overlayEnvProblem({ QA_FRESH_SERVER: '1' }), null);
    });
});

describe('the throwaway worktree', () => {
    it('holds the checkout\'s working tree with the overlay applied, uncommitted and untracked changes included', () => {
        const { main, checkout, scratch } = repo();
        fs.writeFileSync(path.join(checkout, 'templates', 'page.html'), '<p>uncommitted</p>\n');
        fs.writeFileSync(path.join(checkout, 'templates', 'new.html'), '<p>untracked</p>\n');
        const run = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        });
        try {
            assert.ok(run.dir.startsWith(`${scratch}${path.sep}rf-qa-overlay-3410-rf_rise-off-`), run.dir);
            assert.equal(fs.readFileSync(path.join(run.dir, 'templates', 'page.html'), 'utf8'), '<p>uncommitted</p>\n');
            assert.equal(fs.readFileSync(path.join(run.dir, 'templates', 'new.html'), 'utf8'), '<p>untracked</p>\n');
            const config = JSON.parse(fs.readFileSync(path.join(run.dir, 'config.json'), 'utf8'));
            assert.equal(config.settings.rf_rise, false);
            assert.equal(config.settings[OVERLAY_MARKER], 'rf_rise-off');
            assert.ok(registered(main).includes(run.dir), 'a git worktree of the same repo');
            const status = git(checkout, 'status', '--porcelain', '--', 'templates').split('\n').map(line => line.trim()).sort();
            assert.deepEqual(status, ['?? templates/new.html', 'M templates/page.html'], 'the checkout\'s changes are as they were');
            assert.equal(git(checkout, 'diff', '--cached', '--name-only'), '', 'nothing is staged in the checkout');
            assert.equal(git(checkout, 'rev-parse', 'HEAD'), git(main, 'rev-parse', 'w0/8-test'), 'its branch hasn\'t moved');
            assert.equal(fs.readFileSync(path.join(checkout, 'config.json'), 'utf8'), `${JSON.stringify(CONFIG, null, 4)}\n`, 'the checkout\'s config.json is untouched');
        } finally {
            run.remove();
        }
    });

    it('links node_modules, secrets.stencil.json and config.stencil.json to the checkout\'s own, never copying them', () => {
        const { checkout, scratch } = repo();
        const run = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        });
        try {
            for (const name of ['node_modules', 'secrets.stencil.json', 'config.stencil.json']) {
                assert.ok(fs.lstatSync(path.join(run.dir, name)).isSymbolicLink(), `${name} is a link`);
                assert.equal(fs.readlinkSync(path.join(run.dir, name)), path.join(checkout, name), `${name} links to the checkout's, never the main clone's`);
            }
        } finally {
            run.remove();
        }
    });

    it('is removed with its links, leaving what they point at and the checkout as they were', () => {
        const { main, checkout, scratch } = repo();
        const run = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        });
        fs.mkdirSync(path.join(run.dir, 'assets', 'dist'), { recursive: true });
        fs.writeFileSync(path.join(run.dir, 'assets', 'dist', 'theme-bundle.main.js'), '// a dev build\n');
        run.remove();
        run.remove(); // twice is harmless
        assert.ok(!fs.existsSync(run.dir));
        assert.ok(!registered(main).includes(run.dir), 'no longer a worktree');
        assert.equal(fs.readFileSync(path.join(checkout, 'node_modules', 'jquery', 'index.js'), 'utf8'), '// the checkout\'s own\n');
        for (const name of ['secrets.stencil.json', 'config.stencil.json']) {
            assert.ok(fs.existsSync(path.join(main, name)), `the main clone's ${name}`);
            assert.ok(fs.lstatSync(path.join(checkout, name)).isSymbolicLink(), `the checkout's ${name} link`);
        }
    });

    it('removes a worktree a stopped run left on the same port first, and leaves other ports\' alone', () => {
        const { main, checkout, scratch } = repo();
        const left = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        });
        const other = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3510, scratch, log: quiet,
        });
        const lines = [];
        const run = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: line => lines.push(line),
        });
        try {
            assert.ok(!fs.existsSync(left.dir), 'the stopped run\'s worktree is gone');
            assert.ok(!registered(main).includes(left.dir));
            assert.ok(fs.existsSync(other.dir), 'another port\'s is kept');
            assert.ok(lines.some(line => line.startsWith('STALE') && line.includes(left.dir)), lines.join('\n'));
        } finally {
            run.remove();
            other.remove();
        }
    });

    // Each agent may point QA_SCRATCH_DIR at a scratch folder of its own, so a worktree a killed
    // run left is found wherever it is: by its name among the repo's worktrees.
    it('removes a worktree a stopped run left on the same port in another scratch folder', () => {
        const { main, checkout, scratch } = repo();
        const left = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch: tempDir('rf-overlay-other-scratch-'), log: quiet,
        });
        const lines = [];
        const run = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: line => lines.push(line),
        });
        try {
            assert.ok(!fs.existsSync(left.dir), 'the stopped run\'s worktree is gone');
            assert.ok(!registered(main).includes(left.dir), 'and no longer registered');
            assert.ok(lines.some(line => line.startsWith('STALE') && line.includes(left.dir)), lines.join('\n'));
        } finally {
            run.remove();
        }
    });

    it('never removes a worktree on a branch, whatever its folder is called', () => {
        const { main, checkout, scratch } = repo();
        const named = path.join(tempDir('rf-overlay-named-'), 'rf-qa-overlay-3410-rf_rise-off-not-an-overlay');
        git(main, 'worktree', 'add', '-q', named, '-b', 'w0/9-named-like-an-overlay');
        const run = createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        });
        try {
            assert.ok(fs.existsSync(named), 'its folder is kept');
            assert.ok(registered(main).includes(named), 'and still registered');
        } finally {
            run.remove();
            git(main, 'worktree', 'remove', '--force', named);
        }
    });

    it('is refused from the main clone, whose node_modules the release\'s npm ci replaces mid-run', () => {
        const { main, scratch } = repo();
        assert.equal(isLinkedWorktree(main), false);
        assert.throws(() => createOverlayCheckout({
            checkout: main, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        }), /from a ticket's worktree, never from the main clone/);
    });

    it('is refused when the checkout\'s node_modules isn\'t its own', () => {
        const { main, checkout, scratch } = repo();
        fs.rmSync(path.join(checkout, 'node_modules'), { recursive: true });
        assert.throws(() => createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        }), /has no node_modules/);
        fs.symlinkSync(path.join(main, 'node_modules'), path.join(checkout, 'node_modules'));
        assert.throws(() => createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        }), /node_modules is outside it/);
    });

    it('is refused when the checkout has no secrets.stencil.json or config.stencil.json', () => {
        const { checkout, scratch } = repo();
        fs.rmSync(path.join(checkout, 'secrets.stencil.json'));
        assert.throws(() => createOverlayCheckout({
            checkout, overlay: OVERLAY, port: 3410, scratch, log: quiet,
        }), /has no secrets\.stencil\.json/);
        const second = repo();
        fs.rmSync(path.join(second.checkout, 'config.stencil.json'));
        assert.throws(() => createOverlayCheckout({
            checkout: second.checkout, overlay: OVERLAY, port: 3410, scratch: second.scratch, log: quiet,
        }), /has no config\.stencil\.json/);
    });

    it('is refused, before anything is made, when config.json doesn\'t declare a setting the overlay changes', () => {
        const { main, checkout, scratch } = repo();
        assert.throws(() => createOverlayCheckout({
            checkout, overlay: { ...OVERLAY, settings: { rf_quick_add: false } }, port: 3410, scratch, log: quiet,
        }), /declares no "rf_quick_add" setting/);
        assert.deepEqual(fs.readdirSync(scratch), []);
        assert.equal(registered(main).length, 2);
    });
});
