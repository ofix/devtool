/**
 * 检查文件路径是否符合目录过滤规则
 * @param {string} filePath 文件路径
 * @param {string} includeDir 包含目录
 * @param {string[]} excludeDirs 排除目录列表
 * @returns {boolean}
 */
export function isPathIncluded(filePath, includeDir, excludeDirs) {
  // 适配Electron路径（兼容Windows/ macOS/Linux）
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedInclude = includeDir.replace(/\\/g, '/');

  if (!normalizedPath.startsWith(normalizedInclude)) return false;
  return !excludeDirs.some(excludeDir => {
    const normalizedExclude = excludeDir.replace(/\\/g, '/');
    return normalizedPath.startsWith(normalizedExclude);
  });
}

/**
 * 转义正则特殊字符
 * @param {string} str 原始字符串
 * @returns {string} 转义后的字符串
 */
export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构建正则表达式
 * @param {string} searchText 搜索文本
 * @param {boolean} caseSensitive 是否区分大小写
 * @param {boolean} useRegex 是否使用正则
 * @param {boolean} wholeWord 是否完整匹配
 * @returns {RegExp}
 */
export function buildRegex(searchText, caseSensitive, useRegex, wholeWord) {
  let pattern = useRegex ? searchText : escapeRegExp(searchText);
  if (wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }
  const flags = `g${caseSensitive ? '' : 'i'}`;
  return new RegExp(pattern, flags);
}

/**
 * 计算匹配位置的行号
 * @param {string} content 文件内容
 * @param {number} start 匹配起始位置
 * @returns {number} 行号（从1开始）
 */
export function getLineNumber(content, start) {
  return content.substring(0, start).split('\n').length;
}

/**
 * 执行查找操作
 * @param {Array} files 内存文件列表
 * @param {Object} options 查找配置
 * @returns {Array} 匹配结果列表
 */
export function findMatches(files, options) {
  const { searchText, caseSensitive, useRegex, wholeWord, includeDir, excludeDirs } = options;
  const regex = buildRegex(searchText, caseSensitive, useRegex, wholeWord);
  const results = [];

  for (const file of files) {
    if (!isPathIncluded(file.path, includeDir, excludeDirs)) continue;

    let match;
    regex.lastIndex = 0; // 重置正则索引
    while ((match = regex.exec(file.content)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      results.push({
        file,
        start,
        end,
        text: match[0],
        lineNumber: getLineNumber(file.content, start),
      });
    }
  }
  return results;
}

/**
 * 单个替换
 * @param {Object} match 匹配项
 * @param {string} replaceText 替换文本
 * @returns {Object} 替换后的文件
 */
export function replaceSingle(match, replaceText) {
  const { file, start, end } = match;
  const newContent = file.content.substring(0, start) + replaceText + file.content.substring(end);
  return {
    ...file,
    content: newContent,
    lastModified: Date.now(),
  };
}

/**
 * 批量替换
 * @param {Array} files 内存文件列表
 * @param {Object} options 替换配置
 * @returns {Object} 替换结果
 */
export function replaceAll(files, options) {
  const matches = findMatches(files, options);
  const affectedFiles = new Set();
  let replacedCount = 0;

  // 按文件分组
  const fileMatchesMap = new Map();
  matches.forEach(match => {
    if (!fileMatchesMap.has(match.file)) {
      fileMatchesMap.set(match.file, []);
    }
    fileMatchesMap.get(match.file).push(match);
  });

  // 逐个文件替换
  const updatedFiles = [];
  fileMatchesMap.forEach((matchesList, originalFile) => {
    let content = originalFile.content;
    let offset = 0; // 替换偏移量（解决替换后位置偏移问题）

    // 按起始位置升序排序
    matchesList.sort((a, b) => a.start - b.start);

    matchesList.forEach(match => {
      const actualStart = match.start + offset;
      const actualEnd = match.end + offset;
      content = content.substring(0, actualStart) + options.replaceText + content.substring(actualEnd);
      offset += options.replaceText.length - (actualEnd - actualStart);
      replacedCount++;
    });

    // 更新文件并加入结果
    const updatedFile = {
      ...originalFile,
      content,
      lastModified: Date.now(),
    };
    updatedFiles.push(updatedFile);
    affectedFiles.add(updatedFile);
  });

  // 替换原文件列表中的对应文件（Electron中保持内存数据一致性）
  const finalFiles = files.map(file => {
    const updated = updatedFiles.find(f => f.path === file.path);
    return updated || file;
  });

  return {
    replacedCount,
    affectedFiles: Array.from(affectedFiles),
    updatedFiles: finalFiles,
  };
}