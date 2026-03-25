// src/electron/service/crawler/login/ApiProcessor.js
import AuthContext from "../../core/AuthContenxt.js";
export default class ApiProcessor {
    async execute(ctx) {
        const { config, resourceFetcher, logger } = ctx;
        const response = await resourceFetcher.fetch(config.url, {
            method: config.method || 'POST', headers: config.headers, data: config.body, dynamic: false
        });
        
        let token = response.data;
        if (config.response?.token) {
            token = config.response.token.split('.').reduce((o, p) => o?.[p], token);
        }
        const authContext = new AuthContext();
        authContext.setToken(token, config.token_usage?.prefix || 'Bearer');
        
        return { success: true, authContext };
    }
}
