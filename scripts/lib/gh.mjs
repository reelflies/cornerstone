// The GitHub CLI calls the merge tooling makes (W0-13), always against the private repo.
// A bare `gh pr …` resolves to upstream bigcommerce/cornerstone in this clone, so every pr
// command here carries -R, and every API path starts with repos/<REPO>/.
//
//   import { REPO, ghPr, ghApi } from './lib/gh.mjs';
//   ghPr(['view', '12', '--json', 'state']);           // gh pr view 12 -R REPO --json state, parsed
//   ghApi(`commits/${sha}/status?per_page=100`);       // GET, JSON-parsed

import { spawnSync } from 'child_process';

export const REPO = 'reelflies/reelflies-cornerstone';
export const REPO_URL = `https://github.com/${REPO}`;

export class GhError extends Error {
    constructor(args, result) {
        const detail = (result.stderr || result.stdout || result.error?.message || '').trim().split('\n').slice(-3).join(' ');
        super(`gh ${args.join(' ')} failed${result.status === null ? '' : ` (exit ${result.status})`}: ${detail}`);
        this.stderr = result.stderr || '';
    }
}

export function gh(args, { json = true, inherit = false } = {}) {
    const result = spawnSync('gh', args, {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: inherit ? 'inherit' : 'pipe',
    });
    if (result.status !== 0) throw new GhError(args, result);
    if (inherit || !json) return result.stdout;
    try {
        return JSON.parse(result.stdout);
    } catch {
        throw new Error(`gh ${args.join(' ')} returned something that isn't JSON: ${result.stdout.slice(0, 200)}`);
    }
}

// gh pr <subcommand> <pr> -R REPO <flags…>
export const ghPr = (args, options) => gh(['pr', ...args.slice(0, 2), '-R', REPO, ...args.slice(2)], options);

// gh api repos/REPO/<path> [extra args]
export const ghApi = (apiPath, extra = [], options = {}) => gh(['api', ...extra, `repos/${REPO}/${apiPath}`], options);

export const ghGraphql = (query, fields) => gh(['api', 'graphql', '-f', `query=${query}`, ...Object.entries(fields).flatMap(([key, value]) => [typeof value === 'number' ? '-F' : '-f', `${key}=${value}`])]);
