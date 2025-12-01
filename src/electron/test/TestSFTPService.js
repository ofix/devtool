import SFTPService from "../service/SFTPService.js";

class TestSFTPService {
    constructor() {
        throw new Exception("TestSFTPService doesn't support initialized");
    }
    static async downloadDir() {
        let config = {
            host: "172.26.7.6",
            port: 22,
            username: "root",
            password: "0penBmc",
            remotePath: "/usr/share/www",
        };
        let sftp = await SFTPService.create();
        config.localPath = await Utils.sftpLocalDir(config.host);
        sftp.setConfig(config);
        await sftp.downloadDir(config.host, config.remotePath, config.localPath, (dirProgress) => {
            event.reply('download-dir-progress', dirProgress);
        });
    }
}

TestSFTPService.downloadDir();
