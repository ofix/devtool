import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export default class BrowserManager {
    constructor(options = {}) {
        this.headless = options.headless !== false;
        this.browser = null;
        this.pages = [];
        this.userAgents = options.userAgents || [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        ];
    }

    async getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            this.browser = await puppeteer.launch({
                headless: this.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage'
                ]
            });
        }
        return this.browser;
    }

    async getPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
        await page.setUserAgent(userAgent);

        await page.setViewport({ width: 1920, height: 1080 });

        await this._injectAntiDetection(page);

        this.pages.push(page);
        return page;
    }

    async _injectAntiDetection(page) {
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });
    }

    async closePage(page) {
        const index = this.pages.indexOf(page);
        if (index !== -1) {
            this.pages.splice(index, 1);
        }
        await page.close();
    }

    async close() {
        for (const page of this.pages) {
            await page.close().catch(() => { });
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
