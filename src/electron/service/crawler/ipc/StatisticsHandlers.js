// src/main/ipc/statisticsHandlers.js

/**
 * 设置统计相关的 IPC 处理器
 * @param {Electron.IpcMain} ipcMain - Electron IPC 主进程对象
 * @param {CrawlerManager} crawlerManager - 爬虫管理器实例
 */
export function setupStatisticsHandlers(ipcMain, crawlerManager) {
    // 获取整体统计
    ipcMain.handle('statistics:getOverview', async (event, timeRange = 'all') => {
      try {
        const stats = await crawlerManager.getStatistics();
        return { success: true, stats };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 获取按时间统计
    ipcMain.handle('statistics:getByTime', async (event, interval = 'day', days = 30) => {
      try {
        const stats = await crawlerManager.incrementalManager.getStatisticsByTime(interval, days);
        return { success: true, stats };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 获取按网站统计
    ipcMain.handle('statistics:getByWebsite', async (event) => {
      try {
        const stats = await crawlerManager.incrementalManager.getStatisticsByWebsite();
        return { success: true, stats };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 获取按类型统计
    ipcMain.handle('statistics:getByType', async (event) => {
      try {
        const stats = await crawlerManager.downloadManager.getStatisticsByType();
        return { success: true, stats };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 导出统计报告
    ipcMain.handle('statistics:export', async (event, format = 'csv', filters = {}) => {
      try {
        const data = await crawlerManager.getStatistics(filters);
        const exported = await crawlerManager.incrementalManager.exportStatistics(data, format);
        return { success: true, data: exported };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }