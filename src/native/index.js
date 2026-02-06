const native = require('bindings')('devtool_native');

class DevtoolNative {
  /**
   * 获取系统所有窗口信息
   * @returns {Promise<Array>} 窗口信息数组
   */
  static async getAllWindows() {
    try {
      return native.getAllWindows();
    } catch (error) {
      console.error('Failed to get window info:', error);
      return [];
    }
  }

  /**
   * 获取可见窗口信息
   * @returns {Promise<Array>} 可见窗口信息数组
   */
  static async getVisibleWindows() {
    const allWindows = await this.getAllWindows();
    return allWindows.filter(win => win.isVisible);
  }

  /**
   * 按标题过滤窗口
   * @param {string|RegExp} pattern 标题模式
   * @returns {Promise<Array>} 匹配的窗口信息
   */
  static async getWindowsByTitle(pattern) {
    const allWindows = await this.getAllWindows();
    const regex = typeof pattern === 'string' ? 
      new RegExp(pattern, 'i') : pattern;
    
    return allWindows.filter(win => regex.test(win.title));
  }
}

module.exports = DevtoolNative;