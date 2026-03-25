export default class GraphQLProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;

        const allItems = [];
        let cursor = null;
        let hasNextPage = true;
        let page = 0;

        while (hasNextPage && page < (config.max_pages || 10)) {
            const variables = { ...config.variables, cursor };
            const response = await resourceFetcher.fetch(config.url, {
                dynamic: false, method: 'POST',
                headers: { 'Content-Type': 'application/json', ...config.headers },
                data: { query: config.query, variables }
            });

            let data = response.data;
            if (config.data_path) data = this._getNested(data, config.data_path);

            const items = data?.edges?.map(e => e.node) || data?.items || [];
            allItems.push(...items);

            hasNextPage = data?.pageInfo?.hasNextPage || false;
            cursor = data?.pageInfo?.endCursor;
            page++;
        }

        const result = this._buildData(allItems, config.fields);
        return { data: result, subTasks: result._subTasks || [] };
    }

    _getNested(obj, path) {
        return path.split('.').reduce((o, p) => o?.[p], obj);
    }

    _buildData(items, fields) {
        const result = { items, count: items.length, _subTasks: [] };
        if (!fields) return result;
        for (const [name, def] of Object.entries(fields)) {
            result[name] = items.map(item => this._getNested(item, def.selector) || null);
            if (def.subTask) {
                for (const item of items) {
                    const url = this._getNested(item, def.selector);
                    if (url) result._subTasks.push({
                        type: 'page', model: def.subTask.stepRef || def.subTask,
                        url, context: { sourceField: name }
                    });
                }
            }
        }
        return result;
    }
}
