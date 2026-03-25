import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

export default class DownloadManager {
    constructor(options = {}) {
        this.basePath = options.basePath || './downloads';
        this.recordDb = options.recordDb || null;
    }

    async download(url, options = {}) {
        const { type, path: customPath, siteName, title, index } = options;

        const downloadPath = customPath || path.join(this.basePath, `${type}s`);
        const filename = this._generateFilename(url, title, index, type);
        const fullPath = path.join(downloadPath, filename);

        await fs.ensureDir(downloadPath);

        if (await this._isAlreadyDownloaded(url, fullPath)) {
            return { skipped: true, path: fullPath, reason: 'exists' };
        }

        const processor = this._getProcessor(type);
        const result = await processor.execute(url, { ...options, path: downloadPath });

        if (this.recordDb) {
            await this._recordDownload(url, fullPath, result.size);
        }

        return result;
    }

    async _isAlreadyDownloaded(url, filePath) {
        if (await fs.pathExists(filePath)) {
            const stats = await fs.stat(filePath);
            if (stats.size > 0) {
                return true;
            }
            await fs.remove(filePath);
        }
        return false;
    }

    _generateFilename(url, title, index, type) {
        let filename = url.split('/').pop().split('?')[0];

        if (!filename || filename.length < 3) {
            filename = `${type}_${Date.now()}`;
        }

        if (title) {
            const cleanTitle = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
            const indexSuffix = index !== undefined ? `_${index}` : '';
            filename = `${cleanTitle}${indexSuffix}_${filename}`;
        }

        return filename;
    }

    _getProcessor(type) {
        const processors = {
            image: require('../processors/download/ImageProcessor.js').default,
            video: require('../processors/download/VideoProcessor.js').default,
            m3u8: require('../processors/download/M3u8Processor.js').default
        };

        const Processor = processors[type];
        if (!Processor) {
            throw new Error(`Unknown download type: ${type}`);
        }

        return new Processor();
    }

    async _recordDownload(url, filePath, size) {
        if (!this.recordDb) return;

        const hash = crypto.createHash('md5').update(url).digest('hex');
        // 记录到数据库的逻辑
    }

    async close() { }
}
