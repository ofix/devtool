import { ipcMain } from 'electron';
import SFTPService from '../service/SFTPService.js';

class SFTPHandler {
    constructor() {
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle("ssh:connect", async (event, config) => {
            try {
                const sftp = await SFTPService.create(config);
                await sftp.getSSHClient(config.host);
                return {
                    success: true,
                    host: config.host,
                    connected: true
                };
            } catch (e) {
                console.error('SSH连接失败:', e);
                return {
                    success: false,
                    host: config.host,
                    connected: false,
                    error: e.message
                };
            }
        });

        ipcMain.handle("ssh:disconnect", async (event, host) => {
            try {
                const sftp = await SFTPService.create({ host });
                await sftp.disconnectServer(host);
                return { success: true };
            } catch (error) {
                console.error('SSH断开失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle("ssh:listDir", async (event, config) => {
            try {
                const sftp = await SFTPService.create(config);
                await sftp.listDir(config.host, config.remotePath);
                return sftp.fileTree.toJson();
            } catch (error) {
                console.error('列出目录失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.on('sftp-download-dir', async (event, config) => {
            try {
                const sftp = await SFTPService.create(config);
                const _config = sftp.getConfig(config.host);
                await sftp.downloadDir(_config.host, _config.remotePath, _config.localPath, (dirProgress) => {
                    event.reply('download-dir-progress', dirProgress);
                });
            } catch (error) {
                console.error('下载目录失败:', error);
                event.reply('download-dir-progress', { error: error.message });
            }
        });

        ipcMain.on('sftp-upload-dir', async (event, config) => {
            try {
                const sftp = await SFTPService.create(config);
                const _config = sftp.getConfig(config.host);
                await sftp.uploadDir(_config.host, _config.localPath, _config.remotePath, (dirProgress) => {
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