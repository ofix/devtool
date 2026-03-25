import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';

export default class ImageProcessor {
    async execute(url, options) {
        const { path: savePath, siteName, title, index } = options;
        const filename = this._generateFilename(url, title, index);
        const fullPath = path.join(savePath || './downloads/images', filename);

        await fs.ensureDir(path.dirname(fullPath));
        if (await fs.pathExists(fullPath)) return { skipped: true, path: fullPath };

        const response = await axios({ method: 'get', url, responseType: 'stream', timeout: 30000 });
        const writer = fs.createWriteStream(fullPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({ path: fullPath, size: writer.bytesWritten }));
            writer.on('error', reject);
        });
    }

    _generateFilename(url, title, index) {
        let filename = url.split('/').pop().split('?')[0];
        if (!filename || filename.length < 3) filename = `image_${Date.now()}`;
        if (title) {
            const clean = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
            filename = `${clean}_${index || ''}_${filename}`;
        }
        return filename;
    }
}
