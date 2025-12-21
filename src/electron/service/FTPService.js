import { Client, errors as FtpErrors } from "basic-ftp";
import EventEmitter from "events";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, readdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join, basename, resolve } from "path";
import { Throttle } from "throttle";

/**
 * 操作类型枚举
 */
const OperationType = {
  UPLOAD_FILE: "upload_file",
  DOWNLOAD_FILE: "download_file",
  UPLOAD_DIR: "upload_dir",
  DOWNLOAD_DIR: "download_dir"
};

/**
 * 生成主机唯一标识（host:port）
 * @param {string} host 主机IP/域名
 * @param {number} port 端口
 * @returns {string} 主机唯一标识
 */
const getHostKey = (host, port = 21) => {
  return `${host}:${port}`;
};

/**
 * 增强版FTP服务类（单例）
 * 优化：统计与收藏按主机（host:port）区分管理
 */
class FTPService extends EventEmitter {
  // 单例实例
  static #instance = null;
  // 服务器连接缓存（key: 主机唯一标识, value: 客户端实例+配置）
  #connectionCache = new Map();
  // 传输任务队列（用于并发控制）
  #taskQueue = new Map();
  // 默认配置
  #defaultConfig = {
    port: 21,
    user: "anonymous",
    password: "anonymous@",
    secure: false, // false:FTP, true:FTPS显式模式
    secureOptions: {}, // TLS配置
    timeout: 30000, // 连接超时时间
    retryCount: 3, // 自动重连重试次数
    retryDelay: 2000, // 重连延迟（毫秒）
    concurrency: 3, // 并发传输数
    throttleRate: 1024 * 1024, // 流控速率（1MB/s，可动态调整）
    historySavePath: resolve("./ftp-operation-history.json"), // 历史记录序列化保存路径
  };
  // 传输统计数据（按主机分组，key: 主机唯一标识, value: 统计数据）
  #transferStats = new Map();
  // 操作历史记录（不按主机分组，记录中包含主机信息，便于全局查询）
  #operationHistory = {
    uploadFile: [], // 上传文件历史
    downloadFile: [], // 下载文件历史
    uploadDir: [], // 上传目录历史
    downloadDir: [], // 下载目录历史
  };
  // 收藏列表（按主机分组，key: 主机唯一标识, value: 对应主机的收藏数据）
  #favorites = new Map();

  // 私有构造函数（确保单例）
  constructor() {
    super();
    if (FTPService.#instance) {
      return FTPService.#instance;
    }
    FTPService.#instance = this;
    // 初始化时反序列化历史记录
    this.#deserializeHistory();
  }

  /**
   * 获取单例实例
   * @returns {FTPService}
   */
  static getInstance() {
    if (!FTPService.#instance) {
      new FTPService();
    }
    return FTPService.#instance;
  }

  /**
   * 获取/创建服务器连接
   * @param {string} host 服务器IP/域名
   * @param {Object} config 连接配置（覆盖默认配置）
   * @returns {Promise<Client>} FTP客户端实例
   */
  async #getConnection(host, config = {}) {
    const finalConfig = { ...this.#defaultConfig, ...config };
    const hostKey = getHostKey(host, finalConfig.port);

    // 初始化该主机的统计数据（若不存在）
    if (!this.#transferStats.has(hostKey)) {
      this.#transferStats.set(hostKey, {
        totalUploadFiles: 0, // 总上传文件数量（累计）
        pendingUploadFiles: 0, // 待上传文件数量
        uploadingFiles: 0, // 进行中上传文件数量
        completedUploadFiles: 0, // 已完成上传文件数量
        failedUploadFiles: 0, // 上传失败文件数量
        totalDownloadFiles: 0, // 总下载文件数量（累计）
        pendingDownloadFiles: 0, // 待下载文件数量
        downloadingFiles: 0, // 进行中下载文件数量
        completedDownloadFiles: 0, // 已完成下载文件数量
        failedDownloadFiles: 0, // 下载失败文件数量
      });
    }

    // 初始化该主机的收藏列表（若不存在）
    if (!this.#favorites.has(hostKey)) {
      this.#favorites.set(hostKey, {
        uploadFile: [], // 收藏的上传文件记录
        downloadFile: [], // 收藏的下载文件记录
        uploadDir: [], // 收藏的上传目录记录
        downloadDir: [], // 收藏的下载目录记录
      });
    }

    // 检查缓存连接是否有效
    if (this.#connectionCache.has(hostKey)) {
      const { client, config: cachedConfig } = this.#connectionCache.get(hostKey);
      if (client.closed === false) {
        try {
          // 验证连接有效性
          await client.send("NOOP");
          return client;
        } catch (err) {
          this.emit("warn", `[${hostKey}] 连接失效，将重新连接`);
        }
      }
    }

    // 创建新客户端
    const client = new Client();
    client.ftp.verbose = false;
    client.timeout = finalConfig.timeout;

    // 连接重试逻辑
    let retryLeft = finalConfig.retryCount;
    const connect = async () => {
      try {
        await client.access({
          host,
          port: finalConfig.port,
          user: finalConfig.user,
          password: finalConfig.password,
          secure: finalConfig.secure,
          secureOptions: finalConfig.secureOptions,
        });
        this.#connectionCache.set(hostKey, { client, config: finalConfig });
        this.emit("connect", `[${hostKey}] 连接成功`);
        return client;
      } catch (err) {
        retryLeft--;
        if (retryLeft <= 0) {
          this.emit("error", `[${hostKey}] 连接失败（已重试${finalConfig.retryCount}次）：${err.message}`);
          throw err;
        }
        this.emit("retry", `[${hostKey}] 连接失败，剩余重试次数${retryLeft}，延迟${finalConfig.retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, finalConfig.retryDelay));
        return connect();
      }
    };

    return connect();
  }

  /**
   * 流控包装（防止网络抖动导致数据丢失）
   * @param {Readable|Writable} stream 数据流
   * @returns {Throttle} 带流控的数据流
   */
  #wrapThrottle(stream) {
    const throttle = new Throttle(this.#defaultConfig.throttleRate);
    return stream.pipe(throttle);
  }

  /**
   * 获取文件大小（本地/远程）
   * @param {string} path 文件路径
   * @param {boolean} isRemote 是否为远程文件
   * @param {Client} client FTP客户端
   * @returns {Promise<number>} 文件大小（字节）
   */
  async #getFileSize(path, isRemote, client = null) {
    if (!isRemote) {
      return statSync(path).size;
    } else {
      const stats = await client.size(path);
      return stats.size;
    }
  }

  /**
   * 断点续传-获取已传输大小
   * @param {string} localPath 本地文件路径
   * @param {string} remotePath 远程文件路径
   * @param {Client} client FTP客户端
   * @returns {Promise<number>} 已传输字节数
   */
  async #getResumedSize(localPath, remotePath, client) {
    let resumedSize = 0;
    // 本地文件已存在，获取本地大小
    if (existsSync(localPath)) {
      resumedSize = statSync(localPath).size;
    }
    // 远程文件存在，验证大小一致性
    try {
      const remoteSize = await this.#getFileSize(remotePath, true, client);
      if (resumedSize > remoteSize) {
        resumedSize = 0; // 本地文件大于远程，重新上传/下载
      }
    } catch (err) {
      resumedSize = 0; // 远程文件不存在，从头开始
    }
    return resumedSize;
  }

  /**
   * 更新指定主机的传输统计数据
   * @param {string} hostKey 主机唯一标识
   * @param {Object} statsUpdate 统计数据更新对象
   */
  #updateTransferStats(hostKey, statsUpdate) {
    if (!this.#transferStats.has(hostKey)) {
      this.emit("warn", `[${hostKey}] 主机统计数据未初始化，无法更新`);
      return;
    }
    const currentStats = this.#transferStats.get(hostKey);
    const newStats = { ...currentStats, ...statsUpdate };
    this.#transferStats.set(hostKey, newStats);
    this.emit("statsUpdate", `[${hostKey}] 传输统计数据已更新`, this.getTransferStats(hostKey));
  }

  /**
   * 添加操作历史记录（记录中包含主机信息）
   * @param {string} operationType 操作类型（对应OperationType）
   * @param {Object} record 操作记录详情
   * @param {string} hostKey 主机唯一标识
   */
  #addOperationHistory(operationType, record, hostKey) {
    const finalRecord = {
      ...record,
      hostKey, // 关联主机唯一标识
      host: record.host, // 保留原始主机信息
      port: record.port || this.#defaultConfig.port, // 保留端口信息
      operateTime: new Date().toISOString(), // 操作时间（ISO格式）
      id: Date.now() + Math.random().toString(36).substr(2, 9), // 唯一ID
      isFavorite: false // 默认未收藏
    };

    // 添加到对应历史列表
    if (this.#operationHistory[operationType]) {
      this.#operationHistory[operationType].unshift(finalRecord); // 插入到头部（最新在前）
      // 按操作时间排序（默认最近操作在前）
      this.#sortHistory(operationType);
      // 序列化保存
      this.#serializeHistory();
      this.emit("historyAdd", `[${hostKey}] [${operationType}] 操作历史已添加`, finalRecord);
    } else {
      this.emit("warn", `未知的操作类型：${operationType}，无法添加历史记录`);
    }
  }

  /**
   * 排序操作历史（默认按最近操作时间降序）
   * @param {string} operationType 操作类型
   * @param {Function} [customSort] 自定义排序函数
   */
  #sortHistory(operationType, customSort) {
    if (!this.#operationHistory[operationType]) {
      this.emit("warn", `未知的操作类型：${operationType}，无法排序`);
      return;
    }

    if (customSort) {
      this.#operationHistory[operationType].sort(customSort);
    } else {
      // 默认按操作时间降序（最近的在前）
      this.#operationHistory[operationType].sort((a, b) => {
        return new Date(b.operateTime) - new Date(a.operateTime);
      });
    }

    this.#serializeHistory();
    this.emit("historySort", `[${operationType}] 操作历史已排序`);
  }

  /**
   * 序列化操作历史与收藏列表（保存到文件）
   */
  #serializeHistory() {
    // 转换Map为可序列化的对象
    const transferStatsObj = Object.fromEntries(this.#transferStats);
    const favoritesObj = Object.fromEntries(this.#favorites);

    const saveData = {
      operationHistory: this.#operationHistory,
      favorites: favoritesObj,
      transferStats: transferStatsObj,
      defaultConfig: this.#defaultConfig // 保存默认配置
    };

    try {
      writeFileSync(this.#defaultConfig.historySavePath, JSON.stringify(saveData, null, 2), "utf8");
      this.emit("serializeComplete", `操作历史已序列化保存到：${this.#defaultConfig.historySavePath}`);
    } catch (err) {
      this.emit("error", `序列化操作历史失败：${err.message}`);
    }
  }

  /**
   * 反序列化操作历史与收藏列表（从文件读取）
   */
  #deserializeHistory() {
    if (!existsSync(this.#defaultConfig.historySavePath)) {
      this.emit("warn", `历史记录文件不存在：${this.#defaultConfig.historySavePath}，将创建新文件`);
      this.#serializeHistory();
      return;
    }

    try {
      const saveData = JSON.parse(readFileSync(this.#defaultConfig.historySavePath, "utf8"));
      // 恢复操作历史
      if (saveData.operationHistory) {
        this.#operationHistory = saveData.operationHistory;
      }
      // 恢复收藏列表（转换为Map）
      if (saveData.favorites) {
        this.#favorites = new Map(Object.entries(saveData.favorites));
      }
      // 恢复传输统计（转换为Map）
      if (saveData.transferStats) {
        this.#transferStats = new Map(Object.entries(saveData.transferStats));
      }
      // 恢复默认配置
      if (saveData.defaultConfig) {
        this.#defaultConfig = { ...this.#defaultConfig, ...saveData.defaultConfig };
      }
      this.emit("deserializeComplete", `操作历史已从：${this.#defaultConfig.historySavePath} 反序列化加载`);
    } catch (err) {
      this.emit("error", `反序列化操作历史失败：${err.message}，将使用默认空数据`);
    }
  }

  /**
   * 单个文件上传（支持断点续传、进度回调）
   * @param {string} localPath 本地文件路径
   * @param {string} remotePath 远程文件路径
   * @param {Object} options 配置项
   * @param {string} options.host 服务器IP/域名
   * @param {number} options.port 服务器端口
   * @param {Function} [options.onProgress] 进度回调 (progress) => {}
   * @param {Object} [options.config] 连接配置
   * @returns {Promise<void>}
   */
  async #uploadSingleFile(localPath, remotePath, options) {
    const { host, port, onProgress, config = {} } = options;
    const hostKey = getHostKey(host, port);
    let client;

    try {
      // 更新统计：待上传-1，进行中+1
      this.#updateTransferStats(hostKey, {
        pendingUploadFiles: Math.max(0, this.getTransferStats(hostKey).pendingUploadFiles - 1),
        uploadingFiles: this.getTransferStats(hostKey).uploadingFiles + 1
      });

      // 获取连接
      client = await this.#getConnection(host, config);
      // 获取已传输大小
      const resumedSize = await this.#getResumedSize(localPath, remotePath, client);
      const fileSize = await this.#getFileSize(localPath, false);

      if (resumedSize >= fileSize) {
        this.emit("complete", `[${hostKey}] [${remotePath}] 已存在，无需重复上传`);
        onProgress?.({ percent: 100, transferred: fileSize, total: fileSize });
        // 更新统计：进行中-1，已完成+1
        this.#updateTransferStats(hostKey, {
          uploadingFiles: Math.max(0, this.getTransferStats(hostKey).uploadingFiles - 1),
          completedUploadFiles: this.getTransferStats(hostKey).completedUploadFiles + 1
        });
        // 添加历史记录
        this.#addOperationHistory(OperationType.UPLOAD_FILE, {
          localPath,
          remotePath,
          host,
          port,
          status: "skipped", // 跳过
          fileSize
        }, hostKey);
        return;
      }

      // 创建读取流（从断点位置开始）
      const readStream = createReadStream(localPath, { start: resumedSize });
      const throttledStream = this.#wrapThrottle(readStream);

      // 进度监控
      let transferred = resumedSize;
      throttledStream.on("data", (chunk) => {
        transferred += chunk.length;
        const percent = ((transferred / fileSize) * 100).toFixed(2);
        const progress = { percent: parseFloat(percent), transferred, total: fileSize };
        this.emit("uploadProgress", { hostKey, remotePath, ...progress });
        onProgress?.(progress);
      });

      // 断点续传上传
      await client.upload(throttledStream, remotePath, resumedSize);
      this.emit("uploadComplete", `[${hostKey}] [${remotePath}] 上传成功`);

      // 更新统计：进行中-1，已完成+1
      this.#updateTransferStats(hostKey, {
        uploadingFiles: Math.max(0, this.getTransferStats(hostKey).uploadingFiles - 1),
        completedUploadFiles: this.getTransferStats(hostKey).completedUploadFiles + 1
      });

      // 添加历史记录
      this.#addOperationHistory(OperationType.UPLOAD_FILE, {
        localPath,
        remotePath,
        host,
        port,
        status: "success", // 成功
        fileSize,
        resumedSize,
        actualUploadSize: fileSize - resumedSize
      }, hostKey);
    } catch (err) {
      // 更新统计：进行中-1，失败+1
      this.#updateTransferStats(hostKey, {
        uploadingFiles: Math.max(0, this.getTransferStats(hostKey).uploadingFiles - 1),
        failedUploadFiles: this.getTransferStats(hostKey).failedUploadFiles + 1
      });

      // 连接断开自动重连
      if (err instanceof FtpErrors.ConnectionError) {
        this.emit("error", `[${hostKey}] [${remotePath}] 传输中断，将自动重连`);
        // 移除失效连接
        this.#connectionCache.delete(hostKey);
        // 重试上传
        return this.#uploadSingleFile(localPath, remotePath, options);
      }

      this.emit("error", `[${hostKey}] [${remotePath}] 上传失败：${err.message}`);
      // 添加历史记录
      this.#addOperationHistory(OperationType.UPLOAD_FILE, {
        localPath,
        remotePath,
        host,
        port,
        status: "failed", // 失败
        errorMsg: err.message
      }, hostKey);
      throw err;
    }
  }

  /**
   * 单个文件下载（支持断点续传、进度回调）
   * @param {string} remotePath 远程文件路径
   * @param {string} localPath 本地文件路径
   * @param {Object} options 配置项
   * @param {string} options.host 服务器IP/域名
   * @param {number} options.port 服务器端口
   * @param {Function} [options.onProgress] 进度回调 (progress) => {}
   * @param {Object} [options.config] 连接配置
   * @returns {Promise<void>}
   */
  async #downloadSingleFile(remotePath, localPath, options) {
    const { host, port, onProgress, config = {} } = options;
    const hostKey = getHostKey(host, port);
    let client;

    try {
      // 更新统计：待下载-1，进行中+1
      this.#updateTransferStats(hostKey, {
        pendingDownloadFiles: Math.max(0, this.getTransferStats(hostKey).pendingDownloadFiles - 1),
        downloadingFiles: this.getTransferStats(hostKey).downloadingFiles + 1
      });

      // 获取连接
      client = await this.#getConnection(host, config);
      // 创建本地目录
      const localDir = dirname(localPath);
      if (!existsSync(localDir)) {
        mkdirSync(localDir, { recursive: true });
      }
      // 获取已传输大小
      const resumedSize = await this.#getResumedSize(localPath, remotePath, client);
      const fileSize = await this.#getFileSize(remotePath, true, client);

      if (resumedSize >= fileSize) {
        this.emit("complete", `[${hostKey}] [${localPath}] 已存在，无需重复下载`);
        onProgress?.({ percent: 100, transferred: fileSize, total: fileSize });
        // 更新统计：进行中-1，已完成+1
        this.#updateTransferStats(hostKey, {
          downloadingFiles: Math.max(0, this.getTransferStats(hostKey).downloadingFiles - 1),
          completedDownloadFiles: this.getTransferStats(hostKey).completedDownloadFiles + 1
        });
        // 添加历史记录
        this.#addOperationHistory(OperationType.DOWNLOAD_FILE, {
          remotePath,
          localPath,
          host,
          port,
          status: "skipped", // 跳过
          fileSize
        }, hostKey);
        return;
      }

      // 创建写入流（追加模式）
      const writeStream = createWriteStream(localPath, { flags: "a" });
      // 进度监控
      let transferred = resumedSize;
      const progressMonitor = (chunk) => {
        transferred += chunk.length;
        const percent = ((transferred / fileSize) * 100).toFixed(2);
        const progress = { percent: parseFloat(percent), transferred, total: fileSize };
        this.emit("downloadProgress", { hostKey, localPath, ...progress });
        onProgress?.(progress);
      };

      // 断点续传下载（带流控）
      await client.download(
        (stream) => {
          const throttledStream = this.#wrapThrottle(stream);
          throttledStream.on("data", progressMonitor);
          return throttledStream.pipe(writeStream);
        },
        remotePath,
        resumedSize
      );

      this.emit("downloadComplete", `[${hostKey}] [${localPath}] 下载成功`);

      // 更新统计：进行中-1，已完成+1
      this.#updateTransferStats(hostKey, {
        downloadingFiles: Math.max(0, this.getTransferStats(hostKey).downloadingFiles - 1),
        completedDownloadFiles: this.getTransferStats(hostKey).completedDownloadFiles + 1
      });

      // 添加历史记录
      this.#addOperationHistory(OperationType.DOWNLOAD_FILE, {
        remotePath,
        localPath,
        host,
        port,
        status: "success", // 成功
        fileSize,
        resumedSize,
        actualDownloadSize: fileSize - resumedSize
      }, hostKey);
    } catch (err) {
      // 更新统计：进行中-1，失败+1
      this.#updateTransferStats(hostKey, {
        downloadingFiles: Math.max(0, this.getTransferStats(hostKey).downloadingFiles - 1),
        failedDownloadFiles: this.getTransferStats(hostKey).failedDownloadFiles + 1
      });

      // 连接断开自动重连
      if (err instanceof FtpErrors.ConnectionError) {
        this.emit("error", `[${hostKey}] [${remotePath}] 传输中断，将自动重连`);
        // 移除失效连接
        this.#connectionCache.delete(hostKey);
        // 重试下载
        return this.#downloadSingleFile(remotePath, localPath, options);
      }

      this.emit("error", `[${hostKey}] [${remotePath}] 下载失败：${err.message}`);
      // 添加历史记录
      this.#addOperationHistory(OperationType.DOWNLOAD_FILE, {
        remotePath,
        localPath,
        host,
        port,
        status: "failed", // 失败
        errorMsg: err.message
      }, hostKey);
      throw err;
    }
  }

  /**
   * 并发任务调度
   * @param {Array} tasks 任务数组
   * @param {number} concurrency 并发数
   * @param {string} taskType 任务类型（upload/download）
   * @param {string} hostKey 主机唯一标识
   * @returns {Promise<void>}
   */
  async #scheduleTasks(tasks, concurrency, taskType, hostKey) {
    const taskQueue = [...tasks];
    const running = new Set();

    // 更新总任务数统计
    if (taskType === "upload") {
      this.#updateTransferStats(hostKey, {
        totalUploadFiles: this.getTransferStats(hostKey).totalUploadFiles + taskQueue.length,
        pendingUploadFiles: this.getTransferStats(hostKey).pendingUploadFiles + taskQueue.length
      });
    } else if (taskType === "download") {
      this.#updateTransferStats(hostKey, {
        totalDownloadFiles: this.getTransferStats(hostKey).totalDownloadFiles + taskQueue.length,
        pendingDownloadFiles: this.getTransferStats(hostKey).pendingDownloadFiles + taskQueue.length
      });
    }

    const runTask = async () => {
      if (taskQueue.length === 0 || running.size >= concurrency) {
        return;
      }

      const task = taskQueue.shift();
      running.add(task);

      try {
        await task();
      } catch (err) {
        this.emit("error", `[${hostKey}] 任务执行失败：${err.message}`);
      } finally {
        running.delete(task);
        await runTask();
      }
    };

    // 启动初始并发任务
    const initialTasks = Array(Math.min(concurrency, taskQueue.length)).fill(null);
    await Promise.all(initialTasks.map(runTask));
  }

  // ==================== 原有公开方法（优化，按主机区分统计与收藏） ====================
  /**
   * 上传文件（公开方法）
   * @param {string} localPath 本地文件路径
   * @param {string} remotePath 远程文件路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [options] 配置项
   * @param {Function} [options.onProgress] 进度回调
   * @param {Object} [options.config] 连接配置
   * @returns {Promise<void>}
   */
  async uploadFile(localPath, remotePath, host, options = {}) {
    if (!existsSync(localPath) || statSync(localPath).isDirectory()) {
      throw new Error(`[${localPath}] 不是有效文件`);
    }

    const config = options.config || {};
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);

    // 更新总上传数和待上传数
    this.#updateTransferStats(hostKey, {
      totalUploadFiles: this.getTransferStats(hostKey).totalUploadFiles + 1,
      pendingUploadFiles: this.getTransferStats(hostKey).pendingUploadFiles + 1
    });

    await this.#uploadSingleFile(localPath, remotePath, {
      host,
      port,
      onProgress: options.onProgress,
      config,
    });
  }

  /**
   * 下载文件（公开方法）
   * @param {string} remotePath 远程文件路径
   * @param {string} localPath 本地文件路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [options] 配置项
   * @param {Function} [options.onProgress] 进度回调
   * @param {Object} [options.config] 连接配置
   * @returns {Promise<void>}
   */
  async downloadFile(remotePath, localPath, host, options = {}) {
    const config = options.config || {};
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);

    // 更新总下载数和待下载数
    this.#updateTransferStats(hostKey, {
      totalDownloadFiles: this.getTransferStats(hostKey).totalDownloadFiles + 1,
      pendingDownloadFiles: this.getTransferStats(hostKey).pendingDownloadFiles + 1
    });

    await this.#downloadSingleFile(remotePath, localPath, {
      host,
      port,
      onProgress: options.onProgress,
      config,
    });
  }

  /**
   * 上传文件夹（公开方法，支持并发）
   * @param {string} localDir 本地文件夹路径
   * @param {string} remoteDir 远程文件夹路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [options] 配置项
   * @param {Function} [options.onProgress] 单个文件进度回调
   * @param {Object} [options.config] 连接配置
   * @param {number} [options.concurrency] 并发数（覆盖默认值）
   * @returns {Promise<void>}
   */
  async uploadDir(localDir, remoteDir, host, options = {}) {
    if (!existsSync(localDir) || !statSync(localDir).isDirectory()) {
      throw new Error(`[${localDir}] 不是有效文件夹`);
    }

    const config = options.config || {};
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);

    // 创建远程文件夹
    try {
      await client.ensureDir(remoteDir);
    } catch (err) {
      this.emit("error", `[${hostKey}] 创建远程文件夹[${remoteDir}]失败：${err.message}`);
      throw err;
    }

    // 构建任务队列
    const files = readdirSync(localDir, { withFileTypes: true });
    const tasks = [];
    const concurrency = options.concurrency || this.#defaultConfig.concurrency;

    for (const file of files) {
      const localFilePath = join(localDir, file.name);
      const remoteFilePath = join(remoteDir, file.name);

      if (file.isFile()) {
        // 文件上传任务
        tasks.push(async () => {
          await this.#uploadSingleFile(localFilePath, remoteFilePath, {
            host,
            port,
            onProgress: options.onProgress,
            config,
          });
        });
      } else if (file.isDirectory()) {
        // 递归上传子文件夹
        tasks.push(async () => {
          await this.uploadDir(localFilePath, remoteFilePath, host, options);
        });
      }
    }

    // 调度并发任务
    await this.#scheduleTasks(tasks, concurrency, "upload", hostKey);

    // 添加文件夹上传历史记录
    this.#addOperationHistory(OperationType.UPLOAD_DIR, {
      localDir,
      remoteDir,
      host,
      port,
      fileCount: tasks.length,
      status: "success"
    }, hostKey);

    this.emit("uploadDirComplete", `[${hostKey}] [${localDir}] 文件夹上传完成`);
  }

  /**
   * 下载文件夹（公开方法，支持并发）
   * @param {string} remoteDir 远程文件夹路径
   * @param {string} localDir 本地文件夹路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [options] 配置项
   * @param {Function} [options.onProgress] 单个文件进度回调
   * @param {Object} [options.config] 连接配置
   * @param {number} [options.concurrency] 并发数（覆盖默认值）
   * @returns {Promise<void>}
   */
  async downloadDir(remoteDir, localDir, host, options = {}) {
    const config = options.config || {};
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);

    // 创建本地文件夹
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    // 获取远程文件夹列表
    let remoteFiles;
    try {
      remoteFiles = await client.list(remoteDir);
    } catch (err) {
      this.emit("error", `[${hostKey}] 获取远程文件夹[${remoteDir}]列表失败：${err.message}`);
      throw err;
    }

    // 构建任务队列
    const tasks = [];
    const concurrency = options.concurrency || this.#defaultConfig.concurrency;

    for (const file of remoteFiles) {
      const remoteFilePath = join(remoteDir, file.name);
      const localFilePath = join(localDir, file.name);

      if (file.isFile) {
        // 文件下载任务
        tasks.push(async () => {
          await this.#downloadSingleFile(remoteFilePath, localFilePath, {
            host,
            port,
            onProgress: options.onProgress,
            config,
          });
        });
      } else if (file.isDirectory) {
        // 递归下载子文件夹
        tasks.push(async () => {
          await this.downloadDir(remoteFilePath, localFilePath, host, options);
        });
      }
    }

    // 调度并发任务
    await this.#scheduleTasks(tasks, concurrency, "download", hostKey);

    // 添加文件夹下载历史记录
    this.#addOperationHistory(OperationType.DOWNLOAD_DIR, {
      remoteDir,
      localDir,
      host,
      port,
      fileCount: tasks.length,
      status: "success"
    }, hostKey);

    this.emit("downloadDirComplete", `[${hostKey}] [${localDir}] 文件夹下载完成`);
  }

  /**
   * 关闭指定服务器连接
   * @param {string} host 服务器IP/域名
   * @param {number} [port=21] 端口
   * @returns {Promise<void>}
   */
  async closeConnection(host, port = 21) {
    const hostKey = getHostKey(host, port);
    if (this.#connectionCache.has(hostKey)) {
      const { client } = this.#connectionCache.get(hostKey);
      if (!client.closed) {
        client.close();
        this.#connectionCache.delete(hostKey);
        this.emit("close", `[${hostKey}] 连接已关闭`);
      }
    }
  }

  /**
   * 关闭所有服务器连接
   * @returns {Promise<void>}
   */
  async closeAllConnections() {
    for (const [hostKey, { client }] of this.#connectionCache) {
      if (!client.closed) {
        client.close();
        this.emit("close", `[${hostKey}] 连接已关闭`);
      }
    }
    this.#connectionCache.clear();
    this.emit("closeAll", "所有连接已关闭");
  }

  /**
   * 修改默认配置
   * @param {Object} config 配置项
   */
  setDefaultConfig(config) {
    this.#defaultConfig = { ...this.#defaultConfig, ...config };
    this.emit("configUpdate", "默认配置已更新", this.#defaultConfig);
  }

  // ==================== 原有文件/目录管理方法（优化，添加主机标识） ====================
  /**
   * 创建远程目录（支持多级目录）
   * @param {string} remoteDir 远程目录路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<void>}
   */
  async createDir(remoteDir, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    try {
      await client.ensureDir(remoteDir);
      this.emit("createDirComplete", `[${hostKey}] [${remoteDir}] 远程目录创建成功`);
    } catch (err) {
      this.emit("error", `[${hostKey}] 创建远程目录[${remoteDir}]失败：${err.message}`);
      throw err;
    }
  }

  /**
   * 删除远程目录（需为空目录，若要删除非空目录需先删除内部文件）
   * @param {string} remoteDir 远程目录路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<void>}
   */
  async deleteDir(remoteDir, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    try {
      await client.removeDir(remoteDir);
      this.emit("deleteDirComplete", `[${hostKey}] [${remoteDir}] 远程目录删除成功`);
    } catch (err) {
      this.emit("error", `[${hostKey}] 删除远程目录[${remoteDir}]失败（请确保目录为空）：${err.message}`);
      throw err;
    }
  }

  /**
   * 创建远程空文件
   * @param {string} remoteFilePath 远程文件路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<void>}
   */
  async createFile(remoteFilePath, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    // 创建空流上传（实现空文件创建）
    const emptyStream = createReadStream(null); // 空可读流
    try {
      await client.upload(emptyStream, remoteFilePath);
      this.emit("createFileComplete", `[${hostKey}] [${remoteFilePath}] 远程空文件创建成功`);
    } catch (err) {
      this.emit("error", `[${hostKey}] 创建远程文件[${remoteFilePath}]失败：${err.message}`);
      throw err;
    }
  }

  /**
   * 删除远程文件
   * @param {string} remoteFilePath 远程文件路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<void>}
   */
  async deleteFile(remoteFilePath, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    try {
      await client.remove(remoteFilePath);
      this.emit("deleteFileComplete", `[${hostKey}] [${remoteFilePath}] 远程文件删除成功`);
    } catch (err) {
      this.emit("error", `[${hostKey}] 删除远程文件[${remoteFilePath}]失败：${err.message}`);
      throw err;
    }
  }

  /**
   * 远程目录重命名
   * @param {string} oldRemoteDir 旧远程目录路径
   * @param {string} newRemoteDir 新远程目录路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<void>}
   */
  async renameDir(oldRemoteDir, newRemoteDir, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    try {
      await client.rename(oldRemoteDir, newRemoteDir);
      this.emit("renameDirComplete", `[${hostKey}] [${oldRemoteDir}] 已重命名为 [${newRemoteDir}]`);
    } catch (err) {
      this.emit("error", `[${hostKey}] 目录重命名失败（${oldRemoteDir} → ${newRemoteDir}）：${err.message}`);
      throw err;
    }
  }

  /**
   * 远程文件重命名
   * @param {string} oldRemoteFilePath 旧远程文件路径
   * @param {string} newRemoteFilePath 新远程文件路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<void>}
   */
  async renameFile(oldRemoteFilePath, newRemoteFilePath, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    try {
      await client.rename(oldRemoteFilePath, newRemoteFilePath);
      this.emit("renameFileComplete", `[${hostKey}] [${oldRemoteFilePath}] 已重命名为 [${newRemoteFilePath}]`);
    } catch (err) {
      this.emit("error", `[${hostKey}] 文件重命名失败（${oldRemoteFilePath} → ${newRemoteFilePath}）：${err.message}`);
      throw err;
    }
  }

  /**
   * 获取远程文件夹目录信息（非递归，包含完整文件属性）
   * @param {string} remoteDir 远程文件夹路径
   * @param {string} host 服务器IP/域名
   * @param {Object} [config] 连接配置
   * @returns {Promise<Array>} 目录详情数组（包含文件名、创建时间、权限、用户组、大小、是否链接等）
   */
  async getDirInfo(remoteDir, host, config = {}) {
    const port = config.port || this.#defaultConfig.port;
    const hostKey = getHostKey(host, port);
    const client = await this.#getConnection(host, config);
    try {
      const remoteItems = await client.list(remoteDir);
      // 格式化目录信息，补充完整属性
      const dirInfo = remoteItems.map(item => ({
        name: item.name, // 文件/目录名称
        isFile: item.isFile, // 是否为文件
        isDirectory: item.isDirectory, // 是否为目录
        isSymbolicLink: item.isSymbolicLink || false, // 是否为符号链接
        size: item.size || 0, // 文件大小（字节），目录通常为0
        permissions: { // 权限信息
          user: item.permissions.user, // 所有者权限（r/w/x）
          group: item.permissions.group, // 所属组权限（r/w/x）
          other: item.permissions.other, // 其他用户权限（r/w/x）
          raw: item.permissions.raw // 原始权限字符串（如-rwxr-xr-x）
        },
        user: item.user || "", // 所属用户
        group: item.group || "", // 所属用户组
        modifiedAt: item.modifiedAt || null, // 修改时间（创建时间多数FTP服务器不返回，用修改时间替代）
        createdAt: item.createdAt || null, // 创建时间（部分服务器不支持，可能为null）
        raw: item.raw // 原始FTP返回数据
      }));
      this.emit("getDirInfoComplete", `[${hostKey}] [${remoteDir}] 目录信息获取成功，共${dirInfo.length}个项目`);
      return dirInfo;
    } catch (err) {
      this.emit("error", `[${hostKey}] 获取远程目录[${remoteDir}]信息失败：${err.message}`);
      throw err;
    }
  }

  // ==================== 优化：统计、历史、收藏相关公开方法（按主机区分） ====================
  /**
   * 获取指定主机的传输统计数据（若不传hostKey，返回所有主机的统计数据）
   * @param {string} [hostKey] 主机唯一标识（可选，格式：host:port）
   * @returns {Object|Map} 单个主机统计数据（Object）或所有主机统计数据（Map）
   */
  getTransferStats(hostKey) {
    if (hostKey) {
      return this.#transferStats.has(hostKey) ? { ...this.#transferStats.get(hostKey) } : null;
    }
    return new Map(this.#transferStats); // 返回Map副本
  }

  /**
   * 重置指定主机的传输统计数据（若不传hostKey，重置所有主机的统计数据）
   * @param {string} [hostKey] 主机唯一标识（可选，格式：host:port）
   */
  resetTransferStats(hostKey) {
    const resetSingleHost = (key) => {
      this.#transferStats.set(key, {
        totalUploadFiles: 0,
        pendingUploadFiles: 0,
        uploadingFiles: 0,
        completedUploadFiles: 0,
        failedUploadFiles: 0,
        totalDownloadFiles: 0,
        pendingDownloadFiles: 0,
        downloadingFiles: 0,
        completedDownloadFiles: 0,
        failedDownloadFiles: 0,
      });
      this.emit("statsReset", `[${key}] 传输统计数据已重置`);
    };

    if (hostKey) {
      if (this.#transferStats.has(hostKey)) {
        resetSingleHost(hostKey);
      } else {
        this.emit("warn", `[${hostKey}] 主机统计数据不存在，无法重置`);
      }
    } else {
      for (const key of this.#transferStats.keys()) {
        resetSingleHost(key);
      }
    }
    this.#serializeHistory();
  }

  /**
   * 获取操作历史记录（可按主机筛选）
   * @param {string} operationType 操作类型（对应OperationType）
   * @param {string} [hostKey] 主机唯一标识（可选，用于筛选该主机的历史记录）
   * @returns {Array} 历史记录数组
   */
  getOperationHistory(operationType, hostKey) {
    if (!this.#operationHistory[operationType]) {
      this.emit("warn", `未知的操作类型：${operationType}，返回空数组`);
      return [];
    }

    let history = [...this.#operationHistory[operationType]];
    // 按主机筛选
    if (hostKey) {
      history = history.filter(record => record.hostKey === hostKey);
    }
    return history;
  }

  /**
   * 排序操作历史
   * @param {string} operationType 操作类型
   * @param {Function} [customSort] 自定义排序函数（可选，默认按最近操作降序）
   * @param {string} [hostKey] 主机唯一标识（可选，仅排序该主机的历史记录）
   */
  sortOperationHistory(operationType, customSort, hostKey) {
    if (!this.#operationHistory[operationType]) {
      this.emit("warn", `未知的操作类型：${operationType}，无法排序`);
      return;
    }

    // 若指定主机，先筛选再排序，最后合并回原数组
    if (hostKey) {
      const nonHostHistory = this.#operationHistory[operationType].filter(record => record.hostKey !== hostKey);
      const hostHistory = this.#operationHistory[operationType].filter(record => record.hostKey === hostKey);

      if (customSort) {
        hostHistory.sort(customSort);
      } else {
        hostHistory.sort((a, b) => new Date(b.operateTime) - new Date(a.operateTime));
      }

      this.#operationHistory[operationType] = [...hostHistory, ...nonHostHistory];
    } else {
      if (customSort) {
        this.#operationHistory[operationType].sort(customSort);
      } else {
        this.#operationHistory[operationType].sort((a, b) => new Date(b.operateTime) - new Date(a.operateTime));
      }
    }

    this.#serializeHistory();
    this.emit("historySort", `[${hostKey || "所有主机"}] [${operationType}] 操作历史已排序`);
  }

  /**
   * 清空指定类型的操作历史（可按主机筛选清空）
   * @param {string} operationType 操作类型
   * @param {string} [hostKey] 主机唯一标识（可选，仅清空该主机的历史记录）
   */
  clearOperationHistory(operationType, hostKey) {
    if (!this.#operationHistory[operationType]) {
      this.emit("warn", `未知的操作类型：${operationType}，无法清空历史`);
      return;
    }

    // 按主机筛选清空
    if (hostKey) {
      // 先移除该主机对应类型的收藏
      if (this.#favorites.has(hostKey)) {
        const hostFavorites = this.#favorites.get(hostKey);
        hostFavorites[operationType] = [];
        this.#favorites.set(hostKey, hostFavorites);
      }
      // 清空该主机的历史记录
      this.#operationHistory[operationType] = this.#operationHistory[operationType].filter(record => record.hostKey !== hostKey);
      this.emit("historyClear", `[${hostKey}] [${operationType}] 操作历史已清空`);
    } else {
      // 清空所有主机的该类型历史，同时清空对应收藏
      for (const [key, hostFavorites] of this.#favorites) {
        hostFavorites[operationType] = [];
        this.#favorites.set(key, hostFavorites);
      }
      this.#operationHistory[operationType] = [];
      this.emit("historyClear", `[所有主机] [${operationType}] 操作历史已清空`);
    }

    this.#serializeHistory();
  }

  /**
   * 收藏操作记录（按主机分组管理）
   * @param {string} operationType 操作类型
   * @param {string} recordId 记录唯一ID
   * @param {string} hostKey 主机唯一标识
   */
  favoriteRecord(operationType, recordId, hostKey) {
    if (!this.#operationHistory[operationType] || !this.#favorites.has(hostKey)) {
      this.emit("warn", `未知的操作类型或主机：${operationType} / ${hostKey}，无法收藏`);
      return;
    }

    const recordIndex = this.#operationHistory[operationType].findIndex(item => item.id === recordId && item.hostKey === hostKey);
    if (recordIndex === -1) {
      this.emit("warn", `[${hostKey}] 未找到ID为${recordId}的${operationType}记录，无法收藏`);
      return;
    }

    const record = this.#operationHistory[operationType][recordIndex];
    if (record.isFavorite) {
      this.emit("warn", `[${hostKey}] ID为${recordId}的${operationType}记录已被收藏`);
      return;
    }

    // 标记为已收藏
    record.isFavorite = true;
    // 添加到对应主机的收藏列表
    const hostFavorites = this.#favorites.get(hostKey);
    hostFavorites[operationType].push({ ...record });
    // 排序收藏列表（默认按最近操作降序）
    hostFavorites[operationType].sort((a, b) => new Date(b.operateTime) - new Date(a.operateTime));
    this.#favorites.set(hostKey, hostFavorites);
    // 序列化保存
    this.#serializeHistory();
    this.emit("favoriteAdd", `[${hostKey}] ID为${recordId}的${operationType}记录已收藏`);
  }

  /**
   * 取消收藏操作记录（按主机分组管理）
   * @param {string} operationType 操作类型
   * @param {string} recordId 记录唯一ID
   * @param {string} hostKey 主机唯一标识
   */
  unfavoriteRecord(operationType, recordId, hostKey) {
    if (!this.#operationHistory[operationType] || !this.#favorites.has(hostKey)) {
      this.emit("warn", `未知的操作类型或主机：${operationType} / ${hostKey}，无法取消收藏`);
      return;
    }

    // 从历史记录中取消标记
    const historyIndex = this.#operationHistory[operationType].findIndex(item => item.id === recordId && item.hostKey === hostKey);
    if (historyIndex !== -1) {
      this.#operationHistory[operationType][historyIndex].isFavorite = false;
    }

    // 从对应主机的收藏列表中移除
    const hostFavorites = this.#favorites.get(hostKey);
    const favoriteIndex = hostFavorites[operationType].findIndex(item => item.id === recordId);
    if (favoriteIndex === -1) {
      this.emit("warn", `[${hostKey}] 未找到ID为${recordId}的${operationType}收藏记录`);
      return;
    }

    hostFavorites[operationType].splice(favoriteIndex, 1);
    this.#favorites.set(hostKey, hostFavorites);
    this.#serializeHistory();
    this.emit("favoriteRemove", `[${hostKey}] ID为${recordId}的${operationType}记录已取消收藏`);
  }

  /**
   * 获取指定主机的收藏列表
   * @param {string} hostKey 主机唯一标识
   * @param {string} [operationType] 操作类型（可选，不传返回该主机所有收藏）
   * @returns {Object|Array} 该主机所有收藏（Object）或指定类型收藏（Array）
   */
  getFavorites(hostKey, operationType) {
    if (!this.#favorites.has(hostKey)) {
      this.emit("warn", `[${hostKey}] 主机收藏列表不存在，返回空数据`);
      return operationType ? [] : {};
    }

    const hostFavorites = { ...this.#favorites.get(hostKey) };
    if (operationType) {
      return hostFavorites[operationType] ? [...hostFavorites[operationType]] : [];
    }
    return hostFavorites;
  }

  /**
   * 清空指定主机的收藏列表（可按操作类型筛选）
   * @param {string} hostKey 主机唯一标识
   * @param {string} [operationType] 操作类型（可选，不传清空该主机所有收藏）
   */
  clearFavorites(hostKey, operationType) {
    if (!this.#favorites.has(hostKey)) {
      this.emit("warn", `[${hostKey}] 主机收藏列表不存在，无法清空`);
      return;
    }

    const hostFavorites = this.#favorites.get(hostKey);
    // 按操作类型清空
    if (operationType) {
      // 取消该主机对应历史记录的收藏标记
      this.#operationHistory[operationType].forEach(item => {
        if (item.hostKey === hostKey) {
          item.isFavorite = false;
        }
      });
      hostFavorites[operationType] = [];
      this.emit("favoriteClear", `[${hostKey}] [${operationType}] 收藏列表已清空`);
    } else {
      // 清空该主机所有收藏，取消所有对应历史记录的收藏标记
      for (const type of Object.keys(OperationType)) {
        this.#operationHistory[type]?.forEach(item => {
          if (item.hostKey === hostKey) {
            item.isFavorite = false;
          }
        });
        hostFavorites[type] = [];
      }
      this.emit("favoriteClear", `[${hostKey}] 所有收藏列表已清空`);
    }

    this.#favorites.set(hostKey, hostFavorites);
    this.#serializeHistory();
  }

  /**
   * 手动触发序列化（保存历史与统计）
   */
  manualSerialize() {
    this.#serializeHistory();
  }
}

// 导出操作类型枚举和单例实例
export { OperationType, getHostKey };
export default FTPService.getInstance();