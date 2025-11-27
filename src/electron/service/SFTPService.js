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


    async debugSSH2 () {
        const conn = new Client();
        let isConnected = false;

        // 1. SSH 连接配置
        const SSH_CONFIG = {
            host: '192.168.43.132',
            port: 22,
            username: 'ofix',
            password: '123',
            strictHostKeyChecking: 'no',
            debug: (message) => {
                console.log(`[DEBUG] SSH2: ${message}`);
            },
            hostVerifier: (key) => {
                try {
                    const fingerprint = key.getFingerprint('sha256').toString('base64');
                    console.log(`[DEBUG] 主机密钥指纹: ${fingerprint}`);
                } catch (err) {
                    console.warn(`[DEBUG] 获取指纹失败（旧版本兼容）: ${err.message}`);
                }
                return true;
            },
        };

        try {
            // 步骤 1：等待 SSH 连接就绪（握手 + 认证）
            console.log('\n===== 步骤 1：验证 SSH 基础连接 =====');
            await new Promise((resolve, reject) => {
                conn.on('ready', () => {
                    console.log('[SUCCESS] SSH 连接成功（已认证）');
                    isConnected = true;
                    resolve(); // 连接就绪后，才 resolve 进入下一步
                });

                conn.on('error', (err) => {
                    console.error('[ERROR] SSH 连接错误:', err.message);
                    reject(err);
                });

                conn.on('close', (hadError) => {
                    console.log(`[DEBUG] SSH 连接关闭，是否有错误: ${hadError}`);
                    if (!isConnected) reject(new Error('SSH 连接意外关闭'));
                });

                // 发起连接（仅发起，不立即执行 exec）
                conn.connect(SSH_CONFIG);
            });

            // 步骤 2：SSH 连接就绪后，再创建 SCP 通道（核心修复：顺序调整）
            console.log('\n===== 步骤 2：验证 SCP 通道创建 =====');
            await new Promise((resolve, reject) => {
                // 1. 去掉 -O 参数，兼容旧版 scp
                conn.exec('/usr/bin/scp -f', (err, stream) => {
                    if (err) {
                        console.error('[ERROR] 创建 SCP 通道失败:', err.message);
                        return reject(err);
                    }
                    console.log('[SUCCESS] SCP 通道创建成功');

                    let isRejected = false; // 避免重复 reject
                    let responseBuffer = Buffer.alloc(0);

                    // 2. 优先注册 stderr 监听，捕获所有服务器 scp 错误
                    stream.stderr.on('data', (data) => {
                        if (isRejected) return;
                        const errMsg = data.toString().trim();
                        console.error('[ERROR] 服务器 scp 命令错误:', errMsg);
                        isRejected = true;
                        reject(new Error(`服务器 scp 错误: ${errMsg}`));
                    });

                    // 通道错误监听
                    stream.on('error', (err) => {
                        if (isRejected) return;
                        clearTimeout(responseTimeout);
                        console.error('[ERROR] SCP 通道错误:', err.message);
                        isRejected = true;
                        reject(err);
                    });

                    // 通道关闭监听
                    stream.on('close', (code) => {
                        clearTimeout(responseTimeout);
                        console.log(`[DEBUG] SCP 通道关闭，退出码: ${code}`);
                        if (!responseBuffer.length && !isRejected) {
                            isRejected = true;
                            reject(new Error(`SCP 通道关闭但未收到响应（退出码: ${code}）`));
                        }
                    });

                    // 步骤 3：SCP 协议交互
                    console.log('\n===== 步骤 3：验证 SCP 协议交互 =====');
                    const remoteFile = '/usr/share/www/favicon.ico';
                    // 3. 简化路径转义（仅转义单引号）
                    const escapedPath = remoteFile.replace(/'/g, '\'\\\'\''); // 单引号内转义单引号
                    console.log(`[DEBUG] 发送远程文件路径（转义后）: ${escapedPath}`);

                    // 1. 发送路径（末尾必须加 \n，协议要求）
                    const pathBuffer = Buffer.from(`${escapedPath}\n`, 'utf8');
                    const isPathWritten = stream.write(pathBuffer);
                    console.log(`[DEBUG] 路径发送结果（缓冲区是否未满）: ${isPathWritten}`);

                    // 接收文件内容
                    // const writeStream = fs.createWriteStream('C:/Users/Lenovo/Documents/devtool/sftp.192.168.43.132/favicon.ico');
                    // stream.pipe(writeStream);

                    // 处理缓冲区已满
                    const sendConfirmByte = () => {
                        if (isRejected) return;
                        // 2. 发送 0x00 确认（告知服务器路径发送完成）
                        stream.write(Buffer.alloc(1));
                        console.log('[DEBUG] 已发送路径确认字节（0x00），等待服务器元数据...');
                    };

                    // // 处理缓冲区已满
                    // if (!isPathWritten) {
                    //     console.log('[DEBUG] 缓冲区已满，等待 drain 事件...');
                    //     stream.once('drain', () => {
                    //         console.log('[DEBUG] 缓冲区可用，发送确认字节');
                    //         sendConfirmByte();
                    //     });
                    // } else {
                    //     sendConfirmByte();
                    // }

                    // 响应处理
                    responseBuffer = Buffer.alloc(0);
                    const responseTimeout = setTimeout(() => {
                        const err = new Error('接收响应超时（10秒）');
                        console.error('[ERROR]', err.message);
                        stream.destroy();
                        reject(err);
                    }, 10000);


                    // 接收服务器数据
                    stream.on('data', (chunk) => {
                        clearTimeout(responseTimeout);
                        responseBuffer = Buffer.concat([responseBuffer, chunk]);
                        console.log(`[DEBUG] 收到响应（长度: ${chunk.length} 字节）`);
                        console.log(`[DEBUG] 响应十六进制: ${responseBuffer.toString('hex')}`);
                        console.log(`[DEBUG] 响应字符串: ${responseBuffer.toString('utf8').trim()}`);

                        const status = responseBuffer[0];
                        if (status === 0) {
                            console.log('[SUCCESS] 服务器响应成功（状态码 0）');
                            const meta = responseBuffer.slice(1).toString('utf8').trim();
                            if (meta.startsWith('C')) {
                                const [perm, size, filename] = meta.slice(1).split(/\s+/);
                                console.log(`[DEBUG] 文件元信息 - 权限: ${perm}, 大小: ${size} 字节, 文件名: ${filename}`);
                            }
                            resolve();
                        } else {
                            const errorMsg = responseBuffer.slice(1).toString('utf8').trim();
                            console.error(`[ERROR] 服务器错误（状态码 ${status}）: ${errorMsg}`);
                            reject(new Error(`服务器错误: ${errorMsg}`));
                        }
                    });
                });
            });

            console.log('\n===== 所有步骤验证通过 =====');

        } catch (err) {
            console.error('\n[FATAL] 调试失败:', err.message);
        } finally {
            // 关闭 SSH 连接
            if (conn && !conn._closed) {
                console.log('\n[DEBUG] 关闭 SSH 连接');
                conn.end();
            }
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

    // 生成会话ID
    generateSessionId (host, type, remotePath, localPath) {
        const data = `${host}-${type}-${remotePath}-${localPath}-${Date.now()}`;
        return Buffer.from(data).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
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
     * 修复：确保读取到完整响应（处理分块传输）
     * @param {import('stream').Duplex} stream - SSH 通道流
     * @returns {Promise<{ status: number; message: string }>}
     */
    readScpResponse (stream) {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);
            let timeoutTimer = null;

            // 1. 设置超时（避免无限阻塞，建议 10 秒）
            timeoutTimer = setTimeout(() => {
                const err = new Error('读取 SCP 响应超时（10秒），可能是路径错误或服务器无响应');
                console.error(err.message);
                reject(err);
                stream.destroy(); // 销毁通道，释放资源
            }, 10000);

            // 2. 持续监听数据，直到读取到完整响应
            const onData = (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);

                // SCP 响应规则：
                // - 错误响应：首字节非 0，后续是错误信息（可能含换行）
                // - 成功响应：首字节 0，后续是元信息（如 C0644 4286 favicon.ico）
                // 只要缓冲区有数据，且首字节已获取，就尝试解析（允许分块）
                if (buffer.length >= 1) {
                    const status = buffer[0];
                    // 读取到完整响应的标志：缓冲区末尾是换行符，或状态码非 0（错误响应可能无换行）
                    const isComplete = buffer[buffer.length - 1] === 0x0A || status !== 0;

                    if (isComplete) {
                        clearTimeout(timeoutTimer);
                        stream.off('data', onData);
                        const message = buffer.slice(1).toString('utf8').trim();
                        resolve({ status, message });
                    }
                }
            };

            // 3. 监听流数据
            stream.on('data', onData);

            // 4. 监听流关闭/错误
            stream.once('close', () => {
                clearTimeout(timeoutTimer);
                stream.off('data', onData);
                reject(new Error('SCP 通道意外关闭，未收到响应'));
            });

            stream.once('error', (err) => {
                clearTimeout(timeoutTimer);
                stream.off('data', onData);
                reject(new Error(`读取响应错误: ${err.message}`));
            });
        });
    }
    /**
     * 发送SCP协议请求（符合SCP协议规范）
     * @param {import('stream').Writable} stream - SSH通道可写流（必须是未销毁的Duplex流）
     * @param {string} data - 要发送的数据（如文件路径、偏移量指令 S1024）
     * @throws {Error} 流不可用或发送失败时抛出错误
     */
    async writeScpRequest (stream, data) {
        // 1. 校验流状态（避免向已关闭的流写入）
        if (!stream || stream.destroyed || !stream.writable) {
            throw new Error('SCP 通道流不可用（已关闭或不可写）');
        }

        // 2. SCP协议要求：请求末尾必须加换行符（\n），而非NULL
        const requestBuffer = Buffer.from(`${data}\n`, 'utf8');

        // 3. 处理流写入（兼容缓冲区已满的情况）
        const isWritten = stream.write(requestBuffer);

        // 4. 若返回false，说明缓冲区已满，需监听drain事件避免数据丢失（可选但推荐）
        if (!isWritten) {
            return new Promise((resolve) => {
                stream.once('drain', resolve);
            });
        }

        // 5. 写入成功，返回空Promise（统一异步接口）
        return Promise.resolve();
    }

    /**
     * 扫描本地文件夹，获取文件列表、大小和相对路径
     * @param {string} localDir - 本地文件夹路径
     * @returns {Promise<{files: {path: string, size: number, relPath: string}[], totalBytes: number}>}
     */
    async scanLocalDir (localDir) {
        const files = [];
        let totalBytes = 0;

        async function traverse (dir) {
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
    async scanRemoteDir (conn, remoteDir) {
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
    async scpUploadFile (conn, localFile, remoteFile, fileSize, startOffset = 0, onProgress) {
        return new Promise((resolve, reject) => {
            // 执行远程scp接收命令（-t=to，接收文件）
            conn.exec(`scp -t "${remoteFile}"`, (err, stream) => {
                if (err) return reject(new Error(`创建上传通道失败: ${err.message}`));

                let bytesTransferred = startOffset; // 已传输字节数（含断点偏移）

                // 1. 读取服务器初始响应
                this.readScpResponse(stream)
                    .then(async ({ status, message }) => {
                        if (status !== 0) throw new Error(`服务器响应错误: ${message}`);

                        // 2. 发送文件元信息（C0644 权限 + 大小 + 文件名）
                        const fileName = path.basename(remoteFile);
                        await this.writeScpRequest(stream, `C0644 ${fileSize} ${fileName}`);

                        // 3. 读取元信息响应
                        return this.readScpResponse(stream);
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
  * 单个文件SCP下载（支持断点续传，修复协议交互流程）
  * @param {import('ssh2').Client} conn - SSH连接实例（已认证）
  * @param {string} remoteFile - 远程文件绝对路径
  * @param {string} localFile - 本地文件绝对路径
  * @param {number} fileSize - 文件总大小（字节）
  * @param {number} startOffset - 开始传输的偏移量（默认 0）
  * @param {Function} [onProgress] - 进度回调
  * @returns {Promise<void>}
  */
    async scpDownloadFile (conn, remoteFile, localFile, fileSize, startOffset = 0, onProgress) {
        return new Promise((resolve, reject) => {
            // 1. 确保本地目录存在
            const localDir = path.dirname(localFile);
            if (!fs.existsSync(localDir)) {
                try {
                    fs.mkdirSync(localDir, { recursive: true });
                } catch (err) {
                    const errMsg = `创建本地目录失败: ${err.message}`;
                    console.error(errMsg);
                    return reject(new Error(errMsg));
                }
            }

            console.log(`开始下载文件: 远程=${remoteFile}，本地=${localFile}`);

            // 2. 执行远程 scp -f 命令（启动 SCP 服务器端）
            conn.exec('/usr/bin/scp -O -f', async (err, stream) => {
                if (err) {
                    const errMsg = `创建 SCP 通道失败: ${err.message}`;
                    console.error(errMsg);
                    return reject(new Error(errMsg));
                }

                // 新增：设置流编码和缓冲区大小
                // stream.setEncoding('utf8');
                // stream.setHighWaterMark(32 * 1024); // 32KB 缓冲区（适配多数服务器）

                let bytesTransferred = startOffset;
                let writeStream = null;
                let isDestroyed = false;

                // 3. 关键修复：先发送远程文件路径（SCP 协议第一步）
                console.log(`发送远程文件路径: ${remoteFile}`);
                await this.writeScpRequest(stream, remoteFile);

                // 4. 协议交互流程（严格遵循 SCP 规范）
                this.readScpResponse(stream)
                    .then(async ({ status, message }) => {
                        // 校验服务器响应：状态码非 0 表示文件不存在/权限不足
                        if (status !== 0) {
                            throw new Error(`远程文件访问失败: ${message || '未知错误'}`);
                        }

                        // 解析文件元信息（格式：C<权限> <大小> <文件名>，如 C0644 60858 404.png）
                        const metaMatch = message.match(/^C(\d{4}) (\d+) (.+)$/);
                        if (!metaMatch) {
                            throw new Error(`无效文件元信息: ${message}`);
                        }

                        const [, , remoteSizeStr] = metaMatch;
                        const remoteSize = parseInt(remoteSizeStr, 10);
                        if (remoteSize !== fileSize) {
                            throw new Error(`文件大小不匹配：远程=${remoteSize}，本地记录=${fileSize}`);
                        }
                        console.log(`获取文件元信息成功，远程大小=${remoteSize}字节`);

                        // 5. 发送 0x00 确认（告知服务器已收到元信息）
                        console.log(`发送元信息确认（0x00）`);
                        stream.write(Buffer.alloc(1));

                        // 6. 断点续传：发送偏移量请求（仅当偏移量 > 0 时）
                        if (startOffset > 0) {
                            console.log(`发送断点续传偏移量: ${startOffset}字节`);
                            await this.writeScpRequest(stream, `S${startOffset}`);
                            return this.readScpResponse(stream); // 等待服务器确认偏移量
                        }
                        return { status: 0 }; // 无偏移量，直接返回成功
                    })
                    .then(({ status, message }) => {
                        if (status !== 0) {
                            throw new Error(`偏移量确认失败: ${message}`);
                        }
                        console.log(`偏移量确认成功（或无需偏移）`);

                        // 7. 发送开始接收数据的确认（0x00）
                        stream.write(Buffer.alloc(1));
                        console.log(`发送开始接收数据确认（0x00）`);

                        // 8. 创建本地文件写入流
                        writeStream = fs.createWriteStream(localFile, {
                            flags: startOffset > 0 ? 'r+' : 'w',
                            start: startOffset,
                            highWaterMark: 64 * 1024, // 64KB 缓冲区，提升传输效率
                        });

                        // 9. 监听写入流错误
                        writeStream.on('error', (err) => {
                            const errMsg = `本地文件写入失败: ${err.message}`;
                            console.error(errMsg);
                            this.destroyStream(stream, writeStream);
                            isDestroyed = true;
                            reject(new Error(errMsg));
                        });

                        // 10. 接收服务器发送的文件数据
                        stream.on('data', (chunk) => {
                            // 过滤 SCP 结束标记（末尾 0x00）
                            if (chunk[chunk.length - 1] === 0) {
                                chunk = chunk.slice(0, -1);
                            }

                            // 防止数据超出总大小（避免服务器异常）
                            if (bytesTransferred + chunk.length > fileSize) {
                                chunk = chunk.slice(0, fileSize - bytesTransferred);
                            }

                            // 写入本地文件
                            writeStream.write(chunk);

                            // 更新进度
                            bytesTransferred += chunk.length;
                            const percent = Math.min(100, Math.round((bytesTransferred / fileSize) * 100));
                            onProgress?.({
                                byteCount: bytesTransferred,
                                totalBytes: fileSize,
                                percent,
                                status: '下载中',
                            });

                            // 传输完成时提前确认
                            if (bytesTransferred === fileSize) {
                                console.log(`文件传输完成，已传输=${bytesTransferred}字节`);
                                stream.write(Buffer.alloc(1)); // 告知服务器已接收完成
                            }
                        });
                    })
                    .catch((err) => {
                        const errMsg = `下载过程异常: ${err.message}`;
                        console.error(errMsg);
                        this.destroyStream(stream, writeStream);
                        isDestroyed = true;
                        reject(new Error(errMsg));
                    });

                // 11. 监听通道关闭（最终校验）
                stream.on('close', (code) => {
                    if (isDestroyed) return;

                    if (writeStream) {
                        writeStream.end();
                        writeStream.destroy();
                    }

                    if (code === 0 && bytesTransferred === fileSize) {
                        console.log(`下载成功：退出码=${code}，已传输=${bytesTransferred}字节`);
                        resolve();
                    } else {
                        const errMsg = `下载失败：退出码=${code}，已传输=${bytesTransferred}/${fileSize}字节`;
                        console.error(errMsg);
                        reject(new Error(errMsg));
                    }
                });

                // 12. 监听通道错误
                stream.on('error', (err) => {
                    if (isDestroyed) return;

                    const errMsg = `SCP 通道错误: ${err.message}`;
                    console.error(errMsg);
                    this.destroyStream(stream, writeStream);
                    isDestroyed = true;
                    reject(new Error(errMsg));
                });

                // 13. 监听 SSH 连接断开
                conn.once('end', () => {
                    if (isDestroyed) return;

                    const errMsg = 'SSH 连接意外断开';
                    console.error(errMsg);
                    this.destroyStream(stream, writeStream);
                    isDestroyed = true;
                    reject(new Error(errMsg));
                });
            });
        });
    }

    /**
     * 销毁流资源（避免内存泄漏）
     * @param {import('stream').Duplex} stream - SSH 通道流
     * @param {import('fs').WriteStream} writeStream - 本地写入流
     */
    destroyStream (stream, writeStream) {
        if (stream && !stream.destroyed) {
            stream.destroy();
        }
        if (writeStream && !writeStream.destroyed) {
            writeStream.destroy();
        }
    }

    /**
     * 文件夹SCP上传（支持断点续传+进度回调）
     * @param {SshConfig} config - SSH配置
     * @param {string} localDir - 本地文件夹路径
     * @param {string} remoteDir - 远程文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     */
    async scpUploadDir (config, localDir, remoteDir, onProgress) {
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
    async scpDownloadDir (config, remoteDir, localDir, onProgress) {
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
                    },
                    // 1. 关闭严格的主机密钥检查（允许连接未知主机）
                    strictHostKeyChecking: 'no',
                    // 2. 自定义主机密钥验证逻辑（返回 true 表示信任）
                    hostVerifier: (key) => {
                        // 兼容旧版本的指纹逻辑（同上）
                        let fingerprint;
                        if (key.getFingerprint) {
                            fingerprint = key.getFingerprint('sha256').toString('base64');
                        } else if (key.fingerprint) {
                            fingerprint = Buffer.from(key.fingerprint, 'hex').toString('base64');
                        } else {
                            console.warn('无法获取主机密钥指纹，直接信任');
                            return true;
                        }
                        console.log(`自动信任主机密钥指纹: ${fingerprint}`);
                        return true;
                    },
                    // 可选：保存主机密钥到本地（下次连接无需再次验证）
                    // knownHosts: path.resolve(__dirname, '.ssh/known_hosts'),
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
                console.log(file);
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
                await this.scpDownloadFile(conn, remoteFile, localFile, fileSize, startOffset, (fileProgress) => {
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