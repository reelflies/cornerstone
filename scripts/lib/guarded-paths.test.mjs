import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    GUARDED_PATHS_FILE, guardedFiles, isGuarded, parseGuardedPaths, readGuardedPaths,
} from './guarded-paths.mjs';

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
    ];
    for (const file of guarded) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);

    const open = [
        'scripts/check-bundle.mjs',
        'scripts/check-contrast.mjs',
        'scripts/qa/storefront.mjs',
        'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png',
        'scripts/lib/format.mjs',
        'scripts/lib/lock.mjs',
        'scripts/catalogue/plan.mjs',
        'assets/js/theme/reelflies/lazy-quick-view.js',
        'templates/layout/base.html',
        'config.json',
        'RELEASES.md',
        'docs/releasing.md',
        'docs/guardrails.md',
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
