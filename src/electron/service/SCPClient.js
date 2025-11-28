

import * as fs from 'fs'; // 核心修复：直接导入完整 fs 模块（含同步+异步）
import path from 'path';
import HexDump from "../core/HexDump.js";

const SCP_STATE = {
    WAITING_HEADER: 0,
    RECEIVING_FILE: 1,
    RECEIVING_DIR: 2
};
class SCPClient {
    constructor(remoteFileAbsPath, localFileAbsPath) {
        this.remoteFilePath = remoteFileAbsPath;
        this.localFilePath = localFileAbsPath;
        this.localFile = null;
        this.state = SCP_STATE.WAITING_HEADER;
        this.buffer = Buffer.alloc(0);
        this.recvFileSize = 0;
        this.fileInfo = null;
        this.lastProgress = 0;
        this.localFileStream = null;
    }

    /**************************************************************
     * @todo 处理 SCP 协议数据
     * @property {string} stream       - SSH2 数据加密传输通道
     * @property {buffer} chunk         - SCP服务器响应数据
     * @property {funtion} callback    - 回调函数
     **************************************************************/
    recv(stream, chunk, callback) {
        // 使用第一个字节进行快速判断，避免整个 Buffer 转字符串
        const firstByte = chunk[0];
        // 检查控制字符（错误/警告消息）
        if (firstByte === 0x01 || firstByte === 0x02) {
            // 只在需要时转换错误消息部分
            const errorMsg = chunk.slice(1).toString();
            console.error('SCP 错误:', errorMsg);
            return;
        }
        // 根据当前状态处理数据
        switch (this.state) {
            case SCP_STATE.WAITING_HEADER:
                this._recvHeader(stream, chunk, callback);
                break;
            case SCP_STATE.RECEIVING_FILE:
                this._recvFile(stream, chunk, callback);
                break;
            case SCP_STATE.RECEIVING_DIR:
                this._recvDir(stream, chunk, callback);
                break;
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
        // 查找换行符位置（协议头结束标记）
        const newlineIndex = newBuffer.indexOf(0x0A); // \n 的 ASCII 码
        if (newlineIndex === -1) {
            // 协议头还未完整接收
            return;
        }
        // 提取完整的协议头（包含换行符）
        const fullHeader = newBuffer.subarray(0, newlineIndex + 1);
        // 重置 headerBuffer，剩余数据后续处理
        this.buffer = Buffer.alloc(0);
        // SCP文件元数据是文本信息
        const scpHeader = fullHeader.toString();
        // 解析SCP协议头
        if (scpHeader[0] === 'C') {
            this.fileInfo = this._parseFileInfo(scpHeader);
            console.log(`接收文件: ${this.fileInfo.name}, 大小: ${this.fileInfo.size} bytes`);
            callback({ status: 0, progress: '0%', recvBytes: 0, filename: this.fileInfo.name });
            stream.write(Buffer.from([0]));  // 发送确认消息给SCP服务器,准备接收文件数据

            // 切换到文件接收状态
            this.state = SCP_STATE.RECEIVING_FILE;
        }
        else if (scpHeader[0] === 'D') {
            this._recvDir(stream, chunk);
        }
        else {
            console.error('未知的协议头:', scpHeader);
            stream.write('\x02');
        }
    }


    /**************************************************************
     * @todo 接受SCP服务器响应的数据内容
     * @property {string} stream    - SSH2 数据加密传输通道
     * @property {buffer} chunk      - SCP服务器响应数据
     * @property {funtion} callback - 回调函数
     **************************************************************/
    _recvFile(stream, chunk, callback) {
        if (!this.localFile) {
            // 确保目录存在
            const dir = path.dirname(this.localFilePath);
            console.log("递归创建文件夹");
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.localFile = fs.openSync(this.localFilePath, 'w');
        }
        // 同步写入数据块到文件,防止异步写带来的顺序问题
        console.log("本地写入数据....", chunk.length);
        const bytesWritten = fs.writeSync(this.localFile, chunk, 0, chunk.length, this.recvFileSize);
        this.recvFileSize += chunk.length;
        // 验证写入完整性
        if (bytesWritten !== chunk.length) {
            throw new Error(`写入不完整: 预期 ${chunk.length}, 实际 ${bytesWritten}`);
        }
        let hexDump = new HexDump(chunk, 16);
        hexDump.console();


        const progressPercent = Math.min((this.recvFileSize / this.fileInfo.size * 100), 100).toFixed(1);
        const currentProgress = Math.floor(progressPercent);
        if (currentProgress !== this.lastProgress || this.recvFileSize === this.fileInfo.size) {
            callback({
                status: 0,
                progress: `${progressPercent}%`,
                recvBytes: this.recvFileSize,
                totalBytes: this.fileInfo.size,
                filename: this.fileInfo.name
            });
            this.lastProgress = currentProgress;
        }
        if (this.recvFileSize >= this.fileInfo.size) {
            if (this.localFile) {
                console.log("关闭文件");
                fs.closeSync(this.localFile);
            }
            stream.write(Buffer.from([0])); // 发送确认消息给SCP服务器
            callback({
                status: 1,
                progress: '100%',
                recvBytes: this.recvFileSize,
                totalBytes: this.fileInfo.size,
                filename: this.fileInfo.name,
                message: '文件传输完成'
            });
            // 重置状态
            this._resetTransferState();
        }
    }

    _recvDir(stream, chunk, callback) {
        console.log('SCP 目录传输暂不支持');
        stream.write('\x02');
    }

    /**
     * 重置传输状态
     */
    _resetTransferState() {
        this.state = SCP_STATE.WAITING_HEADER;
        this.fileInfo = null;
        this.recvFileSize = 0;
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