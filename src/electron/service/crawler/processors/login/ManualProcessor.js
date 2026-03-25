import AuthContext from "../../core/AuthContenxt.js";
export default class ManualProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;
        const pageResult = await resourceFetcher.fetch(config.url, { dynamic: true });
        
        logger?.info(`Please manually login at ${config.url}, then press Enter...`);
        await new Promise(resolve => process.stdin.once('data', resolve));
        
        const cookies = await pageResult.cookies();
        const authContext = new AuthContext();
        authContext.setCookies(cookies);
        
        return { success: true, authContext };
    }
}
