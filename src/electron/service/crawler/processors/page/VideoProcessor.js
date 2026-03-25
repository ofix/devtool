// src/electron/service/crawler/page/VideoProcessor.js
import StandardProcessor from './StandardProcessor.js';
export default class VideoProcessor extends StandardProcessor {
    async execute(ctx) {
        const result = await super.execute(ctx);
        const videos = result.data.video_urls || [];
        result.data.videos = videos;
        return result;
    }
}
