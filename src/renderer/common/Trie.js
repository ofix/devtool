/**
 * Trie 树类 - 用于动态变量的存储、匹配和快速搜索
 */
class Trie {
  constructor() {
    this.root = { children: {}, isEnd: false, value: null, desc: '' };
  }

  /**
   * 插入动态变量到Trie树
   * @param {string} path 变量路径，如 'random.ipv4'
   * @param {Function} handler 变量值生成函数
   * @param {string} desc 变量描述
   */
  insert(path, handler, desc) {
    let node = this.root;
    const parts = path.split('.');

    for (const part of parts) {
      if (!node.children[part]) {
        node.children[part] = { children: {}, isEnd: false, value: null, desc: '' };
      }
      node = node.children[part];
    }

    node.isEnd = true;
    node.value = handler;
    node.desc = desc;
  }

  /**
   * 搜索匹配的变量（支持前缀模糊匹配）
   * @param {string} prefix 输入前缀，如 'random.ip' 或 'gui'
   * @returns {Array} 匹配的变量列表，包含路径、描述、高亮片段
   */
  search(prefix) {
    let node = this.root;
    const parts = prefix.split('.');
    const matched = [];
    let currentPath = '';

    // 逐层匹配前缀
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const childKeys = Object.keys(node.children);
      const matchedChild = childKeys.find(key => key.startsWith(part));

      if (!matchedChild) break;

      currentPath = currentPath ? `${currentPath}.${matchedChild}` : matchedChild;
      node = node.children[matchedChild];

      // 收集当前节点下的所有完整变量
      this.collectAllEndNodes(node, currentPath, matched, prefix);
    }

    // 处理根节点直接匹配（如输入 'g' 匹配 '@guid'）
    if (parts.length === 1 && !matched.length) {
      this.collectAllEndNodes(this.root, '', matched, prefix);
    }

    return matched;
  }

  /**
   * 递归收集Trie树中所有结束节点（完整变量）
   * @param {object} node 当前节点
   * @param {string} path 已匹配路径
   * @param {Array} result 结果数组
   * @param {string} inputPrefix 用户输入前缀
   */
  collectAllEndNodes(node, path, result, inputPrefix) {
    if (node.isEnd) {
      // 生成高亮片段：已匹配部分蓝色，未匹配部分黑色
      const highlightText = this.generateHighlightText(path, inputPrefix);
      result.push({
        fullPath: path,
        handler: node.value,
        desc: node.desc,
        highlight: highlightText
      });
    }

    // 递归遍历子节点
    for (const key of Object.keys(node.children)) {
      const newPath = path ? `${path}.${key}` : key;
      this.collectAllEndNodes(node.children[key], newPath, result, inputPrefix);
    }
  }

  /**
   * 生成高亮文本片段
   * @param {string} fullPath 完整变量路径
   * @param {string} inputPrefix 输入前缀
   * @returns {Array} 高亮片段数组，如 [{text: 'random.ip', color: 'blue'}, {text: 'v4', color: 'black'}]
   */
  generateHighlightText(fullPath, inputPrefix) {
    if (!inputPrefix) return [{ text: fullPath, color: 'black' }];

    const inputParts = inputPrefix.split('.');
    const fullParts = fullPath.split('.');
    const highlight = [];
    let matchedLength = 0;
    let matchedText = '';

    // 匹配前缀部分
    for (let i = 0; i < inputParts.length; i++) {
      if (i >= fullParts.length) break;
      const inputPart = inputParts[i];
      const fullPart = fullParts[i];

      if (fullPart.startsWith(inputPart)) {
        matchedText += (matchedText ? '.' : '') + inputPart;
        matchedLength = matchedText.length;
        // 剩余部分
        const restPart = fullPart.slice(inputPart.length);
        if (restPart) {
          highlight.push({ text: inputPart, color: 'blue' });
          highlight.push({ text: restPart, color: 'black' });
        } else {
          highlight.push({ text: inputPart, color: 'blue' });
        }
      } else {
        break;
      }
    }

    // 处理剩余未匹配的层级
    if (matchedLength < fullPath.length) {
      const restPath = fullPath.slice(matchedLength + (fullPath[matchedLength] === '.' ? 1 : 0));
      if (restPath) {
        highlight.push({ text: restPath.split('.').join('.').replace(/^./, (c) => `.${c}`), color: 'black' });
      }
    }

    // 兜底：无匹配时返回全黑
    if (highlight.length === 0) {
      highlight.push({ text: fullPath, color: 'black' });
    }

    return highlight;
  }

  /**
   * 执行变量生成函数，获取实际值
   * @param {string} path 变量路径，如 'random.ipv4'
   * @returns {any} 变量生成的值
   */
  executeVariable(path) {
    let node = this.root;
    const parts = path.split('.');

    for (const part of parts) {
      if (!node.children[part]) return null;
      node = node.children[part];
    }

    return node.isEnd ? node.value() : null;
  }
}

export default Trie;