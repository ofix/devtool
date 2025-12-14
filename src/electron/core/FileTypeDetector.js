import { promises as fs } from 'fs';

const IMAGE_SIGNATURES = [
  { signature: 'FFD8FF', ext: 'jpg', desc: 'JPEG 图片' },
  { signature: '89504E47', ext: 'png', desc: 'PNG 图片' },
  { signature: '47494638', ext: 'gif', desc: 'GIF 图片' },
  { signature: '424D', ext: 'bmp', desc: 'BMP 图片' },
  { signature: '52494646', ext: 'webp', desc: 'WebP 图片' },
  { signature: '00000100', ext: 'ico', desc: 'ICO 图标' },
];

const ARCHIVE_SIGNATURES = [
  { signature: '504B0304', ext: 'zip', desc: 'ZIP 压缩包' },
  { signature: '377ABCAF271C', ext: '7z', desc: '7Z 压缩包' },
  { signature: '1F8B', ext: 'gz', desc: 'GZIP 压缩包' },
  { signature: '425A68', ext: 'bz2', desc: 'BZIP2 压缩包' },
  { signature: '52617221', ext: 'rar', desc: 'RAR 4.x 压缩包' },
  { signature: '526172211A0700', ext: 'rar', desc: 'RAR 5.x 压缩包' },
];


/**
 * 配置：代码文件扩展名列表（可根据业务扩展）
 * 分类：前端/后端/脚本类代码扩展名
 */
const CODE_EXTENSIONS = new Set([
  // 前端/WEB
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.htm', '.html', '.xhtml',
  '.css', '.scss', '.sass', '.less', '.styl', '.postcss', '.json', '.json5', '.yaml', '.yml', '.toml',
  '.md', '.markdown', '.xml', '.svg', '.xsl', '.xslt',
  // 后端/系统语言
  '.py', '.pyc', '.pyd', '.pyx', '.java', '.class', '.jar', '.go', '.php', '.php3', '.php4', '.php5', '.phps', '.phtml',
  '.rb', '.rbw', '.rbs', '.rake', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx', '.cs', '.vb', '.vbnet',
  '.swift', '.kt', '.kts', '.scala', '.groovy', '.clj', '.cljs', '.cljc', '.f', '.f90', '.f95', '.for', '.fortran',
  '.perl', '.pl', '.pm', '.t', '.asm', '.s', '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.ps1', '.psm1',
  '.dart', '.rs', '.rlib', '.ml', '.mli', '.ocaml', '.erl', '.hrl', '.erlang', '.elixir', '.ex', '.exs',
  // 标记/排版（含PostScript）
  '.md', '.markdown', '.rst', '.adoc', '.tex', '.latex', '.bib', '.ps', '.eps', '.postscript', '.rtf', '.txt',
  // 数据库
  '.sql', '.pgsql', '.mysql', '.sqlite', '.dbml', '.dbt',
  // 脚本/配置
  '.ini', '.conf', '.cfg', '.env', '.dockerfile', '.dockerignore', '.gitignore', '.gitconfig', '.editorconfig',
  '.npmrc', '.yarnrc', '.pnpmrc',
  // 嵌入式/硬件
  '.ino', '.pde', '.arduino'
]);


const ARCHIVE_SUFFIX = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.lz', '.lzma', '.ar',
  '.dmg', '.cab', '.lzh', '.ace', '.7z', '.z', '.cpio', '.rpm', '.deb', /* .iso */
  '.pkg', '.tar.gz', '.tar.bz2', '.tar.xz', '.tar.lz', '.tar.lzma', '.tar.ar',
]);



class FileTypeDetector {
  static #instance = null;
  constructor() {
  }

  static getInstance() {
    if (!FileTypeDetector.#instance) {
      FileTypeDetector.#instance = new FileTypeDetector();
    }
    return FileTypeDetector.#instance;
  }

  /**
   * 私有核心方法：匹配签名
   * @param {string} hexStr - 十六进制字符串
   * @returns { { type: 'image'|'archive'|null, ext: string, desc: string } }
   */
  #matchSignature(hexStr) {
    // 匹配图片签名
    for (const item of IMAGE_SIGNATURES) {
      if (hexStr.startsWith(item.signature)) {
        return { type: 'image', ext: item.ext, desc: item.desc };
      }
    }

    // 匹配压缩文件签名
    for (const item of ARCHIVE_SIGNATURES) {
      if (hexStr.startsWith(item.signature)) {
        return { type: 'archive', ext: item.ext, desc: item.desc };
      }
    }

    return null;
  }

  /**
   * 检测 Buffer 二进制数据类型
   * @param {Buffer} buffer - 二进制数据（至少包含前16字节）
   * @returns { { type: 'image'|'archive'|null, ext: string, desc: string } }
   */
  detectFromBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('detectFromBuffer 入参必须是 Buffer 类型');
    }
    if (buffer.length === 0) return null;

    const hexStr = buffer.toString('hex').toUpperCase();
    return this.#matchSignature(hexStr);
  }

  /**
   * 检测本地文件类型（零拷贝，仅读前16字节）
   * @param {string} filePath - 本地文件路径
   * @returns {Promise<{ type: 'image'|'archive'|null, ext: string, desc: string }>}
   */
  async detectFromFile(filePath) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new TypeError('detectFromFile 入参必须是非空字符串路径');
    }

    let fd = null;
    try {
      fd = await fs.open(filePath, 'r');

      // 分配16字节Buffer（覆盖所有签名最大长度）
      const buffer = Buffer.alloc(16);
      const { bytesRead } = await fs.read(fd, buffer, 0, buffer.length, 0);

      if (bytesRead === 0) return null;

      return this.detectFromBuffer(buffer);
    } catch (err) {
      console.error(`[文件检测失败] ${filePath}:`, err.message);
      return null;
    } finally {
      if (fd) await fs.close(fd);
    }
  }

  /**
   * 通用检测方法（自动识别入参类型）
   * @param {string|Buffer} input - 文件路径 或 Buffer 数据
   * @returns {Promise<{ type: 'image'|'archive'|null, ext: string, desc: string }>}
   */
  async detect(input) {
    if (typeof input === 'string') {
      return this.detectFromFile(input);
    } else if (Buffer.isBuffer(input)) {
      // 同步方法转异步，统一返回Promise
      return Promise.resolve(this.detectFromBuffer(input));
    } else {
      throw new TypeError('detect 入参必须是文件路径字符串 或 Buffer 类型');
    }
  }

  /**
  * 判断是否为图片文件
  * @param {string|Buffer} input - 文件路径 或 Buffer 数据
  * @returns {Promise<boolean>} 是否为图片
  */
  async isImageFile(input) {
    try {
      const result = await this.detect(input);
      return result?.type === 'image';
    } catch (err) {
      console.error('[判断图片文件失败]', err.message);
      return false;
    }
  }

  /**
   * 判断是否为压缩文件
   * @param {string|Buffer} input - 文件路径 或 Buffer 数据
   * @returns {Promise<boolean>} 是否为压缩包
   */
  async isArchiveFile(input) {
    try {
      const result = await this.detect(input);
      return result?.type === 'archive';
    } catch (err) {
      console.error('[判断压缩文件失败]', err.message);
      return false;
    }
  }


  /**
   * 检查文件是否为代码文件（仅二元判定：代码/非代码）
   * @param {string} filePath - 文件路径
   * @returns {boolean} true=代码文件，false=非代码文件（含二进制/普通文本）
   */
  isCodeFile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) {
        return false;
      }

      return true;
    } catch (err) {
      console.error(`[代码文件检测失败] ${filePath}：${err.message}`);
      return false;
    }
  }


  /**
   * 高性能移除文件末尾的压缩后缀（Set 快速匹配，无循环遍历）
   * @param {string} filename - 原始文件名/完整路径
   * @returns {string} 移除压缩后缀后的文件名/路径
   */
  removeArchiveSuffix(filename) {
    if (!filename || typeof filename !== 'string') return filename;

    const dir = path.dirname(filename);
    let basename = path.basename(filename);
    while (true) {
      const lastExt = path.extname(basename).toLowerCase();
      if (!lastExt || !ARCHIVE_SUFFIX.has(lastExt)) break;
      basename = path.basename(basename, lastExt);
    }

    return path.join(dir, basename);
  }

}

export const fileTypeDetector = FileTypeDetector.getInstance();