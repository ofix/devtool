// import Client from 'ssh2-sftp-client';
import { EventEmitter } from 'events';
import Utils from "../core/Utils.js";
import { Client } from 'ssh2';
import * as fs from 'fs'; // 核心修复：直接导入完整 fs 模块（含同步+异步）
import * as path from 'path';
import * as os from 'os';
import SCPClient from "./SCPClient.js"
import Print from "../core/Print.js";


class SFTPService extends EventEmitter {
    constructor() {
        super();
        this.sshClients = new Map(); // host -> SFTP client
        this.connectionConfig = new Map(); // 新增：host -> 连接参数（username/password/port）
        this.connectionStatus = new Map(); // host → 连接状态（true=有效）
        this.transferSessions = new Map(); // sessionId -> transfer session
        this.activeTransfers = new Map(); // host -> active transfers
        this.stateDir = Utils.sftpDownloadMetaDir();
        Print.level = 7;
        Utils.ensureDirSync(this.stateDir);
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
    async connectServer (host, username = 'root', password = '0penBmc', port = 22) {
        // 🔧 改进点5：参数验证
        if (!host || typeof host !== 'string') {
            throw new Error('host参数必须是非空字符串');
        }

        try {
            // 检查现有活跃连接
            const existingClient = this.sshClients.get(host);
            if (existingClient && this.isConnectionAlive(existingClient)) {
                Print.debug(`复用现有SSH连接: ${host}`);
                return {
                    success: true,
                    message: 'Using existing connection',
                    client: existingClient
                };
            }

            Print.debug(`\n连接SSH服务器: ${username}@${host}:${port}`);
            const sshClient = new Client();
            // 使用Promise.race实现超时控制
            const connectionResult = await Promise.race([
                this.newSSHConnection(sshClient, { host, port, username, password }),
                this.createTimeout(15000, `SSH连接超时（15秒）: ${host}`)
            ]);

            // 缓存新连接
            this.sshClients.set(host, sshClient);
            this.connectionConfig.set(host, { username, password, port });
            this.connectionStatus.set(host, true);
            Print.debug(`缓存SSH连接: ${host}`);
            Print.debug(`SSH连接成功: ${host}`);
            return {
                success: true,
                client: sshClient,
                message: 'Connection established'
            };

        } catch (error) {
            return this.handleConnectionError(host, error);
        }
    }

    newSSHConnection (sshClient, config) {
        return new Promise((resolve, reject) => {
            sshClient.on('ready', () => {
                Print.debug('SSH认证成功');
                resolve(sshClient);
            });

            sshClient.on('error', (err) => {
                reject(new Error(`SSH错误: ${err.message}`));
            });

            sshClient.on('close', (hadError) => {
                if (hadError) {
                    reject(new Error('SSH连接异常关闭'));
                }
            });

            // 连接配置
            sshClient.connect({
                host: config.host,
                port: config.port,
                username: config.username,
                password: config.password,
                readyTimeout: 10000,
                strictHostKeyChecking: 'no',
                debug: (message) => Print.debug(`[SSH2 Debug]: ${message}`),
                algorithms: {
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
                    serverHostKey: ['ssh-rsa', 'ssh-dss', 'ssh-rsa', 'ecdsa-sha2-nistp256']
                },
                hostVerifier: (key) => {
                    try {
                        const fingerprint = key.getFingerprint('sha256').toString('hex');
                        Print.debug(`服务器指纹: ${fingerprint}`);
                        return true;
                    } catch (err) {
                        Print.warn('指纹检查跳过');
                        return true;
                    }
                }
            });
        });
    }

    createTimeout (ms, message) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        });
    }

    // 🔧 改进点8：连接活性检查
    isConnectionAlive (client) {
        try {
            return client && typeof client === 'object' && client.connected === true;
        } catch (error) {
            return false;
        }
    }

    handleConnectionError (host, error) {
        this.connectionStatus.set(host, false);

        const errorInfo = {
            success: false,
            message: error.message,
            host,
            timestamp: new Date().toISOString()
        };

        // 根据错误类型提供更具体的消息
        if (error.message.includes('timed out')) {
            errorInfo.suggestion = '检查网络连接或增加超时时间';
        } else if (error.message.includes('Authentication failed')) {
            errorInfo.suggestion = '验证用户名和密码';
        } else if (error.message.includes('ENOTFOUND')) {
            errorInfo.suggestion = '检查主机名是否正确';
        }

        Print.error(`❌ SSH连接失败 [${host}]:`, error.message);
        return errorInfo;
    }

    // 获取缓存的已打开连接的SSH2客户端
    async getSSHClient (host) {
        const hasClient = this.sshClients.has(host);
        if (!hasClient) {
            // 从缓存中获取之前的连接参数（若有），若无则用默认值
            const { username = 'root', password = '0penBmc', port = 22 } = this.connectionConfig.get(host) || {};
            // 复用缓存的参数重新连接，而非只传 host
            const result = await this.connectServer(host, username, password, port);
            if (!result.success) {
                throw new Error(`Failed to connect to ${host}: ${result.message}`);
            }
            return result.client;
        }
        return this.sshClients.get(host);
    }

    // 断开服务器连接
    async disconnectServer (host) {
        try {
            const sshClient = this.sshClients.get(host);
            if (sshClient) {
                await sshClient.end();
                this.sshClients.delete(host);
                this.connectionConfig.delete(host); // 断开时清除参数缓存
            }
            return { success: true, message: 'Disconnected' };
        } catch (error) {
            return { success: false, message: `Disconnect failed: ${error.message}` };
        }
    }

    // 生成会话ID
    generateSessionId (host, type, remotePath, localPath) {
        const data = `${host}-${type}-${remotePath}-${localPath}-${Date.now()}`;
        return Buffer.from(data).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }


    /**************************************************************
     * 单个文件SCP下载（支持断点续传，修复协议交互流程）
     * @param {import('ssh2').Client} conn - SSH连接实例（已认证）
     * @param {string} remoteFile - 远程文件绝对路径
     * @param {string} localFile - 本地文件绝对路径
     * @param {number} fileSize - 文件总大小（字节）
     * @param {number} startOffset - 开始传输的偏移量（默认 0）
     * @param {Function} [onProgress] - 进度回调
     * @returns {Promise<void>}
     **************************************************************/
    async downloadFile (conn, remoteFile, localFile, onProgress) {
        let scpClient = new SCPClient(conn, remoteFile, localFile);
        await scpClient.downloadFile(onProgress);
    }


    /**************************************************************
     * 文件夹SCP下载（支持断点续传+进度回调）
     * @param {string} host -- SSH服务器地址
     * @param {string} remoteDir - 远程文件夹路径
     * @param {string} localDir - 本地文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     **************************************************************/
    async downloadDir (host, remoteDir, localDir, onProgress) {
        let recvFiles = 0;
        let totalFiles = 0;
        let recvBytes = 0;
        let totalBytes = 0;
        let currentFile = "";
        try {
            let conn = await this.getSSHClient(host);
            const { files: remoteFiles, totalBytes: totalBytes } = await this.scanRemoteDir(conn, remoteDir);
            const { files: localFiles } = fs.existsSync(localDir)
                ? await this.scanLocalDir(localDir)
                : { files: [], totalBytes: 0 };

            const needDownloadFiles = this.filterNeedTransferFiles(remoteFiles, localFiles);
            totalFiles = needDownloadFiles.length;

            if (totalFiles === 0) {
                onProgress?.({
                    status: 0,
                    progress: 100,
                    remoteFile: currentFile,
                    recvFiles: 0,
                    totalFiles: 0,
                    recvBytes: totalBytes,
                    totalBytes: totalBytes,

                });
                Print.debug('所有文件已下载完成，无需继续传输');
                return;
            }
            for (const file of needDownloadFiles) {
                const { path: remoteFile, size: fileSize, relPath } = file;
                const localFile = path.join(localDir, relPath); // 本地路径用系统格式
                // 下载文件（带单文件进度回调）
                await this.downloadFile(conn, remoteFile, localFile, (fileProgress) => {
                    onProgress?.({
                        status: 0,
                        progress: Math.round((recvBytes / totalBytes) * 100),
                        remoteFile: remoteFile,
                        recvFiles: recvFiles,
                        totalFiles: totalFiles,
                        recvBytes: recvBytes + fileProgress.recvBytes,
                        totalBytes: totalBytes,
                    });
                });
                // 单个文件下载完成
                recvBytes += fileSize;
                recvFiles += 1;
                onProgress?.({
                    status: 0,
                    progress: Math.round((recvBytes / totalBytes) * 100),
                    remoteFile: remoteFile,
                    recvFiles: recvFiles,
                    totalFiles: totalFiles,
                    recvBytes: recvBytes + fileSize,
                    totalBytes: totalBytes,
                });
            }
        } catch (err) {
            onProgress?.({
                status: -1,
                progress: totalBytes == 0 ? 0 : Math.round((recvBytes / totalBytes) * 100),
                remoteFile: currentFile,
                recvFiles: recvFiles,
                totalFiles: totalFiles,
                recvBytes: recvBytes,
                totalBytes: totalBytes,
            });
            console.log(err.message);
            throw err; // 抛出错误，让调用方处理
        }
    }

    /**************************************************************
     * 扫描本地文件夹，获取文件列表、大小和相对路径
     * @param {string} localDir - 本地文件夹路径
     * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
     **************************************************************/
    async scanLocalDir (localDir) {
        const files = [];
        const dirs = [];
        const dirSet = new Set();
        let totalBytes = 0;

        async function traverse (dir) {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.relative(localDir, fullPath).replace(/\\/g, '/'); // 统一为POSIX路径

                    if (entry.isDirectory()) {
                        dirSet.add(fullPath);
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
        dirs.push(...dirSet);
        return { files, dirs, totalBytes };
    }



    /**************************************************************
     * @todo 扫描远程文件夹，获取文件列表、大小和相对路径（兼容 BusyBox 无find环境）
     * @param {import('ssh2').Client} conn - SSH连接实例
     * @param {string} remoteDir - 远程文件夹路径（绝对路径）
     * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
     **************************************************************/
    async scanRemoteDir (conn, remoteDir) {
        const files = [];
        const dirs = [];
        const dirSet = new Set();
        let totalBytes = 0;
        // 标准化远程目录（确保结尾无斜杠，避免路径拼接重复）
        const normalizedRemoteDir = remoteDir.replace(/\/$/, '');
        try {
            // BusyBox 兼容的 ls 命令：-l（详细信息）、-R（递归）、-A（显示隐藏文件，不含.和..）
            const lsCmd = `ls -lRA "${normalizedRemoteDir}" 2>/dev/null`;
            const { stdout, stderr } = await new Promise((resolve, reject) => {
                conn.exec(lsCmd, (err, stream) => {
                    if (err) return reject(new Error(`执行远程ls命令失败: ${err.message}`));

                    let stdout = '';
                    let stderr = '';
                    stream.on('data', (data) => { stdout += data.toString(); });
                    stream.on('stderr', (data) => { stderr += data.toString(); stream.close(); });
                    stream.on('close', code => {
                        if (code === 0) {
                            return resolve({ stdout, stderr });
                        } else if (code === 2) {
                            return resolve({ stdout: '', stderr: '' });
                        } else {
                            Print.error('ls 异常退出码:', code, 'stderr:', errBuf);
                            return reject(new Error(`远程命令流错误: ${err.message}`))
                        }
                    });
                    stream.on('error', (err) => reject(new Error(`远程命令流错误: ${err.message}`)));
                });
            });
            if (!stdout) return { files, dirs, totalBytes };

            const lines = stdout.split('\n').filter(line => line.trim());
            let currentAbsDir = normalizedRemoteDir; // 记录当前递归的绝对目录

            // BusyBox ls -l 输出格式示例:
            // /usr/share/www/fonts:  <--- 目录
            // 总计 140               <--- 统计行
            // 权限        链接数  所有者    组     大小    月     日    时间    文件名
            // -rw-r--r--  1      root     root   1234    Jan    1    10:00   test.txt                      <--- 英文文件行
            // drwxr-xr-x  2      root     root   4096    Jan    2    11:00   subdir
            // -rwxrw-rw-  1      ofix     ofix   55956   11月   26   20:33   element-icons.f1a45d74.ttf    <--- 中文文件行
            // 正则解析：匹配权限、链接数、所有者、组、大小、时间、文件名（兼容空格文件名）
            // 注意事项：兼容 英文月份(Jan/Feb)、中文月份(11月/3月)、多语言所有者/组名、带空格文件名
            const fileLineRegex = /^([-dlrwx@]+)\s+(\d+)\s+([^\s:]+(?:\s+[^\s:]+)?)\s+([^\s:]+(?:\s+[^\s:]+)?)\s+(\d+)\s+([A-Za-z]{3}|\d{1,2}[月年月])\s+(\d{1,2})\s+(\d{2}:\d{2}|\d{4})\s+(.*)$/;

            for (const line of lines) {
                // 1. 匹配目录行（格式：/path/to/dir:）
                if (line.endsWith(':')) {
                    currentAbsDir = line.slice(0, -1).trim(); // 去除末尾 ":"，得到当前目录绝对路径
                    dirSet.add(currentAbsDir);
                    continue;
                }

                // 2. 匹配文件行（跳过目录行和无效行）
                const fileMatch = line.match(fileLineRegex);
                if (!fileMatch) continue;

                const [, , , , , sizeStr, , , , fileName] = fileMatch;
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
            dirs.push(...dirSet);
            Print.debug(`扫描完成，共找到 ${files.length} 个文件，总字节数 ${totalBytes}`);
            return { files, dirs, totalBytes };
        } catch (err) {
            Print.error(err.message);
            throw new Error(`扫描远程文件夹失败: ${err.message}`);
        }
    }


    /**************************************************************
     * 过滤需要传输的文件（断点续传核心）
     * @param {Object[]} sourceFiles - 源文件列表（含path/size/relPath）
     * @param {Object[]} targetFiles - 目标文件列表（含path/size/relPath）
     * @returns {Object[]} 需要传输的源文件列表
     **************************************************************/
    filterNeedTransferFiles (sourceFiles, targetFiles) {
        const targetMap = new Map();
        targetFiles.forEach(file => targetMap.set(file.relPath, file.size));

        // 2. 过滤逻辑：覆盖「本地无文件、文件不存在、传输中断、文件更新」场景
        return sourceFiles.filter(sourceFile => {
            const targetFile = targetMap.get(sourceFile.relPath);

            // 场景1：本地文件夹不存在 / 目标文件不存在 → 必须传输
            if (!targetFile) {
                return true;
            }

            // 场景2：源文件大小 ≠ 目标文件大小 → 传输中断/文件损坏/源文件更新，需传输
            if (sourceFile.size !== targetFile.size) {
                return true;
            }

            // 场景3：文件大小一致 + （可选）修改时间一致 → 已传输完成，无需重复传输
            return false;
        });
    }

    /**************************************************************
     * 修复：确保读取到完整响应（处理分块传输）
     * @param {import('stream').Duplex} stream - SSH 通道流
     * @returns {Promise<{ status: number; message: string }>}
     **************************************************************/
    readScpResponse (stream) {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);
            const onData = (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                Print.debug(`[SCP] 读取响应: ${buffer.toString('hex')}`);
                if (buffer[0] == 0) {
                    stream.off('data', onData); // 移除监听器,防止重复触发
                    stream.off('error', onErr);
                    // 消费掉第一个字节 0x00，把剩余字节 原样回灌 到数据流
                    const rest = buffer.subarray(1);
                    if (rest.length > 0) {
                        stream.unshift(rest);
                    }
                    resolve({ status: 0, message: "success" });
                } else {
                    Print.debug(`[SCP] +++++ 读取错误响应: ${buffer.toString('utf-8')}`);
                    stream.off('data', onData); // 移除监听器,防止重复触发
                    stream.off('error', onErr);
                }
            }
            const onErr = (err) => {
                console.log("服务器出错！", err.message.toString());
                reject(new Error(`读取响应错误: ${err.message.toString()}`));
            }
            // 2. 持续监听数据，直到读取到完整响应
            stream.on('data', onData).once('error', onErr);
        });
    }

    /**
     * 文件夹SCP上传（支持断点续传+进度回调）
     * @param {string} host - 远程主机
     * @param {string} localDir - 本地文件夹路径
     * @param {string} remoteDir - 远程文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     */
    async uploadDir (host, localDir, remoteDir, onProgress) {
        let conn = null;
        let totalProgress = 0;
        try {
            const { files: localFiles, dirs: localDirs, totalBytes: totalBytes } = await this.scanLocalDir(localDir);
            conn = await this.getSSHClient(host);
            const { files: remoteFiles, dirs: remoteDirs } = await this.scanRemoteDir(conn, remoteDir);

            let missingRemoteDirs = Utils.getMissingDirs(localDir, localDirs, remoteDir, remoteDirs);
            Print.debug(missingRemoteDirs);

            const needTransferFiles = this.filterNeedTransferFiles(localFiles, remoteFiles);
            const totalFiles = needTransferFiles.length;
            let transferredFiles = 0;
            let totalTransferredBytes = 0;

            if (totalFiles === 0) {
                onProgress?.({
                    status: 0,
                    progress: 100,
                    localFile: "",
                    sendFiles: 0,
                    totalFiles: 0,
                    sendBytes: totalBytes,
                    totalBytes: totalBytes,
                });
                Print.log('所有文件已上传完成，无需继续传输');
                return;
            }
            // 创建远程目录
            await new Promise((resolve, reject) => {
                let manyDirs = missingRemoteDirs.map(p => `'${p.replace(/'/g, "'\\''")}'`).join(' ');
                conn.exec(`mkdir -p ${manyDirs}`, (err) => {
                    if (err) reject(new Error(`创建远程目录失败: ${err.message}`));
                    else resolve();
                });
            });
            // 6. 逐个上传文件
            for (const file of needTransferFiles) {
                const { path: localFile, size: fileSize, relPath } = file;
                const remoteFile = path.posix.join(remoteDir, relPath); // 远程路径用POSIX格式
                // 上传文件（带单文件进度回调）
                await this.uploadFile(conn, localFile, remoteFile, (fileProgress) => {
                    // 累计总传输字节数
                    const fileSendBytes = fileProgress.sendBytes;
                    const sendBytes = totalTransferredBytes + fileSendBytes;
                    totalProgress = 20 + Math.round((sendBytes / totalBytes) * 70);
                    onProgress?.({
                        status: 0,
                        progress: totalProgress,
                        localFile: localFile,
                        sendFiles: transferredFiles,
                        totalFiles: totalFiles,
                        sendBytes: sendBytes,
                        totalBytes: totalBytes,
                    });
                });

                // 更新统计
                transferredFiles++;
                totalTransferredBytes += fileSize;
            }

            // 最终进度
            onProgress?.({
                status: 0,
                progress: 100,
                localFile: "",
                sendFiles: transferredFiles,
                totalFiles: totalFiles,
                sendBytes: totalBytes,
                totalBytes: totalBytes,
            });
            console.log(`文件夹上传完成：${localDir} → ${remoteDir}`);
        } catch (err) {
            onProgress?.({ status: -1, percent: totalProgress });
            throw err; // 抛出错误，让调用方处理
        } finally {
            // 关闭SSH连接
            if (conn && !conn._sock?.destroyed) {
                conn.end();
            }
        }
    }


    /**
    * 单个文件SCP上传（支持断点续传）
    * @param {import('ssh2').Client} conn - SSH连接实例
    * @param {string} localFile - 本地文件路径
    * @param {string} remoteFile - 远程文件路径
    * @param {ProgressCallback} [onProgress] - 进度回调（单文件）
    * @returns {Promise<void>}
    */
    async uploadFile (conn, localFile, remoteFile, onProgress) {
        return new Promise((resolve, reject) => {
            // 执行远程scp接收命令（-t=to，接收文件）
            conn.exec(`scp -t "${remoteFile}"`, (err, stream) => {
                if (err) return reject(new Error(`创建上传通道失败: ${err.message}`));
                let bytesTransferred = 0; // 已传输字节数（含断点偏移）
                let fileSize = 0;
                const stderr = [];
                // 1. 读取服务器初始响应
                this.readScpResponse(stream)
                    .then(async ({ status, message }) => {
                        if (status !== 0) throw new Error(`服务器响应错误: ${message}`);

                        // 2. 发送文件元信息（C0644 权限 + 大小 + 文件名）
                        const fileName = path.basename(remoteFile);

                        // 修复后：加换行符 + 特殊文件名用双引号包裹
                        const safeFileName = fileName.includes('-') || fileName.includes(' ')
                            ? `"${fileName}"`  // 包含特殊字符则包裹
                            : fileName;

                        const stats = await fs.promises.stat(localFile);
                        fileSize = stats.size;
                        Print.debug("\n\n");
                        Print.debug(`发送文件元信息：C0644 ${fileSize} ${safeFileName}`);
                        stream.write(`C0644 ${fileSize} ${safeFileName}\n`, 'utf-8');
                        // 3. 读取元信息响应
                        return this.readScpResponse(stream);
                    })
                    .then(async ({ status, message }) => {
                        if (status !== 0) throw new Error(`元信息发送失败: ${message}`);

                        // 4. 发送文件数据（从断点偏移开始）
                        // 同步方法：fs.createReadStream（核心修复）
                        const readStream = fs.createReadStream(localFile, { start: 0 });
                        Print.debug(`+++ 文件${localFile}开始上传 +++`);
                        readStream.on('data', (chunk) => {
                            // 优化：控制写入流速，避免缓冲区溢出（源码中 Channel 有窗口控制机制）
                            const canWrite = stream.write(chunk);
                            if (!canWrite) {
                                readStream.pause(); // 缓冲区满了，暂停读流
                            }
                            Print.debug(`+++ 文件${localFile}已发送${chunk.length}字节 +++`);
                            bytesTransferred += chunk.length;
                            onProgress?.({
                                sendBytes: bytesTransferred,
                                totalBytes: fileSize,
                                progress: Math.round((bytesTransferred / fileSize) * 100),
                                status: 0
                            });

                        });
                        // 关键：通道流缓冲区清空后，恢复读流（避免数据积压）
                        stream.on('drain', () => {
                            readStream.resume();
                        });
                        // 补充：本地读流出错时，立即清理通道
                        readStream.on('error', (err) => {
                            Print.error(`读取本地文件失败: ${err.message}`);
                            readStream.destroy();
                            stream.close();
                            reject(err);
                        });

                        // 补充：通道出错时，清理本地读流
                        stream.on('error', (err) => {
                            Print.error(`通道异常: ${err.message}`);
                            readStream.destroy();
                            reject(err);
                        });
                        readStream.on('end', () => {
                            Print.debug(`+++ 文件${localFile}发送完成，等待服务器响应！+++`);
                            // 步骤1：发送 SCP 终止符（空包，告诉服务器数据传输结束）
                            stream.write(Buffer.from([0]), (writeErr) => {
                                if (writeErr) {
                                    Print.error(`发送终止符失败: ${writeErr.message}`);
                                    readStream.destroy();
                                    stream.destroy(); // 直接销毁通道
                                    return reject(writeErr);
                                }
                                this.readScpResponse(stream).then(({ status, message }) => {
                                    if (status == 0) {
                                        readStream.destroy();
                                        // 步骤4：关闭 Channel 通道（向服务器发 CHANNEL_CLOSE）
                                        stream.close();
                                        // 步骤5：监听通道关闭确认，确保资源释放后再 resolve
                                        stream.once('close', (code) => {
                                            Print.debug(`通道已彻底关闭，文件上传完成`);
                                            resolve();
                                        });
                                    } else {
                                        // 上传失败，立即清理
                                        readStream.destroy();
                                        stream.close();
                                        reject(new Error(`文件上传失败: ${message}`));
                                    }
                                });

                            });
                        });
                        readStream.resume();
                    })
                    .catch((err) => {
                        // 捕获响应读取异常，避免资源泄漏
                        readStream.destroy();
                        stream.destroy();
                        reject(err);
                    });
            });
        });
    }
}

export default SFTPService;