// Tests the Claude Code permission rules (W0-13): .claude/settings.draft.json until Shaun
// turns them on by renaming it to .claude/settings.json (docs/permissions.md), then that file.
//
// Claude Code never reads settings.draft.json. This test proves each deny rule fires on a
// probe, that every live probe in docs/permissions.md fires, and that no rule catches a
// command agents need, by matching the way Claude Code documents it: in a Bash rule `*`
// matches any run of characters, spaces included, and everything else is literal; Read rules
// are gitignore-style paths (`~/` is the home folder, `**` any depth).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DRAFT = path.join(ROOT, '.claude', 'settings.draft.json');
const ACTIVE = path.join(ROOT, '.claude', 'settings.json');
const FILE = fs.existsSync(ACTIVE) ? ACTIVE : DRAFT;
const settings = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const HOME = os.homedir();

const escape = text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

function parseRule(rule) {
    const match = /^(Bash|Read)\((.+)\)$/.exec(rule);
    assert.ok(match, `"${rule}" isn't a Bash(...) or Read(...) rule`);
    return { tool: match[1], pattern: match[2] };
}

const bashRegex = pattern => new RegExp(`^${pattern.split('*').map(escape).join('.*')}$`);

function readRegex(pattern) {
    let absolute;
    if (pattern.startsWith('//')) absolute = pattern.slice(1);
    else if (pattern.startsWith('~/')) absolute = path.join(HOME, pattern.slice(2));
    else absolute = path.join(ROOT, pattern);
    const source = absolute.split(/(\*\*\/|\*\*|\*)/).map(part => {
        if (part === '**/') return '(?:.*/)?';
        if (part === '**') return '.*';
        if (part === '*') return '[^/]*';
        return escape(part);
    }).join('');
    return new RegExp(`^${source}$`);
}

const rules = list => list.map(rule => ({ rule, ...parseRule(rule) }));
const deny = rules(settings.permissions.deny);
const allow = rules(settings.permissions.allow);

const matches = ({ tool, pattern }, probe) => (tool === 'Bash' ? bashRegex(pattern).test(probe.command ?? '') : readRegex(pattern).test(probe.file ?? ''));
const firing = (list, probe) => list.filter(rule => rule.tool === probe.tool && matches(rule, probe));

const bash = command => ({ tool: 'Bash', command });
const read = file => ({ tool: 'Read', file: file.replace(/^~\//, `${HOME}/`) });

const API = 'https://api.bigcommerce.com/stores/abc123/v3/content/widgets';
// The main clone: merge.sh, status.mjs, the store helper and real releases run from there.
const MAIN = '/Users/rook/reelflies/theme/cornerstone';
const MAIN_TILDE = '~/reelflies/theme/cornerstone';

const MUST_DENY = [
    // A bare stencil push or release, in every spelling that reaches the CLI.
    bash('npx stencil push -f reelflies.zip -a "ReelFlies CA" -c 1'),
    bash('stencil push -a -c 1'),
    bash('npx @bigcommerce/stencil-cli push -c 1855224'),
    bash('npm exec stencil push'),
    bash('npm exec -- stencil push -c 1'),
    bash('./node_modules/.bin/stencil push -a'),
    bash('npx stencil release'),
    bash('stencil release'),
    // A raw merge, around scripts/merge.sh.
    bash('gh pr merge 12 --merge --delete-branch'),
    bash('gh -R reelflies/reelflies-cornerstone pr merge 12'),
    bash('gh api -X PUT repos/reelflies/reelflies-cornerstone/pulls/12/merge'),
    bash('git push origin master'),
    bash('git push origin master --force'),
    bash('git push origin HEAD:master'),
    bash('git push origin HEAD:master --force-with-lease'),
    bash('git push origin w0/13-guardrails:refs/heads/master'),
    // A non-GET curl to the store API: a method or a body, before or after the URL.
    bash(`curl -X POST -H "X-Auth-Token: $T" ${API}`),
    bash(`curl -sS --request PUT ${API}/1`),
    bash(`curl -sS -d '{"name":"x"}' ${API}`),
    bash(`curl --data-raw '{"name":"x"}' ${API}`),
    bash(`curl --json '{"name":"x"}' ${API}`),
    bash(`curl -F file=@hero.png ${API}`),
    bash(`curl --form file=@hero.png ${API}`),
    bash(`curl -T body.json ${API}`),
    bash(`curl --upload-file body.json ${API}`),
    bash(`curl -sS ${API}/1 -X DELETE`),
    bash(`curl -sS ${API}/1 --request DELETE`),
    bash(`curl -sS ${API} -d @body.json`),
    bash(`curl -sS ${API} --data @body.json`),
    bash(`curl -sS ${API} --json @body.json`),
    bash(`curl -sS ${API} -F file=@hero.png`),
    bash(`curl -sS ${API} --form file=@hero.png`),
    bash(`curl -sS ${API} -T body.json`),
    bash(`curl -sS ${API} --upload-file body.json`),
    // A path that climbs out of scripts/store/ after the allowed prefix.
    bash(`node ${MAIN}/scripts/store/../merge.mjs 12`),
    bash(`node ${MAIN_TILDE}/scripts/store/../../worktrees/t27-header/scripts/store/apply.mjs`),
    // The Keychain items behind W0-11's helper.
    bash('security find-generic-password -s reelflies-store-writer -w'),
    bash('security find-internet-password -s api.bigcommerce.com'),
    bash('security dump-keychain'),
    // Token files, through the shell.
    bash('cat secrets.stencil.json'),
    bash('head -c 40 ../cornerstone/secrets.stencil.json'),
    bash('tail secrets.stencil.json'),
    bash('less secrets.stencil.json'),
    bash('cp secrets.stencil.json /tmp/x'),
    bash('cat ~/reelflies/.env'),
    bash('head ~/reelflies/.env'),
    bash('tail ~/reelflies/.env'),
    bash('less ~/reelflies/.env'),
    bash('cp ~/reelflies/.env /tmp/x'),
    bash('cat ~/.config/reelflies/store.json'),
    bash('head ~/.config/reelflies/store.json'),
    bash('tail ~/.config/reelflies/store.json'),
    bash('less ~/.config/reelflies/store.json'),
    bash('cp -r ~/.config/reelflies/ /tmp/x'),
    // Token files and private data, through Claude's file tools.
    read(path.join(ROOT, 'secrets.stencil.json')),
    read('~/reelflies/theme/cornerstone/secrets.stencil.json'),
    read('~/reelflies/theme/worktrees/t27-header/secrets.stencil.json'),
    read('~/.config/reelflies/store.json'),
    read('~/reelflies/.env'),
    read('~/reelflies/report/data/orders_cache.json'),
    read('~/reelflies/report/data/pull.log'),
];

// Known false positives, pinned so a change to them is deliberate (docs/permissions.md).
const KNOWN_FALSE_POSITIVES = [
    bash(`curl -X GET ${API}`),
    bash(`curl -sS -G --data-urlencode 'keyword=hook' ${API}`),
    bash(`curl -sS -G ${API} -d limit=5`),
];

const MUST_ALLOW = [
    bash(`${MAIN}/scripts/merge.sh 12`),
    bash(`${MAIN_TILDE}/scripts/merge.sh --check 12`),
    bash(`${MAIN}/scripts/release.sh --channel 1895766 --variation "ReelFlies CA" --confirm-nonprod 1895766`),
    bash(`${MAIN_TILDE}/scripts/release.sh --channel 1895766 --variation "ReelFlies CA" --dry-run`),
    bash('scripts/release.sh --channel 1895766 --variation "ReelFlies CA" --dry-run'),
    bash('./scripts/release.sh --channel 1895766 --variation "ReelFlies CA" --dry-run'),
    bash(`node ${MAIN}/scripts/store/plan.mjs --channel 1895766 widgets`),
    bash(`node ${MAIN_TILDE}/scripts/store/plan.mjs --channel 1895766 widgets`),
    bash(`node ${MAIN}/scripts/status.mjs --pr 12 --sha 0123456789abcdef0123456789abcdef01234567 --context rf/spec --state success`),
    bash(`node ${MAIN_TILDE}/scripts/status.mjs --pr 12 --sha 0123456789abcdef0123456789abcdef01234567 --context rf/spec --state success`),
];

// Not denied, but not pre-approved either: a copy in some other checkout, which may hold an
// agent's own edit, asks first.
const NOT_PRE_APPROVED = [
    bash('scripts/merge.sh 12'),
    bash('./scripts/merge.sh --check 12'),
    bash('/Users/rook/reelflies/theme/worktrees/t27-header/scripts/merge.sh 12'),
    bash('scripts/release.sh --channel 1895766 --variation "ReelFlies CA" --confirm-nonprod 1895766'),
    bash('./scripts/release.sh --channel 1895766 --variation "ReelFlies CA" --dry-run --confirm-nonprod 1895766'),
    bash('node scripts/store/plan.mjs --channel 1895766 widgets'),
    bash('node /Users/rook/reelflies/theme/worktrees/t27-header/scripts/store/apply.mjs'),
    bash('node scripts/status.mjs --pr 12 --sha 0123456789abcdef0123456789abcdef01234567 --context rf/spec --state success'),
];

// Commands agents need every day, which no deny rule may catch.
const MUST_PASS = [
    ...MUST_ALLOW,
    ...NOT_PRE_APPROVED,
    bash('npx stencil bundle --name ci-bundle'),
    bash('npx stencil start -c 1895766 -v "ReelFlies CA"'),
    bash('gh pr view 12 -R reelflies/reelflies-cornerstone --json state'),
    bash('gh pr create -R reelflies/reelflies-cornerstone --base master --title x --body-file body.md'),
    bash('gh api repos/reelflies/reelflies-cornerstone/pulls/12/files'),
    bash('git push -u origin w0/13-guardrails'),
    bash('git push --force-with-lease origin t27/master-bedroom-header'),
    bash('git fetch -q origin master'),
    bash('git rebase origin/master'),
    bash(`curl -sS -H "X-Auth-Token: $T" -H "Accept: application/json" ${API}`),
    bash('curl -sS https://api.bigcommerce.com/stores/abc123/v3/catalog/products/6178/custom-fields'),
    bash('ln -s /Users/rook/reelflies/theme/cornerstone/secrets.stencil.json secrets.stencil.json'),
    bash('ls -la secrets.stencil.json config.stencil.json'),
    bash('grep -n "stencil push" docs/releasing.md'),
    read(path.join(ROOT, 'config.stencil.json')),
    read(path.join(ROOT, 'config.json')),
    read(path.join(ROOT, 'docs', 'releasing.md')),
    read('~/reelflies/CONTEXT.md'),
    read('~/reelflies/report/data/product_metrics.csv'),
];

test('the draft holds only permission rules, each once', () => {
    assert.deepEqual(Object.keys(settings).sort(), ['$schema', 'permissions']);
    assert.deepEqual(Object.keys(settings.permissions).sort(), ['allow', 'deny']);
    for (const list of [settings.permissions.allow, settings.permissions.deny]) {
        assert.equal(new Set(list).size, list.length, 'a rule is listed twice');
    }
});

test('the rules are in one place: the draft, or settings.json once Shaun has turned them on', () => {
    assert.ok(!(fs.existsSync(ACTIVE) && fs.existsSync(DRAFT)), 'rename the draft to settings.json; keep one copy');
    // settings.local.json is personal and gitignored: Claude Code may create one in any
    // checkout, but it never goes in the repo.
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '.claude/settings.local.json'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(tracked.status, 1, `.claude/settings.local.json must not be tracked: ${tracked.stdout}${tracked.stderr}`);
});

test('every deny rule fires on at least one probe', () => {
    for (const rule of deny) {
        assert.ok(MUST_DENY.some(probe => probe.tool === rule.tool && matches(rule, probe)), `no probe fires ${rule.rule}`);
    }
});

for (const probe of MUST_DENY) {
    test(`denied: ${probe.command ?? probe.file.replace(HOME, '~')}`, () => {
        assert.ok(firing(deny, probe).length, 'no deny rule fires');
    });
}

// The live probes Shaun runs once the rules are on (docs/permissions.md, "Check them").
const DOC = fs.readFileSync(path.join(ROOT, 'docs', 'permissions.md'), 'utf8');
const LIVE_PROBES = [...DOC.matchAll(/^ *\| [^|]+ \| (read )?`([^`]+)` \|$/gm)].map(([, isRead, text]) => (isRead ? read(text) : bash(text)));

test('docs/permissions.md lists a live probe for every group of rules', () => {
    assert.ok(LIVE_PROBES.length >= 14, `found ${LIVE_PROBES.length} probes`);
});

for (const probe of LIVE_PROBES) {
    test(`live probe denied: ${probe.command ?? probe.file.replace(HOME, '~')}`, () => {
        assert.ok(firing(deny, probe).length, 'no deny rule fires on this probe from docs/permissions.md');
    });
}

for (const probe of MUST_PASS) {
    test(`not denied: ${probe.command ?? probe.file.replace(HOME, '~')}`, () => {
        assert.deepEqual(firing(deny, probe).map(rule => rule.rule), []);
    });
}

for (const probe of KNOWN_FALSE_POSITIVES) {
    test(`known false positive, denied: ${probe.command}`, () => {
        assert.ok(firing(deny, probe).length, 'docs/permissions.md lists this as denied; change both together');
    });
}

test('the allow rules cover the main clone\'s release, merge, store and status entry points, and nothing else', () => {
    for (const probe of MUST_ALLOW) assert.ok(firing(allow, probe).length, probe.command);
    for (const probe of NOT_PRE_APPROVED) assert.deepEqual(firing(allow, probe).map(rule => rule.rule), [], probe.command);
    for (const command of ['npx stencil push -c 1895766', 'gh pr merge 12', 'node scripts/qa/prepush.mjs', 'node scripts/storefront.mjs', 'scripts/release-calendar.json']) {
        assert.deepEqual(firing(allow, bash(command)).map(rule => rule.rule), [], command);
    }
    for (const rule of allow) assert.equal(rule.tool, 'Bash');
});
