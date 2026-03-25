// src/crawler/core/AuthContext.js
export default class AuthContext {
    constructor() {
        this.type = null;           // 'cookie' | 'token' | 'session' | 'oauth'
        this.cookies = [];          // Cookie 数组
        this.token = null;          // Token 字符串
        this.tokenType = null;      // 'Bearer' | 'Basic' | 'JWT'
        this.headers = {};          // 自定义请求头
        this.expiresAt = null;      // 过期时间
        this.refreshToken = null;   // 刷新 token
    }
    
    /**
     * 设置 Cookie 认证
     */
    setCookies(cookies) {
        this.type = 'cookie';
        this.cookies = cookies;
        this._updateHeaders();
    }
    
    /**
     * 设置 Token 认证
     */
    setToken(token, type = 'Bearer') {
        this.type = 'token';
        this.token = token;
        this.tokenType = type;
        this._updateHeaders();
    }
    
    /**
     * 设置自定义请求头
     */
    setHeaders(headers) {
        this.headers = { ...this.headers, ...headers };
        this._updateHeaders();
    }
    
    /**
     * 更新完整请求头
     */
    _updateHeaders() {
        this.headers = { ...this.headers };
        
        if (this.type === 'token' && this.token) {
            this.headers['Authorization'] = `${this.tokenType} ${this.token}`;
        }
    }
    
    /**
     * 获取请求头
     */
    getHeaders() {
        return { ...this.headers };
    }
    
    /**
     * 获取 Cookie 字符串
     */
    getCookieString() {
        if (this.type !== 'cookie') return null;
        return this.cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    
    /**
     * 检查是否过期
     */
    isExpired() {
        if (!this.expiresAt) return false;
        return Date.now() > this.expiresAt;
    }
    
    /**
     * 是否有效
     */
    isValid() {
        if (!this.type) return false;
        if (this.isExpired()) return false;
        
        if (this.type === 'cookie' && (!this.cookies || this.cookies.length === 0)) return false;
        if (this.type === 'token' && !this.token) return false;
        
        return true;
    }
    
    /**
     * 清空认证信息
     */
    clear() {
        this.type = null;
        this.cookies = [];
        this.token = null;
        this.headers = {};
        this.expiresAt = null;
    }
}