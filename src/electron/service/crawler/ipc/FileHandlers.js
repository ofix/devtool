// src/main/ipc/fileHandlers.js

/**
 * 设置文件管理相关的 IPC 处理器
 * @param {Electron.IpcMain} ipcMain - Electron IPC 主进程对象
 * @param {CrawlerManager} crawlerManager - 爬虫管理器实例
 */
export function setupFileHandlers(ipcMain, crawlerManager) {
    // 获取文件列表
    ipcMain.handle('file:getList', async (event, filters = {}) => {
      try {
        const result = await crawlerManager.getFiles(filters);
        return { success: true, ...result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 获取文件信息
    ipcMain.handle('file:getInfo', async (event, fileId) => {
      try {
        const info = await crawlerManager.downloadManager.getFileInfo(fileId);
        return { success: true, info };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 删除文件
    ipcMain.handle('file:delete', async (event, fileId) => {
      try {
        await crawlerManager.deleteFile(fileId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 批量删除文件
    ipcMain.handle('file:deleteBatch', async (event, fileIds) => {
      try {
        const results = [];
        for (const id of fileIds) {
          try {
            await crawlerManager.deleteFile(id);
            results.push({ id, success: true });
          } catch (error) {
            results.push({ id, success: false, error: error.message });
          }
        }
        return { success: true, results };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 打开文件
    ipcMain.handle('file:open', async (event, filePath) => {
      try {
        const { shell } = await import('electron');
        await shell.openPath(filePath);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 打开文件所在文件夹
    ipcMain.handle('file:openLocation', async (event, filePath) => {
      try {
        const { shell } = await import('electron');
        shell.showItemInFolder(filePath);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 获取文件统计
    ipcMain.handle('file:getStatistics', async (event) => {
      try {
        const stats = await crawlerManager.downloadManager.getFileStatistics();
        return { success: true, stats };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }