import 'focus-within-polyfill';

import './global/jquery-migrate';
import './common/select-option-plugin';
import PageManager from './page-manager';
import quickSearch from './global/quick-search';
import currencySelector from './global/currency-selector';
import languageSelector from './global/language-selector';
import mobileMenuToggle from './global/mobile-menu-toggle';
import menu from './global/menu';
import foundation from './global/foundation';
import lazyQuickView from './reelflies/lazy-quick-view'; // ReelFlies hook (ticket 16): was ./global/quick-view
import cartPreview from './global/cart-preview';
import carousel from './common/carousel';
import svgInjector from './global/svg-injector';
import reelfliesGlobal from './reelflies/global'; // ReelFlies hook (ticket 25): ReelFlies modules on every page

export default class Global extends PageManager {
    onReady() {
        const { cartId, secureBaseUrl } = this.context;
        cartPreview(secureBaseUrl, cartId);
        quickSearch();
        currencySelector(cartId);
        languageSelector();
        foundation($(document));
        lazyQuickView(this.context); // ReelFlies hook (ticket 16): Quick view loads on the first click
        carousel(this.context);
        menu();
        mobileMenuToggle();
        svgInjector();
        reelfliesGlobal(this.context); // ReelFlies hook (ticket 25): after the stock globals
    }
}
