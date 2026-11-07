// The words the ReelFlies scripts write, from lang/en.json's reelflies.js, which
// components/reelflies/head.html passes in as context.rfWords (langJson's JSON string).
//
//   setWords(context.rfWords);
//   word('added', { what: 'size 14 Adams' });
//
// A {name} in a word is filled from `vars`; one with no value stays as written. A key with no
// word comes back as the key, so a missing string shows up in review rather than as a blank.

let words = {};

// langJson gives { locale, locales, translations: { 'reelflies.js.add': '+ Add', ... } }: the
// words are the translations, keyed by their last part.
function fromLangJson(data) {
    if (!data || typeof data !== 'object') return {};
    if (!data.translations) return data;
    return Object.fromEntries(Object.entries(data.translations).map(([key, text]) => [key.split('.').pop(), text]));
}

export function setWords(json) {
    if (json && typeof json === 'object') {
        words = fromLangJson(json);
        return;
    }
    try {
        words = fromLangJson(JSON.parse(json || '{}'));
    } catch (error) {
        words = {};
    }
}

export function word(key, vars = {}) {
    const text = typeof words[key] === 'string' ? words[key] : key;
    return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
}

// "1 fly" or "3 flies": `one` and `many` are the word keys of the singular and the plural.
export function counted(n, one, many) {
    return `${n} ${word(n === 1 ? one : many)}`;
}
