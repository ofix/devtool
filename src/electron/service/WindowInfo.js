import path from 'path';
import fs from 'fs';
import { app, dialog, BrowserWindow } from 'electron';
import { createRequire } from 'module';  // 引入 createRequire

// 创建 require 函数用于加载原生模块
const require = createRequire(import.meta.url);

class WindowInfo {
  constructor() {
    this.nativeModule = null;
    this.isLoaded = false;
    this.platform = process.platform;
    this.arch = process.arch;
  }

  /**
   * 获取当前平台的模块文件名
   */
  getModuleFilename() {
    const platformMap = {
      'win32': 'window_info_win32.node',
      'darwin': 'window_info_darwin.node', 
      'linux': 'window_info_linux.node'
    };
    
    return platformMap[this.platform] || 'window_info_win32.node';
  }

  /**
   * 获取模块完整路径
   */
  getModulePath() {
    const filename = this.getModuleFilename();
    
    // 获取当前文件所在目录
    const currentDir = path.dirname(import.meta.url.replace('file://', ''));
    
    // 尝试多个可能的路径
    const possiblePaths = [
      // 开发环境路径（相对于当前文件位置）
      path.join(currentDir, `../../../build/window-info/`, filename),
      // 生产环境路径（打包后）
      path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'Release', filename),
      path.join(process.resourcesPath, 'native_modules', filename)
    ];
    
    console.log('🔍 Searching for native module in paths:');
    possiblePaths.forEach(p => console.log('  -', p));
    
    for (const modulePath of possiblePaths) {
      try {
        if (fs.existsSync(modulePath)) {
          console.log(`✅ Found native module at: ${modulePath}`);
          return modulePath;
        }
      } catch (error) {
        // 忽略路径检查错误
        console.log(`❌ Path check failed: ${modulePath}`, error.message);
      }
    }
    
    console.log(`❌ Native module not found in any of the searched paths`);
    return null;
  }

  /**
   * 检查当前平台是否支持
   */
  isPlatformSupported() {
    const supportedPlatforms = ['win32', 'darwin', 'linux'];
    return supportedPlatforms.includes(this.platform);
  }

  /**
   * 加载原生模块
   */
  async load() {
    if (this.isLoaded) return true;
    
    // 检查平台支持
    if (!this.isPlatformSupported()) {
      console.error(`❌ Platform ${this.platform} is not supported`);
      return false;
    }
    
    // 查找模块文件
    const modulePath = this.getModulePath();
    if (!modulePath) {
      console.error(`❌ Native module file not found for platform ${this.platform}`);
      return false;
    }
    
    try {
      // 使用 createRequire 创建的 require 函数加载原生模块
      this.nativeModule = require(modulePath);
      this.isLoaded = true;
      
      console.log(`✅ Native window info module loaded successfully for ${this.platform}`);
      console.log(`📊 Architecture: ${this.arch}, Module: ${path.basename(modulePath)}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to load native module:', error);
      
      // 显示用户友好的错误信息
      this.showLoadError(error);
      return false;
    }
  }

  /**
   * 显示加载错误对话框
   */
  showLoadError(error) {
    const errorMessages = {
      'win32': 'Windows 平台原生模块加载失败',
      'darwin': 'macOS 平台原生模块加载失败', 
      'linux': 'Linux 平台原生模块加载失败'
    };
    
    const message = errorMessages[this.platform] || '原生模块加载失败';
    
    // 只在有窗口时才显示对话框
    if (BrowserWindow && BrowserWindow.getAllWindows().length > 0) {
      dialog.showErrorBox('模块加载错误', `${message}\n\n错误详情: ${error.message}`);
    }
  }

  /**
   * 获取所有窗口信息
   */
  getAllWindows() {
    if (!this.isLoaded) {
      throw new Error(`Native module not loaded for platform ${this.platform}`);
    }
    
    try {
      const startTime = Date.now();
      const windows = this.nativeModule.getAllWindows();
      const endTime = Date.now();
      
      console.log(`📊 Retrieved ${windows.length} windows in ${endTime - startTime}ms`);
      
      return windows;
    } catch (error) {
      console.error(`Failed to get window info on ${this.platform}:`, error);
      
      // 平台特定的错误处理
      if (this.platform === 'darwin') {
        console.warn('💡 macOS提示: 请确保已授予"屏幕录制"权限');
      } else if (this.platform === 'linux') {
        console.warn('💡 Linux提示: 请确保X11服务正常运行');
      }
      
      return [];
    }
  }

  /**
   * 获取可见窗口信息
   */
  getVisibleWindows() {
    const allWindows = this.getAllWindows();
    
    // 平台特定的可见性过滤
    if (this.platform === 'win32') {
      return allWindows.filter(win => win.isVisible);
    } else if (this.platform === 'darwin') {
      // macOS API 默认返回可见窗口
      return allWindows;
    } else if (this.platform === 'linux') {
      // Linux 实现中已经过滤了不可见窗口
      return allWindows;
    }
    
    return allWindows;
  }

  /**
   * 按标题过滤窗口
   */
  getWindowsByTitle(pattern) {
    const allWindows = this.getAllWindows();
    const regex = typeof pattern === 'string' ? 
      new RegExp(pattern, 'i') : pattern;
    
    return allWindows.filter(win => regex.test(win.title));
  }

  /**
   * 按进程名过滤窗口
   */
  getWindowsByProcessName(processName) {
    const allWindows = this.getAllWindows();
    const regex = new RegExp(processName, 'i');
    
    return allWindows.filter(win => regex.test(win.processName));
  }

  /**
   * 获取当前平台信息
   */
  getPlatformInfo() {
    return {
      platform: this.platform,
      arch: this.arch,
      moduleLoaded: this.isLoaded,
      supported: this.isPlatformSupported()
    };
  }

  /**
   * 平台特定的窗口操作
   */
  focusWindow(handle) {
    if (!this.isLoaded) return false;
    
    try {
      // 注意：这个功能需要在原生模块中实现
      if (this.nativeModule.focusWindow) {
        return this.nativeModule.focusWindow(handle);
      } else {
        console.warn(`⚠️ focusWindow not implemented for ${this.platform}`);
        return false;
      }
    } catch (error) {
      console.error(`Failed to focus window on ${this.platform}:`, error);
      return false;
    }
  }
}

// 创建单例实例
const windowInfo = new WindowInfo();

// 导出平台信息
console.log('🌐 Native Window Info Module - Platform:', process.platform, 'Arch:', process.arch);

// 导出单例实例
export default windowInfo;