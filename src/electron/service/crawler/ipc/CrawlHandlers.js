// src/main/ipc/crawlerHandlers.js
import { ipcMain } from 'electron';

/**
 * 设置爬虫相关的 IPC 处理器
 * @param {Electron.IpcMain} ipcMain - Electron IPC 主进程对象
 * @param {CrawlerManager} crawlerManager - 爬虫管理器实例
 */
export function setupCrawlerHandlers(ipcMain, crawlerManager) {
  // 启动爬虫
  ipcMain.handle('crawler:start', async (event, name, options = {}) => {
    try {
      await crawlerManager.startCrawler(name, options);
      return { success: true, message: `Crawler ${name} started` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 停止爬虫
  ipcMain.handle('crawler:stop', async (event, name) => {
    try {
      await crawlerManager.stopCrawler(name);
      return { success: true, message: `Crawler ${name} stopped` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 暂停爬虫
  ipcMain.handle('crawler:pause', async (event, name) => {
    try {
      await crawlerManager.pauseCrawler(name);
      return { success: true, message: `Crawler ${name} paused` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 恢复爬虫
  ipcMain.handle('crawler:resume', async (event, name) => {
    try {
      await crawlerManager.resumeCrawler(name);
      return { success: true, message: `Crawler ${name} resumed` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 重启爬虫
  ipcMain.handle('crawler:restart', async (event, name) => {
    try {
      await crawlerManager.restartCrawler(name);
      return { success: true, message: `Crawler ${name} restarted` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取所有爬虫状态
  ipcMain.handle('crawler:getAllStatus', async () => {
    return crawlerManager.getAllStatus();
  });

  // 获取单个爬虫状态
  ipcMain.handle('crawler:getStatus', async (event, name) => {
    return crawlerManager.getStatus(name);
  });

  // 获取统计信息
  ipcMain.handle('crawler:getStatistics', async (event, filters = {}) => {
    return await crawlerManager.getStatistics(filters);
  });

  // 获取爬取历史
  ipcMain.handle('crawler:getHistory', async (event, filters = {}) => {
    return await crawlerManager.getHistory(filters);
  });

  // 重置熔断器
  ipcMain.handle('crawler:resetCircuitBreaker', async (event, name) => {
    crawlerManager.resetCircuitBreaker(name);
    return { success: true };
  });

  // 更新熔断器配置
  ipcMain.handle('crawler:updateCircuitBreaker', async (event, name, config) => {
    crawlerManager.updateCircuitBreakerConfig(name, config);
    return { success: true };
  });

  // 获取熔断器配置
  ipcMain.handle('crawler:getCircuitBreakerConfig', async (event, name) => {
    return crawlerManager.getCircuitBreakerConfig(name);
  });

  // 暂停站点
  ipcMain.handle('crawler:pauseSite', async (event, name) => {
    crawlerManager.pauseSite(name);
    return { success: true };
  });

  // 恢复站点
  ipcMain.handle('crawler:resumeSite', async (event, name) => {
    crawlerManager.resumeSite(name);
    return { success: true };
  });

  // 清空队列
  ipcMain.handle('crawler:clearQueue', async (event, name = null) => {
    crawlerManager.clearQueue(name);
    return { success: true };
  });

  // 获取健康状态
  ipcMain.handle('crawler:getHealth', async () => {
    return crawlerManager.getHealth();
  });

  // 关闭所有爬虫
  ipcMain.handle('crawler:shutdown', async () => {
    await crawlerManager.shutdown();
    return { success: true };
  });
}