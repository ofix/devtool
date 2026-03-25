import AuthContext from "../../core/AuthContenxt.js";
export default class QrProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;
        const pageResult = await resourceFetcher.fetch(config.url, { dynamic: true });
        
        const interval = config.check_interval || 2;
        const timeout = (config.timeout || 60) * 1000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const cookies = await pageResult.cookies();
            if (cookies.length > 0) {
                const authContext = new AuthContext();
                authContext.setCookies(cookies);
                return { success: true, authContext };
            }
            await pageResult.waitForTimeout(interval * 1000);
        }
        
        throw new Error('QR code login timeout');
    }
}
