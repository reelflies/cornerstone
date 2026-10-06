// Serious or critical axe issues in stock Cornerstone that are allowed for now, like
// KNOWN_FAILURES in scripts/check-contrast.mjs. They are reported on every run but
// don't fail it. Each entry names the axe rule, the templates it is allowed on and the
// ticket that fixes it; remove the entry in that ticket. A known issue that no longer
// occurs is reported as fixed, so the list can only shrink.
//
// { rule: 'axe rule id', templates: ['home', ...], ticket: NN, why: '...' }
//
// `templates` names page kinds, which cover every pin of the kind, or one kind@name pin
// (W0-8; pages.mjs).

import { pageKind } from './pages.mjs';

export const KNOWN_ISSUES = [];

// The known issue `rule` on the page `template` (a page key), or undefined.
export function knownIssue(rule, template, { issues = KNOWN_ISSUES } = {}) {
    return issues.find(issue => issue.rule === rule && (issue.templates.includes(template) || issue.templates.includes(pageKind(template))));
}
