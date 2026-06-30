import { EventEmitter } from "events";
import Utils from "../core/Utils.js";
import { Client } from "ssh2";
import fs from "fs"; // 核心修复：直接导入完整 fs 模块（含同步+异步）
import path from "path";
import Print from "../core/Print.js";
import FileTree from "../core/FileTree.js";
import Scp from "./Scp.js";
import BaseFsClient from "../base/BaseFsClient.js";
import { FileNodeType } from "../core/FileNodeType.js";
// import mmap from 'mmap-io';
// import Client from 'ssh2-sftp-client';

class SimpleSftpClient extends BaseFsClient {
    constructor(options = {}) {
        super();
        this.host = options.host;
        this.port = options.port ?? 22;
        this.user = options.user ?? 'root';
        this.password = options.password ?? '0penBmc';
        this.remoteRootPath = options.remoteRootPath ?? '/usr/share/www';

        this.conn = {
            sshClient: null,
            connected: false, // 是否连接
            error: "",
        };

        // 事件
        this._eventEmitter = new EventEmitter();
    }

    async init() {
        this.stateDir = await Utils.sftpDownloadMetaDir();
    }

    createTimeout(ms, message) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        });
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
    async connect(options = {}) {
        const {
            host,
            username = "root",
            password = "0penBmc",
            port = 22,
        } = options;
        // 参数验证
        if (!host || typeof host !== "string") {
            throw new Error("host参数必须是非空字符串");
        }
        try {
            Print.debug(`\n连接SSH服务器: ${username}@${host}:${port}`);
            this.conn.sshClient = new Client();
            // 使用Promise.race实现超时控制
            await Promise.race([
                this.doConnect(this.conn.sshClient, { host, port, username, password }),
                this.createTimeout(15000, `SSH连接超时（15秒）: ${host}`),
            ]);
            Print.debug(`SSH连接成功: ${host}`);
            return this.conn;
        } catch (error) {
            this.conn.connected = false;
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
    }

    doConnect(sshClient, options) {
        return new Promise((resolve, reject) => {
            sshClient.on("ready", () => {
                Print.debug("SSH认证成功");
                this.conn.connected = true;
                resolve(sshClient);
            });

            sshClient.on("error", (err) => {
                this.conn.connected = false;
                reject(new Error(`SSH错误: ${err.message}`));
            });

            sshClient.on("close", () => {
                this.conn.connected = false;
                reject(new Error("SSH连接异常关闭"));
            });

            // 连接配置
            sshClient.connect({
                host: options.host,
                port: options.port,
                username: options.username,
                password: options.password,
                readyTimeout: 10000,
                keepaliveInterval: 30000, // 每30秒发送一次心跳
                keepaliveCountMax: 3,     // 最多重试3次
                strictHostKeyChecking: "no",
                debug: (message) => Print.debug(`[SSH2 Debug]: ${message}`),
                algorithms: {
                    cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr"],
                    serverHostKey: [
                        // 优先使用服务器支持的算法
                        'ssh-ed25519',
                        'ecdsa-sha2-nistp384',
                        'rsa-sha2-256',
                        // 备用算法
                        'rsa-sha2-512',
                        'ecdsa-sha2-nistp256',
                        'ssh-rsa',
                        'ssh-dss'
                    ],
                    // 添加 KEX 算法确保兼容
                    kex: [
                        'curve25519-sha256@libssh.org',
                        'curve25519-sha256',
                        'ecdh-sha2-nistp256',
                        'ecdh-sha2-nistp384',
                        'ecdh-sha2-nistp521',
                        'diffie-hellman-group-exchange-sha256',
                        'diffie-hellman-group14-sha256'
                    ]
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

    // 断开服务器连接
    async disconnect() {
        if (this.conn) {
            await this.conn.sshClient.end();
            this.conn = null;
        }
    }

    // 连接活性检查
    isConnected(conn) {
        try {
            return conn && typeof conn === "object" && conn.connected === true;
        } catch (error) {
            return false;
        }
    }

    // 获取连接
    getConnection() {
        return this.conn;
    }

    // 读取目录
    async readdir(path,) {
        let conn = this.getConnection();
        return Scp.listDir(conn, remotePath);
    }

    // 读取文件内容
    async readFile(remotePath) {
        let conn = this.getConnection();
        return Scp.readFile(conn, remotePath);
    }

    // 写入文件
    async writeFile(remotePath, content) {
        let conn = this.getConnection();
        return Scp.writeFile(conn, remotePath, content);
    }

    // 创建文件夹
    async mkdir(path, recursive) {
        let conn = this.getConnection();
        return Scp.mkdir(conn, path, recursive);
    }

    // 删除文件/文件夹
    async delete(path, options) {
        let conn = this.getConnection();
        return Scp.delete(conn, path, options);
    }

    // 文件/文件夹重命名
    async rename(oldPath, newPath) {
        let conn = this.getConnection();
        return Scp.rename(conn, oldPath, newPath);
    }

    // 检查文件/文件夹是否存在
    async exists(path) {
        let conn = this.getConnection();
        return Scp.exists(conn, path);
    }

    // 获取文件/文件夹元信息
    async stat(path) {
        let conn = this.getConnection();
        return Scp.stat(conn, path);
    }
}

export default SimpleSftpClient;