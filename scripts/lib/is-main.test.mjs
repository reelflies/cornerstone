import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HELPER = new URL('./is-main.mjs', import.meta.url).href;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-is-main-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));

// A checkout path with '#' and '%' in it, which a hand-built file:// URL gets wrong.
const dir = path.join(root, 'theme #1 %41');
fs.mkdirSync(dir);
const script = name => path.join(dir, name);
// The scripts print text, not booleans: under a terminal, node --test turns on colour for its
// subprocesses (FORCE_COLOR), and console.log would wrap a boolean in colour codes.
fs.writeFileSync(script('child.mjs'), `import { isMain } from '${HELPER}';\nconsole.log(\`child \${isMain(import.meta.url)}\`);\n`);
fs.writeFileSync(script('main.mjs'), `import { isMain } from '${HELPER}';\nimport './child.mjs';\nconsole.log(\`main \${isMain(import.meta.url)}\`);\n`);
fs.symlinkSync(script('main.mjs'), script('linked.mjs'));

const run = file => spawnSync(process.execPath, [file], { encoding: 'utf8' }).stdout;

test('the script node was started with is main, from a path with # and % in it', () => {
    assert.match(run(script('main.mjs')), /^main true$/m);
});

test('a module it imports is not main', () => {
    assert.match(run(script('main.mjs')), /^child false$/m);
});

test('a script started through a symlink is main', () => {
    assert.match(run(script('linked.mjs')), /^main true$/m);
});
