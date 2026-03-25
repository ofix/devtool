// src/electron/service/crawler/page/PdfProcessor.js
export default class PdfProcessor {
    async execute(ctx) {
        const { url, config, resourceFetcher, logger } = ctx;
        const response = await resourceFetcher.fetch(url, { dynamic: false, responseType: 'arraybuffer' });
        return { data: { url, size: response.data?.length, contentType: response.headers['content-type'] }, subTasks: [] };
    }
}
