
/**
 * 加载更多策略（点击加载更多按钮）
 */
export default class LoadMoreStrategy {
    constructor(config, page, options) {
        this.config = config;
        this.page = page;
        this.options = options;
        this.items = [];
        this.loadCount = 0;
    }

    async extract() {
        const maxLoads = this.config.maxLoads || 20;

        // 获取初始列表项
        await this.waitForList();
        let items = await this.extractPageItems();
        this.items.push(...items);

        while (this.loadCount < maxLoads) {
            // 检查是否有加载更多按钮
            const hasLoadMore = await this.hasLoadMoreButton();
            if (!hasLoadMore) break;

            // 点击加载更多
            await this.clickLoadMore();
            this.loadCount++;

            // 等待新内容加载
            await this.waitForNewContent();
            await this.delay();

            // 提取新项
            const newItems = await this.extractNewItems();
            this.items.push(...newItems);
        }

        return this.items;
    }

    async waitForList() {
        try {
            await this.page.waitForSelector(this.config.itemSelector, {
                timeout: this.config.timeout || 10000
            });
        } catch (error) {
            console.warn('List selector not found:', this.config.itemSelector);
        }
    }

    async extractPageItems() {
        return await this.page.evaluate((config) => {
            const elements = document.querySelectorAll(config.itemSelector);
            const items = [];

            for (const el of elements) {
                const item = {};

                if (config.titleSelector) {
                    const titleEl = el.querySelector(config.titleSelector);
                    item.title = titleEl ? titleEl.innerText.trim() : '';
                }

                if (config.linkSelector) {
                    const linkEl = el.querySelector(config.linkSelector);
                    item.link = linkEl ? linkEl.href : '';
                }

                if (item.title || item.link) {
                    items.push(item);
                }
            }

            return items;
        }, this.config);
    }

    async hasLoadMoreButton() {
        if (!this.config.loadMoreSelector) return false;

        const button = await this.page.$(this.config.loadMoreSelector);
        return button !== null;
    }

    async clickLoadMore() {
        try {
            await this.page.click(this.config.loadMoreSelector);
        } catch (error) {
            console.warn('Failed to click load more:', error.message);
        }
    }

    async waitForNewContent() {
        const currentCount = this.items.length;

        await this.page.waitForFunction(
            (selector, count) => {
                return document.querySelectorAll(selector).length > count;
            },
            { timeout: 10000 },
            this.config.itemSelector,
            currentCount
        ).catch(() => { });
    }

    async extractNewItems() {
        const currentCount = this.items.length;

        const newItems = await this.page.evaluate((config, startIndex) => {
            const elements = document.querySelectorAll(config.itemSelector);
            const items = [];

            for (let i = startIndex; i < elements.length; i++) {
                const el = elements[i];
                const item = {};

                if (config.titleSelector) {
                    const titleEl = el.querySelector(config.titleSelector);
                    item.title = titleEl ? titleEl.innerText.trim() : '';
                }

                if (config.linkSelector) {
                    const linkEl = el.querySelector(config.linkSelector);
                    item.link = linkEl ? linkEl.href : '';
                }

                if (item.title || item.link) {
                    items.push(item);
                }
            }

            return items;
        }, this.config, currentCount);

        return newItems;
    }

    async delay() {
        const delay = this.config.loadDelay || 2000;
        if (this.options.antiSpiderHandler) {
            await this.options.antiSpiderHandler.sleep(delay);
        } else {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}