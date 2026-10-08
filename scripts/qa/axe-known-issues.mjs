// Serious or critical axe issues in stock Cornerstone that are allowed for now, like
// KNOWN_FAILURES in scripts/check-contrast.mjs. They are reported on every run but
// don't fail it. Each entry names the axe rule, the templates it is allowed on and the
// ticket that fixes it; remove the entry in that ticket. A known issue that no longer
// occurs is reported as fixed, so the list can only shrink.
//
// { rule: 'axe rule id', templates: ['home', ...], states: ['panel-open'], overlays: ['menu-ids-empty'], ticket: NN, why: '...' }
//
// `templates` names page kinds, which cover every pin of the kind, or one kind@name pin
// (W0-8; pages.mjs). `states` (optional) names UI states (states.mjs): the issue is allowed
// only with one of them open. Without it, the issue is allowed on the page in every state.
// `overlays` (optional) names overlays (overlays/): the issue is allowed only in a run under
// one of them. Without it, the issue is allowed with or without an overlay.

import { pageKind } from './pages.mjs';

export const KNOWN_ISSUES = [
    // Stock Cornerstone's desktop sub-menu, open (the panel-open state on channel 1's category
    // page, 2026-10-06), inside ticket 27's "Shop flies" panel since 2026-10-07. Ticket 28's
    // grouped panel has no such sub-menus and doesn't raise it (axe, 2026-10-07). It stays for
    // the stock fallback, which renders while both menu ids are empty: the overlay
    // menu-ids-empty on channel 1. Since ticket 29 it is allowed under that overlay only, so the
    // grouped panel, whose panes ticket 29 switches, is held to the rule on every plain run
    // (menu.js never sets aria-hidden; it toggles hidden). A stock template is left as it is
    // (ADR 0001), and no channel pins a category page with empty ids once tree 4 has its ids
    // (wave R1); remove the entry then. The sub-menu's color-contrast and target-size issues
    // went with ticket 27's panel.
    {
        rule: 'aria-hidden-focus',
        templates: ['category'],
        states: ['panel-open'],
        overlays: ['menu-ids-empty'],
        ticket: 28,
        why: 'the stock fallback (both menu ids empty): the closed sub-menus beside the open one keep aria-hidden="true" while their links stay focusable',
    },
];

// The known issue `rule` on the page `template` (a page key), with the UI state `state` open or
// none, in a run under the overlay `overlay` or none, or undefined.
export function knownIssue(rule, template, { issues = KNOWN_ISSUES, state = null, overlay = null } = {}) {
    return issues.find(issue => issue.rule === rule
        && (issue.templates.includes(template) || issue.templates.includes(pageKind(template)))
        && (!issue.states || issue.states.includes(state))
        && (!issue.overlays || issue.overlays.includes(overlay)));
}
