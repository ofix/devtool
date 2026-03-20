// src/main/ipc/configHandlers.js
import path from 'path';
import { app } from 'electron';

/**
 * 设置配置相关的 IPC 处理器
 * @param {Electron.IpcMain} ipcMain - Electron IPC 主进程对象
 * @param {CrawlerManager} crawlerManager - 爬虫管理器实例
 */
export function setupConfigHandlers(ipcMain, crawlerManager) {
  // 获取所有配置
  ipcMain.handle('config:getAll', async () => {
    return crawlerManager.getAllConfigs();
  });

  // 获取单个配置
  ipcMain.handle('config:get', async (event, name) => {
    return crawlerManager.getConfig(name);
  });

  // 保存配置
  ipcMain.handle('config:save', async (event, config) => {
    try {
      const configPath = path.join(
        app.getPath('userData'), 
        'configs', 
        'websites',
        `${config.site.id}.yaml`
      );
      await crawlerManager.saveConfig(config, configPath);
      return { success: true, message: 'Config saved successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 删除配置
  ipcMain.handle('config:delete', async (event, name) => {
    try {
      await crawlerManager.deleteConfig(name);
      return { success: true, message: 'Config deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 验证配置
  ipcMain.handle('config:validate', async (event, config) => {
    return crawlerManager.validateConfig(config);
  });

  // 重新加载配置
  ipcMain.handle('config:reload', async (event, name) => {
    try {
      await crawlerManager.reloadCrawler(name);
      return { success: true, message: 'Config reloaded successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 导入配置
  ipcMain.handle('config:import', async (event, filePath) => {
    try {
      const config = await crawlerManager.configLoader.loadFile(filePath);
      await crawlerManager.saveConfig(config, filePath);
      return { success: true, config };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 导出配置
  ipcMain.handle('config:export', async (event, name, format = 'yaml') => {
    try {
      const content = crawlerManager.configLoader.exportConfig(name, format);
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 生成配置模板
  ipcMain.handle('config:generateTemplate', async (event, id) => {
    return crawlerManager.configLoader.generateTemplate(id);
  });
}