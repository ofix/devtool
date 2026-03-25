import fs from 'fs-extra';
import path from 'path';

export default class StorageManager {
    constructor(options = {}) {
        this.basePath = options.basePath || './data';
        this.db = options.db || null;
    }

    async save(data, config, context) {
        const { siteName, type, url } = context;

        if (!config) return;

        if (config === true || config === 'json') {
            await this._saveToJson(data, { siteName, type, url });
        } else if (config === 'csv') {
            await this._saveToCsv(data, { siteName, type, url });
        } else if (config.type === 'database') {
            await this._saveToDatabase(data, config, context);
        } else if (config.type === 'both') {
            await this._saveToJson(data, { siteName, type, url });
            await this._saveToDatabase(data, config.database, context);
        } else if (config.format) {
            await this._saveToFile(data, config, { siteName, type, url });
        }
    }

    async _saveToJson(data, context) {
        const { siteName, type, url } = context;
        const date = new Date().toISOString().slice(0, 10);
        const dir = path.join(this.basePath, siteName, type, date);
        const filename = `${Date.now()}_${this._safeFilename(url)}.json`;
        const filePath = path.join(dir, filename);

        await fs.ensureDir(dir);
        await fs.writeJson(filePath, {
            ...data,
            crawledAt: new Date().toISOString(),
            siteName,
            url
        }, { spaces: 2 });
    }

    async _saveToCsv(data, context) {
        const { siteName, type } = context;
        const date = new Date().toISOString().slice(0, 10);
        const dir = path.join(this.basePath, siteName, type, date);
        const filePath = path.join(dir, 'data.csv');

        await fs.ensureDir(dir);

        const headers = Object.keys(data).join(',');
        const row = Object.values(data).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');

        const exists = await fs.pathExists(filePath);
        if (!exists) {
            await fs.writeFile(filePath, headers + '\n');
        }
        await fs.appendFile(filePath, row + '\n');
    }

    async _saveToDatabase(data, config, context) {
        if (!this.db) return;

        const table = config.table || 'items';
        const fields = config.fields || Object.keys(data);

        const insertData = {};
        for (const field of fields) {
            insertData[field] = data[field];
        }
        insertData.crawled_at = new Date().toISOString();
        insertData.site_name = context.siteName;
        insertData.url = context.url;

        // 数据库插入逻辑
    }

    async _saveToFile(data, config, context) {
        const { siteName, type, url } = context;
        const format = config.format || 'json';

        let filename = `${Date.now()}`;
        if (data.title) {
            filename = this._safeFilename(data.title);
        }
        filename = `${filename}.${format}`;

        const dir = config.path
            ? this._interpolate(config.path, { siteName, type, title: data.title, date: new Date().toISOString().slice(0, 10) })
            : path.join(this.basePath, siteName, type);

        const filePath = path.join(dir, filename);

        await fs.ensureDir(dir);

        if (format === 'json') {
            await fs.writeJson(filePath, { ...data, url, crawledAt: new Date() }, { spaces: 2 });
        } else {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        }
    }

    _safeFilename(str) {
        return String(str).replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
    }

    _interpolate(str, vars) {
        return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
    }

    async close() { }
}
