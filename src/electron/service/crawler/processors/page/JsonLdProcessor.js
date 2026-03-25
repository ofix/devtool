// src/electron/service/crawler/page/JsonLdProcessor.js
export default class JsonLdProcessor {
    async execute(ctx) {
        const { url, config, resourceFetcher, logger } = ctx;
        
        const pageResult = await resourceFetcher.fetch(url, { dynamic: config.dynamic });
        const jsonLd = await this._extractJsonLd(pageResult, config.type);
        
        const data = {};
        for (const [name, path] of Object.entries(config.fields || {})) {
            data[name] = this._getNested(jsonLd, path);
        }
        
        return { data: { ...data, url }, subTasks: [] };
    }
    
    async _extractJsonLd(pageResult, type) {
        return await pageResult.evaluate((targetType) => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    if (!targetType || data['@type'] === targetType) return data;
                    if (data['@graph']) {
                        for (const item of data['@graph']) {
                            if (item['@type'] === targetType) return item;
                        }
                    }
                } catch (e) { continue; }
            }
            return null;
        }, type);
    }
    
    _getNested(obj, path) {
        if (!path) return obj;
        return path.split('.').reduce((o, p) => o?.[p], obj);
    }
}
