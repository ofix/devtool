import { EventEmitter } from "events";
import Utils from "../core/Utils.js";
import { Client } from "ssh2";
import fs from "fs"; // 核心修复：直接导入完整 fs 模块（含同步+异步）
import path from "path";
import Print from "../core/Print.js";
import FileTree from "../core/FileTree.js";
import { FileNodeType } from "../core/FileNodeType.js";
import mmap from 'mmap-io';
// import Client from 'ssh2-sftp-client';

class SFTPService extends EventEmitter {
    static instance = null;

    constructor() {
        if (SFTPService.instance) {
            throw new Error('请通过 SFTPService.create() 创建单例实例');
        }
        super();
        this.sshClients = new Map(); // host -> SFTP client
        this.connectionConfig = new Map(); // 新增：host -> 连接参数（username/password/port）
        this.connectionStatus = new Map(); // host → 连接状态（true=有效）
        this.transferSessions = new Map(); // sessionId -> transfer session
        this.activeTransfers = new Map(); // host -> active transfers
        this.stateDir = "";
        this.fileTree = new FileTree();
        Print.level = 7;
    }

    async init() {
        this.stateDir = await Utils.sftpDownloadMetaDir();
    }

    static async create(...config) {
        if (SFTPService.instance) {
            SFTPService.instance.setConfig(...config);
            return SFTPService.instance;
        }
        const service = new SFTPService();
        await service.init();
        await service.setConfig(...config);
        SFTPService.instance = service;
        return service;
    }

    static destroy() {
        SFTPService.instance = null;
    }

    /**
     * 设置连接配置（兼容两种传参方式）
     * 方式 1：按顺序传参 → setConfig(host, username, password, port)
     * 方式 2：传入对象 → setConfig({ host, username, password, port })
     */
    async setConfig(...args) {
        let host,
            username = "root",
            password = "0penBmc",
            port = 22,
            remotePath = "",
            localPath = "";
        if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
            const config = args[0];
            if (!config.host) {
                throw new Error("配置对象必须包含 host 属性（服务器 IP/域名）");
            }
            host = config.host;
            username = config.username || username;
            password = config.password || password;
            port = config.port || port;
            localPath = await Utils.sftpLocalDir(config.host);
            remotePath = config.remotePath;
        } else if (args.length >= 1) {
            host = args[0];
            username = args[1] || username;
            password = args[2] || password;
            port = args[3] || port;
            localPath = await Utils.sftpLocalDir(config.host);
            remotePath = config.remotePath;
        } else {
            throw new Error(
                "传参错误！支持：1. 传入配置对象 {host, username, password, port}；2. 按顺序传参 (host, username?, password?, port?)"
            );
        }
        port = Number(port) || 22;

        let config = { host, username, password, port, localPath, remotePath };
        this.connectionConfig.set(host, config);
        console.log(`已保存 ${host} 的连接配置：`, { username, password, port });
        return config;
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
    async connectServer(
        host,
        username = "root",
        password = "0penBmc",
        port = 22,
        localPath = "",
        remotePath = "",
    ) {
        // 🔧 改进点5：参数验证
        if (!host || typeof host !== "string") {
            throw new Error("host参数必须是非空字符串");
        }

        try {
            // 检查现有活跃连接
            const existingClient = this.sshClients.get(host);
            if (existingClient && this.isConnectionAlive(existingClient)) {
                Print.debug(`复用现有SSH连接: ${host}`);
                return {
                    success: true,
                    message: "Using existing connection",
                    client: existingClient,
                };
            }

            Print.debug(`\n连接SSH服务器: ${username}@${host}:${port}`);
            const sshClient = new Client();
            // 使用Promise.race实现超时控制
            const connectionResult = await Promise.race([
                this.newSSHConnection(sshClient, { host, port, username, password }),
                this.createTimeout(15000, `SSH连接超时（15秒）: ${host}`),
            ]);

            // 缓存新连接
            this.sshClients.set(host, sshClient);
            this.connectionConfig.set(host, { username, password, port, localPath, remotePath });
            this.connectionStatus.set(host, true);
            Print.debug(`缓存SSH连接: ${host}`);
            Print.debug(`SSH连接成功: ${host}`);
            return {
                success: true,
                client: sshClient,
                message: "Connection established",
            };
        } catch (error) {
            return this.handleConnectionError(host, error);
        }
    }

    newSSHConnection(sshClient, config) {
        return new Promise((resolve, reject) => {
            sshClient.on("ready", () => {
                Print.debug("SSH认证成功");
                resolve(sshClient);
            });

            sshClient.on("error", (err) => {
                reject(new Error(`SSH错误: ${err.message}`));
            });

            sshClient.on("close", (hadError) => {
                if (hadError) {
                    reject(new Error("SSH连接异常关闭"));
                }
            });

            // 连接配置
            sshClient.connect({
                host: config.host,
                port: config.port,
                username: config.username,
                password: config.password,
                readyTimeout: 10000,
                strictHostKeyChecking: "no",
                debug: (message) => Print.debug(`[SSH2 Debug]: ${message}`),
                algorithms: {
                    cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr"],
                    serverHostKey: [
                        "ssh-rsa",
                        "ssh-dss",
                        "ssh-rsa",
                        "ecdsa-sha2-nistp256",
                    ],
                },
                hostVerifier: (key) => {
                    try {
                        const fingerprint = key.getFingerprint("sha256").toString("hex");
                        Print.debug(`服务器指纹: ${fingerprint}`);
                        return true;
                    } catch (err) {
                        Print.warn("指纹检查跳过");
                        return true;
                    }
                },
            });
        });
    }

    createTimeout(ms, message) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        });
    }

    // 🔧 改进点8：连接活性检查
    isConnectionAlive(client) {
        try {
            return client && typeof client === "object" && client.connected === true;
        } catch (error) {
            return false;
        }
    }

    handleConnectionError(host, error) {
        this.connectionStatus.set(host, false);

        const errorInfo = {
            success: false,
            message: error.message,
            host,
            timestamp: new Date().toISOString(),
        };

        // 根据错误类型提供更具体的消息
        if (error.message.includes("timed out")) {
            errorInfo.suggestion = "检查网络连接或增加超时时间";
        } else if (error.message.includes("Authentication failed")) {
            errorInfo.suggestion = "验证用户名和密码";
        } else if (error.message.includes("ENOTFOUND")) {
            errorInfo.suggestion = "检查主机名是否正确";
        }

        Print.error(`❌ SSH连接失败 [${host}]:`, error.message);
        return errorInfo;
    }

    getConfig(host) {
        return this.connectionConfig.get(host);
    }

    // 获取缓存的已打开连接的SSH2客户端
    async getSSHClient(host) {
        const hasClient = this.sshClients.has(host);
        if (!hasClient) {
            // 从缓存中获取之前的连接参数（若有），若无则用默认值
            const {
                username = "root",
                password = "0penBmc",
                port = 22,
                localPath = "",
                remotePath = "",
            } = this.connectionConfig.get(host) || {};
            // 复用缓存的参数重新连接，而非只传 host
            const result = await this.connectServer(host, username, password, port, localPath, remotePath);
            if (!result.success) {
                throw new Error(`Failed to connect to ${host}: ${result.message}`);
            }
            return result.client;
        }
        return this.sshClients.get(host);
    }

    // 断开服务器连接
    async disconnectServer(host) {
        try {
            const sshClient = this.sshClients.get(host);
            if (sshClient) {
                await sshClient.end();
                this.sshClients.delete(host);
                this.connectionConfig.delete(host); // 断开时清除参数缓存
            }
            return { success: true, message: "Disconnected" };
        } catch (error) {
            return { success: false, message: `Disconnect failed: ${error.message}` };
        }
    }

    // 生成会话ID
    generateSessionId(host, type, remotePath, localPath) {
        const data = `${host}-${type}-${remotePath}-${localPath}-${Date.now()}`;
        return Buffer.from(data)
            .toString("base64")
            .replace(/[^a-zA-Z0-9]/g, "");
    }


    /**
     * 直接写入内存映射文件
     * @param {string} host 远程文件服务器IP
     * @param {string} remoteFilePath
     * @param {Object} mmfHandle - { fd: number, map: mmap.Map } 内存映射文件对象
     * @param {number} startOffset - 文件偏移位置，始终为0
     * @param {Function} onProgress
     * @returns {Promise<{ success: boolean, fileSize: number }>}
     */
    async downloadToMMF(host, remoteFilePath, mmfHandle, startOffset = 0, onProgress) {
        return new Promise(async (resolve, reject) => {
            let conn = await this.getSSHClient(host);
            conn.exec(`scp -f '${remoteFilePath}'`, async (err, stream) => {
                if (err) return reject(new Error(`创建通道失败: ${err.message}`));

                try {
                    // SCP协议交互
                    await this._sendAckToScpServer(stream, "初始ACK");
                    const meta = await this._awaitScpServerFileInfo(stream, "获取元信息");
                    if (meta.status === -1) throw new Error("解析元信息失败");
                    const fileSize = meta.fileInfo.size;
                    await this._sendAckToScpServer(stream, "确认元信息");
                    // 直接写入MMF
                    await this.#writeToMMF(stream, mmfHandle.map, fileSize, startOffset, onProgress);
                    await this._sendAckToScpServer(stream, "关闭会话");
                    resolve({ success: true, fileSize });
                } catch (error) {
                    reject(error);
                } finally {
                    stream?.close();
                }
            });
        });
    }

    /**************************************************************
     * 单个文件SCP下载（支持断点续传，修复协议交互流程）
     * @param {import('ssh2').Client} conn - SSH连接实例（已认证）
     * @param {string} remoteFilePath - 远程文件绝对路径
     * @param {string} localFilePath - 本地文件绝对路径
     * @param {number} fileSize - 文件总大小（字节）
     * @param {number} startOffset - 开始传输的偏移量（默认 0）
     * @param {Function} [onProgress] - 进度回调
     * @returns {Promise<void>}
     **************************************************************/
    async downloadFile(conn, remoteFilePath, localFilePath, onProgress) {
        return new Promise(async (resolve, reject) => {
            // 文件路径必须用''包裹，否则$meta这种目录名会被默认展开，导致为空
            conn.exec(`scp -f '${remoteFilePath}'`, async (err, stream) => {
                if (err) {
                    return reject(new Error(`创建下载通道失败: ${err.message}`));
                }
                try {
                    await this._sendAckToScpServer(stream, "1.发送应答码给服务器");

                    const meta = await this._awaitScpServerFileInfo(
                        stream,
                        "等待服务器返回文件元信息"
                    );
                    if (meta.status == -1) {
                        throw new Error(`无法解析文件元信息`);
                    }

                    // 确认元数据接收，发送 ACK（0x00）
                    await this._sendAckToScpServer(stream, "2.发送应答码给服务器");

                    // 下载文件数据
                    await this._downloadFileInChunk(
                        stream,
                        localFilePath,
                        meta.fileInfo,
                        onProgress
                    );

                    // 终止会话并确认
                    await this._sendAckToScpServer(stream, "3.关闭会话,防止会话干扰");
                    resolve();
                } catch (error) {
                    Print.log(error);
                    reject(error);
                } finally {
                    stream?.close();
                }
            });
        });
    }

    /**
     * @todo 辅助方法：等待 SCP 服务器的文件元信息响应（SCP 协议：C 开头表示文件）
     * @param {Object} stream - SCP 命令流
     * @returns {Promise<{ status: number, fileInfo: Object }>} 元信息解析结果
     */
    async _awaitScpServerFileInfo(stream) {
        return new Promise((resolve, reject) => {
            const buffer = [];

            const onData = (data) => {
                const newlineIndex = data.indexOf(0x0a); // 0x0A = \n 的 ASCII 码
                if (newlineIndex === -1) {
                    buffer.push(data);
                    return;
                }

                const fullMetaBuffer = Buffer.concat([
                    ...buffer,
                    data.slice(0, newlineIndex + 1), // 包含换行符（协议要求完整元信息需带换行）
                ]);
                const scpFileInfo = fullMetaBuffer.toString("utf8");

                // 处理当前 chunk 中换行符后的冗余数据（关键：避免数据丢失）
                const remainingData = data.slice(newlineIndex + 1);
                if (remainingData.length > 0) {
                    // 把冗余数据重新注入流（后续数据处理逻辑会接收）
                    stream.unshift(remainingData);
                }

                // 移除所有事件监听（防止重复触发/内存泄漏）
                cleanupListeners();

                // 协议类型判断与解析
                switch (scpFileInfo[0]) {
                    case "C": // 文件类型（SCP 协议大小写不敏感，部分服务器返回小写 'c'）
                    case "c": {
                        try {
                            const fileInfo = this._parseFileInfo(scpFileInfo);
                            resolve({ status: 0, fileInfo });
                        } catch (parseErr) {
                            reject({
                                status: -1,
                                message: `解析文件元信息失败：${parseErr.message}`,
                            });
                        }
                        break;
                    }
                    case "D":
                    case "d":
                        reject({
                            status: -1,
                            message: "不支持文件夹类型（当前仅支持文件下载）",
                        });
                        break;
                    default:
                        reject({
                            status: -1,
                            message: `不支持的 SCP 数据类型：${scpFileInfo[0]}`,
                        });
                        break;
                }
            };

            // 错误处理：服务器返回 stderr（如文件不存在、权限不足）
            const onStderr = (errData) => {
                cleanupListeners();
                reject({
                    status: -1,
                    message: `服务器错误：${errData.toString("utf8").trim()}`,
                });
            };

            // 超时处理
            const onTimeout = () => {
                cleanupListeners();
                reject({ status: -1, message: "等待服务器文件元信息超时" });
            };

            // 移除所有事件监听的工具函数（避免内存泄漏）
            const cleanupListeners = () => {
                stream.off("data", onData);
                stream.off("stderr", onStderr);
                stream.off("timeout", onTimeout);
            };

            // 注册事件监听
            stream.on("data", onData);
            stream.on("stderr", onStderr);
            stream.on("timeout", onTimeout);
        });
    }

    /**************************************************************
     * @todo   解析SCP服务器返回的文件元信息
     * @notice 格式: C0644 1234 filename.txt\n
     **************************************************************/
    _parseFileInfo(scpHeader) {
        const match = scpHeader.match(/^C([0-7]{4})\s+(\d+)\s+([^\n]+)\n$/);
        if (!match) {
            throw new Error(`无法解析文件信息: ${scpHeader}`);
        }
        return {
            mode: parseInt(match[1], 8), // 八进制转十进制
            size: parseInt(match[2], 10),
            name: match[3].trim(),
        };
    }

    /**
     * 辅助方法：分块下载文件数据并写入本地
     * @param {Object} stream - SCP 命令流
     * @param {string} localFile - 本地保存路径
     * @param {Object} fileInfo - 文件信息（含 size/name 等）
     * @param {Function} onProgress - 进度回调（{ status, progress, recvBytes, totalBytes, filename }）
     */
    async _downloadFileInChunk(stream, localFile, fileInfo, onProgress) {
        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(localFile, { flags: "w" });
            let recvFileBytes = 0; // 已写入磁盘的字节数
            const totalFileSize = fileInfo.size;
            const progressCallback =
                typeof onProgress === "function" ? onProgress : () => { };
            // 写入失败：直接 reject
            writeStream.on("error", (err) => {
                cleanup();
                reject(new Error(`写入本地文件失败: ${err.message}`));
            });

            // 所有数据写入完成：resolve（真正的下载完成）
            writeStream.on("finish", () => {
                cleanup();
                resolve();
            });

            // 缓冲区清空：恢复流读取（核心 drain 处理）
            writeStream.on("drain", () => {
                stream.resume(); // 恢复接收服务器数据
            });

            Print.debug("文件总大小: ", totalFileSize);
            const onData = (chunk) => {
                try {
                    // 优先处理 SCP 协议的结束标识（关键：独立数据包的 0x00）
                    if (
                        recvFileBytes >= totalFileSize &&
                        chunk.length === 1 &&
                        chunk[0] === 0x00
                    ) {
                        Print.debug("收到 SCP 结束标识（0x00），终止数据接收");
                        handleEndMarker(chunk);
                        return;
                    }
                    const needWrite = Math.min(
                        chunk.length,
                        totalFileSize - recvFileBytes
                    );
                    // 同步更新已接收字节数（关键：接收后立即更新，避免异步回调延迟）
                    recvFileBytes += needWrite;
                    Print.debug(
                        "当前分块大小：",
                        chunk.length,
                        "接收字节 = ",
                        recvFileBytes
                    );

                    if (needWrite > 0) {
                        // 计算需写入的字节数（避免超出总大小）
                        let writeData = null;
                        let remaining = null;
                        if (needWrite != chunk.length) {
                            writeData = chunk.slice(0, needWrite);
                            remaining = chunk.slice(needWrite); // 超出部分（可能含结束标识）
                        } else {
                            writeData = chunk;
                        }
                        let canWrite = writeStream.write(writeData, (err) => {
                            if (err) {
                                Print.error(`块写入失败:`, err.message);
                                return;
                            }
                            updateProgress();
                            // 处理剩余数据（回注到流中，下次 onData 处理）
                            if (remaining != null && remaining.length > 0) {
                                Print.log("处理剩余数据：", remaining.length);
                                stream.unshift(remaining);
                            }
                        });
                        // 缓冲区满：暂停流，避免数据堆积
                        if (!canWrite) {
                            stream.pause(); // 暂停接收服务器数据
                        }
                    }
                } catch (e) {
                    Print.error(e);
                }
            };

            // -------------------------- 辅助函数 --------------------------
            // 处理服务器的 0x00 结束标识
            const handleEndMarker = (chunk) => {
                if (chunk[0] === 0x00) {
                    Print.log("[DEBUG] 收到服务器结束标识，关闭写入流");
                    writeStream.end(); // 否则文件写入流一直处于可写入状态，触发 finish 事件
                } else {
                    reject(
                        new Error(
                            `数据传输异常：预期结束标识（0x00），实际收到 0x${chunk[0].toString(16)}`
                        )
                    );
                    cleanup();
                }
            };

            // 更新进度回调
            const updateProgress = () => {
                const progress =
                    totalFileSize > 0
                        ? Math.min((recvFileBytes / totalFileSize) * 100, 100).toFixed(1)
                        : "100.0";
                progressCallback({
                    status: 0,
                    progress: `${progress}%`,
                    recvBytes: recvFileBytes,
                    totalBytes: totalFileSize,
                    filename: fileInfo.name || path.basename(localFile),
                });
            };

            // 清理资源（避免内存泄漏）
            const cleanup = () => {
                stream.off("data", onData);
                stream.off("timeout", onTimeout);
                stream.off("error", onStreamError);
                stream.off("close", onStreamClose);
                writeStream.destroy(); // 销毁写入流
            };

            // -------------------------- 异常处理 --------------------------
            const onTimeout = () => {
                reject(
                    new Error(
                        `文件下载超时（已接收 ${recvFileBytes}/${totalFileSize} 字节）`
                    )
                );
                cleanup();
            };

            const onStreamError = (err) => {
                reject(new Error(`SCP 流异常: ${err.message}`));
                cleanup();
            };

            const onStreamClose = (code) => {
                reject(
                    new Error(
                        `SCP 流异常关闭（已接收 ${recvFileBytes}/${totalFileSize} 字节，退出码: ${code}`
                    )
                );
                cleanup();
            };

            // -------------------------- 注册监听 --------------------------
            stream.on("data", onData);
            stream.on("timeout", onTimeout);
            stream.on("error", onStreamError);
            stream.on("close", onStreamClose);
        });
    }


    /**
     * SCP数据流->内存映射文件
     * @private
     * @param {Object} stream - SCP命令流（ssh2的exec stream，已完成元信息交互）
     * @param {Object} mmfHandle -  mmap-io内存映射句柄（来自MMFManager的缓存，包含buffer/size等）
     * @param {number} totalSize - 文件总大小（从元信息获取）
     * @param {number} startOffset - 开始写入的偏移量（断点续传用）
     * @param {Function} onProgress - 进度回调（{ status, progress, recvBytes, totalBytes, filename }）
     * @returns {Promise<void>}
     */
    async #writeToMMF(stream, mmfHandle, totalSize, startOffset = 0, onProgress) {
        return new Promise((resolve, reject) => {
            let recvFileBytes = startOffset; // 已写入MMF的字节数
            let isFinished = false; // 标记传输完成
            let isClosed = false; // 标记流已关闭
            const filename = `MMF_${startOffset}_${totalSize}`;
            const view = new Uint8Array(mmfHandle.buffer);

            // 进度回调兜底
            const progressCallback = (opts) => {
                if (typeof onProgress === "function") {
                    try { onProgress(opts); } catch (e) { Print.error(`进度回调异常: ${e.message}`); }
                }
            };

            /**
             * 核心：直接写入数据到MMF（零拷贝，适配mmap-io）
             * @param {Buffer} chunk - 待写入的纯文件数据
             * @returns {number} 实际写入的字节数
             */
            const writeToMMF = (chunk) => {
                // 计算可写入的字节数（防越界，避免写入结束标记）
                const remainingSize = totalSize - recvFileBytes;
                if (remainingSize <= 0) return 0;

                const writeSize = Math.min(chunk.length, remainingSize);
                if (writeSize <= 0) return 0;

                // mmap-io不支持动态扩容，提前校验是否超出预分配大小（必须预分配≥totalSize）
                if (recvFileBytes + writeSize > mmfHandle.size) {
                    throw new Error(`[SCP-MMF] MMF预分配大小不足（${mmfHandle.size} 字节），无法写入 ${recvFileBytes + writeSize} 字节`);
                }

                // 零拷贝写入：Buffer → Uint8Array（直接操作映射区）
                view.set(chunk.subarray(0, writeSize), recvFileBytes);

                // 可选：每写入一定量数据刷盘（避免脏页过多，按需开启）
                if (recvFileBytes % (8192 * 4) === 0) { // 每32KB刷一次
                    try {
                        mmap.flush(mmfHandle.buffer);
                        Print.debug(`[SCP-MMF] 刷盘偏移 ${recvFileBytes} 字节成功`);
                    } catch (flushErr) {
                        Print.warn(`[SCP-MMF] 刷盘偏移 ${recvFileBytes} 字节失败: ${flushErr.message}`);
                    }
                }

                // 更新已接收字节数
                recvFileBytes += writeSize;

                // 进度回调
                const progress = Math.min((recvFileBytes / totalSize) * 100, 100).toFixed(1);
                progressCallback({
                    status: 0,
                    progress: `${progress}%`,
                    recvBytes: recvFileBytes,
                    totalBytes: totalSize,
                    filename
                });

                return writeSize;
            };

            /**
             * 校验结束标记并完成传输
             * @param {Buffer} chunk - 待校验的chunk
             * @returns {boolean} - 是否是结束标记
             */
            const checkEndMarker = (chunk) => {
                if (recvFileBytes >= totalSize) {
                    if (chunk.length === 1 && chunk[0] === 0x00) {
                        Print.log(`[SCP-MMF] 收到SCP结束标记（0x00），传输完成（总接收: ${recvFileBytes}/${totalSize} 字节）`);
                        isFinished = true;
                        // 发送ACK确认（SCP协议要求：接收完每个数据块后发0x00）
                        stream.write(Buffer.alloc(1, 0x00), (err) => {
                            if (err) {
                                Print.error(`[SCP-MMF] 发送ACK失败: ${err.message}`);
                                reject(new Error(`发送SCP ACK失败: ${err.message}`));
                                cleanup();
                            }
                        });
                        // 最终刷盘：确保所有数据落盘
                        try {
                            mmap.flush(mmfHandle.buffer);
                            Print.debug(`[SCP-MMF] 传输完成，最终刷盘成功`);
                        } catch (flushErr) {
                            Print.error(`[SCP-MMF] 最终刷盘失败: ${flushErr.message}`);
                        }
                        resolve();
                        cleanup();
                        return true;
                    } else {
                        reject(new Error(`[SCP-MMF] 数据传输异常：已接收完数据但收到非结束标记（长度: ${chunk.length}, 首字节: 0x${chunk[0]?.toString(16) || '空'}）`));
                        cleanup();
                        return true;
                    }
                }
                return false;
            };

            /**
             * 清理所有资源（防内存泄漏/句柄残留）
             */
            const cleanup = () => {
                if (isClosed) return;
                Print.debug("[SCP-MMF] 执行资源清理");
                stream.off("data", onData);
                stream.off("error", onStreamError);
                stream.off("close", onStreamClose);
                stream.off("drain", onStreamDrain);
                stream.off("timeout", onTimeout);
                isClosed = true;
                isFinished = true;
            };

            // 流错误处理
            const onStreamError = (err) => {
                if (isFinished) return;
                reject(new Error(`[SCP-MMF] SCP数据流异常: ${err.message}（已接收: ${recvFileBytes}/${totalSize} 字节）`));
                cleanup();
            };

            // 流关闭处理（异常关闭）
            const onStreamClose = (code) => {
                if (isFinished || isClosed) return;

                // 校验是否传输完成
                if (recvFileBytes === totalSize) {
                    // 最终刷盘
                    try {
                        mmap.flush(mmfHandle.buffer);
                    } catch (flushErr) {
                        Print.error(`[SCP-MMF] 流关闭时刷盘失败: ${flushErr.message}`);
                    }
                    Print.log(`[SCP-MMF] SCP流正常关闭（已接收: ${recvFileBytes}/${totalSize} 字节，退出码: ${code}）`);
                    isFinished = true;
                    resolve();
                } else {
                    reject(new Error(`[SCP-MMF] SCP流异常关闭：数据未传输完成（已接收: ${recvFileBytes}/${totalSize} 字节，退出码: ${code}）`));
                }
                cleanup();
            };

            // 流drain事件（恢复数据接收，流控核心）
            const onStreamDrain = () => {
                Print.debug("[SCP-MMF] 流缓冲区清空，恢复接收服务器数据");
                stream.resume();
            };

            // 流超时处理
            const onTimeout = () => {
                if (isFinished) return;
                reject(new Error(`[SCP-MMF] SCP数据传输超时（已接收: ${recvFileBytes}/${totalSize} 字节，超时时间: 30s）`));
                cleanup();
            };

            // 数据块写入内存映射文件
            const onData = (chunk) => {
                if (isFinished || isClosed) return;

                try {
                    // 优先校验结束标记（已接收完数据时）
                    if (checkEndMarker(chunk)) return;

                    // 直接写入MMF（适配mmap-io）
                    const writeSize = writeToMMF(chunk);

                    // 处理可能的剩余数据（仅当chunk包含结束标记时，极罕见）
                    if (writeSize < chunk.length) {
                        const remainingChunk = chunk.slice(writeSize);
                        Print.debug(`[SCP-MMF] 处理剩余数据（已达文件大小上限）: ${remainingChunk.length} 字节`);
                        // 校验剩余数据是否是结束标记
                        checkEndMarker(remainingChunk);
                    }

                    // 流控：如果MMF写入后流缓冲区满，暂停接收
                    if (!stream.writable) {
                        Print.debug("[SCP-MMF] 流不可写，暂停接收数据");
                        stream.pause();
                    }

                    // 发送ACK确认（SCP协议要求：接收完每个数据块后发0x00）
                    const ackSent = stream.write(Buffer.alloc(1, 0x00), (err) => {
                        if (err) {
                            Print.error(`[SCP-MMF] 发送ACK失败: ${err.message}`);
                            reject(new Error(`发送SCP ACK失败: ${err.message}`));
                            cleanup();
                        }
                    });

                    // 流控：ACK发送缓冲区满时暂停接收
                    if (!ackSent) {
                        Print.debug("[SCP-MMF] ACK发送缓冲区满，暂停接收数据");
                        stream.pause();
                    }

                } catch (e) {
                    Print.error(`[SCP-MMF] 数据写入MMF异常: ${e.message}`, e.stack);
                    reject(new Error(`SCP数据写入MMF失败: ${e.message}（已接收: ${recvFileBytes}/${totalSize} 字节）`));
                    cleanup();
                }
            };

            // 绑定流事件
            stream.on("data", onData);
            stream.on("error", onStreamError);
            stream.on("close", onStreamClose);
            stream.on("drain", onStreamDrain);
            stream.on("timeout", onTimeout);
            // 设置30s超时（可根据业务调整）
            stream.setTimeout(30000);
            // 初始进度回调（0%）
            progressCallback({
                status: 0,
                progress: "0.0%",
                recvBytes: recvFileBytes,
                totalBytes: totalSize,
                filename
            });
        });
    }

    /**************************************************************
     * 文件夹SCP下载（支持断点续传+进度回调）
     * @param {string} host -- SSH服务器地址
     * @param {string} remoteDir - 远程文件夹路径
     * @param {string} localDir - 本地文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     **************************************************************/
    async downloadDir(host, remoteDir, localDir, onProgress) {
        let recvFiles = 0;
        let totalFiles = 0;
        let recvBytes = 0;
        let totalBytes = 0;
        let currentFileAbsolutePath = "";
        try {
            let conn = await this.getSSHClient(host);
            const {
                files: remoteFiles,
                dirs: remoteDirs,
                totalBytes: totalBytes,
            } = await this.scanRemoteDir(conn, remoteDir);

            const { files: localFiles, dirs: localDirs } = fs.existsSync(localDir)
                ? await this.scanLocalDir(localDir)
                : { files: [], totalBytes: 0 };

            let missingLocalDirs = Utils.getMissingDirs(
                localDir,
                localDirs,
                remoteDir,
                remoteDirs
            );

            const needDownloadFiles = this.filterNeedTransferFiles(
                remoteFiles,
                localFiles
            );
            totalFiles = needDownloadFiles.length;

            // 创建本地目录
            await Utils.mkdirs(missingLocalDirs);

            if (totalFiles === 0) {
                onProgress?.({
                    status: 0,
                    progress: 100,
                    remoteFile: currentFileAbsolutePath,
                    recvFiles: 0,
                    totalFiles: 0,
                    recvBytes: totalBytes,
                    totalBytes: totalBytes,
                });
                Print.debug("所有文件已下载完成，无需继续传输");
                return;
            }
            for (const file of needDownloadFiles) {
                const { fullPath: remoteFileAbsolutePath, size: fileSize, relPath } = file;
                const localFileAbsolutePath = path.join(localDir, relPath); // 本地路径用系统格式
                // 下载文件（带单文件进度回调）
                await this.downloadFile(conn, remoteFileAbsolutePath, localFileAbsolutePath, (fileProgress) => {
                    onProgress?.({
                        status: 0,
                        progress: Math.round((recvBytes / totalBytes) * 100),
                        remoteFile: remoteFileAbsolutePath,
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
                    remoteFile: remoteFileAbsolutePath,
                    recvFiles: recvFiles,
                    totalFiles: totalFiles,
                    recvBytes: recvBytes + fileSize,
                    totalBytes: totalBytes,
                });
            }
        } catch (err) {
            onProgress?.({
                status: -1,
                progress:
                    totalBytes == 0 ? 0 : Math.round((recvBytes / totalBytes) * 100),
                remoteFile: currentFileAbsolutePath,
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
     * @todo 单个文件SCP上传 - 简洁版本
     **************************************************************/
    async uploadFile(conn, localFile, remoteFile, onProgress) {
        return new Promise((resolve, reject) => {
            conn.exec(`scp -t "${remoteFile}"`, async (err, stream) => {
                if (err) {
                    return reject(new Error(`创建上传通道失败: ${err.message}`));
                }
                let readStream = null;
                try {
                    // 1. 初始握手
                    await this._awaitScpServerAck(stream, "等待服务器SCP文件上传响应");

                    // 2. 发送文件元数据
                    const stats = await fs.promises.stat(localFile);
                    const fileName = path.basename(remoteFile);
                    const safeName = fileName.includes(" ") ? `"${fileName}"` : fileName;
                    stream.write(`C0644 ${stats.size} ${safeName}\n`);
                    await this._awaitScpServerAck(stream, "等待服务器确认");

                    // 3. 传输文件数据
                    await this._uploadFileInChunk(
                        stream,
                        localFile,
                        stats.size,
                        onProgress
                    );

                    // 4. 发送终止符并确认
                    await this._awaitUploadFinishAck(stream, "发送上传结束符");

                    resolve();
                } catch (error) {
                    console.log(error);
                    reject(error);
                } finally {
                    readStream?.destroy();
                    stream?.close();
                }
            });
        });
    }

    /**************************************************************
     * @todo SSH2 分块上传数据给服务器端
     **************************************************************/
    _uploadFileInChunk(stream, localFile, fileSize, onProgress) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(localFile);
            let transferred = 0;

            readStream.on("data", (chunk) => {
                if (!stream.write(chunk)) {
                    readStream.pause();
                }
                transferred += chunk.length;
                onProgress?.({
                    sendBytes: transferred,
                    totalBytes: fileSize,
                    progress: Math.round((transferred / fileSize) * 100),
                    status: 0,
                });
            });

            stream.on("drain", () => readStream.resume());
            readStream.on("end", resolve);
            readStream.on("error", reject);
            stream.on("error", reject);
        });
    }

    /**************************************************************
     * @todo 文件夹SCP上传（支持断点续传+进度回调）
     * @param {string} host - 远程主机
     * @param {string} localDir - 本地文件夹路径
     * @param {string} remoteDir - 远程文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     **************************************************************/
    async uploadDir(host, localDir, remoteDir, onProgress) {
        let conn = null;
        let totalProgress = 0;
        try {
            const {
                files: localFiles,
                dirs: localDirs,
                totalBytes: totalBytes,
            } = await this.scanLocalDir(localDir);
            conn = await this.getSSHClient(host);

            const { files: remoteFiles, dirs: remoteDirs } = await this.scanRemoteDir(
                conn,
                remoteDir
            );
            let missingRemoteDirs = Utils.getMissingDirs(
                localDir,
                localDirs,
                remoteDir,
                remoteDirs
            );
            Print.debug(missingRemoteDirs);
            const needTransferFiles = this.filterNeedTransferFiles(
                localFiles,
                remoteFiles
            );
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
                Print.log("所有文件已上传完成，无需继续传输");
                return;
            }
            // 创建远程目录
            await new Promise((resolve, reject) => {
                let manyDirs = missingRemoteDirs
                    .map((p) => `'${p.replace(/'/g, "'\\''")}'`)
                    .join(" ");
                conn.exec(`mkdir -p ${manyDirs}`, (err) => {
                    if (err) reject(new Error(`创建远程目录失败: ${err.message}`));
                    else resolve();
                });
            });
            // 6. 逐个上传文件
            for (const file of needTransferFiles) {
                const { fullPath: localFilePath, size: fileSize, relPath } = file;
                const remoteFile = path.posix.join(remoteDir, relPath); // 远程路径用POSIX格式
                // 上传文件（带单文件进度回调）
                await this.uploadFile(conn, localFilePath, remoteFile, (fileProgress) => {
                    // 累计总传输字节数
                    const fileSendBytes = fileProgress.sendBytes;
                    const sendBytes = totalTransferredBytes + fileSendBytes;
                    totalProgress = 20 + Math.round((sendBytes / totalBytes) * 70);
                    onProgress?.({
                        status: 0,
                        progress: totalProgress,
                        localFile: localFilePath,
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
            Print.error(`文件夹上传失败: ${err.message}`);
            onProgress?.({ status: -1, percent: totalProgress });
            throw err; // 抛出错误，让调用方处理
        } finally {
            // 关闭SSH连接
            if (conn && !conn._sock?.destroyed) {
                conn.end();
            }
        }
    }

    /**************************************************************
     * 扫描本地文件夹，获取文件列表、大小和相对路径
     * @param {string} localDir - 本地文件夹路径
     * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
     **************************************************************/
    async scanLocalDir(localDir) {
        const files = [];
        const dirs = [];
        const dirSet = new Set();
        let totalBytes = 0;

        async function traverse(dir) {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.relative(localDir, fullPath).replace(/\\/g, "/"); // 统一为POSIX路径

                    if (entry.isDirectory()) {
                        dirSet.add(fullPath);
                        await traverse(fullPath);
                    } else if (entry.isFile()) {
                        const stats = await fs.promises.stat(fullPath);
                        files.push({ fullPath: fullPath, size: stats.size, relPath });
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
     * @todo 执行 SSH 命令并获取完整输出（性能优化版，减少字符串拼接开销）
     * @param {import('ssh2').Client} conn - 已建立连接的 SSH Client 实例（必须处于 ready 状态）
     * @param {string} command - 要执行的远程命令（如 'ls -l', 'pwd' 等）
     * @param {Object} [options] - 可选配置
     * @param {boolean} [options.throwOnNonZeroExit=true] - 非 0 退出码是否抛出异常（默认 true）
     * @param {string|'buffer'} [options.encoding='utf8'] - 输出编码（默认 utf8，支持 'buffer'/'ascii'/'base64' 等）
     * @returns {Promise<{
     *   stdout: string|Buffer,
     *   stderr: string|Buffer,
     *   code: number // 命令退出码（0 表示成功）
     * }>}
     * @throws {Error} 当 SSH 连接异常、命令执行失败或非 0 退出码（且 throwOnNonZeroExit 为 true）时抛出
     **************************************************************/
    async exec(conn, command, options = {}) {
        const { throwOnNonZeroExit = false, encoding = "utf8" } = options;

        if (typeof command !== "string" || command.trim() === "") {
            throw new Error("命令 command 不能为空字符串");
        }
        return new Promise((resolve, reject) => {
            const stdoutBuffers = [];
            const stderrBuffers = [];
            let stdoutTotalLength = 0; // 记录 stdout 总长度，减少 Buffer.concat 时的计算开销
            let stderrTotalLength = 0; // 记录 stderr 总长度

            // 执行 SSH 命令
            conn.exec(command, (err, stream) => {
                if (err) {
                    return reject(
                        new Error(`SSH 命令执行初始化失败 [${command}]: ${err.message}`)
                    );
                }

                // 收集 stdout 原始 Buffer（不做任何字符串转换）
                stream.on("data", (chunk) => {
                    stdoutBuffers.push(chunk);
                    stdoutTotalLength += chunk.length;
                });

                // 收集 stderr 原始 Buffer（不做任何字符串转换）
                stream.on("stderr", (chunk) => {
                    stderrBuffers.push(chunk);
                    stderrTotalLength += chunk.length;
                });

                // 命令执行完成：合并 Buffer 并按需转码
                stream.on("close", (code) => {
                    try {
                        // 合并 Buffer（预计算总长度，提升 concat 性能）
                        const stdoutBuffer =
                            stdoutTotalLength > 0
                                ? Buffer.concat(stdoutBuffers, stdoutTotalLength)
                                : Buffer.alloc(0);
                        const stderrBuffer =
                            stderrTotalLength > 0
                                ? Buffer.concat(stderrBuffers, stderrTotalLength)
                                : Buffer.alloc(0);

                        // 按需转码（仅最后一步处理编码，避免中间转换开销）
                        const stdout =
                            encoding === "buffer"
                                ? stdoutBuffer
                                : stdoutBuffer.toString(encoding);
                        const stderr =
                            encoding === "buffer"
                                ? stderrBuffer
                                : stderrBuffer.toString(encoding);
                        const result = { stdout, stderr, code: code ?? -1 };

                        // 非 0 退出码处理
                        if (throwOnNonZeroExit && code !== 0) {
                            const stderrPreview =
                                typeof stderr === "string"
                                    ? stderr.slice(0, 500)
                                    : stderr.toString("utf8", 0, 500);
                            return reject(
                                new Error(
                                    `SSH 命令执行失败 [${command}]：` +
                                    `退出码 ${code}，stderr: ${stderrPreview}`
                                )
                            );
                        }

                        resolve(result);
                    } catch (transcodeErr) {
                        reject(
                            new Error(
                                `输出编码转换失败 [${encoding}]: ${transcodeErr.message}`
                            )
                        );
                    }
                });

                // 流错误处理
                stream.on("error", (err) => {
                    reject(new Error(`SSH 命令流错误 [${command}]: ${err.message}`));
                });
            });
        });
    }


    /**
     * 将 ls 输出的日期格式（中文/英文月份 + 日期 + 时间）转换为标准 YYYY-MM-dd HH:MM
     * 兼容场景：
     * - 中文平台：month="11月"、day=30、time="21:52"
     * - 英文平台：month="Nov"、day=30、time="21:52"
     * @param {Object} dateInfo - ls 解析后的日期信息
     * @param {string} dateInfo.month - 月份（中文："1月"-"12月" / 英文："Jan"-"Dec"）
     * @param {number|string} dateInfo.day - 日期（如 30、"5"）
     * @param {string} dateInfo.time - 时分（如 "21:52"）
     * @returns {string} 标准格式日期字符串（YYYY-MM-dd HH:MM）
     */
    getStandardTime({ month, day, time }) {
        // 1. 月份映射表：同时包含中文→数字、英文缩写→数字
        const monthMap = {
            // 中文月份映射
            "1月": "01", "2月": "02", "3月": "03", "4月": "04",
            "5月": "05", "6月": "06", "7月": "07", "8月": "08",
            "9月": "09", "10月": "10", "11月": "11", "12月": "12",
            // 英文月份缩写映射（大小写不敏感，后续统一转小写处理）
            "jan": "01", "feb": "02", "mar": "03", "apr": "04",
            "may": "05", "jun": "06", "jul": "07", "aug": "08",
            "sep": "09", "oct": "10", "nov": "11", "dec": "12"
        };

        // 2. 解析并标准化月份（兼容中英文、大小写）
        const normalizedMonth = month.trim().toLowerCase(); // 转小写，避免大小写歧义
        const numMonth = monthMap[normalizedMonth] || "01"; // 兜底默认 01 月

        // 3. 解析年份（ls 未显示年份，取当前系统年份）
        const year = new Date().getFullYear().toString();

        // 4. 日期补零（如 5 → "05"，30 → "30"）
        const numDay = String(day).padStart(2, "0");

        // 5. 时分格式标准化（避免异常时间格式，如 "21" → "21:00"）
        const timeParts = time.trim().split(":").slice(0, 2); // 只取时分部分
        const hour = timeParts[0]?.padStart(2, "0") || "00";
        const minute = timeParts[1]?.padStart(2, "0") || "00";
        const hourMinute = `${hour}:${minute}`;

        // 6. 拼接标准格式
        return `${year}-${numMonth}-${numDay} ${hourMinute}`;
    }



    /**************************************************************
    * @todo 非递归获取远程文件夹，获取直接子目录和文件（兼容 BusyBox 无find环境）
    * @param {string} host - 文件服务器地址
    * @param {string} remoteDir - 远程文件夹路径（绝对路径）
    * @returns {Promise<{files: {path: string, size: number, relPath: string}[], dirs: string[], totalBytes: number}>}
    * - files: 直接子文件列表（不含子目录内文件）
    * - dirs: 直接子目录列表（不含嵌套子目录）
    * - totalBytes: 直接子文件总大小
    **************************************************************/
    async listDir(host, remoteDir) {
        const allItems = [];
        let dirCount = 0;
        let fileCount = 0;
        let totalBytes = 0;

        // 标准化远程目录（确保结尾无斜杠，避免路径拼接重复）
        const normalizedRemoteDir = remoteDir.replace(/\/$/, "");

        try {
            let conn = await this.getSSHClient(host);
            // BusyBox 兼容的 ls 命令：-l（详细信息）、-A（显示隐藏文件，不含.和..）、-p（目录结尾加/，便于区分）
            const lsCmd = `ls -lAp '${normalizedRemoteDir}' 2>/dev/null`;

            let lsResult = await this.exec(conn, lsCmd);
            if (lsResult.code) {
                return { nodes: allItems, totalBytes };
            }

            // 分割行并过滤空行（BusyBox ls 无递归，无目录分隔行）
            const lines = lsResult.stdout.split("\n").filter((line) => line.trim());

            // 正则解析：兼容英文/中文月份、带空格文件名、目录（结尾无/，通过权限位判断）
            // 格式：权限 链接数 所有者 组 大小 月 日 时间 文件名/（目录）
            const lineRegex =
                /^([-dlrwx@]+)\s+(\d+)\s+([^\s:]+(?:\s+[^\s:]+)?)\s+([^\s:]+(?:\s+[^\s:]+)?)\s+(\d+)\s+([A-Za-z]{3}|\d{1,2}[月])\s+(\d{1,2})\s+(\d{2}:\d{2}|\d{4})\s+(.*)$/;

            for (const line of lines) {
                const match = line.match(lineRegex);
                if (!match) continue;

                let [
                    , mode, links, owner, group, _size_, month, day, time, fileName
                ] = match;

                const size = parseInt(_size_, 10);
                if (isNaN(size) || !fileName || fileName.trim() === "") continue;
                fileName = Utils.removeLastChar(fileName, '/');

                // 拼接绝对路径（目标目录 + 子项名称）
                const absPath = `${normalizedRemoteDir}/${fileName}`;

                let mtime = this.getStandardTime({ month, day, time });
                let item = {
                    name: fileName,
                    fullPath: absPath,
                    relPath: fileName,
                    mode: mode,
                    links: links,
                    owner: owner,
                    group: group,
                    size: size,
                    symlinkTarget: "",
                    mtime: mtime
                };

                // 1. 判断是否为目录（权限位以 d 开头）
                if (mode.startsWith("d")) {
                    // 过滤 BusyBox 虚拟目录项（如 . 和 ..，但 -A 参数已排除，此处双重保险）
                    if (fileName === "." || fileName === "..") continue;
                    item.type = FileNodeType.DIRECTORY;
                    allItems.push(item); // 直接子目录，添加绝对路径
                    dirCount++;
                } else if (mode.startsWith("-")) {  // 2. 处理文件（非目录、非链接，权限位以 - 开头）
                    item.type = FileNodeType.FILE;
                    allItems.push(item);
                    totalBytes += size;
                    fileCount++;
                } else if (mode.startsWith("l")) {
                    const [linkName, target] = fileName.split(" -> ");
                    actualFileName = linkName || fileName;
                    symlinkTarget = target || "";
                    item.symlinkTarget = symlinkTarget;
                    item.name = actualFileName;
                    item.type = FileNodeType.SYMLINK;
                    allItems.push(item);
                    totalBytes += size;
                    fileCount++;
                }
            }
            console.debug(
                `非递归扫描完成：目录${normalizedRemoteDir}，找到 ${dirCount} 个子目录，${fileCount} 个文件，总大小 ${totalBytes} 字节`
            );
            this.fileTree.addChildren(remoteDir, allItems);
            return { nodes: allItems, totalBytes };
        } catch (err) {
            console.error("扫描远程文件夹失败:", err.message);
            throw new Error(`非递归扫描远程文件夹失败: ${err.message}`);
        }
    }

    /**************************************************************
     * @todo 扫描远程文件夹，获取文件列表、大小和相对路径（兼容 BusyBox 无find环境）
     * @param {import('ssh2').Client} conn - SSH连接实例
     * @param {string} remoteDir - 远程文件夹路径（绝对路径）
     * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
     **************************************************************/
    async scanRemoteDir(conn, remoteDir) {
        const files = [];
        const dirs = [];
        const dirSet = new Set();
        let totalBytes = 0;
        // 标准化远程目录（确保结尾无斜杠，避免路径拼接重复）
        const normalizedRemoteDir = remoteDir.replace(/\/$/, "");
        try {
            // BusyBox 兼容的 ls 命令：-l（详细信息）、-R（递归）、-A（显示隐藏文件，不含.和..）
            const lsCmd = `ls -lRA '${normalizedRemoteDir}' 2>/dev/null`;
            let lsResult = await this.exec(conn, lsCmd);
            if (lsResult.code) {
                return { files, dirs, totalBytes };
            }

            const lines = lsResult.stdout.split("\n").filter((line) => line.trim());
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
            const fileLineRegex =
                /^([-lrwx@]+)\s+(\d+)\s+([^\s:]+(?:\s+[^\s:]+)?)\s+([^\s:]+(?:\s+[^\s:]+)?)\s+(\d+)\s+([A-Za-z]{3}|\d{1,2}[月年日])\s+(\d{1,2})\s+(\d{2}:\d{2}|\d{4})\s+(.*)$/;

            for (const line of lines) {
                // 1. 匹配目录行（格式：/path/to/dir:）
                if (line.endsWith(":")) {
                    currentAbsDir = line.slice(0, -1).trim(); // 去除末尾 ":"，得到当前目录绝对路径
                    dirSet.add(currentAbsDir);
                    continue;
                }

                // 2. 匹配文件行（跳过目录行和无效行）
                const fileMatch = line.match(fileLineRegex);
                if (!fileMatch) continue;

                const [, mode, links, owner, group, _size_, month, day, time, fileName] = fileMatch;
                const size = parseInt(_size_, 10);

                let mtime = this.getStandardTime({ month, day, time });

                // 过滤无效数据：
                // - 目录的大小是4096（BusyBox默认），需排除
                // - 解析失败的大小、空文件名
                if (isNaN(size) || size === 4096 || !fileName || fileName.trim() === "")
                    continue;

                // 3. 计算绝对路径和相对路径
                const absPath = `${currentAbsDir}/${fileName}`; // 拼接文件绝对路径
                // 相对路径：当前目录绝对路径 - 根目录路径 = 相对目录，再拼接文件名
                const relDir = currentAbsDir.replace(normalizedRemoteDir, "");
                const relPath = `${relDir}/${fileName}`.replace(/^\/+/, ""); // 去除开头多余斜杠

                // 处理符号链接
                let actualFileName = fileName;
                let symlinkTarget = "";
                if (mode[0] === "l") {
                    const [linkName, target] = fileName.split(" -> ");
                    actualFileName = linkName || fileName;
                    symlinkTarget = target || "";
                }
                // 添加到文件列表
                const fileInfo = {
                    fullPath: absPath,
                    relPath,
                    name: actualFileName,
                    size,
                    mode,
                    links: parseInt(links, 10),
                    owner,
                    group,
                    mtime: mtime,
                    symlinkTarget,
                };
                // 4. 添加到结果列表
                files.push(fileInfo);
                totalBytes += size;
            }
            dirs.push(...dirSet);
            Print.debug(
                `扫描完成，共找到 ${files.length} 个文件，总字节数 ${totalBytes}`
            );
            // let fileTree = new FileTree();
            // fileTree.build(dirs, files);
            // fileTree.print();
            return { files, dirs, totalBytes };
        } catch (err) {
            Print.error(err);
            throw new Error(`扫描远程文件夹失败: ${err.message}`);
        }
    }

    /**************************************************************
     * @todo 过滤需要传输的文件（断点续传核心）
     * @param {Object[]} sourceFiles - 源文件列表（含path/size/relPath）
     * @param {Object[]} targetFiles - 目标文件列表（含path/size/relPath）
     * @returns {Object[]} 需要传输的源文件列表
     **************************************************************/
    filterNeedTransferFiles(sourceFiles, targetFiles) {
        const targetMap = new Map();
        targetFiles.forEach((file) => targetMap.set(file.relPath, file.size));

        // 2. 过滤逻辑：覆盖「本地无文件、文件不存在、传输中断、文件更新」场景
        return sourceFiles.filter((sourceFile) => {
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
     * @todo 读取SCP服务器响应（简洁版本）
     * @param {import('stream').Duplex} stream - SSH 通道流
     * @returns {Promise<{ status: number; message: string }>}
     **************************************************************/
    async _readScpServerResponse(stream) {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);
            let timeoutId;

            const cleanup = () => {
                stream.off("data", onData);
                stream.off("error", onError);
                clearTimeout(timeoutId);
            };

            const onData = (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                Print.debug(`[SCP] 读取响应: ${buffer.toString("hex")}`);

                const responseType = buffer[0];

                // 只有收到完整响应时才处理
                if (responseType === 0 || responseType === 1 || responseType === 2) {
                    cleanup(); // 先清理监听器，再resolve

                    if (responseType === 0) {
                        // 成功：回灌剩余数据
                        const remainingData = buffer.subarray(1);
                        if (remainingData.length > 0) {
                            stream.unshift(remainingData);
                            Print.debug(`[SCP] 回灌 ${remainingData.length} 字节剩余数据`);
                        }
                        Print.debug(`[SCP] 响应成功`);
                        resolve({ status: 0, message: "success" });
                    } else {
                        // 错误/警告
                        const message = buffer.subarray(1).toString("utf-8").trim();
                        const result = {
                            status: responseType,
                            message: message || (responseType === 1 ? "警告" : "错误"),
                        };
                        Print.debug(
                            `[SCP] 响应${result.status === 1 ? "警告" : "错误"}: ${result.message}`
                        );
                        resolve(result);
                    }
                }
            };

            const onError = (err) => {
                cleanup();
                reject(new Error(`SCP响应读取错误: ${err.message}`));
            };

            // 设置超时
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("SCP响应读取超时"));
            }, 30000);

            stream.on("data", onData);
            stream.once("error", onError);
        });
    }

    /**************************************************************
     * @todo 发送应答给SCP服务器
     **************************************************************/
    async _sendAckToScpServer(stream, stepName) {
        Print.debug(stepName);
        return new Promise((resolve, reject) => {
            stream.write(Buffer.from([0]), (err) => {
                if (err) {
                    reject(new Error(`发送 ACK 失败: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**************************************************************
     * @todo 等待SCP服务器响应
     **************************************************************/
    async _awaitScpServerAck(stream, stepName) {
        try {
            const response = await this._readScpServerResponse(stream);
            if (response.status === 0) {
                return; // 成功，直接返回
            } else {
                throw new Error(`${stepName}失败: ${response.message}`);
            }
        } catch (error) {
            console.error("SCP响应等待失败:", error.message);
            throw error;
        }
    }

    /**************************************************************
     * @todo 发送上传结束符并等待服务器响应
     **************************************************************/
    _awaitUploadFinishAck(stream, stepName) {
        return new Promise((resolve, reject) => {
            stream.write(Buffer.from([0]), async (err) => {
                if (err)
                    return reject(new Error(`发送${stepName}失败: ${err.message}`));
                try {
                    await this._awaitScpServerAck(stream, `${stepName}确认`);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
}

export default SFTPService;