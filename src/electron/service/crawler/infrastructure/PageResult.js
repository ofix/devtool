
/**
 * 页面结果类
 */
export default class PageResult {
    constructor(options) {
        this.url = options.url;
        this.html = options.html;
        this.$ = options.$;
        this.page = options.page;
        this.mode = options.mode;
        this.statusCode = options.statusCode;
        this.headers = options.headers;
        this.duration = options.duration;
        this.cookies = options.cookies || [];
        this.response = options.response;
        this.proxy = options.proxy;
        this.fromFallback = options.fromFallback || false;
        this.fallbackReason = options.fallbackReason;
    }

    text(selector) {
        return this.$(selector).text().trim();
    }

    attr(selector, name) {
        return this.$(selector).attr(name);
    }

    html(selector) {
        return this.$(selector).html();
    }

    querySelector(selector) {
        return this.$(selector).get(0);
    }

    querySelectorAll(selector) {
        return this.$(selector).toArray();
    }

    async waitForSelector(selector, options) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.waitForSelector(selector, options);
        }
        return true;
    }

    async waitForNavigation(options) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.waitForNavigation(options);
        }
        return true;
    }

    async waitForTimeout(ms) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.waitForTimeout(ms);
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async evaluate(fn, ...args) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.evaluate(fn, ...args);
        }
        return fn(...args);
    }

    async screenshot(options) {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.screenshot(options);
        }
        throw new Error('Screenshot only available in dynamic mode');
    }

    async getCookies() {
        if (this.mode === 'dynamic' && this.page) {
            return await this.page.cookies();
        }
        return this.cookies;
    }

    isDynamic() {
        return this.mode === 'dynamic';
    }

    isStatic() {
        return this.mode === 'static';
    }

    isFromFallback() {
        return this.fromFallback;
    }
}