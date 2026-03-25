export default class StandardProcessor {
    async execute(ctx) {
        const { url, config, resourceFetcher, logger } = ctx;

        const useDynamic = config.dynamic === true;
        const pageResult = await resourceFetcher.fetch(url, { dynamic: useDynamic });

        if (config.wait_selector) await pageResult.waitForSelector(config.wait_selector);
        if (config.scroll) await this._autoScroll(pageResult, config);

        const data = await this._extractFields(pageResult, config.fields);
        const subTasks = this._extractSubTasks(data, config.fields);

        return { data: { ...data, url }, subTasks };
    }

    async _autoScroll(pageResult, config) {
        const count = config.scroll_count || 5;
        const distance = config.scroll_distance || 1000;
        const wait = config.scroll_wait || 1000;
        for (let i = 0; i < count; i++) {
            await pageResult.evaluate((d) => window.scrollBy(0, d), distance);
            await pageResult.waitForTimeout(wait);
        }
    }

    async _extractFields(pageResult, fields) {
        const result = {};
        if (!fields) return result;

        for (const [name, def] of Object.entries(fields)) {
            let value;
            if (def.attribute) {
                if (def.multiple) {
                    value = await pageResult.evaluate((sel, attr) => {
                        return Array.from(document.querySelectorAll(sel)).map(el => el.getAttribute(attr));
                    }, def.selector, def.attribute);
                } else {
                    value = await pageResult.attr(def.selector, def.attribute);
                }
            } else {
                if (def.multiple) {
                    value = await pageResult.evaluate((sel) => {
                        return Array.from(document.querySelectorAll(sel)).map(el => el.innerText.trim());
                    }, def.selector);
                } else {
                    value = await pageResult.text(def.selector);
                }
            }
            result[name] = this._convertType(value, def.type);
        }
        return result;
    }

    _extractSubTasks(data, fields) {
        const subTasks = [];
        if (!fields) return subTasks;

        for (const [name, def] of Object.entries(fields)) {
            if (def.subTask && typeof def.subTask === 'string') {
                const value = data[name];
                if (!value) continue;
                const urls = Array.isArray(value) ? value : [value];
                for (const url of urls) {
                    if (url && typeof url === 'string' && url.startsWith('http')) {
                        subTasks.push({
                            type: def.subTask,
                            url: url,
                            context: { sourceField: name }
                        });
                    }
                }
            }
        }
        return subTasks;
    }
    _convertType(value, type) {
        if (value === null || value === undefined) return null;
        switch (type) {
            case 'int': return parseInt(value, 10);
            case 'float': return parseFloat(value);
            case 'bool': return value === 'true' || value === '1' || value === true;
            case 'datetime': return new Date(value).toISOString();
            default: return String(value);
        }
    }
}
