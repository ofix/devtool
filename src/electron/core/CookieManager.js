import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

// Cookie持久化存储路径（Electron应用用户数据目录）
const COOKIE_STORE_PATH = path.join(app.getPath('userData'), 'cookieStore.json');

export class CookieManager {
  constructor() {
    // 存储结构：{ "domain/ip": { "cookieName": { value, domain, path, expires, maxAge, httpOnly, secure, createdTime } } }
    this.cookieStore = {};
    // 初始化时加载本地持久化的Cookie
    this.loadCookieStoreFromFile();
    // 定时清理过期Cookie（每30分钟执行一次，可自定义间隔）
    this.initExpiredCookieCleaner();
  }

  /**
   * 从本地文件加载Cookie存储，并过滤已过期的Cookie
   */
  async loadCookieStoreFromFile() {
    try {
      const exists = await fs.access(COOKIE_STORE_PATH).then(() => true).catch(() => false);
      if (exists) {
        const rawData = await fs.readFile(COOKIE_STORE_PATH, 'utf8');
        this.cookieStore = JSON.parse(rawData) || {};
        // 加载后立即清理过期Cookie
        this.cleanAllExpiredCookies();
        console.log('Cookie存储已从本地加载并完成过期清理');
      }
    } catch (error) {
      console.warn('加载本地Cookie失败，使用空存储:', error.message);
      this.cookieStore = {};
    }
  }

  /**
   * 将Cookie存储持久化到本地文件
   */
  async persistCookieStoreToFile() {
    try {
      await fs.writeFile(
        COOKIE_STORE_PATH,
        JSON.stringify(this.cookieStore, null, 2),
        'utf8'
      );
      console.log('Cookie存储已持久化到本地');
    } catch (error) {
      console.error('Cookie持久化失败:', error.message);
    }
  }

  /**
   * 解析Cookie过期时间，统一转换为时间戳（毫秒）
   * @param {Object} cookieMeta - Cookie元数据
   * @returns {number|null} 过期时间戳（毫秒），永久有效返回null
   */
  parseExpirationTime(cookieMeta) {
    let expireTimestamp = null;
    const now = Date.now();

    // 处理 Expires（绝对时间，格式：Wed, 21 Oct 2025 07:28:00 GMT）
    if (cookieMeta.expires) {
      const expiresDate = new Date(cookieMeta.expires);
      if (!isNaN(expiresDate.getTime())) {
        expireTimestamp = expiresDate.getTime();
      }
    }

    // 处理 Max-Age（相对秒数，优先级高于Expires，符合Cookie规范）
    if (cookieMeta['max-age']) {
      const maxAgeSeconds = parseInt(cookieMeta['max-age'], 10);
      if (!isNaN(maxAgeSeconds)) {
        expireTimestamp = now + (maxAgeSeconds * 1000);
      }
    }

    return expireTimestamp;
  }

  /**
   * 解析Set-Cookie响应头，按域名/IP隔离存储（含过期时间处理）
   * @param {string} host - 域名或IP（来自请求的hostname）
   * @param {Array|string} setCookieHeader - 响应头中的Set-Cookie字段
   */
  parseAndStoreCookie(host, setCookieHeader) {
    if (!host || !setCookieHeader) return;

    // 统一转为数组格式（单个Cookie是字符串，多个是数组）
    const cookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    // 初始化当前主机的Cookie存储
    if (!this.cookieStore[host]) {
      this.cookieStore[host] = {};
    }

    cookieHeaders.forEach(cookieStr => {
      const cookieParts = cookieStr.split(';').map(part => part.trim());
      const [nameValuePair] = cookieParts;
      const [cookieName, cookieValue] = nameValuePair.split('=').map(part => part.trim());

      if (!cookieName) return;

      // 解析Cookie附加属性（domain/path/expires/max-age等）
      const cookieMeta = { 
        value: cookieValue,
        createdTime: Date.now() // 记录Cookie创建时间
      };
      cookieParts.slice(1).forEach(part => {
        const [key, val] = part.split('=').map(p => p.trim());
        if (key) {
          cookieMeta[key.toLowerCase()] = val || true; // 无值的属性（如HttpOnly）设为true
        }
      });

      // 解析并存储过期时间戳（统一格式，优先级：Max-Age > Expires）
      cookieMeta.expireTimestamp = this.parseExpirationTime(cookieMeta);

      // 存储Cookie（覆盖同名Cookie）
      this.cookieStore[host][cookieName] = cookieMeta;
    });

    // 清理当前主机的过期Cookie，再持久化到本地
    this.cleanExpiredCookiesByHost(host);
    this.persistCookieStoreToFile();
  }

  /**
   * 判断单个Cookie是否过期
   * @param {Object} cookieMeta - Cookie元数据
   * @returns {boolean} true=已过期，false=有效
   */
  isCookieExpired(cookieMeta) {
    // 无过期时间标识，视为永久有效
    if (cookieMeta.expireTimestamp === null) return false;
    // 过期时间戳小于当前时间，视为已过期
    return cookieMeta.expireTimestamp < Date.now();
  }

  /**
   * 获取指定主机的格式化Cookie字符串（自动过滤过期Cookie）
   * @param {string} host - 域名或IP
   * @returns {string} 格式："name1=value1; name2=value2"
   */
  getFormattedCookie(host) {
    if (!this.cookieStore[host]) return '';

    const cookieArr = [];
    const hostCookies = this.cookieStore[host];

    // 过滤过期Cookie，收集有效Cookie
    Object.entries(hostCookies).forEach(([name, meta]) => {
      if (this.isCookieExpired(meta)) {
        // 移除过期Cookie
        delete hostCookies[name];
        console.log(`已移除${host}的过期Cookie: ${name}`);
      } else {
        // 收集有效Cookie
        cookieArr.push(`${name}=${meta.value}`);
      }
    });

    // 更新存储并持久化
    this.cookieStore[host] = hostCookies;
    this.persistCookieStoreToFile();

    return cookieArr.join('; ');
  }

  /**
   * 清理指定主机的过期Cookie
   * @param {string} host - 域名或IP
   */
  cleanExpiredCookiesByHost(host) {
    if (!this.cookieStore[host]) return;

    const hostCookies = this.cookieStore[host];
    let hasChanged = false;

    Object.entries(hostCookies).forEach(([name, meta]) => {
      if (this.isCookieExpired(meta)) {
        delete hostCookies[name];
        hasChanged = true;
        console.log(`清理${host}的过期Cookie: ${name}`);
      }
    });

    // 仅当有变更时才持久化，提升性能
    if (hasChanged) {
      this.cookieStore[host] = hostCookies;
      this.persistCookieStoreToFile();
    }
  }

  /**
   * 清理所有主机的过期Cookie
   */
  cleanAllExpiredCookies() {
    let hasChanged = false;

    Object.keys(this.cookieStore).forEach(host => {
      const hostCookies = this.cookieStore[host];
      const originalCount = Object.keys(hostCookies).length;

      Object.entries(hostCookies).forEach(([name, meta]) => {
        if (this.isCookieExpired(meta)) {
          delete hostCookies[name];
          hasChanged = true;
          console.log(`清理${host}的过期Cookie: ${name}`);
        }
      });

      // 若某主机Cookie已全部过期，移除该主机的空存储
      if (Object.keys(hostCookies).length === 0) {
        delete this.cookieStore[host];
        hasChanged = true;
      } else {
        this.cookieStore[host] = hostCookies;
      }
    });

    // 仅当有变更时才持久化
    if (hasChanged) {
      this.persistCookieStoreToFile();
      console.log('全局过期Cookie清理完成');
    }
  }

  /**
   * 初始化定时清理过期Cookie的任务
   * @param {number} interval - 清理间隔（毫秒），默认30分钟
   */
  initExpiredCookieCleaner(interval = 30 * 60 * 1000) {
    // 立即执行一次初始清理
    this.cleanAllExpiredCookies();
    // 设置定时任务
    setInterval(() => {
      this.cleanAllExpiredCookies();
    }, interval);
    console.log(`过期Cookie定时清理已启用，间隔：${interval / 1000 / 60}分钟`);
  }

  /**
   * 清除指定主机的Cookie
   * @param {string} host - 域名或IP
   */
  clearCookieByHost(host) {
    if (this.cookieStore[host]) {
      delete this.cookieStore[host];
      this.persistCookieStoreToFile();
      console.log(`已清除${host}的所有Cookie`);
    }
  }

  /**
   * 清除所有Cookie
   */
  clearAllCookies() {
    this.cookieStore = {};
    this.persistCookieStoreToFile();
    console.log('已清除所有主机的Cookie');
  }
}

// 导出单例（全局共享Cookie存储）
export const cookieManager = new CookieManager();