// import Client from 'ssh2-sftp-client';
import { EventEmitter } from 'events';
import Utils from "../core/Utils.js";
import { Client } from 'ssh2';
import * as fs from 'fs'; // 核心修复：直接导入完整 fs 模块（含同步+异步）
import * as path from 'path';
import * as os from 'os';


class SFTPService extends EventEmitter {
    constructor() {
        super();
        this.sftpClients = new Map(); // host -> SFTP client
        this.connectionConfig = new Map(); // 新增：host -> 连接参数（username/password/port）
        this.connectionStatus = new Map(); // host → 连接状态（true=有效）
        this.transferSessions = new Map(); // sessionId -> transfer session
        this.activeTransfers = new Map(); // host -> active transfers
        this.stateDir = Utils.sftpDownloadMetaDir();
        this.ensureStateDirectory();
    }

    /**
     * 设置连接配置（兼容两种传参方式）
     * 方式 1：按顺序传参 → setConfig(host, username, password, port)
     * 方式 2：传入对象 → setConfig({ host, username, password, port })
     */
    setConfig(...args) {
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
    ensureStateDirectory() {
        if (!fs.existsSync(this.stateDir)) {
            fs.mkdirSync(this.stateDir, { recursive: true });
        }
    }


    /**
     * @notice 连接BMC后端，会出现如下错误，
     * SFTP Debug: CLIENT[sftp]: connect: Debugging turned on
     * SFTP Debug: CLIENT[sftp]: ssh2-sftp-client Version: 12.0.1  {
     * "node": "20.18.3",
     * "acorn": "8.14.0",
     * "ada": "2.9.2",
     * "ares": "1.34.4",
     * "base64": "0.5.2",
     * "brotli": "1.0.9",
     * "cjs_module_lexer": "1.4.1",
     * "cldr": "44.1",
     * "icu": "74.2",
     * "llhttp": "8.1.2",
     * "modules": "130",
     * "napi": "9",
     * "nghttp2": "1.61.0",
     * "openssl": "0.0.0",
     * "simdutf": "5.6.4",
     * "tz": "2024a",
     * "undici": "6.21.1",
     * "unicode": "15.1",
     * "uv": "1.46.0",
     * "uvwasi": "0.0.21",
     * "v8": "13.0.245.25-electron.0",
     * "zlib": "1.3.0.1-motley",
     * "electron": "33.4.11",
     * "chrome": "130.0.6723.191"
     * }
     * SFTP Debug: Custom crypto binding not available
     * SFTP Debug: Local ident: 'SSH-2.0-ssh2js1.17.0'
     * SFTP Debug: Client: Trying 172.26.3.11 on port 22 ...
     * SFTP Debug: Socket connected
     * SFTP Debug: Remote ident: 'SSH-2.0-dropbear_2019.78'
     * SFTP Debug: Outbound: Sending KEXINIT
     * SFTP Debug: Inbound: Handshake in progress
     * SFTP Debug: Handshake: (local) KEX method: curve25519-sha256@libssh.org,curve25519-sha256,ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256,diffie-hellman-group15-sha512,diffie-hellman-group16-sha512,diffie-hellman-group17-sha512,diffie-hellman-group18-sha512,ext-info-c,kex-strict-c-v00@openssh.com
     * SFTP Debug: Handshake: (remote) KEX method: curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp521,ecdh-sha2-nistp384,ecdh-sha2-nistp256,diffie-hellman-group14-sha256,kexguess2@matt.ucc.asn.au
     * SFTP Debug: Handshake: KEX algorithm: curve25519-sha256@libssh.org
     * SFTP Debug: Handshake: (local) Host key format: ssh-rsa,ssh-dss
     * SFTP Debug: Handshake: (remote) Host key format: ssh-rsa
     * SFTP Debug: Handshake: Host key format: ssh-rsa
     * SFTP Debug: Handshake: (local) C->S cipher: aes128-ctr,aes192-ctr,aes256-ctr
     * SFTP Debug: Handshake: (remote) C->S cipher: aes128-ctr,aes256-ctr
     * SFTP Debug: Handshake: C->S Cipher: aes128-ctr
     * SFTP Debug: Handshake: (local) S->C cipher: aes128-ctr,aes192-ctr,aes256-ctr
     * SFTP Debug: Handshake: (remote) S->C cipher: aes128-ctr,aes256-ctr
     * SFTP Debug: Handshake: S->C cipher: aes128-ctr
     * SFTP Debug: Handshake: (local) C->S MAC: hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha1-etm@openssh.com,hmac-sha2-256,hmac-sha2-512,hmac-sha1
     * SFTP Debug: Handshake: (remote) C->S MAC: hmac-sha1,hmac-sha2-256
     * SFTP Debug: Handshake: C->S MAC: hmac-sha2-256
     * SFTP Debug: Handshake: (local) S->C MAC: hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha1-etm@openssh.com,hmac-sha2-256,hmac-sha2-512,hmac-sha1
     * SFTP Debug: Handshake: (remote) S->C MAC: hmac-sha1,hmac-sha2-256
     * SFTP Debug: Handshake: S->C MAC: hmac-sha2-256
     * SFTP Debug: Handshake: (local) C->S compression: none,zlib@openssh.com,zlib
     * SFTP Debug: Handshake: (remote) C->S compression: zlib@openssh.com,none
     * SFTP Debug: Handshake: C->S compression: none
     * SFTP Debug: Handshake: (local) S->C compression: none,zlib@openssh.com,zlib
     * SFTP Debug: Handshake: (remote) S->C compression: zlib@openssh.com,none
     * SFTP Debug: Handshake: S->C compression: none
     * SFTP Debug: Outbound: Sending KEXECDH_INIT
     * SFTP Debug: Received DH Reply
     * SFTP Debug: Host accepted by default (no verification)
     * SFTP Debug: Host accepted (verified)
     * SFTP Debug: Outbound: Sending NEWKEYS
     * SFTP Debug: Inbound: NEWKEYS
     * SFTP Debug: Verifying signature ...
     * SFTP Debug: Verified signature
     * SFTP Debug: Handshake completed
     * SFTP Debug: Outbound: Sending SERVICE_REQUEST (ssh-userauth)
     * SFTP Debug: Inbound: Received SERVICE_ACCEPT (ssh-userauth)
     * SFTP Debug: Outbound: Sending USERAUTH_REQUEST (none)
     * SFTP Debug: Inbound: Received USERAUTH_FAILURE (publickey,password)
     * SFTP Debug: Client: none auth failed
     * SFTP Debug: Outbound: Sending USERAUTH_REQUEST (password)
     * SFTP Debug: Inbound: Received USERAUTH_SUCCESS
     * SFTP Debug: Outbound: Sending CHANNEL_OPEN (r:0, session)
     * SFTP Debug: Inbound: CHANNEL_OPEN_CONFIRMATION (r:0, s:0)
     * SFTP Debug: Outbound: Sending CHANNEL_REQUEST (r:0, subsystem: sftp)
     * SFTP Debug: Inbound: CHANNEL_SUCCESS (r:0)
     * SFTP Debug: Outbound: Sending CHANNEL_DATA (r:0, 9)
     * SFTP Debug: Inbound: CHANNEL_EXTENDED_DATA (r:0, 56)
     * SFTP Debug: Inbound: CHANNEL_EOF (r:0)
     * SFTP Debug: Inbound: CHANNEL_REQUEST (r:0, exit-status: 127)
     * SFTP Debug: CLIENT[sftp]: sftp: Received exit code 127 while establishing SFTP session (127)
     * SFTP Debug: Inbound: CHANNEL_CLOSE (r:0)
     * download Failed to connect to 172.26.3.11: Connection failed: sftp: Received exit code 127 while establishing SFTP session
     */

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
                // 添加调试信息
                debug: msg => console.log('SFTP Debug:', msg),
                algorithms: {
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
                    serverHostKey: ['ssh-rsa', 'ssh-dss']
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
    async disconnectServer(host) {
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
    async getSftpClient(host) {
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
    generateSessionId(host, type, remotePath, localPath) {
        const data = `${host}-${type}-${remotePath}-${localPath}-${Date.now()}`;
        return Buffer.from(data).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }



    // 1. 下载单个文件（入口方法，无改动）
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
    async downloadFileWithResume(sftp, session, onProgress) {
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
                    onProgress && typeof onProgress === '' && onProgress({
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
            console.error("download", error.message);
            this.cleanupSession(sessionId, host);
            return { success: false, message: `Directory download failed: ${error.message}` };
        }
    }

    // 实现文件夹下载（断点续传）
    async downloadDirectoryWithResume(sftp, session, onProgress, onFileProgress) {
        try {
            if (!fs.existsSync(session.localPath)) {
                fs.mkdirSync(session.localPath, { recursive: true });
            }
        } catch (err) {
            console.error(`[downloadDirectoryWithResume] 文件夹创建失败：`, err.message);
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


    /**
     * SSH配置类型定义
     * @typedef {Object} SshConfig
     * @property {string} host - 服务器IP
     * @property {number} [port=22] - 端口
     * @property {string} username - 用户名
     * @property {string} password - 密码
     * @property {string} [sshKeyPath] - 私钥路径（可选，优先于密码）
     */

    /**
     * 进度回调函数类型
     * @typedef {Function} ProgressCallback
     * @param {Object} progress - 进度信息
     * @param {number} progress.fileCount - 已传输文件数
     * @param {number} progress.totalFiles - 总文件数
     * @param {number} progress.byteCount - 已传输字节数
     * @param {number} progress.totalBytes - 总字节数
     * @param {number} progress.percent - 进度百分比（0-100）
     * @param {string} [progress.currentFile] - 当前传输的文件路径
     * @param {string} [progress.status] - 状态描述（如 "上传中"、"下载中"）
     */

    /**
     * 读取SCP协议响应（处理ASCII控制字符）
     * @param {import('stream').Readable} stream - SSH通道可读流
     * @returns {Promise<{status: number, message: string}>} 响应状态和消息
     */
    async readScpResponse(stream) {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);

            const onData = (data) => {
                buffer = Buffer.concat([buffer, data]);
                const nullIdx = buffer.indexOf(0); // SCP响应以NULL字符结束

                if (nullIdx !== -1) {
                    stream.off('data', onData);
                    const status = buffer[0]; // 0=成功，1-255=错误
                    const message = buffer.slice(1, nullIdx).toString('utf8').trim();
                    resolve({ status, message });
                }
            };

            stream.on('data', onData);
            stream.on('error', (err) => reject(new Error(`读取SCP响应失败: ${err.message}`)));
            stream.on('close', () => reject(new Error('SCP通道意外关闭')));
        });
    }

    /**
     * 发送SCP协议请求
     * @param {import('stream').Writable} stream - SSH通道可写流
     * @param {string} data - 要发送的数据
     */
    writeScpRequest(stream, data) {
        try {
            stream.write(Buffer.concat([Buffer.from(data), Buffer.alloc(1)])); // 末尾添加NULL字符
        } catch (err) {
            throw new Error(`发送SCP请求失败: ${err.message}`);
        }
    }

    /**
     * 扫描本地文件夹，获取文件列表、大小和相对路径
     * @param {string} localDir - 本地文件夹路径
     * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
     */
    async scanLocalDir(localDir) {
        const files = [];
        let totalBytes = 0;

        async function traverse(dir) {
            try {
                // 异步方法：用 fs.promises.xxx
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.relative(localDir, fullPath).replace(/\\/g, '/'); // 统一为POSIX路径

                    if (entry.isDirectory()) {
                        await traverse(fullPath);
                    } else if (entry.isFile()) {
                        const stats = await fs.promises.stat(fullPath);
                        files.push({ path: fullPath, size: stats.size, relPath });
                        totalBytes += stats.size;
                    }
                }
            } catch (err) {
                throw new Error(`扫描本地文件夹失败: ${err.message}（路径：${dir}）`);
            }
        }

        // 同步方法：直接用 fs.existsSync（核心修复）
        if (!fs.existsSync(localDir)) {
            throw new Error(`本地文件夹不存在: ${localDir}`);
        }

        await traverse(localDir);
        return { files, totalBytes };
    }

    /**
  * 扫描远程文件夹，获取文件列表、大小和相对路径（兼容 BusyBox 无find环境）
  * @param {import('ssh2').Client} conn - SSH连接实例
  * @param {string} remoteDir - 远程文件夹路径（绝对路径）
  * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
  */
    async scanRemoteDir(conn, remoteDir) {
        const files = [];
        let totalBytes = 0;
        // 标准化远程目录（确保结尾无斜杠，避免路径拼接重复）
        const normalizedRemoteDir = remoteDir.replace(/\/$/, '');

        try {
            // BusyBox 兼容的 ls 命令：-l（详细信息）、-R（递归）、-A（显示隐藏文件，不含.和..）
            const lsCmd = `ls -lRA "${normalizedRemoteDir}"`;
            const { stdout, stderr } = await new Promise((resolve, reject) => {
                conn.exec(lsCmd, (err, stream) => {
                    if (err) return reject(new Error(`执行远程ls命令失败: ${err.message}`));

                    let stdout = '';
                    let stderr = '';

                    stream.on('data', (data) => (stdout += data.toString()));
                    stream.on('stderr', (data) => (stderr += data.toString()));
                    stream.on('close', (code) => {
                        if (code !== 0) {
                            // 忽略 "文件夹不存在" 错误，返回空结果（与原逻辑一致）
                            if (stderr.includes('No such file or directory')) {
                                return resolve({ stdout: '', stderr: '' });
                            }
                            return reject(new Error(`ls命令执行失败（退出码${code}）: ${stderr}`));
                        }
                        resolve({ stdout, stderr });
                    });
                    stream.on('error', (err) => reject(new Error(`远程命令流错误: ${err.message}`)));
                });
            });

            if (!stdout) return { files, totalBytes };

            const lines = stdout.split('\n').filter(line => line.trim());
            let currentAbsDir = normalizedRemoteDir; // 记录当前递归的绝对目录

            // BusyBox ls -l 输出格式示例：
            // -rw-r--r--    1 root     root          1234 Jan  1 10:00 test.txt
            // drwxr-xr-x    2 root     root          4096 Jan  2 11:00 subdir
            // 正则解析：匹配权限、链接数、所有者、组、大小、时间、文件名（兼容空格文件名）
            const fileLineRegex = /^[-dlrwx]+(\s+\d+){2}\s+[\w-]+\s+[\w-]+\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+(\d{2}:\d{2}|\d{4}))\s+(.*)$/;

            for (const line of lines) {
                // 1. 匹配目录行（格式：/path/to/dir:）
                if (line.endsWith(':')) {
                    currentAbsDir = line.slice(0, -1).trim(); // 去除末尾 ":"，得到当前目录绝对路径
                    continue;
                }

                // 2. 匹配文件行（跳过目录行和无效行）
                const fileMatch = line.match(fileLineRegex);
                if (!fileMatch) continue;

                const [, , sizeStr, , fileName] = fileMatch;
                const size = parseInt(sizeStr, 10);

                // 过滤无效数据：
                // - 目录的大小是4096（BusyBox默认），需排除
                // - 解析失败的大小、空文件名
                if (isNaN(size) || size === 4096 || !fileName || fileName.trim() === '') continue;

                // 3. 计算绝对路径和相对路径
                const absPath = `${currentAbsDir}/${fileName}`; // 拼接文件绝对路径
                // 相对路径：当前目录绝对路径 - 根目录路径 = 相对目录，再拼接文件名
                const relDir = currentAbsDir.replace(normalizedRemoteDir, '');
                const relPath = `${relDir}/${fileName}`.replace(/^\/+/, ''); // 去除开头多余斜杠

                // 4. 添加到结果列表
                files.push({
                    path: absPath,
                    size,
                    relPath
                });
                totalBytes += size;
            }

            return { files, totalBytes };
        } catch (err) {
            throw new Error(`扫描远程文件夹失败: ${err.message}`);
        }
    }


    /**
     * 过滤需要传输的文件（断点续传核心）
     * @param {Object[]} sourceFiles - 源文件列表（含path/size/relPath）
     * @param {Object[]} targetFiles - 目标文件列表（含path/size/relPath）
     * @returns {Object[]} 需要传输的源文件列表
     */
    filterNeedTransferFiles(sourceFiles, targetFiles) {
        const targetMap = new Map();
        targetFiles.forEach(file => targetMap.set(file.relPath, file.size));

        return sourceFiles.filter(sourceFile => {
            const targetSize = targetMap.get(sourceFile.relPath);
            // 目标文件不存在，或源文件比目标文件大（未传输完成）
            return targetSize === undefined || sourceFile.size > targetSize;
        });
    }

    /**
     * 单个文件SCP上传（支持断点续传）
     * @param {import('ssh2').Client} conn - SSH连接实例
     * @param {string} localFile - 本地文件路径
     * @param {string} remoteFile - 远程文件路径
     * @param {number} fileSize - 文件总大小
     * @param {number} startOffset - 开始传输的偏移量（断点续传用）
     * @param {ProgressCallback} [onProgress] - 进度回调（单文件）
     * @returns {Promise<void>}
     */
    async scpUploadFile(conn, localFile, remoteFile, fileSize, startOffset = 0, onProgress) {
        return new Promise((resolve, reject) => {
            // 执行远程scp接收命令（-t=to，接收文件）
            conn.exec(`scp -t "${remoteFile}"`, (err, stream) => {
                if (err) return reject(new Error(`创建上传通道失败: ${err.message}`));

                let bytesTransferred = startOffset; // 已传输字节数（含断点偏移）

                // 1. 读取服务器初始响应
                readScpResponse(stream)
                    .then(({ status, message }) => {
                        if (status !== 0) throw new Error(`服务器响应错误: ${message}`);

                        // 2. 发送文件元信息（C0644 权限 + 大小 + 文件名）
                        const fileName = path.basename(remoteFile);
                        writeScpRequest(stream, `C0644 ${fileSize} ${fileName}`);

                        // 3. 读取元信息响应
                        return readScpResponse(stream);
                    })
                    .then(({ status, message }) => {
                        if (status !== 0) throw new Error(`元信息发送失败: ${message}`);

                        // 4. 发送文件数据（从断点偏移开始）
                        // 同步方法：fs.createReadStream（核心修复）
                        const readStream = fs.createReadStream(localFile, { start: startOffset });

                        readStream.on('data', (chunk) => {
                            stream.write(chunk);
                            bytesTransferred += chunk.length;
                            onProgress?.({
                                byteCount: bytesTransferred,
                                totalBytes: fileSize,
                                percent: Math.round((bytesTransferred / fileSize) * 100),
                                status: '上传中'
                            });
                        });

                        readStream.on('end', () => {
                            // 5. 发送传输完成标记（0x00）
                            stream.write(Buffer.alloc(1));
                        });

                        readStream.on('error', (err) => {
                            reject(new Error(`读取本地文件失败: ${err.message}`));
                            stream.destroy();
                        });
                    })
                    .catch(reject);

                // 6. 监听通道关闭
                stream.on('close', (code) => {
                    if (code === 0 && bytesTransferred === fileSize) {
                        resolve();
                    } else {
                        reject(new Error(`上传失败，退出码: ${code}，已传输: ${bytesTransferred}/${fileSize}字节`));
                    }
                });

                stream.on('error', (err) => {
                    reject(new Error(`上传通道错误: ${err.message}`));
                });
            });
        });
    }

    /**
     * 单个文件SCP下载（支持断点续传）
     * @param {import('ssh2').Client} conn - SSH连接实例
     * @param {string} remoteFile - 远程文件路径
     * @param {string} localFile - 本地文件路径
     * @param {number} fileSize - 文件总大小
     * @param {number} startOffset - 开始传输的偏移量（断点续传用）
     * @param {ProgressCallback} [onProgress] - 进度回调（单文件）
     * @returns {Promise<void>}
     */
    async scpDownloadFile(conn, remoteFile, localFile, fileSize, startOffset = 0, onProgress) {
        return new Promise((resolve, reject) => {
            // 确保本地目录存在
            const localDir = path.dirname(localFile);
            // 同步方法：fs.existsSync + fs.mkdirSync（核心修复）
            if (!fs.existsSync(localDir)) {
                try {
                    fs.mkdirSync(localDir, { recursive: true });
                } catch (err) {
                    return reject(new Error(`创建本地目录失败: ${err.message}`));
                }
            }

            // 执行远程scp发送命令（-f=from，发送文件）
            conn.exec(`scp -f "${remoteFile}"`, (err, stream) => {
                if (err) return reject(new Error(`创建下载通道失败: ${err.message}`));

                let bytesTransferred = startOffset;
                let writeStream;

                // 1. 发送初始确认（0x00）
                stream.write(Buffer.alloc(1));

                // 2. 读取文件元信息
                readScpResponse(stream)
                    .then(({ status, message }) => {
                        if (status !== 0) throw new Error(`获取文件元信息失败: ${message}`);

                        // 解析元信息（格式：C0644 大小 文件名）
                        const metaMatch = message.match(/^C(\d{4}) (\d+) (.+)$/);
                        if (!metaMatch) throw new Error(`无效的文件元信息: ${message}`);

                        const remoteSize = parseInt(metaMatch[2], 10);
                        if (remoteSize !== fileSize) {
                            throw new Error(`文件大小不匹配，远程: ${remoteSize}，本地记录: ${fileSize}`);
                        }

                        // 3. 发送偏移量（断点续传：如果需要跳过已下载部分）
                        if (startOffset > 0) {
                            writeScpRequest(stream, `S${startOffset}`); // S=seek，指定偏移量
                            return readScpResponse(stream); // 等待服务器确认
                        }
                        return { status: 0 };
                    })
                    .then(({ status, message }) => {
                        if (status !== 0) throw new Error(`偏移量确认失败: ${message}`);

                        // 4. 发送开始接收确认
                        stream.write(Buffer.alloc(1));

                        // 5. 创建本地文件写入流（追加模式，从偏移量开始）
                        // 同步方法：fs.createWriteStream（核心修复）
                        writeStream = fs.createWriteStream(localFile, {
                            flags: startOffset > 0 ? 'r+' : 'w', // 断点续传用追加，新文件用写入
                            start: startOffset
                        });

                        // 6. 接收文件数据
                        stream.on('data', (chunk) => {
                            // 过滤结束标记（0x00）
                            if (chunk[chunk.length - 1] === 0) {
                                chunk = chunk.slice(0, -1);
                            }

                            writeStream.write(chunk);
                            bytesTransferred += chunk.length;
                            onProgress?.({
                                byteCount: bytesTransferred,
                                totalBytes: fileSize,
                                percent: Math.round((bytesTransferred / fileSize) * 100),
                                status: '下载中'
                            });
                        });

                        writeStream.on('error', (err) => {
                            reject(new Error(`写入本地文件失败: ${err.message}`));
                            stream.destroy();
                        });
                    })
                    .catch(reject);

                // 7. 监听通道关闭
                stream.on('close', (code) => {
                    if (writeStream) writeStream.end();

                    if (code === 0 && bytesTransferred === fileSize) {
                        resolve();
                    } else {
                        reject(new Error(`下载失败，退出码: ${code}，已传输: ${bytesTransferred}/${fileSize}字节`));
                    }
                });

                stream.on('error', (err) => {
                    if (writeStream) writeStream.destroy();
                    reject(new Error(`下载通道错误: ${err.message}`));
                });
            });
        });
    }

    /**
     * 文件夹SCP上传（支持断点续传+进度回调）
     * @param {SshConfig} config - SSH配置
     * @param {string} localDir - 本地文件夹路径
     * @param {string} remoteDir - 远程文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     */
    async scpUploadDir(config, localDir, remoteDir, onProgress) {
        let conn = null;
        try {
            // 校验入参
            if (!config?.host || !config?.username) {
                throw new Error('SSH配置缺少必填项（host/username）');
            }

            // 1. 扫描本地文件
            onProgress?.({ status: '扫描本地文件中...', percent: 0 });
            const { files: localFiles, totalBytes: localTotalBytes } = await this.scanLocalDir(localDir);

            // 2. 创建SSH连接
            conn = new Client();
            onProgress?.({ status: '连接SSH服务器...', percent: 0 });
            await new Promise((resolve, reject) => {
                conn.on('ready', resolve);
                conn.on('error', (err) => reject(new Error(`SSH连接失败: ${err.message}`)));
                conn.on('close', () => reject(new Error('SSH连接意外关闭')));

                const connectOpts = {
                    host: config.host,
                    port: config.port || 22,
                    username: config.username,
                    algorithms: {
                        kex: ['curve25519-sha256@libssh.org', 'curve25519-sha256'],
                        cipher: ['aes128-ctr'],
                        hmac: ['hmac-sha2-256']
                    }
                };

                // 认证方式：优先私钥，后密码
                if (config.sshKeyPath) {
                    try {
                        // 同步方法：fs.readFileSync（核心修复）
                        connectOpts.privateKey = fs.readFileSync(config.sshKeyPath);
                    } catch (err) {
                        reject(new Error(`读取私钥失败: ${err.message}`));
                    }
                } else if (config.password) {
                    connectOpts.password = config.password;
                } else {
                    reject(new Error('SSH配置缺少认证信息（password/sshKeyPath）'));
                }

                conn.connect(connectOpts);
            });

            // 3. 扫描远程文件
            onProgress?.({ status: '扫描远程文件中...', percent: 10 });
            const { files: remoteFiles } = await this.scanRemoteDir(conn, remoteDir);

            // 4. 过滤需要传输的文件
            const needTransferFiles = this.filterNeedTransferFiles(localFiles, remoteFiles);
            const totalFiles = needTransferFiles.length;
            let transferredFiles = 0;
            let totalTransferredBytes = 0;

            // 初始化进度
            onProgress?.({
                fileCount: 0,
                totalFiles,
                byteCount: 0,
                totalBytes: localTotalBytes,
                percent: 20,
                status: `准备上传 ${totalFiles} 个文件`
            });

            if (totalFiles === 0) {
                onProgress?.({
                    fileCount: 0,
                    totalFiles: 0,
                    byteCount: localTotalBytes,
                    totalBytes: localTotalBytes,
                    percent: 100,
                    status: '所有文件已上传完成，无需继续传输'
                });
                console.log('所有文件已上传完成，无需继续传输');
                return;
            }

            // 5. 确保远程目录存在
            onProgress?.({ status: '创建远程目录...', percent: 20 });
            await new Promise((resolve, reject) => {
                conn.exec(`mkdir -p "${remoteDir}"`, (err) => {
                    if (err) reject(new Error(`创建远程目录失败: ${err.message}`));
                    else resolve();
                });
            });

            // 6. 逐个上传文件
            for (const file of needTransferFiles) {
                const { path: localFile, size: fileSize, relPath } = file;
                const remoteFile = path.posix.join(remoteDir, relPath); // 远程路径用POSIX格式

                onProgress?.({
                    currentFile: localFile,
                    status: `上传中: ${path.basename(localFile)}`,
                    percent: 20 + Math.round((transferredFiles / totalFiles) * 70) // 分配70%进度给文件传输
                });

                // 获取远程文件当前大小（断点续传偏移量）
                let startOffset = 0;
                const remoteFileInfo = remoteFiles.find(f => f.relPath === relPath);
                if (remoteFileInfo) {
                    startOffset = Math.min(remoteFileInfo.size, fileSize); // 偏移量不超过文件总大小
                }

                // 上传文件（带单文件进度回调）
                await scpUploadFile(conn, localFile, remoteFile, fileSize, startOffset, (fileProgress) => {
                    // 累计总传输字节数
                    const currentFileTransferred = fileProgress.byteCount - startOffset;
                    const currentTotal = totalTransferredBytes + currentFileTransferred;
                    const overallPercent = 20 + Math.round((currentTotal / localTotalBytes) * 70);

                    onProgress?.({
                        fileCount: transferredFiles,
                        totalFiles,
                        byteCount: currentTotal,
                        totalBytes: localTotalBytes,
                        percent: overallPercent,
                        currentFile: localFile,
                        status: `上传中: ${path.basename(localFile)} (${fileProgress.percent}%)`
                    });
                });

                // 更新统计
                transferredFiles++;
                totalTransferredBytes += fileSize - startOffset;
            }

            // 最终进度
            onProgress?.({
                fileCount: transferredFiles,
                totalFiles,
                byteCount: localTotalBytes,
                totalBytes: localTotalBytes,
                percent: 100,
                status: '上传完成'
            });

            console.log(`文件夹上传完成：${localDir} → ${remoteDir}`);
        } catch (err) {
            onProgress?.({ status: `上传失败: ${err.message}`, percent: -1 });
            throw err; // 抛出错误，让调用方处理
        } finally {
            // 关闭SSH连接
            if (conn && !conn._sock?.destroyed) {
                conn.end();
            }
        }
    }

    /**
     * 文件夹SCP下载（支持断点续传+进度回调）
     * @param {SshConfig} config - SSH配置
     * @param {string} remoteDir - 远程文件夹路径
     * @param {string} localDir - 本地文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     */
    async scpDownloadDir(config, remoteDir, localDir, onProgress) {
        let conn = null;
        try {
            // 校验入参
            if (!config?.host || !config?.username) {
                throw new Error('SSH配置缺少必填项（host/username）');
            }

            // 1. 创建SSH连接
            conn = new Client();
            onProgress?.({ status: '连接SSH服务器...', percent: 0 });
            await new Promise((resolve, reject) => {
                conn.on('ready', resolve);
                conn.on('error', (err) => reject(new Error(`SSH连接失败: ${err.message}`)));
                conn.on('close', () => reject(new Error('SSH连接意外关闭')));

                const connectOpts = {
                    host: config.host,
                    port: config.port || 22,
                    username: config.username,
                    algorithms: {
                        kex: ['curve25519-sha256@libssh.org', 'curve25519-sha256'],
                        cipher: ['aes128-ctr'],
                        hmac: ['hmac-sha2-256']
                    }
                };

                // 认证方式：优先私钥，后密码
                if (config.sshKeyPath) {
                    try {
                        // 同步方法：fs.readFileSync（核心修复）
                        connectOpts.privateKey = fs.readFileSync(config.sshKeyPath);
                    } catch (err) {
                        reject(new Error(`读取私钥失败: ${err.message}`));
                    }
                } else if (config.password) {
                    connectOpts.password = config.password;
                } else {
                    reject(new Error('SSH配置缺少认证信息（password/sshKeyPath）'));
                }

                conn.connect(connectOpts);
            });

            // 2. 扫描远程文件
            onProgress?.({ status: '扫描远程文件中...', percent: 10 });
            const { files: remoteFiles, totalBytes: remoteTotalBytes } = await this.scanRemoteDir(conn, remoteDir);

            // 3. 扫描本地文件
            onProgress?.({ status: '扫描本地文件中...', percent: 20 });
            const { files: localFiles } = fs.existsSync(localDir)
                ? await this.scanLocalDir(localDir)
                : { files: [], totalBytes: 0 };

            // 4. 过滤需要传输的文件
            const needTransferFiles = this.filterNeedTransferFiles(remoteFiles, localFiles);
            const totalFiles = needTransferFiles.length;
            let transferredFiles = 0;
            let totalTransferredBytes = 0;

            // 初始化进度
            onProgress?.({
                fileCount: 0,
                totalFiles,
                byteCount: 0,
                totalBytes: remoteTotalBytes,
                percent: 30,
                status: `准备下载 ${totalFiles} 个文件`
            });

            if (totalFiles === 0) {
                onProgress?.({
                    fileCount: 0,
                    totalFiles: 0,
                    byteCount: remoteTotalBytes,
                    totalBytes: remoteTotalBytes,
                    percent: 100,
                    status: '所有文件已下载完成，无需继续传输'
                });
                console.log('所有文件已下载完成，无需继续传输');
                return;
            }

            // 5. 逐个下载文件
            for (const file of needTransferFiles) {
                const { path: remoteFile, size: fileSize, relPath } = file;
                const localFile = path.join(localDir, relPath); // 本地路径用系统格式

                onProgress?.({
                    currentFile: remoteFile,
                    status: `下载中: ${path.basename(remoteFile)}`,
                    percent: 30 + Math.round((transferredFiles / totalFiles) * 60) // 分配60%进度给文件传输
                });

                // 获取本地文件当前大小（断点续传偏移量）
                let startOffset = 0;
                const localFileInfo = localFiles.find(f => f.relPath === relPath);
                if (localFileInfo) {
                    startOffset = Math.min(localFileInfo.size, fileSize);
                }

                // 下载文件（带单文件进度回调）
                await scpDownloadFile(conn, remoteFile, localFile, fileSize, startOffset, (fileProgress) => {
                    const currentFileTransferred = fileProgress.byteCount - startOffset;
                    const currentTotal = totalTransferredBytes + currentFileTransferred;
                    const overallPercent = 30 + Math.round((currentTotal / remoteTotalBytes) * 60);

                    onProgress?.({
                        fileCount: transferredFiles,
                        totalFiles,
                        byteCount: currentTotal,
                        totalBytes: remoteTotalBytes,
                        percent: overallPercent,
                        currentFile: remoteFile,
                        status: `下载中: ${path.basename(remoteFile)} (${fileProgress.percent}%)`
                    });
                });

                // 更新统计
                transferredFiles++;
                totalTransferredBytes += fileSize - startOffset;
            }

            // 最终进度
            onProgress?.({
                fileCount: transferredFiles,
                totalFiles,
                byteCount: remoteTotalBytes,
                totalBytes: remoteTotalBytes,
                percent: 100,
                status: '下载完成'
            });

            console.log(`文件夹下载完成：${remoteDir} → ${localDir}`);
        } catch (err) {
            onProgress?.({ status: `下载失败: ${err.message}`, percent: -1 });
            throw err; // 抛出错误，让调用方处理
        } finally {
            // 关闭SSH连接
            if (conn && !conn._sock?.destroyed) {
                conn.end();
            }
        }
    }
}

export default SFTPService;