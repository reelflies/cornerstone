import sizePills, { soldOutLine, updatePills, watchPills } from '../../../theme/reelflies/size-pills';

// A Fly Sizes group as components/reelflies/size-pills.html renders it: stock's radio and label
// pairs, a hidden "(sold out)" in each label, and the line under the pills with its words.
const FIELD = (sizes, { checked = null } = {}) => `<div class="form-field" data-product-attribute="set-rectangle" data-rf-pills role="radiogroup" aria-labelledby="rf-option-4877-12-label">
    <p><span id="rf-option-4877-12-label">Fly Sizes: <span data-option-value data-rf-pills-placeholder="choose one">choose one</span></span></p>
    <div class="rf-pills">${sizes.map(([id, size]) => `<div class="form-option-wrapper">
        <input class="form-radio" type="radio" id="attribute_rectangle__12_${id}" name="attribute[12]" value="${id}"${checked === id ? ' checked' : ''} required>
        <label class="form-option rf-pill" for="attribute_rectangle__12_${id}" data-product-attribute-value="${id}">
            <span class="form-option-variant">${size}</span><span class="is-srOnly" data-rf-sold-out-tag hidden> (sold out)</span>
        </label></div>`).join('')}</div>
    <p data-rf-sold-out-line data-rf-one="Size # is sold out." data-rf-many="Sizes # are sold out." data-rf-and="and"></p>
</div>`;
const SIZES = [['101', '12'], ['102', '14'], ['103', '16'], ['104', '18']];
const label = id => document.querySelector(`[data-product-attribute-value="${id}"]`);
const radio = id => document.getElementById(`attribute_rectangle__12_${id}`);
const line = () => document.querySelector('[data-rf-sold-out-line]').textContent;
const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });

describe('soldOutLine', () => {
    const WORDS = { one: 'Size # is sold out.', many: 'Sizes # are sold out.', and: 'and' };

    it('names one size in the singular, and several in the plural with "and" before the last (story 39)', () => {
        expect(soldOutLine(['8'], WORDS)).toBe('Size 8 is sold out.');
        expect(soldOutLine(['14', '16'], WORDS)).toBe('Sizes 14 and 16 are sold out.');
        expect(soldOutLine(['6', '14', '16'], WORDS)).toBe('Sizes 6, 14 and 16 are sold out.');
        expect(soldOutLine([], WORDS)).toBe('');
    });
});

describe('the pills follow stock\'s marks (story 39)', () => {
    beforeEach(() => {
        document.body.innerHTML = FIELD(SIZES);
    });

    it('marks a size stock marks unavailable: aria-disabled, "(sold out)" in its name, and named in the line', () => {
        label('102').classList.add('unavailable');
        label('103').classList.add('unavailable');
        updatePills(document.querySelector('[data-rf-pills]'));
        expect(radio('102').getAttribute('aria-disabled')).toBe('true');
        expect(radio('101').hasAttribute('aria-disabled')).toBe(false);
        expect(label('102').querySelector('[data-rf-sold-out-tag]').hidden).toBe(false);
        expect(label('101').querySelector('[data-rf-sold-out-tag]').hidden).toBe(true);
        expect(line()).toBe('Sizes 14 and 16 are sold out.');
    });

    it('follows stock as it changes the marks, as after a colour change, with no hook in stock\'s scripts', async () => {
        sizePills.load({}, document);
        label('104').classList.add('unavailable');
        await settle();
        expect(line()).toBe('Size 18 is sold out.');
        label('104').classList.remove('unavailable');
        label('101').classList.add('unavailable');
        await settle();
        expect(line()).toBe('Size 12 is sold out.');
        expect(radio('104').hasAttribute('aria-disabled')).toBe(false);
    });

    it('marks every size, and names them all, on a product sold out in every size', () => {
        SIZES.forEach(([id]) => label(id).classList.add('unavailable'));
        updatePills(document.querySelector('[data-rf-pills]'));
        expect(line()).toBe('Sizes 12, 14, 16 and 18 are sold out.');
    });
});

describe('the chosen size after the label', () => {
    it('reads "choose one" until a size is chosen, then the size', () => {
        document.body.innerHTML = FIELD(SIZES);
        const field = document.querySelector('[data-rf-pills]');
        watchPills(field);
        expect(document.querySelector('[data-option-value]').textContent).toBe('choose one');
        radio('102').checked = true;
        radio('102').dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.querySelector('[data-option-value]').textContent).toBe('14');
    });

    it('names the only size of a single-size product, even while stock has it unchecked for a moment', () => {
        document.body.innerHTML = FIELD([['101', '8']], { checked: '101' });
        radio('101').checked = false;
        updatePills(document.querySelector('[data-rf-pills]'));
        expect(document.querySelector('[data-option-value]').textContent).toBe('8');
    });

    it('never checks, unchecks or moves a radio', () => {
        document.body.innerHTML = FIELD(SIZES, { checked: '103' });
        const order = [...document.querySelectorAll('input')].map(input => input.value);
        label('103').classList.add('unavailable');
        updatePills(document.querySelector('[data-rf-pills]'));
        expect(radio('103').checked).toBe(true);
        expect([...document.querySelectorAll('input')].map(input => input.value)).toEqual(order);
        expect(document.querySelector('[data-option-value]').textContent).toBe('16');
    });
});
