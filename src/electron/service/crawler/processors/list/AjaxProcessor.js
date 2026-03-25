export default class AjaxProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;

        const allItems = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= (config.max_pages || 10)) {
            const url = config.url.replace('$page', page);
            const response = await resourceFetcher.fetch(url, {
                dynamic: false,
                headers: config.headers,
                params: { ...config.params, page }
            });

            let items = response.data;
            if (config.data_path) items = this._getNested(items, config.data_path);
            if (config.items_path) items = this._getNested(items, config.items_path);

            allItems.push(...(Array.isArray(items) ? items : [items]));
            hasMore = items?.length >= (config.page_size || 20);
            page++;
        }

        const data = this._buildData(allItems, config.fields);
        return { data, subTasks: data._subTasks || [] };
    }

    _getNested(obj, path) {
        return path.split('.').reduce((o, p) => o?.[p], obj);
    }

    _buildData(items, fields) {
        const result = { items, count: items.length, _subTasks: [] };
        if (!fields) return result;

        for (const [name, def] of Object.entries(fields)) {
            result[name] = items.map(item => this._getNested(item, def.selector) || null);

            if (def.subTask && typeof def.subTask === 'string') {
                for (const item of items) {
                    const url = this._getNested(item, def.selector);
                    if (url) {
                        result._subTasks.push({
                            type: def.subTask,
                            url: url,
                            context: { sourceField: name }
                        });
                    }
                }
            }
        }
        return result;
    }
}