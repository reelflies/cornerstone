import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    GUARDED_PATHS_FILE, guardedFiles, isGuarded, parseGuardedPaths, readGuardedPaths,
} from './guarded-paths.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('the list lives in scripts/guarded-paths.txt', () => {
    assert.match(GUARDED_PATHS_FILE, /scripts\/guarded-paths\.txt$/);
    assert.ok(fs.existsSync(GUARDED_PATHS_FILE));
});

test('comments and blank lines are skipped, and a pattern is a repo-relative path', () => {
    assert.deepEqual(parseGuardedPaths('# a comment\n\nscripts/store/\n  scripts/merge.sh  \n# another\n'), ['scripts/store/', 'scripts/merge.sh']);
    assert.throws(() => parseGuardedPaths('/scripts/merge.sh\n'), /repo-relative/);
    assert.throws(() => parseGuardedPaths('../outside\n'), /repo-relative/);
    assert.throws(() => parseGuardedPaths('scripts/**/x\n'), /\*\*/);
});

test('a trailing slash guards everything under a folder, and only under it', () => {
    const patterns = ['scripts/store/'];
    assert.ok(isGuarded('scripts/store/apply.mjs', patterns));
    assert.ok(isGuarded('scripts/store/deep/allowlist.mjs', patterns));
    assert.ok(!isGuarded('scripts/store', patterns), 'a file named like the folder isn\'t under it');
    assert.ok(!isGuarded('scripts/storefront.mjs', patterns));
    assert.ok(!isGuarded('scripts/qa/store/x.mjs', patterns), 'patterns are anchored at the repo root');
});

test('* matches within one path segment, and a match on a folder guards what is inside it', () => {
    const patterns = ['scripts/release*.mjs', 'scripts/catalogue/apply*'];
    assert.ok(isGuarded('scripts/release.mjs', patterns));
    assert.ok(isGuarded('scripts/release-sh.test.mjs', patterns));
    assert.ok(!isGuarded('scripts/release/x.mjs', patterns), '* doesn\'t cross a slash');
    assert.ok(!isGuarded('scripts/qa/release.mjs', patterns));
    assert.ok(isGuarded('scripts/catalogue/apply.mjs', patterns));
    assert.ok(isGuarded('scripts/catalogue/apply/run.mjs', patterns), 'scripts/catalogue/apply as a folder');
    assert.ok(!isGuarded('scripts/catalogue/plan.mjs', patterns));
});

test('matching ignores case, because the Mac\'s file system does: a case variant lands in the guarded folder', () => {
    const patterns = readGuardedPaths();
    for (const file of [
        '.Claude/settings.json',
        '.CLAUDE/settings.local.json',
        'Scripts/store/apply-anything.mjs',
        'scripts/Store/x.mjs',
        'scripts/lib/Store-token.mjs',
        'scripts/Merge.mjs',
        'scripts/Release-calendar.json',
        '.GitHub/workflows/x.yml',
        'Releases.md',
    ]) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);
    assert.ok(!isGuarded('scripts/Storefront.mjs', ['scripts/store/']));
});

test('the committed list guards the release, store, merge and permission tooling, the calendar and itself', () => {
    const patterns = readGuardedPaths();
    const guarded = [
        'scripts/release.sh',
        'scripts/release.mjs',
        'scripts/release-checks.mjs',
        'scripts/release-checks.test.mjs',
        'scripts/release-sh.test.mjs',
        'scripts/store/apply.mjs',
        'scripts/store/allowlist.mjs',
        'scripts/lib/store-token.mjs',
        'scripts/lib/store-token.test.mjs',
        'scripts/catalogue/apply.mjs',
        'scripts/merge.sh',
        'scripts/merge.mjs',
        'scripts/merge-sh.test.mjs',
        'scripts/status.mjs',
        'scripts/status.test.mjs',
        'scripts/release-calendar.json',
        'scripts/lib/release-calendar.mjs',
        'scripts/lib/release-calendar.test.mjs',
        'scripts/guarded-paths.txt',
        'scripts/lib/guarded-paths.mjs',
        'scripts/lib/gh.mjs',
        'scripts/lib/gh-stub.mjs',
        'scripts/check-baseline-scope.mjs',
        'scripts/claude-permissions.test.mjs',
        '.claude/settings.draft.json',
        '.claude/settings.json',
        '.github/workflows/reelflies-checks.yml',
        '.github/workflows/reelflies-baseline-scope.yml',
        // merge.mjs's own imports, and the runner that decides which of these tests CI runs
        'scripts/lib/lock.mjs',
        'scripts/lib/lock.test.mjs',
        'scripts/lib/is-main.mjs',
        'scripts/lib/format.mjs',
        'scripts/test-scripts.mjs',
        // CI's secret scan reads these by itself
        '.gitleaks.toml',
        '.gitleaksignore',
        // the release log the release tooling reads, and the documents agents and Shaun act on
        'RELEASES.md',
        'docs/guardrails.md',
        'docs/permissions.md',
        'docs/releasing.md',
        'CLAUDE.md',
        'AGENTS.md',
    ];
    for (const file of guarded) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);

    const open = [
        'scripts/check-bundle.mjs',
        'scripts/check-contrast.mjs',
        'scripts/qa/storefront.mjs',
        'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png',
        'scripts/qa/prepush.mjs',
        'scripts/catalogue/plan.mjs',
        'assets/js/theme/reelflies/lazy-quick-view.js',
        'templates/layout/base.html',
        'config.json',
        'package.json',
        'package-lock.json',
        'docs/adr/0001-scoped-theme-code.md',
        'docs/research/07-probes.md',
        'CUSTOMIZATIONS.md',
    ];
    for (const file of open) assert.ok(!isGuarded(file, patterns), `${file} shouldn't be guarded`);
});

test('guardedFiles lists the guarded files of a PR, each once, in order', () => {
    const patterns = ['.github/', 'scripts/merge.sh'];
    assert.deepEqual(
        guardedFiles(['README.md', '.github/workflows/a.yml', 'scripts/merge.sh', '.github/workflows/a.yml', 'assets/x.js'], patterns),
        ['.github/workflows/a.yml', 'scripts/merge.sh'],
    );
    assert.deepEqual(guardedFiles(['README.md'], patterns), []);
});

// The local modules a script imports, and theirs, as repo-relative paths.
function importClosure(entries) {
    const seen = new Set();
    const visit = file => {
        if (seen.has(file)) return;
        seen.add(file);
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const [, spec] of text.matchAll(/^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"](\.\.?\/[^'"]+)['"]/gm)) {
            visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
        }
    };
    entries.forEach(visit);
    return [...seen].sort();
}

// check-contrast.mjs only reports the live colours' contrast in step 1, and tickets 25 and 50
// own it, so it stays open (docs/guardrails.md, "What isn't guarded").
const OPEN_RELEASE_IMPORTS = ['scripts/check-contrast.mjs'];

test('every module the release tooling imports is guarded, apart from the documented exceptions', () => {
    const patterns = readGuardedPaths();
    const entries = fs.readdirSync(path.join(ROOT, 'scripts'))
        .filter(name => /^release.*\.mjs$/.test(name) && !name.endsWith('.test.mjs'))
        .map(name => `scripts/${name}`);
    assert.ok(entries.includes('scripts/release.mjs'));
    const closure = importClosure(entries);
    for (const file of OPEN_RELEASE_IMPORTS) assert.ok(closure.includes(file), `${file} is no longer imported: drop it from the exceptions`);
    for (const file of closure.filter(name => !OPEN_RELEASE_IMPORTS.includes(name))) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);
});
