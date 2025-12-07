import { ipcMain } from 'electron';
import SFTPService from './SFTPService.js';
import Utils from "../core/Utils.js";

class IPCManager {
    constructor(window) {
        this.window = window;
    }
    startListen() {
        // SCP下载文件夹到本地
        ipcMain.on('sftp-download-dir', async (event, config) => {
            const sftp = await SFTPService.create();
            config.localPath = await Utils.sftpLocalDir(config.host);
            sftp.setConfig(config);
            await sftp.downloadDir(config.host, config.remotePath, config.localPath, (dirProgress) => {
                event.reply('download-dir-progress', dirProgress);
            });
        })
        ipcMain.on('sftp-list-dir', async (event, config) => {
            const sftp = await SFTPService.create();
            config.localPath = await Utils.sftpLocalDir(config.host);
            sftp.setConfig(config);
            await sftp.listDir(config.host, config.remotePath);
            sftp.fileTree.print();
        })
        ipcMain.on('sftp-upload-dir', async (event, config) => {
            const sftp = await SFTPService.create();
            config.localPath = await Utils.sftpLocalDir(config.host);
            sftp.setConfig(config);
            await sftp.uploadDir(config.host, config.localPath, config.remotePath, (dirProgress) => {
                event.reply('upload-dir-progress', dirProgress);
            });
        })
        ipcMain.on("full-screen", (enent, flag) => {
            if (flag == 0) {
                if (this.window.isMinimized()) {
                    this.window.restore(); // 先恢复窗口
                    this.window.setFullScreen(true); // 再全屏显示
                } else if (!this.window.isVisible()) {
                    this.window.show(); // 如果窗口不可见，则显示窗口
                    this.window.setFullScreen(true); // 再全屏显示
                } else {
                    this.window.setFullScreen(true); // 直接全屏显示
                }
            } else if (flag == 1) {
                this.window.fullScreen = false;  // 还原
            }
        })

        ipcMain.on('window-minimize', () => this.window.minimize())
        ipcMain.on('window-close', () => this.window.close())

        ipcMain.on('window-maximize-toggle', () => {
            if (this.window.isMaximized()) this.window.unmaximize()
            else this.window.maximize()
        })
        // 可选：同步状态
        this.window.on('maximize', () => this.window.webContents.send('maximized'))
        this.window.on('unmaximize', () => this.window.webContents.send('unmaximized'))


        // SSH连接管理
        ipcMain.on('ssh-connect', async (event, host, port, username, password) => {
            return await this.sshManager.connectToServer(host, port, username, password);
        });

        ipcMain.on('ssh-disconnect', async (event, host) => {
            return await this.sshManager.disconnectFromServer(host);
        });

        ipcMain.on('ssh-execute', async (event, host, command) => {
            return await this.sshManager.executeCommand(host, command);
        });

        // 凭据管理
        ipcMain.on('ssh-save-credentials', (event, host, username, password) => {
            this.sshManager.saveServerCredentials(host, username, password);
            return { success: true };
        });

        ipcMain.on('ssh-remove-credentials', (event, host) => {
            return this.sshManager.removeServerCredentials(host);
        });

        // 状态查询
        ipcMain.on('ssh-get-servers', (event) => {
            return this.sshManager.getServerStatusList();
        });

        ipcMain.on('ssh-get-stats', (event) => {
            return this.sshManager.getConnectionStats();
        });

        ipcMain.on('ssh-get-credentials', (event, host) => {
            return this.sshManager.getCredentials(host);
        });
    }
}

export default IPCManager;