#!/usr/bin/env node
// Writes the hook size chart's gauge, templates/components/reelflies/chart-gauge.html, from the
// calibration (ticket 35; redesign step 3), and the home band's copy of master's gauge for
// ticket 49's widget, widgets/_shared/hook-gauge-band.html. generate.test.mjs fails CI when a
// committed file and this generator disagree.
//
//   node scripts/hook-gauge/generate.mjs           # write both
//   node scripts/hook-gauge/generate.mjs --check   # exit 1 if either committed file differs
//
// The chart gauge is the redesign's: every size from 6/0 to 24 as one include of
// components/reelflies/hook.html with its length in millimetres (calibration.json), which the
// style layer draws at one scale. Until the redesign the generator wrote master's
// hook-gauge.html (inline SVG, two layouts; gauge.mjs still builds that markup for the widget),
// and chart-gauge.html was kept in step with the calibration by hand; now a calibration change
// is one run of this script. The partial's own header comment still describes the hand copy
// (it is theme code, so it changes with the theme).
//
// `--file <path>` writes or checks the chart gauge at another path, and `--widget-file <path>`
// the widget partial; naming either writes or checks only the files named, so a run on a
// scratch file never touches the committed ones. `--calibration <path>` draws from another
// calibration (the tests use all three).

import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import { WIDGET_PARTIAL_FILE, widgetPartialSource } from './gauge.mjs';
import { CALIBRATION_FILE, checkCalibration, readCalibration } from './geometry.mjs';
import { CHART_SIZES, anchorId } from './sizes.mjs';

export const CHART_PARTIAL = 'components/reelflies/chart-gauge';
export const CHART_PARTIAL_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'templates', `${CHART_PARTIAL}.html`);
const THEME_DIR = path.resolve(path.dirname(CHART_PARTIAL_FILE), '..', '..', '..');
const shown = file => path.relative(THEME_DIR, file) || file;
const FIX = 'run node scripts/hook-gauge/generate.mjs, and commit what it writes with the calibration or generator change';

// The partial's header, as committed (the theme's words, kept byte for byte).
const CHART_HEADER = `{{!--
    The hook size chart's gauge (ticket 35; spec module 22; DESIGN.md "Hook Scale"): every size
    from 6/0 to 24 drawn as the authored hook at one scale, largest first, its bend on one line,
    each linking to its row below (#size-6-0 … #size-24). Server-rendered; no script.

    Written by scripts/hook-gauge/generate.mjs from scripts/hook-gauge/calibration.json (the lengths
    in mm, a standard-length hook, eye to bend; "provisional" until the owner checks them against
    the Mustad chart): change the calibration or the generator, run it, and commit the result
    (\`generate.mjs --check\` fails a copy that differs). The caption says the drawing is relative,
    not actual size.
--}}`;

// One size's include: the hook partial with the size, its row's anchor slug and its length.
export const hookInclude = (size, length) => `{{> components/reelflies/hook size='${size}' slug='${anchorId(size).replace(/^size-/, '')}' len=${length} here=1}}`;

// templates/components/reelflies/chart-gauge.html, as generate.mjs writes it.
export function chartGaugeSource(calibration = readCalibration()) {
    const { lengths } = checkCalibration(calibration);
    return [
        CHART_HEADER,
        '<figure class="rf-gauge">',
        '    <ol class="rf-gauge__hooks" aria-label="{{lang \'reelflies.chart.gauge_label\'}}">',
        `        ${CHART_SIZES.map(size => hookInclude(size, lengths[size])).join('')}`,
        '    </ol>',
        '    <figcaption class="rf-gauge__caption">{{lang \'reelflies.chart.gauge_caption\'}}</figcaption>',
        '</figure>',
        '',
    ].join('\n');
}

// The files a run writes or checks, each with the source it gets: both committed files, or only
// those --file and --widget-file name.
export function parseArgs(argv) {
    const args = { check: false, calibration: CALIBRATION_FILE };
    const named = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--check') args.check = true;
        else if (argv[i] === '--file' && argv[i + 1]) named.chart = path.resolve(argv[(i += 1)]);
        else if (argv[i] === '--widget-file' && argv[i + 1]) named.widget = path.resolve(argv[(i += 1)]);
        else if (argv[i] === '--calibration' && argv[i + 1]) args.calibration = path.resolve(argv[(i += 1)]);
        else throw new Error(`unknown argument ${argv[i]} (--check, --file <path>, --widget-file <path>, --calibration <path>)`);
    }
    const files = Object.keys(named).length ? named : { chart: CHART_PARTIAL_FILE, widget: WIDGET_PARTIAL_FILE };
    args.targets = Object.entries(files).map(([kind, file]) => ({ file, source: kind === 'widget' ? widgetPartialSource : chartGaugeSource }));
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
