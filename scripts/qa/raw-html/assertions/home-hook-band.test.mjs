// Tests the hatch chart and hook scale's raw-HTML assertion (redesign step 2; ticket 49's hook
// band rules), home-hook-band, on the redesign's home page rendered from fixed data
// (../home-fixture.mjs), with each promise broken once.
//
//   node --test scripts/qa/raw-html/assertions/home-hook-band.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { homePage } from '../home-fixture.mjs';
import hookBand, { SIZES, anchorOf, hookBandProblems } from './home-hook-band.mjs';

const page = await homePage();
const failures = fixture => checkPage(fixture, [hookBand]).filter(result => result.status === 'fail');
function edited(from, to, html = page.html) {
    assert.ok(typeof from === 'string' ? html.includes(from) : from.test(html), `the fixture has ${from}`);
    return { ...page, html: html.replace(from, to) };
}
const problems = html => hookBandProblems(html).join('\n');
const now = Number(page.html.match(/--rf-now: (\d+)/)[1]);

test('it is registered, for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-hook-band'));
    assert.deepEqual(hookBand.pages, ['home']);
    assert.equal(hookBand.ticket, 49);
});

test('the home page as the theme renders it passes: ten rows, twelve months with this one lit, fourteen hooks', () => {
    assert.deepEqual(hookBandProblems(page.html), []);
    assert.deepEqual(failures(page), []);
    assert.equal(page.html.match(/<li class="rf-hatch__row/g).length, 10);
    assert.ok(now >= 0 && now <= 11);
    assert.equal(page.html.match(/#size-/g).length, 14);
    assert.equal(SIZES.length, 14);
    assert.equal(anchorOf('2/0'), 'size-2-0');
    assert.equal(anchorOf('24'), 'size-24');
});

test('a page without the hatch chart passes: the band is left out with no data', () => {
    assert.deepEqual(hookBandProblems('<main><section class="rf-stone"></section></main>'), []);
});

test('the chart is #hatch, carries data-rf-hatch, and is named by its one <h2> with the server\'s month', () => {
    const id = edited('id="hatch" aria-labelledby="rf-hatch-title" data-rf-hatch>', 'id="hatches" aria-labelledby="rf-hatch-title">');
    assert.match(problems(id.html), /is id="hatches", not "hatch"[\s\S]*has no data-rf-hatch/);
    const noMonth = edited(/<span data-rf-now-month>[^<]*<\/span>/, '');
    assert.match(problems(noMonth.html), /heading has no month \(\[data-rf-now-month\] with text\)/);
    const noList = edited(/<p class="rf-hatch__now" data-rf-now-list>[^<]*<\/p>/, '<p class="rf-hatch__now" data-rf-now-list></p>');
    assert.match(problems(noList.html), /has no "on the water" line/);
    const twoH2 = edited('<header class="rf-hatch__intro">', '<header class="rf-hatch__intro"><h2>Hatches</h2>');
    assert.match(problems(twoH2.html), /the hatch chart has 2 <h2> elements/);
});

test('the month heads are twelve, 0 to 11, one lit as --rf-now says, each with the "Now" label', () => {
    const unlit = { ...page, html: page.html.replace(/class="rf-months__m is-now"/, 'class="rf-months__m"') };
    assert.match(problems(unlit.html), new RegExp(`lights 0 month head\\(s\\) \\(\\): one, the --rf-now month ${now}`));
    const other = { ...page, html: page.html.replace(`style="--rf-now: ${now}"`, `style="--rf-now: ${(now + 1) % 12}"`) };
    assert.match(problems(other.html), new RegExp(`lights 1 month head\\(s\\) \\(${now}\\): one, the --rf-now month ${(now + 1) % 12}`));
    const noNow = edited(`style="--rf-now: ${now}"`, '');
    assert.match(problems(noNow.html), /chart has no --rf-now month/);
    const eleven = edited(/<span class="rf-months__m[^"]*" data-rf-m="11" data-rf-now-label="Now"><abbr title="December">Dec<\/abbr><\/span>/, '');
    assert.match(problems(eleven.html), /month heads are data-rf-m 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10: twelve, 0 to 11/);
    const unlabelled = { ...page, html: page.html.replace(/ data-rf-now-label="Now"/g, '') };
    assert.match(problems(unlabelled.html), /month heads carry no data-rf-now-label/);
});

test('each row has its name, its runs, a labelled track of twelve months and, with flies, a <details>', () => {
    const runs = edited('data-rf-runs="0-11"', 'data-rf-runs="all year"');
    assert.match(problems(runs.html), /row 1 \(Midges\)'s data-rf-runs is "all year", not its months as a-b or a-b,c-d/);
    const track = edited('<span class="rf-track" role="img" aria-label="On the water all year">', '<span class="rf-track">');
    assert.match(problems(track.html), /row 1 \(Midges\)'s track isn't role="img" with an aria-label/);
    const closed = edited('<summary class="rf-hatch__sum">', '<div class="rf-hatch__sum">');
    closed.html = closed.html.replace('</summary>', '</div>');
    assert.match(problems(closed.html), /row 1 \(Midges\) has flies but isn't a <details> with a <summary>/);
    const unnamed = edited('<span class="rf-hatch__title">Midges</span>', '<span class="rf-hatch__title"></span>');
    assert.match(problems(unnamed.html), /row 1 has no name/);
    const sizes = edited('<div class="rf-hatch__flies">', '<div class="rf-hatch__flies"><a href="/fly-sizes/18/">Size 18</a>');
    assert.match(problems(sizes.html), /row 1 \(Midges\) links to \/fly-sizes\/18\/, a hidden size category \(SEO-6\)/);
});

test('the hook scale shows every size from 2/0 to 24 in order, each an inline hook hidden from screen readers', () => {
    const dropped = edited(/<li><a href="[^"]*#size-24">[\s\S]*?<\/a><\/li>/, '');
    assert.match(problems(dropped.html), /shows 2\/0, 1\/0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22: it shows 2\/0, 1\/0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, in that order/);
    const readable = edited('style="height:64px" aria-hidden="true"', 'style="height:64px"');
    assert.match(problems(readable.html), /hook 2\/0 draws its hook without aria-hidden="true"/);
    const noWord = edited('<span class="rf-num">2/0</span><span class="is-srOnly"> hook size</span>', '<span class="rf-num">2/0</span>');
    assert.match(problems(noWord.html), /hook 2\/0 has no screen-reader word/);
    const noHeading = edited('<h3>Bigger number, smaller hook.</h3>', '');
    assert.match(problems(noHeading.html), /the hook scale has no <h3> heading/);
});

test('with the chart page set, each size links to its row there and nothing in the scale links anywhere else', async () => {
    const wrongRow = edited('#size-2-0"', '#size-20"');
    assert.match(problems(wrongRow.html), /hook 2\/0 links to \/fly-hook-size-chart\/#size-20, not its row \/fly-hook-size-chart\/#size-2-0/);
    const elsewhere = edited('<a href="/fly-hook-size-chart/#size-2-0">', '<a href="/flies/dry-flies/#size-2-0">');
    assert.match(problems(elsewhere.html), /hook 2\/0 links to \/flies\/dry-flies\/#size-2-0, not its row[\s\S]*the hook scale links to \/flies\/dry-flies\/#size-2-0: every link in it goes to the chart page/);
    const facet = edited('</p>\n            <a class="rf-more" href="/fly-hook-size-chart/">', '</p><a href="/search.php?Fly+Sizes=12&_bc_fsnf=1">Size 12</a>\n            <a class="rf-more" href="/fly-hook-size-chart/">');
    assert.match(problems(facet.html), /the hook scale links to \/search\.php\?Fly\+Sizes=12&_bc_fsnf=1: every link in it goes to the chart page/);
    const plain = await homePage({ theme_settings: { rf_hook_chart_url: '' } });
    assert.ok(!plain.html.includes('#size-'), 'with no chart page, no size links');
    assert.deepEqual(hookBandProblems(plain.html), []);
    const linked = { ...plain, html: plain.html.replace('<li><span><svg class="rf-hook"', '<li><a href="/fly-sizes/2-0/"><svg class="rf-hook"').replace('<span class="is-srOnly"> hook size</span></span></li>', '<span class="is-srOnly"> hook size</span></a></li>') };
    assert.match(problems(linked.html), /hook 2\/0 is a link with no chart page set/);
});
