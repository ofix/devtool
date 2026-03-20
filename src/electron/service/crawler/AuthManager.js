export default class AuthManager {
    constructor(dbPath) {
      this.db = new Database(dbPath);
      // 支持多种登录策略
      this.loginStrategies = new Map([
        ['form', new FormLoginStrategy()],
        ['cookie', new CookieLoginStrategy()],
        ['oauth', new OAuthLoginStrategy()],
        ['manual', new ManualLoginStrategy()]
      ]);
    }
    
    async login(crawlerName, config) {
      // 1. 检查是否有有效凭证
      const credentials = await this.getCredentials(crawlerName);
      if (credentials && !this.isExpired(credentials)) {
        return credentials;
      }
      
      // 2. 执行登录策略
      const strategy = this.loginStrategies.get(config.type);
      const result = await strategy.execute(config);
      
      // 3. 保存凭证
      await this.saveCredentials(crawlerName, result);
      
      return result;
    }
    
    async getCookies(crawlerName) {
      const credentials = await this.getCredentials(crawlerName);
      return credentials?.cookies || null;
    }
    
    // 自动刷新Token
    async refreshToken(crawlerName) {
      const credentials = await this.getCredentials(crawlerName);
      if (credentials && credentials.refreshToken) {
        // 刷新逻辑
      }
    }
  }