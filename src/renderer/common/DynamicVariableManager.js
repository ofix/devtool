import Trie from './Trie.js';
/**
 * 动态变量管理器 - 封装Trie树和所有内置变量
 */
class DynamicVariableManager {
  constructor() {
    this.trie = new Trie();
    this.initBuiltInVariables();
  }

  /**
   * 初始化所有内置动态变量（覆盖Postman全部功能）
   */
  initBuiltInVariables() {
    // 1. 随机ID/标识类
    this.trie.insert('guid', () => this.generateGUID(), '生成随机GUID/UUID');
    this.trie.insert('random.uuid', () => this.generateGUID(), '生成随机UUID（同@guid）');
    this.trie.insert('random.id', () => Math.random().toString(36).substring(2, 10), '生成8位随机字符串ID');

    // 2. 网络相关
    this.trie.insert('random.ipv4', () => this.generateIPv4(), '生成随机IPv4地址');
    this.trie.insert('random.ipv6', () => this.generateIPv6(), '生成随机IPv6地址');
    this.trie.insert('random.port', () => Math.floor(Math.random() * 65535) + 1, '生成1-65535之间的随机端口');

    // 3. 数字相关
    this.trie.insert('random.int', () => Math.floor(Math.random() * 10000), '生成0-9999随机整数');
    this.trie.insert('random.int.minmax', (min = 0, max = 1000) => Math.floor(Math.random() * (max - min + 1)) + min, '生成指定范围随机整数（默认0-1000）');
    this.trie.insert('random.float', () => Math.random() * 10000, '生成0-9999随机浮点数');
    this.trie.insert('random.float.minmax', (min = 0, max = 1000) => Math.random() * (max - min) + min, '生成指定范围随机浮点数（默认0-1000）');

    // 4. 字符串相关
    this.trie.insert('random.string', () => this.generateRandomString(10), '生成10位随机字符串（字母+数字）');
    this.trie.insert('random.string.length', (length = 10) => this.generateRandomString(length), '生成指定长度随机字符串（默认10位）');
    this.trie.insert('random.alpha', () => this.generateRandomAlpha(10), '生成10位随机字母字符串（大小写）');
    this.trie.insert('random.alpha.lower', () => this.generateRandomAlpha(10, 'lower'), '生成10位随机小写字母');
    this.trie.insert('random.alpha.upper', () => this.generateRandomAlpha(10, 'upper'), '生成10位随机大写字母');
    this.trie.insert('random.numeric', () => this.generateRandomNumeric(10), '生成10位随机数字字符串');

    // 5. 日期时间相关
    this.trie.insert('timestamp', () => Date.now(), '生成当前时间戳（毫秒）');
    this.trie.insert('timestamp.seconds', () => Math.floor(Date.now() / 1000), '生成当前时间戳（秒）');
    this.trie.insert('datetime', () => new Date().toISOString(), '生成当前ISO格式时间（如2025-12-26T10:00:00.000Z）');
    this.trie.insert('datetime.format', (format = 'YYYY-MM-DD HH:mm:ss') => this.formatDate(new Date(), format), '按指定格式生成当前时间（默认YYYY-MM-DD HH:mm:ss）');
    this.trie.insert('past.datetime', () => this.generatePastDate(), '生成过去随机时间（1年内）');
    this.trie.insert('future.datetime', () => this.generateFutureDate(), '生成未来随机时间（1年内）');

    // 6. 颜色相关
    this.trie.insert('random.color', () => this.generateRandomColor(), '生成随机十六进制颜色（如#FF5733）');
    this.trie.insert('random.color.rgb', () => this.generateRandomRGB(), '生成随机RGB颜色（如rgb(255,87,51)）');

    // 7. 浏览器/设备相关
    this.trie.insert('random.userAgent', () => this.generateRandomUserAgent(), '生成随机User-Agent字符串');
    this.trie.insert('random.device', () => this.generateRandomDevice(), '生成随机设备类型（手机/平板/PC）');

    // 8. 地理信息相关
    this.trie.insert('random.latitude', () => (Math.random() * 180 - 90).toFixed(6), '生成随机纬度（-90~90）');
    this.trie.insert('random.longitude', () => (Math.random() * 360 - 180).toFixed(6), '生成随机经度（-180~180）');

    // 9. 文本相关
    this.trie.insert('random.word', () => this.generateRandomWord(), '生成随机英文单词');
    this.trie.insert('random.sentence', () => this.generateRandomSentence(), '生成随机英文句子');
    this.trie.insert('random.paragraph', () => this.generateRandomParagraph(), '生成随机英文段落');

    // 10. 布尔值
    this.trie.insert('random.boolean', () => Math.random() > 0.5, '生成随机布尔值（true/false）');
  }

  // -------------------------- 变量生成核心方法 --------------------------
  /**
   * 生成GUID/UUID
   */
  generateGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 生成随机IPv4地址
   */
  generateIPv4() {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
  }

  /**
   * 生成随机IPv6地址
   */
  generateIPv6() {
    return Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0')
    ).join(':');
  }

  /**
   * 生成随机字符串
   * @param {number} length 长度
   */
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /**
   * 生成随机字母字符串
   * @param {number} length 长度
   * @param {string} caseType 大小写：lower/upper
   */
  generateRandomAlpha(length, caseType = 'mixed') {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    if (caseType === 'lower') chars = chars.toLowerCase();
    if (caseType === 'upper') chars = chars.toUpperCase();
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /**
   * 生成随机数字字符串
   * @param {number} length 长度
   */
  generateRandomNumeric(length) {
    const chars = '0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /**
   * 格式化日期
   * @param {Date} date 日期对象
   * @param {string} format 格式字符串
   */
  formatDate(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * 生成过去随机时间
   */
  generatePastDate() {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const pastTime = Date.now() - Math.random() * oneYear;
    return new Date(pastTime).toISOString();
  }

  /**
   * 生成未来随机时间
   */
  generateFutureDate() {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const futureTime = Date.now() + Math.random() * oneYear;
    return new Date(futureTime).toISOString();
  }

  /**
   * 生成随机十六进制颜色
   */
  generateRandomColor() {
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
  }

  /**
   * 生成随机RGB颜色
   */
  generateRandomRGB() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * 生成随机User-Agent
   */
  generateRandomUserAgent() {
    const browsers = [
      'Chrome/120.0.0.0 Safari/537.36',
      'Firefox/119.0 Gecko/20100101',
      'Safari/605.1.15 Version/17.0',
      'Edge/120.0.0.0 Safari/537.36'
    ];
    const os = [
      'Windows NT 10.0; Win64; x64',
      'Macintosh; Intel Mac OS X 14_0',
      'Linux x86_64',
      'iPhone; CPU iPhone OS 17_0 like Mac OS X'
    ];
    return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) AppleWebKit/537.36 (KHTML, like Gecko) ${browsers[Math.floor(Math.random() * browsers.length)]}`;
  }

  /**
   * 生成随机设备类型
   */
  generateRandomDevice() {
    const devices = ['mobile', 'tablet', 'desktop', 'smarttv'];
    return devices[Math.floor(Math.random() * devices.length)];
  }

  /**
   * 生成随机英文单词
   */
  generateRandomWord() {
    const words = ['apple', 'banana', 'cat', 'dog', 'elephant', 'fish', 'grape', 'house', 'ice', 'juice'];
    return words[Math.floor(Math.random() * words.length)];
  }

  /**
   * 生成随机英文句子
   */
  generateRandomSentence() {
    const sentences = [
      'The quick brown fox jumps over the lazy dog.',
      'A journey of a thousand miles begins with a single step.',
      'All that glitters is not gold.',
      'Better late than never.',
      'Every cloud has a silver lining.'
    ];
    return sentences[Math.floor(Math.random() * sentences.length)];
  }

  /**
   * 生成随机英文段落
   */
  generateRandomParagraph() {
    const paragraphs = [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
    ];
    return paragraphs[Math.floor(Math.random() * paragraphs.length)];
  }

  // -------------------------- 对外暴露的方法 --------------------------
  /**
   * 搜索匹配的变量
   * @param {string} input 输入内容（去掉@后的部分）
   */
  searchVariables(input) {
    return this.trie.search(input);
  }

  /**
   * 执行变量获取值
   * @param {string} variable 变量名（如 random.ipv4）
   */
  getVariableValue(variable) {
    return this.trie.executeVariable(variable);
  }
}

export default DynamicVariableManager;