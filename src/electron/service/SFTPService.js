import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { Transform } from 'stream';


class SFTPService extends EventEmitter {
    constructor() {
        super();
        this.sftpClients = new Map(); // host -> SFTP client
        this.connectionConfig = new Map(); // 新增：host -> 连接参数（username/password/port）
        this.connectionStatus = new Map(); // host → 连接状态（true=有效）
        this.transferSessions = new Map(); // sessionId -> transfer session
        this.activeTransfers = new Map(); // host -> active transfers
        this.stateDir = '.sftp_state';
        this.ensureStateDirectory();
    }

    /**
     * 设置连接配置（兼容两种传参方式）
     * 方式 1：按顺序传参 → setConfig(host, username, password, port)
     * 方式 2：传入对象 → setConfig({ host, username, password, port })
     */
    setConfig (...args) {
        let host, username = 'root', password = '0penBmc', port = 22;
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const config = args[0];
            if (!config.host) {
                throw new Error('配置对象必须包含 host 属性（服务器 IP/域名）');
            }
            host = config.host;
            username = config.username || username;
            password = config.password || password;
            port = config.port || port;
        }
        else if (args.length >= 1) {
            host = args[0];
            username = args[1] || username;
            password = args[2] || password;
            port = args[3] || port;
        }
        else {
            throw new Error('传参错误！支持：1. 传入配置对象 {host, username, password, port}；2. 按顺序传参 (host, username?, password?, port?)');
        }
        port = Number(port) || 22;

        // 保存配置到 connectionConfig（key 为 host）
        this.connectionConfig.set(host, { host, username, password, port });
        console.log(`已保存 ${host} 的连接配置：`, { username, password, port });
    }

    // 确保状态目录存在
    ensureStateDirectory () {
        if (!fs.existsSync(this.stateDir)) {
            fs.mkdirSync(this.stateDir, { recursive: true });
        }
    }

    // 连接到服务器
    async connectServer (host, username = 'root', password = '0penBmc', port = 22) {
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
            // 监听连接成功：设置状态为 true
            sftp.on('ready', () => {
                console.log("SSH 登录成功！");
                this.connectionStatus.set(host, true);
            });

            // 监听连接关闭/错误：设置状态为 false
            sftp.on('close', () => {
                this.connectionStatus.set(host, false);
            });
            sftp.on('error', () => {
                this.connectionStatus.set(host, false);
            });
            this.sftpClients.set(host, sftp);
            this.connectionConfig.set(host, { username, password, port });
            return { success: true, message: 'Connected successfully' };

        } catch (error) {
            this.connectionStatus.set(host, false);
            return { success: false, message: `Connection failed: ${error.message}` };
        }
    }

    // 断开服务器连接
    async disconnectServer (host) {
        try {
            const sftp = this.sftpClients.get(host);
            if (sftp) {
                await sftp.end();
                this.sftpClients.delete(host);
                this.connectionConfig.delete(host); // 断开时清除参数缓存
            }
            return { success: true, message: 'Disconnected' };
        } catch (error) {
            return { success: false, message: `Disconnect failed: ${error.message}` };
        }
    }

    // 获取SFTP客户端
    async getSftpClient (host) {
        const hasClient = this.sftpClients.has(host);
        if (!hasClient) {
            // 从缓存中获取之前的连接参数（若有），若无则用默认值
            const { username = 'root', password = '0penBmc', port = 22 } = this.connectionConfig.get(host) || {};
            // 复用缓存的参数重新连接，而非只传 host
            const result = await this.connectServer(host, username, password, port);
            if (!result.success) {
                throw new Error(`Failed to connect to ${host}: ${result.message}`);
            }
        }
        return this.sftpClients.get(host);
    }

    // 生成会话ID
    generateSessionId (host, type, remotePath, localPath) {
        const data = `${host}-${type}-${remotePath}-${localPath}-${Date.now()}`;
        return Buffer.from(data).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }

    // 1. 下载单个文件（入口方法，无改动）
    async downloadFile (host, remotePath, localPath, onProgress = null) {
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

            // 执行下载（调用修复后的核心方法）
            await this.downloadFileWithResume(sftp, session, onProgress);

            this.transferSessions.delete(sessionId);
            this.removeActiveTransfer(host, sessionId);

            return {
                success: true,
                session: session
            };

        } catch (error) {
            this.cleanupSession(sessionId, host);
            return { success: false, message: `Download failed: ${error.message}` };
        }
    }

    // 2. 核心修复：用官网原生 API 实现断点续传（无自定义流）
    // 核心修复：不依赖 _sshClient，用官网 API 实现可靠下载
    // 核心修复：兼容 Buffer/Stream，无流相关报错
    async downloadFileWithResume (sftp, session, onProgress) {
        return new Promise(async (resolve, reject) => {
            const { remotePath, localPath, startPosition = 0, remoteSize = 0 } = session;
            const CHUNK_SIZE = 64 * 1024; // 64KB 分片（用于模拟进度）

            try {
                // 1. 递归创建本地文件夹
                const localDir = path.dirname(localPath);
                fs.mkdirSync(localDir, { recursive: true });

                // 2. 打开本地文件（支持续传）
                const writeStream = fs.createWriteStream(localPath, {
                    flags: startPosition > 0 ? 'r+' : 'w',
                    start: startPosition
                });

                // 3. 关键：分块下载（兼容 Buffer，模拟进度监听）
                let currentPosition = startPosition;
                while (currentPosition < remoteSize) {
                    // 计算当前分片的大小（最后一块可能小于 CHUNK_SIZE）
                    const chunkEnd = Math.min(currentPosition + CHUNK_SIZE, remoteSize);
                    const chunkLength = chunkEnd - currentPosition;

                    // 分块下载：指定 start 和 end 位置（断点续传核心）
                    const chunkBuffer = await sftp.get(remotePath, undefined, {
                        readStreamOptions: {
                            start: currentPosition,
                            end: chunkEnd - 1 // end 是闭区间，需减 1
                        }
                    });

                    // 验证 chunkBuffer 是 Buffer（避免类型错误）
                    if (!(chunkBuffer instanceof Buffer)) {
                        throw new Error(`Invalid data type: expected Buffer, got ${typeof chunkBuffer}`);
                    }

                    // 写入本地文件（同步写入，避免流问题）
                    writeStream.write(chunkBuffer);

                    // 4. 进度更新（模拟流的 data 事件）
                    currentPosition = chunkEnd;
                    session.transferred = currentPosition;
                    const progress = (currentPosition / remoteSize) * 100;

                    // 触发进度回调（天然节流，每 64KB 一次）
                    onProgress && typeof onProgress === 'function' && onProgress({
                        id: session.id,
                        host: session.host,
                        remotePath,
                        localPath,
                        transferred: currentPosition,
                        total: remoteSize,
                        progress: progress.toFixed(2)
                    });

                    // 给事件循环让步（避免阻塞主进程）
                    await new Promise(resolve => setImmediate(resolve));
                }

                // 5. 下载完成：关闭写入流，触发 finish
                writeStream.end(() => {
                    console.log(`[下载成功] ${remotePath}（${currentPosition}/${remoteSize} 字节）`);
                    session.status = 'completed';
                    session.endTime = Date.now();
                    writeStream.destroy();
                    resolve();
                });

            } catch (err) {
                console.error(`[下载失败] ${remotePath}：${err.message}`);
                session.status = 'failed';
                session.error = err.message;
                // 清理资源 + 删除不完整文件
                if (writeStream) writeStream.destroy();
                if (fs.existsSync(localPath) && startPosition === 0) {
                    fs.unlinkSync(localPath);
                }
                reject(err);
            }
        });
    }
    // 2. 下载文件夹，支持断点续传
    async downloadDir (host, remoteDir, localDir, onProgress = null, onFileProgress = null) {
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
    async downloadDirectoryWithResume (sftp, session, onProgress, onFileProgress) {
        // 确保本地目录存在
        try {
            if (!fs.existsSync(session.localPath)) {
                fs.mkdirSync(session.localPath, { recursive: true });
            }
        } catch (err) {
            // 关键：打印创建失败的错误信息（之前可能忽略了错误）
            console.error(`[downloadDirectoryWithResume] 文件夹创建失败：`, err.message);
            // 抛出错误，让外层捕获，避免后续逻辑继续执行
            throw new Error(`创建本地文件夹失败：${err.message}`);
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
    async uploadFile (host, localPath, remotePath, onProgress = null) {
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
    async uploadFileWithResume (sftp, session, onProgress) {
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
    async uploadDir (host, localDir, remoteDir, onProgress = null, onFileProgress = null) {
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
    async uploadDirectoryWithResume (sftp, session, onProgress, onFileProgress) {
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
    async scanRemoteDirectory (sftp, remoteDir, localBaseDir) {
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

    async scanLocalDirectory (localDir, remoteBaseDir) {
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

    async ensureRemoteDirectory (sftp, remoteDir) {
        try {
            await sftp.mkdir(remoteDir, true);
        } catch (error) {
            // 目录可能已存在
            if (!error.message.includes('Failure') && !error.message.includes('exists')) {
                throw error;
            }
        }
    }

    async getResumePosition (localPath, remoteSize) {
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

    calculateSpeed (session) {
        const duration = (Date.now() - session.startTime) / 1000;
        const transferredSinceStart = session.transferred - session.startPosition;
        return duration > 0 ? Math.round(transferredSinceStart / duration) : 0;
    }

    calculateTimeRemaining (session) {
        const speed = this.calculateSpeed(session);
        if (speed === 0) return Infinity;
        const remaining = session.total - session.transferred;
        return Math.round(remaining / speed);
    }

    saveProgress (session) {
        const stateFile = path.join(this.stateDir, `${session.id}.json`);
        fs.writeFileSync(stateFile, JSON.stringify(session, null, 2));
    }

    clearProgress (sessionId) {
        const stateFile = path.join(this.stateDir, `${sessionId}.json`);
        if (fs.existsSync(stateFile)) {
            fs.unlinkSync(stateFile);
        }
    }

    addActiveTransfer (host, sessionId) {
        if (!this.activeTransfers.has(host)) {
            this.activeTransfers.set(host, new Set());
        }
        this.activeTransfers.get(host).add(sessionId);
    }

    removeActiveTransfer (host, sessionId) {
        if (this.activeTransfers.has(host)) {
            this.activeTransfers.get(host).delete(sessionId);
            if (this.activeTransfers.get(host).size === 0) {
                this.activeTransfers.delete(host);
            }
        }
    }

    cleanupSession (sessionId, host) {
        this.transferSessions.delete(sessionId);
        this.removeActiveTransfer(host, sessionId);
        this.clearProgress(sessionId);
    }

    // 暂停传输
    async pauseTransfer (sessionId) {
        const session = this.transferSessions.get(sessionId);
        if (session) {
            session.status = 'paused';
            this.saveProgress(session);
            return true;
        }
        return false;
    }

    // 恢复传输
    async resumeTransfer (sessionId) {
        const session = this.transferSessions.get(sessionId);
        if (session && session.status === 'paused') {
            session.status = 'in-progress';
            // 根据传输类型调用相应的方法继续传输
            return true;
        }
        return false;
    }

    // 取消传输
    async cancelTransfer (sessionId) {
        const session = this.transferSessions.get(sessionId);
        if (session) {
            this.cleanupSession(sessionId, session.host);
            return true;
        }
        return false;
    }

    // 获取传输状态
    getTransferStatus (sessionId) {
        return this.transferSessions.get(sessionId) || null;
    }

    // 获取服务器状态
    getServerStatus (host) {
        const activeSessions = this.activeTransfers.get(host) || new Set();
        return {
            host,
            connected: this.sftpClients.has(host) && this.sftpClients.get(host).connected,
            activeTransfers: activeSessions.size,
            activeSessionIds: Array.from(activeSessions)
        };
    }

    // 获取所有可恢复的传输
    getResumableTransfers () {
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