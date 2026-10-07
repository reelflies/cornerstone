// Autocomplete tokens on the sign-in and create-account forms (ticket 25; WCAG 1.3.5 and 3.3.8;
// accessibility item 9; spec Testing Decisions, seam 2). The create-account form is built from
// the store's form fields, whose private ids pick the token
// (templates/components/reelflies/autocomplete.html), the same partials that build the account
// and address forms. Those need a signed-in customer, so their fields are checked from fixture
// renders instead (scripts/qa/render/partials/autocomplete.test.mjs).

import { findTags } from '../html.mjs';

// The token each store field gets, by its private id (data-field-type).
export const TOKENS = {
    EmailAddress: 'email',
    Password: 'new-password',
    ConfirmPassword: 'new-password',
    CurrentPassword: 'current-password',
    FirstName: 'given-name',
    LastName: 'family-name',
    CompanyName: 'organization',
    Phone: 'tel',
    AddressLine1: 'address-line1',
    AddressLine2: 'address-line2',
    City: 'address-level2',
    State: 'address-level1',
    Zip: 'postal-code',
    Country: 'country-name',
};

// The sign-in form's two fields, by name.
export const LOGIN = { login_email: 'email', login_pass: 'current-password' };

const FIELDS = 'input|select';

export function autocompleteProblems(html, kind) {
    const fields = findTags(html, FIELDS);
    const problems = [];
    const expect = (tag, label, token) => {
        if (tag.attrs.autocomplete !== token) problems.push(`${label} has autocomplete="${tag.attrs.autocomplete ?? ''}", not "${token}"`);
    };
    if (kind === 'login') {
        for (const [name, token] of Object.entries(LOGIN)) {
            const tag = fields.find(field => field.attrs.name === name);
            if (!tag) problems.push(`no ${name} field`);
            else expect(tag, name, token);
        }
        return problems;
    }
    const known = fields.filter(tag => tag.attrs['data-field-type'] in TOKENS);
    if (known.length === 0) problems.push('no store form fields (data-field-type) to check');
    known.forEach(tag => expect(tag, `the ${tag.attrs['data-field-type']} field`, TOKENS[tag.attrs['data-field-type']]));
    return problems;
}

export default {
    id: 'autocomplete',
    ticket: 25,
    description: 'autocomplete tokens on the sign-in and create-account fields',
    pages: ['login', 'create-account'],
    check: page => autocompleteProblems(page.html, page.kind),
};
