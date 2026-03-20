
/**
 * 无限滚动策略（滚动加载）
 */
class InfiniteScrollStrategy {
    constructor(config, page, options) {
        this.config = config;
        this.page = page;
        this.options = options;
        this.items = [];
        this.scrollCount = 0;
    }

    async extract() {
        const maxScrolls = this.config.maxScrolls || 50;
        const scrollDelay = this.config.scrollDelay || 1000;

        // 获取初始列表项
        await this.waitForList();
        let previousCount = 0;

        while (this.scrollCount < maxScrolls) {
            // 提取当前可见项
            const currentItems = await this.extractPageItems();
            this.items = currentItems; // 滚动加载通常不重复，直接替换

            // 检查是否还有更多内容
            const hasMore = await this.checkHasMore();
            if (!hasMore) break;

            // 检查是否没有新内容加载
            if (currentItems.length === previousCount && this.scrollCount > 0) {
                break;
            }

            previousCount = currentItems.length;

            // 滚动到底部
            await this.scrollToBottom();
            this.scrollCount++;

            // 等待新内容加载
            await this.waitForNewContent();
            await this.delay(scrollDelay);
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

                if (config.thumbnailSelector) {
                    const thumbEl = el.querySelector(config.thumbnailSelector);
                    item.thumbnail = thumbEl ? (thumbEl.src || thumbEl.href) : '';
                }

                if (item.title || item.link) {
                    items.push(item);
                }
            }

            return items;
        }, this.config);
    }

    async scrollToBottom() {
        await this.page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    }

    async checkHasMore() {
        if (this.config.endSelector) {
            const endElement = await this.page.$(this.config.endSelector);
            return endElement === null;
        }
        return true;
    }

    async waitForNewContent() {
        const currentCount = await this.page.$$eval(
            this.config.itemSelector,
            els => els.length
        );

        // 等待新内容加载
        await this.page.waitForFunction(
            (selector, count) => {
                return document.querySelectorAll(selector).length > count;
            },
            { timeout: 5000 },
            this.config.itemSelector,
            currentCount
        ).catch(() => { });
    }

    async delay(ms) {
        if (this.options.antiSpiderHandler) {
            await this.options.antiSpiderHandler.sleep(ms);
        } else {
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    }
}