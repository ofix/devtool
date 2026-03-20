// src/main/ipc/authHandlers.js

/**
 * 设置认证相关的 IPC 处理器
 * @param {Electron.IpcMain} ipcMain - Electron IPC 主进程对象
 * @param {CrawlerManager} crawlerManager - 爬虫管理器实例
 */
export function setupAuthHandlers(ipcMain, crawlerManager) {
    // 提交验证码
    ipcMain.handle('auth:submitCaptcha', async (event, name, code) => {
      try {
        await crawlerManager.submitCaptcha(name, code);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 完成手动登录
    ipcMain.handle('auth:completeManualLogin', async (event, name) => {
      try {
        await crawlerManager.completeManualLogin(name);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 获取保存的凭证
    ipcMain.handle('auth:getCredentials', async (event, name) => {
      try {
        const credentials = await crawlerManager.authManager.getCredentials(name);
        return { success: true, credentials };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 保存凭证
    ipcMain.handle('auth:saveCredentials', async (event, name, credentials) => {
      try {
        await crawlerManager.authManager.saveCredentials(name, credentials);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  
    // 清除凭证
    ipcMain.handle('auth:clearCredentials', async (event, name) => {
      try {
        await crawlerManager.authManager.clearCredentials(name);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }