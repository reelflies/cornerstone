#!/usr/bin/env node
// Writes templates/components/reelflies/hook-gauge.html from the hook gauge's calibration and
// geometry (ticket 35). The partial is never edited by hand: generate.test.mjs fails CI when
// the committed file and this generator disagree.
//
//   node scripts/hook-gauge/generate.mjs           # write the partial
//   node scripts/hook-gauge/generate.mjs --check   # exit 1 if the committed partial differs
//
// `--file <path>` writes or checks another file instead (the tests use it).

import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import { PARTIAL_FILE, partialSource } from './gauge.mjs';

const THEME_DIR = path.resolve(path.dirname(PARTIAL_FILE), '..', '..', '..');
const shown = file => path.relative(THEME_DIR, file) || file;
const FIX = 'run node scripts/hook-gauge/generate.mjs, and commit the partial with the calibration or generator change';

export function parseArgs(argv) {
    const args = { check: false, file: PARTIAL_FILE };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--check') args.check = true;
        else if (argv[i] === '--file' && argv[i + 1]) args.file = path.resolve(argv[(i += 1)]);
        else throw new Error(`unknown argument ${argv[i]} (--check, --file <path>)`);
    }
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
    const source = partialSource();
    if (args.check) {
        const current = fs.existsSync(args.file) ? fs.readFileSync(args.file, 'utf8') : null;
        if (current === source) {
            console.log(`up to date ${shown(args.file)}`);
            return 0;
        }
        console.error(`${shown(args.file)} ${current === null ? "doesn't exist" : 'differs from the generator'}: ${FIX}`);
        return 1;
    }
    fs.mkdirSync(path.dirname(args.file), { recursive: true });
    fs.writeFileSync(args.file, source);
    console.log(`wrote ${shown(args.file)} (${Buffer.byteLength(source)} bytes)`);
    return 0;
}

if (isMain(import.meta.url)) process.exitCode = main();
