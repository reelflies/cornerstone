// When the add flow's chunk fails to load (ticket 38): page-modules.js's add-flow slot loads this
// in its place, as a chunk of its own with no imports, so neither main.js nor the flow's chunk
// carries it. The buttons' "Choose a size" and "Add 1 to cart" would no longer follow the pills
// and the stepper, so each reads stock's "Add to Cart" (the buy row's data-rf-stock-label), which
// is true whatever is chosen; a pre-order product keeps its own. Then the error goes on to the
// loader, which reports it. Stock still adds, through add-bridge.js's no-flow defaults.

export default function addFlowFailed(error, doc = document) {
    doc.querySelectorAll('[data-rf-add][data-rf-stock-label]:not([data-rf-pre-order])').forEach(row => {
        const button = row.querySelector('#form-action-addToCart');
        if (button) button.value = row.getAttribute('data-rf-stock-label');
    });
    throw error;
}
