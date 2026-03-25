export default class RssProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;

        const response = await resourceFetcher.fetch(config.url, { dynamic: false });
        const items = [];

        response.$('item').each((_, el) => {
            const item = {};
            for (const [name, def] of Object.entries(config.fields || {})) {
                item[name] = response.$(el).find(def.selector).text();
            }
            items.push(item);
        });

        const data = this._buildData(items, config.fields);
        return { data, subTasks: data._subTasks || [] };
    }

    _buildData(items, fields) {
        const result = { items, count: items.length, _subTasks: [] };
        if (!fields) return result;
        for (const [name, def] of Object.entries(fields)) {
            result[name] = items.map(item => item[name]);
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
