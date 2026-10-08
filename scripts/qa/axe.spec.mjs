// axe on every pinned template at 375 and 1280 (spec Testing Decisions, seam 3;
// ticket 16): no serious or critical issues, apart from the stock issues listed in
// axe-known-issues.mjs with the ticket that fixes each. Every pin is checked, kind@name pins
// included, and each UI state in states.mjs is checked open on the pins it names, at its
// projects (W0-8). With QA_OVERLAY, every page renders with that overlay.
//
//   npm run qa:axe

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { KNOWN_ISSUES, knownIssue } from './axe-known-issues.mjs';
import { UI_STATES, openState, statesFor } from './states.mjs';
import { QA_OVERLAY } from './storefront.mjs';

// WCAG 2.0 to 2.2, A and AA, plus axe's best practices.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = ['serious', 'critical'];
const OVERLAY = QA_OVERLAY || null;

const describe = violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.length} element(s): ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`;

function check(template, pagePath, state = null) {
    const title = `${template} (${pagePath})${state ? ` with ${UI_STATES[state].description}` : ''}${QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : ''} has no serious or critical axe issues`;
    test(title, async ({ page }, testInfo) => {
        if (state) test.skip(!UI_STATES[state].projects.includes(testInfo.project.name), `${state} is checked at ${UI_STATES[state].projects.join(' and ')}`);
        await storefrontPage(page, template);
        if (state) {
            await dismissCookieBanner(page);
            await openState(page, state);
        }
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => BLOCKING.includes(violation.impact));

        const known = blocking.filter(violation => knownIssue(violation.id, template, { state, overlay: OVERLAY }));
        known.forEach(violation => testInfo.annotations.push({
            type: 'known axe issue',
            description: `${describe(violation)}; ticket ${knownIssue(violation.id, template, { state, overlay: OVERLAY }).ticket} fixes it`,
        }));
        KNOWN_ISSUES.filter(issue => knownIssue(issue.rule, template, { issues: [issue], state, overlay: OVERLAY }) && !blocking.some(violation => violation.id === issue.rule))
            .forEach(issue => testInfo.annotations.push({ type: 'fixed', description: `${issue.rule} no longer occurs on ${template}${state ? ` with ${state}` : ''}: remove it from axe-known-issues.mjs` }));

        const unexpected = blocking.filter(violation => !knownIssue(violation.id, template, { state, overlay: OVERLAY })).map(describe);
        expect(unexpected, `serious or critical axe issues on ${template}${state ? ` with ${state}` : ''} at ${testInfo.project.name}`).toEqual([]);
    });
}

for (const [template, pagePath] of Object.entries(PAGES)) {
    check(template, pagePath);
    for (const [state] of statesFor(template)) check(template, pagePath, state);
}
