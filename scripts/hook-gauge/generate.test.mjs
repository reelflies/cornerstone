// The gauge generator (ticket 35; redesign step 3): templates/components/reelflies/chart-gauge.html,
// the hook size chart's gauge, and the home band's copy of master's gauge for ticket 49's widget,
// widgets/_shared/hook-gauge-band.html, are written by scripts/hook-gauge/generate.mjs from the
// calibration, and CI fails when either committed file and the generator disagree. Master's
// hook-gauge.html, which the generator wrote until the redesign, is gone with the stock chart.
//
//   node --test scripts/hook-gauge/generate.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readCalibration } from './geometry.mjs';
import { WIDGET_PARTIAL_FILE, partialSource, widgetPartialSource } from './gauge.mjs';
import { CHART_PARTIAL_FILE, chartGaugeSource, hookInclude } from './generate.mjs';
import { CHART_SIZES } from './sizes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATE = path.join(HERE, 'generate.mjs');
const run = (...args) => spawnSync(process.execPath, [GENERATE, ...args], { encoding: 'utf8' });
const scratches = [];
const scratch = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-hook-gauge-'));
    scratches.push(dir);
    return dir;
};
after(() => scratches.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('the chart gauge (components/reelflies/chart-gauge.html)', () => {
    it('is committed exactly as the generator writes it', () => {
        assert.equal(path.relative(path.join(HERE, '..', '..'), CHART_PARTIAL_FILE), path.join('templates', 'components', 'reelflies', 'chart-gauge.html'));
        assert.equal(
            fs.readFileSync(CHART_PARTIAL_FILE, 'utf8'),
            chartGaugeSource(),
            'templates/components/reelflies/chart-gauge.html differs from the generator: run node scripts/hook-gauge/generate.mjs and commit both',
        );
    });

    it('opens with the partial\'s own comment, which never reaches the page, then the figure', () => {
        const source = chartGaugeSource();
        assert.match(source, /^\{\{!--\n {4}The hook size chart's gauge/);
        assert.match(source, /--\}\}\n<figure class="rf-gauge">\n/);
        assert.match(source, /<\/figure>\n$/);
    });

    it('includes the hook partial once per chart size, 6/0 to 24, with its slug and its calibrated length', () => {
        const { lengths } = readCalibration();
        const includes = [...chartGaugeSource().matchAll(/\{\{> components\/reelflies\/hook ([^}]*)\}\}/g)].map(match => match[1]);
        assert.equal(includes.length, CHART_SIZES.length);
        CHART_SIZES.forEach((size, index) => {
            assert.equal(includes[index], `size='${size}' slug='${size.replace('/', '-')}' len=${lengths[size]} here=1`);
        });
        assert.equal(hookInclude('6/0', 42), "{{> components/reelflies/hook size='6/0' slug='6-0' len=42 here=1}}");
        assert.equal(hookInclude('14', 10.5), "{{> components/reelflies/hook size='14' slug='14' len=10.5 here=1}}");
    });

    it('is the same on every run', () => {
        assert.equal(chartGaugeSource(), chartGaugeSource());
    });

    it('follows the calibration: a changed length changes that hook\'s len', () => {
        const calibration = readCalibration();
        const changed = chartGaugeSource({ ...calibration, lengths: { ...calibration.lengths, 14: 11 } });
        assert.notEqual(changed, chartGaugeSource());
        assert.match(changed, /size='14' slug='14' len=11 here=1/);
        assert.equal(changed.replace('len=11 here', 'len=10.5 here'), chartGaugeSource(), 'nothing else moves');
    });

    it('refuses to write a calibration that draws a bigger number as a bigger hook', () => {
        const calibration = readCalibration();
        assert.throws(() => chartGaugeSource({ ...calibration, lengths: { ...calibration.lengths, 24: 20 } }), /22 \(6 mm\) must be longer than 24 \(20 mm\)/);
    });
});

// The band's own copy for ticket 49's widget (widgets/hook-sizes): a widget template can't include
// a theme partial, so the sync pastes this _shared partial in place (scripts/widgets/paste.mjs).
// It is the band branch of master's two-layout partial, which gauge.mjs still builds for it.
const bandBranch = source => source.split("{{#if gauge_layout '===' 'band'}}\n")[1].split('\n{{else}}')[0];
const withoutHeader = source => source.replace(/^\{\{!--[\s\S]*?--\}\}\n/, '');

describe('the generated widget partial (ticket 49\'s hook band)', () => {
    it('is committed exactly as the generator writes it, in widgets/_shared/', () => {
        assert.equal(path.relative(path.join(HERE, '..', '..'), WIDGET_PARTIAL_FILE), path.join('widgets', '_shared', 'hook-gauge-band.html'));
        assert.equal(
            fs.readFileSync(WIDGET_PARTIAL_FILE, 'utf8'),
            widgetPartialSource(),
            'widgets/_shared/hook-gauge-band.html differs from the generator: run node scripts/hook-gauge/generate.mjs and commit both',
        );
    });

    it('says it is generated, and how to change it, in a comment the sync empties before upload', () => {
        const [first] = widgetPartialSource().split('\n');
        assert.match(first, /^\{\{!--.*generated by scripts\/hook-gauge\/generate\.mjs/i);
        assert.match(widgetPartialSource(), /--\}\}\n<div class="rf-hook-gauge rf-hook-gauge--band"/);
    });

    it('is master\'s band layout, markup for markup, and nothing of the chart\'s', () => {
        assert.equal(withoutHeader(widgetPartialSource()), `${bandBranch(partialSource())}\n`);
        assert.doesNotMatch(widgetPartialSource(), /gauge_layout|rf-hook-gauge--chart|href="#size-/);
    });

    it('follows the calibration, as the chart gauge does', () => {
        const calibration = readCalibration();
        const changed = widgetPartialSource({ ...calibration, lengths: { ...calibration.lengths, 14: 11 } });
        assert.notEqual(changed, widgetPartialSource());
        // 11 mm at the band's 3 px/mm, where 10.5 mm drew 31.5 px.
        assert.match(changed, /href="\/fly-hook-size-chart\/#size-14"[\s\S]*?width="33"/);
        assert.throws(() => widgetPartialSource({ ...calibration, lengths: { ...calibration.lengths, 24: 20 } }), /22 \(6 mm\) must be longer than 24 \(20 mm\)/);
    });
});

describe('generate.mjs', () => {
    it('--check passes on the committed partials and writes nothing', () => {
        const before = [CHART_PARTIAL_FILE, WIDGET_PARTIAL_FILE].map(file => fs.statSync(file).mtimeMs);
        const { status, stdout } = run('--check');
        assert.equal(status, 0, stdout);
        assert.match(stdout, /up to date templates\/components\/reelflies\/chart-gauge\.html/);
        assert.match(stdout, /up to date widgets\/_shared\/hook-gauge-band\.html/);
        assert.deepEqual([CHART_PARTIAL_FILE, WIDGET_PARTIAL_FILE].map(file => fs.statSync(file).mtimeMs), before);
    });

    it('--check fails on a chart gauge edited by hand, and says how to fix it', () => {
        const file = path.join(scratch(), 'chart-gauge.html');
        fs.writeFileSync(file, chartGaugeSource().replace("size='6/0'", "size='6/0 '"));
        const { status, stderr } = run('--check', '--file', file);
        assert.equal(status, 1);
        assert.match(stderr, /chart-gauge\.html differs from the generator/);
        assert.match(stderr, /node scripts\/hook-gauge\/generate\.mjs/);
    });

    it('writes the chart gauge, then --check passes on it', () => {
        const file = path.join(scratch(), 'chart-gauge.html');
        const written = run('--file', file);
        assert.equal(written.status, 0, written.stderr);
        assert.equal(fs.readFileSync(file, 'utf8'), chartGaugeSource());
        assert.equal(run('--check', '--file', file).status, 0);
    });

    it('--calibration draws from another calibration file', () => {
        const dir = scratch();
        const calibration = readCalibration();
        const other = path.join(dir, 'calibration.json');
        fs.writeFileSync(other, JSON.stringify({ ...calibration, lengths: { ...calibration.lengths, 14: 11 } }));
        const file = path.join(dir, 'chart-gauge.html');
        const written = run('--calibration', other, '--file', file);
        assert.equal(written.status, 0, written.stderr);
        assert.equal(fs.readFileSync(file, 'utf8'), chartGaugeSource(readCalibration(other)));
        assert.equal(run('--check', '--file', file).status, 1, 'the committed calibration draws a different gauge');
    });

    it('ends in one message naming the problem, not a stack trace, when the calibration can\'t be read or drawn', () => {
        const dir = scratch();
        const calibration = readCalibration();
        const bad = path.join(dir, 'bad.json');
        fs.writeFileSync(bad, JSON.stringify({ ...calibration, lengths: { ...calibration.lengths, 24: 20 } }));
        const drawn = run('--check', '--calibration', bad);
        assert.equal(drawn.status, 1);
        assert.match(drawn.stderr, /^generate\.mjs: the hook gauge calibration can't be drawn:\n- 22 \(6 mm\) must be longer than 24 \(20 mm\)/);
        assert.doesNotMatch(drawn.stderr, /\n\s+at /);
        const broken = path.join(dir, 'broken.json');
        fs.writeFileSync(broken, '{ "unit": ');
        const unread = run('--calibration', broken, '--file', path.join(dir, 'chart-gauge.html'));
        assert.equal(unread.status, 1);
        assert.match(unread.stderr, /^generate\.mjs: can't read the hook gauge calibration .*broken\.json: /);
        assert.equal(fs.existsSync(path.join(dir, 'chart-gauge.html')), false, 'nothing is written');
    });

    it('--widget-file writes or checks only the widget partial, and --file only the chart gauge', () => {
        const dir = scratch();
        const widgetFile = path.join(dir, 'hook-gauge-band.html');
        const before = [CHART_PARTIAL_FILE, WIDGET_PARTIAL_FILE].map(file => fs.statSync(file).mtimeMs);
        const written = run('--widget-file', widgetFile);
        assert.equal(written.status, 0, written.stderr);
        assert.equal(fs.readFileSync(widgetFile, 'utf8'), widgetPartialSource());
        assert.doesNotMatch(written.stdout, /chart-gauge\.html/, 'the chart gauge isn\'t written');
        assert.equal(run('--check', '--widget-file', widgetFile).status, 0);
        const chartFile = path.join(dir, 'chart-gauge.html');
        const chart = run('--file', chartFile);
        assert.equal(chart.status, 0);
        assert.doesNotMatch(chart.stdout, /hook-gauge-band\.html/, 'the widget partial isn\'t written');
        assert.equal(fs.existsSync(chartFile), true);
        assert.deepEqual([CHART_PARTIAL_FILE, WIDGET_PARTIAL_FILE].map(file => fs.statSync(file).mtimeMs), before, 'a run naming a file leaves the committed files alone');
    });

    it('--check fails on a widget partial edited by hand, naming it, and says how to fix it', () => {
        const file = path.join(scratch(), 'hook-gauge-band.html');
        fs.writeFileSync(file, widgetPartialSource().replace('>20</span>', '>20 </span>'));
        const { status, stderr } = run('--check', '--widget-file', file);
        assert.equal(status, 1);
        assert.match(stderr, /hook-gauge-band\.html differs from the generator/);
        assert.match(stderr, /node scripts\/hook-gauge\/generate\.mjs/);
    });

    it('refuses an unknown argument', () => {
        const { status, stderr } = run('--force');
        assert.equal(status, 2);
        assert.match(stderr, /unknown argument --force \(--check, --file <path>, --widget-file <path>, --calibration <path>\)/);
    });
});
