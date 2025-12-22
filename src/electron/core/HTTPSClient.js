import https from 'https';
import url from 'url';
import { cookieManager } from './CookieManager.js';

export class HttpsRequestClient {
  /**
   * 构造函数：配置默认跳转参数
   */
  constructor() {
    // 默认最大跳转次数（避免死循环）
    this.defaultMaxRedirects = 5;
  }

  /**
   * 私有核心方法：发送请求（所有HTTP方法复用）
   * @param {Object} options - 请求配置
   * @param {number} redirectCount - 当前跳转次数（递归使用，外部调用无需传入）
   * @returns {Promise<Object>} 标准化响应结果
   */
  async _sendRequest(options, redirectCount = 0) {
    // 解构配置项，提取跳转相关参数
    const {
      method,
      host,
      path,
      data = null,
      contentType = 'application/json',
      headers = {},
      ignoreSslError = true,
      followRedirect = true,
      maxRedirects = this.defaultMaxRedirects
    } = options;

    // 超出最大跳转次数，抛出错误
    if (redirectCount > maxRedirects) {
      throw new Error(`超出最大跳转次数(${maxRedirects})，可能存在重定向死循环`);
    }

    return new Promise((resolve, reject) => {
      // 1. 处理请求体序列化（仅非GET/DELETE等无请求体方法需要）
      let requestData = null;
      try {
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
          if (contentType === 'application/json') {
            requestData = JSON.stringify(data);
          } else if (contentType === 'application/x-www-form-urlencoded') {
            requestData = new URLSearchParams(data).toString();
          } else {
            throw new Error(`不支持的Content-Type: ${contentType}`);
          }
        }
      } catch (error) {
        reject(new Error(`请求体序列化失败: ${error.message}`));
        return;
      }

      // 2. 构造基础请求配置
      const requestOptions = {
        hostname: host,
        path: path,
        method: method,
        // 核心：忽略自签名SSL证书
        rejectUnauthorized: !ignoreSslError,
        // 禁用SSL证书验证（增强自签名兼容）
        agent: new https.Agent({ rejectUnauthorized: !ignoreSslError }),
        headers: {
          'Content-Type': contentType,
          'Accept': 'application/json',
          'User-Agent': 'Electron/HttpsClient/2.0.0',
          // 自动携带当前主机的有效Cookie
          'Cookie': cookieManager.getFormattedCookie(host),
          // 合并自定义请求头（自定义头覆盖默认头）
          ...headers
        }
      };

      // 3. 处理请求体长度（仅当有请求体时添加）
      if (requestData) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(requestData);
      } else {
        // 无请求体时，移除Content-Length头
        delete requestOptions.headers['Content-Length'];
      }

      // 4. 发送请求
      const req = https.request(requestOptions, (res) => {
        // 5. 处理301/302重定向
        if (followRedirect && [301, 302].includes(res.statusCode) && res.headers.location) {
          console.log(`检测到${res.statusCode}重定向，目标地址: ${res.headers.location}`);
          
          // 解析重定向地址（支持相对路径和绝对路径）
          const redirectUrl = new url.URL(res.headers.location, `https://${host}${path}`);
          const newHost = redirectUrl.hostname;
          const newPath = redirectUrl.pathname + redirectUrl.search;

          // 递归发送重定向请求（跳转次数+1）
          this._sendRequest(
            {
              ...options,
              host: newHost, // 新域名/IP
              path: newPath, // 新路径
              // 重定向时，GET请求保留查询参数，POST可能需要转为GET（根据浏览器规范）
              method: res.statusCode === 302 && method === 'POST' ? 'GET' : method
            },
            redirectCount + 1
          )
            .then(resolvedData => resolve(resolvedData))
            .catch(err => reject(err));
          return; // 终止当前请求的后续处理
        }

        // 6. 非重定向场景：处理响应
        // 先解析并存储响应中的Set-Cookie
        if (res.headers['set-cookie']) {
          cookieManager.parseAndStoreCookie(host, res.headers['set-cookie']);
        }

        // 接收响应数据
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });

        // 响应接收完成
        res.on('end', () => {
          try {
            // 解析响应体（兼容JSON和普通文本）
            const parsedData = requestOptions.headers['Accept'].includes('json')
              ? (responseData ? JSON.parse(responseData) : {})
              : responseData;

            // 返回标准化响应结果
            resolve({
              status: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              data: parsedData,
              redirectCount: redirectCount // 返回实际跳转次数
            });
          } catch (error) {
            reject(new Error(`响应体解析失败: ${error.message}，原始数据: ${responseData}`));
          }
        });
      });

      // 7. 错误处理（网络错误、SSL错误等）
      req.on('error', (error) => {
        reject(new Error(`${method}请求失败: ${error.message}`));
      });

      // 8. 写入请求体并结束请求（仅当有请求体时）
      if (requestData) {
        req.write(requestData);
      }
      req.end();
    });
  }

  /**
   * GET请求
   * @param {Object} options - 请求配置
   * @returns {Promise<Object>} 响应结果
   */
  async get(options) {
    return this._sendRequest({ ...options, method: 'GET' });
  }

  /**
   * POST请求
   * @param {Object} options - 请求配置
   * @returns {Promise<Object>} 响应结果
   */
  async post(options) {
    return this._sendRequest({ ...options, method: 'POST' });
  }

  /**
   * PUT请求
   * @param {Object} options - 请求配置
   * @returns {Promise<Object>} 响应结果
   */
  async put(options) {
    return this._sendRequest({ ...options, method: 'PUT' });
  }

  /**
   * PATCH请求
   * @param {Object} options - 请求配置
   * @returns {Promise<Object>} 响应结果
   */
  async patch(options) {
    return this._sendRequest({ ...options, method: 'PATCH' });
  }

  /**
   * DELETE请求
   * @param {Object} options - 请求配置
   * @returns {Promise<Object>} 响应结果
   */
  async delete(options) {
    return this._sendRequest({ ...options, method: 'DELETE', data: null });
  }
}

// 导出请求客户端实例
export const httpsClient = new HttpsRequestClient();