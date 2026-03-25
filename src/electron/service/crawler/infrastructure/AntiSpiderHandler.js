export default class AntiSpiderHandler {
    constructor(config = {}) {
        this.config = config;
        this.userAgents = config.userAgents || [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    async randomDelay(min, max) {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        await this.sleep(delay);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async autoScroll(page, distance = 1000, wait = 2000) {
        await page.evaluate((d) => window.scrollBy(0, d), distance);
        await this.sleep(wait);
    }

    async randomMouseMove(page) {
        const x = Math.random() * 1920;
        const y = Math.random() * 1080;
        await page.mouse.move(x, y);
        await this.sleep(Math.random() * 500);
    }
}
