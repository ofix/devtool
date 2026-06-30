import { ipcMain } from 'electron';
import mmFileManager from '../core/MMFileManager.js';
import ClientManager from './service/ClientManager.js';

class SFTPHandler {
    constructor() {
        this.manager = ClientManager.getInstance();
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle("ssh:connect", async (event, options) => {
            try {
                let client = await this.manager.getClient('sftp', options);
                await client.connect();
                return {
                    success: true,
                    host: options.host,
                    connected: true
                };
            } catch (e) {
                console.error('SSH连接失败:', e);
                return {
                    success: false,
                    host: options.host,
                    connected: false,
                    error: e.message
                };
            }
        });

        ipcMain.handle("ssh:disconnect", async (event, host) => {
            try {
                let client = await this.manager.getClient('sftp', options);
                await client.disconnect();
                return { success: true };
            } catch (error) {
                console.error('SSH断开失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle("ssh:listDir", async (event, options) => {
            try {
                const sftp = await this.manager.getClient('sftp', options);
                return await sftp.readDir(options.host, options.remotePath);
            } catch (error) {
                console.error('列出目录失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.on('sftp:download-dir', async (event, options) => {
            try {
                const sftp = await this.manager.getClient('sftp', options);
                await sftp.downloadDir(options.host, options.remotePath, options.localPath, (dirProgress) => {
                    event.reply('download-dir-progress', dirProgress);
                });
            } catch (error) {
                console.error('下载目录失败:', error);
                event.reply('download-dir-progress', { error: error.message });
            }
        });

        ipcMain.handle('sftp:loadRemoteFile', async (event, options) => {
            return await mmFileManager.loadFileContents(options);
        });

        ipcMain.handle('sftp:saveRemoteFile', async (event, params) => {
            return await mmFileManager.saveFileContents(params);
        });

        ipcMain.on('sftp:upload-dir', async (event, options) => {
            try {
                let client = await this.manager.getClient('sftp', options);
                await client.uploadDir(options.host, options.localPath, options.remotePath, (dirProgress) => {
                    event.reply('upload-dir-progress', dirProgress);
                });
            } catch (error) {
                console.error('上传目录失败:', error);
                event.reply('upload-dir-progress', { error: error.message });
            }
        });
    }
}

export default new SFTPHandler();