// src/main/crawler/adapters/PaginationAdapter.js
/**
 * 分页适配器 - 支持多种分页方式
 * 采用策略模式，根据不同分页类型使用不同策略
 */

export default class PaginationAdapter {
    /**
     * 构造函数
     * @param {Object} config - 分页配置
     * @param {Object} page - Puppeteer页面对象
     * @param {Object} options - 额外选项
     */
    constructor(config, page, options = {}) {
        this.config = config;
        this.page = page;
        this.options = options;

        // 分页类型策略映射
        this.strategies = {
            'pagination': new PageNumberStrategy(config, page, options),
            'scroll': new InfiniteScrollStrategy(config, page, options),
            'loadmore': new LoadMoreStrategy(config, page, options),
            'auto': new AutoDetectStrategy(config, page, options)
        };
    }

    /**
     * 提取所有列表项
     */
    async extract() {
        const type = this.config.paginationType || 'auto';
        const strategy = this.strategies[type];

        if (!strategy) {
            throw new Error(`Unsupported pagination type: ${type}`);
        }

        return await strategy.extract();
    }
}