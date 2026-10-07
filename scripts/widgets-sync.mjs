#!/usr/bin/env node
// The widget sync (ticket 46): home content as code. Each widget in widgets/<name>/ is synced to
// one channel at a time, through the store-write helper (W0-11), which makes every write.
//
//   node scripts/widgets-sync.mjs --channel 1895766 --ticket 46                          # dry run: snapshot, diff, changes file
//   node scripts/widgets-sync.mjs --channel 1895766 --ticket 46 --widget home-lead       # one widget
//   node scripts/widgets-sync.mjs --channel 1895766 --ticket 46 --only content           # templates and widgets, no placement
//   node scripts/widgets-sync.mjs --channel 1895766 --ticket 46 --only placement         # place widgets already recorded
//   node scripts/widgets-sync.mjs --channel 1895766 --ticket 57 --unpublish home-lead    # switch a home section off (R12)
//   node scripts/widgets-sync.mjs --channel 1895766 --record                             # after an apply: write the uuids into channels/<id>.json
//
// What a run does, and never does (docs/widgets.md has the routine):
//
// 1. Takes the channel as a required option with no default, so channel 1 is only ever
//    targeted on purpose (ticket 53). Today only ReelFlies_CA (1895766) is a target.
// 2. Saves a snapshot of the channel's widget templates, widgets and placements, with GETs only
//    and the read-only token, to ~/reelflies/store-snapshots/<channel>/<object>/<time>-widgets-sync.json.
//    Every object read must name the channel; any other channel stops the run.
// 3. Prints the diff against the repo, and writes the requests that would close it to a changes
//    file in ~/reelflies/store-snapshots/changes/. Each request carries the channel's
//    channel_id (scripts/widgets/sync.mjs).
// 4. Writes nothing to the store. The writes are the store-write helper's: plan.mjs (GETs only),
//    then apply.mjs, from the main clone at origin/master, each with its snapshot, diff and
//    log row (~/reelflies/store-snapshots/log.jsonl, which the orchestrator mirrors into
//    RELEASES.md). The helper checks channel_id again on every request, response and re-read.
// 5. After an apply, --record reads the channel again and writes the uuids the store gave each
//    object into widgets/<name>/channels/<channel>.json, for the PR that follows.
//
// --unpublish <name> sets the widget's placement "inactive" in its channel file and plans only
// that status change: the one widget write the release calendar allows from T-14 (ticket 57).

import fs from 'fs';
import path from 'path';
import { isMain } from './lib/is-main.mjs';
import { readStoreToken } from './lib/store-token.mjs';
import { redact } from './release-redact.mjs';
import { createClient } from './store/client.mjs';
import { TICKET, commandFetch, commandStoreHash } from './store/plan.mjs';
import {
    Stopped, readSpec, storeRoot, takeSnapshot, timeStamp, writeSnapshotFiles,
} from './store/snapshot.mjs';
import {
    SYNC_CHANNELS, WIDGETS_DIR, entriesFor, setPlacementStatus, writeUuids,
} from './widgets/source.mjs';
import {
    PATHS, planSync, recordUuids, storeChannelProblems,
} from './widgets/sync.mjs';

export const USAGE = [
    'usage: node scripts/widgets-sync.mjs --channel <id> --ticket <NN> [--widget <name>]... [--only content|placement | --unpublish <name>]',
    '       node scripts/widgets-sync.mjs --channel <id> --record [--widget <name>]...',
].join('\n');
const MAIN_CLONE = '~/reelflies/theme/cornerstone';

export function parseArgs(argv) {
    const options = {
        channel: null, ticket: null, widgets: [], only: 'all', unpublish: null, record: false,
    };
    let channelGiven = false;
    let onlyGiven = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${arg} needs ${arg === '--channel' ? 'a channel id' : 'a value'}`);
            i += 1;
            return argv[i];
        };
        if (arg === '--channel') {
            if (channelGiven) throw new Error('--channel is given twice: one channel id per run');
            channelGiven = true;
            const id = value();
            if (!/^[1-9]\d*$/.test(id)) throw new Error(`one channel id per run: --channel takes one number, not ${JSON.stringify(id)}`);
            options.channel = Number(id);
        } else if (arg === '--ticket') {
            options.ticket = value();
            if (!TICKET.test(options.ticket)) throw new Error(`--ticket ${JSON.stringify(options.ticket)} isn't a ticket, such as 46 or W0-11`);
        } else if (arg === '--widget') {
            options.widgets.push(value());
        } else if (arg === '--only') {
            onlyGiven = true;
            options.only = value();
            if (!['content', 'placement'].includes(options.only)) throw new Error('--only takes content or placement');
        } else if (arg === '--unpublish') {
            options.unpublish = value();
        } else if (arg === '--record') {
            options.record = true;
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    if (!channelGiven) throw new Error('--channel is required: one channel id per run, with no default, so channel 1 is only ever targeted on purpose (ticket 53)');
    if (!SYNC_CHANNELS.includes(options.channel)) {
        throw new Error(`channel ${options.channel} isn't a sync target (${SYNC_CHANNELS.join(', ')}): ticket 53 adds channel 1, whose widget writes are Shaun's to approve`);
    }
    if (options.record && (onlyGiven || options.unpublish)) throw new Error('--record only reads the channel and writes the uuids into the channel files: it takes no --only or --unpublish');
    if (options.unpublish && onlyGiven) throw new Error('--unpublish can\'t be combined with --only: it plans only the placement\'s status');
    if (!options.record && !options.ticket) throw new Error('--ticket is required: the ticket the writes are for, which labels the store-write helper\'s log rows');
    return options;
}

// The channel's widget templates, widgets and placements, every page of each, with GETs only.
export async function readChannel(client, channel) {
    const spec = object => readSpec({
        path: PATHS[object], query: { 'channel_id:in': channel }, object, scope: 'channel', check: 'none', paginate: true,
    });
    const snapshot = await takeSnapshot(client, ['widget-templates', 'widgets', 'placements'].map(spec));
    const [templates, widgets, placements] = snapshot.reads.map(record => record.data || []);
    return { snapshot, store: { templates, widgets, placements } };
}

function writeChanges(root, {
    channel, ticket, now, snapshot, requests,
}) {
    const file = path.join(root, 'changes', `${timeStamp(now)}-widgets-${channel}-${ticket}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const changes = {
        about: 'Requests from scripts/widgets-sync.mjs (ticket 46), for the store-write helper: plan.mjs, then apply.mjs.',
        channel,
        ticket,
        created: now.toISOString(),
        snapshot_sha256: snapshot.sha256,
        requests,
    };
    fs.writeFileSync(file, `${JSON.stringify(changes, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return file;
}

export async function main(argv, {
    env = process.env, widgetsRoot = WIDGETS_DIR, say = line => console.log(line), now = new Date(),
} = {}) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        say(`${USAGE}\n  ${error.message}`);
        return 2;
    }
    const secrets = [];
    const print = line => say(redact(line, secrets));
    const { channel } = options;
    try {
        const root = storeRoot(env);
        const names = options.unpublish ? [options.unpublish] : options.widgets;
        const entries = entriesFor(channel, { root: widgetsRoot, names });
        if (!entries.length) {
            print(`No widget in widgets/ has a channels/${channel}.json: nothing to sync.`);
            return 0;
        }
        const { token, source } = readStoreToken('read', { env });
        secrets.push(token);
        print(`Reading channel ${channel}'s widget templates, widgets and placements with ${source} (GET only)...`);
        const storeHash = await commandStoreHash(env);
        const client = createClient({
            storeHash, token, fetch: await commandFetch(root, env), readOnly: true,
        });
        const { snapshot, store } = await readChannel(client, channel);
        const channelProblems = storeChannelProblems(store, channel);
        if (channelProblems.length) throw new Stopped(channelProblems.join('\n'), { channel: true });
        const files = writeSnapshotFiles(root, { channel, label: 'widgets-sync', now }, snapshot);
        print('');
        print(`widget-templates: ${store.templates.length} on channel ${channel}; widgets: ${store.widgets.length}; placements: ${store.placements.length}`);
        files.forEach(file => print(`snapshot ${file.file}`));
        print(`sha256   ${snapshot.sha256}`);
        print('');

        if (options.record) {
            const results = recordUuids({ channel, entries, store });
            const problems = results.flatMap(result => result.problems);
            if (problems.length) throw new Stopped([...new Set(problems)].join('\n'));
            for (const { entry, uuids, changed } of results) {
                if (changed) writeUuids(entry.channelFile, uuids);
                print(`${changed ? 'recorded' : 'already '} ${entry.channelFile.where}: template ${uuids.template}, widget ${uuids.widget}, placement ${uuids.placement}`);
            }
            if (results.some(result => result.changed)) print('Commit the channel files: they are the record of what the store holds.');
            return 0;
        }

        const { requests, lines, problems } = planSync({
            channel, entries, store, only: options.only, unpublish: options.unpublish,
        });
        lines.forEach(print);
        if (problems.length) {
            print('');
            problems.forEach(problem => print(`STOP     ${problem}`));
            print('Nothing was written: no changes file.');
            return 1;
        }
        print('');
        if (!requests.length) {
            print(`Channel ${channel} is in step with the repo: nothing to write.`);
            return 0;
        }
        if (options.unpublish) {
            setPlacementStatus(entries[0].channelFile, 'inactive');
            print(`placement status set to "inactive" in ${entries[0].channelFile.where}: commit it with the apply`);
        }
        const file = writeChanges(root, {
            channel, ticket: options.ticket, now, snapshot, requests,
        });
        print(`changes  ${file} (${requests.length} request${requests.length === 1 ? '' : 's'}, each with channel_id ${channel})`);
        print('Nothing was written to the store. The store-write helper makes the writes, from the main clone at origin/master:');
        print(`Next: node ${MAIN_CLONE}/scripts/store/plan.mjs --ticket ${options.ticket} --changes ${file}`);
        print(`Then: review its diff, apply.mjs --dry-run, apply.mjs, and node scripts/widgets-sync.mjs --channel ${channel} --record (docs/widgets.md).`);
        return 0;
    } catch (error) {
        error.message.split('\n').forEach(line => print(`STOP     ${line}`));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
