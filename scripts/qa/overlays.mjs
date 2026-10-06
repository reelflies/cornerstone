// Overlays (W0-8): a render of the storefront with some theme settings changed, such as a
// module switched off (rf_rise-off) or the menu ids emptied (menu-ids-empty), without a theme
// variation for each. stencil start reads only config.json, and a theme has at most four
// variations, three of them taken (CA, US and ticket 53's channel-1 variation).
//
//   QA_OVERLAY=rf_rise-off npm run qa:screens
//
// - An overlay is scripts/qa/overlays/<name>.json:
//     { "description": "what it renders (ticket NN)", "ticket": "NN", "settings": { "rf_rise": false } }
//   Its settings replace those values in config.json's base settings and in every variation's,
//   so the run renders them whatever QA_VARIATION is. A setting config.json doesn't declare,
//   or a value of another type, is refused: the render would look unchanged and pass for it.
// - It renders in a throwaway git worktree in the scratch folder (QA_SCRATCH_DIR, or the
//   system temp folder), never in the ticket's own checkout: createOverlayCheckout. The
//   worktree holds the checkout's working tree as it is, uncommitted and untracked changes
//   included, with the overlay applied and a marker setting (OVERLAY_MARKER) that the gates
//   read back from `?debug=context`. Its node_modules, secrets.stencil.json and
//   config.stencil.json are links to the checkout's own, never copies, and node_modules never
//   the main clone's, whose node_modules the release's `npm ci` replaces mid-run. Only stencil
//   start runs there:
//   Playwright, the specs, the baselines and the manifest stay in the ticket's checkout.
// - It takes a port pair of its own, QA_PORT + 10 (storefront.mjs), and its baselines carry
//   the overlay's name: <kind>[@pin][~state]+<overlay>-<project>-<platform>.png.
// - It is refused with QA_FRESH_SERVER=1, so a release never renders one, and on QA_BASE_URL.

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const OVERLAYS_DIR = fileURLToPath(new URL('overlays/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
// The same shape as an overlay in a baseline's name (check-baseline-scope.mjs).
export const OVERLAY_NAME = /^[A-Za-z0-9_-]+$/;
// An overlay run's ports: Browsersync on QA_PORT + 10, the stencil server on the next one.
export const OVERLAY_PORT_OFFSET = 10;
// The setting an overlay's config.json carries, so `?debug=context` says which overlay a
// server renders (theme_settings comes from the local config.json).
export const OVERLAY_MARKER = 'rf_qa_overlay';
const OVERLAY_KEYS = ['description', 'ticket', 'settings'];
// What an overlay worktree links to in the ticket's checkout. config.stencil.json too: the
// custom-layouts step before stencil start replaces the link with a copy if it must change it
// (custom-layouts.mjs), and stencil start itself never writes it.
const LINKED = ['node_modules', 'secrets.stencil.json', 'config.stencil.json'];
export const OVERLAY_PREFIX = 'rf-qa-overlay-';

const shown = dir => {
    const relative = path.relative(REPO_ROOT, dir);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? `${relative.split(path.sep).join('/')}/` : dir;
};

// The overlays folder. RF_QA_OVERLAYS_DIR moves it for the tests, and only under node --test,
// like RF_LOCK_ROOT: a real run renders only the committed overlays.
export function overlaysDir(env = process.env) {
    if (env.RF_QA_OVERLAYS_DIR) {
        if (!env.NODE_TEST_CONTEXT) throw new Error(`RF_QA_OVERLAYS_DIR is a test seam for node --test, and a real run renders only the overlays in scripts/qa/overlays/: unset it (it is ${env.RF_QA_OVERLAYS_DIR})`);
        return env.RF_QA_OVERLAYS_DIR;
    }
    return OVERLAYS_DIR;
}

// Where overlay worktrees go: QA_SCRATCH_DIR, or the system temp folder.
export const scratchDir = (env = process.env) => env.QA_SCRATCH_DIR || os.tmpdir();

export const listOverlays = (dir = overlaysDir()) => (fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(file => file.endsWith('.json')).map(file => file.slice(0, -'.json'.length)).sort()
    : []);

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const typeOf = value => {
    if (value === null) return 'null';
    return Array.isArray(value) ? 'array' : typeof value;
};

// The overlay `name` from its parsed file, or throws naming what is wrong with it.
export function validateOverlay(name, json) {
    if (!OVERLAY_NAME.test(String(name))) throw new Error(`"${name}" isn't an overlay name: letters, digits, _ and -, as a baseline's name carries it`);
    if (!isPlainObject(json)) throw new Error(`the overlay ${name} must be a JSON object`);
    const unknown = Object.keys(json).filter(key => !OVERLAY_KEYS.includes(key));
    if (unknown.length) throw new Error(`the overlay ${name} has an unknown key "${unknown[0]}" (it may have ${OVERLAY_KEYS.join(', ')})`);
    if (typeof json.description !== 'string' || !json.description.trim()) throw new Error(`the overlay ${name} needs a "description": what it renders, and for which ticket`);
    if (!isPlainObject(json.settings) || !Object.keys(json.settings).length) throw new Error(`the overlay ${name} changes no setting: give "settings" the values it changes`);
    if (OVERLAY_MARKER in json.settings) throw new Error(`the overlay ${name} sets ${OVERLAY_MARKER}, which the gates set themselves`);
    return {
        name, description: json.description, ticket: json.ticket === undefined ? null : String(json.ticket), settings: json.settings,
    };
}

export function readOverlay(name, { dir = overlaysDir() } = {}) {
    const file = path.join(dir, `${name}.json`);
    if (!OVERLAY_NAME.test(String(name)) || !fs.existsSync(file)) {
        throw new Error(`QA_OVERLAY "${name}" isn't an overlay in ${shown(dir)} (${listOverlays(dir).join(', ') || 'there are none'})`);
    }
    let json;
    try {
        json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${shown(dir)}${name}.json isn't valid JSON: ${error.message}`);
    }
    return validateOverlay(name, json);
}

// Why `overlay` can't be applied to `config` (config.json), or an empty list.
export function overlayProblems(overlay, config) {
    const declared = config.settings || {};
    return Object.entries(overlay.settings).flatMap(([key, value]) => {
        if (!(key in declared)) return [`config.json declares no "${key}" setting, so the overlay ${overlay.name} would render the pages unchanged. Run it once the module that declares ${key} has landed (ticket 25's scaffold declares the ReelFlies switches and menu ids).`];
        if (typeOf(value) !== typeOf(declared[key])) return [`"${key}" is a ${typeOf(declared[key])} in config.json, and the overlay ${overlay.name} sets a ${typeOf(value)}`];
        return [];
    });
}

// config.json with the overlay's values in the base settings and every variation's, and the
// marker in the base settings. `config` is left as it was.
export function applyOverlay(config, overlay) {
    return {
        ...config,
        settings: { ...config.settings, ...overlay.settings, [OVERLAY_MARKER]: overlay.name },
        variations: (config.variations || []).map(variation => ({ ...variation, settings: { ...(variation.settings || {}), ...overlay.settings } })),
    };
}

// Why QA_OVERLAY can't be used in this environment, or null.
export function overlayEnvProblem(env = process.env) {
    if (!env.QA_OVERLAY) return null;
    if (env.QA_FRESH_SERVER === '1') return `QA_OVERLAY is refused with QA_FRESH_SERVER=1: release.sh sets it, and a release never renders an overlay. Unset QA_OVERLAY ("${env.QA_OVERLAY}").`;
    if (env.QA_BASE_URL) return `QA_OVERLAY renders through only a local stencil start, and QA_BASE_URL (${env.QA_BASE_URL}) renders that host's own config.json. Unset one of them.`;
    return null;
}

// A linked git worktree's .git is a file; the main clone's is a folder.
export function isLinkedWorktree(checkout) {
    try {
        return fs.lstatSync(path.join(checkout, '.git')).isFile();
    } catch {
        return false;
    }
}

const SNAPSHOT_IDENTITY = {
    GIT_AUTHOR_NAME: 'ReelFlies QA', GIT_AUTHOR_EMAIL: 'qa@reelflies.invalid', GIT_COMMITTER_NAME: 'ReelFlies QA', GIT_COMMITTER_EMAIL: 'qa@reelflies.invalid',
};

function git(cwd, args, { env = {}, allowFail = false } = {}) {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
    if (result.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(result.stderr || result.stdout).trim()}`);
    return result;
}

// A commit of the checkout's working tree as it is, uncommitted and untracked (not ignored)
// files included, made through a temporary index: the checkout's index, branch and files stay
// as they were. Its parent is HEAD. Nothing points at it, so git's gc drops it in time.
export function snapshotCommit(checkout) {
    const index = path.resolve(checkout, git(checkout, ['rev-parse', '--git-path', 'index']).stdout.trim());
    const temporary = path.join(os.tmpdir(), `rf-qa-overlay-index-${process.pid}-${Date.now()}`);
    try {
        if (fs.existsSync(index)) fs.copyFileSync(index, temporary);
        const env = { GIT_INDEX_FILE: temporary };
        if (!fs.existsSync(index)) git(checkout, ['read-tree', 'HEAD'], { env });
        git(checkout, ['add', '--all', '--', '.'], { env });
        const tree = git(checkout, ['write-tree'], { env }).stdout.trim();
        return git(checkout, ['commit-tree', tree, '-p', 'HEAD', '-m', `QA overlay snapshot of ${checkout}`], { env: SNAPSHOT_IDENTITY }).stdout.trim();
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}

// The registered worktrees of the checkout's repo.
const worktreesOf = checkout => git(checkout, ['worktree', 'list', '--porcelain']).stdout.split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length));

// Removes one overlay worktree: its registration and its folder, links unlinked and never
// followed (git and fs.rmSync both remove a link itself, not what it points at).
function removeWorktree(checkout, dir) {
    git(checkout, ['worktree', 'remove', '--force', '--force', dir], { allowFail: true });
    fs.rmSync(dir, { recursive: true, force: true });
    git(checkout, ['worktree', 'prune'], { allowFail: true });
}

const prefixFor = (port, name) => `${OVERLAY_PREFIX}${port}-${name}-`;

// Removes the overlay worktrees a stopped run left on `port`, in `scratch`. The caller holds
// that port pair's lock, so no running gate uses them.
export function removeStaleOverlayCheckouts({
    checkout, port, scratch, log = console.log,
}) {
    const stale = worktreesOf(checkout).filter(dir => path.dirname(dir) === fs.realpathSync(scratch) && path.basename(dir).startsWith(`${OVERLAY_PREFIX}${port}-`));
    for (const dir of stale) {
        log(`STALE    removing the overlay worktree a stopped run left on port ${port}: ${dir}`);
        removeWorktree(checkout, dir);
    }
    return stale;
}

function refuseCheckout(checkout) {
    const where = `This checkout (${checkout})`;
    if (!isLinkedWorktree(checkout)) throw new Error(`${where} is the main clone. An overlay renders from a ticket's worktree, never from the main clone, whose node_modules the release's npm ci replaces mid-run.`);
    const modules = path.join(checkout, 'node_modules');
    if (!fs.existsSync(modules)) throw new Error(`${where} has no node_modules: run npm ci in it first`);
    const real = fs.realpathSync(modules);
    const own = fs.realpathSync(checkout);
    if (!real.startsWith(`${own}${path.sep}`)) throw new Error(`${where}'s node_modules is outside it (${real}): an overlay links to the worktree's own, never the main clone's, so run npm ci in the worktree`);
    // Its existence only: nothing here reads it.
    if (!fs.existsSync(path.join(checkout, 'secrets.stencil.json'))) throw new Error(`${where} has no secrets.stencil.json: link the main clone's into it (ln -s), as the runbook says`);
    if (!fs.existsSync(path.join(checkout, 'config.stencil.json'))) throw new Error(`${where} has no config.stencil.json: link the main clone's into it (ln -s), or copy it`);
}

// Makes the throwaway worktree an overlay renders in (see the top of this file), for the run on
// `port`, in `scratch`. Returns { dir, commit, remove }; remove() can be called more than once.
export function createOverlayCheckout({
    checkout, overlay, port, scratch = scratchDir(), log = console.log,
}) {
    refuseCheckout(checkout);
    const config = JSON.parse(fs.readFileSync(path.join(checkout, 'config.json'), 'utf8'));
    const problems = overlayProblems(overlay, config);
    if (problems.length) throw new Error(problems.join('; '));

    fs.mkdirSync(scratch, { recursive: true });
    removeStaleOverlayCheckouts({
        checkout, port, scratch, log,
    });
    const commit = snapshotCommit(checkout);
    const dir = path.join(fs.realpathSync(scratch), `${prefixFor(port, overlay.name)}${process.pid}-${Date.now().toString(36)}`);
    git(checkout, ['worktree', 'add', '--quiet', '--detach', dir, commit]);
    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        removeWorktree(checkout, dir);
    };
    try {
        const theirs = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
        fs.writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(applyOverlay(theirs, overlay), null, 4)}\n`);
        for (const name of LINKED) fs.symlinkSync(path.join(checkout, name), path.join(dir, name));
    } catch (error) {
        remove();
        throw error;
    }
    log(`OVERLAY  ${overlay.name}: ${overlay.description}. Rendering this checkout's working tree with it in ${dir}`);
    return { dir, commit, remove };
}
