// A search with no results when the platform offers suggestions (ticket 51; spec module 24; O20;
// stories 66, 68 and 71), at 375 and 1280, on the fixture page: the real search page rendered
// round render/pages/search-empty/fixtures/suggestions.json ("cadis": no products, "Did you mean
// caddis" and one category, tree 4's menu ids). The live pins (search@none, dead-ends.spec.mjs)
// get the store's own suggestion, whose words follow the store's content, so their shots hold the
// panel; and the store decides when it suggests, so the case with categories in the panel, and the
// same search with no panel at all, are checked here, from fixed data.
//
// - The page's content matches its baseline (widget baselines, declared as `widget search-empty`).
// - The help shows once, above stock's panel, with suggestions and without: the no-match line
//   naming the query, the tip, and the six Fly Types and Flies by Species in menu order; stock's
//   "Did you mean" and categories stay, its own no-match line and tips don't show.
// - Nothing scrolls sideways at 320, and every link pill fits the viewport (story 71).
// - axe finds no serious or critical issue in the page's content.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs search-empty-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { THEME_DIR, widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the search renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8'));
const SUGGESTIONS = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'search-empty' && name === 'suggestions');
if (!SUGGESTIONS) throw new Error('render/pages/search-empty/fixtures/suggestions.json is missing');
// The same search without the platform's panel, for the behaviour checks (no shot of its own).
const withoutSuggestions = () => {
    const fixture = structuredClone(SUGGESTIONS.fixture);
    Object.assign(fixture.page_context.forms.search, { has_suggestions: false, suggested_query: null });
    fixture.page_context.category_results = [];
    return { ...SUGGESTIONS, fixture };
};
const LINKS = ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies', 'Flies by Species'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
// The phone header is sticky, so in a shot further down it could lie over the content.
const SHOT_STYLE = '[data-rf-header] { position: static !important; }';

async function open(page, widgetCase = SUGGESTIONS) {
    const { problems } = await openWidget(page, widgetCase, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('widget search-empty: a search with no results', () => {
    test('matches its baseline', async ({ page }) => {
        await open(page);
        await page.addStyleTag({ content: SHOT_STYLE });
        await expect(page.locator('main.page-content')).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'search-empty-suggestions.png']);
    });

    for (const [label, widgetCase] of [['with the platform\'s suggestions', () => SUGGESTIONS], ['without them', withoutSuggestions]]) {
        test(`shows the help once, ${label}: the no-match line, the tip and the Fly Type links in menu order`, async ({ page }) => {
            await open(page, widgetCase());
            const help = page.locator('main [data-rf-search-empty]');
            await expect(help).toHaveCount(1);
            await expect(help.locator('[data-rf-search-empty-line]')).toHaveText(LANG.reelflies.search_empty.no_match.replace('{query}', 'cadis'));
            await expect(help).toContainText(LANG.reelflies.search_empty.tip);
            await expect(help.locator('[data-rf-dead-end-links] a')).toHaveText(LINKS);
            const main = page.locator('main.page-content');
            await expect(main).not.toContainText(LANG.forms.search.suggestions.title);
            await expect(main).not.toContainText(LANG.forms.search.no_match);
            if (widgetCase === withoutSuggestions) {
                await expect(main.locator('.search-suggestion')).toHaveCount(0);
            } else {
                await expect(main.locator('.search-refine')).toHaveCount(1);
                const order = await main.evaluate(element => [element.querySelector('[data-rf-search-empty]'), element.querySelector('.panel')]
                    .map(found => [...element.querySelectorAll('*')].indexOf(found)));
                expect(order[0], 'the help comes before stock\'s panel').toBeLessThan(order[1]);
            }
        });
    }

    test('the links are bordered pills, at least 40px tall, and nothing scrolls sideways at 320 (story 71)', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'phone-375', 'the viewport is set here, once');
        await page.setViewportSize({ width: 320, height: 640 });
        await open(page);
        const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(widths.scroll, `the page is ${widths.scroll}px wide in a ${widths.client}px viewport`).toBeLessThanOrEqual(widths.client);
        const pills = await page.locator('[data-rf-dead-end-links] a').evaluateAll(links => links.map(link => {
            const box = link.getBoundingClientRect();
            const style = getComputedStyle(link);
            return {
                right: box.right, height: box.height, border: `${style.borderTopWidth} ${style.borderTopStyle}`, radius: parseFloat(style.borderTopLeftRadius),
            };
        }));
        for (const pill of pills) {
            expect(pill.right).toBeLessThanOrEqual(320);
            expect(pill.height).toBeGreaterThanOrEqual(40);
            expect(pill.border).toBe('1px solid');
            expect(pill.radius).toBeGreaterThanOrEqual(20);
        }
    });

    test('axe finds no serious or critical issue in the page\'s content', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('main.page-content').withTags(TAGS).analyze();
        const serious = violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
        expect(serious.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(' ')).join('; ')})`)).toEqual([]);
    });
});
