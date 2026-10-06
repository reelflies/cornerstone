// Serious or critical axe issues in stock Cornerstone that are allowed for now, like
// KNOWN_FAILURES in scripts/check-contrast.mjs. They are reported on every run but
// don't fail it. Each entry names the axe rule, the templates it is allowed on and the
// ticket that fixes it; remove the entry in that ticket. A known issue that no longer
// occurs is reported as fixed, so the list can only shrink.
//
// { rule: 'axe rule id', templates: ['home', ...], ticket: NN, why: '...' }

export const KNOWN_ISSUES = [];

export function knownIssue(rule, template) {
    return KNOWN_ISSUES.find(issue => issue.rule === rule && issue.templates.includes(template));
}
