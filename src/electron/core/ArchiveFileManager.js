import { ipcMain } from 'electron';
import sevenBin from '7zip-bin';
import node7z from 'node-7z';
const { extract, list } = node7z;
// import mmap from 'mmap-io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
// 代码格式化
import prettier from 'prettier';

import Utils from './Utils.js';
import ClientManager from '../service/ClientManager.js';
import { fileTypeDetector } from './FileTypeDetector.js';


// 压缩文件管理器
class ArchiveFileManager {
    static #instance = null;
    constructor(options = {}) {
        this.threadCount = options.threadCount || os.cpus().length;
        this.tempDir = options.tempDir || path.join(os.tmpdir(), 'devtools');
        // 7-Zip初始化
        if (!fsSync.existsSync(sevenBin.path7za)) {
            throw new Error(`7-Zip 二进制文件不存在：${sevenBin.path7za} `);
        }

        console.log("sevenBin.path7za = ", sevenBin.path7za);

        // 核心缓存
        this.mmfHandles = new Map(); // 完整路径 → MMF句柄
        this.fileMeta = new Map();   // 完整路径 → { archivePath, isEdited }
        this.archiveMap = new Map(); // 压缩包路径 → [文件完整路径列表]（批量管理核心）
        this.clientManager = ClientManager.getInstance();

        // 初始化
        this._initTempDir();
    }

    /** 单例获取 */
    static getInstance(options = {}) {
        if (!ArchiveFileManager.#instance) {
            ArchiveFileManager.#instance = new ArchiveFileManager(options);
        }
        return ArchiveFileManager.#instance;
    }

    _initTempDir() {
        if (!fsSync.existsSync(this.tempDir)) {
            fsSync.mkdirSync(this.tempDir, { recursive: true });
        }
    }


    /**
     * 代码格式化函数（支持20+主流语言）
     * @param {string} code - 待格式化代码
     * @param {string} lang - 语言类型（如 js/ts/vue/python/md 等）
     * @param {Object} customOptions - 自定义Prettier配置（覆盖默认）
     * @returns {Promise<string>} 格式化后的代码（失败返回原代码）
     */
    async formatCode(code, lang = 'js', customOptions = {}) {
        const parserMap = {
            // 基础前端
            js: 'babel',
            javascript: 'babel',
            ts: 'typescript',
            typescript: 'typescript',
            jsx: 'babel',
            tsx: 'typescript',
            html: 'html',
            css: 'css',
            scss: 'scss',
            sass: 'sass',
            less: 'less',
            json: 'json',
            json5: 'json5',
            jsonc: 'jsonc',
            // 后端/脚本
            python: 'python',
            py: 'python',
            php: 'php',
            ruby: 'ruby',
            rb: 'ruby',
            go: 'go',
            golang: 'go',
            java: 'java',
            c: 'c',
            cpp: 'cpp',
            // 配置/标记语言
            yaml: 'yaml',
            yml: 'yaml',
            markdown: 'markdown',
            md: 'markdown',
            xml: 'xml',
            toml: 'toml',
            graphql: 'graphql',
            gql: 'graphql',
            // 框架/特殊格式
            vue: 'vue',
            angular: 'angular',
            handlebars: 'handlebars',
            hbs: 'handlebars',
            sql: 'sql'
        };

        // 统一语言标识（小写 + 去空格），提升容错
        const normalizedLang = lang.trim().toLowerCase();
        const parser = parserMap[normalizedLang];

        // 未支持的语言：尝试通用解析器降级，而非直接报错
        if (!parser) {
            console.warn(`[格式化] 未找到${lang}的专属解析器，使用通用解析器降级处理`);
            // 通用解析器（兼容大部分文本格式）
            return prettier.format(code, {
                parser: 'babel', // 兜底解析器
                ...defaultOptions,
                ...customOptions
            });
        }

        // 动态加载对应语言的插件（避免冗余加载）
        const pluginMap = {
            scss: () => import('prettier-plugin-sass'),
            sass: () => import('prettier-plugin-sass'),
            less: () => import('prettier-plugin-less'),
            vue: () => import('prettier-plugin-vue'),
            python: () => import('@prettier/plugin-python'),
            php: () => import('@prettier/plugin-php'),
            ruby: () => import('@prettier/plugin-ruby'),
            go: () => import('@prettier/plugin-go'),
            java: () => import('@prettier/plugin-java'),
            c: () => import('@prettier/plugin-c'),
            cpp: () => import('@prettier/plugin-c'),
            yaml: () => import('@prettier/plugin-yaml'),
            yml: () => import('@prettier/plugin-yaml'),
            xml: () => import('@prettier/plugin-xml'),
            toml: () => import('@prettier/plugin-toml'),
            graphql: () => import('@prettier/plugin-graphql'),
            gql: () => import('@prettier/plugin-graphql'),
            sql: () => import('@prettier/plugin-sql'),
            handlebars: () => import('prettier-plugin-handlebars'),
            hbs: () => import('prettier-plugin-handlebars')
        };

        // 构建Prettier配置（默认 + 自定义）
        const defaultOptions = {
            parser,
            tabWidth: 2,
            useTabs: false,
            singleQuote: false,
            trailingComma: 'es5',
            plugins: [], // 动态填充插件
            // 多语言通用配置
            "wrap-iife": "outside",
            arrowParens: 'always',
            proseWrap: 'preserve', // markdown换行保留
            htmlWhitespaceSensitivity: 'css', // html空格敏感度
            endOfLine: 'lf' // 统一换行符（跨平台兼容）
        };

        // 加载当前语言的插件（若有）
        if (pluginMap[normalizedLang]) {
            try {
                const pluginModule = await pluginMap[normalizedLang]();
                defaultOptions.plugins.push(pluginModule.default || pluginModule);
            } catch (e) {
                console.warn(`[格式化] 加载${lang}插件失败，跳过插件使用：`, e.message);
            }
        }

        // 执行格式化（增强容错）
        try {
            return await prettier.format(code, {
                ...defaultOptions,
                ...customOptions
            });
        } catch (error) {
            console.error(`[格式化] ${lang}代码格式化失败：`, error.message);
            // 二次降级：移除插件后重试（避免插件导致的失败）
            try {
                return await prettier.format(code, {
                    ...defaultOptions,
                    plugins: [], // 清空插件
                    ...customOptions
                });
            } catch (secondError) {
                console.error(`[格式化] 降级重试仍失败，返回原代码：`, secondError.message);
                return code;
            }
        }
    }

    /**
     * 去除文件名的压缩包后缀
     * @param {string} fileName - 带压缩后缀的文件名（如 "test.txt.zip"）
     * @param {string[]} zipExts - 需去除的压缩后缀数组
     * @returns {string} 去除压缩后缀后的文件名
     */
    removeArchiveExt(fileName, zipExts = ['.zip', '.rar', '.7z', '.gz', '.tar.gz']) {
        const parsed = path.parse(fileName);
        const ext = parsed.ext.toLowerCase();

        if (zipExts.includes(ext)) {
            // 处理.tar.gz这类双后缀压缩包
            if (ext === '.gz' && parsed.name.endsWith('.tar')) {
                const rawName = parsed.name.slice(0, -4);
                return rawName + path.extname(rawName);
            }
            return parsed.name;
        }
        return fileName;
    }

    originExt(filePath) {
        let filename = this.removeArchiveExt(path.basename(filePath));
        return path.extname(filename)?.substr(1);
    }

    extname(filename, level = 2) {
        const match = filename.match(new RegExp(`\\.[^.]*${'\\.' + '[^.]*'.repeat(level - 1)}$`));
        return match ? match[0] : '';
    }

    async backupOriginFile(localFilePath) {
        try {
            // 检查文件是否存在
            if (!fsSync.existsSync(localFilePath)) {
                console.error(`文件不存在: ${localFilePath}`)
                return false;
            }

            // 解析路径信息
            const dirname = path.dirname(localFilePath);
            const extname = this.extname(localFilePath, 2);
            const basename = path.basename(localFilePath, extname);

            // 构造新文件名：原文件名 + origin + 原扩展名
            const newFileName = `${basename}.origin${extname}`;
            const newFilePath = path.join(dirname, newFileName);

            // 检查新文件名是否已存在（防止覆盖）
            if (fsSync.existsSync(newFilePath)) {
                console.log(`目标文件已存在，无需备份: ${newFilePath}`)
                return true;
            }

            // 执行重命名
            await fs.rename(localFilePath, newFilePath);
            console.log(`文件备份成功: ${newFilePath}`);
            return true;
        } catch (error) {
            console.error(`文件备份失败: ${error.message}`);
            return false;
        }
    }

    // 自动压缩文件并上传到SFTP服务器
    async saveFileContents(params) {
        // 如果localFilePath.origin.js.gz 不存在，则进行备份
        if (!await this.backupOriginFile(`${params.localFilePath}.gz`)) {
            return false;
        }
        // 保存文件到 localFilePath
        await fs.writeFile(params.localFilePath, params.content, 'utf8');
        // 压缩文件 localFilePath.gz（会强制覆盖）
        await this.compressToGz(params.localFilePath);
        // SCP 上传本地压缩文件到远程服务器
        const sftp = await this.clientManager.getClient('local',params);
        return await sftp.uploadFile(params.localFilePath + ".gz", params.remoteFilePath, null);
    }

    async loadFileContents(params) {
        // 映射远程文件到本地路径
        let localFilePath = await Utils.ensureRemoteFilePath(params.host, params.remoteFilePath);
        // SCP 下载远程服务器文件到本地
        const sftp = await this.clientManager.getClient('local',params);
        await sftp.downloadFile(params.remoteFilePath, localFilePath, null);

        // 检查文件是否是压缩文件
        if (fileTypeDetector.isArchiveFile(localFilePath)) {
            let extractResult = await this.extractFile(localFilePath);
            if (!extractResult.success) {
                console.warn(`解压失败：${extractResult.error} `);
                return "";
            }

            // 根据解压结果读取内容（单文件直接读，多文件默认读第一个）
            let content = "";
            let targetFile = "";
            if (extractResult.fileCount > 0) {
                targetFile = extractResult.isSingleFile
                    ? extractResult.path
                    : extractResult.filePaths[0];
                content = await fs.readFile(targetFile, 'utf-8');
            }
            // 获取原始文件文件后缀名
            let originFileExt = this.originExt(params.remoteFilePath);
            let formattedContent = await this.formatCode(content, originFileExt);
            const fileInfo = {
                originFileName: path.basename(params.remoteFilePath), // 原始文件名（如test.js.gz）
                extractFileName: path.basename(targetFile), // 解压后的文件名（如test.js）
                remoteFilePath: params.remoteFilePath, // 服务器路径
                host: params.host, // 主机IP
                port: params.port, // 主机端口
                username: params.username, // 主机用户名
                password: params.password, // 主机登录密码
                localFilePath: targetFile, // 本地路径
                content: formattedContent, // 文件内容
            };
            return { success: true, data: fileInfo };
        }

        // 非压缩文件，直接读取
        content = await fs.readFile(localFilePath, 'utf-8');
        let originFileExt = this.originExt(params.remoteFilePath);
        let formattedContent = await this.formatCode(content, originFileExt);
        const fileInfo = {
            originFileName: path.basename(params.remoteFilePath), // 原始文件名（如test.js.gz）
            extractFileName: path.basename(localFilePath), // 解压后的文件名（如test.js）
            remoteFilePath: params.remoteFilePath, // 服务器路径
            host: params.host, // 主机IP
            port: params.port, // 主机端口
            username: params.username, // 主机用户名
            password: params.password, // 主机登录密码
            localFilePath: localFilePath, // 本地路径
            content: formattedContent, // 文件内容
        };
        return { success: true, data: fileInfo };
    }


    /**
     * 辅助方法：列出压缩包内的所有文件（不解压，用于判断单/多文件）
     * 适配 node-7z@3.0 + 修复单文件解析问题
     * @param {string} archiveFilePath 压缩文件路径
     * @returns {Promise<string[]>} 压缩包内的文件路径列表（相对路径）
     */
    async #listArchiveFiles(archiveFilePath) {
        // 前置校验：压缩文件存在性
        if (!fsSync.existsSync(archiveFilePath)) {
            return Promise.reject(new Error(`压缩文件不存在：${archiveFilePath}`));
        }

        return new Promise((resolve, reject) => {
            const fileList = [];
            // node-7z@3.0 调用 list 方法（核心：指定 bin 路径，移除 $ 前缀）
            const listStream = list(archiveFilePath);

            // 场景1：v3.0 新版本解析（返回结构化对象）
            let isStructuredData = false;
            listStream
                .on('data', (chunk) => {
                    console.log(chunk);
                    // 分支1：node-7z@3.0 结构化输出（{ type: 'file', name: 'xxx' }）
                    if (typeof chunk === 'object' && chunk !== null) {
                        isStructuredData = true;
                        // 只保留文件，过滤目录
                        if (chunk.type === 'file' && chunk.name) {
                            console.log(chunk);
                            const entryPath = chunk.name.trim();
                            // 过滤空路径 + 确保是文件（排除目录）
                            if (entryPath) {
                                fileList.push(entryPath);
                            }
                        }
                    }
                    // 分支2：兼容旧版纯文本输出（兜底逻辑）
                    else {
                        const lines = chunk.toString().split(os.EOL);
                        lines.forEach(line => {
                            console.log(line);
                            const pathMatch = line.match(/^Path = (.*)$/);
                            if (pathMatch && pathMatch[1]) {
                                const entryPath = pathMatch[1].trim();
                                // 过滤目录：有扩展名 + 不以 /\ 结尾
                                if (entryPath && path.extname(entryPath) && !entryPath.endsWith('/') && !entryPath.endsWith('\\')) {
                                    fileList.push(entryPath);
                                }
                            }
                        });
                    }
                })
                // 流结束：去重 + 去空 + 返回结果
                .on('end', () => {
                    // 去重 + 过滤空字符串（避免单文件场景下的空项）
                    const uniqueFiles = [...new Set(fileList)].filter(file => !!file);
                    // 修复单文件场景：确保至少返回1项
                    resolve(uniqueFiles);
                })
                // 错误处理：捕获流错误 + 超时
                .on('error', (err) => {
                    reject(new Error(`读取压缩包列表失败：${err.message}（文件：${archiveFilePath}）`));
                });

            // 超时兜底：防止流卡死（5秒超时）
            setTimeout(() => {
                if (!listStream.destroyed) {
                    listStream.destroy();
                    reject(new Error(`读取压缩包列表超时：${archiveFilePath}`));
                }
            }, 5000);
        });
    }

    // ---------------- 以下是依赖的辅助方法/核心方法（确保逻辑闭环） ----------------
    /**
     * 辅助方法：递归获取目录下的所有文件
     * @param {string} dir 目录路径
     * @returns {string[]} 文件路径列表
     */
    #getAllFilesInDir(dir) {
        let files = [];
        if (!fsSync.existsSync(dir)) return files;

        const entries = fsSync.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile()) {
                files.push(fullPath);
            } else if (entry.isDirectory()) {
                files = files.concat(this.#getAllFilesInDir(fullPath));
            }
        }
        return files;
    }

    /**
     * 压缩文件为 .gz 格式（输出到源文件同目录）
     * @param {string} sourceFilePath - 源文件绝对路径
     * @param {number} [compressionLevel=6] - 压缩级别 1-9
     * @returns {Promise<{success: boolean, gzPath?: string, error?: string}>}
     */
    async compressToGz(sourceFilePath, compressionLevel = 6) {
        const dir = path.dirname(sourceFilePath);
        const basename = path.basename(sourceFilePath);
        const gzFilePath = path.join(dir, `${basename}.gz`);

        const args = [
            'a',
            gzFilePath.includes(' ') ? `"${gzFilePath}"` : gzFilePath,
            sourceFilePath.includes(' ') ? `"${sourceFilePath}"` : sourceFilePath,
            '-tgzip',
            `-mx=${compressionLevel}`,
            '-y'
        ];

        return new Promise((resolve) => {
            const child = spawn(sevenBin.path7za, args, {
                shell: true,
                stdio: 'pipe'
            });

            let stderr = '';
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            console.log(`执行命令: ${sevenBin.path7za}`, args.join(' '));

            const timeout = setTimeout(() => {
                child.kill();
                resolve({ success: false, error: '压缩超时（30秒）' });
            }, 30000); // 30秒超时

            child.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0 && fsSync.existsSync(gzFilePath)) {
                    // 验证是否为真正的 Gzip 文件
                    const fd = fsSync.openSync(gzFilePath, 'r');
                    const buffer = Buffer.alloc(2);
                    fsSync.readSync(fd, buffer, 0, 2, 0);
                    fsSync.closeSync(fd);

                    if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
                        console.log("✅ 压缩成功:", gzFilePath);
                        resolve({ success: true, gzPath: gzFilePath });
                    } else {
                        console.log("❌ 生成的文件不是 Gzip 格式");
                        fsSync.unlinkSync(gzFilePath);
                        resolve({ success: false, error: '生成的文件不是有效的 Gzip 格式' });
                    }
                } else {
                    console.log("❌ 压缩失败, 退出码:", code);
                    console.log("stderr:", stderr);
                    resolve({ success: false, error: `压缩失败，退出码：${code}`, stderr });
                }
            });

            child.on('error', (err) => {
                clearTimeout(timeout);
                console.log(err);
                resolve({ success: false, error: err.message });
            });
        });
    }

    /**
     * 简化版：直接解压 .gz 文件（跳过列表检测，单文件直接解压）
     * @param {string} archiveFilePath 压缩文件路径
     * @returns {Promise<{success: boolean, path?: string, error?: string}>}
     */
    async #extractGzFile(archiveFilePath) {
        try {
            // .gz 解压后文件名（去掉 .gz 后缀）
            const targetFileName = path.basename(archiveFilePath, '.gz');
            const targetDir = path.dirname(archiveFilePath); // 输出目录
            const targetFilePath = path.join(path.dirname(archiveFilePath), targetFileName);

            // 7za 解压 .gz 命令（直接指定输出文件）
            // const args = [
            //     'e', // e = 提取文件（忽略目录结构，适合单文件）
            //     archiveFilePath.includes(' ') ? `"${archiveFilePath}"` : archiveFilePath,
            //     `-o${path.dirname(archiveFilePath)}`, // 输出目录
            //     '-y', // 覆盖已有文件
            //     '-aoa', // 强制覆盖
            //     '-scsUTF-8' // 中文编码
            // ];
            const args = [
                'e', // 提取文件
                '-tgzip', // 强制指定压缩格式为 gzip（7za 识别 .gz 必须加这个）
                archiveFilePath.includes(' ') ? `"${archiveFilePath}"` : archiveFilePath, // 源文件（无需手动加引号，spawn 会自动处理空格）
                `-o${targetDir}`, // 输出目录（无空格，7za 要求 -o 和路径之间无空格）
                '-y', // 覆盖已有文件
                '-aoa', // 强制覆盖
                '-scsUTF-8' // 编码
            ];

            return new Promise((resolve, reject) => {
                // 关键：shell=true + 固定路径
                const child = spawn(sevenBin.path7za, args, {
                    shell: true,
                    stdio: 'ignore', // 忽略输出，提升速度
                    cwd: targetDir,// 切换工作目录
                    // 补充：Linux 下避免权限继承问题
                    uid: process.getuid ? process.getuid() : undefined,
                    gid: process.getgid ? process.getgid() : undefined
                });

                child.on('close', (code) => {
                    if (code === 0 && fsSync.existsSync(targetFilePath)) {
                        resolve({ success: true, path: targetFilePath });
                    } else {
                        reject(new Error(`.gz 解压失败，退出码：${code}`));
                    }
                });

                child.on('error', (err) => {
                    reject(new Error(`解压 .gz 失败：${err.message}`));
                });

                // 超时兜底
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill();
                        reject(new Error(`.gz 解压超时`));
                    }
                }, 8000);
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * 核心解压方法（调用 #listArchiveFiles）
     * @param {string} archiveFilePath 压缩文件路径
     * @returns {Promise<{success: boolean, fileCount: number, isSingleFile: boolean, path?: string, dirPath?: string, filePaths?: string[], error?: string}>}
     */
    async extractFile(archiveFilePath) {
        try {
            // 场景1：.gz 文件（单文件压缩，直接解压）
            if (archiveFilePath.endsWith('.gz')) {
                const gzResult = await this.#extractGzFile(archiveFilePath);
                if (gzResult.success) {
                    return {
                        success: true,
                        fileCount: 1,
                        isSingleFile: true,
                        path: gzResult.path
                    };
                } else {
                    return { success: false, fileCount: 0, isSingleFile: false, error: gzResult.error };
                }
            }

            // 1. 获取压缩包内文件列表（核心调用修复后的 #listArchiveFiles）
            const archiveFiles = await this.#listArchiveFiles(archiveFilePath);
            if (archiveFiles.length === 0) {
                return {
                    success: false,
                    fileCount: 0,
                    isSingleFile: false,
                    error: `压缩包内无有效文件：${archiveFilePath}`
                };
            }

            // 2. 判断单/多文件
            const isSingleFile = archiveFiles.length === 1;
            const archiveDir = path.dirname(archiveFilePath);
            const archiveName = path.basename(archiveFilePath, path.extname(archiveFilePath));
            const extractDirForMulti = path.join(archiveDir, `${archiveName}_extracted`);
            const extractTarget = isSingleFile ? archiveDir : extractDirForMulti;

            // 3. 确保解压目录存在
            if (!isSingleFile && !fsSync.existsSync(extractTarget)) {
                fsSync.mkdirSync(extractTarget, { recursive: true });
            }

            // 4. 执行解压
            await new Promise((resolve, reject) => {
                extract(archiveFilePath, extractTarget, {
                    $bin: sevenBin.path7za,
                    args: ['-y', `-mmt=${os.cpus().length}`, '-aoa', '-bsp1', '-r', '-scsUTF-8']
                })
                    .on('end', resolve)
                    .on('error', (err) => reject(new Error(`解压失败：${err.message}`)));
            });

            // 5. 获取解压后的文件列表
            const extractedFiles = isSingleFile
                ? [path.join(archiveDir, path.basename(archiveFiles[0]))]
                : this.#getAllFilesInDir(extractTarget);

            return {
                success: true,
                fileCount: extractedFiles.length,
                isSingleFile: isSingleFile,
                path: isSingleFile ? extractedFiles[0] : undefined,
                dirPath: isSingleFile ? undefined : extractTarget,
                filePaths: extractedFiles
            };
        } catch (err) {
            return {
                success: false,
                fileCount: 0,
                isSingleFile: false,
                error: err.message
            };
        }
    }

}

const archiveFileManager = ArchiveFileManager.getInstance();
export default archiveFileManager;