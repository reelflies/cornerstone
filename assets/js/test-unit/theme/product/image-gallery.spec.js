import ImageGallery from '../../../theme/product/image-gallery';

// The product page outlines the main image's own thumbnail from the start (ticket 39's hook in
// product-view.html). Stock's gallery moves the outline on a click and clears it while a variant's
// photo shows; the constructor's hook makes it come back with the main photo, as a click would.
const gallery = ({ outlined }) => {
    const $gallery = $(`<section data-image-gallery>
        <figure data-image-gallery-main data-zoom-image="main-zoom.jpg">
            <img data-main-image src="main.jpg" srcset="main-320.jpg 320w" alt="Adams Parachute">
        </figure>
        <ul>
            <li><a class="productView-thumbnail-link${outlined ? ' is-active' : ''}" data-image-gallery-item href="#">main</a></li>
            <li><a class="productView-thumbnail-link" data-image-gallery-item href="#">second</a></li>
        </ul>
    </section>`).appendTo(document.body);
    const imageGallery = new ImageGallery($gallery);
    // easyzoom's swap, which stock's swapMainImage calls; the photos aren't loaded here.
    imageGallery.easyzoom = { data: () => ({ swap: jest.fn() }) };
    return { $gallery, imageGallery };
};

const outlinedTiles = $gallery => $gallery.find('[data-image-gallery-item]').map((i, tile) => $(tile).hasClass('is-active')).get();

const variantPhoto = { mainImageUrl: 'variant.jpg', zoomImageUrl: 'variant-zoom.jpg', mainImageSrcset: 'variant-320.jpg 320w' };

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ImageGallery, with the main image\'s thumbnail outlined from the start (ticket 39)', () => {
    it('clears the outline while a variant\'s photo shows, and outlines the main image\'s tile again when it comes back', () => {
        const { $gallery, imageGallery } = gallery({ outlined: true });
        expect(outlinedTiles($gallery)).toEqual([true, false]);

        imageGallery.setAlternateImage(variantPhoto);
        expect(outlinedTiles($gallery)).toEqual([false, false]);

        imageGallery.restoreImage();
        expect(outlinedTiles($gallery)).toEqual([true, false]);
    });

    it('outlines nothing after a variant\'s photo where no tile was outlined (Quick view, stock\'s)', () => {
        const { $gallery, imageGallery } = gallery({ outlined: false });

        imageGallery.setAlternateImage(variantPhoto);
        imageGallery.restoreImage();
        expect(outlinedTiles($gallery)).toEqual([false, false]);
    });

    it('still moves the outline to a clicked tile, and keeps it there after a variant\'s photo', () => {
        const { $gallery, imageGallery } = gallery({ outlined: true });
        imageGallery.bindEvents();

        $gallery.find('[data-image-gallery-item]').eq(1).trigger('click');
        expect(outlinedTiles($gallery)).toEqual([false, true]);

        imageGallery.setAlternateImage(variantPhoto);
        imageGallery.restoreImage();
        expect(outlinedTiles($gallery)).toEqual([false, true]);
    });
});
