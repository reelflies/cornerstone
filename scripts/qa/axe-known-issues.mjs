// Serious or critical axe issues in stock Cornerstone that are allowed for now, like
// KNOWN_FAILURES in scripts/check-contrast.mjs. They are reported on every run but
// don't fail it. Each entry names the axe rule, the templates it is allowed on and the
// ticket that fixes it; remove the entry in that ticket. A known issue that no longer
// occurs is reported as fixed, so the list can only shrink.
//
// { rule: 'axe rule id', templates: ['home', ...], states: ['panel-open'], ticket: NN, why: '...' }
//
// `templates` names page kinds, which cover every pin of the kind, or one kind@name pin
// (W0-8; pages.mjs). `states` (optional) names UI states (states.mjs): the issue is allowed
// only with one of them open. Without it, the issue is allowed on the page in every state.

import { pageKind } from './pages.mjs';

export const KNOWN_ISSUES = [
    // Stock Cornerstone's desktop sub-menu, open (the panel-open state on channel 1's category
    // page, 2026-10-06). Ticket 28 replaces it with the grouped "Shop flies" panel.
    {
        rule: 'aria-hidden-focus',
        templates: ['category'],
        states: ['panel-open'],
        ticket: 28,
        why: 'the closed sub-menus beside the open one keep aria-hidden="true" while their links stay focusable',
    },
    {
        rule: 'color-contrast',
        templates: ['category'],
        states: ['panel-open'],
        ticket: 28,
        why: 'the open sub-menu shows the current category\'s link, and a sub-category with children, in grey on its grey background',
    },
    {
        rule: 'target-size',
        templates: ['category'],
        states: ['panel-open'],
        ticket: 28,
        why: 'the open sub-menu\'s "All Flies" link is shorter than 24 px, with no space around it',
    },
];

// The known issue `rule` on the page `template` (a page key), with the UI state `state` open or
// none, or undefined.
export function knownIssue(rule, template, { issues = KNOWN_ISSUES, state = null } = {}) {
    return issues.find(issue => issue.rule === rule
        && (issue.templates.includes(template) || issue.templates.includes(pageKind(template)))
        && (!issue.states || issue.states.includes(state)));
}
