export default class InfiniteProcessor {
    async execute(ctx) {
        const { url, config, resourceFetcher, logger } = ctx;

        const pageResult = await resourceFetcher.fetch(url, { dynamic: true });

        const maxLoads = config.max_loads || 30;
        const waitAfter = config.wait_after || 2000;
        const triggerSelector = config.trigger || '.infinite-trigger';

        let items = [];
        for (let i = 0; i < maxLoads; i++) {
            items = await this._extractItems(pageResult, config);

            const hasTrigger = await pageResult.$(triggerSelector);
            if (!hasTrigger) break;

            await pageResult.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) el.scrollIntoView();
            }, triggerSelector);
            await pageResult.waitForTimeout(waitAfter);
        }

        const data = this._buildData(items, config.fields);
        return { data, subTasks: data._subTasks || [] };
    }

    async _extractItems(pageResult, config) {
        const selector = config.items || '.item';
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
