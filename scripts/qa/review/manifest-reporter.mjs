// A Playwright reporter that writes the screenshot manifest (manifest.mjs; W0-10) when a
// run of the storefront gates ends. playwright.config.mjs runs it beside the list and
// HTML reporters. It runs in the runner's one process, so the parallel workers never
// write the file at once.
//
// - Only tests that annotate a shot (shotAnnotation) add entries, so axe and Quick view
//   runs leave the manifest as it was.
// - A failed shot's actual render is copied to scripts/qa/results/manifest-actual/,
//   because the next run empties Playwright's output folder.

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    MANIFEST, entriesFromResult, entryKey, mergeManifest, readManifest, writeManifest,
} from './manifest.mjs';
import { ROOT } from './reference.mjs';

function gitHead(root) {
    const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
    return { sha: sha.status === 0 ? sha.stdout.trim() : null, dirty: status.status === 0 ? status.stdout.trim() !== '' : null };
}

export default class ManifestReporter {
    constructor({
        root = ROOT, file = MANIFEST, now = () => new Date().toISOString(), head = () => gitHead(root), log = console.log,
    } = {}) {
        Object.assign(this, {
            root, file, now, head, log, entries: [],
        });
    }

    printsToStdio() {
        return false;
    }

    onTestEnd(test, result) {
        this.entries.push(...entriesFromResult(result));
    }

    keepActual(entry) {
        if (!entry.actual || !fs.existsSync(entry.actual)) return { ...entry, actual: null };
        const name = `${crypto.createHash('sha256').update(entryKey(entry)).digest('hex').slice(0, 12)}-${path.basename(entry.actual)}`;
        const kept = path.join(this.root, 'scripts', 'qa', 'results', 'manifest-actual', name);
        fs.mkdirSync(path.dirname(kept), { recursive: true });
        fs.copyFileSync(entry.actual, kept);
        return { ...entry, actual: path.relative(this.root, kept).split(path.sep).join('/') };
    }

    async onEnd() {
        if (!this.entries.length) return;
        const { sha, dirty } = this.head();
        const manifest = mergeManifest(readManifest(this.file), this.entries.map(entry => this.keepActual(entry)), { now: this.now(), commit: sha, dirty });
        writeManifest(this.file, manifest);
        this.log(`Screenshot manifest: ${this.entries.length} shot${this.entries.length === 1 ? '' : 's'} recorded in ${path.relative(process.cwd(), this.file) || this.file}`);
    }
}
