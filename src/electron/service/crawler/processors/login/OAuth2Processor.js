import AuthContext from "../../core/AuthContenxt.js";
export default class OAuth2Processor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;
        const authUrl = `${config.auth_url}?client_id=${config.client_id}&redirect_uri=${config.redirect_uri}&scope=${config.scope}&response_type=code`;
        
        const pageResult = await resourceFetcher.fetch(authUrl, { dynamic: true });
        const callbackUrl = await new Promise(resolve => {
            pageResult.page.on('framenavigated', async (frame) => {
                const url = frame.url();
                if (url.includes(config.redirect_uri)) resolve(url);
            });
        });
        
        const code = new URL(callbackUrl).searchParams.get('code');
        const tokenRes = await resourceFetcher.fetch(config.token_url, {
            method: 'POST', data: { client_id: config.client_id, client_secret: config.client_secret, code, grant_type: 'authorization_code' }, dynamic: false
        });
        
        const token = tokenRes.data.access_token;
        const authContext = new AuthContext();
        authContext.setToken(token, 'Bearer');
        
        return { success: true, authContext };
    }
}
