// The autocomplete tokens on the store's form fields (ticket 25; WCAG 1.3.5 and 3.3.8;
// accessibility item 9; spec module 1). components/reelflies/autocomplete.html picks the token by
// the field's private id, and the stock field partials include it. The create-account and
// sign-in pages are checked in their raw HTML too (raw-html/assertions/autocomplete.mjs); the
// account and address forms need a signed-in customer, so they are checked here, rendered from
// fixtures shaped as ?debug=context shows the store's fields on ReelFlies_CA (2026-10-06).
//
//   node --test scripts/qa/render/partials/autocomplete.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { TOKENS, autocompleteProblems } from '../../raw-html/assertions/autocomplete.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

// A store form field, as forms.create_account.address_fields lists them.
const field = (id, privateId, partial, extra = {}) => ({
    id: `FormField_${id}`, name: `FormField[2][${id}]`, label: privateId, private_id: privateId, partial, required: true, validation: '', ...extra,
});
const ADDRESS_FIELDS = [
    field(11, 'Country', 'select', { options: [{ label: 'Canada', value: 'Canada', selected: true }] }),
    field(4, 'FirstName', 'text'),
    field(5, 'LastName', 'text'),
    field(8, 'AddressLine1', 'text'),
    field(9, 'AddressLine2', 'text', { required: false }),
    field(6, 'CompanyName', 'text', { required: false }),
    field(10, 'City', 'text'),
    field(12, 'State', 'selectortext', { options: [{ label: 'Ontario', value: 'Ontario' }] }),
    field(13, 'Zip', 'text'),
    field(7, 'Phone', 'text'),
    field(25, 'ReceiveMarketingEmails', 'checkbox', { required: false, options: [{ label: 'Exclusive Offers', value: 'Yes' }] }),
];
const ACCOUNT_FIELDS = [field(1, 'EmailAddress', 'text'), field(2, 'Password', 'password'), field(3, 'ConfirmPassword', 'password')];

// Pages render inside layout/base, which needs the whole page context: a stand-in renders the
// page block alone.
const PAGE_ONLY = { 'layout/base': '{{#block "page"}}{{/block}}' };
const renderPage = (name, context) => renderPartial(name, context, { overrides: PAGE_ONLY });
const tokensOf = html => Object.fromEntries(findTags(html, 'input|select')
    .filter(tag => tag.attrs['data-field-type'])
    .map(tag => [tag.attrs['data-field-type'], tag.attrs.autocomplete]));

describe('the autocomplete partial, through the stock field partials', () => {
    for (const [privateId, token] of Object.entries(TOKENS)) {
        const partial = {
            Password: 'password', ConfirmPassword: 'password', CurrentPassword: 'password', Country: 'select', State: 'selectortext',
        }[privateId] || 'text';
        it(`gives ${privateId} autocomplete="${token}" (forms/${partial})`, async () => {
            const html = await renderPartial(`components/common/forms/${partial}`, field(1, privateId, partial, { options: [{ label: 'A', value: 'A' }] }));
            assert.deepEqual(tokensOf(html), { [privateId]: token });
            assert.deepEqual(unbalancedTags(html), []);
        });
    }

    it('gives a field the store adds itself (no private id) no token, and a password one the stock "off"', async () => {
        const custom = { ...field(30, undefined, 'text'), private_id: undefined };
        assert.equal(findTags(await renderPartial('components/common/forms/text', custom), 'input')[0].attrs.autocomplete, undefined);
        assert.equal(findTags(await renderPartial('components/common/forms/password', { ...custom, partial: 'password' }), 'input')[0].attrs.autocomplete, 'off');
    });

    it('puts exactly one autocomplete attribute on each field', async () => {
        const html = await renderPartial('components/common/forms/password', field(2, 'Password', 'password'));
        assert.equal((findTags(html, 'input')[0].raw.match(/\bautocomplete=/g) || []).length, 1);
    });
});

describe('the forms built from the store\'s fields', () => {
    it('create account: every account and address field carries its token', async () => {
        const html = await renderPage('pages/auth/create-account', {
            settings: { account_creation_enabled: true },
            forms: { create_account: { account_fields: ACCOUNT_FIELDS, address_fields: ADDRESS_FIELDS, recaptcha: {} } },
        });
        assert.deepEqual(autocompleteProblems(html, 'create-account'), []);
        assert.equal(tokensOf(html).Zip, 'postal-code');
        assert.equal(tokensOf(html).Password, 'new-password');
    });

    it('the address book\'s add and edit form: every address field carries its token', async () => {
        const html = await renderPage('pages/account/add-address', {
            forms: { address: { action: '/account.php?action=add_shipping_address', shipping_fields: ADDRESS_FIELDS } },
        });
        assert.deepEqual(autocompleteProblems(html, 'address'), []);
        assert.deepEqual(tokensOf(html), Object.fromEntries(ADDRESS_FIELDS.filter(entry => entry.private_id in TOKENS).map(entry => [entry.private_id, TOKENS[entry.private_id]])));
    });

    it('account details: the stock name, company and phone tokens stay, and the store\'s email and password fields get theirs', async () => {
        const html = await renderPartial('components/account/edit-account', {
            forms: {
                edit_account: {
                    first_name: '',
                    last_name: '',
                    company_name: '',
                    phone: '',
                    fields: [field(1, 'EmailAddress', 'text'), field(2, 'Password', 'password'), field(3, 'ConfirmPassword', 'password'), field(24, 'CurrentPassword', 'password')],
                },
            },
        });
        const byName = Object.fromEntries(findTags(html, 'input').filter(tag => tag.attrs.name).map(tag => [tag.attrs.name, tag.attrs.autocomplete]));
        assert.equal(byName.account_firstname, 'given-name');
        assert.equal(byName.account_lastname, 'family-name');
        assert.equal(byName.account_companyname, 'organization');
        assert.equal(byName.account_phone, 'tel');
        assert.deepEqual(tokensOf(html), {
            EmailAddress: 'email', Password: 'new-password', ConfirmPassword: 'new-password', CurrentPassword: 'current-password',
        });
    });

    it('sign in: email and current-password', async () => {
        const html = await renderPage('pages/auth/login', { urls: { auth: {} }, forms: { login: {} } });
        assert.deepEqual(autocompleteProblems(html, 'login'), []);
    });
});
