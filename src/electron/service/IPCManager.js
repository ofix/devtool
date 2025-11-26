class IPCManager{
    construct(ipcMain){
        this.ipcMain = ipcMain;
    }
    setup(){
         this.ipcMain.handle('sftp-download-dir',async(event,host,remotePath,localPath) =>{ 
            let sftp = new SFTPService();
            sftp.downloadDir('172.26.3.11','/usr/share/www/','/home/greatwall/sftp.172.26.3.11/',(dirProgress)=>{
              console.log(dirProgress);
              console.log(dirProgress.progress);
            },(fileProgress)=>{
              console.log(fileProgress.filename);
            });
         })
         // SSH连接管理
         this.ipcMain.handle('ssh-connect', async (event, host, port, username, password) => {
            return await this.sshManager.connectToServer(host, port, username, password);
        });

        this.ipcMain.handle('ssh-disconnect', async (event, host) => {
            return await this.sshManager.disconnectFromServer(host);
        });

        this.ipcMain.handle('ssh-execute', async (event, host, command) => {
            return await this.sshManager.executeCommand(host, command);
        });

        // 凭据管理
        this.ipcMain.handle('ssh-save-credentials', (event, host, username, password) => {
            this.sshManager.saveServerCredentials(host, username, password);
            return { success: true };
        });

        this.ipcMain.handle('ssh-remove-credentials', (event, host) => {
            return this.sshManager.removeServerCredentials(host);
        });

        // 状态查询
        this.ipcMain.handle('ssh-get-servers', (event) => {
            return this.sshManager.getServerStatusList();
        });

        this.ipcMain.handle('ssh-get-stats', (event) => {
            return this.sshManager.getConnectionStats();
        });

        this.ipcMain.handle('ssh-get-credentials', (event, host) => {
            return this.sshManager.getCredentials(host);
        });
    }
}

export default IPCManager;