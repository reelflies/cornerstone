// Search suggestions (quick-search.js): reading a size out of the words, the results page's
// address, the menu's matching categories, the lit words, and the panel.
import {
    lit, matchCategories, panelHtml, parseQuery, searchUrl,
} from '../../../theme/reelflies/quick-search';
import { setWords } from '../../../theme/reelflies/words';

beforeAll(() => setWords({
    translations: {
        'reelflies.js.search_one': '1 result for “{q}”',
        'reelflies.js.search_many': '{n} results for “{q}”',
        'reelflies.js.search_in_size': 'in size {size}',
        'reelflies.js.search_none': 'No flies match “{q}”.',
        'reelflies.js.search_none_hint': 'Try a fly name, a fish or a hook size.',
        'reelflies.js.search_cats': 'Categories',
        'reelflies.js.search_flies': 'Flies',
        'reelflies.js.search_all': 'See all {n} results',
        'reelflies.js.search_all_one': 'See the result',
    },
}));

describe('parseQuery', () => {
    it('reads a named size out of the words', () => {
        expect(parseQuery('caddis size 16')).toEqual({ words: 'caddis', size: '16' });
        expect(parseQuery('caddis, size 16')).toEqual({ words: 'caddis', size: '16' });
        expect(parseQuery('Size 2/0 deceiver')).toEqual({ words: 'deceiver', size: '2/0' });
        expect(parseQuery('bugger #8')).toEqual({ words: 'bugger', size: '8' });
        expect(parseQuery('sz 2-0 clouser')).toEqual({ words: 'clouser', size: '2/0' });
    });

    it('leaves a number that isn\'t a named size in the words', () => {
        expect(parseQuery('45 dry fly selection')).toEqual({ words: '45 dry fly selection', size: '' });
    });
});

describe('searchUrl', () => {
    it('goes to the results page, a size as its Fly Sizes filter', () => {
        expect(searchUrl('/search.php', { words: 'caddis', size: '16' })).toBe('/search.php?search_query=caddis&Fly+Sizes=16');
        expect(searchUrl('/search.php', { words: 'woolly bugger', size: '' })).toBe('/search.php?search_query=woolly+bugger');
    });
});

describe('matchCategories', () => {
    const cats = [
        { name: 'Dry Flies', url: '/dry/' },
        { name: 'Caddis Dry Flies', url: '/caddis-dry/' },
        { name: 'Caddis Emerger, Larva & Pupa', url: '/caddis-emerger/' },
        { name: 'Elk Hair Caddis', url: '/elk/' },
    ];

    it('keeps names with every word at the start of one of theirs, a name starting with the first word first', () => {
        expect(matchCategories(cats, 'caddis').map(cat => cat.url)).toEqual(['/caddis-dry/', '/caddis-emerger/', '/elk/']);
        expect(matchCategories(cats, 'dry cad').map(cat => cat.url)).toEqual(['/caddis-dry/']);
        expect(matchCategories(cats, 'addis')).toEqual([]);
    });
});

describe('lit', () => {
    it('lights the words where they start a word, and escapes the name', () => {
        expect(lit('Elk Hair Caddis <Tan>', 'cad')).toBe('Elk Hair <mark>Cad</mark>dis &lt;Tan&gt;');
        expect(lit('Mascaddis', 'cad')).toBe('Mascaddis');
    });
});

describe('panelHtml', () => {
    const products = Array.from({ length: 8 }, (_, i) => ({
        id: String(i), name: `Caddis ${i}`, url: `/c${i}/`, price: 0.95, img: '',
    }));

    it('counts, lists six flies on a phone and eight from 1040px, and leads to them all', () => {
        const panel = document.createElement('div');
        panel.innerHTML = panelHtml({
            query: { words: 'caddis', size: '16' }, total: 50, products, categories: [], base: '/search.php',
        });
        expect(panel.querySelector('.rf-suggest__count').textContent).toBe('50 results for “caddis” in size 16');
        expect(panel.querySelectorAll('.rf-suggest__fly')).toHaveLength(6);
        expect(panel.querySelector('.rf-suggest__all').getAttribute('href')).toBe('/search.php?search_query=caddis&Fly+Sizes=16');
        panel.innerHTML = panelHtml({
            query: { words: 'caddis', size: '' }, total: 50, products, categories: [], base: '/search.php', wide: true,
        });
        expect(panel.querySelectorAll('.rf-suggest__fly')).toHaveLength(8);
    });

    it('says when nothing matches, and keeps the matching categories', () => {
        const panel = document.createElement('div');
        panel.innerHTML = panelHtml({
            query: { words: 'qzx', size: '' }, total: 0, products: [], categories: [{ name: 'Qzx Flies', url: '/q/' }], base: '/search.php',
        });
        expect(panel.querySelector('.rf-suggest__count').textContent).toBe('No flies match “qzx”.');
        expect(panel.querySelector('.rf-suggest__cat').getAttribute('href')).toBe('/q/');
        expect(panel.querySelector('.rf-suggest__all')).toBeNull();
    });
});
