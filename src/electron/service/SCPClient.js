

import fs from 'fs';
import HexDump from "../core/HexDump.js";
import Utils from "../core/Utils.js";
import Print from '../core/Print.js';

const SCP_STATE = {
    WAITING_HEADER: 0,
    RECEIVING_FILE: 1,
    RECEIVING_DIR: 2,
    // SEND_WAIT_ACK: 3,
    // SEND_FILE_META: 4,
    // SEND_FILE: 4,
};
class SCPClient {
    constructor(conn, remoteFileAbsPath, localFileAbsPath) {
        this.conn = conn;
        this.remoteFilePath = remoteFileAbsPath; // 远程文件绝对路径
        this.localFilePath = localFileAbsPath; // 本地文件绝对路径
        this.localFile = null; // 本地文件句柄
        this.recvState = SCP_STATE.WAITING_HEADER; // 当前SCP协议状态
        this.buffer = Buffer.alloc(0); // SCP服务器响应元数据缓存
        this.recvFileBytes = 0; // 已接收文件字节数
        this.fileInfo = null; // 文件信息
        this.lastProgress = 0; // 上次进度百分比
    }

    async downloadFile(progressCallback) {
        await new Promise((resolve, reject) => {
            this.conn.exec(`scp -f ${this.remoteFilePath}`, (err, stream) => {
                if (err) {
                    Print.error('[ERROR] 创建 SCP 通道失败:', err.message);
                    return reject(err);
                }
                stream.write(Buffer.from([0]));
                stream.on('data', (chunk) => {
                    this.recv(stream, chunk, (data) => {
                        if (data.status == 1) {
                            stream.close(); // 必须关闭，否则可能多个通道同时存在，导致乱码现象
                            resolve();
                        } else if (data.status == -1) {
                            stream.close();
                            reject("文件下载失败!");
                        } else if (data.status == 0) {
                            if (progressCallback) {
                                progressCallback(data);
                            }
                        }
                    })
                }).on('error', (err) => {
                    Print.error(`[SCP] Channel ${stream.outgoing.id} 错误:`, err.message);
                    stream.close();
                    reject(err.message);
                }).on('close', (code) => {
                    Print.debug(`[SCP] Channel ${stream.outgoing.id} 关闭，退出码: ${code}`);
                    this._resetTransferState();
                }).on('end', () => {
                    Print.debug(`[SCP] Channel ${stream.outgoing.id} 数据传输结束`);
                });
            });
        });
    }

    /**************************************************************
     * @todo 处理 SCP 协议数据
     * @property {string} stream       - SSH2 数据加密传输通道
     * @property {buffer} chunk        - SCP服务器响应数据
     * @property {funtion} callback    - 回调函数
     **************************************************************/
    async recv(stream, chunk, callback) {
        // 检查第一个字节可以快速判断SCP响应头状态
        try {
            const firstByte = chunk[0];
            if (firstByte === 0x01 || firstByte === 0x02) {
                const errorMsg = chunk.slice(1).toString(); // 错误消息一定是文本类型
                stream.close(); // 新增：错误时关闭 stream
                Print.error('SCP 错误:', errorMsg);
                return;
            }
            // 根据当前状态处理数据
            switch (this.recvState) {
                case SCP_STATE.WAITING_HEADER:
                    this._recvHeader(stream, chunk, callback);
                    break;
                case SCP_STATE.RECEIVING_FILE:
                    await this._recvFile(stream, chunk, callback);
                    break;
                case SCP_STATE.RECEIVING_DIR:
                    this._recvDir(stream, chunk, callback);
                    break;
            }
        } catch (e) {
            Print.error(e.message);
        }
    }

    /**************************************************************
     * @todo 接受SCP服务器响应的数据内容
     * @property {string} stream    - SSH2 数据加密传输通道
     * @property {buffer} data      - SCP服务器响应数据
     * @property {ctx} ctx          - 缓存SCP服务器响应的数据
     * @property {funtion} callback - 回调函数
     **************************************************************/
    _recvHeader(stream, data, callback) {
        let newBuffer = Buffer.concat([this.buffer, data]);
        // 查找换行符位置（SCP文件元信息结束标记）
        const newlineIndex = newBuffer.indexOf(0x0A); // \n 的 ASCII 码
        if (newlineIndex === -1) {
            return;  // 协议头还未完整接收
        }
        // 提取完整的协议头（包含换行符）
        const fullHeader = newBuffer.subarray(0, newlineIndex + 1);
        // let hexDump = new HexDump(fullHeader, 23);
        // hexDump.console();
        // 重置 headerBuffer
        this.buffer = Buffer.alloc(0);
        const scpHeader = fullHeader.toString();
        // 解析SCP协议头
        if (scpHeader[0] === 'C') {
            this.fileInfo = this._parseFileInfo(scpHeader);
            stream.write(Buffer.from([0]));  // 发送确认消息给SCP服务器, 客户端准备接收文件数据
            this.recvState = SCP_STATE.RECEIVING_FILE;
        } else if (scpHeader[0] === 'D') {
            this._recvDir(stream, chunk);
        } else {
            Print.error('未知的协议头:', scpHeader);
            stream.write('\x02');
            stream.close();
        }
    }


    /**************************************************************
     * @todo 接受SCP服务器响应的数据内容
     * @property {string} stream    - SSH2 数据加密传输通道
     * @property {buffer} chunk      - SCP服务器响应数据
     * @property {funtion} callback - 回调函数
     **************************************************************/
    async _recvFile(stream, chunk, callback) {
        if (!this.localFile) {
            await Utils.ensureDir(this.localFilePath, true);
            this.localFile = fs.openSync(this.localFilePath, 'w');
        }
        // 同步写入数据块到文件,防止异步写带来的顺序问题
        const bytesWritten = fs.writeSync(this.localFile, chunk, 0, chunk.length, this.recvFileBytes);
        this.recvFileBytes += chunk.length;
        // 验证写入完整性
        if (bytesWritten !== chunk.length) {
            throw new Error(`写入不完整: 预期 ${chunk.length}, 实际 ${bytesWritten}`);
        }
        // let hexDump = new HexDump(chunk, 16);
        // hexDump.console();
        const progressPercent = Math.min((this.recvFileBytes / this.fileInfo.size * 100), 100).toFixed(1);
        const currentProgress = Math.floor(progressPercent);
        if (currentProgress !== this.lastProgress || this.recvFileBytes === this.fileInfo.size) {
            callback({
                status: 0,
                progress: `${progressPercent}%`,
                recvBytes: this.recvFileBytes,
                totalBytes: this.fileInfo.size,
                filename: this.fileInfo.name
            });
            this.lastProgress = currentProgress;
        }
        if (this.recvFileBytes >= this.fileInfo.size) {
            if (this.localFile) {
                fs.closeSync(this.localFile);
            }
            Print.debug("文件结束完毕，发送应答码");
            stream.write(Buffer.from([0])); // 发送确认消息给SCP服务器,已完成一次数据传输
            callback({
                status: 1,
                progress: '100%',
                recvBytes: this.recvFileBytes,
                totalBytes: this.fileInfo.size,
                filename: this.fileInfo.name,
                message: '文件传输完成'
            });
            this._resetTransferState();
        }
    }

    _recvDir(stream, chunk, callback) {
        Print.error('SCP 目录传输暂不支持');
        stream.write('\x02');
        stream.close();
    }

    /**
     * 重置传输状态
     */
    _resetTransferState() {
        this.recvState = SCP_STATE.WAITING_HEADER;
        this.fileInfo = null;
        this.recvFileBytes = 0;
        this.lastProgress = 0;
        this.localFile = null;
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
            name: match[3].trim()
        };
    }
}


export default SCPClient;