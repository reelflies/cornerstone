#!/usr/bin/env node
// Writes templates/components/reelflies/hook-gauge.html from the hook gauge's calibration and
// geometry (ticket 35), and the home band's copy of it for ticket 49's widget,
// widgets/_shared/hook-gauge-band.html. Neither is edited by hand: generate.test.mjs fails CI
// when a committed file and this generator disagree.
//
//   node scripts/hook-gauge/generate.mjs           # write both
//   node scripts/hook-gauge/generate.mjs --check   # exit 1 if either committed file differs
//
// `--file <path>` writes or checks the theme partial at another path, and `--widget-file <path>`
// the widget partial; naming either writes or checks only the files named, so a run on a
// scratch file never touches the committed ones. `--calibration <path>` draws from another
// calibration (the tests use all three).

import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import {
    PARTIAL_FILE, WIDGET_PARTIAL_FILE, partialSource, widgetPartialSource,
} from './gauge.mjs';
import { CALIBRATION_FILE, readCalibration } from './geometry.mjs';

const THEME_DIR = path.resolve(path.dirname(PARTIAL_FILE), '..', '..', '..');
const shown = file => path.relative(THEME_DIR, file) || file;
const FIX = 'run node scripts/hook-gauge/generate.mjs, and commit what it writes with the calibration or generator change';

// The files a run writes or checks, each with the source it gets: both committed files, or only
// those --file and --widget-file name.
export function parseArgs(argv) {
    const args = { check: false, calibration: CALIBRATION_FILE };
    const named = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--check') args.check = true;
        else if (argv[i] === '--file' && argv[i + 1]) named.partial = path.resolve(argv[(i += 1)]);
        else if (argv[i] === '--widget-file' && argv[i + 1]) named.widget = path.resolve(argv[(i += 1)]);
        else if (argv[i] === '--calibration' && argv[i + 1]) args.calibration = path.resolve(argv[(i += 1)]);
        else throw new Error(`unknown argument ${argv[i]} (--check, --file <path>, --widget-file <path>, --calibration <path>)`);
    }
    const files = Object.keys(named).length ? named : { partial: PARTIAL_FILE, widget: WIDGET_PARTIAL_FILE };
    args.targets = Object.entries(files).map(([kind, file]) => ({ file, source: kind === 'widget' ? widgetPartialSource : partialSource }));
    return args;
}

export function main(argv = process.argv.slice(2)) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (error) {
        console.error(`generate.mjs: ${error.message}`);
        return 2;
    }
    let targets;
    try {
        const calibration = readCalibration(args.calibration);
        targets = args.targets.map(({ file, source }) => ({ file, source: source(calibration) }));
    } catch (error) {
        console.error(`generate.mjs: ${error.message}`);
        return 1;
    }
    if (args.check) {
        let status = 0;
        for (const { file, source } of targets) {
            const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
            if (current === source) {
                console.log(`up to date ${shown(file)}`);
            } else {
                console.error(`${shown(file)} ${current === null ? "doesn't exist" : 'differs from the generator'}: ${FIX}`);
                status = 1;
            }
        }
        return status;
    }
    for (const { file, source } of targets) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, source);
        console.log(`wrote ${shown(file)} (${Buffer.byteLength(source)} bytes)`);
    }
    return 0;
}

if (isMain(import.meta.url)) process.exitCode = main();
