import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

class SFTPService extends EventEmitter {
    constructor() {
        super();
        this.sftpClients = new Map(); // host -> SFTP client
        this.transferSessions = new Map(); // sessionId -> transfer session
        this.activeTransfers = new Map(); // host -> active transfers
        this.stateDir = '.sftp_state';
        this.ensureStateDirectory();
    }

    // 确保状态目录存在
    ensureStateDirectory() {
        if (!fs.existsSync(this.stateDir)) {
            fs.mkdirSync(this.stateDir, { recursive: true });
        }
    }

    // 连接到服务器
    async connectServer(host, username = 'root', password = '0penBmc', port = 22) {
        try {
            if (this.sftpClients.has(host) && this.sftpClients.get(host).connected) {
                return { success: true, message: 'Already connected' };
            }

            const sftp = new Client();
            await sftp.connect({
                host,
                port,
                username,
                password,
                readyTimeout: 10000,
                algorithms: {
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr']
                }
            });

            this.sftpClients.set(host, sftp);
            return { success: true, message: 'Connected successfully' };

        } catch (error) {
            return { success: false, message: `Connection failed: ${error.message}` };
        }
    }

    // 断开服务器连接
    async disconnectServer(host) {
        try {
            const sftp = this.sftpClients.get(host);
            if (sftp) {
                await sftp.end();
                this.sftpClients.delete(host);
            }
            return { success: true, message: 'Disconnected' };
        } catch (error) {
            return { success: false, message: `Disconnect failed: ${error.message}` };
        }
    }

    // 获取SFTP客户端
    async getSftpClient(host) {
        if (!this.sftpClients.has(host) || !this.sftpClients.get(host).connected) {
            const result = await this.connectServer(host);
            if (!result.success) {
                throw new Error(`Failed to connect to ${host}: ${result.message}`);
            }
        }
        return this.sftpClients.get(host);
    }

    // 生成会话ID
    generateSessionId(host, type, remotePath, localPath) {
        const data = `${host}-${type}-${remotePath}-${localPath}-${Date.now()}`;
        return Buffer.from(data).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }

    // 1. 下载单个文件，支持断点续传
    async downloadFile(host, remotePath, localPath, onProgress = null) {
        const sessionId = this.generateSessionId(host, 'download-file', remotePath, localPath);
        
        try {
            const sftp = await this.getSftpClient(host);
            
            // 获取远程文件信息
            const remoteStats = await sftp.stat(remotePath);
            if (remoteStats.isDirectory) {
                throw new Error('Remote path is a directory, use downloadDir instead');
            }

            // 检查本地文件状态，确定续传位置
            const startPosition = await this.getResumePosition(localPath, remoteStats.size);
            
            if (startPosition === -1) {
                return { 
                    success: true, 
                    message: 'File already exists and is complete', 
                    skipped: true 
                };
            }

            // 创建传输会话
            const session = {
                id: sessionId,
                host,
                type: 'download-file',
                remotePath,
                localPath,
                remoteSize: remoteStats.size,
                startPosition,
                transferred: startPosition,
                startTime: Date.now(),
                status: 'in-progress'
            };

            this.transferSessions.set(sessionId, session);
            this.addActiveTransfer(host, sessionId);

            // 执行下载
            const result = await this.downloadFileWithResume(sftp, session, onProgress);
            
            this.transferSessions.delete(sessionId);
            this.removeActiveTransfer(host, sessionId);
            
            return result;

        } catch (error) {
            this.cleanupSession(sessionId, host);
            return { success: false, message: `Download failed: ${error.message}` };
        }
    }

    // 实现文件下载（断点续传）
    async downloadFileWithResume(sftp, session, onProgress) {
        return new Promise(async (resolve, reject) => {
            try {
                // 确保本地目录存在
                const localDir = path.dirname(session.localPath);
                if (!fs.existsSync(localDir)) {
                    fs.mkdirSync(localDir, { recursive: true });
                }

                // 打开文件句柄
                const remoteHandle = await sftp.open(session.remotePath, 'r');
                const localHandle = fs.openSync(session.localPath, session.startPosition > 0 ? 'r+' : 'w');

                const chunkSize = 64 * 1024; // 64KB chunks
                let position = session.startPosition;
                const buffer = Buffer.alloc(chunkSize);
                let lastUpdate = Date.now();

                while (position < session.remoteSize) {
                    const bytesToRead = Math.min(chunkSize, session.remoteSize - position);
                    const data = await sftp.read(remoteHandle, buffer, 0, bytesToRead, position);
                    
                    if (data.length === 0) break;

                    // 写入本地文件
                    fs.writeSync(localHandle, data, 0, data.length, position);
                    position += data.length;
                    session.transferred = position;

                    // 更新进度（限制频率）
                    const currentTime = Date.now();
                    if (currentTime - lastUpdate > 100 || position === session.remoteSize) {
                        if (onProgress) {
                            const progress = Math.round((position / session.remoteSize) * 100);
                            const speed = this.calculateSpeed(session);
                            const timeRemaining = this.calculateTimeRemaining(session);
                            
                            onProgress({
                                sessionId: session.id,
                                type: 'download-file',
                                filename: path.basename(session.remotePath),
                                progress,
                                transferred: position,
                                total: session.remoteSize,
                                speed,
                                timeRemaining
                            });
                        }
                        lastUpdate = currentTime;
                    }

                    // 定期保存进度
                    if (position % (1024 * 1024) < chunkSize) {
                        this.saveProgress(session);
                    }

                    // 检查是否暂停
                    if (session.status === 'paused') {
                        break;
                    }
                }

                // 清理资源
                await sftp.close(remoteHandle);
                fs.closeSync(localHandle);

                if (position === session.remoteSize) {
                    // 传输完成
                    this.clearProgress(session.id);
                    resolve({
                        success: true,
                        message: 'Download completed',
                        fileSize: session.remoteSize,
                        transferred: position
                    });
                } else {
                    // 传输暂停
                    resolve({
                        success: true,
                        message: 'Download paused',
                        paused: true,
                        transferred: position,
                        total: session.remoteSize
                    });
                }

            } catch (error) {
                reject(error);
            }
        });
    }

    // 2. 下载文件夹，支持断点续传
    async downloadDir(host, remoteDir, localDir, onProgress = null, onFileProgress = null) {
        const sessionId = this.generateSessionId(host, 'download-dir', remoteDir, localDir);
        
        try {
            const sftp = await this.getSftpClient(host);
            
            // 扫描远程目录结构
            const fileList = await this.scanRemoteDirectory(sftp, remoteDir, localDir);
            const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);

            // 创建传输会话
            const session = {
                id: sessionId,
                host,
                type: 'download-dir',
                remotePath: remoteDir,
                localPath: localDir,
                fileList,
                totalSize,
                transferred: 0,
                completedFiles: 0,
                totalFiles: fileList.length,
                startTime: Date.now(),
                status: 'in-progress',
                currentFile: null
            };

            this.transferSessions.set(sessionId, session);
            this.addActiveTransfer(host, sessionId);

            // 执行下载
            const result = await this.downloadDirectoryWithResume(sftp, session, onProgress, onFileProgress);
            
            this.transferSessions.delete(sessionId);
            this.removeActiveTransfer(host, sessionId);
            
            return result;

        } catch (error) {
            this.cleanupSession(sessionId, host);
            return { success: false, message: `Directory download failed: ${error.message}` };
        }
    }

    // 实现文件夹下载（断点续传）
    async downloadDirectoryWithResume(sftp, session, onProgress, onFileProgress) {
        // 确保本地目录存在
        if (!fs.existsSync(session.localPath)) {
            fs.mkdirSync(session.localPath, { recursive: true });
        }

        const results = {
            success: true,
            downloadedFiles: 0,
            failedFiles: 0,
            totalFiles: session.totalFiles,
            totalSize: session.totalSize,
            transferred: 0,
            errors: []
        };

        for (let i = 0; i < session.fileList.length; i++) {
            const file = session.fileList[i];
            session.currentFile = file;

            if (onProgress) {
                onProgress({
                    sessionId: session.id,
                    type: 'download-dir',
                    currentFile: file.name,
                    currentFileIndex: i,
                    totalFiles: session.totalFiles,
                    progress: Math.round((results.downloadedFiles / session.totalFiles) * 100),
                    transferred: results.transferred,
                    total: session.totalSize
                });
            }

            if (file.isDirectory) {
                // 创建本地目录
                if (!fs.existsSync(file.localPath)) {
                    fs.mkdirSync(file.localPath, { recursive: true });
                }
                results.downloadedFiles++;
            } else {
                // 下载文件
                try {
                    const fileProgressCallback = onFileProgress ? (progress) => {
                        onFileProgress({
                            ...progress,
                            sessionId: session.id,
                            filename: file.name
                        });
                    } : null;

                    const fileResult = await this.downloadFile(
                        session.host, 
                        file.remotePath, 
                        file.localPath, 
                        fileProgressCallback
                    );

                    if (fileResult.success) {
                        results.downloadedFiles++;
                        results.transferred += file.size;
                    } else {
                        results.failedFiles++;
                        results.errors.push(`File ${file.name}: ${fileResult.message}`);
                    }
                } catch (error) {
                    results.failedFiles++;
                    results.errors.push(`File ${file.name}: ${error.message}`);
                }
            }

            // 保存进度
            session.completedFiles = results.downloadedFiles;
            session.transferred = results.transferred;
            this.saveProgress(session);

            // 检查是否暂停
            if (session.status === 'paused') {
                break;
            }
        }

        if (results.failedFiles > 0) {
            results.success = false;
            results.message = `${results.failedFiles} files failed to download`;
        } else if (session.status === 'paused') {
            results.message = 'Download paused';
            results.paused = true;
        } else {
            results.message = 'Directory download completed';
        }

        return results;
    }

    // 3. 上传单个文件，支持断点续传
    async uploadFile(host, localPath, remotePath, onProgress = null) {
        const sessionId = this.generateSessionId(host, 'upload-file', remotePath, localPath);
        
        try {
            const sftp = await this.getSftpClient(host);
            
            // 检查本地文件
            if (!fs.existsSync(localPath)) {
                throw new Error('Local file not found');
            }

            const localStats = fs.statSync(localPath);
            if (localStats.isDirectory()) {
                throw new Error('Local path is a directory, use uploadDir instead');
            }

            // 检查远程文件状态，确定续传位置
            let startPosition = 0;
            try {
                const remoteStats = await sftp.stat(remotePath);
                if (remoteStats.size < localStats.size) {
                    startPosition = remoteStats.size;
                } else if (remoteStats.size === localStats.size) {
                    return { success: true, message: 'File already exists', skipped: true };
                }
            } catch (error) {
                // 远程文件不存在，从头开始
                startPosition = 0;
            }

            // 创建传输会话
            const session = {
                id: sessionId,
                host,
                type: 'upload-file',
                localPath,
                remotePath,
                localSize: localStats.size,
                startPosition,
                transferred: startPosition,
                startTime: Date.now(),
                status: 'in-progress'
            };

            this.transferSessions.set(sessionId, session);
            this.addActiveTransfer(host, sessionId);

            // 执行上传
            const result = await this.uploadFileWithResume(sftp, session, onProgress);
            
            this.transferSessions.delete(sessionId);
            this.removeActiveTransfer(host, sessionId);
            
            return result;

        } catch (error) {
            this.cleanupSession(sessionId, host);
            return { success: false, message: `Upload failed: ${error.message}` };
        }
    }

    // 实现文件上传（断点续传）
    async uploadFileWithResume(sftp, session, onProgress) {
        return new Promise(async (resolve, reject) => {
            try {
                // 确保远程目录存在
                const remoteDir = path.posix.dirname(session.remotePath);
                await this.ensureRemoteDirectory(sftp, remoteDir);

                // 打开文件句柄
                const localHandle = fs.openSync(session.localPath, 'r');
                const remoteHandle = await sftp.open(session.remotePath, session.startPosition > 0 ? 'r+' : 'w');

                const chunkSize = 64 * 1024;
                let position = session.startPosition;
                const buffer = Buffer.alloc(chunkSize);
                let lastUpdate = Date.now();

                // 定位到续传位置
                if (session.startPosition > 0) {
                    fs.readSync(localHandle, Buffer.alloc(0), 0, 0, session.startPosition);
                }

                while (position < session.localSize) {
                    const bytesToRead = Math.min(chunkSize, session.localSize - position);
                    const bytesRead = fs.readSync(localHandle, buffer, 0, bytesToRead, position);
                    
                    if (bytesRead === 0) break;

                    await sftp.write(remoteHandle, buffer, 0, bytesRead, position);
                    position += bytesRead;
                    session.transferred = position;

                    // 更新进度
                    const currentTime = Date.now();
                    if (currentTime - lastUpdate > 100 || position === session.localSize) {
                        if (onProgress) {
                            const progress = Math.round((position / session.localSize) * 100);
                            const speed = this.calculateSpeed(session);
                            const timeRemaining = this.calculateTimeRemaining(session);
                            
                            onProgress({
                                sessionId: session.id,
                                type: 'upload-file',
                                filename: path.basename(session.localPath),
                                progress,
                                transferred: position,
                                total: session.localSize,
                                speed,
                                timeRemaining
                            });
                        }
                        lastUpdate = currentTime;
                    }

                    // 保存进度
                    if (position % (1024 * 1024) < chunkSize) {
                        this.saveProgress(session);
                    }

                    if (session.status === 'paused') {
                        break;
                    }
                }

                fs.closeSync(localHandle);
                await sftp.close(remoteHandle);

                if (position === session.localSize) {
                    this.clearProgress(session.id);
                    resolve({
                        success: true,
                        message: 'Upload completed',
                        fileSize: session.localSize,
                        transferred: position
                    });
                } else {
                    resolve({
                        success: true,
                        message: 'Upload paused',
                        paused: true,
                        transferred: position,
                        total: session.localSize
                    });
                }

            } catch (error) {
                reject(error);
            }
        });
    }

    // 4. 上传文件夹，支持断点续传
    async uploadDir(host, localDir, remoteDir, onProgress = null, onFileProgress = null) {
        const sessionId = this.generateSessionId(host, 'upload-dir', remoteDir, localDir);
        
        try {
            // 检查本地目录
            if (!fs.existsSync(localDir)) {
                throw new Error('Local directory not found');
            }

            const sftp = await this.getSftpClient(host);
            
            // 扫描本地目录结构
            const fileList = await this.scanLocalDirectory(localDir, remoteDir);
            const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);

            // 创建传输会话
            const session = {
                id: sessionId,
                host,
                type: 'upload-dir',
                localPath: localDir,
                remotePath: remoteDir,
                fileList,
                totalSize,
                transferred: 0,
                completedFiles: 0,
                totalFiles: fileList.length,
                startTime: Date.now(),
                status: 'in-progress',
                currentFile: null
            };

            this.transferSessions.set(sessionId, session);
            this.addActiveTransfer(host, sessionId);

            // 执行上传
            const result = await this.uploadDirectoryWithResume(sftp, session, onProgress, onFileProgress);
            
            this.transferSessions.delete(sessionId);
            this.removeActiveTransfer(host, sessionId);
            
            return result;

        } catch (error) {
            this.cleanupSession(sessionId, host);
            return { success: false, message: `Directory upload failed: ${error.message}` };
        }
    }

    // 实现文件夹上传（断点续传）
    async uploadDirectoryWithResume(sftp, session, onProgress, onFileProgress) {
        const results = {
            success: true,
            uploadedFiles: 0,
            failedFiles: 0,
            totalFiles: session.totalFiles,
            totalSize: session.totalSize,
            transferred: 0,
            errors: []
        };

        for (let i = 0; i < session.fileList.length; i++) {
            const file = session.fileList[i];
            session.currentFile = file;

            if (onProgress) {
                onProgress({
                    sessionId: session.id,
                    type: 'upload-dir',
                    currentFile: file.name,
                    currentFileIndex: i,
                    totalFiles: session.totalFiles,
                    progress: Math.round((results.uploadedFiles / session.totalFiles) * 100),
                    transferred: results.transferred,
                    total: session.totalSize
                });
            }

            if (file.isDirectory) {
                // 创建远程目录
                await this.ensureRemoteDirectory(sftp, file.remotePath);
                results.uploadedFiles++;
            } else {
                // 上传文件
                try {
                    const fileProgressCallback = onFileProgress ? (progress) => {
                        onFileProgress({
                            ...progress,
                            sessionId: session.id,
                            filename: file.name
                        });
                    } : null;

                    const fileResult = await this.uploadFile(
                        session.host, 
                        file.localPath, 
                        file.remotePath, 
                        fileProgressCallback
                    );

                    if (fileResult.success) {
                        results.uploadedFiles++;
                        results.transferred += file.size;
                    } else {
                        results.failedFiles++;
                        results.errors.push(`File ${file.name}: ${fileResult.message}`);
                    }
                } catch (error) {
                    results.failedFiles++;
                    results.errors.push(`File ${file.name}: ${error.message}`);
                }
            }

            // 保存进度
            session.completedFiles = results.uploadedFiles;
            session.transferred = results.transferred;
            this.saveProgress(session);

            if (session.status === 'paused') {
                break;
            }
        }

        if (results.failedFiles > 0) {
            results.success = false;
            results.message = `${results.failedFiles} files failed to upload`;
        } else if (session.status === 'paused') {
            results.message = 'Upload paused';
            results.paused = true;
        } else {
            results.message = 'Directory upload completed';
        }

        return results;
    }

    // 工具方法
    async scanRemoteDirectory(sftp, remoteDir, localBaseDir) {
        const files = [];
        
        const scanRecursive = async (currentRemoteDir, currentLocalDir) => {
            const items = await sftp.list(currentRemoteDir);
            
            for (const item of items) {
                if (item.name === '.' || item.name === '..') continue;

                const remotePath = path.posix.join(currentRemoteDir, item.name);
                const localPath = path.join(currentLocalDir, item.name);

                if (item.type === 'd') {
                    files.push({
                        remotePath,
                        localPath,
                        name: item.name,
                        size: 0,
                        isDirectory: true
                    });
                    await scanRecursive(remotePath, localPath);
                } else {
                    files.push({
                        remotePath,
                        localPath,
                        name: item.name,
                        size: item.size,
                        isDirectory: false
                    });
                }
            }
        };

        await scanRecursive(remoteDir, localBaseDir);
        return files;
    }

    async scanLocalDirectory(localDir, remoteBaseDir) {
        const files = [];
        
        const scanRecursive = (currentLocalDir, currentRemoteDir) => {
            const items = fs.readdirSync(currentLocalDir);
            
            for (const item of items) {
                const localPath = path.join(currentLocalDir, item);
                const remotePath = path.posix.join(currentRemoteDir, item);
                const stats = fs.statSync(localPath);

                if (stats.isDirectory()) {
                    files.push({
                        localPath,
                        remotePath,
                        name: item,
                        size: 0,
                        isDirectory: true
                    });
                    scanRecursive(localPath, remotePath);
                } else {
                    files.push({
                        localPath,
                        remotePath,
                        name: item,
                        size: stats.size,
                        isDirectory: false
                    });
                }
            }
        };

        scanRecursive(localDir, remoteBaseDir);
        return files;
    }

    async ensureRemoteDirectory(sftp, remoteDir) {
        try {
            await sftp.mkdir(remoteDir, true);
        } catch (error) {
            // 目录可能已存在
            if (!error.message.includes('Failure') && !error.message.includes('exists')) {
                throw error;
            }
        }
    }

    async getResumePosition(localPath, remoteSize) {
        try {
            if (fs.existsSync(localPath)) {
                const stats = fs.statSync(localPath);
                if (stats.size === remoteSize) {
                    return -1; // 文件已完整
                }
                if (stats.size < remoteSize) {
                    return stats.size; // 从当前位置续传
                }
            }
            return 0; // 从头开始
        } catch (error) {
            return 0;
        }
    }

    calculateSpeed(session) {
        const duration = (Date.now() - session.startTime) / 1000;
        const transferredSinceStart = session.transferred - session.startPosition;
        return duration > 0 ? Math.round(transferredSinceStart / duration) : 0;
    }

    calculateTimeRemaining(session) {
        const speed = this.calculateSpeed(session);
        if (speed === 0) return Infinity;
        const remaining = session.total - session.transferred;
        return Math.round(remaining / speed);
    }

    saveProgress(session) {
        const stateFile = path.join(this.stateDir, `${session.id}.json`);
        fs.writeFileSync(stateFile, JSON.stringify(session, null, 2));
    }

    clearProgress(sessionId) {
        const stateFile = path.join(this.stateDir, `${sessionId}.json`);
        if (fs.existsSync(stateFile)) {
            fs.unlinkSync(stateFile);
        }
    }

    addActiveTransfer(host, sessionId) {
        if (!this.activeTransfers.has(host)) {
            this.activeTransfers.set(host, new Set());
        }
        this.activeTransfers.get(host).add(sessionId);
    }

    removeActiveTransfer(host, sessionId) {
        if (this.activeTransfers.has(host)) {
            this.activeTransfers.get(host).delete(sessionId);
            if (this.activeTransfers.get(host).size === 0) {
                this.activeTransfers.delete(host);
            }
        }
    }

    cleanupSession(sessionId, host) {
        this.transferSessions.delete(sessionId);
        this.removeActiveTransfer(host, sessionId);
        this.clearProgress(sessionId);
    }

    // 暂停传输
    async pauseTransfer(sessionId) {
        const session = this.transferSessions.get(sessionId);
        if (session) {
            session.status = 'paused';
            this.saveProgress(session);
            return true;
        }
        return false;
    }

    // 恢复传输
    async resumeTransfer(sessionId) {
        const session = this.transferSessions.get(sessionId);
        if (session && session.status === 'paused') {
            session.status = 'in-progress';
            // 根据传输类型调用相应的方法继续传输
            return true;
        }
        return false;
    }

    // 取消传输
    async cancelTransfer(sessionId) {
        const session = this.transferSessions.get(sessionId);
        if (session) {
            this.cleanupSession(sessionId, session.host);
            return true;
        }
        return false;
    }

    // 获取传输状态
    getTransferStatus(sessionId) {
        return this.transferSessions.get(sessionId) || null;
    }

    // 获取服务器状态
    getServerStatus(host) {
        const activeSessions = this.activeTransfers.get(host) || new Set();
        return {
            host,
            connected: this.sftpClients.has(host) && this.sftpClients.get(host).connected,
            activeTransfers: activeSessions.size,
            activeSessionIds: Array.from(activeSessions)
        };
    }

    // 获取所有可恢复的传输
    getResumableTransfers() {
        const transfers = [];
        const files = fs.readdirSync(this.stateDir);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(this.stateDir, file);
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (data.status === 'paused') {
                        transfers.push(data);
                    }
                } catch (error) {
                    // 无效文件，跳过
                }
            }
        }
        return transfers;
    }
}

export default SFTPService;