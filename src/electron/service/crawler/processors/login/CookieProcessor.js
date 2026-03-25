import AuthContext from "../../core/AuthContenxt.js";
export default class CookieProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;
        const authContext = new AuthContext();
        authContext.setCookies(config.cookies || []);
        
        if (config.verify_url) {
            const pageResult = await resourceFetcher.fetch(config.verify_url, { dynamic: true });
            if (config.verify_selector && !(await pageResult.$(config.verify_selector))) {
                throw new Error('Cookie verification failed');
            }
        }
        
        return { success: true, authContext };
    }
}
