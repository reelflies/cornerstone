// Quick add on the listing pages (ticket 43; spec module 14), the chunk rf-quick-add, which
// page-modules.js loads on the listing templates while rf_quick_add is on (context.rfQuickAdd),
// with or without a "+ Add" in the first render, and never with it off. What a tap does is
// quick-add-panel.js's; this hands it the storefront: stencil-utils for the product, stock's
// option change and the add, jQuery for stock's cart-quantity-update (jQuery isn't global in
// this build).

import $ from 'jquery';
import utils from '@bigcommerce/stencil-utils';
import { guardedCallback } from './guarded-api';
import { startQuickAdd } from './quick-add-panel';

// quick-add-product.html, under templates/components/, as getById names a template.
export const TEMPLATE = 'reelflies/quick-add-product';

export function storefrontDeps(doc = document) {
    return {
        loadProduct: productId => new Promise((resolve, reject) => {
            utils.api.product.getById(productId, { template: TEMPLATE }, (err, html) => {
                if (err || typeof html !== 'string') reject(err || new Error('quick add: no product markup'));
                else resolve(html);
            });
        }),
        // Stock's option change with nothing chosen: the sizes in stock (in_stock_attributes) and
        // those a product rule hides. guardedCallback passes only an answer with data. (Not
        // guardedApi: an export add-flow.js doesn't use would grow its chunk, which shares the
        // module, past its budget.)
        optionChange: (productId, query) => new Promise((resolve, reject) => {
            utils.api.productAttributes.optionChange(productId, query, guardedCallback(resolve, message => reject(new Error(message))));
        }),
        addItem: form => new Promise((resolve, reject) => {
            utils.api.cart.itemAdd(form, (err, response) => (err ? reject(err) : resolve(response)));
        }),
        // The size pills' own chunk, as the product page and #modal load it (ticket 37): imported
        // here, it would share a module with rf-size-pills, and webpack would make each chunk
        // load the other.
        loadPills: () => import(/* webpackChunkName: "rf-size-pills" */ './size-pills'),
        readQuantity: () => new Promise(resolve => {
            utils.api.cart.getCartQuantity({}, (err, quantity) => resolve(err ? null : quantity));
        }),
        notify: units => $(doc.body).trigger('cart-quantity-update', units),
    };
}

export default {
    load(context = {}, doc = document) {
        if (context.rfQuickAdd === false) return;
        startQuickAdd(doc, context, storefrontDeps(doc));
    },
};
