import fs from 'fs-extra';
import path from 'path';

function collectIncludePaths(rootNode) {
  const includes = [];
  const stack = [rootNode];
  while (stack.length) {
    const n = stack.pop();
    if (n.type === 'preproc_include') {
      const strNode = n.children.find(c => c.type === 'string_literal' || c.type === 'system_lib_string');
      if (strNode) {
        const text = strNode.text.replace(/["<>]/g, '');
        includes.push(text);
      }
    }
    stack.push(...n.children);
  }
  return includes;
}

export default class CResolver {
  static async resolveIncludes(rootNode, fileAbsPath, projectRoot) {
    const incList = collectIncludePaths(rootNode);
    const currentDir = path.dirname(fileAbsPath);
    const result = new Set();

    for (const inc of incList) {
      // 相对头文件
      const localPath = path.resolve(currentDir, inc);
      if (await fs.pathExists(localPath)) {
        result.add(localPath);
        continue;
      }
      // 项目全局 include
      const globalPath = path.resolve(projectRoot, 'include', inc);
      if (await fs.pathExists(globalPath)) {
        result.add(globalPath);
      }
    }
    return Array.from(result);
  }
}