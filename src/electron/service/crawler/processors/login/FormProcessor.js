import AuthContext from "../../core/AuthContenxt.js";
export default class FormProcessor {
    async execute(ctx) {
        const { config, siteUrl, resourceFetcher, logger } = ctx;
        const loginUrl = config.url || `${siteUrl}/login`;
        
        const pageResult = await resourceFetcher.fetch(loginUrl, { dynamic: true });
        
        const formData = {};
        for (const [key, value] of Object.entries(config.fields || {})) {
            if (typeof value === 'string') formData[key] = value;
            else if (value?.dynamic) formData[key] = await this._extractField(pageResult, value);
        }
        
        if (config.submit) {
            await pageResult.evaluate((data, sel) => {
                for (const [k, v] of Object.entries(data)) {
                    const input = document.querySelector(`[name="${k}"]`);
                    if (input) input.value = v;
                }
                document.querySelector(sel).click();
            }, formData, config.submit);
            await pageResult.waitForNavigation();
        }
        
        const cookies = await pageResult.cookies();
        const authContext = new AuthContext();
        authContext.setCookies(cookies);
        
        return { success: true, authContext };
    }
    
    async _extractField(pageResult, field) {
        return field.attribute ? await pageResult.attr(field.selector, field.attribute) : await pageResult.text(field.selector);
    }
}
