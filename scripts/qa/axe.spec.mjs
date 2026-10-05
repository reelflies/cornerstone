// axe on every pinned template at 375 and 1280 (spec Testing Decisions, seam 3;
// ticket 16): no serious or critical issues, apart from the stock issues listed in
// axe-known-issues.mjs with the ticket that fixes each.
//
//   npm run qa:axe

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, expect, storefrontPage, test,
} from './fixtures.mjs';
import { KNOWN_ISSUES, knownIssue } from './axe-known-issues.mjs';

// WCAG 2.0 to 2.2, A and AA, plus axe's best practices.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = ['serious', 'critical'];

const describe = violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.length} element(s): ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`;

for (const [template, pagePath] of Object.entries(PAGES)) {
    test(`${template} (${pagePath}) has no serious or critical axe issues`, async ({ page }, testInfo) => {
        await storefrontPage(page, pagePath);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => BLOCKING.includes(violation.impact));

        const known = blocking.filter(violation => knownIssue(violation.id, template));
        known.forEach(violation => testInfo.annotations.push({
            type: 'known axe issue',
            description: `${describe(violation)}; ticket ${knownIssue(violation.id, template).ticket} fixes it`,
        }));
        KNOWN_ISSUES.filter(issue => issue.templates.includes(template) && !blocking.some(violation => violation.id === issue.rule))
            .forEach(issue => testInfo.annotations.push({ type: 'fixed', description: `${issue.rule} no longer occurs on ${template}: remove it from axe-known-issues.mjs` }));

        const unexpected = blocking.filter(violation => !knownIssue(violation.id, template)).map(describe);
        expect(unexpected, `serious or critical axe issues on ${template} at ${testInfo.project.name}`).toEqual([]);
    });
}
