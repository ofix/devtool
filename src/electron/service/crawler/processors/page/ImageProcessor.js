// src/electron/service/crawler/page/ImageProcessor.js
import StandardProcessor from './StandardProcessor.js';
export default class ImageProcessor extends StandardProcessor {
    async execute(ctx) {
        const result = await super.execute(ctx);
        const images = result.data.image_urls || [];
        result.data.images = images;
        return result;
    }
}
