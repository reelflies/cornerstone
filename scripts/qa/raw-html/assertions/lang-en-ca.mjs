// Canadian English (ticket 25; spec module 25; spec Testing Decisions, seam 2): every page says
// <html lang="en-CA">, which stock printed from the store's locale, and carries an en-CA content
// language. A theme can't set the Content-Language header, so that is the meta element
// templates/components/reelflies/head.html renders.

import { findTags } from '../html.mjs';

export const LANG = 'en-CA';

export default {
    id: 'lang-en-ca',
    ticket: 25,
    description: `<html lang="${LANG}"> and an ${LANG} content language`,
    check(page) {
        const problems = [];
        const html = findTags(page.html, 'html');
        if (html.length !== 1) problems.push(`${html.length} <html> elements`);
        else if (html[0].attrs.lang !== LANG) problems.push(`<html lang="${html[0].attrs.lang ?? ''}">, not "${LANG}"`);

        const language = findTags(page.html, 'meta').filter(tag => (tag.attrs['http-equiv'] || '').toLowerCase() === 'content-language');
        if (language.length !== 1) problems.push(`${language.length} content-language meta elements, not 1`);
        else if (language[0].attrs.content !== LANG) problems.push(`the content language is "${language[0].attrs.content ?? ''}", not "${LANG}"`);
        return problems;
    },
};
