// A scratch checkout of the store tooling for the tests that run the helper's commands (W0-11).
// apply.mjs, and the writer token, run only store tooling byte-identical to origin/master's
// (tooling.mjs), so these tests run a copy of it in a scratch clone whose origin is a local bare
// repo. Nothing reaches GitHub.
//
//   import { storeCheckout, git } from './fixtures/checkout.mjs';
//   const dir = storeCheckout(path.join(tmp, 'main'));                 // master holds the tooling
//   const early = storeCheckout(path.join(tmp, 'early'), { onMaster: false });   // on a branch only

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STORE_FOLDER, STORE_TOOLING, filesUnder } from '../tooling.mjs';

const SOURCE = fileURLToPath(new URL('../../../', import.meta.url));

export function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
    return result.stdout.trim();
}

export function copyStoreTooling(dir) {
    for (const file of [...filesUnder(SOURCE, STORE_FOLDER), ...STORE_TOOLING]) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(SOURCE, file), path.join(dir, file));
    }
}

// A clone at `dir` whose origin, `${dir}.git`, has a master. With onMaster: false, master holds
// only a README and the clone has the tooling on a branch, as a ticket branch would.
export function storeCheckout(dir, { onMaster = true } = {}) {
    const origin = `${dir}.git`;
    fs.mkdirSync(dir, { recursive: true });
    git(path.dirname(dir), 'init', '-q', '--bare', '-b', 'master', origin);
    git(dir, 'init', '-q', '-b', 'master');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'test');
    git(dir, 'remote', 'add', 'origin', origin);
    if (onMaster) copyStoreTooling(dir);
    else fs.writeFileSync(path.join(dir, 'README.md'), 'master before W0-11\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'master');
    git(dir, 'push', '-q', 'origin', 'master');
    if (!onMaster) {
        git(dir, 'checkout', '-q', '-b', 'w0/11-store-write-helper');
        copyStoreTooling(dir);
        git(dir, 'add', '-A');
        git(dir, 'commit', '-q', '-m', 'store tooling');
    }
    return dir;
}
