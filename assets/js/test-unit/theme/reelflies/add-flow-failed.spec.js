// add-flow-failed.js (ticket 38): what page-modules.js's add-flow slot does when the flow's chunk
// fails to load.
import addFlowFailed from '../../../theme/reelflies/add-flow-failed';

describe('when the add flow\'s chunk fails to load', () => {
    const button = () => document.getElementById('form-action-addToCart');

    it('stock\'s "Add to Cart" on the flow\'s buttons, never a pre-order label, and the error passed on', () => {
        document.body.innerHTML = `<form><div data-rf-add data-rf-stock-label="Add to Cart">
            <input id="form-action-addToCart" type="submit" value="Choose a size">
        </div></form>
        <form id="pre"><div data-rf-add data-rf-pre-order data-rf-stock-label="Add to Cart">
            <input id="form-action-addToCart" type="submit" value="Pre-Order Now">
        </div></form>`;
        const error = new Error('ChunkLoadError');
        expect(() => addFlowFailed(error)).toThrow(error);
        expect(button().value).toBe('Add to Cart');
        expect(document.querySelector('#pre input').value).toBe('Pre-Order Now');
    });
});
