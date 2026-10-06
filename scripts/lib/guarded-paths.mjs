// Guarded paths (W0-13): the files a PR may change only with an rf/safety sign-off.
// The list is scripts/guarded-paths.txt; scripts/merge.sh reads master's copy of it.
//
//   import { readGuardedPaths, guardedFiles } from './lib/guarded-paths.mjs';
//   guardedFiles(changedFiles, readGuardedPaths());   // -> the guarded ones, in order
//
// A pattern is a repo-relative path. A trailing slash guards everything under that folder.
// `*` matches within one path segment. A pattern that matches a folder guards what is in it,
// so `scripts/catalogue/apply*` covers both `apply.mjs` and an `apply/` folder.

import fs from 'fs';
import { fileURLToPath } from 'url';

export const GUARDED_PATHS_FILE = fileURLToPath(new URL('../guarded-paths.txt', import.meta.url));

export function parseGuardedPaths(text) {
    return text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(pattern => {
        if (pattern.startsWith('/') || pattern.split('/').includes('..')) throw new Error(`guarded path "${pattern}" must be repo-relative`);
        if (pattern.includes('**')) throw new Error(`guarded path "${pattern}" uses **: guard the folder with a trailing slash instead`);
        return pattern;
    });
}

export function readGuardedPaths(file = GUARDED_PATHS_FILE) {
    return parseGuardedPaths(fs.readFileSync(file, 'utf8'));
}

const globRegex = glob => new RegExp(`^${glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);

export function isGuarded(file, patterns) {
    const segments = file.split('/');
    // The file itself, then each folder it is in.
    const candidates = segments.map((_, i) => ({ path: segments.slice(0, i + 1).join('/'), folder: i < segments.length - 1 }));
    return patterns.some(pattern => {
        const folderOnly = pattern.endsWith('/');
        const regex = globRegex(folderOnly ? pattern.slice(0, -1) : pattern);
        return candidates.some(candidate => (candidate.folder || !folderOnly) && regex.test(candidate.path));
    });
}

export function guardedFiles(files, patterns) {
    return [...new Set(files)].filter(file => isGuarded(file, patterns));
}
