import { app } from 'electron';
import { join } from 'node:path';
import fs from 'fs-extra'; // 需安装：npm install fs-extra

class Utils {
    // 改为静态 getter，延迟执行 app.getPath()
    static get sysDownloadDir() {
        return app.getPath('downloads');
    }

    static get sysDocumentDir() {
        return app.getPath('documents');
    }

    static get sysAppData() {
        return app.getPath('appData');
    }

    static get temp() {
        return app.getPath('temp');
    }

    static get desktop() {
        return app.getPath('desktop');
    }

    constructor() {
        throw new Error('Utils 不能被实例化');
    }

    static sftpDownloadDir(host) {
        const dir = join(Utils.sysDocumentDir, 'devtool',`sftp.${host}`);
        fs.ensureDirSync(dir);
        return dir;
    }

    static sftpDownloadMetaDir() {
        const dir = join(Utils.sysDocumentDir, 'devtool','.sftp.state');
        fs.ensureDirSync(dir);
        return dir;
    }
}

export default Utils;