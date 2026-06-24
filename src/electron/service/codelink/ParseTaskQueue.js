import fs from 'fs-extra';
import path from 'path';
import { globalCache } from '../cache.js';
import { getParser } from '../parser/ParserLoader.js';
import { extract } from '../parser/BaseExtractor.js';
import CResolver from '../resolver/CResolver.js';
import CppResolver from '../resolver/CppResolver.js';
import TsResolver from '../resolver/TsResolver.js';
import JavaResolver from '../resolver/JavaResolver.js';

export class ParseTaskQueue {
  constructor() {
    this.queue = [];
    this.parsingStack = new Set();
    this.MAX_DEPTH = 15;
    this.running = false;
  }

  async addTask(fileAbsPath, rootDir, depth, lang) {
    if (globalCache.isFileParsed(fileAbsPath)) return;
    if (this.parsingStack.has(fileAbsPath)) return;
    if (depth > this.MAX_DEPTH) return;

    await new Promise((resolve) => {
      this.queue.push({
        filePath: fileAbsPath,
        rootDir,
        depth,
        lang,
        resolve
      });
      this.runQueue();
    });
  }

  async runQueue() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const task = this.queue.shift();
    const { filePath, rootDir, depth, lang, resolve } = task;

    try {
      this.parsingStack.add(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      const parser = getParser(lang);
      const tree = parser.parse(content);
      const symbols = extract(tree.rootNode, lang, filePath);

      globalCache.setFileParsed(filePath, { lang });
      symbols.forEach(s => globalCache.saveSymbol(s));

      let dependPaths = [];
      if (lang === 'c') {
        dependPaths = await CResolver.resolveIncludes(tree.rootNode, filePath, rootDir);
      } else if (lang === 'cpp') {
        dependPaths = await CppResolver.resolveIncludes(tree.rootNode, filePath, rootDir);
      } else if (lang === 'typescript') {
        dependPaths = await TsResolver.resolveImports(tree.rootNode, filePath, rootDir);
      } else if (lang === 'java') {
        dependPaths = await JavaResolver.resolveImports(tree.rootNode, filePath, rootDir);
      }

      for (const dep of dependPaths) {
        await this.addTask(dep, rootDir, depth + 1, lang);
      }
    } catch (err) {
      console.error('Parse failed', filePath, err.message);
    } finally {
      this.parsingStack.delete(filePath);
      resolve();
      this.running = false;
      this.runQueue();
    }
  }
}

export const parseQueue = new ParseTaskQueue();