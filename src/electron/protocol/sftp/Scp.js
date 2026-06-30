class Scp {

    /**
     * 创建目录（通过 SSH 命令）
     */
    static async mkdir(conn, remotePath, recursive = true) {
        const cmd = recursive ? `mkdir -p '${remotePath}'` : `mkdir '${remotePath}'`;
        const result = await this._exec(conn.sshClient, cmd);
        if (result.code !== 0) {
            throw new Error(`创建目录失败: ${result.stderr}`);
        }
        return result;
    }

    /**
     * 删除目录（通过 SSH 命令）
     */   
    static async rmdir(conn, remotePath, options = {}){
        let cmd;
        if (options.recursive) {
            cmd = `rm -rf '${remotePath}'`;
        } else if (options.force) {
            cmd = `rm -f '${remotePath}'`;
        } else {
            cmd = `rm '${remotePath}'`;
        }
        const result = await this._exec(conn.sshClient, cmd);
        if (result.code !== 0) {
            throw new Error(`删除文件夹失败: ${result.stderr}`);
        }
        return result;
    }

    /**
     * 删除文件/目录（通过 SSH 命令）
     */
    static async delete(conn, remotePath, options = {}) {
        let cmd;
        if (options.recursive) {
            cmd = `rm -rf '${remotePath}'`;
        } else if (options.force) {
            cmd = `rm -f '${remotePath}'`;
        } else {
            cmd = `rm '${remotePath}'`;
        }
        const result = await this._exec(conn.sshClient, cmd);
        if (result.code !== 0) {
            throw new Error(`删除失败: ${result.stderr}`);
        }
        return result;
    }

    /**
     * 重命名（通过 SSH 命令）
     */
    static async rename(conn, oldPath, newPath) {
        const cmd = `mv '${oldPath}' '${newPath}'`;
        const result = await this._exec(conn.sshClient, cmd);
        if (result.code !== 0) {
            throw new Error(`重命名失败: ${result.stderr}`);
        }
        return result;
    }

    /**
     * 检查路径是否存在（通过 SSH 命令）
     */
    static async exists(conn, remotePath) {
        const cmd = `test -e '${remotePath}' && echo "exists" || echo "notexists"`;
        const result = await this._exec(conn.sshClient, cmd);
        return result.stdout.trim() === 'exists';
    }

    /**
     * 获取文件状态（通过 SSH 命令）
     */
    static async stat(conn, remotePath) {
        // 使用 stat 命令获取详细信息
        const cmd = `stat -c '%s|%F|%a|%U|%G|%Y' '${remotePath}' 2>/dev/null || echo "NOTFOUND"`;
        const result = await this._exec(conn.sshClient, cmd);

        if (result.stdout.trim() === 'NOTFOUND') {
            throw new Error(`路径不存在: ${remotePath}`);
        }

        const parts = result.stdout.trim().split('|');
        if (parts.length < 6) {
            throw new Error(`无法解析文件状态: ${result.stdout}`);
        }

        const [size, type, mode, owner, group, mtime] = parts;

        return {
            size: parseInt(size, 10),
            isDirectory: type === 'directory',
            isFile: type === 'regular file' || type === 'regular empty file',
            mode: parseInt(mode, 8),
            owner,
            group,
            mtime: new Date(parseInt(mtime, 10) * 1000)
        };
    }


    /**
     * 通过 SCP 协议读取文件
     * @param {Object} conn - SSH 连接 { _sshClient, _sftpClient }
     * @param {string} remotePath - 远程文件路径
     * @param {string} encoding - 编码（默认 utf-8）
     * @returns {Promise<string|Buffer>}
     */
    static async readFile(conn, remotePath, encoding = 'utf-8') {
        return new Promise((resolve, reject) => {
            const sshClient = conn.sshClient;

            // 1. 执行 scp -f 命令（从远程获取文件）
            sshClient.exec(`scp -f '${remotePath}'`, (err, stream) => {
                if (err) {
                    return reject(new Error(`SCP 执行失败: ${err.message}`));
                }

                let fileInfo = null;
                let fileData = Buffer.alloc(0);
                let isHeader = true;

                // 2. 处理数据流
                stream.on('data', (chunk) => {
                    if (isHeader) {
                        // 解析文件元信息
                        const header = chunk.toString('utf-8');
                        const match = header.match(/^C([0-7]{4})\s+(\d+)\s+([^\n]+)\n/);

                        if (match) {
                            fileInfo = {
                                mode: parseInt(match[1], 8),
                                size: parseInt(match[2], 10),
                                name: match[3].trim()
                            };

                            // 发送 ACK (0x00) 告诉服务器继续
                            stream.write(Buffer.from([0]));
                            isHeader = false;

                            // 处理剩余数据（可能包含文件内容）
                            const remaining = chunk.slice(header.length);
                            if (remaining.length > 0) {
                                fileData = Buffer.concat([fileData, remaining]);
                            }
                        } else {
                            // 可能收到错误信息
                            reject(new Error(`SCP 协议错误: ${header}`));
                        }
                    } else {
                        // 累积文件数据
                        fileData = Buffer.concat([fileData, chunk]);
                    }
                });

                // 3. 处理 stderr（错误信息）
                stream.stderr.on('data', (data) => {
                    reject(new Error(`SCP 错误: ${data.toString('utf-8')}`));
                });

                // 4. 流关闭 - 完成传输
                stream.on('close', () => {
                    if (fileInfo) {
                        // 检查数据完整性
                        if (fileData.length !== fileInfo.size) {
                            reject(new Error(
                                `文件大小不匹配: 期望 ${fileInfo.size}, 实际 ${fileData.length}`
                            ));
                            return;
                        }

                        // 发送结束 ACK
                        stream.write(Buffer.from([0]));

                        // 返回数据
                        const result = encoding ? fileData.toString(encoding) : fileData;
                        resolve(result);
                    } else {
                        reject(new Error('SCP 传输失败: 未收到文件信息'));
                    }
                });

                // 5. 错误处理
                stream.on('error', (err) => {
                    reject(new Error(`SCP 流错误: ${err.message}`));
                });
            });
        });
    }

    /**
     * 通过 SCP 协议写入文件
     * @param {Object} conn - SSH 连接
     * @param {string} remotePath - 远程文件路径
     * @param {string|Buffer} content - 文件内容
     */
    static async writeFile(conn, remotePath, content) {
        return new Promise((resolve, reject) => {
            const sshClient = conn.sshClient;
            const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
            const fileName = remotePath.split('/').pop();

            // 1. 执行 scp -t（目标模式，写入远程）
            sshClient.exec(`scp -t '${remotePath}'`, (err, stream) => {
                if (err) {
                    return reject(new Error(`SCP 执行失败: ${err.message}`));
                }

                let ackReceived = false;
                let readyToSend = false;

                // 2. 发送文件元信息
                stream.on('data', (chunk) => {
                    // 服务器返回 0x00 表示准备接收
                    if (chunk[0] === 0 && !readyToSend) {
                        readyToSend = true;
                        // 发送文件信息: C0644 size filename
                        const header = `C0644 ${contentBuffer.length} ${fileName}\n`;
                        stream.write(header);
                    } else if (chunk[0] === 0 && readyToSend && !ackReceived) {
                        ackReceived = true;
                        // 发送文件数据
                        stream.write(contentBuffer);
                        // 发送结束标志（0x00）
                        stream.write(Buffer.from([0]));
                        resolve();
                    } else {
                        // 错误响应
                        const errMsg = chunk.toString('utf-8');
                        reject(new Error(`SCP 服务器错误: ${errMsg}`));
                    }
                });

                // 3. 处理错误
                stream.stderr.on('data', (data) => {
                    reject(new Error(`SCP 错误: ${data.toString('utf-8')}`));
                });

                stream.on('error', (err) => {
                    reject(new Error(`SCP 流错误: ${err.message}`));
                });
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
    static async downloadFile(conn, remoteFilePath, localFilePath, onProgress) {
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
    static async _awaitScpServerFileInfo(stream) {
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
    static _parseFileInfo(scpHeader) {
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
    static async _downloadFileInChunk(stream, localFile, fileInfo, onProgress) {
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


    /**************************************************************
     * 文件夹SCP下载（支持断点续传+进度回调）
     * @param {string} host -- SSH服务器地址
     * @param {string} remoteDir - 远程文件夹路径
     * @param {string} localDir - 本地文件夹路径
     * @param {ProgressCallback} [onProgress] - 进度回调
     * @returns {Promise<void>}
     **************************************************************/
    static async scpDownloadDir(host, remoteDir, localDir, onProgress) {
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
    static async uploadFile(conn, localFile, remoteFile, onProgress) {
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
    static _uploadFileInChunk(stream, localFile, fileSize, onProgress) {
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
    static async scpUploadDir(host, localDir, remoteDir, onProgress) {
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
    static async scanLocalDir(localDir) {
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
    static async _exec(conn, command, options = {}) {
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
    static getStandardTime({ month, day, time }) {
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
    static async listDir(host, remoteDir) {
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

            let lsResult = await this._exec(conn, lsCmd);
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
    static async scanRemoteDir(conn, remoteDir) {
        const files = [];
        const dirs = [];
        const dirSet = new Set();
        let totalBytes = 0;
        // 标准化远程目录（确保结尾无斜杠，避免路径拼接重复）
        const normalizedRemoteDir = remoteDir.replace(/\/$/, "");
        try {
            // BusyBox 兼容的 ls 命令：-l（详细信息）、-R（递归）、-A（显示隐藏文件，不含.和..）
            const lsCmd = `ls -lRA '${normalizedRemoteDir}' 2>/dev/null`;
            let lsResult = await this._exec(conn, lsCmd);
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
    static filterNeedTransferFiles(sourceFiles, targetFiles) {
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
    static async _readScpServerResponse(stream) {
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
    static async _sendAckToScpServer(stream, stepName) {
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
    static async _awaitScpServerAck(stream, stepName) {
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
    static _awaitUploadFinishAck(stream, stepName) {
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