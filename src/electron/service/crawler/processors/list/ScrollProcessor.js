export default class ScrollProcessor {
    async execute(ctx) {
        const { url, config, resourceFetcher, logger } = ctx;
        
        const pageResult = await resourceFetcher.fetch(url, { dynamic: true });
        
        const maxScrolls = config.max_scrolls || 20;
        const scrollDistance = config.scroll_distance || 1000;
        const waitBetween = config.wait_between || 2000;
        
        let previousCount = 0;
        for (let i = 0; i < maxScrolls; i++) {
            await pageResult.evaluate((d) => window.scrollBy(0, d), scrollDistance);
            await pageResult.waitForTimeout(waitBetween);
            
            const currentCount = await this._getItemCount(pageResult, config);
            if (currentCount === previousCount) break;
            previousCount = currentCount;
        }
        
        const items = await this._extractItems(pageResult, config);
        const data = this._buildData(items, config.fields);
        return { data, subTasks: data._subTasks || [] };
    }
    
    async _getItemCount(pageResult, config) {
        const selector = config.items || 'a';
        return await pageResult.evaluate((sel) => document.querySelectorAll(sel).length, selector);
    }
    
    async _extractItems(pageResult, config) {
        const selector = config.items || 'a';
        return await pageResult.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
            return Array.from(elements).map((el, idx) => ({
                index: idx, html: el.outerHTML, text: el.innerText, link: el.querySelector('a')?.href
            }));
        }, selector);
    }
    
    _buildData(items, fields) {
        const result = { items, count: items.length, _subTasks: [] };
        if (!fields) return result;
        for (const [name, def] of Object.entries(fields)) {
            result[name] = items.map(item => item[name] || null);
            if (def.subTask) {
                for (const item of items) {
                    if (item.link) result._subTasks.push({
                        type: 'page', model: def.subTask.stepRef || def.subTask,
                        url: item.link, context: { sourceField: name }
                    });
                }
            }
        }
        return result;
    }
}
