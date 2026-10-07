// Tests scripts/catalogue/apply-tooling.mjs (ticket 18): a catalogue write runs only tooling
// byte-identical to origin/master's. Each case runs in a scratch clone whose origin is a local
// bare repo, so nothing reaches GitHub.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGuarded, readGuardedPaths } from '../lib/guarded-paths.mjs';
import { git, storeCheckout } from '../store/fixtures/checkout.mjs';
import { STORE_FOLDER, STORE_TOOLING } from '../store/tooling.mjs';
import { CATALOGUE_FOLDER, catalogueToolingProblem, isApplyFile } from './apply-tooling.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-catalogue-tooling-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let count = 0;

const applyFiles = () => fs.readdirSync(path.join(ROOT, CATALOGUE_FOLDER)).filter(isApplyFile).map(name => `${CATALOGUE_FOLDER}/${name}`);

function fresh({ catalogueOnMaster = true } = {}) {
    const dir = storeCheckout(path.join(tmp, `clone-${++count}`));
    const copy = () => {
        fs.mkdirSync(path.join(dir, CATALOGUE_FOLDER), { recursive: true });
        for (const file of applyFiles()) fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
        git(dir, 'add', '-A');
        git(dir, 'commit', '-q', '-m', 'catalogue tooling');
    };
    if (catalogueOnMaster) {
        copy();
        git(dir, 'push', '-q', 'origin', 'master');
    } else {
        git(dir, 'checkout', '-q', '-b', 't18/catalogue-dry-runs');
        copy();
    }
    return dir;
}

test('a checkout whose store and catalogue tooling are origin/master\'s passes', () => {
    assert.equal(catalogueToolingProblem({ repo: fresh() }), null);
});

test('an edit to a catalogue apply file is refused, naming it', () => {
    const dir = fresh();
    fs.appendFileSync(path.join(dir, 'scripts/catalogue/apply-rules.mjs'), '\n// widened\n');
    assert.match(catalogueToolingProblem({ repo: dir }), /^this checkout's catalogue tooling differs from origin\/master's \(scripts\/catalogue\/apply-rules\.mjs\)/);
});

test('a new apply file, or one deleted, is refused; other catalogue files don\'t matter', () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, 'scripts/catalogue/apply-more.mjs'), 'export {};\n');
    fs.writeFileSync(path.join(dir, 'scripts/catalogue/jobs.mjs'), 'export {};\n');
    assert.match(catalogueToolingProblem({ repo: dir }), /\(scripts\/catalogue\/apply-more\.mjs\)/);
    fs.rmSync(path.join(dir, 'scripts/catalogue/apply-more.mjs'));
    assert.equal(catalogueToolingProblem({ repo: dir }), null);
    fs.rmSync(path.join(dir, 'scripts/catalogue/apply-tooling.mjs'));
    assert.match(catalogueToolingProblem({ repo: dir }), /\(scripts\/catalogue\/apply-tooling\.mjs\)/);
});

test('the store helper\'s own check comes first: an edited store allowlist refuses a catalogue write too', () => {
    const dir = fresh();
    fs.appendFileSync(path.join(dir, 'scripts/store/client.mjs'), '\n// changed\n');
    assert.match(catalogueToolingProblem({ repo: dir }), /store tooling differs from origin\/master's \(scripts\/store\/client\.mjs\)/);
});

test('before the apply tooling is on origin/master, nothing may write', () => {
    assert.match(catalogueToolingProblem({ repo: fresh({ catalogueOnMaster: false }) }), /differs from origin\/master's \(scripts\/catalogue\/apply/);
    const bare = storeCheckout(path.join(tmp, `bare-${++count}`));
    assert.match(catalogueToolingProblem({ repo: bare }), /has no catalogue apply tooling yet/);
});

// The local modules a script imports, and theirs, as repo-relative paths.
function importClosure(entries) {
    const seen = new Set();
    const visit = file => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const [, spec] of source.matchAll(/^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"](\.\.?\/[^'"]+)['"]/gm)) {
            visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
        }
    };
    entries.forEach(visit);
    return [...seen].sort();
}

test('apply imports only checked tooling: its own apply* files, scripts/store/ and the store\'s listed modules, all guarded', () => {
    const commands = applyFiles().filter(file => !file.endsWith('.test.mjs'));
    const closure = importClosure(commands);
    const unchecked = closure.filter(file => !(
        (file.startsWith(`${CATALOGUE_FOLDER}/`) && isApplyFile(path.basename(file)))
        || file.startsWith(`${STORE_FOLDER}/`)
        || STORE_TOOLING.includes(file)
    ));
    assert.deepEqual(unchecked, []);
    const patterns = readGuardedPaths();
    for (const file of closure) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);
});

test('the guide Shaun follows for catalogue writes, and the in-memory catalogue the apply tests trust, are guarded too', () => {
    const patterns = readGuardedPaths();
    for (const file of ['docs/catalogue-jobs.md', 'scripts/catalogue/fixtures/catalogue-store.mjs', 'scripts/catalogue/fixtures/export.csv']) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);
    for (const file of ['scripts/catalogue/jobs.mjs', 'scripts/catalogue/dry-run.mjs', 'scripts/catalogue/report.mjs']) assert.ok(!isGuarded(file, patterns), `${file} stays open: the dry run only proposes`);
    const guide = fs.readFileSync(path.join(ROOT, 'docs/guardrails.md'), 'utf8');
    assert.match(guide, /`docs\/catalogue-jobs\.md`/, 'docs/guardrails.md lists it with the other documents agents and Shaun act on');
});
