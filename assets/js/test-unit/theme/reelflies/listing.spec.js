// A listing's cards (listing.js): the size line from the Storefront API read, a sold-out product
// marked as the server marks one, and "Choose one" where the choice isn't a hook size.
import { fillCard, isSoldOut, markSold } from '../../../theme/reelflies/listing';
import { setWords } from '../../../theme/reelflies/words';

const size = (label, inStock = true) => ({ label, variantId: label.length, inStock });
const product = over => ({
    id: '10', name: 'Adams', url: '/adams/', sizes: [], single: null, complex: false, ...over,
});

function card(button = '<button class="rf-add" type="button" data-rf-add="sizes" aria-expanded="false">+ Add<span class="is-srOnly">: Adams</span></button>') {
    document.body.innerHTML = `<ul data-rf-grid><li class="rf-fly" data-rf-product="10"><article class="rf-fly__card">
        <h3 class="rf-fly__name"><a href="/adams/">Adams</a></h3>
        <p class="rf-fly__line"><span class="rf-fly__sizes"></span><span data-rf-inbox hidden></span></p>
        ${button}<div data-rf-sizes hidden></div></article></li></ul>`;
    return document.querySelector('.rf-fly');
}

beforeAll(() => setWords({
    translations: {
        'reelflies.js.sizes': 'Sizes {from}–{to}', 'reelflies.js.size': 'Size {size}', 'reelflies.js.choices': '{n} choices', 'reelflies.js.view': 'View', 'reelflies.js.sold_out_line': 'Sold out', 'reelflies.js.choose_one': 'Choose one',
    },
}));

describe('isSoldOut', () => {
    it('is sold out only when every size is', () => {
        expect(isSoldOut(product({ sizes: [size('12', false), size('14', false)] }))).toBe(true);
        expect(isSoldOut(product({ sizes: [size('12', false), size('14')] }))).toBe(false);
    });

    it('reads a product with no sizes by its one variant, and never guesses at one with two options', () => {
        expect(isSoldOut(product({ single: { variantId: 9, inStock: false } }))).toBe(true);
        expect(isSoldOut(product({ complex: true }))).toBe(false);
    });
});

describe('fillCard', () => {
    it('writes the size range into the reserved line', () => {
        const el = card();
        fillCard(el, product({ sizes: [size('8'), size('20')] }));
        expect(el.querySelector('.rf-fly__sizes').textContent).toBe('Sizes 8–20');
        expect(el.querySelector('[data-rf-add]')).not.toBeNull();
    });

    it('marks a product sold out in every size: the line says so and + Add becomes a link to its page', () => {
        const el = card();
        fillCard(el, product({ sizes: [size('12', false)] }));
        expect(el.classList.contains('is-sold')).toBe(true);
        expect(el.querySelector('.rf-fly__sizes').textContent).toBe('Sold out');
        const link = el.querySelector('a.rf-add--link');
        expect(link.getAttribute('href')).toBe('/adams/');
        expect(link.textContent).toBe('View: Adams');
        expect(el.querySelector('[data-rf-add], [data-rf-sizes]')).toBeNull();
    });

    it('says "Choose one" on a link to choose where the choice isn\'t a hook size', () => {
        const el = card('<a class="rf-add rf-add--link" href="/adams/">Choose a size<span class="is-srOnly">: Adams</span></a>');
        fillCard(el, product({ sizes: [size('Clear'), size('Olive')] }));
        expect(el.querySelector('a.rf-add--link').textContent).toBe('Choose one: Adams');
        expect(el.querySelector('.rf-fly__sizes').textContent).toBe('2 choices');
    });

    it('leaves a card the server already marked sold out as it is', () => {
        const el = card();
        el.classList.add('is-sold');
        fillCard(el, product({ sizes: [size('8'), size('20')] }));
        expect(el.querySelector('.rf-fly__sizes').textContent).toBe('');
    });
});

describe('markSold', () => {
    it('hands focus on + Add to the link that replaces it', () => {
        const el = card();
        el.querySelector('[data-rf-add]').focus();
        markSold(el);
        expect(document.activeElement).toBe(el.querySelector('a.rf-add--link'));
    });
});
