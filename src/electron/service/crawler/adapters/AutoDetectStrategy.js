
/**
 * 自动检测策略（自动识别分页类型）
 */
class AutoDetectStrategy {
    constructor(config, page, options) {
        this.config = config;
        this.page = page;
        this.options = options;
    }

    async extract() {
        // 检测分页类型
        const paginationType = await this.detectPaginationType();

        // 根据检测结果使用对应策略
        const strategy = this.getStrategy(paginationType);
        return await strategy.extract();
    }

    async detectPaginationType() {
        // 检测是否有页码链接
        const hasPagination = await this.page.evaluate(() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = link.href;
                if (href && /[?&]page=\d+|\/page\/\d+/.test(href)) {
                    return true;
                }
            }
            return false;
        });

        if (hasPagination) {
            return 'pagination';
        }

        // 检测是否有加载更多按钮
        const hasLoadMore = await this.page.evaluate(() => {
            const buttons = document.querySelectorAll('button, a');
            for (const btn of buttons) {
                const text = btn.innerText.toLowerCase();
                if (text.includes('加载更多') || text.includes('load more')) {
                    return true;
                }
            }
            return false;
        });

        if (hasLoadMore) {
            return 'loadmore';
        }

        // 默认使用滚动加载
        return 'scroll';
    }

    getStrategy(type) {
        const strategies = {
            'pagination': PageNumberStrategy,
            'scroll': InfiniteScrollStrategy,
            'loadmore': LoadMoreStrategy
        };

        const StrategyClass = strategies[type];
        return new StrategyClass(this.config, this.page, this.options);
    }
}