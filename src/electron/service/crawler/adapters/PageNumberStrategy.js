
/**
 * 页码分页策略（点击下一页按钮）
 */
export default class PageNumberStrategy {
    constructor(config, page, options) {
        this.config = config;
        this.page = page;
        this.options = options;
        this.items = [];
    }

    async extract() {
        let currentPage = 1;
        const maxPages = this.config.maxPages || Infinity;

        while (currentPage <= maxPages) {
            // 构建URL（如果有页码参数）
            const url = this.buildUrl(this.config.url, currentPage);
            if (url !== this.page.url()) {
                await this.page.goto(url, { waitUntil: 'networkidle2' });
            }

            // 等待列表加载
            await this.waitForList();

            // 提取当前页列表项
            const pageItems = await this.extractPageItems();
            this.items.push(...pageItems);

            // 检查是否有下一页
            const hasNext = await this.hasNextPage();
            if (!hasNext) break;

            // 点击下一页
            await this.clickNextPage();
            currentPage++;

            // 页面延迟
            await this.delay();
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

                // 提取标题
                if (config.titleSelector) {
                    const titleEl = el.querySelector(config.titleSelector);
                    item.title = titleEl ? titleEl.innerText.trim() : '';
                }

                // 提取链接
                if (config.linkSelector) {
                    const linkEl = el.querySelector(config.linkSelector);
                    item.link = linkEl ? linkEl.href : '';
                }

                // 提取缩略图
                if (config.thumbnailSelector) {
                    const thumbEl = el.querySelector(config.thumbnailSelector);
                    item.thumbnail = thumbEl ? (thumbEl.src || thumbEl.href) : '';
                }

                // 提取摘要
                if (config.summarySelector) {
                    const summaryEl = el.querySelector(config.summarySelector);
                    item.summary = summaryEl ? summaryEl.innerText.trim() : '';
                }

                // 提取时间
                if (config.timeSelector) {
                    const timeEl = el.querySelector(config.timeSelector);
                    item.time = timeEl ? timeEl.innerText.trim() : '';
                }

                // 自定义字段
                if (config.customFields) {
                    for (const [key, selector] of Object.entries(config.customFields)) {
                        const fieldEl = el.querySelector(selector);
                        item[key] = fieldEl ? fieldEl.innerText.trim() : '';
                    }
                }

                if (item.title || item.link) {
                    items.push(item);
                }
            }

            return items;
        }, this.config);
    }

    async hasNextPage() {
        if (!this.config.nextPageSelector) return false;

        try {
            const nextButton = await this.page.$(this.config.nextPageSelector);
            const isDisabled = await this.page.evaluate(
                (el) => el.disabled || el.classList.contains('disabled'),
                nextButton
            );

            return nextButton !== null && !isDisabled;
        } catch {
            return false;
        }
    }

    async clickNextPage() {
        try {
            await this.page.click(this.config.nextPageSelector);
            await this.page.waitForNavigation({
                waitUntil: 'networkidle2',
                timeout: this.config.timeout || 10000
            });
        } catch (error) {
            console.warn('Failed to click next page:', error.message);
        }
    }

    buildUrl(baseUrl, page) {
        return baseUrl.replace('{page}', page).replace('{p}', page);
    }

    async delay() {
        const delay = this.config.pageDelay || 2000;
        if (this.options.antiSpiderHandler) {
            await this.options.antiSpiderHandler.randomDelay(delay, delay * 1.5);
        } else {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}