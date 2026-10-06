// What the review page reads from git (W0-10): the checkpoint tags (review-00, review-01 …),
// the page baselines changed since one, the ticket each change belongs to, and a baseline
// as it was at a ref. Read-only: the orchestrator cuts the tags, never this tool.

import { spawnSync } from 'child_process';
import { ROOT } from './reference.mjs';

export const BASELINES = 'scripts/qa/baselines/';
const CHECKPOINT = /^review-(\d{2,})$/;

function git(args, { cwd = ROOT, encoding = 'utf8', allowFail = false } = {}) {
    const result = spawnSync('git', args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024 });
    if (result.status !== 0) {
        if (allowFail) return null;
        throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${String(result.stderr).trim()}`);
    }
    return result.stdout;
}

const lines = text => text.split('\n').filter(Boolean);
const number = tag => Number(CHECKPOINT.exec(tag)[1]);

// The house commit title ends "(ticket NN)", "(tickets NN and MM)" or "(W0-n)".
export function ticketsOf(subject) {
    const group = /\(([^()]*)\)\s*$/.exec(subject)?.[1];
    if (!group || !/\btickets?\b|\bW0-\d/i.test(group)) return [];
    return group.split(/,|\band\b/)
        .map(part => /^\s*(?:tickets?\s+)?(\d{1,3}|W0-\d+)\s*$/i.exec(part)?.[1])
        .filter(Boolean)
        .map(ticket => (/^\d+$/.test(ticket) ? ticket.padStart(2, '0') : ticket.toUpperCase()));
}

export const checkpointTags = ({ cwd = ROOT } = {}) => lines(git(['tag', '--list', 'review-*', '--merged', 'HEAD'], { cwd }))
    .filter(tag => CHECKPOINT.test(tag))
    .sort((a, b) => number(a) - number(b));

export const latestCheckpoint = tags => {
    const sorted = tags.filter(tag => CHECKPOINT.test(tag)).sort((a, b) => number(a) - number(b));
    return sorted.length ? sorted[sorted.length - 1] : null;
};

export const nextCheckpointName = tags => {
    const latest = latestCheckpoint(tags);
    return `review-${String(latest ? number(latest) + 1 : 0).padStart(2, '0')}`;
};

// scripts/qa/baselines/<channel>-<variation>/<page>-<project>-<platform>.png
export function parseBaselinePath(file) {
    const match = /^scripts\/qa\/baselines\/([^/]+)\/(.+)-((?:phone|desktop|tablet)-(\d+))-([a-z0-9]+)\.png$/.exec(file);
    if (!match) return null;
    const [, set, page, project, width, platform] = match;
    const channel = /^(\d+)-/.exec(set)?.[1] || null;
    return {
        set, channel, page, project, width: Number(width), platform,
    };
}

// The commits that touched one file in a range, newest first, in the order they landed
// (--topo-order, so commits from branches merged one after another never interleave). Each
// has its sha, subject, message body and the file's status in it (A, M or D).
function fileCommits(range, file, cwd) {
    const log = git(['log', '--no-merges', '--topo-order', '--no-renames', '--name-status', '--format=%x1e%H%x1f%s%x1f%b%x1d', range, '--', file], { cwd });
    return log.split('\x1e').filter(Boolean).map(record => {
        const [head, tail = ''] = record.split('\x1d');
        const [sha, subject, body = ''] = head.split('\x1f');
        const line = tail.split('\n').find(entry => entry.endsWith(`\t${file}`));
        return {
            sha, subject, body: body.trim(), status: line ? line[0] : null,
        };
    });
}

// Each page baseline that differs between `since` and `until` (a ref; null for the working
// tree, untracked new baselines included), with the commits that changed it, newest first.
// `before` and `after` say where to read each side: { ref, path }, with ref null for the
// working tree, or null when that side has no file.
export function changedBaselines({ since, until = 'HEAD', cwd = ROOT }) {
    const range = until ? [since, until] : [since];
    const changes = lines(git(['diff', '--name-status', '--no-renames', ...range, '--', BASELINES], { cwd })).map(line => {
        const [status, file] = line.split('\t');
        return { path: file, status: status[0] };
    });
    if (!until) {
        for (const file of lines(git(['ls-files', '--others', '--exclude-standard', '--', BASELINES], { cwd }))) changes.push({ path: file, status: 'A' });
    }
    return changes
        .filter(change => change.path.endsWith('.png'))
        .sort((a, b) => (a.path < b.path ? -1 : Number(a.path > b.path)))
        .map(change => ({
            ...change,
            commits: fileCommits(`${since}..${until || 'HEAD'}`, change.path, cwd),
            before: change.status === 'A' ? null : { ref: since, path: change.path },
            after: change.status === 'D' ? null : { ref: until, path: change.path },
        }));
}

// Everything that landed on the first-parent line since `since`, oldest first: each merged
// PR (its number, its title from the merge commit's body, and the tickets its own commits
// name) and each commit made on the line directly.
export function mergedSince({ since, until = 'HEAD', cwd = ROOT }) {
    const log = git(['log', '--first-parent', '--reverse', '--format=%x1e%H%x1f%P%x1f%s%x1f%b', `${since}..${until}`], { cwd });
    return log.split('\x1e').filter(Boolean).map(record => {
        const [sha, parents, subject, body = ''] = record.split('\x1f');
        const [first, ...others] = parents.trim().split(/\s+/);
        if (!others.length) {
            return {
                sha, pr: null, title: subject, tickets: ticketsOf(subject),
            };
        }
        const subjects = lines(git(['log', '--no-merges', '--format=%s', `${first}..${sha}`], { cwd }));
        return {
            sha,
            pr: /#(\d+)/.exec(subject)?.[1] || null,
            title: body.split('\n').map(line => line.trim()).find(Boolean) || subject,
            tickets: [...new Set(subjects.flatMap(ticketsOf))].sort(),
        };
    });
}

// The commit a checkpoint tag is on, or null when there is no such tag.
export const tagCommit = (tag, { cwd = ROOT } = {}) => git(['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`], { cwd, allowFail: true })?.trim() || null;

// A file as it was at `ref`, or null when it didn't exist there.
export const showFile = (ref, file, { cwd = ROOT } = {}) => git(['show', `${ref}:${file}`], { cwd, encoding: 'buffer', allowFail: true });

export function headInfo({ cwd = ROOT } = {}) {
    const sha = git(['rev-parse', 'HEAD'], { cwd }).trim();
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).trim();
    const dirty = git(['status', '--porcelain', '--untracked-files=no'], { cwd }).trim() !== '';
    return {
        sha, short: sha.slice(0, 8), branch, dirty,
    };
}

export const mergeBase = (a, b, { cwd = ROOT } = {}) => git(['merge-base', a, b], { cwd }).trim();
