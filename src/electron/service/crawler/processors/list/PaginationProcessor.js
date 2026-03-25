export default class PaginationProcessor {
    async execute(ctx) {
        const { url, config, resourceFetcher, logger } = ctx;
        
        const startPage = config.start_page || 1;
        const maxPages = config.max_pages || 10;
        
        let allItems = [];
        let currentPage = startPage;
        let nextUrl = url;
        
        while (currentPage <= maxPages && nextUrl) {
            logger?.debug(`[Pagination] Fetching page ${currentPage}: ${nextUrl}`);
            
            const pageResult = await resourceFetcher.fetch(nextUrl, { dynamic: config.dynamic });
            
            if (config.wait_selector) {
                await pageResult.waitForSelector(config.wait_selector);
            }
            
            const items = await this._extractItems(pageResult, config);
            allItems = allItems.concat(items);
            
            if (config.next_selector) {
                nextUrl = await pageResult.attr(config.next_selector, 'href');
            } else {
                currentPage++;
                nextUrl = this._buildPageUrl(url, currentPage);
                if (currentPage > maxPages) nextUrl = null;
            }
        }
        
        const data = this._buildData(allItems, config.fields);
        return { data, subTasks: data._subTasks || [] };
    }
    
    async _extractItems(pageResult, config) {
        const selector = config.items;
        if (!selector) return [];
        
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
                    if (item.link) {
                        result._subTasks.push({
                            type: 'page', model: def.subTask.stepRef || def.subTask,
                            url: item.link, context: { sourceField: name }
                        });
                    }
                }
            }
        }
        return result;
    }
    
    _buildPageUrl(baseUrl, page) {
        if (baseUrl.includes('$page')) return baseUrl.replace('$page', page);
        const sep = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${sep}page=${page}`;
    }
}
