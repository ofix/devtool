/**
 * 获取当前操作系统
 * @returns {string} 'macos' | 'windows' | 'linux' | 'unknown'
 */
export function getPlatform () {
  const platform = process.platform;
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

/**
 * 检查是否为麒麟操作系统
 * @returns {boolean}
 */
export function isKylinOS () {
  if (process.platform !== 'linux') return false;

  // 检查 /etc/os-release 或 /etc/kylin-release
  const fs = require('fs');
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    return osRelease.toLowerCase().includes('kylin');
  } catch {
    return false;
  }
}

/**
 * 获取任务栏高度（跨平台）
 * @returns {number}
 */
export function getTaskbarHeight () {
  const platform = getPlatform();

  switch (platform) {
    case 'windows':
      return 40; // Windows 默认任务栏高度
    case 'macos':
      return 0; // macOS 没有传统任务栏
    case 'linux':
      return isKylinOS() ? 48 : 30;
    default:
      return 40;
  }
}

/**
 * 获取窗口安全区域（避开任务栏）
 * @param {Object} screenSize - 屏幕尺寸 {width, height}
 * @returns {Object} 安全区域 {x, y, width, height}
 */
export function getSafeArea (screenSize) {
  const platform = getPlatform();
  const taskbarHeight = getTaskbarHeight();

  switch (platform) {
    case 'windows':
      // Windows: 任务栏通常在底部
      return {
        x: 0,
        y: 0,
        width: screenSize.width,
        height: screenSize.height - taskbarHeight
      };
    case 'macos':
      // macOS: 菜单栏在顶部，Dock在底部或侧边
      return {
        x: 0,
        y: 0,
        width: screenSize.width,
        height: screenSize.height
      };
    case 'linux':
      return {
        x: 0,
        y: 0,
        width: screenSize.width,
        height: screenSize.height - taskbarHeight
      };
    default:
      return {
        x: 0,
        y: 0,
        width: screenSize.width,
        height: screenSize.height
      };
  }
}

/**
 * 判断是否在交易时间内
 * @param {string} market - 市场类型 'a' | 'hk' | 'us'
 * @returns {boolean}
 */
export function isTradingTime (market = 'a') {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 100 + now.getMinutes();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

  // 周末不交易
  if (day === 0 || day === 6) return false;

  switch (market) {
    case 'a': // A股 9:30-11:30, 13:00-15:00
      return (time >= 930 && time < 1130) || (time >= 1300 && time < 1500);

    case 'hk': // 港股 9:30-12:00, 13:00-16:00
      return (time >= 930 && time < 1200) || (time >= 1300 && time < 1600);

    case 'us': // 美股 9:30-16:00 (美东时间，需要转换)
      // 简化处理，实际需要转换时区
      return (time >= 930 && time < 1600);

    default:
      return false;
  }
}

/**
 * 格式化股票代码（根据市场）
 * @param {string} code - 原始代码
 * @param {string} market - 市场
 * @returns {string}
 */
export function formatStockCode (code, market) {
  switch (market) {
    case 'a':
      return code.padStart(6, '0');
    case 'hk':
      return code.padStart(5, '0');
    case 'us':
      return code.toUpperCase();
    default:
      return code;
  }
}

/**
 * 获取股票市场标签
 * @param {string} market - 市场代码
 * @returns {string}
 */
export function getMarketLabel (market) {
  const labels = {
    'a': 'A股',
    'hk': '港股',
    'us': '美股'
  };
  return labels[market] || market;
}